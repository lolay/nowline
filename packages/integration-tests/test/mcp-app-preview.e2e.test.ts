// MCP Apps preview-widget regression leg (headless Chromium via Playwright).
//
// Reproduces the exact environment a web MCP host (Claude Desktop) loads the
// nowline live preview into — an opaque-origin `sandbox="allow-scripts"`
// iframe under a strict CSP — and drives the real ext-apps handshake
// (ui/initialize → initialized → tool-input → tool-result). A mock host plays
// AppBridge: it answers initialize, then feeds the lean `nowline.preview`
// payload, and (critically) sizes the iframe from the widget's
// `ui/notifications/size-changed` exactly like Claude does.
//
// The guarded regression: the widget used to be `height:100%` everywhere with
// the SDK's default autoResize, which measures documentElement at `max-content`
// and collapsed to height 0 — so the host shrank the iframe to nothing (blank
// preview, no console error, invisible in every log). See specs/mcp.md
// § "Debugging MCP apps on Claude Desktop". This leg locks the fix: the widget
// must report a non-zero height and actually paint, under CSP, whether or not
// the host advertises containerDimensions.
//
// Excluded from `make ci` / `make test` (needs a browser). Run it via
// `make mcp-app-e2e`, which builds @nowline/mcp and installs Chromium first.

/// <reference lib="dom" />

import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Loaded at runtime (dynamic import) from @nowline/mcp's built artifact so tsc
// never resolves a sibling package's dist across the project graph.
let PREVIEW_HTML: string;

// Mirror the sizing constants in packages/mcp/src/ui/entry.ts.
const MIN_HEIGHT_PX = 160;
const DEFAULT_MAX_HEIGHT_PX = 640;

const SOURCE = [
    'nowline v1',
    '',
    'roadmap r "Repro" start:2026-07-01 scale:2w',
    '',
    'swimlane web "Web"',
    '  item a "Design" duration:3w',
    '  item b "Build" duration:2w after:a',
].join('\n');

const LEAN = JSON.stringify({
    kind: 'nowline.preview',
    source: SOURCE,
    theme: 'light',
    now: '2026-07-05',
    locale: 'en-US',
});
const ARGS = { source: SOURCE, theme: 'light', now: '2026-07-05' };

// A strict CSP representative of a sandboxed MCP view: inline script/style (the
// bundle is one inline <script>), data:/blob: images and fonts, no network, and
// crucially NO 'unsafe-eval' / 'wasm-unsafe-eval'.
const STRICT_CSP =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'";

// Forward uncaught iframe errors through console so page.on('console') sees them.
const INSTRUMENT = `<script>
window.addEventListener('error', function(e){ console.error('[WIDGET-ERROR]', e.message); });
window.addEventListener('unhandledrejection', function(e){
  var r = e.reason; console.error('[WIDGET-REJECT]', (r && (r.stack||r.message)) || String(r));
});
</script>`;

function widgetHtml(csp: string | null): string {
    let html = PREVIEW_HTML.replace('<head>', `<head>\n${INSTRUMENT}`);
    if (csp) {
        html = html.replace(
            '<head>',
            `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`,
        );
    }
    return html;
}

function hostHtml(containerDimensions: { maxHeight: number; maxWidth: number } | null): string {
    const cd = containerDimensions
        ? `, containerDimensions:${JSON.stringify(containerDimensions)}`
        : '';
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<iframe id="f" sandbox="allow-scripts" style="width:900px;height:0px;border:0;display:block"></iframe>
<script>
  const iframe = document.getElementById('f');
  let view = null;
  window.__sizes = [];
  function send(msg){ view && view.postMessage(msg, '*'); }
  window.addEventListener('message', (ev) => {
    const m = ev.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.method === 'ui/initialize') {
      view = ev.source;
      send({ jsonrpc:'2.0', id:m.id, result:{
        protocolVersion: (m.params && m.params.protocolVersion) || '2026-01-26',
        hostInfo:{ name:'repro-host', version:'0.0.0' }, hostCapabilities:{},
        hostContext:{ theme:'light', displayMode:'inline'${cd} } }});
    } else if (m.method === 'ui/notifications/initialized') {
      send({ jsonrpc:'2.0', method:'ui/notifications/tool-input', params:{ arguments: ${JSON.stringify(ARGS)} }});
      send({ jsonrpc:'2.0', method:'ui/notifications/tool-result', params:{ content:[{ type:'text', text: ${JSON.stringify(LEAN)} }] }});
    } else if (m.method === 'ui/notifications/size-changed') {
      window.__sizes.push(m.params);
      if (m.params && m.params.height != null) iframe.style.height = m.params.height + 'px';
    } else if (m.id && m.method) {
      send({ jsonrpc:'2.0', id:m.id, result:{} });
    }
  });
