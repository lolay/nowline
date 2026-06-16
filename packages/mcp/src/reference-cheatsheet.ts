// Condensed DSL reference for the MCP `reference` discovery tool (format: condensed).

export const REFERENCE_CHEATSHEET = `# Nowline DSL — condensed reference

Every file starts with \`nowline v1\` on line 1.

## Roadmap directive

\`\`\`
roadmap <id> "<title>" start:YYYY-MM-DD scale:2w
\`\`\`

Common keys: \`start:\`, \`scale:\`, \`length:\`, \`locale:\`, \`theme:\`, \`author:\`, \`calendar:\`.

## Swimlanes and items

\`\`\`
swimlane <id> "<title>"
  item <id> "<title>" duration:3w
\`\`\`

Entity types: \`swimlane\`, \`group\`, \`parallel\`, \`item\`, \`milestone\`, \`anchor\`.

Items need \`duration:\` or \`size:\`. Use 2-space indentation under parents.

## Item properties

\`duration:\` (or \`size:\`), \`status:\`, \`remaining:\`, \`owner:\`, \`after:\`, \`before:\`, \`labels:\`, \`link:\`, \`style:\`.

There is NO \`progress:\` or \`color:\` key. Show completion with \`status:\` + \`remaining:\`; set visuals with a \`style:\` reference (see full reference).

## Progress & status

\`\`\`
item api "API redesign" duration:4w status:in-progress remaining:40%
\`\`\`

\`status:\` values: \`planned\`, \`in-progress\` (alias \`active\`), \`done\` (alias \`completed\`), \`at-risk\`, \`blocked\`, or a custom \`status\` you declare earlier.

\`remaining:\` is the work *left*, written as a percent (\`40%\`) or an effort literal (\`1w\`). So an item that is 60% complete is \`remaining:40%\`. Omit \`remaining:\` for a fully open or fully done bar.

## Config / includes (before roadmap)

\`config\` blocks, \`include "path.nowline"\` — see full reference for ordering rules.

Call \`reference\` with \`format: "full"\` for the complete man page, or \`examples\` for sample files.
`;
