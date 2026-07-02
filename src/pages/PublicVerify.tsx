import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shield, Search, CheckCircle, XCircle, ExternalLink, AlertCircle, Loader, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA } from '../lib/types';
import { formatDateTime } from '../lib/utils';
import { verifyCoaIntegrity } from '../lib/coaVerify';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

type VerifyResult = {
  coa: COA;
  status: ReturnType<typeof verifyCoaIntegrity>;
};

export default function PublicVerify() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('slug') ?? '');
  const [result, setResult] = useState<VerifyResult | null | 'not_found'>(null);
  const [loading, setLoading] = useState(false);

  async function verifySlug(slug: string) {
    const trimmed = slug.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);

    const { data } = await supabase
      .from('coas')
      .select('*')
      .eq('slug', trimmed)
      .eq('is_public', true)
      .maybeSingle();

    if (!data) {
      setResult('not_found');
    } else {
      setResult({ coa: data, status: verifyCoaIntegrity(data) });
    }
    setLoading(false);
  }

  useEffect(() => {
    const slug = searchParams.get('slug');
    if (slug) {
      setQuery(slug);
      verifySlug(slug);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    await verifySlug(query);
  }

  const integrityLabel = (status: ReturnType<typeof verifyCoaIntegrity>) => {
    if (status === 'verified') return { text: 'Cryptographic hash verified', ok: true };
    if (status === 'legacy') return { text: 'Signed record on file', ok: true };
    if (status === 'mismatch') return { text: 'Integrity warning — hash mismatch', ok: false };
    return { text: 'No hash on record', ok: false };
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-neutral-50">
        <div className="coa-header-bar">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-12 h-12 border border-brand-500/40 flex items-center justify-center mx-auto mb-5">
              <Shield size={22} className="text-brand-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Certificate Verification</h1>
            <p className="text-neutral-400 text-sm max-w-md mx-auto">
              Confirm an Atlas Analytics COA is authentic. Enter the certificate ID or scan the QR code on the document.
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <div className="card p-6 mb-6">
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="label">Certificate ID</label>
                <p className="text-xs text-neutral-500 mb-3">
                  Found at the bottom of every COA or encoded in the QR code (e.g.{' '}
                  <code className="bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px]">a3f9b2c1d4e5</code>).
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      className="input-field pl-9 font-mono text-sm"
                      placeholder="Enter COA ID"
                    />
                  </div>
                  <button type="submit" disabled={loading || !query.trim()} className="btn-primary px-5 gap-2 shrink-0">
                    {loading ? <Loader size={15} className="animate-spin" /> : <Shield size={15} />}
                    Verify
                  </button>
                </div>
              </div>
            </form>
          </div>

          {result === 'not_found' && (
            <div className="card p-6 border-red-200">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
                  <XCircle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-black mb-1">Certificate Not Found</h3>
                  <p className="text-neutral-600 text-sm mb-3">
                    No public certificate matches ID{' '}
                    <code className="bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{query}</code>.
                  </p>
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    <p>This may indicate a fraudulent document, a private certificate, or an incorrect ID. Contact your vendor to request verification.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && result !== 'not_found' && (
            <div className={`card p-6 ${result.status === 'mismatch' ? 'border-red-300' : 'border-emerald-200'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 flex items-center justify-center flex-shrink-0 border ${
                  result.status === 'mismatch' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
                }`}>
                  {result.status === 'mismatch'
                    ? <AlertTriangle size={20} className="text-red-600" />
                    : <CheckCircle size={20} className="text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-black mb-1">
                    {result.status === 'mismatch' ? 'Certificate Found — Integrity Warning' : 'Verified — Authentic Atlas Analytics COA'}
                  </h3>
                  <p className="text-neutral-600 text-sm mb-4">{integrityLabel(result.status).text}</p>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4 text-sm border-t border-atlas-border pt-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Sample</p>
                      <p className="font-medium text-black">{result.coa.display_name || result.coa.sample_name}</p>
                    </div>
                    {result.coa.company_name && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Company</p>
                        <p className="font-medium text-black">{result.coa.company_name}</p>
                      </div>
                    )}
                    {result.coa.batch_number && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Batch / Lot</p>
                        <p className="font-medium text-black">{result.coa.batch_number}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Issued</p>
                      <p className="font-medium text-black">{formatDateTime(result.coa.issued_at)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Result</p>
                      <p className={`font-bold uppercase text-sm ${
                        result.coa.overall_result === 'pass' ? 'text-atlas-success'
                          : result.coa.overall_result === 'fail' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {result.coa.overall_result}
                      </p>
                    </div>
                    {result.coa.purity_percent != null && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Purity</p>
                        <p className="font-medium text-black">{result.coa.purity_percent}%</p>
                      </div>
                    )}
                    {result.coa.seal_serial && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Seal Serial</p>
                        <p className="font-mono text-sm">{result.coa.seal_serial}</p>
                      </div>
                    )}
                  </div>

                  {result.coa.content_hash && (
                    <div className="flex items-center gap-2 p-3 bg-neutral-50 border border-atlas-border text-[11px] font-mono text-neutral-600 mb-4 break-all">
                      <Shield size={11} className="text-brand-600 flex-shrink-0" />
                      {result.coa.content_hash}
                    </div>
                  )}

                  <Link to={`/coa/${result.coa.slug}`} className="btn-primary text-sm gap-2">
                    <ExternalLink size={14} /> View Full Certificate
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: 'Hash Verification', desc: 'Content is hashed at issuance. Any modification produces a detectable mismatch.' },
              { icon: CheckCircle, title: 'Permanent URLs', desc: 'Each certificate has a unique, permanent link that never expires.' },
              { icon: Search, title: 'No Account Required', desc: 'Anyone can verify a public COA without signing in.' },
            ].map((item) => (
              <div key={item.title} className="card p-4">
                <item.icon size={16} className="text-brand-600 mb-3" />
                <p className="font-semibold text-black text-sm mb-1">{item.title}</p>
                <p className="text-xs text-neutral-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
