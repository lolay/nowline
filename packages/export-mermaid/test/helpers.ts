import { URI } from 'langium';
import {
    createNowlineServices,
    resolveIncludes,
    type NowlineFile,
    type NowlineServices,
    type ResolveResult,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import type { ExportInputs } from '@nowline/export-core';

let services: { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices } | undefined;
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
    const model = layoutRoadmap(ast, resolved, { theme: options.theme ?? 'light', today: options.today });
    return { ast, resolved, model, sourcePath, today: options.today };
}

export const SIMPLE_FIXTURE = `nowline v1

roadmap simple "Simple Example" start:2026-01-05

swimlane build "Build"
  item design "Design" duration:1w status:done
  item implement "Implement" duration:2w status:in-progress after:design
  item ship "Ship" duration:3d status:planned after:implement labels:[release]

milestone done "Done" date:2026-03-15
`;

export const LOSSY_FIXTURE = `nowline v1

roadmap lossy "Lossy Example"

person sam "Sam"

swimlane work "Work"
  item one "One" duration:1w owner:sam labels:[security] remaining:50%
    description "A description"
  item two "Two" duration:1w before:one
  group bundle "Bundle"
    item three "Three" duration:1w
  parallel sprint "Sprint"
    item four "Four" duration:1w

footnote risk "Risk" on:work
  description "Risk description"
`;
