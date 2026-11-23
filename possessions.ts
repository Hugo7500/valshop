











// ─────────────────────────── outils ───────────────────────────

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuid(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x) ? x.toLowerCase() : null
}
function instant(x: unknown): number | null {
  if (typeof x !== "string" || x === "") return null
  const t = Date.parse(x)
  return Number.isFinite(t) ? t : null
}

// ─────────────────────────── collection ───────────────────────────

/** Les genres lus, par l'ItemTypeID de Riot (valapidocs, « Owned Items »). */
export const TYPES_COLLECTION = {
  skins: "e7c63390-eda7-46e0-bb7a-a6abdacd2433",
  variantes: "3ad1b2b2-acdb-4524-852f-954a76ddae0a",
  porteBonheur: "dd3bf334-87f3-40bd-b043-682a57a8dc3a",
  tags: "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475",
  cartes: "3f296c07-64c3-494c-923b-fe692a4fa1bd",
  titres: "de7caa6b-adf7-4588-bbd1-143831e786c6",
} as const
export type GenreCollection = keyof typeof TYPES_COLLECTION
export const GENRES_COLLECTION = Object.keys(TYPES_COLLECTION) as GenreCollection[]

/** Au plus tant d'objets par genre : au-delà, la réponse est jugée fausse. */
const BORNE_OBJETS = 20_000

/**
 * Les ItemID d'une réponse de Riot pour le genre `type` : `{ ItemTypeID, Entitlements: [{ ItemID }] }`, ou la forme groupée
 * `{ EntitlementsByTypes: [ … ] }` (on n'y prend que le bon genre). Tout ItemID doit être un UUID ; une réponse d'une autre
 * forme, d'un autre genre ou trop grande : `refus`, rien n'est gardé.
 */
export function lireEntitlements(brut: unknown, type: string): { ids: string[] } | { refus: string } {
  if (!estObjet(brut)) return { refus: "réponse illisible" }
  let bloc: unknown = null
  if (Array.isArray(brut.EntitlementsByTypes)) {
    bloc = brut.EntitlementsByTypes.find((b) => estObjet(b) && typeof b.ItemTypeID === "string" && b.ItemTypeID.toLowerCase() === type) ?? null
    if (bloc === null) return { ids: [] }
  } else bloc = brut
  if (!estObjet(bloc)) return { refus: "réponse illisible" }
  if (typeof bloc.ItemTypeID === "string" && bloc.ItemTypeID.toLowerCase() !== type) return { refus: "autre genre d'objet" }
  const liste = bloc.Entitlements
  if (liste === null || liste === undefined) return { ids: [] }
  if (!Array.isArray(liste)) return { refus: "réponse illisible" }
  if (liste.length > BORNE_OBJETS) return { refus: "réponse trop grande" }
  const vus = new Set<string>()
  for (const e of liste) {
    const id = estObjet(e) ? uuid(e.ItemID) : null
    if (id === null) return { refus: "objet illisible" }
    vus.add(id)
  }
  return { ids: [...vus].sort() }
}

/** collection.json lue : le compte (son PUUID, jamais affiché ni journalisé), l'heure de la lecture, les genres lus. */
export type Collection = { compte: string; lueA: string; genres: Partial<Record<GenreCollection, string[]>> }

/** Le contenu de collection.json. */
export function contenuCollection(c: Collection): string {
  return JSON.stringify({ v: 1, compte: c.compte, lueA: c.lueA, genres: c.genres })
}

/** collection.json relue strictement ; illisible, d'une autre version ou d'une autre forme : null (comme absente). */
export function lireCollection(contenu: string | null | undefined): Collection | null {
  if (typeof contenu !== "string" || contenu === "") return null
  let x: unknown
  try { x = JSON.parse(contenu) } catch { return null }
  if (!estObjet(x) || x.v !== 1 || typeof x.compte !== "string" || x.compte === "" || instant(x.lueA) === null || !estObjet(x.genres)) return null
  const genres: Partial<Record<GenreCollection, string[]>> = {}
  for (const g of GENRES_COLLECTION) {
    const l = x.genres[g]
    if (l === undefined) continue
    if (!Array.isArray(l) || l.length > BORNE_OBJETS) return null
    const ids: string[] = []
    for (const i of l) {
      const u = uuid(i)
      if (u === null) return null
      ids.push(u)
    }
    genres[g] = ids
  }
  return { compte: x.compte, lueA: x.lueA as string, genres }
}

/**
 * Ce que l'écran sait de la collection du compte `compte` : pour chaque genre lu, l'ensemble de ses objets ; une collection
 * d'un autre compte (changement de compte, lecture pas encore refaite) : null, rien n'est dit.
 */
