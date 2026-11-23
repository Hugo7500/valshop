// Fiches de l'onglet Boutique (CAP-25) : la lecture de catalog.json pour la fiche d'un skin
// (fiche-skin.tsx), qui en montre ou en montrera tout : ses variantes, ses niveaux et les
// adresses de leurs vidéos, rangés par construireCatalogue (souhaits.ts) dans les sections
// `levels`, `skins` et `weapons` ; et les libellés que la fiche en tire. Lecture tolérante :
// une entrée abîmée est passée, jamais une erreur ; un niveau inconnu ou un catalogue d'avant
// CAP-25 ne donne pas de fiche (null), l'écran montrant alors l'offre comme la liste.
// Bundles et accessoires (entrée 3 de epic-boutique-visuels) : pour le moteur (valshop.ts), les
// objets d'un bundle lus dans la réponse storefront (champs présumés, api-riot.md), le type d'un
// objet, et l'entrée de catalog.json d'un accessoire avec le grand visuel de sa fiche, tirés des
// réponses de valorant-api ; pour les fiches (fiche-bundle.tsx, fiche-accessoire.tsx) et la liste
// (vue.tsx), les objets d'un bundle avec leur image, ce que catalog.json dit d'un accessoire, le
// libellé d'un type et la fin d'une offre. Même tolérance : jamais d'erreur.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, seulement des types
// effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).

import type { Variante } from "./souhaits"

/** Niveau d'un skin, pour sa fiche : uuid, libellé fr-FR, adresse de sa vidéo (null si aucune). */
export type NiveauDeSkin = { id: string; name: string; streamedVideo: string | null }

/**
 * Fiche d'un skin, ouverte par l'uuid de l'un de ses niveaux (`niveau`) : uuid et libellé du
 * skin, libellé de son arme (null si inconnue), ses variantes et ses niveaux dans l'ordre du
 * catalogue, la première variante de base ; adresses telles que rangées, null si absentes.
 */
export type FicheDeSkin = {
  niveau: string
  skin: string
  name: string
  weapon: string | null
  variantes: Variante[]
  niveaux: NiveauDeSkin[]
}

// ─────────────────────────── lecture défensive ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

/**
 * Propriété propre d'une valeur inconnue ; undefined si ce n'est pas un objet ou s'il ne l'a
 * pas : un identifiant tel que « constructor » ou « __proto__ » ne mène jamais au prototype.
 */
function propre(x: unknown, cle: unknown): unknown {
  return estObjet(x) && typeof cle === "string" && Object.prototype.hasOwnProperty.call(x, cle) ? x[cle] : undefined
}

/** Une chaîne non vide, ou null. */
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null
}

// ─────────────────────────── fiche d'un skin ───────────────────────────

/**
 * La fiche du skin du niveau `niveau`, lue dans un catalogue tel que le range le moteur
 * (contrat-donnees.md). Null, sans erreur, si le catalogue n'est pas un objet, si le niveau
 * est inconnu ou sans skin, si le skin est inconnu, ou s'il n'a pas le champ `chromas`
 * (catalogue d'avant CAP-25, reconstruit à la lecture de boutique suivante). Une variante
 * sans `id`, un niveau absent de `levels`, une entrée qui n'est pas un objet ou un doublon
 * sont passés ; une adresse qui n'est pas une chaîne vaut null ; une variante ou un niveau
 * sans libellé prend celui du skin, le skin celui du niveau, sinon son uuid.
 */
