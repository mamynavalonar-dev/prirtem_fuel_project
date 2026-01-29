import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const MENU = {
  common: [
    { to: '/app', label: 'Dashboard' },
    { to: '/app/fuel', label: 'Suivi carburant' },
    { to: '/app/calendar', label: '📅 Calendrier' }
  ],
  demandeur: [
    { to: '/app/requests/fuel', label: 'Demande carburant' },
    { to: '/app/requests/car', label: 'Demande voiture' }
  ],
  logistique: [
    { to: '/app/import', label: 'Import Excel' },
    { to: '/app/requests/fuel/manage', label: 'Validation carburant' },
    { to: '/app/requests/car/manage', label: 'Validation voiture' },
    { to: '/app/logbooks', label: 'Journal de bord' },
    { to: '/app/meta', label: 'Véhicules & Chauffeurs' },
    { to: '/app/trash', label: 'Corbeille' }
  ],
  raf: [
    { to: '/app/requests/fuel/raf', label: 'Visa RAF carburant' },
    { to: '/app/requests/car/raf', label: 'Visa RAF voiture' }
  ],
  admin: [
    { to: '/app/import', label: 'Import Excel' },
    { to: '/app/meta', label: 'Véhicules & Chauffeurs' },
    { to: '/app/logbooks', label: 'Journal de bord' },
    { to: '/app/trash', label: 'Corbeille' }
  ]
};

function getMenu(role) {
  const base = [...MENU.common];
  if (role === 'DEMANDEUR') return [...base, ...MENU.demandeur];
  if (role === 'LOGISTIQUE') return [...base, ...MENU.logistique];
  if (role === 'RAF') return [...base, ...MENU.raf];
  if (role === 'ADMIN') return [...base, ...MENU.admin];
  return base;
}

function prettyRole(role) {
  if (!role) return '';
  if (role === 'DEMANDEUR') return 'Demandeur';
  if (role === 'LOGISTIQUE') return 'Logistique';
  if (role === 'RAF') return 'RAF';
  if (role === 'ADMIN') return 'Admin';
  return role;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);

  const role = user?.role;
  const menu = useMemo(() => getMenu(role), [role]);

  const currentTitle = useMemo(() => {
    const path = location.pathname || '';
    const best = menu.find((m) => path === m.to || path.startsWith(m.to + '/'));
    return best?.label || 'PRIRTEM';
  }, [menu, location.pathname]);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function handleLogout() {
    logout?.();
    navigate('/login');
  }

  function toggleSidebar() {
    setSidebarOpen((v) => !v);
  }

  function closeSidebarIfMobile() {
    if (isMobile) setSidebarOpen(false);
  }

  return (
    <div className="layout">
      {isMobile && sidebarOpen && <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebarHeader">
          <div className="brand">
            <b>PRIRTEM</b>
            <span>Carburant & Flotte</span>
          </div>

          {isMobile && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">
              ✕
            </button>
          )}
        </div>

        <div className="sidebar__user">
          <div className="sidebar__userName">
            {user?.first_name || user?.last_name ? `${user?.first_name || ''} ${user?.last_name || ''}`.trim() : (user?.username || 'Utilisateur')}
          </div>
          <div className="sidebar__userRole">{prettyRole(role)}</div>
        </div>

        <div className="sidebar__navWrap">
          <nav className="sidebar__nav">
            {menu.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebarIfMobile}
                className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebarFooter">
          <button className="btn btn-ghost" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbarLeft">
            <button className="iconBtn" onClick={toggleSidebar} aria-label="Ouvrir le menu">
              ☰
            </button>
            <div className="topbarTitle">{currentTitle}</div>
          </div>

          <div className="topbarRight">
            <NotificationBell />
            <button className="btn btn-outline topbar-logout" onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        </div>

        <div className="container">{children}</div>
      </main>
    </div>
  );
}
