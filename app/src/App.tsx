/**
 * App.tsx — Routeur principal de ConvertAlps
 */
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

export default function App() {
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