export type Possedes = { lueA: string; genres: Partial<Record<GenreCollection, Set<string>>> }
export function possedes(c: Collection | null, compte: string | null): Possedes | null {
  if (c === null || compte === null || c.compte !== compte) return null
  const genres: Partial<Record<GenreCollection, Set<string>>> = {}
  for (const g of GENRES_COLLECTION) {
    const l = c.genres[g]
    if (l !== undefined) genres[g] = new Set(l)
  }
  return { lueA: c.lueA, genres }
}

/** Les niveaux du skin d'un niveau `niveau` dans catalog.json (`levels[n].skin`, puis `skins[s].levels`) ; inconnu : le niveau seul. */
export function niveauxDuSkin(cat: unknown, niveau: string): string[] {
  const levels = estObjet(cat) ? cat.levels : null
  const skins = estObjet(cat) ? cat.skins : null
  const n = estObjet(levels) ? levels[niveau] : null
  const s = estObjet(n) && typeof n.skin === "string" && estObjet(skins) ? skins[n.skin] : null
  const l = estObjet(s) && Array.isArray(s.levels) ? s.levels.filter((x): x is string => typeof x === "string") : []
  return l.includes(niveau) ? l : [niveau, ...l]
}

/**
 * Le skin d'un niveau est-il à toi ? `true` : un de ses niveaux est dans la collection ; `null` : on ne sait pas (pas de
 * collection de ce compte, ou genre « skins » pas lu). Jamais `false` dit à l'écran comme un fait : il n'en fait rien.
 */
export function skinPossede(p: Possedes | null, niveaux: readonly string[]): boolean | null {
  const s = p?.genres.skins
  if (!s) return null
  return niveaux.some((n) => s.has(n.toLowerCase()))
}

/** Le genre de la collection d'un accessoire de la boutique, par son `kind` (shop.json) ; inconnu : null. */
export function genreAccessoire(kind: unknown): GenreCollection | null {
  return kind === "buddy" ? "porteBonheur" : kind === "spray" ? "tags" : kind === "card" ? "cartes" : kind === "title" ? "titres" : null
}
export function accessoirePossede(p: Possedes | null, kind: unknown, id: string): boolean | null {
  const g = genreAccessoire(kind)
  const s = g !== null ? p?.genres[g] : undefined
  if (!s) return null
  return s.has(id.toLowerCase())
}

/** Les mots de l'écran. */
export const DEJA_A_TOI = "À toi"
export const VOIX_DEJA_A_TOI = "déjà dans ta collection"
export const TITRE_COLLECTION = "Ma collection"

/** La ligne de la ligne de journal d'une collection lue : le nombre d'objets par genre, jamais un id ni le PUUID. */
export function ligneJournalCollection(genres: Partial<Record<GenreCollection, string[]>>, refus: readonly GenreCollection[]): string {
  const lus = GENRES_COLLECTION.filter((g) => genres[g] !== undefined).map((g) => `${g} ${genres[g]!.length}`)
  return `Collection lue (${lus.join(", ") || "aucun genre"}${refus.length > 0 ? ` ; non lus : ${refus.join(", ")}` : ""}).`
}

// ─────────────────────────── historique de la boutique ───────────────────────────

/** Au plus tant de jours gardés par compte (deux ans) : les plus anciens partent d'abord. */
export const JOURS_GARDES = 730
/** Au plus tant de comptes : le moins récemment lu part d'abord. */
const COMPTES_GARDES = 8

/** Deux resets à moins d'une heure l'un de l'autre sont ceux d'une même boutique du jour (les resets sont à 24 h d'écart). */
const MEME_RESET_MS = 3_600_000

/** Un jour lu : l'heure de son reset (fin de la boutique), et ses offres (niveaux de skin). */
export type JourLu = { reset: string; offres: string[] }
export type HistoriqueBoutique = { comptes: Record<string, JourLu[]> }

/** historique-boutique.json relu ; illisible ou d'une autre forme : vide (rien n'est inventé, l'écran ne dit rien). */
export function lireHistoriqueBoutique(contenu: string | null | undefined): HistoriqueBoutique {
  const vide: HistoriqueBoutique = { comptes: {} }
  if (typeof contenu !== "string" || contenu === "") return vide
  let x: unknown
  try { x = JSON.parse(contenu) } catch { return vide }
  if (!estObjet(x) || x.v !== 1 || !estObjet(x.comptes)) return vide
  const comptes: Record<string, JourLu[]> = {}
  for (const [c, jours] of Object.entries(x.comptes)) {
    if (c === "" || !Array.isArray(jours)) continue
    const l: JourLu[] = []
    for (const j of jours) {
      if (!estObjet(j) || instant(j.reset) === null || !Array.isArray(j.offres)) continue
      const offres = j.offres.map(uuid).filter((u): u is string => u !== null)
      l.push({ reset: j.reset as string, offres })
    }
    comptes[c] = l
  }
  return { comptes }
}

