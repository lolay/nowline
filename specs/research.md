# Nowline — Research (OSS tooling)

This file captures the technical positioning of the OSS tooling — why Nowline exists alongside existing diagram-as-code languages, and why certain classes of features are excluded from the DSL on principle.

Audience, team-structure analysis, and direct comparisons to SaaS PM tools live in the commercial research doc and are out of scope here.

## Why Not Just Mermaid?

Mermaid is the closest existing tool and the most likely "good enough" alternative. Here's why Nowline exists anyway:

| Aspect | Mermaid `gantt` | Nowline |
|--------|-----------------|---------|
| Time model | Absolute dates required | Configurable scale with custom units and sizes (dates optional via anchors) |
| Swimlanes | `section` (label only) | `swimlane` with semantic meaning (team/stream), nesting |
| Dependencies | `after taskId` (basic) | `after:id`, `before:id` with validation, cycle detection, arrow rendering |
| Status | Not supported | `status:done`, `status:at-risk`, etc. — grammar-level, extensible via config |
| Labels/styles | Not supported | `labels:` for tagging, `style:` for visual customization — config-driven |
| Owners | Not supported | `owner:sam` — person/team declarations, rendered on cards |
| Parallel work | Not supported | `parallel`/`group` blocks for concurrent execution and sequential bundling |
| Links | Not supported | `link:` property — URL with service icon detection |
| Milestones | Basic `milestone` marker | Full milestone with `depends:[]` for completion tracking, overflow rendering |
| Embeddable | Yes (widely) | Yes (same model — `<script>` tag) |
| Extensibility | General-purpose | Roadmap-native — every feature serves the roadmap use case |

The Mermaid bridge output (m2c) is the Trojan horse: users start by exporting to Mermaid for compatibility, then upgrade to native Nowline rendering when they need the richer features.

## Diagram-as-Code Comparison

| Tool | Approach | Strengths | Weaknesses vs. Nowline |
|------|----------|-----------|------------------------|
| **Mermaid** | General-purpose diagram DSL | Massive adoption, GitHub-native rendering, huge ecosystem | `gantt` block is thin — no duration-scaled swimlanes, no labels/styles, no owners, no parallel/group. General-purpose grammar, not roadmap-native. |
| **D2** | Modern diagram DSL (Terrastruct) | Clean syntax, good rendering | General-purpose, not roadmap-native. No time model or team semantics. |
| **PlantUML** | Diagram DSL (Java-based) | Long history, many diagram types | Java dependency, dated rendering, not roadmap-native |

**Nowline's differentiator against diagram-as-code tools:** Purpose-built for roadmaps. The grammar knows what a swimlane, milestone, dependency, and duration *is*. This enables richer rendering, better validation, and a more natural authoring experience for roadmap-specific use cases.

## Exclusion Rationale

The DSL is deliberately constrained. These exclusions are not TODOs — they are design decisions about what a text-first roadmap language should not try to be.

### Resource Contention / Capacity Planning

**Why excluded:** This is project management territory. Nowline shows *what* is planned and *when*, not *who has capacity*. Adding resource management would pull Nowline into the PM tool category it explicitly avoids.

### Critical Path Analysis

**Why excluded:** Critical path requires date-precise scheduling with resource constraints. Nowline uses configurable scales and durations — the temporal model is flexible but not a scheduler. Critical path belongs in execution tools (Jira, Linear, MS Project).

### Approval Workflows

**Why excluded:** Approval gates add process weight. Nowline is a communication tool, not a governance tool. Teams that need approval workflows should use their existing PM/governance tools and link to them from the roadmap.

### Webhooks

**Why excluded:** Low demand relative to effort. Downstream consumers can watch `.nowline` files with normal git tooling; a webhook surface would add infrastructure without proportional value to the OSS core.
