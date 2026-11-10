// Parties de HenrikDev (entrée 4) : lecture défensive d'une page de la liste v4, ton Riot ID
// tiré de ton entrée de `players[]`, attente avant une page (espacement et quota), échéance
// d'une collecte lancée par ↻ (entrée 6 : attente admise, délai d'une requête borné), rôles des
// agents tirés de `/v1/agents` de valorant-api (section `agents` de catalog.json), somme des
// cumuls par agent d'une semaine, chemins suspects d'un fichier à écrire, noms sûrs des fichiers
// (matchId, mois UTC du début, semaine), repère d'une partie brute (matchId et début, pour la
// reprise et la frontière de l'entrée 5) et textes d'avancée de la Ligne d'état.
// Entrée 3 de epic-stats-import : les règles de l'import de l'historique tracker.gg (contrat-donnees.md,
// Fichier d'import) : le fichier lu en entier validé avant toute écriture, refus et leur raison,
// jonction par matchId avec l'historique, règle des semaines de cumuls, plan d'écriture ordonné et
// état de l'import ; ici parce qu'elles reposent sur les chemins suspects, les noms des fichiers et
// la forme des semaines, et qu'un module pur n'importe que des types. La procédure qui lit, écrit
// et tient le marqueur reste celle de l'entrée 4.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni horloge,
// seulement des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).
// Réduire une partie reste le travail de reduction.ts ; garder les fichiers, celui de
// stockage.ts ; les requêtes et l'enchaînement, celui de collecte.ts.

import type { Meta, Quota, Repere, RiotId } from "./historique"
import type { CumulAgent, Partie, Roles } from "./reduction"

// ─────────────────────────── aides de lecture (recopiées de historique.ts) ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Un UUID quelque part dans une chaîne (sans drapeau `g` : `test` reste sans état). */
const UUID_DEDANS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Espace fine insécable, séparateur des milliers (EXPERIENCE.md, Formats). */
const FINE = " "


function enClair(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)
}

// ─────────────────────────── page de la liste v4 ───────────────────────────

/** Parties demandées par page (`size`, 10 au plus) ; `start` avance d'autant (pagination par position). */
export const TAILLE_PAGE = 10

/**
 * Les parties brutes d'une page de la liste v4 (`{ status, data: [...] }`), dans l'ordre de la
 * réponse (la plus récente d'abord), sans rien en retirer : la réduction juge chacune. `data`
 * vide ou null : page vide, `[]`. null si la réponse n'a pas cette forme (réponse inattendue).
 */
export function partiesDeLaPage(reponse: unknown): unknown[] | null {
  if (!estObjet(reponse)) return null
  if (reponse.data === null) return []
  return Array.isArray(reponse.data) ? reponse.data : null
}

/**
 * Ton Riot ID d'après ton entrée de `players[]` (ton PUUID, casse ignorée) : `{ name, tag }`,
 * deux chaînes non vides ; null s'il n'y est pas. Gardé dans meta.json seulement, jamais au
 * journal ni dans un fichier de partie.
 */
export function riotIdDe(brute: unknown, puuid: string): RiotId | null {
  if (!estObjet(brute) || !Array.isArray(brute.players)) return null
  const moi = String(puuid).toLowerCase()
  const p = brute.players.find((j: unknown) => estObjet(j) && typeof j.puuid === "string" && j.puuid.toLowerCase() === moi)
  return estObjet(p) && typeof p.name === "string" && p.name !== "" && typeof p.tag === "string" && p.tag !== ""
    ? { name: p.name, tag: p.tag }
    : null
}

// ─────────────────────────── noms des fichiers ───────────────────────────

/** Où ranger une partie : `parties/<mois>/<matchId>.json`, matchId en minuscules. */
export type Place = { matchId: string; mois: string }

