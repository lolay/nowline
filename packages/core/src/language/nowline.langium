grammar Nowline

entry NowlineFile:
    (directive=NowlineDirective)?
    (includes+=IncludeDeclaration)*
    (hasConfig?='config'
        configEntries+=ConfigEntry*)?
    (roadmapDecl=RoadmapDeclaration)?
    (roadmapEntries+=RoadmapEntry)*;

NowlineDirective:
    'nowline' version=ID
    (properties+=BlockProperty)*;

IncludeDeclaration:
    'include' path=STRING
    (options+=IncludeOption)*;

IncludeOption:
    key=INCLUDE_OPTION_KEY value=ID;

// --- Config Entries ---

ConfigEntry:
    ScaleBlock | CalendarBlock | StyleDeclaration | SymbolDeclaration | DefaultDeclaration;

ScaleBlock:
    'scale'
    (INDENT properties+=BlockProperty+ DEDENT)?;

CalendarBlock:
    'calendar'
    (INDENT properties+=BlockProperty+ DEDENT)?;

BlockPropertyValue returns string:
    ID | INTEGER | STRING | DURATION_LITERAL;

StyleDeclaration:
    'style' (name=ID)? (title=STRING)?
    (INDENT properties+=StyleProperty+ DEDENT)?;

SymbolDeclaration:
    'symbol' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

// 'person' appears here as an explicit alternative because it is also a declaration
// keyword (PersonDeclaration / PersonMemberRef), and Langium's lexer tokenizes it as
// the keyword in preference to ID. Without the alternation, `capacity-icon:person`
// (a built-in capacity-icon name) would fail to parse. Other built-in icon names
// (`none`, `multiplier`, `people`, `points`, `time`, `shield`, `warning`, `lock`)
// are not grammar keywords and therefore lex as ID without help.
StylePropertyValue returns string:
    ID | COLOR_HEX | STRING | 'person';

DefaultDeclaration:
    'default' entityType=DefaultEntityType
    (properties+=EntityProperty)*;

DefaultEntityType returns string:
    'item' | 'label' | 'swimlane' | 'roadmap' | 'milestone' |
    'footnote' | 'anchor' | 'parallel' | 'group';

// --- Roadmap ---

RoadmapDeclaration:
    'roadmap' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*;

RoadmapEntry:
    PersonDeclaration | TeamDeclaration | AnchorDeclaration |
    LabelDeclaration | SizeDeclaration | StatusDeclaration |
    SwimlaneDeclaration | MilestoneDeclaration | FootnoteDeclaration;

PersonDeclaration:
    'person' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

TeamDeclaration:
    'team' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT content+=TeamContent+ DEDENT)?;

TeamContent:
    DescriptionDirective | PersonMemberRef | TeamDeclaration;

PersonMemberRef:
    'person' ref=ID;

AnchorDeclaration:
    'anchor' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

LabelDeclaration:
    'label' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

SizeDeclaration:
    'size' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

StatusDeclaration:
    'status' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

SwimlaneDeclaration:
    'swimlane' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT content+=SwimlaneContent+ DEDENT)?;

SwimlaneContent:
    DescriptionDirective | ItemDeclaration | ParallelBlock | GroupBlock;

ItemDeclaration:
    'item' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

ParallelBlock:
    'parallel' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    INDENT content+=ParallelContent+ DEDENT;

ParallelContent:
    DescriptionDirective | ItemDeclaration | GroupBlock;

GroupBlock:
    'group' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    INDENT content+=GroupContent+ DEDENT;

GroupContent:
    DescriptionDirective | ItemDeclaration | ParallelBlock | GroupBlock;

MilestoneDeclaration:
    'milestone' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

FootnoteDeclaration:
    'footnote' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

DescriptionDirective:
    'description' text=STRING;

// --- Properties ---

// EntityProperty uses a single "key:" token so that keywords like `status`, `size`,
// `label`, `style`, etc. still parse unambiguously as property keys when followed by `:`.
// The validator strips the trailing `:` and validates the key text.
EntityProperty:
    key=PROPERTY_KEY_WITH_COLON (
        value=PropertyAtom |
        '[' values+=PropertyAtom (',' values+=PropertyAtom)* ']'
    );

BlockProperty:
    key=PROPERTY_KEY_WITH_COLON value=BlockPropertyValue;

StyleProperty:
    key=PROPERTY_KEY_WITH_COLON value=StylePropertyValue;

// 'person' appears here for the same reason as in StylePropertyValue — it is a
// declaration keyword that the lexer prefers over ID, but it must also be accepted
// as a property-atom value (e.g. `default swimlane capacity-icon:person`).
PropertyAtom returns string:
    ID | STRING | DURATION_LITERAL | PERCENTAGE | URL | DATE_LITERAL | COLOR_HEX | DECIMAL | INTEGER | 'person';

// --- Terminals ---
// INDENT/DEDENT must be declared before ID to avoid Chevrotain unreachable-token errors.
// Their patterns are placeholders — IndentationAwareTokenBuilder replaces the matchers at runtime.

terminal INDENT: /\x01/;
terminal DEDENT: /\x02/;

// INCLUDE_OPTION_KEY matches "config:" or "roadmap:" as a single token so the parser can
// distinguish include options from top-level config/roadmap section markers without lookahead.
terminal INCLUDE_OPTION_KEY: /(config|roadmap):/;

// URL must precede ID so that https://... isn't tokenized as "https" + ":" + error.
terminal URL: /https?:\/\/[^\s\[\],]+/;
terminal STRING: /"([^"\\]|\\.)*"/;
terminal DATE_LITERAL: /\d{4}-\d{2}-\d{2}/;
terminal DURATION_LITERAL: /\d+(\.\d+)?[dwmqy]/;
terminal PERCENTAGE: /\d+(\.\d+)?%/;
terminal COLOR_HEX: /#[0-9a-fA-F]{3,8}/;
// DECIMAL must precede INTEGER so that "0.5" lexes as one token (max-munch handles this,
// but ordering keeps the grammar's intent obvious to readers). Requires both a leading and
// trailing digit to avoid colliding with integer-then-property-value patterns.
terminal DECIMAL: /\d+\.\d+/;
terminal INTEGER: /\d+/;
// PROPERTY_KEY_WITH_COLON matches `name:` as a single token. Because it is longer than any
// bare keyword, the lexer prefers it over keywords when a colon immediately follows — letting
// us use `size:`, `status:`, `label:`, `style:` etc. as property keys without shadowing
// those words as declaration keywords. (`duration:` is also a property key — literal-only —
// even though no `duration` declaration keyword exists.)
terminal PROPERTY_KEY_WITH_COLON: /[a-zA-Z_][a-zA-Z0-9_-]*:/;
terminal ID: /[a-zA-Z_][a-zA-Z0-9_-]*/;

hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;
hidden terminal SL_COMMENT: /\/\/[^\r\n]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
// Joins a property line with the next physical line. The backslash, the newline,
// and the next line's leading whitespace are all swallowed, so the continuation
// line attaches to the previous logical token stream and IndentationAwareLexer
// does not emit INDENT/DEDENT for it. See specs/dsl.md "Line Continuation".
// Tolerates trailing whitespace between `\` and the newline so invisible spaces
// don't silently break a continuation.
hidden terminal LINE_CONTINUATION: /\\[ \t]*\r?\n[ \t]*/;
