// Shared HTML template functions for the embed CDN demo pages.
//
// Both dev (single `latest/` directory) and prod (multi-version `X.Y.Z/`
// directories) call these with their respective version sets. Keeping the
// templates here means the rendered HTML is byte-for-byte identical whether
// it came from a dev build or a prod build with the same version.
//
// Exports:
//   escapeHtml(s)                                      → HTML-escaped string
//   renderRootIndex({ versions, builtAt, sha, baseUrl,
//                     aliases?, showChannels? })      → HTML string
//   renderDemo({ version, builtAt })                   → HTML string
//
// Dev caller (bundle.mjs):   versions=['latest'], no aliases, showChannels=false
//                             baseUrl='https://embed.nowline.dev'
// Prod caller (gen-index.mjs): versions=[X.Y.Z, ...] (patches, desc),
//                              aliases=Map<alias,target> (latest + X.Y keys)
//                              baseUrl='https://embed.nowline.io'
//
// When `aliases` is absent the flat-list dev rendering is used unchanged.
// When `aliases` is present the root index groups versions by minor, annotates
// alias entries (e.g. "latest → 0.4.2"), and indents concrete patch rows.

// The canonical sample embedded in every per-version demo page. Kept here
// so both dev and prod demos render the same content from the same source.
const SAMPLE_SRC = `\
nowline v1

roadmap minimal "Starter" start:2026-01-05 scale:2w author:"Jane Doe"

swimlane engineering "Engineering"
  parallel concurrent-block style:concurrent
    group research-group "Research"
      item research "Research"  duration:3w status:done
      item design   "Design"    duration:2w status:in-progress remaining:5d
      item build    "Build"     duration:3w status:planned
    group release-group "Release"
      item release  "Release"   duration:1w status:planned
      item deploy   "Deploy"    duration:1w status:planned`;

export function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Pre-paint theme init — mirrors nowline-site BaseLayout.astro and the Free
// app's theme/index.ts. Shares the `starlight-theme` localStorage key so the
// contract matches across Nowline surfaces (even though embed.* is a separate
// origin and does not literally share storage with nowline.io).
const THEME_INIT_SCRIPT = `\
    (function () {
      try {
        var stored = localStorage.getItem('starlight-theme');
        var theme =
          stored === 'light' || stored === 'dark'
            ? stored
            : window.matchMedia('(prefers-color-scheme: light)').matches
              ? 'light'
              : 'dark';
        document.documentElement.dataset.theme = theme;
      } catch (e) {
        document.documentElement.dataset.theme = 'light';
      }
    })();`;

// Theme picker + system-preference listener — runs after DOM is ready.
const THEME_SELECT_SCRIPT = `\
    (function () {
      var STORAGE_KEY = 'starlight-theme';
      var select = document.querySelector('[data-theme-select]');
      if (!select) return;

      function parseTheme(value) {
        return value === 'auto' || value === 'dark' || value === 'light' ? value : 'auto';
      }

      function loadTheme() {
        try {
          var stored = localStorage.getItem(STORAGE_KEY);
          return stored === 'light' || stored === 'dark' ? stored : 'auto';
        } catch (e) {
          return 'auto';
        }
      }

      function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }

      function applyTheme(theme) {
        try {
          localStorage.setItem(STORAGE_KEY, theme === 'light' || theme === 'dark' ? theme : '');
        } catch (e) {}
        document.documentElement.dataset.theme = theme === 'auto' ? getSystemTheme() : theme;
      }

      select.value = loadTheme();
      select.addEventListener('change', function () {
        applyTheme(parseTheme(select.value));
      });

      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (loadTheme() === 'auto') applyTheme('auto');
      });
    })();`;

const THEME_SELECT_HTML = `\
    <label class="theme-select" aria-label="Theme">
      <span class="visually-hidden">Theme</span>
      <select data-theme-select>
        <option value="auto">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>`;

// Shared CSS used by both the root index and per-version demo pages.
// CSS custom properties + data-theme for light/dark; no external requests.
const BASE_STYLES = `\
    :root {
      --color-bg: #fafafa;
      --color-text: #1d1d1f;
      --color-muted: #6e6e73;
      --color-card: #fff;
      --color-border: #d2d2d7;
      --color-divider: #e0e0e5;
      --color-link: #0066cc;
      --color-pre-bg: #f5f5f7;
      --color-result-bg: #fff;
    }
    :root[data-theme="dark"] {
      --color-bg: #1d1d1f;
      --color-text: #f5f5f7;
      --color-muted: #98989d;
      --color-card: #2c2c2e;
      --color-border: #48484a;
      --color-divider: #48484a;
      --color-link: #64b5ff;
      --color-pre-bg: #1c1c1e;
      --color-result-bg: #2c2c2e;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: var(--color-bg); color: var(--color-text);
      font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 40px;
    }
    .page-header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
    .card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 24px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9em;
    }
    footer { margin-top: 48px; font-size: 12px; color: var(--color-muted); }
    footer a { color: var(--color-link); }
    .theme-select {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 2px 8px;
      color: var(--color-muted);
      font-size: 12px;
      flex-shrink: 0;
    }
    .theme-select:hover,
    .theme-select:focus-within {
      color: var(--color-text);
      background: var(--color-pre-bg);
    }
    .theme-select select {
      appearance: none;
      background: transparent;
      border: 0;
      color: inherit;
      font: inherit;
      padding: 0;
      cursor: pointer;
      outline: none;
    }
    .theme-select select:focus-visible {
      outline: 2px solid var(--color-link);
      outline-offset: 2px;
      border-radius: 4px;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }`;

