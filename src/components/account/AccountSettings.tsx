import { useEffect, useState } from 'react';
import {
  Building2, Mail, Lock, CheckCircle, AlertCircle, User, MapPin, Globe, Phone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import CompanyManager from './CompanyManager';

type Message = { type: 'success' | 'error'; text: string } | null;

export default function AccountSettings() {
  const { user, profile, updateProfile, updateEmail, updatePassword } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('US');

  const [email, setEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [profileSaving, setProfileSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Message>(null);
  const [emailMsg, setEmailMsg] = useState<Message>(null);
  const [pwMsg, setPwMsg] = useState<Message>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setWebsite(profile?.website ?? '');
    setAddressLine1(profile?.address_line1 ?? '');
    setAddressLine2(profile?.address_line2 ?? '');
    setCity(profile?.city ?? '');
    setState(profile?.state ?? '');
    setZip(profile?.zip ?? '');
    setCountry(profile?.country ?? 'US');
    setEmail(user?.email ?? '');
  }, [profile, user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    const { error } = await updateProfile({
      full_name: fullName.trim(),
      // Company name/logo are managed in the Companies section (synced from the default company).
      company_name: profile?.company_name ?? '',
      company_logo: profile?.company_logo ?? '',
      phone: phone.trim(),
      website: website.trim(),
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      country: country.trim() || 'US',
    });
    setProfileMsg(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: 'Profile updated successfully.' });
    setProfileSaving(false);
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setEmailMsg({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (email.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setEmailMsg({ type: 'error', text: 'That is already your current email.' });
      return;
    }
    setEmailSaving(true);
    setEmailMsg(null);
    const { error } = await updateEmail(email.trim());
    setEmailMsg(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: 'Confirmation sent — check your inbox to verify the new email address.' });
    setEmailSaving(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    const { error } = await updatePassword(newPw);
    if (error) {
      setPwMsg({ type: 'error', text: error.message });
    } else {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' });
      setNewPw('');
      setConfirmPw('');
    }
    setPwSaving(false);
  }

  function Alert({ msg }: { msg: Message }) {
    if (!msg) return null;
    return (
      <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
        msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
      }`}>
        {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
        {msg.text}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CompanyManager />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={handleSaveProfile} className="card p-6 space-y-4">
        <h3 className="font-bold text-black flex items-center gap-2">
          <Building2 size={16} /> Contact &amp; Address
        </h3>
        <Alert msg={profileMsg} />

        <div>
          <label className="label flex items-center gap-1.5"><User size={13} /> Full Name</label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" placeholder="Jane Smith" required />
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Phone size={13} /> Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="+1 (555) 000-0000" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Globe size={13} /> Website</label>
          <input type="url" value={website} onChange={e => setWebsite(e.target.value)} className="input-field" placeholder="www.yoursite.com" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><MapPin size={13} /> Street Address</label>
          <input type="text" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} className="input-field mb-2" placeholder="123 Main St" />
          <input type="text" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} className="input-field" placeholder="Suite, unit, etc. (optional)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">State</label>
            <input type="text" value={state} onChange={e => setState(e.target.value)} className="input-field" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">ZIP</label>
            <input type="text" value={zip} onChange={e => setZip(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Country</label>
            <input type="text" value={country} onChange={e => setCountry(e.target.value)} className="input-field" />
          </div>
        </div>

        <button type="submit" disabled={profileSaving} className="btn-primary w-full">
          {profileSaving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      <div className="space-y-6">
        <form onSubmit={handleChangeEmail} className="card p-6 space-y-4">
          <h3 className="font-bold flex items-center gap-2"><Mail size={16} /> Change Email</h3>
          <Alert msg={emailMsg} />
          <p className="text-xs text-neutral-500">Your current login email is <strong>{user?.email}</strong>. We&apos;ll send a confirmation link to the new address.</p>
          <div>
            <label className="label">New Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="you@company.com" required />
          </div>
          <button type="submit" disabled={emailSaving} className="btn-outline w-full border-brand-500 text-brand-700 hover:bg-brand-50">
            {emailSaving ? 'Sending...' : 'Update Email'}
          </button>
        </form>

        <form onSubmit={handleChangePassword} className="card p-6 space-y-4">
          <h3 className="font-bold flex items-center gap-2"><Lock size={16} /> Change Password</h3>
          <Alert msg={pwMsg} />
          <div>
            <label className="label">New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input-field" placeholder="Minimum 8 characters" minLength={8} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-field" placeholder="Re-enter new password" />
          </div>
          <button type="submit" disabled={pwSaving} className="btn-secondary w-full text-sm">
            {pwSaving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
