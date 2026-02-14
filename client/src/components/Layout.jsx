import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import AnimatedSidebar from './AnimatedSidebar.jsx';
import ThemeSwitch from './ThemeSwitch.jsx';

const MENU = {
  common: [
    { to: '/app', label: 'Dashboard' },
    { to: '/app/fuel', label: 'Suivi carburant' },
    { to: '/app/calendar', label: 'Calendrier' }
  ],
  demandeur: [
    { to: '/app/requests/fuel', label: 'Demande carburant' },
    { to: '/app/requests/car', label: 'Demande voiture' }
  ],
  logistique: [
    { to: '/app/import', label: 'Import Excel' },
    { to: '/app/requests/fuel/manage', label: 'Valid. carburant' },
    { to: '/app/requests/car/manage', label: 'Valid. voiture' },
    { to: '/app/logbooks', label: 'Journal de bord' },
    { to: '/app/meta', label: 'Flotte & Chauffeurs' },
    { to: '/app/trash', label: 'Corbeille' }
  ],
  raf: [
    { to: '/app/requests/fuel/raf', label: 'Visa RAF carburant' },
    { to: '/app/requests/car/raf', label: 'Visa RAF voiture' },
    { to: '/app/logbooks', label: 'Journal de bord' }
  ],
  admin: [
    { to: '/app', label: 'Dashboard' },
    { to: '/app/users', label: 'Utilisateurs' },
    { to: '/app/fuel', label: 'Suivi carburant' },
    { to: '/app/import', label: 'Import Excel' },
    { to: '/app/meta', label: 'Flotte & Chauffeurs' },
    { to: '/app/requests/fuel/manage', label: 'Valid. carburant' },
    { to: '/app/requests/car/manage', label: 'Valid. voiture' },
    { to: '/app/logbooks', label: 'Journal de bord' },
    { to: '/app/trash', label: 'Corbeille' }
  ]
};

function getMenu(role) {
  const base = [...MENU.common];
  if (role === 'DEMANDEUR') return [...base, ...MENU.demandeur];
  if (role === 'LOGISTIQUE') return [...base, ...MENU.logistique];
  if (role === 'RAF') return [...base, ...MENU.raf];
  if (role === 'ADMIN') return MENU.admin;
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

  const menu = useMemo(() => getMenu(user?.role), [user?.role]);

  const currentTitle = useMemo(() => {
    const path = location.pathname;
    const found = menu.find((m) => m.to === path || path.startsWith(m.to + '/'));
    return found?.label || 'PRIRTEM';
  }, [menu, location.pathname]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  }, [now]);

  const timeLabel = useMemo(() => {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);
  }, [now]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflowX = prev;
    };
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const mainStyle = useMemo(
    () => ({
      marginLeft: isMobile ? 0 : 'var(--app-main-offset, 110px)',
      padding: 16,
      height: '100vh',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflow: 'hidden',
      background: 'var(--bg)'
    }),
    [isMobile]
  );

  const topbarStyle = useMemo(
    () => ({
      marginBottom: 0,
      borderRadius: 14,
      border: 'none',
      flex: '0 0 auto'
    }),
    []
  );

  const contentContainerStyle = useMemo(
    () => ({
      flex: '1 1 auto',
      minHeight: 0,
      overflow: 'auto',
      borderRadius: 14,
      border: 'none',
      padding: 16
    }),
    []
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AnimatedSidebar
        menu={menu}
        isMobile={isMobile}
        isMobileOpen={mobileOpen}
        closeMobile={closeMobile}
        onLogout={handleLogout}
      />

      <main style={mainStyle}>
        <div className="topbar card" style={topbarStyle}>
          <div className="topbarLeft">
            {isMobile && (
              <button className="iconBtn" onClick={openMobile} aria-label="Ouvrir le menu">
                <ion-icon name="menu-outline" style={{ fontSize: 24 }}></ion-icon>
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
              <div className="topbarUserName">{user?.username || 'Utilisateur'}</div>
              <div className="topbarUserRole">{user?.role || ''}</div>
            </div>

            {/* ✅ Switch thème AVANT la cloche */}
            <ThemeSwitch />

            <NotificationBell />

            <button className="iconBtn" onClick={handleLogout} aria-label="Déconnexion">
              <ion-icon name="log-out-outline" style={{ fontSize: 22 }}></ion-icon>
            </button>
          </div>
        </div>

        <section className="card" style={contentContainerStyle}>
          <MemoChildren>{children}</MemoChildren>
        </section>
      </main>
    </div>
  );
}
