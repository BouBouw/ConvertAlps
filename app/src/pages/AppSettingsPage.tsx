/**
 * AppSettingsPage — Préférences logiciel (thème, langue, UI)
 */
import { Sliders, Save, RotateCcw, CheckCircle2, Monitor, Sun, Moon,
         Globe, Keyboard, Bell, FlipHorizontal, Ruler } from 'lucide-react';
import { useAppSettingsStore, type AppTheme, type AppLanguage } from '../store/useAppSettingsStore';
import { useState } from 'react';

/* ── Helpers ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus-visible:outline-none"
      style={{
        backgroundColor: checked ? 'rgb(var(--ice-600))' : 'var(--bg-btn-sec)',
        border: `1px solid ${checked ? 'rgba(127,166,184,0.30)' : 'var(--border-input)'}`,
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 shadow-sm"
        style={{
          backgroundColor: checked ? '#F7FBFD' : 'var(--text-faint)',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<{size?: number; className?: string}>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="shrink-0 text-ice-500" />
      <h3 className="text-[9px] uppercase tracking-[0.14em] font-semibold text-ice-500/60">
        {label}
      </h3>
    </div>
  );
}

function PrefRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="min-w-0 mr-4">
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ── Thème selector ── */
const THEMES: { value: AppTheme; label: string; Icon: typeof Sun }[] = [
  { value: 'dark',   label: 'Sombre',  Icon: Moon    },
  { value: 'light',  label: 'Clair',   Icon: Sun     },
  { value: 'system', label: 'Système', Icon: Monitor },
];

/* ── Langue selector ── */
const LANGUAGES: { value: AppLanguage; label: string; flag: string }[] = [
  { value: 'fr', label: 'Français',  flag: '🇫🇷' },
  { value: 'en', label: 'English',   flag: '🇬🇧' },
  { value: 'de', label: 'Deutsch',   flag: '🇩🇪' },
];

/* ══════════════════════════════════════════════════════════════════════════ */

