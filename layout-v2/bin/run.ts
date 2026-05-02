#!/usr/bin/env tsx
// Prototype CLI: read a .nowline file, run the layout v2 pipeline, write
// the resulting SVG to layout-v2/out/, plus a side-by-side diff.html
// comparing prototype output to the production renderer's output for the same
// example.
//
// Usage: pnpm run run [path-to-nowline]
// Defaults to ../examples/minimal.nowline (relative to layout-v2).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMinimal } from '../src/parse.js';
import { buildLayout } from '../src/build.js';
import { renderStub } from '../src/render-stub.js';
import { weekendsOff } from '../src/working-calendar.js';
import { dayPreset, monthPreset } from '../src/view-preset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROTO_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PROTO_ROOT, '..');
const OUT_DIR = path.join(PROTO_ROOT, 'out');

async function main() {
    const inputArg = process.argv[2];
    const inputPath = inputArg
        ? path.resolve(process.cwd(), inputArg)
        : path.join(REPO_ROOT, 'examples/minimal.nowline');

    const text = await fs.readFile(inputPath, 'utf-8');
    const parsed = parseMinimal(text);

    await fs.mkdir(OUT_DIR, { recursive: true });

    // ----- Variant 1: default (continuous, week preset) ---------------------
    // Match production reference: now-line at Jan 22 (halfway through Design).
    const today = new Date('2026-01-22T00:00:00Z');
    const baseline = buildLayout(parsed, { today, theme: 'light' });
    const baselineSvg = renderStub(baseline.model);
    await fs.writeFile(path.join(OUT_DIR, 'minimal.svg'), baselineSvg, 'utf-8');

    // ----- Variant 2: weekends off (non-continuous calendar) ----------------
    const compressed = buildLayout(parsed, { today, calendar: weekendsOff() });
    await fs.writeFile(
        path.join(OUT_DIR, 'minimal-weekends-off.svg'),
        renderStub(compressed.model),
        'utf-8',
    );

    // ----- Variant 3: month preset (one config swap) ------------------------
    const monthly = buildLayout(parsed, { today, preset: monthPreset });
    await fs.writeFile(
        path.join(OUT_DIR, 'minimal-month-preset.svg'),
        renderStub(monthly.model),
        'utf-8',
    );

    // ----- Variant 4: day preset --------------------------------------------
    const daily = buildLayout(parsed, { today, preset: dayPreset });
    await fs.writeFile(
        path.join(OUT_DIR, 'minimal-day-preset.svg'),
        renderStub(daily.model),
        'utf-8',
    );

    // ----- Variant 5: long-title shelf-pack demo (fidelity #5) -------------
    // A deliberately long title forces the second item to row 1.
    const SHELF_PACK_SAMPLE = `nowline v1
roadmap shelf "Shelf-pack demo" start:2026-01-05 scale:1w author:"Long-title overflow"
swimlane lane "Engineering"
  item one   "An item with a deliberately long title that won't fit in a single week column" duration:1w status:in-progress remaining:50%
  item two   "Next"   duration:1w status:planned
  item three "Third"  duration:1w status:planned
`;
    const shelfParsed = parseMinimal(SHELF_PACK_SAMPLE);
    const shelf = buildLayout(shelfParsed, { today, theme: 'light' });
    const shelfSvg = renderStub(shelf.model);
    await fs.writeFile(path.join(OUT_DIR, 'shelf-pack-demo.svg'), shelfSvg, 'utf-8');

    // ----- Diff page --------------------------------------------------------
    const productionSvgPath = path.join(REPO_ROOT, 'specs/samples/minimal.svg');
    let production: string;
    try {
        production = await fs.readFile(productionSvgPath, 'utf-8');
    } catch {
        production = '<!-- production sample not found -->';
    }

    const diffHtml = buildDiffPage({
        production,
        baseline: baselineSvg,
        compressed: renderStub(compressed.model),
        monthly: renderStub(monthly.model),
        daily: renderStub(daily.model),
        shelf: shelfSvg,
    });
    await fs.writeFile(path.join(OUT_DIR, 'diff.html'), diffHtml, 'utf-8');

    // ----- TimeScale.invert demo (validation #2) ---------------------------
    const someX = baseline.timeScale.range()[0] + 200;
    const inverted = baseline.timeScale.invert(someX);
    process.stdout.write(
        `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'minimal.svg'))}\n` +
            `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'minimal-weekends-off.svg'))}\n` +
            `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'minimal-month-preset.svg'))}\n` +
            `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'minimal-day-preset.svg'))}\n` +
            `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'shelf-pack-demo.svg'))}\n` +
            `wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'diff.html'))}\n` +
            `\n[invert demo] timeScale.invert(${someX}) = ${inverted.toISOString()}\n` +
            `[bandwidth] swimlane row height = ${baseline.bandScale.bandwidth().toFixed(1)}px\n` +
            `[preset] ${baseline.preset.name} (resolution=${baseline.preset.resolution.unit} x${baseline.preset.resolution.increment})\n` +
            `[shelf-pack] rows for shelf-pack-demo lane = ${
                Math.max(...shelf.model.swimlanes[0].children.map((c) => c.row)) + 1
            }\n`,
    );
}

interface DiffInputs {
    production: string;
    baseline: string;
    compressed: string;
    monthly: string;
    daily: string;
    shelf: string;
}

function buildDiffPage(inputs: DiffInputs): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Layout v2 prototype — minimal.nowline diff</title>
    <style>
      :root { color-scheme: light dark; }
      body { font: 14px system-ui; max-width: 1320px; margin: 24px auto; padding: 0 16px; }
      h1 { font-size: 20px; }
      h2 { font-size: 14px; margin: 24px 0 8px; color: #475569; }
      .panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #ffffff; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
      svg { display: block; max-width: 100%; height: auto; }
      .meta { color: #64748b; font-size: 12px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <h1>Layout v2 prototype — minimal.nowline</h1>
    <p>Side-by-side comparison of the prototype output (scales + measure/place tree + view presets + working calendar) against the production reference, plus three architectural-knob variants.</p>

    <div class="grid">
      <section class="panel">
        <h2>Production reference (specs/samples/minimal.svg)</h2>
        ${inputs.production}
      </section>

      <section class="panel">
        <h2>Prototype baseline (continuous calendar, week preset)</h2>
        ${inputs.baseline}
        <p class="meta">Same DSL → prototype layout → render-stub.</p>
      </section>

      <section class="panel">
        <h2>Variant: weekends off (non-continuous calendar)</h2>
        ${inputs.compressed}
        <p class="meta">Adding <code>weekendsOff()</code> compresses the X axis to working days only — no other code changed.</p>
      </section>

      <section class="panel">
        <h2>Variant: month preset (single config swap)</h2>
        ${inputs.monthly}
        <p class="meta">Swapped <code>preset: monthPreset</code> — multi-row header is year-over-month, x density follows.</p>
      </section>

      <section class="panel">
        <h2>Variant: day preset</h2>
        ${inputs.daily}
        <p class="meta">Swapped <code>preset: dayPreset</code> — much higher x density, same input data.</p>
      </section>

      <section class="panel">
        <h2>Variant: shelf-pack overflow demo (fidelity #5)</h2>
        ${inputs.shelf}
        <p class="meta">First item has a deliberately long title against a 1w-wide bar; the swimlane bumps the next item to row 1 so the bars stay column-aligned and the band height grows automatically.</p>
      </section>
    </div>
  </body>
</html>
`;
}

main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).message}\n${(err as Error).stack ?? ''}\n`);
    process.exit(1);
});
