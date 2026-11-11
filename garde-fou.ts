// Garde-fou : une lecture Riot par journée Valorant, jamais deux en parallèle (et quand la boutique gardée a expiré, pour
// la lecture qui part toute seule à l'ouverture de l'app : boutiqueExpiree) ;
// le format d'etat.json, que le moteur écrit à l'échec et que le widget et l'app lisent
// (Écran de connexion) ; la lecture d'un échec de Riot (résumé du corps pour le journal, maintenance
// probable) ; et le tri des cookies Riot, que le changement de compte remplace.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, seulement
// des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).
// Lire et écrire shop.json, verrou.json et etat.json reste le travail de valshop.ts
// (le widget et l'app lisent shop.json et etat.json, sans jamais les écrire).

/**
 * Un verrou sans activité depuis plus longtemps que cela est ignoré : la mise à jour qui l'a posé a
 * planté (l'activité se rafraîchit avant chaque requête ; un verrou d'avant l'entrée 10 : depuis sa pose).
 */
export const VERROU_MS = 60_000

export type Decision = "lecture" | "cache"

/** La part de shop.json que regarde le garde-fou ; le reste lui est indifférent. */
export type BoutiqueLue = {
  updatedAt?: unknown
  daily?: { resetAt?: unknown } | null
}

/** Horodatage ISO 8601 → millisecondes depuis l'epoch ; null s'il est absent ou invalide. */
function instant(iso: unknown): number | null {
  if (typeof iso !== "string") return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Faut-il interroger Riot ? « cache » si la boutique en cache est encore celle
 * du jour (`now < daily.resetAt`), « lecture » sinon : pas de cache, reset passé,
 * reset inconnu ou invalide. La journée Valorant est bornée par le reset de
 * l'API, jamais par minuit.
 */
export function deciderLecture(now: number, shop: BoutiqueLue | null | undefined): Decision {
  const resetAt = instant(shop?.daily?.resetAt)
  return resetAt !== null && now < resetAt ? "cache" : "lecture"
}

/**
 * La boutique gardée a-t-elle expiré (entrée 20 de epic-stats-collecte : la lecture qui part toute seule à l'ouverture de
 * l'app) ? Oui seulement si elle a un reset lisible et passé (`now >= daily.resetAt`). Plus stricte que deciderLecture : sans
 * boutique gardée, ou sans reset lisible, rien ne part sans un appui (jamais une lecture Riot par ouverture pour un fichier
 * abîmé) ; la lecture elle-même repasse par le garde-fou.
 */
export function boutiqueExpiree(now: number, shop: BoutiqueLue | null | undefined): boolean {
  const resetAt = instant(shop?.daily?.resetAt)
  return resetAt !== null && now >= resetAt
}

/**
 * Faut-il demander à HenrikDev la liste des offres (prix des skins, ticket 8.6) ? « cache » si prix.json a été validé dans
 * la journée Valorant en cours (`now < resetAt`, le reset suivant de la boutique, rangé avec les prix), « lecture » sinon :
 * pas de fichier, reset passé, inconnu ou invalide. Au plus une liste validée par journée Valorant.
 */
export function deciderPrix(now: number, prix: { resetAt?: unknown } | null | undefined): Decision {
  const resetAt = instant(prix?.resetAt)
  return resetAt !== null && now < resetAt ? "cache" : "lecture"
}

/** Âge du verrou en millisecondes ; null si le contenu est absent, corrompu ou sans `depuis` valide. */
export function ageVerrou(contenu: string | null | undefined, now: number): number | null {
  if (!contenu) return null
  try {
    const depuis = instant((JSON.parse(contenu) as { depuis?: unknown } | null)?.depuis)
    return depuis === null ? null : now - depuis
  } catch {
    return null
  }
}

/**
 * Qui tient le verrou (entrée 10) : `app`, une lecture au premier plan (bouton « Lire la boutique »,
 * ouverture du script, login) ; `arriere-plan`, une lecture sans interface (↻ du widget, Raccourcis),
 * qu'iOS arrête au bout d'une trentaine de secondes.
 */
export type OrigineVerrou = "app" | "arriere-plan"

/**
 * Au-delà, un verrou d'arrière-plan est celui d'une lecture finie, menée à terme ou coupée par iOS : une
 * action de widget n'a guère plus d'une trentaine de secondes (la collecte de ↻, app_intents.tsx, s'arrête
 * d'elle-même à 25 s ; la lecture de la boutique, elle, n'a pas d'échéance propre). La lecture qui tient un
 * verrou d'arrière-plan s'arrête d'elle-même à cette borne, avant toute écriture (valshop.ts, `tient`) :
 * passé ce délai, une autre lecture peut le reprendre.
 */
export const BUDGET_ARRIERE_PLAN_MS = 30_000

/**
 * Écart d'horloge toléré (entrée 10, relecture) : un verrou daté jusqu'à 10 s dans l'avenir reste lu
 * normalement. Une autre exécution peut rafraîchir son activité entre le `Date.now()` d'un appui et la
 * lecture du fichier ; au-delà, l'horloge a changé et le verrou est mort.
 */
export const TOLERANCE_AVENIR_MS = 10_000

/** Le verrou tenu par une lecture : son exécution, son origine et sa dernière activité (ms depuis l'epoch). */
export type VerrouTenu = { execution: string; par: OrigineVerrou; activite?: number }

/**
 * Ce que dit verrou.json à un appui (entrée 10) : `libre` (absent, corrompu, sans `depuis` valide) ;
 * `mort`, laissé par une lecture finie (`cause`), à remplacer ; `actif`, une lecture vivante, qui ne
 * bloque plus à `reessai` (ms depuis l'epoch). `age` : depuis la pose (ms).
 */
export type VerrouLu =
  | { etat: "libre" }
  | { etat: "mort"; cause: "avenir" | "execution" | "budget" | "silence"; age: number }
  | { etat: "actif"; age: number; reessai: number }

/**
 * Lit le verrou pour une exécution (`execution`, son identifiant ; `tenuIci`, vrai si elle tient en
 * ce moment la lecture qui l'a posé). Dans l'ordre : absent, corrompu, sans `depuis` valide → libre ;
 * verrou d'avant l'entrée 10 (`depuis` seul) → comme avant : actif tant que `now - depuis < VERROU_MS`,
 * daté dans l'avenir compris ; `depuis` ou `activite` plus de TOLERANCE_AVENIR_MS dans l'avenir
 * (horloge changée) → mort ; posé par cette même exécution, qui ne tient plus cette lecture → mort (la
 * lecture qui l'a posé est finie, l'exécution le sait) ; d'arrière-plan, posé depuis
 * BUDGET_ARRIERE_PLAN_MS → mort ; sinon, sans activité depuis VERROU_MS → mort ; actif autrement,
 * jusqu'à la borne qui s'applique.
 */
export function lireVerrou(contenu: string | null | undefined, now: number, execution: string, tenuIci: boolean): VerrouLu {
  if (!contenu) return { etat: "libre" }
  let v: { depuis?: unknown; activite?: unknown; execution?: unknown; par?: unknown } | null
  try {
    v = JSON.parse(contenu)
  } catch {
    return { etat: "libre" }
  }
  const depuis = instant(v?.depuis)
  if (v === null || typeof v !== "object" || depuis === null) return { etat: "libre" }
  const age = now - depuis
  if (v.activite === undefined && v.execution === undefined && v.par === undefined) {
    return age < VERROU_MS ? { etat: "actif", age, reessai: depuis + VERROU_MS } : { etat: "mort", cause: "silence", age }
  }
  const activite = instant(v.activite) ?? depuis
  if (depuis > now + TOLERANCE_AVENIR_MS || activite > now + TOLERANCE_AVENIR_MS) return { etat: "mort", cause: "avenir", age }
  if (typeof v.execution === "string" && v.execution === execution && !tenuIci) return { etat: "mort", cause: "execution", age }
  const arrierePlan = v.par === "arriere-plan"
  const borne = arrierePlan ? depuis + BUDGET_ARRIERE_PLAN_MS : Math.max(depuis, activite) + VERROU_MS
  if (now >= borne) return { etat: "mort", cause: arrierePlan ? "budget" : "silence", age }
  return { etat: "actif", age, reessai: borne }
}

/** Une mise à jour est-elle déjà en cours, pour qui ne tient aucune lecture ? Oui si le verrou est actif (lireVerrou). */
export function verrouActif(contenu: string | null | undefined, now: number): boolean {
  return lireVerrou(contenu, now, "", false).etat === "actif"
}

/**
 * Le verrou est-il celui de cette lecture : même exécution et même pose ? Seul celui-là se rafraîchit
 * et s'efface : un verrou repris par une autre lecture (le nôtre jugé mort) n'est jamais touché.
 */
export function verrouDe(contenu: string | null | undefined, execution: string, depuis: number): boolean {
  if (!contenu) return false
  try {
    const v = JSON.parse(contenu) as { depuis?: unknown; execution?: unknown } | null
    return v?.execution === execution && instant(v?.depuis) === depuis
  } catch {
    return false
  }
}

/**
 * Contenu de verrou.json pour une mise à jour qui commence à `now` : `{ "depuis": "<ISO 8601>" }` ;
 * avec `tenu` (entrée 10), `{ "depuis", "activite", "execution", "par" }`, l'activité à `now` par défaut.
 */
export function nouveauVerrou(now: number, tenu?: VerrouTenu): string {
  if (!tenu) return JSON.stringify({ depuis: new Date(now).toISOString() })
  return JSON.stringify({
    depuis: new Date(now).toISOString(),
    activite: new Date(tenu.activite ?? now).toISOString(),
    execution: tenu.execution,
    par: tenu.par,
  })
}

// ─────────────────────────── issue d'une lecture ───────────────────────────

/**
 * L'issue d'une lecture de la boutique (entrée 10), que dit le bouton « Lire la boutique » : lue
 * (`lueA`, updatedAt de shop.json) ; déjà à jour, le garde-fou ayant servi le cache (`resetAt`, le
 * prochain reset) ; déjà en cours ailleurs (`reessai`, ms depuis l'epoch) ; session expirée ;
 * réseau indisponible ; erreur de Riot (`maintenance` : boutique en 403) ; tout autre échec.
 */
export type IssueLecture =
  | { genre: "lue"; lueA: string | null }
  | { genre: "a-jour"; resetAt: string | null }
  | { genre: "en-cours"; reessai: number }
  | { genre: "session" }
  | { genre: "reseau" }
  | { genre: "riot"; maintenance: boolean }
  | { genre: "echec" }

// ─────────────────────────── etat.json ───────────────────────────

/**
 * Contenu d'etat.json pour une mise à jour qui échoue à `now` (contrat-donnees.md) :
 * `{ "sessionExpiree": true | false, "depuis": "<ISO 8601>", "derniereErreur": "<message>" }`.
 * `sessionExpiree` vrai si la session Riot est morte (reconnexion refusée, login
 * abandonné), faux si la chaîne a échoué après une reconnexion réussie.
 */
export function nouvelEtat(sessionExpiree: boolean, erreur: string, now: number): string {
  return JSON.stringify({ sessionExpiree, depuis: new Date(now).toISOString(), derniereErreur: erreur })
}

/**
 * La session Riot est-elle morte, d'après le contenu d'etat.json ? Vrai seulement
 * sur `sessionExpiree: true` ; faux si le contenu est absent, corrompu, ou si le
 * champ manque ou n'est pas un booléen : le widget ne signale que ce qui est sûr.
 */
export function sessionExpiree(contenu: string | null | undefined): boolean {
  if (!contenu) return false
  try {
    return (JSON.parse(contenu) as { sessionExpiree?: unknown } | null)?.sessionExpiree === true
  } catch {
    return false
  }
}

/**
 * Faut-il l'Écran de connexion de l'app ? Oui si etat.json dit la session expirée
 * (`sessionExpiree`) et que cet état est plus récent que la dernière lecture réussie de
 * la boutique (`updatedAt` de shop.json) : plus ancien, c'est un effacement d'etat.json
 * raté après un login réussi, et la session est vivante. shop.json absent, ou `updatedAt`
 * absent ou invalide : l'état expiré compte ; de même s'il n'a pas de `depuis` valide.
 */
export function connexionRequise(etat: string | null | undefined, shop: BoutiqueLue | null | undefined): boolean {
  if (!sessionExpiree(etat)) return false
  const lue = instant(shop?.updatedAt)
  if (lue === null) return true
  const depuis = instant((JSON.parse(etat as string) as { depuis?: unknown }).depuis)
  return depuis === null || depuis > lue
}

// ─────────────────────────── échec de Riot ───────────────────────────

/** Forme d'un `errorCode` de Riot gardé au journal ; un code d'une autre forme est omis. */
const CODE_RIOT = /^[A-Z0-9_]{1,64}$/









export function resumeErreurRiot(corps: string | null | undefined): string | null {
  if (!corps) return null
  let lu: unknown
  try {
    lu = JSON.parse(corps)
  } catch {
    return null
  }
  if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return null
  const { errorCode, httpStatus } = lu as { errorCode?: unknown; httpStatus?: unknown }
  const champs: string[] = []
  if (typeof errorCode === "string" && CODE_RIOT.test(errorCode)) champs.push(`errorCode ${errorCode}`)
  if (Number.isInteger(httpStatus)) champs.push(`httpStatus ${httpStatus}`)
  return champs.length > 0 ? champs.join(", ") : null
}







export function maintenanceProbable(etape: string, statut: number): boolean {
  return etape === "storefront" && statut === 403
}

// ─────────────────────────── changement de compte ───────────────────────────

/**
 * Les cookies Riot d'une liste : domaine `riotgames.com` ou qui se termine par
 * `.riotgames.com` (`.riotgames.com`, `auth.riotgames.com`,
 * `authenticate.riotgames.com`…), sans égard à la casse. Ce sont ceux que le
 * changement de compte remplace dans la fenêtre web persistante ; les autres n'y
 * sont pas touchés. Ordre et objets conservés ; un cookie sans domaine est écarté.
 */
export function cookiesRiot<T extends { domain?: unknown }>(cookies: readonly T[]): T[] {
  return cookies.filter((c) => {
    if (typeof c?.domain !== "string") return false
    const domaine = c.domain.toLowerCase()
    return domaine === "riotgames.com" || domaine.endsWith(".riotgames.com")
  })
}
