



























// ─────────────────────────── compte des stats ───────────────────────────

/** Le compte que l'on interroge : son PUUID, et sa région Riot, qui sert d'`{affinity}` à HenrikDev. */
export type Identite = { puuid: string; region: string }

const PUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Une région Riot (`eu`, `na`, `latam`, `br`, `ap`, `kr`) : quelques lettres, rien qui puisse déborder d'une adresse. */
const REGION = /^[a-z]{2,8}$/

/** Un PUUID : un UUID, seule forme admise dans une adresse vers HenrikDev. */
export function estPuuid(x: unknown): x is string {
  return typeof x === "string" && PUUID.test(x)
}

/** Une région Riot plausible ; jamais une valeur écrite en dur : elle vient toujours de Riot. */
export function estRegion(x: unknown): x is string {
  return typeof x === "string" && REGION.test(x)
}

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}


export function identiteLue(valeur: unknown): Identite | null {
  if (!estObjet(valeur)) return null
  const { puuid, region } = valeur
  return estPuuid(puuid) && estRegion(region) ? { puuid, region } : null
}


export function nouveauCompte(id: Identite, now: number): string {
  return JSON.stringify({ puuid: id.puuid, region: id.region, depuis: new Date(now).toISOString() })
}

/** La région de `shop.json`, déjà lu en JSON ; null si elle manque ou n'a pas sa forme. */
export function regionDeBoutique(valeur: unknown): string | null {
  return estObjet(valeur) && estRegion(valeur.region) ? valeur.region : null
}

/** Décode un segment base64url (charge d'un JWT) ; null s'il ne se décode pas. */
function base64url(segment: string): string | null {
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/")
    return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
  } catch {
    return null
  }
}

/** Le `sub` d'une valeur en forme de JWT, s'il est un PUUID ; sinon null. */
function subDuJeton(valeur: string): string | null {
  const parties = valeur.split(".")
  if (parties.length !== 3) return null
  const charge = base64url(parties[1])
  if (!charge) return null
  try {
    const sub = (JSON.parse(charge) as { sub?: unknown } | null)?.sub
    return estPuuid(sub) ? sub : null
  } catch {
    return null
  }
}

/**
 * Le PUUID du compte d'après les cookies Riot du trousseau (`valshop.cookies`, liste
 * `{ name, value, expires }`), lu sur place sans aucune requête : un cookie `sub` qui
 * vaut un PUUID, sinon le `sub` d'un cookie en forme de JWT, `ssid` d'abord. null si rien
 * de tel : liste vide, illisible, ou aucun PUUID dedans. La valeur des cookies ne sort
 * jamais d'ici.
 */
export function puuidDesCookies(cookies: unknown): string | null {
  if (!Array.isArray(cookies)) return null
  const lus = cookies.filter((c): c is { name: string; value: string } =>
    estObjet(c) && typeof c.name === "string" && typeof c.value === "string")
  const sub = lus.find((c) => c.name === "sub" && estPuuid(c.value))
  if (sub) return sub.value
  const ordre = [...lus.filter((c) => c.name === "ssid"), ...lus.filter((c) => c.name !== "ssid")]
  for (const c of ordre) {
    const puuid = subDuJeton(c.value)
    if (puuid) return puuid
  }
  return null
}

// ─────────────────────────── RR (mmr-history v2) ───────────────────────────

/** Un palier de rang, tel que HenrikDev le donne : `{ id, name }`. */
export type Palier = { id: number; name: string }

/**
 * Une ligne de la table du RR (contrat-donnees.md, RR) : clé `matchId`, puis les champs
 * du contrat, sous leur nom de mmr-history v2, et rien d'autre. Un champ absent ou d'un
 * autre type vaut null.
 */
export type LigneRr = {
  matchId: string
  last_change: number | null
  rr: number | null
  tier: Palier | null
  rr_before_update: number | null
  tier_before_update: Palier | null
  rr_performance_bonus: number | null
  afk_penalty: number | null
  rr_penalty: number | null
  refunded_rr: number | null
  was_derank_protected: boolean | null
  is_placement_match: boolean | null
  date: string | null
}

