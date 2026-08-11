import { useState } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import PageBackLink from '../components/ui/PageBackLink';

export default function Contact() {
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="coa-header-bar">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Contact</h1>
          <p className="text-neutral-400 text-sm max-w-md mx-auto">
            Questions about testing, orders, or verification — we typically respond within one business day.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <PageBackLink label="Back to Home" to="/" />

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Mail, label: 'Email', value: 'labs@atlasanalytics.io', href: 'mailto:labs@atlasanalytics.io' },
            { icon: Phone, label: 'Phone', value: '(512) 555-0199', href: 'tel:+15125550199' },
            { icon: MapPin, label: 'Lab', value: 'Columbia, SC', href: undefined },
          ].map((item) => (
            <div key={item.label} className="card p-4">
              <item.icon size={16} className="text-brand-600 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{item.label}</p>
              {item.href ? (
                <a href={item.href} className="text-sm font-medium text-black hover:text-brand-700">
                  {item.value}
                </a>
              ) : (
                <p className="text-sm font-medium text-black">{item.value}</p>
              )}
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-black mb-4">Send a message</h2>
          {sent ? (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-4">
              Thanks — your message was recorded. We’ll follow up at the email you provided.
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Name</label>
                  <input required type="text" className="input-field" placeholder="Your name" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input required type="email" className="input-field" placeholder="you@company.com" />
                </div>
              </div>
              <div>
                <label className="label">Subject</label>
                <input required type="text" className="input-field" placeholder="How can we help?" />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea required className="input-field resize-none" rows={5} placeholder="Order numbers, sample IDs, or verification questions help us respond faster." />
              </div>
              <button type="submit" className="btn-primary">Send Message</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
