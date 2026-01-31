import React, { useEffect, useRef, useState, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './animatedSidebar.css';

// Mapping des icônes selon les routes
const ICON_MAP = {
  '/app': 'grid-outline',
  '/app/fuel': 'speedometer-outline',
  '/app/calendar': 'calendar-outline',
  '/app/requests/fuel': 'flame-outline',
  '/app/requests/car': 'car-sport-outline',
  '/app/requests/fuel/manage': 'checkmark-done-circle-outline',
  '/app/requests/car/manage': 'checkmark-done-circle-outline',
  '/app/requests/fuel/raf': 'shield-checkmark-outline',
  '/app/requests/car/raf': 'shield-checkmark-outline',
  '/app/import': 'cloud-upload-outline',
  '/app/logbooks': 'book-outline',
  '/app/meta': 'people-outline',
  '/app/trash': 'trash-outline'
};

export default function AnimatedSidebar({ 
  menu = [], 
  isExpanded, 
  toggleSidebar, 
  isMobile, 
  isMobileOpen, 
  closeMobile,
  onLogout 
}) {
  const location = useLocation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const itemsRef = useRef([]);

  // 1. Calculer l'index actif en fonction de l'URL actuelle
  useEffect(() => {
    const currentPath = location.pathname;
    const index = menu.findIndex(item => 
      item.to === currentPath || (item.to !== '/app' && currentPath.startsWith(item.to))
    );
    // Si route non trouvée (ex: page 404), on ne sélectionne rien ou le premier
    setActiveIndex(index >= 0 ? index : 0);
  }, [location, menu]);

  // 2. Calculer la position Y de l'indicateur "Liquide"
  useEffect(() => {
    const activeItem = itemsRef.current[activeIndex];
    
    if (activeItem) {
      // offsetTop nous donne la position relative au parent (.asb-menu-list)
      setIndicatorStyle({
        transform: `translateY(${activeItem.offsetTop}px)`,
        opacity: 1 
      });
    } else {
      // Cache l'indicateur si aucun item actif
      setIndicatorStyle({ opacity: 0 });
    }
  }, [activeIndex, isExpanded, menu]); // Recalculer si le menu ou l'état change

  const sidebarClass = `asb-sidebar ${isExpanded ? 'active' : ''} ${isMobile && isMobileOpen ? 'mobile-open' : ''}`;

  return (
    <>
      {/* Overlay Mobile */}
      {isMobile && isMobileOpen && (
        <div className="asb-overlay" onClick={closeMobile} />
      )}

      <aside className={sidebarClass}>
        {/* Toggle Button */}
        <div className="asb-toggle" onClick={toggleSidebar}>
          <ion-icon name="chevron-forward-outline"></ion-icon>
        </div>

        {/* Logo */}
        <div className="asb-logo">
          <div className="asb-logo-icon">
            <ion-icon name="infinite"></ion-icon>
          </div>
          <span className="asb-logo-text">PRIRTEM</span>
        </div>

        {/* Menu List */}
        <ul className="asb-menu-list">
          
          {/* L'indicateur magique qui bouge */}
          <div className="asb-indicator" style={indicatorStyle}></div>

          {menu.map((item, index) => (
            <li 
              key={item.to} 
              className={`asb-item ${index === activeIndex ? 'active' : ''}`}
              ref={el => itemsRef.current[index] = el}
            >
              <NavLink 
                to={item.to} 
                className="asb-link"
                style={{ textDecoration: 'none' }}
                onClick={() => isMobile && closeMobile()}
              >
                <span className="asb-icon">
                  <ion-icon name={ICON_MAP[item.to] || 'ellipse-outline'}></ion-icon>
                </span>
                <span className="asb-text" style={{ textDecoration: 'none' }}>{item.label} </span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Footer / Logout */}
        <div className="asb-footer">
          <li className="asb-item" style={{ listStyle: 'none' }}>
            <a href="#" className="asb-link" style={{ textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); onLogout(); }}>
              <span className="asb-icon">
                <ion-icon name="log-out-outline"></ion-icon>
              </span>
              <span className="asb-text">Déconnexion</span>
            </a>
          </li>
        </div>
      </aside>
    </>
  );
}