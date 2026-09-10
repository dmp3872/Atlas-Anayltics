import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { fetchPublicCoa } from "../lib/publicCoa";
import type { COA } from "../lib/types";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
export default function PublicVerify() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("slug") || "");
  const [result, setResult] = useState<COA | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  async function verify(code: string) {
    const ticket = ++request.current;
    setResult(null);
    setMessage("");
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(code.trim())) {
      setMessage("Enter the complete certificate code printed on your COA.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await fetchPublicCoa(code);
      if (ticket !== request.current) return;
      if (error)
        setMessage(
          "Verification is temporarily unavailable. Please try again.",
        );
      else if (!data)
        setMessage(
          "No public certificate matches that code. Check the code on your document and try again.",
        );
      else setResult(data as COA);
    } catch {
      if (ticket === request.current)
        setMessage("We could not connect to the lab. Please try again.");
    } finally {
      if (ticket === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const requests = request;
    const code = params.get("slug");
    if (code) {
      setQuery(code);
      void verify(code);
    }
    return () => {
      requests.current++;
    };
  }, [params]);
  return (
    <>
      <Header />
      <main className="public-page">
        <div className="public-container" style={{ maxWidth: 820 }}>
          <p className="public-kicker">Public certificate verification</p>
          <h1>Check the record behind the result.</h1>
          <p className="public-lead">
            Enter the exact code from your Atlas certificate of analysis. No
            account is required.
          </p>
          <form
            className="public-surface mt-10"
            onSubmit={(e) => {
              e.preventDefault();
              void verify(query);
            }}
          >
            <label className="public-field" htmlFor="certificate-code">
              <span>Certificate code</span>
              <input
                id="certificate-code"
                autoComplete="off"
                spellCheck={false}
                maxLength={128}
                placeholder="e.g. 2609-WUH3QK"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  request.current++;
                  setResult(null);
                  setMessage("");
                  setLoading(false);
                }}
              />
              <small>
                Use the code on the document, or scan its verification QR code.
              </small>
            </label>
            <button
              className="public-button mt-5"
              disabled={loading || !query.trim()}
            >
              {loading ? "Checking certificate…" : "Verify certificate"}
              <ArrowUpRight size={16} />
            </button>
          </form>
          {message && (
            <p role="status" className="public-message">
              {message}
            </p>
          )}
          {result && (
            <section aria-live="polite" className="public-surface mt-6">
              <div className="flex gap-3 items-center mb-5">
                <CheckCircle2 size={20} className="text-emerald-700" />
                <h2 className="text-xl">Certificate record found</h2>
              </div>
              <p className="text-sm text-stone-600 mb-6">
                This code matches a public record at Atlas Analytics. Compare
                the sample and lot details with your document.
              </p>
              <dl className="public-form-grid">
                {[
                  ["Certificate", result.slug],
                  ["Sample", result.display_name || result.sample_name],
                  ["Company", result.company_name],
                  ["Lot / batch", result.batch_number],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-stone-500">{label}</dt>
                    <dd className="mt-1 text-sm font-medium">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <Link
                className="public-button mt-6"
                to={`/coa/${encodeURIComponent(result.slug)}`}
              >
                View certificate <ArrowUpRight size={16} />
              </Link>
            </section>
          )}
          <p className="text-sm text-stone-500 leading-7 mt-8">
            Certificates are retrieved by their unique code. There is no public
            directory of client reports. If you do not have a code, request the
            certificate from the company that supplied your sample.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
