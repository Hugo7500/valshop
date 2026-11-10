// Index SQLite des stats (entrée 8 de epic-stats-collecte ; spec, Assumptions, Stockage ; contrat-donnees.md, Index
// `stats.sqlite`) : avec Scripting Pro, `stats/<puuid>/stats.sqlite` est un index des fichiers JSON du compte, qui font foi,
// reconstructible depuis eux : ses parties (chacune avec le texte JSON de son fichier), leurs manches et leurs kills, sa
// table du RR. Module pur, sans import de `scripting` : collecte.ts lui donne la base (SQLite.open de l'hôte), les fichiers
// (listés et lus par stockage.ts) et le journal ; les tests, une base node:sqlite.
//
// Tenue (synchroniser), à la fin de Mettre à jour de l'app seulement, sous le marqueur de collecte : la table `etat` dit le
// schéma et le numéro de réduction de meta.json sous lesquels la base a été faite ; l'un des deux autre (ou une base neuve),
// toutes les tables sont refaites. Puis la base est rapprochée des fichiers, fichier par fichier (jamais sur la seule partie
// la plus récente : l'import ajoute des parties anciennes) : les lignes dont le fichier a disparu sont retirées, les fichiers
// absents de la base lus et ajoutés par lots, une transaction par lot (une partie, ses manches et ses kills ensemble) ; un
// fichier illisible n'y entre jamais. La table `rr` est refaite quand les lignes lues de rr.json changent (empreinte).
//
// Lecture (etapesDesParties), par lireDonnees de collecte.ts : la base, ouverte en lecture seule, ne sert que si son `etat`
// répond au schéma et au numéro de réduction du compte ; les parties se lisent par lots, dans l'ordre du listage des
// fichiers : la ligne d'un fichier, analysée et validée comme le fichier (partieLue), sinon le fichier lui-même. Une ligne
// absente, illisible ou une base en erreur ne changent donc rien aux données rendues : celles d'une lecture par les
// fichiers seuls. Une mise de côté de l'historique (entrée 17) récrit des parties aux mêmes chemins, sous un numéro de
// réduction qui peut rester le même : elle efface d'abord la base (numeroter de collecte.ts), refaite à la tenue suivante.
// Seul un fichier abîmé après son entrée dans la base y resterait lu tel qu'il était, jusqu'à la prochaine reconstruction.
// Jamais de base sans partie : la tenue ne la crée qu'avec une partie lisible (premiereLecture, chaque fichier lu une fois).
// Importé par collecte.ts seulement, que chargent l'app et, par import dynamique, la collecte de ↻ (qui n'ouvre jamais la
// base) ; ni stockage.ts ni le widget n'en dépendent : sans lui sur l'iPhone, l'app ne se charge plus et ↻ ne collecte plus
// (« ↻ : collecte non chargée » au journal), la boutique et le widget restant intacts.
import type { LigneRr } from "./historique"
import { partieLue } from "./parties"
import type { Partie } from "./reduction"

/** Version du schéma de la base : une autre version dans `etat` fait refaire toutes les tables. */
export const SCHEMA = 1

/** Une valeur passée à une requête : texte, nombre ou null (un booléen s'écrit 1 ou 0). */
export type Valeur = string | number | null
/** Une requête d'une transaction. */
export type Etape = { sql: string; args?: Valeur[] }
/** Une ligne rendue par une requête : ses colonnes par leur nom. */
export type Ligne = Record<string, unknown>
/** Ce que ValShop demande à une base SQLite (sous-ensemble de SQLite.Database de Scripting ; node:sqlite dans les tests). */
export type Base = {
  execute(sql: string, args?: Valeur[]): Promise<void>
  /** Toutes les requêtes ou aucune. */
  transaction(etapes: Etape[]): Promise<void>
  fetchAll(sql: string, args?: Valeur[]): Promise<Ligne[]>
}

/** Un fichier de partie du compte : son chemin relatif à `parties/` (`<AAAA-MM>/<matchId>.json`), et sa lecture. */
export type FichierPartie = { relatif: string; lire: () => Partie | null }

// ─────────────────────────── lecture d'une partie ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function objet(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

