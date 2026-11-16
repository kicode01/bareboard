import { useState } from 'react';
import type { Theme } from '../lib/theme';
import type { Layers } from '../types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * The original's Options dialog, rebuilt onto Base UI Dialog + Tabs
 * while preserving Classic WinForms classes when `classic` theme is active.
 */
const TABS = ['General', 'Graphics', 'Associations', 'Network'] as const;
type Tab = (typeof TABS)[number];

const ASSOCIATIONS = ['.brd', '.bdv', '.bvr', '.cad', '.cst', '.asc', '.zip'];

export function OptionsDialog(props: {
  open: boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  layers: Layers;
  toggle: (k: keyof Layers) => void;
  onClose: () => void;
}) {
  const { open, theme, setTheme, layers, toggle, onClose } = props;
  const [tab, setTab] = useState<Tab>('General');

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="options-dialog max-w-[600px]" aria-label="Options">
        <DialogHeader>
          <DialogDescription>Options</DialogDescription>
          <DialogTitle>Application settings</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="opt-tabs px-4" aria-label="Options sections">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className={tab === t ? 'on' : ''}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>

          <DialogBody className="opt-body space-y-3">
            <TabsContent value="General" className="space-y-3 overflow-visible">
              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Appearance</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-theme" checked={theme === 'dark'} onChange={() => setTheme('dark')} className="mt-0.5 accent-primary" />
                  <span>
                    Studio Dark (default)
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Graphite dark workspace with Inter typography and Material 3 cobalt accents.
                    </em>
                  </span>
                </label>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-theme" checked={theme === 'light'} onChange={() => setTheme('light')} className="mt-0.5 accent-primary" />
                  <span>
                    Studio Light
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      High-contrast daylight workspace with crisp white paper canvas.
                    </em>
                  </span>
                </label>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-theme" checked={theme === 'classic'} onChange={() => setTheme('classic')} className="mt-0.5 accent-primary" />
                  <span>
                    Classic (WinForms)
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Legacy BoardViewer 2.0.1.9 WinForms chrome, #f0f0f0 face, menu bar &amp; tool strip.
                    </em>
                  </span>
                </label>
              </fieldset>

              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Window</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="checkbox" checked={layers.grid} onChange={() => toggle('grid')} className="mt-0.5 accent-primary" />
                  <span>
                    Show the alignment grid
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Same switch as View ▸ Layers ▸ Grid, and the G key.
                    </em>
                  </span>
                </label>
                <label className="opt-row disabled flex items-start gap-2.5 text-xs leading-snug text-muted-foreground/70">
                  <input type="checkbox" disabled checked={false} readOnly className="mt-0.5" />
                  <span>
                    Remember window position
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground/60">
                      Not applicable: the browser owns the window geometry.
                    </em>
                  </span>
                </label>
              </fieldset>

              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Language</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-lang" checked readOnly className="mt-0.5 accent-primary" />
                  <span>
                    English
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      The interface ships in English. The original's `Lang/*.lng` files were used as the source for every label in this build.
                    </em>
                  </span>
                </label>
                <label className="opt-row disabled flex items-start gap-2.5 text-xs leading-snug text-muted-foreground/70">
                  <input type="radio" name="opt-lang" disabled className="mt-0.5" />
                  <span>
                    中文
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground/60">
                      The original shipped a machine-translated Chinese catalog; it is not bundled here.
                    </em>
                  </span>
                </label>
              </fieldset>
            </TabsContent>

            <TabsContent value="Graphics" className="space-y-3 overflow-visible">
              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Graphics Acceleration:</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-render" checked={!layers.grid} onChange={() => toggle('grid')} className="mt-0.5 accent-primary" />
                  <span>
                    Canvas 2D, uncluttered
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Skips the alignment grid. The browser still decides whether the canvas is GPU-backed.
                    </em>
                  </span>
                </label>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-render" checked={layers.grid} onChange={() => toggle('grid')} className="mt-0.5 accent-primary" />
                  <span>
                    Canvas 2D, with grid
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Draws the 0.1 in alignment grid behind the board.
                    </em>
                  </span>
                </label>
                <p className="opt-note text-[11px] leading-relaxed text-muted-foreground">
                  The original chose between Direct2D and GDI and exposed a “GDI Quality:” slider. A browser exposes
                  neither, so this tab drives the one thing the renderer does expose.
                </p>
              </fieldset>

              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Detail</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="checkbox" checked={layers.labels} onChange={() => toggle('labels')} className="mt-0.5 accent-primary" />
                  <span>
                    Draw part designators
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">R1, U2, C3 … Same switch as the Labels layer.</em>
                  </span>
                </label>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="checkbox" checked={layers.pins} onChange={() => toggle('pins')} className="mt-0.5 accent-primary" />
                  <span>
                    Draw pins
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">Same switch as the Pins layer.</em>
                  </span>
                </label>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="checkbox" checked={layers.nails} onChange={() => toggle('nails')} className="mt-0.5 accent-primary" />
                  <span>
                    Draw test points
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">Same switch as the Test nails layer.</em>
                  </span>
                </label>
              </fieldset>
            </TabsContent>

            <TabsContent value="Associations" className="overflow-visible">
              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Boardview files</legend>
                <p className="opt-note text-[11px] leading-relaxed text-muted-foreground">
                  The original registered these extensions with Windows so a double-click opened the board. On the web
                  the equivalent is the installed app's file handler.
                </p>
                <ul className="assoc-list grid gap-1 py-1">
                  {ASSOCIATIONS.map((ext) => (
                    <li key={ext} className="flex items-center gap-3 text-xs">
                      <code className="min-w-[46px] font-medium text-primary">{ext}</code>
                      <span className="text-muted-foreground">Boardview / CAD interchange</span>
                    </li>
                  ))}
                </ul>
                <p className="opt-note text-[11px] leading-relaxed text-muted-foreground">
                  Dropping any of these onto the window, or using File ▸ Open file…, works whether or not the app is
                  installed.
                </p>
              </fieldset>
            </TabsContent>

            <TabsContent value="Network" className="space-y-3 overflow-visible">
              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Part lookup</legend>
                <label className="opt-row flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
                  <input type="radio" name="opt-net" checked readOnly className="mt-0.5 accent-primary" />
                  <span>
                    This PC
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground">
                      Everything in this build is local. No board, part or net name ever leaves the page.
                    </em>
                  </span>
                </label>
                <label className="opt-row disabled flex items-start gap-2.5 text-xs leading-snug text-muted-foreground/70">
                  <input type="radio" name="opt-net" disabled className="mt-0.5" />
                  <span>
                    Web
                    <em className="mt-0.5 block text-[11px] not-italic text-muted-foreground/60">
                      The original's Search box could query an online part database. This build has no such backend.
                    </em>
                  </span>
                </label>
              </fieldset>
              <fieldset className="group-box rounded-lg border border-border p-3 space-y-2">
                <legend className="px-1.5 text-[11px] font-semibold text-muted-foreground">Proxy</legend>
                <p className="opt-note text-[11px] leading-relaxed text-muted-foreground">
                  There is nothing to configure. The application makes no outbound requests after the page has loaded.
                </p>
              </fieldset>
            </TabsContent>
          </DialogBody>
        </Tabs>

        <DialogFooter>
          <Button variant="primary" size="sm" className="btn primary" onClick={onClose}>OK</Button>
          <Button variant="default" size="sm" className="btn" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
