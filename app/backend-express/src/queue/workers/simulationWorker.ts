/**
 * simulationWorker.ts — Simulation cinématique + détection collision AABB/sphère
 *
 * Vérifie chaque point de trajectoire contre :
 *   1. Les limites de déplacement machine (travel limits)
 *   2. Les brides de fixation (4 brides standard à positions fixes)
 *   3. Les limites Z (surépaisseur si z > 0, collision si z < -maxDepth)
 *
 * Sévérités :
 *   warning   → outil à < 2mm d'un obstacle → ORANGE (surépaisseur)
 *   collision → intersection réelle          → ROUGE FLASH (arrêt)
 */
import { isMainThread, workerData, parentPort } from 'worker_threads';

interface Point3D { x: number; y: number; z: number; }

interface ToolpathPass {
  points: Point3D[];
}

interface ToolpathOperation {
  id:         string;
  toolId:     string;
  conditions: { ae?: number; ap?: number; [key: string]: unknown };
  passes:     ToolpathPass[];
}

interface SimulationPayload {
  projectId:       string;
  toolpaths:       ToolpathOperation[];
  machineSettings?: {
    limits:   { xMin:number; xMax:number; yMin:number; yMax:number; zMin:number; zMax:number };
    fixtures: Array<{ id:string; x:number; y:number; z:number; radius:number; label:string }>;
    maxSpindle?: number;
  };
  workpiece?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

interface CollisionEvent {
  severity:              'warning' | 'collision';
  toolId:                string;
  position:              Point3D;
  message:               string;
  timestampInSimulation: number;
}

// ── Configuration machine (depuis payload ou défaut DMG Mori DMU 50) ─────────
const WARNING_CLEARANCE = 3.0;  // mm — zone d'alerte avant collision

/** Vérifie la position d'un outil (sphère de rayon toolR) contre les obstacles */
function checkPosition(
  pt: Point3D, toolR: number,
  machineLimits: { xMin:number; xMax:number; yMin:number; yMax:number; zMin:number; zMax:number },
  fixtures: Array<{ x:number; y:number; z:number; r:number }>
): 'none' | 'warning' | 'collision' {
  // 1. Limites machine
  if (pt.x < machineLimits.xMin + toolR || pt.x > machineLimits.xMax - toolR ||
      pt.y < machineLimits.yMin + toolR || pt.y > machineLimits.yMax - toolR ||
      pt.z < machineLimits.zMin + toolR || pt.z > machineLimits.zMax) {
    return 'collision';
  }
  // 2. Brides de fixation (sphère-sphère)
  for (const fix of fixtures) {
    const dist = Math.sqrt((pt.x-fix.x)**2 + (pt.y-fix.y)**2 + (pt.z-fix.z)**2);
    const minDist = toolR + fix.r;
    if (dist < minDist)                      return 'collision';
    if (dist < minDist + WARNING_CLEARANCE)  return 'warning';
  }
  // 3. Surépaisseur (outil au-dessus du plan pièce mais stock présent)
  if (pt.z > 0.5) return 'warning';
  return 'none';
}

async function runSimulation(payload: SimulationPayload) {
  const { toolpaths } = payload;

  // Résoudre les constantes machine depuis le payload (ou defaults DMG Mori DMU 50)
  const machineLimits = payload.machineSettings?.limits
    ?? { xMin: -300, xMax: 300, yMin: -250, yMax: 250, zMin: -150, zMax: 50 };
  const fixtures: Array<{ x:number; y:number; z:number; r:number }> =
    payload.machineSettings?.fixtures?.map(f => ({ x: f.x, y: f.y, z: f.z, r: f.radius }))
    ?? [
      { x: -5,   y: -5,   z: 5,  r: 15 },
      { x: 125,  y: -5,   z: 5,  r: 15 },
      { x: -5,   y: 65,   z: 5,  r: 15 },
      { x: 125,  y: 65,   z: 5,  r: 15 },
    ];

  // Collecter tous les points de toutes les trajectoires
  const allPoints: Array<{ pt: Point3D; toolId: string; toolR: number }> = [];
  for (const op of toolpaths) {
    const toolR = 5; // rayon outil par défaut — à récupérer du catalog en prod
    for (const pass of op.passes) {
      for (const pt of pass.points) {
        allPoints.push({ pt, toolId: op.id, toolR });
      }
    }
  }

  const total = Math.max(1, allPoints.length);
  const collisions: CollisionEvent[] = [];
  let stopped = false;
  let simTime = 0;
  const totalTime = total * 0.01; // ~0.01 s par point (estimation)

  for (let i = 0; i < total && !stopped; i++) {
    const { pt, toolId, toolR } = allPoints[i];
    simTime = (i / total) * totalTime;

    const status = checkPosition(pt, toolR, machineLimits, fixtures);

    if (status === 'collision') {
      collisions.push({
        severity:              'collision',
        toolId,
        position:              pt,
        message:               `Collision détectée en (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}, ${pt.z.toFixed(1)}) mm`,
        timestampInSimulation: simTime,
      });
      stopped = true; // Arrêt immédiat à la première collision critique
    } else if (status === 'warning' && !collisions.some(c => c.severity === 'warning' && c.toolId === toolId)) {
      collisions.push({
        severity:              'warning',
        toolId,
        position:              pt,
        message:               `Surépaisseur en Z=${pt.z.toFixed(2)} mm — vérifier la profondeur de passe`,
        timestampInSimulation: simTime,
      });
    }

    // Rapport de progression toutes les 5%
    if (i % Math.max(1, Math.floor(total / 20)) === 0) {
      parentPort?.postMessage({ progress: Math.round((i / total) * 100) });
      await new Promise(r => setTimeout(r, 1));
    }
  }

  const overallStatus: 'none' | 'warning' | 'collision' =
    collisions.some(c => c.severity === 'collision') ? 'collision' :
    collisions.some(c => c.severity === 'warning')   ? 'warning'   : 'none';

  return {
    status:       stopped ? 'aborted' : 'completed',
    progress:     stopped ? Math.round((allPoints.findIndex(p => p.toolId === collisions[0]?.toolId) / total) * 100) : 100,
    currentTime:  simTime,
    totalTime,
    collisions,
    overallStatus,
    pointsChecked: allPoints.length,
  };
}

/** Exécution directe (mode inline pkg — pas de Worker Thread) */
export async function execute(payload: SimulationPayload): Promise<unknown> {
  return runSimulation(payload);
}

if (!isMainThread) {
(async () => {
  try {
    const result = await runSimulation(workerData.payload as SimulationPayload);
    parentPort?.postMessage({ result });
  } catch (err) {
    parentPort?.postMessage({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
})();
}
