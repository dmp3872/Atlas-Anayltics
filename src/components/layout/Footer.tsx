import { Link } from 'react-router-dom';
import { MapPin, Mail, Phone, Shield } from 'lucide-react';
import AtlasLogo from '../brand/AtlasLogo';

export default function Footer() {
  return (
    <footer className="bg-black text-neutral-400">
      <div className="coa-gold-divider" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Link to="/" className="mb-4 inline-block">
              <AtlasLogo variant="light" size="sm" />
            </Link>
            <p className="text-sm leading-relaxed text-neutral-500">
              Independent third-party peptide testing. Digital COAs. No minimums. No contracts.
            </p>
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-brand-500 flex-shrink-0" />
                <span>1234 Research Blvd, Austin, TX 78701</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-brand-500 flex-shrink-0" />
                <span>labs@atlasanalytics.io</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-brand-500 flex-shrink-0" />
                <span>(512) 555-0199</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-brand-500 mb-4 uppercase tracking-wider">Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/order" className="hover:text-brand-400 transition-colors">Submit Samples</Link></li>
              <li><Link to="/pricing" className="hover:text-brand-400 transition-colors">Pricing Calculator</Link></li>
              <li><Link to="/verify" className="hover:text-brand-400 transition-colors">Verify a COA</Link></li>
              <li><Link to="/coa-library" className="hover:text-brand-400 transition-colors">COA Library</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-brand-500 mb-4 uppercase tracking-wider">Company</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/trust" className="hover:text-brand-400 transition-colors">Why Atlas Analytics</Link></li>
              <li><Link to="/roadmap" className="hover:text-brand-400 transition-colors">Roadmap</Link></li>
              <li><Link to="/auth" state={{ from: '/dashboard' }} className="hover:text-brand-400 transition-colors">Client Portal</Link></li>
              <li><a href="mailto:labs@atlasanalytics.io" className="hover:text-brand-400 transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-brand-500 mb-4 uppercase tracking-wider">Credentials</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-800 bg-neutral-950">
                <Shield size={15} className="text-brand-500" />
                <div>
                  <p className="text-xs font-medium text-white">ISO 17025</p>
                  <p className="text-xs text-neutral-500">Accreditation pending</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-neutral-800 bg-neutral-950">
                <Shield size={15} className="text-brand-500" />
                <div>
                  <p className="text-xs font-medium text-white">Tamper-Proof COAs</p>
                  <p className="text-xs text-neutral-500">Cryptographic signing</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-600">
          <p>&copy; {new Date().getFullYear()} Atlas Analytics. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-brand-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-brand-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