/** Mois UTC `AAAA-MM` d'une date ISO 8601 ; null si elle ne se lit pas. */
export function moisDe(iso: unknown): string | null {
  if (typeof iso !== "string") return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  const annee = d.getUTCFullYear()
  return annee < 1000 || annee > 9999 ? null : `${annee}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * La place d'une partie d'après son matchId et son début : un UUID (seule forme admise dans un
 * nom de fichier), mis en minuscules, et le mois UTC du début ; null sinon : aucun nom sûr.
 */
export function placeDe(matchId: unknown, debut: unknown): Place | null {
  const mois = moisDe(debut)
  return typeof matchId === "string" && UUID.test(matchId) && mois !== null ? { matchId: matchId.toLowerCase(), mois } : null
}

/** La place d'une partie brute de la liste v4 (`metadata.match_id`, `metadata.started_at`), avant toute réduction : est-elle déjà gardée ? */
export function placeBrute(brute: unknown): Place | null {
  return estObjet(brute) && estObjet(brute.metadata) ? placeDe(brute.metadata.match_id, brute.metadata.started_at) : null
}

/** Ticket 4.54 : les files à achat, seules dont la dépense de Riot par manche (HenrikDev v2) se lit à la collecte. */
export const FILES_A_ACHAT: readonly string[] = ["competitive", "unrated", "swiftplay", "premier"]

/** Ticket 4.54 : une partie brute de la liste v4 d'une file à achat (`metadata.queue.id`), avant toute réduction. */
export function fileAAchat(brute: unknown): boolean {
  const q = estObjet(brute) && estObjet(brute.metadata) && estObjet(brute.metadata.queue) ? brute.metadata.queue.id : undefined
  return typeof q === "string" && FILES_A_ACHAT.includes(q)
}

/**
 * Ticket 4.54 : une partie brute abandonnée (une manche `Surrendered`) : sa dépense ne se prouve pas (reduction.ts, pochesDeLaPartie),
 * sa dépense de Riot ne se demande pas.
 */
export function abandonneeBrute(brute: unknown): boolean {
  return estObjet(brute) && Array.isArray(brute.rounds) && brute.rounds.some((r: unknown) => estObjet(r) && r.result === "Surrendered")
}

/**
 * Ticket 4.54 : le quota après une requête de la dépense de Riot sans en-têtes de quota lus : celui d'avant, moins 2 unités (une
 * requête de HenrikDev coûte 1, plus 1 par requête qu'il doit envoyer à Riot : api-henrikdev.md, Limites) ; inconnu, il le reste.
 */
export function quotaApresEchec(q: Quota): Quota {
  return { ...q, restant: q.restant === null ? null : Math.max(0, q.restant - 2) }
}

/**
 * Le repère d'une partie brute de la liste v4, avant toute réduction : son matchId (UUID, mis en
 * minuscules) et son début (`metadata.started_at` réécrit en ISO 8601, jamais le texte reçu),
 * lisibles comme pour sa place ; null sinon. Ancre d'un repère de reprise, frontière, ou cible
 * d'une collecte (reprise.ts) ; son matchId jamais au journal.
 */
export function repereBrut(brute: unknown): Repere | null {
  if (!estObjet(brute) || !estObjet(brute.metadata)) return null
  const debut = brute.metadata.started_at
  const place = placeDe(brute.metadata.match_id, debut)
  return place && typeof debut === "string" ? { matchId: place.matchId, debut: new Date(Date.parse(debut)).toISOString() } : null
}


export function estSemaine(x: unknown): x is string {
  return typeof x === "string" && /^\d{4}-W\d{2}$/.test(x)
}

// ─────────────────────────── rythme des pages ───────────────────────────

/** Au moins 6 s entre deux requêtes à HenrikDev, de départ à départ. */
export const ESPACEMENT_MS = 6_000
/** Une page peut coûter jusqu'à 12 unités (api-henrikdev.md, Limites) : sous ce reste, on attend la remise à zéro. */
export const QUOTA_PAGE = 12
/** Attente sans `x-ratelimit-reset` lisible. */
export const ATTENTE_SANS_RESET_MS = 60_000
/** Au-delà de 10 min, un `x-ratelimit-reset` est déraisonnable (une date en secondes depuis 1970, par exemple) : on ne l'attend pas, la collecte s'arrête. */
export const RESET_MAX_S = 600

/** La dernière requête à HenrikDev : son départ et sa réponse (ms), et le quota que disaient ses en-têtes. */
export type Precedente = { depart: number; reponse: number; quota: Quota }

/**
 * Millisecondes à attendre avant de demander une page ; 0 : rien à attendre. Toujours 6 s
 * depuis le départ de la requête précédente ; et, si son `x-ratelimit-remaining` manque ou est
 * sous 12, jusqu'à `x-ratelimit-reset` + 1 s après sa réponse, 60 s sans cet en-tête. null :
 * ce `x-ratelimit-reset` dépasse 600 s, déraisonnable : aucune page, la collecte s'arrête
 * (comptée comme une limite).
 */
export function attenteAvantPage(p: Precedente, now: number): number | null {
  let jusqua = p.depart + ESPACEMENT_MS
  if (p.quota.restant === null || p.quota.restant < QUOTA_PAGE) {
    const reset = p.quota.reset
    if (reset !== null && reset > RESET_MAX_S) return null
    jusqua = Math.max(jusqua, p.reponse + (reset === null ? ATTENTE_SANS_RESET_MS : (reset + 1) * 1000))
  }
  return Math.max(0, jusqua - now)
}

/**
 * Ticket 4.54 : le détail v2 d'une partie (la dépense de Riot par manche) coûte 1 unité, 2 si HenrikDev doit la demander à Riot
 * (api-henrikdev.md, Limites) : il part sans attendre tant que le quota lu en garde au moins 2 ; sous 2, après la remise à zéro (+ 1 s).
 */
export const QUOTA_DETAIL = 2

/**
 * Ticket 4.54 : millisecondes à attendre avant le détail v2 d'une partie ; 0 : rien à attendre. `x-ratelimit-remaining` de la dernière
 * réponse lu et sous 2 : jusqu'à `x-ratelimit-reset` + 1 s après elle (60 s sans cet en-tête) ; sinon rien (un quota inconnu ne fait
 * pas attendre : HenrikDev donne ses en-têtes à chaque réponse ; un 429 arrête la collecte comme une limite, la partie relue ensuite).
 * null : ce `x-ratelimit-reset` dépasse 600 s, comme pour une page. La page suivante attend ses 6 s depuis la page d'avant
 * (attenteAvantPage), et la remise à zéro depuis ce détail si le quota qu'il dit est sous 12.
 */
export function attenteAvantDetail(p: Precedente, now: number): number | null {
  if (p.quota.restant === null || p.quota.restant >= QUOTA_DETAIL) return 0
  const reset = p.quota.reset
  if (reset !== null && reset > RESET_MAX_S) return null
  return Math.max(0, p.reponse + (reset === null ? ATTENTE_SANS_RESET_MS : (reset + 1) * 1000) - now)
}

// ─────────────────────────── échéance de ↻ (entrée 6) ───────────────────────────

/**
 * Échéance d'une collecte lancée par ↻ (AppIntent RefreshShop) : 25 s après le début de l'AppIntent, qu'iOS laisse
 * tourner une trentaine de secondes, sans prolongement dans Scripting (research-valshop-architecture-ios) ; les 5 s
 * qui restent finissent la page en cours. Mettre à jour dans l'app n'a pas d'échéance (null partout ici).
 */
export const ECHEANCE_MS = 25_000
/** Une attente avant une page ne commence que s'il restera au moins 5 s avant l'échéance après elle, pour sa requête. */
export const RESTE_APRES_ATTENTE_MS = 5_000
/**
 * À moins de 1 s de l'échéance, elle est atteinte : aucune requête ne part plus. Une requête que l'échéance borne voit
 * son délai, arrondi à la seconde au-dessous, expirer dans cette dernière seconde : coupée là, elle s'est arrêtée sur
 * l'échéance, pas sur une panne.
 */
export const MARGE_ECHEANCE_MS = 1_000

/** L'échéance d'une collecte de ↻ dont l'AppIntent a commencé à `debut` (ms depuis l'epoch) : 25 s plus tard. */
export function echeanceDe(debut: number): number {
  return debut + ECHEANCE_MS
}

/** L'échéance est-elle atteinte à `now` : passée, ou à moins de 1 s ? Sans échéance (null), jamais. */
export function echeanceAtteinte(now: number, echeance: number | null): boolean {
  return echeance !== null && echeance - now < MARGE_ECHEANCE_MS
}

/**
 * Une attente de `attente` ms avant une page, commencée à `now`, est-elle admise ? Oui s'il restera au moins 5 s avant
 * l'échéance après elle, une attente nulle comprise (sa requête a ses 5 s) ; non : la collecte s'arrête avant elle.
 * Sans échéance (null), toujours.
 */
export function attenteAdmise(attente: number, now: number, echeance: number | null): boolean {
  return echeance === null || now + attente + RESTE_APRES_ATTENTE_MS <= echeance
}

/**
 * Le délai d'une requête, en secondes comme le `timeout` de `fetch`, borné par l'échéance : `delai`, ou les secondes
 * entières qui restent avant l'échéance si elles sont moins nombreuses ; null : échéance atteinte, la requête ne part
 * pas. Sans échéance (null), `delai` tel quel.
 */
export function delaiBorne(delai: number, now: number, echeance: number | null): number | null {
  if (echeance === null) return delai
  if (echeanceAtteinte(now, echeance)) return null
  return Math.min(delai, Math.floor((echeance - now) / 1000))
}

// ─────────────────────────── rôles des agents ───────────────────────────

/** Section `agents` de catalog.json : `{ "<uuid d'agent>": { "role": "<displayName anglais du rôle>" } }`. */
export type SectionAgents = Record<string, { role: string }>

/**
 * La section `agents` tirée d'une réponse de `/v1/agents?isPlayableCharacter=true` de
 * valorant-api (`{ data: [{ uuid, isPlayableCharacter, role: { displayName } }] }`) : UUID en
 * minuscules → `{ role }`, le `displayName` anglais du rôle (Controller, Duelist, Initiator,
 * Sentinel). Un agent sans UUID, sans rôle ou non jouable est passé. null si la réponse n'a pas
 * cette forme ou ne donne aucun rôle : rôles indisponibles.
 */
export function agentsDeValorantApi(reponse: unknown): SectionAgents | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data)) return null
  const agents: SectionAgents = {}
  for (const a of reponse.data) {
    if (!estObjet(a) || a.isPlayableCharacter === false || typeof a.uuid !== "string" || !UUID.test(a.uuid)) continue
    const role = estObjet(a.role) && typeof a.role.displayName === "string" && a.role.displayName !== "" ? a.role.displayName : null
    if (role !== null) agents[a.uuid.toLowerCase()] = { role }
  }
  return Object.keys(agents).length > 0 ? agents : null
}

/**
 * La table des rôles que prend reduirePartie (id d'agent → rôle), d'après la section `agents`
 * de catalog.json ; une entrée sans rôle est passée. null si la section manque, n'a pas sa
 * forme ou ne donne aucun rôle : il faut relire valorant-api.
 */
export function rolesDeSection(section: unknown): Roles | null {
  if (!estObjet(section)) return null
  const roles: Record<string, string> = {}
  for (const [id, a] of Object.entries(section)) {
    if (estObjet(a) && typeof a.role === "string" && a.role !== "") roles[id] = a.role
  }
  return Object.keys(roles).length > 0 ? roles : null
}

// ─────────────────────────── cumuls d'une semaine ───────────────────────────

/**
 * `stats/<puuid>/cumuls/<semaine>.json` : les matchId des parties dont les cumuls sont comptés
 * (`comptees`, une fois chacune), et une entrée par file et agent, sommes et effectifs de ces
 * parties (`cumulsAgents`, sans identifiant de partie).
 */
export type Semaine = { comptees: string[]; cumulsAgents: CumulAgent[] }

/** Le contenu d'un fichier de semaine, déjà lu en JSON ; null s'il n'a pas cette forme (le fichier n'est alors jamais écrasé). */
export function semaineLue(valeur: unknown): Semaine | null {
  if (!estObjet(valeur) || !Array.isArray(valeur.comptees) || !Array.isArray(valeur.cumulsAgents)) return null
  if (!valeur.comptees.every((m: unknown) => typeof m === "string")) return null
  if (!valeur.cumulsAgents.every((c: unknown) => estObjet(c) && typeof c.file === "string" && typeof c.agent === "string")) return null
  return { comptees: valeur.comptees, cumulsAgents: valeur.cumulsAgents }
}

/**
 * Une partie gardée, déjà lue en JSON (son fichier, ou sa ligne de l'index stats.sqlite : entrée 2.8 de epic-stats-collecte) :
 * un objet avec son `matchId` et un `debut` qui se lit ; null sinon. Seule règle des deux lectures (stockage.ts, base.ts).
 */
export function partieLue(valeur: unknown): Partie | null {
  if (!estObjet(valeur)) return null
  return typeof valeur.matchId === "string" && typeof valeur.debut === "string" && !Number.isNaN(Date.parse(valeur.debut)) ? (valeur as Partie) : null
}

/**
 * Somme champ par champ de deux cumuls : nombres additionnés, sous-objets aussi ; une valeur
 * absente ou null laisse l'autre telle quelle (chaque sous-objet porte ses propres effectifs) ;
 * toute autre valeur (semaine, file, agent) est celle de `a`. Rend un nouvel objet.
 */
function sommer(a: unknown, b: unknown): unknown {
  if (a === null || a === undefined) return copie(b)
  if (b === null || b === undefined) return copie(a)
  if (typeof a === "number" && typeof b === "number") return a + b
  if (estObjet(a) && estObjet(b)) {
    const r: Record<string, unknown> = {}
    for (const cle of new Set([...Object.keys(a), ...Object.keys(b)])) r[cle] = sommer(a[cle], b[cle])
    return r
  }
  return copie(a)
}

function copie<T>(x: T): T {
  return x === undefined ? x : JSON.parse(JSON.stringify(x))
}

/**
 * Ajoute les cumuls d'une partie à sa semaine, une seule fois par matchId : déjà dans
 * `comptees`, rien ne change (`ajoute` faux). Sinon le matchId rejoint `comptees` et chaque
 * cumul s'additionne à l'entrée de même file et même agent, ou s'y ajoute ; entrées triées par
 * file puis agent. Rend une nouvelle semaine ; celle reçue reste intacte.
 */
export function ajouterCumuls(semaine: Semaine, matchId: string, cumuls: readonly CumulAgent[]): { semaine: Semaine; ajoute: boolean } {
  const id = matchId.toLowerCase()
  if (semaine.comptees.some((m) => m.toLowerCase() === id)) return { semaine, ajoute: false }
  const parCle = new Map<string, CumulAgent>()
  const cle = (c: CumulAgent) => `${c.file}\u0000${c.agent}`
  for (const c of semaine.cumulsAgents) parCle.set(cle(c), copie(c))
  for (const c of cumuls) {
    const avant = parCle.get(cle(c))
    parCle.set(cle(c), (avant ? sommer(avant, c) : copie(c)) as CumulAgent)
  }
  const cumulsAgents = [...parCle.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0))
  return { semaine: { comptees: [...semaine.comptees, id], cumulsAgents }, ajoute: true }
}

// ─────────────────────────── chemins suspects ───────────────────────────

/** Clés dont la valeur peut être un UUID entier. */
const CLES_UUID = new Set(["matchId", "id", "agent"])

/**
 * Chemins JSON (`$.carte.name`, `$.cumulsAgents[3].agent`…, écrits comme par `fuites`) de ce
 * qui ne doit jamais aller dans un fichier de partie ou de cumuls : une chaîne ou une clé qui
 * contient « # » ou « joueur- » ; un UUID ailleurs qu'en valeur entière de `matchId`, `id` ou
 * `agent`, ou d'un élément de `comptees`. Une clé suspecte ne s'écrit jamais : seul son rang
 * figure (`{clé 2}`). Vide : rien de suspect. Jamais une valeur dans le résultat.
 */
export function cheminsSuspects(valeur: unknown): string[] {
  const chemins: string[] = []
  const marquee = (s: string) => s.includes("#") || s.includes("joueur-")
  const parcourir = (x: unknown, chemin: string, cle: string | null, dansComptees: boolean) => {
    if (typeof x === "string") {
      const uuidPermis = UUID.test(x) && (dansComptees || (cle !== null && CLES_UUID.has(cle)))
      if (marquee(x) || (UUID_DEDANS.test(x) && !uuidPermis)) chemins.push(chemin)
    } else if (Array.isArray(x)) {
      x.forEach((e, i) => parcourir(e, `${chemin}[${i}]`, null, cle === "comptees"))
    } else if (estObjet(x)) {
      Object.keys(x).forEach((k, i) => {
        if (marquee(k) || UUID_DEDANS.test(k)) {
          chemins.push(`${chemin}{clé ${i}}`)
          parcourir(x[k], `${chemin}{clé ${i}}`, null, false)
        } else parcourir(x[k], `${chemin}.${k}`, k, false)
      })
    }
  }
  parcourir(valeur, "$", null, false)
  return chemins
}

// ─────────────────────────── textes ───────────────────────────


export function texteAvancee(lues: number): string {
  return `${enClair(lues)} ${lues > 1 ? "parties lues" : "partie lue"}`
}

// ─────────────────────────── import de l'historique tracker.gg (entrée 3 de epic-stats-import) ───────────────────────────

/** Numéro du format du fichier d'import (contrat-donnees.md, Fichier d'import). */
export const FORMAT_IMPORT = 1







export const PARTIES_AVANT_JONCTION = 90

/** Une semaine du fichier : son nom (semaine ISO du début, heure de Paris), puis le contenu d'un fichier `cumuls/<semaine>.json`. */
export type SemaineImport = { semaine: string } & Semaine

/** `valshop-import.json` validé (validerFichier) : au moins une partie, donc une période. */
export type FichierImport = {
  format: 1
  source: "tracker.gg"
  /** PUUID du compte : celui du compte connecté. */
  puuid: string
  genereLe: string
  /** Jours (heure de Paris) de la première et de la dernière partie. */
  periode: { debut: string; fin: string }
  parties: Partie[]
  semaines: SemaineImport[]
}

/**
 * Pourquoi l'import est refusé : historique sans numéro de réduction, première collecte inachevée, fichier d'un autre
 * compte, fichier refusé (forme, partie, chemins suspects, semaines), fichier qui n'atteint pas l'historique.
 */
export type RaisonRefus = "sansNumero" | "premiereInachevee" | "autreCompte" | "fichierRefuse" | "nAtteintPas"

/** Un refus : sa raison, et un détail pour le journal, en nombres seulement (jamais un identifiant, une valeur ni un chemin). */
export type Refus = { raison: RaisonRefus; detail: string }

/** Un refus prêt à rendre. */
function refusDe(raison: RaisonRefus, detail: string): { ok: false; refus: Refus } {
  return { ok: false, refus: { raison, detail } }
}

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/
const HEURE_MS = 3_600_000
const JOUR_MS = 86_400_000


function semaineUtc(t: number): string {
  const d = new Date(t)
  const jour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const jeudi = jour + (3 - ((new Date(jour).getUTCDay() + 6) % 7)) * JOUR_MS
  const annee = new Date(jeudi).getUTCFullYear()
  const n = 1 + Math.floor((jeudi - Date.UTC(annee, 0, 1)) / (7 * JOUR_MS))
  return `${annee}-W${String(n).padStart(2, "0")}`
}

/**
 * Les semaines ISO où peut tomber une partie commencée à `t`, vue d'un fuseau de UTC−12 à UTC+14 : la conversion range
 * à l'heure de Paris, mais ce module ne suppose aucun fuseau ; 26 heures ne franchissent qu'un lundi au plus.
 */
function semainesPossibles(t: number): string[] {
  return [semaineUtc(t - 12 * HEURE_MS), semaineUtc(t + 14 * HEURE_MS)]
}

/** Du plus récent au plus ancien (`debut`), puis par matchId : l'ordre de la jonction et du plan. */
function ordreRecent(a: Partie, b: Partie): number {
  const x = a.matchId.toLowerCase(), y = b.matchId.toLowerCase()
  return Date.parse(b.debut) - Date.parse(a.debut) || (x < y ? -1 : x > y ? 1 : 0)
}

/** Ce qu'il faut de l'historique pour importer : son numéro de réduction, puis la première collecte terminée ; sinon le refus. */
export function refusHistorique(meta: Meta): Refus | null {
  if (meta.reduction === null) return { raison: "sansNumero", detail: "historique sans numéro de réduction" }
  if (meta.premiereCollecte.terminee === null) return { raison: "premiereInachevee", detail: "première collecte inachevée" }
  return null
}

/** Le fichier validé, ou son refus. */
export type Validation = { ok: true; fichier: FichierImport } | { ok: false; refus: Refus }














export function validerFichier(valeur: unknown, puuid: string, reduction: number): Validation {
  if (!estObjet(valeur)) return refusDe("fichierRefuse", "fichier qui n'est pas un objet JSON")
  if (valeur.format !== FORMAT_IMPORT) return refusDe("fichierRefuse", "format inconnu")
  if (valeur.source !== "tracker.gg") return refusDe("fichierRefuse", "source autre que tracker.gg")
  const { parties, semaines, periode } = valeur
  if (!Array.isArray(parties) || parties.length === 0) return refusDe("fichierRefuse", "aucune partie")
  if (!Array.isArray(semaines)) return refusDe("fichierRefuse", "semaines absentes")
  if (typeof valeur.genereLe !== "string" || Number.isNaN(Date.parse(valeur.genereLe))) return refusDe("fichierRefuse", "date de génération illisible")
  const jour = (x: unknown) => typeof x === "string" && JOUR_ISO.test(x)
  if (!estObjet(periode) || !jour(periode.debut) || !jour(periode.fin) || periode.debut > periode.fin) return refusDe("fichierRefuse", "période illisible")
  if (typeof valeur.puuid !== "string" || !UUID.test(valeur.puuid)) return refusDe("fichierRefuse", "PUUID illisible")
  if (valeur.puuid.toLowerCase() !== String(puuid).toLowerCase()) return refusDe("autreCompte", "fichier d'un autre compte que le compte connecté")

  const n = parties.length
  const debuts = new Map<string, number>()
  for (const [i, p] of parties.entries()) {
    const laquelle = `partie ${i + 1} sur ${n}`
    const place = estObjet(p) ? placeDe(p.matchId, p.debut) : null
    if (!place) return refusDe("fichierRefuse", `${laquelle} illisible`)
    if (p.provenance !== "tracker.gg") return refusDe("fichierRefuse", `${laquelle} d'une autre provenance que tracker.gg`)
    if (p.reduction !== reduction) return refusDe("fichierRefuse", `${laquelle} d'un autre numéro de réduction que l'historique`)
    if (debuts.has(place.matchId)) return refusDe("fichierRefuse", `${laquelle} en double`)
    debuts.set(place.matchId, Date.parse(p.debut))
  }

  const noms = new Set<string>()
  const comptees = new Set<string>()
  for (const [j, s] of semaines.entries()) {
    const laquelle = `semaine ${j + 1} sur ${semaines.length}`
    const lue = estObjet(s) && estSemaine(s.semaine) ? semaineLue(s) : null
    if (!lue) return refusDe("fichierRefuse", `${laquelle} illisible`)
    if (noms.has(s.semaine)) return refusDe("fichierRefuse", `${laquelle} en double`)
    noms.add(s.semaine)
    if (!lue.cumulsAgents.every((c) => c.semaine === s.semaine)) return refusDe("fichierRefuse", `${laquelle} : un cumul d'une autre semaine`)
    for (const m of lue.comptees) {
      const id = m.toLowerCase()
      const t = debuts.get(id)
      if (t === undefined) return refusDe("fichierRefuse", `${laquelle} : une partie comptée absente du fichier`)
      if (comptees.has(id)) return refusDe("fichierRefuse", `${laquelle} : une partie comptée deux fois`)
      if (!semainesPossibles(t).includes(s.semaine)) return refusDe("fichierRefuse", `${laquelle} : une partie comptée hors de sa semaine`)
      comptees.add(id)
    }
  }
  // Chaque partie comptée dans exactement une semaine, comme le fait le convertisseur : jamais de partie sans cumuls.
  const oubliee = [...debuts.keys()].findIndex((id) => !comptees.has(id))
  if (oubliee >= 0) return refusDe("fichierRefuse", `partie ${oubliee + 1} sur ${n} comptée dans aucune semaine`)

  let suspects = 0
  for (const p of parties) suspects += cheminsSuspects(p).length
  for (const s of semaines) suspects += cheminsSuspects(s).length
  if (suspects > 0) return refusDe("fichierRefuse", `${enClair(suspects)} ${suspects > 1 ? "chemins suspects" : "chemin suspect"}`)
  return { ok: true, fichier: valeur as FichierImport }
}

