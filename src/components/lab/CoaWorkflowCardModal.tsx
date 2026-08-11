import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CheckCircle, Clock, Download, ExternalLink,
  Fingerprint, FlaskConical, Globe, Hash, Phone, Shield, UserCircle2, X,
} from 'lucide-react';
import { COA, Order, UserProfile } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import {
  CoaWorkflowStage, canEditLiveCoa, canPrepareCoa, canReturnCoaToTesting, canUpdatePendingPublishedCoa,
  coaSignatureProgress, coaWorkflowStage, COA_WORKFLOW_LABELS,
} from '../../lib/coaWorkflow';
import { pendingAssayLabels } from '../../lib/coaDisplayPanels';
import { resolveEtaAt } from '../../lib/etaHeat';
import ResultBadge from '../ui/ResultBadge';
import WorkflowOrderTools from './WorkflowOrderTools';

type ChemistOpt = { id: string; name: string; role?: string };

type Props = {
  coa: COA;
  onClose: () => void;
  onMoveCoa: (
    coa: COA,
    targetStage: CoaWorkflowStage,
    opts?: { reviewAssignedTo?: string | null; force?: boolean },
  ) => void | Promise<void>;
  movingId?: string | null;
  onPrepare: (coa: COA) => void;
  onRestartCoa?: (coa: COA) => void;
  onDownloadPdf: (coa: COA) => void;
  downloading?: boolean;
  onSaveOrderEta?: (order: Order, iso: string | null) => void | Promise<void>;
  etaSaving?: boolean;
  order?: Order | null;
  client?: UserProfile | null;
  companyName?: string;
  lot?: string;
  testsLabel?: string;
  accession?: { label: string; value: string } | null;
  chemistLabel: (id: string | null | undefined) => string;
  chemistId?: string | null;
  currentUserId?: string | null;
  reviewerOptions: ChemistOpt[];
  isAdmin?: boolean;
};

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-0.5">{label}</p>
      <p className="text-sm text-neutral-800 flex items-center gap-1.5 min-w-0">
        <span className="text-neutral-400 shrink-0">{icon}</span>
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

