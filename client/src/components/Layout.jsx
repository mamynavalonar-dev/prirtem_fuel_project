import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import AnimatedSidebar from './AnimatedSidebar.jsx';

// Définition des menus par rôle
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

// ✅ Très important: évite que tout le contenu (Dashboard charts etc.) re-render
// à chaque open/close du sidebar ou à chaque tick de l’horloge.
const MemoChildren = React.memo(function MemoChildren({ children }) {
  return children;
});

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Responsive
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Menu selon rôle
  const menu = useMemo(() => getMenu(user?.role), [user?.role]);

  // Titre dynamique
  const currentTitle = useMemo(() => {
    const path = location.pathname;
    const found = menu.find((m) => m.to === path || path.startsWith(m.to + '/'));
    return found?.label || 'PRIRTEM';
  }, [menu, location.pathname]);

  // ✅ Date/heure live (ne re-render plus les pages grâce à MemoChildren)
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

  // Resize listener
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Empêcher le scroll horizontal quand la sidebar bouge
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

  // ✅ IMPORTANT :
  // - Sur desktop, on utilise une CSS var --app-main-offset (pilotée par AnimatedSidebar)
  // - Et surtout: PAS de transition margin-left => pas de recalcul “à chaque frame”
  const mainStyle = useMemo(
    () => ({
      marginLeft: isMobile ? 0 : 'var(--app-main-offset, 110px)',
      padding: 16,
      height: '100vh',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      overflow: 'hidden', // le scroll est dans le conteneur, pas sur toute la page
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

  // ✅ LE CONTENEUR (comme ton image): toutes les pages dedans
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
        {/* Topbar */}
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

            <NotificationBell />

            <button className="iconBtn" onClick={handleLogout} aria-label="Déconnexion">
              <ion-icon name="log-out-outline" style={{ fontSize: 22 }}></ion-icon>
            </button>
          </div>
        </div>

        {/* ✅ CONTENEUR GLOBAL : tous les contenus ici */}
        <section className="card" style={contentContainerStyle}>
          <MemoChildren>{children}</MemoChildren>
        </section>
      </main>
    </div>
  );
}
