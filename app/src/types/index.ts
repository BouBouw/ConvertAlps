// ============================================================
// Types globaux — ConvertAlps FAO Industriel
// Partagés entre le frontend et les contrats d'API
// ============================================================

// ── Workflow (fil d'Ariane à 6 étapes) ──────────────────────────────────────

export type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;

export const WORKFLOW_STEPS = [
  { id: 1 as WorkflowStep, label: 'Ingestion 2D→3D', description: 'Analyse DXF/DWG & reconstruction STEP' },
  { id: 2 as WorkflowStep, label: 'AFR',              description: 'Reconnaissance automatique des formes' },
  { id: 3 as WorkflowStep, label: 'Outils & CAPP',    description: 'Sélection ISO 13399 & conditions de coupe' },
  { id: 4 as WorkflowStep, label: 'FAO Core',          description: 'Calcul trajectoires trochoïdales & G-Code' },
  { id: 5 as WorkflowStep, label: 'Post-Processeur',   description: 'Simulation cinématique & export CN' },
  { id: 6 as WorkflowStep, label: 'Estimateur',        description: 'Chiffrage cycle + export ERP' },
] as const;

// ── Projet ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  filePath?: string;
}

// ── Module 1 : Ingestion 2D ──────────────────────────────────────────────────

export interface Dxf2DFile {
  id: string;
  path: string;
  name: string;
  entities: DxfEntity[];
  /** Polylignes pré-calculées (supporte SPLINE, ARC, LWPOLYLINE, etc.) */
  polylines?: Array<{ vertices: Array<{ x: number; y: number }>; color?: string }>;
  titleBlock?: TitleBlock;
}

export interface DxfEntity {
  type: string;
  handle: string;
  layer: string;
  color?: number;
  /** Points constituant l'entité (lignes, polylignes, centres de cercles…) */
  vertices?: Array<{ x: number; y: number; z?: number }>;
  /** Rayon pour les entités CIRCLE / ARC */
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface TitleBlock {
  pieceReference?: string;
  material?: string;
  designer?: string;
  revision?: string;
  drawingScale?: string;
  tolerances?: ToleranceAnnotation[];
}

export interface ToleranceAnnotation {
  type: string;   // ex : 'H7', 'g6', 'IT6', 'Ra', 'Rz'
  value: string;
  location?: { x: number; y: number };
}

// ── Module 1 : Modèle 3D reconstruit ────────────────────────────────────────

export interface Model3D {
  id: string;
  stepFilePath?: string;
  /** Données de maillage pour Three.js (issues du facettage OpenCASCADE) */
  meshData?: MeshData;
  volume?: number;        // mm³
  boundingBox?: BoundingBox;
  isWatertight: boolean;
}

export interface MeshData {
  vertices: Float32Array | number[];
  normals:  Float32Array | number[];
  indices:  Uint32Array  | number[];
}

export interface BoundingBox {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  width: number; height: number; depth: number;
}

// ── Module 2 : AFR — Entités d'usinage ──────────────────────────────────────

export type FeatureType =
  | 'pocket'     // Poche fermée
  | 'hole'       // Trou débouchant / borgne
  | 'slot'       // Rainure
  | 'contour'    // Profil extérieur
  | 'face'       // Surfaçage plan
  | 'bore'       // Alésage de précision
  | 'thread';    // Filetage / taraudage

export interface MachiningFeature {
  id: string;
  type: FeatureType;
  depth?: number;           // mm
  diameter?: number;        // mm
  width?: number;           // mm
  length?: number;          // mm
  tolerance?: ToleranceAnnotation;
  surfaceRoughness?: number;  // Ra en µm
  coordinates: { x: number; y: number; z: number };
  requiresFinishing: boolean;
}

// ── Module 3 : Outillage ISO 13399 ──────────────────────────────────────────

export type ToolType =
  | 'end_mill'       // Fraise 2 tailles cylindrique
  | 'ball_end_mill'  // Fraise hémisphérique
  | 'face_mill'      // Fraise à surfacer
  | 'drill'          // Foret
  | 'reamer'         // Alésoir
  | 'tap'            // Taraud
  | 'boring_bar'     // Barre d'alésage
  | 'turning_insert' // Plaquette de tournage
  | 'thread_mill';   // Fraise à fileter

export type ToolMaterial = 'hss' | 'hss_co' | 'carbide' | 'cermets' | 'cbn' | 'pcd';

export interface Tool {
  id: string;
  iso13399Code: string;
  type: ToolType;
  diameter: number;        // mm
  numberOfFlutes: number;
  totalLength: number;     // mm
  cuttingLength: number;   // mm
  shankDiameter: number;   // mm
  material: ToolMaterial;
  coating?: string;        // ex: 'TiAlN', 'TiN', 'DLC'
  holder?: ToolHolder;
  insertGrade?: string;    // ex: 'P25', 'K10'
}

export interface ToolHolder {
  id: string;
  type: string;            // 'BT40' | 'HSK63A' | 'CAT50' | 'SK40'
  clampingDiameter: number;
}

// ── Module 3 : Conditions de coupe ──────────────────────────────────────────

export interface CuttingConditions {
  toolId: string;
  materialId: string;
  Vc: number;   // Vitesse de coupe [m/min]
  N: number;    // Vitesse broche [tr/min]
  Vf: number;   // Vitesse d'avance table [mm/min]
  fz: number;   // Avance par dent [mm/dent]
  ap: number;   // Profondeur de passe axiale [mm]
  ae: number;   // Largeur de prise de coupe radiale [mm]
}

// ── Module 4 : FAO — Trajectoires ───────────────────────────────────────────

export type StrategyType =
  | 'profile_2d'         // Profil 2D
  | 'pocket_2d'          // Poche 2.5D
  | 'face_milling'       // Surfaçage
  | 'drilling'           // Perçage
  | 'trochoidal'         // Fraisage trochoïdal UHP (angle d'engagement constant)
  | 'adaptive_clearing'  // Évidement adaptatif 3 axes
  | 'turning_roughing'   // Dégrossissage tournage
  | 'turning_finishing'; // Finition tournage

export interface ToolpathOperation {
  id: string;
  featureId: string;
  toolId: string;
  strategy: StrategyType;
  conditions: CuttingConditions;
  passes: ToolpathPass[];
  estimatedTime: number;  // secondes
}

export interface ToolpathPass {
  passNumber: number;
  type: 'roughing' | 'semi-finishing' | 'finishing';
  points: ToolpathPoint[];
  depth: number;
  stepover: number;
}

export interface ToolpathPoint {
  x: number; y: number; z: number;
  feedRate?: number;
  isRapid?: boolean;
  isArc?: boolean;
  arcCenter?: { i: number; j: number; k?: number };
  arcClockwise?: boolean;
}

// ── Module 5 : Post-Processeur ───────────────────────────────────────────────

export type CNCController =
  | 'fanuc' | 'heidenhain' | 'siemens' | 'haas' | 'mazak' | 'okuma';

export interface GCodeGenerationRequest {
  projectId: string;
  operations: ToolpathOperation[];
  targetController: CNCController;
  userId?: string;
  machineName?: string;
}

export interface GCodeGenerationResult {
  gcode: string;
  lineCount: number;
  estimatedTime: number;   // secondes
  toolChanges: number;
  hasCollisionWarning: boolean;
  hasOverstockWarning: boolean;
  auditId: string;
}

// ── Module 5 : Simulation & Collisions ──────────────────────────────────────

/** Code couleur strict : none=vert, warning=orange, collision=rouge flash */
export type CollisionStatus = 'none' | 'warning' | 'collision';

export interface CollisionEvent {
  severity: 'warning' | 'collision';
  toolId: string;
  position: { x: number; y: number; z: number };
  message: string;
  timestampInSimulation: number;  // secondes dans la simulation
}

export interface SimulationState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'aborted';
  progress: number;       // 0-100 %
  currentTime: number;    // secondes
  totalTime: number;      // secondes
  collisions: CollisionEvent[];
  overallStatus: CollisionStatus;
}

