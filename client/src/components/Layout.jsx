// ────────────────── client/src/components/Layout.jsx ──────────────────
/**
 * CORRECTIF ARCHITECTURE APPLIQUÉ : logout() du AuthContext est
 * désormais async (appelle POST /api/auth/logout pour effacer le cookie
 * de session côté serveur). doLogoutAndGoLogin attend cet appel avant de
 * naviguer vers /login.
 */
import React, { Suspense, useMemo, useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import AnimatedSidebar from "./AnimatedSidebar.jsx";
import ThemeSwitch from "./ThemeSwitch.jsx";
import Modal from "./Modal.jsx";
import { preloadRoutes } from "../routeModules.js";

const MENU = {
  common: [
    { to: "/app", label: "Dashboard" },
    { to: "/app/fuel", label: "Suivi carburant" },
    { to: "/app/calendar", label: "Calendrier" },
  ],
  demandeur: [
    { to: "/app/requests/fuel", label: "Demande carburant" },
    { to: "/app/requests/car", label: "Demande voiture" },
  ],
  logistique: [
    { to: "/app/import", label: "Import Excel" },
    { to: "/app/requests/fuel/manage", label: "Valid. carburant" },
    { to: "/app/requests/car/manage", label: "Valid. voiture" },
    { to: "/app/logbooks", label: "Journal de bord" },
    { to: "/app/meta", label: "Flotte & Chauffeurs" },
    { to: "/app/trash", label: "Corbeille" },
  ],
  raf: [
    { to: "/app/requests/fuel/raf", label: "Visa RAF carburant" },
    { to: "/app/requests/car/raf", label: "Visa RAF voiture" },
    { to: "/app/logbooks", label: "Journal de bord" },
  ],
  admin: [
    { to: "/app", label: "Dashboard" },
    { to: "/app/users", label: "Utilisateurs" },
    { to: "/app/fuel", label: "Suivi carburant" },
    { to: "/app/import", label: "Import Excel" },
    { to: "/app/meta", label: "Flotte & Chauffeurs" },
    { to: "/app/logbooks", label: "Journal de bord" },
    { to: "/app/trash", label: "Corbeille" },
  ],
};

function uniqByTo(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || !it.to) continue;
    if (seen.has(it.to)) continue;
    seen.add(it.to);
    out.push(it);
  }
  return out;
}

function isVisaMenuItem(it) {
  const label = String(it?.label || "").toLowerCase();
  const to = String(it?.to || "").toLowerCase();
  return label.includes("visa") || to.includes("/raf");
}

function getMenu(role) {
  const base = [...MENU.common];
  if (role === "DEMANDEUR") return uniqByTo([...base, ...MENU.demandeur]);
  if (role === "LOGISTIQUE") return uniqByTo([...base, ...MENU.logistique]);
  if (role === "RAF") return uniqByTo([...base, ...MENU.raf]);

  if (role === "ADMIN") {
    const all = uniqByTo([
      ...base,
      ...MENU.admin,
      ...MENU.demandeur,
      ...MENU.logistique,
    ]);
    return all.filter((it) => !isVisaMenuItem(it));
  }
  return base;
}

