import { CheckCircle } from 'lucide-react';
import { SubmissionStatus } from '../../lib/types';
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_PIPELINE_STEPS,
  getSubmissionStepIndex,
} from '../../lib/submissionUtils';

export default function SubmissionStatusPipeline({ status }: { status: SubmissionStatus }) {
  const steps = SUBMISSION_PIPELINE_STEPS;
  const currentIdx = getSubmissionStepIndex(status);
  const labels = SUBMISSION_STATUS_LABELS;

  return (
    <div className="flex items-center overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done
                    ? 'bg-brand-500 border-brand-500'
                    : active
                      ? 'border-brand-500 bg-white'
                      : 'border-slate-200 bg-white'
                }`}
              >
                {done ? (
                  <CheckCircle size={14} className="text-white" />
                ) : active ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-slate-200" />
                )}
              </div>
              <span
                className={`text-xs mt-1.5 font-medium text-center w-16 leading-tight ${
                  i <= currentIdx ? 'text-brand-600' : 'text-slate-400'
                }`}
              >
                {labels[step]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? 'bg-brand-500' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