export function lireFicheSkin(cat: unknown, niveau: string): FicheDeSkin | null {
  const levels = propre(cat, "levels")
  const skins = propre(cat, "skins")
  if (!estObjet(levels) || !estObjet(skins)) return null
  const n = propre(levels, niveau)
  const skin = chaine(propre(n, "skin"))
  if (!skin) return null
  const s = propre(skins, skin)
  const chromas = propre(s, "chromas")
  if (!Array.isArray(chromas)) return null
  const name = chaine(propre(s, "name")) ?? chaine(propre(n, "name")) ?? skin
  const arme = chaine(propre(s, "weapon")) ?? chaine(propre(n, "weapon"))
  const weapon = chaine(propre(propre(propre(cat, "weapons"), arme), "name"))

  const variantes: Variante[] = []
  const vues = new Set<string>()
  for (const c of chromas) {
    const id = chaine(propre(c, "id"))
    if (!id || vues.has(id)) continue
    vues.add(id)
    variantes.push({
      id,
      name: chaine(propre(c, "name")) ?? name,
      fullRender: chaine(propre(c, "fullRender")),
      swatch: chaine(propre(c, "swatch")),
      streamedVideo: chaine(propre(c, "streamedVideo")),
    })
  }

  const niveaux: NiveauDeSkin[] = []
  const lus = new Set<string>()
  const ids = propre(s, "levels")
  for (const x of Array.isArray(ids) ? ids : []) {
    const id = chaine(x)
    const l = propre(levels, id)
    if (!id || lus.has(id) || !estObjet(l)) continue
    lus.add(id)
    niveaux.push({ id, name: chaine(propre(l, "name")) ?? name, streamedVideo: chaine(propre(l, "streamedVideo")) })
  }

  return { niveau, skin, name, weapon, variantes, niveaux }
}

// ─────────────────────────── libellés ───────────────────────────

/**
 * Skin et arme d'un libellé, comme la liste et le widget : « Vandal (Glitchpop) » → skin
 * « Glitchpop », arme « VANDAL » ; sans parenthèses, le libellé entier est le skin, sans arme.
 * Blancs autour retirés d'abord : valorant-api en laisse parfois un à la fin (« Vandal (XERØFANG) »).
 */
export function separerNom(nom: string, anglais = false): { skin: string; weapon: string } {
  const n = nom.trim()
  const m = n.match(/^(.*?)\s*\((.*)\)$/)
  if (m) return { skin: m[2], weapon: m[1].toUpperCase() }


  if (anglais) {
    const a = /^(.+?)\s+(\S+)$/.exec(n)
    if (a && ARMES_ANGLAISES.has(a[2])) return { skin: a[1], weapon: a[2].toUpperCase() }
  }
  return { skin: n, weapon: "" }
}

/** Les armes à feu de valorant-api en en-US, telles qu'elles finissent le nom d'un skin (« Oni Phantom »). */
const ARMES_ANGLAISES: ReadonlySet<string> = new Set([
  "Classic", "Shorty", "Frenzy", "Ghost", "Bandit", "Sheriff", "Stinger", "Spectre", "Bucky", "Judge", "Bulldog", "Guardian",
  "Phantom", "Vandal", "Marshal", "Outlaw", "Operator", "Ares", "Odin",
])








export function libelleVariante(nom: string, rang: number): string {
  if (rang === 0) return "De base"
  const lignes = nom.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0)
  const derniere = lignes.length > 0 ? lignes[lignes.length - 1] : ""
  const t = derniere.replace(/^\((.*)\)$/, "$1").trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : `Variante ${rang}`
}

// ─────────────────────────── bundles et accessoires : le moteur ───────────────────────────

/** Types d'accessoire que le moteur sait décrire, un par catalogue public essayé (valshop.ts) ; tout autre vaut « autre ». */
const TYPES_ACCESSOIRE = ["spray", "card", "title", "buddy"]

/**
 * Entrée d'un accessoire dans catalog.json (contrat-donnees.md) : type, libellé fr-FR, icône (petite image de la liste)
 * et grand visuel de sa fiche, adresses de valorant-api telles que reçues, null si absentes.
 */
export type EntreeAccessoire = { kind: string; name: string; icon: string | null; image: string | null }

/** Un objet d'un bundle lu dans la réponse storefront : uuid, prix de base et prix dans le bundle (VP ; null si inconnus). */
export type ObjetLu = { id: string; cost: number | null; discounted: number | null }

