// Deterministic id generator. A single counter per renderSvg() call yields
// ids like `nl-0`, `nl-1`, ... so identical inputs emit identical SVGs.
// Never uses Math.random, Date.now, or ambient state.

export class IdGenerator {
    private counter = 0;
    constructor(private readonly prefix: string = 'nl') {}
    next(label?: string): string {
        const id = `${this.prefix}-${this.counter++}`;
        return label ? `${id}-${label}` : id;
    }
}
