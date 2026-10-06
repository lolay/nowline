// Worked examples from specs/waves.md §11 and a diagnostics helper, shared by
// the wave validation tests. Line numbers in the tests refer to these sources
// exactly as written.

import type { Diagnostic } from 'langium';
import { expect } from 'vitest';
import { parse } from '../helpers.js';

export type Diag = {
    line: number;
    severity: 'error' | 'warning' | 'info';
    code?: string;
    message: string;
};

// Diagnostics in source order (Langium reports file-scope checks after the
// node-scope ones).
export function diags(diagnostics: Diagnostic[]): Diag[] {
    const sorted = [...diagnostics].sort(
        (a, b) =>
            a.range.start.line - b.range.start.line ||
            a.range.start.character - b.range.start.character,
    );
    return sorted.map((d) => ({
        line: d.range.start.line + 1,
        severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info',
        ...((d.data as { code?: string } | undefined)?.code
            ? { code: (d.data as { code: string }).code }
            : {}),
        message: d.message,
    }));
}

export async function check(src: string): Promise<Diag[]> {
    const r = await parse(src);
    expect(r.lexerErrors).toEqual([]);
    expect(r.parserErrors).toEqual([]);
    return diags(r.diagnostics);
}

// Example 1: three lanes, three waves
export const EXAMPLE_1 = `nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane web "Web"
  item web-research "UX research" duration:2w wave:discover
  item web-build "Checkout v2" duration:3w wave:build
  item web-launch "Launch page" duration:1w wave:launch
swimlane api "API"
  item api-spike "API spike" duration:1w wave:discover
  item api-build "Payments API" duration:4w wave:build
  item api-launch "Rate limits" duration:1w wave:launch
swimlane data "Data"
  item data-audit "Data audit" duration:3w wave:discover
  item data-build "Pipeline" duration:2w wave:build
  item data-launch "Dashboards" duration:2w wave:launch
`;

// Example 2: a lane with no work in the middle wave
export const EXAMPLE_2 = `nowline v1

roadmap gap-lane "Gap lane" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"
wave w3 "Wave 3"

swimlane platform
  item auth duration:2w wave:w1
  item sso duration:2w wave:w2
  item audit duration:1w wave:w3
swimlane mobile
  item offline duration:3w wave:w1
  item push duration:2w wave:w3
`;

// Example 3: background work
export const EXAMPLE_3 = `nowline v1

roadmap background "Background work" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Rollout"

swimlane core
  item schema duration:2w wave:w1
  item docs "Docs refresh" duration:2w
  item migrate duration:2w wave:w2
swimlane ops
  item oncall "On-call rotation" duration:6w
swimlane infra
  item infra-prep duration:3w wave:w1
  item cutover duration:1w wave:w2
`;

// Example 4: parallel tracks in different waves
export const EXAMPLE_4 = `nowline v1

roadmap split "Split parallel" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Features"

swimlane platform
  item kickoff-work duration:1w wave:w1
  parallel streams
    group api-track wave:w1
      item api-v2 duration:2w
      item api-docs duration:1w
    item sdk-update duration:2w wave:w2
  item integration duration:1w wave:w2
swimlane mobile
  item mobile-spike duration:5w wave:w1
`;

// Example 5: a group that spans waves, and inheritance from a group
export const EXAMPLE_5 = `nowline v1

roadmap spanning "Spanning group" start:2026-01-05 scale:1w

wave w1 "Design"
wave w2 "Build"

swimlane checkout
  group checkout-v2 "Checkout v2"
    item flows duration:2w wave:w1
    item ui duration:3w wave:w2
  item polish duration:1w wave:w2
swimlane payments
  item vendor-eval duration:4w wave:w1
  group wave:w2
    item integrate duration:2w
    item certify duration:1w
`;

// Example 6: a cross-lane `after:` inside one wave
export const EXAMPLE_6 = `nowline v1

roadmap same-wave "Same-wave dependency" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
swimlane frontend
  item mocks duration:1w wave:w1
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
`;

// Example 7: lane order matters for cross-lane `after:`
export const EXAMPLE_7 = `nowline v1

roadmap lane-order "Lane order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane frontend
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
`;

// Example 8: `after:<wave>` on background work and milestones
export const EXAMPLE_8 = `nowline v1

roadmap wave-refs "Wave references" start:2026-01-05 scale:1w

wave alpha "Alpha"
wave beta "Beta"

swimlane eng
  item core duration:3w wave:alpha
  item hardening duration:2w wave:beta
swimlane gtm "Go-to-market"
  item pricing duration:2w wave:alpha
  item press-kit duration:2w after:alpha
  item launch-event duration:1w after:beta

milestone alpha-done "Alpha complete" after:alpha
milestone ga "GA" after:[beta, launch-event]
`;

