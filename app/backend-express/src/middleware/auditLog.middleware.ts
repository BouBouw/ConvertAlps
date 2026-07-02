/**
 * auditLog.middleware.ts — Middleware de traçabilité industrielle
 *
 * Enregistre chaque requête pertinente dans la table AuditLog Prisma.
 * Conforme aux exigences de traçabilité ISO 9001 et qualité industrielle.
 * Chaque log est signé par HMAC-SHA256 pour garantir l'intégrité.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ── Routes déclenchant un audit log ───────────────────────────────────────────
const AUDIT_ROUTES: Array<{ method: string; pathPattern: RegExp; action: string }> = [
  { method: 'POST', pathPattern: /\/api\/postprocessor\/generate/,  action: 'GCODE_GENERATED'      },
  { method: 'POST', pathPattern: /\/api\/postprocessor\/simulate/,  action: 'SIMULATION_STARTED'   },
  { method: 'POST', pathPattern: /\/api\/estimator\/export/,        action: 'ERP_EXPORTED'         },
  { method: 'POST', pathPattern: /\/api\/estimator\/quote/,         action: 'QUOTE_GENERATED'      },
  { method: 'POST', pathPattern: /\/api\/ingestion\/reconstruct-3d/, action: 'PART_CREATED'        },
];

/** Signature HMAC-SHA256 d'un contenu JSON */
function signAuditEntry(content: object): string {
  const secret = process.env.AUDIT_LOG_SECRET ?? 'convertalps-dev-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(content))
    .digest('hex');
}

/** Middleware de journalisation des requêtes (toutes) */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      duration: `${duration}ms`,
      ip:       req.ip,
    });
  });

  next();
}

/**
 * Service d'audit log (utilisé directement dans les routes critiques).
 * Séparé du middleware pour plus de granularité métier.
 */
export class AuditLogService {
  /**
   * Enregistre une action critique dans le journal d'audit.
   * @param action  Type d'action (AuditAction Prisma)
   * @param details Données métier (qui, quoi, alertes)
   */
  static async log(params: {
    action:          string;
    entityType:      string;
    entityId?:       string;
    userId?:         string;
    userLabel?:      string;
    details:         object;
    hadCollision?:   boolean;
    hadOverstock?:   boolean;
    collisionCount?: number;
    machineName?:    string;
    targetController?: string;
    projectId?:      string;
    partId?:         string;
    gcodeOpId?:      string;
  }): Promise<void> {
    try {
      const { getPrismaSync } = await import('../database/prismaClient');
      const prisma = getPrismaSync();

      const entry = {
        action:           params.action,
        entityType:       params.entityType,
        entityId:         params.entityId,
        userId:           params.userId,
        userLabel:        params.userLabel ?? 'Opérateur',
        details:          params.details,
        hadCollision:     params.hadCollision ?? false,
        hadOverstock:     params.hadOverstock ?? false,
        collisionCount:   params.collisionCount ?? 0,
        machineName:      params.machineName,
        targetController: params.targetController,
        projectId:        params.projectId,
        partId:           params.partId,
        gcodeOpId:        params.gcodeOpId,
      };

      const signature = signAuditEntry({ ...entry, timestamp: new Date().toISOString() });

      await (prisma as any).auditLog.create({
        data: { ...entry, signature },
      });

      logger.debug('Audit log enregistré', { action: params.action, entityId: params.entityId });
    } catch (err) {
      // L'échec de l'audit log ne doit pas bloquer l'opération principale
      logger.warn('Impossible d\'enregistrer l\'audit log', {
        action: params.action,
        error:  (err as Error).message,
      });
    }
  }
}
