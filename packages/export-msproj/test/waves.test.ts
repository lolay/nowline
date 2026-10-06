import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { exportMsProjXml } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

// Waves in the MS Project export (specs/waves.md §10).

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(resolve(here, '../../../examples/waves.nowline'), 'utf8');

interface ParsedTask {
    uid: number;
    id: number;
    name: string;
    outlineLevel: number;
    milestone: boolean;
    preds: number[];
}

function parseTasks(xml: string): ParsedTask[] {
    const block = xml.slice(xml.indexOf('<Tasks>'), xml.indexOf('</Tasks>'));
    return [...block.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map(([, body]) => ({
        uid: Number(/<UID>(\d+)<\/UID>/.exec(body)?.[1]),
        id: Number(/<ID>(\d+)<\/ID>/.exec(body)?.[1]),
        name: /<Name>([^<]*)<\/Name>/.exec(body)?.[1] ?? '',
        outlineLevel: Number(/<OutlineLevel>(\d+)<\/OutlineLevel>/.exec(body)?.[1]),
        milestone: body.includes('<Milestone>1</Milestone>'),
        preds: [...body.matchAll(/<PredecessorUID>(\d+)<\/PredecessorUID>/g)].map((m) =>
            Number(m[1]),
        ),
    }));
}

async function exportTasks(source: string, sink: (msg: string) => void = () => {}) {
    const inputs = await buildExportInputs(source);
    const xml = exportMsProjXml(inputs, { onLossy: sink });
    const tasks = parseTasks(xml);
    const byName = (name: string): ParsedTask => {
        const t = tasks.find((x) => x.name === name);
        if (!t) throw new Error(`no task named ${name}`);
        return t;
    };
    const uid = (name: string): number => byName(name).uid;
    return { xml, tasks, byName, uid };
}

describe('exportMsProjXml — waves (checkout-relaunch sample)', () => {
    it('appends one zero-duration wave-end milestone per wave, after every other task', async () => {
        const { tasks } = await exportTasks(SAMPLE);
        const ends = tasks.slice(-3);
        expect(ends.map((t) => t.name)).toEqual([
            'Foundations (wave end)',
            'Build (wave end)',
            'Launch (wave end)',
        ]);
        for (const t of ends) {
            expect(t.milestone).toBe(true);
            expect(t.outlineLevel).toBe(1);
        }
        const others = tasks.slice(0, -3);
        const maxUid = Math.max(...others.map((t) => t.uid));
        const maxId = Math.max(...others.map((t) => t.id));
        expect(ends.map((t) => t.uid)).toEqual([maxUid + 1, maxUid + 2, maxUid + 3]);
        expect(ends.map((t) => t.id)).toEqual([maxId + 1, maxId + 2, maxId + 3]);
    });

    it('links each wave-end task to its members and the previous wave end', async () => {
        const { byName, uid } = await exportTasks(SAMPLE);
        expect(byName('Foundations (wave end)').preds).toEqual([
            uid('Auth service split'),
            uid('Checkout UX research'),
            uid('Wallet SDK spike'),
        ]);
        expect(byName('Build (wave end)').preds).toEqual([
            uid('Payments API v2'),
            uid('Checkout v2'),
            uid('Accessibility pass'),
            uid('Wallet integration'),
            uid('Foundations (wave end)'),
        ]);
        expect(byName('Launch (wave end)').preds).toEqual([
            uid('Rate limits'),
            uid('Launch page'),
            uid('App store release'),
            uid('Build (wave end)'),
        ]);
    });

    it('links members of wave k >= 2 to wave k-1 end; wave 1 and background get none', async () => {
        const { byName, uid } = await exportTasks(SAMPLE);
        for (const name of ['Auth service split', 'Checkout UX research', 'Wallet SDK spike']) {
            expect(byName(name).preds).toEqual([]);
        }
        for (const name of [
            'Payments API v2',
            'Checkout v2',
            'Accessibility pass',
            'Wallet integration',
        ]) {
            expect(byName(name).preds).toEqual([uid('Foundations (wave end)')]);
        }
        for (const name of ['Rate limits', 'Launch page', 'App store release']) {
            expect(byName(name).preds).toEqual([uid('Build (wave end)')]);
        }
        expect(byName('On-call and KTLO').preds).toEqual([]);
    });

    it('resolves after:<wave> on milestones to the wave-end task', async () => {
        const { byName, uid } = await exportTasks(SAMPLE);
        expect(byName('Beta').preds).toEqual([uid('Build (wave end)')]);
        expect(byName('GA').preds).toEqual([uid('Launch (wave end)')]);
    });

    it('keeps the UIDs of every existing task when waves are added', async () => {
        const plain = SAMPLE.replace(/^wave .*\n/gm, '')
            .replace(/ wave:\w+/g, '')
            .replace(/^ {2}group\n/m, '  group grp\n')
            .replace(/ after:(build|launch)/g, '');
        const withWaves = SAMPLE.replace(/^ {2}group wave:build$/m, '  group grp wave:build');
        const a = await exportTasks(plain);
        const b = await exportTasks(withWaves);
        const pairs = (ts: ParsedTask[]) => ts.map((t) => [t.uid, t.id, t.name]);
        expect(a.tasks.length).toBeGreaterThan(10);
        expect(pairs(b.tasks).slice(0, a.tasks.length)).toEqual(pairs(a.tasks));
    });

    it('dedupes a barrier link against an explicit after: on the same task', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05

wave one "One"
wave two "Two"

swimlane a
  item a1 duration:1w wave:one
  item a2 duration:1w wave:two after:[one, a1]
`;
        const { byName, uid } = await exportTasks(src);
        expect(byName('a2').preds).toEqual([uid('One (wave end)'), uid('a1')]);
    });

    it('counts members without an id as wave-member-no-id', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05

wave one "One"
wave two "Two"

swimlane a
  item a1 duration:1w wave:one
  item "Untitled work" duration:1w wave:two
`;
        const sink = vi.fn();
        const { byName, uid } = await exportTasks(src, sink);
        // The anonymous member still waits for the barrier ...
        expect(byName('Untitled work').preds).toEqual([uid('One (wave end)')]);
        // ... but cannot be linked into its own wave's end.
        expect(byName('Two (wave end)').preds).toEqual([uid('One (wave end)')]);
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0][0]).toContain('wave-member-no-id (1)');
        expect(sink.mock.calls[0][0]).not.toContain('wave-floor');
    });

    it('reports no wave drop kinds for the sample', async () => {
        const sink = vi.fn();
        await exportTasks(SAMPLE, sink);
        const messages = sink.mock.calls.map((c) => c[0] as string).join('\n');
        expect(messages).not.toContain('wave-');
    });
});

