// The worked examples of specs/waves.md §11 that the layout wave tests lay
// out (engine A, engine C and the positioned wave model). `A2_PIN` in
// Example 9 is replaced per test with the pin variant under test.

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
  item a2 duration:2w wave:w2 A2_PIN
`;

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

// Example 16.
const teamFile = (team: string, design: string, build: string): string =>
    [
        'nowline v1',
        '',
        `roadmap ${team}-plan "${team}" start:2026-01-05 scale:1w calendar:full`,
        '',
        'wave plan "Plan"',
        'wave execute "Execute" after:2026-02-02',
        '',
        `swimlane ${team} "${team}"`,
        `  item ${team}-design duration:${design} wave:plan`,
        `  item ${team}-build duration:${build} wave:execute`,
        '',
    ].join('\n');

export const EXAMPLE_16 = {
    'teams/web.nowline': teamFile('web', '2w', '3w'),
    'teams/api.nowline': teamFile('api', '3w', '4w'),
    'program.nowline': [
        'nowline v1',
        '',
        'include "./teams/web.nowline"',
        'include "./teams/api.nowline"',
        '',
        'roadmap program "Program" start:2026-01-05 scale:1w calendar:full',
        '',
        'wave plan "Plan"',
        'wave execute "Execute" after:2026-02-02',
        '',
        'swimlane pmo "PMO"',
        '  item kickoff duration:1w wave:plan',
        '  item comms "Launch comms" duration:2w after:execute',
        '',
        'milestone done "Execute complete" after:execute',
        '',
    ].join('\n'),
};

export const EXAMPLE_19 = {
    'ios.nowline': [
        'nowline v1',
        '',
        'roadmap ios-app "iOS" start:2026-01-05 scale:1w',
        '',
        'wave w1 "Wave 1"',
        'wave w2 "Wave 2"',
        '',
        'swimlane ios',
        '  item ios-offline duration:4w wave:w1',
        '  item ios-push duration:1w wave:w2',
        '',
    ].join('\n'),
    'portfolio.nowline': [
        'nowline v1',
        '',
        'include "./ios.nowline" roadmap:isolate',
        '',
        'roadmap portfolio "Portfolio" start:2026-01-05 scale:1w',
        '',
        'wave w1 "Wave 1"',
        'wave w2 "Wave 2"',
        '',
        'swimlane platform',
        '  item pf-api duration:2w wave:w1',
        '  item pf-scale duration:2w wave:w2',
        '',
    ].join('\n'),
};
