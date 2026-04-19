import { describe, it, expect } from 'vitest';
import { ExitCode } from '../../src/io/exit-codes.js';

describe('exit codes are stable', () => {
    it('matches the documented table', () => {
        expect(ExitCode.Success).toBe(0);
        expect(ExitCode.ValidationError).toBe(1);
        expect(ExitCode.InputError).toBe(2);
        expect(ExitCode.OutputError).toBe(3);
    });
});
