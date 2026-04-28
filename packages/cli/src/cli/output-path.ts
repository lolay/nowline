import * as path from 'node:path';
import { autoAddExtension, canonicalExtension, type OutputFormat } from './formats.js';

export interface DefaultOutputInputs {
    /** Original input argument: file path or `-` for stdin. */
    inputArg: string;
    /** True when input is `-` (stdin). */
    isStdin: boolean;
    /** Resolved output format. */
    format: OutputFormat;
    /** Current working directory; defaults to `process.cwd()`. */
    cwd?: string;
}

/**
 * Resolves the default output path for render operations when `-o` is absent.
 *
 * Rules:
 * - Default-named outputs land in **cwd**, never next to the input.
 * - File input: `<cwd>/<input-base>.<format>` (input directory is ignored).
 * - Stdin input: `<cwd>/roadmap.<format>`.
 */
export function defaultRenderOutputPath(inputs: DefaultOutputInputs): string {
    const cwd = inputs.cwd ?? process.cwd();
    const ext = canonicalExtension(inputs.format);
    if (inputs.isStdin) {
        return path.join(cwd, `roadmap${ext}`);
    }
    const base = path.basename(inputs.inputArg, path.extname(inputs.inputArg)) || 'roadmap';
    return path.join(cwd, `${base}${ext}`);
}

export interface InitOutputInputs {
    /** Positional argument from `--init` (project name); undefined → default `roadmap`. */
    name?: string;
    /** Current working directory; defaults to `process.cwd()`. */
    cwd?: string;
}

/**
 * Resolves the output path for `--init`. The positional is treated as a project
 * *name*, not a file path:
 *
 *  - No extension (`my-project`) → append `.nowline`.
 *  - Already `.nowline` → use literal.
 *  - Other extension → caller should reject as a usage error (exit 2).
 *  - Missing → default name `roadmap`.
 */
export function defaultInitOutputPath(inputs: InitOutputInputs): string {
    const cwd = inputs.cwd ?? process.cwd();
    const name = inputs.name ?? 'roadmap';
    const ext = path.extname(name);
    if (!ext) {
        return path.join(cwd, `${name}.nowline`);
    }
    return path.join(cwd, name);
}

/**
 * Returns true when an `--init` positional has an extension other than
 * `.nowline`. Caller should reject this with an exit-2 usage error.
 */
export function initNameHasIncompatibleExtension(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return ext !== '' && ext !== '.nowline';
}

/**
 * Resolves the final output path for render operations, applying the
 * extension-auto-add rule when `-o` is provided and has no extension.
 */
export function resolveRenderOutputPath(args: {
    outputArg: string | undefined;
    isStdout: boolean;
    inputArg: string;
    isStdin: boolean;
    format: OutputFormat;
    cwd?: string;
}): { path: string; isStdout: boolean } {
    if (args.isStdout) {
        return { path: '-', isStdout: true };
    }
    if (args.outputArg !== undefined) {
        return {
            path: autoAddExtension(args.outputArg, args.format),
            isStdout: false,
        };
    }
    return {
        path: defaultRenderOutputPath({
            inputArg: args.inputArg,
            isStdin: args.isStdin,
            format: args.format,
            cwd: args.cwd,
        }),
        isStdout: false,
    };
}
