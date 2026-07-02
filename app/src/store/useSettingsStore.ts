/**
 * useSettingsStore — Paramètres machine configurables (TASK 5)
 * Persistés dans localStorage pour survivre aux redémarrages.
 */
import { create }      from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface MachineLimits {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
  zMin: number; zMax: number;
}

export interface FixtureConfig {
  id:     string;
  x:      number;
  y:      number;
  z:      number;
  radius: number;
  label:  string;
}

export interface MachineSettings {
  name:          string;   // ex: "DMG Mori DMU 50"
  controller:    string;   // ex: "fanuc" | "heidenhain" | "siemens" | ...
  limits:        MachineLimits;
  fixtures:      FixtureConfig[];
  maxSpindle:    number;   // tr/min
  maxFeedRate:   number;   // mm/min
  toolOverhang:  number;   // mm max (sécurité)
  coolant:       'flood' | 'mist' | 'air' | 'none';
}

const DEFAULT_MACHINE: MachineSettings = {
  name:         'DMG Mori DMU 50',
  controller:   'fanuc',
  limits:       { xMin: -300, xMax: 300, yMin: -250, yMax: 250, zMin: -150, zMax: 50 },
  fixtures:     [
    { id: 'fix-1', x: -5,   y: -5,  z: 5, radius: 15, label: 'Bride AV-G' },
    { id: 'fix-2', x: 125,  y: -5,  z: 5, radius: 15, label: 'Bride AV-D' },
    { id: 'fix-3', x: -5,   y: 65,  z: 5, radius: 15, label: 'Bride AR-G' },
    { id: 'fix-4', x: 125,  y: 65,  z: 5, radius: 15, label: 'Bride AR-D' },
  ],
  maxSpindle:   18000,
  maxFeedRate:  10000,
  toolOverhang: 80,
  coolant:      'flood',
};

interface SettingsState {
  machine: MachineSettings;
  setMachine: (m: MachineSettings) => void;
  updateMachineLimits: (limits: Partial<MachineLimits>) => void;
  resetToDefault: () => void;
  addFixture: (fix: Omit<FixtureConfig, 'id'>) => void;
  removeFixture: (id: string) => void;
  updateFixture: (id: string, update: Partial<FixtureConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set) => ({
        machine: DEFAULT_MACHINE,

        setMachine: (m) => set({ machine: m }, false, 'setMachine'),

        updateMachineLimits: (limits) =>
          set((s) => ({ machine: { ...s.machine, limits: { ...s.machine.limits, ...limits } } }),
              false, 'updateMachineLimits'),

        resetToDefault: () => set({ machine: DEFAULT_MACHINE }, false, 'resetToDefault'),

        addFixture: (fix) =>
          set((s) => ({
            machine: {
              ...s.machine,
              fixtures: [...s.machine.fixtures, { ...fix, id: crypto.randomUUID() }],
            },
          }), false, 'addFixture'),

        removeFixture: (id) =>
          set((s) => ({
            machine: { ...s.machine, fixtures: s.machine.fixtures.filter((f) => f.id !== id) },
          }), false, 'removeFixture'),

        updateFixture: (id, update) =>
          set((s) => ({
            machine: {
              ...s.machine,
              fixtures: s.machine.fixtures.map((f) => f.id === id ? { ...f, ...update } : f),
            },
          }), false, 'updateFixture'),
      }),
      { name: 'convertalps-machine-settings' },
    ),
    { name: 'ConvertAlps-SettingsStore' },
  ),
);
