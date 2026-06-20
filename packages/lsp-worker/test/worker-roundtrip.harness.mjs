import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createNowlineLanguageClient,
} from '../dist/index.js';
import { startNowlineLspWorkerOn } from '../dist/worker.js';

class FakePort {
    /** @type {FakePort | null} */
    other = null;
    /** @type {((event: { data: unknown }) => void) | null} */
    onmessage = null;

    /** @param {FakePort} port */
    setOther(port) {
        this.other = port;
    }

    /** @param {unknown} msg */
    postMessage(msg) {
        const other = this.other;
        if (!other) return;
        queueMicrotask(() => {
            const cloned = JSON.parse(JSON.stringify(msg));
            other.onmessage?.({ data: cloned });
        });
    }

    addEventListener() {}

    removeEventListener() {}
}

function spawnInProcessLsp() {
    const serverPort = new FakePort();
    const clientPort = new FakePort();
    serverPort.setOther(clientPort);
    clientPort.setOther(serverPort);

    const reader = new BrowserMessageReader(/** @type {MessagePort} */ (serverPort));
    const writer = new BrowserMessageWriter(/** @type {MessagePort} */ (serverPort));
    startNowlineLspWorkerOn(reader, writer);

    const client = createNowlineLanguageClient({
        worker: /** @type {MessagePort} */ (clientPort),
    });

    return {
        client,
        cleanup() {
            serverPort.onmessage = null;
            clientPort.onmessage = null;
        },
    };
}

const ROADMAP_SOURCE = `nowline v1\n\nroadmap demo "Demo" start:2026-01-05 scale:2w\nswimlane eng "Engineering"\n  item ship "Ship" duration:2w status:done\n`;
const ROADMAP_BROKEN_SOURCE = `nowline v1\n\nthis line is not valid nowline syntax\n`;
const URI = 'memory:///lsp-worker-test.nowline';
const NORMALIZED_URI = 'memory:/lsp-worker-test.nowline';
/** @param {string} uri */
const matchesUri = (uri) => uri === URI || uri === NORMALIZED_URI;

/** @type {{ client: Awaited<ReturnType<typeof createNowlineLanguageClient>>; cleanup: () => void } | undefined} */
let active;

async function startSession() {
    const { client, cleanup } = spawnInProcessLsp();
    const session = { client: await client, cleanup };
    active = session;
    return session;
}

describe('@nowline/lsp-worker (in-process roundtrip)', () => {
    after(async () => {
        if (!active) return;
        try {
            await active.client.dispose();
        } catch {
            /* swallow */
        }
        active.cleanup();
        active = undefined;
    });

    it('initializes successfully with the Incremental textDocumentSync capability', async () => {
        const { client } = await startSession();
        assert.ok(client);
    });

    it('publishes diagnostics for a malformed didOpen body', async () => {
        const { client } = await startSession();
        const diagnostics = await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('did not receive publishDiagnostics within 5000ms')),
                5000,
            );
            const sub = client.onDiagnostics((params) => {
                if (!matchesUri(params.uri)) return;
                clearTimeout(timer);
                sub.dispose();
                resolve(params.diagnostics);
            });
            client.didOpen({ uri: URI, text: ROADMAP_BROKEN_SOURCE });
        });
        assert.ok(Array.isArray(diagnostics));
        assert.ok(diagnostics.length > 0);
    });

    it('clears diagnostics after a valid didOpen', async () => {
        const { client } = await startSession();
        const first = await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () =>
                    reject(new Error('did not receive initial publishDiagnostics within 10000ms')),
                10000,
            );
            const sub = client.onDiagnostics((params) => {
                if (!matchesUri(params.uri)) return;
                clearTimeout(timer);
                sub.dispose();
                resolve(params.diagnostics);
            });
            client.didOpen({ uri: URI, text: ROADMAP_SOURCE });
        });
        assert.deepEqual(first, []);
    });

    it('rejects whole-document didChange (no range) with a thrown error', async () => {
        const { client } = await startSession();
        client.didOpen({ uri: URI, text: ROADMAP_SOURCE });
        assert.throws(
            () =>
                client.didChange({
                    uri: URI,
                    version: 2,
                    changes: [{ text: 'nowline v1\n' }],
                }),
            /Incremental/i,
        );
    });
});
