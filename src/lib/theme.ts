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
  nail: string;
  active: string;
  partStroke: string;
  partFill: string;
  partFillFocus: string;
  partStrokeBottom: string;
  label: string;
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
    nail: '#c58bff',
    active: '#ffd479',
    partStroke: 'rgba(94,234,212,0.38)',
    partFill: 'rgba(94,234,212,0.035)',
    partFillFocus: 'rgba(245,180,85,0.13)',
    partStrokeBottom: 'rgba(245,180,85,0.5)',
    label: 'rgba(210,230,240,0.78)',
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
    nail: '#0f766e',
    active: '#b45309',
    partStroke: 'rgba(70,80,90,0.55)',
    partFill: 'rgba(0,0,0,0.015)',
    partFillFocus: 'rgba(51,153,255,0.12)',
    partStrokeBottom: 'rgba(31,111,235,0.45)',
    label: '#3b444d',
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
