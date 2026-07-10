import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle, Clock, ExternalLink, Fingerprint,
  FlaskConical, Globe, GripVertical, Hash, MessageCircle, Phone, Shield, UserCircle2,
  XCircle,
} from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import {
  COA_WORKFLOW_BOARD_COLUMNS, COA_WORKFLOW_LABELS, COA_WORKFLOW_STEPS,
  CoaWorkflowStage, coaWorkflowStage,
} from '../../lib/coaWorkflow';
import { LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES, QueueSampleItem, testsLabelForSample } from '../../lib/labQueue';

interface Props {
  coas: COA[];
  onMoveCoa: (coa: COA, targetStage: CoaWorkflowStage) => void | Promise<void>;
  movingId?: string | null;
  /** Samples still awaiting a COA (from buildQueueItems(..., true)) — rendered as a lane above the kanban. */
  pendingSamples?: QueueSampleItem[];
  onIssueCoa?: (sample: OrderSample) => void;
  chemists?: { id: string; name: string }[];
  /** Client profiles, orders, and samples — used to enrich each card with contact/order/test details. */
  clients?: UserProfile[];
  orders?: Order[];
  samples?: OrderSample[];
}

function ResultBadge({ result }: { result?: COA['overall_result'] }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  if (result === 'pending') return <span className="badge-pending"><Clock size={10} /> Pending</span>;
  return null;
}

/** Prefer dedicated accession_number, then seal_serial, then signature. */
function accessionForCoa(coa: COA): { label: string; value: string } | null {
  if (coa.accession_number?.trim()) return { label: 'Accession', value: coa.accession_number.trim() };
  if (coa.seal_serial?.trim()) return { label: 'Seal', value: coa.seal_serial.trim() };
  if (coa.signature?.trim()) return { label: 'Accession', value: coa.signature.trim() };
  return null;
}

const COLUMN_STYLES: Record<CoaWorkflowStage, { header: string; body: string; ring: string }> = {
  issued: {
    header: 'bg-neutral-100 border-neutral-200',
    body: 'bg-neutral-50/80',
    ring: 'ring-brand-400',
  },
  awaiting_info: {
    header: 'bg-amber-50 border-amber-200',
    body: 'bg-amber-50/40',
    ring: 'ring-amber-400',
  },
  verified: {
    header: 'bg-brand-50 border-brand-200',
    body: 'bg-brand-50/30',
    ring: 'ring-brand-500',
  },
  published: {
    header: 'bg-emerald-50 border-emerald-200',
    body: 'bg-emerald-50/30',
    ring: 'ring-emerald-400',
  },
};

function stageIcon(stage: CoaWorkflowStage) {
  switch (stage) {
    case 'issued':
      return <FlaskConical size={14} />;
    case 'awaiting_info':
      return <MessageCircle size={14} className="text-amber-600" />;
    case 'verified':
      return <Shield size={14} className="text-brand-600" />;
    case 'published':
      return <Globe size={14} className="text-emerald-600" />;
  }
}

function groupCoasByStage(coas: COA[]): Record<CoaWorkflowStage, COA[]> {
  const groups: Record<CoaWorkflowStage, COA[]> = {
    issued: [],
    awaiting_info: [],
    verified: [],
    published: [],
  };
  for (const coa of coas) {
    groups[coaWorkflowStage(coa)].push(coa);
  }
  return groups;
}

