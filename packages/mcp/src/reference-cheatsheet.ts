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

\`duration:\`, \`size:\`, \`effort:\`, \`remaining:\`, \`status:\`, \`color:\`, \`after:\`, \`before:\`.

## Config / includes (before roadmap)

\`config\` blocks, \`include "path.nowline"\` — see full reference for ordering rules.

Call \`reference\` with \`format: "full"\` for the complete man page, or \`examples\` for sample files.
`;