// specs/waves.md Example 11.
const EXAMPLE_11 = `nowline v1

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

describe('exportMsProjXml — wave floors (Example 11)', () => {
    it('makes an anchor floor a predecessor of every member and of the wave-end task', async () => {
        const sink = vi.fn();
        const { byName, uid } = await exportTasks(EXAMPLE_11, sink);
        const planEnd = uid('Plan (wave end)');
        const floor = uid('FY budget release');
        expect(byName('a2').preds).toEqual([planEnd, floor]);
        expect(byName('b2').preds).toEqual([planEnd, floor]);
        expect(byName('a1').preds).toEqual([]);
        expect(byName('Execute (wave end)').preds).toEqual([uid('a2'), uid('b2'), floor, planEnd]);
        expect(byName('Execute complete').preds).toEqual([uid('Execute (wave end)')]);
        expect(sink).not.toHaveBeenCalled();
    });

    it('drops an inline-date floor and counts it as wave-floor', async () => {
        const src = EXAMPLE_11.replace('after:fy-budget', 'after:2026-02-02');
        const sink = vi.fn();
        const { byName, uid } = await exportTasks(src, sink);
        expect(byName('a2').preds).toEqual([uid('Plan (wave end)')]);
        expect(byName('Execute (wave end)').preds).toEqual([
            uid('a2'),
            uid('b2'),
            uid('Plan (wave end)'),
        ]);
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0][0]).toContain('wave-floor (1)');
    });

    it('makes a dated-milestone floor a predecessor too', async () => {
        const src = EXAMPLE_11.replace(
            'anchor fy-budget "FY budget release" date:2026-02-02',
            'milestone fy-budget "FY budget release" date:2026-02-02',
        );
        const { byName, uid } = await exportTasks(src);
        expect(byName('b2').preds).toEqual([uid('Plan (wave end)'), uid('FY budget release')]);
    });
});

describe('exportMsProjXml — parallel wave:build', () => {
    it('links every track member, including items in a track group, to the barrier', async () => {
        const src = `nowline v1

roadmap par "Parallel waves" start:2026-01-05

wave plan "Plan"
wave build "Build"

swimlane eng "Eng"
  item spec duration:1w wave:plan
  parallel tracks wave:build
    item api duration:2w
    group ui-track "UI track"
      item ui duration:1w
      item polish duration:1w
  item ship duration:1w
`;
        const { byName, uid } = await exportTasks(src);
        const planEnd = uid('Plan (wave end)');
        for (const name of ['api', 'ui', 'polish']) {
            expect(byName(name).preds).toEqual([planEnd]);
        }
        expect(byName('ship').preds).toEqual([]);
        expect(byName('UI track').preds).toEqual([]);
        expect(byName('Build (wave end)').preds).toEqual([
            uid('api'),
            uid('ui'),
            uid('polish'),
            planEnd,
        ]);
    });
});
