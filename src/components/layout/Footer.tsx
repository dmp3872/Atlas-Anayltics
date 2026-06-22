import { Link } from 'react-router-dom';
import { FlaskConical, MapPin, Mail, Phone, Shield } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <FlaskConical size={16} className="text-white" />
              </div>
              <span className="font-bold text-white text-lg">Atlas Analytics</span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-500">
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
            <h4 className="text-sm font-semibold text-white mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/order" className="hover:text-white transition-colors">Submit Samples</Link></li>
              <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing Calculator</Link></li>
              <li><Link to="/verify" className="hover:text-white transition-colors">Verify a COA</Link></li>
              <li><Link to="/coa-library" className="hover:text-white transition-colors">COA Library</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/trust" className="hover:text-white transition-colors">Why Atlas Analytics</Link></li>
              <li><Link to="/roadmap" className="hover:text-white transition-colors">Roadmap</Link></li>
              <li><Link to="/dashboard" className="hover:text-white transition-colors">Client Portal</Link></li>
              <li><a href="mailto:labs@atlasanalytics.io" className="hover:text-white transition-colors">Contact Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Credentials</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-900">
                <Shield size={15} className="text-brand-500" />
                <div>
                  <p className="text-xs font-medium text-white">ISO 17025</p>
                  <p className="text-xs text-slate-500">Accreditation pending</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-900">
                <Shield size={15} className="text-brand-500" />
                <div>
                  <p className="text-xs font-medium text-white">Tamper-Proof COAs</p>
                  <p className="text-xs text-slate-500">Cryptographic signing</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <p>&copy; {new Date().getFullYear()} Atlas Analytics. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
