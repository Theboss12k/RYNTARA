import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radar,
  Map as MapIcon,
  Code2,
  ArrowRight,
  Search,
  BookOpen
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import GlobalSearchBar from './GlobalSearchBar';

export default function HomePage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);

  const modules = [
    {
      id: 'add-vehicle',
      path: '/add-vehicle',
      title: 'Auto-Discovery',
      desc: 'Scan the spectrum to register novel UAVs and ground rovers.',
      icon: <Radar size={19} strokeWidth={2.5} />,
      badgeClass: 'tile-icon-add',
      badgeStyle: {}
    },
    {
      id: 'manage',
      path: '/manage',
      title: 'RYNTARA Grid',
      desc: 'Enter the unified spatial map and live telemetry dashboard.',
      icon: <MapIcon size={19} strokeWidth={2.5} />,
      badgeClass: 'tile-icon-manage',
      badgeStyle: {}
    },
    {
      id: 'studio',
      path: '/studio',
      title: 'Adapter Studio',
      desc: 'Stream analyzer, local LLM code builder, and sandbox.',
      icon: <Code2 size={19} strokeWidth={2.5} />,
      badgeClass: '',
      badgeStyle: {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        color: '#a855f7'
      }
    },
    {
      id: 'docs',
      path: '/docs',
      title: 'Documentation',
      desc: 'System architecture, API specifications, and operator manuals.',
      icon: <BookOpen size={19} strokeWidth={2.5} />,
      badgeClass: '',
      badgeStyle: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        color: '#3b82f6'
      }
    }
  ];

  const filteredModules = isAiSearch
    ? modules
    : modules.filter((module) => {
        const query = searchQuery.trim().toLowerCase();

        if (!query) return true;

        return (
          module.title.toLowerCase().includes(query) ||
          module.desc.toLowerCase().includes(query)
        );
      });

  const dotColor = isDark
    ? 'rgba(255, 255, 255, 0.075)'
    : 'rgba(0, 0, 0, 0.065)';

  const logoSrc = isDark
    ? '/ryntara-logo-dark.svg'
    : '/ryntara-logo.svg';

  return (
    <div
      className="app-shell"
      style={{
        position: 'relative',
        overflowX: 'hidden',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',

        backgroundImage: `
          radial-gradient(
            ${dotColor} 1px,
            transparent 1px
          )
        `,

        backgroundSize: '24px 24px',
        backgroundPosition: '0 0'
      }}
    >

      {/* =====================================================
          PAGE ANIMATIONS
          ===================================================== */}

      <style>{`

        /* ===================================================
           PAGE LOAD ANIMATIONS
           =================================================== */

        @keyframes fadeInUp {
          0% {
            transform: translateY(24px);
            opacity: 0;
          }

          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes logoReveal {
          0% {
            transform: translateY(14px) scale(0.97);
            opacity: 0;
          }

          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }

        .animate-logo {
          animation:
            logoReveal
            0.75s
            cubic-bezier(0.16, 1, 0.3, 1)
            forwards;

          opacity: 0;
        }

        .animate-tile-1 {
          animation: fadeInUp 0.5s ease 0.15s forwards;
          opacity: 0;
        }

        .animate-tile-2 {
          animation: fadeInUp 0.5s ease 0.25s forwards;
          opacity: 0;
        }

        .animate-tile-3 {
          animation: fadeInUp 0.5s ease 0.35s forwards;
          opacity: 0;
        }

        .animate-tile-4 {
          animation: fadeInUp 0.5s ease 0.45s forwards;
          opacity: 0;
        }


        /* ===================================================
           RYNTARA BRAND
           =================================================== */

        .ryntara-brand {
          width: 100%;

          display: flex;
          justify-content: center;
          align-items: center;
        }

        .ryntara-brand-image {
          width: min(560px, 82vw);
          height: auto;

          display: block;

          object-fit: contain;
          object-position: center;

          user-select: none;
          pointer-events: none;
        }


        /* ===================================================
           FIXED WATERMARK
           =================================================== */

        .ryntara-watermark-layer {
          position: fixed;

          inset: 0;

          width: 100vw;
          height: 100vh;

          overflow: hidden;

          pointer-events: none;

          z-index: 0;
        }

        .ryntara-watermark {
          width: 680px;
          max-width: 70vw;

          height: auto;

          display: block;

          object-fit: contain;

          user-select: none;
          pointer-events: none;
        }

        /* ===================================================
           MOBILE
           =================================================== */

        @media (max-width: 700px) {

          .ryntara-brand-image {
            width: min(500px, 88vw);
          }

          .ryntara-watermark {
            width: 520px;
            max-width: 95vw;
          }
        }

        @media (max-width: 480px) {

          .ryntara-brand-image {
            width: 88vw;
          }
        }

      `}</style>


      {/* =====================================================
          FIXED RYNTARA BACKGROUND WATERMARK
          ===================================================== */}

      <div
        className="ryntara-watermark-layer"
        aria-hidden="true"
      >

        {/* Ambient glow */}

        <div
          style={{
            position: 'absolute',

            top: '8%',
            left: '50%',

            width: '1100px',
            height: '620px',

            transform:
              'translateX(-50%)',

            background: isDark
              ? `
                radial-gradient(
                  circle,
                  rgba(0, 229, 255, 0.055) 0%,
                  rgba(0, 180, 220, 0.025) 35%,
                  transparent 70%
                )
              `
              : `
                radial-gradient(
                  circle,
                  rgba(0, 180, 220, 0.045) 0%,
                  rgba(0, 140, 200, 0.018) 35%,
                  transparent 70%
                )
              `,

            pointerEvents: 'none'
          }}
        />

        {/* RYNTARA watermark */}

        <img
          src={logoSrc}
          alt=""
          className="ryntara-watermark"

          style={{
            position: 'absolute',

            top: '42%',
            left: '50%',

            transform:
              'translate(-50%, -50%)',

            opacity: isDark
              ? 0.035
              : 0.035
          }}
        />

      </div>


      {/* =====================================================
          THEME TOGGLE
          ===================================================== */}

      <div
        style={{
          position: 'fixed',

          top: '20px',
          right: '20px',

          zIndex: 110
        }}
      >
        <ThemeToggle />
      </div>


      {/* =====================================================
          MAIN CONTENT
          ===================================================== */}

      <div
        className="home-content"
        style={{
          position: 'relative',

          zIndex: 10,

          display: 'flex',
          flexDirection: 'column',

          alignItems: 'center',
          justifyContent: 'center',

          flex: 1,

          width: '100%',
          maxWidth: '1100px',

          margin: '0 auto',

          /*
           * Extra bottom padding prevents the fixed
           * search bar from covering the page footer.
           */

          padding:
            '54px 20px 120px'
        }}
      >

        {/* ===================================================
            RYNTARA BRAND
            =================================================== */}

        <div
          className="animate-logo ryntara-brand"

          style={{
            marginBottom: '38px'
          }}
        >

          <img
            src={logoSrc}

            alt={
              'RYNTARA — Unified Vehicle Operations & Intelligence'
            }

            className="ryntara-brand-image"

            draggable="false"
          />

        </div>


        {/* ===================================================
            MODULE GRID
            =================================================== */}

        <div
          className="tile-grid"

          style={{
            marginBottom: '30px',

            width: '100%',
            maxWidth: '1000px'
          }}
        >

          {filteredModules.length > 0 ? (

            filteredModules.map((module, index) => (

              <button
                key={module.id}

                className={
                  `tile animate-tile-${(index % 4) + 1}`
                }

                onClick={() =>
                  navigate(module.path)
                }
              >

                <div
                  className={
                    `tile-icon-badge ${module.badgeClass}`
                  }

                  style={
                    module.badgeStyle
                  }
                >
                  {module.icon}
                </div>

                <h2 className="tile-title">
                  {module.title}
                </h2>

                <p className="tile-desc">
                  {module.desc}
                </p>

                <div className="tile-arrow">
                  <ArrowRight size={16} />
                </div>

              </button>

            ))

          ) : (

            <div
              style={{
                gridColumn: '1 / -1',

                textAlign: 'center',

                padding: '30px 0',

                color:
                  isDark
                    ? '#666'
                    : '#999'
              }}
            >

              <Search
                size={28}

                style={{
                  opacity: 0.5,

                  marginBottom: '10px'
                }}
              />

              <p
                style={{
                  fontSize: '15px',
                  fontWeight: '500'
                }}
              >
                No modules found for "
                {searchQuery}
                "
              </p>

            </div>

          )}

        </div>


        {/* ===================================================
            FOOTER STATUS
            =================================================== */}

        <div
          className="home-footer"

          style={{
            display: 'flex',
            alignItems: 'center',

            gap: '8px',

            fontSize: '11px',
            fontWeight: '700',

            letterSpacing: '1px',

            color:
              isDark
                ? '#666'
                : '#999'
          }}
        >

          <span
            style={{
              width: '8px',
              height: '8px',

              borderRadius: '50%',

              backgroundColor: '#00E676',

              boxShadow:
                '0 0 10px #00E676'
            }}
          />

          RYNTARA CORE: SECURE & ONLINE

        </div>

      </div>

      {/* =====================================================
          REUSABLE GLOBAL SEARCH COMPONENT
          ===================================================== */}
      <GlobalSearchBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isAiSearch={isAiSearch}
        setIsAiSearch={setIsAiSearch}
        placeholderNormal="Search RYNTARA modules..."
        placeholderAi="Ask RYNTARA AI to execute a command..."
        bottomOffset="26px"
      />

    </div>
  );
}