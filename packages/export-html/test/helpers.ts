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

export const MINIMAL_FIXTURE = `nowline v1

roadmap minimal "Minimal Example"

swimlane build "Build"
  item design "Design" duration:1w status:done
  item implement "Implement" duration:2w status:in-progress
  item ship "Ship" duration:3d status:planned
`;

export const TEAMS_FIXTURE = `nowline v1

roadmap teams-2026 "Teams Roadmap 2026" start:2026-01-01

person sam "Sam Chen"
person jen "Jennifer Wu"

team engineering "Engineering"

anchor kickoff date:2026-01-06
anchor mid-year date:2026-07-01

swimlane platform owner:engineering
  item auth "Auth refactor" duration:1m after:kickoff owner:sam status:done labels:[security]
  item api-v2 "API v2" duration:2w owner:jen status:in-progress remaining:40%

milestone beta "Beta" depends:[auth, api-v2]

footnote risk "Capacity risk" on:platform
  description "Mobile team understaffed."
`;
