// The curated render lists for examples/ and tests/. Shared by the render
// scripts (scripts/render-samples.mjs, scripts/render-tests.mjs) and the
// review gallery (scripts/gallery/), so the gallery shows exactly what the
// build renders, in the order a reader should step through it.

// All examples share `start: 2026-01-05` (Monday, week 2) and
// `now: 2026-02-09` (Monday, ~5 weeks in) so the now-line lands at the same
// column across every diagram and `status:done` / `in-progress` / `at-risk`
// items are visibly distinguishable.
export const NOW = '2026-02-09';

// One entry per render, in reading order: the progressive examples from the
// root README first, then theme variants beside their base. `now` seeds the
// now-line so the output matches the vertical line position in the
// corresponding `specs/samples/<slug>.svg` (where one exists). `description`
// is optional; the gallery falls back to the source's leading comment block.
export const EXAMPLES = [
    {
        slug: 'minimal',
        source: 'examples/minimal.nowline',
        theme: 'light',
        now: NOW,
        description: 'Smallest complete file.',
    },
    { slug: 'capacity', source: 'examples/capacity.nowline', theme: 'light', now: NOW },
    { slug: 'sizing', source: 'examples/sizing.nowline', theme: 'light', now: NOW },
    {
        slug: 'teams',
        source: 'examples/teams.nowline',
        theme: 'light',
        now: NOW,
        description: 'Persons, teams, anchors, milestones, footnotes.',
    },
    {
        slug: 'product',
        source: 'examples/product.nowline',
        theme: 'light',
        now: NOW,
        description: 'Full config, styles, labels, parallels, groups, descriptions.',
    },
    {
        slug: 'long',
        source: 'examples/long.nowline',
        theme: 'light',
        now: NOW,
        description:
            'Stress test: eight swimlanes, ~160 items, parallels, groups, anchors, milestones, footnotes, cross-cutting labels.',
    },
    {
        slug: 'nested',
        source: 'examples/nested.nowline',
        theme: 'light',
        now: NOW,
        description:
            'Parent Security swimlane plus five isolated per-team roadmap includes (iOS, Android, Web, Platform, Data). Demonstrates `roadmap:isolate`.',
    },
    { slug: 'waves', source: 'examples/waves.nowline', theme: 'light', now: NOW },
    { slug: 'waves-dark', source: 'examples/waves.nowline', theme: 'dark', now: NOW },
    {
        slug: 'waves-grayscale',
        source: 'examples/waves.nowline',
        theme: 'grayscale',
        now: NOW,
    },
    { slug: 'waves-program', source: 'examples/waves-program.nowline', theme: 'light', now: NOW },
    {
        slug: 'platform-2026',
        source: 'examples/platform-2026.nowline',
        theme: 'light',
        now: NOW,
        description: 'Platform roadmap; sample-fidelity reference for specs/samples/.',
    },
    {
        slug: 'platform-2026-dark',
        source: 'examples/platform-2026.nowline',
        theme: 'dark',
        now: NOW,
    },
    {
        slug: 'platform-2026-grayscale',
        source: 'examples/platform-2026.nowline',
        theme: 'grayscale',
        now: NOW,
    },
    {
        slug: 'dependencies',
        source: 'examples/dependencies.nowline',
        theme: 'light',
        now: NOW,
        description: 'Dependency arrows between items; sample-fidelity reference.',
    },
    {
        slug: 'isolate-include',
        source: 'examples/isolate-include.nowline',
        theme: 'light',
        now: NOW,
        description: 'A partner roadmap included with `roadmap:isolate`.',
    },
    {
        slug: 'partner',
        source: 'examples/partner.nowline',
        theme: 'light',
        now: NOW,
        description: 'The partner roadmap on its own (the child of isolate-include).',
    },
    {
        slug: 'inline-date-pins',
        source: 'examples/inline-date-pins.nowline',
        theme: 'light',
        now: NOW,
    },
    { slug: 'showcase', source: 'examples/showcase.nowline', theme: 'light', now: NOW },
    {
        slug: 'working-calendar',
        source: 'examples/working-calendar.nowline',
        theme: 'light',
        now: NOW,
    },
];