/** Une partie gardée, d'après le chemin de son fichier : son matchId (minuscules), son mois (`AAAA-MM`, UTC) et le chemin. */
type Gardee = { matchId: string; mois: string; chemin: string }

const NOM_PARTIE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i
const DOSSIER_MOIS = /^\d{4}-\d{2}$/

/** Les parties gardées d'après les chemins de leurs fichiers (`…/parties/<AAAA-MM>/<matchId>.json`) ; un chemin d'une autre forme est passé. */
function gardeesDe(chemins: readonly string[]): Map<string, Gardee> {
  const r = new Map<string, Gardee>()
  for (const chemin of chemins) {
    const segments = String(chemin).split("/")
    const nom = NOM_PARTIE.exec(segments[segments.length - 1] ?? "")
    const mois = segments[segments.length - 2] ?? ""
    if (nom && DOSSIER_MOIS.test(mois)) r.set(nom[1].toLowerCase(), { matchId: nom[1].toLowerCase(), mois, chemin })
  }
  return r
}

/** La jonction trouvée, ou son refus. */
export type Jonction =
  | { ok: true; plusAncienne: Repere; suite: number; aAjouter: Partie[] }
  | { ok: false; refus: Refus }















export function jonction(f: FichierImport, chemins: readonly string[], meta: Meta, lireDebut: (chemin: string) => string | null): Jonction {
  const gardees = gardeesDe(chemins)
  const triees = [...f.parties].sort(ordreRecent)
  let suite = 0
  while (suite < triees.length && gardees.has(triees[suite].matchId.toLowerCase())) suite++
  if (suite === 0) return refusDe("nAtteintPas", "partie la plus récente du fichier absente de l'historique")
  const fin = Date.parse(triees[0].debut)
  const lancement = meta.premiereCollecte.lancee ?? meta.premiereCollecte.terminee
  const lu = lancement === null ? NaN : Date.parse(lancement)
  const borne = Number.isNaN(lu) ? Infinity : lu
  const moisFin = moisDe(triees[0].debut) ?? ""
  const moisBorne = (borne === Infinity ? null : moisDe(lancement)) ?? "9999-12"
  const duFichier = new Set(f.parties.map((p) => p.matchId.toLowerCase()))
  let apres = 0
  for (const g of gardees.values()) {
    if (duFichier.has(g.matchId) || g.mois < moisFin || g.mois > moisBorne) continue
    const debut = lireDebut(g.chemin)
    const t = typeof debut === "string" ? Date.parse(debut) : NaN
    if (Number.isNaN(t) || (t > fin && t <= borne)) apres++
  }
  if (apres >= PARTIES_AVANT_JONCTION) {
    return refusDe("nAtteintPas", `${enClair(apres)} parties gardées entre la fin du fichier et la première collecte`)
  }
  const j = triees[suite - 1]
  return {
    ok: true,
    plusAncienne: { matchId: j.matchId.toLowerCase(), debut: j.debut },
    suite,
    aAjouter: triees.filter((p) => !gardees.has(p.matchId.toLowerCase())),
  }
}