function nombre(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

function booleen(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null
}

function palier(x: unknown): Palier | null {
  return estObjet(x) && Number.isInteger(x.id) && typeof x.name === "string" ? { id: x.id, name: x.name } : null
}

function dateIso(x: unknown): string | null {
  return typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null
}

/** Une entrée de `data.history[]` réduite aux champs du contrat ; null sans `match_id`. */
function ligneRr(h: unknown): LigneRr | null {
  if (!estObjet(h) || typeof h.match_id !== "string" || h.match_id.length === 0) return null
  return {
    matchId: h.match_id,
    last_change: nombre(h.last_change),
    rr: nombre(h.rr),
    tier: palier(h.tier),
    rr_before_update: nombre(h.rr_before_update),
    tier_before_update: palier(h.tier_before_update),
    rr_performance_bonus: nombre(h.rr_performance_bonus),
    afk_penalty: nombre(h.afk_penalty),
    rr_penalty: nombre(h.rr_penalty),
    refunded_rr: nombre(h.refunded_rr),
    was_derank_protected: booleen(h.was_derank_protected),
    is_placement_match: booleen(h.is_placement_match),
    date: dateIso(h.date),
  }
}

/**
 * Les lignes de RR d'une réponse de mmr-history v2 (`{ data: { history: [...] } }`), dans
 * l'ordre de la réponse (la plus récente d'abord), sans doublon de `matchId` ; `ignorees` :
 * entrées sans `match_id`. null si la réponse n'a pas cette forme (réponse illisible).
 */
export function lignesRr(reponse: unknown): { lignes: LigneRr[]; ignorees: number } | null {
  const histoire = estObjet(reponse) && estObjet(reponse.data) ? reponse.data.history : undefined
  if (!Array.isArray(histoire)) return null
  const lignes: LigneRr[] = []
  const vus = new Set<string>()
  let ignorees = 0
  for (const h of histoire) {
    const l = ligneRr(h)
    if (!l) ignorees++
    else if (!vus.has(l.matchId)) {
      vus.add(l.matchId)
      lignes.push(l)
    }
  }
  return { lignes, ignorees }
}

/** La table de `rr.json`, déjà lue en JSON : un tableau, gardé tel quel ; null s'il n'en est pas un (fichier illisible). */
export function tableRrLue(valeur: unknown): LigneRr[] | null {
  return Array.isArray(valeur) ? (valeur as LigneRr[]) : null
}

/**
 * Fusion en ajout seulement : chaque ligne gardée reste telle quelle, à sa place, même si
 * la réponse la donne autrement ; les lignes lues dont le `matchId` manque à la table
 * s'ajoutent à la fin, de la plus ancienne à la plus récente (la réponse va de la plus
 * récente à la plus ancienne). `nouvelles` : celles-là seules.
 */
export function fusionnerRr(gardees: readonly LigneRr[], lues: readonly LigneRr[]): { lignes: LigneRr[]; nouvelles: LigneRr[] } {
  const connus = new Set<string>()
  for (const g of gardees) if (estObjet(g) && typeof g.matchId === "string") connus.add(g.matchId)
  const nouvelles = lues.filter((l) => !connus.has(l.matchId)).reverse()
  const t = (l: LigneRr) => (l.date === null ? null : Date.parse(l.date))
  // Tri stable par date ; une date inconnue garde l'ordre de la réponse.
  nouvelles.sort((a, b) => {
    const ta = t(a), tb = t(b)
    return ta === null || tb === null ? 0 : ta - tb
  })
  return { lignes: [...gardees, ...nouvelles], nouvelles }
}

// ─────────────────────────── rang (mmr v3) ───────────────────────────

/** Un acte de `seasonal[]`, réduit aux champs du contrat (contrat-donnees.md, Rang). */
export type Acte = {
  /** `id` (ticket 4.52, l'UUID de l'acte, celui de `/v1/seasons` de valorant-api) : absent d'un rang.json d'avant. */
  season: { short: string | null; id?: string | null }
  end_tier: Palier | null
  end_rr: number | null
  games: number | null
  wins: number | null
  wins_with_placements: number | null
}

/**
 * `rang.json` : la dernière réponse de mmr v3, remplacée à chaque mise à jour réussie,
 * réduite aux champs du contrat, sous leur nom de HenrikDev ; `updatedAt` : heure de la
 * lecture.
 */
export type Rang = {
  updatedAt: string
  /**
   * Ticket 4.52 : `rank_protection_shields`, tes boucliers de rang, et `is_at_rank_protected_tier`, ton palier est-il protégé ;
   * absents d'un rang.json d'avant, null pour une valeur absente ou d'un autre type.
   */
  current: {
    tier: Palier | null; rr: number | null; last_change: number | null
    rank_protection_shields?: number | null; is_at_rank_protected_tier?: boolean | null
  }
  peak: { tier: Palier | null; season: { short: string | null } } | null
  seasonal: Acte[]
}

function saison(x: unknown): { short: string | null; id: string | null } {
  return {
    short: estObjet(x) && typeof x.short === "string" ? x.short : null,
    id: estObjet(x) && typeof x.id === "string" && x.id !== "" ? x.id : null,
  }
}

/** Le rang d'une réponse de mmr v3 (`{ data: { current, peak, seasonal } }`) ; null sans `data.current` (réponse illisible). */
export function rangDepuisMmr(reponse: unknown, now: number): Rang | null {
  const data = estObjet(reponse) ? reponse.data : undefined
  if (!estObjet(data) || !estObjet(data.current)) return null
  return rangDe(data, new Date(now).toISOString())
}

/**
 * Le rang de `rang.json`, déjà lu en JSON (entrée 16 de epic-stats-tableau-de-bord) : relu comme rangDepuisMmr lit une
 * réponse, ses champs portant les noms de mmr v3 (chaque champ du contrat repris, absent ou d'un autre type : null ; un acte
 * qui n'est pas un objet, passé ; rien d'autre gardé) ; `updatedAt` gardé tel qu'écrit. null sans `updatedAt` daté ni
 * `current` (fichier illisible).
 */
export function rangLu(valeur: unknown): Rang | null {
  if (!estObjet(valeur) || !estObjet(valeur.current)) return null
  const updatedAt = dateIso(valeur.updatedAt)
  return updatedAt === null ? null : rangDe(valeur, updatedAt)
}

/** Le rang de `data` (`current`, objet, `peak`, `seasonal`, aux noms de mmr v3), daté `updatedAt` : rangDepuisMmr et rangLu. */
function rangDe(data: Record<string, any>, updatedAt: string): Rang {
  const c = data.current
  const p = data.peak
  return {
    updatedAt,
    current: {
      tier: palier(c.tier), rr: nombre(c.rr), last_change: nombre(c.last_change),
      rank_protection_shields: Number.isInteger(c.rank_protection_shields) && c.rank_protection_shields >= 0 ? c.rank_protection_shields : null,
      is_at_rank_protected_tier: booleen(c.is_at_rank_protected_tier),
    },
    peak: estObjet(p) ? { tier: palier(p.tier), season: saison(p.season) } : null,
    seasonal: (Array.isArray(data.seasonal) ? data.seasonal : []).filter(estObjet).map((a) => ({
      season: saison(a.season),
      end_tier: palier(a.end_tier),
      end_rr: nombre(a.end_rr),
      games: nombre(a.games),
      wins: nombre(a.wins),
      wins_with_placements: nombre(a.wins_with_placements),
    })),
  }
}

// ─────────────────────────── état des serveurs de Riot (ticket 4.52) ───────────────────────────

/** Ce que dit le bandeau : une maintenance en cours ou un incident, le titre de Riot (fr_FR, sinon en_US ; null sans titre). */
export type AnnonceRiot = { genre: "maintenance" | "incident"; titre: string | null }

/** Le titre d'une annonce de Riot : `titles[]` en fr_FR, sinon en en_US ; null sans eux. */
function titreRiot(titres: unknown): string | null {
  if (!Array.isArray(titres)) return null
  const de = (locale: string) => {
    const t = titres.find((x) => estObjet(x) && typeof x.locale === "string" && x.locale.toLowerCase() === locale && typeof x.content === "string")
    return t && (t.content as string).trim() !== "" ? (t.content as string).trim() : null
  }
  return de("fr_fr") ?? de("en_us")
}

/** Une annonce qui touche le PC : sans plateforme dite, ou dont `platforms` nomme « windows » (ou « pc »). */
function surPc(x: Record<string, any>): boolean {
  if (!Array.isArray(x.platforms) || x.platforms.length === 0) return true
  return x.platforms.some((p: unknown) => typeof p === "string" && ["windows", "pc"].includes(p.toLowerCase()))
}





export const FRAICHEUR_INCIDENT_MS = 24 * 3600_000

/** La dernière trace d'un incident : la plus récente de `created_at`, `updated_at` et des dates de ses `updates` ; NaN sans aucune. */
function derniereTrace(i: Record<string, any>): number {
  const dates: unknown[] = [i.created_at, i.updated_at]
  if (Array.isArray(i.updates)) for (const u of i.updates) if (estObjet(u)) dates.push(u.created_at, u.updated_at)
  let max = NaN
  for (const d of dates) {
    const t = typeof d === "string" ? Date.parse(d) : NaN
    if (Number.isFinite(t) && !(t <= max)) max = t
  }
  return max
}

/**
 * Les annonces de `/valorant/v1/status/{région}` de HenrikDev (`{ data: { maintenances: [...], incidents: [...] } }`, schéma
 * StatusV1, celui de Riot) qui valent un bandeau : chaque maintenance `in_progress` et chaque incident tracé dans les
 * dernières 24 h, sur PC ; une maintenance prévue, finie ou d'état inconnu, un incident plus ancien ou sans date, aucune.
 * Vide : rien en cours. null si la réponse n'a pas cette forme.
 */
export function annoncesRiot(reponse: unknown, now: number = Date.now()): AnnonceRiot[] | null {
  const d = estObjet(reponse) ? reponse.data : undefined
  if (!estObjet(d) || !Array.isArray(d.maintenances) || !Array.isArray(d.incidents)) return null
  const r: AnnonceRiot[] = []
  for (const m of d.maintenances) {
    if (estObjet(m) && m.maintenance_status === "in_progress" && surPc(m)) r.push({ genre: "maintenance", titre: titreRiot(m.titles) })
  }
  // Relecture : un incident archivé (`archive_at` passé) n'est plus listé par Riot comme actuel ; les autres, tels que Riot les
  // signale, sans dire s'il est résolu (aucun champ ne le prouve) : le bandeau dit « Riot signale », jamais « en cours ».
  for (const i of d.incidents) {
    if (!estObjet(i) || !surPc(i)) continue
    const archive = typeof i.archive_at === "string" ? Date.parse(i.archive_at) : NaN
    if (Number.isFinite(archive) && archive <= now) continue
    const trace = derniereTrace(i)
    if (!Number.isFinite(trace) || now - trace > FRAICHEUR_INCIDENT_MS) continue
    r.push({ genre: "incident", titre: titreRiot(i.titles) })
  }
  return r
}






export function texteBandeauRiot(annonces: readonly AnnonceRiot[] | null): string | null {
  if (!annonces || annonces.length === 0) return null
  const a = annonces[0]
  const tete = a.genre === "maintenance" ? "Maintenance en cours chez Riot" : "Riot signale un incident"
  const autres = annonces.length - 1
  return `${a.titre === null ? `${tete}.` : `${tete} : ${a.titre}`}${autres > 0 ? ` (+${autres} autre${autres > 1 ? "s" : ""})` : ""}`
}

// ─────────────────────────── limites et échecs ───────────────────────────

/**
 * Pourquoi une mise à jour s'arrête : `cle` (401 ou 403, clé refusée), `limite` (429, ou
 * plus de quota avant la requête suivante), `panne` (hors réseau, délai, 5xx, toute autre
 * réponse hors 2xx, réponse illisible), `stockage` (fichier du RR illisible ou écriture
 * impossible sur l'iPhone), `roles` (rôles des agents ni dans catalog.json ni lus sur
 * valorant-api : aucune page lue).
 */
export type TypeEchec = "cle" | "limite" | "panne" | "stockage" | "roles"

/** Ce que l'on sait du quota d'après les en-têtes `x-ratelimit-*` ; null pour un en-tête absent ou illisible. */
export type Quota = { restant: number | null; limite: number | null; reset: number | null }

/** Lecture d'un en-tête de réponse, sans égard à la casse (Headers.get). */
export type LireEnTete = (nom: string) => string | null | undefined


function entier(x: string | null | undefined): number | null {
  if (typeof x !== "string" || !/^\s*\d+(\.\d+)?\s*$/.test(x)) return null
  return Math.ceil(Number(x))
}

/** Quota restant, quota par minute et délai avant sa remise à zéro (secondes), d'après `x-ratelimit-remaining`, `-limit` et `-reset`. */
export function lireQuota(get: LireEnTete): Quota {
  return {
    restant: entier(get("x-ratelimit-remaining")),
    limite: entier(get("x-ratelimit-limit")),
    reset: entier(get("x-ratelimit-reset")),
  }
}

/** Plus de quota pour une requête de plus : `x-ratelimit-remaining` lu et sous 1. Sans en-tête, on ne sait pas : on continue. */
export function quotaEpuise(q: Quota): boolean {
  return q.restant !== null && q.restant < 1
}

/**
 * Délai d'attente d'un 429, en secondes : `Retry-After` (secondes, ou date HTTP), sinon
 * `x-ratelimit-reset` ; null si aucun ne se lit.
 */
export function delaiLimite(get: LireEnTete, now: number): number | null {
  const apres = get("retry-after")
  const secondes = entier(apres)
  if (secondes !== null) return secondes
  if (typeof apres === "string") {
    const t = Date.parse(apres)
    if (!Number.isNaN(t)) return Math.max(0, Math.ceil((t - now) / 1000))
  }
  return entier(get("x-ratelimit-reset"))
}

/** Limite sans délai lisible (429 sans `Retry-After` ni `x-ratelimit-reset`, délai déraisonnable, quota épuisé sans remise annoncée) : aucune requête avant 60 s. */
export const LIMITE_SANS_DELAI_S = 60
/**
 * Au-delà de 600 s, un délai de limite est déraisonnable (une date en secondes depuis 1970, par
 * exemple) : il vaut LIMITE_SANS_DELAI_S. Même borne que RESET_MAX_S (parties.ts), pour les pages.
 */
export const DELAI_MAX_S = 600

/** L'échec que dit un statut HTTP de HenrikDev ; null pour un 2xx. */
export function classerStatut(statut: number): TypeEchec | null {
  if (statut >= 200 && statut < 300) return null
  if (statut === 401 || statut === 403) return "cle"
  if (statut === 429) return "limite"
  return "panne"
}

const UUID_PARTOUT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Remplace chaque secret (clé, PUUID) d'un texte destiné au journal, puis tout UUID (PUUID ou
 * matchId d'un chemin…), et seulement ensuite le tronque : il ne dira jamais que des nombres et
 * des étapes, et la coupe ne peut laisser le début d'aucun identifiant.
 */
export function masquer(texte: string, secrets: readonly (string | null | undefined)[]): string {
  let t = texte
  for (const s of secrets) if (s) t = t.split(s).join("…")
  t = t.replace(UUID_PARTOUT, "…")
  return t.length > 160 ? t.slice(0, 160) + "…" : t
}

/** Un chemin dans un message de l'hôte : de « / » jusqu'au prochain blanc ou parenthèse. */
const CHEMIN = /\/[^\s()]*/g

/**
 * Le texte d'un message de l'hôte pour le journal et meta.json (collecte, AppIntent de ↻) : tout
 * chemin retiré (chemin du compte, de `de-cote/`, d'un fichier du script ou d'une adresse), puis
 * secrets et tout UUID masqués avant la coupe (`masquer`).
 */
export function messageHote(texte: string, secrets: readonly (string | null | undefined)[]): string {
  return masquer(texte.replace(CHEMIN, "…"), secrets)
}

// ─────────────────────────── marqueur de collecte ───────────────────────────

/** Un marqueur sans activité depuis plus longtemps que cela est ignoré : la mise à jour qui l'a posé a planté. */
export const MARQUEUR_MS = 120_000

/**
 * Qui tient le marqueur (entrée 18) : `app`, Mettre à jour de l'onglet Stats ; `rafraichir`, la collecte de ↻
 * (entrée 6), qui tourne dans l'exécution de son AppIntent. Un marqueur sans `par` (d'avant l'entrée 18), ou d'un
 * `par` inconnu, compte comme `app`.
 */
export type OrigineMarqueur = "app" | "rafraichir"

/**
 * Contenu de `stats/collecte.json` : `{ "depuis": "<ISO 8601>", "activite": "<ISO 8601>", "par" }`, l'activité
 * rafraîchie à chaque requête, `par` disant qui le tient.
 */
export function nouveauMarqueur(depuis: number, activite: number, par: OrigineMarqueur = "app"): string {
  return JSON.stringify({ depuis: new Date(depuis).toISOString(), activite: new Date(activite).toISOString(), par })
}

/** Temps écoulé depuis la dernière activité du marqueur (ms) ; null s'il est absent, corrompu ou sans date valide. */
export function ageMarqueur(contenu: string | null | undefined, now: number): number | null {
  if (!contenu) return null
  try {
    const m = JSON.parse(contenu) as { depuis?: unknown; activite?: unknown } | null
    const t = Date.parse(typeof m?.activite === "string" ? m.activite : typeof m?.depuis === "string" ? m.depuis : "")
    return Number.isNaN(t) ? null : now - t
  } catch {
    return null
  }
}

/**
 * Une mise à jour est-elle déjà en cours ? Oui si le marqueur se lit et a eu de l'activité
 * il y a moins de MARQUEUR_MS ; un marqueur daté de plus loin dans l'avenir (horloge
 * changée) est périmé lui aussi.
 */
export function marqueurActif(contenu: string | null | undefined, now: number): boolean {
  const age = ageMarqueur(contenu, now)
  return age !== null && Math.abs(age) < MARQUEUR_MS
}

/**
 * Un marqueur actif, lu (entrée 18) : l'âge de sa dernière activité (ms), qui le tient, et l'heure où il ne bloque
 * plus (`reessai`, ms depuis l'epoch : activité + MARQUEUR_MS, daté dans l'avenir compris).
 */
export type MarqueurLu = { age: number; par: OrigineMarqueur; reessai: number }

/** Le marqueur lu, s'il est actif (marqueurActif) ; null sinon : absent, corrompu, sans date valide ou périmé. */
export function marqueurLu(contenu: string | null | undefined, now: number): MarqueurLu | null {
  const age = ageMarqueur(contenu, now)
  if (!contenu || age === null || !marqueurActif(contenu, now)) return null
  let par: OrigineMarqueur = "app"
  try {
    if ((JSON.parse(contenu) as { par?: unknown } | null)?.par === "rafraichir") par = "rafraichir"
  } catch { /* lisible : ageMarqueur l'a lu */ }
  return { age, par, reessai: now - age + MARQUEUR_MS }
}

// ─────────────────────────── métadonnées par compte ───────────────────────────

/**
 * Le dernier échec d'une mise à jour : son heure, son type, l'étape et le statut pour le
 * journal (jamais la clé ni le PUUID), et, pour une limite, l'heure avant laquelle
 * aucune requête ne part.
 */
export type Echec = { quand: string; type: TypeEchec; detail: string; reessaiApres: string | null }

/** Ton Riot ID, tiré de ton entrée de `players[]` dans la partie la plus récente ; jamais au journal. */
export type RiotId = { name: string; tag: string }

/**
 * La première collecte des parties : lancée (heure posée avant sa première page) et terminée
 * (heure posée à une page vide atteinte sans partie refusée depuis la dernière collecte
 * complète, repère compris) ; ISO 8601, ou null.
 */
export type PremiereCollecte = { lancee: string | null; terminee: string | null }

/** Une partie de la liste v4, repérée sans rien d'autre : son matchId (UUID en minuscules) et son début (`started_at`, ISO 8601). */
export type Repere = { matchId: string; debut: string }

/**
 * Le repère de reprise (entrée 5), récrit après chaque page traitée entièrement, et avant chaque
 * page du haut d'une reprise qui montre une partie nouvelle (reprise.ts) : `ancre`, une partie
 * dont tout ce qui la précède est traité (la dernière partie lisible de la page traitée, ou la
 * première de la page du haut à traiter), relue au raccord ; `position`, le rang de l'ancre dans
 * la liste + 1 (position atteinte ; à la fin d'une page, le `start` de la page suivante) ;
 * `refus`, une partie refusée depuis la dernière collecte complète (la frontière n'avancera pas).
 * Effacé à la fin d'une collecte complète.
 */
export type Reprise = { position: number; ancre: Repere; refus: boolean }






export type RepriseDatee = Reprise & { quand: string | null }

/**
 * Le dernier trou possible (entrée 5) : une collecte suivante a atteint la page vide avant sa
 * frontière, ou au moins 90 parties la précédaient dans la liste. `quand` : fin de cette
 * collecte ; `de` : début de la frontière (null toléré à la lecture) ; `a` : début de la plus
 * ancienne partie lue avant elle, ancre comprise. Gardé jusqu'au trou suivant, pour le Bandeau d'alerte.
 */
export type Trou = { quand: string; de: string | null; a: string | null }

/**
 * Une marque de l'import de l'historique tracker.gg (entrée 3 de epic-stats-import), dans meta.json :
 * son heure (ISO 8601) et un nombre de parties. `importLance` : le premier lancement, écrit avant
 * sa première écriture et jamais récrit, avec les parties qu'il avait à ajouter ; `importFait` :
 * la fin, écrite à la fin seulement, avec les parties ajoutées. Lancé sans être fait, et pas en
 * cours : l'import est interrompu (etatImport de parties.ts).
 */
export type MarqueImport = { quand: string; parties: number }

/**
 * `stats/<puuid>/meta.json` : le compte interrogé, le numéro de la réduction de son historique,
 * l'heure de la dernière mise à jour réussie (datée à la fin d'une collecte complète seulement),
 * le dernier échec, ton Riot ID, la première collecte, le repère de reprise, la frontière
 * (première partie de la page 1 de la dernière collecte complète sans refus), le dernier trou,
 * et l'import de l'historique tracker.gg, lancé et fait.
 */
export type Meta = {
  puuid: string
  region: string
  /**
   * Numéro de la réduction de l'historique (entrée 17) : celui de reduction.ts, écrit avant la
   * première page ; null (absent ou illisible) : historique d'avant la numérotation, mis de côté
   * au début de la collecte suivante s'il a des parties.
   */
  reduction: number | null
  derniereReussite: string | null
  dernierEchec: Echec | null
  riotId: RiotId | null
  premiereCollecte: PremiereCollecte
  reprise: RepriseDatee | null
  frontiere: Repere | null
  dernierTrou: Trou | null
  /** Premier lancement de l'import tracker.gg ; null : jamais lancé (absent ou illisible compris). */
  importLance: MarqueImport | null
  /** Fin de l'import tracker.gg ; null : pas fait. */
  importFait: MarqueImport | null
}

const TYPES: readonly TypeEchec[] = ["cle", "limite", "panne", "stockage", "roles"]

function echecLu(x: unknown): Echec | null {
  if (!estObjet(x) || dateIso(x.quand) === null || !TYPES.includes(x.type)) return null
  return {
    quand: x.quand,
    type: x.type,
    detail: typeof x.detail === "string" ? x.detail : "",
    reessaiApres: dateIso(x.reessaiApres),
  }
}

/**
 * Un nouvel échec, daté de `now` ; pour une limite, l'heure avant laquelle aucune requête ne
 * part : `delai` secondes plus tard (Retry-After, sinon x-ratelimit-reset), 60 s sans délai
 * lisible ou au-delà de 600 s (DELAI_MAX_S), sur tous les chemins (429, quota épuisé, pages).
 */
export function nouvelEchec(type: TypeEchec, detail: string, delai: number | null, now: number): Echec {
  const lisible = delai !== null && delai <= DELAI_MAX_S ? delai : LIMITE_SANS_DELAI_S
  const attente = type === "limite" ? lisible : null
  return {
    quand: new Date(now).toISOString(), type, detail,
    reessaiApres: attente === null ? null : new Date(now + attente * 1000).toISOString(),
  }
}

function riotIdLu(x: unknown): RiotId | null {
  return estObjet(x) && typeof x.name === "string" && x.name !== "" && typeof x.tag === "string" && x.tag !== ""
    ? { name: x.name, tag: x.tag }
    : null
}

/** Un repère lu : un matchId en UUID (mis en minuscules) et un début qui se lit, réécrit en ISO 8601 (jamais le texte lu) ; null sinon. */
export function repereLu(x: unknown): Repere | null {
  return estObjet(x) && estPuuid(x.matchId) && dateIso(x.debut) !== null
    ? { matchId: x.matchId.toLowerCase(), debut: new Date(Date.parse(x.debut)).toISOString() }
    : null
}

/**
 * Le repère de reprise lu : position entière positive, ancre lisible, refus booléen ; sinon null (la collecte suivante
 * relit du haut). Son heure (`quand`, entrée 18) : absente ou illisible, null, le repère gardé.
 */
function repriseLue(x: unknown): RepriseDatee | null {
  if (!estObjet(x) || !Number.isInteger(x.position) || x.position < 1 || typeof x.refus !== "boolean") return null
  const ancre = repereLu(x.ancre)
  return ancre ? { position: x.position, ancre, refus: x.refus, quand: dateIso(x.quand) } : null
}

/** Le dernier trou lu : `quand` daté, `de` et `a` datés ou null ; sinon null. */
function trouLu(x: unknown): Trou | null {
  if (!estObjet(x) || dateIso(x.quand) === null) return null
  const borne = (b: unknown) => (b === null ? null : dateIso(b))
  const de = borne(x.de), a = borne(x.a)
  return (x.de !== null && de === null) || (x.a !== null && a === null) ? null : { quand: x.quand, de, a }
}

/** Une marque de l'import lue : `quand` daté, `parties` entier positif ou nul ; sinon null. */
function marqueImportLue(x: unknown): MarqueImport | null {
  return estObjet(x) && dateIso(x.quand) !== null && Number.isInteger(x.parties) && x.parties >= 0
    ? { quand: x.quand, parties: x.parties }
    : null
}

/**
 * Les métadonnées de `meta.json`, déjà lu en JSON, pour le compte `id` ; tout champ absent ou
 * illisible vaut « rien de connu ». Chaque champ de Meta est lu ici : un champ oublié se
 * perdrait à l'écriture suivante.
 */
export function metaLue(valeur: unknown, id: Identite): Meta {
  const v = estObjet(valeur) ? valeur : {}
  const p = estObjet(v.premiereCollecte) ? v.premiereCollecte : {}
  return {
    puuid: id.puuid,
    region: id.region,
    reduction: Number.isInteger(v.reduction) && v.reduction >= 1 ? v.reduction : null,
    derniereReussite: dateIso(v.derniereReussite),
    dernierEchec: echecLu(v.dernierEchec),
    riotId: riotIdLu(v.riotId),
    premiereCollecte: { lancee: dateIso(p.lancee), terminee: dateIso(p.terminee) },
    reprise: repriseLue(v.reprise),
    frontiere: repereLu(v.frontiere),
    dernierTrou: trouLu(v.dernierTrou),
    importLance: marqueImportLue(v.importLance),
    importFait: marqueImportLue(v.importFait),
  }
}

/**
 * Les métadonnées d'un historique repris de zéro sous le numéro de réduction `reduction`
 * (entrée 17) : première collecte, repère de reprise, frontière et dernier trou effacés, pour
 * que la collecte qui suit soit une première collecte, du haut à la page vide ; l'import
 * tracker.gg aussi, lancé et fait (entrée 3 de epic-stats-import), ses parties étant mises de
 * côté avec les autres ; le reste gardé (compte, dernière réussite, dernier échec, Riot ID). Le
 * numéro vient de reduction.ts par l'appelant : ce module ne l'importe pas.
 */
export function metaRemiseAZero(m: Meta, reduction: number): Meta {
  return {
    ...m, reduction, premiereCollecte: { lancee: null, terminee: null }, reprise: null, frontiere: null, dernierTrou: null,
    importLance: null, importFait: null,
  }
}

/** Secondes d'ici `iso`, arrondies au-dessus ; null si la date est absente, invalide ou passée. */
function secondesAvant(iso: string | null, now: number): number | null {
  const t = iso === null ? NaN : Date.parse(iso)
  return Number.isNaN(t) || t <= now ? null : Math.ceil((t - now) / 1000)
}

/** Secondes à attendre encore avant une requête, d'après une limite gardée ; null si rien n'oblige à attendre. */
export function attenteRestante(meta: Meta | null, now: number): number | null {
  const e = meta?.dernierEchec
  return e?.type === "limite" ? secondesAvant(e.reessaiApres, now) : null
}

// ─────────────────────────── Ligne d'état ───────────────────────────

/** Espace insécable, avant une unité (EXPERIENCE.md, Formats). */
const NBSP = "\u00a0"

/** Pendant la mise à jour. */
export const LIGNE_EN_COURS = "Mise à jour…"
/** Second appui, marqueur tenu par cette exécution (sa collecte en cours) : rien n'est fait. */
export const LIGNE_DEJA = "Mise à jour déjà en cours"
/** Appui, marqueur de moins de 2 min tenu par la collecte de ↻, vivante dans une autre exécution : rien n'est fait, Ligne fixe jusqu'à ses 2 min (entrée 18). */
export const LIGNE_DEJA_RAFRAICHIR = "Mise à jour en cours (↻)"
/** Appui, marqueur de moins de 2 min laissé par une collecte de l'app arrêtée (Fermer) : en tête de sa Ligne fixe (entrée 18). */
export const LIGNE_ARRETEE = "Une mise à jour vient de s'arrêter"
/** Ni compte gardé, ni PUUID dans les cookies avec une région dans shop.json : aucune requête. */
export const LIGNE_SANS_COMPTE = "Attends la prochaine lecture de la boutique"
/** Aucune clé au trousseau : aucune requête. */
export const LIGNE_SANS_CLE = "Clé HenrikDev absente"
/** En fin de Ligne, tant qu'un repère de reprise attend la collecte suivante (EXPERIENCE.md, Collecte interrompue). */
export const REPRISE_A_FAIRE = "reprise à faire"

export const INTERROMPUE = "interrompue"
/** Valeur VoiceOver du Bouton Mettre à jour pendant la mise à jour. */
export const ANNONCE_LANCEE = "Mise à jour lancée"
/** Durée du bilan d'une mise à jour sur le Bouton Mettre à jour (valeur VoiceOver), puis plus rien : un bilan resté collé au bouton tromperait. */
export const ANNONCE_MS = 10_000
/** Raison écrite sous le Bouton Mettre à jour, inactif pendant le délai d'une limite. */
export const RAISON_LIMITE = "Limite atteinte"
/** Données anciennes (EXPERIENCE.md, State Patterns) : après 7 × 24 h sans mise à jour réussie, la Ligne d'état alerte. */
export const ANCIENNE_MS = 7 * 24 * 3_600_000
/** Ajouté à l'âge de données anciennes (DESIGN.md, ligne-etat). */
export const PENSE_A_METTRE_A_JOUR = "pense à mettre à jour"


export function ageEnClair(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min}${NBSP}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}${NBSP}h`
  const j = Math.floor(h / 24)
  return `il y a ${j} ${j > 1 ? "jours" : "jour"}`
}

/**
 * Chaque échec en quelques mots, sans délai : ce que dit la Ligne d'état, où une limite ne dit
 * jamais ses secondes (VoiceOver relit la Ligne quand elle change : un décompte s'y ferait
 * entendre à chaque seconde ; il est dans le Bandeau d'alerte).
 */
const ECHECS: Record<TypeEchec, string> = {
  cle: "clé HenrikDev refusée",
  limite: "limite atteinte",
  panne: "HenrikDev ne répond pas",
  stockage: "mise à jour non gardée sur l'iPhone",
  roles: "rôles des agents indisponibles",
}

/** Le dernier échec, dit en clair pour le journal : une limite avec son délai restant. */
export function texteEchec(e: Echec, now: number): string {
  if (e.type !== "limite") return ECHECS[e.type]
  const attente = secondesAvant(e.reessaiApres, now)
  if (attente !== null) return `limite atteinte, réessaie dans ${attente}${NBSP}s`
  return e.reessaiApres === null ? "limite atteinte, réessaie plus tard" : "limite atteinte"
}

/**
 * Le dernier échec, s'il n'est pas plus ancien que la dernière réussite ; null sinon. À la même
 * milliseconde, l'échec vient après : une réussite ne suit jamais un échec si vite.
 */
function echecRecent(meta: Meta | null): Echec | null {
  const e = meta?.dernierEchec ?? null
  if (e === null) return null
  const reussite = meta?.derniereReussite ? Date.parse(meta.derniereReussite) : NaN
  return Number.isNaN(reussite) || Date.parse(e.quand) >= reussite ? e : null
}

/** Première lettre en capitale : la Ligne d'état est une ligne à elle seule. */
function capitale(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Espace fine insécable, séparateur des milliers (EXPERIENCE.md, Formats). */
const FINE = " "


export function nombreDeParties(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)} ${n > 1 ? "parties" : "partie"}`
}












