import { Link } from "react-router-dom";
export default function PublicLab({ clients = false }: { clients?: boolean }) {
  return (
    <main className="public-page">
      <div className="public-container">
        <p className="public-kicker">
          Atlas Analytics / {clients ? "Client services" : "The laboratory"}
        </p>
        <h1>
          {clients
            ? "A clear path from your first sample to your next discovery."
            : "Independent analysis. Clear, traceable results."}
        </h1>
        <p className="public-lead">
          {clients
            ? "Tell us what you are researching, what you plan to send, and which answers you need. Our team reviews your requirements before opening your account for orders."
            : "Atlas Analytics provides analytical testing for research materials, with sample tracking and digital certificates of analysis that connect each result to the work behind it."}
        </p>
        <div className="flex flex-wrap gap-3 mt-8">
          <Link
            to="/auth?mode=signup"
            state={{ from: "/application" }}
            className="public-button"
          >
            {clients ? "Create your account" : "Become a client"}{" "}
            <span aria-hidden>↗</span>
          </Link>
          <Link
            to={clients ? "/pricing" : "/verify"}
            className="public-button public-button-secondary"
          >
            {clients ? "Explore testing & pricing" : "Verify a certificate"}
          </Link>
        </div>
        <section className="mt-16 border-t border-stone-300">
          {(clients
            ? [
                [
                  "01",
                  "Create an account",
                  "Use your work email to create a secure client account.",
                ],
                [
                  "02",
                  "Start your application",
                  "Share company details, sample volumes, testing requirements, and shipping and billing information. Save a draft whenever you need to pause.",
                ],
                [
                  "03",
                  "Lab review",
                  "An administrator reviews your application and may request more information. You can check the status in your account.",
                ],
                [
                  "04",
                  "Start sending samples",
                  "After approval, submit orders and follow your samples through testing to your certificates.",
                ],
              ]
            : [
                [
                  "01",
                  "Testing built around your samples",
                  "Explore identity, purity and quantity testing, alongside heavy metals, endotoxin, sterility and other available services.",
                ],
                [
                  "02",
                  "A connected laboratory workflow",
                  "Orders are assigned to chemists, tracked through testing, and connected to their results.",
                ],
                [
                  "03",
                  "Certificates you can check",
                  "Enter the exact code from a certificate to retrieve its public record. Verification is available without an account.",
                ],
              ]
          ).map(([number, title, body]) => (
            <div
              key={number}
              className="grid sm:grid-cols-[70px_1fr_1.3fr] gap-5 py-8 border-b border-stone-300"
            >
              <span className="text-sm text-stone-500">{number}</span>
              <h2 className="text-xl">{title}</h2>
              <p className="text-sm leading-7 text-stone-600">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
