import type { Diagnostic } from 'langium';
import { URI } from 'langium';
import type { NowlineFile } from '../src/generated/ast.js';
import { createNowlineServices, type NowlineServices } from '../src/language/nowline-module.js';

let cached:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;

export function getServices() {
    if (!cached) {
        cached = createNowlineServices();
    }
    return cached;
}

export interface ParseOutcome {
    ast: NowlineFile;
    lexerErrors: string[];
    parserErrors: string[];
    diagnostics: Diagnostic[];
}

let docCounter = 0;

export async function parse(
    input: string,
    options: { validate?: boolean } = {},
): Promise<ParseOutcome> {
    const { shared } = getServices();
    const uri = URI.parse(`memory:///test-${++docCounter}.nowline`);
    const docFactory = shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(input, uri);
    await shared.workspace.DocumentBuilder.build([doc], {
        validation: options.validate ?? true,
    });
    return {
        ast: doc.parseResult.value,
        lexerErrors: doc.parseResult.lexerErrors.map((e) => e.message),
        parserErrors: doc.parseResult.parserErrors.map((e) => e.message),
        diagnostics: doc.diagnostics ?? [],
    };
}

export function errorMessages(diagnostics: Diagnostic[]): string[] {
    return diagnostics.filter((d) => d.severity === 1).map((d) => d.message);
}

export function warningMessages(diagnostics: Diagnostic[]): string[] {
    return diagnostics.filter((d) => d.severity === 2).map((d) => d.message);
}
