import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Clock, FlaskConical, Globe, GripVertical, Hash, MessageCircle, Shield, UserCircle2, X,
} from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import {
  COA_WORKFLOW_BOARD_COLUMNS, COA_WORKFLOW_LABELS, COA_WORKFLOW_STEPS,
  CoaWorkflowStage, canUpdatePendingPublishedCoa,
  coaSignatureProgress, coaWorkflowStage,
} from '../../lib/coaWorkflow';
import { LAB_PRIORITY_STYLES, QueueSampleItem, testsLabelForSample } from '../../lib/labQueue';
import PriorityBanner from './PriorityBanner';
import { parseSampleMetadata } from '../../lib/coaPanels';
import { pendingAssayLabels } from '../../lib/coaDisplayPanels';
import { downloadCoaPdf } from '../../lib/coaPdf';
import CoaPdfPrepModal from './CoaPdfPrepModal';
import CoaWorkflowCardModal, { WorkflowCardNav } from './CoaWorkflowCardModal';
import WorkflowOrderTools from './WorkflowOrderTools';
import { resolveEtaAt } from '../../lib/etaHeat';
import ResultBadge from '../ui/ResultBadge';

type BoardNavItem =
  | { kind: 'coa'; id: string; coa: COA }
  | { kind: 'pending'; id: string; item: QueueSampleItem };

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
  /** Open Issue COA with this certificate's values for a restart / re-issue. */
  onRestartCoa?: (coa: COA) => void;
  /** Save client-visible ETA from a workflow card. */
  onSaveOrderEta?: (order: Order, iso: string | null) => void | Promise<void>;
  etaSavingOrderId?: string | null;
  chemists?: { id: string; name: string; role?: string }[];
  /** Reviewers eligible for second signature (chemists, admins, lab director). */
  reviewers?: { id: string; name: string; role?: string }[];
  clients?: UserProfile[];
  orders?: Order[];
  samples?: OrderSample[];
  /** Logged-in chemist — cards assigned to them are highlighted. */
  currentUserId?: string | null;
  /** Show admin order detail link on ETA/Notes panel. */
  isAdmin?: boolean;
}

