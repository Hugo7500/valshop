// Alertes : ce qui mérite une notification entre le shop.json précédent et le nouveau.
// L'arrivée du Night Market (CAP-12), puis chaque offre du jour ou du Night Market
// qu'attend la liste de souhaits (CAP-17), dans la même liste.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, seulement
// des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).
// Lire wishlist.json et le catalogue, comparer avant d'écrire shop.json, puis
// notifier après l'écriture réussie, reste le travail de valshop.ts.

import type { Niveau, Souhait } from "./souhaits"

/** Une notification à envoyer ; `urgent` vaut `timeSensitive`, faux pour une notification ordinaire. */
export type Alerte = { titre: string; corps: string; urgent: boolean }

/**
 * Ce qu'attend la liste de souhaits : ses entrées (wishlist.json, déjà lue) et, par
 * niveau de skin du catalogue (`levels` de catalog.json), son skin parent et son
 * arme. Un niveau sans `skin` ni `weapon` (catalogue d'un format antérieur) ne
 * correspond à rien.
 */
export type Attendus = {
  liste: readonly Souhait[]
  niveaux: Readonly<Record<string, Partial<Pick<Niveau, "skin" | "weapon">>>>
}

/** Titre des alertes de la liste ; le journal le reprend : « alerte : Liste de souhaits ». */
const TITRE_LISTE = "Liste de souhaits"

/**
 * Écart sous lequel deux `daily.resetAt` (ou deux `nightMarket.endsAt`) désignent la
 * même échéance : calculés « maintenant + durée restante », ils varient de quelques
 * secondes d'une lecture à l'autre.
 */
const TOLERANCE_MS = 60 * 60 * 1000

/** Propriété d'une valeur inconnue ; undefined si ce n'est pas un objet. */
function champ(valeur: unknown, nom: string): unknown {
  return typeof valeur === "object" && valeur !== null
    ? (valeur as Record<string, unknown>)[nom]
    : undefined
}

/**
 * Le Night Market est-il actif dans cette boutique ? Vrai seulement si
 * `nightMarket.active` est le booléen `true` : un fichier absent, illisible,
 * d'un format antérieur ou inattendu vaut inactif.
 */
export function nightMarketActif(shop: unknown): boolean {
  return champ(champ(shop, "nightMarket"), "active") === true
}

