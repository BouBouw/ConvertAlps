/**
 * afr.service.ts — Reconnaissance Automatique des Formes (AFR)
 *
 * Récupère les features d'usinage calculées par l'afrWorker (analyse géométrique réelle).
 * Les features sont stockées dans featureStore par la route lors de la complétion du job.
 */
import { logger }       from '../utils/logger';
import { featureStore } from '../state/sharedStore';

export class AfrService {

  /** Retourne les features d'usinage pour un modèle 3D donné */
  async getFeatures(model3DId: string): Promise<object[]> {
    logger.debug('getFeatures', { model3DId });

    // Chercher par clé 'model:{id}' (stocké lors de la complétion du job AFR)
    const byModel = featureStore.get(`model:${model3DId}`);
    if (Array.isArray(byModel) && byModel.length > 0) {
      return byModel;
    }

    // Retourner toutes les features individuelles si disponibles
    const allFeatures = [...featureStore.values()].filter(
      (v): v is import('../state/sharedStore').StoredFeature =>
        !Array.isArray(v) && typeof v === 'object' && v !== null
    );
    if (allFeatures.length > 0) return allFeatures;

    // Mode démo : aucune analyse disponible encore
    logger.warn('AFR : aucune feature en cache, retour démo (lancez le job afr_recognition)');
    return [];
  }
}
