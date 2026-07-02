import { useEffect, useState } from 'react';
import { Beaker, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';

interface PeptideRequest {
  id: string;
  peptide_name: string;
  cas_number: string;
  notes: string;
  status: string;
  created_at: string;
}

export default function PeptideRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PeptideRequest[]>([]);
  const [name, setName] = useState('');
  const [cas, setCas] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    if (!user) return;
    const { data, error } = await supabase
      .from('peptide_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setRequests(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) {
      setMsg({ type: 'error', text: 'Enter a peptide name.' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    const { error } = await supabase.from('peptide_requests').insert({
      user_id: user.id,
      peptide_name: name.trim(),
      cas_number: cas.trim(),
      notes: notes.trim(),
    });
    if (error) {
      setMsg({ type: 'error', text: error.message.includes('peptide_requests') ? 'Peptide requests require a database migration.' : error.message });
    } else {
      setName('');
      setCas('');
      setNotes('');
      setMsg({ type: 'success', text: 'Request submitted. Our lab team will review and add validated methods.' });
      load();
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="portal-page-title">Peptide Requests</h1>
        <p className="portal-page-subtitle">Request a peptide or compound not yet in our catalog. We&apos;ll validate methods and notify you when testing is available.</p>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-4">
        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
            {msg.text}
          </div>
        )}
        <div>
          <label className="label">Peptide / Compound Name <span className="text-red-500">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="e.g. Retatrutide" required />
        </div>
        <div>
          <label className="label">CAS Number <span className="text-neutral-400 font-normal">(optional)</span></label>
          <input value={cas} onChange={e => setCas(e.target.value)} className="input-field" placeholder="e.g. 2381089-83-2" />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-field min-h-[80px] resize-y" placeholder="Sequence, expected MW, supplier info…" />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full gap-2">
          <Beaker size={16} /> {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-atlas-border">
          <h2 className="font-semibold text-sm text-black">Your Requests</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-atlas-border">
            {requests.map(r => (
              <li key={r.id} className="px-5 py-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-black">{r.peptide_name}</p>
                  {r.cas_number && <p className="text-xs text-neutral-500">CAS {r.cas_number}</p>}
                  <p className="text-xs text-neutral-400 mt-1">{formatDate(r.created_at)}</p>
                </div>
                <span className="badge-pending capitalize"><Clock size={10} /> {r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
