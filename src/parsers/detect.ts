import type { Detection } from '../types';
import { latin1 } from './util';

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

const ENCRYPTED: Record<string, { label: string; note: string }> = {
  '.fz': {
    label: 'FZ (encrypted boardview)',
    note: 'FZ files are encrypted with a vendor-supplied key. BoardViewer ships a key database; a browser build cannot ship that key. OpenBoardView requires the same external FZKey.',
  },
  '.cae': {
    label: 'CAE (encrypted boardview)',
    note: 'CAE decryption needs a vendor CAEKey that is not present in the file. This is intentionally not bypassed.',
  },
  '.xzzpcb': {
    label: 'XZZPCB (possibly XOR-obfuscated)',
    note: 'XZZPCB files may be XOR-obfuscated with a key stored at offset 0x10. Detection only; parsing is not implemented yet.',
  },
};

function sig(bytes: Uint8Array): Detection {
  // Only the first 256 KiB are scanned; boardview headers always live at the front.
  const head = latin1(bytes, 262144);
  const has = (s: string) => head.includes(s);
  const magic = (hex: number[]) => hex.every((v, i) => bytes[i] === v);

  if (has('|KIND=Protel_Advanced_PCB') && !has('Binary')) {
    return unsupported('ad', 'Altium / Protel Advanced PCB', 'Found |KIND=Protel_Advanced_PCB.', 'This export is not a boardview; it is a PCB design file.');
  }
  if (has('GENCAD') && has('$HEADER')) {
    return unsupported('gencad', 'GenCAD', 'Found GENCAD + $HEADER markers.', 'GenCAD is a full CAD netlist format, not a boardview. Not implemented in this build.');
  }
  if (head.slice(0, 6) === 'XZZPCB' || (bytes[0x10] && (bytes[0] ^ bytes[0x10]) === 0x58)) {
    return unsupported('xzzpcb', 'XZZPCB', 'Found XZZPCB header.', ENCRYPTED['.xzzpcb'].note);
  }
  if (has('###Panel Added') && has('C_PIN')) {
    return supported('cad', 'CAD (###Panel Added)', 'Found ###Panel Added and C_PIN records.');
  }
  if (magic([0x23, 0xe2, 0x63, 0x28])) {
    return supported('brd', 'BRD (encoded header)', 'Matched the 23 E2 63 28 encoded BRD magic.');
  }
  if (has('str_length:') && has('var_data:')) {
    return supported('brd', 'BRD (plain text)', 'Found str_length: and var_data: section markers.');
  }
  if (has('BRDOUT:') && has('NETS:')) {
    return supported('brd2', 'BRD2 (BRDOUT/NETS)', 'Found BRDOUT: and NETS: section markers.');
  }
  if (has('BVRAW_FORMAT_3')) {
    return supported('bvr3', 'BVR3 (BVRAW_FORMAT_3)', 'Found BVRAW_FORMAT_3 marker.');
  }
  if (has('BVRAW_FORMAT_1')) {
    return supported('bvr', 'BVR (BVRAW_FORMAT_1)', 'Found BVRAW_FORMAT_1 marker.');
  }
  if (has('dd:1.3?,r?-=bb') || (has('<<format.asc>>') && has('<<pins.asc>>'))) {
    return supported('bdv', 'BDV (encoded ASC bundle)', 'Found the BDV encoded bundle header.');
  }
  if (has('<<format.asc>>') && has('<<pins.asc>>')) {
    return supported('bdv', 'BDV', 'Found ASC section markers.');
  }
  return {
    id: 'unknown',
    label: 'Unrecognized',
    matchedBy: 'none',
    detail: 'No known boardview signature in the first 256 KiB.',
    supported: false,
    note: 'Use the Raw inspector in the Diagnostics panel to examine the file header. Encrypted formats (.fz / .cae) are identified by extension.',
  };
}

function supported(id: string, label: string, detail: string): Detection {
  return { id, label, matchedBy: 'signature', detail, supported: true };
}

function unsupported(id: string, label: string, detail: string, note: string): Detection {
  return { id, label, matchedBy: 'signature', detail, supported: false, note };
}

/** Signature chain mirrors the reference implementation, with extension-only formats handled first. */
export function detect(bytes: Uint8Array, filename: string): Detection {
  const ext = extensionOf(filename);
  if (ENCRYPTED[ext]) {
    return {
      id: ext.slice(1), label: ENCRYPTED[ext].label,
      matchedBy: 'extension', detail: `Identified by the .${ext.slice(1)} extension (content is encrypted).`,
      supported: false, note: ENCRYPTED[ext].note,
    };
  }
  if (ext === '.cst') {
    return { id: 'cst', label: 'CST (binary)', matchedBy: 'extension', detail: 'CST has no magic bytes; trusted by extension.', supported: true };
  }
  if (ext === '.asc' || ext === '.bom') {
    return {
      id: 'asc', label: 'ASC / TSICT folder', matchedBy: 'extension',
      detail: 'ASC is a folder-based format: format.asc, pins.asc and nails.asc must be supplied together.',
      supported: true,
      note: 'Drop all .asc files from the same folder at once (or a .zip containing them).',
    };
  }
  if (bytes.length < 4) {
    return { id: 'empty', label: 'Empty file', matchedBy: 'none', detail: 'File is too small to identify.', supported: false };
  }
  return sig(bytes);
}
