import { Mail, MessageCircle, FileText, Phone } from 'lucide-react';
import ClientPortalLayout from '../components/layout/ClientPortalLayout';

export default function Support() {
  return (
    <ClientPortalLayout>
      <div className="max-w-2xl">
        <h1 className="portal-page-title mb-2">Support</h1>
        <p className="portal-page-subtitle mb-6">Get help with orders, COAs, and account questions.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {[
            { icon: Mail, title: 'Email Support', desc: 'labs@accumark.io', sub: 'Mon–Fri, 9am–5pm CST', href: 'mailto:labs@accumark.io', label: 'Send Email' },
            { icon: Phone, title: 'Phone', desc: '(512) 555-0199', sub: 'Business hours only', href: 'tel:+15125550199', label: 'Call Now' },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                <item.icon size={20} className="text-brand-600" />
              </div>
              <h3 className="font-semibold text-black mb-1">{item.title}</h3>
              <p className="text-neutral-700 text-sm font-medium">{item.desc}</p>
              <p className="text-xs text-neutral-500 mb-4">{item.sub}</p>
              <a href={item.href} className="btn-outline text-sm w-full justify-center">{item.label}</a>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-black mb-4 flex items-center gap-2">
            <MessageCircle size={17} /> Send a Message
          </h2>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert('Message sent! We\'ll get back to you within 1 business day.'); }}>
            <div>
              <label className="label">Subject</label>
              <input type="text" className="input-field" placeholder="e.g., Question about my order ACC-20240115-1234" />
            </div>
            <div>
              <label className="label">Order Number <span className="text-neutral-400 font-normal normal-case tracking-normal">(optional)</span></label>
              <input type="text" className="input-field" placeholder="ACC-XXXXXXXX-XXXX" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input-field resize-none" rows={5} placeholder="Describe your question or issue..." />
            </div>
            <button type="submit" className="btn-primary w-full">Send Message</button>
          </form>
        </div>

        <div className="card p-6 mt-5 bg-neutral-50">
          <h3 className="font-semibold text-black mb-4 flex items-center gap-2">
            <FileText size={15} /> Quick Help
          </h3>
          <div className="space-y-3">
            {[
              { q: 'How long does testing take?', a: 'Standard panels take 3–5 business days from receipt. Rush processing reduces this to 1–2 days.' },
              { q: 'Can I add panels after submitting?', a: 'Contact us as soon as possible. If your samples haven\'t been analyzed yet, we can add panels to your order.' },
              { q: 'How do I share my COA?', a: 'Copy the COA page link (/coa/…) to open the full certificate, or Copy Verify Link (/verify?id=…) so someone prefills the ID and clicks Verify themselves. QR codes use the verify link. You can also download a PDF.' },
              { q: 'What if my sample fails?', a: 'You\'ll receive a detailed COA with pass/fail callouts for each panel. We do not revise or retract failing results.' },
            ].map(({ q, a }) => (
              <div key={q} className="pb-3 border-b border-atlas-border last:border-0">
                <p className="font-medium text-black text-sm">{q}</p>
                <p className="text-sm text-neutral-500 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ClientPortalLayout>
  );
}
