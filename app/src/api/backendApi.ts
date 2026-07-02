/**
 * backendApi — Client HTTP vers le sidecar Express (port 3737)
 * Expose une API typée pour les 6 modules fonctionnels.
 * Utilise Server-Sent Events (SSE) pour le suivi de progression des jobs.
 */
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  AxiosError,
} from 'axios';
import type {
  ApiResponse,
  Dxf2DFile,
  Model3D,
  MachiningFeature,
  CuttingConditions,
  ToolpathOperation,
  GCodeGenerationRequest,
  GCodeGenerationResult,
  SimulationState,
  CycleTimeEstimate,
  QuoteExport,
  Tool,
  Material,
  Job,
} from '../types';

// ── Configuration ─────────────────────────────────────────────────────────────
/** Port du sidecar Express. Doit correspondre à CONVERTALPS_PORT dans .env */
const BACKEND_PORT = 3737;
/**
 * In dev mode (Vite), use a relative path so requests are proxied
 * by Vite's dev server to http://127.0.0.1:3737.
 * In production (Tauri sidecar), use the direct absolute URL.
 */
const BASE_URL = import.meta.env.DEV
  ? '/api'
  : `http://127.0.0.1:${BACKEND_PORT}/api`;

/**
 * Demande au sidecar Express de s'arrêter proprement avant une mise à jour.
 * Sans ça, le NSIS installer ne peut pas écraser backend-server.exe (fichier
 * verrouillé par Windows tant que le processus tourne).
 */
export async function shutdownBackend(): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${BACKEND_PORT}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    });
    // Attendre que le processus se termine réellement
    await new Promise(r => setTimeout(r, 1200));
  } catch {
    // Ignore — le process est peut-être déjà arrêté
  }
}

/**
 * Attend que le sidecar Express soit opérationnel (poll /health).
 * Le binaire pkg prend 2-5 s à démarrer au premier lancement.
 * @param maxMs Délai maximum (défaut 30 s)
 */
export async function waitForBackend(maxMs = 30_000): Promise<void> {
  const url = `http://127.0.0.1:${BACKEND_PORT}/health`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {
      // Pas encore prêt — on réessaie
    }
    await new Promise(r => setTimeout(r, 600));
  }
  // Après timeout, on laisse l'app continuer (l'erreur réseau sera affichée dans les modules)
}

// ── Instance Axios ─────────────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000, // 60 s pour les calculs longs
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

/** Intercepteur : normalise toutes les erreurs HTTP en Error standard */
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err: AxiosError) => {
    const message =
      (err.response?.data as { error?: string })?.error ??
      err.message ??
      'Erreur réseau inconnue';
    return Promise.reject(new Error(message));
  },
);

// ── Helpers génériques ─────────────────────────────────────────────────────────
async function apiGet<T>(path: string): Promise<T> {
  const { data } = await apiClient.get<ApiResponse<T>>(path);
  if (!data.success || data.data === undefined)
    throw new Error(data.error ?? 'Réponse vide');
  return data.data;
}

async function apiPost<T, B = unknown>(path: string, body: B): Promise<T> {
  const { data } = await apiClient.post<ApiResponse<T>>(path, body);
  if (!data.success || data.data === undefined)
    throw new Error(data.error ?? 'Réponse vide');
  return data.data;
}

// ── Module 1 : Ingestion ────────────────────────────────────────────────────────
export const ingestionApi = {
  /** Analyse syntaxique du fichier DXF/DWG et extraction du cartouche (OCR IA) */
  parseDxf: (filePath: string) =>
    apiPost<Dxf2DFile>('/ingestion/parse-dxf', { filePath }),

  /** Lance la reconstruction solide 3D via OpenCASCADE → retourne un jobId SSE */
  reconstruct3D: (dxfId: string) =>
    apiPost<{ jobId: string }>('/ingestion/reconstruct-3d', { dxfId }),

  /** Récupère le modèle 3D reconstruit (après complétion du job) */
  getModel3D: (modelId: string) =>
    apiGet<Model3D>(`/ingestion/model/${modelId}`),
};

// ── Module 2 : AFR ─────────────────────────────────────────────────────────────
export const afrApi = {
  /** Reconnaissance topologique B-Rep → retourne un jobId SSE */
  recognizeFeatures: (model3DId: string) =>
    apiPost<{ jobId: string }>('/afr/recognize', { model3DId }),

  /** Récupère les entités d'usinage identifiées */
  getFeatures: (model3DId: string) =>
    apiGet<MachiningFeature[]>(`/afr/features/${model3DId}`),
};

