import * as path from 'node:path';
import type { AstNode } from 'langium';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import type { NowlineFile, SwimlaneDeclaration } from '../../src/generated/ast.js';
import { isGroupBlock, isItemDeclaration, isParallelBlock } from '../../src/generated/ast.js';
import { tr } from '../../src/i18n/index.js';
import {
    isRoutedResolveDiagnostic,
    type ResolveDiagnostic,
    type ResolveResult,
    resolveIncludes,
} from '../../src/language/include-resolver.js';
import { buildWavePlan, localizeResolveDiagnostic } from '../../src/language/waves-plan.js';
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

    describe('R6: wave agreement across includes', () => {
        const abs = (rel: string): string => path.resolve('/root', rel);

        // Resolves `files[main]` as the root. Every fixture must parse cleanly:
        // a child with syntax errors does not participate in rule 12.
        async function resolveAt(
            files: Record<string, string>,
            main = 'program.nowline',
        ): Promise<ResolveResult> {
            for (const [name, text] of Object.entries(files)) {
                const { lexerErrors, parserErrors } = await parse(text, { validate: false });
                expect({ name, errors: [...lexerErrors, ...parserErrors] }).toEqual({
                    name,
                    errors: [],
                });
            }
            const { Nowline } = getServices();
            const root = await parseAtPath(files[main], abs(main));
            return resolveIncludes(root, abs(main), {
                services: Nowline,
                readFile: makeFs(files),
            });
        }

        const brief = (d: ResolveDiagnostic) => ({
            severity: d.severity,
            code: d.code,
            sourcePath: d.sourcePath,
            line: d.line,
            message: d.message,
        });

        // Items, groups and parallels under `lanes`, by id.
        function nodesById(lanes: Iterable<SwimlaneDeclaration>): Map<string, AstNode> {
            const out = new Map<string, AstNode>();
            const visit = (n: AstNode): void => {
                if (!isItemDeclaration(n) && !isGroupBlock(n) && !isParallelBlock(n)) return;
                if (n.name) out.set(n.name, n);
                if (!isItemDeclaration(n)) for (const c of n.content) visit(c);
            };
            for (const lane of lanes) for (const c of lane.content) visit(c);
            return out;
        }

        // Example 16.
        const teamFile = (team: string, design: string, build: string) =>
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
        const example16 = {
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

        it('Example 16: re-declared waves agree; waves come only from the root', async () => {
            const result = await resolveAt(example16);
            expect(result.diagnostics).toEqual([]);
            expect([...(result.content.waves?.keys() ?? [])]).toEqual(['plan', 'execute']);
            expect(result.content.waves?.get('plan')?.$container).toBe(
                result.content.roadmap?.$container,
            );
            expect([...result.content.swimlanes.keys()]).toEqual(['pmo', 'web', 'api']);
        });

        it('Example 16: buildWavePlan covers every file and resolves floors', async () => {
            const result = await resolveAt(example16);
            const plan = buildWavePlan(result);
            expect(plan).toBeDefined();
            if (!plan) return;
            expect(plan.waves.map((w) => w.name)).toEqual(['plan', 'execute']);
            expect([...plan.index]).toEqual([
                ['plan', 1],
                ['execute', 2],
            ]);
            expect(plan.floors).toEqual([null, { date: '2026-02-02', ref: '2026-02-02' }]);
            const nodes = nodesById(result.content.swimlanes.values());
            const waveOf = (id: string) => plan.memberWave(nodes.get(id) as AstNode);
            expect(waveOf('kickoff')).toBe(1);
            expect(waveOf('web-design')).toBe(1);
            expect(waveOf('api-design')).toBe(1);
            expect(waveOf('web-build')).toBe(2);
            expect(waveOf('api-build')).toBe(2);
            expect(waveOf('comms')).toBeUndefined();
            expect(plan.isMember(nodes.get('api-build') as AstNode, 2)).toBe(true);
            expect(plan.isMember(nodes.get('api-build') as AstNode, 1)).toBe(false);
            expect(plan.isMember(nodes.get('comms') as AstNode)).toBe(false);
        });

        it('buildWavePlan is undefined when the root declares no waves', async () => {
            const result = await resolveAt({
                'program.nowline': 'roadmap r "R"\nswimlane s\n  item x duration:1w\n',
            });
            expect(result.content.waves).toBeUndefined();
            expect('waves' in result.content).toBe(false);
            expect(buildWavePlan(result)).toBeUndefined();
        });

        // Example 17.
        const example17Child = (roadmap: string, waves: string[], lane: string[]) =>
            [
                'nowline v1',
                '',
                `roadmap ${roadmap} "${roadmap}" start:2026-01-05 scale:1w`,
                '',
                ...waves,
                ...(waves.length > 0 ? [''] : []),
                ...lane,
                '',
            ].join('\n');
        const programWaves = [
            'wave discover "Discover"',
            'wave build "Build"',
            'wave launch "Launch" after:2026-03-02',
        ];
        const example17 = (includes: string[], legacyWaves?: string[]) => ({
            'teams/legacy.nowline': example17Child(
                'legacy',
                legacyWaves ?? ['wave discover "Discover"', 'wave build "Build"'],
                ['swimlane legacy', '  item l1 duration:2w wave:discover'],
            ),
            'teams/web.nowline': example17Child(
                'web',
                [
                    'wave discover "Discovery"',
                    'wave build "Build"',
                    'wave launch "Launch" after:2026-03-02',
                ],
                ['swimlane web', '  item w1 duration:1w wave:discover'],
            ),
            'teams/ops.nowline': example17Child(
                'ops',
                [],
                ['swimlane ops', '  item o1 duration:2w'],
            ),
            'teams/infra.nowline': example17Child(
                'infra',
                [
                    'wave discover "Discover"',
                    'wave build "Build"',
                    'wave launch "Launch" after:2026-03-09',
                ],
                ['swimlane infra', '  item i1 duration:1w wave:build'],
            ),
            'program.nowline': [
                'nowline v1',
                '',
                ...includes,
                '',
                'roadmap program "Program" start:2026-01-05 scale:1w',
                '',
                ...programWaves,
                '',
                'swimlane design',
                '  item d1 "Research" duration:2w wave:discover',
                '',
            ].join('\n'),
        });
        const example17Includes = [
            'include "./teams/legacy.nowline"',
            'include "./teams/web.nowline"',
            'include "./teams/ops.nowline" roadmap:isolate',
            'include "./teams/infra.nowline"',
        ];

        it('Example 17: exactly the four diagnostics on the parent include lines', async () => {
            const result = await resolveAt(example17(example17Includes));
            const program = abs('program.nowline');
            expect(result.diagnostics.map(brief)).toEqual([
                {
                    severity: 'error',
                    code: 'NL.E0202',
                    sourcePath: program,
                    line: 2,
                    message:
                        'Included "./teams/legacy.nowline" declares waves [discover, build], but this file\'s waves are [discover, build, launch]. Every included roadmap must declare the same waves in the same order: copy this file\'s wave lines into "./teams/legacy.nowline".',
                },
                {
                    severity: 'warning',
                    code: 'NL.W0701',
                    sourcePath: program,
                    line: 3,
                    message:
                        'Wave "discover" in "./teams/web.nowline" differs from this file\'s definition (title "Discovery" there, "Discover" here); this file\'s definition is used.',
                },
                {
                    severity: 'error',
                    code: 'NL.E0202',
                    sourcePath: program,
                    line: 4,
                    message:
                        'Included "./teams/ops.nowline" declares no waves, but this file\'s waves are [discover, build, launch]. Copy this file\'s wave lines into "./teams/ops.nowline" so its work joins the waves.',
                },
                {
                    severity: 'error',
                    code: 'NL.E0202',
                    sourcePath: program,
                    line: 5,
                    message:
                        'Wave "launch" in "./teams/infra.nowline" opens no earlier than 2026-03-09, but this file\'s wave "launch" opens no earlier than 2026-03-02. A wave must have the same start floor in every included roadmap.',
                },
            ]);
            // The arguments travel with the code, in the shape acceptTr stores.
            expect(result.diagnostics[3].args).toEqual([
                {
                    reason: 'floor',
                    id: 'launch',
                    path: './teams/infra.nowline',
                    childFloor: '2026-03-09',
                    parentFloor: '2026-03-02',
                },
            ]);
        });

        it('Example 17: order matters, so [discover, launch, build] is a mismatch', async () => {
            const result = await resolveAt(
                example17(example17Includes, [
                    'wave discover "Discover"',
                    'wave launch "Launch" after:2026-03-02',
                    'wave build "Build"',
                ]),
            );
            const legacy = result.diagnostics.find((d) => d.line === 2);
            expect(legacy?.code).toBe('NL.E0202');
            expect(legacy?.args).toEqual([
                {
                    reason: 'mismatch',
                    path: './teams/legacy.nowline',
                    child: ['discover', 'launch', 'build'],
                    parent: ['discover', 'build', 'launch'],
                },
            ]);
        });

        it('Example 17: include order does not change the diagnostics', async () => {
            const before = await resolveAt(example17(example17Includes));
            const after = await resolveAt(
                example17([...example17Includes.slice(1), example17Includes[0]]),
            );
            const set = (r: ResolveResult) =>
                r.diagnostics.map((d) => `${d.severity} ${d.code} ${d.message}`).sort();
            expect(set(after)).toEqual(set(before));
            expect(after.diagnostics.find((d) => d.message.includes('legacy'))?.line).toBe(5);
        });

        it('Example 18: a vocabulary-only child is exempt', async () => {
            const result = await resolveAt(
                {
                    'people.nowline': [
                        'nowline v1',
                        '',
                        'person sam "Sam Chen"',
                        'team platform-team "Platform"',
                        '  person sam',
                        'label risky "Risky"',
                        '',
                    ].join('\n'),
                    'plan.nowline': [
                        'nowline v1',
                        '',
                        'include "./people.nowline"',
                        '',
                        'roadmap plan "Plan" start:2026-01-05 scale:1w',
                        '',
                        'wave w1 "Wave 1"',
                        'wave w2 "Wave 2"',
                        '',
                        'swimlane platform owner:platform-team',
                        '  item auth duration:2w wave:w1 owner:sam',
                        '  item sso duration:1w wave:w2 labels:risky',
                        '',
                    ].join('\n'),
                },
                'plan.nowline',
            );
            expect(result.diagnostics).toEqual([]);
        });

        const example19 = {
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

        it('Example 19: an agreeing isolated child has no diagnostics', async () => {
            const result = await resolveAt(example19, 'portfolio.nowline');
            expect(result.diagnostics).toEqual([]);
            const region = result.content.isolatedRegions[0];
            expect([...(region.content.waves?.keys() ?? [])]).toEqual(['w1', 'w2']);
        });

        it('Example 19: buildWavePlan maps region items to the global waves', async () => {
            const result = await resolveAt(example19, 'portfolio.nowline');
            const plan = buildWavePlan(result);
            if (!plan) throw new Error('expected a wave plan');
            const main = nodesById(result.content.swimlanes.values());
            const region = nodesById(result.content.isolatedRegions[0].content.swimlanes.values());
            expect(plan.memberWave(main.get('pf-api') as AstNode)).toBe(1);
            expect(plan.memberWave(main.get('pf-scale') as AstNode)).toBe(2);
            expect(plan.memberWave(region.get('ios-offline') as AstNode)).toBe(1);
            expect(plan.memberWave(region.get('ios-push') as AstNode)).toBe(2);
            expect(plan.leadOf.get(region.get('ios-push') as AstNode)).toBe(2);
        });

        const withWaves = (body: string[], waves = ['wave w1', 'wave w2']) =>
            [...waves, ...body, ''].join('\n');

        it('diamond: shared waves never go through the shadow-warning merge', async () => {
            const result = await resolveAt({
                'program.nowline': withWaves([
                    'swimlane s',
                    '  item x duration:1w wave:w1',
                ]).replace(/^/, 'include "./a.nowline"\ninclude "./b.nowline"\nroadmap r "R"\n'),
                'a.nowline': `include "./d.nowline"\n${withWaves(['swimlane a', '  item ai duration:1w wave:w1'])}`,
                'b.nowline': `include "./d.nowline"\n${withWaves(['swimlane b', '  item bi duration:1w wave:w2'])}`,
                'd.nowline': withWaves(['swimlane d', '  item di duration:1w wave:w2']),
            });
            expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
            expect(result.diagnostics.filter((d) => /wave/i.test(d.message))).toEqual([]);
            expect(result.diagnostics.some((d) => d.code !== undefined)).toBe(false);
        });

        it('roadmap:ignore exempts a child with different waves', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline" roadmap:ignore\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': `roadmap c "C"\n${withWaves(['swimlane c', '  item y duration:1w wave:z'], ['wave z'])}`,
            });
            expect(result.diagnostics).toEqual([]);
        });

        it('a lanes-only child without waves under a parent with waves is child-none', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': 'swimlane c\n  item y duration:1w\n',
            });
            expect(result.diagnostics.map(brief)).toEqual([
                {
                    severity: 'error',
                    code: 'NL.E0202',
                    sourcePath: abs('program.nowline'),
                    line: 0,
                    message:
                        'Included "./c.nowline" declares no waves, but this file\'s waves are [w1, w2]. Copy this file\'s wave lines into "./c.nowline" so its work joins the waves.',
                },
            ]);
        });

        it('a child with waves under a parent without waves is parent-none', async () => {
            const result = await resolveAt({
                'program.nowline':
                    'include "./c.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n',
                'c.nowline': withWaves(['swimlane c', '  item y duration:1w wave:w1']),
            });
            expect(result.diagnostics.map((d) => [d.code, d.line, d.args])).toEqual([
                [
                    'NL.E0202',
                    0,
                    [{ reason: 'parent-none', path: './c.nowline', child: ['w1', 'w2'] }],
                ],
            ]);
            expect(result.content.waves).toBeUndefined();
        });

        it('floors are compared as resolved dates: different anchor dates fail', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\nanchor fy date:2026-02-02\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'], ['wave w1', 'wave w2 after:fy'])}`,
                'c.nowline': `anchor fy date:2026-02-09\n${withWaves(['swimlane c', '  item y duration:1w wave:w2'], ['wave w1', 'wave w2 after:fy'])}`,
            });
            const errors = result.diagnostics.filter((d) => d.severity === 'error');
            expect(errors.map((d) => [d.code, d.line, d.args])).toEqual([
                [
                    'NL.E0202',
                    0,
                    [
                        {
                            reason: 'floor',
                            id: 'w2',
                            path: './c.nowline',
                            childFloor: '2026-02-09',
                            parentFloor: '2026-02-02',
                        },
                    ],
                ],
            ]);
        });

        it('floors are compared as resolved dates: different text, same date passes', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\nanchor fy-budget date:2026-02-02\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'], ['wave w1', 'wave w2 after:fy-budget'])}`,
                'c.nowline': withWaves(
                    ['swimlane c', '  item y duration:1w wave:w2'],
                    ['wave w1', 'wave w2 after:2026-02-02'],
                ),
            });
            expect(result.diagnostics).toEqual([]);
        });

        it('a missing floor in the child is a floor mismatch', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'], ['wave w1 after:2026-01-05', 'wave w2'])}`,
                'c.nowline': withWaves(['swimlane c', '  item y duration:1w wave:w2']),
            });
            expect(result.diagnostics.map((d) => d.args)).toEqual([
                [
                    {
                        reason: 'floor',
                        id: 'w1',
                        path: './c.nowline',
                        childFloor: null,
                        parentFloor: '2026-01-05',
                    },
                ],
            ]);
        });

        it('transitive includes compare each edge against its direct parent', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./mid.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'mid.nowline': `include "./leaf.nowline"\n${withWaves(['swimlane m', '  item y duration:1w wave:w1'])}`,
                'leaf.nowline': withWaves(['swimlane l', '  item z duration:1w'], ['wave w1']),
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E0202', abs('mid.nowline'), 0],
            ]);
        });

        it('a cross-file barrier chain reports NL.E1103 at the child', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane a', '  item p2 duration:1w wave:w2'])}`,
                'c.nowline': withWaves([
                    'swimlane b',
                    '  item c0 duration:1w wave:w1',
                    '  item c1 duration:1w wave:w1 after:p2',
                ]),
            });
            expect(result.diagnostics.map(brief)).toEqual([
                {
                    severity: 'error',
                    code: 'NL.E1103',
                    sourcePath: abs('c.nowline'),
                    line: 4,
                    message: tr('en-US', 'NL.E1103', {
                        reason: 'after-item',
                        name: 'c1',
                        wave: 'w1',
                        refId: 'p2',
                        ref: 'p2',
                        refWave: 'w2',
                    }),
                },
            ]);
        });

        it('a cross-file cycle-closing forward reference still gets NL.W1101', async () => {
            const files = {
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane a', '  item x duration:1w wave:w1 after:y'])}`,
                'c.nowline': withWaves(['swimlane b', '  item y duration:1w wave:w1 after:x']),
            };
            // Every surface parses the root from a memory: URI; findings in
            // the root still point at the path passed to resolveIncludes.
            const { Nowline } = getServices();
            const root = (await parse(files['program.nowline'], { validate: false })).ast;
            const result = await resolveIncludes(root, abs('program.nowline'), {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.W1101', abs('program.nowline'), 5],
            ]);
            expect(result.diagnostics[0].args).toEqual([
                {
                    reason: 'forward-lane',
                    key: 'after',
                    ref: 'y',
                    name: 'x',
                    lane: 'b',
                    ownLane: 'a',
                },
            ]);
        });

        it('findings entirely inside the root are left to the validator', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves([
                    'swimlane a',
                    '  item a2 duration:1w wave:w2',
                    '  item a1 duration:1w wave:w1',
                    '  item a3 duration:1w wave:w1 after:a4',
                    '  item a4 duration:1w wave:w1 after:a3',
                ])}`,
                'c.nowline': withWaves(['swimlane b', '  item b1 duration:1w wave:w1']),
            });
            expect(result.diagnostics).toEqual([]);
        });

        it('runs the S and P rules on a child, at the child path', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': withWaves(
                    ['swimlane c', '  item y duration:1w wave:w9'],
                    ['wave w1', 'wave w2 duration:1w'],
                ),
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E1105', abs('c.nowline'), 1],
                ['NL.E1101', abs('c.nowline'), 3],
            ]);
            expect(result.diagnostics[1].message).toBe(
                tr('en-US', 'NL.E1101', {
                    reason: 'unknown',
                    value: 'w9',
                    declared: ['w1', 'w2'],
                }),
            );
        });

        it('a child id equal to a root wave id is NL.E0300 at the child', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': withWaves(['swimlane c', '  item w2 duration:1w wave:w2']),
            });
            expect(result.diagnostics.map(brief)).toEqual([
                {
                    severity: 'error',
                    code: 'NL.E0300',
                    sourcePath: abs('c.nowline'),
                    line: 3,
                    message: 'Duplicate identifier "w2". First declared at program.nowline:4.',
                },
            ]);
        });

        it('an isolated region is its own G scope: NL.E1103 at the child', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline" roadmap:isolate\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': `roadmap c "C"\n${withWaves([
                    'swimlane c',
                    '  item a duration:1w wave:w2',
                    '  item b duration:1w wave:w1',
                ])}`,
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E1103', abs('c.nowline'), 5],
            ]);
            expect(result.diagnostics[0].args).toEqual([
                expect.objectContaining({ reason: 'sequence', items: ['b'], itemWave: 'w1' }),
            ]);
            // The region keeps its own waves; the main lanes are not involved.
            expect(result.content.isolatedRegions).toHaveLength(1);
            expect([...(result.content.isolatedRegions[0].content.waves?.keys() ?? [])]).toEqual([
                'w1',
                'w2',
            ]);
        });

        it('runs the S and P rules on an agreeing isolated child, at the child path', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline" roadmap:isolate\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': `roadmap c "C"\n${withWaves([
                    'swimlane c wave:w1',
                    '  item a duration:1w wave:w9',
                ])}`,
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E1104', abs('c.nowline'), 3],
                ['NL.E1101', abs('c.nowline'), 4],
            ]);
            expect(result.diagnostics.map((d) => d.args?.[0])).toEqual([
                { reason: 'swimlane', name: 'c', value: 'w1' },
                { reason: 'unknown', value: 'w9', declared: ['w1', 'w2'] },
            ]);
        });

        // WV8 reuses rule 23's fixed English text (§6.2), so in a child it is
        // the one uncoded wave-rule resolver diagnostic; `rule: 'wave'` still
        // routes it like the coded ones.
        it('WV8 in a child is an uncoded, wave-marked error at the child path', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': `config\ndefault item wave:w1\n${withWaves(['swimlane c', '  item y duration:1w wave:w1'])}`,
            });
            expect(result.diagnostics).toEqual([
                {
                    severity: 'error',
                    message:
                        '"wave" cannot be set on "default item". Identity-defining, sizing, sequencing, reference, and prose properties must be explicit on each entity.',
                    sourcePath: abs('c.nowline'),
                    line: 1,
                    rule: 'wave',
                },
            ]);
            expect(isRoutedResolveDiagnostic(result.diagnostics[0])).toBe(true);
        });

        it('every wave diagnostic carries rule: wave and is routed', async () => {
            const result = await resolveAt(example17(example17Includes));
            expect(result.diagnostics.length).toBeGreaterThan(0);
            for (const d of result.diagnostics) {
                expect(d.rule).toBe('wave');
                expect(isRoutedResolveDiagnostic(d)).toBe(true);
            }
        });

        it('a file in two layout scopes reports each G finding once', async () => {
            // c is isolated by the root and merged into the main lanes by b,
            // so its lanes are evaluated in both scopes.
            const c = `roadmap c "C"\n${withWaves([
                'swimlane c',
                '  item a duration:1w wave:w2',
                '  item b duration:1w wave:w1',
            ])}`;
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline" roadmap:isolate\ninclude "./b.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'b.nowline': `include "./c.nowline"\n${withWaves(['swimlane bl', '  item y duration:1w wave:w1'])}`,
                'c.nowline': c,
            });
            expect(result.content.isolatedRegions).toHaveLength(1);
            expect(result.content.swimlanes.has('c')).toBe(true);
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E1103', abs('c.nowline'), 5],
            ]);
        });

        it('NL.W0701 compares style, labels, link and description, one warning per wave', async () => {
            const result = await resolveAt({
                'program.nowline': [
                    'include "./c.nowline"',
                    'roadmap r "R"',
                    'wave w1 "One" labels:[a, b] link:https://example.com/one',
                    '  description "Shared"',
                    'wave w2 "Two"',
                    'swimlane s',
                    '  item x duration:1w wave:w1',
                    '',
                ].join('\n'),
                'c.nowline': [
                    'wave w1 "One" labels:[a] link:https://example.com/two',
                    '  description "Other"',
                    'wave w2 "Two" style:bold',
                    'swimlane c',
                    '  item y duration:1w wave:w2',
                    '',
                ].join('\n'),
            });
            expect(result.diagnostics.map((d) => [d.code, d.severity, d.line])).toEqual([
                ['NL.W0701', 'warning', 0],
                ['NL.W0701', 'warning', 0],
            ]);
            expect(result.diagnostics.map((d) => d.args)).toEqual([
                [
                    {
                        id: 'w1',
                        path: './c.nowline',
                        fields: [
                            { field: 'labels', there: 'a', here: 'a, b' },
                            {
                                field: 'link',
                                there: 'https://example.com/two',
                                here: 'https://example.com/one',
                            },
                            { field: 'description', there: 'Other', here: 'Shared' },
                        ],
                    },
                ],
                [
                    {
                        id: 'w2',
                        path: './c.nowline',
                        fields: [{ field: 'style', there: 'bold', here: '' }],
                    },
                ],
            ]);
            expect(result.diagnostics.map((d) => d.message)).toEqual([
                'Wave "w1" in "./c.nowline" differs from this file\'s definition (labels "a" there, "a, b" here; link "https://example.com/two" there, "https://example.com/one" here; description "Other" there, "Shared" here); this file\'s definition is used.',
                'Wave "w2" in "./c.nowline" differs from this file\'s definition (style "bold" there, none here); this file\'s definition is used.',
            ]);
        });

        it('a child that fails rule 12 is not evaluated further', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': withWaves(['swimlane c', '  item y duration:1w wave:w9'], ['wave w1']),
            });
            expect(result.diagnostics.map((d) => d.code)).toEqual(['NL.E0202']);
        });

        it('an edge whose child has a wave without an id (NL.E1100) is not compared', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': withWaves(
                    ['swimlane c', '  item y duration:1w wave:w1'],
                    ['wave w1', 'wave "Extra"'],
                ),
            });
            expect(result.diagnostics.map((d) => [d.code, d.sourcePath, d.line])).toEqual([
                ['NL.E1100', abs('c.nowline'), 1],
            ]);
        });

        it('re-keys a title-only slug that equals a wave id', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\nmilestone "W1" date:2026-02-02\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': `milestone "W2" date:2026-03-02\n${withWaves(['swimlane c', '  item y duration:1w wave:w2'])}`,
            });
            expect(result.diagnostics).toEqual([]);
            expect([...result.content.milestones.keys()]).toEqual(['w1-2', 'w2-2']);
        });

        it('localizeResolveDiagnostic renders coded diagnostics in the locale', async () => {
            const result = await resolveAt({
                'program.nowline': `include "./c.nowline"\nroadmap r "R"\n${withWaves(['swimlane s', '  item x duration:1w wave:w1'])}`,
                'c.nowline': 'swimlane c\n  item y duration:1w\n',
            });
            const [d] = result.diagnostics;
            expect(localizeResolveDiagnostic('en-US', d)).toBe(d.message);
            expect(localizeResolveDiagnostic('fr', d)).toBe(
                tr('fr', 'NL.E0202', {
                    reason: 'child-none',
                    path: './c.nowline',
                    parent: ['w1', 'w2'],
                }),
            );
            expect(localizeResolveDiagnostic('fr', d)).not.toBe(d.message);
            const uncoded: ResolveDiagnostic = {
                severity: 'error',
                message: 'Could not read include',
                sourcePath: '/x',
            };
            expect(localizeResolveDiagnostic('fr', uncoded)).toBe('Could not read include');
        });

        it('pre-existing include diagnostics carry no code or args keys', async () => {
            const result = await resolveAt({
                'program.nowline': [
                    'include "./a.nowline"',
                    'include "./a.nowline"',
                    'include "./missing.nowline"',
                    'include "./p.nowline" roadmap:isolate',
                    'include "./loop.nowline"',
                    'include "./s.nowline"',
                    'roadmap r "R" start:2026-01-05',
                    'person sam "Sam"',
                    'swimlane s',
                    '  item x duration:1w',
                    '',
                ].join('\n'),
                'a.nowline': 'person sam "Other"\n',
                'p.nowline': 'person pat "Pat"\n',
                'loop.nowline': 'include "./program.nowline"\n',
                's.nowline': 'roadmap s "S" start:2026-02-02\n',
            });
            const messages = result.diagnostics.map((d) => d.message).join('\n');
            expect(messages).toMatch(/Duplicate include/);
            expect(messages).toMatch(/Could not read include/);
            expect(messages).toMatch(/Cannot isolate/);
            expect(messages).toMatch(/Circular include/);
            expect(messages).toMatch(/start:/);
            expect(messages).toMatch(/shadowed/);
            for (const d of result.diagnostics) {
                expect(
                    Object.keys(d).filter((k) => k === 'code' || k === 'args' || k === 'rule'),
                ).toEqual([]);
                expect(isRoutedResolveDiagnostic(d)).toBe(false);
            }
        });
    });

    describe('diamond includes', () => {
        // main includes a and b; both include shared. shared is resolved once
        // and its cached content reaches main through both paths.
        async function resolveDiamond(shared: string) {
            const files = {
                'main.nowline': `include "./a.nowline"\ninclude "./b.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `include "./shared.nowline"\n`,
                'b.nowline': `include "./shared.nowline"\n`,
                'shared.nowline': shared,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            return resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
        }

        it('merges a title-only entity from the shared file exactly once', async () => {
            const result = await resolveDiamond(
                `milestone "Launch" date:2026-05-01\nanchor "Kickoff" date:2026-04-06\nswimlane "Platform"\n  item "Spike" duration:1w\n`,
            );
            expect(result.diagnostics).toEqual([]);
            expect([...result.content.milestones.keys()]).toEqual(['launch']);
            expect([...result.content.anchors.keys()]).toEqual(['kickoff']);
            expect([...result.content.swimlanes.keys()]).toEqual(['s', 'platform']);
        });

        it('merges explicit-id entities and config once with no shadow warning', async () => {
            const result = await resolveDiamond(
                `config\nstyle risky\nsymbol star unicode:"*"\nmilestone launch "Launch" date:2026-05-01\nperson sam "Sam"\nswimlane platform "Platform"\n  item spike duration:1w\n`,
            );
            expect(result.diagnostics).toEqual([]);
            expect([...result.content.milestones.keys()]).toEqual(['launch']);
            expect([...result.content.persons.keys()]).toEqual(['sam']);
            expect([...result.content.swimlanes.keys()]).toEqual(['s', 'platform']);
            expect([...result.config.styles.keys()]).toEqual(['risky']);
            expect([...result.config.symbols.keys()]).toEqual(['star']);
        });

        it('still warns when a diamond parent shadows a shared explicit id', async () => {
            const files = {
                'main.nowline': `include "./a.nowline"\ninclude "./b.nowline"\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
                'a.nowline': `include "./shared.nowline"\nperson sam "Sam A"\n`,
                'b.nowline': `include "./shared.nowline"\n`,
                'shared.nowline': `person sam "Sam Shared"\n`,
            };
            const { Nowline } = getServices();
            const main = await parseAtPath(files['main.nowline'], '/root/main.nowline');
            const result = await resolveIncludes(main, '/root/main.nowline', {
                services: Nowline,
                readFile: makeFs(files),
            });
            expect(result.content.persons.get('sam')?.title).toBe('Sam A');
            expect(
                result.diagnostics.some(
                    (d) => d.severity === 'warning' && d.message.includes('Person "sam"'),
                ),
            ).toBe(true);
        });
    });
});
