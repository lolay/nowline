import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';

describe('every keyword', () => {
    it('parses anchor with bare id + date:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
anchor kickoff date:2026-01-06
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses anchor with title + date:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
anchor kickoff "Kickoff" date:2026-01-06
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with after:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
milestone beta "Beta" after:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with date and multiple after:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
swimlane s
  item x duration:1w
  item y duration:1w
milestone ga "GA" date:2026-06-01 after:[x, y]
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with single on:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
footnote note "Note" on:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with multiple on:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
  item y duration:1w
footnote note "Note" on:[x, y]
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with items', async () => {
        const r = await parse(`roadmap r
swimlane s
  parallel
    item a duration:1w
    item b duration:2w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses group with items', async () => {
        const r = await parse(`roadmap r
swimlane s
  group g "Group"
    item a duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with groups', async () => {
        const r = await parse(`roadmap r
swimlane s
  parallel
    group g1 "G1"
      item a duration:1w
    group g2 "G2"
      item b duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses team with nested persons and teams', async () => {
        const r = await parse(`roadmap r
person sam "Sam"
team eng "Engineering"
  team platform "Platform"
    person sam
  team mobile "Mobile"
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses nowline directive variants', async () => {
        for (const version of ['v1', 'v2', 'v10']) {
            const r = await parse(`nowline ${version}\nroadmap r\nswimlane s\n  item x duration:1w\n`, { validate: false });
            expect(r.parserErrors).toEqual([]);
            expect(r.ast.directive?.version).toBe(version);
        }
    });

    it('parses scale block', async () => {
        const r = await parse(`config
scale
  name: weeks
  label-every: 2
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses calendar block', async () => {
        const r = await parse(`config
calendar
  days-per-week: 5
  days-per-month: 22
  days-per-quarter: 65
  days-per-year: 260
roadmap r calendar:custom
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses style declaration with indented properties', async () => {
        const r = await parse(`config
style enterprise "Enterprise"
  bg: blue
  fg: navy
  border: solid
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses flat default declarations', async () => {
        const r = await parse(`config
default item shadow:subtle
default swimlane padding:sm
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses roadmap-section size/status/label declarations', async () => {
        const r = await parse(`roadmap r
size xs effort:1d
status awaiting-review
label security "Security"
swimlane s
  item x size:xs status:awaiting-review labels:security
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses capacity: integer/decimal/percent on items', async () => {
        const r = await parse(`roadmap r
swimlane s capacity:5
  item a duration:1w capacity:2
  item b duration:1w capacity:0.5
  item c duration:1w capacity:50%
  item d duration:1w capacity:12.5%
`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses overcapacity:show|hide on swimlane and default', async () => {
        const r = await parse(`config
default swimlane overcapacity:hide
roadmap r
swimlane platform capacity:5 overcapacity:show
  item x duration:1w capacity:2
swimlane mobile capacity:2 overcapacity:hide
  item y duration:1w capacity:1
`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses utilization-warn-at: and utilization-over-at: in percent, decimal, integer, and `none` forms on swimlane and default swimlane', async () => {
        const r = await parse(`config
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
`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses capacity-icon: identifier and string forms in style + default', async () => {
        const r = await parse(`config
style finance
  capacity-icon: budget
style adhoc
  capacity-icon: "⚙"
default swimlane capacity-icon:person
roadmap r
swimlane s capacity:3
  item x duration:1w capacity:1
`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });

    it('parses glyph declarations in config (inline + with description)', async () => {
        const r = await parse(`config
glyph budget "Budget" unicode:"💰" ascii:"$"
glyph fte unicode:"\\u{1F464}" ascii:"@"
glyph star unicode:"⭐"
  description "Custom star glyph"
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.lexerErrors).toEqual([]);
        expect(r.parserErrors).toEqual([]);
    });
});
