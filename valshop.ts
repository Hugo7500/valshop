import { Widget, Notification, fetch, type Cookie, type RequestInit } from "scripting"
import {
  cookiesRiot, deciderLectureLangue, deciderPrix, lireVerrou, maintenanceProbable, nouveauVerrou, nouvelEtat, resumeErreurRiot, verrouActif, verrouDe,
  type BoutiqueLue, type IssueLecture, type OrigineVerrou,
} from "./garde-fou"
import { comparer, type Alerte } from "./alertes"
import { contenuOffres } from "./widgets-lecture"
import { langueDesNoms, traduireHorsVue } from "./langue"
import { catalogueAReconstruire, construireCatalogue, langueCatalogue, lireListe, type Arme, type Skin, type Souhait } from "./souhaits"
import {
  decrireAccessoire, decrireObjet, entreeValide, estNiveau, lireObjetsBundle, type EntreeAccessoire,
} from "./fiches"
import { ecrireSur, effacerCompte, garderCompte, lireMarqueur, lireMeta } from "./stockage"
import { attenteRestante, classerStatut, identiteLue, marqueurLu, messageHote } from "./historique"
import { lireCle } from "./cle"
import {
  comptesPrix, contenuPrix, controlerPrix, indexCatalogue, provenanceDuSkin, ligneJournalPrix, lireOffres, lirePrix, prixDeLaBoutique, prixEnBoutique, prixValides,
} from "./catalogue-skins"
import {
  contenuEtatPrix, contenuPrixVus, contradictions, etatPrix, fusionnerPrixVus, ligneJournalRetenus, lireEtatPrix, lirePrixVus,
  lireReference, prixVusDuStorefront, prixVusLisible, raisonCourte, type IssueHenrik, type PrixVus, type Reference,
} from "./prix-retenus"
import { TABLE_REFERENCE } from "./prix-reference"
import { lireOrigines } from "./origines"
import {
  GENRES_COLLECTION, TYPES_COLLECTION, ajouterJour, contenuCollection, contenuHistoriqueBoutique, ligneJournalCollection, lireEntitlements,
  lireHistoriqueBoutique, type GenreCollection,
} from "./possessions"
import { DELAI_SOLDE_MS, contenuSolde, deciderSolde, ligneJournalSolde, lireSolde, lireSoldes, type IssueSolde } from "./solde"
import {
  BORNE_IMAGE, BORNE_JSON, BORNE_RIOT, JOURNAL_ENORME, JOURNAL_MAX, estUuid, imageAdmise, jsonBorne, journalTourne, shardDe, tailleAdmise, tailleAnnoncee, texteBorne,
  versionClient,
} from "./securite"

const CLIENT_ID = "play-valorant-web-prod"
const REDIRECT_URI = "https://playvalorant.com/opt_in"
const AUTHORIZE_URL =
  "https://auth.riotgames.com/authorize" +
  `?redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&client_id=${CLIENT_ID}` +
  "&response_type=token%20id_token&nonce=1&scope=account%20openid"

const CLIENT_PLATFORM =
  "eyJwbGF0Zm9ybVR5cGUiOiJQQyIsInBsYXRmb3JtT1MiOiJXaW5kb3dzIiwicGxhdGZvcm1PU1Zl" +
  "cnNpb24iOiIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwicGxhdGZvcm1DaGlwc2V0IjoiVW5rbm93biJ9"

const COOKIE_KEY = "valshop.cookies"
const DIR = FileManager.appGroupDocumentsDirectory
const SHOP_FILE = DIR + "/shop.json"
const LOG_FILE = DIR + "/journal.log"
const ICONS = DIR + "/icons"
const VERROU_FILE = DIR + "/verrou.json"
/** Écrit à chaque échec, effacé à la première réussite ; le widget le lit, le moteur ne s'en sert jamais pour décider. */
const ETAT_FILE = DIR + "/etat.json"
/** Liste de souhaits : lue à chaque lecture pour les alertes (CAP-17), jamais écrite par le moteur. */
const WISHLIST_FILE = DIR + "/wishlist.json"
/**
 * Prix exacts des skins, lus par le Catalogue (catalogue-web.tsx). Ticket 8.5 : la liste des offres de Riot (`store/v1/offers/`)
 * répond 404 RESOURCE_NOT_FOUND, route retirée. Ticket 8.6 : écrit par rangerPrix depuis la liste de HenrikDev, seulement
 * quand chaque skin de la boutique du jour y a exactement le prix de Riot.
 */
const PRIX_FILE = DIR + "/prix.json"
/**
 * Ticket 8.9 : les prix retenus, chaque prix vu dans sa boutique (objet → devise → montant, date, lieu), écrits à la lecture
 * de la boutique par rangerPrixVus, jamais effacés ; lus par le Catalogue. Données de l'app : jamais dans le paquet.
 */
const PRIX_VUS_FILE = DIR + "/prix-vus.json"
/** Ticket 8.9 : l'état des prix (dernier contrôle HenrikDev, skins à prix par source), écrit à la lecture, lu par les Réglages. */
const ETAT_PRIX_FILE = DIR + "/etat-prix.json"
/** Ticket 8.10 : le cache du catalogue des accessoires (listes publiques de valorant-api), écrit et lu par son écran seulement. */
const ACCESSOIRES_FILE = DIR + "/accessoires.json"
/**
 * Ticket 8.11 : la table des origines (objet → passe de combat, contrat d'agent, événement), tirée de valorant-api par les écrans
 * du Catalogue à leur préparation (catalogue-web.tsx, tableDesOrigines), par version du jeu ; lue aussi, sans requête, pour les
 * comptes des Réglages (ecrireEtatPrix). Données de l'app : jamais dans le paquet.
 */
const ORIGINES_FILE = DIR + "/origines.json"
/**
 * Entrée 17 de epic-boutique-visuels : le solde du compte (VP, Radianite, Crédits Kingdom), lu chez Riot après chaque boutique
 * écrite, ou seul sur un appui sur « Lire la boutique » (rangerSolde) ; lu par l'onglet Boutique ; effacé avec shop.json à la
 * déconnexion et au changement de compte. Donnée du compte : sur l'iPhone seulement, jamais au journal ni dans le paquet.
 */
const SOLDE_FILE = DIR + "/solde.json"
/** Lot 2 des widgets : le skin et l'arme de chaque offre du jour, pour le widget Souhaits (widgets-lecture.ts, contenuOffres). */
const SOUHAITS_WIDGET_FILE = DIR + "/widget-souhaits.json"




const COLLECTION_FILE = DIR + "/collection.json"




const HISTORIQUE_BOUTIQUE_FILE = DIR + "/historique-boutique.json"

/**
 * Ticket 8.9 : la table de référence du paquet (prix-reference.ts, module de données importé : rien à lire sur le disque, ni
 * le dossier du script à viser), relue à chaque appel (le harnais la change) ; d'une autre forme : null.
 */
function lireTableReference(): Reference | null {
  return lireReference(TABLE_REFERENCE)
}

// ─────────────────────────── verrou ───────────────────────────

/**
 * Identifiant de cette exécution de Scripting (l'app, l'AppIntent de ↻, Raccourcis), écrit dans
 * verrou.json (entrée 10) : le fichier ne dit pas si sa lecture vit encore, l'exécution qui l'a posé,
 * elle, le sait.
 */
const EXECUTION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Une lecture (ou un changement de compte) de cette exécution qui a posé verrou.json (entrée 10) :
 * `depuis`, sa pose, qui l'identifie avec EXECUTION ; `par`, son origine ; `ecrit`, faux si l'hôte a
 * refusé l'écriture du verrou (elle continue alors sans protection, comme avant l'entrée 10) ; `perdu`,
 * vrai dès qu'elle ne le tient plus (plus aucune requête ni écriture) ; `dit`, son arrêt journalisé.
 * Un jeton par lecture : une lecture ne rafraîchit, ne vérifie et n'efface jamais que le sien, même
 * quand deux lectures se suivent dans le même processus (une extension gelée puis réveillée).
 */
type Jeton = { depuis: number; par: OrigineVerrou; ecrit: boolean; perdu: boolean; dit: boolean }

/** Les jetons que tient cette exécution en ce moment. */
const jetons = new Set<Jeton>()

/** Levée par une requête d'une lecture qui ne tient plus son verrou : elle n'est pas envoyée. */
class VerrouPerdu extends Error {
  constructor() {
    super("verrou repris par une autre lecture")
  }
}

/** Le contenu de verrou.json, lu sur place ; null s'il manque ou ne se lit pas. */
function lireFichierVerrou(): string | null {
  try {
    return FileManager.existsSync(VERROU_FILE) ? FileManager.readAsStringSync(VERROU_FILE) : null
  } catch {
    return null
  }
}

/** Cette exécution tient-elle encore la lecture qui a posé ce verrou ? (règle (3) de lireVerrou) */
/**
 * Une lecture de la boutique est-elle en cours, pour qui n'en tient aucune (les Réglages, avant un changement de compte ou
 * une déconnexion, que la Boutique interdit pendant sa lecture) ? Verrou illisible : non.
 */
export function lectureEnCours(): boolean {
  try {
    return verrouActif(lireFichierVerrou(), Date.now())
  } catch {
    return false
  }
}

function tenuIci(contenu: string | null): boolean {
  for (const j of jetons) if (!j.perdu && verrouDe(contenu, EXECUTION, j.depuis)) return true
  return false
}

/**
 * Pose le verrou d'une lecture qui commence à `now` et rend son jeton, tenu par cette exécution.
 * Lecture du fichier (par l'appelant) puis écriture, synchrones, sans `await` entre les deux : entre
 * deux processus, la fenêtre « vérifier puis agir » se réduit à quelques millisecondes, sans être nulle
 * (FileManager n'offre ni création exclusive ni renommage atomique conditionnel) ; deux lectures qui s'y
 * glisseraient l'une derrière l'autre se départagent ensuite par `tient` : seule celle dont le verrou
 * est dans le fichier envoie ses requêtes et écrit.
 */
function poserVerrou(now: number, par: OrigineVerrou): { jeton: Jeton; erreur: unknown } {
  const jeton: Jeton = { depuis: now, par, ecrit: false, perdu: false, dit: false }
  jetons.add(jeton)
  try {
    FileManager.writeAsStringSync(VERROU_FILE, nouveauVerrou(now, { execution: EXECUTION, par }))
    jeton.ecrit = true
    return { jeton, erreur: null }
  } catch (e) {
    return { jeton, erreur: e }
  }
}

/**
 * La lecture tient-elle encore son verrou ? Oui si le fichier porte toujours sa pose et qu'une autre
 * exécution le lirait actif (lireVerrou) : un verrou d'arrière-plan passé son budget, ou sans activité
 * depuis 60 s, peut être repris ; la lecture s'arrête donc d'elle-même à ce moment. Non : `perdu`, pour
 * toujours. Sans verrou écrit, rien à vérifier : oui.
 */
function tient(j: Jeton): boolean {
  if (j.perdu) return false
  if (!j.ecrit) return true
  const contenu = lireFichierVerrou()
  if (verrouDe(contenu, EXECUTION, j.depuis) && lireVerrou(contenu, Date.now(), "", false).etat === "actif") return true
  j.perdu = true
  return false
}

/** Avant une écriture ou une notification de la lecture : vrai si elle tient son verrou ; sinon, l'arrêt dit une fois au journal. */
async function encore(j: Jeton): Promise<boolean> {
  if (tient(j)) return true
  if (!j.dit) {
    j.dit = true
    await note("garde-fou : verrou repris par une autre lecture, ou délai dépassé : arrêt sans rien écrire.")
  }
  return false
}

/** Fin de la lecture : jeton rendu, verrou effacé s'il est toujours le sien (jamais celui d'autrui). */
function relacher(j: Jeton): void {
  jetons.delete(j)
  try {
    if (verrouDe(lireFichierVerrou(), EXECUTION, j.depuis)) FileManager.removeSync(VERROU_FILE)
  } catch { /* déjà absent, ou il périmera seul */ }
}

/**
 * Une requête de la lecture `j` : refusée (VerrouPerdu) si elle ne tient plus son verrou, ce qui
 * empêche deux lectures Riot en même temps ; sinon l'activité de son verrou est rafraîchie, puis la
 * requête part. Sans conséquence si l'écriture de l'activité échoue (le verrou périmera plus tôt).
 */
function requete(j: Jeton, url: string, init?: RequestInit): ReturnType<typeof fetch> {
  if (!tient(j)) return Promise.reject(new VerrouPerdu())
  if (j.ecrit) {
    try {
      FileManager.writeAsStringSync(VERROU_FILE, nouveauVerrou(j.depuis, { execution: EXECUTION, par: j.par, activite: Date.now() }))
    } catch { /* le verrou périmera plus tôt, rien de plus */ }
  }
  return fetch(url, init)
}

/** Délai de chaque requête Riot ou valorant-api de la lecture qui n'en avait pas (relecture de l'entrée 10), en secondes. */
const DELAI_REQUETE_S = 20

// ─────────────────────────── journal ───────────────────────────

const started = Date.now()

/**
 * Délai maximal d'une écriture au journal (entrée 11 de epic-stats-collecte) : au-delà, `note` se résout et la ligne
 * suivante passe. Un ajout prend quelques millisecondes, la relecture et la réécriture d'un journal de plusieurs Mo bien
 * moins d'une seconde ; une écriture de l'hôte qui ne se règle jamais ne retient ainsi ni ↻ ni la mise à jour.
 */
