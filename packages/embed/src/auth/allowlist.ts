/**
 * Allowlist for the dev embed bundle's Firebase Auth gate.
 *
 * An email is allowlisted if either:
 *   1. Its domain is in ALLOWED_DOMAINS (e.g. anything @nowline.io), OR
 *   2. The exact lowercase email is in ALLOWED_EMAILS.
 *
 * Mirrors the commercial site's `auth-allowlist.ts` so both Lolay
 * dev surfaces (the marketing site and the embed CDN dev tier) share
 * one allowlist policy. Keep this short; when it grows past ~5 entries,
 * migrate to Firebase custom claims (Admin SDK) or a Firestore
 * `allowlist` collection.
 *
 * See specs/embed.md § Bootstrap status (dev auth gate) and
 * the infrastructure deploy runbook § 4 for the deploy-side wiring.
 */

export const ALLOWED_DOMAINS: readonly string[] = ['nowline.io'];

export const ALLOWED_EMAILS: readonly string[] = [
    // Add additional allowlisted Google account emails here, one per line.
];

export function isAllowlisted(email: string | null | undefined): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (ALLOWED_EMAILS.includes(normalized)) return true;
    const at = normalized.lastIndexOf('@');
    if (at === -1) return false;
    const domain = normalized.slice(at + 1);
    return ALLOWED_DOMAINS.includes(domain);
}
