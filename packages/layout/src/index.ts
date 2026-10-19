export type { CalendarConfig, CalendarMode } from './calendar.js';
export { type ResolvedCalendar, resolveWorkingCalendar } from './calendar-resolver.js';
export {
    type CappedPixelsPerDayInput,
    cappedPixelsPerDay,
    MIN_PIXELS_PER_DAY,
} from './canvas-width.js';
export {
    capacityIconDx,
    estimateCapacitySuffixWidth,
    formatCapacityNumber,
    META_SUFFIX_DX_EM,
    parseCapacityValue,
    type ResolvedCapacityIcon,
    resolveCapacityIcon,
} from './capacity.js';
export {
    CONTAINER_BODY_FILL_OPACITY,
    CONTAINER_BODY_PAD_PX,
    CONTAINER_BRACKET_LINE_OFFSET_PX,
    CONTAINER_HEADER_BAND_PX,
    CONTAINER_HEADER_TITLE_BASELINE_PX,
    CONTAINER_HEADER_TITLE_FONT_SIZE_PX,
    CONTAINER_MAX_FILLED_DEPTH,
    CONTAINER_NESTED_BODY_FILL_OPACITY,
    containerHeaderTitleX,
} from './container-header-geometry.js';
export {
    ARROW_HEAD_LENGTH_PX,
    ARROW_HEAD_MIN_PX,
    ARROW_HEAD_WIDTH_PX,
} from './edge-routing.js';
export {
    FRAME_TAB_INNER_GAP_PX,
    FRAME_TAB_LEFT_INSET_PX,
    FRAME_TAB_MIN_WIDTH_PX,
    FRAME_TAB_OFFSET_FROM_BOX_PX,
    FRAME_TAB_OWNER_PX_PER_CHAR,
    FRAME_TAB_RIGHT_INSET_PX,
    FRAME_TAB_TITLE_PX_PER_CHAR,
    type FrameTabGeometry,
    frameTabGeometry,
} from './frame-tab-geometry.js';
export {
    HEADER_AUTHOR_FONT_SIZE_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_CARD_PADDING_BOTTOM,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_X,
    HEADER_LOGO_GAP_PX,
    HEADER_LOGO_MAX_WIDTH_PX,
    HEADER_LOGO_PAD_Y_PX,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
} from './header-card-geometry.js';
export {
    type LogoDimensions,
    type LogoSizePreset,
    roadmapLogoRef,
    scaleLogo,
} from './header-logo.js';
export {
    INCLUDE_CHROME_BADGE_GAP_PX,
    INCLUDE_CHROME_BADGE_SIZE_PX,
    INCLUDE_CHROME_OFFSET_FROM_BOX_PX,
    INCLUDE_CHROME_SOURCE_GAP_PX,
    INCLUDE_CHROME_SOURCE_HALO_PAD_PX,
    INCLUDE_CHROME_SOURCE_PER_CHAR_PX,
    INCLUDE_CHROME_TAB_LABEL_PER_CHAR_PX,
    INCLUDE_CHROME_TAB_LEFT_INSET_PX,
    INCLUDE_CHROME_TAB_MIN_WIDTH_PX,
    INCLUDE_CHROME_TAB_RIGHT_INSET_PX,
    type IncludeChromeGeometry,
    includeChromeGeometry,
} from './include-chrome-geometry.js';
export {
    computeTitleBarExtra,
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_META_FONT_SIZE_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_CAPTION_TITLE_LINE_HEIGHT_PX,
    ITEM_CAPTION_TITLE_MAX_LINES,
    ITEM_DECORATION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_BASELINE_OFFSET_PX,
    ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX,
    ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_INSET_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_LINK_ICON_TO_CAPTION_GAP_PX,
    ITEM_STATUS_DOT_INSET_RIGHT_PX,
    ITEM_STATUS_DOT_INSET_TOP_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    type ItemCaptionAfterGlyph,
    itemCaptionInsetX,
    itemCaptionLastBaselineOffset,
    itemCaptionMetaBaselineOffset,
    itemTitleFirstLineRightReservePx,
    LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX,
    LABEL_CHIP_GAP_BETWEEN_PX,
    LABEL_CHIP_HEIGHT_PX,
    MIN_BAR_WIDTH_FOR_DOT_PX,
    MIN_BAR_WIDTH_FOR_FOOTNOTE_PX,
    MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX,
} from './item-bar-geometry.js';
export type { LayoutOptions, LayoutResult } from './layout.js';
export { layoutRoadmap } from './layout.js';
export {
    collectLayoutInsights,
    type LayoutInsight,
    type LayoutInsightContext,
    type LayoutInsightSeverity,
} from './layout-insights.js';
export { MARKER_BOLD_WIDTH_FACTOR } from './nodes/marker-geometry.js';
export {
    isNonWorkingDisplay,
    NON_WORKING_DISPLAYS,
    type NonWorkingDisplay,
    parseNonWorkingDisplay,
} from './non-working-display.js';
export {
    civilDateInZone,
    hasImpossibleNowDate,
    type NormalizedZone,
    normalizeZone,
    type ResolveTodayOptions,
    resolveToday,
    TimezoneError,
} from './resolve-today.js';
export type {
    RoadmapSchedule,
    ScheduledItem,
    ScheduledWave,
    ScheduleExtent,
    ScheduleOptions,
} from './schedule.js';
export { scheduleRoadmap } from './schedule.js';
export { fillLuminance } from './status-dot.js';
export { estimateTextWidth } from './text-measure.js';
export { contrastRatio, relativeLuminance } from './themes/contrast.js';
export {
    darkTheme,
    grayscaleTheme,
    lightTheme,
    normalizeThemeName,
    THEME_NAMES,
    type Theme,
    type ThemeName,
    themes,
} from './themes/index.js';
export {
    ACCENT_DASH_PATTERN,
    ATTRIBUTION_BAR_LOGICAL_WIDTH,
    ATTRIBUTION_BAR_LOGICAL_X,
    ATTRIBUTION_INE_LOGICAL_X,
    ATTRIBUTION_LINK,
    ATTRIBUTION_NOW_LOGICAL_X,
    ATTRIBUTION_PREFIX_FONT_SIZE,
    ATTRIBUTION_SCALE,
    ATTRIBUTION_TEXT,
    ATTRIBUTION_WORDMARK_FONT_SIZE,
    CORNER_RADIUS_PX,
    EDGE_CORNER_RADIUS,
    FONT_STACK,
    FOOTNOTE_HEADER_BASELINE_OFFSET_PX,
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FOOTNOTE_ROW_HEIGHT,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    HEADER_HEIGHT_PX,
    NON_WORKING_FILL_OPACITY,
    NOW_PILL_CORNER_RADIUS_PX,
    NOW_PILL_HEIGHT_PX,
    NOW_PILL_LABEL_BASELINE_OFFSET_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOW_PILL_WIDTH_PX,
    NOWLINE_STROKE_WIDTH_PX,
    PROGRESS_STRIP_HEIGHT_PX,
    TEXT_SIZE_PX,
    TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX,
    TIMELINE_TICK_LABEL_FONT_SIZE_PX,
    TIMELINE_TICK_PANEL_HEIGHT_PX,
    timelineTickLabelBaselineOffsetPx,
    WAVE_BOUNDARY_WIDTH_PX,
    WAVE_CELL_INSET_PX,
    WAVE_CROSS_DASH,
    WAVE_EMPTY_MARKER_SIZE_PX,
    WAVE_EMPTY_MARKER_STEP_PX,
    WAVE_HATCH_OPACITY,
    WAVE_HATCH_STROKE_PX,
    WAVE_HATCH_TILE_PX,
    WAVE_LABEL_HALO_INSET_Y_PX,
    WAVE_LABEL_HALO_PAD_PX,
    WAVE_LEGEND_BASELINE_OFFSET_PX,
    WAVE_LEGEND_ENTRY_GAP_PX,
    WAVE_LEGEND_GAP_PX,
    WAVE_LEGEND_LINE_PX,
    WAVE_LEGEND_SWATCH_GAP_PX,
    WAVE_LEGEND_SWATCH_HEIGHT_PX,
    WAVE_LEGEND_SWATCH_WIDTH_PX,
    WAVE_STRIP_HEIGHT_PX,
    WAVE_STRIP_LABEL_FONT_SIZE_PX,
    WAVE_STRIP_LABEL_PAD_PX,
    WAVE_STYLED_STRIP_MIX_OPACITY,
    WAVE_STYLED_TINT_OPACITY,
} from './themes/shared.js';
export * from './types.js';
export type {
    CalendarException,
    WorkingCalendar,
    WorkingExceptionRun,
} from './working-calendar.js';
export { calendarExceptions } from './working-calendar.js';
