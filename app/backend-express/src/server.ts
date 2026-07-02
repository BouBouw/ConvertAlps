/**
 * server.ts — Point d'entrée du sidecar Express ConvertAlps
 *
 * Responsabilités :
 *   - Démarrage du serveur HTTP sur 127.0.0.1:3737 (loopback uniquement)
 *   - Enregistrement de tous les middlewares et routes
 *   - Gestion de l'arrêt propre (graceful shutdown) sur SIGTERM/SIGINT
 *   - Gestion des erreurs non capturées (isolation des crashs)
 */
import express          from 'express';
import cors             from 'cors';
import helmet           from 'helmet';
import { createServer } from 'http';

import fs                      from 'fs';
import { jobQueueRouter }      from './routes/jobQueue.routes';
import { ingestionRouter }     from './routes/ingestion.routes';
import { afrRouter }           from './routes/afr.routes';
import { toolingRouter }       from './routes/tooling.routes';
import { faoRouter }           from './routes/fao.routes';
import { postProcessorRouter } from './routes/postprocessor.routes';
import { estimatorRouter }     from './routes/estimator.routes';
import { projectRouter }       from './routes/project.routes';
import { settingsRouter }      from './routes/settings.routes';

import { requestLoggerMiddleware }              from './middleware/auditLog.middleware';
import { errorHandlerMiddleware, notFoundMiddleware } from './middleware/errorHandler.middleware';
import { logger }          from './utils/logger';
import { jobQueue }        from './queue/jobQueue';
import { getPrismaClient, disconnectPrisma } from './database/prismaClient';
import rateLimit           from 'express-rate-limit';

// ── Configuration ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.CONVERTALPS_PORT ?? '3737', 10);
const HOST = '127.0.0.1'; // Loopback uniquement — ne pas exposer sur le réseau

// ── Application Express ────────────────────────────────────────────────────────
const app    = express();
const server = createServer(app);

// ── Middlewares de sécurité ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Géré par Tauri
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  // Accepte toutes les origines localhost / Tauri WebView (loopback uniquement)
  origin: (origin, callback) => {
    if (!origin || /localhost|127\.0\.0\.1|tauri\.localhost/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origine non autorisée'));
    }
  },
  credentials: false,
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLoggerMiddleware);

// ── TASK 12 — Rate limiting (OWASP A05) ───────────────────────────────────────
// Limites générales : 200 req/min par IP (loopback uniquement, Tauri)
const generalLimiter = rateLimit({
  windowMs:        60_000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, error: 'Trop de requêtes — réessayez dans 1 minute' },
});

// Calculs lourds : max 20 lancements par minute (protection anti-boucle infinie)
const computeLimiter = rateLimit({
  windowMs: 60_000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:  { success: false, error: 'Trop de calculs — attendez avant de relancer' },
});

app.use(generalLimiter);

// ── Dossier exports ────────────────────────────────────────────────────────────
const EXPORTS_DIR = './exports';
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
app.use('/exports', express.static(EXPORTS_DIR));

// ── Routes API ──────────────────────────────────────────────────────────────────
app.use('/api/jobs',            jobQueueRouter);
app.use('/api/projects',        projectRouter);
app.use('/api/settings',        settingsRouter);
app.use('/api/ingestion',       ingestionRouter);
app.use('/api/afr',             afrRouter);
app.use('/api/tooling',         toolingRouter);
app.use('/api/fao',             computeLimiter, faoRouter);
app.use('/api/postprocessor',   computeLimiter, postProcessorRouter);
app.use('/api/estimator',       estimatorRouter);

// ── Endpoint de santé ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   '0.1.0',
    uptime:    process.uptime(),
    activeJobs: jobQueue.getActiveCount(),
    timestamp:  new Date().toISOString(),
  });
});

// ── Gestion 404 & erreurs globales ─────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

// ── Démarrage ──────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  // Initialise Prisma — non bloquant : le serveur démarre même si la BDD est indisponible
  try {
    await getPrismaClient();
  } catch (dbErr) {
    logger.warn('BDD non disponible au démarrage — le serveur continue sans BDD', {
      error: (dbErr as Error).message,
    });
  }

  server.listen(PORT, HOST, () => {
    logger.info(`ConvertAlps Backend démarré`, { host: HOST, port: PORT, env: process.env.NODE_ENV });
  });
}

// ── Arrêt propre (graceful shutdown pour le sidecar Tauri) ────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`Signal ${signal} reçu — arrêt en cours…`);

  // 1. Arrêter la file de calcul (attendre les jobs actifs)
  await jobQueue.shutdown();

  // 2. Fermer le serveur HTTP
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  // 3. Fermer la connexion Prisma
  await disconnectPrisma();

  logger.info('Arrêt propre terminé.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Isolation des crashs non capturés ─────────────────────────────────────────
// Ces handlers empêchent le crash complet du sidecar sur une erreur isolée.
process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée — le serveur reste actif', {
    message: err.message, stack: err.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Rejet de promesse non géré — le serveur reste actif', {
    reason: String(reason),
  });
});

start().catch((err) => {
  logger.error('Erreur fatale au démarrage', { error: (err as Error).message });
  process.exit(1);
});

export { app, server };
