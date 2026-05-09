import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import { type LayoutOptions, layoutRoadmap, type PositionedRoadmap } from '@nowline/layout';
import { URI } from 'langium';

let cached:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;

export function getServices() {
    if (!cached) cached = createNowlineServices();
    return cached;
}

let counter = 0;

export async function parseToModel(
    input: string,
    options: LayoutOptions = {},
): Promise<PositionedRoadmap> {
    const { shared, Nowline } = getServices();
    const uri = URI.parse(`memory:///test-${++counter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(input, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const resolved = await resolveIncludes(doc.parseResult.value, '/virtual/test.nowline', {
        services: Nowline,
    });
    return layoutRoadmap(doc.parseResult.value, resolved, options);
}
