// Solde du compte (entrée 17 de epic-boutique-visuels) : la part pure. Le portefeuille de Riot
// (`GET https://pd.{shard}.a.pvp.net/store/v1/wallet/{puuid}`, api-riot.md) répond `{ "Balances": { "<uuid de devise>": <entier> } }` :
// route non officielle, jamais vue dans une réponse lue par ValShop avant ce ticket, lue ici strictement.
//   - Trois devises seulement, dans l'ordre du jeu : Points VALORANT (VP), Points de Radianite (RP), Crédits Kingdom (KC).
//   - Donnée exacte ou absente : un montant n'est gardé que si c'est un entier positif ou nul, sous la devise reconnue ; toute
//     autre valeur (absente, négative, décimale, texte, hors des entiers sûrs, devise dite deux fois) vaut null, jamais zéro.
//   - solde.json (contrat-donnees.md) : l'heure de la lecture, la boutique sous laquelle le solde a été lu (son `updatedAt`) et
//     les trois montants. L'écran ne montre le solde que sous cette boutique-là : celui d'une autre boutique, donc d'un autre
//     jour ou d'un autre compte, ne s'affiche jamais, même si son effacement a raté.
//   - Aucun montant ne va au journal : seulement le nom des devises lues ou manquantes.
// Module pur : aucun import de « scripting », aucune lecture de fichier ; il tourne sous `node --test`.

import { DEVISE_KC, DEVISE_VP } from "./prix-retenus"

/** Devise des Points de Radianite (valorant-api, /v1/currencies). */
export const DEVISE_RADIANITE = "e59aa87c-4cbf-517a-5983-6e81511be9b7"

/** Une devise du solde, par son champ de solde.json. */
export type CleDevise = "vp" | "rp" | "kc"

/** Les montants du solde ; null : pas lu pour cette devise (absente de la réponse, ou valeur inattendue). */
export type Soldes = { vp: number | null; rp: number | null; kc: number | null }

/**
 * Les trois devises, dans l'ordre de l'affichage (celui du jeu) : `sigle`, écrit après le montant ; `nom`, dans le journal ;
 * `voix`, lu par VoiceOver, au singulier (0 et 1) puis au pluriel.
 */
const DEVISES: readonly { cle: CleDevise; id: string; sigle: string; nom: string; voix: readonly [string, string] }[] = [
  { cle: "vp", id: DEVISE_VP, sigle: "VP", nom: "VP", voix: ["VP", "VP"] },
  { cle: "rp", id: DEVISE_RADIANITE, sigle: "RP", nom: "Radianite", voix: ["point de Radianite", "points de Radianite"] },
  { cle: "kc", id: DEVISE_KC, sigle: "KC", nom: "KC", voix: ["Crédit Kingdom", "Crédits Kingdom"] },
]

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

/** Un montant de solde : un entier sûr, positif ou nul ; sinon null. */
function montant(x: unknown): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x + 0 : null
}

