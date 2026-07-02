/**
 * tooling.routes.ts — Module 3 : Magasin d'outils ISO 13399 & CAPP
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }           from 'zod';
import { ok }          from '../types/api.types';
import { ToolingService } from '../services/tooling.service';

export const toolingRouter = Router();
const service = new ToolingService();

// GET /api/tooling/tools
toolingRouter.get('/tools', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(ok(await service.listTools())); }
  catch (err) { next(err); }
});

// GET /api/tooling/materials
toolingRouter.get('/materials', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(ok(await service.listMaterials())); }
  catch (err) { next(err); }
});

// GET /api/tooling/conditions/:toolId/:materialId
toolingRouter.get('/conditions/:toolId/:materialId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cond = await service.calculateConditions(req.params.toolId, req.params.materialId);
    res.json(ok(cond));
  } catch (err) { next(err); }
});

// POST /api/tooling/auto-select
toolingRouter.post('/auto-select', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      featureIds: z.array(z.string()).min(1),
      materialId: z.string().min(1),
    }).parse(req.body);
    const selections = await service.autoSelectTools(body.featureIds, body.materialId);
    res.json(ok(selections));
  } catch (err) { next(err); }
});