function accessionForCoa(coa: COA): { label: string; value: string } | null {
  if (coa.accession_number?.trim()) return { label: 'LIMS ID', value: coa.accession_number.trim() };
  if (coa.seal_serial?.trim()) return { label: 'Seal', value: coa.seal_serial.trim() };
  if (coa.signature?.trim()) return { label: 'LIMS ID', value: coa.signature.trim() };
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

function LotLine({ lot }: { lot: string }) {
  return (
    <p className="text-xs text-neutral-600">
      <span className="font-semibold text-neutral-800">Lot</span>
      {': '}
      {lot ? (
        <span className="font-mono font-medium text-black">{lot}</span>
      ) : (
        <span className="text-amber-700">Not provided</span>
      )}
    </p>
  );
}

type OrderBundle = {
  key: string;
  order: Order | null;
  orderNumber: string;
  companyName: string;
  coas: COA[];
  pending: QueueSampleItem[];
};

function peptideLabelFromCoa(coa: COA): string {
  return (coa.display_name || coa.sample_name || 'Sample').trim();
}

function peptideLabelFromSample(sample: OrderSample): string {
  return (sample.display_name || sample.sample_name || 'Sample').trim();
}

function bundleItemCount(bundle: OrderBundle): number {
  return bundle.coas.length + bundle.pending.length;
}

function isCollapsibleBundle(bundle: OrderBundle): boolean {
  return Boolean(bundle.order) && bundleItemCount(bundle) >= 2;
}

function buildOrderBundles(
  coas: COA[],
  pending: QueueSampleItem[],
  orders: Order[],
): OrderBundle[] {
  const map = new Map<string, OrderBundle>();

  const ensure = (
    orderId: string | null | undefined,
    singletonKey: string,
    orderHint?: Order | null,
    companyFallback = '',
  ): OrderBundle => {
    const key = orderId || singletonKey;
    let bundle = map.get(key);
    if (!bundle) {
      const order = (orderId ? orders.find(o => o.id === orderId) : null) || orderHint || null;
      bundle = {
        key,
        order,
        orderNumber: order?.order_number || 'No order #',
        companyName: order?.company_name || companyFallback || '',
        coas: [],
        pending: [],
      };
      map.set(key, bundle);
    } else if (!bundle.companyName && companyFallback) {
      bundle.companyName = companyFallback;
    }
    return bundle;
  };

  for (const coa of coas) {
    const order = coa.order_id ? orders.find(o => o.id === coa.order_id) : undefined;
    ensure(coa.order_id, `__coa:${coa.id}`, order, coa.company_name || '').coas.push(coa);
  }
  for (const item of pending) {
    ensure(item.order.id, `__pending:${item.sample.id}`, item.order, item.order.company_name || '')
      .pending.push(item);
  }

  return Array.from(map.values());
}

function OrderGroupShell({
  bundle,
  expanded,
  onToggle,
  mine,
  children,
  tools,
}: {
  bundle: OrderBundle;
  expanded: boolean;
  onToggle: () => void;
  mine: boolean;
  children: ReactNode;
  tools?: ReactNode;
}) {
  const peptides = [
    ...bundle.pending.map(p => ({
      key: `p-${p.sample.id}`,
      name: peptideLabelFromSample(p.sample),
      tone: 'pending' as const,
    })),
    ...bundle.coas.map(c => ({
      key: `c-${c.id}`,
      name: peptideLabelFromCoa(c),
      tone: c.overall_result === 'fail' ? ('fail' as const)
        : c.overall_result === 'pass' ? ('pass' as const)
          : ('neutral' as const),
    })),
  ];
  const preview = peptides.slice(0, 4);
  const extra = peptides.length - preview.length;
  const failCount = bundle.coas.filter(c => c.overall_result === 'fail').length;
  const pendingCount = bundle.pending.length;
  const coaCount = bundle.coas.length;

  return (
    <div
      className={`rounded-xl border bg-white/90 shadow-sm overflow-hidden ${
        mine ? 'ring-2 ring-sky-400 border-sky-300' : 'border-atlas-border'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-2.5 py-2 hover:bg-neutral-50/80 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-neutral-400 shrink-0">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-black truncate flex items-center gap-1">
                <Hash size={11} className="text-neutral-400 shrink-0" />
                {bundle.orderNumber}
              </p>
              <span className="text-[10px] font-semibold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-full shrink-0">
                {bundleItemCount(bundle)}
              </span>
            </div>
            {bundle.companyName ? (
              <p className="text-[11px] text-neutral-500 truncate flex items-center gap-1">
                <Building2 size={10} className="text-neutral-400 shrink-0" />
                {bundle.companyName}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {preview.map(p => (
                <span
                  key={p.key}
                  className={`inline-flex max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                    p.tone === 'fail'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : p.tone === 'pass'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : p.tone === 'pending'
                          ? 'border-sky-200 bg-sky-50 text-sky-800'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                  title={p.name}
                >
                  {p.name}
                </span>
              ))}
              {extra > 0 ? (
                <span className="text-[10px] font-semibold text-neutral-500 px-1 py-0.5">+{extra}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {mine ? <AssignedToYouBadge /> : null}
              {failCount > 0 ? (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-red-300 bg-red-50 text-red-800">
                  {failCount} fail
                </span>
              ) : null}
              {pendingCount > 0 ? (
                <span className="text-[10px] font-semibold text-sky-800">
                  {pendingCount} awaiting COA
                </span>
              ) : null}
              {coaCount > 0 ? (
                <span className="text-[10px] font-semibold text-neutral-500">
                  {coaCount} COA{coaCount === 1 ? '' : 's'}
                </span>
              ) : null}
              <span className="text-[10px] text-neutral-400 ml-auto">
                {expanded ? 'Hide' : 'Show cards'}
              </span>
            </div>
          </div>
        </div>
      </button>
      {tools ? <div className="px-2.5 pb-2">{tools}</div> : null}
      {expanded ? (
        <div className="px-1.5 pb-1.5 space-y-2 border-t border-atlas-border/70 bg-neutral-50/50">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PendingCardModal({
  item,
  onClose,
  chemistLabel,
  onIssueCoa,
  isAdmin,
  etaSaving,
  onSaveOrderEta,
  nav,
}: {
  item: QueueSampleItem;
  onClose: () => void;
  chemistLabel: (id: string | null | undefined) => string;
  onIssueCoa?: (sample: OrderSample) => void;
  isAdmin?: boolean;
  etaSaving?: boolean;
  onSaveOrderEta?: (order: Order, iso: string | null) => void | Promise<void>;
  nav?: WorkflowCardNav | null;
}) {
  const hasPrev = !!nav && nav.index > 0;
  const hasNext = !!nav && nav.index < nav.total - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') && hasPrev) {
        e.preventDefault();
        nav?.onPrev();
      } else if ((e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') && hasNext) {
        e.preventDefault();
        nav?.onNext();
      }
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, nav, hasPrev, hasNext]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-atlas-border">
        <div className="sticky top-0 z-10 bg-white border-b border-atlas-border px-5 sm:px-6 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Awaiting COA</p>
            <h2 className="text-lg font-bold text-black truncate">
              {item.sample.display_name || item.sample.sample_name}
            </h2>
            <LotLine lot={(parseSampleMetadata(item.sample.metadata).batch_number || '').trim()} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {nav && nav.total > 1 && (
              <div className="flex items-center gap-0.5 mr-1 rounded-lg border border-atlas-border bg-neutral-50 p-0.5">
                <button
                  type="button"
                  onClick={nav.onPrev}
                  disabled={!hasPrev}
                  className="p-1.5 rounded-md text-neutral-600 hover:bg-white hover:text-black disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Previous card"
                  title="Previous (← or K)"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="px-1.5 text-[11px] font-semibold tabular-nums text-neutral-600 min-w-[3.25rem] text-center">
                  {nav.index + 1} / {nav.total}
                </span>
                <button
                  type="button"
                  onClick={nav.onNext}
                  disabled={!hasNext}
                  className="p-1.5 rounded-md text-neutral-600 hover:bg-white hover:text-black disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Next card"
                  title="Next (→ or J)"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5 space-y-3">
          <PriorityBanner priority={item.priority} rush={item.order.rush_processing} compact />
          <p className="text-sm text-neutral-600">
            {item.order.company_name || '—'} · {item.order.order_number}
          </p>
          <p className="text-sm text-neutral-600 flex items-center gap-1.5">
            <UserCircle2 size={14} /> {chemistLabel(item.assigned_to)}
          </p>
          {onIssueCoa && (
            <button
              type="button"
              onClick={() => {
                onIssueCoa(item.sample);
                onClose();
              }}
              className="btn-primary w-full justify-center gap-2"
            >
              Issue COA <ArrowRight size={14} />
            </button>
          )}
          <WorkflowOrderTools
            order={item.order}
            sampleId={item.sample.id}
            isAdmin={isAdmin}
            saving={etaSaving}
            onSaveEta={onSaveOrderEta}
            defaultOpen
          />
          {nav && nav.total > 1 && (
            <p className="text-[11px] text-neutral-400 text-center pt-1">
              ← → or J / K to move between cards
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoaWorkflowBoard({
  coas, onMoveCoa, movingId, onCoaImagesSaved, pendingSamples = [], onIssueCoa, onRestartCoa,
  onSaveOrderEta, etaSavingOrderId = null,
  chemists = [], reviewers = [], clients = [], orders = [], samples = [], currentUserId = null,
  isAdmin = false,
}: Props) {
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const columnScrollRefs = useRef<Partial<Record<CoaWorkflowStage, HTMLDivElement | null>>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CoaWorkflowStage | null>(null);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);
  const [detailCoa, setDetailCoa] = useState<COA | null>(null);
  const [detailPending, setDetailPending] = useState<QueueSampleItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  /** `${stage}:${bundle.key}` → expanded. Multi-COA orders start collapsed. */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const suppressCardClickRef = useRef(false);

  function updateBoardScrollHints() {
    const el = boardScrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(max > 4 && el.scrollLeft < max - 4);
  }

  function scrollBoard(direction: -1 | 1) {
    const el = boardScrollRef.current;
    if (!el) return;
    const step = Math.min(340, Math.max(260, el.clientWidth * 0.75));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
    window.setTimeout(updateBoardScrollHints, 280);
  }

  function scrollColumn(stage: CoaWorkflowStage, direction: -1 | 1) {
    const el = columnScrollRefs.current[stage];
    if (!el) return;
    el.scrollBy({ top: direction * Math.min(280, el.clientHeight * 0.75), behavior: 'smooth' });
  }

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    updateBoardScrollHints();
    const onScroll = () => updateBoardScrollHints();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateBoardScrollHints());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [coas, pendingSamples]);

  // Trackpad / mouse wheel: vertical wheel scrolls stages horizontally when
  // the pointer is not actively scrolling a tall column list.
  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;

      const target = e.target instanceof Element ? e.target : null;
      const colBody = target?.closest('[data-coa-column-scroll]') as HTMLElement | null;
      if (colBody && colBody.scrollHeight > colBody.clientHeight + 1) {
        const goingUp = e.deltaY < 0;
        const goingDown = e.deltaY > 0;
        const roomUp = colBody.scrollTop > 0;
        const roomDown = colBody.scrollTop + colBody.clientHeight < colBody.scrollHeight - 1;
        if ((goingUp && roomUp) || (goingDown && roomDown)) return;
      }

      // Native horizontal trackpad gesture — leave alone.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY;
      updateBoardScrollHints();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [coas, pendingSamples]);

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

  function lotForSample(sample: OrderSample | undefined | null): string {
    if (!sample) return '';
    return (parseSampleMetadata(sample.metadata).batch_number || '').trim();
  }

  function lotForCoa(coa: COA): string {
    const fromCoa = (coa.batch_number || '').trim();
    if (fromCoa) return fromCoa;
    if (!coa.sample_id) return '';
    return lotForSample(samples.find(s => s.id === coa.sample_id));
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
    // Mine-first within each COA column; published pending-assay cards float to top.
    for (const stage of COA_WORKFLOW_BOARD_COLUMNS) {
      if (stage === 'testing_in_progress') continue;
      groups[stage].sort((a, b) => {
        if (stage === 'published' || stage === 'verified') {
          const aPend = canUpdatePendingPublishedCoa(a) ? 0 : 1;
          const bPend = canUpdatePendingPublishedCoa(b) ? 0 : 1;
          if (aPend !== bPend) return aPend - bPend;
        }
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

  const bundlesByStage = useMemo(() => {
    const out = {} as Record<CoaWorkflowStage, OrderBundle[]>;
    for (const stage of COA_WORKFLOW_BOARD_COLUMNS) {
      const pending = stage === 'testing_in_progress' ? sortedPending : [];
      const bundles = buildOrderBundles(grouped[stage], pending, orders);
      bundles.sort((a, b) => {
        const aMine = currentUserId && (
          a.coas.some(c => c.review_assigned_to === currentUserId || assigneeForCoa(c) === currentUserId)
          || a.pending.some(p => p.assigned_to === currentUserId)
        ) ? 0 : 1;
        const bMine = currentUserId && (
          b.coas.some(c => c.review_assigned_to === currentUserId || assigneeForCoa(c) === currentUserId)
          || b.pending.some(p => p.assigned_to === currentUserId)
        ) ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        return a.orderNumber.localeCompare(b.orderNumber);
      });
      out[stage] = bundles;
    }
    return out;
  }, [grouped, sortedPending, orders, samples, currentUserId]);

  /** Flat board order (columns left→right, pending then COAs in each bundle) for prev/next. */
  const boardNavItems = useMemo(() => {
    const items: BoardNavItem[] = [];
    for (const stage of COA_WORKFLOW_BOARD_COLUMNS) {
      for (const bundle of bundlesByStage[stage]) {
        for (const item of bundle.pending) {
          items.push({ kind: 'pending', id: item.sample.id, item });
        }
        for (const coa of bundle.coas) {
          items.push({ kind: 'coa', id: coa.id, coa });
        }
      }
    }
    return items;
  }, [bundlesByStage]);

  const activeDetailCoa = detailCoa
    ? (coas.find(c => c.id === detailCoa.id) ?? detailCoa)
    : null;

  const activeDetailPending = detailPending
    ? (pendingSamples.find(p => p.sample.id === detailPending.sample.id) ?? detailPending)
    : null;

  const openNavItem = (item: BoardNavItem) => {
    if (item.kind === 'coa') {
      setDetailPending(null);
      setDetailCoa(item.coa);
    } else {
      setDetailCoa(null);
      setDetailPending(item.item);
    }
  };

  const detailNavKey = activeDetailCoa
    ? `coa:${activeDetailCoa.id}`
    : activeDetailPending
      ? `pending:${activeDetailPending.sample.id}`
      : null;

  const detailNavIndex = detailNavKey
    ? boardNavItems.findIndex(item =>
      item.kind === 'coa' ? `coa:${item.id}` === detailNavKey : `pending:${item.id}` === detailNavKey)
    : -1;

  const cardNav: WorkflowCardNav | null = detailNavIndex >= 0 && boardNavItems.length > 1
    ? {
        index: detailNavIndex,
        total: boardNavItems.length,
        onPrev: () => {
          const prev = boardNavItems[detailNavIndex - 1];
          if (prev) openNavItem(prev);
        },
        onNext: () => {
          const next = boardNavItems[detailNavIndex + 1];
          if (next) openNavItem(next);
        },
      }
    : detailNavIndex >= 0
      ? {
          index: detailNavIndex,
          total: boardNavItems.length,
          onPrev: () => undefined,
          onNext: () => undefined,
        }
      : null;

  function isGroupExpanded(stage: CoaWorkflowStage, bundleKey: string): boolean {
    return expandedGroups[`${stage}:${bundleKey}`] === true;
  }

  function toggleGroup(stage: CoaWorkflowStage, bundleKey: string) {
    const key = `${stage}:${bundleKey}`;
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleDragStart(e: React.DragEvent, coaId: string) {
    const target = e.target as HTMLElement | null;
    // Let buttons/inputs/selects work normally; don't start a card drag from them.
    if (target?.closest('button, select, input, textarea, label, a')) {
      e.preventDefault();
      return;
    }
    suppressCardClickRef.current = true;
    e.dataTransfer.setData('text/plain', coaId);
    e.dataTransfer.setData('text/coa-id', coaId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(coaId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
    // Avoid opening the detail modal after a drag.
    window.setTimeout(() => { suppressCardClickRef.current = false; }, 0);
  }

  function handleDragOver(e: React.DragEvent, stage: CoaWorkflowStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverStage(stage);
  }

  function handleDrop(e: React.DragEvent, stage: CoaWorkflowStage) {
    e.preventDefault();
    const coaId = e.dataTransfer.getData('text/coa-id')
      || e.dataTransfer.getData('text/plain')
      || draggingId;
    const coa = coas.find(c => c.id === coaId);
    if (coa && coaWorkflowStage(coa) !== stage) {
      void onMoveCoa(coa, stage);
    }
    handleDragEnd();
  }

  async function handleDownloadPdf(coa: COA) {
    setDownloadError(null);
    setDownloadingId(coa.id);
    try {
      await downloadCoaPdf(coa);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download PDF.');
    } finally {
      setDownloadingId(null);
    }
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
        Click a card to open details, edit ETA/notes, and move the certificate. Use ← → or J / K to step through cards like a queue.
        Drag cards between stages. Multi-peptide orders collapse by order number — expand to work cards.
        Cards marked <strong className="text-sky-800">Assigned to you</strong> are yours.
      </p>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          onClose={() => setPrepCoa(null)}
          onSaved={updated => {
            onCoaImagesSaved?.(updated);
            setPrepCoa(null);
            setDetailCoa(prev => (prev && prev.id === updated.id ? updated : prev));
          }}
        />
      )}

      {activeDetailCoa && (
        <CoaWorkflowCardModal
          coa={activeDetailCoa}
          onClose={() => setDetailCoa(null)}
          onMoveCoa={onMoveCoa}
          movingId={movingId}
          onPrepare={coa => {
            setDetailCoa(null);
            setPrepCoa(coa);
          }}
          onRestartCoa={onRestartCoa}
          onDownloadPdf={coa => { void handleDownloadPdf(coa); }}
          downloading={downloadingId === activeDetailCoa.id}
          onSaveOrderEta={onSaveOrderEta}
          etaSaving={!!activeDetailCoa.order_id && etaSavingOrderId === activeDetailCoa.order_id}
          order={orderForCoa(activeDetailCoa)}
          client={clientForCoa(activeDetailCoa)}
          companyName={orderForCoa(activeDetailCoa)?.company_name || activeDetailCoa.company_name || ''}
          lot={lotForCoa(activeDetailCoa)}
          testsLabel={testsLabelForCoa(activeDetailCoa) || ''}
          accession={accessionForCoa(activeDetailCoa)}
          chemistLabel={chemistLabel}
          chemistId={assigneeForCoa(activeDetailCoa)}
          currentUserId={currentUserId}
          reviewerOptions={reviewerOptions}
          isAdmin={isAdmin}
          nav={cardNav}
        />
      )}

      {activeDetailPending && (
        <PendingCardModal
          item={activeDetailPending}
          onClose={() => setDetailPending(null)}
          chemistLabel={chemistLabel}
          onIssueCoa={onIssueCoa}
          isAdmin={isAdmin}
          etaSaving={etaSavingOrderId === activeDetailPending.order.id}
          onSaveOrderEta={onSaveOrderEta}
          nav={cardNav}
        />
      )}

      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-neutral-100/95 backdrop-blur-sm border-b border-atlas-border/80 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-600 min-w-0">
          Drag the board or use the arrows · scroll each column up/down for every card.
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => scrollBoard(-1)}
            disabled={!canScrollLeft}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-atlas-border bg-white text-neutral-700 hover:bg-neutral-50 hover:border-brand-400 shadow-sm disabled:opacity-35 disabled:pointer-events-none"
            aria-label="Scroll workflow left"
            title="Previous stages"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => scrollBoard(1)}
            disabled={!canScrollRight}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-atlas-border bg-white text-neutral-700 hover:bg-neutral-50 hover:border-brand-400 shadow-sm disabled:opacity-35 disabled:pointer-events-none"
            aria-label="Scroll workflow right"
            title="Next stages"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollBoard(-1)}
          disabled={!canScrollLeft}
          className="hidden sm:inline-flex absolute left-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-10 h-10 rounded-full border border-atlas-border bg-white/95 text-neutral-800 shadow-md hover:border-brand-500 disabled:opacity-0 disabled:pointer-events-none"
          aria-label="Scroll workflow left"
          title="Scroll left"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => scrollBoard(1)}
          disabled={!canScrollRight}
          className="hidden sm:inline-flex absolute right-0 top-1/2 -translate-y-1/2 z-10 items-center justify-center w-10 h-10 rounded-full border border-atlas-border bg-white/95 text-neutral-800 shadow-md hover:border-brand-500 disabled:opacity-0 disabled:pointer-events-none"
          aria-label="Scroll workflow right"
          title="Scroll right"
        >
          <ChevronRight size={20} />
        </button>

        {downloadError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {downloadError}
          </div>
        )}

        <div
          ref={boardScrollRef}
          className="coa-workflow-board-scroll flex gap-4 overflow-x-scroll pb-3 scroll-smooth snap-x snap-proximity overscroll-x-contain px-1 sm:px-8"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
        {COA_WORKFLOW_BOARD_COLUMNS.map(stage => {
          const styles = COLUMN_STYLES[stage];
          const isTestingCol = stage === 'testing_in_progress';
          const isOver = overStage === stage && draggingId !== null;
          const bundles = bundlesByStage[stage] || [];
          const columnCount = bundles.reduce((n, b) => n + bundleItemCount(b), 0);
          const pendingFollowUpCount =
            (stage === 'published' || stage === 'verified')
              ? grouped[stage].filter(c => canUpdatePendingPublishedCoa(c)).length
              : 0;

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-[280px] sm:w-[300px] snap-start flex flex-col rounded-xl border border-atlas-border overflow-hidden transition-shadow h-[min(70vh,720px)] ${
                isOver ? `ring-2 ${styles.ring} shadow-md` : ''
              }`}
              onDragOver={e => handleDragOver(e, stage)}
              onDragLeave={() => setOverStage(prev => (prev === stage ? null : prev))}
              onDrop={e => handleDrop(e, stage)}
            >
              <div className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 sticky top-0 z-10 ${styles.header}`}>
                <h3 className="font-bold text-sm flex items-center gap-2 min-w-0 truncate">
                  {stageIcon(stage)}
                  <span className="truncate">{COA_WORKFLOW_LABELS[stage]}</span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  {pendingFollowUpCount > 0 && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full"
                      title="Certificates with deferred assays still pending"
                    >
                      {pendingFollowUpCount} pending
                    </span>
                  )}
                  <span className="text-xs font-semibold text-neutral-500 bg-white/70 px-2 py-0.5 rounded-full">
                    {columnCount}
                  </span>
                  <div className="flex flex-col -space-y-0.5">
                    <button
                      type="button"
                      onClick={() => scrollColumn(stage, -1)}
                      className="p-0.5 rounded text-neutral-500 hover:text-black hover:bg-white/80"
                      aria-label={`Scroll ${COA_WORKFLOW_LABELS[stage]} up`}
                      title="Scroll up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollColumn(stage, 1)}
                      className="p-0.5 rounded text-neutral-500 hover:text-black hover:bg-white/80"
                      aria-label={`Scroll ${COA_WORKFLOW_LABELS[stage]} down`}
                      title="Scroll down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div
                ref={el => {
                  columnScrollRefs.current[stage] = el;
                }}
                data-coa-column-scroll
                className={`flex-1 min-h-0 p-2 space-y-2 overflow-y-auto overscroll-contain scroll-smooth ${styles.body}`}
              >
                {bundles.length === 0 ? (
                  <div className={`rounded-lg border-2 border-dashed p-6 text-center text-xs text-neutral-400 ${
                    isOver ? 'border-current bg-white/60' : 'border-neutral-200'
                  }`}>
                    {isOver ? 'Drop here' : (isTestingCol ? 'No samples in testing' : 'No cards')}
                  </div>
                ) : (
                  bundles.map(bundle => {
                    const collapsible = isCollapsibleBundle(bundle);
                    const bundleMine = !!currentUserId && (
                      bundle.coas.some(c => (
                        c.review_assigned_to === currentUserId || assigneeForCoa(c) === currentUserId
                      ))
                      || bundle.pending.some(p => p.assigned_to === currentUserId)
                    );
                    const expanded = !collapsible || isGroupExpanded(stage, bundle.key);
                    const showOrderToolsOnCards = !collapsible;

                    const pendingNodes = bundle.pending.map(item => {
                      const { sample, order, priority, assigned_to: assignedTo } = item;
                      const mine = !!currentUserId && assignedTo === currentUserId;
                      const pStyles = LAB_PRIORITY_STYLES[priority];
                      const lot = lotForSample(sample);
                      const etaIso = resolveEtaAt(order);
                      return (
                        <article
                          key={sample.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setDetailCoa(null);
                            setDetailPending(item);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setDetailCoa(null);
                              setDetailPending(item);
                            }
                          }}
                          className={`rounded-lg border bg-white shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${pStyles.border} ${
                            mine ? 'ring-2 ring-sky-400 border-sky-300' : ''
                          }`}
                        >
                          <PriorityBanner priority={priority} rush={order.rush_processing} compact />
                          <div className="p-3 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-sm text-black leading-snug truncate">
                                {sample.display_name || sample.sample_name}
                              </p>
                              <ChevronRight size={14} className="text-neutral-300 shrink-0 mt-0.5" />
                            </div>
                            <LotLine lot={lot} />
                            {showOrderToolsOnCards ? (
                              <p className="text-xs text-neutral-500 truncate">
                                {order.company_name || '—'}
                                {etaIso ? ` · ETA ${formatDate(etaIso)}` : ''}
                              </p>
                            ) : null}
                            {mine && <AssignedToYouBadge />}
                            <p className="text-[11px] text-sky-800 font-semibold">Awaiting COA · tap to open</p>
                          </div>
                        </article>
                      );
                    });

                    const coaNodes = bundle.coas.map(coa => {
                    const currentStage = coaWorkflowStage(coa);
                    const isDragging = draggingId === coa.id;
                    const isMoving = movingId === coa.id;
                    const order = orderForCoa(coa);
                    const companyName = order?.company_name || coa.company_name;
                    const lot = lotForCoa(coa);
                    const assignee = assigneeForCoa(coa);
                    const reviewAssigneeId = coa.review_assigned_to ?? null;
                    const needsPendingUpdate = canUpdatePendingPublishedCoa(coa);
                    const pendingLabels = needsPendingUpdate
                      ? pendingAssayLabels(coa.panel_results)
                      : [];
                    const mine = !!currentUserId && (
                      assignee === currentUserId || reviewAssigneeId === currentUserId
                    );
                    const sig = coaSignatureProgress(coa);
                    const etaIso = order ? resolveEtaAt(order) : null;

                    return (
                      <article
                        key={coa.id}
                        draggable={!isMoving}
                        onDragStart={e => handleDragStart(e, coa.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          if (suppressCardClickRef.current || isMoving) return;
                          setDetailPending(null);
                          setDetailCoa(coa);
                        }}
                        className={`rounded-lg border bg-white p-3 shadow-sm transition-all select-none ${
                          isDragging ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md hover:border-brand-300'
                        } ${isMoving ? 'opacity-60 pointer-events-none' : 'cursor-pointer'} ${
                          needsPendingUpdate
                            ? 'ring-2 ring-amber-400 border-amber-300'
                            : mine
                              ? 'ring-2 ring-sky-400 border-sky-300'
                              : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="text-neutral-300 flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing"
                            title="Drag to move stage"
                          >
                            <GripVertical size={14} />
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            {needsPendingUpdate && (
                              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 flex items-center gap-1 truncate">
                                <Clock size={10} className="flex-shrink-0" />
                                Pending{pendingLabels[0] ? `: ${pendingLabels[0]}` : ' assays'}
                              </p>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm text-black leading-snug truncate">
                                {coa.display_name || coa.sample_name}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                <ResultBadge result={coa.overall_result} />
                                <ChevronRight size={14} className="text-neutral-300" />
                              </div>
                            </div>
                            <LotLine lot={lot} />
                            <div className="flex flex-wrap items-center gap-1.5">
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
                            </div>
                            {showOrderToolsOnCards && (
                              <p className="text-xs text-neutral-500 truncate">
                                {companyName || '—'}
                                {etaIso ? ` · ETA ${formatDate(etaIso)}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                    });

                    if (!collapsible) {
                      return (
                        <div key={bundle.key} className="space-y-2">
                          {pendingNodes}
                          {coaNodes}
                        </div>
                      );
                    }

                    return (
                      <OrderGroupShell
                        key={bundle.key}
                        bundle={bundle}
                        expanded={expanded}
                        onToggle={() => toggleGroup(stage, bundle.key)}
                        mine={bundleMine}
                        tools={bundle.order ? (
                          <WorkflowOrderTools
                            order={bundle.order}
                            sampleId={bundle.coas[0]?.sample_id || bundle.pending[0]?.sample.id || null}
                            isAdmin={isAdmin}
                            saving={etaSavingOrderId === bundle.order.id}
                            onSaveEta={onSaveOrderEta}
                          />
                        ) : null}
                      >
                        {pendingNodes}
                        {coaNodes}
                      </OrderGroupShell>
                    );
                  })
                )}

                {columnCount > 0 && isOver && (
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
    </div>
  );
}
