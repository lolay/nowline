import * as http from 'node:http';
import * as path from 'node:path';
import { promises as fs, type FSWatcher, watch as fsWatch } from 'node:fs';
import { defineCommand } from 'citty';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource, getServices } from '../core/parse.js';
import { resolveIncludes } from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { createAssetResolver } from './render.js';
import { formatDiagnostics, type DiagnosticSource } from '../diagnostics/index.js';

export const serveCommand = defineCommand({
    meta: {
        name: 'serve',
        description: 'Serve a live preview of a .nowline file with SSE reload',
    },
    args: {
        input: {
            type: 'positional',
            description: 'Path to .nowline file',
            required: true,
        },
        port: {
            type: 'string',
            description: 'Port to bind (default: 4318)',
            default: '4318',
        },
        host: {
            type: 'string',
            description: 'Host/interface to bind (default: 127.0.0.1)',
            default: '127.0.0.1',
        },
        theme: {
            type: 'string',
            description: 'Initial theme: light or dark',
            default: 'light',
        },
        today: {
            type: 'string',
            description: 'Override today for the now-line (YYYY-MM-DD)',
        },
        'asset-root': {
            type: 'string',
            description: 'Directory from which logo/image assets may be loaded',
        },
    },
    async run({ args }) {
        const port = parseInt(String(args.port ?? '4318'), 10);
        if (!Number.isFinite(port) || port <= 0 || port >= 65536) {
            throw new CliError(ExitCode.InputError, `Invalid --port: ${String(args.port)}`);
        }
        const host = String(args.host ?? '127.0.0.1');
        const themeArg = String(args.theme ?? 'light').toLowerCase();
        if (themeArg !== 'light' && themeArg !== 'dark') {
            throw new CliError(ExitCode.InputError, `Invalid --theme: ${themeArg}`);
        }
        const theme: ThemeName = themeArg;
        const today = parseToday(args.today as string | undefined);

        const inputPath = path.resolve(String(args.input));
        try {
            await fs.access(inputPath);
        } catch {
            throw new CliError(ExitCode.InputError, `File not found: ${String(args.input)}`);
        }

        const assetRoot = args['asset-root']
            ? path.resolve(String(args['asset-root']))
            : path.dirname(inputPath);

        const clients = new Set<http.ServerResponse>();
        let lastPayload: { kind: 'svg'; body: string } | { kind: 'error'; body: string } = {
            kind: 'svg', body: '',
        };

        const rebuild = async (): Promise<void> => {
            try {
                const text = await fs.readFile(inputPath, 'utf-8');
                const parse = await parseSource(text, inputPath, { validate: true });
                if (parse.hasErrors) {
                    const sources = new Map<string, DiagnosticSource>([[inputPath, parse.source]]);
                    const rendered = formatDiagnostics(parse.diagnostics, 'text', sources, { color: false });
                    lastPayload = { kind: 'error', body: rendered };
                    process.stderr.write(`${rendered}\n`);
                    broadcast(clients, 'error', rendered);
                    return;
                }
                const resolved = await resolveIncludes(parse.ast, inputPath, {
                    services: getServices().Nowline,
                });
                if (resolved.diagnostics.some((d) => d.severity === 'error')) {
                    const msg = resolved.diagnostics
                        .filter((d) => d.severity === 'error')
                        .map((d) => `${d.sourcePath}: ${d.message}`)
                        .join('\n');
                    lastPayload = { kind: 'error', body: msg };
                    broadcast(clients, 'error', msg);
                    return;
                }
                const model = layoutRoadmap(parse.ast, resolved, { theme, today });
                const svg = await renderSvg(model, {
                    assetResolver: createAssetResolver(assetRoot),
                    warn: (m) => process.stderr.write(`warning: ${m}\n`),
                });
                lastPayload = { kind: 'svg', body: svg };
                broadcast(clients, 'update', svg);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                lastPayload = { kind: 'error', body: msg };
                process.stderr.write(`error: ${msg}\n`);
                broadcast(clients, 'error', msg);
            }
        };

        await rebuild();

        const watcher = watchFile(inputPath, rebuild);
        const server = http.createServer((req, res) => {
            const url = req.url ?? '/';
            if (url === '/' || url === '/index.html') {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(shellHtml(theme));
                return;
            }
            if (url === '/svg') {
                res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' });
                res.end(lastPayload.kind === 'svg' ? lastPayload.body : emptySvg);
                return;
            }
            if (url === '/events') {
                res.writeHead(200, {
                    'content-type': 'text/event-stream',
                    'cache-control': 'no-cache, no-transform',
                    connection: 'keep-alive',
                });
                clients.add(res);
                res.write(`event: hello\ndata: connected\n\n`);
                const initialEvent = lastPayload.kind === 'svg' ? 'update' : 'error';
                sendEvent(res, initialEvent, lastPayload.body);
                req.on('close', () => {
                    clients.delete(res);
                });
                return;
            }
            res.writeHead(404);
            res.end('not found');
        });

        await new Promise<void>((resolve) => {
            server.listen(port, host, () => resolve());
        });
        process.stdout.write(`nowline serve: http://${host}:${port}\n`);

        const shutdown = async (): Promise<void> => {
            watcher.close();
            for (const c of clients) {
                try { c.end(); } catch { /* ignore */ }
            }
            clients.clear();
            server.close();
        };
        process.once('SIGINT', () => { void shutdown().then(() => process.exit(0)); });
        process.once('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });

        // Keep the process alive until a signal.
        await new Promise<void>(() => {});
    },
});

function parseToday(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) throw new CliError(ExitCode.InputError, `Invalid --today: ${raw}`);
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
}

