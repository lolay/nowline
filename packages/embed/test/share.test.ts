import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildShareLink, DEFAULT_SHARE_BASE, encodeText } from '../src/share.js';

// ---------------------------------------------------------------------------
// encodeText — round-trip + wire-format assertions
// ---------------------------------------------------------------------------

describe('encodeText', () => {
    it('round-trips through unzlibSync', () => {
        const source = 'roadmap alpha "Hello" start:2026-01-01 scale:1w\n';
        const fragment = encodeText(source);
        expect(fragment.startsWith('#text=')).toBe(true);

        // Reverse: base64url → standard base64 → bytes → unzlib → UTF-8
        const b64 = fragment.slice('#text='.length).replace(/-/g, '+').replace(/_/g, '/');
        // Restore padding
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(unzlibSync(bytes));
        expect(decoded).toBe(source);
    });

    it('produces valid RFC 1950 zlib header bytes (CMF=0x78)', () => {
        // RFC 1950 §2.2: CMF byte 0x78 = deflate with 32 KB window (the most
        // common fflate default). The first byte of the zlib stream must be
        // 0x78 so that native CompressionStream('deflate') decoders and third-
        // party receivers interoperate without wire-format changes.
        const source = 'hello';
        const fragment = encodeText(source);
        const b64 = fragment.slice('#text='.length).replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        // CMF = 0x78 (deflate, window=32KB), FLG makes CMF*256+FLG divisible by 31
        expect(bytes[0]).toBe(0x78);
        // The second byte (FLG) together with CMF must satisfy the divisibility-by-31 check.
        expect((bytes[0] * 256 + bytes[1]) % 31).toBe(0);
    });

    it('uses base64url encoding (no +, /, or = characters)', () => {
        // Try several inputs to hit the character replacements
        const sources = ['short', 'a'.repeat(1000), 'roadmap r "R" start:2026-01-05 scale:2w\n'];
        for (const s of sources) {
            const payload = encodeText(s).slice('#text='.length);
            expect(payload).not.toMatch(/[+/=]/);
        }
    });

    it('produces deterministic output for the same input', () => {
        const source = 'hello world';
        expect(encodeText(source)).toBe(encodeText(source));
    });
});

// ---------------------------------------------------------------------------
// buildShareLink — share matrix
// ---------------------------------------------------------------------------

describe('buildShareLink — share: true (default)', () => {
    it('uses DEFAULT_SHARE_BASE and appends #text= fragment', () => {
        const source = 'hello';
        const url = buildShareLink({ source, share: true });
        expect(url).not.toBeNull();
        expect(url!.startsWith(DEFAULT_SHARE_BASE)).toBe(true);
        expect(url!).toContain('#text=');
    });

    it('returns a parseable URL', () => {
        const url = buildShareLink({ source: 'hi', share: true });
        expect(() => new URL(url!)).not.toThrow();
    });
});

describe('buildShareLink — share: string (custom base URL)', () => {
    it('uses the custom base and appends the fragment', () => {
        const base = 'https://editor.example.com';
        const url = buildShareLink({ source: 'hi', share: base });
        expect(url).not.toBeNull();
        expect(url!.startsWith(base)).toBe(true);
        expect(url!).toContain('#text=');
    });

    it('preserves an existing path in the base URL', () => {
        const base = 'https://foo.com/open';
        const url = buildShareLink({ source: 'hi', share: base });
        expect(url).not.toBeNull();
        // Path must survive; fragment is appended after the path
        expect(url!.startsWith('https://foo.com/open#')).toBe(true);
    });

    it('uses #url= when sourceUrl is an https URL', () => {
        const base = 'https://editor.example.com';
        const sourceUrl = 'https://raw.example.com/roadmap.nowline';
        const url = buildShareLink({ source: 'hi', share: base, sourceUrl });
        expect(url).not.toBeNull();
        expect(url!).toContain('#url=');
        expect(url!).not.toContain('#text=');
    });

    it('falls back to #text= when sourceUrl is not https', () => {
        const base = 'https://editor.example.com';
        const url = buildShareLink({
            source: 'hi',
            share: base,
            sourceUrl: 'http://insecure.com/r.nowline',
        });
        expect(url!).toContain('#text=');
        expect(url!).not.toContain('#url=');
    });
});

describe('buildShareLink — share: false / "none"', () => {
    it('returns null for share: false', () => {
        expect(buildShareLink({ source: 'hi', share: false })).toBeNull();
    });

    it('returns null for share: "none"', () => {
        expect(buildShareLink({ source: 'hi', share: 'none' })).toBeNull();
    });
});

describe('buildShareLink — share: { textUrl, remoteUrl } template', () => {
    const template = {
        textUrl: 'https://x.com/o?d={text}',
        remoteUrl: 'https://x.com/o?u={url}',
    };

    it('substitutes {text} for inline payloads', () => {
        const url = buildShareLink({ source: 'hello', share: template });
        expect(url).not.toBeNull();
        expect(url!.startsWith('https://x.com/o?d=')).toBe(true);
        // Payload must not contain + / = (base64url)
        const payload = url!.slice('https://x.com/o?d='.length);
        expect(payload).not.toMatch(/[+/=]/);
    });

    it('substitutes {url} when a https sourceUrl is present', () => {
        const sourceUrl = 'https://raw.example.com/r.nowline';
        const url = buildShareLink({ source: 'hi', share: template, sourceUrl });
        expect(url).not.toBeNull();
        expect(url!.startsWith('https://x.com/o?u=')).toBe(true);
        expect(url!).toContain(encodeURIComponent(sourceUrl));
    });

    it('falls back to textUrl when sourceUrl is not https', () => {
        const url = buildShareLink({
            source: 'hi',
            share: template,
            sourceUrl: 'http://insecure.com/r.nowline',
        });
        expect(url!.startsWith('https://x.com/o?d=')).toBe(true);
    });
});

describe('buildShareLink — DEFAULT_SHARE_BASE constant', () => {
    it('equals the canonical free-app open route', () => {
        expect(DEFAULT_SHARE_BASE).toBe('https://free.nowline.io/open');
    });
});
