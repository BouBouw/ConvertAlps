/**
 * fao.routes.ts — Module 4 : Calcul de trajectoires FAO
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }        from 'zod';
import { jobQueue } from '../queue/jobQueue';
import { ok }       from '../types/api.types';
import { FaoService } from '../services/fao.service';
import { featureStore, toolpathStore } from '../state/sharedStore';
import type { StoredFeature } from '../state/sharedStore';

export const faoRouter = Router();
const service = new FaoService();

// POST /api/fao/calculate → job async (calcul trochoïdal/adaptatif)
faoRouter.post('/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      featureIds: z.array(z.string()).min(1),
      materialId: z.string(),
      strategy:   z.enum(['trochoidal', 'adaptive', 'standard']).optional(),
    }).parse(req.body);

    // Résoudre les géométries depuis featureStore (main thread → workerData)
    const features: StoredFeature[] = body.featureIds
      .map(id => featureStore.get(id))
      .filter((f): f is StoredFeature => f !== undefined && !Array.isArray(f));

    const payload = features.length > 0 ? features : DEMO_FEATURES;

    const jobId = jobQueue.enqueue('trajectory_calc', {
      features:   payload,
      materialId: body.materialId,
      strategy:   body.strategy ?? 'trochoidal',
    });

    // Stocker les trajectoires dès complétion
    const unsub = jobQueue.subscribeProgress(jobId, (event) => {
      if (event.status === 'completed' && event.result) {
        const ops = event.result as object[];
        toolpathStore.set('current', ops);
        FaoService.cacheToolpaths('current', ops);
        unsub();
      }
      if (event.status === 'failed') unsub();
    });

    res.json(ok({ jobId }));
  } catch (err) { next(err); }
});

// GET /api/fao/toolpaths/:projectId
faoRouter.get('/toolpaths/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const toolpaths = await service.getToolpaths(req.params.projectId);
    res.json(ok(toolpaths));
  } catch (err) { next(err); }
});

// ── Features démo si featureStore vide ──────────────────────────────────────
const DEMO_FEATURES: StoredFeature[] = [
  { id: 'demo-face',    type: 'face',    depth: 0.5, width: 120, length: 60, centerX: 60,  centerY: 30,  surfaceRoughness: 3.2, requiresFinishing: false, coordinates: { x:60,  y:30,  z:0 }, processingOrder: 1 },
  { id: 'demo-pocket',  type: 'pocket',  depth: 15,  width: 40,  length: 20, centerX: 60,  centerY: 30,  surfaceRoughness: 1.6, requiresFinishing: true,  coordinates: { x:60,  y:30,  z:0 }, processingOrder: 2 },
  { id: 'demo-hole-1',  type: 'hole',    depth: 25,  diameter: 10, centerX: 15,  centerY: 30, surfaceRoughness: 1.6, requiresFinishing: true,  coordinates: { x:15,  y:30,  z:0 }, processingOrder: 5 },
  { id: 'demo-hole-2',  type: 'hole',    depth: 25,  diameter: 10, centerX: 45,  centerY: 30, surfaceRoughness: 1.6, requiresFinishing: true,  coordinates: { x:45,  y:30,  z:0 }, processingOrder: 5 },
  { id: 'demo-hole-3',  type: 'hole',    depth: 25,  diameter: 10, centerX: 75,  centerY: 30, surfaceRoughness: 1.6, requiresFinishing: true,  coordinates: { x:75,  y:30,  z:0 }, processingOrder: 5 },
  { id: 'demo-hole-4',  type: 'hole',    depth: 25,  diameter: 10, centerX: 105, centerY: 30, surfaceRoughness: 1.6, requiresFinishing: true,  coordinates: { x:105, y:30,  z:0 }, processingOrder: 5 },
  { id: 'demo-contour', type: 'contour', depth: 40,  width: 120, length: 60, centerX: 60,  centerY: 30,  surfaceRoughness: 3.2, requiresFinishing: false, coordinates: { x:60,  y:30,  z:0 }, processingOrder: 4 },
];
