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
import type {
    E0202Args,
    E1100Args,
    E1101Args,
    E1102Args,
    E1103Args,
    E1104Args,
    E1105Args,
    E1106Args,
    FlowRef,
    I1006Args,
    I1007Args,
    I1008Args,
    W0701Args,
    W0702Args,
    W1001Args,
    W1002Args,
    W1100Args,
    W1101Args,
    WaveContainerKind,
    WaveKind,
    WaveSuggestion,
} from './wave-message-types.js';

// Un nom entre guillemets français, avec espaces insécables.
const q = (s: string): string => `«\u00A0${s}\u00A0»`;

// Descripteurs de genre d'entité reçus sous forme structurée (voir
// `wave-message-types.ts`), avec article indéfini.
const KIND_WITH_ARTICLE: Record<WaveKind, string> = {
    item: 'un élément',
    group: 'un groupe',
    parallel: 'un bloc parallèle',
    swimlane: 'une swimlane',
    anchor: 'une ancre',
    milestone: 'un jalon',
    'floating-milestone': 'un jalon sans date',
    wave: 'une vague',
    label: 'une étiquette',
    size: 'une taille',
    status: 'un statut',
    person: 'une personne',
    team: 'une équipe',
    footnote: 'une note de bas de page',
    roadmap: 'la roadmap',
    style: 'un style',
    symbol: 'un symbole',
};