export type Ligne = { avant: string; age: string; apres: string; ancienne: boolean }

/** La Ligne d'état de ces métadonnées à `now`, découpée pour l'écran (Ligne). */
export function ligneDecoupee(meta: Meta | null, now: number, parties: number = 0, suite: string | null = null): Ligne {
  const reussite = meta?.derniereReussite ? Date.parse(meta.derniereReussite) : NaN
  const jamais = Number.isNaN(reussite)
  // Jamais mise à jour : aucune alerte ; horloge en arrière : aucune non plus.
  const ancienne = !jamais && now - reussite >= ANCIENNE_MS
  const age = jamais ? "jamais mise à jour" : `mise à jour ${ageEnClair(now - reussite)}${ancienne ? ` : ${PENSE_A_METTRE_A_JOUR}` : ""}`
  const e = echecRecent(meta)
  const avant = parties > 0 ? `${nombreDeParties(parties)} · ` : ""
  // Le repère qui attend : son âge s'il porte son heure (horloge en arrière : « à l'instant »), puis la reprise due.
  const r = meta?.reprise ?? null
  const quand = r?.quand ? Date.parse(r.quand) : NaN
  const reprise = r === null ? "" : (Number.isNaN(quand) ? "" : ` · ${INTERROMPUE} ${ageEnClair(now - quand)}`) + ` · ${REPRISE_A_FAIRE}`
  const apres = (e ? ` · ${ECHECS[e.type]}` : "") + reprise + (suite ? ` · ${suite}` : "")
  return { avant, age: avant === "" ? capitale(age) : age, apres, ancienne }
}






