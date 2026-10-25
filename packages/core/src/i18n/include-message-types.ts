// Argument shapes for the include-resolution diagnostics (NL.E0203-E0210).
// Variants are a discriminated union on `reason`, as in
// `wave-message-types.ts`, so each bundle words every case itself.

/** Why an include could not be read (NL.E0203). */
export type E0203Args =
    | { reason: 'not-found' | 'is-directory' | 'permission-denied' | 'not-nowline'; path: string }
    /** Any other failure; `detail` is the reader's message, when it has one. */
    | { reason: 'unreadable'; path: string; detail?: string };

/** How an include left the include root (NL.E0208). */
export interface E0208Args {
    reason: 'absolute' | 'parent' | 'symlink';
    path: string;
}

/** An include whose child roadmap disagrees on `start:` (NL.E0207). */
export interface E0207Args {
    path: string;
    parentStart?: string;
    childStart?: string;
}
