import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Sparkles,
  X,
  TerminalSquare,
  Radar,
  Map as MapIcon,
  Code2,
  BookOpen,
  Clock,
  Home,
  Truck,
  Plane,
  Crosshair,
  Command
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/* =========================================================
   DEFINED ROUTES FOR AUTOCOMPLETE
   ========================================================= */
const APP_ROUTES = [
  { name: 'Home', path: '/', icon: <Home size={18} /> },
  { name: 'RYNTARA Grid', path: '/manage', icon: <MapIcon size={18} /> },
  { name: 'Auto-Discovery', path: '/add-vehicle', icon: <Radar size={18} /> },
  { name: 'Adapter Studio', path: '/studio', icon: <Code2 size={18} /> },
  { name: 'Documentation', path: '/docs', icon: <BookOpen size={18} /> },
  { name: 'Path Planner', path: '/plan', icon: <Crosshair size={18} /> },
  {
    name: 'Vehicle History',
    path: '/vehicle/',
    requiresParam: true,
    paramName: 'Vehicle',
    icon: <Clock size={18} />
  }
];

export default function GlobalSearchBar({
  searchQuery = '',
  setSearchQuery = () => {},
  isAiSearch = false,
  setIsAiSearch = () => {},
  onCommandSubmit,
  placeholderNormal = "Search RYNTARA fleet (Press '/' for routes or double-tap for Radial Wheel)...",
  placeholderAi = "Ask RYNTARA AI to execute a command...",
  bottomOffset = "26px",
}) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [isSearchOpen, setIsSearchOpen] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWheelMode, setIsWheelMode] = useState(false);

  const inputRef = useRef(null);
  const nodeRef = useRef(null);
  const dropdownRef = useRef(null);
  const activeItemRef = useRef(null);

  const lastTapTimeRef = useRef(0);
  const singleClickTimerRef = useRef(null);

  /* Touch & Fluid Swipe Tracking Refs */
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const touchScrollRef = useRef({ initialScrollTop: 0, lastY: 0, velocityY: 0 });
  const animationFrameRef = useRef(null);

  /* =======================================================
     COLOR SCHEME & ACCENTS
     ======================================================= */
  const accentColor = '#005E60'; // Primary theme accent
  const searchBackground = isDark ? 'rgba(6, 8, 12, 0.96)' : 'rgba(12, 16, 22, 0.94)';
  const searchBorder = isDark ? 'rgba(0, 94, 96, 0.4)' : 'rgba(255, 255, 255, 0.12)';
  const textColor = '#f8fafc';
  const subtextColor = '#94a3b8';

  /* =======================================================
     FETCH VEHICLES FOR PARAMETERIZED ROUTES
     ======================================================= */
  useEffect(() => {
    fetch('http://localhost:8080/api/discovery/configs')
      .then(res => res.json())
      .then(data => setVehicles(data))
      .catch(err => console.warn('Could not fetch vehicles for search bar autocomplete', err));
  }, []);

  /* =======================================================
     PARSE SUGGESTIONS
     ======================================================= */
  const isNavMode = searchQuery.startsWith('/');

  const suggestions = useMemo(() => {
    if (isWheelMode) {
      return APP_ROUTES.map(r => ({
        type: 'route',
        route: r,
        displayText: r.requiresParam ? `/${r.name}:` : `/${r.name}`,
        title: r.name,
        subtitle: r.requiresParam ? 'Requires Param' : 'Page Navigation',
        icon: r.icon
      }));
    }

    if (!isNavMode) return [];

    const cleanQuery = searchQuery.slice(1);
    const parts = cleanQuery.split(':');
    const pageQuery = parts[0].toLowerCase();
    const paramQuery = parts.length > 1 ? parts[1].toLowerCase().trim() : null;

    const matchedRoutes = APP_ROUTES.filter(r =>
      r.name.toLowerCase().includes(pageQuery)
    );

    if (matchedRoutes.length === 1 && matchedRoutes[0].requiresParam && parts.length > 1) {
      const route = matchedRoutes[0];
      const vMatches = vehicles.filter(v =>
        (v.name || '').toLowerCase().includes(paramQuery) ||
        (v.id || '').toLowerCase().includes(paramQuery) ||
        (v.category || '').toLowerCase().includes(paramQuery)
      );

      return vMatches.map(v => ({
        type: 'param',
        route: route,
        value: v,
        displayText: `/${route.name}:${v.name}`,
        title: v.name,
        subtitle: `ID: ${v.id.substring(0, 8)}...`,
        icon: v.category === 'GROUND' ? <Truck size={18}/> : <Plane size={18}/>
      }));
    }

    return matchedRoutes.map(r => ({
      type: 'route',
      route: r,
      displayText: r.requiresParam ? `/${r.name}:` : `/${r.name}`,
      title: r.name,
      subtitle: r.requiresParam ? 'Requires Param' : 'Page Navigation',
      icon: r.icon
    }));
  }, [searchQuery, isNavMode, vehicles, isWheelMode]);

  useEffect(() => {
    if (!isWheelMode) setSelectedIndex(0);
  }, [suggestions, isWheelMode]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      clearTimeout(singleClickTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  /* =======================================================
     FLUID SWIPE & TOUCH INERTIA SCROLLING
     ======================================================= */
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    touchScrollRef.current.lastY = touch.clientY;
    touchScrollRef.current.velocityY = 0;

    if (dropdownRef.current) {
      touchScrollRef.current.initialScrollTop = dropdownRef.current.scrollTop;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleTouchMove = (e) => {
    if (!dropdownRef.current) return;
    const touch = e.touches[0];
    const dy = touchScrollRef.current.lastY - touch.clientY;
    touchScrollRef.current.velocityY = dy;
    touchScrollRef.current.lastY = touch.clientY;

    dropdownRef.current.scrollTop += dy;
  };

  const handleTouchEnd = () => {
    if (!dropdownRef.current) return;
    let velocity = touchScrollRef.current.velocityY;

    const applyInertia = () => {
      if (Math.abs(velocity) < 0.5 || !dropdownRef.current) return;
      dropdownRef.current.scrollTop += velocity;
      velocity *= 0.92; // Decay factor for smooth momentum
      animationFrameRef.current = requestAnimationFrame(applyInertia);
    };

    animationFrameRef.current = requestAnimationFrame(applyInertia);
  };

  /* =======================================================
     DRAGGABLE STATE FOR FAB
     ======================================================= */
  const [pos, setPos] = useState({ bottom: parseInt(bottomOffset) || 26, left: null });
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef({
    startX: 0, startY: 0, startLeft: 0, startBottom: 0, hasMoved: false
  });

  const handlePointerDown = (e) => {
    e.preventDefault();
    try { nodeRef.current?.setPointerCapture(e.pointerId); } catch {}
    setIsDragging(true);

    const rect = nodeRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startBottom: window.innerHeight - rect.bottom,
      hasMoved: false
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragRef.current.hasMoved = true;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const FAB_SIZE = 56;

    let newLeft = dragRef.current.startLeft + dx;
    let newBottom = dragRef.current.startBottom - dy;

    newLeft = Math.max(10, Math.min(newLeft, vw - FAB_SIZE - 10));
    newBottom = Math.max(10, Math.min(newBottom, vh - FAB_SIZE - 10));

    setPos({ left: newLeft, bottom: newBottom });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    try { nodeRef.current?.releasePointerCapture(); } catch {}

    if (dragRef.current.hasMoved) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
      clearTimeout(singleClickTimerRef.current);
      lastTapTimeRef.current = 0;
      setIsWheelMode(true);
      setIsSearchOpen(true);
      setSelectedIndex(0);
    } else {
      lastTapTimeRef.current = now;
      singleClickTimerRef.current = setTimeout(() => {
        setIsWheelMode(false);
        setIsSearchOpen(true);
        setSearchQuery('');
        requestAnimationFrame(() => {
          document.getElementById('ryntara-global-search-input')?.focus();
        });
      }, DOUBLE_TAP_DELAY);
    }
  };

  /* =======================================================
     KEYBOARD & NAVIGATION HANDLERS
     ======================================================= */
  useEffect(() => {
    const handleGlobalKeyboard = (event) => {
      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      const isTyping = tagName === 'input' || tagName === 'textarea' || activeElement?.isContentEditable;

      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setIsSearchOpen(true);
        setIsWheelMode(false);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          setSearchQuery('/');
        });
      }

      if (event.key === 'Escape' && !isTyping) {
        setIsSearchOpen(false);
        setIsWheelMode(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyboard);
    return () => window.removeEventListener('keydown', handleGlobalKeyboard);
  }, [setSearchQuery]);

  const executeSuggestion = (suggestion) => {
    if (!suggestion) return;
    if (suggestion.type === 'route') {
      if (suggestion.route.requiresParam) {
        setSearchQuery(suggestion.displayText);
        setIsWheelMode(false);
        inputRef.current?.focus();
      } else {
        navigate(suggestion.route.path);
        setIsSearchOpen(false);
        setIsWheelMode(false);
        setSearchQuery('');
      }
    } else if (suggestion.type === 'param') {
      navigate(`${suggestion.route.path}${suggestion.value.id}`);
      setIsSearchOpen(false);
      setIsWheelMode(false);
      setSearchQuery('');
    }
  };

  const cycleIndex = useCallback((direction) => {
    if (suggestions.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return suggestions.length - 1;
      if (next >= suggestions.length) return 0;
      return next;
    });
  }, [suggestions.length]);

  const handleInputKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsSearchOpen(false);
      setIsWheelMode(false);
      return;
    }
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycleIndex(1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleIndex(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        executeSuggestion(suggestions[selectedIndex]);
      }
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (suggestions.length > 0) {
      executeSuggestion(suggestions[selectedIndex]);
    } else if (!isNavMode && onCommandSubmit) {
      onCommandSubmit(event);
    }
  };

  /* =======================================================
     RADIAL WHEEL LAYOUT COMPUTATION
     ======================================================= */
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const currentLeft = pos.left !== null ? pos.left : vw / 2 - 190;
  const currentBottom = pos.bottom;

  const isNearLeft = currentLeft < 150;
  const isNearRight = currentLeft > vw - 250;
  const isNearTop = currentBottom > vh - 250;
  const isNearBottom = currentBottom < 150;

  let wheelType = 'full';
  if (isNearLeft) wheelType = 'right-semi';
  else if (isNearRight) wheelType = 'left-semi';
  else if (isNearTop) wheelType = 'bottom-semi';
  else if (isNearBottom) wheelType = 'top-semi';

  let wheelConfig = {
    width: 380, height: 380,
    originX: 190, originY: 190,
    startAngle: -90, endAngle: 270,
    borderRadius: '50%'
  };

  if (wheelType === 'top-semi') {
    wheelConfig = {
      width: 380, height: 220,
      originX: 190, originY: 190,
      startAngle: -180, endAngle: 0,
      borderRadius: '190px 190px 24px 24px'
    };
  } else if (wheelType === 'bottom-semi') {
    wheelConfig = {
      width: 380, height: 220,
      originX: 190, originY: 30,
      startAngle: 180, endAngle: 0,
      borderRadius: '24px 24px 190px 190px'
    };
  } else if (wheelType === 'right-semi') {
    wheelConfig = {
      width: 220, height: 380,
      originX: 30, originY: 190,
      startAngle: -90, endAngle: 90,
      borderRadius: '24px 190px 190px 24px'
    };
  } else if (wheelType === 'left-semi') {
    wheelConfig = {
      width: 220, height: 380,
      originX: 190, originY: 190,
      startAngle: -90, endAngle: -270,
      borderRadius: '190px 24px 24px 190px'
    };
  }

  const R = 135;
  const calculatedNodes = useMemo(() => {
    if (!isWheelMode || suggestions.length === 0) return [];
    const N = suggestions.length;
    const span = wheelConfig.endAngle - wheelConfig.startAngle;

    return suggestions.map((suggestion, index) => {
      let angleDeg = 0;
      if (wheelType === 'full') {
        const step = 360 / N;
        angleDeg = wheelConfig.startAngle + index * step;
      } else {
        const step = N > 1 ? span / (N - 1) : 0;
        angleDeg = wheelConfig.startAngle + index * step;
      }

      const rad = (angleDeg * Math.PI) / 180;
      const x = wheelConfig.originX + R * Math.cos(rad);
      const y = wheelConfig.originY + R * Math.sin(rad);

      return { ...suggestion, x, y, angleDeg, index };
    });
  }, [isWheelMode, suggestions, wheelConfig, wheelType]);

  const activeNode = calculatedNodes[selectedIndex] || calculatedNodes[0];

  const expandedLeftStyle = pos.left === null
    ? '50%'
    : `clamp(calc(20px + (min(720px, 100vw - 40px) / 2)), ${pos.left + 28}px, calc(100vw - 20px - (min(720px, 100vw - 40px) / 2)))`;

  return (
    <>
      <style>{`
        @keyframes smoothFadeIn {
          0% { transform: scale(0.97) translateY(6px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }

        .global-search-enter {
          animation: smoothFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .global-search-input {
          box-sizing: border-box;
          width: 100%;
          height: 56px;
          padding: 0 150px 0 54px;
          border-radius: 18px;
          outline: none;
          font-size: 14px;
          font-weight: 500;
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .global-search-input:focus {
          border-color: ${accentColor} !important;
          box-shadow: 0 0 0 3px rgba(0, 94, 96, 0.25), 0 16px 40px rgba(0, 0, 0, 0.6) !important;
        }
        .global-search-input::placeholder { opacity: 0.45; font-size: 13.5px; }

        .global-search-mode-btn {
          position: absolute;
          right: 52px;
          top: 10px;
          bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.3px;
          transition: all 0.2s ease;
        }
        .global-search-mode-btn:hover {
          transform: translateY(-1px);
        }

        .global-search-close-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0.6;
          transition: all 0.2s ease;
        }
        .global-search-close-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.08);
        }

        .global-search-minimized {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1px solid ${searchBorder};
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .global-search-minimized:hover {
          transform: translateY(-2px);
          border-color: ${accentColor};
          box-shadow: 0 16px 40px rgba(0, 94, 96, 0.3);
        }

        .suggestions-dropdown {
          position: absolute;
          bottom: calc(100% + 10px);
          left: 0;
          width: 100%;
          border-radius: 18px;
          overflow-y: auto;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid ${searchBorder};
          display: flex;
          flex-direction: column;
          max-height: 320px;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .suggestion-item {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .keycap-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
        }

        .icon-silhouette {
          transition: filter 0.2s ease, background 0.2s ease;
        }
        .icon-silhouette-active {
          filter: drop-shadow(0 2px 8px rgba(0, 94, 96, 0.6));
        }
      `}</style>

      {isSearchOpen ? (
        <div
          style={{
            position: 'fixed',
            left: expandedLeftStyle,
            bottom: pos.bottom,
            transform: pos.left === null ? 'translateX(-50%)' : 'translate(-50%, 0)',
            width: isWheelMode ? `${wheelConfig.width}px` : 'min(720px, calc(100vw - 40px))',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <form
            key="expanded-global-search"
            onSubmit={handleSubmit}
            className={isWheelMode ? '' : 'global-search-enter'}
            style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* AUTOCOMPLETE DROPDOWN */}
            {suggestions.length > 0 && !isWheelMode && (
              <div
                ref={dropdownRef}
                className="suggestions-dropdown"
                style={{
                  background: searchBackground,
                  borderColor: searchBorder,
                }}
              >
                <div style={{
                  padding: '10px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: subtextColor,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Command size={12} color={accentColor} /> Navigation & Commands
                  </span>
                  <span style={{ fontSize: '10px', color: subtextColor, opacity: 0.8 }}>
                    Swipe for smooth scroll • Double-tap for Wheel
                  </span>
                </div>

                {suggestions.map((suggestion, index) => {
                  const isActive = index === selectedIndex;
                  return (
                    <div
                      key={index}
                      ref={isActive ? activeItemRef : null}
                      className="suggestion-item"
                      onClick={() => executeSuggestion(suggestion)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      style={{
                        background: isActive ? 'rgba(0, 94, 96, 0.22)' : 'transparent',
                        borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent'
                      }}
                    >
                      <div
                        className={`icon-silhouette ${isActive ? 'icon-silhouette-active' : ''}`}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isActive ? accentColor : 'rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {suggestion.icon}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span style={{ fontSize: '13.5px', fontWeight: '500', color: textColor }}>
                          {suggestion.title}
                        </span>
                        <span style={{ fontSize: '11px', color: subtextColor, fontFamily: suggestion.type === 'param' ? 'monospace' : 'inherit' }}>
                          {suggestion.subtitle}
                        </span>
                      </div>
                      <span className="keycap-badge">⏎ SELECT</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MINIMALIST RADIAL WHEEL MODE */}
            {isWheelMode && suggestions.length > 0 ? (
              <div
                style={{
                  boxSizing: 'border-box',
                  width: `${wheelConfig.width}px`,
                  height: `${wheelConfig.height}px`,
                  borderRadius: wheelConfig.borderRadius,
                  overflow: 'hidden',
                  position: 'relative',
                  userSelect: 'none',
                  background: searchBackground,
                  backdropFilter: 'blur(28px)',
                  WebkitBackdropFilter: 'blur(28px)',
                  border: `1px solid ${searchBorder}`,
                  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
                }}
              >
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 1
                  }}
                >
                  <circle
                    cx={wheelConfig.originX}
                    cy={wheelConfig.originY}
                    r={R}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth="1"
                  />

                  {activeNode && (
                    <line
                      x1={wheelConfig.originX}
                      y1={wheelConfig.originY}
                      x2={activeNode.x}
                      y2={activeNode.y}
                      stroke={accentColor}
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.8"
                    />
                  )}
                </svg>

                {calculatedNodes.map((node) => {
                  const isActive = node.index === selectedIndex;

                  return (
                    <div
                      key={node.index}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIndex(node.index);
                        executeSuggestion(node);
                      }}
                      onMouseEnter={() => setSelectedIndex(node.index)}
                      style={{
                        position: 'absolute',
                        left: `${node.x}px`,
                        top: `${node.y}px`,
                        transform: isActive ? 'translate(-50%, -50%) scale(1.12)' : 'translate(-50%, -50%) scale(1)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        transition: 'transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                        zIndex: isActive ? 10 : 3
                      }}
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: isActive ? accentColor : 'rgba(20, 26, 36, 0.9)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          filter: isActive
                            ? 'drop-shadow(0 6px 14px rgba(0, 94, 96, 0.5))'
                            : 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {node.icon}
                      </div>

                      <span style={{
                        fontSize: '10px',
                        fontWeight: isActive ? '600' : '500',
                        color: isActive ? '#ffffff' : subtextColor,
                        marginTop: '4px',
                        whiteSpace: 'nowrap',
                        background: 'rgba(6, 8, 12, 0.95)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${isActive ? accentColor : 'transparent'}`,
                        transition: 'all 0.2s ease'
                      }}>
                        {node.title}
                      </span>
                    </div>
                  );
                })}

                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWheelMode(false);
                    inputRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    left: `${wheelConfig.originX}px`,
                    top: `${wheelConfig.originY}px`,
                    transform: 'translate(-50%, -50%)',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(18, 24, 34, 0.95)',
                    border: `1px solid ${searchBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 6,
                    color: subtextColor,
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
                    transition: 'transform 0.15s ease, color 0.15s ease'
                  }}
                  title="Close Radial Wheel"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.08)';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                    e.currentTarget.style.color = subtextColor;
                  }}
                >
                  <X size={18} />
                </div>
              </div>
            ) : (
              /* SEARCH BAR FIELD */
              <div style={{ position: 'relative', width: '100%' }}>
                {isNavMode ? (
                  <TerminalSquare size={18} color={accentColor} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
                ) : isAiSearch ? (
                  <Sparkles size={18} color="#8b5cf6" style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
                ) : (
                  <Search size={18} color={subtextColor} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }} />
                )}

                <input
                  ref={inputRef}
                  id="ryntara-global-search-input"
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={placeholderNormal}
                  className="global-search-input"
                  style={{
                    border: `1px solid ${searchBorder}`,
                    background: searchBackground,
                    color: textColor,
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)'
                  }}
                />

                {!isNavMode && (
                  <button
                    type="button"
                    className="global-search-mode-btn"
                    onClick={() => {
                      setIsAiSearch((prev) => !prev);
                      setSearchQuery('');
                      inputRef.current?.focus();
                    }}
                    style={{
                      background: isAiSearch ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                      color: isAiSearch ? '#a78bfa' : subtextColor,
                      borderColor: isAiSearch ? 'rgba(139, 92, 246, 0.4)' : 'transparent'
                    }}
                  >
                    <Sparkles size={12} />
                    {isAiSearch ? 'AI' : 'SEARCH'}
                  </button>
                )}

                <button
                  type="button"
                  className="global-search-close-btn"
                  onClick={() => setIsSearchOpen(false)}
                  title="Minimize Search"
                  style={{ color: subtextColor }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </form>
        </div>
      ) : (
        /* MINIMIZED FLOATING ACTION BUTTON (FAB) */
        <div
          ref={nodeRef}
          role="button"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsWheelMode(false);
              setIsSearchOpen(true);
            }
          }}
          title="Click to expand • Double-tap for Radial Wheel"
          className="global-search-minimized"
          style={{
            position: 'fixed',
            left: pos.left !== null ? pos.left : '50%',
            bottom: pos.bottom,
            transform: pos.left !== null ? 'none' : 'translateX(-50%)',
            zIndex: 100,
            background: searchBackground,
            color: textColor,
            cursor: isDragging ? 'grabbing' : 'pointer',
            touchAction: 'none'
          }}
        >
          <Search size={20} style={{ pointerEvents: 'none' }} />
        </div>
      )}
    </>
  );
}