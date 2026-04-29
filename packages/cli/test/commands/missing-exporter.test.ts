// Tests for the tiny-build "this format isn't available" detection.
// `isMissingExporterError` is the gate that turns a runtime
// `ERR_MODULE_NOT_FOUND` (raised when `bun build --external @nowline/export-*`
// stripped the package out of the binary) into the user-facing
// "install nowline-full" message.

import { describe, expect, it } from 'vitest';
import {
    buildMissingExporterMessage,
    isMissingExporterError,
} from '../../src/commands/render.js';

function makeMissingError(specifier: string, code = 'ERR_MODULE_NOT_FOUND'): Error {
    const err = new Error(
        `Cannot find package '${specifier}' imported from /workspace/dist/index.js`,
    ) as Error & { code?: string };
    err.code = code;
    return err;
}

describe('isMissingExporterError', () => {
    it('matches an ERR_MODULE_NOT_FOUND for the expected package', () => {
        const err = makeMissingError('@nowline/export-pdf');
        expect(isMissingExporterError(err, 'pdf')).toBe(true);
    });

    it('matches the legacy CommonJS code MODULE_NOT_FOUND', () => {
        const err = makeMissingError('@nowline/export-xlsx', 'MODULE_NOT_FOUND');
        expect(isMissingExporterError(err, 'xlsx')).toBe(true);
    });

    it('does not match an unrelated module-not-found', () => {
        const err = makeMissingError('some-other-package');
        expect(isMissingExporterError(err, 'pdf')).toBe(false);
    });

    it('does not match a different format', () => {
        const err = makeMissingError('@nowline/export-html');
        expect(isMissingExporterError(err, 'pdf')).toBe(false);
    });

    it('does not match generic non-NotFound errors', () => {
        const err = new Error('something went wrong inside @nowline/export-pdf');
        expect(isMissingExporterError(err, 'pdf')).toBe(false);
    });

    it('handles non-Error throwables', () => {
        expect(isMissingExporterError('boom', 'pdf')).toBe(false);
        expect(isMissingExporterError(undefined, 'pdf')).toBe(false);
        expect(isMissingExporterError(null, 'pdf')).toBe(false);
    });
});

describe('buildMissingExporterMessage', () => {
    it('mentions the format and the install path', () => {
        const message = buildMissingExporterMessage('pdf');
        expect(message).toContain("the 'pdf' format is not available in this build");
        expect(message).toContain('nowline-full');
        expect(message).toContain('npm install -g @nowline/cli-full');
        expect(message).toContain('github.com/lolay/nowline/releases');
    });

    it('produces a different message per format', () => {
        expect(buildMissingExporterMessage('xlsx')).toContain("'xlsx' format");
        expect(buildMissingExporterMessage('mermaid')).toContain("'mermaid' format");
    });
});
