import type { PackageKind } from '../render/realistic3d';

const KIND_LABELS: Record<PackageKind, string> = {
  mlcc: 'CAP',
  electrolytic: 'ELYT',
  tantalum: 'TANT',
  resistor: 'RES',
  inductor: 'COIL',
  diode: 'DIOD',
  led: 'LED',
  transistor: 'FET',
  bga: 'BGA',
  ic: 'IC',
  connector: 'CONN',
  crystal: 'XTAL',
  fuse: 'FUSE',
  generic: 'PART',
};

export function packageShortLabel(kind: PackageKind): string {
  return KIND_LABELS[kind];
}

/** Crisp 22x22 SVG package thumbnail matching the realistic 2D/3D component artwork. */
export function PackageGlyph({ kind }: { kind: PackageKind }) {
  switch (kind) {
    case 'mlcc':
    case 'tantalum':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3" y="6.5" width="4.5" height="11" rx="1" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
          <rect x="16.5" y="6.5" width="4.5" height="11" rx="1" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
          <rect x="7" y="6.5" width="10" height="11" fill={kind === 'tantalum' ? '#eab308' : '#d48c46'} stroke="#78350f" strokeWidth="1" />
          {kind === 'tantalum' && <rect x="7.5" y="6.8" width="2.5" height="10.4" fill="#78350f" />}
        </svg>
      );
    case 'resistor':
    case 'fuse':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3" y="7" width="4.5" height="10" rx="1" fill={kind === 'fuse' ? '#eab308' : '#e2e8f0'} stroke="#64748b" strokeWidth="1" />
          <rect x="16.5" y="7" width="4.5" height="10" rx="1" fill={kind === 'fuse' ? '#eab308' : '#e2e8f0'} stroke="#64748b" strokeWidth="1" />
          <rect x="7" y="7" width="10" height="10" fill={kind === 'fuse' ? '#f8fafc' : '#181c22'} stroke="#475569" strokeWidth="1" />
        </svg>
      );
    case 'electrolytic':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          <circle cx="12" cy="12" r="7.2" fill="#e2e8f0" stroke="#475569" strokeWidth="1" />
          <path d="M12 4.8 A7.2 7.2 0 0 1 12 19.2 L12 12 Z" fill="#0f172a" />
        </svg>
      );
    case 'inductor':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2.5" fill="#2d3540" stroke="#64748b" strokeWidth="1.2" />
          <circle cx="12" cy="12" r="5.5" fill="#1c2128" stroke="#d97706" strokeWidth="1.6" />
        </svg>
      );
    case 'bga':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1.5" fill="#15803d" stroke="#22c55e" strokeWidth="1" />
          <rect x="6" y="6" width="12" height="12" rx="1" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.9" />
          <polygon points="3,3 7.5,3 3,7.5" fill="#facc15" />
        </svg>
      );
    case 'ic':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <path d="M4 8h2M4 12h2M4 16h2M18 8h2M18 12h2M18 16h2M8 4v2M12 4v2M16 4v2M8 18v2M12 18v2M16 18v2" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="6" y="6" width="12" height="12" rx="1.2" fill="#1e242d" stroke="#64748b" strokeWidth="1.1" />
          <circle cx="8.8" cy="8.8" r="1.1" fill="#e2e8f0" />
        </svg>
      );
    case 'transistor':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="6" y="3" width="12" height="5" rx="0.8" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
          <circle cx="12" cy="5.5" r="1.4" fill="#0f172a" />
          <rect x="5.5" y="7.5" width="13" height="9" rx="1" fill="#1e242d" stroke="#64748b" strokeWidth="1" />
          <path d="M8 16.5v4.5M12 16.5v4.5M16 16.5v4.5" stroke="#e2e8f0" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'connector':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="1.5" fill="#334155" stroke="#94a3b8" strokeWidth="1.1" />
          <rect x="5.5" y="8.5" width="13" height="7" rx="0.8" fill="#0f172a" stroke="#facc15" strokeWidth="0.9" />
          <circle cx="8" cy="12" r="1" fill="#facc15" />
          <circle cx="12" cy="12" r="1" fill="#facc15" />
          <circle cx="16" cy="12" r="1" fill="#facc15" />
        </svg>
      );
    case 'diode':
    case 'led':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="3" y="7" width="4" height="10" rx="0.8" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
          <rect x="17" y="7" width="4" height="10" rx="0.8" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
          <rect x="6.5" y="7" width="11" height="10" fill={kind === 'led' ? '#f8fafc' : '#1b2028'} stroke="#64748b" strokeWidth="1" />
          {kind === 'led'
            ? <circle cx="12" cy="12" r="3.2" fill="#f59e0b" />
            : <rect x="8.2" y="7.4" width="2" height="9.2" fill="#e2e8f0" />}
        </svg>
      );
    case 'crystal':
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2" fill="#e2e8f0" stroke="#ca8a04" strokeWidth="1.2" />
          <rect x="6.5" y="8" width="11" height="8" rx="1" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="pkg-svg" aria-hidden="true">
          <rect x="5" y="6" width="14" height="12" rx="2" fill="#252b34" stroke="#64748b" strokeWidth="1.2" />
        </svg>
      );
  }
}
