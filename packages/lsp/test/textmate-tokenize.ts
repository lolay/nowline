import { readFileSync } from 'node:fs';

// A one-line TextMate tokenizer over grammars/nowline.tmLanguage.json, so the
// grammar tests can assert what scope a word ends up with rather than test
// one pattern in isolation. It follows the TextMate rules the grammar relies
// on: at each position the earliest match wins, a tie goes to the pattern
// listed first, a begin/end rule's end pattern beats its inner patterns, and
// `include: "#name"` pulls in a repository entry. Captures must not nest
// (none do). JavaScript regexes stand in for Oniguruma; the grammar sticks to
// the syntax both share.

interface Rule {
    include?: string;
    name?: string;
    match?: string;
    begin?: string;
    end?: string;
    captures?: Record<string, { name: string }>;
    beginCaptures?: Record<string, { name: string }>;
    endCaptures?: Record<string, { name: string }>;
    patterns?: Rule[];
}

interface Grammar {
    patterns: Rule[];
    repository: Record<string, Rule>;
}

export interface Token {
    text: string;
    /** Outermost first; the last one is what the editor colours the token by. */
    scopes: string[];
}

const grammar = JSON.parse(
    readFileSync(new URL('../../../grammars/nowline.tmLanguage.json', import.meta.url), 'utf8'),
) as Grammar;

/** Resolve includes and flatten pattern-only repository entries, keeping order. */
function expand(rules: Rule[]): Rule[] {
    return rules.flatMap((rule) => {
        if (rule.include) {
            const target = grammar.repository[rule.include.replace(/^#/, '')];
            if (!target) throw new Error(`unknown include ${rule.include}`);
            return expand([target]);
        }
        if (!rule.match && !rule.begin && rule.patterns) return expand(rule.patterns);
        return [rule];
    });
}

function search(source: string, line: string, from: number): RegExpExecArray | null {
    const re = new RegExp(source, 'dg');
    re.lastIndex = from;
    return re.exec(line);
}

/** Push the matched text, split into its captured groups. */
function emitMatch(
    out: Token[],
    m: RegExpExecArray,
    scopes: string[],
    captures: Record<string, { name: string }> | undefined,
): void {
    const start = m.index;
    const end = start + m[0].length;
    const groups = Object.entries(captures ?? {})
        .map(([n, c]) => ({ range: m.indices?.[Number(n)], name: c.name }))
        .filter((g): g is { range: [number, number]; name: string } => g.range !== undefined)
        .sort((a, b) => a.range[0] - b.range[0]);
    let pos = start;
    for (const g of groups) {
        if (g.range[0] > pos) push(out, m.input.slice(pos, g.range[0]), scopes);
        push(out, m.input.slice(g.range[0], g.range[1]), [...scopes, g.name]);
        pos = g.range[1];
    }
    if (pos < end) push(out, m.input.slice(pos, end), scopes);
}

function push(out: Token[], text: string, scopes: string[]): void {
    if (text.length > 0) out.push({ text, scopes });
}

/** Tokenize `line` from `pos` until `end` matches (or the line runs out). */
function scan(
    out: Token[],
    line: string,
    pos: number,
    rules: Rule[],
    scopes: string[],
    end?: { source: string; captures?: Record<string, { name: string }> },
): number {
    while (pos < line.length) {
        let best: { m: RegExpExecArray; rule?: Rule } | undefined;
        if (end) {
            const m = search(end.source, line, pos);
            if (m) best = { m };
        }
        for (const rule of rules) {
            const m = search((rule.match ?? rule.begin) as string, line, pos);
            if (m && (!best || m.index < best.m.index)) best = { m, rule };
        }
        if (!best) break;
        const { m, rule } = best;
        push(out, line.slice(pos, m.index), scopes);
        if (!rule) {
            emitMatch(out, m, scopes, end?.captures);
            return m.index + m[0].length;
        }
        const inner = rule.name ? [...scopes, rule.name] : scopes;
        const after = m.index + Math.max(m[0].length, 1);
        if (rule.match) {
            emitMatch(out, m, inner, rule.captures);
            pos = after;
        } else {
            emitMatch(out, m, inner, rule.beginCaptures);
            pos = scan(out, line, after, expand(rule.patterns ?? []), inner, {
                source: rule.end as string,
                captures: rule.endCaptures,
            });
        }
    }
    push(out, line.slice(pos), scopes);
    return line.length;
}

export function tokenize(line: string): Token[] {
    const out: Token[] = [];
    scan(out, line, 0, expand(grammar.patterns), ['source.nowline']);
    return out;
}

/**
 * The innermost scope of the token whose text is exactly `word`, or undefined
 * when `word` is not a token on its own (a pattern swallowed it into a longer
 * token, or split it).
 */
export function scopeOf(line: string, word: string): string | undefined {
    const token = tokenize(line).find((t) => t.text === word);
    return token?.scopes.at(-1);
}
