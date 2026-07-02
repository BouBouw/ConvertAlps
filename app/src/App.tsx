/**
 * App.tsx — Routeur principal de ConvertAlps
 */
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout            from './layouts/MainLayout';
import Module1_Ingestion     from './pages/Module1_Ingestion';
import Module2_AFR           from './pages/Module2_AFR';
import Module3_Tooling       from './pages/Module3_Tooling';
import Module4_FAO           from './pages/Module4_FAO';
import Module5_PostProcessor from './pages/Module5_PostProcessor';
import Module6_Estimator     from './pages/Module6_Estimator';
import ProjectsPage          from './pages/ProjectsPage';
import SettingsPage          from './pages/SettingsPage';
import AppSettingsPage       from './pages/AppSettingsPage';
import { UpdateNotification } from './components/updater/UpdateNotification';
import { waitForBackend }    from './api/backendApi';

/** Écran de démarrage affiché le temps que le sidecar Express s'initialise */
function BackendLoader() {
  return (
    <div className="fixed inset-0 z-[99999] bg-[#060D14] flex flex-col items-center justify-center gap-5">
      <div className="w-9 h-9 rounded-full border-2 border-ice-700 border-t-ice-400 animate-spin" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-ice-300 text-sm font-medium">Démarrage du serveur…</span>
        <span className="text-ice-600 text-xs">Initialisation du moteur ConvertAlps</span>
      </div>
    </div>
  );
}

export default function App() {
  // En production, attendre que le sidecar Express soit prêt avant de rendre l'app
  const [backendReady, setBackendReady] = useState(import.meta.env.DEV);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      waitForBackend(30_000).finally(() => setBackendReady(true));
    }
  }, []);

  if (!backendReady) return <BackendLoader />;

  return (
    <>
      <UpdateNotification />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/module/1" replace />} />
          <Route path="module/1" element={<Module1_Ingestion />} />
          <Route path="module/2" element={<Module2_AFR />} />
          <Route path="module/3" element={<Module3_Tooling />} />
          <Route path="module/4" element={<Module4_FAO />} />
          <Route path="module/5" element={<Module5_PostProcessor />} />
          <Route path="module/6" element={<Module6_Estimator />} />
          <Route path="projects"      element={<ProjectsPage />} />
          <Route path="settings"      element={<SettingsPage />} />
          <Route path="app-settings"  element={<AppSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
