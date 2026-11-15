import { useState } from 'react';
import type { Theme } from '../lib/theme';
import type { Layers } from '../types';

/**
 * The original's Options dialog, rebuilt.
 *
 * The 2.0.1.8 manual shows it with four tabs — General, Graphics, Associations,
 * Network — and the same four tab names are present in `Lang/*.lng` as keys
 * ("General", "Graphics", "Associations", "Network", "Graphics Acceleration:",
 * "Direct2D", "GDI", "GDI Quality:"). Only the Graphics tab's contents are
 * visible in the manual, so the other three are reconstructed from the option
 * keys that survive in the language files.
 *
 * A browser cannot offer Direct2D or GDI, so the Graphics tab keeps the
 * original's wording and maps the choice onto the renderer we actually drive.
 * Everything on this dialog changes something real in the app.
 */

const TABS = ['General', 'Graphics', 'Associations', 'Network'] as const;
type Tab = (typeof TABS)[number];

const ASSOCIATIONS = ['.brd', '.bdv', '.bvr', '.cad', '.cst', '.asc', '.zip'];

export function OptionsDialog(props: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  layers: Layers;
  toggle: (k: keyof Layers) => void;
  onClose: () => void;
}) {
  const { theme, setTheme, layers, toggle, onClose } = props;
  const [tab, setTab] = useState<Tab>('General');

  return (
    <div className="modal-shade" onClick={onClose}>
      <div
        className="modal options-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Options"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      >
        <div className="modal-head">
          <div><div className="mini-title">Options</div><h2>Application settings</h2></div>
          <button type="button" onClick={onClose} aria-label="Close options">✕</button>
        </div>

        <div className="opt-tabs" role="tablist" aria-label="Options sections">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`opt-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`opt-panel-${t}`}
              className={tab === t ? 'on' : ''}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="modal-body opt-body" id={`opt-panel-${tab}`} role="tabpanel" aria-labelledby={`opt-tab-${tab}`}>
          {tab === 'General' && (
            <>
              <fieldset className="group-box">
                <legend>Appearance</legend>
                <label className="opt-row">
                  <input type="radio" name="opt-theme" checked={theme === 'classic'} onChange={() => setTheme('classic')} />
                  <span>
                    Classic (original)
                    <em>Plain WinForms chrome, #f0f0f0 control face, white canvas — as shipped in 2.0.1.9.</em>
                  </span>
                </label>
                <label className="opt-row">
                  <input type="radio" name="opt-theme" checked={theme === 'dark'} onChange={() => setTheme('dark')} />
                  <span>
                    Dark
                    <em>An addition of this build. Not present in the original.</em>
                  </span>
                </label>
              </fieldset>

              <fieldset className="group-box">
                <legend>Window</legend>
                <label className="opt-row">
                  <input type="checkbox" checked={layers.grid} onChange={() => toggle('grid')} />
                  <span>Show the alignment grid<em>Same switch as View ▸ Layers ▸ Grid, and the G key.</em></span>
                </label>
                <label className="opt-row disabled">
                  <input type="checkbox" disabled checked={false} readOnly />
                  <span>Remember window position<em>Not applicable: the browser owns the window geometry.</em></span>
                </label>
              </fieldset>

              <fieldset className="group-box">
                <legend>Language</legend>
                <label className="opt-row">
                  <input type="radio" name="opt-lang" checked readOnly />
                  <span>English<em>The interface ships in English. The original's `Lang/*.lng` files were used as the source for every label in this build.</em></span>
                </label>
                <label className="opt-row disabled">
                  <input type="radio" name="opt-lang" disabled />
                  <span>中文<em>The original shipped a machine-translated Chinese catalog; it is not bundled here.</em></span>
                </label>
              </fieldset>
            </>
          )}

          {tab === 'Graphics' && (
            <>
              <fieldset className="group-box">
                <legend>Graphics Acceleration:</legend>
                <label className="opt-row">
                  <input type="radio" name="opt-render" checked={!layers.grid} onChange={() => toggle('grid')} />
                  <span>Canvas 2D, uncluttered<em>Skips the alignment grid. The browser still decides whether the canvas is GPU-backed.</em></span>
                </label>
                <label className="opt-row">
                  <input type="radio" name="opt-render" checked={layers.grid} onChange={() => toggle('grid')} />
                  <span>Canvas 2D, with grid<em>Draws the 0.1 in alignment grid behind the board.</em></span>
                </label>
                <p className="opt-note">
                  The original chose between Direct2D and GDI and exposed a “GDI Quality:” slider. A browser exposes
                  neither, so this tab drives the one thing the renderer does expose.
                </p>
              </fieldset>

              <fieldset className="group-box">
                <legend>Detail</legend>
                <label className="opt-row">
                  <input type="checkbox" checked={layers.labels} onChange={() => toggle('labels')} />
                  <span>Draw part designators<em>R1, U2, C3 … Same switch as the Labels layer.</em></span>
                </label>
                <label className="opt-row">
                  <input type="checkbox" checked={layers.pins} onChange={() => toggle('pins')} />
                  <span>Draw pins<em>Same switch as the Pins layer.</em></span>
                </label>
                <label className="opt-row">
                  <input type="checkbox" checked={layers.nails} onChange={() => toggle('nails')} />
                  <span>Draw test points<em>Same switch as the Test nails layer.</em></span>
                </label>
              </fieldset>
            </>
          )}

          {tab === 'Associations' && (
            <fieldset className="group-box">
              <legend>Boardview files</legend>
              <p className="opt-note">
                The original registered these extensions with Windows so a double-click opened the board. On the web
                the equivalent is the installed app's file handler.
              </p>
              <ul className="assoc-list">
                {ASSOCIATIONS.map((ext) => (
                  <li key={ext}><code>{ext}</code><span>Boardview / CAD interchange</span></li>
                ))}
              </ul>
              <p className="opt-note">
                Dropping any of these onto the window, or using File ▸ Open file…, works whether or not the app is
                installed.
              </p>
            </fieldset>
          )}

          {tab === 'Network' && (
            <>
              <fieldset className="group-box">
                <legend>Part lookup</legend>
                <label className="opt-row">
                  <input type="radio" name="opt-net" checked readOnly />
                  <span>This PC<em>Everything in this build is local. No board, part or net name ever leaves the page.</em></span>
                </label>
                <label className="opt-row disabled">
                  <input type="radio" name="opt-net" disabled />
                  <span>Web<em>The original's Search box could query an online part database. This build has no such backend.</em></span>
                </label>
              </fieldset>
              <fieldset className="group-box">
                <legend>Proxy</legend>
                <p className="opt-note">
                  There is nothing to configure. The application makes no outbound requests after the page has loaded.
                </p>
              </fieldset>
            </>
          )}
        </div>

        <div className="opt-foot">
          <button type="button" className="btn primary" onClick={onClose}>OK</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
