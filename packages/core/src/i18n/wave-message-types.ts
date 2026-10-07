// Argument shapes for the wave diagnostics (NL.E1100-E1106, NL.W1100,
// NL.W1101, NL.W1001, NL.W1002, NL.I1006, NL.I1007, NL.I1008, NL.W0702, NL.E0202,
// NL.W0701). Every message takes exactly one object so layout insights can
// call `tr(locale, code, args)` uniformly.
//
// Message variants are modelled as a discriminated union on a `reason`
// field. Entity kinds and flow descriptors are passed as structured values
// and rendered by each bundle, so a locale can translate the noun and fix
// the article itself instead of receiving a pre-rendered English fragment.

/** What a name or reference resolved to, for "is {kind}" style sentences. */
export type WaveKind =
    | 'item'
    | 'group'
    | 'parallel'
    | 'swimlane'
    | 'anchor'
    | 'milestone'
    | 'floating-milestone'
    | 'wave'
    | 'label'
    | 'size'
    | 'status'
    | 'person'
    | 'team'
    | 'footnote'
    | 'roadmap'
    | 'style'
    | 'symbol';

/**
 * The flow a node sits in. An unnamed parallel or group is identified by
 * position ("the parallel block on line N").
 */
export type FlowRef =
    | { kind: 'swimlane' | 'group' | 'parallel'; name: string }
    | { kind: 'parallel-block'; line: number }
    | { kind: 'group-block'; line: number };

/** An unnamed group or parallel block, identified by position. */
export type BlockRef = Extract<FlowRef, { line: number }>;

export type WaveSuggestion = { id: string; title?: string };

export type WaveContainerKind = 'group' | 'parallel';

export type E1100Args = { title?: string; line: number };

export type E1101Args =
    | { reason: 'list'; value: string }
    | {
          reason: 'unknown';
          value: string;
          declared: string[];
          suggestion?: WaveSuggestion;
      }
    | { reason: 'forward'; value: string; line: number }
    | { reason: 'not-a-wave'; value: string; kind: WaveKind; suggestion?: WaveSuggestion };

export type E1102Args = {
    entity: { kind: 'item' | 'group' | 'parallel'; name: string; line?: number };
    wave: string;
    container: { kind: WaveContainerKind; name: string; line?: number };
    containerWave: string;
};

export type E1103Args =
    | {
          reason: 'sequence';
          items: string[];
          itemWave: string;
          /** The predecessor's id or title; an unnamed group or parallel is named by position. */
          ref: string | BlockRef;
          refWave: string;
          flow: FlowRef;
          last: string;
      }
    | {
          reason: 'join';
          name: string;
          wave: string;
          block: FlowRef;
          flow: FlowRef;
          track: string;
          trackWave: string;
      }
    | {
          reason: 'after-item';
          name: string;
          wave: string;
          refId: string;
          ref: string;
          refWave: string;
          container?: { kind: WaveContainerKind; name: string; line?: number };
      }
    | {
          reason: 'after-wave';
          name: string;
          wave: string;
          refId: string;
          container?: { kind: WaveContainerKind; name: string; line?: number };
      }
    | { reason: 'chain'; name: string; wave: string; chain: string[] };

export type E1104Args =
    | { reason: 'swimlane'; name: string; value: string }
    | { reason: 'milestone'; name: string; value: string }
    | { reason: 'other'; type: WaveKind; name: string };

export type E1105Args =
    | { reason: 'before'; name: string }
    | { reason: 'other'; key: string; name: string };

export type E1106Args = { name: string; ref: string; kind: WaveKind };

/**
 * The entity a W1100 or W1101 is on. An unnamed group or parallel has an
 * empty `name` and is identified by position (`kind` and `line`).
 */
export type WaveOwnerPosition = { kind?: WaveContainerKind; line?: number };

export type W1100Args = (
    | { reason: 'item'; ref: string; name: string; wave: string; refWave: string }
    | { reason: 'wave'; ref: string; name: string; wave: string }
) &
    WaveOwnerPosition;

export type W1101Args = (
    | {
          reason: 'forward-lane';
          key: 'after' | 'before';
          ref: string;
          name: string;
          lane: string;
          ownLane: string;
      }
    | {
          reason: 'forward-flow';
          key: 'after' | 'before';
          ref: string;
          name: string;
          flow: FlowRef;
      }
    | { reason: 'ancestor'; key: 'after' | 'before'; ref: string; name: string }
    | { reason: 'floating-milestone'; key: 'after' | 'before'; ref: string; name: string }
) &
    WaveOwnerPosition;

export type W0702Args = {
    target:
        | {
              kind:
                  | 'item'
                  | 'group'
                  | 'parallel'
                  | 'swimlane'
                  | 'milestone'
                  | 'anchor'
                  | 'footnote'
                  | 'roadmap'
                  | 'person'
                  | 'team'
                  | 'label'
                  | 'size'
                  | 'status';
              name: string;
              /** Set for an unnamed block (no id, no title); it is named by line. */
              line?: number;
          }
        | { kind: 'default'; entityType: string };
};

export type E0202Args =
    | { reason: 'mismatch'; path: string; child: string[]; parent: string[] }
    | { reason: 'child-none'; path: string; parent: string[] }
    | { reason: 'parent-none'; path: string; child: string[] }
    | {
          reason: 'floor';
          id: string;
          path: string;
          childFloor: string | null;
          parentFloor: string | null;
      };

export type WavePresentationField = 'title' | 'style' | 'labels' | 'link' | 'description';

export type W0701Args = {
    id: string;
    path: string;
    fields: Array<{ field: WavePresentationField; there: string; here: string }>;
};

export type W1001Args = {
    name: string;
    pin: string;
    key: 'date' | 'start';
    wave: string;
    start: string;
};

export type W1002Args = { passes: number };

export type I1006Args =
    | { reason: 'one'; name: string }
    | { reason: 'many'; names: string[] }
    | { reason: 'all'; names: string[] };

export type I1007Args = { name: string; date: string; wave: string; end: string };

/** NL.I1008: an item pinned to a non-working day starts on the next working day. */
export type I1008Args = {
    name: string;
    pin: string;
    key: 'date' | 'start' | 'after';
    start: string;
};
