/**
 * settings.routes.ts — TASK 5 : Paramètres machine configurables
 * Le frontend envoie la config machine ; le backend la stocke pour la simulation.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }      from 'zod';
import { ok }     from '../types/api.types';
import { logger } from '../utils/logger';

export const settingsRouter = Router();

// Stockage en mémoire (persisté côté frontend dans localStorage)
let _machineSettings: object = {
  name:        'DMG Mori DMU 50',
  controller:  'fanuc',
  limits:      { xMin: -300, xMax: 300, yMin: -250, yMax: 250, zMin: -150, zMax: 50 },
  fixtures:    [
    { id: 'fix-1', x: -5,  y: -5,  z: 5, radius: 15, label: 'Bride AV-G' },
    { id: 'fix-2', x: 125, y: -5,  z: 5, radius: 15, label: 'Bride AV-D' },
    { id: 'fix-3', x: -5,  y: 65,  z: 5, radius: 15, label: 'Bride AR-G' },
    { id: 'fix-4', x: 125, y: 65,  z: 5, radius: 15, label: 'Bride AR-D' },
  ],
  maxSpindle:  18000,
  maxFeedRate: 10000,
  toolOverhang: 80,
  coolant:     'flood',
};

// GET /api/settings/machine
settingsRouter.get('/machine', (_req: Request, res: Response) => {
  res.json(ok(_machineSettings));
});

// PUT /api/settings/machine — Synchroniser depuis le frontend
settingsRouter.put('/machine', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name:         z.string().min(1),
      controller:   z.string(),
      limits:       z.object({
        xMin: z.number(), xMax: z.number(),
        yMin: z.number(), yMax: z.number(),
        zMin: z.number(), zMax: z.number(),
      }),
      fixtures:     z.array(z.object({
        id: z.string(), x: z.number(), y: z.number(), z: z.number(),
        radius: z.number(), label: z.string(),
      })),
      maxSpindle:   z.number().min(0),
      maxFeedRate:  z.number().min(0),
      toolOverhang: z.number().min(0),
      coolant:      z.enum(['flood', 'mist', 'air', 'none']),
    }).parse(req.body);
    _machineSettings = body;
    logger.info('Paramètres machine mis à jour', { name: body.name });
    res.json(ok(_machineSettings));
  } catch (err) { next(err); }
});

/** Retourne la config machine courante (utilisée par les routes de simulation) */
export function getMachineSettings(): object {
  return _machineSettings;
}
