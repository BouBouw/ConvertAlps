/**
 * useJobStore — File d'attente des calculs asynchrones
 * Affiche en temps réel les jobs de trajectoire, simulation et G-Code.
 * TASK 6 — Notification Tauri native à la complétion des jobs longs.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Job, JobStatus } from '../types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Envoie une notification système si Tauri est disponible */
async function sendTauriNotification(title: string, body: string) {
  if (!isTauri) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    if (granted) sendNotification({ title, body });
  } catch {
    // Notifications non disponibles (dev browser)
  }
}

interface JobState {
  jobs: Job[];

  // ── Actions ──────────────────────────────────────────────────────────────
  addJob: (job: Job) => void;
  updateJob: (id: string, update: Partial<Job>) => void;
  updateJobProgress: (id: string, progress: number) => void;
  setJobStatus: (id: string, status: JobStatus, error?: string) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  /** Nombre de jobs en statut pending ou running */
  activeJobCount: () => number;
}

export const useJobStore = create<JobState>()(
  devtools(
    (set, get) => ({
      jobs: [],

      addJob: (job) =>
        set((state) => ({ jobs: [...state.jobs, job] }), false, 'addJob'),

      updateJob: (id, update) => {
        // TASK 6 — Notification Tauri à la complétion d'un job long
        if (update.status === 'completed' || update.status === 'failed') {
          const job = get().jobs.find((j) => j.id === id);
          if (job) {
            const duration = job.startedAt
              ? Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000)
              : 0;
            // Notifier seulement si le job a duré plus de 5 secondes (calcul significatif)
            if (duration > 5) {
              if (update.status === 'completed') {
                sendTauriNotification('ConvertAlps — Calcul terminé', `✓ ${job.label} (${duration}s)`);
              } else {
                sendTauriNotification('ConvertAlps — Erreur de calcul', `✗ ${job.label} : ${update.error ?? 'Échec'}`);
              }
            }
          }
        }
        set(
          (state) => ({
            jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...update } : j)),
          }),
          false,
          'updateJob',
        );
      },

      updateJobProgress: (id, progress) =>
        set(
          (state) => ({
            jobs: state.jobs.map((j) => (j.id === id ? { ...j, progress } : j)),
          }),
          false,
          'updateJobProgress',
        ),

      setJobStatus: (id, status, error) =>
        set(
          (state) => ({
            jobs: state.jobs.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status,
                    error,
                    startedAt:
                      status === 'running' && !j.startedAt ? new Date() : j.startedAt,
                    completedAt: ['completed', 'failed', 'cancelled'].includes(status)
                      ? new Date()
                      : j.completedAt,
                  }
                : j,
            ),
          }),
          false,
          'setJobStatus',
        ),
      removeJob: (id) =>
        set(
          (state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }),
          false,
          'removeJob',
        ),

      clearCompleted: () =>
        set(
          (state) => ({
            jobs: state.jobs.filter(
              (j) => !['completed', 'failed', 'cancelled'].includes(j.status),
            ),
          }),
          false,
          'clearCompleted',
        ),

      activeJobCount: () =>
        get().jobs.filter((j) => ['pending', 'running'].includes(j.status)).length,
    }),
    { name: 'ConvertAlps-JobStore' },
  ),
);
