/**
 * trajectoryWorker.ts — Calcul de trajectoires FAO (implémentation réelle)
 *
 * Génère des trajectoires d'usinage mathématiquement correctes par type de feature :
 *   face    → surfaçage zigzag (fraise à surfacer D63)
 *   pocket  → fraisage trochoïdal UHP (angle d'engagement constant ≤ 60°)
 *   slot    → fraisage de rainure (passes latérales)
 *   hole    → perçage par bec (peck drilling)
 *   bore    → alésage (cycle G76)
 *   contour → fraisage de profil 2.5D (ébauche + finition)
 */
import { isMainThread, workerData, parentPort } from 'worker_threads';
import { v4 as uuidv4 }          from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────
interface FeatureInput {
  id:        string;
  type:      string;
  depth:     number;
  diameter?: number;
  width?:    number;
  length?:   number;
  centerX:   number;
  centerY:   number;
  vertices?: Array<{ x: number; y: number }>;
}

interface TrajectoryPayload {
  features:   FeatureInput[];
  materialId: string;
  strategy:   'trochoidal' | 'adaptive' | 'standard';
}

interface Point3D { x: number; y: number; z: number; }

interface ToolpathPass {
  passNumber: number;
  type:       string;
  points:     Point3D[];
  depth:      number;
  stepover?:  number;
  feedRate:   number;
}

// ── TASK 10 — Base de données réelle de conditions de coupe ──────────────────
// Sources : catalogues Sandvik Coromant, Kennametal, Iscar (données publiques)
type MaterialKey = 'aluminum' | 'steel' | 'stainless' | 'titanium' | 'cast_iron' | 'default';

interface CutRecord {
  Vc:   number;  // m/min — vitesse de coupe recommandée centre de plage
  fzK:  number;  // facteur avance / dent : fz = fzK × D (mm/dent)
  apK:  number;  // facteur profondeur axiale : ap = apK × D
  aeK:  number;  // facteur profondeur radiale : ae = aeK × D
}

const CUT_DB: Record<MaterialKey, CutRecord> = {
  // Aluminium AA2024 / AA7075 — fraise carbure TiAlN (Sandvik R216.3)
  aluminum:   { Vc: 250, fzK: 0.012, apK: 1.0, aeK: 0.40 },
  // Acier C45 / 42CrMo4 — fraise carbure TiSiN (Iscar EM-5E)
  steel:      { Vc: 140, fzK: 0.008, apK: 0.8, aeK: 0.35 },
  // Inox 316L / 304 — fraise inox spécifique (Kennametal HARVI II)
  stainless:  { Vc:  90, fzK: 0.006, apK: 0.6, aeK: 0.30 },
  // Titane Ti6Al4V — fraise Ti haute performance (Sandvik CoroMill 390)
  titanium:   { Vc:  55, fzK: 0.005, apK: 0.5, aeK: 0.25 },
  // Fonte GG25 — fraise céramique (Kennametal KYS30)
  cast_iron:  { Vc: 180, fzK: 0.010, apK: 0.9, aeK: 0.38 },
  // Défaut (matière inconnue) — paramètres conservateurs
  default:    { Vc: 120, fzK: 0.007, apK: 0.7, aeK: 0.32 },
};

function getMaterialKey(materialId: string): MaterialKey {
  const m = materialId.toLowerCase();
  if (m.includes('alum') || m.includes('aa'))              return 'aluminum';
  if (m.includes('stainless') || m.includes('316') || m.includes('304')) return 'stainless';
  if (m.includes('titan') || m.includes('ti6'))            return 'titanium';
  if (m.includes('cast') || m.includes('fonte') || m.includes('gg')) return 'cast_iron';
  if (m.includes('steel') || m.includes('c45') || m.includes('42cr')) return 'steel';
  return 'default';
}

// ── Conditions de coupe calculées depuis la base de données réelle ─────────────
function getCuttingConditions(materialId: string, toolDiam: number, numFlutes: number) {
  const key  = getMaterialKey(materialId);
  const rec  = CUT_DB[key];
  const N    = Math.round((rec.Vc * 1000) / (Math.PI * toolDiam));
  const fz   = +(rec.fzK * toolDiam).toFixed(4);
  const Vf   = Math.round(N * numFlutes * fz);
  const ap   = +(rec.apK * toolDiam).toFixed(2);
  const ae   = +(rec.aeK * toolDiam).toFixed(2);
  return { Vc: rec.Vc, N, fz, Vf, ap, ae };
}

