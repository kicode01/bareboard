export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify(): void {
  for (const fn of listeners) fn(Boolean(deferred));
}

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  if ('serviceWorker' in navigator) {
    const swUrl = new URL('sw.js', document.baseURI).href;
    navigator.serviceWorker.register(swUrl, { scope: new URL('./', document.baseURI).pathname })
      .catch(() => undefined);
  }
}

export function subscribeInstall(fn: (available: boolean) => void): () => void {
  listeners.add(fn);
  fn(Boolean(deferred));
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const choice = await event.userChoice;
  deferred = null;
  notify();
  return choice.outcome === 'accepted';
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** PWA file_handlers: files opened from the OS are delivered through launchQueue. */
export function consumeLaunchFiles(handler: (files: InputFileLike[]) => void): void {
  const w = window as unknown as {
    launchQueue?: { setConsumer: (cb: (p: { files: Array<{ getFile: () => Promise<File> }> }) => void) => void };
  };
  if (!w.launchQueue) return;
  w.launchQueue.setConsumer(async (params) => {
    const out: InputFileLike[] = [];
    for (const handle of params.files) {
      try {
        const file = await handle.getFile();
        out.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      } catch { /* ignore unreadable handle */ }
    }
    if (out.length) handler(out);
  });
}

export interface InputFileLike { name: string; bytes: Uint8Array }
