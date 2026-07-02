/**
 * estimator.routes.ts — Module 6 : Estimation du temps de cycle & ERP
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }        from 'zod';
import { ok }       from '../types/api.types';
import { EstimatorService } from '../services/estimator.service';
import { AuditLogService }  from '../middleware/auditLog.middleware';

export const estimatorRouter = Router();
const service = new EstimatorService();

// GET /api/estimator/cycle-time/:projectId
estimatorRouter.get('/cycle-time/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const estimate = await service.estimateCycleTime(req.params.projectId);
    res.json(ok(estimate));
  } catch (err) { next(err); }
});

// POST /api/estimator/quote
estimatorRouter.post('/quote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.body);
    const quote = await service.generateQuote(projectId) as Record<string, unknown>;

    await AuditLogService.log({
      action: 'QUOTE_GENERATED', entityType: 'Project', entityId: projectId,
      details: { totalCost: quote['totalCost'], currency: quote['currency'] },
      projectId,
    });

    res.json(ok(quote));
  } catch (err) { next(err); }
});

// POST /api/estimator/export
estimatorRouter.post('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      projectId: z.string(),
      format:    z.enum(['json', 'csv']),
    }).parse(req.body);

    const result = await service.exportToERP(body.projectId, body.format);

    await AuditLogService.log({
      action: 'ERP_EXPORTED', entityType: 'Project', entityId: body.projectId,
      details: { format: body.format, downloadUrl: result.downloadUrl },
      projectId: body.projectId,
    });

    res.json(ok(result));
  } catch (err) { next(err); }
});
