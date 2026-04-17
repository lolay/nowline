grammar Nowline

entry NowlineFile:
    (directive=NowlineDirective)?
    (includes+=IncludeDeclaration)*
    (hasConfig?='config'
        configEntries+=ConfigEntry*)?
    (roadmapDecl=RoadmapDeclaration)?
    (roadmapEntries+=RoadmapEntry)*;

NowlineDirective:
    'nowline' version=ID;

IncludeDeclaration:
    'include' path=STRING
    (options+=IncludeOption)*;

IncludeOption:
    key=INCLUDE_OPTION_KEY value=ID;

// --- Config Entries ---

ConfigEntry:
    ScaleDeclaration | UnitDeclaration | EstimatesDeclaration |
    StatusDeclaration | StyleDeclaration | LabelDeclaration |
    DefaultsDeclaration;

ScaleDeclaration:
    'scale' value=ID;

UnitDeclaration:
    'unit' name=ID '=' value=DURATION_LITERAL;

EstimatesDeclaration:
    'estimates' mappings+=EstimateMapping+;

EstimateMapping:
    name=ID '=' value=DURATION_LITERAL;

StatusDeclaration:
    'status' name=ID;

StyleDeclaration:
    'style' (name=ID)? (title=STRING)?
    (INDENT properties+=StyleProperty+ DEDENT)?;

StyleProperty:
    key=PropertyKey ':' value=StylePropertyValue;

StylePropertyValue returns string:
    ID | COLOR_HEX;

LabelDeclaration:
    'label' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*;

DefaultsDeclaration:
    'defaults'
    INDENT entries+=DefaultsEntry+ DEDENT;

DefaultsEntry:
    entityType=DefaultsEntityType
    (properties+=EntityProperty)*;

DefaultsEntityType returns string:
    'item' | 'label' | 'swimlane' | 'roadmap' | 'milestone' |
    'footnote' | 'anchor' | 'parallel' | 'group' | 'person' | 'team';

// --- Roadmap ---

RoadmapDeclaration:
    'roadmap' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*;

RoadmapEntry:
    PersonDeclaration | TeamDeclaration | AnchorDeclaration |
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
    'anchor' (name=ID)? (title=STRING)? date=DATE_LITERAL
    (properties+=EntityProperty)*;

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
    (properties+=EntityProperty)*;

FootnoteDeclaration:
    'footnote' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*
    (INDENT description=DescriptionDirective DEDENT)?;

DescriptionDirective:
    'description' text=STRING;

// --- Properties ---

EntityProperty:
    key=PropertyKey ':' (
        value=PropertyAtom |
        '[' values+=PropertyAtom (',' values+=PropertyAtom)* ']'
    );

PropertyKey returns string:
    PROPERTY_KEY | 'status' | 'style';

PropertyAtom returns string:
    ID | STRING | DURATION_LITERAL | PERCENTAGE | URL | DATE_LITERAL | COLOR_HEX;

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
terminal DURATION_LITERAL: /\d+[dwmy]/;
terminal PERCENTAGE: /\d+%/;
terminal COLOR_HEX: /#[0-9a-fA-F]{3,8}/;
// PROPERTY_KEY matches an identifier that is immediately followed by a colon (non-consuming).
// This lets us disambiguate `parallel after:foo` — `after:` is a property key, not a name.
// Declared before ID so the lexer prefers it when the lookahead matches.
terminal PROPERTY_KEY: /[a-zA-Z_][a-zA-Z0-9_-]*(?=:)/;
terminal ID: /[a-zA-Z_][a-zA-Z0-9_-]*/;

hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;
hidden terminal SL_COMMENT: /\/\/[^\r\n]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
