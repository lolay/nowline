export { resolveFonts, FontResolveError } from './resolve.js';
export type { ResolveOptions, ResolveResult } from './resolve.js';
export { isVariableFontBytes } from './sfns.js';
export {
    BUNDLED_SANS_PATH,
    BUNDLED_MONO_PATH,
    loadBundledSans,
    loadBundledMono,
    clearBundledCache,
} from './bundled.js';
export {
    probeListFor,
    isAlias,
    aliasCandidate,
    ALIASES,
    type FontCandidate,
    type PlatformProbe,
} from './probe-list.js';
