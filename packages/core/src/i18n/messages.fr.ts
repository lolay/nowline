// Bundle de messages français — base régionalement neutre.
//
// Les divergences spécifiques au Québec ou à la France vont dans
// `messages.fr-CA.ts` / `messages.fr-FR.ts`, qui se superposent par-dessus
// celui-ci via la chaîne de repli BCP-47 (`fr-CA → fr → en-US`).
//
// Origine\ : traduction automatique amorcée, puis relecture humaine
// francophone du Québec (terminologie OQLF, Grand dictionnaire
// terminologique). Toute formulation typiquement québécoise doit
// descendre dans `messages.fr-CA.ts` plutôt que de polluer cette base.
//
// Les clés manquantes ici font silencieusement repli sur `messages.en.ts`,
// donc une couverture partielle est sûre.

import type { MessageBundle } from './index.js';

export const messages: MessageBundle = {
    // Structurel
    'NL.E0001': () => 'La section config doit précéder la section roadmap.',
    'NL.E0002': () => 'Les déclarations include doivent précéder la section config.',
    'NL.E0003': () => 'Les déclarations include doivent précéder la section roadmap.',
    'NL.E0004': () => 'Au moins une swimlane est requise.',
    'NL.E0005': (a: { line: number }) =>
        `Ligne ${a.line}\u00A0: tabulations et espaces mélangés dans l'indentation. Utilisez l'un ou l'autre, mais pas les deux.`,

    // Directive
    'NL.E0100': (a: { version: string }) =>
        `Format de version invalide «\u00A0${a.version}\u00A0». Format attendu\u00A0: v1, v2, etc.`,
    'NL.E0101': (a: { version: string; supported: string }) =>
        `Ce fichier requiert Nowline ${a.version}, mais l'analyseur ne prend en charge que jusqu'à ${a.supported}.`,
    'NL.E0102': (a: { key: string; allowed: string }) =>
        `Propriété de directive inconnue «\u00A0${a.key}\u00A0». Valeurs admises\u00A0: ${a.allowed}.`,
    'NL.E0103': (a: { key: string }) => `Propriété de directive «\u00A0${a.key}\u00A0» en double.`,
    'NL.E0104': (a: { value: string }) =>
        `Locale invalide «\u00A0${a.value}\u00A0». Utilisez une étiquette BCP-47 telle que «\u00A0en-US\u00A0», «\u00A0fr\u00A0» ou «\u00A0fr-CA\u00A0».`,

    // Include
    'NL.E0200': (a: { value: string }) =>
        `Mode d'include invalide «\u00A0${a.value}\u00A0». Doit être merge, ignore ou isolate.`,
    'NL.E0201': (a: { key: string }) => `Option «\u00A0${a.key}\u00A0» en double sur include.`,

    // Identifiant
    'NL.E0300': (a: { name: string; location: string }) =>
        `Identifiant en double «\u00A0${a.name}\u00A0». Première déclaration à ${a.location}.`,
    'NL.E0301': (a: { type: string }) =>
        `${a.type} doit comporter un identifiant, un titre, ou les deux.`,

    // Valeurs de propriété
    'NL.E0400': (a: { value: string }) =>
        `Durée invalide «\u00A0${a.value}\u00A0». Utilisez un littéral de durée brut comme 0.5d, 2w, 1m, 2q. Utilisez «\u00A0size:NOM\u00A0» pour référencer une taille déclarée.`,
    'NL.E0401': (a: { value: string }) =>
        `Taille invalide «\u00A0${a.value}\u00A0». Utilisez l'identifiant d'une taille déclarée (p.\u00A0ex. xs, m, lg).`,
    'NL.E0402': (a: { value: string }) =>
        `Effort invalide «\u00A0${a.value}\u00A0». Utilisez un littéral de durée brut comme 0.5d, 2w, 1m, 2q.`,
    'NL.E0403': (a: { value: string }) =>
        `Valeur restante invalide «\u00A0${a.value}\u00A0». Utilisez un pourcentage tel que 30% ou un littéral de durée comme 1w, 0.5d.`,
    'NL.E0404': (a: { value: string }) =>
        `La valeur restante doit être comprise entre 0 % et 100 %, reçu ${a.value}.`,
    'NL.E0405': (a: { key: string; value: string }) =>
        `${a.key} invalide «\u00A0${a.value}\u00A0». Utilisez le format ISO 8601\u00A0: AAAA-MM-JJ.`,
    'NL.E0406': (a: { value: string }) =>
        `Échelle invalide «\u00A0${a.value}\u00A0». Utilisez un littéral de durée brut comme 1w, 2w, 1q (pas de recherche par nom).`,
    'NL.E0407': (a: { value: string }) =>
        `Calendrier invalide «\u00A0${a.value}\u00A0». Doit être business, full ou custom.`,
    'NL.E0408': (a: { key: string }) =>
        `La propriété «\u00A0${a.key}\u00A0» exige au moins une référence.`,

    // Ancre / jalon / note de bas de page
    'NL.E0500': (a: { name: string }) =>
        `L'ancre «\u00A0${a.name}\u00A0» exige une propriété «\u00A0date:\u00A0».`,
    'NL.E0501': (a: { name: string }) =>
        `L'ancre «\u00A0${a.name}\u00A0» a une date, mais «\u00A0start:\u00A0» manque sur la roadmap. Ajoutez start:AAAA-MM-JJ à la roadmap.`,
    'NL.E0502': (a: { name: string; date: string; start: string }) =>
        `La date ${a.date} de l'ancre «\u00A0${a.name}\u00A0» précède le début de la roadmap (${a.start}).`,
    'NL.E0503': (a: { name: string }) =>
        `Le jalon «\u00A0${a.name}\u00A0» exige au moins l'une des propriétés «\u00A0date:\u00A0» ou «\u00A0after:\u00A0».`,
    'NL.E0504': (a: { name: string; date: string; start: string }) =>
        `La date ${a.date} du jalon «\u00A0${a.name}\u00A0» précède le début de la roadmap (${a.start}).`,
    'NL.E0505': () =>
        'Une note de bas de page exige une propriété «\u00A0on:\u00A0» référençant au moins une entité.',

    // Élément
    'NL.E0600': (a: { name: string }) =>
        `L'élément «\u00A0${a.name}\u00A0» exige une propriété «\u00A0size:\u00A0» ou «\u00A0duration:\u00A0».`,

    // Avertissements
    'NL.W0700': (a: { key: string; entity: string; suggested: string }) =>
        `Propriété inconnue «\u00A0${a.key}\u00A0» sur ${a.entity}. Le moteur de rendu l'ignore.${
            a.suggested ? ` Vouliez-vous dire «\u00A0${a.suggested}\u00A0»\u00A0?` : ''
        }`,
};
