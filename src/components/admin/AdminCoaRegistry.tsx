import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ExternalLink, Pencil, RotateCcw, X } from 'lucide-react';
import { COA, CoaWorkflowStage } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import {
  COA_WORKFLOW_LABELS, buildWorkflowStagePatch, coaWorkflowStage,
} from '../../lib/coaWorkflow';

interface Props {
  coas: COA[];
  onSave?: (coaId: string, patch: Partial<COA>, auditNote?: string) => void | Promise<void>;
}

type EditableField = 'accession_number' | 'seal_serial' | 'batch_number' | 'company_name'
  | 'display_name' | 'sample_name' | 'peptide_sequence' | 'overall_result';

type EditForm = Record<EditableField, string> & { audit_note: string };

function formFromCoa(c: COA): EditForm {
  return {
    accession_number: c.accession_number ?? '',
    seal_serial: c.seal_serial ?? '',
    batch_number: c.batch_number ?? '',
    company_name: c.company_name ?? '',
    display_name: c.display_name ?? '',
    sample_name: c.sample_name ?? '',
    peptide_sequence: c.peptide_sequence ?? '',
    overall_result: c.overall_result ?? 'pending',
    audit_note: '',
  };
}

const STAGE_OVERRIDE_OPTIONS: CoaWorkflowStage[] = [
  'testing_in_progress',
  'issued',
  'pending_review',
  'verified',
  'published',
  'awaiting_info',
];

