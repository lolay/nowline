import { describe, expect, it } from 'vitest';
import { readInput, readStdinFd } from '../../src/io/read.js';

function errno(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(code), { code });
}

async function* chunks(...parts: string[]): AsyncGenerator<string> {
    for (const p of parts) yield p;
}

describe('readStdinFd', () => {
    it('returns the synchronous fd read when it succeeds', async () => {
        const got = await readStdinFd(() => 'roadmap r\n', chunks('unused'));
        expect(got).toBe('roadmap r\n');
    });

    it.each(['EAGAIN', 'EWOULDBLOCK'])('falls back to the stream on %s', async (code) => {
        const got = await readStdinFd(
            () => {
                throw errno(code);
            },
            chunks('roadmap ', 'r\n'),
        );
        expect(got).toBe('roadmap r\n');
    });

    it('treats EOF as empty input', async () => {
        const got = await readStdinFd(() => {
            throw errno('EOF');
        }, chunks('unused'));
        expect(got).toBe('');
    });

    it('rethrows other errors', async () => {
        await expect(
            readStdinFd(() => {
                throw errno('EIO');
            }, chunks()),
        ).rejects.toThrow('EIO');
    });
});

describe('readInput stdin', () => {
    it('rejects empty stdin as an input error', async () => {
        await expect(readInput('-', { readStdin: async () => '' })).rejects.toMatchObject({
            exitCode: 2,
            message: 'nowline: no input on stdin',
        });
    });
});