// Renders a single version-list item. Used by both flat and grouped modes.
// `annotation` is an already-escaped string like " → 0.4.2", or empty.
// `isIndented` adds the `version-patch` class so patch rows are visually
// nested under their minor alias.
function makeVersionRow(version, baseUrl, annotation, isIndented) {
    const v = escapeHtml(version);
    const cls = `version-item${isIndented ? ' version-patch' : ''}`;
    const annotSpan = annotation ? `<span class="alias-target">${annotation}</span>` : '';
    return `        <li class="${cls}">
          <a href="./${v}/">${v}</a>${annotSpan}
          <span class="hint"><code>&lt;script src="${escapeHtml(baseUrl)}/${v}/nowline.min.js"&gt;&lt;/script&gt;</code></span>
        </li>`;
}

/**
 * Root index page — lists every hosted directory with a link to its demo page.
 *
 * @param {object}              opts
 * @param {string[]}            opts.versions  In flat mode (dev): all dirs in
 *   display order. In grouped mode (prod): X.Y.Z patch dirs only, descending.
 * @param {string}              opts.builtAt   ISO timestamp baked into the footer
 * @param {string}              opts.sha       Short git SHA baked into the footer
 * @param {string}              opts.baseUrl   CDN origin for copy-paste snippets
 * @param {Map<string,string>}  [opts.aliases] Optional: alias → target mapping
 *   (e.g. `new Map([['latest','0.4.2'],['0.4','0.4.2']])`). When present,
 *   renders grouped display (alias entries annotated, patches indented under
 *   their minor group). When absent, renders flat list (dev default).
 * @param {boolean}             [opts.showChannels=true] When false, omits the
 *   Channels explainer card (used on embed.nowline.dev where only `latest` exists).
 * @returns {string} Full HTML document
 */
export function renderRootIndex({ versions, builtAt, sha, baseUrl, aliases, showChannels = true }) {
    let versionRows;
    if (aliases) {
        // Grouped prod display: latest → minor groups → indented patches.
        const rows = [];

        // latest alias first
        const latestTarget = aliases.get('latest');
        if (latestTarget) {
            rows.push(
                makeVersionRow('latest', baseUrl, ` \u2192 ${escapeHtml(latestTarget)}`, false),
            );
        }

        // Minor groups in order of first appearance (gen-index passes desc-sorted
        // patches, so the first patch in each minor is the highest).
        const minorGroups = new Map(); // minor key -> X.Y.Z[]
        for (const v of versions) {
            const [maj, min] = v.split('.');
            const key = `${maj}.${min}`;
            if (!minorGroups.has(key)) minorGroups.set(key, []);
            minorGroups.get(key).push(v);
        }

        for (const [minor, patches] of minorGroups) {
            const target = aliases.get(minor);
            const annotation = target ? ` \u2192 ${escapeHtml(target)}` : '';
            rows.push(makeVersionRow(minor, baseUrl, annotation, false));
            for (const patch of patches) {
                rows.push(makeVersionRow(patch, baseUrl, '', true));
            }
        }

        versionRows = rows.join('\n');
    } else {
        // Flat dev display — original behaviour, unchanged.
        versionRows = versions.map((v) => makeVersionRow(v, baseUrl, '', false)).join('\n');
    }

    // Static channel explainer — educational; not driven by which dirs exist.
    const channelRows = [
        [
            'latest',
            'Always the most recent build. Suitable for development; do not pin in production.',
        ],
        ['X.Y', 'Rolls within the minor (auto-applies patches). Reasonable production default.'],
        ['X.Y.Z', 'Exact patch — fully immutable. Use for audited deployments.'],
    ]
        .map(
            ([ch, desc]) =>
                `          <tr><td><code>${escapeHtml(ch)}</code></td><td>${escapeHtml(desc)}</td></tr>`,
        )
        .join('\n');

    const channelsCard = showChannels
        ? `
    <div class="card">
      <h2>Channels</h2>
      <table>
        <thead><tr><th>Channel</th><th>Description</th></tr></thead>
        <tbody>
${channelRows}
        </tbody>
      </table>
    </div>`
        : '';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Nowline Embed CDN</title>
    <script>${THEME_INIT_SCRIPT}</script>
    <style>
${BASE_STYLES}
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--color-divider); }
      th { font-weight: 600; font-size: 13px; color: var(--color-muted); }
      tr:last-child td { border-bottom: none; }
      ul.version-list { margin: 0; padding: 0; list-style: none; }
      li.version-item { padding: 10px 0; border-bottom: 1px solid var(--color-divider); }
      li.version-item:last-child { border-bottom: none; }
      li.version-item a { font-weight: 600; text-decoration: none; color: var(--color-link); }
      li.version-item a:hover { text-decoration: underline; }
      li.version-patch { padding-left: 24px; }
      li.version-patch a { font-weight: 400; }
      .alias-target { font-size: 13px; color: var(--color-muted); margin-left: 6px; }
      .hint { display: block; font-size: 12px; color: var(--color-muted); margin-top: 2px; }
      footer code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <div class="page-header">
      <h1>Nowline Embed CDN</h1>