const DELAI_JOURNAL_MS = 3000
/** File d'écriture du journal : une ligne de cette exécution après l'autre ; elle se résout toujours. */
let fileJournal: Promise<void> = Promise.resolve()
/** Vrai dès qu'un ajout par `appendText` a échoué : relecture et réécriture pour le reste de l'exécution. */
let ajoutEnPanne = false

/** Un message du journal à la console, sans jamais lever. */
function dire(message: string): void {
  try {
    console.log(message)
  } catch { /* console indisponible : rien de plus */ }
}

/** Le texte d'une erreur pour la console, sans jamais lever : « erreur illisible » s'il ne se lit pas. */
function texteErreurJournal(e: unknown): string {
  try {
    return String(e)
  } catch {
    return "erreur illisible"
  }
}

/** Ticket 7.8 (F1) : le PUUID de cette exécution, dès qu'il est lu (getPuuid) ; masqué de chaque erreur écrite. */
let puuidCourant: string | null = null

/**
 * Ticket 7.8 (F1) : le texte d'une erreur pour le journal, etat.json et la sortie des intents : tout chemin, tout UUID, le PUUID de
 * cette exécution et les `secrets` donnés masqués, coupé court (messageHote de historique.ts, comme rangerPrix et la collecte).
 * Ne lève jamais.
 */
export function masquerErreur(e: unknown, secrets: readonly (string | null | undefined)[] = []): string {
  try {
    return messageHote(texteErreurJournal(e), [...secrets, puuidCourant])
  } catch {
    return "erreur illisible"
  }
}

/** Ticket 7.8 (F4) : journal.log déjà regardé dans cette exécution (tourné s'il dépassait sa borne). */
let journalRegarde = false

/**
 * Ticket 7.8 (F4) : avant la première ligne de l'exécution, journal.log tourné s'il dépasse sa borne (securite.ts, journalTourne :
 * ses dernières lignes gardées), en DELAI_JOURNAL_MS au plus ; rien d'écrit si le délai passe pendant la relecture (une ligne
 * ajoutée entre-temps par une autre exécution resterait). Se résout toujours ; un échec laisse le journal tel quel.
 */
function tournerJournal(): Promise<void> {
  if (journalRegarde) return Promise.resolve()
  journalRegarde = true
  return new Promise<void>((fin) => {
    let abandonne = false
    // Même nom que la garde d'une écriture (ecrireAvecDelai) : une garde du journal, que le harnais sait ne pas compter comme une attente.
    const minuterie = setTimeout(function delaiDuJournalDepasse() { abandonne = true; fin() }, DELAI_JOURNAL_MS)
    const finir = () => { clearTimeout(minuterie); fin() }
    ;(async () => {
      if (!FileManager.existsSync(LOG_FILE)) return
      const st: any = typeof FileManager.statSync === "function" ? FileManager.statSync(LOG_FILE) : null
      const taille = st !== null && typeof st.size === "number" ? st.size : null
      if (taille !== null && taille <= JOURNAL_MAX) return
      // Un journal anormal (des dizaines de Mo : un autre script, une anomalie) n'est jamais relu en entier : remplacé.
      if (taille !== null && taille > JOURNAL_ENORME) {
        if (!abandonne) await FileManager.writeAsString(LOG_FILE, `${new Date().toISOString()}  (journal remplacé : il dépassait ${JOURNAL_ENORME / 1_000_000} Mo)\n`)
        return
      }
      // Taille en octets connue au-delà de la borne : tourné même si le texte compte moins de caractères (accents).
      const tourne = journalTourne(await FileManager.readAsString(LOG_FILE), taille !== null ? 0 : JOURNAL_MAX)
      if (tourne === null || abandonne) return
      await FileManager.writeAsString(LOG_FILE, tourne)
      dire("(journal tourné : ses dernières lignes gardées)")
    })().then(finir, finir)
  })
}

/**
 * L'ancien chemin, éprouvé : relit le journal, puis le réécrit avec `texte` à la fin. `apresAjout` (un ajout vient
 * d'échouer) : rien si `texte` y est déjà, l'ajout l'ayant écrit avant d'échouer. Rien non plus si la ligne a été
 * abandonnée pendant la relecture (délai dépassé) : une réécriture tardive effacerait les lignes écrites depuis.
 */
async function reecrireJournal(texte: string, abandonnee: () => boolean, apresAjout: boolean): Promise<void> {
  const avant = FileManager.existsSync(LOG_FILE) ? await FileManager.readAsString(LOG_FILE) : ""
  if (abandonnee() || (apresAjout && avant.includes(texte))) return
  await FileManager.writeAsString(LOG_FILE, avant + texte)
}

/**
 * `texte` en fin de journal, par ajout (`appendText`), sans relire le fichier : une ligne qu'une autre exécution (↻,
 * l'app) écrit au même moment reste. Sans `appendText` chez l'hôte, ou après un ajout en échec (pour ce texte, puis le
 * reste de l'exécution), relu puis réécrit (reecrireJournal) : deux exécutions qui écrivent au même moment peuvent alors
 * encore se perdre une ligne.
 */
async function ajouterAuJournal(texte: string, abandonnee: () => boolean): Promise<void> {
  if (ajoutEnPanne || typeof FileManager.appendText !== "function") return reecrireJournal(texte, abandonnee, false)
  try {
    await FileManager.appendText(LOG_FILE, texte)
    return
  } catch (e) {
    ajoutEnPanne = true
    dire("(journal : ajout refusé (" + texteErreurJournal(e) + ") ; relecture et réécriture pour la suite de l'exécution)")
  }
  if (!abandonnee()) await reecrireJournal(texte, abandonnee, true)
}

/**
 * Écrit `texte` au journal en DELAI_JOURNAL_MS au plus ; se résout toujours, sans lever. Un échec, ou une écriture encore
 * sans réponse au délai (la ligne arrivera plus tard, ou jamais), se dit à la console.
 */
function ecrireAvecDelai(texte: string): Promise<void> {
  return new Promise<void>((fin) => {
    let reglee = false
    const minuterie = setTimeout(function delaiDuJournalDepasse() {
      if (reglee) return
      reglee = true
      dire(`(journal : « ${texte.trimEnd()} » sans réponse après ${DELAI_JOURNAL_MS / 1000} s : en retard ou perdue)`)
      fin()
    }, DELAI_JOURNAL_MS)
    const finir = () => {
      if (reglee) return
      reglee = true
      clearTimeout(minuterie)
      fin()
    }
    ajouterAuJournal(texte, () => reglee).then(finir, (e) => {
      dire("(journal indisponible : " + texteErreurJournal(e) + ")")
      finir()
    })
  })
}

/**
 * Une ligne horodatée au journal (contrat-donnees.md, journal.log : ajout en fin de fichier) et à la console. Horodatée à
 * l'appel, écrite par la file, dans l'ordre des appels de l'exécution, chacune en DELAI_JOURNAL_MS au plus
 * (ecrireAvecDelai). Par ajout, deux écritures qui se croisent n'en perdent aucune ; en repli (relecture et réécriture),
 * seulement dans une même exécution. Résolue la ligne écrite, ou au délai ; ne lève jamais : un échec se dit à la
 * console, et la ligne suivante s'écrit quand même.
 */
function note(line: string): Promise<void> {
  const stamp = new Date().toISOString()
  dire(line)
  const texte = `${stamp}  ${line}\n`
  const ecrite = fileJournal
    .then(() => tournerJournal())
    .then(() => ecrireAvecDelai(texte))
    .catch((e) => {
      dire("(journal indisponible : " + texteErreurJournal(e) + ")")
    })
  fileJournal = ecrite
  return ecrite
}

/** Affiche la fin du journal : c'est ainsi qu'on relit, dans l'app, les mises à jour faites sans interface (bouton ↻ du widget, raccourci « Run Script »). */
async function tailJournal(n = 8) {
  try {
    if (!FileManager.existsSync(LOG_FILE)) return
    const lines = (await FileManager.readAsString(LOG_FILE)).trim().split("\n").filter(Boolean)
    if (lines.length === 0) return
    console.log(`— journal, ${Math.min(n, lines.length)} dernières lignes —`)
    for (const l of lines.slice(-n)) console.log("  " + l)
    console.log("")
  } catch { /* sans importance */ }
}

// ─────────────────────────── cookies ───────────────────────────

type Stored = { name: string; value: string; expires: number | null }

function loadCookies(): Stored[] {
  const raw = Keychain.get(COOKIE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Stored[]
  } catch {
    return []
  }
}

/** Range les cookies dans le trousseau ; faux si le trousseau refuse l'écriture. */
function saveCookies(list: Stored[]): boolean {
  // first_unlock_this_device : lisible sans interface, même téléphone verrouillé, dès
  // le premier déverrouillage après le démarrage ; jamais synchronisé vers iCloud.
  return Keychain.set(COOKIE_KEY, JSON.stringify(list), {
    accessibility: "first_unlock_this_device",
    synchronizable: false,
  })
}

function fromWebView(cookies: Cookie[]): Stored[] {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    expires: c.expiresDate ? new Date(c.expiresDate).getTime() : null,
  }))
}

/** En-tête Cookie, en écartant ce qui a expiré (dont le __cf_bm de Cloudflare). */
function cookieHeader(list: Stored[]): string {
  const now = Date.now()
  return list
    .filter((c) => c.expires === null || c.expires > now)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")
}

/** Fusionne les cookies renvoyés par Riot et signale si le ssid a vraiment changé. */
function merge(list: Stored[], setCookies: string[]): { list: Stored[]; ssidChanged: boolean } {
  const byName = new Map(list.map((c) => [c.name, c]))
  let ssidChanged = false

  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(";")
    const i = pair.indexOf("=")
    if (i <= 0) continue
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()

    let expires: number | null = null
    for (const a of attrs) {
      const [k, v] = a.split("=").map((s) => s.trim())
      if (k?.toLowerCase() === "expires" && v) expires = new Date(v).getTime()
      if (k?.toLowerCase() === "max-age" && v) expires = Date.now() + Number(v) * 1000
    }

    if (name === "ssid" && byName.get("ssid")?.value !== value) ssidChanged = true
    byName.set(name, { name, value, expires })
  }
  return { list: [...byName.values()], ssidChanged }
}

// ─────────────────────────── connexion ───────────────────────────

function fragment(url: string, key: string): string | null {
  const frag = url.split("#")[1]
  if (!frag) return null
  for (const pair of frag.split("&")) {
    const i = pair.indexOf("=")
    if (i > 0 && pair.slice(0, i) === key) return decodeURIComponent(pair.slice(i + 1))
  }
  return null
}

type Tokens = { access: string; id: string }

/**
 * Présente la page de login Riot dans `webView` et rend la main à sa fermeture :
 * les jetons sont pris dans le fragment de la redirection vers playvalorant.com,
 * qui n'est jamais chargée ; null si la fenêtre est fermée sans connexion.
 */
async function pageDeLogin(webView: WebViewController, titre: string): Promise<Tokens | null> {
  let tokens: Tokens | null = null

  webView.shouldAllowRequest = async (req) => {
    if (req.url.startsWith("https://playvalorant.com/") ||
        req.url.startsWith("https://www.playvalorant.com/")) {
      const access = fragment(req.url, "access_token")
      const id = fragment(req.url, "id_token")
      if (access && id) tokens = { access, id }
      setTimeout(() => webView.dismiss(), 300)
      return false
    }
    return true
  }

  const closed = webView.present({ navigationTitle: titre })
  webView.loadURL(AUTHORIZE_URL).catch(() => {})
  await closed
  return tokens
}

/**
 * Mode connexion : page Riot visible, puis cookies rangés dans le trousseau. Ticket 7.8 (E1-a) : dans une fenêtre web
 * éphémère, comme le changement de compte : la session Riot ne vit que dans le trousseau, jamais dans le magasin de cookies
 * persistant des vues web, que tout script de Scripting partage.
 */
async function loginVisible(): Promise<Tokens | null> {
  const webView = new WebViewController({ ephemeral: true })
  const tokens = await pageDeLogin(webView, "Connexion Riot")

  const jar = await webView.getCookies("https://auth.riotgames.com/")
  webView.dispose()

  if (!tokens) return null
  saveCookies(fromWebView(jar))
  await note(`Connexion réussie, ${jar.length} cookies rangés dans le trousseau.`)
  return tokens
}

/** Ce que rend le login du changement de compte : rien n'est encore enregistré. */
type NouveauCompte = {
  tokens: Tokens
  /** Cookies qu'envoie auth.riotgames.com : ceux du trousseau, comme pour `loginVisible`. */
  trousseau: Cookie[]
}

/**
 * Login du changement de compte : page Riot dans une fenêtre web éphémère
 * (formulaire vierge, cookies isolés et jetés avec elle), sans rien enregistrer.
 * Jetons et cookies bruts sont lus avant que la fenêtre ne soit jetée ; null si
 * elle est fermée sans connexion.
 */
async function loginEphemere(): Promise<NouveauCompte | null> {
  const webView = new WebViewController({ ephemeral: true })
  try {
    const tokens = await pageDeLogin(webView, "Changer de compte")
    if (!tokens) return null
    return { tokens, trousseau: await webView.getCookies("https://auth.riotgames.com/") }
  } finally {
    webView.dispose()
  }
}

/**
 * Vrai quand la dernière `reauth()` n'a obtenu aucune réponse de Riot (réseau, délai) :
 * un échec réseau, pas un refus ; la session est peut-être encore vivante.
 */
let reseauIndisponible = false

