import { Upload, FileText } from 'lucide-react';

export default function DocumentUploadPlaceholder() {
  return (
    <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center bg-neutral-50">
      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center mx-auto mb-3">
        <Upload size={18} className="text-neutral-500" />
      </div>
      <p className="text-sm font-medium text-neutral-700 mb-1">Optional document upload</p>
      <p className="text-xs text-neutral-500 mb-3">
        Attach SDS, spec sheets, or chain-of-custody documents (coming soon).
      </p>
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-400 bg-neutral-100 rounded-lg cursor-not-allowed"
      >
        <FileText size={14} />
        Choose file
      </button>
    </div>
  );
}
