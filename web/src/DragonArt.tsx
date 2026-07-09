// Ilustración original de un dragón platino (evoca a Bahamut) con animación:
// flotación, aleteo, ojos que brillan y destellos. Arte propio (sin material con copyright).
export function DragonArt() {
  return (
    <div className="dragon-scene" aria-hidden="true">
      <svg className="dragon" viewBox="0 0 400 340" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glowG" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#7fc4ff" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#3a5fae" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3a5fae" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="platG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4f8ff" />
            <stop offset="45%" stopColor="#cbd8ee" />
            <stop offset="100%" stopColor="#8098c6" />
          </linearGradient>
          <linearGradient id="wingG" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#b6c6e6" />
            <stop offset="100%" stopColor="#5c76b2" />
          </linearGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <ellipse className="dragon-glow" cx="200" cy="150" rx="185" ry="140" fill="url(#glowG)" />

        <g className="dragon-float">
          <g className="wing wing-left" fill="url(#wingG)" stroke="#e6eeff" strokeWidth="1" opacity="0.92">
            <path d="M200,196 C142,150 80,150 34,108 C40,164 56,208 96,228 C132,248 176,238 200,236 Z" />
          </g>
          <g className="wing wing-right" fill="url(#wingG)" stroke="#e6eeff" strokeWidth="1" opacity="0.92">
            <path d="M200,196 C258,150 320,150 366,108 C360,164 344,208 304,228 C268,248 224,238 200,236 Z" />
          </g>

          <g stroke="#eef4ff" strokeWidth="1.2" opacity="0.45" fill="none">
            <path d="M200,197 L34,108 M200,199 L70,176 M200,201 L112,214" />
            <path d="M200,197 L366,108 M200,199 L330,176 M200,201 L288,214" />
          </g>

          {/* cuello + cuerpo */}
          <path fill="url(#platG)" stroke="#eef4ff" strokeWidth="1" d="M191,236 C187,196 189,150 200,118 C211,150 213,196 209,236 Z" />
          {/* cabeza */}
          <path fill="url(#platG)" stroke="#eef4ff" strokeWidth="1" d="M200,70 C179,77 175,102 189,117 C194,123 206,123 211,117 C225,102 221,77 200,70 Z" />
          {/* hocico */}
          <path fill="url(#platG)" stroke="#eef4ff" strokeWidth="1" d="M192,116 C196,130 204,130 208,116 Z" />
          {/* cuernos */}
          <path fill="url(#platG)" stroke="#eef4ff" strokeWidth="1" d="M186,80 C174,64 168,47 175,39 C180,52 187,67 194,79 Z" />
          <path fill="url(#platG)" stroke="#eef4ff" strokeWidth="1" d="M214,80 C226,64 232,47 225,39 C220,52 213,67 206,79 Z" />
          {/* púas del cuello */}
          <path fill="url(#wingG)" opacity="0.8" d="M200,150 l-7,-10 l7,4 l7,-4 Z M200,175 l-8,-9 l8,3 l8,-3 Z M200,200 l-9,-8 l9,3 l9,-3 Z" />

          <ellipse className="eye" cx="191" cy="99" rx="4.4" ry="5.6" fill="#a6ecff" filter="url(#soft)" />
          <ellipse className="eye" cx="209" cy="99" rx="4.4" ry="5.6" fill="#a6ecff" filter="url(#soft)" />
        </g>

        <g className="sparkles" fill="#cfe8ff">
          <circle className="sp sp1" cx="72" cy="66" r="2.2" />
          <circle className="sp sp2" cx="330" cy="92" r="1.9" />
          <circle className="sp sp3" cx="120" cy="38" r="1.6" />
          <circle className="sp sp4" cx="300" cy="48" r="2.5" />
          <circle className="sp sp5" cx="200" cy="26" r="1.7" />
          <circle className="sp sp6" cx="58" cy="150" r="1.9" />
          <circle className="sp sp7" cx="346" cy="162" r="2.1" />
          <circle className="sp sp8" cx="250" cy="34" r="1.5" />
        </g>
      </svg>
    </div>
  );
}
