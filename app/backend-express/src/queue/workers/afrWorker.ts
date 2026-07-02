/**
 * afrWorker.ts — Reconnaissance Automatique des Formes (Worker Thread)
 *
 * Analyse géométrique réelle des entités DXF :
 *   CIRCLE           → trou (D < 30mm) ou alésage (D ≥ 30mm)
 *   LWPOLYLINE fermée → poche, rainure ou contour extérieur
 *   Lignes            → délimitation de face
 *
 * Ordonnancement automatique selon la séquence d'usinage optimale :
 *   1. Surfaçage → 2. Poches → 3. Rainures → 4. Contour → 5. Perçage → 6. Alésage
 */
import { isMainThread, workerData, parentPort } from 'worker_threads';
import { analyzeDxf }            from '../../utils/dxfAnalyzer';
import type { DxfEntity }        from 'dxf';

interface AfrPayload {
  model3DId: string;
  entities:  DxfEntity[];
}

// Ordre de traitement optimal par type de feature
const PROCESSING_ORDER: Record<string, number> = {
  face:    1,
  pocket:  2,
  slot:    3,
  contour: 4,
  hole:    5,
  bore:    6,
};

// Suggestion d'outil ISO 13399 par type de feature
function suggestTool(type: string, diameter?: number): string {
  switch (type) {
    case 'face':    return 'FM-D63-Z5-AP4';
    case 'pocket':  return 'EM-D10-Z4-L75-HRC';
    case 'slot':    return 'EM-D10-Z4-L75-HRC';
    case 'contour': return 'EM-D16-Z4-L100-HRC';
    case 'hole':    return diameter ? `DRL-D${Math.round(diameter)}-HRC-2xD` : 'DRL-D10-HRC-2xD';
    case 'bore':    return diameter ? `REAM-D${Math.round(diameter)}-H7-CARBIDE` : 'REAM-D10-H7-CARBIDE';
    default:        return 'EM-D10-Z4-L75-HRC';
  }
}

const yield$ = (): Promise<void> => new Promise(r => setImmediate(r));

async function recognizeFeatures(payload: AfrPayload) {
  parentPort?.postMessage({ progress: 15 });
  await yield$();

  const analysis = analyzeDxf(payload.entities);
  parentPort?.postMessage({ progress: 55 });
  await yield$();

  const machiningFeatures = analysis.features
    .map((f) => ({
      id:                f.id,
      type:              f.type,
      depth:             f.depth ?? 10,
      diameter:          f.diameter,
      width:             f.width,
      length:            f.length,
      tolerance:         f.tolerance ?? { type: 'IT9', value: '±0.1' },
      surfaceRoughness:  f.surfaceRoughness ?? 3.2,
      coordinates:       { x: f.centerX, y: f.centerY, z: 0 },
      requiresFinishing: f.requiresFinishing ?? false,
      suggestedTool:     suggestTool(f.type, f.diameter),
      processingOrder:   PROCESSING_ORDER[f.type] ?? 99,
      vertices:          f.vertices,
    }))
    .sort((a, b) => a.processingOrder - b.processingOrder);

  parentPort?.postMessage({ progress: 88 });
  return machiningFeatures;
}

/** Exécution directe (mode inline pkg — pas de Worker Thread) */
export async function execute(payload: AfrPayload): Promise<unknown> {
  return recognizeFeatures(payload);
}

if (!isMainThread) {
(async () => {
  try {
    const result = await recognizeFeatures(workerData.payload as AfrPayload);
    parentPort?.postMessage({ result });
  } catch (err) {
    parentPort?.postMessage({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
})();
}
