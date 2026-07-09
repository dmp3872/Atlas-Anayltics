import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { searchPeptides } from '../../data/peptideCatalog';
import { BlendComponent, MAX_BLEND_COMPONENTS, MIN_BLEND_COMPONENTS } from '../../lib/orderCatalog';

interface Props {
  components: BlendComponent[];
  onChange: (components: BlendComponent[]) => void;
}

export default function BlendComponentsEditor({ components, onChange }: Props) {
  const [activeSuggest, setActiveSuggest] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  function updateRow(index: number, patch: Partial<BlendComponent>) {
    onChange(components.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (components.length >= MAX_BLEND_COMPONENTS) return;
    onChange([...components, { name: '', amount_mg: '' }]);
  }

  function removeRow(index: number) {
    if (components.length <= MIN_BLEND_COMPONENTS) return;
    onChange(components.filter((_, i) => i !== index));
  }

  function showSuggestions(index: number, query: string) {
    setActiveSuggest(index);
    setSuggestions(searchPeptides(query, 10));
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs font-semibold text-amber-900">
        Blend components — list every compound and its labeled mg amount
      </p>
      {components.map((row, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 items-start">
          <div className="col-span-12 sm:col-span-6 relative">
            <input
              value={row.name}
              onChange={e => {
                updateRow(index, { name: e.target.value });
                showSuggestions(index, e.target.value);
              }}
              onFocus={() => showSuggestions(index, row.name)}
              onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
              placeholder="e.g. GHK-Cu"
              className="input-field py-1.5 text-sm bg-white"
              autoComplete="off"
            />
            {activeSuggest === index && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full bg-white border border-atlas-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {suggestions.map(name => (
                  <li key={name}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        updateRow(index, { name });
                        setActiveSuggest(null);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-span-10 sm:col-span-5">
            <div className="relative">
              <input
                value={row.amount_mg}
                onChange={e => updateRow(index, { amount_mg: e.target.value })}
                placeholder="e.g. 50"
                className="input-field py-1.5 text-sm bg-white pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">mg</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={components.length <= MIN_BLEND_COMPONENTS}
            className="col-span-2 sm:col-span-1 flex justify-center py-2 text-neutral-400 hover:text-red-600 disabled:opacity-30"
            aria-label="Remove component"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={components.length >= MAX_BLEND_COMPONENTS}
        className="text-xs font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 disabled:opacity-40"
      >
        <Plus size={13} /> Add compound
      </button>
      <p className="text-[11px] text-amber-800/80">
        Example: Glow Blend → GHK-Cu 50mg, BPC-157 5mg, TB-500 2mg
      </p>
    </div>
  );
}