/** Horodatage ISO 8601 → millisecondes depuis l'epoch ; null s'il est absent ou invalide. */
function instant(iso: unknown): number | null {
  if (typeof iso !== "string") return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

// ─────────────────────────── réponse de Riot ───────────────────────────

/** Ce qu'une réponse du portefeuille donne : les montants, et le nom des devises lues et manquantes (pour le journal). */
export type SoldesLus = { soldes: Soldes; lues: string[]; manquantes: string[] }

/** Un nom de champ sans chiffre (jamais un montant ni un identifiant), pour le journal. */
const NOM_DE_CHAMP = /^[A-Za-z_]{1,40}$/

/** Les noms des champs d'un objet pour le journal : huit au plus, les autres comptés ; jamais une valeur, jamais un nom à chiffres. */
function champs(x: Record<string, unknown>): string {
  const noms = Object.keys(x)
  const dits = noms.filter((n) => NOM_DE_CHAMP.test(n)).slice(0, 8)
  const autres = noms.length - dits.length
  if (noms.length === 0) return "aucun champ"
  return [dits.length > 0 ? `champs vus : ${dits.join(", ")}` : "", autres > 0 ? `${autres} ${autres > 1 ? "autres champs" : "autre champ"}` : ""]
    .filter((t) => t !== "").join(" ; ")
}

/**
 * La réponse du portefeuille, lue strictement : un objet dont `Balances` est un objet ; pour chacune des trois devises, sa
 * valeur si elle y est une seule fois (identifiant comparé sans égard à la casse) et que c'est un entier positif ou nul,
 * sinon null. `refus` : ce qui empêche de la lire (pour le journal, sans aucune valeur) : corps qui n'est pas un objet,
 * `Balances` absent ou d'une autre nature, aucune des trois devises lisible.
 */
export function lireSoldes(corps: unknown): SoldesLus | { refus: string } {
  if (!estObjet(corps)) return { refus: "réponse inattendue (pas un objet)" }
  if (!Object.prototype.hasOwnProperty.call(corps, "Balances")) return { refus: `réponse inattendue (Balances absent ; ${champs(corps)})` }
  const balances = corps.Balances
  if (!estObjet(balances)) return { refus: "réponse inattendue (Balances n'est pas un objet)" }
  const soldes: Soldes = { vp: null, rp: null, kc: null }
  const vues = new Set<CleDevise>()
  const doubles = new Set<CleDevise>()
  for (const [cle, valeur] of Object.entries(balances)) {
    const devise = DEVISES.find((d) => d.id === cle.toLowerCase())
    if (devise === undefined) continue
    if (vues.has(devise.cle)) doubles.add(devise.cle)
    vues.add(devise.cle)
    soldes[devise.cle] = montant(valeur)
  }
  // Une devise dite deux fois (deux casses du même identifiant) : laquelle croire ? Aucune.
  for (const cle of doubles) soldes[cle] = null
  const lues = DEVISES.filter((d) => soldes[d.cle] !== null).map((d) => d.nom)
  const manquantes = DEVISES.filter((d) => soldes[d.cle] === null).map((d) => d.nom)
  if (lues.length === 0) {
    const n = Object.keys(balances).length
    return { refus: `aucune devise lisible (${n} ${n > 1 ? "devises" : "devise"} dans la réponse)` }
  }
  return { soldes, lues, manquantes }
}

/** La ligne du journal d'un solde lu : le nom des devises lues, et de celles qui manquent ; jamais un montant. */
export function ligneJournalSolde(lus: SoldesLus): string {
  return `Solde lu (${lus.lues.join(", ")}${lus.manquantes.length > 0 ? ` ; absente ou inattendue : ${lus.manquantes.join(", ")}` : ""}).`
}

// ─────────────────────────── solde.json ───────────────────────────

/** Le solde gardé : `luA`, l'heure de sa lecture ; `boutique`, l'`updatedAt` de la boutique sous laquelle il a été lu. */
export type SoldeGarde = { luA: string; boutique: string; soldes: Soldes }

/** Contenu de solde.json (contrat-donnees.md) : `{ "luA", "boutique", "vp", "rp", "kc" }`, un montant ou null par devise. */
export function contenuSolde(soldes: Soldes, luA: string, boutique: string): string {
  return JSON.stringify({ luA, boutique, vp: soldes.vp, rp: soldes.rp, kc: soldes.kc }, null, 2)
}

/**
 * Le solde gardé d'après le texte de solde.json, lu strictement ; null s'il manque, ne se lit pas, n'a pas d'heure valide,
 * pas de boutique, un montant d'une autre forme qu'un entier positif ou nul (ou null), ou aucun montant.
 */
export function lireSolde(texte: string | null | undefined): SoldeGarde | null {
  if (!texte) return null
  let lu: unknown
  try {
    lu = JSON.parse(texte)
  } catch {
    return null
  }
  if (!estObjet(lu)) return null
  const { luA, boutique } = lu
  if (typeof luA !== "string" || instant(luA) === null) return null
  if (typeof boutique !== "string" || boutique === "") return null
  const soldes: Soldes = { vp: null, rp: null, kc: null }
  for (const d of DEVISES) {
    if (!Object.prototype.hasOwnProperty.call(lu, d.cle)) return null
    const brut = lu[d.cle]
    if (brut === null) continue
    const m = montant(brut)
    if (m === null) return null
    soldes[d.cle] = m
  }
  if (DEVISES.every((d) => soldes[d.cle] === null)) return null
  return { luA, boutique, soldes }
}

// ─────────────────────────── relecture du seul solde ───────────────────────────

/** Délai minimal entre deux soldes demandés à Riot hors d'une lecture de la boutique (bouton « Lire la boutique », boutique déjà à jour). */
export const DELAI_SOLDE_MS = 10 * 60_000

/**
 * L'issue d'une relecture du seul solde : relu ; trop tôt (`possible`, ms depuis l'epoch : quand elle sera permise), sans
 * aucune requête ; non relu (`reseau` : Riot n'a pas répondu du tout).
 */
export type IssueSolde =
  | { genre: "relu" }
  | { genre: "trop-tot"; possible: number }
  | { genre: "non-relu"; reseau: boolean }

/**
 * Peut-on redemander le seul solde à `now` ? Non tant que le dernier solde lu (`luA` de solde.json) ou le dernier essai de
 * cette exécution (`essai`, ms depuis l'epoch) a moins de DELAI_SOLDE_MS : `possible` dit quand. Une heure illisible, absente
 * ou dans l'avenir (horloge changée) ne retient rien.
 */
export function deciderSolde(now: number, luA: unknown, essai: number | null): { lire: true } | { lire: false; possible: number } {
  let possible: number | null = null
  for (const t of [instant(luA), essai]) {
    if (t === null || !Number.isFinite(t) || t > now || now - t >= DELAI_SOLDE_MS) continue
    possible = Math.max(possible ?? 0, t + DELAI_SOLDE_MS)
  }
  return possible === null ? { lire: true } : { lire: false, possible }
}

// ─────────────────────────── ligne « Solde » ───────────────────────────

/** Espace fine insécable : séparateur des milliers (EXPERIENCE.md, Formats). */
const FINE = "\u202f"
/** Espace insécable : avant une unité, et avant le « · » qui sépare deux montants (la ligne ne se coupe qu'après lui). */
const NBSP = "\u00a0"
/** Au-delà de cet écart avec la lecture de la boutique, le solde dit sa propre heure. */
const ECART_DATE_MS = 60_000





export type LigneSolde = { texte: string; date: string | null; voix: string }


function jourEtHeure(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * La ligne du solde gardé sous la boutique affichée (`boutiqueLueA`, son `updatedAt`), ou null : rien à montrer. Seul un
 * solde lu sous cette boutique-là se montre ; les devises sans montant sont omises, dans l'ordre VP, Radianite, KC. Milliers
 * en espace fine insécable, espace insécable avant l'unité et avant « · » : la ligne, trop longue pour l'écran, se coupe après
 * un « · », jamais dans un montant. Datée quand le solde a été lu une minute ou plus avant ou après la boutique (relecture
 * du seul solde), ou quand l'heure de la boutique ne se lit pas.
 */
export function ligneSolde(garde: SoldeGarde | null, boutiqueLueA: unknown): LigneSolde | null {
  if (garde === null || typeof boutiqueLueA !== "string" || garde.boutique !== boutiqueLueA) return null
  const dites = DEVISES.filter((d) => garde.soldes[d.cle] !== null)
  if (dites.length === 0) return null
  const lu = instant(garde.luA)
  if (lu === null) return null
  const boutique = instant(boutiqueLueA)
  const date = boutique === null || Math.abs(lu - boutique) >= ECART_DATE_MS ? `lu le ${jourEtHeure(lu)}` : null
  const texte = dites
    .map((d) => `${String(garde.soldes[d.cle]).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)}${NBSP}${d.sigle}`)
    .join(`${NBSP}· `)
  const voix = "Solde : " + dites
    .map((d) => { const n = garde.soldes[d.cle] as number; return `${n} ${d.voix[n < 2 ? 0 : 1]}` })
    .join(", ") + (date !== null ? `, ${date}` : "")
  return { texte, date, voix }
}
