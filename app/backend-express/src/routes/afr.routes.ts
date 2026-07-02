/**
 * afr.routes.ts — Module 2 : Reconnaissance Automatique des Formes
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }        from 'zod';
import { jobQueue } from '../queue/jobQueue';
import { ok, fail } from '../types/api.types';
import { AfrService } from '../services/afr.service';
import { dxfStore, featureStore } from '../state/sharedStore';
import type { StoredFeature } from '../state/sharedStore';

export const afrRouter = Router();
const service = new AfrService();

// Entités démo si aucun DXF n'a été parsé
const DEMO_ENTITIES = [
  { type: 'LWPOLYLINE', layer: '0',      vertices: [{ x:0,y:0 },{ x:120,y:0 },{ x:120,y:60 },{ x:0,y:60 }], closed: true },
  { type: 'CIRCLE',     layer: 'HOLES',  x: 15,  y: 30, r: 5 },
  { type: 'CIRCLE',     layer: 'HOLES',  x: 45,  y: 30, r: 5 },
  { type: 'CIRCLE',     layer: 'HOLES',  x: 75,  y: 30, r: 5 },
  { type: 'CIRCLE',     layer: 'HOLES',  x: 105, y: 30, r: 5 },
  { type: 'LWPOLYLINE', layer: 'POCKET', vertices: [{ x:40,y:20 },{ x:80,y:20 },{ x:80,y:40 },{ x:40,y:40 }], closed: true },
];

// POST /api/afr/recognize → job async
afrRouter.post('/recognize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model3DId } = z.object({ model3DId: z.string().min(1) }).parse(req.body);

    // Récupérer les entités DXF associées au modèle
    const dxfId  = model3DId.replace(/-3d$/, '');
    const dxf    = dxfStore.get(dxfId) ?? dxfStore.get(model3DId);
    const entities = dxf?.entities ?? DEMO_ENTITIES;

    const jobId = jobQueue.enqueue('afr_recognition', { model3DId, entities });

    // Stocker les features dans featureStore dès complétion
    const unsub = jobQueue.subscribeProgress(jobId, (event) => {
      if (event.status === 'completed' && event.result) {
        const features = event.result as StoredFeature[];
        features.forEach(f => featureStore.set(f.id, f));
        featureStore.set(`model:${model3DId}`, features);
        unsub();
      }
      if (event.status === 'failed') unsub();
    });

    res.json(ok({ jobId }));
  } catch (err) { next(err); }
});

// GET /api/afr/features/:model3DId
afrRouter.get('/features/:model3DId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const features = await service.getFeatures(req.params.model3DId);
    res.json(ok(features));
  } catch (err) { next(err); }
});
