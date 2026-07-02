/**
 * Module 6 — Estimateur & ERP (Blue Ice Premium)
 */
import { useState } from 'react';
import { Calculator, Download, RefreshCw, AlertCircle, Clock, DollarSign } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore }  from '../store/useAppStore';
import { estimatorApi } from '../api/backendApi';
import type { CycleTimeEstimate, QuoteExport } from '../types';

function TimeRow({ label, seconds, highlight }: { label: string; seconds: number; highlight?: boolean }) {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return (
    <div className={clsx('prop-row', highlight && 'bg-ice-500/5 border-t border-navy-400/20')}>
      <span className={clsx('prop-label', highlight && 'text-ice-300 font-semibold')}>{label}</span>
      <span className={clsx('prop-value font-mono tabular-nums', highlight && 'text-ice-400 font-bold')}>
        {min}m {sec.toString().padStart(2, '0')}s
      </span>
    </div>
  );
}

export default function Module6_Estimator() {
  const { toolpaths } = useAppStore((s) => ({ toolpaths: s.toolpaths }));
  const [estimate, setEstimate] = useState<CycleTimeEstimate | null>(null);
  const [quote, setQuote]       = useState<QuoteExport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleEstimate() {
    if (!toolpaths.length) { setError('Aucune trajectoire — Complétez le Module 4.'); return; }
    setIsLoading(true); setError(null);
    try { setEstimate(await estimatorApi.estimateCycleTime('current')); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setIsLoading(false); }
  }

  async function handleQuote() {
    setIsLoading(true); setError(null);
    try { setQuote(await estimatorApi.generateQuote('current')); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setIsLoading(false); }
  }

  async function handleExport(format: 'json' | 'csv') {
    try {
      const { downloadUrl } = await estimatorApi.exportToERP('current', format);
      window.open(downloadUrl, '_blank');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><Calculator size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Estimateur & ERP</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Temps cycle · Chiffrage · Export SAP/Sage</p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={handleEstimate} disabled={isLoading || !toolpaths.length} className="btn-primary">
          <Clock size={13} />
          {isLoading ? 'Calcul…' : 'Calculer temps cycle'}
        </button>
        <button onClick={handleQuote} disabled={isLoading || !estimate} className="btn-secondary">
          <DollarSign size={13} />
          Devis
        </button>
        <button onClick={() => { setEstimate(null); setQuote(null); }} className="btn-secondary">
          <RefreshCw size={13} />
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">

        {estimate ? (
          <div className="panel">
            <div className="panel-header"><Clock size={12} />Temps de cycle</div>
            <TimeRow label="Temps d'usinage"       seconds={estimate.machiningTimeSeconds} />
            <TimeRow label="Changements d'outil"   seconds={estimate.toolChangeTimeSeconds} />
            <TimeRow label="Préparation / Setup"   seconds={estimate.setupTimeSeconds} />
            <TimeRow label="TOTAL"                 seconds={estimate.totalTimeSeconds} highlight />
            {estimate.breakdown.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[9px] text-ice-800/50 uppercase tracking-widest font-semibold border-t border-navy-400/15">
                  Détail par opération
                </div>
                {estimate.breakdown.map((b) => (
                  <TimeRow key={b.operationId} label={b.description} seconds={b.durationSeconds} />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="panel flex items-center justify-center h-40 text-ice-800/40 text-sm">
            Lancez le calcul du temps de cycle
          </div>
        )}

        {quote ? (
          <div className="panel">
            <div className="panel-header"><DollarSign size={12} />{quote.partName}</div>
            <div className="prop-row"><span className="prop-label">Pièce</span><span className="prop-value">{quote.partName}</span></div>
            <div className="prop-row"><span className="prop-label">Matière</span><span className="prop-value">{quote.material}</span></div>
            <div className="prop-row"><span className="prop-label">Coût matière</span><span className="prop-value">{quote.materialCost.toFixed(2)} {quote.currency}</span></div>
            <div className="prop-row"><span className="prop-label">Coût usinage</span><span className="prop-value">{quote.machiningCost.toFixed(2)} {quote.currency}</span></div>
            <div className="prop-row"><span className="prop-label">Coût outillage</span><span className="prop-value">{quote.toolingCost.toFixed(2)} {quote.currency}</span></div>
            <div className="prop-row bg-ice-500/5 border-t border-navy-400/20">
              <span className="prop-label !text-ice-200 font-semibold">TOTAL</span>
              <span className="prop-value text-ice-400 font-bold">{quote.totalCost.toFixed(2)} {quote.currency}</span>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-navy-400/15">
              <span className="text-[10px] text-ice-500/60 self-center mr-1">Export :</span>
              <button onClick={() => handleExport('json')} className="btn-secondary btn-sm"><Download size={10} />JSON</button>
              <button onClick={() => handleExport('csv')}  className="btn-secondary btn-sm"><Download size={10} />CSV</button>
            </div>
          </div>
        ) : (
          <div className="panel flex items-center justify-center h-40 text-ice-800/40 text-sm">
            {!estimate ? 'Calculez d\'abord le temps de cycle' : 'Cliquez sur « Devis »'}
          </div>
        )}
      </div>
    </div>
  );
}