export function texteLigne(meta: Meta | null, now: number, parties: number = 0, suite: string | null = null): string {
  const l = ligneDecoupee(meta, now, parties, suite)
  return l.avant + l.age + l.apres
}

/** Devant l'âge, sous un périmètre qui n'a aucune partie (entrée 17 de epic-stats-tableau-de-bord). */
export const AUCUNE_PARTIE = "Aucune partie"

/**
 * La Ligne d'état sous le périmètre commun (entrée 17 de epic-stats-tableau-de-bord), découpée comme `ligneDecoupee` : devant
 * l'âge, le nombre de parties du périmètre (`compte`), « Aucune partie · » à zéro ; `compte` null (données encore en lecture,
 * ou sélection impossible) : rien devant, jamais un autre nombre, l'âge en capitale.
 */
export function ligneDuPerimetre(meta: Meta | null, now: number, compte: number | null, suite: string | null = null): Ligne {
  const l = ligneDecoupee(meta, now, compte ?? 0, suite)
  if (compte !== 0) return l
  return { ...l, avant: `${AUCUNE_PARTIE} · `, age: l.age.charAt(0).toLowerCase() + l.age.slice(1) }
}

// ─────────────────────────── bilan d'une mise à jour ───────────────────────────

/**
 * Issue d'une mise à jour (collecte.ts, Bilan) : `reussie` ; `deja` (une autre en cours dans
 * cette exécution), `dejaRafraichir` (marqueur de moins de 2 min tenu par la collecte de ↻),
 * `arretee` (marqueur de moins de 2 min d'une autre exécution de l'app, laissé par une collecte
 * arrêtée), `sansCompte`, `sansCle` (aucune requête) ; `attente` (délai d'une limite pas encore
 * passé) ; ou l'échec qui l'a arrêtée. La collecte de ↻ seulement (entrée 6), garde avant toute
 * requête, rien de déplacé : `pasLancee` (première collecte jamais lancée depuis l'onglet Stats),
 * `sansNumero` (historique sans numéro de réduction), `metaIllisible` (meta.json illisible) ;
 * `interrompue` (son échéance atteinte : arrêt propre, sans échec, parties et repère gardés).
 */
