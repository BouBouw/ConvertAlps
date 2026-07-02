/**
 * fao.service.ts — Récupération des trajectoires calculées
 */
import { logger } from '../utils/logger';

// Cache en mémoire pour les trajectoires calculées par le Worker Thread
const toolpathCache = new Map<string, object[]>();

export class FaoService {
  async getToolpaths(projectId: string): Promise<object[]> {
    logger.debug('getToolpaths', { projectId });
    // 1. Cache local (alimenté par FaoService.cacheToolpaths)
    const cached = toolpathCache.get(projectId) ?? toolpathCache.get('current');
    if (cached && cached.length > 0) return cached;
    // 2. toolpathStore (alimenté par fao.routes.ts via completion listener)
    const { toolpathStore } = await import('../state/sharedStore');
    return toolpathStore.get(projectId) ?? toolpathStore.get('current') ?? [];
  }

  /** Appelé par le Worker Thread pour persister les résultats */
  static cacheToolpaths(projectId: string, toolpaths: object[]): void {
    toolpathCache.set(projectId, toolpaths);
    toolpathCache.set('current', toolpaths); // alias
  }
}
