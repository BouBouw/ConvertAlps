/**
 * ProjectsPage.tsx — TASK 3 : Gestion des projets (Blue Ice Premium)
 */
import { useState, useEffect } from 'react';
import { Save, FolderOpen, Trash2, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { projectApi } from '../api/backendApi';
import type { ProjectMeta } from '../api/backendApi';
import { useAppStore } from '../store/useAppStore';

export default function ProjectsPage() {
  const [projects, setProjects]   = useState<ProjectMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [loadedId,  setLoadedId]  = useState<string | null>(null);
  const { dxfFile } = useAppStore((s) => ({ dxfFile: s.dxfFile }));

  async function loadList() {
    setIsLoading(true); setError(null);
    try { setProjects(await projectApi.list()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { loadList(); }, []);

  async function handleSave() {
    if (!newName.trim()) return;
    setIsSaving(true); setError(null);
    try { await projectApi.save(newName.trim()); setNewName(''); await loadList(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIsSaving(false); }
  }

  async function handleLoad(id: string) {
    setError(null);
    try { await projectApi.load(id); setLoadedId(id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce projet définitivement ?')) return;
    try { await projectApi.delete(id); await loadList(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><FolderOpen size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Projets sauvegardés</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Persistence locale · JSON</p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={loadList} disabled={isLoading} className="btn-secondary">
          <RefreshCw size={12} className={clsx(isLoading && 'animate-spin')} />
          Actualiser <kbd>⌃P</kbd>
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Sauvegarder */}
      <div className="flex items-center gap-3 px-5 py-3 bg-navy-850/60 border-b border-navy-400/15 shrink-0">
        <input
          type="text"
          placeholder={dxfFile ? `Nom — ex. "${dxfFile.name.replace(/\.\w+$/, '')}"` : 'Nom du projet…'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="input flex-1"
        />
        <button onClick={handleSave} disabled={!newName.trim() || isSaving} className="btn-primary">
          <Save size={13} />
          {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-5">
        {projects.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <FolderOpen size={36} className="text-ice-800/20" />
            <p className="text-ice-800/50 text-sm">Aucun projet sauvegardé</p>
          </div>
        )}
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150',
                loadedId === p.id
                  ? 'bg-ice-500/8 border-ice-500/20'
                  : 'bg-navy-700/50 border-navy-400/20 hover:border-navy-300/40',
              )}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ice-100 truncate">{p.name}</p>
                <p className="text-[10px] text-ice-800/60 flex items-center gap-1 mt-0.5">
                  <Clock size={9} />
                  {new Date(p.updatedAt).toLocaleString('fr-FR')}
                </p>
              </div>
              <button onClick={() => handleLoad(p.id)} className="btn-secondary btn-sm">
                <FolderOpen size={11} />Charger
              </button>
              <button onClick={() => handleDelete(p.id)}
                className="p-1 rounded text-ice-800/50 hover:text-red-400 hover:bg-red-950/30 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
