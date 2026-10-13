// The export kernel reads a roadmap's logo once per export (specs/surface-options.md §3.4).
//
// `loadLogo` measures the logo for layout and keeps the bytes; `renderSvg`
// embeds those bytes instead of resolving the asset again. PNG and PDF render
// a second, font-pinned SVG, which must reuse the same bytes too.

import * as path from 'node:path';
import { type ExportFormat, exportDocument, type HostEnv } from '@nowline/export';
import { describe, expect, it } from 'vitest';
import { canonicalFonts, loadResvgWasm } from '../determinism/node-surface.js';

const ROOT = path.resolve('/nowline-logo');
const LOGO = '<svg viewBox="0 0 30 10"><rect width="30" height="10"/></svg>';
const SOURCE = `nowline v1

roadmap r "Platform 2026" logo:"./acme.svg" start:2026-01-05

swimlane a "A"
  item x duration:1w
`;

function countingHost(reads: string[]): HostEnv {
    return {
        readSource: async () => {
            throw new Error('no includes in this roadmap');
        },
        readAsset: async (ref) => {
            reads.push(ref);
            return new TextEncoder().encode(LOGO);
        },
        loadWasm: () => loadResvgWasm(),
    };
}

describe('the export kernel reads the logo once', () => {
    const formats: ExportFormat[] = ['svg', 'html', 'png', 'pdf'];
    for (const format of formats) {
        it(`${format}: one asset read`, async () => {
            const reads: string[] = [];
            const bytes = await exportDocument(
                SOURCE,
                format,
                {
                    sourcePath: path.join(ROOT, 'logo.nowline'),
                    today: new Date(Date.UTC(2026, 0, 5)),
                    locale: 'en-US',
                    theme: 'light',
                    fonts: await canonicalFonts(),
                },
                countingHost(reads),
            );
            expect(reads).toEqual(['./acme.svg']);
            if (format === 'svg') {
                // The logo still reaches the output.
                expect(new TextDecoder().decode(bytes)).toContain('data-layer="logo"');
            }
        });
    }
});
