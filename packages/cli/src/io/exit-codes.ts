export const ExitCode = {
    Success: 0,
    ValidationError: 1,
    InputError: 2,
    OutputError: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export class CliError extends Error {
    constructor(
        public readonly exitCode: ExitCode,
        message: string,
    ) {
        super(message);
        this.name = 'CliError';
    }
}