${THEME_SELECT_HTML}
    </div>
${channelsCard}

    <div class="card">
      <h2>Available versions</h2>
      <ul class="version-list">
${versionRows}
      </ul>
    </div>

    <footer>sha: ${escapeHtml(sha ?? 'unknown')} &middot; built: ${escapeHtml(builtAt)}</footer>
    <script>${THEME_SELECT_SCRIPT}</script>
  </body>
</html>`;
}

/**
 * Per-version demo page — loads the sibling bundle and renders a sample.
 *
 * Layout: Snippet (escaped, not picked up by the embed) then Result (live,
 * rendered by the embed). The `src` shown in the snippet is filled at runtime
 * so it reflects the actual absolute URL regardless of origin.
 *
 * @param {object} opts
 * @param {string} opts.version  Directory name (e.g. 'latest' or '0.4.1')
 * @param {string} opts.builtAt  ISO timestamp baked into the bundle caption
 * @returns {string} Full HTML document
 */
export function renderDemo({ version, builtAt }) {
    const escapedSample = escapeHtml(SAMPLE_SRC);
    const escapedVersion = escapeHtml(version);
    const escapedBuiltAt = escapeHtml(builtAt);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Nowline Embed Demo \u2014 ${escapedVersion}</title>
    <script>${THEME_INIT_SCRIPT}</script>
    <style>
${BASE_STYLES}
      pre {
        margin: 0;
        padding: 14px 16px;
        background: var(--color-pre-bg);
        border-radius: 7px;
        font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre;
        overflow-x: auto;
      }
      .result-area {
        padding: 16px;
        background: var(--color-result-bg);
        border: 1px dashed var(--color-border);
        border-radius: 7px;
        overflow: auto;
      }
      .result-area svg { max-width: 100%; height: auto; }
      .caption {
        margin: 12px 0 0;
        font-size: 12px;
        color: var(--color-muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    </style>
    <script src="./nowline.min.js"></script>
    <script>nowline.initialize({ startOnLoad: true });</script>
  </head>
  <body>
    <div class="page-header">
      <h1>Nowline Embed Demo</h1>
${THEME_SELECT_HTML}
    </div>

    <div class="card">
      <h2>Snippet</h2>
      <!-- NOT class="language-nowline" — the embed selector must not pick this up. -->
      <pre><code>&lt;script src="<span id="script-src"></span>"&gt;&lt;/script&gt;

\`\`\`nowline
${escapedSample}
\`\`\`</code></pre>
    </div>

    <div class="card">
      <h2>Result</h2>
      <div class="result-area">
        <pre><code class="language-nowline">${escapedSample}</code></pre>
      </div>
      <p class="caption" id="bundle-caption">Loading&hellip;</p>
    </div>

    <footer>
      <a href="../">&larr; back to index</a>
    </footer>

    <script>
      // Fill the snippet's script-src span with the resolved absolute URL so
      // it shows the real CDN path regardless of where this page is served.
      document.getElementById('script-src').textContent =
        new URL('./nowline.min.js', location.href).href;

      // Show runtime bundle provenance after the embed loads. version + sha
      // come from the bundle itself; builtAt is baked in at generation time.
      window.addEventListener('load', function () {
        var v = window.nowline ? window.nowline.version : '?';
        var s = window.nowline ? window.nowline.sha : '?';
        document.getElementById('bundle-caption').textContent =
          'version: ' + v + ' \u00b7 sha: ' + s + ' \u00b7 built: ${escapedBuiltAt}';
      });
    </script>
    <script>${THEME_SELECT_SCRIPT}</script>
  </body>
</html>`;
}
