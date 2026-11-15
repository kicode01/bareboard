/**
 * Batch validation harness.
 *
 * Drop real boardview files into samples/ (any sub-folder) and run:
 *   npm run validate
 *
 * It bundles the TypeScript parsers with esbuild, then parses every sample.
 * ASC/TSICT folders are grouped automatically by directory.
 */
import { build } from 'esbuild';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const samplesDir = path.join(root, 'samples');
const tmp = await mkdtemp(path.join(tmpdir(), 'boardview-validate-'));
const bundle = path.join(tmp, 'parsers.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'src/parsers/index.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  const { loadBoard } = await import(pathToFileURL(bundle).href);

  async function collect(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return []; }
    const out = [];
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...await collect(p));
      else if (e.isFile() && !/\.(md|json|txt|ya?ml)$/i.test(e.name)) out.push(p);
    }
    return out;
  }

  const files = await collect(samplesDir);
  const ascGroups = new Map();
  const singles = [];
  for (const f of files) {
    if (f.toLowerCase().endsWith('.asc')) {
      const dir = path.dirname(f);
      ascGroups.set(dir, [...(ascGroups.get(dir) || []), f]);
    } else singles.push(f);
  }
  const jobs = [
    ...singles.map((f) => ({ label: path.relative(root, f), paths: [f] })),
    ...[...ascGroups.values()].map((g) => ({ label: `${path.relative(root, path.dirname(g[0]))}/ (${g.length} .asc files)`, paths: g })),
  ];

  if (!jobs.length) {
    console.log(`No samples found in ${samplesDir}. Add real .brd/.bdv/.cst files there and rerun.`);
  }

  let ok = 0;
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log('');
  console.log(pad('STATUS', 8) + pad('FORMAT', 12) + pad('PARTS', 7) + pad('PINS', 7) + pad('NAILS', 7) + 'FILE');
  console.log('─'.repeat(96));
  for (const job of jobs.sort((a, b) => a.label.localeCompare(b.label))) {
    const inputs = await Promise.all(job.paths.map(async (p) => ({
      name: p.split(/[\\/]/).pop(),
      bytes: new Uint8Array(await readFile(p)),
    })));
    let result;
    try { result = loadBoard(inputs); }
    catch (e) { result = { board: null, detection: { label: 'THREW' }, error: String(e) }; }
    const b = result.board;
    if (b) ok++;
    console.log(
      pad(b ? 'OK' : 'FAIL', 8) +
      pad(b ? b.format : result.detection.label, 12) +
      pad(b ? b.parts.length : '—', 7) +
      pad(b ? b.pins.length : '—', 7) +
      pad(b ? b.nails.length : '—', 7) +
      job.label + (b ? '' : `  ← ${result.error || 'unsupported'}`),
    );
    if (b?.warnings.length) for (const w of b.warnings) console.log('         ! ' + w);
  }
  console.log('─'.repeat(96));
  console.log(`${ok}/${jobs.length} samples parsed.\n`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
