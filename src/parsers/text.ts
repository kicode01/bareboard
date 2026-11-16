import type { Part, Pin, Side } from '../types';
import { Lexer, decodeBdv, decodeBrdHeader, emptyRaw, latin1, makePin, sideFromCode, splitLines, type RawBoard } from './util';

/* ------------------------------------------------------------------ *
 * BRD - classic BoardViewer text format. Sections:
 *   str_length: / var_data: / Format: / Parts: / Pins: / Nails:
 * ------------------------------------------------------------------ */
export function parseBrd(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(decodeBrdHeader(bytes)));
  let block = 0;
  let nFormat = Infinity, nParts = Infinity, nPins = Infinity, nNails = Infinity;
  let prevEnd = 0;
  const partCodes: number[] = [];

  for (const source of lines) {
    const line = source.replace(/^\s+/, '');
    if (!line) continue;
    switch (line) {
      case 'str_length:': block = 1; continue;
      case 'var_data:': block = 2; continue;
      case 'Format:': case 'format:': block = 3; continue;
      case 'Parts:': case 'Pins1:': block = 4; continue;
      case 'Pins:': case 'Pins2:': block = 5; continue;
      case 'Nails:': block = 6; continue;
    }
    const lx = new Lexer(line);
    try {
      switch (block) {
        case 2:
          nFormat = lx.int(); nParts = lx.int(); nPins = lx.int(); nNails = lx.int();
          break;
        case 3:
          if (raw.outline.length < nFormat) raw.outline.push({ x: lx.int(), y: lx.int() });
          break;
        case 4: {
          if (raw.parts.length >= nParts) break;
          const name = lx.str();
          const code = lx.int();
          const end = lx.int();
          const side: Side = code === 1 || (code >= 4 && code < 8) ? 'top'
            : code === 2 || code >= 8 ? 'bottom' : 'both';
          const part: Part = {
            id: raw.parts.length + 1, name, side,
            type: (code & 0x0c) ? 'smd' : 'through',
            pinStart: prevEnd, pinEnd: Math.min(end, Number.MAX_SAFE_INTEGER),
          };
          prevEnd = part.pinEnd;
          partCodes.push(code);
          raw.parts.push(part);
          break;
        }
        case 5: {
          if (raw.pins.length >= nPins) break;
          const x = lx.int(), y = lx.int(), probe = lx.int(), part = lx.int(), net = lx.str();
          raw.pins.push(makePin(x, y, part, net, 'both', probe));
          break;
        }
        case 6: {
          if (raw.nails.length >= nNails) break;
          const probe = lx.int(), x = lx.int(), y = lx.int();
          const side = lx.int() === 1 ? 'top' : 'bottom';
          raw.nails.push({ probe, x, y, side, net: lx.str() });
          break;
        }
      }
    } catch { /* skip malformed record */ }
  }

  // Many OEM/Apple .brd exports store only side (1=top, 2=bottom) without SMD bitflags (0x04/0x08).
  // If no part in the file sets bit 0x0c, avoid mislabeling surface-mount laptop parts as through-hole.
  if (!partCodes.some((c) => (c & 0x0c) !== 0)) {
    for (const part of raw.parts) {
      part.type = 'smd';
    }
  }

  // Lenovo variant: pins with an empty net inherit the net of the matching nail probe.
  const nailNets = new Map<number, string>();
  for (const nail of raw.nails) nailNets.set(nail.probe, nail.net);
  for (const pin of raw.pins) {
    if (!pin.net) pin.net = nailNets.get(pin.probe) || '';
    const part = raw.parts[pin.part - 1];
    if (part) pin.side = part.side;
  }
  if (!raw.pins.length && !raw.outline.length) raw.warnings.push('BRD sections were found but no records parsed; the file may be truncated.');
  return raw;
}

/* ------------------------------------------------------------------ *
 * BRD2 - BRDOUT: / NETS: / PARTS: / PINS: / NAILS: variant
 * ------------------------------------------------------------------ */
