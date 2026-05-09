import { describe, expect, it } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { CliError, ExitCode } from '../../src/io/exit-codes.js';

describe('parseArgv — modes', () => {
    it('empty argv resolves to help mode', () => {
        const r = parseArgv([]);
        expect(r.mode).toBe('help');
    });

    it('--help short-circuits to help', () => {
        const r = parseArgv(['--help']);
        expect(r.mode).toBe('help');
    });

    it('--version resolves to version', () => {
        const r = parseArgv(['--version']);
        expect(r.mode).toBe('version');
    });

    it('-V is a short alias for --version', () => {
        const r = parseArgv(['-V']);
        expect(r.mode).toBe('version');
    });

    it('default mode for a positional is render', () => {
        const r = parseArgv(['foo.nowline']);
        expect(r.mode).toBe('render');
        expect(r.positional).toBe('foo.nowline');
    });

    it('--serve resolves to serve mode', () => {
        const r = parseArgv(['--serve', 'foo.nowline']);
        expect(r.mode).toBe('serve');
        expect(r.positional).toBe('foo.nowline');
    });

    it('--init resolves to init mode (positional optional)', () => {
        const r1 = parseArgv(['--init']);
        expect(r1.mode).toBe('init');
        expect(r1.positional).toBeUndefined();

        const r2 = parseArgv(['--init', 'my-project']);
        expect(r2.mode).toBe('init');
        expect(r2.positional).toBe('my-project');
    });
});

describe('parseArgv — flags and short aliases', () => {
    it('-f maps to format', () => {
        expect(parseArgv(['foo.nowline', '-f', 'pdf']).format).toBe('pdf');
        expect(parseArgv(['foo.nowline', '--format', 'pdf']).format).toBe('pdf');
    });

    it('-o maps to output', () => {
        expect(parseArgv(['foo.nowline', '-o', 'bar.pdf']).output).toBe('bar.pdf');
        expect(parseArgv(['foo.nowline', '-o', '-']).output).toBe('-');
    });

    it('-n is short for --dry-run', () => {
        expect(parseArgv(['foo.nowline', '-n']).dryRun).toBe(true);
        expect(parseArgv(['foo.nowline', '--dry-run']).dryRun).toBe(true);
    });

    it('-t maps to theme', () => {
        expect(parseArgv(['foo.nowline', '-t', 'dark']).theme).toBe('dark');
    });

    it('-s maps to scale, -w maps to width', () => {
        expect(parseArgv(['foo.nowline', '-s', '2']).scale).toBe('2');
        expect(parseArgv(['foo.nowline', '-w', '1600']).width).toBe('1600');
    });

    it('-v is verbose, -q is quiet, -V is version', () => {
        expect(parseArgv(['foo.nowline', '-v']).logLevel).toBe('verbose');
        expect(parseArgv(['foo.nowline', '-q']).logLevel).toBe('quiet');
        expect(parseArgv(['-V']).mode).toBe('version');
    });
});

describe('parseArgv — mutual exclusivity', () => {
    it('--verbose and --quiet are mutually exclusive', () => {
        try {
            parseArgv(['foo.nowline', '-v', '-q']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(ExitCode.InputError);
            expect((err as CliError).message).toMatch(/verbose.*quiet|quiet.*verbose/i);
        }
    });

    it('--serve and --init are mutually exclusive', () => {
        try {
            parseArgv(['--serve', '--init']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(ExitCode.InputError);
        }
    });

    it('--dry-run cannot combine with --serve', () => {
        try {
            parseArgv(['--serve', '--dry-run', 'foo.nowline']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
        }
    });

    it('--dry-run cannot combine with --init', () => {
        try {
            parseArgv(['--init', '--dry-run']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
        }
    });
});

describe('parseArgv — locale', () => {
    it('--locale populates `locale`', () => {
        expect(parseArgv(['foo.nowline', '--locale', 'fr-CA']).locale).toBe('fr-CA');
    });

    it('omitting --locale leaves locale undefined (env-var fallback happens in render)', () => {
        expect(parseArgv(['foo.nowline']).locale).toBeUndefined();
    });
});

describe('parseArgv — now-line flag', () => {
    it('--now <date> populates `now`', () => {
        const r = parseArgv(['foo.nowline', '--now', '2026-04-29']);
        expect(r.now).toBe('2026-04-29');
    });

    it('--now - populates `now` with the literal "-" sentinel', () => {
        const r = parseArgv(['foo.nowline', '--now', '-']);
        expect(r.now).toBe('-');
    });

    it('omitting --now leaves now undefined (default-to-today happens downstream)', () => {
        const r = parseArgv(['foo.nowline']);
        expect(r.now).toBeUndefined();
    });
});

describe('parseArgv — usage errors', () => {
    it('unknown flag exits with InputError', () => {
        try {
            parseArgv(['foo.nowline', '--nonsense']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(ExitCode.InputError);
        }
    });

    it('extra positionals are rejected', () => {
        try {
            parseArgv(['foo.nowline', 'bar.nowline']);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(ExitCode.InputError);
        }
    });
});
