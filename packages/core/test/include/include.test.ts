import * as path from 'node:path';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile } from '../../src/generated/ast.js';
import { resolveIncludes } from '../../src/language/include-resolver.js';
import { getServices, parse } from '../helpers.js';

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
            'a.nowline': `config\nscale\n  name: weeks\nroadmap r2 "Child"\nperson sam "Sam"\n`,
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
        expect(
            result.diagnostics.some((d) => d.severity === 'error' && /no roadmap/i.test(d.message)),
        ).toBe(true);
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
        expect(
            result.diagnostics.some(
                (d) => d.severity === 'error' && /Circular include/i.test(d.message),
            ),
        ).toBe(true);
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
        expect(
            result.diagnostics.some(
                (d) => d.severity === 'error' && /Duplicate include/i.test(d.message),
            ),
        ).toBe(true);
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
        expect(
            result.diagnostics.some((d) => d.severity === 'warning' && /shadowed/i.test(d.message)),
        ).toBe(true);
        expect(result.content.persons.get('sam')?.title).toBe('Sam Parent');
    });

    it('resolveIncludes integrates with a parsed NowlineFile', async () => {
        const r = await parse(
            `include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.includes).toHaveLength(1);
        expect(r.ast.includes[0].path).toBe('./a.nowline');
    });

    describe('R5: roadmap start: agreement across includes', () => {
        it('merge: matching start dates produce no diagnostic', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child" start:2026-01-01\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start:/i.test(d.message),
            );
            expect(mismatch).toEqual([]);
        });

        it('merge: mismatched start dates produce an error on the include line', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child" start:2026-02-01\n`,
            };
            const { Nowline } = getServices();
            // Resolve the posix-shaped test path through `path.resolve` so it
            // round-trips through `URI.file` the same way the implementation
            // sees it: `/root/main.nowline` on posix, `D:\\root\\main.nowline`
            // on Windows. The assertion below uses the same value so it stays
            // platform-agnostic.
            const mainPath = path.resolve('/root/main.nowline');
            const main = await parseAtPath(files['main.nowline'], mainPath);
            const result = await resolveIncludes(main, mainPath, {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toHaveLength(1);
            expect(mismatch[0].sourcePath).toBe(mainPath);
        });

        it('merge: parent has start but child does not is an error', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toHaveLength(1);
        });

        it('merge: child has start but parent does not is an error', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child" start:2026-02-01\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toHaveLength(1);
        });

        it('merge: neither parent nor child has start produces no diagnostic', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toEqual([]);
        });

        it('isolate: mismatched start dates are still an error (isolate is not exempt)', async () => {
            const files = {
                'main.nowline': `include "./a.nowline" roadmap:isolate\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child" start:2026-02-01\nswimlane cs\n  item y duration:1w\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toHaveLength(1);
        });

        it('ignore: mismatched start dates are NOT reported (ignore is exempt)', async () => {
            const files = {
                'main.nowline': `include "./a.nowline" roadmap:ignore\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `roadmap child "Child" start:2026-02-01\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toEqual([]);
        });

        it('child without a roadmap declaration produces no start-agreement error', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r "R" start:2026-01-01\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `person sam "Sam"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            const mismatch = result.diagnostics.filter(
                (d) => d.severity === 'error' && /start/i.test(d.message),
            );
            expect(mismatch).toEqual([]);
        });
    });

    describe('symbols in resolved config', () => {
        it('collects symbol declarations into ResolvedConfig.symbols', async () => {
            const files = {
                'main.nowline': `config\nsymbol budget "Budget" unicode:"💰" ascii:"$"\nsymbol fte unicode:"\\u{1F464}"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
            expect(result.config.symbols.size).toBe(2);
            expect(result.config.symbols.get('budget')?.title).toBe('Budget');
            expect(result.config.symbols.has('fte')).toBe(true);
        });

        it('merges child symbols into the parent on config:merge (default)', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `config\nsymbol budget unicode:"💰"\nsymbol star unicode:"⭐"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.config.symbols.size).toBe(2);
            expect(result.config.symbols.has('budget')).toBe(true);
            expect(result.config.symbols.has('star')).toBe(true);
        });

        it('parent symbols shadow same-named child symbols with a warning', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\nconfig\nsymbol budget unicode:"💵"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `config\nsymbol budget unicode:"💰"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.config.symbols.size).toBe(1);
            // Parent's declaration wins.
            const budgetUnicode = result.config.symbols
                .get('budget')
                ?.properties.find((p) => p.key.replace(/:$/, '') === 'unicode')?.value;
            expect(budgetUnicode).toBe('💵');
            const shadowWarn = result.diagnostics.filter(
                (d) => d.severity === 'warning' && /Symbol "budget"/.test(d.message),
            );
            expect(shadowWarn).toHaveLength(1);
        });

        it('config:ignore drops child symbols', async () => {
            const files = {
                'main.nowline': `include "./a.nowline" config:ignore\nroadmap r\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `config\nsymbol budget unicode:"💰"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.config.symbols.size).toBe(0);
        });
    });

    describe('title-only declarations', () => {
        it('registers title-only roadmap entities under slug keys', async () => {
            const text = `nowline v1

roadmap "Generative AI" start:2026-04-06

anchor "Kickoff" date:2026-04-06
milestone "Beta" date:2026-06-15
person "Sam"
footnote "Note" on:host

swimlane host "Host"
  item x duration:1w

swimlane "Platform"
  item "Technology Selection" duration:2w

swimlane "Web"
  item "Web Prototype" duration:4w

swimlane "Mobile"
  item "Mobile Prototype" duration:4w
`;
            const { Nowline } = getServices();
            const file = await parseAtPath(text, '/root/gen.nowline');
            const result = await resolveIncludes(file, '/root/gen.nowline', {
                services: Nowline,
                readFile: async () => {
                    throw new Error('unexpected read');
                },
            });
            expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
            expect([...result.content.swimlanes.keys()]).toEqual([
                'host',
                'platform',
                'web',
                'mobile',
            ]);
            expect(result.content.anchors.has('kickoff')).toBe(true);
            expect(result.content.milestones.has('beta')).toBe(true);
            expect(result.content.persons.has('sam')).toBe(true);
            expect(result.content.footnotes.has('note')).toBe(true);
        });

        it('de-dupes title-only entities with the same slug', async () => {
            const text = `nowline v1

roadmap r "R"

swimlane "Platform"
  item x duration:1w

swimlane "Platform"
  item y duration:1w
`;
            const { Nowline } = getServices();
            const file = await parseAtPath(text, '/root/dedup.nowline');
            const result = await resolveIncludes(file, '/root/dedup.nowline', {
                services: Nowline,
                readFile: async () => {
                    throw new Error('unexpected read');
                },
            });
            expect([...result.content.swimlanes.keys()]).toEqual(['platform', 'platform-2']);
        });

        it('keeps parent-wins behavior for explicit id collisions on merge', async () => {
            const files = {
                'main.nowline': `include "./child.nowline"\nroadmap r "R"\nswimlane parent "Parent"\n  item x duration:1w\n`,
                'child.nowline': `swimlane parent "Child lane"\n  item y duration:1w\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.content.swimlanes.size).toBe(1);
            expect(result.content.swimlanes.get('parent')?.title).toBe('Parent');
            expect(
                result.diagnostics.some(
                    (d) => d.severity === 'warning' && d.message.includes('Swimlane "parent"'),
                ),
            ).toBe(true);
        });

        it('never lets a title-only slug displace an explicit id (any order)', async () => {
            const text = `nowline v1

roadmap r "R"

swimlane "Platform"
  item x duration:1w

swimlane platform "Backlog"
  item y duration:1w
`;
            const { Nowline } = getServices();
            const file = await parseAtPath(text, '/root/order.nowline');
            const result = await resolveIncludes(file, '/root/order.nowline', {
                services: Nowline,
                readFile: async () => {
                    throw new Error('unexpected read');
                },
            });
            expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
            // The explicit id keeps `platform`; the earlier title-only lane
            // yields to `platform-2`. Source order (title-only first) is kept.
            expect(result.content.swimlanes.get('platform')?.title).toBe('Backlog');
            expect(result.content.swimlanes.get('platform-2')?.title).toBe('Platform');
            expect([...result.content.swimlanes.keys()]).toEqual(['platform-2', 'platform']);
        });

        it('de-dupes title-only entities across an include with no warning', async () => {
            const files = {
                'main.nowline': `include "./child.nowline"\nroadmap r "R"\nswimlane "Platform"\n  item x duration:1w\n`,
                'child.nowline': `swimlane "Platform"\n  item y duration:1w\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
            expect([...result.content.swimlanes.keys()]).toEqual(['platform', 'platform-2']);
            expect(
                result.diagnostics.some(
                    (d) => d.severity === 'warning' && d.message.includes('Swimlane'),
                ),
            ).toBe(false);
        });
    });
});