// `now` is pinned per-fixture so the now-line lands at a stable, useful spot
// regardless of when the script runs. All starter fixtures share the same
// canonical window as the examples (`start: 2026-01-05`, `now: 2026-02-09`)
// so a side-by-side compare lines up date columns across the harness and the
// demos. Sources are `tests/<slug>.nowline`.
//
// `defaults-no-start-no-now` is the deliberate exception: it omits both
// `start:` (in the source) and `now` (here) so the rendered output exercises
// the layout's "no start -> today" + renderer's "no --now -> today"
// defaults. Its rendered SVG drifts every day, so it's intentionally NOT a
// snapshot fixture, and the gallery never reports it as changed.
export const TESTS = [
    { slug: 'large-roadmap-title', theme: 'light', now: NOW },
    { slug: 'large-swimlane-title', theme: 'light', now: NOW },
    { slug: 'text-fits-inside-bars', theme: 'light', now: NOW },
    { slug: 'text-spills-right', theme: 'light', now: NOW },
    // Its roadmap starts 2026-04-06, so `now` is pinned inside that window
    // (the shared NOW would sit before the timeline and hide the now-line).
    { slug: 'text-wraps-inside-bars', theme: 'light', now: '2026-05-11' },
    // Same window as text-wraps-inside-bars (starts 2026-04-06).
    { slug: 'title-line-breaks', theme: 'light', now: '2026-05-11' },
    { slug: 'item-bumps-up', theme: 'light', now: NOW },
    { slug: 'isolate-include-multi', theme: 'light', now: NOW },
    { slug: 'defaults-no-start-no-now', theme: 'light' },
    { slug: 'capacity-items', theme: 'light', now: NOW },
    { slug: 'capacity-lanes', theme: 'light', now: NOW },
    { slug: 'size-and-capacity', theme: 'light', now: NOW },
    { slug: 'utilization-states', theme: 'light', now: NOW },
    { slug: 'nested-both-headers', theme: 'light', now: NOW },
    { slug: 'header-height-xl', theme: 'light', now: NOW },
    { slug: 'header-height-none', theme: 'light', now: NOW },
    { slug: 'inline-date-corners', theme: 'light', now: NOW },
    { slug: 'late-row-shifts', theme: 'light', now: NOW },
    { slug: 'marker-predecessor-arrows', theme: 'light', now: NOW },
    { slug: 'milestone-overrun', theme: 'light', now: NOW },
    { slug: 'waves-empty', theme: 'light', now: NOW },
    { slug: 'waves-parallel-group', theme: 'light', now: NOW },
    { slug: 'waves-gap-deadline', theme: 'light', now: NOW },
    { slug: 'waves-isolate', theme: 'light', now: NOW },
    { slug: 'waves-coarse', theme: 'light', now: NOW },
    // Its roadmap starts 2026-01-05 and runs to Feb 2, so `now` is pinned inside
    // that window (the shared NOW would sit after it and hide the now-line).
    { slug: 'weekends-show', theme: 'light', now: '2026-01-14' },
    // Both start 2026-11-23, so `now` is pinned inside the window (m2p phase 5b).
    { slug: 'non-working-hide', theme: 'light', now: '2026-11-25' },
    { slug: 'non-working-show', theme: 'light', now: '2026-11-25' },
    // Starts 2026-11-30, so `now` is pinned inside the window.
    { slug: 'working-exceptions', theme: 'light', now: '2026-12-02' },
    // Starts 2026-01-05 and runs one week, so `now` is pinned inside it.
    { slug: 'marker-left-overflow', theme: 'light', now: '2026-01-07' },
    // Starts 2026-06-01; `now` sits inside the Summer Fridays run.
    { slug: 'non-working-recurrence', theme: 'light', now: '2026-07-15' },
    { slug: 'logo-beside', theme: 'light', now: NOW },
    { slug: 'logo-above-xl', theme: 'light', now: NOW },
];

// The gallery's sections, in reading order. Each entry resolves to a source
// file and the SVG the render scripts write for it.
export const GALLERY_GROUPS = [
    {
        id: 'examples',
        title: 'Examples',
        entries: EXAMPLES.map((e) => ({ ...e, svg: `examples/${e.slug}.svg` })),
    },
    {
        id: 'tests',
        title: 'Tests',
        entries: TESTS.map((e) => ({
            ...e,
            source: `tests/${e.slug}.nowline`,
            svg: `tests/${e.slug}.svg`,
        })),
    },
];
