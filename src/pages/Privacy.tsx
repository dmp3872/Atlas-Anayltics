import { Link } from 'react-router-dom';
import PageBackLink from '../components/ui/PageBackLink';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="coa-header-bar">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-neutral-400 text-sm">Last updated: August 11, 2026</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8 text-sm text-neutral-700 leading-relaxed">
        <PageBackLink label="Back to Home" to="/" />

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Overview</h2>
          <p>
            Atlas Analytics (“we”, “us”) operates a laboratory testing platform and client portal.
            This policy describes how we collect, use, and protect information when you use our website,
            portal, and related services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Information we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Account details such as name, email, company, and phone number</li>
            <li>Order and sample information you submit for testing</li>
            <li>Payment and billing status associated with orders</li>
            <li>Usage data needed to operate verification tools, COA links, and the client portal</li>
            <li>Technical data such as browser type, IP address, and basic analytics events</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">How we use information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To process sample orders, generate COAs, and provide customer support</li>
            <li>To authenticate accounts and secure the portal</li>
            <li>To publish public certificates only when you (or lab workflow) make them public</li>
            <li>To improve product reliability, fraud prevention, and verification integrity</li>
            <li>To send transactional notifications about orders and certificates</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Sharing</h2>
          <p>
            We do not sell personal information. We may share data with service providers that help us
            operate the platform (for example hosting, email, and payment processors), and when required
            by law. Public COA pages and verify links only expose certificate fields intended for public verification.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Retention & security</h2>
          <p>
            We retain account and laboratory records as needed for operations, compliance, and audit integrity.
            Access is role-restricted. Content hashes and signatures support tamper detection for issued certificates.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Your choices</h2>
          <p>
            You may update account details in the client portal, request support for data questions, and
            control notification preferences where available. For public certificate visibility, use portal
            and lab publish controls associated with each COA.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Contact</h2>
          <p>
            Privacy questions: <a className="text-brand-700 hover:underline" href="mailto:labs@atlasanalytics.io">labs@atlasanalytics.io</a>
            {' '}· or use our <Link to="/contact" className="text-brand-700 hover:underline">Contact</Link> page.
          </p>
        </section>
      </div>
    </div>
  );
}
