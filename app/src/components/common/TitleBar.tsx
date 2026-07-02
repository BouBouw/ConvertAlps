/**
 * TitleBar.tsx — Barre de titre custom (Tauri decorations: false)
 * Drag zone + contrôles fenêtre (minimize / maximize / close)
 */
import { useEffect, useState, useCallback } from 'react';
import { Minus, Maximize2, Minimize2, X, Layers } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useJobStore } from '../../store/useJobStore';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const MODULE_LABELS: Record<string, { label: string; step: string }> = {
  '/module/1': { label: 'Ingestion 2D → 3D',          step: '01' },
  '/module/2': { label: 'Reconnaissance de formes',    step: '02' },
  '/module/3': { label: 'Outillage & CAPP',             step: '03' },
  '/module/4': { label: 'FAO Core',                    step: '04' },
  '/module/5': { label: 'Post-Processeur & Simulation', step: '05' },
  '/module/6': { label: 'Estimateur & ERP',            step: '06' },
  '/projects': { label: 'Projets',                     step: '' },
  '/settings': { label: 'Paramètres machine',          step: '' },
};

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const location  = useLocation();
  const navigate  = useNavigate();
  const activeJobs = useJobStore((s) => s.activeJobCount());

  const pageInfo = MODULE_LABELS[location.pathname] ?? { label: 'ConvertAlps FAO', step: '' };

  // Sync maximize state
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      setIsMaximized(await w.isMaximized());
      unlisten = await w.onResized(async () => {
        setIsMaximized(await w.isMaximized());
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  const minimize = useCallback(async () => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }, []);

  const toggleMaximize = useCallback(async () => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  }, []);

  const close = useCallback(async () => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }, []);

  return (
    <div
      className="flex items-center h-9 shrink-0 select-none"
      style={{ backgroundColor: 'rgb(var(--navy-900))', borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Logo — draggable zone, clicking navigates home */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-4 h-full cursor-default"
        onDoubleClick={() => navigate('/module/1')}
      >
        <div className="w-5 h-5 rounded bg-gradient-ice flex items-center justify-center shrink-0">
          <Layers size={11} className="text-white" />
        </div>
        <span className="text-[12px] font-semibold text-ice-50 tracking-tight">ConvertAlps</span>
        <span className="text-[10px] text-ice-800/60 font-medium bg-navy-700/50 px-1.5 py-0.5 rounded border border-navy-400/30">
          FAO
        </span>
      </div>

      {/* Séparateur */}
      <div className="w-px h-4 bg-navy-400/30" />

      {/* Breadcrumb module actif — also draggable */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-4 flex-1 min-w-0">
        {pageInfo.step && (
          <span className="text-[10px] font-mono text-ice-500/50">{pageInfo.step}</span>
        )}
        <span className="text-[11px] font-medium text-ice-500 truncate">{pageInfo.label}</span>
      </div>

      {/* Indicateur calculs actifs */}
      {activeJobs > 0 && (
        <div
          className="flex items-center gap-1.5 mr-3 px-2 py-1 rounded
                     bg-ice-600/10 border border-ice-600/20"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-ice-500 animate-pulse" />
          <span className="text-[10px] text-ice-500 font-medium">
            {activeJobs} calcul{activeJobs > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Contrôles fenêtre */}
      <div className="flex items-center h-full">
        <button
          onClick={minimize}
          className={clsx(
            'w-11 h-full flex items-center justify-center',
            'text-ice-500/50 hover:text-ice-200 hover:bg-navy-700/60',
            'transition-all duration-100',
          )}
          title="Réduire"
        >
          <Minus size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleMaximize}
          className={clsx(
            'w-11 h-full flex items-center justify-center',
            'text-ice-500/50 hover:text-ice-200 hover:bg-navy-700/60',
            'transition-all duration-100',
          )}
          title={isMaximized ? 'Restaurer' : 'Agrandir'}
        >
          {isMaximized
            ? <Minimize2 size={12} strokeWidth={1.5} />
            : <Maximize2 size={12} strokeWidth={1.5} />
          }
        </button>
        <button
          onClick={close}
          className={clsx(
            'w-11 h-full flex items-center justify-center',
            'text-ice-500/40 hover:text-white hover:bg-red-600/80',
            'transition-all duration-100',
          )}
          title="Fermer"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