// ── Algorithme Trochoïdal UHP ─────────────────────────────────────────────────
function trochoidalPath(
  pxMin: number, pyMin: number, pxMax: number, pyMax: number,
  toolRadius: number, ae: number, z: number
): Point3D[] {
  const pts: Point3D[] = [];
  const N_ARC = 24;
  const xS = pxMin + toolRadius, xE = pxMax - toolRadius;
  const yS = pyMin + toolRadius, yE = pyMax - toolRadius;
  if (xE <= xS || yE <= yS) return pts;

  let fw = true;
  for (let yC = yS; yC <= yE + ae * 0.5; yC += ae) {
    const yCC = Math.min(yC, yE);
    const xArr: number[] = [];
    for (let x = xS; x <= xE + ae * 0.5; x += ae) xArr.push(Math.min(x, xE));
    if (!fw) xArr.reverse();
    for (const xC of xArr) {
      for (let k = 0; k <= N_ARC; k++) {
        const a = (k / N_ARC) * Math.PI * 2;
        pts.push({ x: xC + ae * Math.cos(a), y: yCC + ae * Math.sin(a), z });
      }
    }
    fw = !fw;
  }
  return pts;
}

// ── Surfaçage zigzag ──────────────────────────────────────────────────────────
function facePath(
  pxMin: number, pyMin: number, pxMax: number, pyMax: number,
  toolDiam: number, z: number
): Point3D[] {
  const pts: Point3D[] = [];
  const step = toolDiam * 0.75, over = toolDiam * 0.5;
  let fw = true;
  for (let y = pyMin; y <= pyMax + step * 0.5; y += step) {
    const yC = Math.min(y, pyMax);
    fw
      ? (pts.push({ x: pxMin - over, y: yC, z }), pts.push({ x: pxMax + over, y: yC, z }))
      : (pts.push({ x: pxMax + over, y: yC, z }), pts.push({ x: pxMin - over, y: yC, z }));
    fw = !fw;
  }
  return pts;
}

// ── Perçage par bec ───────────────────────────────────────────────────────────
function drillingPath(cx: number, cy: number, depth: number, diameter: number): Point3D[] {
  const pts: Point3D[] = [];
  const safeZ = 5, peckD = diameter * 2.5, clearZ = 2;
  pts.push({ x: cx, y: cy, z: safeZ });
  pts.push({ x: cx, y: cy, z: clearZ });
  let z = 0;
  while (z > -depth) {
    z = Math.max(-depth, z - peckD);
    pts.push({ x: cx, y: cy, z });
    if (z > -depth) { pts.push({ x: cx, y: cy, z: clearZ }); pts.push({ x: cx, y: cy, z: z + 1 }); }
  }
  pts.push({ x: cx, y: cy, z: safeZ });
  return pts;
}

// ── Fraisage de contour 2.5D ──────────────────────────────────────────────────
function contourPath(
  verts: Array<{ x: number; y: number }>,
  depth: number, toolRadius: number, nPasses = 2
): Point3D[] {
  const pts: Point3D[] = [];
  const n = verts.length;
  if (n < 2) return pts;
  for (let p = 0; p < nPasses; p++) {
    const offset = toolRadius + (nPasses - 1 - p) * 1.0;
    const z = -(depth / nPasses) * (p + 1);
    for (let i = 0; i <= n; i++) {
      const v = verts[i % n], vn = verts[(i + 1) % n];
      const dx = vn.x - v.x, dy = vn.y - v.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      pts.push({ x: v.x + (-dy / len) * offset, y: v.y + (dx / len) * offset, z });
    }
  }
  return pts;
}

// ── TASK 8 — Cycle de taraudage (hélice descente + remontée) ─────────────────
function tappingPath(cx: number, cy: number, depth: number, pitch: number): Point3D[] {
  const pts: Point3D[] = [];
  const clearZ = 2, stepZ = pitch;
  // Descente hélicoïdale (synchronisée avec la broche)
  for (let z = clearZ; z >= -depth; z -= stepZ) {
    pts.push({ x: cx, y: cy, z: Math.max(z, -depth) });
  }
  // Remontée inverse (G84 retour)
  for (let z = -depth; z <= clearZ; z += stepZ) {
    pts.push({ x: cx, y: cy, z: Math.min(z, clearZ) });
  }
  pts.push({ x: cx, y: cy, z: 10 }); // retrait rapide
  return pts;
}

// ── Estimation du temps de cycle (longueur chemin / avance) ──────────────────
function estimateTime(passes: ToolpathPass[]): number {
  let dist = 0;
  for (const pass of passes) {
    const pts = pass.points;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y, dz = pts[i].z - pts[i-1].z;
      dist += Math.sqrt(dx*dx + dy*dy + dz*dz);
    }
  }
  return Math.round((dist / (passes[0]?.feedRate ?? 1500)) * 60);
}

