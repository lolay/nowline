// Public API for `@nowline/preview`.
//
// `mountLivePreview` is the Layer 2 controller that wraps `mountPreview`
// (Layer 0) with an opt-in renderSource → applyRenderResult loop. Every
// entry point is injectable so consumers are never constrained by the
// default convention.
//
// Layer 0 (`mountPreview`) and Layer 1 helpers (`applyRenderResult`, etc.)
// live in `@nowline/preview-shell` and remain independently importable —
// importing this package does not force consumers to use the render engine.

export {
    type ApplyFn,
    type LivePreviewHandle,
    type LiveRenderOptions,
    type MountLivePreviewOptions,
    mountLivePreview,
    type RenderFn,
} from './controller.js';