export type ResultatMiseAJour =
  | "reussie" | "deja" | "dejaRafraichir" | "arretee" | "sansCompte" | "sansCle" | "attente"
  | "pasLancee" | "sansNumero" | "metaIllisible" | "interrompue" | TypeEchec






export function suiteDeLigne(resultat: ResultatMiseAJour, ajoutees: number): string | null {
  if (resultat !== "reussie") return null
  return ajoutees > 0 ? `+${nombreDeParties(ajoutees)}` : "rien de nouveau"
}







export function ligneArretee(reessai: number, now: number): string {
  return `${LIGNE_ARRETEE} · réessaie dans ${Math.max(1, Math.ceil((reessai - now) / 60_000))}${NBSP}min`
}

/**
 * La Ligne d'état d'une mise à jour qui n'a rien demandé (déjà en cours, ici ou par ↻, arrêtée,
 * sans compte, sans clé), montrée à la place de toute autre jusqu'à la mise à jour suivante ou la
 * fermeture de l'app ; celles d'une mise à jour arrêtée ou en cours par ↻, à `now`, jusqu'à
 * `reessai` (l'heure où leur marqueur ne bloque plus, Bilan) seulement ; null après une autre issue.
 */
export function ligneFixe(resultat: ResultatMiseAJour, now: number = 0, reessai: number | null = null): string | null {
  switch (resultat) {
    case "deja":
      return LIGNE_DEJA
    case "dejaRafraichir":
      return reessai !== null && now < reessai ? LIGNE_DEJA_RAFRAICHIR : null
    case "arretee":
      return reessai !== null && now < reessai ? ligneArretee(reessai, now) : null
    case "sansCompte":
      return LIGNE_SANS_COMPTE
    case "sansCle":
      return LIGNE_SANS_CLE
    default:
      return null
  }
}