// ── Module 3 : Outillage & CAPP ────────────────────────────────────────────────
export const toolingApi = {
  /** Liste le magasin d'outils (ISO 13399) */
  listTools: () =>
    apiGet<Tool[]>('/tooling/tools'),

  /** Sélection automatique outil + conditions de coupe par entité */
  autoSelectTools: (featureIds: string[], materialId: string) =>
    apiPost<Array<{ featureId: string; tool: Tool; conditions: CuttingConditions }>>(
      '/tooling/auto-select',
      { featureIds, materialId },
    ),

  /** Calcule Vc, N, Vf, fz pour un couple outil/matière */
  calculateConditions: (toolId: string, materialId: string) =>
    apiGet<CuttingConditions>(`/tooling/conditions/${toolId}/${materialId}`),

  /** Liste les matières disponibles avec indices d'usinabilité */
  listMaterials: () =>
    apiGet<Material[]>('/tooling/materials'),
};

// ── Module 4 : FAO Core ────────────────────────────────────────────────────────
export const faoApi = {
  /** Calcul des trajectoires (trochoïdal, poche, profil…) → retourne un jobId SSE */
  calculateToolpaths: (featureIds: string[], materialId: string) =>
    apiPost<{ jobId: string }>('/fao/calculate', { featureIds, materialId }),

  /** Récupère les opérations calculées pour un projet */
  getToolpaths: (projectId: string) =>
    apiGet<ToolpathOperation[]>(`/fao/toolpaths/${projectId}`),
};

// ── Module 5 : Post-Processeur & Simulation ────────────────────────────────────
export const postProcessorApi = {
  /** Génère le G-Code ISO (Fanuc, Heidenhain, Siemens, Haas, Mazak) */
  generateGCode: (request: GCodeGenerationRequest) =>
    apiPost<GCodeGenerationResult>('/postprocessor/generate', request),

  /** Lance la simulation cinématique 3D → retourne un jobId SSE */
  startSimulation: (projectId: string) =>
    apiPost<{ jobId: string }>('/postprocessor/simulate', { projectId }),

  /** État courant de la simulation (polling ou SSE) */
  getSimulationState: (projectId: string) =>
    apiGet<SimulationState>(`/postprocessor/simulation/${projectId}`),
};

// ── Module 6 : Estimateur & ERP ────────────────────────────────────────────────
export const estimatorApi = {
  estimateCycleTime: (projectId: string) =>
    apiGet<CycleTimeEstimate>(`/estimator/cycle-time/${projectId}`),
  generateQuote: (projectId: string) =>
    apiPost<QuoteExport>('/estimator/quote', { projectId }),
  exportToERP: (projectId: string, format: 'json' | 'csv') =>
    apiPost<{ downloadUrl: string }>('/estimator/export', { projectId, format }),
};

// ── Projets (TASK 3) ───────────────────────────────────────────────────────────
export interface ProjectMeta {
  id:          string;
  name:        string;
  description: string;
  dxfId?:      string;
  model3DId?:  string;
  createdAt:   string;
  updatedAt:   string;
}

export const projectApi = {
  list:   ()                    => apiGet<ProjectMeta[]>('/projects'),
  get:    (id: string)          => apiGet<object>(`/projects/${id}`),
  save:   (name: string, description = '') =>
    apiPost<ProjectMeta>('/projects', { name, description }),
  load:   (id: string)          => apiPost<object>(`/projects/${id}/load`, {}),
  rename: (id: string, name: string) =>
    apiPost<ProjectMeta>(`/projects/${id}`, { name }),  // PATCH via axios interceptor
  delete: (id: string)          => apiClient.delete(`/projects/${id}`),
};

// ── Settings machine (TASK 5) ──────────────────────────────────────────────────
export const settingsApi = {
  getMachine: () => apiGet<object>('/settings/machine'),
  putMachine: (settings: object) =>
    apiPost<object>('/settings/machine', settings),
};

// ── Export DXF annoté (TASK 11) ────────────────────────────────────────────────
export function downloadAnnotatedDxf(dxfId: string): void {
  const url = `http://127.0.0.1:3737/api/ingestion/export-annotated/${dxfId}`;
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `annotated_${dxfId.slice(0, 8)}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Job Queue — Server-Sent Events (SSE) ────────────────────────────────────────
/**
 * S'abonne aux mises à jour de progression d'un job via SSE.
 * Ferme automatiquement la connexion à la fin du job.
 *
 * @param jobId     Identifiant du job retourné par l'API
 * @param onUpdate  Callback appelé à chaque événement SSE
 * @returns EventSource à fermer explicitement lors du démontage du composant
 */
export function subscribeToJobProgress(
  jobId: string,
  onUpdate: (job: Job) => void,
): EventSource {
  const sse = new EventSource(`${BASE_URL}/jobs/${jobId}/progress`);

  sse.onmessage = (e: MessageEvent) => {
    try {
      const job = JSON.parse(e.data as string) as Job;
      onUpdate(job);
      if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        sse.close();
      }
    } catch {
      // Message malformé — ignorer
    }
  };

  sse.onerror = () => sse.close();
  return sse;
}

export default apiClient;