export function parseBrd2(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(bytes)).map((l) => l.replace(/^\s+/, '')).filter(Boolean);
  const nets = new Map<number, string>();
  let block = 0, maxY = 0, maxX = 0;
  let nFormat = Infinity, nNets = Infinity, nParts = Infinity, nPins = Infinity, nNails = Infinity;

  for (const line of lines) {
    const marker = (m: string) => line.startsWith(m);
    if (marker('BRDOUT:')) { const l = new Lexer(line.slice(7)); nFormat = l.int(); maxX = l.int(); maxY = l.int(); block = 1; continue; }
    if (marker('NETS:')) { nNets = new Lexer(line.slice(5)).int(); block = 2; continue; }
    if (marker('PARTS:')) { nParts = new Lexer(line.slice(6)).int(); block = 3; continue; }
    if (marker('PINS:')) { nPins = new Lexer(line.slice(5)).int(); block = 4; continue; }
    if (marker('NAILS:')) { nNails = new Lexer(line.slice(6)).int(); block = 5; continue; }
    const lx = new Lexer(line);
    switch (block) {
      case 1: if (raw.outline.length < nFormat) raw.outline.push({ x: lx.int(), y: lx.int() }); break;
      case 2: if (nets.size < nNets) nets.set(lx.int(), lx.str()); break;
      case 3: {
        if (raw.parts.length >= nParts) break;
        const name = lx.str();
        const p1 = { x: lx.int(), y: lx.int() };
        const p2 = { x: lx.int(), y: lx.int() };
        const begin = lx.int();
        const side = sideFromCode(lx.int());
        raw.parts.push({ id: raw.parts.length + 1, name, side, type: 'smd', pinStart: begin, pinEnd: begin,
          box: { minX: Math.min(p1.x, p2.x), minY: Math.min(p1.y, p2.y), maxX: Math.max(p1.x, p2.x), maxY: Math.max(p1.y, p2.y) } });
        break;
      }
      case 4: {
        if (raw.pins.length >= nPins) break;
        const x = lx.int(), y = lx.int(), netId = lx.int(), side = sideFromCode(lx.int());
        raw.pins.push(makePin(x, y, 0, nets.get(netId) || 'UNCONNECTED', side, 1));
        break;
      }
      case 5: {
        if (raw.nails.length >= nNails) break;
        const probe = lx.int(), x = lx.int(), y = lx.int(), netId = lx.int(), isTop = lx.int() === 1;
        raw.nails.push({ probe, x, y: isTop ? y : maxY - y, side: isTop ? 'top' : 'bottom', net: nets.get(netId) || 'UNCONNECTED' });
        break;
      }
    }
  }

  // Parts store the *first* pin index of the following part; turn them into ranges,
  // and mirror bottom-side geometry the same way the reference implementation does.
  for (let i = 0; i < raw.parts.length; i++) {
    const part = raw.parts[i];
    const begin = part.pinStart;
    const end = i + 1 < raw.parts.length ? raw.parts[i + 1].pinStart : raw.pins.length;
    part.pinStart = begin;
    part.pinEnd = end;
    if (part.side === 'bottom' && part.box) {
      part.box = { ...part.box, minY: maxY - part.box.maxY, maxY: maxY - part.box.minY };
    }
    for (let k = begin; k < Math.min(end, raw.pins.length); k++) {
      const pin = raw.pins[k];
      pin.part = part.id;
      if (pin.side !== 'top') pin.y = maxY - pin.y;
    }
  }
  if (!maxX) maxX = 0;
  if (!raw.outline.length && maxX && maxY) {
    raw.outline.push({ x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }, { x: 0, y: 0 });
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * BDV - encoded ASC bundle (<<format.asc>> / <<pins.asc>> / <<nails.asc>>)
 * ------------------------------------------------------------------ */
export function parseBdv(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(decodeBdv(bytes)));
  let block = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\s+/, '');
    if (!line) continue;
    if (line === '<<format.asc>>') { block = 1; i += 8; continue; }
    if (line === '<<pins.asc>>') { block = 2; i += 8; continue; }
    if (line === '<<nails.asc>>') { block = 3; i += 7; continue; }
    if (line.startsWith('<<') || line.startsWith('dd:1.3')) { block = 0; continue; }

    if (block === 1) {
      const lx = new Lexer(line);
      const x = lx.double() * 1000, y = lx.double() * 1000;
      if (Number.isFinite(x) && Number.isFinite(y)) raw.outline.push({ x, y });
    } else if (block === 2) {
      const lx = new Lexer(line.startsWith('Part') ? line.slice(4) : line);
      if (line.startsWith('Part')) {
        const name = lx.str();
        const loc = lx.str();
        raw.parts.push({ id: raw.parts.length + 1, name, side: loc === '(T)' ? 'top' : 'bottom',
          type: 'smd', pinStart: raw.pins.length, pinEnd: raw.pins.length });
      } else if (raw.parts.length) {
        lx.int();
        const pinName = lx.str();
        const x = lx.double() * 1000, y = lx.double() * 1000;
        lx.int();
        const net = lx.str();
        const probe = lx.int();
        raw.pins.push(makePin(x, y, raw.parts.length, net, raw.parts[raw.parts.length - 1].side, probe, pinName));
        raw.parts[raw.parts.length - 1].pinEnd = raw.pins.length;
      }
    } else if (block === 3) {
      const lx = new Lexer(line.slice(1)); // leading field marker
      const probe = lx.int();
      const x = lx.double() * 1000, y = lx.double() * 1000;
      lx.int(); lx.str();
      const loc = lx.str();
      lx.str();
      const net = lx.str();
      raw.nails.push({ probe, x, y, side: loc === '(T)' ? 'top' : 'bottom', net });
    }
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * BVR - BVRAW_FORMAT_1 with <<Layout>> / <<Pin>> / <<Nail>> sections
 * ------------------------------------------------------------------ */
