/**
 * tooling.service.ts — Magasin d'outils ISO 13399 & calcul des conditions de coupe
 * En production : requêtes Prisma vers la table Tool, Material, CuttingCondition.
 */
import { logger } from '../utils/logger';
import { featureStore } from '../state/sharedStore';
import type { StoredFeature } from '../state/sharedStore';

export class ToolingService {

  async listTools(): Promise<object[]> {
    logger.debug('listTools');
    return [...DEMO_TOOLS];
  }

  async listMaterials(): Promise<object[]> {
    logger.debug('listMaterials');
    return [...DEMO_MATERIALS];
  }

  async calculateConditions(toolId: string, materialId: string): Promise<object> {
    logger.debug('calculateConditions', { toolId, materialId });
    const tool     = DEMO_TOOLS.find((t) => t.id === toolId) ?? DEMO_TOOLS[0];
    const material = DEMO_MATERIALS.find((m) => m.id === materialId) ?? DEMO_MATERIALS[0];

    // Formule ISO : N = (Vc × 1000) / (π × D)
    const D  = tool.diameter;
    const Vc = material.machinabilityIndex > 60 ? 200 : material.machinabilityIndex > 40 ? 130 : 80;
    const N  = Math.round((Vc * 1000) / (Math.PI * D));
    const z  = tool.numberOfFlutes;
    const fz = D <= 10 ? 0.06 : D <= 16 ? 0.10 : 0.12;
    const Vf = Math.round(N * z * fz);
    const ap = tool.type === 'face_mill' ? 0.5 : D * 0.25;
    const ae = tool.type === 'face_mill' ? D * 0.75 : D * 0.40;

    return { toolId, materialId, toolCode: tool.iso13399Code, Vc, N, Vf, fz, ap: +ap.toFixed(2), ae: +ae.toFixed(2) };
  }

  async autoSelectTools(featureIds: string[], materialId: string): Promise<object[]> {
    logger.debug('autoSelectTools', { count: featureIds.length, materialId });
    const material = DEMO_MATERIALS.find((m) => m.id === materialId) ?? DEMO_MATERIALS[0];

    return featureIds.map((featureId) => {
      // Lire le type de feature depuis featureStore (alimenté par afrWorker)
      const stored = featureStore.get(featureId);
      const featureType = (stored && !Array.isArray(stored))
        ? (stored as StoredFeature).type
        : 'pocket'; // fallback conservateur

      const featureDiam = (stored && !Array.isArray(stored))
        ? (stored as StoredFeature).diameter
        : undefined;

      // Sélection de l'outil selon le type de feature
      const tool = _selectToolForFeature(featureType, featureDiam);

      // Calcul des conditions de coupe pour cet outil et cette matière
      const D  = tool.diameter;
      const Vc = material.machinabilityIndex > 60 ? 200 : material.machinabilityIndex > 40 ? 130 : 80;
      const N  = Math.round((Vc * 1000) / (Math.PI * D));
      const z  = tool.numberOfFlutes;
      const fz = D <= 10 ? 0.06 : D <= 16 ? 0.10 : 0.12;
      const Vf = Math.round(N * z * fz);
      const ap = tool.type === 'face_mill' ? 0.5 : D * 0.25;
      const ae = tool.type === 'face_mill' ? D * 0.75 : D * 0.40;

      return {
        featureId,
        featureType,
        tool,
        conditions: { toolId: tool.id, materialId, Vc, N, Vf, fz, ap: +ap.toFixed(2), ae: +ae.toFixed(2) },
      };
    });
  }
}

// ── Sélection d'outil par type de feature ─────────────────────────────────────
function _selectToolForFeature(featureType: string, diameter?: number): typeof DEMO_TOOLS[number] {
  switch (featureType) {
    case 'face':
      return DEMO_TOOLS.find(t => t.type === 'face_mill')!;
    case 'hole':
      // Foret diamètre correspondant, ou reamer si H7 (tolérance serrée)
      return DEMO_TOOLS.find(t => t.type === 'drill' && (!diameter || Math.abs(t.diameter - diameter) < 1))
          ?? DEMO_TOOLS.find(t => t.type === 'drill')!;
    case 'bore':
      return DEMO_TOOLS.find(t => t.type === 'reamer')!;
    case 'pocket':
    case 'slot':
      return DEMO_TOOLS.find(t => t.type === 'end_mill' && t.diameter === 10)!;
    case 'contour':
      return DEMO_TOOLS.find(t => t.type === 'end_mill' && t.diameter === 16)!;
    default:
      return DEMO_TOOLS[0];
  }
}

// ── Catalogue d'outils avec IDs STABLES (ne pas remplacer par uuidv4()) ──────
// Les IDs fixes permettent au frontend de les stocker et re-utiliser après
// redémarrage du serveur sans perte de référence.
const DEMO_TOOLS = [
  { id: 'tool-em-d10-001', iso13399Code: 'EM-D10-Z4-L75-HRC',   type: 'end_mill',  diameter: 10, numberOfFlutes: 4, totalLength: 75,  cuttingLength: 22, shankDiameter: 10, material: 'carbide', coating: 'TiAlN' },
  { id: 'tool-em-d16-002', iso13399Code: 'EM-D16-Z4-L100-HRC',  type: 'end_mill',  diameter: 16, numberOfFlutes: 4, totalLength: 100, cuttingLength: 32, shankDiameter: 16, material: 'carbide', coating: 'TiSiN' },
  { id: 'tool-drl-d10-003',iso13399Code: 'DRL-D10-HRC-2xD',     type: 'drill',     diameter: 10, numberOfFlutes: 2, totalLength: 87,  cuttingLength: 30, shankDiameter: 10, material: 'carbide', coating: 'TiN'   },
  { id: 'tool-fm-d63-004', iso13399Code: 'FM-D63-Z5-AP4',       type: 'face_mill', diameter: 63, numberOfFlutes: 5, totalLength: 50,  cuttingLength: 4,  shankDiameter: 32, material: 'carbide', insertGrade: 'P25' },
  { id: 'tool-ream-d10-005',iso13399Code: 'REAM-D10-H7-CARBIDE',type: 'reamer',    diameter: 10, numberOfFlutes: 6, totalLength: 75,  cuttingLength: 18, shankDiameter: 10, material: 'carbide' },
] as const;

type DemoTool = typeof DEMO_TOOLS[number];

// ── Catalogue matières avec IDs STABLES ───────────────────────────────────────
const DEMO_MATERIALS = [
  { id: 'mat-aa2024-001', name: 'Aluminium AA2024-T351', code: 'AA2024',   category: 'aluminum',  hardness: 120, density: 2.78, machinabilityIndex: 90 },
  { id: 'mat-c45-002',    name: 'Acier C45',             code: 'C45',      category: 'steel',     hardness: 200, density: 7.85, machinabilityIndex: 55 },
  { id: 'mat-316l-003',   name: 'Inox 316L',             code: '316L',     category: 'stainless', hardness: 180, density: 7.98, machinabilityIndex: 35 },
  { id: 'mat-ti6al4v-004',name: 'Titane Ti6Al4V',        code: 'Ti6Al4V',  category: 'titanium',  hardness: 334, density: 4.43, machinabilityIndex: 20 },
] as const;