/** Reconnexion silencieuse : nouveau jeton à partir des cookies, sans aucune interface. */
async function reauth(j: Jeton): Promise<Tokens | null> {
  reseauIndisponible = false
  const stored = loadCookies()
  if (stored.length === 0) return null

  const header = cookieHeader(stored)
  if (!header.includes("ssid=")) {
    await note("❌ Pas de ssid valide en mémoire : reconnexion manuelle nécessaire.")
    return null
  }

  const headers = { Cookie: header, "Content-Type": "application/json" }
  const holder: { url?: string } = {}
  let reponse = false // Riot a répondu, même pour refuser

  // Méthode principale : POST, qui rend un JSON exploitable.
  try {
    const res = await requete(j, "https://auth.riotgames.com/api/v1/authorization", {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_id: CLIENT_ID, nonce: "1", redirect_uri: REDIRECT_URI,
        response_type: "token id_token", scope: "account openid",
      }),
      handleRedirect: async () => null,
      timeout: 20,
    })
    reponse = true
    const { list, ssidChanged } = merge(stored, res.headers.getSetCookie?.() ?? [])
    // Réenregistré AVANT toute autre requête ; seulement en tenant le verrou (epic-installation-ami, entrée 11) : une lecture
    // dont le verrou a été repris par une déconnexion ou un changement de compte ne remet pas l'ancienne session au trousseau.
    if (tient(j)) saveCookies(list)
    await note(ssidChanged
      ? "ssid renouvelé par Riot (valeur différente)."
      : "ssid inchangé par Riot (même valeur).")

    if (res.ok) {
      const data = await jsonBorne(res, BORNE_RIOT)
      const uri = data?.response?.parameters?.uri as string | undefined
      if (uri) holder.url = uri
      else await note(`Reconnexion refusée (type « ${data?.type ?? "?"} »).`)
    } else {
      await note("Reconnexion : HTTP " + res.status)
    }
  } catch (e) {
    await note("Reconnexion (POST) en erreur : " + masquerErreur(e))
  }

  // Repli : GET /authorize, redirection interceptée.
  if (!holder.url) {
    try {
      const res = await requete(j, AUTHORIZE_URL, {
        method: "GET", headers,
        handleRedirect: async (next) => { holder.url = next.url; return null },
        timeout: 20,
      })
      reponse = true
      const { list } = merge(loadCookies(), res.headers.getSetCookie?.() ?? [])
      if (tient(j)) saveCookies(list)
      if (holder.url) await note("Repli GET /authorize utilisé.")
    } catch (e) {
      await note("Repli (GET) en erreur : " + masquerErreur(e))
    }
  }

  const url = holder.url
  if (!url) {
    reseauIndisponible = !reponse
    return null
  }
  const access = fragment(url, "access_token")
  const id = fragment(url, "id_token")
  return access && id ? { access, id } : null
}

// ─────────────────────────── boutique ───────────────────────────

/**
 * Le PUUID du jeton (`sub`), sinon celui de userinfo (Authorization, aucune redirection suivie, corps borné). Ticket 7.8 (F2) :
 * un PUUID qui n'a pas la forme d'un UUID n'est jamais rendu (il irait dans l'adresse de la boutique) : une erreur.
 */
async function getPuuid(access: string, j: Jeton): Promise<string> {
  let sub: unknown = null
  try {
    const part = access.split(".")[1]
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    sub = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))).sub
  } catch { /* on demande à Riot */ }
  if (!sub) {
    const r = await requete(j, "https://auth.riotgames.com/userinfo", {
      headers: { Authorization: "Bearer " + access },
      timeout: DELAI_REQUETE_S,
      handleRedirect: async () => null,
    })
    if (!r.ok) throw await echecRiot("userinfo", r)
    sub = (await jsonBorne(r, BORNE_RIOT))?.sub
  }
  if (!estUuid(sub)) throw new Error("PUUID inattendu")
  puuidCourant = sub
  return sub
}

const CATALOG = DIR + "/catalog.json"

/** Niveau de skin ; `skin` et `weapon` (uuid) manquent dans un catalogue d'un format antérieur, gardé en repli. */
type Entry = { name: string; icon: string | null; color: string | null; skin?: string; weapon?: string }
type EntreeBundle = { name: string; icon: string | null }
/**
 * `catalog.json` en mémoire (voir contrat-donnees.md) ; `version` reste sur le disque. Une entrée d'accessoire
 * d'avant CAP-25 n'a pas `image` : `buildShopJson` la redécrit à sa prochaine rencontre (entreeValide, fiches.ts).
 */
type Catalogue = {
  levels: Record<string, Entry>
  skins: Record<string, Skin>
  weapons: Record<string, Arme>
  bundles: Record<string, EntreeBundle>
  accessories: Record<string, EntreeAccessoire>

  langue: string




  anciens?: { bundles: Record<string, EntreeBundle>; accessories: Record<string, EntreeAccessoire> }
}

/**
 * Télécharge une icône une seule fois : le widget l'affiche depuis le disque. Ticket 7.8 (F3) : seulement pour un id UUID (le
 * nom du fichier, jamais un chemin), une adresse de media.valorant-api.com (securite.ts, imageAdmise) et une image d'au plus
 * BORNE_IMAGE octets (taille annoncée, puis lue) ; sinon null, rien d'écrit. Entrée 16 de epic-boutique-visuels : rend le
 * chemin de l'icône relatif au dossier partagé (`icons/<id>.png`), que shop.json garde : ce dossier change à une
 * réinstallation ou à une restauration, et un chemin entier n'y mènerait plus (les lecteurs : iconeLisible, securite.ts).
 */
async function cacheIcon(id: string, url: string | null, j: Jeton): Promise<string | null> {
  if (!url || !estUuid(id) || !imageAdmise(url)) return null
  const relatif = `icons/${id}.png`
  const path = `${DIR}/${relatif}`
  try {
    if (FileManager.existsSync(path)) return relatif
    if (!FileManager.existsSync(ICONS)) await FileManager.createDirectory(ICONS, true)
    const r = await requete(j, url, { timeout: 20 })
    if (!r.ok) return null
    const annonce = tailleAnnoncee(r)
    if (annonce !== null && annonce > BORNE_IMAGE) return null
    // Une page qui n'est pas une image (portail Wi-Fi, erreur servie en 200) n'est jamais gardée comme icône.
    const genre = r.headers?.get?.("content-type")
    if (typeof genre === "string" && genre !== "" && !genre.toLowerCase().startsWith("image/")) return null
    const octets = await r.data()
    if (!tailleAdmise(octets?.size, BORNE_IMAGE)) return null
    if (!(await encore(j))) return null
    await FileManager.writeAsData(path, octets)
    return relatif
  } catch {
    return null
  }
}

/** Une section d'un catalogue lu sur le disque ; vide si absente ou inattendue. */
function section<T>(c: any, nom: "levels" | "skins" | "weapons" | "bundles" | "accessories"): Record<string, T> {
  const s = c?.[nom]
  return estObjet(s) ? (s as Record<string, T>) : {}
}





const SECTIONS_BOUTIQUE = new Set(["version", "langue", "levels", "skins", "weapons", "tiers", "themes", "bundles", "accessories"])

/** Toutes les autres sections d'un catalogue lu sur le disque (rôles des agents, ressources des stats, section inconnue), telles quelles. */
function autresSections(c: unknown): Record<string, unknown> {
  return estObjet(c) ? Object.fromEntries(Object.entries(c).filter(([nom]) => !SECTIONS_BOUTIQUE.has(nom))) : {}
}

/**
 * Catalogue local. Niveaux, skins et armes (noms, images, couleurs de rareté, et
 * le skin et l'arme de chaque niveau, pour la liste de souhaits ; niveaux, variantes
 * et vidéos de chaque skin, pour sa fiche) sont construits en une requête par
 * version du jeu, au lieu d'une par offre, et reconstruits aussi quand l'une de ces
 * sections manque ou qu'un skin n'a pas le champ des variantes (catalogue d'un
 * format antérieur, d'avant CAP-25 compris : catalogueAReconstruire). En
 * échec, les sections de l'ancien fichier servent à cette lecture et rien n'est
 * écrit : jamais un catalogue vide, nouvel essai à la lecture suivante. Les
 * bundles et accessoires, remplis à la demande par `buildShopJson`, ne dépendent
 * pas de la version et sont conservés à la reconstruction ; toute autre section
 * (rôles des agents rangés par la collecte des stats, ressources des stats, section
 * inconnue) aussi, telle quelle. Ticket 8.4 (Catalogue) : de plus, l'édition et la
 * collection de chaque skin, les libellés fr-FR des paliers (même requête que les
 * couleurs) et des thèmes (`/v1/themes`, une requête de plus, à la reconstruction
 * seulement) ; sans thèmes, comme sans couleurs, rien n'est écrit.
 */
async function catalog(version: string, j: Jeton): Promise<Catalogue> {


  const voulue = langueDesNoms()
  let ancien: any = null
  try {
    if (FileManager.existsSync(CATALOG)) {
      ancien = JSON.parse(await FileManager.readAsString(CATALOG))
      if (ancien?.version === version && !catalogueAReconstruire(ancien, voulue)) {
        return {
          levels: ancien.levels, skins: ancien.skins, weapons: ancien.weapons,
          bundles: section(ancien, "bundles"), accessories: section(ancien, "accessories"), langue: voulue,
        }
      }
    }
  } catch { /* on reconstruit */ }

  // Même langue : bundles et accessoires gardés, comme avant. Autre langue : sections neuves, remplies à la demande dans la
  // nouvelle ; les anciennes ne servent qu'à montrer un objet que la nouvelle n'a pas pu décrire (Catalogue.anciens).
  const memeLangue = langueCatalogue(ancien) === voulue
  const bundles: Record<string, EntreeBundle> = memeLangue ? section<EntreeBundle>(ancien, "bundles") : {}
  const accessories: Record<string, EntreeAccessoire> = memeLangue ? section<EntreeAccessoire>(ancien, "accessories") : {}
  const anciensObjets = memeLangue ? undefined : { bundles: section<EntreeBundle>(ancien, "bundles"), accessories: section<EntreeAccessoire>(ancien, "accessories") }

  // Paliers de rareté (couleurs ; ticket 8.4 : libellés fr-FR des éditions) : réponse en erreur, sans `data` ou vide = indisponibles.
  let paliers: unknown[] = []
  try {
    const r = await requete(j, `https://valorant-api.com/v1/contenttiers?language=${voulue}`, { timeout: 25 })
    const data = r.ok ? (await jsonBorne(r, BORNE_JSON))?.data : null
    if (Array.isArray(data)) paliers = data
  } catch { /* indisponibles, voir plus bas */ }
  // Thèmes (ticket 8.4 : collections du Catalogue) : même règle.
  let themes: unknown[] = []
  try {
    const r = await requete(j, `https://valorant-api.com/v1/themes?language=${voulue}`, { timeout: 25 })
    const data = r.ok ? (await jsonBorne(r, BORNE_JSON))?.data : null
    if (Array.isArray(data)) themes = data
  } catch { /* indisponibles, voir plus bas */ }

  try {
    // Une requête pour tout : armes → skins → niveaux, mis à plat par le module pur.
    const r = await requete(j, `https://valorant-api.com/v1/weapons?language=${voulue}`, { timeout: 40 })
    if (!r.ok) throw new Error("HTTP " + r.status)
    const neuf = construireCatalogue((await jsonBorne(r, BORNE_JSON))?.data, paliers, themes)
    if (Object.keys(neuf.levels).length === 0) throw new Error("aucun niveau de skin dans la réponse")
    if (paliers.length === 0) {
      // Sans couleurs, rien d'écrit : le widget les perdrait jusqu'au prochain patch.
      // Celles de l'ancien catalogue servent à cette lecture ; nouvel essai complet ensuite.
      const anciens = section<Entry>(ancien, "levels")
      for (const [id, n] of Object.entries(neuf.levels)) n.color = anciens[id]?.color ?? null
      await note("couleurs indisponibles : catalogue non écrit, nouvel essai à la prochaine lecture")
      return { ...neuf, bundles, accessories, langue: voulue, anciens: anciensObjets }
    }
    if (themes.length === 0) {
      // Sans collections, rien d'écrit non plus : le Catalogue les perdrait jusqu'au prochain patch.
      await note("collections indisponibles : catalogue non écrit, nouvel essai à la prochaine lecture")
      return { ...neuf, bundles, accessories, langue: voulue, anciens: anciensObjets }
    }
    try {
      if (!(await encore(j))) throw new VerrouPerdu()
      await FileManager.writeAsString(CATALOG, JSON.stringify({ ...autresSections(ancien), version, langue: voulue, ...neuf, bundles, accessories }))
      await note(`Catalogue reconstruit : ${Object.keys(neuf.levels).length} niveaux, `
        + `${Object.keys(neuf.skins).length} skins, ${Object.keys(neuf.weapons).length} armes.`)
    } catch (e) {
      if (e instanceof VerrouPerdu) throw e
      await note("Catalogue reconstruit mais non écrit : " + masquerErreur(e))
    }
    return { ...neuf, bundles, accessories, langue: voulue, anciens: anciensObjets }
  } catch (e) {
    // Verrou repris : la lecture s'arrête là (lire), sans rien écrire.
    if (e instanceof VerrouPerdu) throw e


    const garde = Object.keys(section(ancien, "levels")).length > 0
    const repli: Catalogue = {
      levels: section(ancien, "levels"), skins: section(ancien, "skins"), weapons: section(ancien, "weapons"),
      bundles: section(ancien, "bundles"), accessories: section(ancien, "accessories"), langue: garde ? langueCatalogue(ancien) : voulue,
    }
    await note(`Catalogue non reconstruit (${masquerErreur(e)}) : ${garde ? "ancien catalogue gardé" : "identifiants bruts"}, `
      + "nouvel essai à la prochaine lecture.")
    return repli
  }
}

