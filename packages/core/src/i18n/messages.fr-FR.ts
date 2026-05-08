// Bundle de messages — surcouche fr-FR (France).
//
// Vide à la conception. Cette surcouche existe pour héberger les
// divergences spécifiques à la France hexagonale lorsqu'elles
// apparaissent\ : une terminologie qui s'écarte du français neutre est
// rejetée de `messages.fr.ts` et atterrit ici.
//
// Les clés absentes redescendent automatiquement la chaîne de repli
// BCP-47\ : `fr-FR → fr → en-US`. Voir `specs/localization.md`.

import type { MessageBundle } from './index.js';

export const messages: MessageBundle = {
};
