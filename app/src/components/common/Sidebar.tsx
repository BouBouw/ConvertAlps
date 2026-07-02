/**
 * Sidebar — Navigation principale ConvertAlps (design Blue Ice Premium)
 */
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileUp, Scan, Wrench, Route, Cpu, Calculator,
  Settings, FolderOpen, Check, Sliders,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { WorkflowStep } from '../../types';

type NavItem = {
  step: WorkflowStep;
  path: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { step: 1, path: '/module/1', label: 'Ingestion',    description: 'DXF/DWG → STEP',          Icon: FileUp     },
  { step: 2, path: '/module/2', label: 'AFR',          description: 'Reconnaissance formes',    Icon: Scan       },
  { step: 3, path: '/module/3', label: 'Outillage',    description: 'CAPP & ISO 13399',         Icon: Wrench     },
  { step: 4, path: '/module/4', label: 'FAO Core',     description: 'Trajectoires & G-Code',    Icon: Route      },
  { step: 5, path: '/module/5', label: 'Post-Proc.',   description: 'Simulation & export CN',   Icon: Cpu        },
  { step: 6, path: '/module/6', label: 'Estimateur',   description: 'Chiffrage & ERP',          Icon: Calculator },
];

export function Sidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { currentStep, completedSteps } = useAppStore((s) => ({
    currentStep:    s.currentStep,
    completedSteps: s.completedSteps,
  }));

  return (
    <aside className="w-52 flex flex-col bg-navy-850 border-r border-navy-400/20 shrink-0">

      {/* ── Navigation modules ── */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="px-4 pb-2 text-[9px] uppercase text-ice-800/60 tracking-[0.12em] font-semibold">
          Modules de travail
        </p>

        {NAV_ITEMS.map((item) => {
          const isActive    = location.pathname === item.path;
          const isCompleted = completedSteps.includes(item.step);
          const isCurrent   = currentStep === item.step;
          const NavIcon     = item.Icon;

          return (
            <button
              key={item.step}
              onClick={() => navigate(item.path)}
              title={`${item.label} — Raccourci : ${item.step}`}
              className={clsx(
                'relative w-full flex items-center gap-3 px-4 py-2.5 text-left',
                'transition-all duration-150 group',
                isActive
                  ? 'bg-ice-500/8 text-ice-50'
                  : 'text-ice-500/70 hover:bg-navy-700/40 hover:text-ice-200',
              )}
            >
              {/* Barre active left */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r bg-ice-500" />
              )}

              {/* Pastille numéro / statut */}
              <span className={clsx(
                'shrink-0 w-[22px] h-[22px] rounded-md flex items-center justify-center text-[10px] font-bold',
                'transition-all duration-150',
                isCompleted
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : isActive
                  ? 'bg-ice-500/15 text-ice-400 border border-ice-500/30'
                  : isCurrent
                  ? 'bg-ice-800/40 text-ice-500 border border-ice-800/60'
                  : 'bg-navy-600/40 text-ice-800/60 border border-navy-400/30',
              )}>
                {isCompleted ? <Check size={10} strokeWidth={2.5} /> : <NavIcon size={11} />}
              </span>

              {/* Labels */}
              <span className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{item.label}</p>
                <p className={clsx(
                  'text-[10px] truncate leading-tight mt-0.5',
                  isActive ? 'text-ice-500/80' : 'text-ice-800/60',
                )}>
                  {item.description}
                </p>
              </span>

              {/* Raccourci clavier au hover */}
              <kbd className={clsx('opacity-0 group-hover:opacity-100 transition-opacity')}>
                {item.step}
              </kbd>
            </button>
          );
        })}
      </nav>

      {/* ── Divider + liens utilitaires ── */}
      <div className="border-t border-navy-400/20 py-2">
        {[
          { path: '/projects',     Icon: FolderOpen, label: 'Projets',             shortcut: '⌃P' },
          { path: '/settings',     Icon: Settings,   label: 'Paramètres machine',  shortcut: '⌃,' },
          { path: '/app-settings', Icon: Sliders,    label: 'Préférences logiciel', shortcut: '' },
        ].map(({ path, Icon, label, shortcut }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={clsx(
              'relative w-full flex items-center gap-3 px-4 py-2 text-left',
              'transition-all duration-150 group',
              location.pathname === path
                ? 'bg-ice-500/8 text-ice-200'
                : 'text-ice-800/70 hover:bg-navy-700/40 hover:text-ice-300',
            )}
          >
            {location.pathname === path && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-ice-500/50" />
            )}
            <Icon size={14} className="shrink-0" />
            <span className="flex-1 text-xs">{label}</span>
            <kbd className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px]">{shortcut}</kbd>
          </button>
        ))}
      </div>
    </aside>
  );
}