/** Une semaine de cumuls gardée, lue de son fichier (lireSemaine de stockage.ts) : son nom et ses `comptees`. */
export type SemaineLocale = { semaine: string; comptees: readonly string[] }

/** Une étape du plan d'écriture : une semaine de cumuls entière, contenu du fichier, ou une partie à sa place. */
export type Etape =
  | { type: "semaine"; semaine: string; contenu: Semaine }
  | { type: "partie"; place: Place; partie: Partie }

/**
 * Le plan d'écriture : ses étapes dans l'ordre ; `parties`, les parties à ajouter ; `prises` et `gardees`, les semaines
 * touchées (la plus récente d'abord) qui prennent les cumuls du fichier ou gardent les leurs ; `sansCumuls`, les parties
 * ajoutées dont les cumuls ne sont comptés nulle part (semaine gardée, ou comptées dans aucune semaine du fichier), pour
 * le journal.
 */
export type Plan = { etapes: Etape[]; parties: number; prises: string[]; gardees: string[]; sansCumuls: number }

/**
 * La règle des semaines (Decision de epic-stats-import) et le plan d'écriture des parties `aAjouter` (jonction) du fichier
 * `f`, sur les semaines locales `locales` (toutes celles du compte, lues ; une illisible arrête l'import avant, et n'est
 * jamais écrasée). Une semaine du fichier qui reçoit une partie à ajouter prend les cumuls du fichier à la place des siens
 * si chaque partie comptée dans la semaine locale du même nom est comptée dans celle du fichier, et qu'aucune partie de
 * celle du fichier n'est comptée dans une autre semaine locale ; sinon elle garde les siens et ses parties ajoutées n'y
 * ajoutent rien. Aucune partie n'est ainsi comptée deux fois. Étapes : chaque partie à ajouter, la plus récente d'abord, à
 * sa place (placeDe), précédée de sa semaine du fichier à la première rencontre si celle-ci est prise : chaque semaine avant
 * ses parties. Coupé, l'historique reste continu depuis le plus récent ; rejoué, rien ne change (semaine récrite à
 * l'identique, partie présente jamais récrite) ; recalculé après une coupure, il donne ce qui reste.
 */
