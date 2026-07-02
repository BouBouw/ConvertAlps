/**
 * ingestion.routes.ts — Module 1 : Analyse DXF/DWG → Reconstruction 3D
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }          from 'zod';
import { jobQueue }   from '../queue/jobQueue';
import { ok, fail }   from '../types/api.types';
import { IngestionService } from '../services/ingestion.service';
import { dxfStore, model3DStore, featureStore } from '../state/sharedStore';
import type { StoredFeature } from '../state/sharedStore';
import { generateAnnotatedDxf } from '../utils/dxfExporter';
import type { ExportEntity, AnnotatedFeature } from '../utils/dxfExporter';

export const ingestionRouter = Router();
const service = new IngestionService();

// POST /api/ingestion/parse-dxf
ingestionRouter.post('/parse-dxf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filePath } = z.object({ filePath: z.string().min(1) }).parse(req.body);
    const dxfFile      = await service.parseDxf(filePath);
    res.json(ok(dxfFile));
  } catch (err) { next(err); }
});

// POST /api/ingestion/reconstruct-3d → job asynchrone
ingestionRouter.post('/reconstruct-3d', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dxfId } = z.object({ dxfId: z.string().min(1) }).parse(req.body);

    // Récupérer les entités parsées — transmises au Worker (thread-safe via workerData)
    const dxf = dxfStore.get(dxfId);
    const jobId = jobQueue.enqueue('model_conversion', {
      dxfId,
      entities:    dxf?.entities    ?? [],
      boundingBox: dxf?.boundingBox ?? { minX: 0, minY: 0, maxX: 120, maxY: 60 },
      polylines:   dxf?.polylines   ?? [],
    });

    // Stocker le modèle 3D dès que le job se termine
    const unsub = jobQueue.subscribeProgress(jobId, (event) => {
      if (event.status === 'completed' && event.result) {
        const model = event.result as { id: string };
        model3DStore.set(model.id, event.result as object);
        model3DStore.set('current', event.result as object);
        unsub();
      }
      if (event.status === 'failed') unsub();
    });

    res.json(ok({ jobId }));
  } catch (err) { next(err); }
});

// GET /api/ingestion/model/:modelId
ingestionRouter.get('/model/:modelId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const model = await service.getModel3D(req.params.modelId);
    if (!model) { res.status(404).json(fail('Modèle introuvable')); return; }
    res.json(ok(model));
  } catch (err) { next(err); }
});

// GET /api/ingestion/export-annotated/:dxfId — TASK 11 : Export DXF annoté
ingestionRouter.get('/export-annotated/:dxfId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const dxf = dxfStore.get(req.params.dxfId) ?? dxfStore.get('current');
    if (!dxf) { res.status(404).json(fail('DXF introuvable')); return; }

    // Récupérer les features associées
    const stored = featureStore.get(`model:${req.params.dxfId}`)
                ?? featureStore.get('model:current')
                ?? Array.from(featureStore.values()).filter((v) => !Array.isArray(v));
    const features: AnnotatedFeature[] = (Array.isArray(stored) ? stored : [stored])
      .map((f) => f as StoredFeature);

    const entities = (dxf.entities ?? []) as ExportEntity[];
    const dxfContent = generateAnnotatedDxf(entities, features);

    const fileName = `${dxf.name.replace(/\.dxf$/i, '')}_AFR_annotated.dxf`;
    res.setHeader('Content-Type', 'application/dxf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(dxfContent);
  } catch (err) { next(err); }
});
