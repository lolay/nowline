import { afterEach, describe, expect, it } from 'vitest';
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    createNowlineLanguageClient,
    type NowlineLanguageClient,
} from '../src/index.js';
import { startNowlineLspWorkerOn } from '../src/worker.js';

/**
 * happy-dom ships stub `MessagePort` / `MessageChannel` whose
 * `postMessage` is a no-op (see lib/event/MessagePort.js — every
 * method body is a TODO). We can't drive the LSP wire over those, so
 * the tests use a hand-rolled in-memory port pair instead. Two
 * `FakePort` instances form a pipe: posting on one fires the other's
 * `onmessage` handler. That's the entire surface the
 * `BrowserMessageReader` / `BrowserMessageWriter` pair from
 * `vscode-jsonrpc/browser` actually exercise.
 */
class FakePort {
    private other: FakePort | null = null;
    public onmessage: ((event: { data: unknown }) => void) | null = null;

    setOther(p: FakePort): void {
        this.other = p;
    }

    postMessage(msg: unknown): void {
        const other = this.other;
        if (!other) return;
        // Async delivery to mirror real MessagePort semantics — the LSP
        // request/response machinery relies on the queue being processed
        // off the synchronous call stack.
        queueMicrotask(() => {
            // Round-trip through JSON so the receiver gets a fresh
            // structure (matches postMessage's structured-clone contract).
            const cloned = JSON.parse(JSON.stringify(msg));
            other.onmessage?.({ data: cloned });
        });
    }

    addEventListener(): void {
        /* BrowserMessageReader/Writer only listen for 'error'; we never emit it. */
    }

    removeEventListener(): void {
        /* no-op */
    }
}

function spawnInProcessLsp(): { client: Promise<NowlineLanguageClient>; cleanup: () => void } {
    const serverPort = new FakePort();
    const clientPort = new FakePort();
    serverPort.setOther(clientPort);
    clientPort.setOther(serverPort);

    const reader = new BrowserMessageReader(serverPort as unknown as MessagePort);
    const writer = new BrowserMessageWriter(serverPort as unknown as MessagePort);
    startNowlineLspWorkerOn(reader, writer);

    const client = createNowlineLanguageClient({
        worker: clientPort as unknown as MessagePort,
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

// Both the canonical three-slash form (what callers write) and the
// single-slash form the server normalizes to via `URI.parse` round-trip.
const URI = 'memory:///lsp-worker-test.nowline';
const NORMALIZED_URI = 'memory:/lsp-worker-test.nowline';
const matchesUri = (uri: string): boolean => uri === URI || uri === NORMALIZED_URI;

interface ActiveSession {
    client: NowlineLanguageClient;
    cleanup: () => void;
}

let active: ActiveSession | undefined;

async function startSession(): Promise<ActiveSession> {
    const { client, cleanup } = spawnInProcessLsp();
    const session: ActiveSession = { client: await client, cleanup };
    active = session;
    return session;
}

describe('@nowline/lsp-worker (in-process roundtrip)', () => {
    afterEach(async () => {
        if (active) {
            try {
                await active.client.dispose();
            } catch {
                /* swallow */
            }
            active.cleanup();
            active = undefined;
        }
    });

    it('initializes successfully with the Incremental textDocumentSync capability', async () => {
        // createNowlineLanguageClient throws if sync isn't Incremental;
        // a clean startSession() is the assertion.
        const { client } = await startSession();
        expect(client).toBeDefined();
    });

    it('publishes diagnostics for a malformed didOpen body', async () => {
        const { client } = await startSession();
        const diagnostics = await new Promise<unknown>((resolve, reject) => {
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
        expect(Array.isArray(diagnostics)).toBe(true);
        expect((diagnostics as unknown[]).length).toBeGreaterThan(0);
    }, 15000);

    it('clears diagnostics after a valid didOpen', async () => {
        const { client } = await startSession();
        const first = await new Promise<unknown[]>((resolve, reject) => {
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
        expect(first).toEqual([]);
    }, 15000);

    it('rejects whole-document didChange (no range) with a thrown error', async () => {
        const { client } = await startSession();
        client.didOpen({ uri: URI, text: ROADMAP_SOURCE });
        expect(() =>
            client.didChange({
                uri: URI,
                version: 2,
                // No `range` — caller is attempting whole-document semantics.
                // @ts-expect-error verifying the runtime guard.
                changes: [{ text: 'nowline v1\n' }],
            }),
        ).toThrow(/Incremental/i);
    });
});