/** Cause d'un échec, dans « Mise à jour impossible : … » (Bandeau d'alerte). */
const CAUSES: Record<"panne" | "stockage" | "roles", string> = {
  panne: "HenrikDev ne répond pas",
  stockage: "enregistrement refusé sur l'iPhone",
  roles: "rôles des agents indisponibles",
}
/** Cause d'un échec `stockage` venu d'une lecture : un fichier gardé qui ne se lit plus (rr.json, historique). */
const CAUSE_LECTURE = "fichier illisible sur l'iPhone"

/**
 * Un échec `stockage` vient d'une lecture quand son détail le dit avant le message de l'hôte,
 * entre parenthèses : « rr.json illisible, … », « historique du compte illisible (…) »
 * (collecte.ts) ; sinon, d'une écriture refusée.
 */
function lectureIllisible(detail: string): boolean {
  return detail.split(" (")[0].includes("illisible")
}

/**
 * La première phrase du Bandeau d'alerte d'un échec : « Clé HenrikDev refusée. », « Limite de
 * HenrikDev atteinte. », « Mise à jour impossible : HenrikDev ne répond pas. »… ; un échec
 * `stockage` dit une lecture ou une écriture d'après son `detail` ; jamais le délai d'une
 * limite, qui se décompte dans la seconde.
 */