/** Une partie depuis son texte JSON (colonne `json` de la base), selon la règle des fichiers (partieLue de parties.ts) ; null s'il ne s'analyse pas ou n'a pas la forme d'une partie. */
export function partieDuJson(texte: unknown): Partie | null {
  if (typeof texte !== "string") return null
  try {
    return partieLue(JSON.parse(texte))
  } catch {
    return null
  }
}

// ─────────────────────────── schéma ───────────────────────────

const CREER_ETAT = "CREATE TABLE IF NOT EXISTS etat (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL)"

const COLONNES_PARTIE = [
  "fichier", "matchId", "debut", "provenance", "reduction", "file", "carte", "saison", "agent", "resultat", "place", "joueurs",
  "manchesGagnees", "manchesPerdues", "abandon", "groupe", "rang", "note", "mention", "score", "kills", "morts", "assists",
  "degatsInfliges", "degatsRecus", "tete", "corps", "jambes", "json",
]
const COLONNES_MANCHE = [
  "fichier", "position", "matchId", "numero", "cote", "gagnee", "issue", "achat", "equipement", "arme", "kills", "degatsInfliges",
  "survie", "kast", "premierKill", "premiereMort", "clutch", "clutchGagne", "multiKill",
]
const COLONNES_KILL = [
  "fichier", "position", "matchId", "manche", "sens", "adverse", "arme", "armeType", "momentManche", "premierDuel", "apresPose",
  "distance",
]
const COLONNES_RR = [
  "position", "matchId", "last_change", "rr", "tier", "rr_before_update", "tier_before_update", "rr_performance_bonus",
  "afk_penalty", "rr_penalty", "refunded_rr", "was_derank_protected", "is_placement_match", "date",
]

/** Les tables de l'index et leurs index secondaires (contrat-donnees.md, Index `stats.sqlite`), dans l'ordre de création. */
const TABLES = [
  "CREATE TABLE parties (fichier TEXT PRIMARY KEY, matchId TEXT NOT NULL, debut TEXT NOT NULL, provenance TEXT, reduction INTEGER, "
    + "file TEXT, carte TEXT, saison TEXT, agent TEXT, resultat TEXT, place INTEGER, joueurs INTEGER, manchesGagnees INTEGER, "
    + "manchesPerdues INTEGER, abandon INTEGER, groupe INTEGER, rang INTEGER, note REAL, mention TEXT, score INTEGER, kills INTEGER, "
    + "morts INTEGER, assists INTEGER, degatsInfliges INTEGER, degatsRecus INTEGER, tete INTEGER, corps INTEGER, jambes INTEGER, "
    + "json TEXT NOT NULL)",
  "CREATE TABLE manches (fichier TEXT NOT NULL, position INTEGER NOT NULL, matchId TEXT NOT NULL, numero INTEGER, cote TEXT, "
    + "gagnee INTEGER, issue TEXT, achat TEXT, equipement INTEGER, arme TEXT, kills INTEGER, degatsInfliges INTEGER, survie INTEGER, "
    + "kast INTEGER, premierKill TEXT, premiereMort TEXT, clutch INTEGER, clutchGagne INTEGER, multiKill INTEGER, "
    + "PRIMARY KEY (fichier, position))",
  "CREATE TABLE kills (fichier TEXT NOT NULL, position INTEGER NOT NULL, matchId TEXT NOT NULL, manche INTEGER, sens TEXT, "
    + "adverse INTEGER, arme TEXT, armeType TEXT, momentManche INTEGER, premierDuel INTEGER, apresPose INTEGER, distance REAL, "
    + "PRIMARY KEY (fichier, position))",
  "CREATE TABLE rr (position INTEGER PRIMARY KEY, matchId TEXT NOT NULL, last_change INTEGER, rr INTEGER, tier INTEGER, "
    + "rr_before_update INTEGER, tier_before_update INTEGER, rr_performance_bonus INTEGER, afk_penalty INTEGER, rr_penalty INTEGER, "
    + "refunded_rr INTEGER, was_derank_protected INTEGER, is_placement_match INTEGER, date TEXT)",
  "CREATE INDEX parties_debut ON parties (debut)",
  "CREATE INDEX parties_file ON parties (file, debut)",
  "CREATE INDEX parties_match ON parties (matchId)",
  "CREATE INDEX manches_match ON manches (matchId)",
  "CREATE INDEX kills_match ON kills (matchId)",
  "CREATE INDEX kills_arme ON kills (arme)",
  "CREATE INDEX rr_match ON rr (matchId)",
]