/** Les objets lus d'un bundle, et ce que le journal doit en dire (clés vues comprises) ; `anomalies` vide si tout s'est lu. */
export type ObjetsLus = { objets: ObjetLu[]; anomalies: string[] }

/** Une chaîne rognée de ses blancs, non vide ; sinon null. */
function rognee(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null
}

/** Un montant : nombre fini, ou première valeur d'un dictionnaire par devise (`{ "<uuid>": 1775 }`) ; sinon null. */
function montant(x: unknown): number | null {
  const v = estObjet(x) ? Object.values(x)[0] : x
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Les clés d'une valeur, pour le journal ; sinon sa nature (« null », « tableau », « string »…). */
function clesDe(x: unknown): string {
  if (estObjet(x)) return Object.keys(x).join(", ") || "aucune"
  return x === null ? "null" : Array.isArray(x) ? "tableau" : typeof x
}

/** Les clés d'une entrée d'objet, puis celles de son `Item` ou de son `Offer` quand ce sont des objets. */
function clesEntree(x: unknown): string {
  let s = clesDe(x)
  for (const k of ["Item", "Offer"]) {
    const v = propre(x, k)
    if (estObjet(v)) s += ` ; ${k} : ${clesDe(v)}`
  }
  return s
}

/** Un objet de `Items[]` : `Item.ItemID`, `BasePrice`, `DiscountedPrice` ; null sans ItemID. */
function depuisItems(x: unknown): ObjetLu | null {
  const id = chaine(propre(propre(x, "Item"), "ItemID"))
  return id ? { id, cost: montant(propre(x, "BasePrice")), discounted: montant(propre(x, "DiscountedPrice")) } : null
}

/** Un objet de `ItemOffers[]` : `Offer.Rewards[0].ItemID`, première valeur de `Offer.Cost` et de `DiscountedCost` ; null sans ItemID. */
function depuisItemOffers(x: unknown): ObjetLu | null {
  const offre = propre(x, "Offer")
  const recompenses = propre(offre, "Rewards")
  const id = chaine(propre(Array.isArray(recompenses) ? recompenses[0] : undefined, "ItemID"))
  return id ? { id, cost: montant(propre(offre, "Cost")), discounted: montant(propre(x, "DiscountedCost")) } : null
}

/** Où se lisent les objets d'un bundle, dans l'ordre où on les essaie. */
const SOURCES_OBJETS: { champ: string; lire: (x: unknown) => ObjetLu | null }[] = [
  { champ: "Items", lire: depuisItems },
  { champ: "ItemOffers", lire: depuisItemOffers },
]

/** Les lignes d'un journal, chaque message une seule fois, suivi de « (N fois) » s'il revient. */
function regrouper(lignes: string[]): string[] {
  const vues = new Map<string, number>()
  for (const l of lignes) vues.set(l, (vues.get(l) ?? 0) + 1)
  return [...vues].map(([l, n]) => (n > 1 ? `${l} (${n} fois)` : l))
}

/**
 * Les objets d'un bundle de la réponse storefront (`b`, `FeaturedBundle.Bundle` ou un élément de `Bundles[]`), champs
 * présumés d'après les clients tiers (api-riot.md, CAP-25) : `Items[]` s'il en donne au moins un, sinon `ItemOffers[]` ;
 * ordre de la réponse, doublons passés, un objet sans ItemID passé ; rien de lisible : liste vide. `anomalies` : ce que
 * le journal doit en dire, clés vues comprises (objet ignoré ; aucun objet lisible, avec les clés du bundle), chaque
 * message une fois. Jamais d'erreur.
 */
export function lireObjetsBundle(b: unknown): ObjetsLus {
  const notes: string[] = []
  let objets: ObjetLu[] = []
  for (const { champ, lire } of SOURCES_OBJETS) {
    const entrees = propre(b, champ)
    if (!Array.isArray(entrees)) continue
    const lus: ObjetLu[] = []
    const vus = new Set<string>()
    for (const x of entrees) {
      const o = lire(x)
      if (!o) {
        notes.push(`objet de ${champ} sans ItemID ignoré (clés vues : ${clesEntree(x)})`)
        continue
      }
      if (vus.has(o.id)) continue
      vus.add(o.id)
      lus.push(o)
    }
    if (lus.length > 0) {
      objets = lus
      break
    }
  }
  if (objets.length === 0) notes.push(`aucun objet lisible (clés vues : ${clesDe(b)})`)
  return { objets, anomalies: regrouper(notes) }
}

/** Vrai si `id` est un niveau de skin du catalogue local (section `levels`, clé propre). */
export function estNiveau(levels: unknown, id: string): boolean {
  return estObjet(propre(levels, id))
}

/**
 * Type et libellé d'un objet d'un bundle (ObjetBundle) : un niveau du catalogue local est un `skin`, nommé par son
 * libellé ; sinon le type et le libellé de son entrée d'accessoire (`accessoire`, décrite ou gardée telle quelle) ;
 * sinon (aucun catalogue ne le connaît, ou type que le moteur ne décrit pas) `autre`. Libellé absent : l'uuid.
 */
export function decrireObjet(id: string, levels: unknown, accessoire: unknown): { kind: string; name: string } {
  const niveau = propre(levels, id)
  if (estObjet(niveau)) return { kind: "skin", name: chaine(propre(niveau, "name")) ?? id }
  const kind = propre(accessoire, "kind")
  return {
    kind: typeof kind === "string" && TYPES_ACCESSOIRE.includes(kind) ? kind : "autre",
    name: chaine(propre(accessoire, "name")) ?? id,
  }
}

/**
 * Grand visuel d'un accessoire pour sa fiche, tiré de l'objet `data` que rend valorant-api pour son type (la requête de
 * sa description) : carte `largeArt` ; spray `fullTransparentIcon`, sinon `fullIcon`, sinon `displayIcon` ;
 * porte-bonheur `displayIcon` ; titre null, la fiche montrant son texte ; tout autre type null.
 */
export function grandVisuel(kind: string, d: unknown): string | null {
  if (kind === "card") return chaine(propre(d, "largeArt"))
  if (kind === "spray") return chaine(propre(d, "fullTransparentIcon")) ?? chaine(propre(d, "fullIcon")) ?? chaine(propre(d, "displayIcon"))
  if (kind === "buddy") return chaine(propre(d, "displayIcon"))
  return null
}

/**
 * L'entrée de catalog.json d'un accessoire d'uuid `id`, d'après l'objet `data` de valorant-api du catalogue public qui l'a
 * reconnu (`kind`) : libellé `displayName`, sauf un titre, nommé par son texte (`titleText` rogné : « Fortune », et non
 * « Titre Fortune » ; api-riot.md) ; à défaut l'autre champ, puis l'uuid ; icône `displayIcon`, sinon `largeArt`, sinon
 * `fullRender` ; grand visuel (grandVisuel).
 */
export function decrireAccessoire(kind: string, id: string, d: unknown): EntreeAccessoire {
  const affiche = chaine(propre(d, "displayName"))
  const texte = rognee(propre(d, "titleText"))
  return {
    kind,
    name: (kind === "title" ? texte ?? affiche : affiche ?? texte) ?? id,
    icon: chaine(propre(d, "displayIcon")) ?? chaine(propre(d, "largeArt")) ?? chaine(propre(d, "fullRender")),
    image: grandVisuel(kind, d),
  }
}

/**
 * Vrai si `e` est une entrée d'accessoire complète : type et libellé en chaînes, icône et grand visuel en adresse ou null,
 * clés propres (un champ absent vaut undefined : `image` manque à une entrée d'avant CAP-25). Sinon (sans `image`, ou
 * abîmée), le moteur la redécrit à sa prochaine rencontre ; `image: null` (titre, carte sans `largeArt`) est une entrée
 * complète, jamais redécrite.
 */
export function entreeValide(e: unknown): e is EntreeAccessoire {
  if (!estObjet(e)) return false
  const icon = propre(e, "icon")
  const image = propre(e, "image")
  return typeof propre(e, "kind") === "string" && typeof propre(e, "name") === "string"
    && (icon === null || typeof icon === "string") && (image === null || typeof image === "string")
}

// ─────────────────────────── bundles et accessoires : les écrans ───────────────────────────

/** Objet d'un bundle dans shop.json (ObjetBundle, contrat-donnees.md). */
export type ObjetBundle = { id: string; kind: string; name: string; cost: number | null; discounted: number | null }

/** Objet d'un bundle tel que sa fiche le montre : celui de shop.json, et l'adresse de son image lue dans catalog.json. */
export type ObjetAffiche = ObjetBundle & { icon: string | null }

/** Libellé de chaque type d'objet, dans la liste et les fiches. */
const LIBELLES_TYPES: Record<string, string> = {
  skin: "Skin", spray: "Spray", card: "Carte de joueur", title: "Titre", buddy: "Porte-bonheur",
}

/** Libellé d'un type d'objet : « Skin », « Spray », « Carte de joueur », « Titre », « Porte-bonheur » ; « Autre » sinon. */
export function libelleType(kind: unknown): string {
  const l = propre(LIBELLES_TYPES, kind)
  return typeof l === "string" ? l : "Autre"
}

/** Un nombre fini, ou null. */
function nombre(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

/**
 * Les objets d'un bundle tels que sa fiche les montre : `items` du bundle de shop.json, lu sans confiance (entrée sans
 * uuid ou en double passée, type inconnu → « autre », libellé absent → l'uuid, prix non numérique → null), avec
 * l'adresse de l'image de chacun dans catalog.json (`levels[id].icon` pour un skin, `accessories[id].icon` sinon ; null
 * si absente). Null si `items` manque (shop.json d'avant CAP-25 : ses objets viendront à la prochaine lecture) ; toute
 * autre valeur qu'un tableau : aucun objet.
 */
export function objetsDuBundle(items: unknown, cat: unknown): ObjetAffiche[] | null {
  if (items === undefined) return null
  const levels = propre(cat, "levels")
  const accessories = propre(cat, "accessories")
  const objets: ObjetAffiche[] = []
  const vus = new Set<string>()
  for (const x of Array.isArray(items) ? items : []) {
    const id = chaine(propre(x, "id"))
    if (!id || vus.has(id)) continue
    vus.add(id)
    const k = propre(x, "kind")
    const kind = typeof k === "string" && (k === "skin" || TYPES_ACCESSOIRE.includes(k)) ? k : "autre"
    const source = propre(kind === "skin" ? levels : accessories, id)
    objets.push({
      id, kind,
      name: chaine(propre(x, "name")) ?? id,
      cost: nombre(propre(x, "cost")),
      discounted: nombre(propre(x, "discounted")),
      icon: chaine(propre(source, "icon")),
    })
  }
  return objets
}

/**
 * Ce que catalog.json dit d'un accessoire pour sa fiche : son icône et son grand visuel (adresses ; null si absents ou
 * abîmés) ; null s'il n'y a pas d'entrée.
 */
export function lireAccessoire(cat: unknown, id: string): { icon: string | null; image: string | null } | null {
  const e = propre(propre(cat, "accessories"), id)
  return estObjet(e) ? { icon: chaine(propre(e, "icon")), image: chaine(propre(e, "image")) } : null
}


export function jusquAu(iso: unknown): string {
  const d = new Date(typeof iso === "string" ? iso : NaN)
  if (Number.isNaN(d.getTime())) return "fin inconnue"
  const p = (n: number) => String(n).padStart(2, "0")
  return `jusqu'au ${p(d.getDate())}/${p(d.getMonth() + 1)}`
}
