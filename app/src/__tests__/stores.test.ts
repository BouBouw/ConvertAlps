/**
 * Tests du store Zustand (useAppStore)
 * TASK 9 — Tests automatisés frontend
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAppStore } from '../store/useAppStore';

describe('useAppStore', () => {
  beforeEach(() => {
    // Réinitialiser le store avant chaque test
    useAppStore.getState().resetWorkflow();
  });

  it('état initial : currentStep = 1, completedSteps vide', () => {
    const { currentStep, completedSteps } = useAppStore.getState();
    expect(currentStep).toBe(1);
    expect(completedSteps).toHaveLength(0);
  });

  it('completeStep() marque l\'étape comme complétée', () => {
    act(() => { useAppStore.getState().completeStep(1); });
    expect(useAppStore.getState().completedSteps).toContain(1);
  });

  it('setDxfFile() persiste le fichier DXF', () => {
    const mockDxf = { id: 'dxf-001', path: '/test.dxf', name: 'test.dxf', entities: [] };
    act(() => { useAppStore.getState().setDxfFile(mockDxf as never); });
    expect(useAppStore.getState().dxfFile?.id).toBe('dxf-001');
  });

  it('setFeatures() met à jour les features', () => {
    const features = [
      { id: 'f1', type: 'hole' as const, requiresFinishing: true,
        coordinates: { x: 0, y: 0, z: 0 } },
    ];
    act(() => { useAppStore.getState().setFeatures(features as never); });
    expect(useAppStore.getState().features).toHaveLength(1);
    expect(useAppStore.getState().features[0].type).toBe('hole');
  });

  it('setCollisionStatus() et statut initial = none', () => {
    expect(useAppStore.getState().collisionStatus).toBe('none');
    act(() => { useAppStore.getState().setCollisionStatus('warning'); });
    expect(useAppStore.getState().collisionStatus).toBe('warning');
  });

  it('resetWorkflow() remet tout à zéro', () => {
    act(() => {
      useAppStore.getState().completeStep(1);
      useAppStore.getState().completeStep(2);
      useAppStore.getState().resetWorkflow();
    });
    expect(useAppStore.getState().completedSteps).toHaveLength(0);
    expect(useAppStore.getState().dxfFile).toBeNull();
  });
});

describe('useSettingsStore', () => {
  it('valeurs par défaut : DMG Mori DMU 50', async () => {
    const { useSettingsStore } = await import('../store/useSettingsStore');
    const { machine } = useSettingsStore.getState();
    expect(machine.name).toBe('DMG Mori DMU 50');
    expect(machine.fixtures).toHaveLength(4);
    expect(machine.limits.xMin).toBe(-300);
  });

  it('addFixture() ajoute une bride', async () => {
    const { useSettingsStore } = await import('../store/useSettingsStore');
    const initial = useSettingsStore.getState().machine.fixtures.length;
    act(() => {
      useSettingsStore.getState().addFixture({ x: 50, y: 50, z: 0, radius: 10, label: 'Test' });
    });
    expect(useSettingsStore.getState().machine.fixtures).toHaveLength(initial + 1);
  });
});