const insertion = (table: string, colonnes: readonly string[], ouRemplacer = false) =>
  `INSERT${ouRemplacer ? " OR REPLACE" : ""} INTO ${table} (${colonnes.join(", ")}) VALUES (${colonnes.map(() => "?").join(", ")})`
const INSERER_PARTIE = insertion("parties", COLONNES_PARTIE, true)
const INSERER_MANCHE = insertion("manches", COLONNES_MANCHE)
const INSERER_KILL = insertion("kills", COLONNES_KILL)
const INSERER_RR = insertion("rr", COLONNES_RR)
/** Les requêtes qui retirent une partie de la base (ses kills, ses manches, puis elle), chacune sur son fichier. */
const RETRAIT = ["DELETE FROM kills WHERE fichier = ?", "DELETE FROM manches WHERE fichier = ?", "DELETE FROM parties WHERE fichier = ?"]

/** Le numéro de réduction de meta.json tel que la base le garde : son nombre, ou « aucun ». */
export function cleReduction(reduction: number | null): string {
  return reduction === null ? "aucun" : String(reduction)
}

/** La remise à neuf, en une transaction : toutes les tables refaites vides, `etat` réduit au schéma et au numéro de réduction. */
function etapesRemise(reduction: number | null): Etape[] {
  return [
    ...["parties", "manches", "kills", "rr"].map((t) => ({ sql: `DROP TABLE IF EXISTS ${t}` })),
    ...TABLES.map((sql) => ({ sql })),
    { sql: "DELETE FROM etat" },
    { sql: "INSERT INTO etat (cle, valeur) VALUES ('schema', ?)", args: [String(SCHEMA)] },
    { sql: "INSERT INTO etat (cle, valeur) VALUES ('reduction', ?)", args: [cleReduction(reduction)] },
  ]
}

// ─────────────────────────── lignes d'une partie ───────────────────────────

const texte = (x: unknown): string | null => (typeof x === "string" ? x : null)
const nombre = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null)
const booleen = (x: unknown): number | null => (x === true ? 1 : x === false ? 0 : null)
const champ = (x: unknown, cle: string): unknown => objet(x)?.[cle]

/**
 * Les requêtes qui mettent une partie dans la base, sous son fichier (`relatif`) : ses manches et ses kills laissés là
 * retirés, puis la partie (texte JSON entier, celui de son fichier pour une partie lue d'un fichier compact), chaque manche et
 * chaque kill, à sa place dans sa liste. Les colonnes se lisent avec tolérance : une valeur absente ou d'un autre type vaut
 * null ; une manche ou un kill qui n'est pas un objet n'a pas de ligne.
 */
