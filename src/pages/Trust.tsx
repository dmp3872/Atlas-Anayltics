import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, FileX, Search, Lock, CheckCircle, ArrowRight, FlaskConical } from 'lucide-react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

export default function Trust() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-white">
        <div className="bg-black py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400 text-xs font-medium mb-6">
              <Shield size={13} /> Why Third-Party Testing Matters
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
              The trust problem in peptide testing
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Most COAs in the peptide space are either easily fabricated, impossible to verify, or issued by labs with financial ties to the manufacturers they're testing.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-16">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">The three trust failures</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: FileX,
                  color: 'bg-red-100 text-red-600',
                  title: 'Static PDFs can be forged',
                  desc: 'A PDF can be edited in seconds. Most "COAs" in circulation are static documents with no cryptographic anchor to a testing record. Anyone can change the purity number.'
                },
                {
                  icon: AlertTriangle,
                  color: 'bg-amber-100 text-amber-600',
                  title: 'Conflicts of interest',
                  desc: 'Many labs have financial relationships with the manufacturers they test. This creates obvious pressure to pass samples that might otherwise fail. True independence requires no business relationship.'
                },
                {
                  icon: Search,
                  color: 'bg-brand-100 text-brand-700',
                  title: 'No verification mechanism',
                  desc: 'When a vendor shows you a PDF, how do you confirm it\'s real? Without a live database lookup against the original testing record, verification is impossible.'
                }
              ].map((item) => (
                <div key={item.title} className="card p-6">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                    <item.icon size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
                <FlaskConical size={20} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">How Atlas Analytics solves each problem</h2>
            </div>
            <div className="space-y-4">
              {[
                {
                  problem: 'Static PDFs can be forged',
                  solution: 'Every Atlas Analytics COA is live-rendered from our LIMS at the moment of access. The content is cryptographically hashed and signed. Any change to the underlying data would produce a different hash — instantly detectable.',
                  icon: Lock
                },
                {
                  problem: 'Conflicts of interest',
                  solution: 'Atlas Analytics has no financial relationships with peptide manufacturers. We are a pure-play testing lab. Our only revenue comes from testing fees paid by vendors and researchers. We pass what passes and fail what fails.',
                  icon: Shield
                },
                {
                  problem: 'No verification mechanism',
                  solution: 'Every Atlas Analytics COA has a permanent, unique URL. Anyone — vendor, customer, researcher — can enter the COA ID on our public verification page and get a live readout from our database. No account required.',
                  icon: Search
                },
              ].map((item, i) => (
                <div key={i} className="card p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <item.icon size={20} className="text-brand-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-red-500 mb-1">Problem: {item.problem}</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{item.solution}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-50 rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Our commitments</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                'No financial relationships with manufacturers',
                'Flat pricing — no incentive to test certain peptides',
                'Every COA cryptographically signed',
                'Public verification requires no account',
                'Named lab director on every report',
                'Physical US address — 1234 Research Blvd, Austin TX',
                'ISO 17025 accreditation in progress',
                'Results are final — we do not revise passing COAs',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-700">
                  <CheckCircle size={16} className="text-brand-500 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="text-center bg-black rounded-2xl p-10">
            <h2 className="text-2xl font-bold text-white mb-3">Ready to get verified results?</h2>
            <p className="text-slate-400 mb-6">No minimums. No contracts. First order 50% off.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/order" className="btn-primary gap-2">
                Submit Samples <ArrowRight size={16} />
              </Link>
              <Link to="/verify" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-neutral-700 text-slate-300 font-medium rounded-lg hover:bg-slate-800 transition-colors">
                Verify a COA
              </Link>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}