export default function CoaWorkflowCardModal({
  coa,
  onClose,
  onMoveCoa,
  movingId,
  onPrepare,
  onRestartCoa,
  onDownloadPdf,
  downloading = false,
  onSaveOrderEta,
  etaSaving = false,
  order = null,
  client = null,
  companyName = '',
  lot = '',
  testsLabel = '',
  accession = null,
  chemistLabel,
  chemistId = null,
  currentUserId = null,
  reviewerOptions,
  isAdmin = false,
}: Props) {
  const currentStage = coaWorkflowStage(coa);
  const needsPendingUpdate = canUpdatePendingPublishedCoa(coa);
  const canLiveEdit = canEditLiveCoa(coa);
  const pendingLabels = needsPendingUpdate ? pendingAssayLabels(coa.panel_results) : [];
  const reviewAssigneeId = coa.review_assigned_to ?? null;
  const isAwaitingInfo = currentStage === 'awaiting_info';
  const sig = coaSignatureProgress(coa);
  const etaIso = order ? resolveEtaAt(order) : null;
  const [reviewPick, setReviewPick] = useState(false);
  const [reviewAssignee, setReviewAssignee] = useState('');

  const canSignOff = currentStage === 'pending_review' && (
    !reviewAssigneeId
    || reviewAssigneeId === currentUserId
    || reviewerOptions.some(r => r.id === currentUserId && (r.role === 'admin' || r.role === 'reviewer'))
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function move(stage: CoaWorkflowStage, opts?: { reviewAssignedTo?: string | null }) {
    await onMoveCoa(coa, stage, opts);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-card-modal-title"
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-atlas-border"
      >
        <div className="sticky top-0 z-10 bg-white border-b border-atlas-border px-4 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              {COA_WORKFLOW_LABELS[currentStage]}
            </p>
            <h2 id="coa-card-modal-title" className="text-lg font-bold text-black leading-snug truncate">
              {coa.display_name || coa.sample_name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ResultBadge result={coa.overall_result} />
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
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-black shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {needsPendingUpdate && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
                <Clock size={12} /> Pending assays — update results
              </p>
              {pendingLabels.length > 0 && (
                <p className="text-sm text-amber-800 mt-1">{pendingLabels.join(' · ')}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <MetaRow
              icon={<Hash size={12} />}
              label="Lot"
              value={lot || 'Not provided'}
            />
            {order && (
              <MetaRow icon={<Hash size={12} />} label="Order" value={order.order_number} />
            )}
            {accession && (
              <MetaRow
                icon={<Fingerprint size={12} />}
                label={accession.label}
                value={accession.value}
              />
            )}
            <MetaRow
              icon={<Building2 size={12} />}
              label="Company"
              value={companyName || '—'}
            />
            <MetaRow
              icon={<UserCircle2 size={12} />}
              label="Contact"
              value={[client?.full_name, client?.phone].filter(Boolean).join(' · ') || '—'}
            />
            {chemistId && (
              <MetaRow
                icon={<UserCircle2 size={12} />}
                label="Chemist"
                value={chemistLabel(chemistId)}
              />
            )}
            {currentStage === 'pending_review' && (
              <MetaRow
                icon={<Shield size={12} />}
                label="Reviewer"
                value={chemistLabel(reviewAssigneeId)}
              />
            )}
            {testsLabel && (
              <MetaRow icon={<FlaskConical size={12} />} label="Tests" value={testsLabel} />
            )}
            <MetaRow icon={<Clock size={12} />} label="Issued" value={formatDate(coa.issued_at)} />
            {etaIso && (
              <MetaRow icon={<Clock size={12} />} label="ETA" value={formatDate(etaIso)} />
            )}
            {isAwaitingInfo && client?.phone && (
              <MetaRow icon={<Phone size={12} />} label="Phone" value={client.phone} />
            )}
          </div>

          {order && (
            <WorkflowOrderTools
              order={order}
              sampleId={coa.sample_id}
              isAdmin={isAdmin}
              saving={etaSaving}
              onSaveEta={onSaveOrderEta}
              defaultOpen
            />
          )}

          <div className="border-t border-atlas-border pt-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Actions</p>
            <div className="flex flex-wrap gap-2">
              {needsPendingUpdate && (
                <button type="button" onClick={() => onPrepare(coa)} className="btn-primary text-sm py-2 px-3 gap-1.5">
                  <FlaskConical size={14} /> Update pending
                </button>
              )}
              {canLiveEdit && !needsPendingUpdate && (
                <button type="button" onClick={() => onPrepare(coa)} className="btn-primary text-sm py-2 px-3 gap-1.5">
                  <FlaskConical size={14} /> Edit COA
                </button>
              )}
              {canPrepareCoa(coa) && !needsPendingUpdate && !canLiveEdit && (
                <button type="button" onClick={() => onPrepare(coa)} className="btn-outline text-sm py-2 px-3 gap-1.5">
                  Prepare
                </button>
              )}
              {canLiveEdit && onRestartCoa && (
                <button
                  type="button"
                  onClick={() => { onRestartCoa(coa); onClose(); }}
                  disabled={!!movingId}
                  className="btn-outline text-sm py-2 px-3 gap-1.5"
                >
                  Full edit
                </button>
              )}
              <Link to={`/coa/${coa.slug}`} className="btn-outline text-sm py-2 px-3 gap-1.5" onClick={onClose}>
                <ExternalLink size={14} /> Open certificate
              </Link>
              <button
                type="button"
                disabled={downloading}
                className="btn-outline text-sm py-2 px-3 gap-1.5"
                onClick={() => onDownloadPdf(coa)}
              >
                <Download size={14} />
                {downloading ? 'Saving…' : 'Download PDF'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {currentStage === 'issued' && (
                reviewPick ? (
                  <div className="w-full space-y-2">
                    <select
                      value={reviewAssignee}
                      onChange={e => setReviewAssignee(e.target.value)}
                      className="input-field text-sm"
                    >
                      <option value="">Assign lab director / chemist…</option>
                      {reviewerOptions.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.role ? ` (${r.role})` : ''}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!reviewAssignee || !!movingId}
                        onClick={() => void move('pending_review', { reviewAssignedTo: reviewAssignee })}
                        className="btn-secondary text-sm py-2 px-3 gap-1.5 flex-1"
                      >
                        <Shield size={14} /> Send (1/2)
                      </button>
                      <button type="button" onClick={() => { setReviewPick(false); setReviewAssignee(''); }} className="btn-outline text-sm py-2 px-3">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReviewPick(true)}
                    disabled={!!movingId}
                    className="btn-secondary text-sm py-2 px-3 gap-1.5"
                  >
                    <Shield size={14} /> Send for review
                  </button>
                )
              )}

              {currentStage === 'testing_in_progress' && (
                <>
                  {onRestartCoa && (
                    <button
                      type="button"
                      onClick={() => { onRestartCoa(coa); onClose(); }}
                      disabled={!!movingId}
                      className="btn-primary text-sm py-2 px-3 gap-1.5"
                    >
                      <FlaskConical size={14} /> Restart COA
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void move('issued')}
                    disabled={!!movingId}
                    className="btn-secondary text-sm py-2 px-3 gap-1.5"
                  >
                    <ArrowRight size={14} /> Return to Issued
                  </button>
                </>
              )}

              {canReturnCoaToTesting(currentStage) && (
                <button
                  type="button"
                  onClick={() => void move('testing_in_progress')}
                  disabled={!!movingId}
                  className="btn-outline text-sm py-2 px-3 gap-1.5"
                >
                  <ArrowLeft size={14} /> Back to testing
                </button>
              )}

              {isAwaitingInfo && (
                <button
                  type="button"
                  onClick={() => void move('issued')}
                  disabled={!!movingId}
                  className="btn-secondary text-sm py-2 px-3 gap-1.5"
                >
                  <ArrowLeft size={14} /> Back to Issued
                </button>
              )}

              {currentStage === 'pending_review' && canSignOff && (
                <button
                  type="button"
                  onClick={() => void move('verified')}
                  disabled={!!movingId}
                  className="btn-primary text-sm py-2 px-3 gap-1.5"
                >
                  <CheckCircle size={14} /> Sign off (2/2)
                </button>
              )}

              {currentStage === 'verified' && (
                <button
                  type="button"
                  onClick={() => void move('published')}
                  disabled={!!movingId}
                  className="btn-primary text-sm py-2 px-3 gap-1.5"
                >
                  <Globe size={14} /> Publish
                </button>
              )}

              {(currentStage === 'issued' || currentStage === 'pending_review' || currentStage === 'awaiting_info') && (
                <button
                  type="button"
                  onClick={() => void move('published')}
                  disabled={!!movingId}
                  className="btn-secondary text-sm py-2 px-3 gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                >
                  <Globe size={14} /> Publish now
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
