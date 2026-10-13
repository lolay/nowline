// One staging function for every render surface (specs/surface-options.md
// §3.3): parse and validate, resolve includes, apply the include-error
// precedence, load the logo, lay out. Rendering, diagnostics formatting,
// `strict` and layout insights stay with each caller, which maps the result
// to its own shape.

import {
    collectDocumentDiagnostics,
    isRoutedResolveDiagnostic,
    type NowlineFile,
    type NowlineServices,
    type RawDiagnostic,
    type ResolveDiagnostic,
    type ResolveResult,
    resolveIncludes,
} from '@nowline/core';
import {
    type LayoutOptions,
    layoutRoadmap,
    type PositionedRoadmap,
    roadmapLogoRef,
} from '@nowline/layout';
import { type LangiumDocument, type LangiumSharedCoreServices, URI } from 'langium';
import { type LoadedLogo, loadLogo } from './logo.js';
import type { AssetResolver } from './svg/render.js';

/** Langium's `DiagnosticSeverity.Error`. */
const SEVERITY_ERROR = 1;

export interface StageInputs {
    source: string;
    /** Absolute path: base for includes and assets. */
    sourcePath: string;
    /** The caller's Langium services (each pipeline keeps its own instance). */
    services: { shared: LangiumSharedCoreServices; Nowline: NowlineServices };
    readSource: (absPath: string) => Promise<string>;
    /** Omitted: no asset access (the embed), so a `logo:` lays out as if absent. */
    assetResolver?: AssetResolver;
    /** A document the caller already parsed and validated from `source`. */
    document?: LangiumDocument<NowlineFile>;
    layout: Pick<LayoutOptions, 'theme' | 'today' | 'width' | 'locale' | 'nonWorking'>;
    /**
     * An include error the caller tolerates, such as the browser's
     * single-file mode skipping every include: it takes no part in the
     * include-error precedence and stays in `resolved.diagnostics` for the
     * caller to report. Omitted: every include error counts.
     */
    isToleratedIncludeError?: (diagnostic: ResolveDiagnostic) => boolean;
}

export type StageResult =
    | {
          kind: 'invalid';
          document: LangiumDocument<NowlineFile>;
          /** Lexer, parser and validator diagnostics with errors among them. */
          diagnostics: RawDiagnostic[];
      }
    | {
          kind: 'include-error';
          document: LangiumDocument<NowlineFile>;
          /** The first uncoded include error, when one exists: it wins (waves.md §6.1). */
          legacy?: ResolveDiagnostic;
          /** Routed (wave-rule) diagnostics, errors and warnings; empty when `legacy` is set. */
          routed: ResolveDiagnostic[];
          /** Every resolver diagnostic in order, for callers that report more than the winner. */
          resolved: ResolveResult;
      }
    | {
          kind: 'staged';
          document: LangiumDocument<NowlineFile>;
          ast: NowlineFile;
          resolved: ResolveResult;
          /** Routed warnings (no errors). */
          routed: ResolveDiagnostic[];
          /** The loaded logo: size for layout, bytes for `RenderOptions.logo`. */
          logo?: LoadedLogo;
          /** Asset warnings (missing or unreadable logo); the caller applies `strict`. */
          warnings: string[];
          model: PositionedRoadmap;
      };

let documentCounter = 0;

function freshUri(): URI {
    // A fresh URI per stage: reusing one lets Langium mutate the prior
    // document in place.
    return URI.parse(`memory:///stage-${++documentCounter}.nowline`);
}

async function buildDocument(inputs: StageInputs): Promise<LangiumDocument<NowlineFile>> {
    if (inputs.document) return inputs.document;
    const { workspace } = inputs.services.shared;
    const document = workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        inputs.source,
        freshUri(),
    );
    await workspace.DocumentBuilder.build([document], { validation: true });
    return document;
}

function isErrorDiagnostic(raw: RawDiagnostic): boolean {
    return raw.origin !== 'validation' || raw.diagnostic.severity === SEVERITY_ERROR;
}

/**
 * Parse, validate, resolve includes, load the logo and lay out `source`.
 * Returns `invalid` on a lexer, parser or validator error, `include-error`
 * on a resolver error, and `staged` with the positioned model otherwise.
 */
export async function stageRoadmap(inputs: StageInputs): Promise<StageResult> {
    const document = await buildDocument(inputs);
    const diagnostics = collectDocumentDiagnostics(document);
    if (diagnostics.some(isErrorDiagnostic)) {
        return { kind: 'invalid', document, diagnostics };
    }

    const ast = document.parseResult.value;
    const resolved = await resolveIncludes(ast, inputs.sourcePath, {
        services: inputs.services.Nowline,
        readFile: inputs.readSource,
    });

    // An uncoded include error is more fundamental than the wave-rule
    // errors: the first one wins and hides the routed diagnostics.
    const isTolerated = inputs.isToleratedIncludeError ?? (() => false);
    const errors = resolved.diagnostics.filter((d) => d.severity === 'error' && !isTolerated(d));
    const routed = resolved.diagnostics.filter(isRoutedResolveDiagnostic);
    const legacy = errors.find((d) => !isRoutedResolveDiagnostic(d));
    if (legacy) {
        return { kind: 'include-error', document, legacy, routed: [], resolved };
    }
    if (errors.length > 0) {
        return { kind: 'include-error', document, routed, resolved };
    }

    // A failed logo load warns and lays out as if no logo were declared.
    const warnings: string[] = [];
    const logo = await loadLogo(roadmapLogoRef(ast), inputs.assetResolver, (message) =>
        warnings.push(message),
    );
    // Named keys, not a spread: a caller may pass a wider options object.
    const { theme, today, width, locale, nonWorking } = inputs.layout;
    const model = layoutRoadmap(ast, resolved, {
        theme,
        today,
        width,
        locale,
        nonWorking,
        logo: logo?.dimensions,
    });
    return { kind: 'staged', document, ast, resolved, routed, logo, warnings, model };
}
