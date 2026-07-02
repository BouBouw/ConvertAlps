/**
 * useAppSettingsStore — Préférences logiciel ConvertAlps
 * (distinct du useSettingsStore qui gère la machine CNC)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppTheme    = 'dark' | 'light' | 'system';
export type AppLanguage = 'fr' | 'en' | 'de';

export interface AppPreferences {
  theme:                 AppTheme;
  language:              AppLanguage;
  compactMode:           boolean;
  animations:            boolean;
  showKeyboardShortcuts: boolean;
  soundAlerts:           boolean;
  autoSave:              boolean;
  confirmOnDelete:       boolean;
  sidebarExpanded:       boolean;
  decimalSeparator:      ',' | '.';
  unitSystem:            'metric' | 'imperial';
}

const DEFAULTS: AppPreferences = {
  theme:                 'dark',
  language:              'fr',
  compactMode:           false,
  animations:            true,
  showKeyboardShortcuts: true,
  soundAlerts:           true,
  autoSave:              true,
  confirmOnDelete:       true,
  sidebarExpanded:       true,
  decimalSeparator:      ',',
  unitSystem:            'metric',
};

interface AppSettingsState extends AppPreferences {
  setTheme:       (t: AppTheme)    => void;
  setLanguage:    (l: AppLanguage) => void;
  setPref:        <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
  resetToDefault: () => void;
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      setLanguage: (language) => set({ language }),

      setPref: (key, value) => set({ [key]: value }),

      resetToDefault: () => {
        set(DEFAULTS);
        applyTheme(DEFAULTS.theme);
      },
    }),
    { name: 'convertalps-app-preferences' },
  ),
);

/** Applique le thème sur <html data-theme="…"> */
export function applyTheme(theme: AppTheme) {
  const html = document.documentElement;
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }
}
