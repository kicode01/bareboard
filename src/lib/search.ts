import type { Board } from '../types';
import { classifyPartPackage } from '../render/realistic3d';
import { describeNet, getPackageMeta, type NetMeta } from './packages';

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

function scorePartCategory(meta: ReturnType<typeof getPackageMeta>, qRaw: string): number {
  const q = qRaw.toLowerCase();
  if (q.length < 2) return 0;
  const label = meta.label.toLowerCase();
  const friendly = meta.friendly.toLowerCase();
  if (friendly === q || label === q || meta.short.toLowerCase() === q) return 68;
  if (friendly.startsWith(q) || label.startsWith(q)) return 62;
  if (meta.keywords.some((kw) => kw === q || kw.startsWith(q))) return 58;
  if (label.includes(q) || meta.keywords.some((kw) => kw.includes(q))) return 42;
  return 0;
}

function scoreNetCategory(meta: NetMeta | null, qRaw: string): number {
  if (!meta) return 0;
  const q = qRaw.toLowerCase();
  if (q.length < 2) return 0;
  const friendly = meta.friendly.toLowerCase();
  const badge = meta.badge.toLowerCase();
  if (friendly === q || badge === q) return 64;
  if (friendly.startsWith(q) || badge.startsWith(q)) return 58;
  if (meta.keywords.some((kw) => kw === q || kw.startsWith(q))) return 52;
  if (friendly.includes(q) || meta.description.toLowerCase().includes(q)) return 40;
  return 0;
}

export function search(index: BoardIndex, query: string, board: Board, limit = 40): SearchHit[] {
  const trimmed = query.trim();
  const q = trimmed.toUpperCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  index.partsByName.forEach((indices, name) => {
    const nameScore = score(name, q);
    for (const i of indices) {
      const part = board.parts[i];
      const meta = getPackageMeta(classifyPartPackage(part).kind);
      const catScore = scorePartCategory(meta, trimmed);
      const bestScore = Math.max(nameScore, catScore);
      if (bestScore > 0) {
        const sideLabel = part.side === 'bottom' ? 'Bot' : part.side === 'both' ? 'Both' : 'Top';
        const pinCount = Math.max(0, part.pinEnd - part.pinStart);
        hits.push({
          kind: 'part',
          label: part.name,
          index: i,
          sub: `${meta.friendly} · ${sideLabel}, ${pinCount}p`,
          score: bestScore,
        });
      }
    }
  });
  index.nets.forEach((info, name) => {
    const netMeta = describeNet(info.name);
    const nameScore = score(name, q);
    const catScore = scoreNetCategory(netMeta, trimmed);
    const bestScore = Math.max(nameScore, catScore);
    if (bestScore > 0) {
      hits.push({
        kind: 'net',
        label: info.name,
        index: 0,
        sub: netMeta ? `${netMeta.friendly} · ${info.pinIndices.length}p` : `${info.pinIndices.length} pins, ${info.partIds.size} parts`,
        score: bestScore - 5,
      });
    }
  });
  return hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}
