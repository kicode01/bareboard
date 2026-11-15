import rawBrd from '../../samples/demo.brd?raw';
import type { InputFile } from './index';

/** Bundled, valid classic-BRD sample. Loaded through the real BRD parser. */
export function demoFile(): InputFile {
  return { name: 'demo.brd', bytes: new TextEncoder().encode(rawBrd) };
}