export function lignesDePartie(relatif: string, partie: Partie): Etape[] {
  const p = partie as unknown as Record<string, unknown>
  const t = objet(p.totaux)
  const etapes: Etape[] = [
    { sql: RETRAIT[0], args: [relatif] },
    { sql: RETRAIT[1], args: [relatif] },
    {
      sql: INSERER_PARTIE,
      args: [
        relatif, partie.matchId, partie.debut, texte(p.provenance), nombre(p.reduction), texte(p.file), texte(champ(p.carte, "id")),
        texte(champ(p.saison, "short")), texte(champ(p.agent, "id")), texte(p.resultat), nombre(p.place), nombre(p.joueurs),
        nombre(p.manchesGagnees), nombre(p.manchesPerdues), booleen(p.abandon), nombre(p.groupe), nombre(champ(p.rang, "id")),
        nombre(p.note), texte(p.mention), nombre(t?.score), nombre(t?.kills), nombre(t?.morts), nombre(t?.assists),
        nombre(t?.degatsInfliges), nombre(t?.degatsRecus), nombre(t?.tete), nombre(t?.corps), nombre(t?.jambes), JSON.stringify(partie),
      ],
    },
  ]
  const manches = Array.isArray(p.manches) ? p.manches : []
  manches.forEach((x: unknown, i: number) => {
    const m = objet(x)
    if (!m) return
    etapes.push({
      sql: INSERER_MANCHE,
      args: [
        relatif, i, partie.matchId, nombre(m.numero), texte(m.cote), booleen(m.gagnee), texte(m.issue), texte(m.achat),
        nombre(m.equipement), texte(champ(m.arme, "id")), nombre(m.kills), nombre(m.degatsInfliges), booleen(m.survie),
        booleen(m.kast), texte(m.premierKill), texte(m.premiereMort), nombre(champ(m.clutch, "adversaires")),
        booleen(champ(m.clutch, "gagne")), nombre(m.multiKill),
      ],
    })
  })
  const kills = Array.isArray(p.kills) ? p.kills : []
  kills.forEach((x: unknown, i: number) => {
    const k = objet(x)
    if (!k) return
    etapes.push({
      sql: INSERER_KILL,
      args: [
        relatif, i, partie.matchId, nombre(k.manche), texte(k.sens), booleen(k.adverse), texte(champ(k.arme, "id")),
        texte(champ(k.arme, "type")), nombre(k.momentManche), booleen(k.premierDuel), booleen(k.apresPose), nombre(k.distance),
      ],
    })
  })
  return etapes
}

// ─────────────────────────── RR ───────────────────────────

/**
 * Les lignes de rr.json que lit l'onglet Stats (lireDonnees) et que reflète la table `rr` : les objets à `matchId` non
 * vide, dans l'ordre du fichier, tels qu'écrits.
 */
export function lignesRrLues(lignes: readonly unknown[]): LigneRr[] {
  return lignes.filter((l) => {
    const o = objet(l)
    return o !== null && typeof o.matchId === "string" && o.matchId !== ""
  }) as LigneRr[]
}