const MemoChildren = React.memo(function MemoChildren({ children }) {
  return children;
});

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSessionExpired, setShowSessionExpired] = useState(false);

  const menu = useMemo(() => getMenu(user?.role), [user?.role]);

  useEffect(() => {
    // Une fois le dashboard peint, telecharge les petits chunks accessibles a
    // cet utilisateur. Le premier clic sur un menu ne reste plus bloque sur
    // le reseau ni sur la transformation Vite.
    const warmRoutes = () => {
      void preloadRoutes(
        menu.map((item) => item.to).filter((path) => path !== location.pathname),
      );
    };
    const idleId = window.requestIdleCallback?.(warmRoutes, { timeout: 900 });
    const timeoutId = idleId === undefined
      ? window.setTimeout(warmRoutes, 250)
      : null;
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [menu, location.pathname]);

  const currentTitle = useMemo(() => {
    const path = location.pathname;
    let best = null;
    for (const m of menu) {
      if (!m?.to) continue;
      if (m.to === path) {
        best = m;
        break;
      }
      if (path.startsWith(m.to + "/")) {
        if (!best || m.to.length > best.to.length) best = m;
      }
    }
    return best?.label || "PRIRTEM";
  }, [menu, location.pathname]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);
  }, [now]);

  const timeLabel = useMemo(() => {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  }, [now]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  // 📨 logout() est désormais async (appelle POST /api/auth/logout pour
  // effacer le cookie de session côté serveur avant de naviguer).
  const doLogoutAndGoLogin = useCallback(async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  }, [logout, navigate]);

  const askLogout = useCallback(() => setShowLogoutModal(true), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const onUnauthorized = () => {
      setShowSessionExpired(true);
    };
    window.addEventListener("prirtem:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("prirtem:unauthorized", onUnauthorized);
  }, []);

  const mainStyle = useMemo(
    () => ({
      marginLeft: isMobile ? 0 : "var(--app-main-offset, 110px)",
      padding: 16,
      height: "100vh",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      overflow: "hidden",
      background: "var(--bg)",
    }),
    [isMobile],
  );

  const topbarStyle = useMemo(
    () => ({
      marginBottom: 0,
      borderRadius: 14,
      border: "none",
      flex: "0 0 auto",
    }),
    [],
  );

  const contentContainerStyle = useMemo(
    () => ({
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "auto",
      borderRadius: 14,
      border: "none",
      padding: 16,
    }),
    [],
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AnimatedSidebar
        menu={menu}
        isMobile={isMobile}
        isMobileOpen={mobileOpen}
        closeMobile={closeMobile}
        onLogout={askLogout}
      />

      <main style={mainStyle}>
        <div className="topbar card" style={topbarStyle}>
          <div className="topbarLeft">
            {isMobile && (
              <button
                className="iconBtn"
                onClick={openMobile}
                aria-label="Ouvrir le menu"
              >
                <ion-icon
                  name="menu-outline"
                  style={{ fontSize: 24 }}
                ></ion-icon>
              </button>
            )}
            <div className="topbarTitle" style={{ fontSize: 18 }}>
              {currentTitle}
            </div>
          </div>
          <div className="topbarRight">
            <div className="topbarClock">
              <div className="topbarClockDate">{dateLabel}</div>
              <div className="topbarClockTime">{timeLabel}</div>
            </div>
            <div className="topbarUser">
              <div className="topbarUserName">
                {user?.username || "Utilisateur"}
              </div>
              <div className="topbarUserRole">{user?.role || ""}</div>
            </div>
            <ThemeSwitch />
            <NotificationBell />
            <button
              className="iconBtn"
              onClick={askLogout}
              aria-label="Déconnexion"
            >
              <ion-icon
                name="log-out-outline"
                style={{ fontSize: 22 }}
              ></ion-icon>
            </button>
          </div>
        </div>

        <section className="card" style={contentContainerStyle}>
          <Suspense
            fallback={<div className="muted" role="status">Chargement de la page…</div>}
          >
            <MemoChildren>{children ?? <Outlet />}</MemoChildren>
          </Suspense>
        </section>
      </main>

      {showLogoutModal && (
        <Modal
          title="Déconnexion"
          onClose={() => setShowLogoutModal(false)}
          width={520}
        >
          <div className="muted" style={{ marginBottom: 14 }}>
            Voulez-vous vraiment vous déconnecter ?
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowLogoutModal(false)}
            >
              Annuler
            </button>
            <button
              className="btn btn-danger"
              data-autofocus="true"
              onClick={doLogoutAndGoLogin}
            >
              Se déconnecter
            </button>
          </div>
        </Modal>
      )}

      {showSessionExpired && (
        <Modal
          title="Session expirée"
          onClose={() => {
            setShowSessionExpired(false);
            navigate("/login");
          }}
          width={520}
        >
          <div className="muted" style={{ marginBottom: 14 }}>
            Votre session n'est plus valide. Veuillez vous reconnecter.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              className="btn"
              data-autofocus="true"
              onClick={() => {
                setShowSessionExpired(false);
                navigate("/login");
              }}
            >
              Se reconnecter
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
