import { unzipSync } from 'fflate';
import type { Board, Detection, ParseResult } from '../types';
import { detect, extensionOf } from './detect';
import { finalizeBoard, latin1, type RawBoard } from './util';
import { parseAsc, parseBdv, parseBrd, parseBrd2, parseBvr, parseBvr3, parseCad, type AscFiles } from './text';
import { parseCst } from './binary';

export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

const LABELS: Record<string, string> = {
  brd: 'BRD', brd2: 'BRD2', bdv: 'BDV', bvr: 'BVR', bvr3: 'BVR3',
  cad: 'CAD', cst: 'CST', asc: 'ASC / TSICT',
};

function finish(raw: RawBoard, name: string, detection: Detection, bytes: Uint8Array): Board {
  return finalizeBoard(raw, name, LABELS[detection.id] || detection.label, detection.id, bytes);
}

function dispatch(bytes: Uint8Array, detection: Detection): RawBoard {
  switch (detection.id) {
    case 'brd': return parseBrd(bytes);
    case 'brd2': return parseBrd2(bytes);
    case 'bdv': return parseBdv(bytes);
    case 'bvr': return parseBvr(bytes);
    case 'bvr3': return parseBvr3(bytes);
    case 'cad': return parseCad(bytes);
    case 'cst': return parseCst(bytes);
    default: throw new Error('No parser registered for this format.');
  }
}

function ascFrom(files: InputFile[]): { files: AscFiles; detection: Detection } | null {
  const byName = new Map<string, string>();
  for (const f of files) {
    const base = f.name.split(/[\\/]/).pop() || f.name;
    const lower = base.toLowerCase();
    if (['format.asc', 'pins.asc', 'nails.asc'].includes(lower)) byName.set(lower, latin1(f.bytes));
  }
  if (!byName.has('format.asc') && !byName.has('pins.asc')) return null;
  const detection: Detection = {
    id: 'asc', label: 'ASC / TSICT folder', matchedBy: 'extension',
    detail: `Companion files found: ${[...byName.keys()].join(', ')}.`,
    supported: true,
    note: 'TSICT boardviews are folders. Drop format.asc, pins.asc and nails.asc together (or a .zip containing them).',
  };
  return {
    files: {
      format: byName.get('format.asc') || '',
      pins: byName.get('pins.asc') || '',
      nails: byName.get('nails.asc') || '',
    },
    detection,
  };
}

function expandZip(file: InputFile): InputFile[] {
  const entries = unzipSync(file.bytes);
  const out: InputFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('/') || data.length === 0) continue;
    out.push({ name: path, bytes: data });
  }
  return out;
}

export function loadBoard(input: InputFile[]): ParseResult {
  if (!input.length) {
    return { board: null, detection: { id: 'empty', label: 'No file', matchedBy: 'none', detail: '', supported: false }, error: 'No file supplied.' };
  }

  // A ZIP container may hold either ASC companion files or a single boardview.
  let files = input;
  if (input.length === 1 && extensionOf(input[0].name) === '.zip') {
    try {
      files = expandZip(input[0]);
      if (!files.length) throw new Error('Archive is empty.');
    } catch (e) {
      return {
        board: null,
        detection: { id: 'zip', label: 'ZIP archive', matchedBy: 'extension', detail: 'Could not expand the archive.', supported: false },
        error: e instanceof Error ? e.message : 'Could not expand the archive.',
      };
    }
  }

  const asc = ascFrom(files);
  if (asc) {
    if (!asc.files.format || !asc.files.pins) {
      return { board: null, detection: asc.detection, error: 'ASC folders need at least format.asc and pins.asc. Drop all files from the folder together.' };
    }
    try {
      const raw = parseAsc(asc.files);
      // Concatenate companion files so the raw inspector and byte count describe the whole board.
      const total = files.reduce((n, f) => n + f.bytes.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const f of files) { merged.set(f.bytes, offset); offset += f.bytes.length; }
      const board = finish(raw, 'ASC board', asc.detection, merged);
      return { board, detection: asc.detection };
    } catch (e) {
      return { board: null, detection: asc.detection, error: e instanceof Error ? e.message : 'ASC parse failed.' };
    }
  }

  const primary = files.find((f) => detect(f.bytes, f.name).supported) || files[0];
  const detection = detect(primary.bytes, primary.name);
  if (!detection.supported) {
    return { board: null, detection, error: detection.note || 'This format is not supported.' };
  }
  try {
    const raw = dispatch(primary.bytes, detection);
    const board = finish(raw, primary.name.split(/[\\/]/).pop() || primary.name, detection, primary.bytes);
    return { board, detection };
  } catch (e) {
    return {
      board: null, detection,
      error: e instanceof Error ? `Parse failed: ${e.message}` : 'Parse failed.',
    };
  }
}
