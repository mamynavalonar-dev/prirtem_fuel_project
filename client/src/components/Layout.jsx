import React, { useMemo, useState, useEffect } from 'react';
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
    { to: '/app/users', label: 'Utilisateurs' }, // Gestion des users
    { to: '/app/fuel', label: 'Suivi carburant' }, // <--- CORRECTION ICI (AJOUTÉ)
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

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // État de la sidebar
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const menu = useMemo(() => getMenu(user?.role), [user?.role]);

  // ✅ Date/heure live
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
      year: 'numeric',
    }).format(now);
  }, [now]);

  const timeLabel = useMemo(() => {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);
  }, [now]);

  // Titre dynamique
  const currentTitle = useMemo(() => {
    const path = location.pathname;
    const found = menu.find(m => m.to === path || path.startsWith(m.to + '/'));
    return found?.label || 'PRIRTEM';
  }, [menu, location]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const mainStyle = {
    marginLeft: isMobile ? '0' : (isExpanded ? '290px' : '110px'),
    transition: 'margin-left 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
    padding: '16px',
    minHeight: '100vh'
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AnimatedSidebar
        menu={menu}
        isExpanded={isExpanded}
        toggleSidebar={() => setIsExpanded(!isExpanded)}
        isMobile={isMobile}
        isMobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />

      <main style={mainStyle}>
        <div className="topbar card" style={{ marginBottom: '20px', borderRadius: '14px', border: 'none' }}>
          <div className="topbarLeft">
            {isMobile && (
              <button className="iconBtn" onClick={() => setMobileOpen(true)}>
                <ion-icon name="menu-outline" style={{ fontSize: '24px' }}></ion-icon>
              </button>
            )}
            <div className="topbarTitle" style={{ fontSize: '18px' }}>{currentTitle}</div>
          </div>

          <div className="topbarRight">
            <div style={{ textAlign: 'right', marginRight: '12px', lineHeight: '1.15' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'capitalize' }}>
                {dateLabel}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 900 }}>
                {timeLabel}
              </div>
            </div>

            <div style={{ textAlign: 'right', marginRight: '10px', lineHeight: '1.2' }}>
              <div style={{ fontWeight: '700', fontSize: '14px' }}>{user?.username}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{user?.role}</div>
            </div>

            <NotificationBell />
          </div>
        </div>

        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}