/**
 * sharedStore.ts — Mémoire partagée du thread principal Express
 *
 * Les Worker Threads Node.js NE peuvent PAS accéder à ces Maps directement.
 * Les routes lisent ces stores et transmettent les données nécessaires via workerData.
 */

export interface StoredDxfFile {
  id:          string;
  name:        string;
  path:        string;
  entities:    object[];
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  titleBlock:  object;
  /** Polylignes pré-calculées par toPolylines() — disponibles pour la reconstruction 3D */
  polylines?:  Array<{ vertices: Array<{ x: number; y: number }>; color?: string }>;
}

export interface StoredFeature {
  id:                string;
  type:              string;
  depth:             number;
  diameter?:         number;
  width?:            number;
  length?:           number;
  centerX:           number;
  centerY:           number;
  layer?:            string;
  tolerance?:        { type: string; value: string };
  surfaceRoughness:  number;
  requiresFinishing: boolean;
  coordinates:       { x: number; y: number; z: number };
  suggestedTool?:    string;
  processingOrder?:  number;
  vertices?:         Array<{ x: number; y: number }>;
}

/** DXF parsés — clé = dxfId */
export const dxfStore = new Map<string, StoredDxfFile>();

/** Features AFR — clé = featureId OU 'model:{model3DId}' */
export const featureStore = new Map<string, StoredFeature | StoredFeature[]>();

/** Modèles 3D reconstruits — clé = modelId ou 'current' */
export const model3DStore = new Map<string, object>();

/** Trajectoires calculées — clé = projectId ou 'current' */
export const toolpathStore = new Map<string, object[]>();
