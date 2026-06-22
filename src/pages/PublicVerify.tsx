import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Search, CheckCircle, XCircle, ExternalLink, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

export default function PublicVerify() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<COA | null | 'not_found'>(null);
  const [loading, setLoading] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);

    const { data } = await supabase
      .from('coas')
      .select('*')
      .eq('slug', query.trim())
      .eq('is_public', true)
      .maybeSingle();

    setResult(data ?? 'not_found');
    setLoading(false);
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-slate-50">
        <div className="bg-black py-16 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Shield size={26} className="text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">COA Verification</h1>
            <p className="text-slate-400 text-lg">
              Verify the authenticity of any Atlas Analytics COA. No account required.
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <div className="card p-6 mb-6">
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="label text-base font-semibold">Enter COA ID or URL</label>
                <p className="text-sm text-slate-500 mb-3">
                  The COA ID is found at the bottom of any Atlas Analytics certificate (e.g., <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">a3f9b2c1d4e5</code>)
                </p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      className="input-field pl-10"
                      placeholder="e.g., a3f9b2c1d4e5f6a7"
                    />
                  </div>
                  <button type="submit" disabled={loading || !query.trim()} className="btn-primary px-6 gap-2">
                    {loading ? <Loader size={16} className="animate-spin" /> : <Shield size={16} />}
                    Verify
                  </button>
                </div>
              </div>
            </form>
          </div>

          {result === 'not_found' && (
            <div className="card p-6 border-red-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <XCircle size={24} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-lg mb-1">COA Not Found</h3>
                  <p className="text-slate-600 text-sm mb-3">
                    No Atlas Analytics certificate was found for ID: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-sm">{query}</code>
                  </p>
                  <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p>This document may be fraudulent, may have been issued by a different lab, or the ID may be incorrect. Contact the vendor to request verification.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && result !== 'not_found' && (
            <div className="card p-6 border-emerald-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={24} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-lg mb-1">Verified — Authentic Atlas Analytics COA</h3>
                  <p className="text-slate-600 text-sm mb-4">
                    This certificate was issued by Atlas Analytics Labs and has not been modified.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Sample</p>
                      <p className="font-medium text-slate-900">{result.display_name || result.sample_name}</p>
                    </div>
                    {result.company_name && (
                      <div>
                        <p className="text-xs text-slate-500">Company</p>
                        <p className="font-medium text-slate-900">{result.company_name}</p>
                      </div>
                    )}
                    {result.batch_number && (
                      <div>
                        <p className="text-xs text-slate-500">Batch</p>
                        <p className="font-medium text-slate-900">{result.batch_number}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-500">Issued</p>
                      <p className="font-medium text-slate-900">{formatDateTime(result.issued_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Overall Result</p>
                      <p className={`font-bold ${result.overall_result === 'pass' ? 'text-emerald-600' : result.overall_result === 'fail' ? 'text-red-600' : 'text-amber-600'}`}>
                        {result.overall_result.toUpperCase()}
                      </p>
                    </div>
                    {result.purity_percent && (
                      <div>
                        <p className="text-xs text-slate-500">Purity</p>
                        <p className="font-medium text-slate-900">{result.purity_percent}%</p>
                      </div>
                    )}
                  </div>

                  {result.content_hash && (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono text-slate-500 mb-4">
                      <Shield size={11} className="text-brand-500" />
                      Hash: {result.content_hash}
                    </div>
                  )}

                  <Link to={`/coa/${result.slug}`} className="btn-primary text-sm gap-2">
                    <ExternalLink size={15} /> View Full COA
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Cryptographic Signing', desc: 'Every COA is signed with a unique hash. Any modification breaks the signature.' },
              { icon: CheckCircle, title: 'Permanent URLs', desc: 'Each COA has a unique permanent URL that never expires.' },
              { icon: Search, title: 'No Account Needed', desc: 'Anyone can verify any Atlas Analytics COA without creating an account.' },
            ].map((item) => (
              <div key={item.title} className="card p-4">
                <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center mb-3">
                  <item.icon size={16} className="text-brand-600" />
                </div>
                <p className="font-medium text-slate-900 text-sm mb-1">{item.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
