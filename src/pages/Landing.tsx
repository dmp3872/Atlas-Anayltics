import { Link } from 'react-router-dom';
import {
  Shield, Zap, CheckCircle, ArrowRight, Lock, Globe,
  BarChart3, Star, ChevronRight, Clock, Package, Award, FileCheck
} from 'lucide-react';

const stats = [
  { label: 'Samples Tested', value: '12,400+' },
  { label: 'Avg Turnaround', value: '3–5 days' },
  { label: 'Unique COAs Issued', value: '4,800+' },
  { label: 'First-Order Discount', value: '50% off' },
];

const features = [
  {
    icon: FileCheck,
    title: 'Digital-First COAs',
    description: 'Live-rendered from our LIMS. Permanent URL. Interactive chromatogram viewer. Not a static PDF.'
  },
  {
    icon: Lock,
    title: 'Tamper-Proof Signing',
    description: 'Every COA is cryptographically hashed and signed. Public verification requires no account.'
  },
  {
    icon: BarChart3,
    title: 'Flat Pricing',
    description: 'Same price regardless of peptide complexity. No hidden fees, no minimums, no contracts.'
  },
  {
    icon: Globe,
    title: 'Public Verification',
    description: 'Share a permanent COA link. Anyone can verify authenticity without logging in.'
  },
  {
    icon: Zap,
    title: 'Rush Processing',
    description: 'Need results fast? Add rush processing at checkout for priority queue placement.'
  },
  {
    icon: Shield,
    title: 'Third-Party Independent',
    description: 'No affiliation with manufacturers. ISO 17025 accreditation in progress.'
  },
];

const panels = [
  { name: 'HPLC Purity', price: '$45', tag: 'Most popular' },
  { name: 'Identity (HPLC)', price: '$35', tag: null },
  { name: 'Molecular Weight', price: '$55', tag: null },
  { name: 'Amino Acid Analysis', price: '$75', tag: null },
  { name: 'Endotoxin (LAL)', price: '$65', tag: null },
  { name: 'Heavy Metals', price: '$85', tag: 'Coming soon' },
  { name: 'Residual Solvents', price: '$80', tag: 'Coming soon' },
  { name: 'NMR Analysis', price: '$120', tag: 'Coming soon' },
];

const testimonials = [
  {
    quote: "Atlas Analytics gave us a permanent COA link we could put directly on our product page. Customers can verify right there — no PDF to download.",
    author: "Ryan T.",
    role: "Peptide Vendor, Texas"
  },
  {
    quote: "The 50% first-order discount made it a no-brainer to try them. Now we use Atlas Analytics for every batch.",
    author: "Dana K.",
    role: "Research Supplier, California"
  },
  {
    quote: "The interactive chromatogram is a huge differentiator. Our customers know exactly what they're getting.",
    author: "Marcus L.",
    role: "Lab Operations, Colorado"
  }
];