export function phraseEchec(type: TypeEchec, detail: string = ""): string {
  return type === "cle" ? "Clé HenrikDev refusée."
    : type === "limite" ? "Limite de HenrikDev atteinte."
      : `Mise à jour impossible : ${type === "stockage" && lectureIllisible(detail) ? CAUSE_LECTURE : CAUSES[type]}.`
}











export function annonceBilan(resultat: ResultatMiseAJour, ajoutees: number, detail: string = "", now: number = 0, reessai: number | null = null): string {
  switch (resultat) {
    case "reussie":
      return ajoutees > 0 ? `Mise à jour terminée : ${nombreDeParties(ajoutees)} ${ajoutees > 1 ? "ajoutées" : "ajoutée"}` : "Rien de nouveau"
    case "deja":
      return LIGNE_DEJA
    case "dejaRafraichir":
      return LIGNE_DEJA_RAFRAICHIR
    case "arretee":
      return ligneFixe(resultat, now, reessai) ?? LIGNE_ARRETEE
    case "sansCompte":
      return LIGNE_SANS_COMPTE
    case "sansCle":
      return LIGNE_SANS_CLE
    case "attente":
      return phraseEchec("limite")
    case "pasLancee":
      return "Première collecte pas encore lancée"
    case "sansNumero":
      return "Historique sans numéro de réduction"
    case "metaIllisible":
      return "Métadonnées de collecte illisibles"
    case "interrompue":
      return "Mise à jour interrompue"
    default:
      return phraseEchec(resultat, detail)
  }
}

// ─────────────────────────── Bandeau d'alerte ───────────────────────────


