/**
 * postprocessor.routes.ts — Module 5 : G-Code & Simulation cinématique
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }        from 'zod';
import { jobQueue } from '../queue/jobQueue';
import { ok }       from '../types/api.types';
import { PostProcessorService } from '../services/postprocessor.service';
import { AuditLogService }      from '../middleware/auditLog.middleware';

export const postProcessorRouter = Router();
const service = new PostProcessorService();

// POST /api/postprocessor/generate — Génération G-Code (synchrone)
postProcessorRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      projectId:        z.string(),
      operations:       z.array(z.any()),
      targetController: z.enum(['fanuc','heidenhain','siemens','haas','mazak','okuma']),
      userId:           z.string().optional(),
      machineName:      z.string().optional(),
    }).parse(req.body);

    // Fallback : si le frontend envoie operations vide, lire depuis toolpathStore
    if (body.operations.length === 0) {
      const { toolpathStore } = await import('../state/sharedStore');
      const stored = toolpathStore.get(body.projectId) ?? toolpathStore.get('current') ?? [];
      body.operations.push(...stored);
    }

    const result = await service.generateGCode(body) as Record<string, unknown>;

    // ── Audit Trail : log systématique de chaque génération G-Code ────────
    await AuditLogService.log({
      action:           'GCODE_GENERATED',
      entityType:       'GcodeOperation',
      entityId:         result['auditId'] as string,
      userId:           body.userId,
      details: {
        projectId:        body.projectId,
        targetController: body.targetController,
        lineCount:        result['lineCount'],
        estimatedTimeSec: result['estimatedTime'],
        toolChanges:      result['toolChanges'],
      },
      hadCollision:     result['hasCollisionWarning'] as boolean,
      hadOverstock:     result['hasOverstockWarning'] as boolean,
      machineName:      body.machineName,
      targetController: body.targetController,
      projectId:        body.projectId,
    });

    res.json(ok(result));
  } catch (err) { next(err); }
});

// POST /api/postprocessor/simulate → job async
postProcessorRouter.post('/simulate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.body);

    // Passer les trajectoires au worker (thread-safe via workerData)
    const { toolpathStore } = await import('../state/sharedStore');
    const { getMachineSettings } = await import('./settings.routes');
    const toolpaths = toolpathStore.get(projectId) ?? toolpathStore.get('current') ?? [];
    const machineSettings = getMachineSettings();

    const jobId = jobQueue.enqueue('collision_sim', { projectId, toolpaths, machineSettings });

    // Mettre en cache le résultat de simulation
    const unsub = jobQueue.subscribeProgress(jobId, (event) => {
      if (event.status === 'completed' && event.result) {
        PostProcessorService.cacheSimulationState(projectId, event.result as object);
        unsub();
      }
      if (event.status === 'failed') unsub();
    });

    res.json(ok({ jobId }));
  } catch (err) { next(err); }
});

// GET /api/postprocessor/simulation/:projectId
postProcessorRouter.get('/simulation/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await service.getSimulationState(req.params.projectId);
    res.json(ok(state));
  } catch (err) { next(err); }
});