/** « jj/mm » en heure locale ; null si l'horodatage est absent ou invalide. */
function jourMois(iso: unknown): string | null {
  const d = new Date(typeof iso === "string" ? iso : NaN)
  if (Number.isNaN(d.getTime())) return null
  const deux = (n: number) => String(n).padStart(2, "0")
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}`
}

/** Horodatage ISO 8601 → millisecondes depuis l'epoch ; null s'il est absent ou invalide. */
function instant(iso: unknown): number | null {
  if (typeof iso !== "string") return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Même échéance ? Les deux horodatages lisibles, à moins d'une heure d'écart. */
function memeEcheance(a: unknown, b: unknown): boolean {
  const x = instant(a)
  const y = instant(b)
  return x !== null && y !== null && Math.abs(x - y) < TOLERANCE_MS
}

/** Un nombre fini, ou null. */
function nombre(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

/** Offres d'une section (`daily` ou `nightMarket`) ; aucune si `items` manque ou n'est pas un tableau. */
function offres(section: unknown): unknown[] {
  const items = champ(section, "items")
  return Array.isArray(items) ? items : []
}

/** Identifiants (niveaux de skin) des offres d'une section. */
function identifiants(section: unknown): Set<string> {
  const ids = new Set<string>()
  for (const o of offres(section)) {
    const id = champ(o, "id")
    if (typeof id === "string") ids.add(id)
  }
  return ids
}

/**
 * L'offre `id` est-elle attendue ? D'après le catalogue, oui si une entrée `skin`
 * de la liste est son skin parent, ou une entrée `weapon` son arme ; une offre
 * absente du catalogue ne correspond à rien.
 */
function attendue(id: string, { liste, niveaux }: Attendus): boolean {
  const niveau = champ(niveaux, id)
  const skin = champ(niveau, "skin")
  const arme = champ(niveau, "weapon")
  return liste.some((e) => (e.kind === "skin" && e.id === skin) || (e.kind === "weapon" && e.id === arme))
}

/** Nom d'une offre (libellé du catalogue) ; son identifiant s'il manque. */
function nomOffre(offre: unknown, id: string): string {
  const nom = champ(offre, "name")
  return typeof nom === "string" && nom.length > 0 ? nom : id
}

/** « <nom> est en boutique : <prix> VP » ; sans prix s'il est inconnu. */
function corpsJour(offre: unknown, id: string): string {
  const prix = nombre(champ(offre, "cost"))
  return `${nomOffre(offre, id)} est en boutique` + (prix === null ? "" : ` : ${prix} VP`)
}

/**
 * « <nom> au Night Market : <prix remisé> VP (−<x> %) » ; sans prix ni remise si le
 * prix remisé est inconnu, sans remise si elle l'est.
 */
function corpsMarche(offre: unknown, id: string): string {
  const prix = nombre(champ(offre, "discounted"))
  const remise = nombre(champ(offre, "discountPercent"))
  return `${nomOffre(offre, id)} au Night Market`
    + (prix === null ? "" : ` : ${prix} VP` + (remise === null ? "" : ` (−${remise} %)`))
}

/** Une alerte urgente par offre de la section attendue par la liste, hors `dejaNotifiees`, dans l'ordre. */
function alertesListe(
  section: unknown, dejaNotifiees: ReadonlySet<string>, attendus: Attendus,
  corps: (offre: unknown, id: string) => string,
): Alerte[] {
  const alertes: Alerte[] = []
  for (const offre of offres(section)) {
    const id = champ(offre, "id")
    if (typeof id !== "string" || dejaNotifiees.has(id) || !attendue(id, attendus)) continue
    alertes.push({ titre: TITRE_LISTE, corps: corps(offre, id), urgent: true })
  }
  return alertes
}

/**
 * Compare le shop.json précédent (absent ou illisible : null) au nouveau et rend
 * les alertes à envoyer, dans l'ordre. Night Market : une alerte ordinaire quand
 * il passe d'inactif à actif ; rien tant qu'il reste actif, rien quand il finit.
 *
 * Avec `attendus` (liste de souhaits et catalogue), viennent ensuite les alertes
 * urgentes : une par offre attendue de la boutique du jour, puis du Night Market
 * s'il est actif. Le fichier précédent sert de mémoire : une offre du jour déjà
 * présente la même journée (deux `daily.resetAt` lisibles à moins d'une heure
 * d'écart), ou une offre déjà présente dans le même Night Market (précédent actif,
 * `endsAt` à moins d'une heure), ne renotifie pas, les jours suivants compris pour
 * le marché. Sans `attendus`, aucune alerte de liste.
 */
export function comparer(precedent: unknown, nouveau: unknown, attendus?: Attendus): Alerte[] {
  const alertes: Alerte[] = []

  if (!nightMarketActif(precedent) && nightMarketActif(nouveau)) {
    const nm = champ(nouveau, "nightMarket")
    const items = champ(nm, "items")
    const n = Array.isArray(items) ? items.length : null
    const fin = jourMois(champ(nm, "endsAt"))
    alertes.push({
      titre: "Night Market",
      corps: "Le Night Market est là"
        + (n === null ? "" : ` : ${n} ${n > 1 ? "offres" : "offre"}`)
        + (fin === null ? "" : `, jusqu'au ${fin}`),
      urgent: false,
    })
  }

  if (attendus) {
    // Boutique du jour : une offre déjà là la même journée a déjà été notifiée.
    const jourAvant = champ(precedent, "daily")
    const jour = champ(nouveau, "daily")
    const memeJournee = memeEcheance(champ(jourAvant, "resetAt"), champ(jour, "resetAt"))
    const dejaDuJour = memeJournee ? identifiants(jourAvant) : new Set<string>()
    alertes.push(...alertesListe(jour, dejaDuJour, attendus, corpsJour))

    // Night Market : une offre déjà dans le même marché a déjà été notifiée, quel que soit le jour.
    if (nightMarketActif(nouveau)) {
      const marcheAvant = champ(precedent, "nightMarket")
      const marche = champ(nouveau, "nightMarket")
      const memeMarche = nightMarketActif(precedent)
        && memeEcheance(champ(marcheAvant, "endsAt"), champ(marche, "endsAt"))
      const dejaDuMarche = memeMarche ? identifiants(marcheAvant) : new Set<string>()
      alertes.push(...alertesListe(marche, dejaDuMarche, attendus, corpsMarche))
    }
  }

  return alertes
}
