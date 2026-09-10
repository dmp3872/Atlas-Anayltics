import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, LogOut, ArrowUpRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABELS, resolveUserRole, roleHome } from "../../lib/roles";
import "./public-site.css";
const navigation = [
  { href: "/about", label: "About the lab" },
  { href: "/pricing", label: "Testing & pricing" },
  { href: "/verify", label: "Verify a COA" },
  { href: "/clients", label: "Become a client" },
];
export default function Header() {
  const { user, profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const role = resolveUserRole(profile, user?.email);
  const home = roleHome(role);
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node))
        setAccountOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const accountLinks =
    role === "admin"
      ? [
          { href: "/admin", label: "Admin workspace" },
          { href: "/lab", label: "Chemist console" },
          { href: "/dashboard", label: "Client portal" },
        ]
      : [
          {
            href: home,
            label: role === "client" ? "Client portal" : ROLE_LABELS[role],
          },
        ];
  return (
    <header className="public-site-header">
      <div className="public-header-inner">
        <Link
          to="/"
          className="public-wordmark"
          aria-label="Atlas Analytics home"
        >
          <span>ATLAS</span>
          <i />
          <small>ANALYTICS</small>
        </Link>
        <nav className="public-desktop-nav" aria-label="Main navigation">
          {navigation.map((n) => (
            <Link
              key={n.href}
              to={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="public-account-actions">
          {user ? (
            <div className="public-account" ref={accountRef}>
              <button
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((v) => !v)}
              >
                <span className="public-account-initial">
                  {(profile?.full_name || user.email || "A")[0].toUpperCase()}
                </span>
                <span>{profile?.full_name || "My account"}</span>
                <ChevronDown size={13} />
              </button>
              {accountOpen && (
                <div className="public-account-menu">
                  <p>{ROLE_LABELS[role]}</p>
                  {accountLinks.map((n) => (
                    <Link key={n.href} to={n.href}>
                      {n.label}
                      <ArrowUpRight size={13} />
                    </Link>
                  ))}
                  {role === "client" && (
                    <Link to="/application">My application</Link>
                  )}
                  {role !== "verifier" && (
                    <Link to="/account">Account settings</Link>
                  )}
                  <button
                    onClick={() => {
                      void signOut();
                      setAccountOpen(false);
                    }}
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/auth" className="public-signin">
              Client sign in <ArrowUpRight size={14} />
            </Link>
          )}
          <button
            className="public-menu-toggle"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="public-mobile-nav" aria-label="Mobile navigation">
          {navigation.map((n) => (
            <Link key={n.href} to={n.href}>
              {n.label}
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
