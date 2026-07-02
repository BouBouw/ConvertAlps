/**
 * ingestionWorker.ts — Reconstruction 3D depuis les entités DXF
 *
 * Reçoit les entités DXF normalisées et la bounding box via workerData.
 * Génère un maillage 3D (BufferGeometry-compatible) par extrusion géométrique.
 * Le résultat est stocké dans model3DStore par la route via job completion.
 */
import { isMainThread, workerData, parentPort } from 'worker_threads';
import { v4 as uuidv4 }          from 'uuid';
import { analyzeDxf }            from '../../utils/dxfAnalyzer';
import { genBox, genCylinder, genPolylineRibbon, mergeMeshes } from '../../utils/meshGenerator';
import type { DxfEntity }        from 'dxf';

interface IngestionPayload {
  dxfId:       string;
  entities:    DxfEntity[];
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  polylines?:  Array<{ vertices: Array<{ x: number; y: number }>; color?: string }>;
}

/** Cède le contrôle à la boucle d'événements (évite le blocage event loop en mode inline) */
const yield$ = (): Promise<void> => new Promise(r => setImmediate(r));

async function reconstructModel(payload: IngestionPayload) {
  parentPort?.postMessage({ progress: 10 });
  await yield$();

  const { entities, boundingBox, dxfId, polylines } = payload;
  const analysis = analyzeDxf(entities);

  parentPort?.postMessage({ progress: 30 });
  await yield$();

  const stockW = Math.max(1, boundingBox.maxX - boundingBox.minX);
  const stockD = Math.max(1, boundingBox.maxY - boundingBox.minY);
  const stockH = analysis.stockDepth;
  const originX = boundingBox.minX;
  const originY = boundingBox.minY;

  const meshes = [];

  // ── DXF artistique : polylignes uniquement, pas de boîte de stock ─────────
  // Pour les DXF sans features d'usinage (wall art, découpe, gravure), la boîte
  // de stock masque la structure. On la saute et on pose les rubans à z=0.
  const isArtistic = analysis.features.length === 0 && (polylines?.length ?? 0) > 0;

  // ── Boîte de stock principale (pièces usinées seulement) ──────────────────
  if (!isArtistic) {
    meshes.push(genBox(originX, originY, 0, stockW, stockD, stockH));
  }
  parentPort?.postMessage({ progress: 45 });
  await yield$();

  // ── Si aucune feature usinée, tracer les polylignes comme rubans 3D ────────
  // (cas typique : DXF artistique tout en SPLINE — ex. wall art)
  if (isArtistic) {
    // Densité adaptive : 1 segment sur N pour limiter la taille du mesh
    const totalPts = polylines!.reduce((s, pl) => s + pl.vertices.length, 0);
    const step = Math.max(1, Math.floor(totalPts / 4000));
    // Rubans posés à z=0 (sur la grille), plus hauts et plus larges pour être visibles
    const ribHeight = Math.min(stockW, stockD) * 0.04;  // 4% de la plus petite dim
    const ribHW     = Math.min(stockW, stockD) * 0.012; // demi-largeur ~2× plus large
    for (const pl of polylines!) {
      if (pl.vertices.length < 2) continue;
      meshes.push(genPolylineRibbon(pl.vertices, 0, ribHeight, ribHW, step));
    }
  }

  // ── Cylindres indicateurs de trous ────────────────────────────────────────
  // (représentation visuelle — les trous sont au-dessus du stock)
  for (const feat of analysis.features) {
    if ((feat.type === 'hole' || feat.type === 'bore') && feat.diameter) {
      // Petite protubérance cylindrique pour marquer la position du trou
      meshes.push(genCylinder(feat.centerX, feat.centerY, stockH, feat.diameter / 2, 3, 16));
    }
    if ((feat.type === 'pocket' || feat.type === 'slot') && feat.width && feat.length) {
      // Boîte élevée pour visualiser la poche (réduite en hauteur = profondeur)
      meshes.push(genBox(
        feat.centerX - feat.width  / 2,
        feat.centerY - feat.length / 2,
        stockH,
        feat.width,
        feat.length,
        Math.min(feat.depth ?? 10, 8)
      ));
    }
  }

  parentPort?.postMessage({ progress: 75 });
  await yield$();

  const merged = mergeMeshes(meshes);

  // Calcul du volume brut (stock - trous)
  const holeCylVol = analysis.features
    .filter(f => f.type === 'hole' || f.type === 'bore')
    .reduce((s, f) => s + Math.PI * ((f.diameter ?? 10) / 2) ** 2 * stockH, 0);
  const volume = Math.max(0, stockW * stockD * stockH - holeCylVol);

  parentPort?.postMessage({ progress: 92 });
  await yield$();

  const modelId = `${dxfId}-3d`;

  return {
    id:           modelId,
    stepFilePath: null,
    meshData: {
      // Sérialiser en tableaux pour le transfert inter-thread (Float32/Uint32 ne passent pas via postMessage)
      vertices: Array.from(merged.vertices),
      normals:  Array.from(merged.normals),
      indices:  Array.from(merged.indices),
    },
    volume:       Math.round(volume * 100) / 100,
    boundingBox: {
      minX: originX, minY: originY, minZ: 0,
      maxX: originX + stockW, maxY: originY + stockD, maxZ: stockH,
      width: stockW, height: stockD, depth: stockH,
    },
    isWatertight:  true,
    featureCount:  analysis.features.length,
    analysisData:  analysis.features,
  };
}

/** Exécution directe (mode inline pkg — pas de Worker Thread) */
export async function execute(payload: IngestionPayload): Promise<unknown> {
  return reconstructModel(payload);
}

if (!isMainThread) {
(async () => {
  try {
    const result = await reconstructModel(workerData.payload as IngestionPayload);
    parentPort?.postMessage({ result });
  } catch (err) {
    parentPort?.postMessage({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
})();
}
