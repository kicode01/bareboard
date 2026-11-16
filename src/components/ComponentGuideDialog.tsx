import { useState } from 'react';
import {
  BOARD_TERMS_GLOSSARY,
  NET_SIGNAL_GUIDE,
  PACKAGE_GUIDE_ORDER,
  getPackageMeta,
} from '../lib/packages';
import { PackageGlyph } from './PackageGlyph';
import { MaterialIcon } from '@/components/MaterialIcon';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type GuideTab = 'parts' | 'nets' | 'terms';

interface ComponentGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasBoard?: boolean;
  onFilterTerm?: (term: string, scope?: 'all' | 'parts' | 'nets') => void;
}

export function ComponentGuideDialog({
  open,
  onOpenChange,
  hasBoard,
  onFilterTerm,
}: ComponentGuideDialogProps) {
  const [tab, setTab] = useState<GuideTab>('parts');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[660px]" aria-label="Component, net and abbreviation guide">
        <DialogHeader>
          <DialogDescription>Parts, Nets &amp; Abbreviations</DialogDescription>
          <DialogTitle>PCB Component &amp; Abbreviation Guide</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as GuideTab)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="opt-tabs px-4" aria-label="Guide sections">
            <TabsTrigger value="parts" className={tab === 'parts' ? 'on' : ''}>
              Parts (13)
            </TabsTrigger>
            <TabsTrigger value="nets" className={tab === 'nets' ? 'on' : ''}>
              Nets &amp; Signals
            </TabsTrigger>
            <TabsTrigger value="terms" className={tab === 'terms' ? 'on' : ''}>
              Board Terms
            </TabsTrigger>
          </TabsList>

          <DialogBody className="space-y-3">
            <TabsContent value="parts" className="space-y-3 overflow-visible">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Circuit boards label parts with a prefix code like <code className="font-semibold text-foreground">R1</code>,{' '}
                <code className="font-semibold text-foreground">C1</code>,{' '}
                <code className="font-semibold text-foreground">Q1</code>, and{' '}
                <code className="font-semibold text-foreground">U1</code> plus short package tags.{' '}
                {hasBoard && onFilterTerm
                  ? 'Tap any type below to filter matching components on the loaded board.'
                  : 'Use these visual shapes and prefixes to recognize components in 2D and 3D views.'}
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PACKAGE_GUIDE_ORDER.map((kind) => {
                  const meta = getPackageMeta(kind);
                  const InteractiveTag = hasBoard && onFilterTerm ? 'button' : 'div';
                  return (
                    <InteractiveTag
                      key={kind}
                      {...(hasBoard && onFilterTerm
                        ? {
                            type: 'button' as const,
                            onClick: () => {
                              onFilterTerm(meta.friendly, 'parts');
                              onOpenChange(false);
                            },
                          }
                        : {})}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/45 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/80"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card p-1">
                        <PackageGlyph kind={kind} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-xs font-semibold text-foreground">{meta.label}</strong>
                          <Badge variant="default" className="text-[10px]">
                            {meta.short}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[10.5px] font-medium text-primary">
                          Prefix: {meta.prefixes}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          {meta.role}
                        </p>
                      </div>
                    </InteractiveTag>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="nets" className="space-y-3 overflow-visible">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Copper wires (nets) use standard electronics shorthand such as <code className="font-semibold text-foreground">+3V3</code>,{' '}
                <code className="font-semibold text-foreground">SDA</code>,{' '}
                <code className="font-semibold text-foreground">USB_DP</code>, or{' '}
                <code className="font-semibold text-foreground">BOOT0</code>.{' '}
                {hasBoard && onFilterTerm
                  ? 'Tap any signal group below to filter matching nets on this board.'
                  : 'Hover or click any net on the board to see its role and connected pins.'}
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {NET_SIGNAL_GUIDE.map((item) => {
                  const InteractiveTag = hasBoard && onFilterTerm ? 'button' : 'div';
                  return (
                    <InteractiveTag
                      key={item.id}
                      {...(hasBoard && onFilterTerm
                        ? {
                            type: 'button' as const,
                            onClick: () => {
                              onFilterTerm(item.searchTerm, 'nets');
                              onOpenChange(false);
                            },
                          }
                        : {})}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/45 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/80"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                        <MaterialIcon name="hub" size={16} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-xs font-semibold text-foreground">{item.title}</strong>
                          <Badge variant="amber" className="text-[10px]">
                            {item.badge}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[10.5px] font-medium text-primary">
                          {item.codes}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          {item.role}
                        </p>
                      </div>
                    </InteractiveTag>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="terms" className="space-y-3 overflow-visible">
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Common Board &amp; Layout Terms
                </div>
                <div className="divide-y divide-border/70">
                  {BOARD_TERMS_GLOSSARY.map(({ term, shortMeaning }) => (
                    <div key={term} className="flex flex-col gap-0.5 py-2 text-xs sm:flex-row sm:gap-3">
                      <strong className="w-40 shrink-0 font-semibold text-foreground">{term}</strong>
                      <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted-foreground">
                        {shortMeaning}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </DialogBody>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
