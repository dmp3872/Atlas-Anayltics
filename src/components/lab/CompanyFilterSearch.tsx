import { useMemo, useState } from 'react';
import { Building2, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  companies: string[];
  placeholder?: string;
}

export default function CompanyFilterSearch({
  value,
  onChange,
  companies,
  placeholder = 'Filter by company…',
}: Props) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return companies.slice(0, 12);
    return companies.filter(c => c.toLowerCase().includes(q)).slice(0, 12);
  }, [companies, value]);

  return (
    <div className="relative max-w-md">
      <label className="label flex items-center gap-1.5">
        <Building2 size={14} className="text-brand-600" />
        Company filter
      </label>
      <div className="relative">
        <input
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="input-field pr-9"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-black"
            aria-label="Clear company filter"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-atlas-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map(company => (
            <li key={company}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  onChange(company);
                  setOpen(false);
                }}
              >
                {company}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <p className="text-xs text-neutral-500 mt-1.5">
          Showing COAs matching &ldquo;{value}&rdquo;
        </p>
      )}
    </div>
  );
}
