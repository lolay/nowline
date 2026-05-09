import { URI, type LangiumDocument } from 'langium';
import { createNowlineServices, type NowlineServices, type NowlineFile } from '@nowline/core';
import type { CliDiagnostic, DiagnosticSource } from '../diagnostics/model.js';
import {
    adaptLangiumDiagnostic,
    adaptLexerError,
    adaptParserError,
    type LangiumLikeDiagnostic,
} from '../diagnostics/adapt.js';

export interface ParseOptions {
    validate?: boolean;
}

export interface ParseResult {
    ast: NowlineFile;
    document: LangiumDocument<NowlineFile>;
    diagnostics: CliDiagnostic[];
    /** True if any diagnostic (parse, lex, or semantic validation) has severity 'error'. */
    hasErrors: boolean;
    /** True if any *parser/lexer* diagnostic is present. Semantic validation errors don't count. */
    hasParseErrors: boolean;
    source: DiagnosticSource;
}

type Services = {
    shared: ReturnType<typeof createNowlineServices>['shared'];
    Nowline: NowlineServices;
};

let cachedServices: Services | undefined;
let docCounter = 0;

export function getServices(): Services {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

export async function parseSource(
    contents: string,
    filePath: string,
    options: ParseOptions = {},
): Promise<ParseResult> {
    const services = getServices();
    const uri = uriFor(filePath);
    const docFactory = services.shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(contents, uri);
    await services.shared.workspace.DocumentBuilder.build([doc], {
        validation: options.validate ?? true,
    });

    const source: DiagnosticSource = { file: filePath, contents };
    const diagnostics: CliDiagnostic[] = [];
    const parseDiagnostics: CliDiagnostic[] = [];

    for (const err of doc.parseResult.lexerErrors) {
        const adapted = adaptLexerError(err, filePath);
        parseDiagnostics.push(adapted);
        diagnostics.push(adapted);
    }
    for (const err of doc.parseResult.parserErrors) {
        const adapted = adaptParserError(err, filePath);
        parseDiagnostics.push(adapted);
        diagnostics.push(adapted);
    }
    for (const diag of doc.diagnostics ?? []) {
        diagnostics.push(adaptLangiumDiagnostic(diag as LangiumLikeDiagnostic, filePath));
    }

    const hasErrors = diagnostics.some((d) => d.severity === 'error');
    const hasParseErrors = parseDiagnostics.some((d) => d.severity === 'error');
    return {
        ast: doc.parseResult.value,
        document: doc,
        diagnostics,
        hasErrors,
        hasParseErrors,
        source,
    };
}

function uriFor(filePath: string): URI {
    // Always mint a fresh URI for each parse. Re-using a URI across calls causes
    // Langium's DocumentBuilder to mutate the prior document and/or rebind
    // cross-references against an incompatible AST, which surfaces as spurious
    // diagnostics when the CLI is embedded in a long-running process (tests,
    // language server, etc.). The suffix ensures `build([doc])` is always a net
    // new document.
    if (filePath === '<stdin>') {
        return URI.parse(`memory:///stdin-${++docCounter}.nowline`);
    }
    return URI.parse(`memory:///doc-${++docCounter}.nowline`);
}
