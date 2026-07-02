/**
 * SettingsPage.tsx — TASK 5 : Paramètres machine (Blue Ice Premium)
 */
import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { FixtureConfig } from '../store/useSettingsStore';
import { settingsApi } from '../api/backendApi';

const CONTROLLER_OPTIONS = [
  { value: 'fanuc',      label: 'Fanuc 0i / 30i' },
  { value: 'heidenhain', label: 'Heidenhain iTNC 530' },
  { value: 'siemens',    label: 'Siemens 840D sl' },
  { value: 'haas',       label: 'Haas NGC' },
  { value: 'mazak',      label: 'Mazak Mazatrol' },
  { value: 'okuma',      label: 'Okuma OSP-P300' },
];
const COOLANT_OPTIONS = [
  { value: 'flood', label: 'Arrosage' },
  { value: 'mist',  label: 'Brumisation' },
  { value: 'air',   label: 'Air comprimé' },
  { value: 'none',  label: 'Sec' },
];

export default function SettingsPage() {
  const { machine, setMachine, updateMachineLimits, resetToDefault, addFixture, removeFixture, updateFixture } =
    useSettingsStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    settingsApi.putMachine(machine).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setIsSaving(true); setError(null);
    try {
      await settingsApi.putMachine(machine);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIsSaving(false); }
  }

  return (
    <div className="flex flex-col h-full bg-navy-800">

      <div className="module-toolbar">
        <div className="module-title">
          <div className="module-icon"><Settings size={15} className="text-ice-500" /></div>
          <div>
            <h2 className="text-xs font-semibold text-ice-50 leading-tight">Paramètres machine</h2>
            <p className="text-[10px] text-ice-500/70 leading-tight">Limites · Brides · Broche</p>
          </div>
        </div>
        <div className="flex-1" />
        <button onClick={resetToDefault} className="btn-secondary"><RotateCcw size={12} />Réinitialiser</button>
        <button onClick={handleSave} disabled={isSaving} className="btn-primary">
          {saved ? <CheckCircle2 size={13} /> : <Save size={13} />}
          {isSaving ? 'Sauvegarde…' : saved ? 'Sauvegardé' : 'Appliquer'}
          <kbd>⌃,</kbd>
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={13} className="shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6">

        {/* Machine */}
        <section>
          <h3 className="text-[9px] uppercase tracking-widest text-ice-800/60 font-semibold mb-3">Machine</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className="prop-label">Nom</span>
              <input className="input w-full" value={machine.name}
                onChange={(e) => setMachine({ ...machine, name: e.target.value })} />
            </label>
            <label>
              <span className="prop-label">Contrôleur CN</span>
              <select className="select w-full" value={machine.controller}
                onChange={(e) => setMachine({ ...machine, controller: e.target.value })}>
                {CONTROLLER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              <span className="prop-label">Arrosage</span>
              <select className="select w-full" value={machine.coolant}
                onChange={(e) => setMachine({ ...machine, coolant: e.target.value as typeof machine.coolant })}>
                {COOLANT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        </section>

        {/* Limites */}
        <section>
          <h3 className="text-[9px] uppercase tracking-widest text-ice-800/60 font-semibold mb-3">Limites de déplacement (mm)</h3>
          <div className="grid grid-cols-3 gap-4">
            {(['x','y','z'] as const).map(axis => (
              <div key={axis}>
                <p className="text-[9px] text-ice-500/60 font-bold uppercase mb-2">{axis}</p>
                <div className="flex gap-2">
                  {(['Min','Max'] as const).map(dir => (
                    <label key={dir} className="flex-1">
                      <span className="prop-label">{dir}</span>
                      <input type="number" className="input w-full"
                        value={(machine.limits as unknown as Record<string, number>)[`${axis}${dir}`]}
                        onChange={(e) => updateMachineLimits({ [`${axis}${dir}`]: +e.target.value })} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Broche */}
        <section>
          <h3 className="text-[9px] uppercase tracking-widest text-ice-800/60 font-semibold mb-3">Broche & avance</h3>
          <div className="grid grid-cols-3 gap-3">
            <label>
              <span className="prop-label">Vitesse max (tr/min)</span>
              <input type="number" className="input w-full" value={machine.maxSpindle}
                onChange={(e) => setMachine({ ...machine, maxSpindle: +e.target.value })} />
            </label>
            <label>
              <span className="prop-label">Avance max (mm/min)</span>
              <input type="number" className="input w-full" value={machine.maxFeedRate}
                onChange={(e) => setMachine({ ...machine, maxFeedRate: +e.target.value })} />
            </label>
            <label>
              <span className="prop-label">Dépassement outil (mm)</span>
              <input type="number" className="input w-full" value={machine.toolOverhang}
                onChange={(e) => setMachine({ ...machine, toolOverhang: +e.target.value })} />
            </label>
          </div>
        </section>

        {/* Brides */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[9px] uppercase tracking-widest text-ice-800/60 font-semibold">Brides de fixation</h3>
            <button onClick={() => addFixture({ x: 0, y: 0, z: 0, radius: 15, label: `Bride ${machine.fixtures.length + 1}` })}
              className="btn-secondary btn-sm"><Plus size={11} />Ajouter</button>
          </div>
          <div className="space-y-2">
            {machine.fixtures.map((fix: FixtureConfig) => (
              <div key={fix.id} className="flex items-center gap-2 bg-navy-700/50 border border-navy-400/20 rounded-lg p-2.5">
                <input className="input w-28 text-[11px]" placeholder="Label" value={fix.label}
                  onChange={(e) => updateFixture(fix.id, { label: e.target.value })} />
                {(['x','y','z'] as const).map(ax => (
                  <label key={ax} className="flex items-center gap-1">
                    <span className="text-[9px] text-ice-800/50 uppercase font-semibold">{ax}</span>
                    <input type="number" className="input w-14 text-[11px]"
                      value={(fix as unknown as Record<string, number>)[ax]}
                      onChange={(e) => updateFixture(fix.id, { [ax]: +e.target.value })} />
                  </label>
                ))}
                <label className="flex items-center gap-1">
                  <span className="text-[9px] text-ice-800/50 font-semibold">R</span>
                  <input type="number" className="input w-12 text-[11px]" value={fix.radius}
                    onChange={(e) => updateFixture(fix.id, { radius: +e.target.value })} />
                </label>
                <button onClick={() => removeFixture(fix.id)}
                  className="ml-auto p-1 text-ice-800/50 hover:text-red-400 hover:bg-red-950/30 rounded transition-all">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
