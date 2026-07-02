/**
 * JobQueuePanel — Panneau flottant de suivi des calculs (Blue Ice Premium)
 */
import { useState } from 'react';
import {
  X, Loader2, CheckCircle2, XCircle, Clock, Trash2, Activity,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useJobStore } from '../../store/useJobStore';
import type { Job, JobStatus } from '../../types';

type StatusConfig = {
  label: string;
  color: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  pending:   { label: 'En attente', color: 'text-amber-400',    Icon: Clock        },
  running:   { label: 'En cours',   color: 'text-ice-400',      Icon: Loader2      },
  completed: { label: 'Terminé',    color: 'text-emerald-400',  Icon: CheckCircle2 },
  failed:    { label: 'Échec',      color: 'text-red-400',      Icon: XCircle      },
  cancelled: { label: 'Annulé',     color: 'text-ice-800/60',   Icon: XCircle      },
};

function JobCard({ job }: { job: Job }) {
  const removeJob = useJobStore((s) => s.removeJob);
  const config    = STATUS_CONFIG[job.status];
  const { Icon } = config;

  return (
    <div className="px-4 py-3 border-b border-navy-400/20 last:border-b-0
                    hover:bg-navy-600/20 transition-colors duration-100 group">
      <div className="flex items-start gap-2.5">
        <Icon
          size={13}
          className={clsx(config.color, 'mt-0.5 shrink-0', job.status === 'running' && 'animate-spin')}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-ice-100 truncate leading-tight">{job.label}</p>

          {job.status === 'running' && (
            <div className="mt-2">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-ice-500/70">{config.label}</span>
                <span className="text-[10px] text-ice-400 font-mono tabular-nums">{job.progress}%</span>
              </div>
              <div className="h-0.5 bg-navy-500/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-ice-600 to-ice-400 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            </div>
          )}

          {job.status === 'failed' && job.error && (
            <p className="mt-1 text-[10px] text-red-400 line-clamp-2 leading-tight">{job.error}</p>
          )}

          <p className="mt-1 text-[10px] text-ice-800/60 font-mono">
            {new Date(job.createdAt).toLocaleTimeString('fr-FR')}
          </p>
        </div>

        <button
          onClick={() => removeJob(job.id)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded
                     text-ice-800/60 hover:text-ice-300 hover:bg-navy-500/40
                     transition-all duration-100 shrink-0"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

export function JobQueuePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { jobs, clearCompleted } = useJobStore((s) => ({
    jobs:           s.jobs,
    clearCompleted: s.clearCompleted,
  }));
  const activeCount    = useJobStore((s) => s.activeJobCount());
  const hasTerminated  = jobs.some((j) => ['completed', 'failed', 'cancelled'].includes(j.status));

  const sortedJobs = [...jobs].sort((a, b) => {
    const ORDER: Record<string, number> = { running: 0, pending: 1, completed: 2, failed: 2, cancelled: 3 };
    const diff = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
    return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      {/* ── Bouton flottant ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={clsx(
            'fixed bottom-8 right-5 z-40 flex items-center gap-2 px-3 py-2',
            'rounded-lg shadow-ice text-xs font-medium transition-all duration-150 border',
            'backdrop-blur-sm animate-fade-in',
            activeCount > 0
              ? 'bg-ice-500/10 border-ice-500/25 text-ice-300 hover:bg-ice-500/15'
              : 'bg-navy-800/90 border-navy-400/30 text-ice-500/70 hover:bg-navy-700',
          )}
        >
          <Activity size={13} className={clsx(activeCount > 0 && 'animate-pulse text-ice-400')} />
          {activeCount > 0 ? `${activeCount} actif${activeCount > 1 ? 's' : ''}` : `${jobs.length} jobs`}
        </button>
      )}

      {/* ── Panneau latéral ── */}
      {isOpen && (
        <div className="fixed right-0 top-9 bottom-6 w-72 z-40 flex flex-col
                        bg-navy-850/95 backdrop-blur-xl border-l border-navy-400/20
                        shadow-[−4px_0_32px_rgba(6,13,20,0.6)] animate-slide-right">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-navy-400/20 shrink-0">
            <Activity size={14} className={clsx('text-ice-500', activeCount > 0 && 'animate-pulse')} />
            <span className="text-xs font-semibold text-ice-200 flex-1">
              File de calculs
            </span>
            {activeCount > 0 && (
              <span className="text-[10px] font-medium text-ice-400 bg-ice-500/10 border border-ice-500/20 px-1.5 py-0.5 rounded">
                {activeCount} actif{activeCount > 1 ? 's' : ''}
              </span>
            )}
            {hasTerminated && (
              <button
                onClick={clearCompleted}
                className="text-ice-800/60 hover:text-ice-300 transition-colors"
                title="Effacer les jobs terminés"
              >
                <Trash2 size={12} />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-0.5 rounded text-ice-800/60 hover:text-ice-200 hover:bg-navy-600/40 transition-all"
            >
              <X size={13} />
            </button>
          </div>

          {/* Liste des jobs */}
          <div className="flex-1 overflow-y-auto">
            {sortedJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Activity size={24} className="text-ice-800/30" />
                <p className="text-[11px] text-ice-800/60">Aucun calcul en cours</p>
              </div>
            ) : (
              sortedJobs.map((job: Job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
