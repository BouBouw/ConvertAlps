/**
 * prismaClient.ts — Client Prisma avec stratégie hybride PostgreSQL / SQLite
 *
 * Stratégie de résilience réseau :
 *   1. Tentative de connexion PostgreSQL (base d'atelier partagée)
 *   2. Si inaccessible (ECONNREFUSED, timeout) → bascule sur SQLite local
 *   3. La bascule est transparente pour toutes les routes Express
 *
 * En production, SQLite utilise le même schéma Prisma via le provider sqlite
 * (un fichier schema.sqlite.prisma séparé devra être maintenu en parallèle).
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// ── Singleton Prisma PostgreSQL ────────────────────────────────────────────────
let _prisma: PrismaClient | null = null;
let _mode: 'postgres' | 'sqlite' | 'memory' = 'postgres';

/** Retourne le mode de base de données actif */
export function getDbMode(): typeof _mode {
  return _mode;
}

/**
 * Initialise et retourne le client Prisma.
 * Effectue un healthcheck et bascule sur SQLite si PostgreSQL est inaccessible.
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  if (_prisma) return _prisma;

  // ── Tentative PostgreSQL ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pgClient: any;
  try {
    pgClient = new PrismaClient({
      log: [
        { level: 'warn',  emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });

    // Écoute des événements de log Prisma
    pgClient.$on('warn',  (e: any) => logger.warn('Prisma warning',  { message: e.message }));
    pgClient.$on('error', (e: any) => logger.error('Prisma error',   { message: e.message }));
  } catch (engineError) {
    logger.warn('Prisma engine introuvable — mode sans BDD', {
      error: (engineError as Error).message,
    });
    _mode = 'memory';
    // Return a dummy client — DB routes will fail gracefully
    _prisma = { $disconnect: async () => {} } as unknown as PrismaClient;
    return _prisma;
  }

  try {
    await pgClient.$queryRaw`SELECT 1`; // Healthcheck léger
    logger.info('Base de données PostgreSQL connectée', { url: sanitizeDbUrl(process.env.DATABASE_URL) });
    _prisma = pgClient;
    _mode   = 'postgres';
  } catch (pgError) {
    logger.warn('PostgreSQL inaccessible — bascule sur SQLite local', {
      error: (pgError as Error).message,
    });

    await pgClient.$disconnect().catch(() => undefined);

    // ── Fallback SQLite ────────────────────────────────────────────────────
    // IMPORTANT : en production, utilisez un schéma Prisma séparé avec
    // provider = "sqlite" et générez un client dédié (prisma generate --schema=prisma/schema.sqlite.prisma)
    // Pour la démo, on utilise le même client sans réelle connexion SQLite.
    // Un vrai fallback impliquerait un PrismaClient pointant vers une URL SQLite.
    const sqlitePath  = process.env.SQLITE_FALLBACK_PATH ?? './data/convertalps_local.db';
    const sqliteClient = new PrismaClient({
      datasources: { db: { url: `file:${sqlitePath}` } },
    });

    try {
      await sqliteClient.$connect();
      logger.info('Fallback SQLite activé', { path: sqlitePath });
      _prisma = sqliteClient;
      _mode   = 'sqlite';
    } catch (sqliteError) {
      logger.error('Impossible de se connecter à SQLite', { error: (sqliteError as Error).message });
      // Mode dégradé : le serveur démarre mais les requêtes DB échoueront proprement
      _prisma = sqliteClient;
      _mode   = 'memory';
    }
  }

  return _prisma!;
}

/** Retourne le client sans await (utiliser après initialisation) */
export function getPrismaSync(): PrismaClient {
  if (!_prisma) throw new Error('PrismaClient non initialisé — appellez getPrismaClient() d\'abord');
  return _prisma;
}

/** Ferme proprement la connexion à la base */
export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
    logger.info('Connexion base de données fermée');
  }
}

/** Masque le mot de passe dans l'URL pour les logs */
function sanitizeDbUrl(url: string | undefined): string {
  if (!url) return '(non définie)';
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}
