import { useCallback, useEffect, useState } from "react";
import { ApiError, type Me, api } from "./api";
import { Campaigns } from "./pages/Campaigns";
import { Contacts } from "./pages/Contacts";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Pool } from "./pages/Pool";
import { Portal } from "./pages/Portal";
import { Privacy } from "./pages/Privacy";
import { SetPassword } from "./pages/SetPassword";
import { Settings } from "./pages/Settings";

type StaffPage = "contacts" | "pool" | "campaigns" | "settings";

const NAV: { key: StaffPage; label: string; icon: string; group: string }[] = [
  { key: "contacts", label: "Contacts & outreach", icon: "◧", group: "Talent" },
  { key: "pool", label: "Talent pool", icon: "▦", group: "Talent" },
  { key: "campaigns", label: "Campaigns", icon: "✉", group: "Talent" },
  { key: "settings", label: "Settings", icon: "⚙", group: "Admin" },
];

/** Public paths render on their own, with no back-office chrome and no session. */
function publicView(path: string) {
  if (path.startsWith("/join")) return <Join />;
  if (path.startsWith("/profile")) return <Portal />;
  if (path.startsWith("/set-password")) return <SetPassword />;
  if (path.startsWith("/privacy")) return <Privacy />;
  return null;
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [page, setPage] = useState<StaffPage>("contacts");

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/api/auth/me"));
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      setMe(null);
    } finally {
      setChecked(true);
    }
  }, []);

  const isPublic = publicView(path) !== null;
  useEffect(() => {
    if (isPublic) setChecked(true);
    else void loadMe();
  }, [isPublic, loadMe]);

  const pub = publicView(path);
  if (pub) return pub;

  if (!checked) return <div className="spinner">Loading…</div>;
  if (!me) return <Login onSignedIn={loadMe} />;

  const current = NAV.find((n) => n.key === page)!;
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <img src="/logo.png" alt="Nexian" />
        </div>
        {groups.map((group) => (
          <div key={group}>
            <div className="navlbl">{group}</div>
            <nav className="nav">
              {NAV.filter((n) => n.group === group).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-current={page === item.key ? "page" : undefined}
                  onClick={() => setPage(item.key)}
                >
                  <span className="ic" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
        <div className="sidefoot">
          Nexian
          <br />
          powered by Solvint Group
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="crumb">
            Freelance pool / <strong>{current.label}</strong>
          </div>
          <div className="spacer" />
          <div className="userchip">
            <span>{me.name}</span>
            <span className="avatar" aria-hidden="true">
              {me.name.slice(0, 1).toUpperCase()}
            </span>
            <button
              type="button"
              className="btn plain sm"
              onClick={async () => {
                await api.post("/api/auth/logout");
                setMe(null);
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="content">
          {page === "contacts" && <Contacts />}
          {page === "pool" && <Pool />}
          {page === "campaigns" && <Campaigns />}
          {page === "settings" && <Settings me={me} />}
        </div>
      </div>
    </div>
  );
}
