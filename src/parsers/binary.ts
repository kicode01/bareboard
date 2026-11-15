import type { Side } from '../types';
import { emptyRaw, latin1, makePin, type RawBoard } from './util';

function findAscii(bytes: Uint8Array, needle: string, from: number): number {
  const codes = [...needle].map((c) => c.charCodeAt(0));
  for (let i = Math.max(0, from); i <= bytes.length - codes.length; i++) {
    let ok = true;
    for (let k = 0; k < codes.length; k++) {
      if (bytes[i + k] !== codes[k]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * CST is a little-endian binary format with length-prefixed strings and a
 * "CPad" section holding the pin table. There is no magic value, so it is
 * selected by extension. Every offset is bounds-checked: malformed files
 * surface as a diagnostic instead of throwing.
 */
export function parseCst(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  if (bytes.length < 32) throw new Error('CST file is too small to contain a parts table.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (p: number) => { if (p + 2 > bytes.length) throw new Error('Unexpected end of CST data.'); return dv.getUint16(p, true); };
  const i16 = (p: number) => { if (p + 2 > bytes.length) throw new Error('Unexpected end of CST data.'); return dv.getInt16(p, true); };
  const str = (p: number, n: number) => { if (p + n > bytes.length) throw new Error('CST string overruns the file.'); return latin1(bytes.subarray(p, p + n)); };

  const numParts = Math.min(u16(0), 100000);
  let p = 6;
  const sectionLen = u16(p); p += 2;
  if (sectionLen > bytes.length) throw new Error('CST section name length is invalid.');
  p += sectionLen;

  for (let i = 0; i < numParts; i++) {
    const len = bytes[p++] ?? 0;
    const name = str(p, len); p += len;
    p += 4;
    const layer = bytes[p++] ?? 0;
    const side: Side = layer === 0x0c ? 'top' : layer === 0x01 ? 'bottom' : 'both';
    raw.parts.push({ id: i + 1, name, side, type: 'smd', pinStart: 0, pinEnd: 0 });
    p += 6;
  }

  p -= 2;
  const numNets = Math.min(u16(p), 200000); p += 2;
  const nets: string[] = [];
  for (let i = 0; i < numNets; i++) {
    const len = bytes[p++] ?? 0;
    nets.push(str(p, len)); p += len;
  }

  // Orphan pins are assigned to a synthetic part, matching the reference parser.
  raw.parts.push({ id: raw.parts.length + 1, name: '...', side: 'both', type: 'through', pinStart: 0, pinEnd: 0 });

  const cpad = findAscii(bytes, 'CPad', p);
  if (cpad < 0) throw new Error('Could not locate the CPad pin section.');
  p = Math.max(0, cpad - 8);
  const numPins = Math.min(u16(p), 500000);
  p += 12; // section count + 10-byte header

  for (let i = 0; i < numPins; i++) {
    if (p + 16 > bytes.length) break;
    const partId = i16(p); p += 2;
    const probe = i16(p); p += 2;
    const netId = i16(p); p += 2;
    const x = i16(p); p += 2;
    const y = i16(p); p += 2;
    p += 2; // shape
    p += 4; // unused
    const part = partId >= 0 ? Math.min(partId + 1, raw.parts.length) : raw.parts.length;
    const net = nets[netId] ?? 'UNCONNECTED';
    raw.pins.push(makePin(x, y, part, net, raw.parts[part - 1].side, probe));
  }

  const xs = raw.pins.map((q) => q.x), ys = raw.pins.map((q) => q.y);
  if (xs.length) {
    const pad = 20;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    raw.outline.push({ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY });
  }
  raw.warnings.push('CST has no real outline in the file; a bounding rectangle was generated from pin coordinates.');
  return raw;
}