export default function AppSettingsPage() {
  const store   = useAppSettingsStore();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-app)' }}>

      {/* ── Toolbar ── */}
      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon">
            <Sliders size={15} style={{ color: 'rgb(var(--ice-500))' }} />
          </div>
          <div>
            <h2 className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Préférences logiciel
            </h2>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              Apparence · Langue · Interface · Notifications
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={() => store.resetToDefault()} className="btn-secondary">
          <RotateCcw size={12} /> Réinitialiser
        </button>
        <button onClick={handleSave} className="btn-primary">
          {saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {saved ? 'Sauvegardé' : 'Appliquer'}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-8">

          {/* Apparence */}
          <section>
            <SectionTitle icon={Sun} label="Apparence" />
            <div className="panel p-4 space-y-0">

              {/* Thème */}
              <PrefRow label="Thème" description="Apparence générale de l'interface">
                <div className="flex gap-1.5">
                  {THEMES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => store.setTheme(value)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: store.theme === value ? 'rgb(var(--ice-600))' : 'var(--bg-btn-sec)',
                        color: store.theme === value ? '#F7FBFD' : 'var(--text-muted)',
                        border: `1px solid ${store.theme === value ? 'rgba(127,166,184,0.25)' : 'var(--border-input)'}`,
                      }}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                </div>
              </PrefRow>

              <PrefRow label="Mode compact" description="Réduit l'espacement des éléments UI">
                <Toggle checked={store.compactMode} onChange={(v) => store.setPref('compactMode', v)} />
              </PrefRow>

              <PrefRow
                label="Animations"
                description="Transitions, slides et effets de fondu"
              >
                <Toggle checked={store.animations} onChange={(v) => store.setPref('animations', v)} />
              </PrefRow>
            </div>
          </section>

          {/* Langue */}
          <section>
            <SectionTitle icon={Globe} label="Langue & Région" />
            <div className="panel p-4 space-y-0">

              <PrefRow label="Langue de l'interface" description="Redémarrage recommandé après changement">
                <div className="flex gap-1.5">
                  {LANGUAGES.map(({ value, label, flag }) => (
                    <button
                      key={value}
                      onClick={() => store.setLanguage(value)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: store.language === value ? 'rgb(var(--ice-600))' : 'var(--bg-btn-sec)',
                        color: store.language === value ? '#F7FBFD' : 'var(--text-muted)',
                        border: `1px solid ${store.language === value ? 'rgba(127,166,184,0.25)' : 'var(--border-input)'}`,
                      }}
                    >
                      <span>{flag}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </PrefRow>

              <PrefRow label="Séparateur décimal" description="Utilisé pour les valeurs numériques affichées">
                <div className="flex gap-1.5">
                  {([',', '.'] as const).map((sep) => (
                    <button
                      key={sep}
                      onClick={() => store.setPref('decimalSeparator', sep)}
                      className="flex items-center justify-center w-10 h-7 rounded-md text-xs font-mono font-bold transition-all duration-150"
                      style={{
                        backgroundColor: store.decimalSeparator === sep ? 'rgb(var(--ice-600))' : 'var(--bg-btn-sec)',
                        color: store.decimalSeparator === sep ? '#F7FBFD' : 'var(--text-muted)',
                        border: `1px solid ${store.decimalSeparator === sep ? 'rgba(127,166,184,0.25)' : 'var(--border-input)'}`,
                      }}
                    >
                      1{sep}5
                    </button>
                  ))}
                </div>
              </PrefRow>

              <PrefRow label="Système d'unités">
                <div className="flex gap-1.5">
                  {([['metric', 'Métrique (mm)'], ['imperial', 'Impérial (in)']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => store.setPref('unitSystem', v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                      style={{
                        backgroundColor: store.unitSystem === v ? 'rgb(var(--ice-600))' : 'var(--bg-btn-sec)',
                        color: store.unitSystem === v ? '#F7FBFD' : 'var(--text-muted)',
                        border: `1px solid ${store.unitSystem === v ? 'rgba(127,166,184,0.25)' : 'var(--border-input)'}`,
                      }}
                    >
                      <Ruler size={11} />
                      {l}
                    </button>
                  ))}
                </div>
              </PrefRow>
            </div>
          </section>

          {/* Interface */}
          <section>
            <SectionTitle icon={Keyboard} label="Interface & Workflow" />
            <div className="panel p-4 space-y-0">
              <PrefRow label="Afficher les raccourcis clavier" description="Raccourcis visibles au survol des éléments">
                <Toggle checked={store.showKeyboardShortcuts} onChange={(v) => store.setPref('showKeyboardShortcuts', v)} />
              </PrefRow>
              <PrefRow label="Sauvegarde automatique" description="Sauvegarde le projet toutes les 5 minutes">
                <Toggle checked={store.autoSave} onChange={(v) => store.setPref('autoSave', v)} />
              </PrefRow>
              <PrefRow label="Confirmation avant suppression" description="Demande confirmation avant de supprimer un élément">
                <Toggle checked={store.confirmOnDelete} onChange={(v) => store.setPref('confirmOnDelete', v)} />
              </PrefRow>
            </div>
          </section>

          {/* Notifications */}
          <section>
            <SectionTitle icon={Bell} label="Notifications & Alertes" />
            <div className="panel p-4 space-y-0">
              <PrefRow label="Alertes sonores" description="Son lors des alertes de collision et d'erreur">
                <Toggle checked={store.soundAlerts} onChange={(v) => store.setPref('soundAlerts', v)} />
              </PrefRow>
            </div>
          </section>

          {/* Info version */}
          <section>
            <SectionTitle icon={FlipHorizontal} label="À propos" />
            <div className="panel p-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                {[
                  ['Application',  'ConvertAlps FAO'],
                  ['Version',      '0.1.0'],
                  ['Moteur',       'Tauri v2 + React 19'],
                  ['Renderer',     'Three.js 0.167'],
                  ['Base de données', 'SQLite (locale)'],
                  ['Licence',      'Propriétaire'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span className="font-mono" style={{ color: 'rgb(var(--ice-200))' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
