export type LogLevel = 'verbose' | 'quiet' | 'normal';

/**
 * The one place `-v` / `-q` decide what reaches stderr. Errors (usage errors,
 * failed writes, validation errors) and machine output (JSON diagnostics)
 * bypass this and always print; everything else goes through here so every
 * command honors the flags the same way.
 */
export interface Log {
    /** `-v` only: progress lines such as `nowline: wrote <path>`. */
    verbose(line: string): void;
    /** Non-error notices (warnings, lossy summaries, banners). Dropped under `-q`. */
    notice(line: string): void;
    /** True under `-q`; callers that filter mixed output (diagnostics) check it. */
    readonly quiet: boolean;
}

export function createLog(
    level: LogLevel,
    write: (chunk: string) => void = (chunk) => {
        process.stderr.write(chunk);
    },
): Log {
    return {
        verbose: (line) => {
            if (level === 'verbose') write(`${line}\n`);
        },
        notice: (line) => {
            if (level !== 'quiet') write(`${line}\n`);
        },
        quiet: level === 'quiet',
    };
}
