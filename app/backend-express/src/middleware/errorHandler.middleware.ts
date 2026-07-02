/**
 * errorHandler.middleware.ts — Gestionnaire d'erreurs global Express
 *
 * Garantit que :
 *   1. Les crashs du moteur géométrique C++ (erreurs natives) ne font pas
 *      planter le serveur Express (isolation des pannes).
 *   2. Toutes les erreurs renvoient un format ApiError cohérent.
 *   3. Les erreurs de validation Zod sont formatées lisiblement.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { fail } from '../types/api.types';

/** Classe d'erreur applicative avec code HTTP */
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Middleware de gestion des routes inconnues (404) */
export function notFoundMiddleware(req: Request, res: Response): void {
  res.status(404).json(fail(`Route introuvable : ${req.method} ${req.path}`, 'NOT_FOUND'));
}

/**
 * Middleware d'erreur global.
 * IMPORTANT : doit être enregistré en dernier dans Express (après toutes les routes).
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── Erreurs de validation Zod ────────────────────────────────────────────
  if (err instanceof ZodError) {
    const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    logger.warn('Erreur de validation', { path: req.path, errors: messages });
    res.status(400).json(fail(`Données invalides : ${messages}`, 'VALIDATION_ERROR'));
    return;
  }

  // ── Erreurs applicatives connues ─────────────────────────────────────────
  if (err instanceof AppError) {
    logger.warn('Erreur applicative', { code: err.code, message: err.message, path: req.path });
    res.status(err.statusCode).json(fail(err.message, err.code));
    return;
  }

  // ── Erreurs Node.js natives (ex: ENOENT, EACCES) ──────────────────────
  if (err instanceof Error && (err as NodeJS.ErrnoException).code) {
    const code  = (err as NodeJS.ErrnoException).code ?? 'SYSTEM_ERROR';
    logger.error('Erreur système', { code, message: err.message, path: req.path });
    res.status(503).json(fail(`Erreur système : ${err.message}`, code));
    return;
  }

  // ── Erreurs inattendues ───────────────────────────────────────────────────
  const message = err instanceof Error ? err.message : 'Erreur interne inconnue';
  const stack   = err instanceof Error ? err.stack : undefined;

  logger.error('Erreur non gérée', {
    message,
    stack,
    path:   req.path,
    method: req.method,
  });

  // Ne pas exposer le stack en production
  res.status(500).json(
    fail(
      process.env.NODE_ENV === 'production'
        ? 'Une erreur interne est survenue. Consultez les logs serveur.'
        : message,
      'INTERNAL_ERROR',
    ),
  );
}
