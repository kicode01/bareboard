/** Theme selection.
 *
 *  - `dark`: Obsidian PCB Studio (default modern hardware repair UI).
 *  - `light`: Studio Light (clean daylight CAD UI).
 *  - `classic`: Legacy BoardViewer 2.0.1.9 WinForms chrome (optional).
 */
export type Theme = 'dark' | 'light' | 'classic';

const KEY = 'bareboard.theme.v2';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'classic') return v;
  } catch { /* private mode */ }
  return 'dark';
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

export interface Palette {
  isLightCanvas: boolean;
  bg: string;
  bgEdge: string;
  grid: string;
  outlineStroke: string;
  outlineFill: string;
  top: string;
  bottom: string;
  both: string;
  pinGround: string;
  pinNc: string;
  pinA1: string;
  pinTestPad: string;
  pinSelected: string;
  pinSameNet: string;
  pinText: string;
  pinNetText: string;
  partHull: string;
  nail: string;
  active: string;
  partStroke: string;
  partFill: string;
  partFillFocus: string;
  partStrokeBottom: string;
  partFillBottom: string;
  label: string;
  labelBottom: string;
  labelFocus: string;
  netIdle: string;
  netActive: string;
  selectionRing: string;
  crosshair: string;
  scaleText: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipTitle: string;
  emptyMark: string;
  emptyDash: string;
}

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    isLightCanvas: false,
    bg: '#13161c',
    bgEdge: '#0d1015',
    grid: 'rgba(255,255,255,0.055)',
    outlineStroke: 'rgba(138,180,248,0.68)',
    outlineFill: 'rgba(76,141,246,0.03)',
    top: '#60a5fa',
    bottom: '#a78bfa',
    both: '#38bdf8',
    pinGround: '#6b7280',
    pinNc: '#4b5563',
    pinA1: '#f87171',
    pinTestPad: '#fbbf24',
    pinSelected: '#34d399',
    pinSameNet: '#fde047',
    pinText: '#f8fafc',
    pinNetText: '#fde047',
    partHull: 'rgba(96,165,250,0.58)',
    nail: '#c084fc',
    active: '#fbbc04',
    partStroke: 'rgba(96,165,250,0.62)',
    partFill: 'rgba(96,165,250,0.065)',
    partFillFocus: 'rgba(251,188,4,0.18)',
    partStrokeBottom: 'rgba(167,139,250,0.72)',
    partFillBottom: 'rgba(167,139,250,0.085)',
    label: 'rgba(241,245,249,0.92)',
    labelBottom: '#c4b5fd',
    labelFocus: '#fde047',
    netIdle: 'rgba(148,163,184,0.06)',
    netActive: 'rgba(251,188,4,0.88)',
    selectionRing: '#ffffff',
    crosshair: 'rgba(255,255,255,0.10)',
    scaleText: 'rgba(226,232,240,0.82)',
    tooltipBg: 'rgba(22,25,31,0.96)',
    tooltipBorder: 'rgba(255,255,255,0.16)',
    tooltipText: '#d1d5db',
    tooltipTitle: '#8ab4f8',
    emptyMark: 'rgba(138,180,248,0.28)',
    emptyDash: 'rgba(138,180,248,0.16)',
  },
  light: {
    isLightCanvas: true,
    bg: '#f8f9fb',
    bgEdge: '#eff2f6',
    grid: 'rgba(17,24,39,0.055)',
    outlineStroke: '#374151',
    outlineFill: 'rgba(17,24,39,0.02)',
    top: '#1a73e8',
    bottom: '#5b45b0',
    both: '#0284c7',
    pinGround: '#4b5563',
    pinNc: '#9ca3af',
    pinA1: '#d93025',
    pinTestPad: '#b06000',
    pinSelected: '#188038',
    pinSameNet: '#eab308',
    pinText: '#111827',
    pinNetText: '#9a3412',
    partHull: 'rgba(26,115,232,0.65)',
    nail: '#5b45b0',
    active: '#d97706',
    partStroke: 'rgba(26,115,232,0.68)',
    partFill: 'rgba(26,115,232,0.055)',
    partFillFocus: 'rgba(217,119,6,0.14)',
    partStrokeBottom: 'rgba(91,69,176,0.72)',
    partFillBottom: 'rgba(91,69,176,0.06)',
    label: '#1f2937',
    labelBottom: '#4c1d95',
    labelFocus: '#b45309',
    netIdle: 'rgba(17,24,39,0.05)',
    netActive: 'rgba(217,119,6,0.88)',
    selectionRing: '#111827',
    crosshair: 'rgba(17,24,39,0.12)',
    scaleText: '#4b5563',
    tooltipBg: 'rgba(255,255,255,0.97)',
    tooltipBorder: '#d0d5dd',
    tooltipText: '#374151',
    tooltipTitle: '#1558b0',
    emptyMark: 'rgba(26,115,232,0.22)',
    emptyDash: 'rgba(17,24,39,0.14)',
  },
  classic: {
    isLightCanvas: true,
    bg: '#ffffff',
    bgEdge: '#ffffff',
    grid: 'rgba(0,0,0,0.055)',
    outlineStroke: '#4a5560',
    outlineFill: 'rgba(0,0,0,0.02)',
    top: '#c0392b',
    bottom: '#1f6feb',
    both: '#6b46c1',
    pinGround: '#52525b',
    pinNc: '#64748b',
    pinA1: '#d97706',
    pinTestPad: '#ca8a04',
    pinSelected: '#16a34a',
    pinSameNet: '#eab308',
    pinText: '#111827',
    pinNetText: '#7c2d12',
    partHull: 'rgba(16,185,129,0.65)',
    nail: '#0f766e',
    active: '#b45309',
    partStroke: 'rgba(192,57,43,0.65)',
    partFill: 'rgba(192,57,43,0.05)',
    partFillFocus: 'rgba(51,153,255,0.15)',
    partStrokeBottom: 'rgba(31,111,235,0.75)',
    partFillBottom: 'rgba(31,111,235,0.065)',
    label: '#2c353d',
    labelBottom: '#1557c0',
    labelFocus: '#b45309',
    netIdle: 'rgba(0,0,0,0.045)',
    netActive: 'rgba(230,126,34,0.75)',
    selectionRing: '#000000',
    crosshair: 'rgba(0,0,0,0.12)',
    scaleText: '#4a5560',
    tooltipBg: '#ffffe1',
    tooltipBorder: '#000000',
    tooltipText: '#000000',
    tooltipTitle: '#000000',
    emptyMark: 'rgba(0,0,0,0.18)',
    emptyDash: 'rgba(0,0,0,0.18)',
  },
};