export function planImport(f: FichierImport, aAjouter: readonly Partie[], locales: readonly SemaineLocale[]): Plan {
  const semaineDe = new Map<string, SemaineImport>()
  for (const s of f.semaines) for (const m of s.comptees) semaineDe.set(m.toLowerCase(), s)
  const comptesLocales = new Map<string, string[]>()
  const ouComptee = new Map<string, Set<string>>()
  for (const l of locales) {
    const ids = l.comptees.map((m) => m.toLowerCase())
    comptesLocales.set(l.semaine, [...(comptesLocales.get(l.semaine) ?? []), ...ids])
    for (const m of ids) ouComptee.set(m, (ouComptee.get(m) ?? new Set<string>()).add(l.semaine))
  }
  const prise = new Map<string, boolean>()
  const decider = (s: SemaineImport): boolean => {
    const deja = prise.get(s.semaine)
    if (deja !== undefined) return deja
    const duFichier = new Set(s.comptees.map((m) => m.toLowerCase()))
    const toutes = (comptesLocales.get(s.semaine) ?? []).every((m) => duFichier.has(m))
    const nulleAilleurs = [...duFichier].every((m) => [...(ouComptee.get(m) ?? [])].every((w) => w === s.semaine))
    prise.set(s.semaine, toutes && nulleAilleurs)
    return toutes && nulleAilleurs
  }
  const etapes: Etape[] = []
  const posees = new Set<string>()
  let sansCumuls = 0
  for (const p of [...aAjouter].sort(ordreRecent)) {
    const s = semaineDe.get(p.matchId.toLowerCase())
    const prendre = s !== undefined && decider(s)
    if (s !== undefined && prendre && !posees.has(s.semaine)) {
      posees.add(s.semaine)
      etapes.push({ type: "semaine", semaine: s.semaine, contenu: { comptees: s.comptees, cumulsAgents: s.cumulsAgents } })
    }
    if (!prendre) sansCumuls++
    const place = placeDe(p.matchId, p.debut)
    if (place) etapes.push({ type: "partie", place, partie: p })
  }
  const touchees = [...prise.keys()].sort().reverse()
  return {
    etapes,
    parties: aAjouter.length,
    prises: touchees.filter((w) => prise.get(w) === true),
    gardees: touchees.filter((w) => prise.get(w) === false),
    sansCumuls,
  }
}

