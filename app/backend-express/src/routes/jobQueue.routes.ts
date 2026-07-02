/**
 * jobQueue.routes.ts — Endpoints SSE et REST pour le suivi des jobs
 */
import { Router, Request, Response } from 'express';
import { z }                         from 'zod';
import { jobQueue }                  from '../queue/jobQueue';
import { ok, fail }                  from '../types/api.types';

export const jobQueueRouter = Router();

// GET /api/jobs/:jobId — Statut d'un job
jobQueueRouter.get('/:jobId', (req: Request, res: Response) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) { res.status(404).json(fail('Job introuvable')); return; }
  res.json(ok(job));
});

// GET /api/jobs/:jobId/progress — Server-Sent Events (SSE)
// Le frontend React s'abonne via EventSource pour recevoir les mises à jour en temps réel
jobQueueRouter.get('/:jobId/progress', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobQueue.getJob(jobId);
  if (!job) { res.status(404).json(fail('Job introuvable')); return; }

  // En-têtes SSE
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // Désactive le buffering Nginx
  });

  // Envoyer l'état initial
  res.write(`data: ${JSON.stringify(job)}\n\n`);

  // Heartbeat toutes les 20 s pour éviter les timeouts proxy/Nginx
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);

  // Envoyer les mises à jour en temps réel
  const unsubscribe = jobQueue.subscribeProgress(jobId, (event) => {
    const jobState = jobQueue.getJob(jobId);
    if (jobState) res.write(`data: ${JSON.stringify(jobState)}\n\n`);
    if (['completed', 'failed', 'cancelled'].includes(event.status)) {
      clearInterval(heartbeat);
      res.end();
      unsubscribe();
    }
  });

  // Nettoyage si le client se déconnecte
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); res.end(); });
});
