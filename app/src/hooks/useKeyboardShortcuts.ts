/**
 * useKeyboardShortcuts — Raccourcis clavier globaux ConvertAlps
 *
 * Raccourcis :
 *   1–6        → Naviguer vers le module correspondant
 *   Ctrl+O     → Ouvrir un fichier DXF (Module 1)
 *   Ctrl+S     → Sauvegarder le projet
 *   Ctrl+P     → Page Projets
 *   Ctrl+,     → Page Paramètres
 *   Esc        → Fermer panels / annuler
 *   ?          → Afficher l'aide des raccourcis
 */
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutOptions {
  /** Callback déclenché par Ctrl+O (ouvrir fichier) */
  onOpenFile?: () => void;
  /** Callback déclenché par Ctrl+S (sauvegarder projet) */
  onSave?: () => void;
  /** Callback déclenché par Esc */
  onEscape?: () => void;
}

export function useKeyboardShortcuts(opts: ShortcutOptions = {}) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignorer si focus dans un input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // ── Navigation modules (1–6) ──────────────────────────────────────────
      if (!ctrl && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          navigate(`/module/${num}`);
          return;
        }
      }

      // ── Ctrl+O — Ouvrir fichier ───────────────────────────────────────────
      if (ctrl && e.key === 'o') {
        e.preventDefault();
        opts.onOpenFile?.();
        navigate('/module/1');
        return;
      }

      // ── Ctrl+S — Sauvegarder ─────────────────────────────────────────────
      if (ctrl && e.key === 's') {
        e.preventDefault();
        opts.onSave?.();
        return;
      }

      // ── Ctrl+P — Projets ─────────────────────────────────────────────────
      if (ctrl && e.key === 'p') {
        e.preventDefault();
        navigate('/projects');
        return;
      }

      // ── Ctrl+, — Paramètres ───────────────────────────────────────────────
      if (ctrl && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }

      // ── Esc ───────────────────────────────────────────────────────────────
      if (e.key === 'Escape') {
        opts.onEscape?.();
        return;
      }
    },
    [navigate, opts],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Liste des raccourcis pour l'affichage d'aide */
export const SHORTCUTS = [
  { keys: ['1', '—', '6'], description: 'Naviguer vers le module' },
  { keys: ['Ctrl', 'O'],   description: 'Ouvrir un fichier DXF/DWG' },
  { keys: ['Ctrl', 'S'],   description: 'Sauvegarder le projet' },
  { keys: ['Ctrl', 'P'],   description: 'Gestion des projets' },
  { keys: ['Ctrl', ','],   description: 'Paramètres machine' },
  { keys: ['Esc'],         description: 'Fermer / annuler' },
] as const;
