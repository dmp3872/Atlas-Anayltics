import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertCircle, ExternalLink } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ApiKey } from '../lib/types';
import { formatDateTime } from '../lib/utils';

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'aa_live_';
  let key = prefix;
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(12, '0');
}

export default function APIKeys() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setKeys(data);
        setLoading(false);
      });
  }, [user]);

  async function createKey() {
    if (!user || !newLabel.trim()) return;
    setCreating(true);
    const plaintext = generateApiKey();
    const prefix = plaintext.slice(0, 12);
    const keyHash = hashKey(plaintext);

    const { data, error } = await supabase.from('api_keys').insert({
      user_id: user.id,
      label: newLabel.trim(),
      key_prefix: prefix,
      key_hash: keyHash,
    }).select().single();

    if (!error && data) {
      setKeys(prev => [data, ...prev]);
      setNewKeyPlaintext(plaintext);
      setNewLabel('');
      setShowCreate(false);
    }
    setCreating(false);
  }

  async function deleteKey(id: string) {
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id);
    setKeys(prev => prev.filter(k => k.id !== id));
  }

  async function copyKey(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleVisible(id: string) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
            <p className="text-slate-500 text-sm mt-0.5">Manage keys for WooCommerce integration and AccuVerify badge embedding.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm gap-1.5">
            <Plus size={15} /> New Key
          </button>
        </div>

        {newKeyPlaintext && (
          <div className="card p-5 mb-5 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">Save your API key now</p>
                <p className="text-sm text-amber-700">This is the only time you'll see the full key. We don't store it in plain text.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-4 py-3">
              <code className="flex-1 text-sm font-mono text-slate-700 break-all">{newKeyPlaintext}</code>
              <button onClick={() => copyKey(newKeyPlaintext)} className="flex-shrink-0 p-1.5 hover:bg-amber-100 rounded text-amber-700">
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
            <button onClick={() => setNewKeyPlaintext(null)} className="text-xs text-amber-700 mt-3 hover:text-amber-800 font-medium">
              I've saved this key — dismiss
            </button>
          </div>
        )}

        {showCreate && (
          <div className="card p-5 mb-5 border-brand-200 bg-brand-50">
            <h3 className="font-semibold text-slate-900 mb-3">Create New API Key</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="input-field flex-1"
                placeholder="Label (e.g., WooCommerce Store)"
                onKeyDown={e => e.key === 'Enter' && createKey()}
              />
              <button onClick={createKey} disabled={creating || !newLabel.trim()} className="btn-primary px-5">
                {creating ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-outline px-4">Cancel</button>
            </div>
          </div>
        )}

        <div className="card p-5 mb-6 bg-slate-50 border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <ExternalLink size={15} /> WooCommerce / AccuVerify Embed
          </h3>
          <p className="text-sm text-slate-600 mb-3">
            Use your API key to embed an AccuVerify badge on product pages or integrate with WooCommerce.
          </p>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Embed Code</p>
            <code className="text-xs text-slate-700 font-mono break-all">
              {`<script src="https://atlasanalytics.io/embed/verify.js" data-key="YOUR_API_KEY" data-coa="COA_SLUG"></script>`}
            </code>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : keys.length === 0 ? (
          <div className="card p-12 text-center">
            <Key size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-900 mb-1">No API keys yet</p>
            <p className="text-sm text-slate-500 mb-4">Create your first key to start integrating Atlas Analytics.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm gap-1.5">
              <Plus size={15} /> Create API Key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((apiKey) => (
              <div key={apiKey.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Key size={17} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{apiKey.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs font-mono text-slate-500">
                          {visibleKeys.has(apiKey.id) ? apiKey.key_prefix + '•'.repeat(20) : apiKey.key_prefix + '•'.repeat(20)}
                        </code>
                        <button onClick={() => toggleVisible(apiKey.id)} className="text-slate-400 hover:text-slate-600">
                          {visibleKeys.has(apiKey.id) ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Created {formatDateTime(apiKey.created_at)}
                        {apiKey.last_used_at && ` · Last used ${formatDateTime(apiKey.last_used_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${apiKey.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {apiKey.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => deleteKey(apiKey.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
