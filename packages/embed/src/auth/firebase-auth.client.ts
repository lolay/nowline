/**
 * Client-side Firebase Auth gate for the dev embed bundle.
 *
 * Mirrors `lolay/nowline-site/src/lib/firebase-auth.client.ts` so the
 * two Lolay dev surfaces share one allowlist UX. Loaded only on the
 * dev build (when `__NOWLINE_EMBED_ENV__ === 'dev'`); the prod build
 * tree-shakes the dynamic import in `src/index.ts` and never pulls
 * `firebase/app` or `firebase/auth` into the IIFE.
 *
 * Renders a full-viewport overlay with z-index 2147483647 so it sits
 * above any host-page content. Until the visitor signs in with an
 * allowlisted Google account, the overlay stays put; once allowlisted,
 * it removes itself and the embed's auto-scan reaches the rendered
 * SVG underneath. The host page is told nothing — the gate is purely
 * client-side, opaque to the embedder.
 *
 * See specs/embed.md § Bootstrap status (dev auth gate) and
 * lolay/nowline-infra:ops/embed-deploy.md § 4 for the deploy-side wiring.
 */

import { type FirebaseApp, initializeApp } from 'firebase/app';
import {
    type Auth,
    GoogleAuthProvider,
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    type User,
} from 'firebase/auth';
import { isAllowlisted } from './allowlist.js';

// esbuild-substituted at build time from PUBLIC_FIREBASE_* env vars in
// .github/workflows/embed-cdn.yml (sourced from the `embed-dev` GitHub
// environment-scoped variables — see
// lolay/nowline-infra:ops/embed-deploy.md § 2.5).
declare const __NOWLINE_FIREBASE_API_KEY__: string;
declare const __NOWLINE_FIREBASE_AUTH_DOMAIN__: string;
declare const __NOWLINE_FIREBASE_PROJECT_ID__: string;
declare const __NOWLINE_FIREBASE_APP_ID__: string;

const config = {
    apiKey: typeof __NOWLINE_FIREBASE_API_KEY__ !== 'undefined' ? __NOWLINE_FIREBASE_API_KEY__ : '',
    authDomain:
        typeof __NOWLINE_FIREBASE_AUTH_DOMAIN__ !== 'undefined'
            ? __NOWLINE_FIREBASE_AUTH_DOMAIN__
            : '',
    projectId:
        typeof __NOWLINE_FIREBASE_PROJECT_ID__ !== 'undefined'
            ? __NOWLINE_FIREBASE_PROJECT_ID__
            : '',
    appId: typeof __NOWLINE_FIREBASE_APP_ID__ !== 'undefined' ? __NOWLINE_FIREBASE_APP_ID__ : '',
};

const OVERLAY_ID = 'nowline-embed-dev-auth-overlay';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getOrCreateOverlay(): HTMLDivElement {
    let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Internal preview sign-in');
    overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'z-index: 2147483647',
        'background-color: #ffffff',
        'color: #1a1a2e',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'padding: 1.5rem',
        'font-family: system-ui, -apple-system, "Segoe UI", sans-serif',
    ].join(';');
    document.body.appendChild(overlay);
    return overlay;
}

function removeOverlay(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    overlay?.remove();
}

function renderSignIn(overlay: HTMLDivElement, onClick: () => void): void {
    overlay.innerHTML = `
        <div style="max-width: 28rem; text-align: center;">
            <div style="font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #5a5a6a; margin-bottom: 0.75rem;">embed.nowline.dev &mdash; internal preview</div>
            <h1 style="font-size: 1.875rem; font-weight: 700; margin: 0 0 0.75rem;">Sign in to continue</h1>
            <p style="margin: 0 0 1.5rem; color: #5a5a6a;">Access is limited to allowlisted Lolay accounts. Production embed is at <a href="https://embed.nowline.io" style="color: #1a4ed8;">embed.nowline.io</a>.</p>
            <button type="button" id="nowline-embed-dev-signin-btn" style="display: inline-block; padding: 0.75rem 1.5rem; border-radius: 8px; background-color: #e53e3e; color: #ffffff; font-weight: 700; border: 1px solid transparent; cursor: pointer; font-size: 1rem;">Sign in with Google</button>
        </div>
    `;
    const btn = overlay.querySelector<HTMLButtonElement>('#nowline-embed-dev-signin-btn');
    btn?.addEventListener('click', onClick);
}

function renderDenied(overlay: HTMLDivElement, email: string, onSignOut: () => void): void {
    overlay.innerHTML = `
        <div style="max-width: 28rem; text-align: center;">
            <div style="font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: #5a5a6a; margin-bottom: 0.75rem;">embed.nowline.dev &mdash; internal preview</div>
            <h1 style="font-size: 1.875rem; font-weight: 700; margin: 0 0 0.75rem;">Access denied</h1>
            <p style="margin: 0 0 1.5rem; color: #5a5a6a;">${escapeHtml(email)} is not on the allowlist for this preview environment. Production embed is publicly available at <a href="https://embed.nowline.io" style="color: #1a4ed8;">embed.nowline.io</a>.</p>
            <button type="button" id="nowline-embed-dev-signout-btn" style="display: inline-block; padding: 0.75rem 1.5rem; border-radius: 8px; background-color: transparent; color: #1a1a2e; font-weight: 700; border: 1px solid #c0c0c0; cursor: pointer; font-size: 1rem;">Sign out</button>
        </div>
    `;
    const btn = overlay.querySelector<HTMLButtonElement>('#nowline-embed-dev-signout-btn');
    btn?.addEventListener('click', onSignOut);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function startDevAuthGate(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
        // No firebase config baked in. Likely a local `pnpm bundle` without
        // PUBLIC_FIREBASE_* exported (CI deploys always set them). Skip the
        // overlay rather than render an unrecoverable dialog so devs aren't
        // locked out of their own local builds.
        console.warn(
            '[nowline-embed-dev-auth-gate] Missing PUBLIC_FIREBASE_* env vars at build time; gate is disabled. Configure them in .github/workflows/embed-cdn.yml or your local environment to enable.',
        );
        return;
    }

    // Create the overlay up front so it covers content while Firebase
    // initialises; subsequent renders call getOrCreateOverlay() again
    // to find the same element.
    getOrCreateOverlay();

    app ??= initializeApp(config);
    auth ??= getAuth(app);

    const provider = new GoogleAuthProvider();

    const handleSignIn = async (): Promise<void> => {
        try {
            await signInWithPopup(auth as Auth, provider);
        } catch (err) {
            console.error('[nowline-embed-dev-auth-gate] Sign-in failed:', err);
        }
    };

    const handleSignOut = async (): Promise<void> => {
        try {
            await signOut(auth as Auth);
        } catch (err) {
            console.error('[nowline-embed-dev-auth-gate] Sign-out failed:', err);
        }
    };

    onAuthStateChanged(auth as Auth, (user: User | null) => {
        if (!user) {
            renderSignIn(getOrCreateOverlay(), handleSignIn);
            return;
        }
        if (!isAllowlisted(user.email)) {
            renderDenied(getOrCreateOverlay(), user.email ?? 'unknown', handleSignOut);
            return;
        }
        removeOverlay();
    });
}
