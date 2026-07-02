/**
 * Module 5 — Post-Processeur & Jumeau Numérique
 * Traduction des trajectoires en G-Code ISO pour 5 contrôleurs majeurs.
 * Simulation cinématique 3D avec détection mathématique des collisions.
 * Codes couleur stricts : vert=OK, orange=surépaisseur, rouge flash=collision STOP.
 */
import { useState } from 'react';
import {
  Cpu, Play, Square, Download, Copy, CheckCircle2,
  AlertTriangle, AlertCircle, Settings,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore }                            from '../store/useAppStore';
import { useJobStore }                            from '../store/useJobStore';
import { postProcessorApi, subscribeToJobProgress } from '../api/backendApi';
import type { CNCController, GCodeGenerationResult } from '../types';

// ── Contrôleurs CN supportés ──────────────────────────────────────────────────
const CONTROLLERS: Array<{ value: CNCController; label: string }> = [
  { value: 'fanuc',      label: 'Fanuc 0i / 30i' },
  { value: 'heidenhain', label: 'Heidenhain iTNC 530' },
  { value: 'siemens',    label: 'Siemens 840D sl' },
  { value: 'haas',       label: 'Haas NGC' },
  { value: 'mazak',      label: 'Mazak Mazatrol' },
  { value: 'okuma',      label: 'Okuma OSP-P300' },
];

