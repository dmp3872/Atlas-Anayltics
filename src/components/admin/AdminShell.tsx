import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  ClipboardList,
  FlaskConical,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import AtlasLogo from "../brand/AtlasLogo";
import { useAuth } from "../../context/AuthContext";
import "./admin-workspace.css";

export type AdminSection =
  | "command"
  | "dispatch"
  | "lab"
  | "livechat"
  | "operations"
  | "orders"
  | "coas"
  | "applications"
  | "clients"
  | "users";
interface NavItem {
  id: AdminSection;
  label: string;
  desc: string;
  icon: typeof Activity;
}
const NAV_GROUPS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "workspace",
    label: "Laboratory",
    items: [
      {
        id: "command",
        label: "Overview",
        desc: "Operations overview",
        icon: LayoutGrid,
      },
      {
        id: "orders",
        label: "Orders",
        desc: "Orders, priority & payments",
        icon: ClipboardList,
      },
      {
        id: "dispatch",
        label: "Dispatch queue",
        desc: "Assign samples to chemists",
        icon: UserPlus,
      },
      {
        id: "lab",
        label: "Chemist workload",
        desc: "Assignments & aging",
        icon: FlaskConical,
      },
      {
        id: "coas",
        label: "COA registry",
        desc: "Certificates & audit",
        icon: Shield,
      },
    ],
  },
  {
    id: "manage",
    label: "Management",
    items: [
      {
        id: "applications", label: "Applications", desc: "Review new client applications", icon: UserPlus,
      },
      {
        id: "clients",
        label: "Clients",
        desc: "Companies & order history",
        icon: Building2,
      },
      {
        id: "livechat",
        label: "Client inbox",
        desc: "Messages & chemist handoffs",
        icon: MessageCircle,
      },
      {
        id: "operations",
        label: "Lab analytics",
        desc: "Intake & turnaround",
        icon: BarChart3,
      },
      {
        id: "users",
        label: "Team & access",
        desc: "Roles & accounts",
        icon: Users,
      },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);
interface Props {
  section: AdminSection;
  onSection: (s: AdminSection) => void;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  children: ReactNode;
}
export function AdminDetailChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  return (
    <div className="aa-shell aa-portal aa-admin admin-workspace admin-detail">
      <header className="admin-topbar">
        <Link to="/admin" className="admin-text-link">
          ← All orders
        </Link>
        <span>{title}</span>
        <div className="admin-detail-links">
          <Link to="/lab" className="admin-text-link">
            Chemist console
          </Link>
          <Link to="/dashboard" className="admin-text-link">
            Client portal
          </Link>
        </div>
        <button
          className="admin-icon-button"
          onClick={() => signOut()}
          aria-label="Sign out"
        >
          <LogOut size={17} />
        </button>
      </header>
      {children}
    </div>
  );
}
export default function AdminShell({
  section,
  onSection,
  title,
  subtitle,
  onRefresh,
  refreshing,
  updatedAt,
  children,
}: Props) {
  const { profile, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const menuButton = menuRef.current;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const elements =
          drawerRef.current?.querySelectorAll<HTMLElement>("a,button");
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
      menuButton?.focus();
    };
  }, [open]);
  const sidebar = (
    <>
      <div className="admin-brand">
        <Link to="/admin" aria-label="Atlas Analytics overview">
          <AtlasLogo size="sm" variant="light" />
        </Link>
        <span>LAB OPERATIONS</span>
      </div>
      <div className="admin-workspace-label">
        <span className="admin-workspace-mark">
          <FlaskConical size={16} />
        </span>
        <div>
          Atlas Analytics<small>Administrator workspace</small>
        </div>
      </div>
      <nav aria-label="Admin navigation" className="admin-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="admin-nav-group">
            <p>{group.label}</p>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? "page" : undefined}
                className={`admin-nav-link ${section === item.id ? "is-active" : ""}`}
                onClick={() => {
                  onSection(item.id);
                  setOpen(false);
                }}
              >
                <item.icon size={17} strokeWidth={1.65} />
                <span>{item.label}</span>
                {section === item.id && <span className="admin-active-dot" />}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="admin-console-links">
        <Link to="/lab">
          Chemist console <ArrowUpRight size={14} />
        </Link>
        <Link to="/dashboard">
          Client portal <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="admin-profile">
        <span className="admin-avatar">
          {(profile?.full_name || "AD")
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <strong>{profile?.full_name || "Administrator"}</strong>
          <small title={user?.email}>
            {user?.email || "Lab administrator"}
          </small>
        </div>
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          className="admin-icon-button"
        >
          <LogOut size={16} />
        </button>
      </div>
    </>
  );
  return (
    <div className="aa-shell aa-portal aa-admin admin-workspace">
      <a href="#admin-main" className="admin-skip">
        Skip to workspace
      </a>
      <aside className="admin-sidebar">{sidebar}</aside>
      {open && (
        <div className="admin-mobile-overlay">
          <div className="admin-backdrop" onClick={() => setOpen(false)} />
          <aside
            ref={drawerRef}
            className="admin-mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            <button
              className="admin-drawer-close admin-icon-button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="admin-content">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            <button
              ref={menuRef}
              className="admin-menu-button admin-icon-button"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="admin-slash">/</span>
            <strong>{NAV.find((n) => n.id === section)?.label}</strong>
          </div>
          <div className="admin-topbar-meta">
            <span className="admin-role-badge">
              <Shield size={12} /> Admin access
            </span>
            <span className="admin-date">
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        <main id="admin-main" className="admin-main" tabIndex={-1}>
          <div className="admin-page-heading">
            <div>
              <p className="admin-eyebrow">ATLAS / LAB OPERATIONS</p>
              <h1>{title}</h1>
              <p className="admin-page-description">{subtitle}</p>
            </div>
            <div className="admin-page-actions">
              {updatedAt && (
                <span className="admin-updated">
                  Updated{" "}
                  {updatedAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              {onRefresh && (
                <button
                  type="button"
                  className="admin-button"
                  onClick={onRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw
                    size={14}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  {refreshing ? "Refreshing" : "Refresh"}
                </button>
              )}
            </div>
          </div>
          {children}
          <footer className="admin-footer">
            <span>Atlas Analytics</span>
            <span>Laboratory operations workspace</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
