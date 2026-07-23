import { useMemo, useState } from 'react';
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
  CoaWorkflowStage, canPrepareCoa, coaSignatureProgress, coaWorkflowStage,
} from '../../lib/coaWorkflow';
import { LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES, QueueSampleItem, testsLabelForSample } from '../../lib/labQueue';
import CoaPdfPrepModal from './CoaPdfPrepModal';

interface Props {
  coas: COA[];
  onMoveCoa: (
    coa: COA,
    targetStage: CoaWorkflowStage,
    opts?: { reviewAssignedTo?: string | null; force?: boolean },
  ) => void | Promise<void>;
  movingId?: string | null;
  onCoaImagesSaved?: (coa: COA) => void;
  /** Samples still awaiting a COA — shown in Testing in Progress. */
  pendingSamples?: QueueSampleItem[];
  onIssueCoa?: (sample: OrderSample) => void;
  chemists?: { id: string; name: string }[];
  /** Reviewers eligible for second signature (chemists, admins, lab director). */
  reviewers?: { id: string; name: string; role?: string }[];
  clients?: UserProfile[];
  orders?: Order[];
  samples?: OrderSample[];
  /** Logged-in chemist — cards assigned to them are highlighted. */
  currentUserId?: string | null;
}

function ResultBadge({ result }: { result?: COA['overall_result'] }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  if (result === 'pending') return <span className="badge-pending"><Clock size={10} /> Pending</span>;
  return null;
}

function accessionForCoa(coa: COA): { label: string; value: string } | null {
  if (coa.accession_number?.trim()) return { label: 'Accession', value: coa.accession_number.trim() };
  if (coa.seal_serial?.trim()) return { label: 'Seal', value: coa.seal_serial.trim() };
  if (coa.signature?.trim()) return { label: 'Accession', value: coa.signature.trim() };
  return null;
}

const COLUMN_STYLES: Record<CoaWorkflowStage, { header: string; body: string; ring: string }> = {
  awaiting_info: {
    header: 'bg-amber-50 border-amber-200',
    body: 'bg-amber-50/40',
    ring: 'ring-amber-400',
  },
  testing_in_progress: {
    header: 'bg-sky-50 border-sky-200',
    body: 'bg-sky-50/40',
    ring: 'ring-sky-400',
  },
  issued: {
    header: 'bg-neutral-100 border-neutral-200',
    body: 'bg-neutral-50/80',
    ring: 'ring-brand-400',
  },
  pending_review: {
    header: 'bg-violet-50 border-violet-200',
    body: 'bg-violet-50/40',
    ring: 'ring-violet-400',
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
    case 'awaiting_info':
      return <MessageCircle size={14} className="text-amber-600" />;
    case 'testing_in_progress':
      return <Clock size={14} className="text-sky-600" />;
    case 'issued':
      return <FlaskConical size={14} />;
    case 'pending_review':
      return <Shield size={14} className="text-violet-600" />;
    case 'verified':
      return <Shield size={14} className="text-brand-600" />;
    case 'published':
      return <Globe size={14} className="text-emerald-600" />;
  }
}

function AssignedToYouBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-sky-400 bg-sky-100 text-sky-900">
      Assigned to you
    </span>
  );
}