// Example 9: an anchor and an inline date pin against a barrier
export const EXAMPLE_9 = `nowline v1

roadmap dates "Dates vs barriers" start:2026-01-05 scale:1w calendar:full

anchor budget "Budget release" date:2026-02-09

wave w1 "Integrate"
wave w2 "Launch"

swimlane infra
  item i1 duration:4w wave:w1
  item i2 duration:2w wave:w2 after:budget
swimlane apps
  item a1 duration:1w wave:w1
  item a2 duration:2w wave:w2 after:2026-01-19
`;

// Example 10: a `before:` deadline pushed past by a barrier
export const EXAMPLE_10 = `nowline v1

roadmap deadline "Deadline vs barrier" start:2026-01-05 scale:1w calendar:full

anchor freeze "Code freeze" date:2026-02-16

wave w1 "Build"
wave w2 "Harden"

swimlane web
  item web-a duration:2w wave:w1
  item web-b duration:2w wave:w2 before:freeze
swimlane api
  item api-a duration:5w wave:w1
`;

// Example 11: a wave start floor (gap) and a wave deadline
export const EXAMPLE_11 = `nowline v1

roadmap budget-floor "Budget-held rollout" start:2026-01-05 scale:1w calendar:full

anchor fy-budget "FY budget release" date:2026-02-02

wave plan "Plan"
wave execute "Execute" after:fy-budget

swimlane a
  item a1 duration:2w wave:plan
  item a2 duration:5w wave:execute
swimlane b
  item b1 duration:3w wave:plan
  item b2 duration:7w wave:execute

milestone exec-done "Execute complete" date:2026-03-16 after:execute
`;

// Example 12: an empty wave
export const EXAMPLE_12 = `nowline v1

roadmap placeholder "Placeholder" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Hardening (TBD)"
wave w3 "Wave 3"

swimlane a
  item a1 duration:2w wave:w1
  item a3 duration:1w wave:w3
swimlane b
  item b1 duration:1w wave:w1
  item b3 duration:2w wave:w3
`;

// Example 13 (invalid): out-of-order waves in a lane
export const EXAMPLE_13 = `nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w2
  item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
`;

// Example 13, first fix: move a1 below a3.
export const EXAMPLE_13_FIX_MOVE = `nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
  item a1 duration:2w wave:w2
`;

// Example 13, second fix: a1 in a parallel track beside a group of a2 and a3.
export const EXAMPLE_13_FIX_PARALLEL = `nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  parallel
    item a1 duration:2w wave:w2
    group
      item a2 duration:1w wave:w1
      item a3 duration:1w wave:w1
`;

// Example 13, the non-fix: only a1 and a2 in the parallel, a3 after the block.
export const EXAMPLE_13_JOIN = `nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  parallel
    item a1 duration:2w wave:w2
    item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
`;

// Example 14 (invalid): after: a later wave, after: its own wave, and an unmeetable before:
export const EXAMPLE_14 = `nowline v1

roadmap refs "Bad references" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane s
  item a duration:2w wave:w2

swimlane t
  item b duration:1w wave:w1 after:a
  item c duration:1w wave:w1 after:w1

swimlane u
  item d duration:1w wave:w2 before:b
`;

// Example 15 (invalid): a hidden chain through background work
export const EXAMPLE_15 = `nowline v1

roadmap hidden "Hidden chain" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
swimlane b
  item review "Vendor review" duration:1w after:a2
  item b1 duration:1w wave:w1
`;

// Example 18 (includes, valid): a vocabulary-only child. Includes are out of
// scope for the validator, so people.nowline's declarations are inlined into
// plan.nowline's roadmap section.
export const EXAMPLE_18 = `nowline v1

roadmap plan "Plan" start:2026-01-05 scale:1w

person sam "Sam Chen"
team platform-team "Platform"
  person sam
label risky "Risky"

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane platform owner:platform-team
  item auth duration:2w wave:w1 owner:sam
  item sso duration:1w wave:w2 labels:risky
`;

// Example 20 (invalid): declaration and assignment errors
export const EXAMPLE_20 = `nowline v1

roadmap gallery "Errors" start:2026-01-05 scale:1w

anchor budget date:2026-03-02
wave w1 "Wave 1"
wave "Wave 2"
wave w2 "Wave 2" before:budget
wave w3 "Wave 3" after:a1

swimlane a wave:w1
  item a1 duration:1w
  group g wave:w1
    item a2 duration:1w wave:w2
  item a3 duration:1w wave:w9
  item a4 duration:1w wave:[w1, w2]
  item a5 duration:1w wave:w4

wave w4 "Wave 4"

milestone m "M" wave:w1 after:a1
`;

// Example 21 (compatibility): a v1 file with a stray `wave:` key
export const EXAMPLE_21 = `nowline v1

config

default item wave:alpha

roadmap legacy "Legacy" start:2026-01-05 scale:1w

swimlane a wave:alpha
  item a1 duration:1w wave:alpha
`;
