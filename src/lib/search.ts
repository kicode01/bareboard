import type { Board } from '../types';

export interface NetInfo {
  name: string;
  pinIndices: number[];
  partIds: Set<number>;
}

export interface BoardIndex {
  nets: Map<string, NetInfo>;
  partsByName: Map<string, number[]>;
}

export function buildIndex(board: Board): BoardIndex {
  const nets = new Map<string, NetInfo>();
  board.pins.forEach((pin, index) => {
    const key = pin.net || 'UNCONNECTED';
    let info = nets.get(key);
    if (!info) { info = { name: key, pinIndices: [], partIds: new Set() }; nets.set(key, info); }
    info.pinIndices.push(index);
    if (pin.part > 0 && !board.parts[pin.part - 1]?.isDummy) info.partIds.add(pin.part);
  });
  const partsByName = new Map<string, number[]>();
  board.parts.forEach((part, index) => {
    if (part.isDummy) return;
    const key = part.name.toUpperCase();
    const list = partsByName.get(key) || [];
    list.push(index);
    partsByName.set(key, list);
  });
  return { nets, partsByName };
}

export interface SearchHit {
  kind: 'part' | 'net';
  label: string;
  index: number;
  sub: string;
  score: number;
}

function score(text: string, q: string): number {
  const t = text.toUpperCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 70;
  if (t.includes(q)) return 50;
  // subsequence match
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

export function search(index: BoardIndex, query: string, board: Board, limit = 40): SearchHit[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  index.partsByName.forEach((indices, name) => {
    const s = score(name, q);
    if (s) for (const i of indices) {
      hits.push({ kind: 'part', label: board.parts[i].name, index: i, sub: `${board.parts[i].side.toUpperCase()} · ${Math.max(0, board.parts[i].pinEnd - board.parts[i].pinStart)} pins`, score: s });
    }
  });
  index.nets.forEach((info, name) => {
    const s = score(name, q);
    if (s) hits.push({ kind: 'net', label: info.name, index: 0, sub: `${info.pinIndices.length} pins · ${info.partIds.size} parts`, score: s - 5 });
  });
  return hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}
