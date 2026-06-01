import {
    collectDocumentDiagnostics,
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
} from '@nowline/core';
import { type LangiumDocument, URI } from 'langium';
import { adaptLangiumDiagnostic, adaptLexerError, adaptParserError } from '../diagnostics/adapt.js';
import type { CliDiagnostic, DiagnosticSource } from '../diagnostics/model.js';

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

    // collectDocumentDiagnostics owns the de-dup: Langium re-folds lexer +
    // parser errors into doc.diagnostics, so the shared collector skips those
    // copies. Lexer/parser rows also feed `parseDiagnostics` (drives the
    // hasParseErrors gate that suppresses downstream layout/render).
    for (const raw of collectDocumentDiagnostics(doc)) {
        if (raw.origin === 'lexer') {
            const adapted = adaptLexerError(raw.error, filePath);
            parseDiagnostics.push(adapted);
            diagnostics.push(adapted);
        } else if (raw.origin === 'parser') {
            const adapted = adaptParserError(raw.error, filePath);
            parseDiagnostics.push(adapted);
            diagnostics.push(adapted);
        } else {
            diagnostics.push(adaptLangiumDiagnostic(raw.diagnostic, filePath));
        }
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