// ── Page principale ────────────────────────────────────────────────────────────
export default function Module5_PostProcessor() {
  const {
    toolpaths, collisionStatus, setCollisionStatus,
    simulationState, setSimulationState, completeStep,
  } = useAppStore((s) => ({
    toolpaths:          s.toolpaths,
    collisionStatus:    s.collisionStatus,
    setCollisionStatus: s.setCollisionStatus,
    simulationState:    s.simulationState,
    setSimulationState: s.setSimulationState,
    completeStep:       s.completeStep,
  }));
  const addJob    = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);

  const [controller, setController]   = useState<CNCController>('fanuc');
  const [result, setResult]           = useState<GCodeGenerationResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  /** Génération du G-Code */
  async function handleGenerate() {
    if (!toolpaths.length) { setError('Aucune trajectoire — Complétez le Module 4.'); return; }
    setIsGenerating(true); setError(null);

    const jobId = crypto.randomUUID();
    addJob({ id: jobId, type: 'gcode_gen', label: `G-Code ${controller}`, status: 'running', progress: 0, createdAt: new Date(), startedAt: new Date() });

    try {
      const gen = await postProcessorApi.generateGCode({
        projectId: 'current', operations: toolpaths,
        targetController: controller, machineName: 'MACHINE-001',
      });
      setResult(gen);
      updateJob(jobId, { status: 'completed', progress: 100, completedAt: new Date() });
      if (gen.hasCollisionWarning) setCollisionStatus('collision');
      else if (gen.hasOverstockWarning) setCollisionStatus('warning');
      else setCollisionStatus('none');
      completeStep(5);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); updateJob(jobId, { status: 'failed', error: msg });
    } finally {
      setIsGenerating(false);
    }
  }

  /** Lancement de la simulation cinématique */
  async function handleSimulate() {
    setIsSimulating(true); setError(null);
    setSimulationState({ status: 'running', progress: 0, collisions: [], overallStatus: 'none' });
    setCollisionStatus('none');

    const jobId = crypto.randomUUID();
    addJob({ id: jobId, type: 'collision_sim', label: 'Simulation cinématique 3D', status: 'running', progress: 0, createdAt: new Date(), startedAt: new Date() });

    try {
      const { jobId: serverJobId } = await postProcessorApi.startSimulation('current');
      const sse = subscribeToJobProgress(serverJobId, (serverJob) => {
        setSimulationState({ progress: serverJob.progress });
        updateJob(jobId, { progress: serverJob.progress });

        if (serverJob.status === 'completed') {
          const simResult = serverJob.result as typeof simulationState | undefined;
          if (simResult) {
            setSimulationState(simResult);
            setCollisionStatus(simResult.overallStatus);
          }
          updateJob(jobId, { status: 'completed', progress: 100, completedAt: new Date() });
          setIsSimulating(false);
          sse.close();
        } else if (serverJob.status === 'failed') {
          updateJob(jobId, { status: 'failed', error: serverJob.error });
          setError(serverJob.error ?? 'Échec simulation');
          setIsSimulating(false);
          sse.close();
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); updateJob(jobId, { status: 'failed', error: msg });
      setIsSimulating(false);
    }
  }

  async function handleCopyGCode() {
    if (!result) return;
    await navigator.clipboard.writeText(result.gcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      {/* ── Toolbar ── */}
      <div className="module-toolbar flex-wrap">
        <div className="module-title">
          <div className="module-icon"><Cpu size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Post-Processeur & Simulation</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">G-Code ISO · Simulation cinématique</p>
          </div>
        </div>
        <div className="flex-1" />

        <select value={controller} onChange={(e) => setController(e.target.value as CNCController)} className="select">
          {CONTROLLERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <button onClick={handleGenerate} disabled={isGenerating || !toolpaths.length} className="btn-primary">
          <Settings size={13} />
          {isGenerating ? 'Génération…' : 'Générer G-Code'}
        </button>
        <button onClick={handleSimulate} disabled={isSimulating || !result} className="btn-secondary">
          {isSimulating ? <Square size={13} /> : <Play size={13} />}
          {isSimulating ? 'Simulation…' : 'Simuler'}
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Éditeur G-Code */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {result && (
            <div className="flex items-center gap-3 px-5 py-2 bg-navy-850/60 border-b border-navy-400/15 text-[10px] text-ice-500/70 shrink-0">
              <span className="font-mono">{result.lineCount} lignes</span>
              <span>·</span>
              <span className="font-mono">{Math.floor(result.estimatedTime / 60)}m {Math.round(result.estimatedTime % 60)}s</span>
              <span>·</span>
              <span>{result.toolChanges} changement(s)</span>
              {result.hasCollisionWarning && <span className="text-red-400 flex items-center gap-1"><AlertCircle size={9} />Collision</span>}
              {result.hasOverstockWarning && <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={9} />Surépaisseur</span>}
              {!result.hasCollisionWarning && !result.hasOverstockWarning && (
                <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={9} />Validé</span>
              )}
              <div className="flex-1" />
              <button onClick={handleCopyGCode} className={clsx('flex items-center gap-1 transition-colors', copied ? 'text-emerald-400' : 'hover:text-ice-200')}>
                {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                {copied ? 'Copié' : 'Copier'}
              </button>
              <button className="flex items-center gap-1 hover:text-ice-200 transition-colors">
                <Download size={10} />.nc
              </button>
            </div>
          )}

          <div className="flex-1 overflow-auto bg-navy-950 font-mono text-xs p-5">
            {result ? (
              <pre className="text-emerald-400/90 leading-5 whitespace-pre-wrap text-[11px]">{result.gcode}</pre>
            ) : (
              <div className="h-full flex items-center justify-center text-ice-800/40 font-sans text-sm">
                {!toolpaths.length ? 'Complétez le Module 4' : 'Sélectionnez un contrôleur et générez le G-Code'}
              </div>
            )}
          </div>
        </div>

        {/* Panneau simulation */}
        {(isSimulating || simulationState.status !== 'idle') && (
          <div className="w-60 flex flex-col border-l border-navy-400/20 bg-navy-850/80 shrink-0">
            <div className="panel-header"><Cpu size={12} />Simulation</div>

            <div className={clsx(
              'flex items-center gap-2 px-4 py-3 border-b border-navy-400/15 text-sm font-semibold',
              collisionStatus === 'collision' ? 'text-red-400 animate-pulse'
                : collisionStatus === 'warning'   ? 'text-amber-400'
                : simulationState.status === 'completed' ? 'text-emerald-400'
                : 'text-ice-400',
            )}>
              {collisionStatus === 'collision' && <><AlertCircle size={14} />COLLISION</>}
              {collisionStatus === 'warning'   && <><AlertTriangle size={14} />SURÉPAISSEUR</>}
              {collisionStatus === 'none' && simulationState.status === 'completed' && <><CheckCircle2 size={14} />VALIDÉ</>}
              {collisionStatus === 'none' && simulationState.status === 'running'   && <>En cours…</>}
            </div>

            <div className="px-4 py-3 border-b border-navy-400/15">
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="text-ice-500/60">Progression</span>
                <span className="text-ice-300 font-mono tabular-nums">{simulationState.progress}%</span>
              </div>
              <div className="h-0.5 bg-navy-500/60 rounded overflow-hidden">
                <div
                  className={clsx('h-full rounded transition-all duration-300', collisionStatus === 'collision' ? 'bg-red-500' : 'bg-ice-500')}
                  style={{ width: `${simulationState.progress}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {simulationState.collisions.length === 0 ? (
                <p className="px-4 py-4 text-[10px] text-ice-800/50 text-center">Aucune collision</p>
              ) : simulationState.collisions.map((c, i) => (
                <div key={i} className={clsx('px-4 py-2 border-b border-navy-400/10 text-[10px]',
                  c.severity === 'collision' ? 'bg-red-950/20' : 'bg-amber-950/15')}>
                  <p className={c.severity === 'collision' ? 'text-red-400' : 'text-amber-400'}>
                    {c.severity === 'collision' ? '⛔' : '⚠'} {c.message}
                  </p>
                  <p className="text-ice-800/50 font-mono mt-0.5">t={c.timestampInSimulation.toFixed(2)}s</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
