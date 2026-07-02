/**
 * Module 2 — Reconnaissance Automatique des Formes (AFR)
 * Analyse topologique B-Rep du solide 3D pour identifier
 * les entités d'usinage (poches, trous, rainures, contours…)
 * et fusionner avec les tolérances OCR du Module 1.
 */
import { useState } from 'react';
import { Scan, Play, List, AlertCircle, Info, ChevronDown, Download } from 'lucide-react';
import { clsx } from 'clsx';
import { SplitScreenLayout }            from '../components/viewer/SplitScreenLayout';
import { useAppStore }                  from '../store/useAppStore';
import { useJobStore }                  from '../store/useJobStore';
import { afrApi, subscribeToJobProgress, downloadAnnotatedDxf } from '../api/backendApi';
import type { Job, MachiningFeature, FeatureType } from '../types';

// ── Palette de couleur par type d'entité ──────────────────────────────────────
const FEATURE_BADGE: Record<FeatureType, string> = {
  pocket:  'badge badge-blue',
  hole:    'badge badge-green',
  slot:    'badge badge-ice',
  contour: 'badge badge-gray',
  face:    'badge badge-gray',
  bore:    'badge badge-amber',
  thread:  'badge badge-red',
};

const FEATURE_LABEL: Record<FeatureType, string> = {
  pocket:  'Poche',
  hole:    'Trou',
  slot:    'Rainure',
  contour: 'Contour ext.',
  face:    'Surfaçage',
  bore:    'Alésage',
  thread:  'Filetage',
};

function FeatureCard({ feature }: { feature: MachiningFeature }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-navy-400/15 last:border-0">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-navy-600/20 text-left transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={FEATURE_BADGE[feature.type]}>
          {FEATURE_LABEL[feature.type]}
        </span>
        {feature.requiresFinishing && (
          <span className="badge badge-amber text-[9px]">Finition</span>
        )}
        {feature.tolerance && (
          <span className="badge badge-ice text-[9px]">{feature.tolerance.value}</span>
        )}
        <ChevronDown size={11} className={clsx('ml-auto text-ice-800/60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="pb-1">
          {feature.diameter     && <div className="prop-row"><span className="prop-label">Diamètre</span><span className="prop-value">{feature.diameter.toFixed(3)} mm</span></div>}
          {feature.depth        && <div className="prop-row"><span className="prop-label">Profondeur</span><span className="prop-value">{feature.depth.toFixed(3)} mm</span></div>}
          {feature.width        && <div className="prop-row"><span className="prop-label">Largeur</span><span className="prop-value">{feature.width.toFixed(3)} mm</span></div>}
          {feature.surfaceRoughness && <div className="prop-row"><span className="prop-label">Ra</span><span className="prop-value">{feature.surfaceRoughness} µm</span></div>}
          <div className="prop-row">
            <span className="prop-label">Position</span>
            <span className="prop-value">X={feature.coordinates.x.toFixed(2)} Y={feature.coordinates.y.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function Module2_AFR() {
  const { model3D, features, setFeatures, completeStep, dxfFile } = useAppStore((s) => ({
    model3D:      s.model3D,
    features:     s.features,
    setFeatures:  s.setFeatures,
    completeStep: s.completeStep,
    dxfFile:      s.dxfFile,
  }));
  const addJob    = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [progress, setProgress]   = useState(0);

  async function handleRecognize() {
    if (!model3D) { setError('Aucun modèle 3D disponible. Complétez d\'abord le Module 1.'); return; }
    setIsRunning(true); setError(null); setProgress(0);

    const jobId = crypto.randomUUID();
    const job: Job = {
      id: jobId, type: 'afr_recognition',
      label: 'AFR – Reconnaissance des formes',
      status: 'running', progress: 0, createdAt: new Date(), startedAt: new Date(),
    };
    addJob(job);

    try {
      const { jobId: serverJobId } = await afrApi.recognizeFeatures(model3D.id);

      const sse = subscribeToJobProgress(serverJobId, async (serverJob) => {
        setProgress(serverJob.progress);
        updateJob(jobId, { progress: serverJob.progress });

        if (serverJob.status === 'completed') {
          const recognized = await afrApi.getFeatures(model3D.id);
          setFeatures(recognized);
          updateJob(jobId, { status: 'completed', progress: 100, completedAt: new Date() });
          completeStep(2);
          setProgress(100);
          sse.close();
        } else if (serverJob.status === 'failed') {
          updateJob(jobId, { status: 'failed', error: serverJob.error });
          setError(serverJob.error ?? 'Échec AFR');
          sse.close();
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); updateJob(jobId, { status: 'failed', error: msg });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      {/* ── Toolbar ── */}
      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><Scan size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Reconnaissance des Formes</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Analyse B-Rep · AFR · Détection automatique</p>
          </div>
        </div>

        {isRunning && (
          <div className="flex items-center gap-2 text-[11px] text-ice-400">
            <span className="w-1.5 h-1.5 rounded-full bg-ice-500 animate-pulse" />
            Analyse en cours… <span className="font-mono tabular-nums">{progress}%</span>
          </div>
        )}

        <div className="flex-1" />

        {features.length > 0 && dxfFile && (
          <button onClick={() => downloadAnnotatedDxf(dxfFile.id)} className="btn-secondary">
            <Download size={13} />
            DXF annoté
          </button>
        )}
        <button onClick={handleRecognize} disabled={isRunning || !model3D} className="btn-primary">
          <Play size={13} />
          {isRunning ? 'Analyse…' : 'Lancer AFR'}
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <SplitScreenLayout />
        </div>

        {features.length > 0 && (
          <div className="w-60 flex flex-col border-l border-navy-400/20 bg-navy-850/80 shrink-0">
            <div className="panel-header">
              <List size={12} />
              Entités ({features.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {features.map((f: MachiningFeature) => <FeatureCard key={f.id} feature={f} />)}
            </div>
            <div className="px-4 py-2 border-t border-navy-400/15 text-[10px] text-ice-800/60">
              <Info size={9} className="inline mr-1" />
              {features.filter((f) => f.requiresFinishing).length} finitions requises
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
