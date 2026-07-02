/**
 * Plan2DViewer — Panneau gauche du split-screen.
 * Rendu Canvas HTML5 des entités DXF avec pan/zoom interactif.
 * Les données proviennent du store Zustand (chargées depuis le backend Express).
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useAppSettingsStore } from '../../store/useAppSettingsStore';

// ── Types internes ─────────────────────────────────────────────────────────────
interface ViewTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// ── Composant ──────────────────────────────────────────────────────────────────
export function Plan2DViewer() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dxfFile = useAppStore((s) => s.dxfFile);
  const theme   = useAppSettingsStore((s) => s.theme);

  const [view, setView] = useState<ViewTransform>({ offsetX: 0, offsetY: 0, zoom: 1 });

  // Ref pour le pan (évite les closures sur le state)
  const isDragging  = useRef(false);
  const dragOrigin  = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // ── Rendu Canvas ────────────────────────────────────────────────────────────
  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, v: ViewTransform) => {
      const isDark = document.documentElement.dataset.theme !== 'light';
      const C = {
        bg:     isDark ? '#060D14' : '#EBF4F9',
        grid:   isDark ? '#111E2B' : '#C8DEEA',
        entity: isDark ? '#7FA6B8' : '#2A5A6E',
        textA:  isDark ? '#3D5A6B' : '#3D6E84',
        textB:  isDark ? '#2A3E4B' : '#4A7080',
      };
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, w, h);

      // Grille
      const gridPx = 20 * v.zoom;
      const ox     = ((v.offsetX % gridPx) + gridPx) % gridPx;
      const oy     = ((v.offsetY % gridPx) + gridPx) % gridPx;
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 0.5;
      for (let x = ox - gridPx; x < w + gridPx; x += gridPx) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = oy - gridPx; y < h + gridPx; y += gridPx) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      if (!dxfFile) {
        ctx.fillStyle    = C.textA;
        ctx.font         = '13px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Glissez un fichier DXF/DWG ici', w / 2, h / 2 - 10);
        ctx.fillStyle = C.textB;
        ctx.font      = '11px "Inter", "Segoe UI", sans-serif';
        ctx.fillText('ou utilisez « Importer » dans la barre d\'outils', w / 2, h / 2 + 12);
        return;
      }

      // ── Rendu des entités DXF ────────────────────────────────────────────
      ctx.save();
      // Transformation : centre du canvas + pan + flip Y (convention DXF)
      ctx.translate(w / 2 + v.offsetX, h / 2 + v.offsetY);
      ctx.scale(v.zoom, -v.zoom);

      // ── Polylignes pré-calculées (SPLINE, ARC, LWPOLYLINE…) ─────────────
      if (dxfFile.polylines?.length) {
        for (const pl of dxfFile.polylines) {
          const verts = pl.vertices;
          if (verts.length < 2) continue;
          ctx.strokeStyle = pl.color ?? C.entity;
          ctx.lineWidth   = 0.8 / v.zoom;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
          ctx.stroke();
        }
      } else {
      // ── Fallback : rendu des entités DXF standard ────────────────────────
      dxfFile.entities.forEach((entity) => {
        ctx.strokeStyle = C.entity;
        ctx.lineWidth   = 0.8 / v.zoom;
        ctx.beginPath();

        switch (entity.type) {
          case 'LINE': {
            const [p1, p2] = entity.vertices ?? [];
            if (p1 && p2) { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
            break;
          }
          case 'CIRCLE': {
            const c = entity.vertices?.[0];
            if (c && entity.radius) {
              ctx.arc(c.x, c.y, entity.radius, 0, Math.PI * 2);
              ctx.stroke();
            }
            break;
          }
          case 'ARC': {
            const a = entity.vertices?.[0];
            if (a && entity.radius != null && entity.startAngle != null && entity.endAngle != null) {
              ctx.arc(
                a.x, a.y, entity.radius,
                (entity.startAngle * Math.PI) / 180,
                (entity.endAngle   * Math.PI) / 180,
              );
              ctx.stroke();
            }
            break;
          }
          case 'LWPOLYLINE':
          case 'POLYLINE': {
            const verts = entity.vertices ?? [];
            if (verts.length < 2) break;
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.stroke();
            break;
          }
          default:
            break;
        }
      });
      } // end fallback

      ctx.restore();
    },
    [dxfFile, theme],
  );

  // Ref vers la fonction render courante (évite la closure périmée dans ResizeObserver)
  const renderRef = useRef(render);
  useEffect(() => { renderRef.current = render; }, [render]);

  // ── Resize Observer + rendu ────────────────────────────────────────────────
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const observer = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      renderRef.current(ctx, canvas.width, canvas.height, view);
    });

    observer.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    renderRef.current(ctx, canvas.width, canvas.height, view);

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit quand le fichier DXF change
  useEffect(() => {
    if (!dxfFile) return;
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Priorité : polylignes pré-calculées (plus précises)
    if (dxfFile.polylines?.length) {
      for (const pl of dxfFile.polylines) {
        for (const v of pl.vertices) {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        }
      }
    } else {
      for (const e of dxfFile.entities ?? []) {
        for (const v of e.vertices ?? []) {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        }
        if ((e.type === 'CIRCLE' || e.type === 'ARC') && e.radius && e.vertices?.[0]) {
          const { x, y } = e.vertices[0];
          if (x - e.radius < minX) minX = x - e.radius; if (x + e.radius > maxX) maxX = x + e.radius;
          if (y - e.radius < minY) minY = y - e.radius; if (y + e.radius > maxY) maxY = y + e.radius;
        }
      }
    }
    if (!isFinite(minX)) return;

    const cw   = container.clientWidth  || 400;
    const ch   = container.clientHeight || 300;
    const dxfW = maxX - minX || 1;
    const dxfH = maxY - minY || 1;
    const zoom = Math.min((cw * 0.85) / dxfW, (ch * 0.85) / dxfH);
    const cx   = (minX + maxX) / 2;
    const cy   = (minY + maxY) / 2;
    setView({ zoom, offsetX: -cx * zoom, offsetY: cy * zoom });
  }, [dxfFile]);

  // Re-rendu à chaque changement de vue ou données
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    render(ctx, canvas.width, canvas.height, view);
  }, [render, view]);

  // ── Événements souris (pan) ────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragOrigin.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setView((v) => ({
      ...v,
      offsetX: dragOrigin.current.ox + (e.clientX - dragOrigin.current.x),
      offsetY: dragOrigin.current.oy + (e.clientY - dragOrigin.current.y),
    }));
  };
  const onMouseUp = () => { isDragging.current = false; };

  // ── Zoom molette ───────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    setView((v) => ({ ...v, zoom: Math.max(0.02, Math.min(200, v.zoom * factor)) }));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />

      {/* ── Contrôles de zoom ── */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        {[
          { Icon: ZoomIn,    action: () => setView((v) => ({ ...v, zoom: Math.min(200, v.zoom * 1.3) })), title: 'Zoom avant' },
          { Icon: ZoomOut,   action: () => setView((v) => ({ ...v, zoom: Math.max(0.02, v.zoom * 0.77) })), title: 'Zoom arrière' },
          { Icon: RotateCcw, action: () => setView({ offsetX: 0, offsetY: 0, zoom: 1 }), title: 'Réinitialiser' },
        ].map(({ Icon, action, title }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            className="w-7 h-7 flex items-center justify-center
                       bg-navy-850/80 hover:bg-navy-700 border border-navy-400/25
                       rounded text-ice-500/70 hover:text-ice-200 transition-all duration-150
                       backdrop-blur-sm"
          >
            <Icon size={13} />
          </button>
        ))}
      </div>

      {/* ── Badge d'info ── */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
        <span className="text-[10px] bg-navy-850/80 backdrop-blur-sm px-2 py-0.5 rounded
                         text-ice-800/70 border border-navy-400/20">
          Plan 2D · {(view.zoom * 100).toFixed(0)}%
        </span>
        {dxfFile && (
          <span className="badge badge-ice">
            {dxfFile.name} · {dxfFile.entities.length} entités
          </span>
        )}
      </div>

      {!dxfFile && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border border-dashed border-navy-400/20 rounded-2xl p-10
                          flex flex-col items-center gap-3">
            <Upload size={28} className="text-ice-800/30" />
            <p className="text-sm text-ice-800/60 font-medium">Déposer un fichier DXF/DWG</p>
            <p className="text-xs text-ice-800/40">Formats supportés : .dxf, .dwg</p>
          </div>
        </div>
      )}
    </div>
  );
}
