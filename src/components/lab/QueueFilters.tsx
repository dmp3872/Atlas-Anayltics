import { Search } from 'lucide-react';
import { LabPriority } from '../../lib/types';
import { LAB_PRIORITIES, LAB_PRIORITY_LABELS } from '../../lib/labQueue';
import CompanyFilterSearch from './CompanyFilterSearch';

export type AssignmentFilter = 'all' | 'mine' | 'unassigned';

export interface QueueFilterValues {
  company: string;
  priority: LabPriority | 'all';
  assignment: AssignmentFilter;
  search: string;
}

interface Props {
  values: QueueFilterValues;
  onChange: (patch: Partial<QueueFilterValues>) => void;
  companies: string[];
  hasCurrentUser?: boolean;
}

const PRIORITY_CHIPS: { id: LabPriority | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  ...LAB_PRIORITIES.filter(p => p !== 'normal').map(p => ({ id: p, label: LAB_PRIORITY_LABELS[p] })),
  { id: 'normal', label: 'Normal' },
];

const ASSIGNMENT_CHIPS: { id: AssignmentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'unassigned', label: 'Unassigned' },
];

export default function QueueFilters({ values, onChange, companies, hasCurrentUser = true }: Props) {
  return (
    <div className="card p-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CompanyFilterSearch
          value={values.company}
          onChange={company => onChange({ company })}
          companies={companies}
        />
        <div>
          <label className="label flex items-center gap-1.5">
            <Search size={14} className="text-brand-600" />
            Sample / order search
          </label>
          <input
            value={values.search}
            onChange={e => onChange({ search: e.target.value })}
            placeholder="Search sample name or order #…"
            className="input-field"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Priority</span>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChange({ priority: chip.id })}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                  values.priority === chip.id ? 'bg-black text-white border-black' : 'border-atlas-border text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {hasCurrentUser && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Assignment</span>
            <div className="flex flex-wrap gap-1.5">
              {ASSIGNMENT_CHIPS.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onChange({ assignment: chip.id })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                    values.assignment === chip.id ? 'bg-black text-white border-black' : 'border-atlas-border text-neutral-600 hover:border-neutral-400'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
