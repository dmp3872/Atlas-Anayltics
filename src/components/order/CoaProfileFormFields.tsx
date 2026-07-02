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

      {!compact && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">
              Company Logo <span className="text-neutral-400 font-normal text-xs">(300×300px · PNG or JPG)</span>
            </label>
            <LogoDropzone
              value={form.logo}
              onChange={logo => onChange({ logo })}
              onError={onError}
              prompt="a logo"
              hint="PNG or JPG · 300×300px"
              compact
            />
          </div>
          <div>
            <label className="label">
              Chromatograph Background <span className="text-neutral-400 font-normal text-xs">(optional)</span>
            </label>
            <LogoDropzone
              value={form.chromatograph_background}
              onChange={chromatograph_background => onChange({ chromatograph_background })}
              onError={onError}
              prompt="a background"
              hint="PNG preferred · 1500×600px"
              maxBytes={BACKGROUND_MAX_BYTES}
              compact
            />
          </div>
        </div>
      )}

      {compact && (
        <div>
          <label className="label">Company Logo <span className="text-neutral-400 font-normal text-xs">(optional)</span></label>
          <LogoDropzone
            value={form.logo}
            onChange={logo => onChange({ logo })}
            onError={onError}
            prompt="a logo"
            hint="PNG or JPG"
            compact
          />
        </div>
      )}
    </div>
  );
}