export function contenuHistoriqueBoutique(h: HistoriqueBoutique): string {
  return JSON.stringify({ v: 1, comptes: h.comptes })
}

/**
 * La boutique du jour lue ajoutée pour `compte` : un jour déjà gardé (même reset) est remplacé, jamais doublé ; les jours
 * rangés du plus ancien au plus récent, JOURS_GARDES au plus. Reset illisible ou aucune offre lisible : rien ne change.
 */
export function ajouterJour(h: HistoriqueBoutique, compte: string, reset: unknown, offres: readonly unknown[]): HistoriqueBoutique {
  const t = instant(reset)
  const ids = [...new Set(offres.map(uuid).filter((u): u is string => u !== null))]
  if (t === null || ids.length === 0 || compte === "") return h
  const cle = new Date(t).toISOString()
  // Le même jour à quelques secondes près : Riot dit le temps restant en secondes entières, et l'heure de la lecture, à laquelle
  // il s'ajoute, a ses millisecondes ; deux lectures d'une même boutique ne donnent donc pas le même reset à la milliseconde.
  const jours = (h.comptes[compte] ?? []).filter((j) => {
    const r = instant(j.reset)
    return r === null || Math.abs(r - t) >= MEME_RESET_MS
  })
  jours.push({ reset: cle, offres: ids })
  jours.sort((a, b) => (instant(a.reset) ?? 0) - (instant(b.reset) ?? 0))
  const comptes: Record<string, JourLu[]> = { ...h.comptes, [compte]: jours.slice(-JOURS_GARDES) }
  const ordre = Object.keys(comptes).sort((a, b) => dernier(comptes[b]) - dernier(comptes[a]))
  const gardes: Record<string, JourLu[]> = {}
  for (const c of ordre.slice(0, COMPTES_GARDES)) gardes[c] = comptes[c]
  return { comptes: gardes }
}
function dernier(jours: readonly JourLu[]): number {
  return jours.length > 0 ? instant(jours[jours.length - 1].reset) ?? 0 : 0
}

const JOUR_MS = 86_400_000

/** Ce que l'historique dit d'un skin : boutiques lues, jours où il y était, la première lue, la dernière où il était. */
export type Apparitions = { lues: number; fois: number; premiere: number; derniere: number | null }

/**
 * Les apparitions des niveaux `niveaux` (un skin) dans les boutiques lues de `compte`. Un jour compte une fois, même si deux
 * niveaux du skin y étaient. `premiere` et `derniere` : le début de la journée de boutique (reset moins 24 h). Rien de lu : null.
 */
export function apparitions(h: HistoriqueBoutique, compte: string | null, niveaux: readonly string[]): Apparitions | null {
  const jours = compte !== null ? h.comptes[compte] : undefined
  if (!jours || jours.length === 0) return null
  const ns = new Set(niveaux.map((n) => n.toLowerCase()))
  let fois = 0, derniere: number | null = null
  for (const j of jours) {
    if (j.offres.some((o) => ns.has(o))) {
      fois++
      derniere = (instant(j.reset) ?? 0) - JOUR_MS
    }
  }
  return { lues: jours.length, fois, premiere: (instant(jours[0].reset) ?? 0) - JOUR_MS, derniere }
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

export function dateCourte(t: number, maintenant: number): string {
  const d = new Date(t), m = new Date(maintenant)
  const p = (x: Date) => {
    const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(x)
    const v = (k: string) => Number(parts.find((q) => q.type === k)?.value)
    return { j: v("day"), mo: v("month"), a: v("year") }
  }
  const a = p(d), b = p(m)
  return `${a.j === 1 ? "1er" : a.j} ${MOIS[a.mo - 1]}${a.a !== b.a ? ` ${a.a}` : ""}`
}


export function ilYa(t: number, maintenant: number): string {
  const n = Math.max(0, Math.floor((maintenant - t) / JOUR_MS))
  return n === 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} jours`
}







export function phraseApparitions(a: Apparitions | null, maintenant: number): string | null {
  if (a === null || a.lues === 0) return null
  const ou = a.lues === 1
    ? `dans ta seule boutique lue, celle du ${dateCourte(a.premiere, maintenant)}`
    : `dans tes ${a.lues} boutiques lues depuis le ${dateCourte(a.premiere, maintenant)}`
  if (a.fois === 0) return `Jamais vu ${ou}.`
  const fois = a.fois === 1 ? "Vu une fois" : `Vu ${a.fois} fois`
  return a.lues === 1 ? `${fois} ${ou}.` : `${fois} ${ou}, la dernière ${ilYa(a.derniere ?? a.premiere, maintenant)}.`
}