export default function CoaWorkflowBoard({
  coas, onMoveCoa, movingId, onCoaImagesSaved, pendingSamples = [], onIssueCoa, chemists = [],
  reviewers = [], clients = [], orders = [], samples = [], currentUserId = null,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CoaWorkflowStage | null>(null);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);
  const [reviewPickFor, setReviewPickFor] = useState<string | null>(null);
  const [reviewAssignee, setReviewAssignee] = useState('');

  const reviewerOptions = reviewers.length > 0 ? reviewers : chemists;

  function chemistLabel(userId: string | null | undefined): string {
    if (!userId) return 'Unassigned';
    if (currentUserId && userId === currentUserId) return 'You';
    return chemists.find(c => c.id === userId)?.name || 'Assigned';
  }

  function assigneeForCoa(coa: COA): string | null {
    if (!coa.sample_id) return null;
    return samples.find(s => s.id === coa.sample_id)?.assigned_to ?? null;
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

  const grouped = useMemo(() => {
    const groups: Record<CoaWorkflowStage, COA[]> = {
      awaiting_info: [],
      testing_in_progress: [],
      issued: [],
      pending_review: [],
      verified: [],
      published: [],
    };
    for (const coa of coas) {
      groups[coaWorkflowStage(coa)].push(coa);
    }
    // Mine-first within each COA column
    for (const stage of COA_WORKFLOW_BOARD_COLUMNS) {
      if (stage === 'testing_in_progress') continue;
      groups[stage].sort((a, b) => {
        const aMine = currentUserId && (
          a.review_assigned_to === currentUserId || assigneeForCoa(a) === currentUserId
        ) ? 0 : 1;
        const bMine = currentUserId && (
          b.review_assigned_to === currentUserId || assigneeForCoa(b) === currentUserId
        ) ? 0 : 1;
        return aMine - bMine;
      });
    }
    return groups;
  }, [coas, samples, currentUserId]);

  const sortedPending = useMemo(() => {
    const list = [...pendingSamples];
    list.sort((a, b) => {
      const aMine = currentUserId && a.assigned_to === currentUserId ? 0 : 1;
      const bMine = currentUserId && b.assigned_to === currentUserId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return 0;
    });
    return list;
  }, [pendingSamples, currentUserId]);

  function handleDragStart(e: React.DragEvent, coaId: string) {
    const target = e.target as HTMLElement | null;
    // Let buttons/inputs/selects work normally; don't start a card drag from them.
    if (target?.closest('button, select, input, textarea, label')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', coaId);
    e.dataTransfer.setData('text/coa-id', coaId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(coaId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }

  function handleDragOver(e: React.DragEvent, stage: CoaWorkflowStage) {
    // Testing column is for pre-issue samples — not a COA drop target.
    if (stage === 'testing_in_progress') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStage(stage);
  }

  function handleDrop(e: React.DragEvent, stage: CoaWorkflowStage) {
    e.preventDefault();
    if (stage === 'testing_in_progress') {
      handleDragEnd();
      return;
    }
    const coaId = e.dataTransfer.getData('text/coa-id')
      || e.dataTransfer.getData('text/plain')
      || draggingId;
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
        After issue, send the certificate to <strong className="text-violet-800">Pending Review</strong> and assign a
        lab director or chemist for the second signature (shows <strong>1/2</strong>). After they sign off it becomes
        Verified (2/2), then Published. Cards marked <strong className="text-sky-800">Assigned to you</strong> are yours.
        Chemists can <strong>Publish now</strong> from any stage to override stopping points when needed.
      </p>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          onClose={() => setPrepCoa(null)}
          onSaved={updated => {
            onCoaImagesSaved?.(updated);
            setPrepCoa(null);
          }}
        />
      )}

      <div className="flex gap-4 overflow-x-auto pb-2 min-h-[520px]">
        {COA_WORKFLOW_BOARD_COLUMNS.map(stage => {
          const styles = COLUMN_STYLES[stage];
          const isTestingCol = stage === 'testing_in_progress';
          const isOver = !isTestingCol && overStage === stage && draggingId !== null;
          const cards = grouped[stage];
          const columnCount = isTestingCol ? sortedPending.length + cards.length : cards.length;

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
                  {columnCount}
                </span>
              </div>

              <div className={`flex-1 p-2 space-y-2 overflow-y-auto max-h-[560px] ${styles.body}`}>
                {isTestingCol && (
                  <>
                    {sortedPending.length === 0 && cards.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400">
                        No samples in testing
                      </div>
                    ) : null}

                    {sortedPending.map(item => {
                      const { sample, order, priority, assigned_to: assignedTo } = item;
                      const mine = !!currentUserId && assignedTo === currentUserId;
                      const pStyles = LAB_PRIORITY_STYLES[priority];
                      return (
                        <article
                          key={sample.id}
                          className={`rounded-lg border bg-white p-3 shadow-sm ${pStyles.border} ${
                            mine ? 'ring-2 ring-sky-400 border-sky-300' : ''
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${pStyles.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${pStyles.dot}`} />
                              {LAB_PRIORITY_LABELS[priority]}
                            </span>
                            {mine && <AssignedToYouBadge />}
                          </div>
                          <p className="font-medium text-sm text-black leading-snug truncate">
                            {sample.display_name || sample.sample_name}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">
                            {order.company_name || '—'} · {order.order_number}
                          </p>
                          <p className={`text-xs mt-1 flex items-center gap-1 ${mine ? 'text-sky-800 font-semibold' : 'text-neutral-400'}`}>
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
                  </>
                )}

                {!isTestingCol && cards.length === 0 ? (
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
                    const assignee = assigneeForCoa(coa);
                    const reviewAssigneeId = coa.review_assigned_to ?? null;
                    const mine = !!currentUserId && (
                      assignee === currentUserId || reviewAssigneeId === currentUserId
                    );
                    const sig = coaSignatureProgress(coa);
                    const canSignOff = currentStage === 'pending_review' && (
                      !reviewAssigneeId
                      || reviewAssigneeId === currentUserId
                      || reviewerOptions.some(r => r.id === currentUserId && (r.role === 'admin' || r.role === 'reviewer'))
                    );

                    return (
                      <article
                        key={coa.id}
                        draggable={!isMoving}
                        onDragStart={e => handleDragStart(e, coa.id)}
                        onDragEnd={handleDragEnd}
                        className={`rounded-lg border bg-white p-3 shadow-sm transition-all select-none ${
                          isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'
                        } ${isMoving ? 'opacity-60 pointer-events-none' : 'cursor-grab active:cursor-grabbing'} ${
                          mine ? 'ring-2 ring-sky-400 border-sky-300' : ''
                        }`}
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

                            {mine && <AssignedToYouBadge />}

                            {(currentStage === 'pending_review' || currentStage === 'verified' || currentStage === 'published' || currentStage === 'issued') && (
                              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                sig.signed >= 2
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : sig.signed === 1
                                    ? 'border-violet-300 bg-violet-50 text-violet-800'
                                    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                              }`}>
                                {sig.label}
                              </span>
                            )}

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

                            {assignee && (
                              <p className={`text-xs flex items-center gap-1 ${assignee === currentUserId ? 'text-sky-800 font-semibold' : 'text-neutral-500'}`}>
                                <UserCircle2 size={11} /> Chemist: {chemistLabel(assignee)}
                              </p>
                            )}

                            {currentStage === 'pending_review' && (
                              <p className={`text-xs flex items-center gap-1 ${reviewAssigneeId === currentUserId ? 'text-violet-800 font-semibold' : 'text-neutral-500'}`}>
                                <Shield size={11} /> Reviewer: {chemistLabel(reviewAssigneeId)}
                              </p>
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
                          {canPrepareCoa(coa) && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setPrepCoa(coa);
                              }}
                              className="btn-outline text-xs py-1 px-2 gap-1"
                            >
                              Prepare
                            </button>
                          )}
                          <Link
                            to={`/coa/${coa.slug}`}
                            draggable={false}
                            className="btn-outline text-xs py-1 px-2 gap-1"
                            onClick={e => e.stopPropagation()}
                            onDragStart={e => e.preventDefault()}
                          >
                            <ExternalLink size={11} /> Open & download PNG
                          </Link>

                          {currentStage === 'issued' && (
                            reviewPickFor === coa.id ? (
                              <div className="w-full space-y-1.5" onClick={e => e.stopPropagation()}>
                                <select
                                  value={reviewAssignee}
                                  onChange={e => setReviewAssignee(e.target.value)}
                                  className="input-field text-xs py-1.5"
                                >
                                  <option value="">Assign lab director / chemist…</option>
                                  {reviewerOptions.map(r => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}{r.role ? ` (${r.role})` : ''}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    disabled={!reviewAssignee || !!movingId}
                                    onClick={() => {
                                      void onMoveCoa(coa, 'pending_review', { reviewAssignedTo: reviewAssignee });
                                      setReviewPickFor(null);
                                      setReviewAssignee('');
                                    }}
                                    className="btn-secondary text-xs py-1 px-2 gap-1 flex-1"
                                  >
                                    <Shield size={11} /> Send (1/2)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setReviewPickFor(null); setReviewAssignee(''); }}
                                    className="btn-outline text-xs py-1 px-2"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setReviewPickFor(coa.id);
                                  setReviewAssignee('');
                                }}
                                disabled={!!movingId}
                                className="btn-secondary text-xs py-1 px-2 gap-1"
                              >
                                <Shield size={11} /> Send for review
                              </button>
                            )
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

                          {currentStage === 'pending_review' && canSignOff && (
                            <button
                              type="button"
                              onClick={() => void onMoveCoa(coa, 'verified')}
                              disabled={!!movingId}
                              className="btn-primary text-xs py-1 px-2 gap-1"
                            >
                              <CheckCircle size={11} /> Sign off (2/2)
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

                          {(currentStage === 'issued' || currentStage === 'pending_review' || currentStage === 'awaiting_info') && (
                            <button
                              type="button"
                              onClick={() => void onMoveCoa(coa, 'published')}
                              disabled={!!movingId}
                              className="btn-secondary text-xs py-1 px-2 gap-1 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                              title="Override workflow stopping points and publish immediately"
                            >
                              <Globe size={11} /> Publish now
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
