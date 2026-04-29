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

export const PINNED_DATE = new Date(Date.UTC(2026, 3, 27));

export const FIXTURE = `nowline v1

roadmap demo "Demo Roadmap" author:"Acme" scale:weeks start:2026-01-05

person sam "Sam Chen" link:https://example.com/sam
person jen "Jennifer Wu"

team eng "Engineering"
  team platform "Platform"
    person sam
  team mobile "Mobile"
    person jen

anchor kickoff date:2026-01-06
anchor mid-year date:2026-07-01

swimlane platform owner:platform
  item auth "Auth refactor" duration:2w status:done owner:sam after:kickoff labels:[security]
  item api-v2 "API v2" duration:1m status:in-progress remaining:40% owner:jen
  group cleanup "Cleanup"
    item linting "Linting" duration:3d
    item docs "Docs" duration:5d
  parallel sprint "Sprint"
    item alpha "Alpha" duration:1w
    item beta "Beta" duration:1w

milestone done "Done" date:2026-12-15 depends:[auth, api-v2]
`;
