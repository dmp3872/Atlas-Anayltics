import { Link } from 'react-router-dom';
import PageBackLink from '../components/ui/PageBackLink';

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <div className="coa-header-bar">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-neutral-400 text-sm">Last updated: August 11, 2026</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8 text-sm text-neutral-700 leading-relaxed">
        <PageBackLink label="Back to Home" to="/" />

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Agreement</h2>
          <p>
            By using Atlas Analytics websites, portals, and laboratory services, you agree to these Terms.
            If you are ordering on behalf of a company, you represent that you are authorized to bind that company.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Services</h2>
          <p>
            We provide analytical testing and digital certificates of analysis (COAs). Turnaround times are estimates
            and may vary based on sample volume, sample condition, and selected panels. Results apply only to the
            samples tested as received.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Accounts & orders</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>You are responsible for accurate sample metadata, lot numbers, and shipping compliance.</li>
            <li>Payment obligations apply to accepted orders unless waived in writing by Atlas Analytics.</li>
            <li>Portal access is personal to authorized users; do not share credentials.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Certificates & verification</h2>
          <p>
            Issued COAs may include a permanent certificate URL and a separate verify link that prefills the
            certificate ID for public authenticity checks. Altering documents, misrepresenting results, or
            presenting unverified materials as Atlas Analytics certificates is prohibited.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Acceptable use</h2>
          <p>
            You may not misuse the platform, attempt unauthorized access, interfere with verification integrity,
            or use our services for unlawful purposes. We may suspend accounts that create security or compliance risk.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Disclaimer</h2>
          <p>
            Services are provided on an as-available basis. To the fullest extent permitted by law, Atlas Analytics
            disclaims warranties not expressly stated in a written agreement, and is not liable for indirect or
            consequential damages arising from use of results beyond the tested sample.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-black">Contact</h2>
          <p>
            Questions about these Terms: <a className="text-brand-700 hover:underline" href="mailto:labs@atlasanalytics.io">labs@atlasanalytics.io</a>
            {' '}· <Link to="/contact" className="text-brand-700 hover:underline">Contact page</Link>
            {' '}· <Link to="/privacy" className="text-brand-700 hover:underline">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
