import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, ExternalLink, FileText, FlaskConical, Globe, GripVertical,
  MessageCircle, Shield,
} from 'lucide-react';
import { COA } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import {
  COA_WORKFLOW_BOARD_COLUMNS, COA_WORKFLOW_LABELS, COA_WORKFLOW_STEPS,
  CoaWorkflowStage, coaWorkflowStage,
} from '../../lib/coaWorkflow';
import CoaPdfPrepModal from './CoaPdfPrepModal';
import { openCoaPrintView } from '../../lib/coaPdf';

interface Props {
  coas: COA[];
  onMoveCoa: (coa: COA, targetStage: CoaWorkflowStage) => void | Promise<void>;
  movingId?: string | null;
  onCoaImagesSaved?: (coa: COA) => void;
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

export default function CoaWorkflowBoard({ coas, onMoveCoa, movingId, onCoaImagesSaved }: Props) {
  const grouped = groupCoasByStage(coas);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CoaWorkflowStage | null>(null);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);

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
        Drag cards between columns to update workflow stage. <strong>View PDF</strong> prints the live portal certificate; <strong>Prepare</strong> updates vial photo and panel stats first.
      </p>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          onClose={() => setPrepCoa(null)}
          onSaved={onCoaImagesSaved}
        />
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
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-black leading-snug">
                              {coa.display_name || coa.sample_name}
                            </p>
                            <p className="text-xs text-neutral-500 mt-1 truncate">
                              {coa.company_name || '—'} · {formatDate(coa.issued_at)}
                            </p>
                            {(coa.vial_image || coa.chromatogram_image) && (
                              <div className="flex gap-1.5 mt-2">
                                {coa.vial_image && (
                                  <img
                                    src={coa.vial_image}
                                    alt="Vial"
                                    className="h-9 w-9 rounded object-cover border border-neutral-200 bg-neutral-50"
                                  />
                                )}
                                {coa.chromatogram_image && (
                                  <img
                                    src={coa.chromatogram_image}
                                    alt="Chromatogram"
                                    className="h-9 w-14 rounded object-cover border border-neutral-200 bg-neutral-50"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 mt-2 border-t border-atlas-border">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openCoaPrintView(coa.slug);
                            }}
                            className="btn-primary text-xs py-1 px-2 gap-1"
                          >
                            <FileText size={11} /> View PDF
                          </button>
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
                          <Link
                            to={`/coa/${coa.slug}`}
                            className="btn-outline text-xs py-1 px-2 gap-1"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink size={11} /> Web view
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

                          {currentStage === 'awaiting_info' && (
                            <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                              <MessageCircle size={11} /> Waiting on client
                            </span>
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
