/**
 * MainLayout — Squelette premium de l'application ConvertAlps
 * TitleBar custom + Sidebar + WorkflowStepper + Content + JobQueue
 */
import { Outlet } from 'react-router-dom';
import { TitleBar }         from '../components/common/TitleBar';
import { Sidebar }          from '../components/common/Sidebar';
import { WorkflowStepper }  from '../components/common/WorkflowStepper';
import { JobQueuePanel }    from '../components/common/JobQueuePanel';
import { CollisionAlert }   from '../components/common/CollisionAlert';
import { useAppStore }      from '../store/useAppStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export default function MainLayout() {
  const collisionStatus = useAppStore((s) => s.collisionStatus);

  // Raccourcis clavier globaux
  useKeyboardShortcuts();

  return (
    <div className="flex flex-col h-screen bg-navy-950 overflow-hidden">

      {/* ── Barre de titre custom (Tauri) ── */}
      <TitleBar />

      {/* ── Corps de l'application ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar de navigation ── */}
        <Sidebar />

        {/* ── Zone de travail principale ── */}
        <main className="flex flex-col flex-1 overflow-hidden bg-navy-800">

          {/* Fil d'Ariane workflow */}
          <WorkflowStepper />

          {/* Contenu du module actif */}
          <div className="relative flex-1 overflow-hidden">
            {collisionStatus !== 'none' && <CollisionAlert />}
            <Outlet />
          </div>

          {/* Status bar */}
          <footer className="flex items-center justify-between px-5 h-6 shrink-0
                             bg-navy-900/80 border-t border-navy-400/15 text-[10px] text-ice-500/50">
            <span className="font-medium text-ice-800/70">ConvertAlps FAO v0.1.0</span>
            <span className="text-ice-800/40">Rust · Node.js · WebGL</span>
          </footer>
        </main>
      </div>

      {/* ── Panneau Job Queue flottant ── */}
      <JobQueuePanel />
    </div>
  );
}

