# Nowline Waves

**Status: Proposed. Not prioritized, not implemented.** This is the design record for waves that run across swimlanes. Today's parser rejects the syntax shown here.

If the feature is prioritized:

- The normative parts of this file move into [`specs/dsl.md`](../dsl.md) (syntax, validation, includes) and [`specs/rendering.md`](../rendering.md) (layout, rendering, exporters).
- This file stays as the rationale and the home of the worked examples.

Related files:

- **Implementation plan:** [`handoff.md`](./handoff.md).
- **Sample roadmap and mockup diagram:** [`samples/`](./samples/), introduced in [`README.md`](./README.md).

## 1. Summary

**A Nowline wave is a strict, non-overlapping barrier: no item in wave k+1 starts before every item in wave k has ended.**

A wave is a batch of work that spans teams. It opens for every team at the same instant. The next wave opens only after the slowest member of this wave finishes. In computing terms, this is a bulk-synchronous-parallel (BSP) superstep barrier (Valiant, 1990).

**Authoring.**

- Waves are declared once, in order, in the roadmap section: `wave build "Build"`.
- Work joins a wave through a property: `item checkout duration:3w wave:build`. The property is allowed on `item`, `group` and `parallel`, and descendants inherit it.
- An item with no wave is **background work**: no barrier holds it back. There is no warning; the picture marks it instead.

**Computation.**

- The layout computes each wave's span from its items.
- An optional `after:` on a wave holds the wave's start back until an anchor, a dated milestone or a date.

**Drawing.** Waves render as columns, the column counterpart of swimlanes:

- a wave strip under the date header, with one cell per wave;
- a strong boundary line at each barrier, running from the strip down through the chart;
- hatched bars for background work, with the boundary line drawn across them.

**Includes.** Every roadmap included into another declares the same waves, in the same order, with the same start floors.

**Compatibility.** Files with no `wave` keyword and no `wave:` key parse, validate, lay out and render byte-identically.

**Surface added.** One keyword (`wave`) and one property (`wave:`). Wave ids also become valid targets for `after:`, `before:` and `on:`.

## 2. Name and prior art

### 2.1 Prior art

