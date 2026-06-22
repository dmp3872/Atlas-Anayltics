import { Mail, MessageCircle, FileText, Phone } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

export default function Support() {
  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Support</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {[
            { icon: Mail, title: 'Email Support', desc: 'labs@accumark.io', sub: 'Mon–Fri, 9am–5pm CST', href: 'mailto:labs@accumark.io', label: 'Send Email' },
            { icon: Phone, title: 'Phone', desc: '(512) 555-0199', sub: 'Business hours only', href: 'tel:+15125550199', label: 'Call Now' },
          ].map((item) => (
            <div key={item.title} className="card p-5">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                <item.icon size={20} className="text-brand-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
              <p className="text-slate-700 text-sm font-medium">{item.desc}</p>
              <p className="text-xs text-slate-500 mb-4">{item.sub}</p>
              <a href={item.href} className="btn-outline text-sm w-full justify-center">{item.label}</a>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageCircle size={17} /> Send a Message
          </h2>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); alert('Message sent! We\'ll get back to you within 1 business day.'); }}>
            <div>
              <label className="label">Subject</label>
              <input type="text" className="input-field" placeholder="e.g., Question about my order ACC-20240115-1234" />
            </div>
            <div>
              <label className="label">Order Number <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" className="input-field" placeholder="ACC-XXXXXXXX-XXXX" />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea className="input-field resize-none" rows={5} placeholder="Describe your question or issue..." />
            </div>
            <button type="submit" className="btn-primary w-full">Send Message</button>
          </form>
        </div>

        <div className="card p-6 mt-5 bg-slate-50">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText size={15} /> Quick Help
          </h3>
          <div className="space-y-3">
            {[
              { q: 'How long does testing take?', a: 'Standard panels take 3–5 business days from receipt. Rush processing reduces this to 1–2 days.' },
              { q: 'Can I add panels after submitting?', a: 'Contact us as soon as possible. If your samples haven\'t been analyzed yet, we can add panels to your order.' },
              { q: 'How do I share my COA?', a: 'Every AccuMark COA has a permanent URL you can share directly. You can also download a PDF version for archives.' },
              { q: 'What if my sample fails?', a: 'You\'ll receive a detailed COA with pass/fail callouts for each panel. We do not revise or retract failing results.' },
            ].map(({ q, a }) => (
              <div key={q} className="pb-3 border-b border-slate-200 last:border-0">
                <p className="font-medium text-slate-900 text-sm">{q}</p>
                <p className="text-sm text-slate-500 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
