import LogoDropzone from '../account/LogoDropzone';

const BACKGROUND_MAX_BYTES = 3 * 1024 * 1024;

export interface CoaProfileFormState {
  name: string;
  website: string;
  email: string;
  address: string;
  logo: string;
  chromatograph_background: string;
}

export const EMPTY_COA_PROFILE_FORM: CoaProfileFormState = {
  name: '',
  website: '',
  email: '',
  address: '',
  logo: '',
  chromatograph_background: '',
};

interface Props {
  form: CoaProfileFormState;
  onChange: (patch: Partial<CoaProfileFormState>) => void;
  onError?: (message: string) => void;
  compact?: boolean;
}

export default function CoaProfileFormFields({ form, onChange, onError, compact = false }: Props) {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <label className="label">Company Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={form.name}
          onChange={e => onChange({ name: e.target.value })}
          className="input-field"
          placeholder="Brand name shown on your COA header"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Website</label>
          <input
            type="url"
            value={form.website}
            onChange={e => onChange({ website: e.target.value })}
            className="input-field"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => onChange({ email: e.target.value })}
            className="input-field"
            placeholder="contact@example.com"
          />
        </div>
      </div>

      <div>
        <label className="label">Address</label>
        <textarea
          value={form.address}
          onChange={e => onChange({ address: e.target.value })}
          className="input-field min-h-[64px] resize-y"
          placeholder="Street address, City, State, Zip"
        />
      </div>

      <div className={`grid gap-4 ${compact ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
        <div>
          <label className="label">
            Company logo <span className="text-neutral-400 font-normal text-xs">(COA header)</span>
          </label>
          <p className="text-xs text-neutral-500 mb-2">
            Appears to the left of your company name on certificates.
          </p>
          <LogoDropzone
            value={form.logo}
            onChange={logo => onChange({ logo })}
            onError={onError}
            prompt="a company logo"
            hint="PNG or JPG · square works best"
            maxBytes={BACKGROUND_MAX_BYTES}
            compact
          />
        </div>
        <div>
          <label className="label">
            Chromatogram watermark <span className="text-neutral-400 font-normal text-xs">(HPLC)</span>
          </label>
          <p className="text-xs text-neutral-500 mb-2">
            Faint logo behind the HPLC chromatogram on your COA.
          </p>
          <LogoDropzone
            value={form.chromatograph_background}
            onChange={chromatograph_background => onChange({ chromatograph_background })}
            onError={onError}
            prompt="a watermark logo"
            hint="PNG preferred · used at low opacity"
            maxBytes={BACKGROUND_MAX_BYTES}
            compact
          />
        </div>
      </div>
    </div>
  );
}
