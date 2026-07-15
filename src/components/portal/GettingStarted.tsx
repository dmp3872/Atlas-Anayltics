import { Link } from 'react-router-dom';
import { ArrowRight, Package, FileText, Shield, Truck, Beaker } from 'lucide-react';

const STEPS = [
  {
    icon: Package,
    title: 'Submit your samples',
    body: 'Use the order wizard to select tests, enter batch details, and choose add-ons like rush processing or multi-brand COAs.',
    cta: { label: 'Start an order', href: '/order-new' },
  },
  {
    icon: Truck,
    title: 'Ship to our lab',
    body: 'You’re preboarded — UPS comes to you, scans your plaque and prepaid label, and your package is RFID tracked end to end. You never pay for shipping. Thank you for preboarding!',
    cta: { label: 'View your orders', href: '/dashboard?tab=orders' },
  },
  {
    icon: FileText,
    title: 'Track & receive COAs',
    body: 'Follow each sample through Received → Analyzing → In Review → Complete. Certificates publish to a permanent, verifiable URL.',
    cta: { label: 'View your COAs', href: '/dashboard/coas' },
  },
  {
    icon: Shield,
    title: 'Share verified results',
    body: 'Every COA includes a QR code and cryptographic hash. Customers can scan or enter the ID at atlasanalytics.io/verify.',
    cta: { label: 'Verification tool', href: '/verify' },
  },
];

export default function GettingStarted() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="portal-page-title">Getting Started</h1>
        <p className="portal-page-subtitle">Everything you need to submit samples and receive verified certificates of analysis.</p>
      </div>

      <div className="card p-5 bg-brand-50/50 border-brand-200">
        <p className="text-sm text-neutral-800">
          <strong className="text-black">First order?</strong> Your account receives an automatic 50% discount on the first sample.
          Typical turnaround is 48–72 business hours from sample receipt.
        </p>
      </div>

      <div className="space-y-4">
        {STEPS.map((step, i) => (
          <div key={step.title} className="card p-5 flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-black text-brand-500 flex items-center justify-center font-bold text-sm">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <step.icon size={16} className="text-brand-600" />
                <h2 className="font-semibold text-black">{step.title}</h2>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">{step.body}</p>
              <Link to={step.cta.href} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-600 mt-3">
                {step.cta.label} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 flex items-start gap-3">
        <Beaker size={20} className="text-brand-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-black">Don&apos;t see your peptide?</p>
          <p className="text-sm text-neutral-600 mt-1">Request a new compound and our team will validate methods before adding it to the catalog.</p>
          <Link to="/dashboard?tab=peptide-requests" className="text-sm font-medium text-brand-700 hover:underline mt-2 inline-block">
            Submit a peptide request →
          </Link>
        </div>
      </div>
    </div>
  );
}