/** Ce que l'import décide avant d'écrire : le fichier validé, la jonction et le plan ; ou le premier refus. */
export type Preparation =
  | { ok: true; fichier: FichierImport; jonction: Repere; suite: number; plan: Plan }
  | { ok: false; refus: Refus }

/**
 * Tout ce que l'import décide avant d'écrire, pour le compte connecté `puuid` (procédure de l'entrée 4, section de
 * l'entrée 5) : refus de l'historique (refusHistorique, `meta`), puis le fichier lu en entier (`valeur`, JSON déjà analysé)
 * validé (validerFichier, au numéro de réduction de `meta`), puis la jonction (`chemins`, `lireDebut`), puis le plan
 * (`locales`) ; le premier refus rendu, sans rien d'autre.
 */
export function preparerImport(
  valeur: unknown, puuid: string, meta: Meta, chemins: readonly string[], locales: readonly SemaineLocale[],
  lireDebut: (chemin: string) => string | null,
): Preparation {
  const h = refusHistorique(meta)
  if (h) return { ok: false, refus: h }
  // Numéroté : refusHistorique l'a vérifié.
  const v = validerFichier(valeur, puuid, meta.reduction as number)
  if (!v.ok) return v
  const j = jonction(v.fichier, chemins, meta, lireDebut)
  if (!j.ok) return j
  return { ok: true, fichier: v.fichier, jonction: j.plusAncienne, suite: j.suite, plan: planImport(v.fichier, j.aAjouter, locales) }
}

