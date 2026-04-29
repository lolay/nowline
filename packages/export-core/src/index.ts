export type {
    ExportInputs,
    PdfPresetName,
    PdfLengthUnit,
    PdfLength,
    PdfPageSize,
    PdfOrientation,
    FontSource,
    FontRole,
    ResolvedFont,
    ResolvedFontPair,
} from './types.js';

export {
    lengthToPoints,
    pointsToLength,
    parseLength,
    LengthParseError,
} from './units.js';

export {
    parsePageSize,
    isPdfPresetName,
    presetNames,
    presetDimensions,
    resolvePage,
    validateMargin,
    fitContent,
    PageSizeParseError,
    type ResolvedPage,
    type ContentScale,
} from './pdf-page.js';

export {
    resolveFonts,
    FontResolveError,
    type ResolveOptions,
    type ResolveResult,
} from './fonts/resolve.js';

export { isVariableFontBytes } from './fonts/sfns.js';

export {
    BUNDLED_SANS_PATH,
    BUNDLED_MONO_PATH,
    loadBundledSans,
    loadBundledMono,
    clearBundledCache,
} from './fonts/bundled.js';

export {
    ALIASES,
    isAlias,
    probeListFor,
    aliasCandidate,
    type FontCandidate,
    type PlatformProbe,
} from './fonts/probe-list.js';

export {
    getProp,
    getProps,
    hasProp,
    displayLabel,
    roadmapTitle,
    type PropertyHost,
} from './ast-helpers.js';
