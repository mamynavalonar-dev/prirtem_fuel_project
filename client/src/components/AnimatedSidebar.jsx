import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './animatedSidebar.css';

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
    if (isExpanded) base.push('active');
    if (isMobile && isMobileOpen) base.push('mobile-open');
    return base.join(' ');
  }, [isExpanded, isMobile, isMobileOpen]);

  return (
    <>
      {isMobile && isMobileOpen && (
        <div className="asb-overlay" onClick={closeMobile} role="presentation" />
      )}

      <aside
        className={sidebarClass}
        style={{
          // ✅ IMPORTANT: PAS de "paint" sinon le toggle est coupé
          contain: 'layout',
          willChange: isMobile ? 'transform' : 'width',
          transform: 'translateZ(0)'
        }}
      >
        <div className="asb-logo">
          <div className="asb-logo-icon">
            <ion-icon name="infinite-outline"></ion-icon>
          </div>
          <div className="asb-logo-text">PRIRTEM</div>
        </div>

        {!isMobile && (
          <div className="asb-toggle" onClick={toggle} role="button" aria-label="Réduire/Étendre">
            <ion-icon name="chevron-forward-outline"></ion-icon>
          </div>
        )}

        <ul className="asb-menu-list" ref={listRef}>
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
                end={m.to === '/app'}
                className={({ isActive }) => `asb-item ${isActive ? 'active' : ''}`}
                onClick={onNavClick}
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
        </ul>

        
        {/* Footer / Logout */}
        <div className="asb-footer">
          <div className="asb-item">
            <button
              type="button"
              className="asb-link asb-logout"
              onClick={() => {
                onLogout();
                if (isMobile) closeMobile();
              }}
            >
              <span className="asb-icon">
                <ion-icon name="log-out-outline"></ion-icon>
              </span>
              <span className="asb-text">Déconnexion</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
});