</script>
</body></html>`;
}

interface WidgetResult {
    docHeight: number;
    rootChildren: number;
    hasSvg: boolean;
    svgHeight: number;
    rootWidth: number;
    viewBox: { w: number; h: number } | null;
    reportedHeights: number[];
    errors: string[];
}

/** Expected fit-width content height for a viewBox at a given width, clamped. */
function expectedHeight(viewBox: { w: number; h: number }, width: number, cap: number): number {
    const fit = Math.ceil(viewBox.h * (width / viewBox.w));
    return Math.min(Math.max(fit, MIN_HEIGHT_PX), Math.max(cap, MIN_HEIGHT_PX));
}

let browser: Browser;

beforeAll(async () => {
    const bundleUrl = new URL('../../mcp/dist/generated/ui-bundle.js', import.meta.url);
    ({ PREVIEW_HTML } = (await import(bundleUrl.href)) as { PREVIEW_HTML: string });
    browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
    await browser?.close();
});

async function renderWidget(
    csp: string | null,
    containerDimensions: { maxHeight: number; maxWidth: number } | null,
): Promise<WidgetResult> {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (msg) => {
        const t = msg.text();
        if (/\[WIDGET-ERROR\]|\[WIDGET-REJECT\]|Content Security Policy|Refused to/.test(t)) {
            errors.push(t);
        }
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.setContent(hostHtml(containerDimensions), { waitUntil: 'load' });
    await page.evaluate((html) => {
        (document.getElementById('f') as HTMLIFrameElement).srcdoc = html;
    }, widgetHtml(csp));
    await page.waitForTimeout(3000);

    const frame = page.frames().find((fr) => fr !== page.mainFrame());
    const dom = frame
        ? await frame.evaluate(() => {
              const root = document.getElementById('nl-preview-root');
              const svg = document.querySelector('#nl-preview-root svg') as SVGSVGElement | null;
              const vb = svg?.viewBox?.baseVal;
              return {
                  docHeight: Math.round(document.documentElement.getBoundingClientRect().height),
                  rootChildren: root ? root.childElementCount : -1,
                  hasSvg: !!svg,
                  svgHeight: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
                  rootWidth: root ? Math.round(root.getBoundingClientRect().width) : 0,
                  viewBox:
                      vb && vb.width > 0 && vb.height > 0 ? { w: vb.width, h: vb.height } : null,
              };
          })
        : {
              docHeight: 0,
              rootChildren: -1,
              hasSvg: false,
              svgHeight: 0,
              rootWidth: 0,
              viewBox: null,
          };
    const reportedHeights = (
        await page.evaluate(() => (window as unknown as { __sizes: { height?: number }[] }).__sizes)
    ).map((s) => s.height ?? 0);

    await page.close();
    return { ...dom, reportedHeights, errors };
}

describe('MCP Apps live preview in a Claude-like sandboxed iframe', () => {
    it('paints and sizes to the diagram (not the container) under strict CSP with a tall maxHeight', async () => {
        // Generous container: the regression is that the iframe must NOT fill it
        // and bury the diagram below the fold — it tracks the diagram height.
        const r = await renderWidget(STRICT_CSP, { maxHeight: 900, maxWidth: 760 });
        expect(r.errors, r.errors.join('\n')).toEqual([]);
        expect(r.rootChildren).toBeGreaterThan(0);
        expect(r.hasSvg).toBe(true);
        expect(r.viewBox, 'diagram viewBox not found').not.toBeNull();

        // Every reported size-changed height is > 0 (the height-0 collapse guard).
        expect(r.reportedHeights.length).toBeGreaterThan(0);
        expect(Math.min(...r.reportedHeights)).toBeGreaterThan(0);

        // The iframe height tracks the diagram's fit-width height, not the 900px
        // container — so the diagram is NOT pushed below the fold.
        const want = expectedHeight(r.viewBox!, r.rootWidth, 900);
        expect(Math.abs(r.docHeight - want)).toBeLessThanOrEqual(2);
        expect(r.docHeight).toBeLessThan(900);

        // The diagram fills the iframe (no large empty band): the SVG occupies
        // essentially the whole content height.
        expect(r.svgHeight).toBeGreaterThan(r.docHeight * 0.9);
    }, 60_000);

    it('caps at the default max and still sizes to content when the host advertises no dimensions', async () => {
        const r = await renderWidget(null, null);
        expect(r.errors, r.errors.join('\n')).toEqual([]);
        expect(r.rootChildren).toBeGreaterThan(0);
        expect(r.hasSvg).toBe(true);
        expect(r.viewBox, 'diagram viewBox not found').not.toBeNull();
        expect(Math.min(...r.reportedHeights)).toBeGreaterThan(0);

        const want = expectedHeight(r.viewBox!, r.rootWidth, DEFAULT_MAX_HEIGHT_PX);
        expect(Math.abs(r.docHeight - want)).toBeLessThanOrEqual(2);
        expect(r.docHeight).toBeLessThanOrEqual(DEFAULT_MAX_HEIGHT_PX);
        expect(r.svgHeight).toBeGreaterThan(r.docHeight * 0.9);
    }, 60_000);
});
