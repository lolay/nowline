#!/usr/bin/env node

// Smoke test: load the bundled extension entry (dist/extension.cjs) with a
// stubbed `vscode` module and run activate(), asserting that it loads without
// throwing and registers its commands. Exits non-zero on failure so CI /
// pre-commit catches an extension that crashes at module-load or activation.
//
// This guards the class of bug where an ESM dependency uses a top-level
// `import.meta.url` (rewritten to undefined when esbuild bundles to CJS) and
// throws at require() time — which manifests in the editor as
// "Activating extension 'nowline.vscode-nowline' failed" plus "command ... not
// found". The server bundle is covered by smoke-server.mjs; this covers the
// extension bundle.

import { existsSync } from 'node:fs';
import Module from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundlePath = resolve(root, 'dist', 'extension.cjs');

if (!existsSync(bundlePath)) {
    console.error(`extension bundle not found: ${bundlePath}`);
    console.error('run `pnpm --filter ./packages/vscode-extension build` first');
    process.exit(1);
}

// A "universal" value: usable as a class to extend, a constructor, a function,
// or an enum object. Any vscode API surface the extension touches that we did
// not concretely stub resolves to this, so only genuine extension errors fail
// the smoke test.
function makeUniversal() {
    const fn = function universal() {
        return makeUniversal();
    };
    return new Proxy(fn, {
        get(_t, prop) {
            if (prop === 'prototype') return fn.prototype;
            if (prop === 'then') return undefined; // not a thenable
            if (prop === Symbol.toPrimitive) return () => 0;
            if (prop === 'dispose') return () => {};
            return makeUniversal();
        },
        construct() {
            return makeUniversal();
        },
        apply() {
            return makeUniversal();
        },
    });
}

const disposable = { dispose() {} };
const noopEvent = () => disposable;

// Concrete members must be own enumerable properties: esbuild's `__toESM`
// interop snapshots own keys at require() time, so a bare Proxy fallback would
// be lost for things like `vscode.EventEmitter`.
const base = {
    version: '1.105.0',
    env: { language: 'en-US' },
    window: {
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
        showErrorMessage() {},
        showInformationMessage() {},
        onDidChangeActiveColorTheme: noopEvent,
        activeTextEditor: undefined,
        visibleTextEditors: [],
        showTextDocument: async () => ({}),
        setStatusBarMessage() {},
    },
    commands: {
        registered: [],
        registerCommand(id) {
            base.commands.registered.push(id);
            return disposable;
        },
        executeCommand: async () => undefined,
    },
    workspace: {
        createFileSystemWatcher: () => ({
            onDidCreate: noopEvent,
            onDidChange: noopEvent,
            onDidDelete: noopEvent,
            dispose() {},
        }),
        getConfiguration: () => ({ get: () => undefined }),
        onDidChangeTextDocument: noopEvent,
        onDidSaveTextDocument: noopEvent,
        onDidChangeConfiguration: noopEvent,
        textDocuments: [],
        fs: { writeFile: async () => {} },
    },
    EventEmitter: class EventEmitter {
        constructor() {
            this.event = noopEvent;
        }
        fire() {}
        dispose() {}
    },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
    ViewColumn: { Active: -1, Beside: -2, One: 1 },
    Range: class Range {},
    Selection: class Selection {},
    Disposable: class Disposable {
        dispose() {}
    },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    ThemeColor: class ThemeColor {},
};

function wrap(obj) {
    return new Proxy(obj, {
        get(target, prop, receiver) {
            if (prop in target) {
                const val = Reflect.get(target, prop, receiver);
                if (val && typeof val === 'object' && !Array.isArray(val)) return wrap(val);
                return val;
            }
            if (typeof prop === 'symbol') return undefined;
            return makeUniversal();
        },
    });
}

const vscodeStub = wrap(base);

const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === 'vscode') return vscodeStub;
    return origLoad.call(this, request, ...rest);
};

// ESM has no global `require`; build one (it routes through the patched _load).
const require = Module.createRequire(import.meta.url);

let ext;
try {
    ext = require(bundlePath);
} catch (err) {
    console.error('extension bundle failed to load (require threw):');
    console.error(err?.stack ?? err);
    process.exit(1);
}

if (typeof ext.activate !== 'function') {
    console.error('extension bundle does not export activate()');
    process.exit(1);
}

const context = {
    subscriptions: [],
    extensionPath: root,
    asAbsolutePath: (p) => join(root, p),
};

try {
    ext.activate(context);
} catch (err) {
    console.error('activate() threw:');
    console.error(err?.stack ?? err);
    process.exit(1);
}

const required = ['nowline.openPreview', 'nowline.openPreviewToSide', 'nowline.export'];
const missing = required.filter((id) => !base.commands.registered.includes(id));
if (missing.length > 0) {
    console.error(`activate() did not register expected commands: ${missing.join(', ')}`);
    console.error(`registered: ${base.commands.registered.join(', ') || '(none)'}`);
    process.exit(1);
}

console.log(`activate ok — bundle loaded, ${base.commands.registered.length} commands registered`);
// The LanguageClient spawns a server child and keeps handles open; activation
// is proven, so exit deterministically instead of hanging.
process.exit(0);