/** L'empreinte des lignes du RR (nombre, longueur et FNV-1a de leur JSON) : une autre empreinte fait refaire la table `rr`. */
export function empreinteRr(lignes: readonly unknown[]): string {
  const t = JSON.stringify(lignes)
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${lignes.length}:${t.length}:${h.toString(16)}`
}

function argsRr(position: number, ligne: LigneRr): Valeur[] {
  const l = ligne as unknown as Record<string, unknown>
  return [
    position, String(l.matchId), nombre(l.last_change), nombre(l.rr), nombre(champ(l.tier, "id")), nombre(l.rr_before_update),
    nombre(champ(l.tier_before_update, "id")), nombre(l.rr_performance_bonus), nombre(l.afk_penalty), nombre(l.rr_penalty),
    nombre(l.refunded_rr), booleen(l.was_derank_protected), booleen(l.is_placement_match), texte(l.date),
  ]
}

// ─────────────────────────── tenue ───────────────────────────

/** Parties lues puis écrites par transaction pendant la tenue. */
export const LOT_TENUE = 25
/** Parties retirées par transaction pendant la tenue. */
export const LOT_RETRAIT = 100

/**
 * Sans base, avant de la créer : les fichiers lus dans l'ordre jusqu'à la première partie lisible (`lisible` ; aucune, ou des
 * fichiers tous illisibles : faux, et la tenue ne crée pas de base). Rend aussi les fichiers à donner à la tenue : chaque
 * lecture faite ici y est rendue telle quelle, une fois, puis oubliée ; chaque fichier n'est donc lu qu'une fois en tout.
 */
export function premiereLecture(fichiers: readonly FichierPartie[]): { lisible: boolean; fichiers: FichierPartie[] } {
  const lues = new Map<number, Partie | null>()
  let lisible = false
  for (let i = 0; i < fichiers.length && !lisible; i++) {
    const p = fichiers[i].lire()
    lues.set(i, p)
    lisible = p !== null
  }
  return {
    lisible,
    fichiers: fichiers.map((f, i) => ({
      relatif: f.relatif,
      lire: () => {
        if (!lues.has(i)) return f.lire()
        const p = lues.get(i) ?? null
        lues.delete(i)
        return p
      },
    })),
  }
}

/** Ce que la tenue reçoit : les fichiers de parties du compte (ordre du listage), les lignes de rr.json, le numéro de réduction de meta.json. */
export type EntreeIndex = { fichiers: readonly FichierPartie[]; rr: readonly unknown[]; reduction: number | null }

/**
 * Ce qu'a fait la tenue. `avant` : la base trouvée `absente` (neuve, rien dans `etat`), `valide` (même schéma, même numéro
 * de réduction : rapprochée), ou `changee` (refaite) ; `ajoutees`, `retirees` : parties mises dans la base et retirées ;
 * `illisibles` : fichiers passés ; `parties`, `manches`, `kills` : ce que la base tient ensuite ; `rr` : lignes écrites si la
 * table `rr` a été refaite, sinon null.
 */
export type BilanIndex = {
  avant: "absente" | "valide" | "changee"
  ajoutees: number
  retirees: number
  illisibles: number
  parties: number
  manches: number
  kills: number
  rr: number | null
}

/** La table `etat` : chaque clé et sa valeur. Lève si elle n'existe pas. */
async function lireEtat(base: Base): Promise<Map<string, string>> {
  const etat = new Map<string, string>()
  for (const l of await base.fetchAll("SELECT cle, valeur FROM etat")) {
    if (typeof l.cle === "string" && typeof l.valeur === "string") etat.set(l.cle, l.valeur)
  }
  return etat
}

/** Le nombre d'une colonne de comptage (COUNT rend un entier ; un grand entier peut venir en bigint). */
function entier(x: unknown): number {
  return typeof x === "number" ? x : typeof x === "bigint" ? Number(x) : 0
}

/**
 * Rapproche la base des fichiers (en-tête du module) : `etat` créée au besoin, tables refaites si la base est neuve ou
 * changée, lignes en trop retirées, fichiers manquants ajoutés par lots de LOT_TENUE, table `rr` refaite si son empreinte
 * change ; `entreLots` est appelé après chaque lot (le marqueur de collecte rafraîchi). Lève à la première erreur de la base :
 * chaque lot écrit reste (une partie, ses manches et ses kills toujours ensemble), la tenue suivante reprend.
 */
export async function synchroniser(base: Base, e: EntreeIndex, entreLots: () => void = () => {}): Promise<BilanIndex> {
  await base.execute(CREER_ETAT)
  const etat = await lireEtat(base)
  const avant: BilanIndex["avant"] = !etat.has("schema")
    ? "absente"
    : etat.get("schema") === String(SCHEMA) && etat.get("reduction") === cleReduction(e.reduction) ? "valide" : "changee"
  if (avant !== "valide") {
    await base.transaction(etapesRemise(e.reduction))
    etat.clear()
  }

  const presents = new Set<string>()
  for (const l of await base.fetchAll("SELECT fichier FROM parties")) if (typeof l.fichier === "string") presents.add(l.fichier)
  const listes = new Set(e.fichiers.map((f) => f.relatif))
  const enTrop = [...presents].filter((f) => !listes.has(f))
  for (let i = 0; i < enTrop.length; i += LOT_RETRAIT) {
    await base.transaction(enTrop.slice(i, i + LOT_RETRAIT).flatMap((f) => RETRAIT.map((sql) => ({ sql, args: [f] }))))
    entreLots()
  }

  // Un même chemin listé deux fois (jamais : un listage n'a pas de doublon) n'entre qu'une fois.
  const vus = new Set<string>()
  const manquants = e.fichiers.filter((f) => !presents.has(f.relatif) && !vus.has(f.relatif) && vus.add(f.relatif))
  let ajoutees = 0, illisibles = 0
  for (let i = 0; i < manquants.length; i += LOT_TENUE) {
    const etapes: Etape[] = []
    let lot = 0
    for (const f of manquants.slice(i, i + LOT_TENUE)) {
      const p = f.lire()
      if (p) {
        for (const x of lignesDePartie(f.relatif, p)) etapes.push(x)
        lot++
      } else illisibles++
    }
    if (etapes.length > 0) await base.transaction(etapes)
    ajoutees += lot
    entreLots()
  }

  const lignes = lignesRrLues(e.rr)
  const empreinte = empreinteRr(lignes)
  let rr: number | null = null
  if (etat.get("rr") !== empreinte) {
    await base.transaction([
      { sql: "DELETE FROM rr" },
      ...lignes.map((l, i) => ({ sql: INSERER_RR, args: argsRr(i, l) })),
      { sql: "INSERT OR REPLACE INTO etat (cle, valeur) VALUES ('rr', ?)", args: [empreinte] },
    ])
    rr = lignes.length
  }

  const [c] = await base.fetchAll(
    "SELECT (SELECT COUNT(*) FROM parties) AS parties, (SELECT COUNT(*) FROM manches) AS manches, (SELECT COUNT(*) FROM kills) AS kills",
  )
  return {
    avant, ajoutees, retirees: enTrop.length, illisibles,
    parties: entier(c?.parties), manches: entier(c?.manches), kills: entier(c?.kills), rr,
  }
}

// ─────────────────────────── lecture ───────────────────────────

/** Parties lues de la base par requête, à la lecture. */
export const LOT_LECTURE = 100

/** La base répond-elle au schéma et au numéro de réduction du compte ? Faux aussi si elle ne se lit pas (`etat` absente comprise). */
export async function indexValide(base: Base, reduction: number | null): Promise<boolean> {
  try {
    const etat = await lireEtat(base)
    return etat.get("schema") === String(SCHEMA) && etat.get("reduction") === cleReduction(reduction)
  } catch {
    return false
  }
}

/** Le texte JSON de chaque partie de la base parmi ces fichiers, par fichier. Lève si la base ne se lit pas. */
export async function lignesDuLot(base: Base, relatifs: readonly string[]): Promise<Map<string, string>> {
  const lot = new Map<string, string>()
  if (relatifs.length === 0) return lot
  const lignes = await base.fetchAll(`SELECT fichier, json FROM parties WHERE fichier IN (${relatifs.map(() => "?").join(", ")})`, [...relatifs])
  for (const l of lignes) if (typeof l.fichier === "string" && typeof l.json === "string") lot.set(l.fichier, l.json)
  return lot
}

/** Une partie à lire : celle de sa ligne dans le lot, si elle y est et se lit en partie ; sinon celle de son fichier. */
export function partieIndexee(lot: ReadonlyMap<string, string> | null, relatif: string, lireFichier: () => Partie | null): Partie | null {
  const t = lot ? lot.get(relatif) : undefined
  if (t !== undefined) {
    const p = partieDuJson(t)
    if (p) return p
  }
  return lireFichier()
}

/** Une étape de la lecture des données : une partie (synchrone), ou une requête à la base (promesse). */
export type EtapeLecture = () => void | Promise<void>

/**
 * Les étapes de la lecture des parties du compte, dans l'ordre des fichiers ; `garder` reçoit chaque partie, ou null pour un
 * fichier illisible. Sans base : une étape par fichier, sa lecture. Avec base : d'abord la validité de la base, puis, par
 * tranche de LOT_LECTURE fichiers, une requête (le texte des parties de la tranche) et une étape par fichier
 * (partieIndexee) ; une base qui ne répond pas au compte ou qui lève : la suite par les fichiers.
 */
export function etapesDesParties(
  base: Base | null, reduction: number | null, fichiers: readonly FichierPartie[], garder: (p: Partie | null) => void,
): EtapeLecture[] {
  if (!base) return fichiers.map((f) => () => garder(f.lire()))
  let valide = false
  let lot: Map<string, string> | null = null
  const etapes: EtapeLecture[] = [async () => {
    valide = await indexValide(base, reduction)
  }]
  for (let i = 0; i < fichiers.length; i += LOT_LECTURE) {
    const tranche = fichiers.slice(i, i + LOT_LECTURE)
    etapes.push(async () => {
      lot = null
      if (!valide) return
      try {
        lot = await lignesDuLot(base, tranche.map((f) => f.relatif))
      } catch {
        valide = false
      }
    })
    for (const f of tranche) etapes.push(() => garder(partieIndexee(lot, f.relatif, f.lire)))
  }
  return etapes
}
