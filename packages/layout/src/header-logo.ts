// Company logo sizing for the roadmap header (`logo:` / `logo-size:`,
// specs/rendering.md § Company Logo Size Presets).
//
// Layout never reads asset bytes. The caller loads the logo before layout,
// reads its intrinsic size, and passes that in as `LayoutOptions.logo`;
// layout only scales it to the `logo-size:` slot. A roadmap that declares
// `logo:` without that input (missing file, no asset access) lays out as
// if it had no logo.

import type { NowlineFile } from '@nowline/core';
import { propValue } from './dsl-utils.js';
import { HEADER_LOGO_MAX_WIDTH_PX } from './header-card-geometry.js';
import { LOGO_SIZE_PX } from './themes/shared.js';

/** Intrinsic size of a loaded logo, in its own units (only the ratio matters). */
export interface LogoDimensions {
    width: number;
    height: number;
}

export type LogoSizePreset = keyof typeof LOGO_SIZE_PX;

/** The roadmap's `logo:` path as written, or undefined when it declares none. */
export function roadmapLogoRef(file: NowlineFile): string | undefined {
    const ref = propValue(file.roadmapDecl?.properties ?? [], 'logo');
    return ref ? ref : undefined;
}

function logoSizePreset(file: NowlineFile): LogoSizePreset {
    const raw = propValue(file.roadmapDecl?.properties ?? [], 'logo-size');
    return raw !== undefined && raw in LOGO_SIZE_PX ? (raw as LogoSizePreset) : 'md';
}

/**
 * The drawn logo size: height from `logo-size:`, width from the intrinsic
 * aspect ratio, so the slot always matches the logo's shape and the logo
 * fills it exactly whether the source is larger or smaller. A logo wider
 * than `HEADER_LOGO_MAX_WIDTH_PX` at that height scales down uniformly.
 */
export function scaleLogo(intrinsic: LogoDimensions, preset: LogoSizePreset): LogoDimensions {
    const aspect = intrinsic.width / intrinsic.height;
    let height = LOGO_SIZE_PX[preset];
    let width = height * aspect;
    if (width > HEADER_LOGO_MAX_WIDTH_PX) {
        width = HEADER_LOGO_MAX_WIDTH_PX;
        height = width / aspect;
    }
    return { width, height };
}

/**
 * The drawn logo size for this file, or undefined when it declares no
 * `logo:` or the caller supplied no usable intrinsic size.
 */
export function resolveHeaderLogo(
    file: NowlineFile,
    intrinsic: LogoDimensions | undefined,
): (LogoDimensions & { assetRef: string; intrinsic: LogoDimensions }) | undefined {
    const assetRef = roadmapLogoRef(file);
    if (!assetRef || !intrinsic) return undefined;
    if (!(intrinsic.width > 0 && intrinsic.height > 0)) return undefined;
    if (!Number.isFinite(intrinsic.width) || !Number.isFinite(intrinsic.height)) return undefined;
    return { ...scaleLogo(intrinsic, logoSizePreset(file)), assetRef, intrinsic };
}