export function parseBvr(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(bytes));
  let block = 0;
  let lastPartName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\s+/, '');
    if (!line) continue;
    if (line === '<<Layout>>') { block = 1; i += 1; continue; }
    if (line === '<<Pin>>') { block = 2; i += 1; continue; }
    if (line === '<<Nail>>') { block = 3; i += 1; continue; }
    if (line.startsWith('<<') || line.startsWith('BVRAW_FORMAT')) { block = 0; continue; }

    if (block === 1) {
      const lx = new Lexer(line);
      const x = lx.double() * 1000;
      lx.comma();
      const y = lx.double() * 1000;
      if (Number.isFinite(x) && Number.isFinite(y)) raw.outline.push({ x, y });
    } else if (block === 2) {
      const lx = new Lexer(line);
      const partName = lx.str();
      const loc = lx.str();
      const side: Side = loc === '(T)' ? 'top' : 'bottom';
      if (partName !== lastPartName) {
        raw.parts.push({ id: raw.parts.length + 1, name: partName, side, type: 'smd',
          pinStart: raw.pins.length, pinEnd: raw.pins.length });
        lastPartName = partName;
      }
      lx.int();
      const pinName = lx.str();
      const x = lx.double() * 1000, y = lx.double() * 1000;
      lx.int();
      const net = lx.str();
      const pin = makePin(x, y, raw.parts.length, net, side, 0, pinName);
      raw.pins.push(pin);
      raw.parts[raw.parts.length - 1].pinEnd = raw.pins.length;
    } else if (block === 3) {
      const tab = line.indexOf('\t');
      const lx = new Lexer(tab >= 0 ? line.slice(tab + 1) : line);
      const x = lx.double() * 1000, y = lx.double() * 1000;
      lx.int(); lx.str();
      const loc = lx.str();
      lx.str();
      const net = lx.str();
      raw.nails.push({ x, y, side: loc === '(T)' ? 'top' : 'bottom', net, probe: raw.nails.length + 1 });
    }
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * BVR3 - key/value text: PART_* / PIN_* / PART_END / PIN_END / OUTLINE_*
 * ------------------------------------------------------------------ */
