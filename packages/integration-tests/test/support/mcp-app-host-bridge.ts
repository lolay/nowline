// Browser-side host harness for MCP Apps e2e tests.
// Bundled to an IIFE and injected into Playwright pages so the official
// AppBridge + PostMessageTransport drive the widget handshake (not hand-rolled JSON-RPC).

/// <reference lib="dom" />

import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

export interface MountOptions {
    args: Record<string, unknown>;
    leanPayload: string;
    containerDimensions: { maxHeight: number; maxWidth: number } | null;
    theme?: 'light' | 'dark';
}

declare global {
    interface Window {
        __sizes: { height?: number; width?: number }[];
        __startNowlineBridge: (iframe: HTMLIFrameElement, options: MountOptions) => Promise<void>;
        __awaitNowlineBridge: () => Promise<void>;
    }
}

let initializedPromise: Promise<void> | undefined;

window.__sizes = [];

window.__startNowlineBridge = async (iframe, options) => {
    window.__sizes = [];

    // AppBridge.connect() only attaches the transport when `_client` is non-null
    // (see ext-apps app-bridge.ts). A stub is enough for hand-fed tool input/result.
    const stubClient = {
        getServerCapabilities: () => ({}),
    };

    const hostContext: {
        theme: 'light' | 'dark';
        displayMode: 'inline';
        containerDimensions?: { maxHeight: number; maxWidth: number };
    } = {
        theme: options.theme ?? 'light',
        displayMode: 'inline',
    };
    if (options.containerDimensions) {
        hostContext.containerDimensions = options.containerDimensions;
    }

    const bridge = new AppBridge(
        stubClient as never,
        { name: 'repro-host', version: '0.0.0' },
        { openLinks: {}, serverTools: {}, logging: {} },
        { hostContext },
    );

    bridge.addEventListener('sizechange', (params) => {
        window.__sizes.push(params);
        if (params.height != null) {
            iframe.style.height = `${params.height}px`;
        }
    });

    initializedPromise = new Promise<void>((resolve, reject) => {
        bridge.addEventListener('initialized', () => {
            void bridge
                .sendToolInput({ arguments: options.args })
                .then(() =>
                    bridge.sendToolResult({
                        content: [{ type: 'text', text: options.leanPayload }],
                    }),
                )
                .then(() => resolve())
                .catch(reject);
        });
    });

    const contentWindow = iframe.contentWindow;
    if (!contentWindow) {
        throw new Error('iframe contentWindow unavailable');
    }

    const transport = new PostMessageTransport(contentWindow, contentWindow);
    await bridge.connect(transport);
};

window.__awaitNowlineBridge = async () => {
    if (!initializedPromise) {
        throw new Error('__startNowlineBridge must run before __awaitNowlineBridge');
    }
    await initializedPromise;
};
