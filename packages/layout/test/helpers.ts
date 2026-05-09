import { URI } from 'langium';
import {
    createNowlineServices,
    resolveIncludes,
    type NowlineServices,
    type NowlineFile,
    type ResolveResult,
} from '@nowline/core';

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