export function parseBvr3(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(bytes)).map((l) => l.trim()).filter(Boolean);
  let part: Part = { id: 1, name: '', side: 'both', type: 'smd', pinStart: 0, pinEnd: 0 };
  let pin: Pin = makePin(0, 0, 1, '', 'both');
  let ox = 0, oy = 0;
  let partStart = 0;

  const value = (line: string, n: number) => line.slice(n).trim();
  for (const line of lines) {
    const lx = (n: number) => new Lexer(value(line, n));
    if (line.startsWith('PART_NAME ')) part.name = lx(10).str();
    else if (line.startsWith('PART_SIDE ')) {
      const s = lx(10).str(); part.side = s === 'T' ? 'top' : s === 'B' ? 'bottom' : 'both';
    } else if (line.startsWith('PART_ORIGIN ')) { const l = lx(12); ox = l.double(); oy = l.double(); }
    else if (line.startsWith('PART_MOUNT ')) part.type = lx(11).str() === 'SMD' ? 'smd' : 'through';
    else if (line.startsWith('PIN_NUMBER ')) { pin.number = lx(11).str(); if (!pin.name) pin.name = pin.number; }
    else if (line.startsWith('PIN_NAME ')) pin.name = lx(9).str();
    else if (line.startsWith('PIN_SIDE ')) {
      const s = lx(9).str(); pin.side = s === 'T' ? 'top' : s === 'B' ? 'bottom' : 'both';
    } else if (line.startsWith('PIN_ORIGIN ')) { const l = lx(11); pin.x = l.double() + ox; pin.y = l.double() + oy; }
    else if (line.startsWith('PIN_RADIUS ')) pin.radius = Math.max(2, lx(11).double());
    else if (line.startsWith('PIN_NET ')) pin.net = lx(8).str();
    else if (line === 'PIN_END') {
      pin.part = raw.parts.length + 1;
      raw.pins.push(pin);
      pin = makePin(0, 0, raw.parts.length + 1, '', 'both');
    } else if (line === 'PART_END') {
      part.id = raw.parts.length + 1;
      part.pinStart = partStart;
      part.pinEnd = raw.pins.length;
      raw.parts.push(part);
      partStart = raw.pins.length;
      part = { id: raw.parts.length + 2, name: '', side: 'both', type: 'smd', pinStart: 0, pinEnd: 0 };
      ox = 0; oy = 0;
    } else if (line.startsWith('OUTLINE_POINTS ')) {
      const nums = value(line, 15).match(/[+-]?(?:\d+\.?\d*|\.\d+)/g) || [];
      for (let k = 0; k + 1 < nums.length; k += 2) raw.outline.push({ x: +nums[k], y: +nums[k + 1] });
    } else if (line.startsWith('OUTLINE_SEGMENTED ')) {
      const nums = value(line, 18).match(/[+-]?(?:\d+\.?\d*|\.\d+)/g) || [];
      raw.outlineSegments = raw.outlineSegments || [];
      for (let k = 0; k + 3 < nums.length; k += 4) {
        const a = { x: +nums[k], y: +nums[k + 1] };
        const b = { x: +nums[k + 2], y: +nums[k + 3] };
        raw.outlineSegments.push([a, b]);
        raw.outline.push(a, b);
      }
    }
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * CAD - COMP / C_PIN / NET / N_VIA records
 * ------------------------------------------------------------------ */
export function parseCad(bytes: Uint8Array): RawBoard {
  const raw = emptyRaw();
  const lines = splitLines(latin1(bytes)).map((l) => l.replace(/^\s+/, '')).filter(Boolean);
  const partIds = new Map<string, number>();
  let currentNet = '';

  for (const line of lines) {
    const lx = new Lexer(line);
    if (line.startsWith('COMP')) {
      lx.str();
      const first = lx.str();
      const isMount = first === 'SMD' || first === 'TH' || first === 'THROUGH';
      const name = isMount ? lx.str() : first;
      const f1 = lx.str(); lx.str(); lx.str(); lx.str(); lx.str();
      const loc = lx.str() || f1;
      const sideToken = isMount && (f1 === '1' || f1 === '2') ? f1 : loc;
      const id = raw.parts.length + 1;
      partIds.set(name, id);
      raw.parts.push({ id, name, side: sideToken === '1' ? 'top' : 'bottom', type: first === 'TH' || first === 'THROUGH' ? 'through' : 'smd', pinStart: 0, pinEnd: 0 });
    } else if (line.startsWith('C_PIN')) {
      lx.str();
      const first = lx.str();
      const ref = first.includes('-') ? first : lx.str();
      const [partName, pinName] = ref.split('-');
      const part = partIds.get(partName) || 0;
      const x = lx.double() * 1000, y = lx.double() * 1000;
      lx.double(); lx.double(); lx.double(); lx.str();
      const net = lx.str().replace(/^\//, '');
      const partSide = part ? raw.parts[part - 1].side : 'both';
      raw.pins.push(makePin(x, y, part, net, partSide, 0, pinName));
    } else if (line.startsWith('NET ')) {
      lx.str();
      currentNet = lx.str().replace(/^\//, '');
    } else if (line.startsWith('N_VIA')) {
      const tokens = line.trim().split(/\s+/);
      const offset = tokens[1] && !/^[+-]?(?:\d|\.)/.test(tokens[1]) ? 2 : 1;
      const x = parseFloat(tokens[offset] || '0') * 1000;
      const y = parseFloat(tokens[offset + 1] || '0') * 1000;
      const side = parseFloat(tokens[offset + 3] || '1') === 1 ? 'top' : 'bottom';
      raw.nails.push({ x, y, side, net: currentNet, probe: raw.nails.length + 1 });
    }
  }
  const xs = raw.pins.map((p) => p.x), ys = raw.pins.map((p) => p.y);
  if (xs.length) {
    const pad = 20;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    raw.outline.push({ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY });
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * ASC / TSICT - folder of format.asc + pins.asc + nails.asc
 * ------------------------------------------------------------------ */
export interface AscFiles { format: string; pins: string; nails: string }

export function parseAsc(files: AscFiles): RawBoard {
  const raw = emptyRaw();
  const fmtLines = splitLines(files.format);
  const pinLines = splitLines(files.pins);
  const nailLines = splitLines(files.nails);

  for (let i = 8; i < fmtLines.length; i++) {
    const l = new Lexer(fmtLines[i]);
    const x = l.double() * 1000, y = l.double() * 1000;
    if (Number.isFinite(x) && Number.isFinite(y) && (x || y)) raw.outline.push({ x, y });
  }

  for (let i = 8; i < pinLines.length; i++) {
    const line = pinLines[i].trim();
    if (!line) continue;
    if (line.startsWith('Part')) {
      const l = new Lexer(line.slice(4));
      const name = l.str(), loc = l.str();
      raw.parts.push({ id: raw.parts.length + 1, name, side: loc === '(T)' ? 'top' : 'bottom',
        type: 'smd', pinStart: raw.pins.length, pinEnd: raw.pins.length });
    } else if (raw.parts.length) {
      const l = new Lexer(line);
      l.int();
      const pinName = l.str();
      const x = l.double() * 1000, y = l.double() * 1000;
      l.int();
      const net = l.str(), probe = l.int();
      raw.pins.push(makePin(x, y, raw.parts.length, net, raw.parts[raw.parts.length - 1].side, probe, pinName));
      raw.parts[raw.parts.length - 1].pinEnd = raw.pins.length;
    }
  }

  for (let i = 7; i < nailLines.length; i++) {
    const line = nailLines[i].trim();
    if (!line) continue;
    const l = new Lexer(line.slice(1));
    const probe = l.int();
    const x = l.double() * 1000, y = l.double() * 1000;
    l.int(); l.str();
    const loc = l.str();
    l.str();
    const net = l.str();
    raw.nails.push({ probe, x, y, side: loc === '(T)' ? 'top' : 'bottom', net });
  }
  if (!files.nails) raw.warnings.push('nails.asc was not supplied — test points are unavailable.');
  return raw;
}
