/**
 * SplitScreenLayout — Double panneau redimensionnable (Blue Ice Premium)
 */
import { useRef, useState, useCallback } from 'react';
import { Plan2DViewer  } from './Plan2DViewer';
import { Model3DViewer } from './Model3DViewer';
import { clsx } from 'clsx';

const MIN_RATIO = 0.20;
const MAX_RATIO = 0.80;

export function SplitScreenLayout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const isDragging   = useRef(false);

  const onDividerMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect  = containerRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setSplitRatio(Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio)));
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  }, []);

  const leftWidth  = `${splitRatio * 100}%`;
  const rightWidth = `${(1 - splitRatio) * 100 - 0.15}%`;

  return (
    <div
      ref={containerRef}
      className="flex h-full overflow-hidden"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Panneau gauche : Plan 2D ── */}
      <div className="flex flex-col h-full overflow-hidden shrink-0" style={{ width: leftWidth }}>
        <div className="flex items-center gap-2 px-3 py-2 bg-navy-850/80 border-b border-navy-400/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-ice-500 shrink-0" />
          <span className="text-[10px] font-semibold text-ice-500/80 uppercase tracking-widest">Plan 2D</span>
          <span className="ml-auto text-[10px] text-ice-800/50">DXF/DWG</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <Plan2DViewer />
        </div>
      </div>

      {/* ── Diviseur ── */}
      <div
        className={clsx(
          'w-[2px] h-full cursor-col-resize shrink-0 relative',
          'bg-navy-400/20 hover:bg-ice-500/40 transition-colors duration-150 group',
        )}
        onMouseDown={onDividerMouseDown}
      >
        {/* Poignée */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                        w-1 h-8 rounded-full bg-navy-400/40 group-hover:bg-ice-500/50 transition-colors" />
      </div>

      {/* ── Panneau droit : Vue 3D ── */}
      <div className="flex flex-col h-full overflow-hidden" style={{ width: rightWidth }}>
        <div className="flex items-center gap-2 px-3 py-2 bg-navy-850/80 border-b border-navy-400/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-ice-400 shrink-0" />
          <span className="text-[10px] font-semibold text-ice-500/80 uppercase tracking-widest">Solide 3D</span>
          <span className="ml-auto text-[10px] text-ice-800/50">OpenCASCADE · WebGL</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <Model3DViewer />
        </div>
      </div>
    </div>
  );
}