// ── Job Queue (calculs asynchrones) ─────────────────────────────────────────

export type JobType =
  | 'model_conversion'  // DXF → STEP (Module 1)
  | 'afr_recognition'   // Reconnaissance formes (Module 2)
  | 'trajectory_calc'   // Calcul trajectoires (Module 4)
  | 'collision_sim'     // Simulation collision (Module 5)
  | 'gcode_gen';        // Génération G-Code (Module 5)

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  type: JobType;
  label: string;
  status: JobStatus;
  progress: number;    // 0-100
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: unknown;
}

// ── Module 6 : Estimateur ────────────────────────────────────────────────────

export interface CycleTimeEstimate {
  totalTimeSeconds: number;
  machiningTimeSeconds: number;
  toolChangeTimeSeconds: number;
  setupTimeSeconds: number;
  breakdown: OperationTime[];
}

export interface OperationTime {
  operationId: string;
  description: string;
  durationSeconds: number;
}

export interface QuoteExport {
  projectId: string;
  partName: string;
  material: string;
  cycleTime: CycleTimeEstimate;
  toolingCost: number;
  materialCost: number;
  machiningCost: number;
  totalCost: number;
  currency: string;
  generatedAt: Date;
}

// ── Matières ────────────────────────────────────────────────────────────────

export type MaterialCategory =
  | 'aluminum' | 'steel' | 'stainless' | 'titanium'
  | 'cast_iron' | 'plastic' | 'composite';

export interface Material {
  id: string;
  name: string;
  code: string;               // ex : 'AA2024', 'C45', 'Ti6Al4V', '316L'
  category: MaterialCategory;
  hardness?: number;          // HB
  density: number;            // g/cm³
  machinabilityIndex: number; // 1-100 (100 = le plus facile à usiner)
}

// ── Réponse API standard ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
