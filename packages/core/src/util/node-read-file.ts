// Node-only fallback `readFile` extracted into its own module so the
// `node:fs` import sits behind a dynamic-`import()` boundary. When
// `@nowline/core` is consumed in the browser (e.g. through `@nowline/embed`),
// callers always inject a custom `readFile` and the bundler can drop this
// module entirely via tree-shaking. The dynamic import keeps the static
// dependency graph clean even in unbundled Node consumers.

export async function nodeReadFile(absPath: string): Promise<string> {
    const fs = await import('node:fs');
    return fs.promises.readFile(absPath, 'utf-8');
}