export default function Landing() {
  return (
    <div className="bg-white">
      <section className="relative bg-black border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-20 lg:pb-24">
          <div className="max-w-3xl">
            <p className="text-brand-400 text-xs font-bold uppercase tracking-[0.2em] mb-5">
              Independent peptide testing
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
              Verifiable results.<br />Permanent certificates.
            </h1>
            <p className="mt-5 text-base text-neutral-400 leading-relaxed max-w-xl">
              Third-party HPLC, MS, and QC testing with tamper-proof digital COAs. Flat pricing — no minimums, no contracts.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/order-new" className="btn-primary text-base px-6 py-3 gap-2.5">
                Submit Samples <ArrowRight size={18} />
              </Link>
              <Link to="/pricing" className="btn-outline-gold text-base px-6 py-3 border-neutral-700 text-neutral-300 hover:bg-neutral-900 hover:text-white">
                View Pricing
              </Link>
            </div>
            <div className="mt-10 pt-8 border-t border-neutral-800 flex flex-wrap gap-x-8 gap-y-3">
              {stats.map(s => (
                <div key={s.label}>
                  <p className="text-lg font-bold text-brand-400">{s.value}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 border-y border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="section-title">The trust problem in peptide testing</h2>
            <p className="section-subtitle">
              Static PDFs can be faked. Lab affiliations create conflicts of interest. Most COAs are impossible to verify. Atlas Analytics solves all three.
            </p>
            <Link to="/trust" className="inline-flex items-center gap-1.5 text-brand-600 font-medium text-sm mt-4 hover:text-brand-700">
              Read more about why this matters <ChevronRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card p-6 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                  <f.icon size={20} className="text-brand-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1">
              <h2 className="section-title">How it works</h2>
              <p className="section-subtitle">Simple, transparent, and fast — from submission to COA in days.</p>
              <div className="mt-8 space-y-6">
                {[
                  { step: '01', title: 'Submit your samples online', desc: 'Fill out our intake form. Select your test panels. Designate blend vs. single compound. No minimums.' },
                  { step: '02', title: 'Ship with prepaid label', desc: 'Generate a prepaid shipping label at checkout and send samples via FedEx or UPS to our Austin lab.' },
                  { step: '03', title: 'Real-time status updates', desc: 'Track every sample through Received → Analyzing → In Review → Complete in your dashboard.' },
                  { step: '04', title: 'Receive your digital COA', desc: 'Get a permanent COA URL with interactive chromatogram, pass/fail callouts, and cryptographic verification.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-5">
                    <div className="w-10 h-10 bg-black text-brand-400 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{item.title}</h4>
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link to="/order-new" className="btn-secondary gap-2">
                  Get Started <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            <div className="flex-1 w-full max-w-md">
              <div className="border border-atlas-border shadow-lg overflow-hidden bg-white">
                <div className="bg-black px-5 py-4 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">Certificate of Analysis</p>
                  <span className="badge-pass text-[10px]">
                    <CheckCircle size={10} /> PASS
                  </span>
                </div>
                <div className="coa-gold-divider" />
                <div className="p-5">
                  <p className="text-xs text-neutral-500 mb-4">ACC-20240115-7821 · BPC-157</p>

                <div className="bg-neutral-50 border border-atlas-border p-4 mb-4 relative overflow-hidden">
                  <div className="flex items-end gap-1 h-20 relative z-10">
                    {[12, 45, 30, 92, 87, 95, 88, 72, 40, 18, 8, 4].map((h, i) => (
                      <div key={i} className="flex-1 bg-brand-500 rounded-sm opacity-90 transition-all" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500 mt-2 text-center uppercase tracking-wide">HPLC Chromatogram · RT: 12.4 min</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="coa-stat-card p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Purity</p>
                    <p className="text-lg font-bold text-black">98.7%</p>
                  </div>
                  <div className="coa-stat-card p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Mol. Weight</p>
                    <p className="text-lg font-bold text-black">1419.6 Da</p>
                  </div>
                </div>

                <div className="overflow-hidden border border-atlas-border">
                  <div className="coa-table-header grid grid-cols-3 px-3 py-2">
                    <span>Test</span><span>Result</span><span>Status</span>
                  </div>
                  {['HPLC Purity', 'Identity', 'Endotoxin'].map((panel) => (
                    <div key={panel} className="grid grid-cols-3 px-3 py-2 text-xs border-t border-atlas-border">
                      <span className="text-neutral-700">{panel}</span>
                      <span className="font-medium">Pass</span>
                      <span className="text-atlas-success font-bold uppercase">Pass</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2 p-3 bg-neutral-50 border border-atlas-border">
                  <Shield size={14} className="text-brand-500" />
                  <p className="text-xs text-neutral-600 font-medium">Cryptographically verified · Hash: A3F7C9D1</p>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Flat pricing. Any peptide.</h2>
            <p className="section-subtitle">One price per panel regardless of complexity. Bundle discounts apply automatically.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {panels.map((panel) => (
              <div key={panel.name} className={`card p-4 relative ${panel.tag === 'Coming soon' ? 'opacity-60' : ''}`}>
                {panel.tag && (
                  <span className={`absolute -top-2 left-3 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    panel.tag === 'Most popular'
                      ? 'bg-brand-500 text-black'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {panel.tag}
                  </span>
                )}
                <p className="text-sm font-medium text-slate-900 mt-1">{panel.name}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{panel.price}</p>
                <p className="text-xs text-slate-500">per sample</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link to="/pricing" className="btn-primary gap-2">
              Open Pricing Calculator <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="section-title">Trusted by vendors and researchers</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="card p-6">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed mb-4">"{t.quote}"</p>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{t.author}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center">
              <Package size={26} className="text-black" />
            </div>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-lg text-slate-400 mb-8">No account required to get a quote. Your first order is 50% off — automatically applied at checkout.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/order-new" className="btn-primary text-base px-7 py-3 gap-2">
              Submit Your First Samples <ArrowRight size={18} />
            </Link>
            <Link to="/verify" className="inline-flex items-center justify-center gap-2 px-7 py-3 border border-neutral-700 text-slate-300 font-medium rounded-lg hover:bg-slate-800 transition-colors text-base">
              <Award size={17} /> Verify a COA
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-brand-500" /> No minimums</div>
            <div className="flex items-center gap-2"><CheckCircle size={14} className="text-brand-500" /> No contracts</div>
            <div className="flex items-center gap-2"><Clock size={14} className="text-brand-500" /> 3–5 day turnaround</div>
          </div>
        </div>
      </section>
    </div>
  );
}
