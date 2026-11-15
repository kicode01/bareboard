import type { InputFile } from '../parsers';

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (cb: (f: File) => void, err?: (e: Error) => void) => void;
  createReader?: () => { readEntries: (cb: (entries: Entry[]) => void, err?: (e: Error) => void) => void };
};

async function readEntry(entry: Entry, prefix: string, out: InputFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      try { entry.file?.((f) => resolve(f), () => resolve(null)); } catch { resolve(null); }
    });
    if (file) out.push({ name: path, bytes: new Uint8Array(await file.arrayBuffer()) });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns at most 100 items per call; keep reading until empty.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve) => {
        try { reader.readEntries((items) => resolve(items), () => resolve([])); } catch { resolve([]); }
      });
      if (!batch.length) break;
      for (const child of batch) await readEntry(child, path, out);
    }
  }
}

export async function filesFromDataTransfer(dt: DataTransfer): Promise<InputFile[]> {
  const entries: Entry[] = [];
  for (const item of Array.from(dt.items)) {
    const get = (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry;
    const entry = typeof get === 'function' ? get.call(item) : null;
    if (entry) entries.push(entry);
  }
  if (entries.length) {
    const out: InputFile[] = [];
    for (const e of entries) await readEntry(e, '', out);
    if (out.length) return out;
  }
  return Promise.all(
    Array.from(dt.files).map(async (f) => ({
      name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

export async function filesFromFileList(list: FileList): Promise<InputFile[]> {
  return Promise.all(
    Array.from(list).map(async (f) => ({
      name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}
