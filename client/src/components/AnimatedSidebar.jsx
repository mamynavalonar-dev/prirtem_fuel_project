import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './animatedSidebar.css';
import { preloadRoute } from '../routeModules.js';

const LOGO_PRIRTEM = "/ui/login/logos/prirtem.webp";


const MAIN_OFFSET_COLLAPSED = '110px';
const MAIN_OFFSET_EXPANDED = '290px';

function iconForPath(to) {
  if (to === '/app') return 'grid-outline';
  if (to.startsWith('/app/users')) return 'person-outline';
  if (to.startsWith('/app/fuel')) return 'speedometer-outline';
  if (to.startsWith('/app/import')) return 'cloud-upload-outline';
  if (to.startsWith('/app/meta')) return 'people-outline';
  if (to.startsWith('/app/logbooks')) return 'book-outline';
  if (to.startsWith('/app/trash')) return 'trash-outline';
  if (to.startsWith('/app/requests')) return 'checkbox-outline';
  if (to.startsWith('/app/calendar')) return 'calendar-outline';
  return 'ellipse-outline';
}

export default React.memo(function AnimatedSidebar({
  menu = [],
  isMobile = false,
  isMobileOpen = false,
  closeMobile,
  onLogout,

  // compat
  isExpanded: controlledExpanded,
  toggleSidebar: controlledToggle
}) {
  const location = useLocation();
  const listRef = useRef(null);
  const sidebarRef = useRef(null);

  const isControlled = typeof controlledExpanded === 'boolean' && typeof controlledToggle === 'function';

  const [expanded, setExpanded] = useState(() => {
    if (isControlled) return !!controlledExpanded;
    try {
      return localStorage.getItem('prirtem_sidebar_expanded') === '1';
    } catch {
      return false;
    }
  });

  const isExpanded = isControlled ? !!controlledExpanded : expanded;

  const animTimerRef = useRef(0);
  const startSidebarAnimHint = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('sidebar-animating');

    window.clearTimeout(animTimerRef.current);
    animTimerRef.current = window.setTimeout(() => {
      root.classList.remove('sidebar-animating');
    }, 280);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(animTimerRef.current);
  }, []);

  const setRootOffset = useCallback((nextExpanded) => {
    const root = document.documentElement;
    root.style.setProperty('--app-main-offset', nextExpanded ? MAIN_OFFSET_EXPANDED : MAIN_OFFSET_COLLAPSED);
  }, []);

  useLayoutEffect(() => {
    setRootOffset(isExpanded);
  }, [isExpanded, setRootOffset]);

  const toggle = useCallback(() => {
    startSidebarAnimHint();

    if (isControlled) {
      controlledToggle();
      return;
    }
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem('prirtem_sidebar_expanded', next ? '1' : '0');
      } catch {
        // ignore
      }
      setRootOffset(next);
      return next;
    });
  }, [isControlled, controlledToggle, setRootOffset, startSidebarAnimHint]);

  useEffect(() => {
    if (!isMobile) return;
    startSidebarAnimHint();
  }, [isMobile, isMobileOpen, startSidebarAnimHint]);

  useEffect(() => {
    if (!isMobile || !isMobileOpen) return;
    const sidebar = sidebarRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.querySelector('button')?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobile?.();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [isMobile, isMobileOpen, closeMobile]);

  const onNavClick = useCallback(() => {
    if (isMobile) closeMobile?.();
  }, [isMobile, closeMobile]);

  const [indicatorY, setIndicatorY] = useState(0);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const active = el.querySelector('.asb-item.active');
    if (!active) {
      setIndicatorY(0);
      return;
    }
    setIndicatorY(active.offsetTop || 0);
  }, [location.pathname, menu]);

  const sidebarClass = useMemo(() => {
    const base = ['asb-sidebar'];
    if (isExpanded || isMobile) base.push('active');
    if (isMobile && isMobileOpen) base.push('mobile-open');
    return base.join(' ');
  }, [isExpanded, isMobile, isMobileOpen]);

  return (
    <>
      {isMobile && isMobileOpen && (
        <div className="asb-overlay" onClick={closeMobile} role="presentation" />
      )}

      <aside
        id="app-navigation"
        ref={sidebarRef}
        className={sidebarClass}
        role={isMobile ? 'dialog' : undefined}
        aria-label="Navigation principale"
        aria-modal={isMobile && isMobileOpen ? true : undefined}
        aria-hidden={isMobile && !isMobileOpen ? true : undefined}
        inert={isMobile && !isMobileOpen ? '' : undefined}
      >
        {isMobile && (
          <button className="asb-close" type="button" onClick={closeMobile} aria-label="Fermer le menu">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        )}
          <div className="asb-logo">
            <div className="asb-logo-icon">
              <img className="asb-logo-img" src={LOGO_PRIRTEM} alt="PRIRTEM" />
            </div>
            <div className="asb-logo-text">PRIRTEM</div>
          </div>


        {!isMobile && (
          <button className="asb-toggle" onClick={toggle} type="button" aria-label="Réduire ou étendre la navigation" aria-expanded={isExpanded}>
            <svg className="asb-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        )}

        <nav className="asb-menu-list" ref={listRef} aria-label="Pages de l'application">
          <div
            className="asb-indicator"
            style={{
              transform: `translate3d(0, ${indicatorY}px, 0)`,
              willChange: 'transform'
            }}
          />

          {menu.map((m) => {
            const icon = iconForPath(m.to);

            return (
              <NavLink
                key={m.to}
                to={m.to}
                aria-label={m.label}
                title={!isExpanded && !isMobile ? m.label : undefined}
                end={m.to === '/app'}
                className={({ isActive }) => `asb-item ${isActive ? 'active' : ''}`}
                onClick={onNavClick}
                onMouseEnter={() => { void preloadRoute(m.to); }}
                onFocus={() => { void preloadRoute(m.to); }}
                onPointerDown={() => { void preloadRoute(m.to); }}
              >
                <div className="asb-link">
                  <span className="asb-icon">
                    <ion-icon name={icon}></ion-icon>
                  </span>
                  <span className="asb-text">{m.label}</span>
                </div>
              </NavLink>
            );
          })}
        </nav>

        
        {/* Footer / Logout */}
<div className="asb-footer">
  <div className="asb-item">
    <button
      type="button"
      className="asb-logoutBtn"
      onClick={() => {
        onLogout();
        if (isMobile) closeMobile();
      }}
      aria-label="Déconnexion"
      title="Déconnexion"
    >
      <span className="asb-logoutSign" aria-hidden="true">
        <svg viewBox="0 0 512 512">
          <path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
        </svg>
      </span>
      <span className="asb-logoutText">Déconnexion</span>
    </button>
  </div>
</div>

      </aside>
    </>
  );
});
