/**
 * CollisionAlert — Alerte overlay (Blue Ice Premium)
 * Vert=OK · Orange=surépaisseur · Rouge=collision STOP
 */
import { useEffect, useRef } from 'react';
import { AlertTriangle, XCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore }      from '../../store/useAppStore';
import type { CollisionStatus } from '../../types';

type AlertConfig = {
  bg: string; border: string; textColor: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string; message: string; animate?: string;
};

const ALERT_CONFIG: Record<Exclude<CollisionStatus, 'none'>, AlertConfig> = {
  warning: {
    bg:        'bg-amber-950/60 backdrop-blur-sm',
    border:    'border-amber-500/50',
    textColor: 'text-amber-300',
    Icon:      AlertTriangle,
    title:     'Surépaisseur détectée',
    message:   "Des zones de surépaisseur ont été identifiées. Vérifiez les paramètres de finition.",
  },
  collision: {
    bg:        'bg-red-950/70 backdrop-blur-sm',
    border:    'border-red-500/50',
    textColor: 'text-red-300',
    Icon:      XCircle,
    title:     'COLLISION — Simulation arrêtée',
    message:   "Une collision outil/pièce critique a été détectée. Corrigez la trajectoire avant de relancer.",
    animate:   'animate-pulse-fast',
  },
};

export function CollisionAlert() {
  const { collisionStatus, simulationState, setCollisionStatus } = useAppStore((s) => ({
    collisionStatus:    s.collisionStatus,
    simulationState:    s.simulationState,
    setCollisionStatus: s.setCollisionStatus,
  }));
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (collisionStatus !== 'collision') return;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      [0, 0.35].forEach((delay) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square'; osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.3);
      });
    } catch { /* audio non dispo */ }
    return () => { audioCtxRef.current?.close(); };
  }, [collisionStatus]);

  if (collisionStatus === 'none') return null;

  const config = ALERT_CONFIG[collisionStatus];
  const { Icon } = config;
  const lastCollision = simulationState.collisions.at(-1);

  return (
    <>
      {collisionStatus === 'collision' && (
        <div className="absolute inset-0 pointer-events-none border-2 border-red-500/70 animate-pulse-fast z-50" />
      )}
      <div
        role="alert"
        className={clsx(
          'absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[420px]',
          'rounded-xl border shadow-ice animate-slide-up',
          config.bg, config.border, config.animate,
        )}
      >
        <div className={clsx('flex items-start gap-3 p-4', config.textColor)}>
          <Icon size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{config.title}</p>
            <p className="text-xs mt-1 opacity-80 leading-relaxed">{config.message}</p>
            {lastCollision && (
              <p className="text-[10px] font-mono mt-2 opacity-60">
                t={lastCollision.timestampInSimulation.toFixed(2)}s · {lastCollision.message}
              </p>
            )}
          </div>
          <button
            onClick={() => setCollisionStatus('none')}
            className="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

