/** Theme selection.
 *
 *  `classic` reproduces the original BoardViewer: a light WinForms/Win32 app.
 *  Colours are sampled from the manual screenshots that ship inside the
 *  2.0.1.8 archive ("How to set up and use BoardViewer.pdf"):
 *    control face  #f0f0f0   window/canvas  #ffffff
 *    border        #898c95   text           #000000
 *  plus `Color.FromArgb(255, 244, 247, 252)` and the selection blue
 *  `FromArgb(255, 51, 153, 255)` recovered from the decompiled sources.
 *
 *  `dark` is the original dark theme this project started with.
 */
export type Theme = 'classic' | 'dark';

const KEY = 'bareboard.theme';

/** The app shipped under a different name before it was called BareBoard. Anyone
 *  who set a preference then would silently lose it if we only read the new key. */
const LEGACY_KEY = 'boardview.theme';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'classic') return v;
    const old = localStorage.getItem(LEGACY_KEY);
    if (old === 'dark' || old === 'classic') {
      localStorage.setItem(KEY, old);
      return old;
    }
  } catch { /* private mode */ }
  // The original look is the default: this is a reimplementation, not a redesign.
  return 'classic';
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
}

/** Canvas colours. The board's own colours are not recoverable — the original
 *  builds them from float constants inside ConfuserEx's encrypted pool — so the
 *  light palette uses the industry convention (top red, bottom blue) which reads
 *  correctly on the original's near-white canvas. */
export interface Palette {
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
    bg: '#0d141d',
    bgEdge: '#080b10',
    grid: 'rgba(120,160,190,0.055)',
    outlineStroke: 'rgba(94,234,212,0.6)',
    outlineFill: 'rgba(94,234,212,0.032)',
    top: '#5eead4',
    bottom: '#f5b455',
    both: '#7aa9ff',
    pinGround: '#64748b',
    pinNc: '#334e68',
    pinA1: '#ff6b6b',
    pinTestPad: '#eab308',
    pinSelected: '#22c55e',
    pinSameNet: '#facc15',
    pinText: '#f8fafc',
    pinNetText: '#fde047',
    partHull: 'rgba(125,211,252,0.55)',
    nail: '#c58bff',
    active: '#ffd479',
    partStroke: 'rgba(94,234,212,0.58)',
    partFill: 'rgba(94,234,212,0.065)',
    partFillFocus: 'rgba(245,180,85,0.16)',
    partStrokeBottom: 'rgba(245,180,85,0.75)',
    partFillBottom: 'rgba(245,180,85,0.085)',
    label: 'rgba(210,235,245,0.9)',
    labelBottom: '#f7c676',
    labelFocus: '#ffd479',
    netIdle: 'rgba(94,234,212,0.05)',
    netActive: 'rgba(255,212,121,0.72)',
    selectionRing: '#ffffff',
    crosshair: 'rgba(255,255,255,0.10)',
    scaleText: 'rgba(210,230,240,0.7)',
    tooltipBg: 'rgba(9,15,22,.96)',
    tooltipBorder: '#2b4657',
    tooltipText: '#a9c4d3',
    tooltipTitle: '#5eead4',
    emptyMark: 'rgba(94,234,212,.25)',
    emptyDash: 'rgba(94,234,212,0.15)',
  },
  classic: {
    // #f4f7fc is the background the decompiled sources return from an overridden
    // BackColor, but the manual screenshots show a flat white drawing surface.
    // The original has no vignette, so both stops are the same colour.
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
