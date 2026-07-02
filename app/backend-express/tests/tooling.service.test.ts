/**
 * Tests du module Outillage (tooling.service.ts)
 * TASK 9 — Tests automatisés backend
 */
import { ToolingService } from '../src/services/tooling.service';

describe('ToolingService', () => {
  const svc = new ToolingService();

  it('listTools() retourne au moins 5 outils avec IDs stables', async () => {
    const tools = await svc.listTools() as Array<{ id: string; type: string; diameter: number }>;
    expect(tools.length).toBeGreaterThanOrEqual(5);
    // IDs doivent être stables (TASK fix)
    expect(tools[0].id).toBe('tool-em-d10-001');
  });

  it('listMaterials() retourne les 4 matières standard', async () => {
    const mats = await svc.listMaterials() as Array<{ id: string; code: string }>;
    expect(mats.length).toBe(4);
    const codes = mats.map(m => m.code);
    expect(codes).toContain('AA2024');
    expect(codes).toContain('C45');
  });

  it('calculateConditions() produit des valeurs physiquement cohérentes', async () => {
    const cond = await svc.calculateConditions('tool-em-d10-001', 'mat-aa2024-001') as {
      Vc: number; N: number; Vf: number; fz: number; ap: number; ae: number;
    };
    // N = (Vc × 1000) / (π × D) — pour alu D10 : ~7958 tr/min
    expect(cond.N).toBeGreaterThan(6000);
    expect(cond.N).toBeLessThan(12000);
    expect(cond.Vf).toBeGreaterThan(0);
    expect(cond.fz).toBeGreaterThan(0);
    expect(cond.ap).toBeGreaterThan(0);
    expect(cond.ae).toBeGreaterThan(0);
  });

  it('autoSelectTools() sélectionne un face_mill pour une feature "face"', async () => {
    // Pré-remplir le featureStore (TASK fix autoSelectTools)
    const { featureStore } = await import('../src/state/sharedStore');
    featureStore.set('feat-face-01', {
      id: 'feat-face-01', type: 'face', depth: 0.5, centerX: 60, centerY: 30,
      surfaceRoughness: 3.2, requiresFinishing: false, coordinates: { x:60, y:30, z:0 },
    } as never);

    const results = await svc.autoSelectTools(['feat-face-01'], 'mat-aa2024-001') as
      Array<{ featureId: string; featureType: string; tool: { type: string } }>;

    expect(results[0].featureType).toBe('face');
    expect(results[0].tool.type).toBe('face_mill');
  });
});
