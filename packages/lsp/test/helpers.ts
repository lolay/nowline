import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import type { NowlineFile } from '@nowline/core';
import { createNowlineLspServices, type NowlineLspServices } from '../src/nowline-lsp-module.js';

let cached: { shared: ReturnType<typeof createNowlineLspServices>['shared']; Nowline: NowlineLspServices } | undefined;
let docCounter = 0;

export function services() {
    if (!cached) {
        cached = createNowlineLspServices({
            fileSystemProvider: EmptyFileSystem.fileSystemProvider,
        });
    }
    return cached;
}

/**
 * Parse a Nowline source string in-memory and return the resulting document.
 * Each call mints a fresh URI so consecutive parses don't fight over Langium's
 * document cache.
 */
export async function parseDocument(source: string): Promise<LangiumDocument<NowlineFile>> {
    const { shared } = services();
    const uri = URI.parse(`memory:///lsp-test-${++docCounter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc;
}

/**
 * Read one of the repo's `examples/*.nowline` fixtures. Centralised so tests
 * stay consistent if the layout ever moves.
 */
export async function loadExample(name: string): Promise<string> {
    const examplesDir = path.resolve(__dirname, '..', '..', '..', 'examples');
    return fs.readFile(path.join(examplesDir, name), 'utf-8');
}

/** Convert a 1-based "(line, character)" position into LSP `Position` (0-based). */
export function pos(line: number, character: number): { line: number; character: number } {
    return { line: line - 1, character };
}

/**
 * Find the offset/position of the first occurrence of `needle` in `source`.
 * `occurrence` defaults to 0 (first match). Returns `Position` (0-based).
 *
 * Useful for tests that want to position the cursor on a specific token without
 * counting columns by hand.
 */
export function locate(source: string, needle: string, occurrence = 0): { line: number; character: number } {
    let from = -1;
    for (let i = 0; i <= occurrence; i++) {
        from = source.indexOf(needle, from + 1);
        if (from < 0) {
            throw new Error(`could not find occurrence ${occurrence} of "${needle}" in source`);
        }
    }
    const before = source.slice(0, from);
    const newlines = before.split('\n');
    const line = newlines.length - 1;
    const character = newlines[newlines.length - 1].length;
    return { line, character };
}

/** Cursor position one character past the last char of the first match of `needle`. */
export function locateAfter(source: string, needle: string, occurrence = 0): { line: number; character: number } {
    const start = locate(source, needle, occurrence);
    return { line: start.line, character: start.character + needle.length };
}
