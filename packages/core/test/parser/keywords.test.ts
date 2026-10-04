import { describe, expect, it } from 'vitest';
import {
    type EntityProperty,
    isSwimlaneDeclaration,
    isWaveDeclaration,
    type WaveDeclaration,
} from '../../src/generated/ast.js';
import { parse } from '../helpers.js';

describe('every keyword', () => {
    it('parses anchor with bare id + date:', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01
anchor kickoff date:2026-01-06
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses anchor with title + date:', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01
anchor kickoff "Kickoff" date:2026-01-06
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with after:', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item x duration:1w
milestone beta "Beta" after:x
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with date and multiple after:', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01
swimlane s
  item x duration:1w
  item y duration:1w
milestone ga "GA" date:2026-06-01 after:[x, y]
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with single on:', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item x duration:1w
footnote note "Note" on:x
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with multiple on:', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item x duration:1w
  item y duration:1w
footnote note "Note" on:[x, y]
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with items', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  parallel
    item a duration:1w
    item b duration:2w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses group with items', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  group g "Group"
    item a duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with groups', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  parallel
    group g1 "G1"
      item a duration:1w
    group g2 "G2"
      item b duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses team with nested persons and teams', async () => {
        const r = await parse(
            `roadmap r
person sam "Sam"
team eng "Engineering"
  team platform "Platform"
    person sam
  team mobile "Mobile"
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses nowline directive variants', async () => {
        for (const version of ['v1', 'v2', 'v10']) {
            const r = await parse(
                `nowline ${version}\nroadmap r\nswimlane s\n  item x duration:1w\n`,
                { validate: false },
            );
            expect(r.parserErrors).toEqual([]);
            expect(r.ast.directive?.version).toBe(version);
        }
    });

    it('parses scale block', async () => {
        const r = await parse(
            `config
scale
  name: weeks
  label-every: 2
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses calendar block', async () => {
        const r = await parse(
            `config
calendar
  days-per-week: 5
  days-per-month: 22
  days-per-quarter: 65
  days-per-year: 260
roadmap r calendar:custom
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses style declaration with indented properties', async () => {
        const r = await parse(
            `config
style enterprise "Enterprise"
  bg: blue
  fg: navy
  border: solid
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses flat default declarations', async () => {
        const r = await parse(
            `config
default item shadow:subtle
default swimlane padding:sm
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses roadmap-section size/status/label declarations', async () => {
        const r = await parse(
            `roadmap r
size xs effort:1d
status awaiting-review
label security "Security"
swimlane s
  item x size:xs status:awaiting-review labels:security
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses capacity: integer/decimal/percent on items', async () => {
        const r = await parse(
            `roadmap r
swimlane s capacity:5
  item a duration:1w capacity:2
  item b duration:1w capacity:0.5
  item c duration:1w capacity:50%
  item d duration:1w capacity:12.5%
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses overcapacity:show|hide on swimlane and default', async () => {
        const r = await parse(
            `config
default swimlane overcapacity:hide
roadmap r
swimlane platform capacity:5 overcapacity:show
  item x duration:1w capacity:2
swimlane mobile capacity:2 overcapacity:hide
  item y duration:1w capacity:1
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses utilization-warn-at: and utilization-over-at: in percent, decimal, integer, and `none` forms on swimlane and default swimlane', async () => {
        const r = await parse(
            `config
default swimlane utilization-warn-at:80% utilization-over-at:100%
roadmap r
swimlane percent capacity:5 utilization-warn-at:75% utilization-over-at:120%
  item a duration:1w capacity:2
swimlane decimal capacity:5 utilization-warn-at:0.5 utilization-over-at:1.25
  item b duration:1w capacity:2
swimlane integer capacity:5 utilization-warn-at:80 utilization-over-at:100
  item c duration:1w capacity:2
swimlane opt-out capacity:5 utilization-warn-at:none utilization-over-at:none
  item d duration:1w capacity:2
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses capacity-icon: identifier and string forms in style + default', async () => {
        const r = await parse(
            `config
style finance
  capacity-icon: budget
style adhoc
  capacity-icon: "⚙"
default swimlane capacity-icon:person
roadmap r
swimlane s capacity:3
  item x duration:1w capacity:1
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses symbol declarations in config (inline + with description)', async () => {
        const r = await parse(
            `config
symbol budget "Budget" unicode:"💰" ascii:"$"
symbol fte unicode:"\\u{1F464}" ascii:"@"
symbol star unicode:"⭐"
  description "Custom star symbol"
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });
});

// specs/waves.md §4.1-4.2: the `wave` declaration lives in the roadmap section,
// shaped like `label` / `size` / `status`.
describe('wave declaration', () => {
    async function parseWaves(body: string): Promise<WaveDeclaration[]> {
        const r = await parse(`roadmap r start:2026-01-05\n${body}`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
        return r.ast.roadmapEntries.filter(isWaveDeclaration);
    }

    function props(decl: WaveDeclaration): Array<Pick<EntityProperty, 'key' | 'value' | 'values'>> {
        return decl.properties.map((p) => ({ key: p.key, value: p.value, values: p.values }));
    }

    it('parses a bare wave id', async () => {
        const [w] = await parseWaves('wave build\n');
        expect(w.$type).toBe('WaveDeclaration');
        expect(w.name).toBe('build');
        expect(w.title).toBeUndefined();
        expect(w.properties).toEqual([]);
    });

    it('parses a wave id + title', async () => {
        const [w] = await parseWaves('wave build "Build"\n');
        expect(w.name).toBe('build');
        expect(w.title).toBe('Build');
    });

    it('parses a wave with a single after: floor', async () => {
        const [w] = await parseWaves(
            'anchor fy-budget date:2026-02-02\nwave launch "Launch" after:fy-budget\n',
        );
        expect(w.name).toBe('launch');
        expect(w.title).toBe('Launch');
        expect(props(w)).toEqual([{ key: 'after', value: 'fy-budget', values: [] }]);
    });

    it('parses a wave with an after: list mixing an id and an ISO date', async () => {
        const [w] = await parseWaves(
            'anchor fy-budget date:2026-02-02\nwave launch after:[fy-budget, 2026-02-02]\n',
        );
        expect(w.name).toBe('launch');
        expect(props(w)).toEqual([
            { key: 'after', value: undefined, values: ['fy-budget', '2026-02-02'] },
        ]);
    });

    it('parses a wave with style:', async () => {
        const [w] = await parseWaves('wave w style:teal\n');
        expect(w.name).toBe('w');
        expect(props(w)).toEqual([{ key: 'style', value: 'teal', values: [] }]);
    });

    it('parses a wave with an indented description', async () => {
        const [w] = await parseWaves(
            'wave build "Build"\n  description "Everything that ships behind the flag"\nwave launch\n',
        );
        expect(w.name).toBe('build');
        expect(w.description?.text).toBe('Everything that ships behind the flag');
    });

    it('parses a title-only wave (no id; the validator reports NL.E1100)', async () => {
        const [w] = await parseWaves('wave "Untitled"\n');
        expect(w.name).toBeUndefined();
        expect(w.title).toBe('Untitled');
    });

    it('parses a full roadmap with three waves and wave: on items and a group', async () => {
        // specs/waves/samples/checkout-relaunch.nowline
        const r = await parse(
            `nowline v1

roadmap checkout-relaunch "Checkout relaunch" author:"Product Engineering" start:2026-01-05 scale:1w calendar:full

wave foundations "Foundations"
wave build "Build"
wave launch "Launch"

swimlane platform "Platform"
  item auth "Auth service split" duration:4w wave:foundations status:done
  item payments-api "Payments API v2" duration:8w wave:build status:in-progress remaining:60%
  item rate-limits "Rate limits" duration:2w wave:launch

swimlane web "Web"
  item ux-research "Checkout UX research" duration:2w wave:foundations status:done
  group wave:build
    item checkout-v2 "Checkout v2" duration:4w status:in-progress remaining:30%
    item a11y "Accessibility pass" duration:2w
  item launch-page "Launch page" duration:2w wave:launch

swimlane mobile "Mobile"
  item wallet-spike "Wallet SDK spike" duration:6w wave:foundations status:done
  item wallet "Wallet integration" duration:4w wave:build status:in-progress remaining:25%
  item store-release "App store release" duration:4w wave:launch

// No wave: background work. Never held by a barrier, drawn hatched.
swimlane ops "Ops"
  item on-call "On-call and KTLO" duration:18w

milestone beta "Beta" after:build
milestone ga "GA" after:launch
`,
            { validate: false },
        );
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl?.name).toBe('checkout-relaunch');
        const waves = r.ast.roadmapEntries.filter(isWaveDeclaration);
        expect(waves.map((w) => [w.name, w.title])).toEqual([
            ['foundations', 'Foundations'],
            ['build', 'Build'],
            ['launch', 'Launch'],
        ]);
        const lanes = r.ast.roadmapEntries.filter(isSwimlaneDeclaration);
        expect(lanes.map((l) => l.name)).toEqual(['platform', 'web', 'mobile', 'ops']);
        const web = lanes[1];
        const group = web.content[1];
        expect(group.$type).toBe('GroupBlock');
        if (group.$type !== 'GroupBlock') throw new Error('expected group');
        expect(group.name).toBeUndefined();
        expect(group.properties.map((p) => [p.key, p.value])).toEqual([['wave', 'build']]);
        const auth = lanes[0].content[0];
        if (auth.$type !== 'ItemDeclaration') throw new Error('expected item');
        expect(auth.properties.find((p) => p.key === 'wave')?.value).toBe('foundations');
    });
});
