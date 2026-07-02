/**
 * useAppStore — État global de l'application ConvertAlps
 * Gère le workflow, les données métier et les alertes de collision.
 * Basé sur Zustand avec middleware devtools et subscribeWithSelector.
 */
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  WorkflowStep,
  Project,
  Dxf2DFile,
  Model3D,
  MachiningFeature,
  ToolpathOperation,
  SimulationState,
  CollisionStatus,
} from '../types';

// ── Interface de l'état ───────────────────────────────────────────────────────

interface AppState {
  // Workflow
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];

  // Projet actif
  activeProject: Project | null;

  // Module 1 — Ingestion
  dxfFile: Dxf2DFile | null;
  model3D: Model3D | null;

  // Module 2 — AFR
  features: MachiningFeature[];

  // Module 4 — FAO
  toolpaths: ToolpathOperation[];

  // Module 5 — Simulation
  simulationState: SimulationState;

  // Statut collision (code couleur : none | warning | collision)
  collisionStatus: CollisionStatus;

  // ── Actions ──────────────────────────────────────────────────────────────
  setStep: (step: WorkflowStep) => void;
  completeStep: (step: WorkflowStep) => void;
  setProject: (project: Project | null) => void;
  setDxfFile: (file: Dxf2DFile | null) => void;
  setModel3D: (model: Model3D | null) => void;
  setFeatures: (features: MachiningFeature[]) => void;
  setToolpaths: (toolpaths: ToolpathOperation[]) => void;
  setSimulationState: (state: Partial<SimulationState>) => void;
  setCollisionStatus: (status: CollisionStatus) => void;
  resetWorkflow: () => void;
}

// ── État initial de la simulation ────────────────────────────────────────────

const initialSimulationState: SimulationState = {
  status: 'idle',
  progress: 0,
  currentTime: 0,
  totalTime: 0,
  collisions: [],
  overallStatus: 'none',
};

// ── Store Zustand ────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set) => ({
      // ── État initial ────────────────────────────────────────────────────
      currentStep: 1,
      completedSteps: [],
      activeProject: null,
      dxfFile: null,
      model3D: null,
      features: [],
      toolpaths: [],
      simulationState: initialSimulationState,
      collisionStatus: 'none',

      // ── Actions ─────────────────────────────────────────────────────────

      setStep: (step) =>
        set({ currentStep: step }, false, 'setStep'),

      completeStep: (step) =>
        set(
          (state) => ({
            completedSteps: state.completedSteps.includes(step)
              ? state.completedSteps
              : [...state.completedSteps, step],
            currentStep: Math.min(step + 1, 6) as WorkflowStep,
          }),
          false,
          'completeStep',
        ),

      setProject: (project) =>
        set({ activeProject: project }, false, 'setProject'),

      setDxfFile: (file) =>
        set({ dxfFile: file }, false, 'setDxfFile'),

      setModel3D: (model) =>
        set({ model3D: model }, false, 'setModel3D'),

      setFeatures: (features) =>
        set({ features }, false, 'setFeatures'),

      setToolpaths: (toolpaths) =>
        set({ toolpaths }, false, 'setToolpaths'),

      setSimulationState: (partial) =>
        set(
          (state) => ({ simulationState: { ...state.simulationState, ...partial } }),
          false,
          'setSimulationState',
        ),

      setCollisionStatus: (status) =>
        set({ collisionStatus: status }, false, 'setCollisionStatus'),

      resetWorkflow: () =>
        set(
          {
            currentStep: 1,
            completedSteps: [],
            dxfFile: null,
            model3D: null,
            features: [],
            toolpaths: [],
            simulationState: initialSimulationState,
            collisionStatus: 'none',
          },
          false,
          'resetWorkflow',
        ),
    })),
    { name: 'ConvertAlps-AppStore' },
  ),
);
