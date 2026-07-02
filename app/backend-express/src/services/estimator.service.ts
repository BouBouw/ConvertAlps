/**
 * estimator.service.ts — Calcul analytique du temps de cycle & chiffrage
 *
 * Calcule le temps de cycle réel depuis les opérations de trajectoire :
 *   - Temps d'usinage = longueur totale du chemin / vitesse d'avance
 *   - Temps de changement d'outil = nombre de changements × 15 s
 *   - Temps de préparation fixe = 5 min
 *
 * Génère un devis complet avec coûts matière / usinage / outillage.
 * Export ERP : JSON structuré ou CSV (compatible SAP, Odoo, ProGEST).
 */
import { v4 as uuidv4 } from 'uuid';
import path             from 'path';
import fs               from 'fs';
import { logger }       from '../utils/logger';
import { toolpathStore } from '../state/sharedStore';

interface Point3D { x: number; y: number; z: number; }
interface Pass { type: string; points: Point3D[]; feedRate: number; depth: number; passNumber: number; }
interface Operation { id: string; toolId: string; passes: Pass[]; estimatedTime: number; conditions: { Vc?: number; N?: number; Vf?: number; ap?: number; ae?: number; [k: string]: unknown }; }

export class EstimatorService {

  async estimateCycleTime(projectId: string): Promise<object> {
    logger.debug('estimateCycleTime', { projectId });

    // Récupérer les opérations depuis le store ou utiliser les données de démo
    const ops = (toolpathStore.get(projectId) ?? toolpathStore.get('current') ?? []) as Operation[];

    if (ops.length === 0) {
      // Mode démo : données de référence pour la pièce aluminium 120×60×40
      return this._demoEstimate();
    }

    const breakdown: object[] = [];
    let totalMachiningTime = 0;

    for (const op of ops) {
      // Calcul du temps réel par opération : longueur chemin / vitesse
      let opDist = 0;
      for (const pass of op.passes ?? []) {
        const pts = pass.points ?? [];
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y, dz = pts[i].z - pts[i-1].z;
          opDist += Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
      }
      const feedRate  = op.passes?.[0]?.feedRate ?? 1500;
      const opTimeSec = opDist > 0 ? Math.round((opDist / feedRate) * 60) : (op.estimatedTime ?? 60);
      totalMachiningTime += opTimeSec;

      breakdown.push({
        operationId:      op.id,
        description:      this._describeOp(op),
        durationSeconds:  opTimeSec,
        pathLengthMm:     Math.round(opDist),
        feedRate,
        toolId:           op.toolId,
      });
    }

    // Changements d'outil
    const uniqueTools    = new Set(ops.map(o => o.toolId)).size;
    const toolChanges    = Math.max(0, uniqueTools - 1);
    const toolChangeTime = toolChanges * 15;
    const setupTime      = 300; // 5 min fixe

    return {
      totalTimeSeconds:      totalMachiningTime + toolChangeTime + setupTime,
      machiningTimeSeconds:  totalMachiningTime,
      toolChangeTimeSeconds: toolChangeTime,
      setupTimeSeconds:      setupTime,
      toolChanges,
      breakdown,
    };
  }

  async generateQuote(projectId: string): Promise<object> {
    logger.debug('generateQuote', { projectId });
    const cycleTime = await this.estimateCycleTime(projectId) as { totalTimeSeconds: number };

    // Taux et coûts standards atelier
    const machiningRate = 65;     // €/h
    const materialCost  = 12.50;  // € brut aluminium 120×60×40
    const toolingCost   = 8.30;   // € amortissement outils par pièce

    const machiningCost = (cycleTime.totalTimeSeconds / 3600) * machiningRate;
    const totalCost     = toolingCost + materialCost + machiningCost;

    return {
      projectId,
      partName:    `Pièce_${projectId.slice(0, 8).toUpperCase()}`,
      material:    'Aluminium AA2024-T351',
      cycleTime,
      toolingCost:   parseFloat(toolingCost.toFixed(2)),
      materialCost:  parseFloat(materialCost.toFixed(2)),
      machiningCost: parseFloat(machiningCost.toFixed(2)),
      totalCost:     parseFloat(totalCost.toFixed(2)),
      margin:        parseFloat((totalCost * 0.20).toFixed(2)),   // marge 20%
      priceWithMargin: parseFloat((totalCost * 1.20).toFixed(2)),
      currency:      'EUR',
      generatedAt:   new Date(),
    };
  }

  async exportToERP(projectId: string, format: 'json' | 'csv'): Promise<{ downloadUrl: string }> {
    logger.info('Export ERP', { projectId, format });
    const quote     = await this.generateQuote(projectId) as Record<string, unknown>;
    const exportDir = './exports';
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const fileName = `quote_${projectId.slice(0, 8)}_${Date.now()}.${format}`;
    const filePath = path.join(exportDir, fileName);

    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(quote, null, 2));
    } else {
      const rows = [
        ['Champ', 'Valeur'],
        ['Pièce',           quote.partName],
        ['Matière',         quote.material],
        ['Temps total (s)', (quote.cycleTime as { totalTimeSeconds: number })?.totalTimeSeconds],
        ['Coût matière €',  quote.materialCost],
        ['Coût usinage €',  quote.machiningCost],
        ['Coût outillage €',quote.toolingCost],
        ['Total HT €',      quote.totalCost],
        ['Marge 20% €',     quote.margin],
        ['Total TTC (×1.2) €', quote.priceWithMargin],
        ['Devise',          quote.currency],
        ['Généré le',       new Date().toISOString()],
      ];
      fs.writeFileSync(filePath, rows.map(r => r.join(';')).join('\n'));
    }

    return { downloadUrl: `http://127.0.0.1:3737/exports/${fileName}` };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _describeOp(op: Operation): string {
    const toolMap: Record<string, string> = {
      'FM-D63-Z5-AP4':           'Surfaçage ébauche (D63)',
      'EM-D10-Z4-L75-HRC':       'Évidement trochoïdal (D10)',
      'EM-D16-Z4-L100-HRC':      'Fraisage contour (D16)',
      'DRL-D10-HRC-2xD':         'Perçage D10',
      'REAM-D10-H7-CARBIDE':     'Alésage H7 (D10)',
    };
    return toolMap[op.toolId] ?? `Opération ${op.toolId}`;
  }

  private _demoEstimate(): object {
    const breakdown = [
      { operationId: uuidv4(), description: 'Surfaçage ébauche',           durationSeconds: 45  },
      { operationId: uuidv4(), description: 'Évidement poche (trochoïdal)',durationSeconds: 185 },
      { operationId: uuidv4(), description: 'Finition profil extérieur',   durationSeconds: 90  },
      { operationId: uuidv4(), description: 'Perçage × 4 trous D10',       durationSeconds: 28  },
      { operationId: uuidv4(), description: 'Alésage H7',                  durationSeconds: 12  },
    ];
    const machiningTime  = breakdown.reduce((s, b) => s + b.durationSeconds, 0);
    const toolChangeTime = 3 * 15;
    const setupTime      = 300;
    return {
      totalTimeSeconds:      machiningTime + toolChangeTime + setupTime,
      machiningTimeSeconds:  machiningTime,
      toolChangeTimeSeconds: toolChangeTime,
      setupTimeSeconds:      setupTime,
      toolChanges:           3,
      breakdown,
    };
  }
}
