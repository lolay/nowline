// Share-link generation moved to the dependency-light @nowline/share-link
// leaf so the encoder is shared verbatim with @nowline/mcp (one
// spec-normative implementation — see specs/embed.md). This file stays as a
// thin re-export so internal importers (auto-scan.ts) and the package's
// public surface are unchanged.

export {
    type BuildShareLinkOptions,
    buildShareLink,
    DEFAULT_SHARE_BASE,
    encodeText,
    type ShareOption,
} from '@nowline/share-link';
