# True-width prototype

A browser page for [`../../true-width-layout.md`](../../true-width-layout.md): a sample picker and editor on the left, today's render and the proposed render on the right. Both come from one `stageRoadmap` call, so they draw the same schedule; any difference is layout.

```bash
make build-fast                                        # the page bundles the built workspace packages
node specs/handoffs/true-width-prototype/build.mjs     # writes out/index.html and out/proto.js
```

Open `out/index.html` from disk. `out/` is ignored by git.

- `src/proposed.js` draws the proposed layout from the AST, the resolved content and the schedule.
- `src/entry.js` stages a source once and returns both SVGs; includes resolve against the embedded samples.
- `page.html` is the page template; the build inlines every `examples/` and `tests/` file plus the stress cases in `samples/`.

Not drawn on the proposed side: isolated include regions, footnotes, labels, owners, links, logos and `before:` overflow.
