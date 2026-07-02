/**
 * Module 3 — Outillage & CAPP (Computer Aided Process Planning)
 * Sélection automatique des outils ISO 13399, calcul des conditions
 * de coupe physiques (Vc, N, Vf) basé sur le couple outil/matière.
 */
import { useState, useEffect } from 'react';
import { Wrench, Play, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore }  from '../store/useAppStore';
import { toolingApi }   from '../api/backendApi';
import type { Tool, Material, CuttingConditions } from '../types';

// ── Constantes ────────────────────────────────────────────────────────────────
const TOOL_TYPE_LABELS: Record<string, string> = {
  end_mill:       'Fraise 2 tailles',
  ball_end_mill:  'Fraise hémisph.',
  face_mill:      'Fraise surfaçage',
  drill:          'Foret',
  reamer:         'Alésoir',
  tap:            'Taraud',
  boring_bar:     'Barre alésage',
  turning_insert: 'Plaquette tournage',
  thread_mill:    'Fraise filetar.',
};

// ── Ligne de résultat (outil + conditions) ────────────────────────────────────
type SelectionResult = { featureId: string; tool: Tool; conditions: CuttingConditions };

function ToolRow({ result }: { result: SelectionResult }) {
  const [open, setOpen] = useState(false);
  const { tool, conditions } = result;

  return (
    <div className="border-b border-navy-400/15 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-navy-600/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <Wrench size={12} className="text-ice-500/60 shrink-0" />
        <span className="text-xs font-medium text-ice-100 flex-1 truncate">
          {TOOL_TYPE_LABELS[tool.type] ?? tool.type} — Ø{tool.diameter} mm
        </span>
        <span className="badge badge-gray">{tool.iso13399Code}</span>
        <ChevronDown size={11} className={clsx('text-ice-800/60 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="pb-2">
          <div className="px-4 py-1 text-[9px] text-ice-800/50 uppercase tracking-widest font-semibold">Géométrie</div>
          <div className="prop-row"><span className="prop-label">Revêtement</span><span className="prop-value">{tool.coating ?? '—'}</span></div>
          <div className="prop-row"><span className="prop-label">Nb. dents</span><span className="prop-value">{tool.numberOfFlutes}</span></div>
          <div className="prop-row"><span className="prop-label">Lg. coupante</span><span className="prop-value">{tool.cuttingLength} mm</span></div>
          <div className="px-4 pt-2 pb-1 text-[9px] text-ice-800/50 uppercase tracking-widest font-semibold">Conditions de coupe</div>
          <div className="prop-row"><span className="prop-label">Vc</span><span className="prop-value">{conditions.Vc} m/min</span></div>
          <div className="prop-row"><span className="prop-label">N</span><span className="prop-value">{conditions.N.toFixed(0)} tr/min</span></div>
          <div className="prop-row"><span className="prop-label">Vf</span><span className="prop-value">{conditions.Vf.toFixed(0)} mm/min</span></div>
          <div className="prop-row"><span className="prop-label">fz · ap · ae</span><span className="prop-value">{conditions.fz.toFixed(4)} · {conditions.ap} · {conditions.ae}</span></div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function Module3_Tooling() {
  const { features, completeStep, model3D } = useAppStore((s) => ({
    features:     s.features,
    completeStep: s.completeStep,
    model3D:      s.model3D,
  }));

  const [materials, setMaterials]     = useState<Material[]>([]);
  const [selectedMat, setSelectedMat] = useState<string>('');
  const [results, setResults]         = useState<SelectionResult[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Chargement initial des matières
  useEffect(() => {
    toolingApi.listMaterials()
      .then((mats) => { setMaterials(mats); if (mats.length) setSelectedMat(mats[0].id); })
      .catch(() => { /* silencieux si backend non démarré */ });
  }, []);

  async function handleAutoSelect() {
    if (!features.length || !selectedMat) return;
    setIsLoading(true); setError(null);
    try {
      const featureIds = features.map((f) => f.id);
      const selections = await toolingApi.autoSelectTools(featureIds, selectedMat);
      setResults(selections);
      completeStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      {/* ── Toolbar ── */}
      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><Wrench size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Outillage & CAPP</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Sélection ISO 13399 · Conditions de coupe</p>
          </div>
        </div>
        <div className="flex-1" />

        {materials.length > 0 && (
          <select
            value={selectedMat}
            onChange={(e) => setSelectedMat(e.target.value)}
            className="select"
          >
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
          </select>
        )}

        <button onClick={handleAutoSelect} disabled={isLoading || !features.length} className="btn-primary">
          <Play size={13} />
          {isLoading ? 'Sélection…' : 'Sélection auto'}
        </button>
        <button onClick={() => setResults([])} disabled={!results.length} className="btn-secondary">
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-navy-950 flex items-center justify-center text-ice-800/50 text-sm">
          {!model3D ? 'Complétez le Module 1' : !features.length ? 'Complétez le Module 2'
            : `${features.length} entité(s) prête(s)`}
        </div>

        {results.length > 0 && (
          <div className="w-80 flex flex-col border-l border-navy-400/20 bg-navy-850/80 shrink-0">
            <div className="panel-header">
              <Wrench size={12} />
              Sélection ({results.length} outil{results.length > 1 ? 's' : ''})
            </div>
            <div className="flex-1 overflow-y-auto">
              {results.map((r) => <ToolRow key={r.featureId} result={r} />)}
            </div>
            <div className="px-4 py-2 border-t border-navy-400/15 text-[10px] text-ice-800/60">
              Matière : {materials.find((m) => m.id === selectedMat)?.name ?? '—'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
