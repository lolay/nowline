import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { URI } from 'langium';
import { parse, getServices } from '../helpers.js';
import { resolveIncludes } from '../../src/language/include-resolver.js';
import type { NowlineFile } from '../../src/generated/ast.js';

function makeFs(files: Record<string, string>): (p: string) => Promise<string> {
    return async (abs) => {
        const rel = path.relative('/root', abs);
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
}

async function parseAtPath(text: string, absPath: string) {
    const { shared } = getServices();
    const uri = URI.file(absPath);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc.parseResult.value;
}

describe('include resolver', () => {
    it('resolves a basic include with default merge mode', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `person sam "Sam"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(result.content.persons.has('sam')).toBe(true);
    });

    it('ignores config and roadmap when mode:ignore', async () => {
        const files = {
            'main.nowline': `include "./a.nowline" config:ignore roadmap:ignore\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `config\nscale weeks\nroadmap r2 "Child"\nperson sam "Sam"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.content.persons.size).toBe(0);
        expect(result.config.scale).toBeUndefined();
    });

    it('isolates a child when roadmap:isolate', async () => {
        const files = {
            'main.nowline': `include "./a.nowline" roadmap:isolate\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `roadmap child "Child"\nswimlane cs\n  item y duration:1w\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.content.isolatedRegions).toHaveLength(1);
        expect(result.content.isolatedRegions[0].content.roadmap?.name).toBe('child');
    });

    it('errors on isolate when child has no roadmap', async () => {
        const files = {
            'main.nowline': `include "./a.nowline" roadmap:isolate\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `person sam "Sam"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.some((d) => d.severity === 'error' && /no roadmap/i.test(d.message))).toBe(true);
    });

    it('detects circular includes', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `include "./b.nowline"\n`,
            'b.nowline': `include "./a.nowline"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.some((d) => d.severity === 'error' && /Circular include/i.test(d.message))).toBe(true);
    });

    it('detects duplicate includes in the same file', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\ninclude "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `person sam "Sam"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.some((d) => d.severity === 'error' && /Duplicate include/i.test(d.message))).toBe(true);
    });

    it('handles diamond includes without duplication error', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\ninclude "./b.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `include "./shared.nowline"\n`,
            'b.nowline': `include "./shared.nowline"\n`,
            'shared.nowline': `person sam "Sam"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(result.content.persons.has('sam')).toBe(true);
    });

    it('parent wins on collision with warning', async () => {
        const files = {
            'main.nowline': `include "./a.nowline"\nperson sam "Sam Parent"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            'a.nowline': `person sam "Sam Child"\n`,
        };
        const { Nowline } = getServices();
        const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
        const result = await resolveIncludes(main, '/root/main.nowline', {
            services: Nowline,
            readFile: makeFs(files),
        });
        expect(result.diagnostics.some((d) => d.severity === 'warning' && /shadowed/i.test(d.message))).toBe(true);
        expect(result.content.persons.get('sam')?.title).toBe('Sam Parent');
    });

    it('resolveIncludes integrates with a parsed NowlineFile', async () => {
        const r = await parse(`include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.includes).toHaveLength(1);
        expect(r.ast.includes[0].path).toBe('./a.nowline');
    });
});
