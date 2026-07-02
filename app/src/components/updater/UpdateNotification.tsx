/**
 * UpdateNotification — Bandeau de mise à jour automatique (Tauri v2)
 * Vérifie silencieusement les nouvelles versions sur GitHub et propose
 * le téléchargement + installation sans quitter l'application.
 */
import { useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch }           from '@tauri-apps/plugin-process';
import { Download, X, RefreshCw, AlertCircle } from 'lucide-react';

type Phase = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export function UpdateNotification() {
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [update,   setUpdate]   = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errMsg,   setErrMsg]   = useState('');
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Vérification différée de 5 s pour ne pas bloquer le démarrage
    const t = setTimeout(async () => {
      try {
        const u = await check();
        if (u?.available) {
          setUpdate(u);
          setPhase('available');
        }
      } catch {
        // Silencieux — pas de réseau, repo privé, etc.
      }
    }, 5000);

    return () => clearTimeout(t);
  }, []);

  if (phase === 'idle') return null;

  const handleInstall = async () => {
    if (!update) return;
    setPhase('downloading');
    setProgress(0);

    let downloaded  = 0;
    let totalLength = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalLength > 0)
              setProgress(Math.round((downloaded / totalLength) * 100));
            break;
          case 'Finished':
            setProgress(100);
            setPhase('ready');
            break;
        }
      });
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const handleRelaunch = async () => {
    try { await relaunch(); } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed top-8 right-4 z-[9999] flex items-start gap-3 px-4 py-3
        bg-navy-800/95 border border-ice-600/30 rounded-xl shadow-2xl
        backdrop-blur-sm text-ice-100 text-sm
        animate-[ca-slide-up_0.25s_ease]"
    >
      {/* ── Mise à jour disponible ── */}
      {phase === 'available' && (
        <>
          <Download className="w-4 h-4 text-ice-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold">Mise à jour disponible</span>
            <span className="text-ice-500 text-[11px]">
              v{update?.currentVersion} → <strong className="text-ice-300">v{update?.version}</strong>
            </span>
          </div>
          <button
            onClick={handleInstall}
            className="ml-1 px-3 py-1.5 bg-ice-600 hover:bg-ice-500 rounded-lg
              text-xs font-semibold transition-colors shrink-0"
          >
            Installer
          </button>
          <button
            onClick={() => setPhase('idle')}
            className="text-ice-600 hover:text-ice-300 transition-colors shrink-0"
            aria-label="Ignorer"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      )}

      {/* ── Téléchargement en cours ── */}
      {phase === 'downloading' && (
        <>
          <Download className="w-4 h-4 text-ice-400 mt-0.5 shrink-0 animate-bounce" />
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <span className="font-semibold">Téléchargement…</span>
            <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden w-full">
              <div
                className="h-full bg-ice-400 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-ice-500 text-[11px]">{progress}%</span>
          </div>
        </>
      )}

      {/* ── Prêt à installer ── */}
      {phase === 'ready' && (
        <>
          <RefreshCw className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Prêt à installer</span>
            <span className="text-ice-500 text-[11px]">Redémarrage requis</span>
          </div>
          <button
            onClick={handleRelaunch}
            className="ml-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg
              text-xs font-semibold transition-colors shrink-0"
          >
            Redémarrer
          </button>
        </>
      )}

      {/* ── Erreur ── */}
      {phase === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold">Échec de la mise à jour</span>
            <span className="text-ice-500 text-[11px] truncate max-w-[200px]">{errMsg}</span>
          </div>
          <button
            onClick={() => setPhase('idle')}
            className="text-ice-600 hover:text-ice-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
