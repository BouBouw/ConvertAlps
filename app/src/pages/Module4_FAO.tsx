/**
 * Module 4 — FAO Core
 * Calcul mathématique des trajectoires d'usinage :
 * fraisage 2.5D/3 axes, tournage 2 axes, trochoïdal UHP (angle d'engagement constant).
 * Calculs asynchrones via Job Queue — suivi SSE temps réel.
 */
import { useState } from 'react';
import { Route, Play, AlertCircle, Activity } from 'lucide-react';
import { useAppStore }                    from '../store/useAppStore';
import { useJobStore }                    from '../store/useJobStore';
import { faoApi, subscribeToJobProgress } from '../api/backendApi';
import type { Job, ToolpathOperation, StrategyType } from '../types';

// ── Labels des stratégies d'usinage ──────────────────────────────────────────
const STRATEGY_LABELS: Record<StrategyType, string> = {
  profile_2d:         'Profil 2D',
  pocket_2d:          'Poche 2.5D',
  face_milling:       'Surfaçage',
  drilling:           'Perçage',
  trochoidal:         'Trochoïdal UHP',
  adaptive_clearing:  'Évidement adaptatif',
  turning_roughing:   'Dégrossissage tournage',
  turning_finishing:  'Finition tournage',
};

const STRATEGY_COLOR: Partial<Record<StrategyType, string>> = {
  trochoidal:        'text-cyan-400',
  adaptive_clearing: 'text-blue-400',
};

// ── Ligne d'opération ─────────────────────────────────────────────────────────
function OperationRow({ op }: { op: ToolpathOperation }) {
  const minutes = Math.floor(op.estimatedTime / 60);
  const seconds = Math.round(op.estimatedTime % 60);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-navy-400/15 hover:bg-navy-600/20 text-xs transition-colors">
      <Activity size={11} className={STRATEGY_COLOR[op.strategy] ?? 'text-ice-800/50'} />
      <span className="flex-1 text-ice-100 font-medium truncate">{STRATEGY_LABELS[op.strategy]}</span>
      <span className="badge badge-gray">{op.passes.length}p</span>
      <span className="font-mono text-ice-500 text-[11px] tabular-nums">{minutes}m{seconds.toString().padStart(2,'0')}s</span>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function Module4_FAO() {
  const { features, toolpaths, setToolpaths, completeStep } = useAppStore((s) => ({
    features:     s.features,
    toolpaths:    s.toolpaths,
    setToolpaths: s.setToolpaths,
    completeStep: s.completeStep,
  }));
  const addJob    = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);

  const [isCalculating, setIsCalculating] = useState(false);
  const [progress, setProgress]           = useState(0);
  const [error, setError]                 = useState<string | null>(null);

  /** Sélection de stratégie (peut être étendu à une interface dédiée) */
  const [strategy, setStrategy] = useState<'standard' | 'trochoidal' | 'adaptive'>('trochoidal');

  const totalTime = toolpaths.reduce((sum, op) => sum + op.estimatedTime, 0);
  const totalMin  = Math.floor(totalTime / 60);
  const totalSec  = Math.round(totalTime % 60);

  async function handleCalculate() {
    if (!features.length) { setError('Aucune entité d\'usinage — Complétez les Modules 1 & 2.'); return; }
    setIsCalculating(true); setError(null); setProgress(0);

    const jobId = crypto.randomUUID();
    const job: Job = {
      id: jobId, type: 'trajectory_calc',
      label: `FAO – Calcul trajectoires (${strategy})`,
      status: 'running', progress: 0, createdAt: new Date(), startedAt: new Date(),
    };
    addJob(job);

    try {
      // Matière par défaut (en prod, vient du module 3)
      const { jobId: serverJobId } = await faoApi.calculateToolpaths(
        features.map((f) => f.id),
        'default',
      );

      const sse = subscribeToJobProgress(serverJobId, async (serverJob) => {
        setProgress(serverJob.progress);
        updateJob(jobId, { progress: serverJob.progress });

        if (serverJob.status === 'completed') {
          const ops = await faoApi.getToolpaths('current');
          setToolpaths(ops);
          updateJob(jobId, { status: 'completed', progress: 100, completedAt: new Date() });
          completeStep(4);
          setProgress(100);
          sse.close();
        } else if (serverJob.status === 'failed') {
          updateJob(jobId, { status: 'failed', error: serverJob.error });
          setError(serverJob.error ?? 'Échec calcul FAO');
          sse.close();
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); updateJob(jobId, { status: 'failed', error: msg });
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><Route size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">FAO Core</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Calcul trajectoires · Trochoïdal · 3 axes</p>
          </div>
        </div>

        {isCalculating && (
          <div className="flex items-center gap-2 text-[11px] text-ice-400">
            <span className="w-1.5 h-1.5 rounded-full bg-ice-500 animate-pulse" />
            Calcul… <span className="font-mono tabular-nums">{progress}%</span>
          </div>
        )}
        <div className="flex-1" />

        <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)} className="select">
          <option value="trochoidal">Trochoïdal UHP</option>
          <option value="adaptive">Adaptatif 3 axes</option>
          <option value="standard">Standard 2.5D</option>
        </select>

        <button onClick={handleCalculate} disabled={isCalculating || !features.length} className="btn-primary">
          <Play size={13} />
          {isCalculating ? 'Calcul…' : 'Calculer'}
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-navy-950 flex items-center justify-center">
          {isCalculating ? (
            <div className="flex flex-col items-center gap-5">
              <div className="w-10 h-10 rounded-full border border-ice-500/30 border-t-ice-500 animate-spin" />
              <p className="text-ice-500 text-sm font-medium">Calcul trajectoires…</p>
              <div className="w-48 h-0.5 bg-navy-700 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-ice-600 to-ice-400 rounded transition-all duration-500"
                  style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[11px] text-ice-500/60 font-mono">{progress}%</span>
            </div>
          ) : toolpaths.length === 0 ? (
            <p className="text-ice-800/50 text-sm">Aucune trajectoire calculée</p>
          ) : (
            <p className="text-ice-500/50 text-sm">Trajectoires prêtes — Passez au Module 5</p>
          )}
        </div>

        {toolpaths.length > 0 && (
          <div className="w-72 flex flex-col border-l border-navy-400/20 bg-navy-850/80 shrink-0">
            <div className="panel-header">
              <Route size={12} />
              Opérations ({toolpaths.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {toolpaths.map((op: ToolpathOperation) => <OperationRow key={op.id} op={op} />)}
            </div>
            <div className="px-4 py-2 border-t border-navy-400/15 text-[10px] text-ice-800/60">
              <span className="text-ice-300 font-medium">Total :</span>{' '}
              {totalMin}m {totalSec.toString().padStart(2,'0')}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
