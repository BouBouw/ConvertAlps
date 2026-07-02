/**
 * api.types.ts — Types partagés côté backend Express
 */

// ── Job Queue ──────────────────────────────────────────────────────────────────

export type JobType =
  | 'model_conversion'
  | 'afr_recognition'
  | 'trajectory_calc'
  | 'collision_sim'
  | 'gcode_gen';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobQueueEntry {
  id:           string;
  type:         JobType;
  status:       JobStatus;
  progress:     number;
  payload:      unknown;
  result?:      unknown;
  error?:       string;
  createdAt:    Date;
  startedAt?:   Date;
  completedAt?: Date;
}

export interface JobProgressEvent {
  id:       string;
  status:   JobStatus;
  progress: number;
  result?:  unknown;
  error?:   string;
}

// ── Réponse API standard ───────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data:    T;
  message?: string;
}

export interface ApiError {
  success: false;
  error:   string;
  code?:   string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Helpers ────────────────────────────────────────────────────────────────────

export function ok<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, ...(message ? { message } : {}) };
}

export function fail(error: string, code?: string): ApiError {
  return { success: false, error, ...(code ? { code } : {}) };
}