export default function AdminCoaRegistry({ coas, onSave }: Props) {
  const [filter, setFilter] = useState<'all' | 'pipeline' | 'public' | 'private'>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...coas];
    if (filter === 'pipeline') list = list.filter(c => coaWorkflowStage(c) !== 'published');
    if (filter === 'public') list = list.filter(c => c.is_public);
    if (filter === 'private') list = list.filter(c => !c.is_public);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        (c.display_name || c.sample_name).toLowerCase().includes(q)
        || (c.company_name ?? '').toLowerCase().includes(q)
        || c.slug.toLowerCase().includes(q)
        || (c.accession_number ?? '').toLowerCase().includes(q)
        || (c.batch_number ?? '').toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
  }, [coas, filter, search]);

  function startEdit(c: COA) {
    setEditingId(c.id);
    setEditForm(formFromCoa(c));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function updateField(field: keyof EditForm, value: string) {
    setEditForm(prev => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveEdit(coa: COA) {
    if (!editForm || !onSave) return;
    setSaving(true);
    const patch: Partial<COA> = {
      accession_number: editForm.accession_number.trim(),
      seal_serial: editForm.seal_serial.trim(),
      batch_number: editForm.batch_number.trim(),
      company_name: editForm.company_name.trim(),
      display_name: editForm.display_name.trim(),
      sample_name: editForm.sample_name.trim(),
      peptide_sequence: editForm.peptide_sequence.trim(),
      overall_result: editForm.overall_result as COA['overall_result'],
    };
    await onSave(coa.id, patch, editForm.audit_note.trim() || 'Admin field override');
    setSaving(false);
    setEditingId(null);
    setEditForm(null);
  }

  async function applyStage(coa: COA, target: CoaWorkflowStage) {
    if (!onSave) return;
    const current = coaWorkflowStage(coa);
    if (current === target) return;
    const note = window.prompt(
      `Audit note for moving ${coa.display_name || coa.sample_name} → ${COA_WORKFLOW_LABELS[target]}`,
      target === 'published' ? 'Admin publish override' : target === 'testing_in_progress' ? 'Admin rework / unpublish' : 'Admin stage override',
    );
    if (note === null) return;
    setStageBusyId(coa.id);
    const patch = buildWorkflowStagePatch(coa, target) as Partial<COA>;
    await onSave(coa.id, patch, note.trim() || `Stage override → ${target}`);
    setStageBusyId(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Edit certificate fields, unpublish / reset workflow stage, and record an audit note on every override.
      </p>

      <div className="flex flex-wrap gap-2">
        {(['all', 'pipeline', 'public', 'private'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize ${
              filter === f ? 'bg-black text-white border-black' : 'border-atlas-border'
            }`}
          >
            {f === 'pipeline' ? 'In workflow' : f}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search sample, company, slug, LIMS ID, or batch…"
        className="input-field max-w-md"
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 z-10">
              <tr className="coa-table-header">
                <th className="text-left px-5 py-3">Sample</th>
                <th className="text-left px-5 py-3">Company</th>
                <th className="text-left px-5 py-3">LIMS ID</th>
                <th className="text-left px-5 py-3">Batch</th>
                <th className="text-left px-5 py-3">Workflow</th>
                <th className="text-left px-5 py-3">Result</th>
                <th className="text-left px-5 py-3">Issued</th>
                <th className="text-left px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-neutral-500">No certificates found.</td></tr>
              ) : filtered.map(c => {
                const stage = coaWorkflowStage(c);
                const isEditing = editingId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr className={`bg-white hover:bg-neutral-50 ${isEditing ? 'bg-brand-50/40' : ''}`}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-black">{c.display_name || c.sample_name}</p>
                        <p className="text-xs text-neutral-400 font-mono">{c.slug}</p>
                      </td>
                      <td className="px-5 py-3 text-neutral-600">{c.company_name || '—'}</td>
                      <td className="px-5 py-3 text-neutral-600 font-mono text-xs">{c.accession_number || '—'}</td>
                      <td className="px-5 py-3 text-neutral-600 font-mono text-xs">{c.batch_number || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          stage === 'published' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : stage === 'awaiting_info' ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : stage === 'pending_review' ? 'bg-violet-50 text-violet-800 border-violet-200'
                          : stage === 'testing_in_progress' ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : stage === 'verified' ? 'bg-brand-50 text-brand-800 border-brand-200'
                          : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                        }`}>
                          {COA_WORKFLOW_LABELS[stage]}
                        </span>
                      </td>
                      <td className="px-5 py-3 capitalize">{c.overall_result}</td>
                      <td className="px-5 py-3 text-xs text-neutral-500">{formatDate(c.issued_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {onSave && (
                            <>
                              <select
                                value={stage}
                                disabled={stageBusyId === c.id}
                                onChange={e => applyStage(c, e.target.value as CoaWorkflowStage)}
                                className="input-field py-1 text-[11px] w-auto max-w-[150px]"
                                title="Override workflow stage"
                              >
                                {STAGE_OVERRIDE_OPTIONS.map(s => (
                                  <option key={s} value={s}>{COA_WORKFLOW_LABELS[s]}</option>
                                ))}
                              </select>
                              {stage === 'published' && (
                                <button
                                  type="button"
                                  disabled={stageBusyId === c.id}
                                  onClick={() => applyStage(c, 'testing_in_progress')}
                                  className="text-amber-700 hover:text-amber-900"
                                  title="Unpublish / send back to testing"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => (isEditing ? cancelEdit() : startEdit(c))}
                                className="text-neutral-500 hover:text-brand-700"
                                title={isEditing ? 'Cancel edit' : 'Edit certificate'}
                              >
                                {isEditing ? <X size={14} /> : <Pencil size={14} />}
                              </button>
                            </>
                          )}
                          <Link to={`/coa/${c.slug}`} className="text-brand-700 hover:text-brand-800">
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {isEditing && editForm && (
                      <tr className="bg-brand-50/30">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <Field label="LIMS ID">
                              <input
                                value={editForm.accession_number}
                                onChange={e => updateField('accession_number', e.target.value)}
                                className="input-field py-1.5 text-sm"
                                placeholder="LIMS ID"
                              />
                            </Field>
                            <Field label="Seal serial">
                              <input
                                value={editForm.seal_serial}
                                onChange={e => updateField('seal_serial', e.target.value)}
                                className="input-field py-1.5 text-sm"
                                placeholder="Seal serial"
                              />
                            </Field>
                            <Field label="Batch / Lot">
                              <input
                                value={editForm.batch_number}
                                onChange={e => updateField('batch_number', e.target.value)}
                                className="input-field py-1.5 text-sm"
                              />
                            </Field>
                            <Field label="Company name">
                              <input
                                value={editForm.company_name}
                                onChange={e => updateField('company_name', e.target.value)}
                                className="input-field py-1.5 text-sm"
                              />
                            </Field>
                            <Field label="Display name">
                              <input
                                value={editForm.display_name}
                                onChange={e => updateField('display_name', e.target.value)}
                                className="input-field py-1.5 text-sm"
                              />
                            </Field>
                            <Field label="Sample name">
                              <input
                                value={editForm.sample_name}
                                onChange={e => updateField('sample_name', e.target.value)}
                                className="input-field py-1.5 text-sm"
                              />
                            </Field>
                            <Field label="CAS number">
                              <input
                                value={editForm.peptide_sequence}
                                onChange={e => updateField('peptide_sequence', e.target.value)}
                                className="input-field py-1.5 text-sm"
                                placeholder="e.g. 137266-51-2"
                              />
                            </Field>
                            <Field label="Overall result">
                              <select
                                value={editForm.overall_result}
                                onChange={e => updateField('overall_result', e.target.value)}
                                className="input-field py-1.5 text-sm"
                              >
                                <option value="pass">Pass</option>
                                <option value="fail">Fail</option>
                                <option value="pending">Pending</option>
                              </select>
                            </Field>
                            <Field label="Audit note (required for override trail)">
                              <input
                                value={editForm.audit_note}
                                onChange={e => updateField('audit_note', e.target.value)}
                                className="input-field py-1.5 text-sm"
                                placeholder="Why is this being changed?"
                              />
                            </Field>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-3">
                            Changing sample name or batch number recomputes the certificate&apos;s integrity hash on save. Overrides are logged to the order activity trail when an order is linked.
                          </p>
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => saveEdit(c)}
                              className="btn-primary py-1.5 px-3 text-xs gap-1.5"
                            >
                              <CheckCircle size={13} /> {saving ? 'Saving…' : 'Save changes'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="btn-outline py-1.5 px-3 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
