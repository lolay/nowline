import * as path from 'node:path';
import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    type ResolveResult,
    resolveIncludes,
} from '@nowline/core';
import { URI } from 'langium';

let cached:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;

export function getServices() {
    if (!cached) {
        cached = createNowlineServices();
    }
    return cached;
}

let counter = 0;

export async function parseAndResolve(
    input: string,
    filePath = '/virtual/test.nowline',
    readFile?: (abs: string) => Promise<string>,
): Promise<{ file: NowlineFile; resolved: ResolveResult }> {
    const { shared, Nowline } = getServices();
    const uri = URI.parse(`memory:///test-${++counter}.nowline`);
    const docFactory = shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(input, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, filePath, {
        services: Nowline,
        readFile,
    });
    return { file, resolved };
}

/**
 * Resolve `main` out of an in-memory file set, includes and all. Keys use `/`
 * and sit under `/root`, so the same fixtures work on Windows.
 */
export async function parseAndResolveFiles(
    files: Record<string, string>,
    main = 'main.nowline',
): Promise<{ file: NowlineFile; resolved: ResolveResult }> {
    const readFile = async (abs: string): Promise<string> => {
        const rel = path.relative('/root', abs).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
    return parseAndResolve(files[main], path.resolve('/root', main), readFile);
}