/**
 * Range les bundles et accessoires connus dans catalog.json sans toucher à `version`,
 * `levels`, `skins` ni `weapons`, qui restent l'affaire de `catalog()` ; un échec se
 * journalise, rien de plus.
 */
async function conserverObjets(cat: Catalogue, j: Jeton) {
  try {
    let c: any = null
    try {
      if (FileManager.existsSync(CATALOG)) c = JSON.parse(await FileManager.readAsString(CATALOG))
    } catch { /* illisible : on repart des deux sections seules, les niveaux seront reconstruits */ }
    if (!estObjet(c)) c = {}



    if (estObjet(c.levels) && langueCatalogue(c) !== cat.langue) {
      await note("Catalogue : bundles et accessoires non conservés (catalogue gardé dans une autre langue).")
      return
    }
    if (!estObjet(c.levels)) c.langue = cat.langue
    c.bundles = cat.bundles
    c.accessories = cat.accessories
    if (!(await encore(j))) return
    await FileManager.writeAsString(CATALOG, JSON.stringify(c))
  } catch (e) {
    await note("Catalogue : bundles et accessoires non conservés (" + masquerErreur(e) + ").")
  }
}

// ─────────────────────────── catalogue public ───────────────────────────

/** Catalogues publics essayés dans l'ordre pour un accessoire ; le premier qui répond 200 donne son type. */
const SOURCES_ACCESSOIRES: { chemin: string; kind: string }[] = [
  { chemin: "sprays", kind: "spray" },
  { chemin: "playercards", kind: "card" },
  { chemin: "playertitles", kind: "title" },
  { chemin: "buddies/levels", kind: "buddy" },
]

/** Vrai dès qu'une requête au catalogue public a échoué (réseau, délai) : on n'insiste plus pour cette lecture. */
let cataloguePublicMuet = false







async function objetPublic(chemin: string, j: Jeton, langue: string): Promise<Record<string, any> | null> {
  // Ticket 7.8 (F3) : l'id d'un objet de la boutique, mis dans l'adresse, doit être un UUID (rien d'autre n'y entre).
  if (cataloguePublicMuet || !estUuid(chemin.slice(chemin.lastIndexOf("/") + 1))) return null
  try {
    const r = await requete(j, `https://valorant-api.com/v1/${chemin}?language=${langue}`, { timeout: 15 })
    if (!r.ok) return null
    const d = (await jsonBorne(r, BORNE_JSON))?.data
    return estObjet(d) ? d : null
  } catch (e) {
    if (e instanceof VerrouPerdu) return null
    cataloguePublicMuet = true
    // Ticket 7.8 (F1) : le catalogue seul (`sprays`, `buddies/levels`), jamais l'id de l'objet ; l'erreur masquée.
    await note(`Catalogue public muet (${chemin.slice(0, Math.max(0, chemin.lastIndexOf("/")))}) : ` + masquerErreur(e))
    return null
  }
}

// ─────────────────────────── lecture défensive ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

/** Une chaîne non vide, ou null. */
function texte(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null
}

