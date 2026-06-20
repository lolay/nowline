export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'vscode-languageserver') {
        const parent = context.parentURL ?? '';
        if (parent.includes('vscode-languageserver-shim.mjs')) {
            return nextResolve(specifier, context);
        }
        return {
            url: new URL('./vscode-languageserver-shim.mjs', import.meta.url).href,
            shortCircuit: true,
        };
    }
    return nextResolve(specifier, context);
}
