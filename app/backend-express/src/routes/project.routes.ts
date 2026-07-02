/**
 * project.routes.ts — TASK 3 : Routes de gestion des projets
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z }          from 'zod';
import { ok, fail }   from '../types/api.types';
import { ProjectService } from '../services/project.service';

export const projectRouter = Router();
const service = new ProjectService();

// GET /api/projects — Lister tous les projets
projectRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await service.listProjects();
    res.json(ok(projects));
  } catch (err) { next(err); }
});

// GET /api/projects/:id — Récupérer un projet
projectRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await service.getProject(req.params.id);
    if (!project) { res.status(404).json(fail('Projet introuvable')); return; }
    res.json(ok(project));
  } catch (err) { next(err); }
});

// POST /api/projects — Sauvegarder le projet courant
projectRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name:        z.string().min(1).max(100),
      description: z.string().max(500).optional().default(''),
    }).parse(req.body);
    const meta = await service.saveProject(body.name, body.description);
    res.status(201).json(ok(meta));
  } catch (err) { next(err); }
});

// POST /api/projects/:id/load — Charger un projet en mémoire
projectRouter.post('/:id/load', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const snapshot = await service.loadProject(req.params.id);
    res.json(ok(snapshot));
  } catch (err) { next(err); }
});

// PATCH /api/projects/:id — Renommer / modifier
projectRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({
      name:        z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
    }).parse(req.body);
    const meta = await service.updateProject(req.params.id, body);
    res.json(ok(meta));
  } catch (err) { next(err); }
});

// DELETE /api/projects/:id
projectRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.deleteProject(req.params.id);
    res.json(ok({ deleted: req.params.id }));
  } catch (err) { next(err); }
});