export default function CoaWorkflowBoard({
  coas, onMoveCoa, movingId, pendingSamples = [], onIssueCoa, chemists = [],
  clients = [], orders = [], samples = [],
}: Props) {
  const grouped = groupCoasByStage(coas);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CoaWorkflowStage | null>(null);

  function chemistLabel(userId: string | null | undefined): string {
    if (!userId) return 'Unassigned';
    return chemists.find(c => c.id === userId)?.name || 'Assigned';
  }

  function clientForCoa(coa: COA): UserProfile | undefined {
    return clients.find(c => c.id === coa.user_id);
  }

  function orderForCoa(coa: COA): Order | undefined {
    return coa.order_id ? orders.find(o => o.id === coa.order_id) : undefined;
  }

  function testsLabelForCoa(coa: COA): string | null {
    if (!coa.sample_id) return null;
    const sample = samples.find(s => s.id === coa.sample_id);
    return sample ? testsLabelForSample(sample) : null;
  }

  function handleDragStart(e: React.DragEvent, coaId: string) {
    e.dataTransfer.setData('text/coa-id', coaId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(coaId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }

  function handleDragOver(e: React.DragEvent, stage: CoaWorkflowStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStage(stage);
  }

  function handleDrop(e: React.DragEvent, stage: CoaWorkflowStage) {
    e.preventDefault();
    const coaId = e.dataTransfer.getData('text/coa-id');
    const coa = coas.find(c => c.id === coaId);
    if (coa && coaWorkflowStage(coa) !== stage) {
      void onMoveCoa(coa, stage);
    }
    handleDragEnd();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {COA_WORKFLOW_STEPS.map((step, i) => (
          <span key={step} className="inline-flex items-center gap-1 text-neutral-600">
            <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            {COA_WORKFLOW_LABELS[step]}
            {i < COA_WORKFLOW_STEPS.length - 1 && <ArrowRight size={12} className="text-neutral-400 mx-1" />}
          </span>
        ))}
      </div>

      <p className="text-xs text-neutral-500">
        New COAs start in <strong className="text-black">Issued</strong>, then move through{' '}
        <strong className="text-black">Verified</strong> to <strong className="text-black">Published</strong>.{' '}
        <strong className="text-amber-700">Awaiting Client Info</strong> is the leftmost column — drag a card
        there whenever intake or contact details are missing, so the client/company callout tells whoever picks
        it up who to follow up with. The <strong className="text-black">Awaiting COA</strong> lane above is
        separate — those are samples still needing testing/issuance, not client-info gaps.
      </p>

      {pendingSamples.length > 0 && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2 text-amber-900">
              <Clock size={14} /> Awaiting COA
            </h3>
            <span className="text-xs font-semibold text-amber-800 bg-white/70 px-2 py-0.5 rounded-full">
              {pendingSamples.length}
            </span>
          </div>
          <p className="px-4 pt-2 text-xs text-amber-800">
            Assigned or claimed samples with no COA issued yet — issue their certificate to move them onto the board.
          </p>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingSamples.map(item => {
              const { sample, order, priority, assigned_to: assignedTo } = item;
              const styles = LAB_PRIORITY_STYLES[priority];
              return (
                <article key={sample.id} className={`rounded-lg border bg-white p-3 shadow-sm ${styles.border}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                      {LAB_PRIORITY_LABELS[priority]}
                    </span>
                  </div>
                  <p className="font-medium text-sm text-black leading-snug truncate">
                    {sample.display_name || sample.sample_name}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">
                    {order.company_name || '—'} · {order.order_number}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
                    <UserCircle2 size={11} /> {chemistLabel(assignedTo)}
                  </p>
                  {onIssueCoa && (
                    <button
                      type="button"
                      onClick={() => onIssueCoa(sample)}
                      className="btn-primary text-xs py-1.5 gap-1 justify-center w-full mt-2"
                    >
                      Issue COA <ArrowRight size={11} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2 min-h-[520px]">
        {COA_WORKFLOW_BOARD_COLUMNS.map(stage => {
          const styles = COLUMN_STYLES[stage];
          const isOver = overStage === stage && draggingId !== null;
          const cards = grouped[stage];

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-[280px] sm:w-[300px] flex flex-col rounded-xl border border-atlas-border overflow-hidden transition-shadow ${
                isOver ? `ring-2 ${styles.ring} shadow-md` : ''
              }`}
              onDragOver={e => handleDragOver(e, stage)}
              onDragLeave={() => setOverStage(prev => (prev === stage ? null : prev))}
              onDrop={e => handleDrop(e, stage)}
            >
              <div className={`px-4 py-3 border-b flex items-center justify-between ${styles.header}`}>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  {stageIcon(stage)}
                  {COA_WORKFLOW_LABELS[stage]}
                </h3>
                <span className="text-xs font-semibold text-neutral-500 bg-white/70 px-2 py-0.5 rounded-full">
                  {cards.length}
                </span>
              </div>

              <div className={`flex-1 p-2 space-y-2 overflow-y-auto max-h-[560px] ${styles.body}`}>
                {cards.length === 0 ? (
                  <div className={`rounded-lg border-2 border-dashed p-6 text-center text-xs text-neutral-400 ${
                    isOver ? 'border-current bg-white/60' : 'border-neutral-200'
                  }`}>
                    {isOver ? 'Drop here' : 'No cards'}
                  </div>
                ) : (
                  cards.map(coa => {
                    const currentStage = coaWorkflowStage(coa);
                    const isDragging = draggingId === coa.id;
                    const isMoving = movingId === coa.id;
                    const client = clientForCoa(coa);
                    const order = orderForCoa(coa);
                    const companyName = order?.company_name || coa.company_name;
                    const accession = accessionForCoa(coa);
                    const testsLabel = testsLabelForCoa(coa);
                    const isAwaitingInfo = currentStage === 'awaiting_info';

                    return (
                      <article
                        key={coa.id}
                        draggable={!isMoving}
                        onDragStart={e => handleDragStart(e, coa.id)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-lg border bg-white p-3 shadow-sm transition-all ${
                          isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'
                        } ${isMoving ? 'opacity-60 pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical size={14} className="text-neutral-300 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm text-black leading-snug truncate">
                                {coa.display_name || coa.sample_name}
                              </p>
                              <ResultBadge result={coa.overall_result} />
                            </div>

                            {isAwaitingInfo && (
                              <div className="rounded-md border border-amber-300 bg-amber-100/80 px-2 py-1.5 space-y-0.5">
                                <p className="text-xs font-bold text-amber-900 flex items-center gap-1 truncate">
                                  <Building2 size={11} className="flex-shrink-0" /> {companyName || 'Unknown company'}
                                </p>
                                <p className="text-xs text-amber-800 flex items-center gap-1 truncate">
                                  <UserCircle2 size={11} className="flex-shrink-0" />
                                  {client?.full_name || 'Unknown contact'}
                                </p>
                                {client?.phone && (
                                  <p className="text-xs text-amber-800 flex items-center gap-1 truncate">
                                    <Phone size={11} className="flex-shrink-0" /> {client.phone}
                                  </p>
                                )}
                              </div>
                            )}

                            {!isAwaitingInfo && (
                              <>
                                <p className="text-xs text-neutral-500 truncate flex items-center gap-1">
                                  <Building2 size={11} className="text-neutral-400 flex-shrink-0" /> {companyName || '—'}
                                </p>
                                <p className="text-xs text-neutral-500 truncate flex items-center gap-1">
                                  <UserCircle2 size={11} className="text-neutral-400 flex-shrink-0" />
                                  {client?.full_name || 'Unknown contact'}
                                  {client?.phone && <span className="text-neutral-400"> · {client.phone}</span>}
                                </p>
                              </>
                            )}

                            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-neutral-500">
                              {order && (
                                <span className="flex items-center gap-1">
                                  <Hash size={10} className="text-neutral-400" /> {order.order_number}
                                </span>
                              )}
                              {coa.batch_number && <span>Batch {coa.batch_number}</span>}
                              {accession && (
                                <span className="flex items-center gap-1 font-mono" title={accession.label}>
                                  <Fingerprint size={10} className="text-neutral-400" />
                                  {accession.label} {accession.value}
                                </span>
                              )}
                            </div>

                            {testsLabel && (
                              <p className="text-[11px] text-neutral-400 truncate">Tests: {testsLabel}</p>
                            )}

                            <p className="text-[11px] text-neutral-400">{formatDate(coa.issued_at)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 mt-2 border-t border-atlas-border">
                          <Link
                            to={`/coa/${coa.slug}`}
                            className="btn-outline text-xs py-1 px-2 gap-1"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink size={11} /> Preview
                          </Link>

                          {currentStage === 'issued' && (
                            <button
                              type="button"
                              onClick={() => void onMoveCoa(coa, 'verified')}
                              disabled={!!movingId}
                              className="btn-secondary text-xs py-1 px-2 gap-1"
                            >
                              <Shield size={11} /> Verify
                            </button>
                          )}

                          {isAwaitingInfo && (
                            <button
                              type="button"
                              onClick={() => void onMoveCoa(coa, 'issued')}
                              disabled={!!movingId}
                              className="btn-secondary text-xs py-1 px-2 gap-1"
                            >
                              <ArrowLeft size={11} /> Back to Issued
                            </button>
                          )}

                          {currentStage === 'verified' && (
                            <button
                              type="button"
                              onClick={() => void onMoveCoa(coa, 'published')}
                              disabled={!!movingId}
                              className="btn-primary text-xs py-1 px-2 gap-1"
                            >
                              <Globe size={11} /> Publish
                            </button>
                          )}

                          {currentStage === 'published' && (
                            <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle size={12} /> Client visible
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}

                {cards.length > 0 && isOver && (
                  <div className="rounded-lg border-2 border-dashed border-current p-3 text-center text-xs text-neutral-500 bg-white/60">
                    Drop to move here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
