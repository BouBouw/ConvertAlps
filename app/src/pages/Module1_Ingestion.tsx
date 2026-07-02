/**
 * Module 1 — Ingestion 2D → 3D
 * Analyse DXF/DWG (OCR cartouche IA), reconstruction solide STEP
 * via OpenCASCADE (C++) piloté par Rust/FFI via le backend Express.
 *
 * TASK 1 — Sélection native via tauri-plugin-dialog (chemin absolu réel)
 */
import { useState }             from 'react';
import { FileUp, AlertCircle, Info, FolderOpen } from 'lucide-react';
import { clsx }                 from 'clsx';
import { SplitScreenLayout }    from '../components/viewer/SplitScreenLayout';
import { useAppStore }          from '../store/useAppStore';
import { useJobStore }          from '../store/useJobStore';
import { ingestionApi, subscribeToJobProgress } from '../api/backendApi';
import type { Job, Dxf2DFile, Model3D } from '../types';

// Détection runtime de l'environnement Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export default function Module1_Ingestion() {
  const { setDxfFile, setModel3D, completeStep } = useAppStore((s) => ({
    setDxfFile:    s.setDxfFile,
    setModel3D:    s.setModel3D,
    completeStep:  s.completeStep,
  }));
  const addJob    = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [phase, setPhase]         = useState<string>('');

  /** Lance le flux ingestion à partir d'un chemin absolu */
  async function runIngestion(filePath: string, fileName: string) {
    setIsLoading(true);
    setError(null);
    const jobId = crypto.randomUUID();

    const job: Job = {
      id:        jobId,
      type:      'model_conversion',
      label:     `Ingestion : ${fileName}`,
      status:    'pending',
      progress:  0,
      createdAt: new Date(),
    };
    addJob(job);

    try {
      setPhase('Analyse DXF + OCR cartouche…');
      updateJob(jobId, { status: 'running', progress: 10, startedAt: new Date() });

      const dxfData: Dxf2DFile = await ingestionApi.parseDxf(filePath);
      setDxfFile(dxfData);
      updateJob(jobId, { progress: 40 });

      setPhase('Reconstruction solide 3D (OpenCASCADE)…');
      const { jobId: serverJobId } = await ingestionApi.reconstruct3D(dxfData.id);
      updateJob(jobId, { progress: 50 });

      const sse = subscribeToJobProgress(serverJobId, async (serverJob) => {
        updateJob(jobId, { progress: 50 + Math.round(serverJob.progress / 2) });

        if (serverJob.status === 'completed') {
          sse.close();
          // Le résultat est récupéré via REST (évite les gros payloads SSE)
          try {
            const model = await ingestionApi.getModel3D('current');
            setModel3D(model);
            updateJob(jobId, { status: 'completed', progress: 100, completedAt: new Date() });
            completeStep(1);
          } catch {
            setError('Impossible de récupérer le modèle 3D reconstruit');
            updateJob(jobId, { status: 'failed', error: 'Modèle introuvable' });
          }
          setPhase('');
        } else if (serverJob.status === 'failed') {
          updateJob(jobId, { status: 'failed', error: serverJob.error });
          setError(serverJob.error ?? 'Échec de la reconstruction 3D');
          setPhase('');
          sse.close();
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      updateJob(jobId, { status: 'failed', error: msg });
      setPhase('');
    } finally {
      setIsLoading(false);
    }
  }

  /** Sélecteur natif Tauri (chemin absolu réel) */
  async function handleTauriOpen() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title:    'Ouvrir un fichier DXF/DWG',
      multiple: false,
      filters:  [{ name: 'Fichiers CAO', extensions: ['dxf', 'dwg'] }],
    });
    if (!selected || Array.isArray(selected)) return;
    const p = typeof selected === 'string' ? selected : (selected as { path?: string }).path ?? '';
    if (p) await runIngestion(p, p.split(/[\\/]/).pop() ?? p);
  }

  /** Fallback input HTML (navigateur / mode dev) */
  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = (file as File & { path?: string }).path ?? file.name;
    await runIngestion(path, file.name);
    e.target.value = '';
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      {/* ── Toolbar ── */}
      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><FileUp size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Ingestion 2D → 3D</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">DXF/DWG · OCR · OpenCASCADE</p>
          </div>
        </div>

        {phase && (
          <div className="flex items-center gap-1.5 text-[11px] text-ice-400">
            <span className="w-1.5 h-1.5 rounded-full bg-ice-500 animate-pulse" />
            {phase}
          </div>
        )}

        <div className="flex-1" />

        {isTauri ? (
          <button className="btn-primary" disabled={isLoading} onClick={handleTauriOpen}>
            <FolderOpen size={13} />
            {isLoading ? 'Traitement…' : 'Ouvrir DXF/DWG'}
            <kbd>⌃O</kbd>
          </button>
        ) : (
          <label className={clsx('btn-primary', isLoading && 'opacity-50 cursor-not-allowed pointer-events-none')}>
            <FileUp size={13} />
            {isLoading ? 'Traitement…' : 'Importer DXF/DWG'}
            <input type="file" accept=".dxf,.dwg" className="hidden" disabled={isLoading} onChange={handleFileInput} />
          </label>
        )}
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <SplitScreenLayout />
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-5 py-1
                      border-t border-navy-400/15 text-[10px] text-ice-800/50 shrink-0 bg-navy-850/60">
        <span className="flex items-center gap-1"><Info size={9} /> OCR : Transformer</span>
        <span className="flex items-center gap-1"><Info size={9} /> Géométrie : OpenCASCADE · STEP AP214</span>
      </div>
    </div>
  );
}