| Source | Term | Barrier between batches? | What Nowline takes |
|---|---|---|---|
| BSP, Valiant (CACM 1990); Google Pregel | superstep, barrier | Strict: "When a process reaches this point (the barrier), it waits until all other processes have reached the same barrier." | The exact semantics. A superstep lasts as long as its slowest participant. ([BSP](https://en.wikipedia.org/wiki/Bulk_synchronous_parallel)) |
| GitLab CI | stage | Strict: "Jobs in the next stage run after the jobs from the previous stage complete successfully." | The engineer's mental model. ([docs](https://docs.gitlab.com/ci/yaml/#stages)) |
| Argo CD | sync wave | Strict: apply a wave, wait for it to be healthy, apply the next | The name, and ordered waves. ([docs](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/)) |
| AWS deployment pipelines | wave | Strict: parallel inside a wave, sequential across waves, bake time between | The name. Bake time is future work (§12). |
| AWS / Azure / Google Cloud migration | migration wave | **Not strict.** AWS: "we recommend overlapping waves where possible". Azure: "Run independent waves in parallel". | PM familiarity: a batch that crosses teams and moves together. It is also why the strictness sentence comes first. ([AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-portfolio-playbook/wave-planning.html), [Azure](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/migration-wave-planning)) |
| SAFe program board | iteration columns × team rows | Cadence, not a barrier | The closest visual analogue: columns over lanes, with a header row of events. ([board](https://www.easyagile.com/blog/program-board)) |
| Visio cross-functional flowchart | "Phase" separator | Visual only | Exact visual prior art: a labelled column separator dropped across swimlanes. ([docs](https://support.microsoft.com/en-us/office/create-a-cross-functional-flowchart-4a403033-9787-454f-b87e-b88452c47a21)) |
| PMBOK; US joint doctrine | phase, phase gate | Either; phases may overlap (fast tracking) | A reason not to use `phase`. |
| Cooper Stage-Gate; PRINCE2 | stage plus gate | Gated by approval | A reason not to use `stage`. Approval workflows are a non-goal (`principles.md`). |
| MS Project | linked summary tasks | Strict finish-to-start | It warns that this "artificially extend[s]" schedules, which is why barrier idle time is drawn honestly. ([note](https://www.stakeholdermap.com/ms-project/link-summary-tasks-ms-project.html)) |
| Primavera P6 | level-of-effort activity | Spans whatever it is wired to | The convention behind drawing background work differently (§9.3). |
| Mermaid, PlantUML, Markwhen, D2 | none | — | No text DSL has a named column group that crosses lanes. |

### 2.2 Naming (ranked)

1. **`wave` (chosen).**
   - It reads naturally both as a declaration (`wave build "Build"`) and as an assignment (`item api wave:build`).
   - Its strongest engineering associations, Argo CD sync waves and AWS deployment waves, mean exactly this barrier. PMs know it from wave planning in cloud migrations.
   - It implies no fixed length (unlike cycle, sprint, iteration or PI) and no approval (unlike stage or gate).
   - It has no existing Nowline meaning, and no `.nowline` file in the repo uses it as an id.
   - Its one hazard is that migration waves often overlap. §1 opens with the strictness sentence for that reason.
2. **`phase`.** It is the best-known word, and it labels Visio's separator. It is rejected for these reasons:
   - phases may overlap (PMBOK, doctrine);
   - it reads as a *kind of work* (design, dev, test) inside one team;
   - "phase gate" implies approval;
   - a Kubernetes phase is a status, which collides with `status:`;
   - as a common noun it is more likely to be an existing id.
3. **`stage`.** GitLab stages match the semantics exactly. It is rejected because Stage-Gate and PRINCE2 make the stage boundary an approval gate, and in CRM and kanban tools "stage" means status.

Also rejected:

- `column` names a rendering artifact, which breaks the content/render split, and it collides with `scale` columns;
- `cycle`, `sprint`, `iteration` and `train` are fixed cadences, which `scale` units already cover, and "does not manage sprints" is a non-goal;
- `batch` has no sense of sequence;
- `tranche` and `epoch` are jargon;
- `horizon`: Now/Next/Later horizons are fuzzy buckets, the opposite of a barrier.

## 3. Mental model

A swimlane is a **row** that groups work by *who*. A wave is a **column** that groups work by *which batch opens together*.

**Inside a wave**, every lane schedules exactly as it does today:

- items run in document order;
- `parallel`, `group` and `after:` behave as they always have.

This is BSP's local computation between barriers. **Across waves**, the barrier holds.

How a wave relates to existing constructs:

- a wave is to the whole roadmap what `parallel` and its implicit join are to one lane;
- the end of a wave is a floating milestone with `after:` listing every item in the wave, and that is also what `after:<wave-id>` means;
- a milestone stays a point and an anchor stays a date, while a wave is a span with two computed edges.

### 3.1 Waves are sequential

Waves form a **total order**: declaration order. They never run concurrently and never overlap. Wave k+1 opens only when wave k closes. A gap between two waves appears only when a constant start floor holds the later wave back (§4.2).

There are four reasons for this.

1. **A wave spans every lane, so it owns its stretch of the time axis.**
   - Two concurrent waves would share the same lanes over the same weeks, and the picture could not say which column a bar belongs to.
   - A swimlane is exclusive vertically; a wave is the same thing horizontally.
2. **Sequencing is what gives the barrier meaning.**
   - If waves overlap (migration-style waves, or a `lag:`), "no work starts before the previous wave ends" becomes advisory.
   - At that point nothing guarantees that a batch starts together.
3. **Concurrent work already has a home.**
   - Lanes run in parallel by definition.
   - `parallel` is concurrency within a lane, and `group` is a named batch within a lane.
   - Work that should ignore the barrier simply has no `wave:`.
   - Two unrelated programs belong in two roadmaps.
4. **A dependency graph between waves would be a second scheduler.**
   - `wave w3 after:w1`, which would run w2 and w3 side by side, duplicates `after:`.
   - It would need its own cycle detection.
   - It breaks the single-row strip.
   - So a wave's `after:` accepts only constants, never another wave (NL.E1106).

Rejected alternatives:

- overlap or lag between waves;
- a graph of waves built from `after:<wave>` on wave declarations;
- concurrent wave "tracks";
- wave order inferred from usage instead of declaration.

A bake or cool-down `gap:` remains possible future work (§12), because it is still sequential.

### 3.2 Swimlane affordances mapped to waves

| Swimlane affordance | Wave analogue | Decision |
|---|---|---|
| `swimlane [id] ["title"]` | `wave id ["title"]` | **Adopt, with the id required.** Work references waves by id, and auto-slugs from titles are not referenceable. |
| Declaration order is vertical order | Declaration order is **time** order | **Adopt, stronger.** The order has meaning (§3.1). |
| Contains items by indentation | Membership through `wave:` | **Reject containment.** An item has one parent. Reopening lanes inside waves would collide with unique ids, and with the rule that a colliding swimlane drops its items on include. |
| Height grows with content | Width grows with content: `[S_k, E_k]` | **Adopt.** |
| Alternating row tints | Alternating strip cells; no column tint by default | **Adapt.** Column tints over tinted rows produce a four-tone checkerboard (§9.4). `style:` with `bg` opts a wave into a tint. |
| Band border is the separator | A 2 px boundary line at each barrier | **Adapt.** It differs from every other vertical line in weight, hue and dash (§9.6). |
| Frame tab label (top-left) | Strip cell label (header row) | **Adapt.** A column header belongs on top. |
| `owner:`, `capacity:`, `status:` | none | **Reject.** A wave crosses teams by definition, and cross-team capacity is resource leveling (a non-goal). A status on a wave reads as gate approval. |
| `style:`, `default swimlane` | `style:` only | **Adopt `style:`. No `default wave`.** |
| `labels:`, `link:`, `description` | same | **Adopt.** Carried in the AST and exports; not painted. |
| Footnote `on:lane` indicator | `on:wave` indicator in the strip cell | **Adopt.** |
| Lane `after:` / `before:` (specified, not implemented) | Wave `after:`, constants only | **Adapt.** The floor can be an anchor, a dated milestone or one ISO date, so it never depends on the schedule. Wave `before:` is rejected; a dated milestone `after:<wave>` expresses a wave deadline. |
| Include merge: parent wins, with a warning | Every participating file must agree; a mismatch is an error | **Adapt, stricter.** Modelled on include rule 11 (`start:`). |
| Isolate region: lanes scoped to the child | Region lanes join the global barriers | **Adapt.** Waves are shared like the time axis. |

### 3.3 Why a property and not a block

Scenario: lane `platform` does `auth` and `api` in Discover, then `sdk` in Build.

| Form | Example | Verdict |
|---|---|---|
| A. Property on each item | `item auth duration:2w wave:discover` | **Chosen.** The meaning is on the line itself, and a misplaced item becomes an error instead of silently moving. |
| B. Inheritance from a container | `group wave:discover` with items under it | **Chosen, together with A.** No new grammar. |
| C. A sticky property for following siblings | `item auth wave:discover`, then a bare `item api` | Rejected. The assignment is invisible and depends on position ("Sequencing creates invisible dependencies"). |
| D. A divider line inside a lane | a `wave discover` line inside a lane | Rejected. Position-dependent, ambiguous in `parallel` tracks, and the keyword would have two roles. |
| E. A wave block inside a lane | `wave discover` with items indented under it | Rejected. It duplicates `group`, and the keyword would have two roles. |
| F. A wave-major file | `wave discover`, then `swimlane platform` under it | Rejected. Lanes would be reopened per wave, which breaks unique ids and include merge. |
| G. A member list on the declaration | `wave discover members:[auth, api]` | Rejected. It is detached from the work and cannot name items without ids. |

**The B idiom.**

- `group wave:x` wraps a run of a lane's work.
- In a roadmap with waves, a group with no title, no `style:` and no `labels:` that carries `wave:` draws nothing (§9.7). It only assigns membership.
- Prefer per-item `wave:` for one to three items, and `group wave:x` for longer runs.

## 4. Syntax

### 4.1 Grammar (`packages/core/src/language/nowline.langium`)

```langium
RoadmapEntry:
    PersonDeclaration | TeamDeclaration | AnchorDeclaration |
    LabelDeclaration | SizeDeclaration | StatusDeclaration |
    WaveDeclaration |
    SwimlaneDeclaration | MilestoneDeclaration | FootnoteDeclaration;

// Barrier that spans swimlanes (specs/waves/waves.md). `name` stays optional in the
// grammar so the validator reports a missing id as NL.E1100 instead of a parse error.
WaveDeclaration:
    'wave' (name=EntityName)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

// v1 compatibility: `wave` now lexes as a keyword. EntityName re-admits the bare
// word everywhere a v1 file could already write an identifier.
EntityName returns string:
    ID | 'wave';
```

Mechanical edits that come with it:

- **Name slots.** Every `name=ID` becomes `name=EntityName`, and `PersonMemberRef` becomes `'person' ref=EntityName`.
- **Value rules.** `PropertyAtom`, `StylePropertyValue` and `BlockPropertyValue` each gain `| 'wave'`. The precedent is `'person'` (`nowline.langium:47-54, 170-174`).
- **Rule name.** The rule is `EntityName`, not `Identifier`, so that its generated guard cannot shadow the validator's local `isIdentifier`.
- **`DefaultEntityType` does not change**, so `default wave` is a parse error.
- **`wave:` needs no grammar change.** `PROPERTY_KEY_WITH_COLON` wins on longest match (`nowline.langium:199-205`), and the AST key is `"wave"`.
- **Placement** follows `label`, `size` and `status` exactly (dsl.md structural rules 8-10). A `wave` line belongs in the roadmap section. If it appears before the roadmap line, the following `roadmap` line becomes a parse error.

### 4.2 The wave declaration

| Slot or key | Status | Meaning |
|---|---|---|
| id (positional) | **required** (NL.E1100) | The wave's identity. It joins the single shared id namespace (structural rule 2, NL.E0300). |
| title (positional) | optional | The strip label. Falls back to the id. |
| `after:` | optional; one value or a list | **Start floor `A_k`.** The wave cannot open before the latest of its elements. Each element must be an anchor id, the id of a milestone that has `date:`, or an ISO date (at most one date). Any other kind of entity is NL.E1106. Inline dates follow NL.E0410, NL.E0412 and NL.E0413. |
| `style:` | optional (universal) | Wave colours (§9.4). |
| `labels:`, `link:`, `description` | optional (universal) | Carried in the AST, JSON and XLSX, and shown in LSP hover. Not painted. |
| `footnote:` | error (existing rule 13a) | Waves host footnotes through `on:`. |
| `before:`, `date:`, `start:`, `length:`, `duration:`, `size:`, `capacity:`, `remaining:`, `wave:` | **error** (NL.E1105) | A wave's span comes from its items. A wave deadline is a dated milestone `after:<wave>` (Example 11). NL.E1105 is the only diagnostic for these keys. |
| any other key | warning (existing NL.W0700) | Ignored. |
| raw style properties | error (existing rule 20) | — |

### 4.3 The `wave:` property

- **Value.** The value is exactly one declared wave id. A one-element list `wave:[w1]` is the same as `wave:w1`; the printer already prints it as a scalar.
- **NL.E1101** fires for any of these:
  - a list of two or more elements;
  - an undeclared id;
  - a wave declared below the referencing entry;
  - an id that names something other than a wave.
- **In a roadmap without waves,** any `wave:` key is ignored, with the warning NL.W0702 (§4.7).

| Entity | `wave:` allowed? | Meaning |
|---|---|---|
| `item` | yes | Membership |
| `group`, `parallel` | yes | Applies to every descendant, and floors the container's own start |
| `swimlane` | **error** (NL.E1104) | A lane spans every wave. Hint: wrap the items in `group wave:<id>`. |
| `milestone` | **error** (NL.E1104) | Hint: use `after:<wave>` to mark the end of a wave. |
| `anchor`, `footnote`, `roadmap`, `person`, `team`, `label`, `size`, `status` | **error** (NL.E1104) | — |
| `wave` | **error** (NL.E1105) | — |

### 4.4 Inheritance and background work

```
ew(x) = own wave:x value                       if x declares wave:
      = ew(nearest enclosing group/parallel)   if one exists and has an effective wave
      = ⊥ (background)                         otherwise   (swimlanes never contribute)
```

- **`ew(x)`** is the *effective wave* of x: a wave index `1..n`, or ⊥.
- **Background (⊥).** An item whose effective wave is ⊥ is background work. It produces no diagnostic. The renderer marks it (§9.3).
- **Repeating a value.** A descendant may repeat its container's value. A *different* value is NL.E1102. So a descendant cannot opt out of its container's wave. Work meant to be background stays outside containers that carry a wave.
- **Containers without `wave:`.** A container with no `wave:` may hold children in different waves. That is how a group spans waves, and how parallel tracks sit in different waves.

### 4.5 `default <entity>`

- **Not on default lines.** `wave` is not allowed on any `default <entity>` line.
  - **In a roadmap with waves**, it is an error with the existing rule-23 message. For item, group and parallel, the rationale is the existing "Sequencing creates invisible dependencies".
  - **In a roadmap without waves**, it is the warning NL.W0702, because existing v1 files may carry the key.
- **Where the check lives.** It is in the wave rules, not in the static `DEFAULT_BANNED` table, so that its severity can depend on whether the roadmap has waves.
- **No `default wave`.**

### 4.6 Ordering and forward declaration

- **Wave order is declaration order** (Design Rule 6, "Order matters").
- **`wave:` must name a wave declared earlier** in the roadmap section than the top-level entry that contains the reference. This is the rule-15 model that `size:` and `status:` already use; a violation is NL.E1101 with reason `forward`.
- **`after:`, `before:` and `on:`** may name waves from anywhere in the file, like any other id.
- **Recommended style** (not enforced): declare all waves together, after sizes and statuses and before the first swimlane.

### 4.7 Lexer and v1 compatibility

**Lexing.** `wave:` lexes as a property key. `waves`, `wave-1` and `wavefront` lex as `ID`, because Langium sets Chevrotain `longer_alt` for keywords.

**Bare-word uses that keep parsing.** With `EntityName` and the three value-rule edits, every valid v1 use of the bare word `wave` keeps parsing:

- `item wave`, `swimlane wave`, `style wave` with `style:wave`, `symbol wave`, and `person wave` inside a team;
- `after:wave`, `labels:[wave]`, `owner:wave` and `icon:wave`;
- `scale` with `name: wave`.

**AST shape.** The generated `name` type stays `string`, so the JSON AST of an existing file is byte-identical.

**A v1 file that already contains a `wave:` key** keeps rendering:

| Input today | Today | After this change, roadmap with no waves | After this change, roadmap with waves |
|---|---|---|---|
| `item x wave:alpha`, `group … wave:alpha`, `swimlane s wave:alpha` | NL.W0700 "Unknown property … The renderer ignores it." | NL.W0702 "`wave:` … is ignored: this roadmap declares no waves" | the full wave rules (§6) |
| `default item wave:alpha` | no diagnostic | NL.W0702 | rule-23 error |
| NL.E0411 message text | "Allowed only on item, parallel, and group" | also mentions a wave's `after:` | same |

A roadmap "has waves" when its file declares at least one wave with a valid id. A v1 file cannot declare waves, so every v1 file falls in the middle column. These changes go under `### Changed` in the CHANGELOG.

**Printer.** Adding `'wave'` to `KEY_ORDER` leaves the output of every file without a `wave:` key unchanged.

**Residual ambiguity.** One doubly invalid input remains: a top-level declaration with neither id nor title (NL.E0301), followed directly by a `wave "Title"` line (NL.E1100). ALL(*) prediction makes `wave` the previous entity's name, and the behaviour is unspecified.

**Phase 1 check.** Langium's ALL(*) lookahead reports ambiguities at parse time, not during `langium generate`. Phase 1 therefore adds parse tests that spy on `console.warn`. If a warning appears, the fallback is to restrict `EntityName` to item, parallel, group, `PersonMemberRef` and value positions.

### 4.8 Keyword budget

**Counts.**

- `dsl.md` Design Rule 1 moves from "~20 keywords (currently 21)" to "(currently 22)".
- `principles.md` says "~17 keywords total". That is stale and becomes "~20 keywords (see dsl.md Design Rule 1)".
- The grammar has 22 quoted keyword literals today and 23 after this change. That one-literal discrepancy with `dsl.md` predates waves.

**Justification.** A wave has identity, a title, a semantic order, a description, a link, a style, footnote attachment, include agreement, LSP navigation and its own visual. That is the same class as `swimlane`, `milestone` and `anchor`. No existing keyword can carry it:

- `milestone` is a point;
- `group` and `parallel` are local to one lane;
- `anchor` is a date;
- `scale` units are a fixed cadence.

**Rejected keyword-free alternative:** `roadmap … waves:[a, b, c]`. It has no titles, metadata, LSP declaration or per-wave floors. It would also live on the roadmap line, whose include merge is parent-wins.

## 5. Semantics

### 5.1 Definitions

All quantities are offsets in axis days from the roadmap origin (`start:`, or the default start). `end` is exclusive. The pixel engine applies the same rules in x (§8).

**Notation**

- **Waves.** `w_1 … w_n` are the file's waves in declaration order. With n = 0 the semantics are exactly today's.
- **Effective wave.** `ew(x) ∈ {1..n} ∪ {⊥}` (§4.4).
- **Members.** `M_k = { items x : ew(x) = k }`.
  - Only leaf items are members, never containers.
  - Items in isolated regions are members, and so are items without ids.
- **Floor.** `A_k` is the latest date among w_k's `after:` elements (anchor date, dated-milestone date, inline date), converted to an axis offset. It is −∞ when the wave has no floor.
  - Dates are read straight from the declarations.
  - They are never clamped to a fixed `length:` window, and never looked up through the layout's edge maps.

**Barrier recurrence**

```
S_1     = max(0, A_1)
E_k     = max(S_k, max_{x ∈ M_k} end(x))       // empty wave: E_k = S_k (zero width)
S_{k+1} = max(E_k, A_{k+1})                     // a gap [E_k, S_{k+1}) exists iff A_{k+1} > E_k
F(x)    = S_{ew(x)} if ew(x) ≠ ⊥, else none    // the item's floor
```

**Lead wave of a container.** A container that has no effective wave must not open its box in a column earlier than its first piece of work.

```
lw(item x)     = ew(x)
lw(group G)    = ew(G) if G has an effective wave, else lw(first child of G)
lw(parallel P) = ew(P) if P has an effective wave,
                 else ⊥ if any track t has lw(t) = ⊥,
                 else min over tracks t of lw(t)
L(C)           = S_{lw(C)} if lw(C) ≠ ⊥, else none
```

**Start rule.** Today's rule gains one term:

```
start(x) = max(seq(x), aft(x), F(x))                 // items
start(C) = max(seq(C), aft(C), F(C), L(C))           // groups and parallels
end(x)   = start(x) + dur(x)
```

- **`seq`** is the existing sequential default:
  - 0 for the first child of a lane;
  - `start(group)` for the first child of a group;
  - `start(parallel)` for every parallel track;
  - otherwise, the end of the previous sibling.
- **`aft`** is the existing `after:` maximum. A wave reference `after:w_j` contributes `E_j`.
- **`L(C)`** never moves an item. It only keeps a container's box and bracket from opening in an earlier column.
- **Container ends** are unchanged: a group ends when its sequence ends, and a parallel ends at its latest track.
- **Engine A** keeps its existing start rule, including the fact that `after:` is not floored by the lane cursor (§8.6 divergence (a)). The floor is one more term in the `max`.
- **Item pins.** The undocumented `date:` and `start:` item pins become `max(pin, F(x))`. When the floor moves an item, layout emits NL.W1001.

**Wave references**

- **`after:w_k`** means "start no earlier than `E_k`". For an empty wave, `E_k = S_k`.
- **`before:w_k`** caps the entity's end at `S_k`. Like `before:` today, it is soft: nothing moves, and a miss paints the existing red overflow and reports NL.I1003.
- **`on:w_k`** attaches a footnote to the wave.

**Wave span.** Wave k spans `[S_k, E_k]`.

- Without floors, the columns tile `[S_1, E_n]` with no gaps and no overlap.
- A wave opens at its barrier instant, not at its earliest member's start. A column may therefore begin with idle lanes. That idle time is the honest cost of the barrier.

**Background (⊥) items**

- They are never floored, and their own end never extends a wave.
- They still follow lane order and their own `after:`.
- They still push their later siblings, so they can delay a later member of their own lane, and through it the wave (Example 3).

### 5.2 Barrier theorem

For every `k < j`, every `x ∈ M_k` and every `y ∈ M_j`:

```
end(x) ≤ E_k ≤ S_{k+1} ≤ E_{k+1} ≤ … ≤ S_j ≤ start(y)
```

- The chain is monotone because, by definition, `E_k ≥ S_k` and `S_{k+1} ≥ E_k`.
- So "no work in a wave starts before the last work in the previous wave ends" holds for **every** pair of waves, not only adjacent ones.
- The next wave may start exactly when the previous one ends.

### 5.3 Interaction with existing features

| Feature | Behaviour with waves |
|---|---|
| Sequential lane order (Design Rule 6) | Unchanged; the floor is one more term in the max. A lane idles until `S_k` when its earlier work ends early. In every lane or group flow, assigned effective waves must not decrease (WV10). Background items may appear anywhere but carry the running bound. |
| `parallel` | Each track is floored by its own wave. "Children start together" becomes "start together unless a barrier holds a track back", which is already how `after:` on a track behaves. Tracks may be in different waves. The implicit join is unchanged. The block's successor must not be in an earlier wave than any track (WV10, variant `join`). `parallel wave:k` assigns every track (Example 4). |
| `group` | Sequential. A group without `wave:` may span waves: its box crosses the boundary, with idle time inside. It never opens in a column earlier than its first piece of work (`L(C)`). `group wave:k` puts every descendant in wave k and floors the group's start at `S_k` (Example 5). |
| `after:` an item or container placed **earlier** | The max, as today. A target in the same wave in an earlier lane is fine, and it lengthens that wave for every lane (Example 6). A target in a later wave is NL.E1103. A target in an earlier wave is redundant. |
| `after:` / `before:` an item placed **later** (forward reference) | Ignored by layout, as today. In a roadmap with waves this draws NL.W1101, because lane order now changes where every lane's columns fall (Example 7). |
| `after:` an anchor, a dated milestone or an inline date | Combined with the floor by max; whichever is later wins, silently (Example 9). |
| `after:` / `before:` a floating milestone | Ignored by layout, as today: floating milestones are placed after every lane. In a roadmap with waves this draws NL.W1101. Prefer `after:<wave>`. |
| `after:<wave>` | `start ≥ E_k`. Use it for background work and milestones. On a member of a later wave it is redundant. On an entity whose wave is k or earlier it is NL.E1103 (Examples 8 and 14). |
| `before:` an item, an anchor or a date | Soft; it never moves the start. A miss caused by the barrier shows the existing red overflow plus NL.I1003 (Example 10). A miss the structure guarantees also gets NL.W1100 (Example 14). |
| Floating milestone `after:<wave>` | When a wave reference is the binding term, the diamond sits **on** the boundary at `E_k`, not 6 px left of it as for an item predecessor. Wave references draw no slack arrows (Example 8). |
| Dated milestone `after:<wave>` | Pinned to its date. If the wave ends after that date, the existing overrun treatment (a red cut line) applies, plus the info NL.I1007. This is the wave-deadline idiom (Example 11). |
| Anchors | They are dates. They can floor a wave through its `after:`, and they are never members. |
| Roadmap `start:` | It is the origin, so `S_1 ≥ 0`. An inline date on a wave requires `start:` (NL.E0412) and must be on or after it (NL.E0413). |
| Roadmap `length:` | The window stays fixed. Waves past it are computed exactly from unclamped dates and drawn the way items past a fixed window are drawn today. Without `length:`, the extent includes every `S_k` and `E_n`. |
| `calendar:` | Barrier arithmetic is in axis days. Business-calendar behaviour is unchanged. |
| `status:done`, `remaining:` | No scheduling effect. Done items keep their planned span and still count toward `E_k`. |
| Capacity and utilization | Computed from the shifted positions. Barrier idle time shows as zero load. There is no leveling. |
| Now-line | Unchanged; it is drawn over everything, including the strip. |
| Footnotes `on:` | Waves are valid targets. The indicator renders in the wave's strip cell, or in the legend when it does not fit. |
| `roadmap:merge` includes | Merged lanes take part automatically. Waves must agree (§7). |
| `roadmap:isolate` includes | Region lanes are members and are floored. Region ids stay invisible to the parent, and wave identity is shared through the agreement rule (Example 19). |
| Dependency arrows | Wave references draw no arrow, the same as inline dates. |
| Swimlane `after:` / `before:` (specified, not implemented) | Untouched. |
| Approval, sign-off, wave status | None. A boundary is only a scheduling barrier. |

## 6. Validation rules

### 6.1 Where the rules run

There are four rule sets.

- **S (declarations):** WV1–WV4.
- **P (properties):** WV5–WV9. These are per-entity checks against the file's own wave list.
- **G (graph):** WV10–WV12. These run over a *layout scope*: the ordered set of lanes that layout places together.
- **I (includes):** WV13–WV14, plus the cross-file part of WV2.

The layout emits L (WV15–WV18).

| Set | Validator (every file it validates) | `resolveIncludes` (every pipeline that resolves includes) |
|---|---|---|
| S, P | always | every participating `merge` or `isolate` child, because children are parsed with `validation:false` (`include-resolver.ts:316`) |
| G | the file's own lanes | once per layout scope of the root pipeline: the merged main lanes, and each isolated region. Findings that lie entirely inside the root file are skipped, because the validator already reported them. |
| I | — | every include edge and every participating file |

**Why G also runs on merged scopes.** In merge mode, a child's `after:` can resolve to a parent item through layout's shared maps. No per-file analysis sees that edge, and it can close a barrier cycle.

**Where diagnostics go.** Resolver diagnostics carry codes (§7.4), so the CLI, the export kernel, the browser, MCP and `--serve` can report them with file and line. CLI text mode keeps today's rule: warnings print only when the run fails. JSON mode includes them.

**Where the code lives.** All wave rules are pure functions in a new `packages/core/src/language/waves.ts`. The validator and the resolver both call them.

### 6.2 Rules

| # | Rule | Severity | Code | Set |
|---|---|---|---|---|
| WV1 | A wave declaration has an explicit id. | error | **NL.E1100** | S |
| WV2 | Wave ids share the global id namespace. Within a file this is the existing `checkUniqueIdentifiers`. Across files, a participating file's explicit ids must not equal the root's wave ids. | error | NL.E0300 (existing) | S / I |
| WV3 | A wave declaration does not take `before:`, `date:`, `start:`, `length:`, `duration:`, `size:`, `capacity:`, `remaining:` or `wave:`. | error | **NL.E1105** | S |
| WV4 | Each resolved element of a wave's `after:` is an anchor, a dated milestone or, at most once, an ISO date. NL.E0410, NL.E0412 and NL.E0413 apply to the date. | error | **NL.E1106** | S |
| WV5 | `wave:` appears only on `item`, `group` and `parallel`. | error | **NL.E1104** | P |
| WV6 | A `wave:` value is exactly one wave declared earlier. | error | **NL.E1101** | P |
| WV7 | A descendant's `wave:` equals its container's `wave:`. | error | **NL.E1102** | P |
| WV8 | When the roadmap has waves, `wave` is banned on every `default <entity>` line. | error | existing rule-23 message | P |
| WV9 | When the roadmap has no waves, every `wave:` key is ignored. This replaces WV5–WV8 for the file. | warning | **NL.W0702** | P |
| WV10 | The wave order can be realized: no member is forced to start after its own wave ends (§6.3). | error | **NL.E1103** | G |
| WV11 | A `before:` can never be met (§6.3). | warning | **NL.W1100** | G |
| WV12 | In a roadmap with waves, an `after:` or `before:` that layout ignores: a forward reference, or a floating milestone. | warning | **NL.W1101** | G |
| WV13 | Include wave agreement (§7.2). | error | **NL.E0202** | I |
| WV14 | An included wave's presentation differs from the parent's. | warning | **NL.W0701** | I |
| WV15 | A barrier moved an item pin. | warning | **NL.W1001** | L |
| WV16 | The barrier driver hit its pass cap. This is defensive and unreachable for valid input. | warning | **NL.W1002** | L |
| WV17 | One or more waves have no members. Reported once per roadmap. | info | **NL.I1006** | L |
| WV18 | A wave overruns a dated milestone whose `after:` includes it. | info | **NL.I1007** | L |

**Code ranges.**

- The `codes.ts` header gains a range comment: `NL.E1100–E1199 / NL.W1100–W1199 waves`.
- Include agreement uses the include range (E0202).
- W0701 and W0702 report silently ignored input, so they go in W07xx.
- The layout codes stay in W10xx and I10xx.

**No duplicate diagnostics.**

- `checkUnknownEntityProperties` skips `wave` on every entity, and skips WV3's keys on a wave.
- NL.E0411 does not fire on a wave's `before:`; NL.E1105 covers it.
- An element of a wave's `after:` that resolves to nothing gets only the existing "does not resolve" error. One that resolves to the wrong kind gets only NL.E1106.
- `default <entity> wave:[a, b]` gets only the WV8 or WV9 diagnostic.

**Cascade control.**

- A `wave:` value that failed WV6 makes the item background for the later rules.
- A WV7 conflict uses the container's wave.
- A wave that failed WV1 is not in the list.
- A floor that failed WV4 is treated as absent.
- A child that failed WV13 is not evaluated further.

**Cycle detection skips a wave's own `after:`.** `checkCircularDependencies` ignores the outgoing edges of a wave's `after:`. Its targets are constants, so they cannot form a schedule cycle. Without this, `wave w2 after:gate` combined with `milestone gate date:… after:w2` (the wave-deadline idiom) would be a false "Circular dependency detected".

### 6.3 The order check (WV10), unmeetable deadlines (WV11) and ignored references (WV12)

**Layout order and id resolution.**

- All three rules walk a layout scope in placement order: lanes in their merged order, children in document order, depth first. `place(v)` is a node's position in that walk.
- `resolve(r, v)` is the last node with id r (an item, group or parallel) whose `place` is less than `place(v)`. This mirrors layout's shared edge maps, including last-writer-wins when merged files reuse an id.
- A reference with no `resolve(r, v)`, or one that names a floating milestone, is ignored by every engine. WV12 reports it.

**Lower bounds.** For every node v, WV10 computes the largest `j` such that `start(v) ≥ E_j` is forced.

- **Constraints counted:** flow order, containment, the `after:` edges that layout resolves, barriers and lead floors.
- **Constraints not counted:** `before:` (it is soft) and dates (they never create `E_j` bounds).

```
init lbS(v) = 0, lbE(v) = 0 for every item, group and parallel v
constant terms:
  lbS(v) ≥ ew(v) − 1        when ew(v) is a wave index (items and containers; inherited counts)
  lbS(C) ≥ lw(C) − 1        lead floor of a container without its own wave (§5.1)
  lbS(v) ≥ j                for each after:w_j on v
propagation (relax with max until nothing changes):
  lbS(first child of group G)   ≥ lbS(G)
  lbS(each track of parallel P) ≥ lbS(P)
  lbS(next sibling)             ≥ lbE(previous sibling)          (lane and group flows)
  lbS(v)                        ≥ lbE(t)   for each after:r on v with t = resolve(r, v)
  lbE(item) = lbS(item);   lbE(C) ≥ lbS(C) and lbE(C) ≥ lbE(c) for every child c of C
violation: an item x with ew(x) = k and lbS(x) ≥ k    // forced to start at or after E_k, where its own wave ends
```

**Cost.** Values lie in `[0, n]` and only increase, so worklist relaxation costs `O((n+1)·E)` and terminates even on cyclic input. Explicit `after:`/`before:` cycles stay with the existing `checkCircularDependencies`.

**Reporting.** There is one diagnostic per root cause. For each violation, the check finds the term that achieves the bound and walks its explanation back to the origin. Variants, in order of preference:

1. **`after-wave`.** The bound comes from an `after:w_j` with `j ≥ k`, on x or on the nearest container that owns x. Reported once, on that owner's `after:`.
2. **`after-item`.** The bound comes from an `after:r` edge whose target's bound is its own wave constant. Reported on the owner of the `after:`: x itself, or its enclosing container ("… inside it").
3. **`sequence`.** The bound is a flow edge from a predecessor p whose bound is p's own wave constant. Reported once per p, on the first affected item. It lists the run R, the items whose explanation walks back to p. The advice is "move p below the last item of R", which resolves the whole run (Example 13).
4. **`join`.** The bound is a flow edge from a parallel whose bound comes from a track in a later wave. A block with no id and no title is named by position ("the parallel block on line N").
5. **Cascade.** When every edge that achieves the bound comes from a violating node that has already been explained, the violation is suppressed and folded into its origin's run.
6. **`chain`.** Anything else, typically a route through background work across lanes. The path is printed, for example `a2 (wave "w2") → review → b1`. The existing cycle check cannot see these hidden cycles (Example 15).

**WV11 (warning).** For each `before:r` on x, let `maxW` and `minW` be the largest and smallest effective wave index over the items in a subtree.

- **When r is an item or container with `resolve(r, x)` defined:** warn when `maxW(x) > minW(r)`.
  - Proof: let m be the member of r in wave `minW(r)`. Then `end(x) > start(x) ≥ S_{maxW(x)} ≥ E_{minW(r)} ≥ end(m) > start(m) ≥ start(r)`.
- **When r is a wave `w_j`:** warn when `maxW(x) ≥ j`.
- **Skipped:** background subtrees. Forward targets belong to WV12. Misses driven by dates are never known statically; they stay the layout-time NL.I1003.

**WV12 (warning).** Reported once per ignored reference, and only in roadmaps with waves. Variants: `forward-lane`, `forward-flow` and `floating-milestone`.

### 6.4 Messages (en-US)

**Conventions**

- Arguments are typed objects, as in `messages.en.ts`.
- Lists are passed as arrays and joined by the bundle.
- `{declared}` is every valid wave id in declaration order, joined with ", ".
- `{names}` lists up to five quoted names, then "and N more".
- `{suggestion}` is empty, or ` Did you mean wave:{id} ("{title}")?`. It is filled only when the existing `suggestKey` Levenshtein helper finds a unique best match within distance 2, or when the value matches a wave title case-insensitively.
- French strings are written into `messages.fr.ts` during implementation, following that file's U+00A0 punctuation convention.

| Code | Message |
|---|---|
| NL.E1100 | `Wave {label} needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".` |
| NL.E1101 `list` | `"wave:" takes exactly one wave id; an item belongs to at most one wave. Got "{value}".` |
| NL.E1101 `unknown` | `Wave "{value}" is not declared. Declared waves: {declared}. Add "wave {value}" above the first swimlane that uses it.{suggestion}` |
| NL.E1101 `forward` | `Wave "{value}" is used before its declaration on line {line}. Declare waves above the swimlanes that use them.` |
| NL.E1101 `not-a-wave` | `"wave:" must name a wave, but "{value}" is {kind}.{suggestion}` |
| NL.E1102 | `{entity} has wave:{wave}, but its enclosing {container} has wave:{containerWave}. A container's wave applies to everything inside it; remove one of the two wave: properties.` |
| NL.E1103 `sequence` | `{items} {verb} after "{ref}" (wave "{refWave}") in {flow}. Work in a lane or group runs in order, so it must also be ordered by wave: move "{ref}" below "{last}", or change their waves.` (`{items}`: `Item "a2" (wave "w1")` or `Items "a2", "a3" (wave "w1")`; `{verb}`: comes / come) |
| NL.E1103 `join` | `Item "{name}" (wave "{wave}") comes after {block} in {flow}, and that block cannot end before its track "{track}" (wave "{trackWave}") does. Move "{name}" above the block or into a track of its own, or change one of their waves.` |
| NL.E1103 `after-item` | `Item "{name}" (wave "{wave}") has after:{refId}, but "{ref}" is in later wave "{refWave}". Wave "{refWave}" cannot start until wave "{wave}" ends, so "{name}" could never start: move it to wave "{refWave}" or later, or remove the after:.` Container form: `{containerKind} "{container}" has after:{refId}, but "{ref}" is in later wave "{refWave}". Wave "{refWave}" cannot start until wave "{wave}" ends, so "{name}" (wave "{wave}") inside it could never start: move "{name}" to wave "{refWave}" or later, or remove the after:.` |
| NL.E1103 `after-wave` | `Item "{name}" (wave "{wave}") has after:{refId}, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "{name}" to a later wave.` Container form: `{containerKind} "{container}" (wave "{wave}") has after:{refId}, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move the {containerKind} to a later wave.` |
| NL.E1103 `chain` | `Item "{name}" (wave "{wave}") could never start: through {chain}, it waits for work that cannot start until wave "{wave}" has ended. Move "{name}" to a later wave, or break the chain.` |
| NL.E1104 `swimlane` | `"wave:" is not allowed on swimlane "{name}": a swimlane spans every wave. Put wave: on its items, or wrap them in "group wave:{value}".` |
| NL.E1104 `milestone` | `"wave:" is not allowed on milestone "{name}". To place a milestone at the end of a wave, use after:{value}.` |
| NL.E1104 `other` | `"wave:" is not allowed on {type} "{name}"; only item, group, and parallel can belong to a wave.` |
| NL.E1105 `before` | `"before:" is not allowed on wave "{name}". A wave's end comes from its items; to give a wave a deadline, add a dated milestone: milestone {name}-due date:<YYYY-MM-DD> after:{name}.` |
| NL.E1105 `other` | `"{key}:" is not allowed on wave "{name}". A wave's span comes from its items; only after: (an anchor, a dated milestone, or one ISO date) can hold back a wave's start.` |
| NL.E1106 | `Wave "{name}" has after:{ref}, but "{ref}" is {kind}. A wave's after: accepts only anchors, dated milestones, or one ISO date; to make a wave wait for work, put that work in an earlier wave.` |
| NL.W1100 `item` | `before:{ref} on "{name}" can never be met: "{name}" is in wave "{wave}", which cannot start until "{ref}" (wave "{refWave}") has finished. The overrun will be painted.` |
| NL.W1100 `wave` | `before:{ref} on "{name}" can never be met: "{name}" is in wave "{wave}", which cannot finish before wave "{ref}" starts. The overrun will be painted.` |
| NL.W1101 `forward-lane` | `{key}:{ref} on "{name}" refers to "{ref}", which is in a later swimlane ("{lane}"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this {key}:. Move swimlane "{lane}" above swimlane "{ownLane}", or remove the {key}:.` |
| NL.W1101 `forward-flow` | `{key}:{ref} on "{name}" refers to "{ref}", which comes later in {flow}. Layout ignores references to work it has not placed yet, so it ignores this {key}:. Move "{ref}" above "{name}", or remove the {key}:.` |
| NL.W1101 `floating-milestone` | `{key}:{ref} on "{name}" refers to milestone "{ref}", which has no date. Floating milestones are placed after all work, so layout ignores this {key}:. Reference the milestone's predecessors or a wave instead.` |
| NL.W0702 | `"wave:" on {target} is ignored: this roadmap declares no waves. Declare waves with "wave <id>" to use it, or remove the property.` (`{target}`: `item "a1"`, `swimlane "a"`, `"default item"`) |
| NL.E0202 `mismatch` | `Included "{path}" declares waves [{child}], but this file's waves are [{parent}]. Every included roadmap must declare the same waves in the same order: copy this file's wave lines into "{path}".` |
| NL.E0202 `child-none` | `Included "{path}" declares no waves, but this file's waves are [{parent}]. Copy this file's wave lines into "{path}" so its work joins the waves.` |
| NL.E0202 `parent-none` | `Included "{path}" declares waves [{child}], but this file declares none. Declare the same waves here so the barriers apply to the whole roadmap.` |
| NL.E0202 `floor` | `Wave "{id}" in "{path}" opens no earlier than {childFloor}, but this file's wave "{id}" opens no earlier than {parentFloor}. A wave must have the same start floor in every included roadmap.` (`{…Floor}`: an ISO date, or `no floor`) |
| NL.W0701 | `Wave "{id}" in "{path}" differs from this file's definition ({fields}); this file's definition is used.` (`{fields}`, for example `title "Discovery" there, "Discover" here`) |
| NL.W1001 | `Item "{name}" is pinned to {pin} ({key}:), but wave "{wave}" cannot start until {start}; the item starts at the wave start.` |
| NL.W1002 | `Wave barriers did not settle after {passes} layout passes, so the drawn schedule may not respect the wave order. The roadmap probably has an ordering conflict that validation did not catch.` |
| NL.I1006 `one` | `Wave "{name}" has no items, so it spans no time; it is drawn as a marker in the wave strip and listed in the wave legend.` |
| NL.I1006 `many` | `Waves {names} have no items, so they span no time; they are drawn as markers in the wave strip and listed in the wave legend.` |
| NL.I1006 `all` | `None of the declared waves ({names}) has items yet. The wave strip shows a placeholder until work is assigned with wave:<id>.` |
| NL.I1007 | `Milestone "{name}" ({date}) is overrun: wave "{wave}" ends {end}.` |

**Other message changes.**

- **NL.E0411.** The text becomes `Inline date in "{key}:" is not allowed on {type}. Allowed only on item, parallel, and group, and on a wave's after:; for a milestone use "date:" instead.` Rule 24a is updated the same way.
- **NL.E0300 across files.** It uses the existing message, with a `{file}:{line}` location.

## 7. Includes: every roadmap agrees on waves

### 7.1 Definitions

- **`own(F)`** is the ordered list of waves declared in F with a valid id (WV1). Includes never contribute waves: each participating file declares its own.
- **`floor_F(w)`** is wave w's resolved start-floor date in F: the latest date among its `after:` elements, resolved against F's content. It is "no floor" when w has no floor, or when its floor failed WV4.
- **`σ(F)`** is the ordered list of `(id, floor_F(id))` over `own(F)`.
  - Resolved dates are compared, not the written references.
  - Two files that write `after:fy-budget` and `after:2026-02-02` for the same date agree.
  - Two files whose `fy-budget` anchors carry different dates do not agree.
- **`participates(C)`** holds when any of the following is true:
  - C declares a roadmap;
  - C's resolved content has at least one swimlane;
  - `own(C)` is non-empty.

  Files that hold only vocabulary (persons, teams, labels, sizes, statuses, anchors) and no waves do not participate. Neither do children that failed to read or parse, or circular-include stubs.

### 7.2 Include rule 12 (NL.E0202)

For every include edge `P → C` whose `roadmap:` mode is `merge` or `isolate` and where `participates(C)` holds, `σ(C)` must equal `σ(P)`.

- Two empty lists pass.
- A mismatch is an error reported on P's `include` line. The variant is `mismatch`, `child-none`, `parent-none` or `floor`.
- Like rule 11 for `start:`, this is an explicit exception to rule 8's "parent wins with warning".
- **Both directions are errors.**
  - A parent with waves and a participating child without them fails. Otherwise the child's work would silently become background work.
  - A child with waves and a parent without them also fails. The child's waves would otherwise vanish in the merge.
- **Presentation differences warn.** When σ is equal, title, `style:`, `labels:`, `link:` and `description` are compared. Each differing wave yields one NL.W0701 per edge, and the parent's definition wins.
- **Transitive includes.** Each edge is compared against its direct parent, so by induction every file agrees with the root.
- **Diamonds.** In a diamond, D is resolved once (the `processed` cache). Each edge is still compared at its own level, as the `start:` check does.
- **Skipped edges.** An edge whose child failed to read, or reported NL.E1100, is not compared.

### 7.3 Modes and patterns

| Case | Behaviour |
|---|---|
| **Re-declared waves (the pattern)** | Every participating file declares the same `wave` lines, including floors. Rule 12 catches drift at the root. Every file renders on its own, with full editor support. This is how `examples/nested/*` already re-declares sizes and labels (Example 16). |
| Floors combined with includes | Supported. Inline-date floors avoid anchor shadow warnings in merge mode, and σ compares resolved dates (Example 16). |
| `config:` mode | Irrelevant. Waves are roadmap content. |
| `roadmap:ignore` | Exempt. The child's waves are dropped. |
| Vocabulary-only child (no roadmap line, no swimlanes, no waves) | Exempt (Example 18). |
| Child with swimlanes but no waves, under a parent with waves | Error (`child-none`). |
| `roadmap:isolate` | The child must agree, because the canvas and the barrier are global (like rule 11). Layout maps a region's `wave:x` to the global wave by id (Example 19). |
| A shared `waves.nowline` that provides waves to other files | Not supported in this proposal (§12). |

### 7.4 Merge mechanics (`packages/core/src/language/include-resolver.ts`)

**`ResolvedContent.waves`**

- `ResolvedContent` gains `waves?: Map<string, WaveDeclaration>`. Its insertion order is the wave order.
- The field is optional in the exported type, so downstream code that builds a `ResolveResult` by hand keeps compiling. Consumers read `content.waves ?? EMPTY`.
- The resolver seeds it from the file's own valid waves.
- Waves **never** go through `mergeContentMap`. Children's waves are not merged at all, because rule 12 guarantees they are equal. So no "Wave X … is shadowed by the parent's definition" warning ever appears.
- An isolated region keeps its own `content.waves`, which rule 12 makes identical.

**Ids and slugs**

- Wave ids join `collectExplicitRoadmapIds`.
- After the include loop, any title-only map entry whose slug key equals a wave id is re-keyed with the existing `uniqueMapKey`. Layout seeds edge maps by key, so a dated `milestone "Launch"` would otherwise share the key `launch` with `wave launch`.

**Coded diagnostics**

- `ResolveDiagnostic` gains `code?: MessageCode` and `args?: unknown[]`, the same rest-tuple shape that `acceptTr` stores and `stableValidatorCode` expects.
- Existing diagnostics don't set these fields, so their JSON shape is unchanged.
- The en-US `message` is always filled. Consumers that know a locale call a new core helper, `localizeResolveDiagnostic(locale, d)`.
- `packages/browser/src/diagnostic-row.ts` uses `code ?? 'include'`.

**Evaluation order.**

- The rule-12 check runs in a second loop over the recorded `(include, child, mode)` edges, after P's include loop. This keeps it independent of include order.
- The S, P and G evaluations of §6.1 run once, at the end of `resolveIncludes`, over the files and scopes recorded during resolution.
- Nodes map to a file and line through `$document.uri` and `$cstNode.range`.

## 8. Layout

### 8.1 Options considered

| | Wave-major segment walk | **Pass-level least fixpoint (chosen)** | Day-space pre-pass that feeds pixel floors |
|---|---|---|---|
| Pixel exactness | exact | exact | not exact: divergences (b)–(d) make day barriers smaller than pixel ends |
| Refactor | `SwimlaneNode`, `GroupNode` and `RowPacker` must become resumable segments; containers get suspended mid-way; provisional y values; tab collapse must become wave-aware | one floor helper, one accumulator, and a loop around the existing lane pass | a floor hook plus a unified day scheduler |
| Isolated regions | region lanes must be interleaved per wave | natural: floors come from the previous pass | natural |
| Cost | 1 pass | ≤ n + 1 passes | 1 + 1 passes |
| Byte stability without waves | rewrites the hot path | same code path, guarded | same |

### 8.2 Barrier driver (new `packages/layout/src/wave-barrier.ts`)

One driver, independent of units, serves all three schedulers:

- engine A, the pixel layout;
- engine B, `computeContentEndDay` (days);
- engine C, `scheduleRoadmap` (days).

```
solveWaveBarriers(n, origin, A[1..n], runPass):     // runPass(S, E) -> memberEnd[1..n] (−∞ if no member)
  S[1] = max(origin, A[1]); for k in 2..n: S[k] = max(S[k-1], A[k])
  E[k] = S[k] for all k                             // a valid lower bound
  for pass in 1..n+1:
    m = runPass(S, E)                               // pure in (S, E): entity maps reset each pass
    E'[1] = max(S[1], m[1])
    for k in 2..n: S'[k] = max(E'[k-1], A[k]); E'[k] = max(S'[k], m[k])
    S'[1] = S[1]
    if (S', E') == (S, E): return { S, E, passes: pass }
    (S, E) = (S', E')
  return { S, E, passes: n+1, capped: true }        // emits NL.W1002; unreachable for valid input
```

`A[k]` is computed directly from each floor element's own date:

- the anchor's `date:`, the dated milestone's `date:`, or the inline date;
- projected with an unclamped `scale.forward(date)` in engine A, and with `daysBetween` in engines B and C.

It never goes through `forwardWithinDomain`, the seeded edge maps or `resolveAfterDay`. B and C fill `milestoneEnd` only after their lane walk, so reading a floor through those paths would return 0.

### 8.3 Termination and least schedule

1. **Monotone.** Every start is a `max` of non-negative-offset terms, so positions are a monotone function of `(S, E)`. `RowPacker` bumps change y only (`roadmap-node.ts:456-462`).
2. **Bounded dependencies.** For valid input (WV10 holds on every merged scope), a member of wave k depends only on constants, `S_1..S_k` and `E_1..E_{k−1}`.
3. **At most n + 1 passes.** Pass p computes `E_1..E_p` and `S_1..S_{p+1}` exactly, so every wave is exact after pass n. Entities that read `E_n` (`after:w_n`) become exact in pass n + 1, which also confirms the result.
4. **Least fixpoint.** Iteration starts from a valid lower bound and stops at the first fixpoint. By Kleene, the result is the least fixpoint: the earliest schedule that satisfies every constraint.
5. **Invalid input.** Input that breaks the rules (for example, an LSP preview of a file with NL.E1103) hits the cap. The result is deterministic, and layout emits NL.W1002.
6. **Cost.** `O((n+1)·(N + R))` for N main nodes and R region nodes. Example 1 converges in exactly 4 passes, Example 19 in 3 and Example 16 in 2.

A warm start from day space would be wrong: divergence (a) can make pixel values smaller than day values.

### 8.4 Engine A hook points (pixels)

**Context**

- `LayoutContext.waves?: WaveLayoutState` is `undefined` when n = 0.
- Otherwise it holds:
  - the ordered ids and `indexOf`;
  - `waveOf` and `leadOf`, both `WeakMap<AstNode, …>`, built by the core helper `buildWavePlan`;
  - `S[]` and `E[]`, in px;
  - the `memberEnd[]` accumulator and the binding member per wave.

**Floor application.** A helper `waveFloorX(node, ctx)` applies `max(x, S[ew(node)], S[lw(node)])` wherever a start is computed, so the row packer's prediction matches the final placement:

- `resolveChildStart` (`layout.ts:972`) gains the node and applies the floor after its existing pin and `after:` logic. This covers lane items and blocks (`swimlane-node.ts:270, 292`), group children (`group-node.ts:125, 152`) and `firstChildStartX` (`swimlane-node.ts:183`).
- `sequenceItem` (`layout.ts:239-257`) applies the floor after the pin and `after:` logic. This covers parallel tracks, which reach `sequenceItem` directly. It also records `wavePinOverride` when a `date:` or `start:` pin moved.
- `GroupNode.place` (`group-node.ts:85`) and `ParallelNode.place` (`parallel-node.ts:45`) floor their own start by the container's own wave and by its lead wave.

**Accumulation.** For each member, `sequenceItem` sets `memberEnd[k] = max(memberEnd[k], box.x + box.width + ITEM_INSET_PX)`.

- This is the lane cursor's `itemLogicalEnd` formula (`swimlane-node.ts:322`), including the `MIN_ITEM_WIDTH` clamp.
- Group boxes and caption spill never enter it.

**Seeds.** Each pass resets the entity maps to the anchor and dated-milestone baseline, then seeds:

- `entityRightEdges[w_k] = E[k]`;
- `entityLeftEdges[w_k] = S[k]`.

A floating milestone's predecessor lookup reads `entityRightEdges` for any ref that is not a placed item, so a floating milestone bound by a wave sits on the boundary.

Effects:

- `after:<wave>`, `before:<wave>` and a floating `milestone after:<wave>` resolve through the existing lookups unchanged.
- WV2 makes a collision between a wave id and another id an error, so the shared maps are unambiguous.
- Resetting each pass keeps forward references dropped exactly as they are today.

**Pass loop (wave mode only).** `RoadmapNode.place` wraps `runSwimlaneLoop` plus a region pass in `runPass`.

- The region pass runs `buildIncludeRegions` with the shared wave state and accumulates members. Every region placement made inside the loop is **discarded**.
- After convergence:
  - the existing slack-corridor rerun (`roadmap-node.ts:463-482`) runs once, with `S`/`E` frozen and the seeds re-applied;
  - `growChartRightX` runs as it does today;
  - the existing final region placement (`roadmap-node.ts:507-513`) runs **once**, frozen, without accumulating.

**Visual gutter.** Take `i ∈ M_j` and `l ∈ M_k` with `j < k`:

- `visualRight(i) = box.x + box.width ≤ E_j − 6 ≤ S_k − 6`;
- `visualLeft(l) = logicalLeft(l) + 6 ≥ S_k + 6`.

So bars of different waves always have a gutter of at least 12 px between them (2 × `ITEM_INSET_PX`), including inside isolated regions. The boundary line sits in that gutter.

### 8.5 Engines B and C (days)

Both run the same driver. Inside `runPass` they walk:

- the main lanes;
- **exactly one level** of isolated-region lanes. Each region gets fresh id maps seeded only with the wave edges, matching engine A's region `childCtx`.

Nested regions contribute nothing in any engine, because engine A does not draw them.

**Engine B** (`computeContentEndDay`, `layout.ts:1190`)

- The in-pass walk replaces the post-hoc region recursion (`layout.ts:1318-1331`). That recursion is kept for n = 0.
- The content end includes `E_n` and every `S_k`. Without this, the domain would be too short: ticks cover only the domain, and `forwardWithinDomain` drops date pins.

**Engine C** (`scheduleRoadmap`, `schedule.ts:72`)

- `resolveAfterDay` resolves wave ids to `E_k`.
- `RoadmapSchedule` gains `waves?: Map<id, { index, start, end, memberCount, heldBy?, floorRef? }>`.

B and C share the driver and a small `floorAndAccumulate` helper. Their walkers are **not** merged in this change, to keep the risk down.

### 8.6 Agreement between engines

Engines A and C produce the same schedule unless one of the existing divergences triggers:

- **(a)** an `after:` that ends before the lane cursor, or an `after:` that does not resolve, falls back toward the lane start in engine A;
- **(c)** caption spill inside a group that has a following sibling;
- **(d)** a group track that binds a parallel join adds `TRACK_BLOCK_TAIL_GUTTER_PX` (8 px).

The full list, (a)–(f), is in [`handoff.md`](./handoff.md) §4.

Consequences:

- The worked examples avoid these divergences by construction, and the layout tests assert A = C exactly on them.
- A separate test pins divergence (d) with waves present.
- Waves add **no** wave-only cursor rule. Engine A's barrier is computed from engine A's own ends, so the barrier's correctness never depends on the engines agreeing.

### 8.7 Positioned model (`packages/layout/src/types.ts`)

Every new field is optional and **omitted**, never present as `undefined` or `[]`, when there are no waves.

```ts
export interface PositionedWave {
    id: string;
    title: string;                 // title ?? id
    index: number;                 // 0-based declaration order
    visibleOrdinal?: number;       // 0-based among non-empty waves; drives strip-cell alternation
    startX: number;                // S_k (logical px)
    endX: number;                  // E_k (logical px)
    startDate: Date;               // scale.invert(startX), whole UTC day
    endDate: Date;                 // exclusive
    memberCount: number;
    empty: boolean;
    heldBy?: string;               // binding member (latest logical end; ties -> first in lane order): id ?? title
    floorRef?: string;             // the after: value that set S_k when it beat E_{k-1}
    columnBox: BoundingBox;        // startX..endX × chartTopY..swimlaneBottomY
    strip: {
        box: BoundingBox;
        label?: string;
        labelKind: 'title' | 'id' | 'ellipsis' | 'ordinal' | 'none';
        labelX: number;            // centred on the visible part of the span
        tooltip: string;
        footnotesShown: boolean;
    };
    style: { tint?: string; stripFill: string; text: string; boundary: string; boundaryDash: string | null; boundaryVisible: boolean };
    footnoteIndicators: number[];
}
export interface PositionedWaveBoundary { x: number; topY: number; bottomY: number; stroke: string; dash: string | null }
export interface PositionedWaveCrossing { x: number; topY: number; bottomY: number; stroke: string }  // over background bars
// PositionedRoadmap.waves?: PositionedWave[]
// PositionedRoadmap.waveBoundaries?: PositionedWaveBoundary[]
// PositionedRoadmap.waveCrossings?: PositionedWaveCrossing[]
// PositionedRoadmap.waveLegend?: { box: BoundingBox; entries: WaveLegendEntry[] }
// PositionedTimelineScale.waveStrip?: { y: number; height: number; placeholder?: string }
// PositionedItem.waveRole?: 'member' | 'background'      // set on every item when the roadmap has waves
// PositionedItem.wavePinOverride?: { wave: string; key: 'date' | 'start'; pin: string; start: string }
// PositionedMilestone.onWaveBoundary?: boolean            // suppresses the cut line (§9.2)
// PositionedMilestone.overrunByWave?: string
// PositionedIncludeRegion.waveCrossings?: PositionedWaveCrossing[]
```

`buildWaves` in a new `packages/layout/src/nodes/wave-node.ts` builds the waves, boundaries, crossings and legend. It runs **after** the marker-row `deltaY` shift (`roadmap-node.ts:596-629`), from the final `chartTopY` and `swimlaneBottomY`.

### 8.8 Header placement

- **Row order, top to bottom:**
  1. now-pill (16 px);
  2. tick panel (24 px);
  3. **wave strip** (`WAVE_STRIP_HEIGHT_PX` = 20);
  4. marker rows (n × 26 px);
  5. an 8 px gap;
  6. the chart.
- **Geometry.**
  - `waveStrip.y = tickPanelY + tickPanelHeight`.
  - The marker-row panel moves down by 20.
  - The strip height is added to `headerRowsHeight` (`roadmap-node.ts:299-312`) only when waves exist.
- **Why the strip never moves.** Its height is fixed, so `chartTopY` is known before the passes run. It sits above the marker rows, so the post-hoc marker re-pack growth never moves it.
- **`timeline-position:bottom`.** The tick panel height is 0, so the strip sits directly under the now-pill row. The mirrored bottom panel carries no waves, the same as markers.
- **Legend.** When it is shown (§9.5), it sits below the chart (and below the bottom tick panel, if any) and above the footnote panel. `ctx.chartBottomY` grows by `WAVE_LEGEND_GAP_PX` plus its line heights before `buildFootnotes` runs.

### 8.9 Byte stability

When n = 0:

- the driver is never called;
- regions are placed exactly where they are today;
- the strip and the legend add 0 height;
- every new model field is omitted;
- the renderer emits no `wave-*` layers and no new `<defs>`;
- group brackets follow today's rule;
- exporters add no columns, sheets, tasks or sections;
- validation is unchanged for files with no `wave` keyword and no `wave:` key.

The grammar change keeps the AST shape, so JSON hashes are unchanged.

**Gates**

- All 12 `packages/integration-tests/test/__snapshots__/*.svg` files and `packages/integration-tests/determinism/hashes.json` pass **without** `UPDATE_LAYOUT_SNAPSHOTS` or `UPDATE_DETERMINISM_GOLDENS`.
- A test asserts that a `PositionedRoadmap` without waves has no new keys.
- Running the validator over `examples/` and `tests/` gives diagnostics byte-identical to the baseline.

## 9. Rendering (`packages/renderer/src/svg/render.ts`)

The mockup in [`samples/checkout-relaunch.svg`](./samples/checkout-relaunch.svg) shows the light-theme design: strip, boundaries, a milestone on a boundary, background hatch and legend.

### 9.1 Wave strip

**Panel and cells** (`data-layer="wave-strip"`, emitted right after `renderTimeline`, before lane backgrounds and the grid)

- **Backing panel.** A rect spanning the timeline width at `waveStrip.y`: 20 px high, `rx 4`, fill `timeline.panelFill`, stroke `timeline.border`.
- **Cells.** One cell per non-empty wave over `[startX, endX]`. The fill is `wave.stripFill` or `wave.stripFillAlt`, by `visibleOrdinal % 2`, so empty waves and gaps never break the alternation.
- **Grid.** Major grid lines, drawn later, cross the cells exactly as they cross the tick panel.

**Labels** (`data-layer="wave-labels"`, after the boundary lines)

- **Text.** 10 px, weight 600, in `style.text ?? wave.labelText`, centred at `labelX` (the centre of the visible part of the span).
- **Halo.** Each label sits on a halo rect in its cell's fill, so grid lines never cut through text. The precedent is the include region's source-path halo.
- **Fit.** The width test is `estimateTextWidth(text, 10) × MARKER_BOLD_WIDTH_FACTOR + superscript width + 2 × 6 px padding ≤ visible cell width`. Candidates, in order:
  1. the title;
  2. the id;
  3. the title ellipsized to 3 or more characters plus "…";
  4. the 1-based ordinal `#k`;
  5. no label.
- **Footnote superscripts** are right-aligned in the cell. When they don't fit, they move to the legend.
- **Tooltip.** Every cell has a `<title>`, for example `Launch · 2026-02-02 – 2026-02-23 · held by i2`. The end date is exclusive, and "held by" comes from the layout `LocaleStrings` table.

**Empty wave.**

- It is drawn as a hollow 7 px diamond at x, centred in the strip and stroked in `wave.boundary`.
- Several empty waves at the same x step 9 px to the right.
- It always appears in the legend.

**Gap** (`S_{k+1} > E_k`).

- The gap has no cell; the backing panel shows through.
- The floor reference (`fy-budget` or `2026-02-02`) is drawn centred in the gap in 10 px italic `wave.labelMuted`, when it fits.

**All waves empty.** This is the typical first render after adding `wave` lines. No cells, markers, boundaries or crossings are drawn. The strip shows one muted placeholder: `Waves declared: Discover, Build — no items assigned yet`.

### 9.2 Boundary lines (`data-layer="wave-boundary"`)

- **Layer.** After the grid and before the under-bar edges: **under** bars, **over** the marker-row panel. Diamonds and labels are drawn later, so they stay on top.
- **Stroke.** `WAVE_BOUNDARY_WIDTH_PX` (2 px), solid, in `style.fg ?? wave.boundary`.
  - Style `border:dashed` gives a `4 2` dash, and `dotted` gives `1 2`.
  - `none` omits the line.
- **Positions.** There is one line at every distinct x in `{S_k} ∪ {E_k}`, except the origin:
  - contiguous waves give one line per boundary, plus a closing line at `E_n`;
  - a gap gives two lines;
  - an empty wave adds no line of its own.
- **Which style.** A wave's opening line uses its own style. In a gap, the closing line at `E_k` uses wave k's style.
- **Span.** From the top of the strip down to `swimlaneBottomY`, so the cell edge, the marker rows and the column below read as one continuous line.
- **Gutter.** The line sits in the logical gutter of at least 12 px (§8.4).
- **Milestone on a boundary.** A milestone whose diamond falls on a boundary (`|center.x − boundary.x| < 0.5 px`, recorded as `onWaveBoundary`) keeps its diamond and label but **does not draw its cut line**. The boundary already marks that instant, and two vertical lines in the same place would read as a rendering bug.
  - This is the common `milestone … after:<wave>` case (the Beta and GA milestones in the mockup).
  - A dated milestone that a wave overruns is never on a boundary, so it keeps its red cut line.

### 9.3 Background work (`waveRole: 'background'`)

The design rule is to mark the exception, not the rule. In a roadmap with waves, most bars are members. Members keep exactly today's look, and their column and its strip header say which wave they belong to. Background bars get two computed cues. Neither is an authored style, so the content/render split holds.

1. **Hatch.** A diagonal hatch overlay is drawn immediately after the bar's fill rect, before the progress strip, text and decorations.
   - It uses one of two `<pattern>` defs, chosen by the bar fill's relative luminance (the existing `relativeLuminance` helper):
     - `nl-wave-hatch-dark` (stroke `wave.hatch`) on light fills;
     - `nl-wave-hatch-light` (stroke `wave.hatchOnDark`) on dark fills.
   - Pattern: 6 px tile, 45°, 2 px stroke at `WAVE_HATCH_OPACITY` (0.13).
   - Status colour, the progress strip, the status dot and the text stay readable.
   - Each def is emitted only when at least one bar uses it.
2. **Crossings.** For every boundary x that a background bar straddles, layout emits a crossing segment from the bar's top to its bottom. The renderer draws it as a 1 px `2 2` dashed line in the boundary colour, **over** the bar. It shows that the barrier does not hold this work (`data-layer="wave-cross"`, drawn after include regions and before edges).

Also:

- The hover tooltip of a background bar adds `Background (no wave)`.
- The XLSX `Wave` column is blank for background work.

**Rejected alternatives**

- A dashed outline collides with authored `border:dashed` styles, such as the `risky` style in the examples.
- Reduced opacity reads as done or disabled.
- A wave tab or stripe on every member marks the majority, competes with the progress strip and status dot, and adds clutter.
- A glyph is too small at bar size and needs the legend to decode.

**Why hatch.** Today the renderer uses no `<pattern>` and no hatching, so hatch is the one unused visual channel. In Gantt convention, hatching already reads as ongoing or level-of-effort work.

### 9.4 Column tint and styled waves (`data-layer="wave-bg"`)

**No column tint by default.** Tinting every other column over alternating lane rows makes a four-tone checkerboard. In grayscale, an untinted odd lane and a tinted even lane differ by about 5 levels, which is unreadable. The strip cells and boundary lines carry the columns instead, as Visio phase separators do.

A wave whose style sets `bg` opts in:

| Property | Effect |
|---|---|
| `bg` | **Column tint:** a rect over `columnBox` at `fill-opacity` `WAVE_STYLED_TINT_OPACITY` (0.12), drawn after lane backgrounds and before the grid. **Strip cell:** a `bg` overlay at `WAVE_STYLED_STRIP_MIX_OPACITY` (0.25). |
| `fg` | Boundary colour. |
| `text` | Label colour. When absent, and `wave.labelText` would fall below 4.5:1 against the composited cell fill, the renderer picks dark or light text by luminance. |
| `border` | Boundary dash (`solid`, `dashed`, `dotted`); `none` omits the boundary. |
| everything else | Ignored. |

There is no `default wave` and no `Theme.entities.wave`. `wave-node.ts` reads the named style from `resolved.config.styles` through `resolveColor`.

### 9.5 Wave legend (`data-layer="wave-legend"`)

PNG and PDF have no tooltips, so the legend is the fallback for anything the picture abbreviates. It is one or more lines of 10 px `wave.labelText`, wrapped at entry boundaries.

**When it is drawn.** It appears when any of the following holds:

- the roadmap has a background item;
- any wave's label is not its full title;
- any wave's footnote indicators were dropped;
- any wave is empty.

**Entries**, in this order:

1. A hatch swatch with `Background work (not in a wave)`, when background items exist.
2. A boundary swatch with `Wave boundary`.
3. Wave names whenever any label is abbreviated or any wave is empty, for example `Waves: #1 Discover · #2 Build ¹ · #3 Hardening (TBD) (no items) · #4 Launch`.

### 9.6 Distinctness

| Element | Stroke | Light | Dark | Grayscale | Span | Layer |
|---|---|---|---|---|---|---|
| Grid (major) | 1 px solid | `#cbd5e1` | `#475569` | `#bdbdbd` | tick panel to chart bottom | under bars |
| **Wave boundary** | **2 px solid** | **`#0d9488`** (teal) | **`#2dd4bf`** | **`#616161`** | strip top to last lane | under bars |
| Wave crossing | 1 px `2 2` | boundary colour | boundary colour | boundary colour | one background bar | over bars |
| Anchor cut | 1 px `1 3` | `#64748b` | theme `anchorDiamond.cutLine` | theme | diamond to last lane | over bars |
| Milestone cut | 2 px `6 4`, round caps | `#1e1b4b` (indigo) | `#a5b4fc` | `#2a2a2a` | diamond to last lane | over bars |
| Now-line | solid, with pill | red | red | theme `nowline.stroke` | pill to bottom | topmost |

- **Dark theme.** Teal keeps the boundary distinct from the indigo milestone cut, whose `cutLineNormal` is `#a5b4fc` there.
- **Grayscale.** The boundary differs from the grid by weight and tone (about 3.3:1), and from the milestone cut by dash.

### 9.7 Groups that carry `wave:`

- In a roadmap with waves, a group with no title, no `style:` and no `labels:` that carries `wave:` draws no bracket. It exists only to assign membership.
- Without this rule, the default themes' `bracket: solid` would paint a slate `[` exactly over the boundary at `S_k`, because `group wave:k` opens there.
- A titled group with `wave:` keeps its bracket.
- The rule is gated on `wave:` being present.

### 9.8 Include regions

The opaque region fill (`render.ts:1859`) would hide the early layers. So, only when waves exist, `renderIncludeRegion` re-emits:

- **boundaries and styled tints**, immediately after the region fill rect. They are clipped by rect intersection to the painted region rect (`box.x + 8`, `width − 16`), with no `clipPath` and no new `<defs>`;
- **crossings and hatch overlays** for region items, after the nested lanes.

The strip stays global.

### 9.9 Z-order

1. defs (hatch patterns only when used)
2. background
3. timeline panels, then **wave-strip**
4. lane backgrounds
5. **wave-bg** (styled tints only)
6. grid
7. **wave-boundary**
8. **wave-labels** (labels, empty-wave markers, gap floor labels, superscripts, placeholder)
9. under-bar edges
10. lanes (background bars carry their hatch overlay)
11. include regions (each re-emits tints, boundaries, crossings and hatch)
12. **wave-cross**
13. edges
14. cut lines (minus those with `onWaveBoundary`)
15. markers
16. now-line
17. footnotes and **wave-legend**, header, attribution, logo

### 9.10 Theme tokens and constants

A new `wave` group goes into `packages/layout/src/themes/shape.ts`, with values in all three themes. tsc enforces that every theme defines them. Constants go in `themes/shared.ts`.

| Token | light | dark | grayscale |
|---|---|---|---|
| `wave.stripFill` | `#f0fdfa` | `#042f2e` | `#fafafa` |
| `wave.stripFillAlt` | `#ccfbf1` | `#134e4a` | `#e0e0e0` |
| `wave.labelText` | `#134e4a` | `#99f6e4` | `#212121` |
| `wave.labelMuted` | `#0f766e` | `#5eead4` | `#616161` |
| `wave.boundary` | `#0d9488` | `#2dd4bf` | `#616161` |
| `wave.hatch` | `#0f172a` | `#0f172a` | `#000000` |
| `wave.hatchOnDark` | `#ffffff` | `#ffffff` | `#ffffff` |

Constants:

- `WAVE_STRIP_HEIGHT_PX = 20`
- `WAVE_BOUNDARY_WIDTH_PX = 2`
- `WAVE_CROSS_DASH = '2 2'`
- `WAVE_HATCH_OPACITY = 0.13`
- `WAVE_STYLED_TINT_OPACITY = 0.12`
- `WAVE_STYLED_STRIP_MIX_OPACITY = 0.25`
- `WAVE_STRIP_LABEL_FONT_SIZE_PX = 10`
- `WAVE_EMPTY_MARKER_SIZE_PX = 7`
- `WAVE_LEGEND_LINE_PX = 14`
- `WAVE_LEGEND_GAP_PX = 8`

These values are proposals, to be tuned in snapshot review. Theme tests (`packages/layout/test/themes.test.ts`) enforce contrast floors in every theme:

- boundary against `gridLine`: ≥ 2.0;
- boundary against `minorGridLine`: ≥ 2.0;
- boundary against both lane tints: ≥ 3.0;
- label against both strip fills: ≥ 4.5.

## 10. Exporters and tooling

All wave output is gated on waves existing. Exporters read waves from `inputs.resolved.content.waves`, and membership through the core helper `buildWavePlan`.

| Surface | Change |
|---|---|
| Core helpers (`packages/core/src/language/waves.ts`, re-exported from `packages/core/src/index.ts`) | **Membership:** `ownWaves(file)`, `effectiveWave(node, waves)`, `leadWave(node, waves)`, `waveFloorDate(wave, content)`. **Rule sets** (each returns coded findings bound to AST nodes): `checkWaveDeclarations(file)` (S), `evaluateWaveProperties(file, waves)` (P), `evaluateWaveOrder(scope, waves)` (G). **Other:** `localizeResolveDiagnostic(locale, d)`, and `buildWavePlan(resolved)` for layout and exporters. |
| JSON / AST | A new node, `{"$type":"WaveDeclaration","name":"build","title":"Build","properties":[…]}`, in `roadmapEntries`. `wave:` is a plain `EntityProperty`. The change is additive, so `NOWLINE_SCHEMA_VERSION` stays `'1'`. |
| Printer (`packages/core/src/convert/printer.ts`) | Add `case 'WaveDeclaration': return this.simpleEntity('wave', entry, depth)`; without it, `printNowlineFile` throws `Unknown roadmap entry type`. Add `'wave'` to `KEY_ORDER` between `'owner'` and `'after'`. |
| CLI, export kernel, browser, MCP | Coded resolver diagnostics are routed like validator diagnostics (§6.1). The browser uses `code ?? 'include'`. MCP: `entityTypes += 'wave'` and `itemPropertyKeys += 'wave'` (`packages/mcp/src/schema-vocab.ts`), and the cheatsheet is updated (`reference-cheatsheet.ts`). |
| XLSX (`packages/export-xlsx/src/index.ts`) | **Items sheet:** a `Wave` column after `Parallel`, holding the effective wave id, blank for background work. **New last sheet, `Waves`:** ID, Title, Order, Start, End (exclusive), Items, Held by, After, Description, with dates from engine C. Existing sheet indices are unchanged. |
| MS Project (`packages/export-msproj/src/index.ts`) | **Wave-end milestone tasks.** One zero-duration milestone task per wave, `{title} (wave end)`, at outline level 1. Its FS predecessor links come from every member with an id, plus the previous wave's end task. **Barrier links.** Every member of wave k ≥ 2 gains an FS link to wave k−1's end task. **Floors.** An anchor or dated-milestone floor becomes a predecessor; an inline-date floor is dropped and counted. **Limits.** Members without ids are lossy. The exporter stays AST-only and still encodes no implicit lane sequencing (pre-existing). |
| Mermaid (`packages/export-mermaid/src/index.ts`) | **`section Waves`.** Placed after `section Anchors` and before the lanes, with lines like `{title} (wave end) :milestone, {waveId}, {E_k date}, 0d`, dated from engine C. **Wave tokens.** `startTokenFor` (`:315`) appends `{prevWaveId}` to members in wave k ≥ 2. **Ids.** The milestone id equals the wave id, so `after:build` maps to `after build`. **Floors** are dropped and counted. |
| HTML / PDF / PNG | They inherit the SVG. A PDF test confirms that svg-to-pdfkit draws the hatch pattern. If it does not, the renderer falls back to explicit stripe lines clipped arithmetically to the bar, which needs no `<defs>`. |
| LSP (`packages/lsp/src/references/ast-utils.ts`, `providers/`) | **References.** `REFERENCE_PROP_KEYS += 'wave'`. Add `WaveDeclaration` to `NamedEntity`/`RoadmapEntryNamed`, `collectNamedEntities` and `declarationAt`. `nameRangeOf` uses `GrammarUtils.findNodeForProperty(entity.$cstNode, 'name')`, so `wave wave "W"` renames the name, not the keyword. **Completion.** `REF_KEY_TO_KINDS.wave = {'wave'}`, and `'wave'` is added to the `after`/`before`/`on` sets. **Symbols.** `SymbolKind.Struct`. **Hover.** On a wave: "wave k of n", the title, the description and the member count. On an item: its effective wave ("inherited from group …", or "background (no wave)"). |
| TextMate (`grammars/nowline.tmLanguage.json`) | A separate start-of-line pattern `^\s*(wave)(?![\w-])(?=\s)`, so `wave-1`, `item wave` and `after:wave` are not coloured as the keyword. Add `wave` to the property-key regex. Sync with `packages/vscode-extension/scripts/sync-grammar.mjs`. |
| Snippets (`packages/vscode-extension/snippets/nowline.json`) | `wave` → `wave ${1:id} "${2:Title}"`, and `item-wave`. |
| Man pages (`packages/cli/man/nowline.5`, `packages/cli/man/fr/nowline.5`) | `.Ss wave` in ROADMAP SECTION; `wave:` in ITEM PROPERTIES; VALIDATION gets a new Waves subsection plus the Includes (rule 12) and Defaults updates; EXAMPLES. `nowline://reference` regenerates from the man page. |
| Docs | The `README.md` Entities table; `packages/core/README.md` (`resolved.content.waves`); `CHANGELOG.md` `[Unreleased]`, under both `### Added` and `### Changed`. |

## 11. Worked examples

**Conventions**

- **Defaults.** `calendar:business`, `scale:1w`, `start:2026-01-05`, and whole-week `duration:` literals.
- **Times.** Times are week offsets from the start: `W3` means three columns in, and `end` is exclusive.
- **Date examples** use `calendar:full`, so 1w = 7 days and dates land on whole weeks:

  | Week | Date | Week | Date |
  |---|---|---|---|
  | W2 | 2026-01-19 | W7 | 02-23 |
  | W3 | 01-26 | W8 | 03-02 |
  | W4 | 02-02 | W10 | 03-16 |
  | W5 | 02-09 | W11 | 03-23 |
  | W6 | 02-16 | | |

- **Sketches** use one character per week: `|` is a wave boundary, `.` is idle time, letters are work and `/` is background work.
- **Engine agreement.** Every valid example avoids the engine A/C divergences (§8.6), so both engines produce the same tables.
- **Diagnostics** are listed only where an example has some.

The PM-facing sample in [`samples/checkout-relaunch.nowline`](./samples/checkout-relaunch.nowline) combines Examples 1, 3, 5 and 8 into one roadmap. [`README.md`](./README.md) shows its schedule and mockup.

### Example 1: three lanes, three waves

Shows the basic barrier: every lane idles until the slowest lane of the previous wave finishes.

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| web-research | discover | W0–W2 | lane start |
| api-spike | discover | W0–W1 | lane start |
| data-audit | discover | W0–W3 | lane start |
| web-build | build | W3–W6 | barrier W3 (lane W2) |
| api-build | build | W3–W7 | barrier W3 (lane W1) |
| data-build | build | W3–W5 | lane = barrier W3 |
| web-launch | launch | W7–W8 | barrier W7 (lane W6) |
| api-launch | launch | W7–W8 | lane = barrier W7 |
| data-launch | launch | W7–W9 | barrier W7 (lane W5) |

Waves:

- discover [W0, W3], held by data-audit;
- build [W3, W7], held by api-build;
- launch [W7, W9], held by data-launch.

Without waves, the roadmap would end at W7. Engine A converges in 4 passes (n + 1).

```
wk    012|3456|78
web   ##.|###.|#.
api   #..|####|#.
data  ###|##..|##
```

### Example 2: a lane with no work in the middle wave

Shows that skipping a wave is valid (the order still never goes backwards), and that the skipping lane still waits for the barrier.

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| auth | w1 | W0–W2 | lane start |
| offline | w1 | W0–W3 | lane start |
| sso | w2 | W3–W5 | barrier W3 (lane W2) |
| audit | w3 | W5–W6 | lane = barrier W5 |
| push | w3 | W5–W7 | barrier W5 (lane W3) |

Waves:

- w1 [W0, W3], held by offline;
- w2 [W3, W5], held by sso;
- w3 [W5, W7], held by push.

Mobile idles through w2.

```
wk        012|34|56
platform  ##.|##|#.
mobile    ###|..|##
```

### Example 3: background work

Shows two things:

- Items with no wave cross barriers without being floored, and their own end never extends a wave.
- Background work still delays the next item in its own lane.

There is no diagnostic: the picture marks background work (§9.3).

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| schema | w1 | W0–W2 | lane start |
| docs | background | W2–W4 | lane W2 (not floored; crosses the W3 boundary) |
| migrate | w2 | W4–W6 | lane W4 beats barrier W3 |
| oncall | background | W0–W6 | lane start |
| infra-prep | w1 | W0–W3 | lane start |
| cutover | w2 | W3–W4 | lane = barrier W3 |

Waves: w1 [W0, W3], w2 [W3, W6].

- **Indirect delay.** Neither `docs` nor `oncall` extends a wave by its own end. But `docs` delays `migrate`, which is what makes w2 end at W6; without `docs`, w2 would be [W3, W5].
- **Picture.** `docs` and `oncall` are hatched, and the W3 boundary is drawn as a dashed crossing over both bars. `oncall`'s visual right edge sits 6 px inside W6, so it does not cross the closing line.
- **For contrast.** With `oncall wave:w1`, w1 ends at W6. Then migrate runs W6–W8, cutover runs W6–W7, and w2 becomes [W6, W8].

```
wk     012|345
core   ##/|/##
ops    ///|///
infra  ###|#..
```

### Example 4: parallel tracks in different waves

Shows that a track's own wave holds it back while the other track starts at the block's start, and that the join is unchanged. The track that binds the join is an item track, which avoids divergence (d).

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| kickoff-work | w1 | W0–W1 | lane start |
| api-v2 | w1 (inherited from api-track) | W1–W3 | parallel start W1 |
| api-docs | w1 (inherited) | W3–W4 | group sequence |
| sdk-update | w2 | W5–W7 | barrier W5 (parallel start W1) |
| integration | w2 | W7–W8 | join W7 |
| mobile-spike | w1 | W0–W5 | lane start |

- **The block.** `streams` spans W1–W7. Its lead wave is `min(w1, w2) = w1`, so the lead floor does not move it.
- **Waves.** w1 [W0, W5], held by mobile-spike; w2 [W5, W8].
- **Order check.** It passes: the block reaches w2 at most, and it is followed by a w2 item.
- **Bracket.** `api-track` is untitled and unstyled, so it draws no bracket (§9.7).

```
wk          01234|567
platform    #....|..#
 api-track  .aaa.|...
 sdk-update .....|ss.
mobile      #####|...
```

### Example 5: a group that spans waves, and inheritance from a group

Shows two things:

- A titled group with no `wave:` straddles a boundary, with idle time inside its box.
- An anonymous `group wave:w2` assigns its two items and draws nothing (§9.7).

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| flows | w1 | W0–W2 | group start |
| ui | w2 | W4–W7 | barrier W4 (group sequence W2) |
| polish | w2 | W7–W8 | lane W7 (after the group) |
| vendor-eval | w1 | W0–W4 | lane start |
| integrate | w2 (inherited) | W4–W6 | group start = barrier W4 |
| certify | w2 (inherited) | W6–W7 | group sequence |

- **The titled group.** The `checkout-v2` box spans W0–W7 and crosses the boundary, with W2–W4 idle inside it. Its lead wave is w1, so it opens at W0.
- **Waves.** w1 [W0, W4], held by vendor-eval; w2 [W4, W8], held by polish.

```
wk        0123|4567
checkout  ff..|uuup
payments  vvvv|iic.
```

### Example 6: a cross-lane `after:` inside one wave

Shows that a dependency inside one wave on an *earlier* lane is fine, and that it lengthens the wave for everyone.

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| schema | w1 | W0–W2 | lane start |
| mocks | w1 | W0–W1 | lane start |
| forms | w1 | W2–W3 | after:schema W2 (lane W1) |
| api | w2 | W3–W6 | barrier W3 (lane W2) |
| wire-up | w2 | W6–W8 | after:api W6 |

Waves: w1 [W0, W3], held by forms; w2 [W3, W8], held by wire-up.

- **The cost.** `api` waits one week for `forms`, even though it does not depend on it.
- **Without the dependency.** Without `forms after:schema`, w1 would be [W0, W2], api would run W2–W5, and wire-up would run W5–W7.

```
wk        012|34567
backend   ##.|###..
frontend  #.f|...ww
```

### Example 7: lane order matters for cross-lane `after:`

Shows the forward-reference warning. Layout places lanes in order, as it does today, so a reference to a later lane is ignored. In a roadmap with waves, that moves every lane's columns.

```nowline
nowline v1

roadmap lane-order "Lane order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane frontend
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| forms | w1 | W0–W1 | lane start (`after:schema` ignored) |
| schema | w1 | W0–W2 | lane start |
| wire-up | w2 | W2–W4 | barrier W2 (`after:api` ignored) |
| api | w2 | W2–W5 | lane = barrier W2 |

Waves: w1 [W0, W2], w2 [W2, W5].

Diagnostics:

- Line 9 (warning): `NL.W1101 after:schema on "forms" refers to "schema", which is in a later swimlane ("backend"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this after:. Move swimlane "backend" above swimlane "frontend", or remove the after:.`
- Line 10 (warning): the same, for `after:api` on "wire-up".

**Fix.** Move `backend` above `frontend`. This gives the schedule of Example 6: forms W2–W3, w1 [W0, W3], api W3–W6, wire-up W6–W8, w2 [W3, W8].

```
wk        01|234
frontend  f.|ww.
backend   ##|aaa
```

### Example 8: `after:<wave>` on background work and milestones

Shows the main use of wave references: background work and milestones that wait for a whole batch.

```nowline
nowline v1

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
```

| Entity | Wave | Start–end or position | Binding constraint |
|---|---|---|---|
| core | alpha | W0–W3 | lane start |
| pricing | alpha | W0–W2 | lane start |
| hardening | beta | W3–W5 | lane = barrier W3 |
| press-kit | background | W3–W5 | after:alpha = E_alpha W3 (lane W2) |
| launch-event | background | W5–W6 | after:beta = E_beta W5 |
| alpha-done | — | W3, on the boundary | end of alpha |
| ga | — | 6 px left of W6 | launch-event (beta ends W5) |

Waves: alpha [W0, W3], beta [W3, W5]. The canvas runs to W6.

- **`alpha-done`** is bound by a wave reference, so its diamond sits exactly on the W3 boundary. It draws no cut line of its own; the boundary line carries the vertical (§9.2).
- **`ga`** is bound by `launch-event`, so it sits at that item's visual right edge and keeps its cut line.
- **`press-kit` and `launch-event`** are background work that starts exactly at the boundaries it waits for. They are hatched, but neither crosses a boundary line, so neither gets a crossing mark.
- **Invalid variant.** `press-kit wave:alpha after:alpha` would be NL.E1103 (`after-wave`).

```
wk    012|34|5
eng   ###|hh|.
gtm   pp.|//|/
```

### Example 9: an anchor and an inline date pin against a barrier

Shows that dates and barriers combine by max, silently: the later one wins. Uses `calendar:full`.

```nowline
nowline v1

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
```

Offsets: `budget` (2026-02-09) is W5, and the inline date 2026-01-19 is W2.

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| i1 | w1 | W0–W4 | lane start |
| a1 | w1 | W0–W1 | lane start |
| i2 | w2 | W5–W7 | anchor W5 beats barrier W4 |
| a2 | w2 | W4–W6 | barrier W4 beats inline date W2 and lane W1 |

Waves:

- w1 [W0, W4] (2026-01-05 – 2026-02-02);
- w2 [W4, W7] (2026-02-02 – 2026-02-23, exclusive), held by i2. The strip tooltip reads `Launch · 2026-02-02 – 2026-02-23 · held by i2`.

**Pin variant.** With `item a2 duration:2w wave:w2 date:2026-01-19` (the undocumented fixed-start pin), a2 still runs W4–W6, and layout emits `NL.W1001 Item "a2" is pinned to 2026-01-19 (date:), but wave "w2" cannot start until 2026-02-02; the item starts at the wave start.`

```
wk     0123|456
infra  ####|.ii
apps   #...|aa.
```

### Example 10: a `before:` deadline pushed past by a barrier

Shows that `before:` stays soft: the cost of the barrier is painted, never rejected. Uses `calendar:full`; the freeze date 2026-02-16 is W6.

```nowline
nowline v1

roadmap deadline "Deadline vs barrier" start:2026-01-05 scale:1w calendar:full

anchor freeze "Code freeze" date:2026-02-16

wave w1 "Build"
wave w2 "Harden"

swimlane web
  item web-a duration:2w wave:w1
  item web-b duration:2w wave:w2 before:freeze
swimlane api
  item api-a duration:5w wave:w1
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| web-a | w1 | W0–W2 | lane start |
| api-a | w1 | W0–W5 | lane start |
| web-b | w2 | W5–W7; overflow W6–W7 painted red | barrier W5 (lane W2) |

Waves: w1 [W0, W5], held by api-a; w2 [W5, W7].

Diagnostic (layout, existing): `NL.I1003 Item "web-b" extends past its "before:" anchor "freeze".`

- **No validation diagnostic.** There is no NL.W1100, because the miss depends on durations and dates, not on structure.
- **Without waves,** web-b would run W2–W4 and meet the freeze.

```
wk    01234|56
web   ##...|bB
api   #####|..
```

### Example 11: a wave start floor (gap) and a wave deadline

Shows two things, using `calendar:full`:

- a wave held back until a budget date, which creates a labelled gap;
- the deadline idiom: a dated milestone `after:<wave>` that turns red when the wave runs late.

```nowline
nowline v1

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
```

Offsets: `fy-budget` (2026-02-02) is W4, and `exec-done` (2026-03-16) is W10.

| Entity | Wave | Start–end or position | Binding constraint |
|---|---|---|---|
| a1 | plan | W0–W2 | lane start |
| b1 | plan | W0–W3 | lane start |
| a2 | execute | W4–W9 | S_execute = max(E_plan W3, fy-budget W4) |
| b2 | execute | W4–W11 | same |
| exec-done | — | W10 (dated) | red cut line: execute ends W11 |

Waves: plan [W0, W3]; **gap [W3, W4]**; execute [W4, W11], ending 2026-03-23 (exclusive).

- **The gap.** It has no strip cell, shows `fy-budget` in muted italics, and has two boundary lines. The anchor's own dotted cut line also lands at W4.
- **Without the floor,** execute would be [W3, W10] and the milestone would be met.
- **No cycle.** `checkCircularDependencies` skips a wave's own `after:` edges (§6.2), so the floor and the milestone do not form one.

Diagnostic (layout insight): `NL.I1007 Milestone "exec-done" (2026-03-16) is overrun: wave "execute" ends 2026-03-23.`

```
wk   012|3|4567890      (columns W0–W10; the last 0 is W10)
a    ##.|.|#####..
b    ###|.|#######
```

### Example 12: an empty wave

Shows a placeholder wave: zero width, drawn as a marker, listed in the legend, and no delay to later waves.

```nowline
nowline v1

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
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| a1 | w1 | W0–W2 | lane start |
| b1 | w1 | W0–W1 | lane start |
| a3 | w3 | W2–W3 | lane = barrier W2 |
| b3 | w3 | W2–W4 | barrier W2 (lane W1) |

Waves: w1 [W0, W2]; w2 [W2, W2], empty; w3 [W2, W4].

- **The W2 boundary** is drawn once, and the hollow w2 diamond sits on it in the strip.
- **Strip alternation** follows the visible ordinal, so w1 uses `stripFill` and w3 uses `stripFillAlt`.
- **Legend.** It reads `Wave boundary` · `Waves: #1 Wave 1 · #2 Hardening (TBD) (no items) · #3 Wave 3`.

Diagnostic (layout insight): `NL.I1006 Wave "w2" has no items, so it spans no time; it is drawn as a marker in the wave strip and listed in the wave legend.`

```
wk  01|23
a   ##|#.
b   #.|##
```

### Example 13 (invalid): out-of-order waves in a lane

```nowline
nowline v1

roadmap order "Order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w2
  item a2 duration:1w wave:w1
  item a3 duration:1w wave:w1
```

Line 10: `NL.E1103 Items "a2", "a3" (wave "w1") come after "a1" (wave "w2") in swimlane "a". Work in a lane or group runs in order, so it must also be ordered by wave: move "a1" below "a3", or change their waves.`

`a3`'s only bound comes from the violating `a2`, so it is folded into a1's run rather than reported separately. Each of the following fixes leaves zero diagnostics, and both give the schedule a2 W0–W1, a3 W1–W2, a1 W2–W4:

- move `a1` below `a3`, as the message says;
- put `a1` in a parallel track beside a group that holds `a2` and `a3`:

```nowline
swimlane a
  parallel
    item a1 duration:2w wave:w2
    group
      item a2 duration:1w wave:w1
      item a3 duration:1w wave:w1
```

Wrapping only `a1` and `a2` in a `parallel` and leaving `a3` after the block is *not* a fix. `a3` (w1) would then follow a block that contains a w2 track, which is NL.E1103 variant `join`.

### Example 14 (invalid): `after:` a later wave, `after:` its own wave, and an unmeetable `before:`

```nowline
nowline v1

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
```

- **Line 12:** `NL.E1103 Item "b" (wave "w1") has after:a, but "a" is in later wave "w2". Wave "w2" cannot start until wave "w1" ends, so "b" could never start: move it to wave "w2" or later, or remove the after:.`
- **Line 13:** `NL.E1103 Item "c" (wave "w1") has after:w1, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "c" to a later wave.`
- **Line 16 (warning):** `NL.W1100 before:b on "d" can never be met: "d" is in wave "w2", which cannot start until "b" (wave "w1") has finished. The overrun will be painted.`

All three references point to earlier lanes, so none of them triggers NL.W1101.

### Example 15 (invalid): a hidden chain through background work

```nowline
nowline v1

roadmap hidden "Hidden chain" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
swimlane b
  item review "Vendor review" duration:1w after:a2
  item b1 duration:1w wave:w1
```

Line 13: `NL.E1103 Item "b1" (wave "w1") could never start: through a2 (wave "w2") → review → b1, it waits for work that cannot start until wave "w1" has ended. Move "b1" to a later wave, or break the chain.`

- **Why the existing check is silent.** `checkCircularDependencies` reports nothing, because there is no explicit `after:` cycle.
- **Fix.** Move `review` below `b1`, where it runs W4–W5 as background work, or drop `after:a2`.

### Example 16 (includes, valid): re-declared waves with a shared floor

Shows the multi-team pattern:

- every file declares the same waves, floor included;
- every team file renders on its own;
- rule 12 compares resolved floor dates;
- an inline-date floor avoids anchor shadow warnings in merge mode.

**`teams/web.nowline`**:

```nowline
nowline v1

roadmap web-plan "Web" start:2026-01-05 scale:1w calendar:full

wave plan "Plan"
wave execute "Execute" after:2026-02-02

swimlane web "Web"
  item web-design duration:2w wave:plan
  item web-build duration:3w wave:execute
```

**`teams/api.nowline`** follows the same pattern, with `swimlane api "API"`, `item api-design duration:3w wave:plan` and `item api-build duration:4w wave:execute`.

**`program.nowline`**:

```nowline
nowline v1

include "./teams/web.nowline"
include "./teams/api.nowline"

roadmap program "Program" start:2026-01-05 scale:1w calendar:full

wave plan "Plan"
wave execute "Execute" after:2026-02-02

swimlane pmo "PMO"
  item kickoff duration:1w wave:plan
  item comms "Launch comms" duration:2w after:execute

milestone done "Execute complete" after:execute
```

The merged lane order is pmo, web, api. The inline date 2026-02-02 is W4.

| Entity | Wave | Start–end or position | Binding constraint |
|---|---|---|---|
| kickoff | plan | W0–W1 | lane start |
| web-design | plan | W0–W2 | lane start |
| api-design | plan | W0–W3 | lane start |
| web-build | execute | W4–W7 | S_execute = max(E_plan W3, floor W4) |
| api-build | execute | W4–W8 | same |
| comms | background | W8–W10 | after:execute = E_execute W8 |
| done | — | W8, on the boundary | end of execute |

Waves: plan [W0, W3], held by api-design; gap [W3, W4]; execute [W4, W8], held by api-build.

- **Passes.** Engine A converges in 2 passes. `comms` reads the seed `E_execute = W4` in pass 1 and W8 in pass 2, which confirms the result.
- **Agreement.** σ is `[(plan, no floor), (execute, 2026-02-02)]` in all three files, so rule 12 passes. Children's waves are never merged, so there are no shadow warnings. Rule 11's `start:` check also passes.
- **Standalone render** of `teams/web.nowline`: plan [W0, W2], gap [W2, W4], execute [W4, W7].

```
wk     012|3|4567|89
pmo    #..|.|....|//
web    ##.|.|###.|..
api    ###|.|####|..
```

### Example 17 (includes, invalid): mismatched waves, floor mismatch, title drift

**`program.nowline`**:

```nowline
nowline v1

include "./teams/legacy.nowline"
include "./teams/web.nowline"
include "./teams/ops.nowline" roadmap:isolate
include "./teams/infra.nowline"

roadmap program "Program" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
wave launch "Launch" after:2026-03-02

swimlane design
  item d1 "Research" duration:2w wave:discover
```

The children all use `start:2026-01-05`:

| File | Roadmap | Waves | Swimlane and item |
|---|---|---|---|
| `teams/legacy.nowline` | `roadmap legacy …` | `wave discover "Discover"`, `wave build "Build"` | `swimlane legacy`, `item l1 duration:2w wave:discover` |
| `teams/web.nowline` | `roadmap web …` | `wave discover "Discovery"`, `wave build "Build"`, `wave launch "Launch" after:2026-03-02` | `swimlane web`, `item w1 duration:1w wave:discover` |
| `teams/ops.nowline` | `roadmap ops …` | none | `swimlane ops`, `item o1 duration:2w` |
| `teams/infra.nowline` | `roadmap infra …` | the program's three waves, but with `wave launch "Launch" after:2026-03-09` | `swimlane infra`, `item i1 duration:1w wave:build` |

Diagnostics:

- `program.nowline:3` `NL.E0202 Included "./teams/legacy.nowline" declares waves [discover, build], but this file's waves are [discover, build, launch]. Every included roadmap must declare the same waves in the same order: copy this file's wave lines into "./teams/legacy.nowline".`
- `program.nowline:4` (warning) `NL.W0701 Wave "discover" in "./teams/web.nowline" differs from this file's definition (title "Discovery" there, "Discover" here); this file's definition is used.`
- `program.nowline:5` `NL.E0202 Included "./teams/ops.nowline" declares no waves, but this file's waves are [discover, build, launch]. Copy this file's wave lines into "./teams/ops.nowline" so its work joins the waves.`
- `program.nowline:6` `NL.E0202 Wave "launch" in "./teams/infra.nowline" opens no earlier than 2026-03-09, but this file's wave "launch" opens no earlier than 2026-03-02. A wave must have the same start floor in every included roadmap.`

Variations:

- **Order matters.** A child with `[discover, launch, build]` gets the same `mismatch` variant.
- **Include order doesn't.** Moving the `legacy` include below the others changes nothing, because the check runs after the include loop.

### Example 18 (includes, valid): a vocabulary-only child

**`people.nowline`**: no roadmap, no swimlanes and no waves, so it does not participate.

```nowline
nowline v1

person sam "Sam Chen"
team platform-team "Platform"
  person sam
label risky "Risky"
```

**`plan.nowline`**:

```nowline
nowline v1

include "./people.nowline"

roadmap plan "Plan" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane platform owner:platform-team
  item auth duration:2w wave:w1 owner:sam
  item sso duration:1w wave:w2 labels:risky
```

| Item | Wave | Start–end | Binding constraint |
|---|---|---|---|
| auth | w1 | W0–W2 | lane start |
| sso | w2 | W2–W3 | lane = barrier W2 |

Waves: w1 [W0, W2], w2 [W2, W3]. There are no diagnostics.

### Example 19 (includes, valid): an isolated region taking part in the barrier

Shows that region ids stay isolated while the barrier stays global. Each file declares the same waves.

**`ios.nowline`**:

```nowline
nowline v1

roadmap ios "iOS" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane ios
  item ios-offline duration:4w wave:w1
  item ios-push duration:1w wave:w2
```

**`portfolio.nowline`**:

```nowline
nowline v1

include "./ios.nowline" roadmap:isolate

roadmap portfolio "Portfolio" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane platform
  item pf-api duration:2w wave:w1
  item pf-scale duration:2w wave:w2
```

| Item | Scope | Wave | Start–end | Binding constraint |
|---|---|---|---|---|
| pf-api | main | w1 | W0–W2 | lane start |
| ios-offline | region | w1 | W0–W4 | lane start |
| pf-scale | main | w2 | W4–W6 | barrier W4, held by the region's ios-offline (lane W2) |
| ios-push | region | w2 | W4–W5 | lane = barrier W4 |

Waves: w1 [W0, W4], w2 [W4, W6].

- **Isolation.** `pf-scale` cannot write `after:ios-offline`, but the barrier still holds it.
- **Rendering.** Boundaries are re-emitted inside the dashed region, clipped to its painted rect.
- **Engines.** Engine A converges in 3 passes, and engines A, B and C agree that the domain ends at W6.
- **Standalone.** `ios.nowline` rendered on its own gives w1 [W0, W4] and w2 [W4, W5].

```
wk          0123|45
platform    ##..|ss
[ios] ios   ####|p.
```

### Example 20 (invalid): declaration and assignment errors

```nowline
nowline v1

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
```

| Line | Diagnostic |
|---|---|
| 7 | `NL.E1100 Wave "Wave 2" needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".` |
| 8 | `NL.E1105 "before:" is not allowed on wave "w2". A wave's end comes from its items; to give a wave a deadline, add a dated milestone: milestone w2-due date:<YYYY-MM-DD> after:w2.` |
| 9 | `NL.E1106 Wave "w3" has after:a1, but "a1" is an item. A wave's after: accepts only anchors, dated milestones, or one ISO date; to make a wave wait for work, put that work in an earlier wave.` |
| 11 | `NL.E1104 "wave:" is not allowed on swimlane "a": a swimlane spans every wave. Put wave: on its items, or wrap them in "group wave:w1".` |
| 14 | `NL.E1102 Item "a2" has wave:w2, but its enclosing group "g" has wave:w1. A container's wave applies to everything inside it; remove one of the two wave: properties.` |
| 15 | `NL.E1101 Wave "w9" is not declared. Declared waves: w1, w2, w3, w4. Add "wave w9" above the first swimlane that uses it.` |
| 16 | `NL.E1101 "wave:" takes exactly one wave id; an item belongs to at most one wave. Got "[w1, w2]".` |
| 17 | `NL.E1101 Wave "w4" is used before its declaration on line 19. Declare waves above the swimlanes that use them.` |
| 21 | `NL.E1104 "wave:" is not allowed on milestone "m". To place a milestone at the end of a wave, use after:w1.` |

Notes:

- **No suggestion on line 15.** `w9` has four candidates at distance 1, so no single match is unique.
- **No duplicates:**
  - no NL.W0700 duplicates the wave-specific errors;
  - no NL.E0411 fires on line 8;
  - no "does not resolve" error fires on line 9;
  - no NL.E0301 fires on line 7.
- **Cascades.** Items whose `wave:` values are invalid (a3, a4, a5) are treated as background. `a1` is background too, because swimlanes never contribute a wave. Neither produces a diagnostic.
- **No NL.E1103.** No assigned flow goes backwards, because a2 uses its container's w1.

### Example 21 (compatibility): a v1 file with a stray `wave:` key

```nowline
nowline v1

config

default item wave:alpha

roadmap legacy "Legacy" start:2026-01-05 scale:1w

swimlane a wave:alpha
  item a1 duration:1w wave:alpha
```

- **Today.** Lines 9 and 10 each get `NL.W0700 Unknown property "wave" … The renderer ignores it.`, and line 5 is silent.
- **After this change.** Lines 5, 9 and 10 each get the warning `NL.W0702 "wave:" on … is ignored: this roadmap declares no waves. Declare waves with "wave <id>" to use it, or remove the property.`, with the targets `"default item"`, `swimlane "a"` and `item "a1"`.
- **Unchanged.** The file still validates without errors and renders byte-identically.

## 12. Non-goals and future work

**Non-goals**

- **Overlapping or soft waves** (`overlap:`, `lag:`) and wave graphs. Waves are strictly sequential (§3.1).
- **Wave approval**, sign-off, go/no-go, or wave status. Approval workflows are excluded by `principles.md`.
- **Resource leveling** or per-wave capacity.
- **Critical-path reporting.**
- **Fixed-length waves.** Cadences belong to `scale` custom units.

**Why waves are not Gantt-chart scheduling** (`principles.md`, "Not a project management tool"):

- Nowline already places items deterministically from what the author wrote: document order, `after:` and dates. Waves add exactly one more written constraint, the barrier.
- Nothing is optimized, leveled, reordered or given float.
- The pass loop is an implementation detail of evaluating that one constraint across lanes.
- `heldBy` names the binding member of each barrier. A floating milestone already shows the same fact through its binding edge. It appears only in a tooltip and an XLSX column.

**Future work**

| Item | Recommendation |
|---|---|
| A shared `waves.nowline` that provides waves to the files that include it | Defer. It needs deferred validation: the validator would have to see waves that only arrive with includes. It also needs an LSP that resolves includes. Re-declaring is explicit and already the convention for sizes and labels. |
| Bake or cool-down time between waves (`gap:`) | Defer. A wave `after:` date or an explicit buffer item covers it today. |
| Barrier slack visuals (per-lane idle segments), and "current wave" emphasis at the now-line | Defer. Both are optional additions that don't change the model. |
| `default wave` and a wave `owner:` | Defer. |
| Fix engine A divergences (a)–(f) | Separate PR, with a deliberate snapshot bump. |
| MS Project implicit lane-sequence links, for all roadmaps | Separate PR, with a deliberate msproj hash bump. |
| Honour forward `after:` references | Rejected for now. In a roadmap with waves this would change behaviour as soon as the first wave line is added. NL.W1101 makes the problem visible instead. |

## 13. Open questions

Each question comes with a recommendation.

1. **Wave start floors in v1** (`wave … after:<anchor | dated milestone | date>`). *Recommendation:* ship them. They combine with includes through re-declaration, and rule 12 compares resolved dates.
2. **Strictness of include agreement.** *Recommendation:* ids, order and resolved floor dates must match, as an error. Title and presentation drift is a warning, and the parent wins.
3. **Default look.** *Recommendation:* no column tint by default. The strip and the 2 px boundary lines carry the columns, and `style:` with `bg` opts a wave into a tint. The alternative, alternating tints with lane alternation dropped, is a larger visual change.
4. **Export fidelity.** MS Project and Mermaid are AST-only today, and see neither included files nor implicit lane sequencing. *Recommendation:* accept this for the first release, and fix it separately for all roadmaps.

Decided in the planning session (no longer open):

- items without a wave produce no diagnostic, and there is no `wave:none` value;
- background work is marked by hatching and crossing marks (§9.3);
- waves are strictly sequential (§3.1).

What the mockup tests should confirm is listed in [`README.md`](./README.md).
