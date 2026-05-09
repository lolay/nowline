import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    type ResolveResult,
    resolveIncludes,
} from '@nowline/core';
import type { ExportInputs } from '@nowline/export-core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { URI } from 'langium';

let services:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;
let counter = 0;

function getServices() {
    if (!services) services = createNowlineServices();
    return services;
}

export async function buildExportInputs(
    source: string,
    options: { theme?: ThemeName; today?: Date; sourcePath?: string } = {},
): Promise<ExportInputs> {
    const { shared, Nowline } = getServices();
    const uri = URI.parse(`memory:///fixture-${++counter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const ast = doc.parseResult.value;
    const sourcePath = options.sourcePath ?? '/virtual/fixture.nowline';
    const resolved: ResolveResult = await resolveIncludes(ast, sourcePath, { services: Nowline });
    const model = layoutRoadmap(ast, resolved, {
        theme: options.theme ?? 'light',
        today: options.today,
    });
    return { ast, resolved, model, sourcePath, today: options.today };
}

export const MINIMAL_FIXTURE = `nowline v1

roadmap minimal "Minimal"

swimlane build "Build"
  item one "One" duration:1w
  item two "Two" duration:2w after:one
`;
