import { NavLink } from "react-router-dom";
import "./Sidebar.css";

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: "⬡" },
  { path: "/robot-control", label: "Robot Control", icon: "🎮" },
  { path: "/live-tracking", label: "Live Tracking", icon: "📷" },
  { path: "/gesture-training", label: "Gesture Training", icon: "🤖" },
  { path: "/models", label: "Models", icon: "🧠" },
  { path: "/audience", label: "Audience", icon: "👥" },
  { path: "/presentation", label: "Presentation", icon: "🎤" },
  { path: "/system-logs", label: "System Logs", icon: "📋" },
  { path: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">🤖</span>
        <div className="sidebar__brand-text">
          <span className="sidebar__title">AI Robot</span>
          <span className="sidebar__subtitle">Presentation System</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar__link${isActive ? " sidebar__link--active" : ""}`
            }
          >
            <span className="sidebar__link-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="sidebar__link-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__version">Phase 0 · v0.1.0</span>
      </div>
    </aside>
  );
}