export function delaiEnClair(secondes: number): string {
  return secondes < 60 ? `${secondes}${NBSP}s` : `${Math.ceil(secondes / 60)}${NBSP}min`
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


function jourEnClair(d: Date): string {
  return `${d.getDate()} ${MOIS[d.getMonth()]}`
}







export function texteTrou(t: Trou): string {
  const de = t.de === null ? null : new Date(Date.parse(t.de))
  const a = t.a === null ? null : new Date(Date.parse(t.a))
  const quand = de && a
    ? (de.toDateString() === a.toDateString() ? ` le ${jourEnClair(a)}` : ` du ${jourEnClair(de)} au ${jourEnClair(a)}`)
    : de ? ` depuis le ${jourEnClair(de)}` : a ? ` jusqu'au ${jourEnClair(a)}` : ""
  return `Trou possible : des parties jouées${quand} peuvent manquer.`
}

/**
 * Un Bandeau d'alerte (EXPERIENCE.md, State Patterns) : son genre (`cle` : un appui ouvre
 * Réglages des stats ; `limite` : son délai, décompté ; `echec` : panne, hors réseau, stockage,
 * rôles ; `trou`) et sa phrase, que VoiceOver lit d'un trait.
 */
export type Bandeau = { genre: "cle" | "limite" | "echec" | "trou"; texte: string }

/**
 * Les Bandeaux d'alerte de ces métadonnées à `now`, deux au plus : l'échec, puis le trou.
 * Une limite, pendant son délai seulement (comme le Bouton Mettre à jour, inactif tant qu'il
 * court) ; un autre échec, tant qu'il n'est pas plus ancien que la dernière réussite (règle
 * de la Ligne d'état) : une clé refusée, jusqu'à la mise à jour suivante. Le dernier trou,
 * jusqu'à la réussite qui suit celle qui l'a noté.
 */
export function bandeaux(meta: Meta | null, now: number): Bandeau[] {
  const liste: Bandeau[] = []
  const attente = attenteRestante(meta, now)
  const e = echecRecent(meta)
  if (attente !== null) liste.push({ genre: "limite", texte: `${phraseEchec("limite")} Réessaie dans ${delaiEnClair(attente)}.` })
  else if (e?.type === "cle") liste.push({ genre: "cle", texte: `${phraseEchec("cle")} Touche pour la coller de nouveau.` })
  else if (e && e.type !== "limite") liste.push({ genre: "echec", texte: `${phraseEchec(e.type, e.detail)} Tes parties gardées restent là.` })
  const t = meta?.dernierTrou ?? null
  const reussite = meta?.derniereReussite ? Date.parse(meta.derniereReussite) : NaN
  if (t !== null && (Number.isNaN(reussite) || Date.parse(t.quand) >= reussite)) liste.push({ genre: "trou", texte: texteTrou(t) })
  return liste
}

// ─────────────────────────── minuterie de l'écran ───────────────────────────

/**
 * Dans combien de millisecondes ce que montre l'onglet Stats change de lui-même, l'app
 * ouverte : pendant le délai d'une limite, à la seconde suivante de son décompte (jusqu'à sa
 * fin) ; sinon, à la minute suivante de l'âge de la dernière réussite (les 7 × 24 h des données
 * anciennes tombent sur l'une d'elles) ou de celui du repère de reprise qui attend
 * (« interrompue il y a … », entrée 18), la plus proche ; au plus tard à `jusqua` (fin du bilan
 * VoiceOver), s'il est à venir ; et d'ici `reessai` (Ligne fixe d'une mise à jour arrêtée ou en
 * cours par ↻, entrée 18), à chaque minute de son décompte, la dernière tombant pile sur `reessai`. null : plus rien
 * ne change seul (jamais mise à jour, ni repère daté, délai, bilan ni réessai).
 */
export function prochaineEcheance(meta: Meta | null, now: number, jusqua: number | null = null, reessai: number | null = null): number | null {
  const delais: number[] = []
  const e = meta?.dernierEchec
  const finDelai = e?.type === "limite" && e.reessaiApres !== null ? Date.parse(e.reessaiApres) : NaN
  if (!Number.isNaN(finDelai) && finDelai > now) delais.push((finDelai - now) % 1000 || 1000)
  else {
    for (const iso of [meta?.derniereReussite ?? null, meta?.reprise?.quand ?? null]) {
      const t = iso === null ? NaN : Date.parse(iso)
      // Reste négatif si l'horloge est avant cette heure : « à l'instant » jusqu'à sa première minute.
      if (!Number.isNaN(t)) delais.push(60_000 - ((now - t) % 60_000))
    }
  }
  if (jusqua !== null && jusqua > now) delais.push(jusqua - now)
  if (reessai !== null && reessai > now) delais.push((reessai - now) % 60_000 || 60_000)
  return delais.length === 0 ? null : Math.min(...delais)
}

// ─────────────────────────── Feuille « Réglages des stats » ───────────────────────────

/** Ton compte sans compte connu (métadonnées null : ni compte gardé, ni PUUID et région lisibles sur place). */
export const AUCUN_COMPTE = "Aucun compte Riot connecté."

/**
 * La phrase de la section Ton compte (EXPERIENCE.md, Component Patterns, Feuille « Réglages des stats ») : de quel compte
 * l'onglet montre les stats, le compte connecté dans ValShop, avec son Riot ID s'il est connu (`meta.riotId`, tiré de la
 * partie la plus récente : aucun avant la première partie lue), puis un historique par compte ; `meta` null : « Aucun compte
 * Riot connecté. ». Le Riot ID n'est écrit que là : jamais au journal, à la console ni ailleurs à l'écran.
 */
export function phraseCompte(meta: Meta | null): string {
  if (meta === null) return AUCUN_COMPTE
  const id = meta.riotId ? ` : ${meta.riotId.name}#${meta.riotId.tag}` : ""
  return `Stats du compte connecté dans ValShop${id}. Chaque compte garde son propre historique.`
}

/** Les textes d'un Chiffre (DESIGN.md, chiffre ; EXPERIENCE.md, Component Patterns) : libellé, valeur, sous-texte. */
export type TexteChiffre = { libelle: string; valeur: string; sousTexte: string }


export function partiesGardees(n: number): string {
  return n > 0 ? `${nombreDeParties(n)} ${n > 1 ? "gardées" : "gardée"}` : "aucune partie gardée"
}







export function chiffresCollecte(meta: Meta | null, parties: number, now: number): [TexteChiffre, TexteChiffre] {
  const reussite = meta?.derniereReussite ? Date.parse(meta.derniereReussite) : NaN
  return [
    { libelle: "Dernière mise à jour", valeur: Number.isNaN(reussite) ? "jamais" : ageEnClair(now - reussite), sousTexte: partiesGardees(parties) },
    { libelle: "À faire au moins", valeur: "toutes les 2 semaines", sousTexte: "pour ne rien perdre" },
  ]
}

/** La note sous les Chiffres de Collecte : pourquoi ce rythme (la fenêtre de HenrikDev). */
export const NOTE_COLLECTE = "HenrikDev ne garde que tes 100 dernières parties environ : au-delà, les plus anciennes ne seraient plus récupérables."
