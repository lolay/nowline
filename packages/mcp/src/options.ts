// How an MCP tool call's arguments become render options: the shared schema
// from `@nowline/config`, over one `argument` layer (specs/surface-options.md
// §3.2). MCP keeps its own wording for a bad value.

import {
    type OptionError,
    type OptionLayer,
    resolveSurfaceOptions,
    type SurfaceOptions,
} from '@nowline/config';
import { type NormalizedZone, normalizeZone, type ThemeName, TimezoneError } from '@nowline/layout';
import { InputRequiredError } from './diagnostics.js';

/** The option arguments a tool takes; each tool offers the subset it needs. */
export interface McpOptionArguments {
    theme?: string;
    width?: number;
    now?: string;
    /** Zone for the default now-line date; accepts what the CLI's `--timezone` does. */
    timezone?: string;
    nonWorking?: string;
    pageSize?: string;
}

export interface McpResolvedOptions {
    options: SurfaceOptions;
    /** The theme argument, when the caller passed one; the preview picks its own otherwise. */
    theme?: ThemeName;
}

/**
 * Resolve a tool's option arguments. Throws `InputRequiredError` (the tool's
 * input-error result) for the first bad value. An omitted `now` draws the
 * now-line at today's civil date in the `timezone` argument's zone, or the
 * server's local zone without one, as on every other surface. `clock` is a
 * test seam.
 */
export function resolveMcpOptions(
    args: McpOptionArguments,
    clock?: () => Date,
): McpResolvedOptions {
    const zone = readZone(args.timezone);
    const layer: OptionLayer = {
        source: (key) => ({ kind: 'argument', name: key }),
        values: {
            theme: args.theme,
            width: args.width,
            now: args.now,
            nonWorking: args.nonWorking,
            pageSize: args.pageSize,
        },
    };
    const { options, errors } = resolveSurfaceOptions([layer], { theme: 'light' }, { zone, clock });
    const [first] = errors;
    if (first) throw new InputRequiredError(describeOptionError(first));
    return { options, theme: args.theme === undefined ? undefined : options.theme };
}

// `--timezone`'s forms, through the same parser; the parser's text names the CLI.
function readZone(raw: string | undefined): NormalizedZone | undefined {
    if (raw === undefined) return undefined;
    try {
        return normalizeZone(raw);
    } catch (err) {
        if (!(err instanceof TimezoneError)) throw err;
        throw new InputRequiredError(`Invalid timezone: ${err.message.replace(/^nowline: /, '')}`);
    }
}

function describeOptionError(error: OptionError): string {
    const raw = String(error.raw);
    if (error.key === 'theme' && error.expected) {
        return `Unknown theme "${raw}". Expected one of: ${error.expected.join(', ')}.`;
    }
    if (error.expected) {
        return `Invalid ${error.key} "${raw}". Expected one of: ${error.expected.join(', ')}.`;
    }
    return `Invalid ${error.key} "${raw}": ${error.detail}`;
}