/** Une durée en secondes, ou null si ce n'en est pas une. */
function secondes(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

/** Première valeur d'un dictionnaire par devise (`{ "<uuid>": 7100 }`) ; un nombre nu passe aussi ; sinon null. */
function premierMontant(d: unknown): number | null {
  if (typeof d === "number") return Number.isFinite(d) ? d : null
  if (!estObjet(d)) return null
  const v = Object.values(d)[0]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Les clés d'un objet, pour le journal ; sinon sa nature (« null », « tableau », « string »…). */
function cles(x: unknown): string {
  if (estObjet(x)) return Object.keys(x).join(", ") || "aucune"
  return x === null ? "null" : Array.isArray(x) ? "tableau" : typeof x
}






class EchecRiot extends Error {
  etape: string
  statut: number
  constructor(etape: string, statut: number, resume: string | null) {
    super(`${etape} HTTP ${statut}` + (resume ? ` (${resume})` : ""))
    this.etape = etape
    this.statut = statut
  }
}

/**
 * L'échec d'une réponse hors 2xx. Le corps n'est lu que pour son résumé
 * (resumeErreurRiot : `errorCode` et `httpStatus`, jamais le corps brut ni son
 * `message`) ; illisible, il est ignoré et le statut suffit.
 */
async function echecRiot(etape: string, res: { status: number; headers?: any; text(): Promise<string> }): Promise<EchecRiot> {
  let corps: string | null = null
  try {
    // Ticket 7.8 (relecture) : borné comme les réponses 2xx (securite.ts) ; au-delà, ignoré, le statut suffit.
    corps = await texteBorne(res, BORNE_RIOT)
  } catch { /* corps illisible ou trop grand : le statut suffit */ }
  return new EchecRiot(etape, res.status, resumeErreurRiot(corps))
}

/**
 * Le jeton d'entitlement du compte, que demandent la boutique et le portefeuille (entrée 17 de epic-boutique-visuels : sorti
 * de fetchShop tel quel). Ticket 7.8 (F2) : chaque requête qui porte Authorization ou l'entitlement ne suit aucune redirection
 * (elle emporterait ses en-têtes ailleurs), et chaque corps est borné (securite.ts). Un jeton d'une autre forme : une erreur.
 */
async function lireEntitlement(tokens: Tokens, j: Jeton): Promise<string> {
  const auth = { Authorization: "Bearer " + tokens.access }
  const json = { "Content-Type": "application/json" }
  const entRes = await requete(j, "https://entitlements.auth.riotgames.com/api/token/v1", {
    method: "POST", headers: { ...auth, ...json }, body: "{}", timeout: DELAI_REQUETE_S, handleRedirect: async () => null,
  })
  if (!entRes.ok) throw await echecRiot("entitlements", entRes)
  const entitlements = (await jsonBorne(entRes, BORNE_RIOT))?.entitlements_token
  if (typeof entitlements !== "string" || !/^[\w.-]{1,8192}$/.test(entitlements)) throw new Error("entitlements : jeton inattendu")
  return entitlements
}

/**
 * Entrée 17 : les en-têtes d'une lecture du portefeuille (`pd.{shard}.a.pvp.net`), ceux de la boutique sans `Content-Type`
 * (aucun corps) ; ils ne vont jamais au journal.
 */
function entetesRiot(tokens: Tokens, entitlements: string, version: string): Record<string, string> {
  return {
    Authorization: "Bearer " + tokens.access,
    "X-Riot-Entitlements-JWT": entitlements,
    "X-Riot-ClientPlatform": CLIENT_PLATFORM,
    "X-Riot-ClientVersion": version,
  }
}

async function fetchShop(tokens: Tokens, j: Jeton) {
  const auth = { Authorization: "Bearer " + tokens.access }
  const json = { "Content-Type": "application/json" }

  const entitlements = await lireEntitlement(tokens, j)

  const puuid = await getPuuid(tokens.access, j)

  const geoRes = await requete(j, "https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant", {
    method: "PUT", headers: { ...auth, ...json },
    body: JSON.stringify({ id_token: tokens.id }),
    timeout: DELAI_REQUETE_S,
    handleRedirect: async () => null,
  })
  if (!geoRes.ok) throw await echecRiot("riot-geo", geoRes)
  const region = (await jsonBorne(geoRes, BORNE_RIOT))?.affinities?.live
  // Ticket 7.8 (F2) : la région de riot-geo sur liste blanche (securite.ts, SHARDS) : elle choisit l'hôte de la boutique.
  const shard = shardDe(region)
  if (shard === null) throw new Error("riot-geo : région inconnue")

  const versionRes = await requete(j, "https://valorant-api.com/v1/version", { timeout: DELAI_REQUETE_S })
  const version = versionClient((await jsonBorne(versionRes, BORNE_JSON))?.data?.riotClientVersion)
  if (version === null) throw new Error("version du client illisible")

  const res = await requete(j, `https://pd.${shard}.a.pvp.net/store/v3/storefront/${puuid}`, {
    method: "POST",
    timeout: DELAI_REQUETE_S,
    handleRedirect: async () => null,
    headers: {
      ...auth, ...json,
      "X-Riot-Entitlements-JWT": entitlements,
      "X-Riot-ClientPlatform": CLIENT_PLATFORM,
      "X-Riot-ClientVersion": version,
    },
    body: "{}",
  })
  if (!res.ok) throw await echecRiot("storefront", res)
  // Entrée 17 : les en-têtes servent aussi au portefeuille (rangerSolde), après la boutique écrite.
  return { shop: await jsonBorne(res, BORNE_RIOT), region: region as string, shard, version, puuid, entetes: entetesRiot(tokens, entitlements, version) }
}

/** Délai de chaque requête de la collection, en secondes : elles viennent après tout le reste de la lecture. */
const DELAI_COLLECTION_S = 10







async function rangerCollection(shard: string, puuid: string, entetes: Record<string, string>, j: Jeton): Promise<boolean> {
  try {
    const genres: Partial<Record<GenreCollection, string[]>> = {}
    const refus: GenreCollection[] = []
    for (const g of GENRES_COLLECTION) {
      if (!(await encore(j))) return false
      const type = TYPES_COLLECTION[g]
      // Vrai dès que Riot a répondu à cette requête (une réponse, même en erreur) ; faux : réseau perdu, délai passé ou verrou perdu.
      let reponse = false
      try {
        const res = await requete(j, `https://pd.${shard}.a.pvp.net/store/v1/entitlements/${puuid}/${type}`, {
          headers: entetes, timeout: DELAI_COLLECTION_S, handleRedirect: async () => null,
        })
        reponse = true
        if (!res.ok) throw await echecRiot("entitlements " + g, res)
        let corps: unknown
        try {
          corps = JSON.parse(await texteBorne(res, BORNE_RIOT))
        } catch {
          throw new Error("réponse illisible")
        }
        const lu = lireEntitlements(corps, type)
        if ("refus" in lu) throw new Error(lu.refus)
        genres[g] = lu.ids
      } catch (e) {
        refus.push(g)
        await note(`Collection : ${g} non lu (${raisonSolde(e, [puuid])}).`)
        // Sans réseau, les genres suivants échoueraient de même : on s'arrête là. (`reseauIndisponible` ne dit que la dernière
        // reconnexion, réussie ici : c'est l'absence de réponse à cette requête qui le dit.)
        if (!reponse) break
      }
    }
    if (Object.keys(genres).length === 0) return false
    if (!(await encore(j))) return false
    ecrireSur(COLLECTION_FILE, contenuCollection({ compte: puuid, lueA: new Date(Date.now()).toISOString(), genres }))
    await note(ligneJournalCollection(genres, refus))
    return true
  } catch (e) {
    try { await note(`Collection non gardée (${raisonSolde(e, [puuid])}).`) } catch { /* journal indisponible : rien */ }
    return false
  }
}





async function garderJourBoutique(puuid: string, data: { daily?: { resetAt?: unknown; items?: unknown } }) {
  try {
    const items = Array.isArray(data.daily?.items) ? (data.daily!.items as { id?: unknown }[]) : []
    let avant: string | null = null
    try {
      if (FileManager.existsSync(HISTORIQUE_BOUTIQUE_FILE)) avant = FileManager.readAsStringSync(HISTORIQUE_BOUTIQUE_FILE)
    } catch { /* illisible : repart de rien, comme lireHistoriqueBoutique */ }
    const h = lireHistoriqueBoutique(avant)
    const apres = ajouterJour(h, puuid, data.daily?.resetAt, items.map((i) => i?.id))
    if (apres !== h) ecrireSur(HISTORIQUE_BOUTIQUE_FILE, contenuHistoriqueBoutique(apres))
  } catch (e) {
    try { await note("historique de la boutique non gardé (" + masquerErreur(e, [puuid]) + ").") } catch { /* rien */ }
  }
}

/** Délai de la requête du portefeuille, en secondes : la dernière de la lecture, elle ne doit pas en retenir longtemps la fin. */
const DELAI_SOLDE_S = 10

/**
 * Entrée 17 : le dernier solde demandé à Riot par cette exécution (ms depuis l'epoch), lu ou non ; avec le dernier solde lu
 * (solde.json), il espace les relectures du seul solde (deciderSolde). null : aucun.
 */
let dernierEssaiSolde: number | null = null

/** Le texte d'un échec du solde pour le journal : le message de l'erreur, chemins, UUID et `secrets` masqués (messageHote). */
function raisonSolde(e: unknown, secrets: readonly (string | null | undefined)[] = []): string {
  return messageHote(e instanceof Error ? e.message : texteErreurJournal(e), [...secrets, puuidCourant])
}

/**
 * Solde du compte (entrée 17 de epic-boutique-visuels) : le portefeuille de Riot (`GET pd.{shard}.a.pvp.net/store/v1/wallet/{puuid}`,
 * les en-têtes de la boutique, aucune redirection suivie, corps borné), lu strictement (lireSoldes de solde.ts : un entier
 * positif ou nul par devise reconnue, sinon rien pour elle) et rangé dans solde.json avec l'heure de la lecture et `boutique`,
 * l'`updatedAt` de la boutique sous laquelle il est lu ; écriture sûre, verrou tenu. Appelée à la fin d'une lecture, la boutique
 * écrite et ses prix rangés, ou seule (relireSolde). Un échec (réponse hors 2xx, réseau, corps illisible ou d'une autre forme, aucune devise lisible,
 * écriture) ne touche ni la boutique ni le widget ni l'ancien solde.json, que l'écran ne montre que sous sa propre boutique :
 * une ligne au journal (étape et statut, nom des devises ; jamais un montant, un en-tête, le PUUID ni le corps). Rend vrai si
 * le solde est gardé. Ne lève jamais.
 */
async function rangerSolde(shard: string, puuid: string, entetes: Record<string, string>, boutique: string, j: Jeton): Promise<boolean> {
  try {
    dernierEssaiSolde = Date.now()
    const res = await requete(j, `https://pd.${shard}.a.pvp.net/store/v1/wallet/${puuid}`, {
      headers: entetes, timeout: DELAI_SOLDE_S, handleRedirect: async () => null,
    })
    if (!res.ok) throw await echecRiot("wallet", res)
    // Le corps lu d'abord : une coupure en route reste un échec réseau (son message), un corps qui n'est pas du JSON une réponse illisible.
    const texte = await texteBorne(res, BORNE_RIOT)
    let corps: unknown
    try {
      corps = JSON.parse(texte)
    } catch {
      throw new Error("wallet : réponse illisible")
    }
    const lus = lireSoldes(corps)
    if ("refus" in lus) throw new Error("wallet : " + lus.refus)
    if (!(await encore(j))) return false
    try {
      // Écriture sûre (stockage.ts) : un temporaire, puis le remplacement ; une écriture coupée ne tronque jamais l'ancien.
      ecrireSur(SOLDE_FILE, contenuSolde(lus.soldes, new Date(Date.now()).toISOString(), boutique))
    } catch (e) {
      await note(`Solde non gardé (${raisonSolde(e, [puuid])}).`)
      return false
    }
    await note(ligneJournalSolde(lus))
    return true
  } catch (e) {
    try {
      await note(`Solde non lu (${raisonSolde(e, [puuid])}).`)
    } catch { /* journal indisponible : rien */ }
    return false
  }
}

/**
 * Entrée 17 : la relecture du seul solde, sur un appui sur « Lire la boutique » quand la boutique du jour est déjà en cache
 * (`cache`) : trop tôt (deciderSolde : moins de DELAI_SOLDE_MS depuis le dernier solde lu ou demandé), aucune requête ; sinon
 * la reconnexion silencieuse, l'entitlement, puis le portefeuille (rangerSolde), la région et la version du client reprises
 * de la boutique gardée (ni riot-geo ni valorant-api : ValShop ne garde aucun jeton, d'où ces trois requêtes). Verrou tenu par
 * l'appelant. Un échec ne touche ni etat.json ni le widget et ne notifie rien : la session ne se juge qu'à une lecture de la
 * boutique. Ne lève jamais.
 */
async function relireSolde(cache: BoutiqueLue | null, hasCookies: boolean, j: Jeton): Promise<IssueSolde> {
  const nonRelu = async (raison: string, reseau: boolean = false): Promise<IssueSolde> => {
    await note(`Solde non relu (${raison}).`)
    return { genre: "non-relu", reseau }
  }
  try {
    const now = Date.now()
    let garde: string | null = null
    try {
      if (FileManager.existsSync(SOLDE_FILE)) garde = await FileManager.readAsString(SOLDE_FILE)
    } catch { /* illisible : comme absent */ }
    const decision = deciderSolde(now, lireSolde(garde)?.luA ?? null, dernierEssaiSolde)
    if (!decision.lire) {
      await note(`Solde : déjà demandé il y a moins de ${DELAI_SOLDE_MS / 60_000} min, aucune requête.`)
      return { genre: "trop-tot", possible: decision.possible }
    }
    const c = cache as { updatedAt?: unknown; region?: unknown; version?: unknown } | null
    const boutique = typeof c?.updatedAt === "string" && c.updatedAt !== "" ? c.updatedAt : null
    const shard = shardDe(c?.region)
    const version = versionClient(c?.version)
    if (boutique === null || shard === null || version === null) return await nonRelu("boutique gardée sans heure, région ou version lisible")
    if (!hasCookies) return await nonRelu("aucune session au trousseau")
    await note("Solde : relecture seule (boutique du jour en cache).")
    const avant = dernierEssaiSolde
    dernierEssaiSolde = now
    const tokens = await reauth(j)
    if (!(await encore(j))) return { genre: "non-relu", reseau: false }
    if (!tokens) {
      // Sans aucune réponse de Riot, rien ne lui a été demandé pour de bon : l'essai ne compte pas.
      if (reseauIndisponible) dernierEssaiSolde = avant
      return await nonRelu(reseauIndisponible ? "réseau indisponible" : "reconnexion refusée", reseauIndisponible)
    }
    const entitlements = await lireEntitlement(tokens, j)
    const puuid = await getPuuid(tokens.access, j)
    const entetes = entetesRiot(tokens, entitlements, version)
    const relu = await rangerSolde(shard, puuid, entetes, boutique, j)

    if (await encore(j)) await rangerCollection(shard, puuid, entetes, j)
    return relu ? { genre: "relu" } : { genre: "non-relu", reseau: false }
  } catch (e) {
    try { await note(`Solde non relu (${raisonSolde(e)}).`) } catch { /* journal indisponible : rien */ }
    return { genre: "non-relu", reseau: false }
  }
}

/**
 * Entrée 17 : le solde gardé effacé avec la boutique (déconnexion, changement de compte), le temporaire d'une écriture coupée
 * compris ; l'essai de cette exécution oublié avec lui. Un échec se journalise, rien de plus : un solde resté là ne s'affiche
 * jamais sous une autre boutique (ligneSolde de solde.ts).
 */
async function effacerSolde() {
  dernierEssaiSolde = null

  for (const chemin of [COLLECTION_FILE, COLLECTION_FILE + ".tmp"]) {
    try {
      if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
    } catch (e) {
      await note("collection.json non effacée (" + masquerErreur(e) + ") : elle ne s'affichera pas pour un autre compte.")
    }
  }
  for (const chemin of [SOLDE_FILE, SOLDE_FILE + ".tmp"]) {
    try {
      if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
    } catch (e) {
      await note("solde.json non effacé (" + masquerErreur(e) + ") : il ne s'affichera pas sous une autre boutique.")
    }
  }
}

/** Liste des offres chez HenrikDev (ticket 8.6) : même forme que l'ancienne `store/v1/offers` de Riot. */
const OFFRES_HENRIKDEV = "https://api.henrikdev.xyz/valorant/v1/store-offers"
/** Délai de la liste des offres de HenrikDev, en secondes : la lecture de ↻ tient dans la trentaine de secondes d'iOS. */
const DELAI_PRIX_S = 15

/**
 * Prix exacts des skins (ticket 8.6) : la liste des offres de HenrikDev (OFFRES_HENRIKDEV, la clé du trousseau dans
 * `Authorization` seulement, aucune redirection suivie), lue au plus une fois par journée Valorant (deciderPrix : prix.json
 * validé daté du reset suivant de la boutique), mise à plat par lireOffres et contrôlée contre les prix de Riot du storefront
 * `brut` de cette lecture (prixDeLaBoutique, controlerPrix) : prix.json écrit seulement si chaque niveau de skin du storefront
 * y a exactement le prix de Riot ; un écart, un absent ou rien à comparer : l'ancien prix.json reste. Aucune requête sans clé,
 * sous une limite de HenrikDev en cours (dernier échec du compte, attenteRestante) ou pendant une collecte des stats
 * (marqueur actif) : elles se partagent le quota. Appelée après une boutique écrite, verrou tenu ; un échec (réponse hors
 * 2xx, réseau, forme inattendue, écriture) ne touche ni la boutique ni le widget ni l'ancien prix.json : une ligne au journal
 * (étape et statut, jamais la clé, le PUUID, un uuid ni le corps). Ne lève jamais.
 */
async function rangerPrix(brut: unknown, puuid: string, region: string, lueA: string, resetAt: string | null, j: Jeton): Promise<IssueHenrik | null> {
  let cle: string | null = null
  try {
    let avant: string | null = null
    try {
      if (FileManager.existsSync(PRIX_FILE)) avant = await FileManager.readAsString(PRIX_FILE)
    } catch { /* illisible : relu */ }
    const now = Date.now()
    // Seul un prix.json écrit par ce contrôle (source « henrikdev ») dispense de la lecture du jour.
    const lu = lirePrix(avant)
    if (lu !== null && lu.source === "henrikdev" && deciderPrix(now, lu) === "cache") {
      await note("Prix HenrikDev : prix du jour déjà contrôlés, aucune requête.")
      return { genre: "deja" }
    }
    cle = lireCle()
    if (cle === null) {
      await note("Prix HenrikDev non lus (aucune clé HenrikDev) : anciens prix gardés.")
      return { genre: "non-lu", raison: "aucune clé HenrikDev" }
    }
    // Le dernier échec du compte de cette lecture (meta.json de la collecte, lu seulement) : une limite qui court encore.
    const attente = identiteLue({ puuid, region }) ? attenteRestante(lireMeta({ puuid, region }), now) : null
    if (attente !== null && attente > 0) {
      await note(`Prix HenrikDev non lus (limite de HenrikDev encore ${attente} s) : anciens prix gardés.`)
      return { genre: "non-lu", raison: "limite de HenrikDev en cours" }
    }
    if (marqueurLu(lireMarqueur(), now) !== null) {
      await note("Prix HenrikDev non lus (mise à jour des stats en cours) : anciens prix gardés.")
      return { genre: "non-lu", raison: "mise à jour des stats en cours" }
    }
    const res = await requete(j, OFFRES_HENRIKDEV, {
      headers: { Authorization: cle, Accept: "application/json" },
      timeout: DELAI_PRIX_S,
      handleRedirect: async () => null,
    })
    const type = classerStatut(res.status)
    if (type !== null) {
      const quoi = type === "cle" ? "clé refusée, " : type === "limite" ? "limite, " : ""
      throw new Error(`store-offers ${quoi}HTTP ${res.status}`)
    }
    // Le corps lu d'abord : une coupure en route reste un échec réseau (son message), un corps qui n'est pas du JSON une réponse illisible.
    // Ticket 7.8 (F4) : un corps borné (securite.ts) : au-delà, une réponse illisible.
    const texte = await texteBorne(res, BORNE_JSON)
    let corps: unknown
    try {
      corps = JSON.parse(texte)
    } catch {
      throw new Error("store-offers : réponse illisible")
    }
    const lues = lireOffres(corps)
    if (lues === null) throw new Error("store-offers : réponse inattendue (pas de liste Offers)")
    const controle = controlerPrix(lues, prixDeLaBoutique(brut))
    if (!(await encore(j))) return null
    if (prixValides(controle)) {
      try {
        // Écriture sûre (stockage.ts) : un temporaire, puis le remplacement ; une écriture coupée ne tronque jamais l'ancien.
        ecrireSur(PRIX_FILE, contenuPrix(lues, controle, lueA, resetAt))
      } catch (e) {
        const raison = messageHote(texteErreurJournal(e), [cle, puuid])
        await note(`Prix HenrikDev non gardés (${raison}) : anciens prix gardés.`)
        return { genre: "non-garde", raison: raisonCourte(raison) }
      }
    }
    await note(ligneJournalPrix(lues, controle))
    // Ticket 8.9 : l'issue, que dit la section « Prix du catalogue » des Réglages (etat-prix.json).
    return prixValides(controle) ? { genre: "valide", compares: controle.compares }
      : controle.compares === 0 ? { genre: "aucune" } : { genre: "refuse", ecarts: controle.ecarts, compares: controle.compares }
  } catch (e) {
    try {
      const texte = messageHote(e instanceof Error ? e.message : texteErreurJournal(e), [cle, puuid])
      await note(`Prix HenrikDev non lus (${texte}) : anciens prix gardés.`)
      return { genre: "non-lu", raison: raisonCourte(texte) }
    } catch { /* journal indisponible : rien */ }
    return null
  }
}

/**
 * Ticket 8.9 : les prix retenus. Chaque prix vu dans le storefront `brut` de cette lecture (prixVusDuStorefront : offres du
 * jour, Night Market au prix de base, objets des bundles, accessoires ; devise exacte ; un objet vu à deux montants : rien pour
 * lui) versé dans prix-vus.json (fusionnerPrixVus : rien d'effacé), écriture sûre, verrou tenu ; une ligne au journal, des
 * comptes seulement, dont les prix vus qui contredisent la table de référence (le prix vu gagne). Rend les prix retenus après
 * la lecture (ceux d'avant si l'écriture rate ; null, verrou repris ou erreur). Ne lève jamais.
 */
async function rangerPrixVus(brut: unknown, lueA: string, ref: Reference | null, j: Jeton): Promise<PrixVus | null> {
  try {
    let avant: string | null = null
    let present = false
    try {
      present = FileManager.existsSync(PRIX_VUS_FILE)
      if (present) avant = await FileManager.readAsString(PRIX_VUS_FILE)
    } catch { /* illisible : voir plus bas */ }
    // Présent mais pas relu (lecture en échec, contenu abîmé) : jamais réécrit, ses prix retenus ne sont pas perdus.
    if (present && (avant === null || !prixVusLisible(avant))) {
      await note("Prix retenus non gardés (prix-vus.json illisible) : fichier laissé tel quel.")
      return null
    }
    const anciens = lirePrixVus(avant)
    const lecture = prixVusDuStorefront(brut)
    const f = fusionnerPrixVus(anciens, lecture, lueA)
    if (!(await encore(j))) return null
    try {
      ecrireSur(PRIX_VUS_FILE, contenuPrixVus(f.prix))
    } catch (e) {
      await note(`Prix retenus non gardés (${masquerErreur(e)}) : anciens prix gardés.`)
      return anciens
    }
    await note(ligneJournalRetenus(f, lecture.douteux, contradictions(lecture, ref), ref !== null))
    return f.prix
  } catch (e) {
    try { await note(`Prix retenus non gardés (${masquerErreur(e)}).`) } catch { /* journal indisponible : rien */ }
    return null
  }
}

/**
 * Ticket 8.9 : etat-prix.json, que lit la section « Prix du catalogue » des Réglages : le dernier contrôle HenrikDev (`issue` ;
 * « déjà contrôlé » ou null gardent l'ancien) et le nombre de skins du Catalogue à prix par source, comme les dirait le
 * Catalogue à cette lecture (comptesPrix : boutique `shop` écrite, prix retenus, prix.json, table). Écriture sûre, verrou
 * tenu ; un échec : une ligne. Ne lève jamais.
 */
async function ecrireEtatPrix(cat: unknown, shop: unknown, lueA: string, issue: IssueHenrik | null, retenus: PrixVus | null, ref: Reference | null, j: Jeton) {
  try {
    const lire = (chemin: string): string | null => {
      try { return FileManager.existsSync(chemin) ? FileManager.readAsStringSync(chemin) : null } catch { return null }
    }
    const index = indexCatalogue(cat)
    const niveaux = index === null ? [] : index.skins.map((s) => s.niveau)
    // Catalogue vide (reconstruit en échec, sans ancien) : aucun compte à dire ; l'état d'avant reste.
    if (niveaux.length === 0) {
      await note("État des prix non écrit (catalogue des skins vide) : l'ancien reste.")
      return
    }



    const origines = lireOrigines(lire(ORIGINES_FILE))
    const parNiveau = new Map(index!.skins.map((s) => [s.niveau, s]))
    const comptes = comptesPrix(niveaux, lirePrix(lire(PRIX_FILE)), prixEnBoutique(shop, Date.now()), retenus, ref,
      (n) => { const s = parNiveau.get(n); return s ? provenanceDuSkin(s, origines) : null })
    const etat = etatPrix(lireEtatPrix(lire(ETAT_PRIX_FILE)), lueA, issue, comptes)
    if (!(await encore(j))) return
    ecrireSur(ETAT_PRIX_FILE, contenuEtatPrix(etat))
  } catch (e) {
    try { await note(`État des prix non écrit (${masquerErreur(e)}).`) } catch { /* journal indisponible : rien */ }
  }
}

/**
 * Met la réponse de Riot à plat, dans un format qui ne dépend pas de l'hôte : `data`
 * est le contenu de shop.json, objets de chaque bundle compris (CAP-25). Rend aussi
 * `niveaux`, les niveaux de skin du catalogue (skin et arme de chaque offre) pour les
 * alertes de la liste de souhaits ; ils ne vont pas dans shop.json.
 */
async function buildShopJson(raw: any, region: string, version: string, j: Jeton) {
  cataloguePublicMuet = false
  const cat = await catalog(version, j)
  // Objets rangés dans catalog.json à cette lecture : nouveaux, ou redécrits (accessoire d'avant CAP-25).
  let ajoutes = 0
  let redecrits = 0

  async function describe(id: string) {
    const e = cat.levels[id] ?? { name: id, icon: null, color: null }
    return { name: e.name, icon: await cacheIcon(id, e.icon, j), color: e.color }
  }

  /** Nom et image d'un bundle : catalogue local, sinon public (une fois, puis conservé), sinon l'identifiant. */
  async function decrireBundle(id: string) {
    let e: EntreeBundle | undefined = cat.bundles[id]
    if (!e) {
      const d = await objetPublic(`bundles/${id}`, j, cat.langue)
      if (d) {
        e = { name: texte(d.displayName) ?? id, icon: texte(d.displayIcon) }
        cat.bundles[id] = e
        ajoutes++
      }
    }

    if (!e && cat.anciens && Object.prototype.hasOwnProperty.call(cat.anciens.bundles, id)) e = cat.anciens.bundles[id]
    return { name: e?.name ?? id, icon: await cacheIcon(id, e?.icon ?? null, j) }
  }

  /**
   * L'entrée d'un accessoire (type, nom, icône et grand visuel de sa fiche, CAP-25) : celle
   * du catalogue local si elle est complète ; sinon le premier catalogue public qui connaît
   * l'identifiant (le type en découle, sans identifiant de type en dur), décrite par
   * decrireAccessoire (fiches.ts) et conservée ; une entrée sans grand visuel (d'avant
   * CAP-25) n'interroge que le catalogue de son type. Si rien ne répond : l'entrée gardée
   * telle quelle, ou rien (« autre », identifiant, sans image), et on réessaie à la
   * prochaine lecture. Aucune icône ici : la boutique d'accessoires garde la sienne, un
   * objet de bundle jamais (son image se lit dans catalog.json, à l'ouverture de sa fiche).
   */
  async function entreeAccessoire(id: string): Promise<unknown> {
    const connue: unknown = Object.prototype.hasOwnProperty.call(cat.accessories, id) ? cat.accessories[id] : undefined
    if (entreeValide(connue)) return connue


    const ancienne: unknown = connue === undefined && cat.anciens && Object.prototype.hasOwnProperty.call(cat.anciens.accessories, id)
      ? cat.anciens.accessories[id] : undefined
    const guide = connue ?? ancienne
    const sienne = estObjet(guide) ? SOURCES_ACCESSOIRES.find((s) => s.kind === guide.kind) : undefined
    for (const s of sienne ? [sienne] : SOURCES_ACCESSOIRES) {
      const d = await objetPublic(`${s.chemin}/${id}`, j, cat.langue)
      if (!d) continue
      const e: EntreeAccessoire = decrireAccessoire(s.kind, id, d)
      cat.accessories[id] = e
      if (connue === undefined) ajoutes++
      else redecrits++
      return e
    }
    return guide
  }

  const panel = raw.SkinsPanelLayout ?? {}
  const offers: any[] = panel.SingleItemStoreOffers ?? []
  const fallback: string[] = panel.SingleItemOffers ?? []
  const dailySecs = panel.SingleItemOffersRemainingDurationInSeconds ?? null

  const entries = offers.length
    ? offers.map((o) => ({
        id: o.Rewards?.[0]?.ItemID as string,
        cost: Object.values(o.Cost ?? {})[0] as number | undefined,
      }))
    : fallback.map((id) => ({ id, cost: undefined }))

  const items = []
  for (const e of entries) {
    const { name, icon, color } = await describe(e.id)
    items.push({ id: e.id, name, cost: e.cost ?? null, icon, color })
  }

  const nm = raw.BonusStore
  const nmSecs = nm?.BonusStoreRemainingDurationInSeconds ?? null

  const nmItems = []
  for (const o of nm?.BonusStoreOffers ?? []) {
    const id = o.Offer?.Rewards?.[0]?.ItemID as string
    const { name, icon, color } = await describe(id)
    nmItems.push({
      id, name, icon, color,
      cost: Object.values(o.Offer?.Cost ?? {})[0] ?? null,
      discounted: Object.values(o.DiscountCosts ?? {})[0] ?? null,
      discountPercent: o.DiscountPercent ?? null,
    })
  }

  const iso = (secs: number | null) =>
    secs === null ? null : new Date(Date.now() + secs * 1000).toISOString()







  const fb = raw?.FeaturedBundle
  const bundlesBruts: any[] = []
  if (!estObjet(fb)) {
    await note(`bundles : section FeaturedBundle ${fb == null ? "absente" : "inattendue"} (clés vues : ${cles(fb == null ? raw : fb)})`)
  } else if (!estObjet(fb.Bundle) && !Array.isArray(fb.Bundles)) {
    await note(`bundles : FeaturedBundle inattendu (clés vues : ${cles(fb)})`)
  } else {
    if (estObjet(fb.Bundle)) bundlesBruts.push(fb.Bundle)
    if (Array.isArray(fb.Bundles)) bundlesBruts.push(...fb.Bundles.filter(estObjet))
  }

  const bundles = []
  const vus = new Set<string>()
  for (const b of bundlesBruts) {
    const cle = texte(b.ID) ?? texte(b.DataAssetID)
    if (!cle) {
      await note(`bundles : bundle sans ID ignoré (clés vues : ${cles(b)})`)
      continue
    }
    if (vus.has(cle)) continue
    vus.add(cle)
    const id = texte(b.DataAssetID) ?? cle
    const { name, icon } = await decrireBundle(id)
    const secs = secondes(b.DurationRemainingInSeconds) ?? secondes(fb.BundleRemainingDurationInSeconds)
    const lus = lireObjetsBundle(b)
    for (const a of lus.anomalies) await note(`bundles : « ${name} » : ${a}`)
    const objets = []
    for (const o of lus.objets) {
      const e = estNiveau(cat.levels, o.id) ? undefined : await entreeAccessoire(o.id)
      const { kind, name: nom } = decrireObjet(o.id, cat.levels, e)
      objets.push({ id: o.id, kind, name: nom, cost: o.cost, discounted: o.discounted })
    }
    bundles.push({
      id, name, icon,
      cost: premierMontant(b.TotalBaseCost),
      discounted: premierMontant(b.TotalDiscountedCost),
      endsAt: iso(secs),
      items: objets,
    })
  }

  // ── Accessoires : `AccessoryStore.AccessoryStoreOffers[]`, prix en Kingdom Credits,
  // fin commune à toute la rotation. Même prudence que pour les bundles.
  const acc = raw?.AccessoryStore
  let accBruts: any[] = []
  if (!estObjet(acc)) {
    await note(`accessoires : section AccessoryStore ${acc == null ? "absente" : "inattendue"} (clés vues : ${cles(acc == null ? raw : acc)})`)
  } else if (!Array.isArray(acc.AccessoryStoreOffers)) {
    await note(`accessoires : AccessoryStore inattendu (clés vues : ${cles(acc)})`)
  } else {
    accBruts = acc.AccessoryStoreOffers.filter(estObjet)
  }
  const accSecs = estObjet(acc) ? secondes(acc.AccessoryStoreRemainingDurationInSeconds) : null
  const accEndsAt = iso(accSecs)

  const accItems = []
  for (const o of accBruts) {
    const id = texte(o.Offer?.Rewards?.[0]?.ItemID)
    if (!id) {
      await note(`accessoires : offre sans ItemID ignorée (clés vues : ${cles(o)}${estObjet(o.Offer) ? ` ; Offer : ${cles(o.Offer)}` : ""})`)
      continue
    }
    const e = await entreeAccessoire(id)
    const { kind, name } = decrireObjet(id, null, e)
    const icon = await cacheIcon(id, estObjet(e) ? texte(e.icon) : null, j)
    accItems.push({ id, kind, name, icon, cost: premierMontant(o.Offer?.Cost), endsAt: accEndsAt })
  }

  if (ajoutes + redecrits > 0) await conserverObjets(cat, j)
  const nObjets = bundles.reduce((n, b) => n + b.items.length, 0)
  const ranges = [
    ajoutes > 0 ? `${ajoutes} ${ajoutes > 1 ? "objets ajoutés" : "objet ajouté"} au catalogue` : "",
    redecrits > 0 ? `${redecrits} ${redecrits > 1 ? "redécrits" : "redécrit"}` : "",
  ].filter((t) => t !== "").join(", ")
  await note(`Bundles en vedette : ${bundles.length} (${nObjets} ${nObjets > 1 ? "objets" : "objet"}), accessoires : ${accItems.length}`
    + (ranges ? ` (${ranges})` : "") + ".")

  const data = {
    updatedAt: new Date().toISOString(),
    region, version,

    langue: langueDesNoms(),
    daily: { items, remainingSeconds: dailySecs, resetAt: iso(dailySecs) },
    nightMarket: nm
      ? { active: true, items: nmItems, remainingSeconds: nmSecs, endsAt: iso(nmSecs) }
      : { active: false, items: [], remainingSeconds: null, endsAt: null },
    bundles,
    accessories: { items: accItems, remainingSeconds: accSecs, endsAt: accEndsAt },
  }
  return { data, niveaux: cat.levels, cat }
}

// ─────────────────────────── points d'entrée ───────────────────────────

/** HH:MM en heure locale, pour le journal ; « ? » si l'horodatage est absent ou invalide. */
function heure(iso: unknown): string {
  const d = new Date(typeof iso === "string" ? iso : NaN)
  if (Number.isNaN(d.getTime())) return "?"
  const deux = (n: number) => String(n).padStart(2, "0")
  return `${deux(d.getHours())}:${deux(d.getMinutes())}`
}

/**
 * Envoie une alerte : notification ordinaire, `timeSensitive` seulement si elle est
 * urgente. Un envoi refusé ou en erreur se journalise et n'arrête rien.
 */
async function notifier(alerte: Alerte) {
  const options: Parameters<typeof Notification.schedule>[0] = { title: "ValShop", body: await traduireHorsVue(alerte.corps) }
  if (alerte.urgent) options.interruptionLevel = "timeSensitive"
  let sort = ""
  try {
    if (!(await Notification.schedule(options))) sort = " (envoi refusé)"
  } catch (e) {
    sort = " (envoi en erreur : " + masquerErreur(e) + ")"
  }
  await note(`alerte : ${alerte.titre}${sort}`)
}

/**
 * Signale un échec au widget : etat.json (contrat-donnees.md), puis rechargement.
 * Le moteur ne relit jamais ce fichier ; une erreur d'écriture se journalise, rien de plus.
 */
async function signalerEtat(sessionExpiree: boolean, erreur: string) {
  try {
    await FileManager.writeAsString(ETAT_FILE, nouvelEtat(sessionExpiree, erreur, Date.now()))
  } catch (e) {
    await note("etat.json non écrit (" + masquerErreur(e) + ").")
  }
  Widget.reloadAll()
}

/** La lecture a réussi : plus rien à signaler. Une erreur d'effacement se journalise, rien de plus. */
async function effacerEtat() {
  try {
    if (FileManager.existsSync(ETAT_FILE)) FileManager.removeSync(ETAT_FILE)
  } catch (e) {
    await note("etat.json non effacé (" + masquerErreur(e) + ").")
  }
}






async function garderIdentite(puuid: string, region: string) {
  try {
    garderCompte({ puuid, region }, Date.now())
    await note(`stats : compte gardé (région ${region}).`)
  } catch (e) {
    await note("stats : compte non gardé (" + masquerErreur(e, [puuid]) + ").")
  }
}

/**
 * Liste de souhaits pour les alertes, lue sans jamais l'écrire. Absente : vide ;
 * corrompue : vide (lireListe) ; illisible : vide et une ligne de journal, la
 * lecture de la boutique continue.
 */
async function lireSouhaits(): Promise<Souhait[]> {
  try {
    return FileManager.existsSync(WISHLIST_FILE) ? lireListe(await FileManager.readAsString(WISHLIST_FILE)) : []
  } catch (e) {
    await note("liste de souhaits illisible (" + masquerErreur(e) + ") : aucune alerte de liste.")
    return []
  }
}

/**
 * Comment une lecture est lancée : `login`, fenêtre de connexion possible (premier plan) ;
 * `par`, l'origine écrite dans le verrou ; `bouton`, lancée par « Lire la boutique » (entrée 10) :
 * l'écran dit l'issue, aucune notification d'échec ni de session expirée ; `solde` (entrée 17 de epic-boutique-visuels),
 * lancée par un appui : la boutique du jour déjà en cache, le seul solde est relu.
 */
type ModeLecture = { login: boolean; par: OrigineVerrou; bouton: boolean; solde: boolean }

/** Ce que rend une lecture : son issue (le bouton) et sa ligne de résumé (`refresh`, inchangée). */
type Lecture = { issue: IssueLecture; resume: string }

/** Les secondes, arrondies au-dessus, d'ici `t` (ms depuis l'epoch) ; 0 au plus tôt. */
function secondesJusqua(t: number, now: number): number {
  return Math.max(0, Math.ceil((t - now) / 1000))
}

/** La lecture de la boutique, garde-fou et verrou compris (refresh, lireBoutique). */
async function lire(mode: ModeLecture): Promise<Lecture> {
  const { login: allowLogin, par, bouton } = mode
  const hasCookies = loadCookies().length > 0
  await note(hasCookies
    ? `— Mise à jour (${bouton ? "bouton Lire la boutique" : allowLogin ? "app" : "arrière-plan"}) —`
    : "— Première connexion —")

  // Verrou : une seule mise à jour à la fois. Lecture puis écriture synchrones,
  // sans `await` entre les deux : la collision se réduit à quelques millisecondes
  // (poserVerrou) ; la lecture ne requiert puis n'écrit qu'en tenant son verrou (tient).
  // Un verrou laissé par une lecture finie (entrée 10, lireVerrou) est remplacé.
  const now = Date.now()
  const contenu = lireFichierVerrou()
  const lu = lireVerrou(contenu, now, EXECUTION, tenuIci(contenu))
  if (lu.etat === "actif") {
    await note(`garde-fou : déjà en cours (depuis ${Math.floor(lu.age / 1000)} s) : libre dans ${secondesJusqua(lu.reessai, now)} s`)
    return { issue: { genre: "en-cours", reessai: lu.reessai }, resume: "déjà en cours" }
  }
  const { jeton: j, erreur } = poserVerrou(now, par)
  if (erreur !== null) await note("garde-fou : verrou non écrit (" + masquerErreur(erreur) + ").")
  if (lu.etat === "mort") {
    const cause = lu.cause === "avenir" ? "daté dans l'avenir"
      : `${lu.cause === "execution" ? "laissé par cette exécution"
        : lu.cause === "budget" ? "arrière-plan au-delà du budget d'iOS"
          : "sans activité depuis 60 s"}, posé il y a ${Math.floor(lu.age / 1000)} s`
    await note(`garde-fou : verrou d'une lecture finie remplacé (${cause})`)
  }

  // Verrou repris par une autre lecture (ou budget dépassé) : rien d'écrit, rien de notifié ; l'issue
  // est celle d'une lecture déjà en cours, jusqu'à ce que le verrou d'autrui ne bloque plus.
  const arret = (): Lecture => {
    const autre = lireVerrou(lireFichierVerrou(), Date.now(), "", false)
    return { issue: { genre: "en-cours", reessai: autre.etat === "actif" ? autre.reessai : Date.now() }, resume: "verrou repris" }
  }

  try {
    // Garde-fou : une lecture Riot par journée Valorant, bornée par le reset de l'API.
    let cache: BoutiqueLue | null = null
    try {
      if (FileManager.existsSync(SHOP_FILE)) cache = JSON.parse(await FileManager.readAsString(SHOP_FILE))
    } catch (e) {
      await note("garde-fou : shop.json illisible (" + masquerErreur(e) + ").")
    }

    if (deciderLectureLangue(now, cache, langueDesNoms()) === "cache") {
      await note(`garde-fou : cache (lue à ${heure(cache?.updatedAt)}, reset à ${heure(cache?.daily?.resetAt)})`)
      const resetAt = cache?.daily?.resetAt
      // Entrée 17 de epic-boutique-visuels : sur un appui, le seul solde est relu sous cette boutique (il change plus souvent
      // qu'elle) ; jamais depuis ↻, Raccourcis ni la lecture automatique de l'ouverture : l'issue reste alors celle d'avant.
      const solde = mode.solde ? await relireSolde(cache, hasCookies, j) : null
      return {
        issue: { genre: "a-jour", resetAt: typeof resetAt === "string" ? resetAt : null, ...(solde !== null ? { solde } : {}) },
        resume: "boutique du jour en cache",
      }
    }
    await note("garde-fou : lecture")

    let tokens = hasCookies ? await reauth(j) : null
    if (!(await encore(j))) return arret()

    if (!tokens && !allowLogin) {
      // Sans aucune réponse de Riot, la session est peut-être vivante : le journal
      // le dit, et le widget ne signale pas une session expirée (que ce qui est sûr).
      const reseau = hasCookies && reseauIndisponible
      const why = !hasCookies ? "aucun cookie en mémoire" : reseau ? "réseau indisponible" : "session expirée"
      await note(`Reconnexion impossible ${bouton ? "sans fenêtre de login" : "en arrière-plan"} (${why}).`)



      if (!(await encore(j))) return arret()
      if (!reseau && !bouton) {
        Notification.schedule({
          title: "ValShop",
          body: await traduireHorsVue("Ta session Riot a expiré. Ouvre l'app pour te reconnecter."),
          interruptionLevel: "timeSensitive",
        })
      }
      await signalerEtat(!reseau, why)
      return reseau
        ? { issue: { genre: "reseau" }, resume: "réseau indisponible" }
        : { issue: { genre: "session" }, resume: "reconnexion manuelle nécessaire" }
    }


    if (!tokens && hasCookies && reseauIndisponible) {
      await note("Reconnexion impossible (réseau indisponible).")
      if (!(await encore(j))) return arret()
      await signalerEtat(false, "réseau indisponible")
      return { issue: { genre: "reseau" }, resume: "réseau indisponible" }
    }
    if (!tokens) tokens = await loginVisible()
    if (!(await encore(j))) return arret()
    if (!tokens) {
      await note("Connexion abandonnée.")
      if (!(await encore(j))) return arret()
      await signalerEtat(true, "connexion abandonnée")
      return { issue: { genre: "session" }, resume: "connexion abandonnée" }
    }

    try {
      const { shop, region, shard, version, puuid, entetes } = await fetchShop(tokens, j)
      const { data, niveaux, cat } = await buildShopJson(shop, region, version, j)
      // Alertes : comparées au fichier précédent et à la liste de souhaits avant
      // d'écraser le fichier, envoyées après l'écriture réussie seulement (partie
      // avant une écriture ratée, une alerte repartirait à la lecture suivante).
      const liste = await lireSouhaits()
      const alertes = comparer(cache, data, { liste, niveaux })
      // Avant chaque écriture et chaque notification : le verrou toujours tenu (entrée 10).
      if (!(await encore(j))) return arret()
      await FileManager.writeAsString(SHOP_FILE, JSON.stringify(data, null, 2))
      // Boutique écrite : l'état d'échec, s'il existait, s'efface avant que le widget relise.
      if (!(await encore(j))) return arret()
      await effacerEtat()
      // Le compte de cette lecture, pour les stats : changement de compte compris.
      if (!(await encore(j))) return arret()
      await garderIdentite(puuid, region)

      if (!(await encore(j))) return arret()
      await garderJourBoutique(puuid, data)

      // Lot 2 des widgets : le skin et l'arme de chaque offre du jour, pour le widget Souhaits (widget-souhaits.json), avant le
      // rechargement des widgets ; un échec n'y change rien (le widget Souhaits montre alors la boutique).
      if (!(await encore(j))) return arret()
      try {
        await FileManager.writeAsString(SOUHAITS_WIDGET_FILE, contenuOffres(data, niveaux))
      } catch (e) {
        try { await note(`Offres du widget Souhaits non écrites (${masquerErreur(e)}).`) } catch { /* journal indisponible : rien */ }
      }

      Widget.reloadAll()




      for (const alerte of alertes) {
        if (!(await encore(j))) return arret()
        await notifier(alerte)
      }

      // Ticket 8.6 : les prix du Catalogue chez HenrikDev (Riot a retiré store/v1/offers/, ticket 8.5), contrôlés contre ceux
      // de cette boutique, après la boutique écrite et notifiée (un échec n'y change rien ; verrou repris entre-temps : rien
      // de demandé, la lecture reste « lue »).
      const issue = (await encore(j)) ? await rangerPrix(shop, puuid, region, data.updatedAt, data.daily.resetAt, j) : null
      // Ticket 8.9 : les prix vus dans cette boutique gardés pour de bon (prix-vus.json), puis l'état des prix des Réglages ;
      // un échec n'y change rien (la lecture reste « lue »).
      if (await encore(j)) {
        const ref = lireTableReference()
        const retenus = await rangerPrixVus(shop, data.updatedAt, ref, j)
        if (await encore(j)) await ecrireEtatPrix(cat, data, data.updatedAt, issue, retenus, ref, j)
      }

      // Entrée 17 de epic-boutique-visuels : le solde du compte, une requête, en dernier : après la boutique écrite, le widget
      // rechargé, les alertes envoyées et les prix rangés, pour ne rien prendre à ce que la lecture faisait avant lui (le budget
      // d'un ↻). Un échec n'y change rien ; verrou repris ou budget passé entre-temps : rien de demandé, la lecture reste « lue ».
      if (await encore(j)) await rangerSolde(shard, puuid, entetes, data.updatedAt, j)

      if (par !== "arriere-plan" && (await encore(j))) await rangerCollection(shard, puuid, entetes, j)

      const names = data.daily.items.map((i: any) => i.name).join(", ")

      await note(`✅ Boutique écrite (${region}/${shard}) en ${Date.now() - started} ms.`)
      const lueA = (data as { updatedAt?: unknown }).updatedAt
      return { issue: { genre: "lue", lueA: typeof lueA === "string" ? lueA : null }, resume: names || "boutique mise à jour" }
    } catch (e) {
      if (!(await encore(j))) return arret()
      await note("❌ Échec de la mise à jour : " + masquerErreur(e))
      // Boutique en 403 après une reconnexion réussie : maintenance probable, dite
      // comme telle ; tout autre échec garde le message général. Depuis le bouton,
      // l'écran le dit : pas de notification (entrée 10).
      const riot = e instanceof EchecRiot
      const maintenance = riot && maintenanceProbable(e.etape, e.statut)
      if (!(await encore(j))) return arret()
      if (!bouton) {
        Notification.schedule({
          title: "ValShop",
          body: await traduireHorsVue(maintenance
            ? "Boutique indisponible chez Riot, maintenance probable. Réessaie plus tard."
            : "La mise à jour a échoué. Détail dans le journal."),
          interruptionLevel: "timeSensitive",
        })
      }
      await signalerEtat(false, masquerErreur(e))
      return { issue: riot ? { genre: "riot", maintenance } : { genre: "echec" }, resume: "échec : " + masquerErreur(e) }
    }
  } finally {
    // Succès ou échec, le verrou s'efface : l'appui suivant n'est jamais bloqué. Seulement le
    // sien : repris par une autre lecture (celui-ci jugé mort), il n'est pas touché (entrée 10).
    relacher(j)
  }
}

/**
 * Rafraîchit la boutique.
 * @param allowLogin true au premier plan (une fenêtre de connexion peut s'ouvrir),
 *                   false en arrière-plan (aucune interface possible).
 * @returns une ligne de résumé.
 */
export async function refresh(allowLogin: boolean): Promise<string> {
  return (await lire({ login: allowLogin, par: allowLogin ? "app" : "arriere-plan", bouton: false, solde: false })).resume
}

/**
 * Le bouton « Lire la boutique » de l'onglet Boutique (entrée 10) : la lecture de ↻, garde-fou et
 * verrou compris, au premier plan mais sans fenêtre de login, et son issue ; ne lève jamais (une
 * erreur levée : « echec », une ligne au journal). Entrée 17 de epic-boutique-visuels : `solde`, vrai pour un appui
 * (jamais pour la lecture automatique de l'ouverture) : la boutique déjà à jour, le seul solde est relu, et l'issue le dit.
 */
export async function lireBoutique(solde: boolean = false): Promise<IssueLecture> {
  try {
    return (await lire({ login: false, par: "app", bouton: true, solde })).issue
  } catch (e) {
    await note("Lire la boutique : erreur (" + masquerErreur(e) + ").")
    return { genre: "echec" }
  }
}

/** Attente maximale, à la fermeture de l'app, d'une lecture lancée par « Lire la boutique » (entrée 10). */
const ATTENTE_SORTIE_MS = 30_000

/**
 * Après la fermeture de l'app (index.tsx), avant la fin du script, un changement de compte ou un
 * login : attend la fin des lectures de cette exécution (le bouton « Lire la boutique » touché juste
 * avant Fermer), 30 s au plus, pour que leur verrou s'efface proprement ; au-delà, leurs verrous sont
 * rendus et elles s'arrêtent sans rien écrire (tient). Aucune lecture en cours : rend la main aussitôt.
 */
export async function finirLectures(): Promise<void> {
  if (jetons.size === 0) return
  await note("app fermée pendant une lecture : attente de sa fin (30 s au plus).")
  const limite = Date.now() + ATTENTE_SORTIE_MS
  while (jetons.size > 0 && Date.now() < limite) await new Promise<void>((fin) => setTimeout(() => fin(), 250))
  if (jetons.size === 0) {
    await note("app fermée : lecture terminée, verrou effacé.")
    return
  }
  for (const j of [...jetons]) {
    j.perdu = true
    j.dit = true
    relacher(j)
  }
  await note("app fermée : lecture toujours en cours après 30 s, verrou rendu ; elle s'arrêtera sans rien écrire.")
}

// ─────────────────────────── changement de compte ───────────────────────────

/** Attente maximale d'une mise à jour en cours avant de remplacer le compte. */
const ATTENTE_VERROU_MS = 10_000

/**
 * Prend le verrou pour le changement de compte, ou pour la déconnexion (`quoi`, dit au journal) : attend qu'il soit
 * libre (un verrou mort ne compte pas, lireVerrou, comme dans `refresh`), 10 s au plus, puis
 * l'écrit, libre ou non. Lecture puis écriture synchrones, sans `await` entre les deux.
 */
async function prendreVerrou(quoi: string = "changement de compte"): Promise<Jeton> {
  const limite = Date.now() + ATTENTE_VERROU_MS
  let attendu = false
  for (;;) {
    const now = Date.now()
    let verrou: string | null = null
    try {
      if (FileManager.existsSync(VERROU_FILE)) verrou = FileManager.readAsStringSync(VERROU_FILE)
    } catch { /* verrou illisible : il ne compte pas */ }
    const libre = lireVerrou(verrou, now, EXECUTION, tenuIci(verrou)).etat !== "actif"
    if (libre || now >= limite) {
      // Le jeton du changement de compte, tenu par cette exécution comme celui d'une lecture.
      const { jeton, erreur } = poserVerrou(now, "app")
      if (erreur !== null) await note(quoi + " : verrou non écrit (" + masquerErreur(erreur) + ").")
      if (!libre) {
        await note(`${quoi} : mise à jour toujours en cours après ${ATTENTE_VERROU_MS / 1000} s, remplacement quand même.`)
      } else if (attendu) {
        await note(quoi + " : verrou libre.")
      }
      return jeton
    }
    if (!attendu) {
      attendu = true
      await note(`${quoi} : mise à jour en cours, attente du verrou (${ATTENTE_VERROU_MS / 1000} s au plus).`)
    }
    await new Promise<void>((fin) => setTimeout(() => fin(), 500))
  }
}

/**
 * Ticket 7.8 (E1-a) : retire du magasin de cookies persistant des vues web, que tout script de Scripting partage, les cookies
 * Riot (cookiesRiot de garde-fou.ts) qu'y a laissés une connexion d'avant ce ticket (la page de login était persistante) ; les
 * autres cookies n'y sont pas touchés, et rien n'y est jamais posé : la session vit dans le trousseau seulement. Rend le
 * nombre de cookies Riot trouvés, retirés, et les échecs (noms et comptes seulement : le texte d'une erreur levée sur un cookie
 * pourrait contenir sa valeur). Ne lève jamais.
 */
async function retirerCookiesRiot(): Promise<{ trouves: number; retires: number; echecs: string[] }> {
  const echecs: string[] = []
  let trouves = 0
  let retires = 0
  let webView: WebViewController | null = null
  try {
    webView = new WebViewController() // magasin persistant, sans fenêtre
    let anciens: Cookie[] = []
    try {
      anciens = cookiesRiot(await webView.getAllCookies())
    } catch {
      echecs.push("cookies illisibles")
    }
    trouves = anciens.length
    for (const c of anciens) {
      try {
        if (await webView.deleteCookie(c)) retires++
        else echecs.push(`${c.name} non retiré`)
      } catch {
        echecs.push(`${c.name} non retiré (erreur)`)
      }
    }
  } catch {
    echecs.push("fenêtre web indisponible")
  } finally {
    try { webView?.dispose() } catch { /* déjà libérée */ }
  }
  return { trouves, retires, echecs }
}

/**
 * Ticket 7.8 (E1-a) : au lancement de l'app (index.tsx), sans la retenir : les cookies Riot du magasin persistant retirés
 * (retirerCookiesRiot) ; une ligne au journal seulement s'il y en avait, ou sur un échec, en comptes. Ne lève jamais.
 */
export async function nettoyerCookiesPersistants(): Promise<void> {
  try {
    const r = await retirerCookiesRiot()
    if (r.trouves === 0 && r.echecs.length === 0) return
    await note(r.echecs.length === 0
      ? `fenêtre web : ${r.retires} cookies Riot retirés du magasin partagé (la session reste dans le trousseau).`
      : `⚠️ fenêtre web : ${r.retires} cookies Riot retirés sur ${r.trouves} (${r.echecs.join(", ")}) ; nouvel essai au prochain lancement.`)
  } catch { /* rien : l'app s'ouvre quand même */ }
}

/**
 * Change de compte (CAP-14), au premier plan : page de login Riot dans une fenêtre
 * web éphémère ; à la réussite seulement, sous le verrou, le trousseau passe au nouveau
 * compte (ticket 7.8 : la fenêtre web persistante n'en reçoit rien, ses cookies Riot
 * d'avant sont retirés), et `shop.json`, `solde.json` (entrée 17 de epic-boutique-visuels) et `etat.json`
 * de l'ancien sont effacés ; le verrou relâché, une lecture normale
 * (`refresh(true)`) écrit la boutique du nouveau compte et recharge le widget.
 * Login abandonné : rien ne change. Catalogue, icônes, liste de souhaits et
 * journal ne sont jamais touchés.
 * @returns une ligne de résumé.
 */
export async function changerDeCompte(): Promise<string> {
  await note("— Changement de compte —")

  let compte: NouveauCompte | null
  try {
    compte = await loginEphemere()
  } catch (e) {
    await note("changement de compte : connexion en erreur (" + masquerErreur(e) + "), rien ne change.")
    return "changement de compte en erreur"
  }
  if (!compte) {
    await note("changement de compte abandonné : rien ne change.")
    return "changement de compte abandonné"
  }
  await note("changement de compte : connexion réussie.")

  const jeton = await prendreVerrou()
  try {
    // Le trousseau fait foi pour la reconnexion silencieuse : s'il refuse le
    // nouveau compte, on s'arrête avant de toucher au reste, rien n'a changé.
    let range = false
    try {
      range = saveCookies(fromWebView(compte.trousseau))
    } catch { /* journalisé juste après, sans le texte de l'erreur (valeurs possibles) */ }
    if (!range) {
      await note("changement de compte : trousseau non écrit, l'ancien compte reste en place.")
      return "changement de compte en erreur"
    }
    await note(`changement de compte : trousseau au nouveau compte (${compte.trousseau.length} cookies).`)

    // Ticket 7.8 (E1-a) : rien n'est posé dans le magasin persistant des vues web ; ce qu'une ancienne connexion y a laissé est retiré.
    const r = await retirerCookiesRiot()
    await note(r.echecs.length === 0
      ? `changement de compte : fenêtre web sans cookie Riot (${r.retires} retirés).`
      : `⚠️ changement de compte : ${r.retires} cookies Riot retirés de la fenêtre web sur ${r.trouves} (${r.echecs.join(", ")}).`)

    // Seul passe-droit au garde-fou : sans boutique en cache, la lecture qui suit
    // interroge Riot. etat.json, s'il existait, parlait de l'ancien compte ; le compte des
    // stats aussi : la lecture qui suit garde le nouveau (ses données restent, par PUUID).
    await note("changement de compte : effacement de shop.json, solde.json, collection.json, etat.json et du compte des stats de l'ancien compte.")
    try {
      if (FileManager.existsSync(SHOP_FILE)) FileManager.removeSync(SHOP_FILE)
    } catch (e) {
      await note("shop.json non effacé (" + masquerErreur(e) + ") : le garde-fou peut garder l'ancienne boutique jusqu'au reset.")
    }
    await effacerSolde()
    await effacerEtat()
    try {
      effacerCompte()
    } catch (e) {
      await note("stats/compte.json non effacé (" + masquerErreur(e) + ") : Mettre à jour pourrait viser l'ancien compte jusqu'à la prochaine lecture réussie.")
    }
  } finally {
    // Relâché avant la lecture, qui le prend à son tour.
    // Seulement le sien : jamais le verrou d'une autre lecture (entrée 10).
    relacher(jeton)
  }

  return await refresh(true)
}

/**
 * Se déconnecter de Riot (epic-installation-ami, entrée 11), au premier plan, l'app fermée, sans aucune requête : sous le
 * verrou des lectures, la session Riot est retirée du trousseau, relu pour preuve (s'il la porte encore, rien d'autre ne
 * change, et une notification le dit) ; puis ce qui dit qu'un compte est connecté est effacé : les cookies Riot du magasin
 * partagé des vues web, `shop.json`, `solde.json` (entrée 17 de epic-boutique-visuels), `etat.json` et le compte des stats ; le widget est rechargé. Catalogue, icônes, liste de
 * souhaits, journal, prix, clé HenrikDev et historique des parties (un dossier par compte) ne sont jamais touchés : une
 * reconnexion au même compte retrouve son historique. La session n'est pas fermée chez Riot.
 * @returns vrai si la session n'est plus au trousseau.
 */
export async function seDeconnecter(): Promise<boolean> {
  await note("— Déconnexion —")
  const jeton = await prendreVerrou("déconnexion")
  try {
    // Le trousseau d'abord : c'est lui qui reconnecte. S'il refuse, on s'arrête avant de toucher au reste.
    let retiree = false
    try {
      Keychain.remove(COOKIE_KEY)
      retiree = !Keychain.contains(COOKIE_KEY)
    } catch { /* journalisé juste après, sans le texte de l'erreur (valeurs possibles) */ }
    if (!retiree) {
      await note("déconnexion : session Riot non retirée du trousseau, rien d'autre ne change.")
      Notification.schedule({
        title: "ValShop",
        body: await traduireHorsVue("La déconnexion a échoué. Détail dans le journal."),
        interruptionLevel: "timeSensitive",
      })
      return false
    }
    await note("déconnexion : session Riot retirée du trousseau.")

    const r = await retirerCookiesRiot()
    await note(r.echecs.length === 0
      ? `déconnexion : fenêtre web sans cookie Riot (${r.retires} retirés).`
      : `⚠️ déconnexion : ${r.retires} cookies Riot retirés de la fenêtre web sur ${r.trouves} (${r.echecs.join(", ")}).`)

    await note("déconnexion : effacement de shop.json, solde.json, collection.json, etat.json et du compte des stats.")
    try {
      if (FileManager.existsSync(SHOP_FILE)) FileManager.removeSync(SHOP_FILE)
    } catch (e) {
      await note("shop.json non effacé (" + masquerErreur(e) + ") : l'app et le widget montrent encore l'ancienne boutique.")
    }
    await effacerSolde()
    await effacerEtat()
    try {
      effacerCompte()
    } catch (e) {
      await note("stats/compte.json non effacé (" + masquerErreur(e) + ") : les stats montrent encore l'ancien compte.")
    }
    try { Widget.reloadAll() } catch { /* widget indisponible : il se relira à son prochain réaffichage */ }
    return true
  } finally {
    // Seulement le sien : jamais le verrou d'une autre lecture (entrée 10).
    relacher(jeton)
  }
}

/**
 * Ticket 7.8 (F3) : pour le harnais seulement : une icône mise en cache hors d'une lecture (cacheIcon, un jeton sans verrou écrit),
 * pour éprouver ses refus (id, hôte, taille) sans toute une lecture de boutique.
 */
export function iconeEnCache(id: string, url: string | null): Promise<string | null> {
  return cacheIcon(id, url, { depuis: 0, par: "app", ecrit: false, perdu: false, dit: false })
}

// Pour index.tsx, la fin du journal ; pour les écrans (widget.tsx, vue.tsx), les chemins des fichiers qu'ils lisent,
// et celui de wishlist.json, que la vue écrit aussi ; pour la collecte des stats (collecte.ts), le journal, les
// cookies du trousseau, lus sans requête pour en tirer le PUUID, shop.json, pour sa région, et catalog.json, pour
// les rôles des agents (section `agents`, que `catalog()` garde) ; pour l'onglet Boutique, solde.json (entrée 17 de
// epic-boutique-visuels).
export { tailJournal, note, loadCookies, COLLECTION_FILE, HISTORIQUE_BOUTIQUE_FILE, SHOP_FILE, ETAT_FILE, CATALOG, WISHLIST_FILE, PRIX_FILE, PRIX_VUS_FILE, ETAT_PRIX_FILE, ACCESSOIRES_FILE, ORIGINES_FILE, SOLDE_FILE }