/** L'état de l'import, pour la section « Ton historique d'avant » (entrée 5) et la procédure (entrée 4). */
export type EtatImport =
  | { etat: "absent" }
  | { etat: "pret"; parties: number; fichier: number; periode: { debut: string; fin: string } }
  | { etat: "enCours" }
  | { etat: "interrompu"; ajoutees: number; parties: number }
  | { etat: "fait"; quand: string; parties: number }
  | { etat: "refuse"; refus: Refus }

/**
 * L'état de l'import, tiré de ses entrées : `enCours`, cette exécution l'écrit ; `meta`, meta.json du compte
 * (`importFait`, `importLance`) ; `preparation`, celle du fichier présent (preparerImport), null s'il est absent. En cours
 * d'abord ; puis fait (sa date, ses parties) ; absent ; refusé (le refus) ; interrompu, lancé sans être fait (parties
 * ajoutées sur celles du premier lancement, d'après ce qui reste) ; sinon prêt (parties à ajouter, parties et période du
 * fichier).
 */
export function etatImport(enCours: boolean, meta: Meta, preparation: Preparation | null): EtatImport {
  if (enCours) return { etat: "enCours" }
  if (meta.importFait) return { etat: "fait", quand: meta.importFait.quand, parties: meta.importFait.parties }
  if (preparation === null) return { etat: "absent" }
  if (!preparation.ok) return { etat: "refuse", refus: preparation.refus }
  const reste = preparation.plan.parties
  if (meta.importLance) {
    const total = Math.max(meta.importLance.parties, reste)
    return { etat: "interrompu", ajoutees: total - reste, parties: total }
  }
  return { etat: "pret", parties: reste, fichier: preparation.fichier.parties.length, periode: preparation.fichier.periode }
}