// Même chose avec l'article défini, pour « sur l'ancre « x » ».
const KIND_DEFINITE: Record<WaveKind, string> = {
    item: "l'élément",
    group: 'le groupe',
    parallel: 'le bloc parallèle',
    swimlane: 'la swimlane',
    anchor: "l'ancre",
    milestone: 'le jalon',
    'floating-milestone': 'le jalon',
    wave: 'la vague',
    label: "l'étiquette",
    size: 'la taille',
    status: 'le statut',
    person: 'la personne',
    team: "l'équipe",
    footnote: 'la note de bas de page',
    roadmap: 'la roadmap',
    style: 'le style',
    symbol: 'le symbole',
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Un conteneur ou une swimlane par son nom, ou par sa position s'il n'en a pas.
function flowText(f: FlowRef): string {
    if (f.kind === 'parallel-block') return `le bloc parallèle à la ligne ${f.line}`;
    if (f.kind === 'group-block') return `le groupe à la ligne ${f.line}`;
    const noun =
        f.kind === 'group'
            ? 'le groupe'
            : f.kind === 'parallel'
              ? 'le bloc parallèle'
              : 'la swimlane';
    return `${noun} ${q(f.name)}`;
}

// The entity a W1100/W1101 is on: `« name »`, or by position when it is an
// unnamed group or parallel. `of` gives the form after « de » (`du groupe`).
function ownerText(
    a: { name: string; kind?: WaveContainerKind; line?: number },
    of = false,
): string {
    if (a.name || a.line === undefined) return of ? `de ${q(a.name)}` : q(a.name);
    const text = flowText({
        kind: a.kind === 'parallel' ? 'parallel-block' : 'group-block',
        line: a.line,
    });
    return of ? `du ${text.slice('le '.length)}` : text;
}

function entityText(e: {
    kind: 'item' | 'group' | 'parallel';
    name: string;
    line?: number;
}): string {
    const noun = e.kind === 'item' ? 'élément' : e.kind === 'group' ? 'groupe' : 'bloc parallèle';
    const article = e.kind === 'item' ? "l'" : 'le ';
    if (e.name) return `${article}${noun} ${q(e.name)}`;
    return e.line === undefined ? `${article}${noun}` : `${article}${noun} à la ligne ${e.line}`;
}

// A container by name, or by position when unnamed.
function containerText(c: { kind: 'group' | 'parallel'; name: string; line?: number }): string {
    const noun = c.kind === 'parallel' ? 'le bloc parallèle' : 'le groupe';
    if (c.name) return `${noun} ${q(c.name)}`;
    return c.line === undefined ? noun : `${noun} à la ligne ${c.line}`;
}

function suggestionText(s: WaveSuggestion | undefined): string {
    if (!s) return '';
    return s.title === undefined
        ? ` Vouliez-vous dire wave:${s.id}\u00A0?`
        : ` Vouliez-vous dire wave:${s.id} (${q(s.title)})\u00A0?`;
}

// Jusqu'à cinq noms entre guillemets, puis « et N autres ».
function namesText(names: string[]): string {
    const shown = names.slice(0, 5).map(q);
    const rest = names.length - shown.length;
    return rest > 0
        ? `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
        : shown.join(', ');
}

function waveListText(ids: string[]): string {
    return `[${ids.join(', ')}]`;
}

function floorText(floor: string | null): string {
    return floor === null ? "n'a pas de borne de départ" : `ne s'ouvre pas avant ${floor}`;
}

function noneIfEmpty(v: string): string {
    return v === '' ? 'aucun' : q(v);
}

const FIELD_FR: Record<W0701Args['fields'][number]['field'], string> = {
    title: 'titre',
    style: 'style',
    labels: 'étiquettes',
    link: 'lien',
    description: 'description',
};

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
    'NL.E0202': (a: E0202Args) => {
        switch (a.reason) {
            case 'mismatch':
                return `L'include ${q(a.path)} déclare les vagues ${waveListText(a.child)}, mais celles de ce fichier sont ${waveListText(a.parent)}. Chaque roadmap incluse doit déclarer les mêmes vagues dans le même ordre\u00A0: copiez les lignes wave de ce fichier dans ${q(a.path)}.`;
            case 'child-none':
                return `L'include ${q(a.path)} ne déclare aucune vague, mais celles de ce fichier sont ${waveListText(a.parent)}. Copiez les lignes wave de ce fichier dans ${q(a.path)} pour que son travail rejoigne les vagues.`;
            case 'parent-none':
                return `L'include ${q(a.path)} déclare les vagues ${waveListText(a.child)}, mais ce fichier n'en déclare aucune. Déclarez les mêmes vagues ici pour que les barrières s'appliquent à toute la roadmap.`;
            case 'floor':
                return `La vague ${q(a.id)} dans ${q(a.path)} ${floorText(a.childFloor)}, mais la vague ${q(a.id)} de ce fichier ${floorText(a.parentFloor)}. Une vague doit avoir la même borne de départ dans chaque roadmap incluse.`;
        }
    },

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
    'NL.E0410': (a: { key: string }) =>
        `«\u00A0${a.key}:\u00A0» n'accepte qu'une seule date inline par direction\u00A0; regroupez les dates en une seule date contraignante ou utilisez une ancre déclarée.`,
    'NL.E0411': (a: { key: string; type: string }) =>
        `Une date inline dans «\u00A0${a.key}:\u00A0» n'est pas autorisée sur ${a.type}. Autorisée seulement sur item, parallel et group, et sur le «\u00A0after:\u00A0» d'une vague\u00A0; pour un milestone utilisez «\u00A0date:\u00A0» à la place.`,
    'NL.E0412': (a: { key: string; date: string }) =>
        `La date inline «\u00A0${a.date}\u00A0» dans «\u00A0${a.key}:\u00A0» exige que la roadmap déclare «\u00A0start:\u00A0». Ajoutez start:AAAA-MM-JJ à la roadmap.`,
    'NL.E0413': (a: { key: string; date: string; start: string }) =>
        `La date inline «\u00A0${a.date}\u00A0» dans «\u00A0${a.key}:\u00A0» précède le début de la roadmap (${a.start}).`,

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
    'NL.W0701': (a: W0701Args) =>
        `La vague ${q(a.id)} dans ${q(a.path)} diffère de la définition de ce fichier (${a.fields
            .map(
                (f) =>
                    `${FIELD_FR[f.field]} ${noneIfEmpty(f.there)} là-bas, ${noneIfEmpty(f.here)} ici`,
            )
            .join('\u00A0; ')})\u00A0; la définition de ce fichier est utilisée.`,
    'NL.W0702': (a: W0702Args) =>
        `«\u00A0wave:\u00A0» sur ${
            a.target.kind === 'default'
                ? q(`default ${a.target.entityType}`)
                : !a.target.name && a.target.line !== undefined
                  ? a.target.kind === 'item' ||
                    a.target.kind === 'group' ||
                    a.target.kind === 'parallel'
                      ? entityText({ kind: a.target.kind, name: '', line: a.target.line })
                      : `${a.target.kind} à la ligne ${a.target.line}`
                  : `${a.target.kind} ${q(a.target.name)}`
        } est ignoré\u00A0: cette roadmap ne déclare aucune vague. Déclarez des vagues avec «\u00A0wave <id>\u00A0» pour l'utiliser, ou retirez la propriété.`,

    // Vagues
    'NL.E1100': (a: E1100Args) =>
        `La vague ${
            a.title === undefined ? `à la ligne ${a.line}` : q(a.title)
        } exige un identifiant explicite pour que le travail puisse la référencer avec wave:<id>, p.\u00A0ex. wave build "Build".`,
    'NL.E1101': (a: E1101Args) => {
        switch (a.reason) {
            case 'list':
                return `«\u00A0wave:\u00A0» accepte exactement un identifiant de vague\u00A0; un élément appartient à une seule vague au plus. Reçu ${q(a.value)}.`;
            case 'unknown':
                return `La vague ${q(a.value)} n'est pas déclarée. Vagues déclarées\u00A0: ${
                    a.declared.length > 0 ? a.declared.join(', ') : 'aucune'
                }. Ajoutez «\u00A0wave ${a.value}\u00A0» au-dessus de la première swimlane qui l'utilise.${suggestionText(a.suggestion)}`;
            case 'forward':
                return `La vague ${q(a.value)} est utilisée avant sa déclaration à la ligne ${a.line}. Déclarez les vagues au-dessus des swimlanes qui les utilisent.`;
            case 'not-a-wave':
                return `«\u00A0wave:\u00A0» doit nommer une vague, mais ${q(a.value)} est ${KIND_WITH_ARTICLE[a.kind]}.${suggestionText(a.suggestion)}`;
        }
    },
    'NL.E1102': (a: E1102Args) =>
        `${capitalize(entityText(a.entity))} a wave:${a.wave}, mais ${entityText(a.container)} qui le contient a wave:${a.containerWave}. La vague d'un conteneur s'applique à tout ce qu'il contient\u00A0; retirez l'une des deux propriétés wave:.`,
    'NL.E1103': (a: E1103Args) => {
        switch (a.reason) {
            case 'sequence': {
                const many = a.items.length > 1;
                const items = `${many ? 'Les éléments' : "L'élément"} ${a.items.map(q).join(', ')} (vague ${q(a.itemWave)})`;
                const ref = typeof a.ref === 'string' ? q(a.ref) : flowText(a.ref);
                return `${items} ${many ? 'viennent' : 'vient'} après ${ref} (vague ${q(a.refWave)}) dans ${flowText(a.flow)}. Le travail d'une swimlane ou d'un groupe s'exécute dans l'ordre, il doit donc aussi être ordonné par vague\u00A0: déplacez ${ref} sous ${q(a.last)}, ou changez leurs vagues.`;
            }
            case 'join':
                return `L'élément ${q(a.name)} (vague ${q(a.wave)}) vient après ${flowText(a.block)} dans ${flowText(a.flow)}, et ce bloc ne peut pas se terminer avant sa piste ${q(a.track)} (vague ${q(a.trackWave)}). Déplacez ${q(a.name)} au-dessus du bloc ou dans une piste distincte, ou changez l'une de leurs vagues.`;
            case 'after-item': {
                return a.container
                    ? `${capitalize(containerText(a.container))} a after:${a.refId}, mais ${q(a.ref)} est dans la vague ultérieure ${q(a.refWave)}. La vague ${q(a.refWave)} ne peut pas démarrer avant la fin de la vague ${q(a.wave)}, donc ${q(a.name)} (vague ${q(a.wave)}) à l'intérieur ne pourrait jamais démarrer\u00A0: déplacez ${q(a.name)} dans la vague ${q(a.refWave)} ou une vague ultérieure, ou retirez le after:.`
                    : `L'élément ${q(a.name)} (vague ${q(a.wave)}) a after:${a.refId}, mais ${q(a.ref)} est dans la vague ultérieure ${q(a.refWave)}. La vague ${q(a.refWave)} ne peut pas démarrer avant la fin de la vague ${q(a.wave)}, donc ${q(a.name)} ne pourrait jamais démarrer\u00A0: déplacez-le dans la vague ${q(a.refWave)} ou une vague ultérieure, ou retirez le after:.`;
            }
            case 'after-wave': {
                const kind = a.container?.kind === 'parallel' ? 'bloc parallèle' : 'groupe';
                return a.container
                    ? `${capitalize(containerText(a.container))} (vague ${q(a.wave)}) a after:${a.refId}, mais le travail ne peut pas attendre la fin de sa propre vague ni d'une vague ultérieure. Utilisez une vague antérieure, ou déplacez le ${kind} dans une vague ultérieure.`
                    : `L'élément ${q(a.name)} (vague ${q(a.wave)}) a after:${a.refId}, mais le travail ne peut pas attendre la fin de sa propre vague ni d'une vague ultérieure. Utilisez une vague antérieure, ou déplacez ${q(a.name)} dans une vague ultérieure.`;
            }
            case 'chain':
                return `L'élément ${q(a.name)} (vague ${q(a.wave)}) ne pourrait jamais démarrer\u00A0: via ${a.chain.join(' → ')}, il attend du travail qui ne peut pas démarrer avant la fin de la vague ${q(a.wave)}. Déplacez ${q(a.name)} dans une vague ultérieure, ou rompez la chaîne.`;
        }
    },
    'NL.E1104': (a: E1104Args) => {
        switch (a.reason) {
            case 'swimlane':
                return `«\u00A0wave:\u00A0» n'est pas autorisé sur la swimlane ${q(a.name)}\u00A0: une swimlane couvre toutes les vagues. Placez wave: sur ses éléments, ou regroupez-les dans «\u00A0group wave:${a.value}\u00A0».`;
            case 'milestone':
                return `«\u00A0wave:\u00A0» n'est pas autorisé sur le jalon ${q(a.name)}. Pour placer un jalon à la fin d'une vague, utilisez after:${a.value}.`;
            case 'other':
                return `«\u00A0wave:\u00A0» n'est pas autorisé sur ${KIND_DEFINITE[a.type]} ${q(a.name)}\u00A0; seuls item, group et parallel peuvent appartenir à une vague.`;
        }
    },
    'NL.E1105': (a: E1105Args) =>
        a.reason === 'before'
            ? `«\u00A0before:\u00A0» n'est pas autorisé sur la vague ${q(a.name)}. La fin d'une vague découle de ses éléments\u00A0; pour donner une échéance à une vague, ajoutez un jalon daté\u00A0: milestone ${a.name}-due date:<AAAA-MM-JJ> after:${a.name}.`
            : `«\u00A0${a.key}:\u00A0» n'est pas autorisé sur la vague ${q(a.name)}. L'étendue d'une vague découle de ses éléments\u00A0; seul after: (une ancre, un jalon daté ou une date ISO) peut retarder le début d'une vague.`,
    'NL.E1106': (a: E1106Args) =>
        `La vague ${q(a.name)} a after:${a.ref}, mais ${q(a.ref)} est ${KIND_WITH_ARTICLE[a.kind]}. Le after: d'une vague accepte seulement des ancres, des jalons datés ou une date ISO\u00A0; pour qu'une vague attende du travail, placez ce travail dans une vague antérieure.`,

    // Avertissements de mise en page
    'NL.W1001': (a: W1001Args) =>
        `L'élément ${q(a.name)} est épinglé à ${a.pin} (${a.key}:), mais la vague ${q(a.wave)} ne peut pas démarrer avant le ${a.start}\u00A0; l'élément démarre au début de la vague.`,
    'NL.W1002': (a: W1002Args) =>
        `Les barrières de vagues ne se sont pas stabilisées après ${a.passes} passes de mise en page\u00A0; le calendrier dessiné pourrait donc ne pas respecter l'ordre des vagues. La roadmap comporte probablement un conflit d'ordre que la validation n'a pas détecté.`,

    // Avertissements de vagues
    'NL.W1100': (a: W1100Args) => {
        const owner = ownerText(a);
        return a.reason === 'item'
            ? `before:${a.ref} sur ${owner} ne peut jamais être respecté\u00A0: ${owner} est dans la vague ${q(a.wave)}, qui ne peut pas démarrer avant la fin de ${q(a.ref)} (vague ${q(a.refWave)}). Le dépassement sera peint.`
            : `before:${a.ref} sur ${owner} ne peut jamais être respecté\u00A0: ${owner} est dans la vague ${q(a.wave)}, qui ne peut pas se terminer avant le début de la vague ${q(a.ref)}. Le dépassement sera peint.`;
    },
    'NL.W1101': (a: W1101Args) => {
        const owner = ownerText(a);
        switch (a.reason) {
            case 'forward-lane':
                return `${a.key}:${a.ref} sur ${owner} référence ${q(a.ref)}, qui se trouve dans une swimlane ultérieure (${q(a.lane)}). La mise en page place les swimlanes dans l'ordre et ignore les références à du travail qu'elle n'a pas encore placé, elle ignore donc ce ${a.key}:. Déplacez la swimlane ${q(a.lane)} au-dessus de la swimlane ${q(a.ownLane)}, ou retirez le ${a.key}:.`;
            case 'forward-flow':
                return `${a.key}:${a.ref} sur ${owner} référence ${q(a.ref)}, qui vient plus tard dans ${flowText(a.flow)}. La mise en page ignore les références à du travail qu'elle n'a pas encore placé, elle ignore donc ce ${a.key}:. Déplacez ${q(a.ref)} au-dessus ${ownerText(a, true)}, ou retirez le ${a.key}:.`;
            case 'ancestor':
                return `${a.key}:${a.ref} sur ${owner} référence ${q(a.ref)}, qui le contient. La mise en page ignore les références à un groupe ou un bloc parallèle englobant, elle ignore donc ce ${a.key}:. Retirez le ${a.key}:.`;
            case 'floating-milestone':
                return `${a.key}:${a.ref} sur ${owner} référence le jalon ${q(a.ref)}, qui n'a pas de date. Les jalons sans date sont placés après tout le travail, la mise en page ignore donc ce ${a.key}:. Référencez plutôt les prédécesseurs du jalon ou une vague.`;
        }
    },

    // Informations de mise en page
    'NL.I1006': (a: I1006Args) => {
        switch (a.reason) {
            case 'one':
                return `La vague ${q(a.name)} n'a aucun élément, elle ne couvre donc aucune durée\u00A0; elle est dessinée comme un repère dans la bande des vagues et listée dans la légende des vagues.`;
            case 'many':
                return `Les vagues ${namesText(a.names)} n'ont aucun élément, elles ne couvrent donc aucune durée\u00A0; elles sont dessinées comme des repères dans la bande des vagues et listées dans la légende des vagues.`;
            case 'all':
                return `Aucune des vagues déclarées (${namesText(a.names)}) n'a encore d'élément. La bande des vagues affiche un espace réservé jusqu'à ce que du travail soit affecté avec wave:<id>.`;
        }
    },
    'NL.I1007': (a: I1007Args) =>
        `Le jalon ${q(a.name)} (${a.date}) est dépassé\u00A0: la vague ${q(a.wave)} se termine le ${a.end}.`,
    'NL.I1008': (a: I1008Args) =>
        `L'élément ${q(a.name)} est épinglé à ${a.pin} (${a.key}:), un jour non ouvré\u00A0; il démarre le ${a.start}.`,
};
