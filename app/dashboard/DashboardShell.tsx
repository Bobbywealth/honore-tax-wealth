import type { ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, LogOut } from "lucide-react";

type Props = {
  audience: "Client" | "Admin";
  title: string;
  description: string;
  children: ReactNode;
};

export default function DashboardShell({ audience, title, description, children }: Props) {
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <a className="dashboard-logo" href="/">
          <img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" />
        </a>
        <div className="dashboard-side-label">{audience} portal</div>
        <nav aria-label="Dashboard navigation">
          <a className="is-active" href="#overview"><LayoutDashboard size={18} /> Overview</a>
          <a href="#activity">Activity</a>
          <a href="#next-steps">Next steps</a>
        </nav>
        <div className="dashboard-sidebar-bottom">
          <a href="/login"><ArrowLeft size={16} /> Portal home</a>
          <a href="/"><LogOut size={16} /> Website</a>
        </div>
      </aside>

      <div className="dashboard-main" id="overview">
        <header className="dashboard-topbar">
          <a className="dashboard-mobile-logo" href="/"><img src="/assets/honore-logo-cropped.png" alt="Honoré Tax & Wealth" /></a>
          <span>{audience} dashboard</span>
          <a href="/login">Exit preview</a>
        </header>
        <div className="dashboard-content">
          <div className="dashboard-heading">
            <div><span className="dashboard-eyebrow">HONORÉ / {audience.toUpperCase()}</span><h1>{title}</h1><p>{description}</p></div>
            <span className="dashboard-preview">PORTAL PREVIEW</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
