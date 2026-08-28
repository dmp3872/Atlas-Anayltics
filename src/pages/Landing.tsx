import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, ChevronRight, Shield } from 'lucide-react';
import AtlasLogo from '../components/brand/AtlasLogo';

const proof = [
  {
    title: 'Live digital COAs',
    description: 'Permanent URLs rendered from our LIMS — interactive chromatograms, not static PDFs anyone can fake.',
  },
  {
    title: 'Tamper-proof signing',
    description: 'Every certificate is cryptographically hashed. Public verification needs no account.',
  },
  {
    title: 'Independent lab',
    description: 'No manufacturer affiliation. Flat panel pricing, no minimums, no contracts.',
  },
];

const steps = [
  { step: '01', title: 'Submit online', desc: 'Choose panels, designate blend vs single compound, and check out in minutes.' },
  { step: '02', title: 'Ship with prepaid label', desc: 'Generate a FedEx or UPS label at checkout and send samples to our Austin lab.' },
  { step: '03', title: 'Track in real time', desc: 'Follow every sample from Received through Analyzing to Complete in your portal.' },
  { step: '04', title: 'Receive your COA', desc: 'Get a permanent certificate link with verification and interactive chromatogram.' },
];

export default function Landing() {
  return (
    <div className="aa-shell aa-landing">
      <section className="aa-hero">
        <div className="aa-hero-ambient" aria-hidden />
        <div className="aa-hero-inner aa-animate">
          <div className="aa-hero-brand">
            <AtlasLogo variant="light" size="header" />
          </div>
          <p className="aa-hero-kicker">Independent peptide testing</p>
          <h1 className="aa-hero-title">Verifiable results. Permanent certificates.</h1>
          <p className="aa-hero-sub">
            Third-party HPLC, MS, and QC testing with tamper-proof digital COAs.
          </p>
          <div className="aa-hero-ctas">
            <Link to="/order-new" className="aa-btn-primary">
              Submit Samples <ArrowRight size={17} />
            </Link>
            <Link to="/verify" className="aa-btn-ghost">
              Verify a COA
            </Link>
          </div>
        </div>
      </section>

      <section className="aa-section" style={{ background: '#f5f5f7' }}>
        <div className="aa-ambient" aria-hidden />
        <div className="aa-section-inner aa-animate" style={{ animationDelay: '80ms' }}>
          <p className="aa-section-kicker">Why Atlas</p>
          <h2 className="aa-section-title">Trust built into every certificate.</h2>
          <p className="aa-section-sub">
            Static PDFs can be faked. Lab affiliations create conflicts. Most COAs are impossible to verify. We solve all three.
          </p>
          <div className="aa-proof-grid">
            {proof.map(item => (
              <div key={item.title} className="aa-proof-item">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
          <Link to="/trust" className="aa-proof-link">
            Why this matters <ChevronRight size={15} />
          </Link>
        </div>
      </section>

      <section className="aa-section aa-how">
        <div className="aa-section-inner aa-animate" style={{ animationDelay: '120ms' }}>
          <p className="aa-section-kicker">Process</p>
          <h2 className="aa-section-title">From submission to COA in days.</h2>
          <p className="aa-section-sub">Simple, transparent, and fast — with a prepaid label included.</p>

          <div className="aa-how-layout">
            <ol className="aa-steps">
              {steps.map(item => (
                <li key={item.step} className="aa-step">
                  <span className="aa-step-num">{item.step}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="aa-coa-preview" aria-hidden>
              <div className="aa-coa-preview-head">
                <span>Certificate of Analysis</span>
                <span className="badge-pass text-[10px]">
                  <CheckCircle size={10} /> PASS
                </span>
              </div>
              <div className="coa-gold-divider" />
              <div className="aa-coa-preview-body">
                <p className="text-xs text-neutral-500 mb-3">ACC-20240115-7821 · BPC-157</p>
                <div className="aa-coa-bars">
                  {[12, 45, 30, 92, 87, 95, 88, 72, 40, 18, 8, 4].map((h, i) => (
                    <i key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="aa-coa-stats">
                  <div className="aa-coa-stat">
                    <span>Purity</span>
                    <strong>98.7%</strong>
                  </div>
                  <div className="aa-coa-stat">
                    <span>Mol. Weight</span>
                    <strong>1419.6 Da</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-600">
                  <Shield size={13} className="text-brand-500" />
                  Cryptographically verified
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link to="/order-new" className="aa-btn-dark">
              Get started <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="aa-close aa-animate" style={{ animationDelay: '160ms' }}>
        <h2>Ready when you are.</h2>
        <p>No account required to start. First sample is 50% off — applied automatically at checkout.</p>
        <div className="aa-close-ctas">
          <Link to="/order-new" className="aa-btn-primary">
            Submit your first samples <ArrowRight size={17} />
          </Link>
          <Link to="/pricing" className="aa-btn-ghost">
            View pricing
          </Link>
        </div>
      </section>
    </div>
  );
}