function sendEvent(res: http.ServerResponse, event: string, data: string): void {
    const lines = data.split('\n').map((l) => `data: ${l}`).join('\n');
    res.write(`event: ${event}\n${lines}\n\n`);
}

function broadcast(clients: Set<http.ServerResponse>, event: string, data: string): void {
    for (const c of clients) {
        try {
            sendEvent(c, event, data);
        } catch {
            clients.delete(c);
        }
    }
}

function watchFile(target: string, onChange: () => Promise<void>): FSWatcher {
    let timer: NodeJS.Timeout | undefined;
    const w = fsWatch(target, { persistent: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void onChange(); }, 75);
    });
    return w;
}

const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60"><text x="10" y="30" font-family="system-ui" font-size="14" fill="#999">no output yet</text></svg>';

function shellHtml(theme: ThemeName): string {
    const bg = theme === 'dark' ? '#121212' : '#ffffff';
    const fg = theme === 'dark' ? '#e0e0e0' : '#212121';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>nowline serve</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${bg}; color: ${fg}; font-family: system-ui, -apple-system, sans-serif; }
  #root { padding: 12px; }
  #error { display: none; position: fixed; bottom: 0; left: 0; right: 0; padding: 12px; background: rgba(183,28,28,0.9); color: white; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; max-height: 40%; overflow: auto; }
  #error.show { display: block; }
  #root svg { max-width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<div id="root"></div>
<pre id="error"></pre>
<script>
(function(){
  var root = document.getElementById('root');
  var errBox = document.getElementById('error');
  function show(svg){
    root.innerHTML = svg;
    errBox.className = '';
    errBox.textContent = '';
  }
  function err(msg){
    errBox.textContent = msg;
    errBox.className = 'show';
  }
  fetch('/svg').then(function(r){ return r.text(); }).then(show).catch(function(e){ err(String(e)); });
  var ev = new EventSource('/events');
  ev.addEventListener('update', function(e){ show(e.data); });
  ev.addEventListener('error', function(e){
    if (e.data) err(e.data);
  });
})();
</script>
</body>
</html>
`;
}
