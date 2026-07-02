/**
 * logger.ts — Winston logger industriel
 * Logs structurés JSON avec rotation quotidienne.
 */
import { createLogger, format, transports } from 'winston';
import path from 'path';

const LOG_DIR  = process.env.LOG_DIR ?? './logs';
const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.json(),
  ),
  defaultMeta: { service: 'convertalps-backend' },
  transports: [
    // Console colorisée en développement
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...rest }) => {
          // Show extra metadata if there's anything beyond the 'service' key
          const { service: _service, ...meta } = rest as Record<string, unknown>;
          const extra = Object.keys(meta).length > 0
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `${timestamp as string} [${level}] ${message as string}${extra}`;
        }),
      ),
    }),
    // Fichier rotatif pour la production
    new transports.File({
      filename: path.join(LOG_DIR, 'convertalps.log'),
      maxsize:  10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    // Fichier dédié aux erreurs
    new transports.File({
      filename: path.join(LOG_DIR, 'convertalps-errors.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});
