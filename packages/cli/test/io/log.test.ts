import { describe, expect, it } from 'vitest';
import { createLog } from '../../src/io/log.js';

function capture(level: 'verbose' | 'quiet' | 'normal') {
    const chunks: string[] = [];
    const log = createLog(level, (chunk) => chunks.push(chunk));
    log.verbose('nowline: wrote out.svg');
    log.notice('warning: something');
    return { log, out: chunks.join('') };
}

describe('createLog', () => {
    it('normal prints notices but not verbose lines', () => {
        const { log, out } = capture('normal');
        expect(out).toBe('warning: something\n');
        expect(log.quiet).toBe(false);
    });

    it('verbose prints both', () => {
        expect(capture('verbose').out).toBe('nowline: wrote out.svg\nwarning: something\n');
    });

    it('quiet prints neither', () => {
        const { log, out } = capture('quiet');
        expect(out).toBe('');
        expect(log.quiet).toBe(true);
    });
});
