/**
 * Split the `args` input into argv the way a shell would for plain words:
 * whitespace (including newlines) separates arguments, and single or double
 * quotes group text containing spaces. No expansion, no escapes; the CLI
 * receives exactly what is written. `@actions/exec` has a splitter but does
 * not export it.
 */
export function splitArgs(raw: string): string[] {
    const args: string[] = [];
    let current = '';
    let inArg = false;
    let quote: '"' | "'" | undefined;

    for (const ch of raw) {
        if (quote) {
            if (ch === quote) quote = undefined;
            else current += ch;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            inArg = true;
        } else if (/\s/.test(ch)) {
            if (inArg) args.push(current);
            current = '';
            inArg = false;
        } else {
            current += ch;
            inArg = true;
        }
    }

    if (quote) throw new Error(`args has an unclosed ${quote} quote: ${raw}`);
    if (inArg) args.push(current);
    return args;
}
