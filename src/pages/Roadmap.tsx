import { Link } from 'react-router-dom';
import { CheckCircle, Clock, ArrowRight, Zap, FlaskConical } from 'lucide-react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';

const roadmapItems = [
  { status: 'live', label: 'Live', items: [
    { name: 'HPLC Purity Analysis', desc: 'High-performance liquid chromatography with interactive chromatogram viewer' },
    { name: 'Identity (HPLC-based)', desc: 'Peptide identity confirmation via retention time comparison' },
    { name: 'Molecular Weight (MS)', desc: 'Mass spectrometry molecular weight verification' },
    { name: 'Amino Acid Analysis', desc: 'Quantitative amino acid composition analysis' },
    { name: 'Endotoxin (LAL)', desc: 'Limulus amebocyte lysate endotoxin testing' },
    { name: 'Digital COA with permanent URL', desc: 'Live-rendered from LIMS, not a static PDF' },
    { name: 'Cryptographic tamper-proof signing', desc: 'Every COA hashed and signed' },
    { name: 'Public verification tool', desc: 'No account required to verify any Atlas Analytics COA' },
    { name: 'Interactive chromatogram viewer', desc: 'Full chromatogram data visualized on the COA page' },
    { name: 'Rush/expedited processing', desc: 'Priority queue for time-sensitive orders' },
    { name: 'API key management', desc: 'Keys for WooCommerce and AccuVerify badge integration' },
    { name: 'First-order 50% discount', desc: 'Automatically applied at checkout for new accounts' },
  ]},
  { status: 'coming_soon', label: 'Coming Soon', items: [
    { name: 'Prepaid shipping labels (Accumark)', desc: 'Generate labels directly from your client portal' },
    { name: 'Heavy metals panel', desc: 'ICP-MS based heavy metals testing' },
    { name: 'Residual solvents', desc: 'GC-based residual solvent analysis' },
    { name: 'Residual moisture (Karl Fischer)', desc: 'Water content determination' },
    { name: 'NMR analysis', desc: 'Nuclear magnetic resonance spectroscopy' },
    { name: 'LC-MS identity', desc: 'Liquid chromatography–mass spectrometry identity confirmation' },
    { name: 'Sterility testing (plate, 14-day)', desc: 'Full USP sterility testing' },
    { name: 'Variance/multi-sample testing', desc: 'Statistical analysis across multiple vials from same batch' },
    { name: 'Physical tamper-evident seal', desc: 'QR-linked seal connecting vial to digital record (premium tier)' },
    { name: 'ISO 17025 accreditation', desc: 'Formal accreditation from recognized accreditation body' },
  ]}
];

export default function Roadmap() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-white">
        <div className="bg-slate-950 py-14 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <FlaskConical size={16} className="text-white" />
              </div>
              <span className="text-brand-400 text-sm font-medium">Atlas Analytics</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">Product Roadmap</h1>
            <p className="text-slate-400 text-lg">What's live today and what's coming next.</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10">
          {roadmapItems.map((section) => (
            <div key={section.status}>
              <div className="flex items-center gap-3 mb-5">
                {section.status === 'live' ? (
                  <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                    <CheckCircle size={14} /> Live Now
                  </span>
                ) : (
                  <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
                    <Clock size={14} /> Coming Soon
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.items.map((item) => (
                  <div key={item.name} className={`card p-4 flex items-start gap-3 ${section.status !== 'live' ? 'opacity-70' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      section.status === 'live' ? 'bg-emerald-100' : 'bg-amber-100'
                    }`}>
                      {section.status === 'live'
                        ? <CheckCircle size={13} className="text-emerald-600" />
                        : <Clock size={13} className="text-amber-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-slate-950 rounded-2xl p-8 text-center">
            <Zap size={28} className="text-brand-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">Have a feature request?</h3>
            <p className="text-slate-400 text-sm mb-5">We build based on what the community needs most. Send us your ideas.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:labs@accumark.io?subject=Feature Request" className="btn-primary gap-2 text-sm">
                <ArrowRight size={15} /> Email Us
              </a>
              <Link to="/order" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-700 text-slate-300 font-medium rounded-lg hover:bg-slate-800 transition-colors text-sm">
                Submit Samples
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