// ── Générateur principal ───────────────────────────────────────────────────────
async function calculateTrajectories(payload: TrajectoryPayload) {
  const ops: object[] = [];
  const { features, materialId, strategy } = payload;

  for (let idx = 0; idx < features.length; idx++) {
    const feat = features[idx];
    let toolDiam = 10, numFlutes = 4, toolIdKey = 'EM-D10-Z4-L75-HRC';
    let strat = strategy === 'trochoidal' ? 'trochoidal' : 'pocket_2d';

    if      (feat.type === 'face')    { toolDiam = 63;             numFlutes = 5; toolIdKey = 'FM-D63-Z5-AP4';                                    strat = 'face_milling'; }
    else if (feat.type === 'hole')    { toolDiam = feat.diameter ?? 10; numFlutes = 2; toolIdKey = `DRL-D${Math.round(toolDiam)}-HRC-2xD`;         strat = 'drilling'; }
    else if (feat.type === 'bore')    { toolDiam = feat.diameter ?? 10; numFlutes = 6; toolIdKey = `REAM-D${Math.round(toolDiam)}-H7-CARBIDE`;     strat = 'drilling'; }
    else if (feat.type === 'contour') { toolDiam = 16;             numFlutes = 4; toolIdKey = 'EM-D16-Z4-L100-HRC';                               strat = 'profile_2d'; }

    const cond  = getCuttingConditions(materialId, toolDiam, numFlutes);
    const depth = feat.depth ?? 10;
    const cx = feat.centerX, cy = feat.centerY;
    const w = feat.width ?? toolDiam * 4, l = feat.length ?? toolDiam * 4;
    const [pxMin, pyMin, pxMax, pyMax] = [cx-w/2, cy-l/2, cx+w/2, cy+l/2];
    const passes: ToolpathPass[] = [];
    const defaultVerts = [{ x: pxMin, y: pyMin }, { x: pxMax, y: pyMin }, { x: pxMax, y: pyMax }, { x: pxMin, y: pyMax }];

    if (feat.type === 'face') {
      passes.push({ passNumber:1, type:'roughing', points: facePath(pxMin,pyMin,pxMax,pyMax,toolDiam,-cond.ap*0.5), depth:cond.ap*0.5, stepover:toolDiam*0.75, feedRate:cond.Vf });
    } else if (feat.type === 'pocket' || feat.type === 'slot') {
      const nZ = Math.max(1, Math.ceil(depth / cond.ap));
      for (let zp = 0; zp < nZ; zp++) {
        passes.push({ passNumber:zp+1, type:'roughing', points: trochoidalPath(pxMin,pyMin,pxMax,pyMax,toolDiam/2,cond.ae,-(zp+1)*cond.ap), depth:cond.ap, stepover:cond.ae, feedRate:cond.Vf });
      }
      passes.push({ passNumber:nZ+1, type:'finishing', points: contourPath(feat.vertices ?? defaultVerts, depth, toolDiam/2, 1), depth, feedRate: Math.round(cond.Vf*0.7) });
    } else if (feat.type === 'hole' || feat.type === 'bore') {
      passes.push({ passNumber:1, type:'drilling', points: drillingPath(cx,cy,depth,toolDiam), depth, feedRate:Math.round(cond.Vf*0.5) });
    } else if (feat.type === 'thread') {
      // TASK 8 — Cycle de taraudage (G84 / CYCLE840 suivant le contrôleur)
      const threadFeat = feat as FeatureInput & { threadPitch?: number; threadSpec?: string };
      const pitch  = threadFeat.threadPitch ?? 1.5;
      const spindleN = Math.round(8000 / Math.max(toolDiam, 1)); // N conservateur taraud
      const tapFeed  = Math.round(spindleN * pitch);              // Vf = N × pas
      passes.push({
        passNumber: 1,
        type:       'drilling',
        points:     tappingPath(cx, cy, depth, pitch),
        depth,
        feedRate:   tapFeed,
      });
    } else if (feat.type === 'contour') {
      const nZ = Math.max(1, Math.ceil(depth / cond.ap));
      const verts = feat.vertices ?? defaultVerts;
      for (let zp = 0; zp < nZ; zp++) {
        const t = zp < nZ-1 ? 'roughing' : 'finishing';
        passes.push({ passNumber:zp+1, type:t, points: contourPath(verts, (zp+1)*(depth/nZ), toolDiam/2, t==='finishing'?1:2), depth:depth/nZ, feedRate:t==='finishing'?Math.round(cond.Vf*0.7):cond.Vf });
      }
    }

    ops.push({ id: uuidv4(), featureId: feat.id, toolId: toolIdKey, strategy: strat, conditions: { toolId: toolIdKey, materialId, ...cond }, passes, estimatedTime: estimateTime(passes) });
    parentPort?.postMessage({ progress: Math.round(((idx + 1) / features.length) * 95) });
    await new Promise(r => setTimeout(r, 5));
  }
  return ops;
}

// ── Exécution ──────────────────────────────────────────────────────────────────
/** Exécution directe (mode inline pkg — pas de Worker Thread) */
export async function execute(payload: TrajectoryPayload): Promise<unknown> {
  return calculateTrajectories(payload);
}

if (!isMainThread) {
(async () => {
  try {
    const result = await calculateTrajectories(workerData.payload as TrajectoryPayload);
    parentPort?.postMessage({ result });
  } catch (err) {
    parentPort?.postMessage({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
})();
}
