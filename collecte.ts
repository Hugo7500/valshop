import { AbortSignal, AppEvents, Script, fetch } from "scripting"
import { etapesDesParties, lignesRrLues, premiereLecture, synchroniser, type Base, type BilanIndex, type EtapeLecture, type Ligne } from "./base"
import { lireCle } from "./cle"
import {
  CODES_COMPTE_INCONNU, CODE_SANS_CLASSEMENT, DETAIL_COMPTE_INCONNU, LIGNE_DEJA, LIGNE_DEJA_RAFRAICHIR, LIGNE_SANS_CLE, LIGNE_SANS_COMPTE, annoncesRiot, attenteRestante,
  classerStatut, codeErreur, deciderMajAuto, delaiLimite,
  fusionnerRr, ligneArretee, lignesRr, lireQuota, messageHote, metaRemiseAZero, nouvelEchec, puuidDesCookies, quotaEpuise,
  rangDepuisMmr, regionDeBoutique, suiteDeLigne, texteBandeauRiot, texteEchec, texteLigne, type DecisionMajAuto, type Identite, type LigneRr, type Meta,
  type Quota, type Rang, type Reprise, type ResultatMiseAJour, type RiotId, type TypeEchec,
} from "./historique"
import {
  RESET_MAX_S, TAILLE_PAGE, agentsDeValorantApi, ajouterCumuls, attenteAdmise, attenteAvantDetail, attenteAvantPage, cheminsSuspects, delaiBorne,
  abandonneeBrute, echeanceAtteinte, estSemaine, fileAAchat, partiesDeLaPage, placeBrute, placeDe, quotaApresEchec, repereBrut, riotIdDe, rolesDeSection,
  texteAvancee, type Precedente, type SectionAgents, type Semaine,
} from "./parties"
import { VERSION_REDUCTION, depensesDeV2, reduirePartie, type CumulAgent, type DepensesRiot, type Partie, type Roles } from "./reduction"
import { SANS_PRO_FORCE, creerMaintien, lirePro, type FinMaintien, type Pro, type TacheMaintenue } from "./pro"
import { PARTIES_AVANT_TROU, conclure, depart, examiner, type Fin, type Traitee, type Vue } from "./reprise"
import {
  lireRessources, sansImages, sectionDeValorantApi, sectionsARelire, versionDuJeu, type NomRessource, type Ressources,
} from "./ressources"
import {
  cheminIndex, ecrireImage, ecrireMeta, ecrirePartie, ecrireRang, ecrireRr, ecrireSemaine, ecrireSur, effacerIndex, fichiersCumuls,
  fichiersParties, indexPresent, lireCompte, historiquePresent, imagePresente, importIci, lireCumuls, lireHistorique, lireJson,
  lireMarqueur, lireMeta, lireRang, lireRr, lireSemaine, metaIllisible, mettreDeCote, nombreParties, partieDuFichier, partieGardee,
  plusRecenteDabord, prendreMarqueur, rafraichirMarqueur, relacherMarqueur, relatifPartie,
} from "./stockage"
import { CATALOG, SHOP_FILE, loadCookies, note } from "./valshop"
import { BORNE_IMAGE, BORNE_JSON, ReponseTropGrande, tailleAnnoncee, texteBorne } from "./securite"










































































const HENRIKDEV = "https://api.henrikdev.xyz"
/** `{platform}` des adresses de HenrikDev : Valorant sur PC, seule plateforme du compte. */
const PLATEFORME = "pc"
/** Délai d'une requête, en secondes. */
const DELAI_REQUETE = 20
/** Borne du corps d'une réponse 404 de HenrikDev, où se lit son code d'erreur : quelques lignes de JSON. */
const BORNE_ERREUR = 64 * 1024
/** Délai d'une page de la liste v4, en secondes : HenrikDev peut devoir demander ses dix parties à Riot. */
const DELAI_PAGE = 90
/** Rôles des agents jouables sur valorant-api, libellés anglais (sa langue par défaut). */
const AGENTS_VALORANT_API = "https://valorant-api.com/v1/agents?isPlayableCharacter=true"
/** Ressources des stats (entrée 9) : où valorant-api donne chaque section, et le délai de sa requête, en secondes. */
const RESSOURCES_VALORANT_API: Record<NomRessource, { adresse: string; delai: number }> = {
  // Callouts en anglais, sa langue par défaut : « A Main » de la maquette.
  cartes: { adresse: "https://valorant-api.com/v1/maps", delai: DELAI_REQUETE },

  paliers: { adresse: "https://valorant-api.com/v1/competitivetiers?language=fr-FR", delai: DELAI_REQUETE },

  armes: { adresse: "https://valorant-api.com/v1/weapons", delai: 40 },
  // Ticket 4.52 : les noms fr-FR des capacités (par emplacement) et les dates des actes.
  capacites: { adresse: "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=fr-FR", delai: DELAI_REQUETE },
  saisons: { adresse: "https://valorant-api.com/v1/seasons", delai: DELAI_REQUETE },
}
/** Délai du téléchargement d'une image des ressources, en secondes, comme celui d'une icône de la boutique. */
const DELAI_IMAGE = 20
/** Chemins d'un refus écrits au journal, au plus : les autres sont comptés. */
const CHEMINS_AU_JOURNAL = 8
/** Une longue attente (jusqu'à 601 s) se fait par tranches d'une minute au plus, le marqueur (périmé après 2 min) rafraîchi après chacune. */
const TRANCHE_MS = 60_000

/**
 * Ce que l'onglet Stats montre de la collecte du compte connecté (entrée 16) : ses métadonnées
 * (null sans compte connu) et le nombre de ses parties gardées. L'écran en tire la Ligne d'état,
 * les Bandeaux d'alerte et le délai d'une limite, recalculés sans rien relire.
 */
export type EtatEcran = { meta: Meta | null; parties: number }

/**
 * Issue d'une mise à jour : son résultat ; la Ligne d'état à montrer aussitôt ; `ajoutees`, les
 * parties qu'elle a gardées, quelle que soit l'issue (seule une réussite dit « +N parties ») ;
 * `ecran`, l'état qu'elle laisse à l'écran, métadonnées telles qu'elle les tient (un échec que
 * l'iPhone a refusé d'enregistrer compris, pour qu'il soit dit quand même) et parties comptées ;
 * null si elle n'a touché aux métadonnées d'aucun compte (déjà en cours, ici ou par ↻, arrêtée, sans
 * compte, sans clé) : l'écran les relit alors (etatEcran) ; `reessai`, pour une mise à jour arrêtée
 * ou en cours par ↻ seulement (entrée 18) : l'heure, en ms depuis l'epoch, où le marqueur trouvé ne
 * bloque plus, et où sa Ligne fixe s'efface.
 */
export type Bilan = {
  resultat: ResultatMiseAJour
  ligne: string
  ajoutees: number
  ecran: EtatEcran | null
  reessai?: number
}


export type Avancee = (ligne: string, gardees: number) => void

/**
 * Une collecte lancée par ↻ (AppIntent RefreshShop, entrée 6) : le début de l'AppIntent et son échéance (ms depuis
 * l'epoch, parties.ts : echeanceDe), pris au début de chaque appui. Mettre à jour dans l'app n'en a pas (null).
 */
export type Rafraichir = { debut: number; echeance: number }

/** L'échéance d'une collecte : celle de ↻, ou null (Mettre à jour dans l'app, sans échéance). */
const echeanceDu = (r: Rafraichir | null): number | null => (r ? r.echeance : null)
/** L'origine du marqueur que prend la collecte : `rafraichir` pour ↻ ; sinon celle par défaut, `app` (entrée 18), que son rafraîchissement garde. */
const parDu = (r: Rafraichir | null): "rafraichir" | undefined => (r ? "rafraichir" : undefined)

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}






export function identite(): Identite | null {
  const compte = lireCompte()
  if (compte) return compte
  const puuid = puuidDesCookies(loadCookies())
  if (!puuid) return null


  const boutique = lireJson(SHOP_FILE)
  const region = boutique.etat === "ok" ? regionDeBoutique(boutique.valeur) : null
  return region ? { puuid, region } : null
}

/**
 * L'état de l'écran (EtatEcran), lu sur place, sans aucune requête ni lecture de partie : les
 * métadonnées du compte connecté (`identite`) et le nombre de ses parties gardées (dossiers
 * listés). Lu à l'ouverture de l'onglet et après une mise à jour, jamais par la minuterie. Ne
 * lève jamais : sans compte connu ou en cas d'erreur, rien de connu.
 */
export function etatEcran(): EtatEcran {
  try {
    const id = identite()
    return id ? { meta: lireMeta(id), parties: nombreParties(id.puuid) } : { meta: null, parties: 0 }
  } catch {
    return { meta: null, parties: 0 }
  }
}






export function historiqueConnecte(): { parties: Partie[]; illisibles: number } {
  try {
    const id = identite()
    return id ? lireHistorique(id.puuid) : { parties: [], illisibles: 0 }
  } catch {
    return { parties: [], illisibles: 0 }
  }
}

/**
 * Ce qu'a donné une requête : la réponse lue, ou l'échec (type, étape et statut, délai d'une limite) ; `coupee` : aucune
 * réponse entière (requête sans réponse, corps interrompu), ce qu'une requête bornée par l'échéance de ↻ donne à
 * l'échéance (coupeeParEcheance).
 */
type Lecture =
  | { ok: true; valeur: unknown; quota: Quota }
  | { ok: false; type: TypeEchec; detail: string; delai: number | null; coupee: boolean; quota?: Quota; code?: number | null }

/**
 * Le signal d'une requête de ↻ (entrée 6) : borne totale, corps compris, qui la coupe à l'échéance
 * (`AbortSignal.timeout`) ; le `timeout` de l'hôte, peut-être un délai d'inactivité, ne suffit pas.
 * Coupée là, la requête n'a pas de réponse entière à l'échéance : un arrêt propre
 * (coupeeParEcheance). Sans échéance (l'app), aucun signal.
 */
function signalAvant(echeance: number | null): { signal?: AbortSignal } {
  return echeance === null ? {} : { signal: AbortSignal.timeout(Math.max(0, echeance - Date.now())) }
}

/** Le détail d'une lecture en échec ; un 404 dont le code dit que HenrikDev ne connaît pas le compte le dit en clair. */
function detailDe(lu: { detail: string; code?: number | null }): string {
  return lu.code != null && CODES_COMPTE_INCONNU.includes(lu.code) ? `${lu.detail} : ${DETAIL_COMPTE_INCONNU}` : lu.detail
}

/**
 * Une requête GET à HenrikDev, la clé dans l'en-tête `Authorization`, jamais dans
 * l'adresse ; aucun nouvel essai ; aucune redirection suivie (la clé ne part vers aucun
 * autre hôte) : la réponse 3xx compte comme une panne. Le texte d'une erreur réseau passe
 * par `sansIdentifiant`. `delai` : en secondes, 20 par défaut (borné par l'échéance pour ↻) ;
 * `echeance` (↻) : la requête entière, corps compris, coupée à cette heure (signalAvant). `avecCode` : le code d'erreur d'un
 * 404 est lu dans son corps.
 */
async function lire(etape: string, chemin: string, cle: string, secrets: string[], delai: number = DELAI_REQUETE, echeance: number | null = null, avecCode: boolean = false): Promise<Lecture> {
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(HENRIKDEV + chemin, {
      headers: { Authorization: cle, Accept: "application/json" },
      timeout: delai,
      handleRedirect: async () => null,
      ...signalAvant(echeance),
    })
  } catch (e) {
    return { ok: false, type: "panne", detail: `${etape} sans réponse (${sansIdentifiant(e, secrets)})`, delai: null, coupee: true }
  }
  // Statut et en-têtes lus avant le corps ; un statut hors 2xx laisse le corps non lu.
  const enTete = (nom: string) => res.headers.get(nom)
  const type = classerStatut(res.status)
  if (type) {
    // Un 404 de HenrikDev porte un code d'erreur dans son corps (historique.ts, codeErreur) : « pas de classement », « compte
    // inconnu »… Lu seulement là où il change la suite (`avecCode` : le rang, les pages), borné, sans jamais faire échouer
    // davantage : illisible, il vaut null. Ailleurs, un statut hors 2xx laisse le corps non lu.
    let code: number | null = null
    if (avecCode && res.status === 404) {
      try {
        code = codeErreur(JSON.parse(await texteBorne(res, BORNE_ERREUR)))
      } catch { /* corps absent, trop grand ou illisible : pas de code */ }
    }
    return {
      ok: false, type, detail: `${etape} HTTP ${res.status}${code !== null ? ` (code ${code})` : ""}`, delai: type === "limite" ? delaiLimite(enTete, Date.now()) : null, coupee: false,
      quota: lireQuota(enTete), code,
    }
  }
  const quota = lireQuota(enTete)
  let corps: string
  try {
    // Ticket 7.8 (F4) : un corps borné (securite.ts, BORNE_JSON) : au-delà, une réponse illisible, sans nouvel essai.
    corps = await texteBorne(res, BORNE_JSON)
  } catch (e) {
    if (e instanceof ReponseTropGrande) return { ok: false, type: "panne", detail: `${etape} : réponse trop grande`, delai: null, coupee: false }
    return { ok: false, type: "panne", detail: `${etape} : réponse illisible`, delai: null, coupee: true }
  }
  try {
    return { ok: true, valeur: JSON.parse(corps), quota }
  } catch {
    return { ok: false, type: "panne", detail: `${etape} : réponse illisible`, delai: null, coupee: false }
  }
}

/**
 * Une requête de la collecte de ↻ sans réponse entière, l'échéance atteinte : son délai, borné par l'échéance, a
 * expiré sur elle ; un arrêt propre, pas une panne. Une réponse de HenrikDev (statut, corps illisible) reste un échec ;
 * sans échéance (l'app), jamais.
 */
function coupeeParEcheance(lu: { coupee: boolean }, r: Rafraichir | null): boolean {
  return lu.coupee && echeanceAtteinte(Date.now(), echeanceDu(r))
}

/** Quota d'après une réponse, pour le journal. */
function quotaEnClair(q: Quota): string {
  return q.restant === null ? "?" : q.limite === null ? `${q.restant}` : `${q.restant} sur ${q.limite}`
}

/**
 * Texte d'une erreur de l'hôte pour le journal et meta.json : tout chemin retiré (chemin du compte,
 * de `de-cote/` ou d'une adresse), puis clé et PUUID, puis tout UUID masqués avant la coupe
 * (`messageHote` de historique.ts, que l'AppIntent de ↻ partage).
 */
function sansIdentifiant(e: unknown, secrets: readonly (string | null | undefined)[]): string {
  return messageHote(String(e), secrets)
}


function compte(n: number, singulier: string, pluriel = singulier + "s"): string {
  return `${n} ${n > 1 ? pluriel : singulier}`
}

/** Attend `ms` millisecondes. */
function dormir(ms: number): Promise<void> {
  return new Promise((fin) => setTimeout(() => fin(), ms))
}

/**
 * Garde le dernier échec dans les métadonnées du compte, et rien d'autre : `m` porte le repère
 * de reprise et la frontière tels qu'ils sont écrits, gardés intacts. Une limite fait attendre
 * son délai, 60 s sans délai lisible (nouvelEchec). Le journal le dit. Rend le bilan : la Ligne
 * d'état et l'écran tirés de ces métadonnées (l'échec compris, même si l'iPhone a refusé de
 * l'enregistrer) et du nombre de parties gardées ; `ajoutees`, les parties gardées avant l'arrêt.
 */
async function echouer(m: Meta, type: TypeEchec, detail: string, delai: number | null, ajoutees: number = 0): Promise<Bilan> {
  const now = Date.now()
  const echec = nouvelEchec(type, detail, delai, now)
  const neuve: Meta = { ...m, dernierEchec: echec }
  try {
    ecrireMeta(neuve)
  } catch (e) {
    await note("stats : dernier échec non gardé (" + sansIdentifiant(e, []) + ").")
  }
  await note(`stats ❌ ${detail} : ${texteEchec(echec, now)} ; aucun nouvel essai.`)
  const parties = nombreParties(m.puuid)
  return { resultat: type, ligne: texteLigne(neuve, now, parties), ajoutees, ecran: { meta: neuve, parties } }
}

/**
 * Arrêt propre à l'échéance de ↻ (entrée 6), `quand` : avant l'attente ou la requête de trop, ou pendant une requête
 * qu'elle bornait. Ni dernier échec ni panne : rien ne s'écrit ; les parties gardées et le repère écrit (`m` le porte
 * tel qu'il est écrit) restent, et la collecte suivante reprend au repère (entrée 5), du haut sans repère. Le journal le
 * dit en nombres, avec la durée de l'AppIntent ; `c` : les comptes des parties, dits dès qu'une page a été lue. Le
 * marqueur se relâche dans le `finally` de mettreAJour. Rend le bilan « interrompue ».
 */
async function interrompre(r: Rafraichir | null, m: Meta, quand: string, c: Compteurs | null): Promise<Bilan> {
  const now = Date.now()
  const duree = r ? `, ${now - r.debut} ms après l'appui` : ""
  const lues = c && c.pages > 0 ? ` ; parties avant l'arrêt : ${resumeParties(c)}` : ""
  const suite = m.reprise ? `repère gardé (position ${m.reprise.position}), la prochaine collecte y reprend` : "aucun repère, la prochaine collecte part du haut"
  await note(`stats : échéance de ↻ atteinte ${quand}${duree} : arrêt sans échec${lues} ; rien n'est effacé, ${suite}.`)
  const parties = nombreParties(m.puuid)
  return { resultat: "interrompue", ligne: texteLigne(m, now, parties), ajoutees: c ? c.ajoutees : 0, ecran: { meta: m, parties } }
}

// ─────────────────────────── numéro de la réduction (entrée 17) ───────────────────────────

/**
 * meta.json sans numéro de réduction (absent compris), au début d'une collecte, avant toute
 * requête. Un historique gardé (dossier `parties/` ou `cumuls/` du compte : des cumuls d'essai
 * sans partie comptent, leurs `comptees` bloqueraient les cumuls refaits) a été réduit avant la
 * numérotation et ne se recalcule pas, la brute étant oubliée : il est mis de côté, cumuls puis
 * parties, dans un dossier du compte que rien ne relit (stockage.ts, mettreDeCote) ; puis
 * meta.json est remis à zéro (première collecte, repère, frontière, dernier trou ; Riot ID et
 * compte gardés, comme le RR et le rang, hors de meta.json) et numéroté, avant la première page :
 * la collecte qui suit est une première collecte, du haut à la page vide. Sans historique, ou
 * meta.json illisible (rien de déplacé : une mise de côté à tort retirerait des parties que
 * HenrikDev ne rend plus) : le numéro seul, rien d'autre ne change. Aucune partie numérotée n'est
 * ainsi gardée sous un meta.json sans numéro, qui la ferait mettre de côté à tort ; un échec
 * d'écriture du numéro est gardé sur la version numérotée, pour la même raison. Un refus arrête
 * tout, sans requête : existence illisible, index stats.sqlite du compte non effacé (entrée 8 : effacé avant tout
 * déplacement) ou déplacement refusé, l'historique reste en place et
 * le geste suivant refait la mise de côté ; tout déplacé mais meta.json refusé, le geste suivant
 * le numérote. Le journal dit le nombre de parties ; un message de l'hôte y va sans chemin
 * (sansIdentifiant), comme dans meta.json. Rend les métadonnées numérotées, ou le bilan de l'arrêt.
 */
async function numeroter(m: Meta, secrets: readonly string[]): Promise<{ arret: Bilan } | { arret: null; m: Meta }> {
  let present = false
  try {
    present = historiquePresent(m.puuid)
  } catch (e) {
    return { arret: await echouer(m, "stockage", `historique du compte illisible (${sansIdentifiant(e, secrets)}) : aucune requête`, null) }
  }
  const parties = present ? nombreParties(m.puuid) : 0
  let misDeCote = false
  if (present && metaIllisible(m.puuid)) {
    await note(`stats : meta.json illisible : rien de mis de côté (${compte(parties, "partie gardée", "parties gardées")}).`)
  } else if (present) {
    try {
      // Entrée 8 : l'index stats.sqlite du compte effacé d'abord (ses journaux compris) : renuméroté au même numéro, l'historique
      // recollecté reprend les mêmes chemins, que la base garderait sinon dans leur version d'avant. Refusé : rien de déplacé.
      effacerIndex(m.puuid)
      mettreDeCote(m.puuid, Date.now())
    } catch (e) {
      return { arret: await echouer(m, "stockage", `historique d'essai non mis de côté (${sansIdentifiant(e, secrets)}) : aucune requête`, null) }
    }
    misDeCote = true
    await note(`stats : historique d'essai mis de côté (${compte(parties, "partie")}) ; première collecte refaite avec la réduction ${VERSION_REDUCTION}.`)
  }
  // Remise à zéro avec une mise de côté seulement ; sinon le numéro, et rien d'autre.
  const neuve: Meta = misDeCote ? metaRemiseAZero(m, VERSION_REDUCTION) : { ...m, reduction: VERSION_REDUCTION }
  try {
    ecrireMeta(neuve)
  } catch (e) {
    return { arret: await echouer(neuve, "stockage", `numéro de la réduction non gardé (${sansIdentifiant(e, secrets)}) : aucune requête`, null) }
  }
  return { arret: null, m: neuve }
}

// ─────────────────────────── état des serveurs de Riot (ticket 4.52) ───────────────────────────

/** Délai de la lecture de l'état des serveurs, en secondes : elle ne retient rien, l'app s'ouvre sans l'attendre. */
const DELAI_STATUT = 10

/**
 * L'état des serveurs de Riot, une fois par ouverture de l'app (presenterApp) : `/valorant/v1/status/{région}` de HenrikDev par
 * `lire` (la clé dans l'en-tête seulement, aucune redirection, aucun nouvel essai, délai de DELAI_STATUT), la région du compte
 * gardé. Sans clé ni compte : aucune requête. Rend le texte du bandeau (texteBandeauRiot), null sans annonce ou sur tout échec ;
 * une ligne au journal pour un échec ou un bandeau, sans identifiant, des comptes seulement ; sans clé ou rien en cours, aucune (une
 * ouverture n'écrit rien au journal : scénarios 77, 89, 93 et suivants du harnais). Ne lève jamais.
 */
export async function lireStatutRiot(): Promise<string | null> {
  try {
    const cle = lireCle()
    const id = identite()
    if (cle === null || id === null) return null
    const lu = await lire("statut", `/valorant/v1/status/${encodeURIComponent(id.region)}`, cle, [cle, id.puuid], DELAI_STATUT)
    if (!lu.ok) {
      await note(`statut Riot : non lu (${lu.detail}).`)
      return null
    }
    const annonces = annoncesRiot(lu.valeur)
    if (annonces === null) {
      await note("statut Riot : réponse inattendue.")
      return null
    }
    // Une ligne seulement pour un bandeau (et un échec, plus haut) : l'ouverture n'écrit rien au journal (entrées 17, 18, 2.8).
    const m = annonces.filter((a) => a.genre === "maintenance").length
    if (annonces.length > 0) await note(`statut Riot : ${compte(m, "maintenance")} en cours, ${compte(annonces.length - m, "incident")} : bandeau affiché.`)
    return texteBandeauRiot(annonces)
  } catch {
    return null
  }
}

// ─────────────────────────── rôles des agents ───────────────────────────

/** Ce qu'a donné la lecture des rôles sur valorant-api : la section `agents`, ou l'échec pour le journal (`coupee` : comme Lecture). */
type LectureAgents = { ok: true; agents: SectionAgents } | { ok: false; detail: string; coupee: boolean }

/**
 * Les rôles des agents jouables sur valorant-api : ni clé, ni PUUID, rien du compte ; délai
 * de 20 s (`delai`, borné par l'échéance pour ↻, et la requête entière coupée à `echeance`) ;
 * aucun nouvel essai.
 */
async function lireAgents(delai: number = DELAI_REQUETE, echeance: number | null = null): Promise<LectureAgents> {
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(AGENTS_VALORANT_API, { timeout: delai, ...signalAvant(echeance) })
  } catch {
    return { ok: false, detail: "valorant-api sans réponse", coupee: true }
  }
  if (res.status < 200 || res.status >= 300) return { ok: false, detail: `valorant-api HTTP ${res.status}`, coupee: false }
  let corps: string
  try {
    corps = await texteBorne(res, BORNE_JSON)
  } catch (e) {
    if (e instanceof ReponseTropGrande) return { ok: false, detail: "valorant-api : réponse trop grande", coupee: false }
    return { ok: false, detail: "valorant-api : réponse illisible", coupee: true }
  }
  try {
    const agents = agentsDeValorantApi(JSON.parse(corps))
    return agents ? { ok: true, agents } : { ok: false, detail: "valorant-api : réponse inattendue", coupee: false }
  } catch {
    return { ok: false, detail: "valorant-api : réponse illisible", coupee: false }
  }
}

/**
 * Range la section `agents` dans catalog.json, les autres sections telles quelles (catalog()
 * de valshop.ts la garde à chaque reconstruction) ; catalog.json absent : créé avec elle seule.
 * Illisible : jamais écrasé, les rôles restent en mémoire pour cette collecte seulement. Rend
 * ce qu'il en est, pour le journal.
 */
function rangerAgents(agents: SectionAgents): string {
  const lu = lireJson(CATALOG)
  if (lu.etat === "illisible" || (lu.etat === "ok" && !estObjet(lu.valeur))) {
    return "gardés en mémoire seulement (catalog.json illisible, laissé tel quel)"
  }
  const sections: Record<string, unknown> = lu.etat === "ok" && estObjet(lu.valeur) ? lu.valeur : {}
  try {
    ecrireSur(CATALOG, JSON.stringify({ ...sections, agents }))
    return "rangés dans catalog.json"
  } catch (e) {
    return "gardés en mémoire seulement (catalog.json non écrit : " + sansIdentifiant(e, []) + ")"
  }
}

// ─────────────────────────── ressources des stats (entrée 9) ───────────────────────────

/** Une section relue : rangée, ou non (gardée telle quelle, relue à la collecte suivante) ; `arret` : plus aucune requête de ressources ; sa ligne de journal. */
type IssueRessource = { rangee: boolean; arret: boolean; ligne: string }

/** Les requêtes de l'étape des ressources à valorant-api (sections et images), dont les images. */
type CoutRessources = { requetes: number; images: number }

/** Un participe accordé à la section, pour le journal : « cartes rangées », « paliers rangés », « armes relues ». */
function accorde(nom: NomRessource, participe: string): string {
  return participe + (nom === "paliers" ? "s" : "es")
}


function resumeRessource(nom: NomRessource, section: Record<string, unknown>): string {
  const n = Object.keys(section).length
  if (nom === "cartes") return `${compte(n, "carte")}, dont ${Object.values(section).filter((c) => c !== null).length} à coefficients`
  if (nom === "capacites") return compte(n, "agent")
  if (nom === "saisons") return compte(n, "acte")
  return nom === "paliers" ? compte(n, "palier") : compte(n, "arme")
}

/**
 * Relit la section `nom` sur valorant-api et la range : sa requête (ni clé ni en-tête, délai de RESSOURCES_VALORANT_API),
 * ses images (chacune absente téléchargée telle quelle sous `icons/` en écriture sûre ; une présente, gardée, jamais
 * retéléchargée : une carte retravaillée cite une image d'un autre nom, ressources.ts ; statut hors 2xx : absente de
 * valorant-api, null dans la section), puis la section et sa version (`version`, null si inconnue) dans la même écriture
 * de catalog.json, relu juste avant pour en garder toutes les autres sections telles quelles (absent : créé) : la
 * section gardée et les images qu'elle cite restent justes jusque-là. Le marqueur est rafraîchi avant chaque requête ;
 * `cout` les compte. Une image qui manque autrement (statut hors 2xx excepté) laisse la section non rangée. Statut,
 * réponse illisible ou inattendue : section gardée telle quelle, les autres relues ; erreur réseau (réponse interrompue
 * comprise) ou d'écriture : `arret`. Un message de l'hôte va au journal sans chemin. Ne lève pas, hors une erreur que
 * rien ne prévoit (rangerRessources la tient).
 */
async function relireRessource(nom: NomRessource, version: string | null, debut: number, cout: CoutRessources, secrets: readonly string[]): Promise<IssueRessource> {
  const echec = (raison: string, arret: boolean): IssueRessource => ({
    rangee: false, arret,
    ligne: `stats : ressources des stats : ${nom} non ${accorde(nom, "rangé")} (${raison}), ${accorde(nom, "relu")} à la prochaine collecte`
      + (arret ? " ; plus aucune requête de ressources dans cette collecte." : "."),
  })
  const source = RESSOURCES_VALORANT_API[nom]
  rafraichirMarqueur(debut, Date.now())
  cout.requetes++
  let res: Awaited<ReturnType<typeof fetch>>
  try {
    res = await fetch(source.adresse, { timeout: source.delai })
  } catch {
    return echec("valorant-api sans réponse", true)
  }
  if (res.status < 200 || res.status >= 300) return echec(`valorant-api HTTP ${res.status}`, false)
  let corps: string
  try {
    corps = await texteBorne(res, BORNE_JSON)
  } catch (e) {
    if (e instanceof ReponseTropGrande) return echec("valorant-api : réponse trop grande", false)
    return echec("valorant-api : réponse interrompue", true)
  }
  let valeur: unknown
  try {
    valeur = JSON.parse(corps)
  } catch {
    return echec("valorant-api : réponse illisible", false)
  }
  const lue = sectionDeValorantApi(nom, valeur)
  if (!lue) return echec("valorant-api : réponse inattendue", false)

  // ── ses images : une présente gardée ──
  const absentes = new Set<string>()
  let telechargees = 0, gardees = 0
  for (const image of lue.images) {
    let presente: boolean
    try {
      presente = imagePresente(image.chemin)
    } catch (e) {
      return echec("image illisible : " + sansIdentifiant(e, secrets), true)
    }
    if (presente) {
      gardees++
      continue
    }
    rafraichirMarqueur(debut, Date.now())
    cout.requetes++
    cout.images++
    let r: Awaited<ReturnType<typeof fetch>>
    try {
      r = await fetch(image.adresse, { timeout: DELAI_IMAGE })
    } catch {
      return echec(`image sans réponse, ${compte(telechargees, "téléchargée")} avant`, true)
    }
    if (r.status < 200 || r.status >= 300) {
      absentes.add(image.chemin)
      continue
    }
    // Une page qui n'est pas une image (portail Wi-Fi, erreur servie en 200) ne se range jamais : elle ne serait plus retéléchargée.
    if (!(r.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")) return echec("image : réponse inattendue", false)
    // Ticket 7.8 (F3) : une image bornée (securite.ts, BORNE_IMAGE), sa taille annoncée puis lue.
    const annonce = tailleAnnoncee(r)
    if (annonce !== null && annonce > BORNE_IMAGE) return echec("image trop grande", false)
    let octets: Data
    try {
      octets = await r.data()
    } catch {
      return echec(`image interrompue, ${compte(telechargees, "téléchargée")} avant`, true)
    }
    if (!octets || !(octets.size > 0)) return echec("image : réponse vide", false)
    if (octets.size > BORNE_IMAGE) return echec("image trop grande", false)
    try {
      await ecrireImage(image.chemin, octets)
    } catch (e) {
      return echec("image non écrite : " + sansIdentifiant(e, secrets), true)
    }
    telechargees++
  }

  // ── la section et sa version, dans la même écriture ; les autres sections telles quelles ──
  const section = sansImages(lue.section, absentes)
  const lu = lireJson(CATALOG)
  if (lu.etat === "illisible" || (lu.etat === "ok" && !estObjet(lu.valeur))) return echec("catalog.json illisible, laissé tel quel", true)
  const sections: Record<string, any> = lu.etat === "ok" && estObjet(lu.valeur) ? lu.valeur : {}
  const versions: Record<string, unknown> = estObjet(sections.ressources) ? sections.ressources : {}
  try {
    ecrireSur(CATALOG, JSON.stringify({ ...sections, [nom]: section, ressources: { ...versions, [nom]: version } }))
  } catch (e) {
    return echec("catalog.json non écrit : " + sansIdentifiant(e, secrets), true)
  }
  const images = lue.images.length === 0 ? ""
    : ` ; images : ${compte(telechargees, "téléchargée")}, ${compte(gardees, "gardée")}, ${compte(absentes.size, "absente")}`
  return { rangee: true, arret: false, ligne: `stats : ressources des stats : ${nom} ${accorde(nom, "rangé")} (${resumeRessource(nom, section)}${images}).` }
}

/**
 * Les ressources des stats (entrée 9 ; ressources.ts), dans Mettre à jour de l'app seulement, après les rôles des
 * agents et la première collecte lancée, avant la première page (son attente part de mmr-history : le temps de l'étape
 * y tombe). La version du jeu lue sur place, sans requête : `version` de shop.json, sinon de catalog.json. catalog.json
 * illisible : ni écrit ni requête. Sinon chaque section absente, illisible ou rangée sous une autre version (version
 * inconnue : absente ou illisible seulement) relue et rangée (relireRessource), cartes, paliers, puis armes ; aucune :
 * « à jour », aucune requête. Jamais de dernier échec ni d'arrêt de la collecte ; après une erreur réseau ou d'écriture,
 * plus aucune requête de ressources. Le journal dit chaque section, puis le compte, en nombres, sans chemin. Ne lève
 * jamais ; rend le nombre de requêtes faites à valorant-api, images comprises, pour le coût de la collecte.
 */
async function rangerRessources(debut: number, secrets: readonly string[]): Promise<number> {
  const cout: CoutRessources = { requetes: 0, images: 0 }
  try {
    const lu = lireJson(CATALOG)
    if (lu.etat === "illisible" || (lu.etat === "ok" && !estObjet(lu.valeur))) {
      await note("stats : ressources des stats : catalog.json illisible, laissé tel quel : aucune requête.")
      return 0
    }
    const catalogue: Record<string, any> = lu.etat === "ok" && estObjet(lu.valeur) ? lu.valeur : {}
    const boutique = lireJson(SHOP_FILE)
    const version = versionDuJeu(boutique.etat === "ok" ? boutique.valeur : null, catalogue)
    const inconnue = version === null ? " (version du jeu inconnue)" : ""
    const aRelire = sectionsARelire(catalogue, version)
    if (aRelire.length === 0) {
      await note(`stats : ressources des stats à jour${inconnue}, aucune requête.`)
      return 0
    }
    let rangees = 0
    for (const nom of aRelire) {
      const issue = await relireRessource(nom, version, debut, cout, secrets)
      await note(issue.ligne)
      if (issue.rangee) rangees++
      if (issue.arret) break
    }
    await note(`stats : ressources des stats : ${compte(rangees, "section rangée", "sections rangées")} sur ${aRelire.length}${inconnue} ; `
      + `${compte(cout.requetes, "requête")} à valorant-api, dont ${compte(cout.images, "image")}.`)
  } catch (e) {
    try {
      await note("stats : ressources des stats en erreur (" + sansIdentifiant(e, secrets) + "), relues à la prochaine collecte.")
    } catch { /* journal indisponible : rien de plus */ }
  }
  return cout.requetes
}

// ─────────────────────────── parties ───────────────────────────

/** Les comptes d'une collecte, pour le journal et la Ligne d'état. */
type Compteurs = {
  /** Requêtes à HenrikDev (mmr v3 et mmr-history v2 comprises) et à valorant-api. */
  henrikdev: number
  valorantApi: number
  /** Pages lues, la page vide comprise. */
  pages: number
  lues: number
  ajoutees: number
  dejaGardees: number
  ecartees: number
  refusees: number
  /** Refus par raison, dans l'ordre de leur première rencontre. */
  parRaison: Map<string, number>
  /** Parties gardées du compte, en tout. */
  gardees: number
  attenteMs: number
  /** Ticket 4.54 : détails v2 demandés (dans `henrikdev`), lus avec leur dépense de Riot, et en échec (le premier seul au journal). */
  depensesDemandees: number
  depensesLues: number
  depensesEnEchec: number
}

/** Ce que tient une collecte en cours : le compte, la clé, les métadonnées à jour, les rôles, la dernière requête, les comptes. */
type Collecte = {
  id: Identite
  cle: string
  secrets: string[]
  /** `{affinity}/{platform}/{puuid}`, encodés pour l'adresse. */
  compte: string
  /** Départ de la mise à jour : le `depuis` du marqueur. */
  debut: number
  m: Meta
  roles: Roles
  /** Rôles relus sur valorant-api pendant cette collecte : une fois au plus. */
  relus: boolean
  /** Riot ID déjà trouvé dans cette collecte (celui de la partie la plus récente). */
  riotIdVu: boolean
  /** matchId des parties gardées par cette collecte : relues (liste décalée, page relue), elles ne sont pas « déjà gardées » pour reprise.ts. */
  ici: Set<string>
  /**
   * La dernière page (ou, avant elle, mmr-history v2) : son départ, d'où partent les 6 s de la page suivante ; sa réponse et son quota,
   * remplacés par ceux du dernier détail v2 (ticket 4.54) lu depuis.
   */
  precedente: Precedente
  avancee?: Avancee
  /** Collecte de ↻ : son échéance et le début de l'AppIntent ; null pour Mettre à jour dans l'app. */
  rafraichir: Rafraichir | null
  c: Compteurs
}

/**
 * Ce qu'il est advenu d'une partie de la page : `deja`, gardée avant cette collecte ; `ici`,
 * gardée plus tôt dans cette collecte ; `presente`, son fichier apparu entre le contrôle et
 * l'écriture (jamais récrit) ; `ajoutee`, `ecartee`, `refusee`.
 */
type Issue = "deja" | "ici" | "presente" | "ajoutee" | "ecartee" | "refusee"

/** Une partie traitée : son issue, ou le bilan d'un arrêt (écriture impossible). */
type Traitement = { arret: Bilan } | { arret: null; issue: Issue }


function resumeParties(c: Compteurs): string {
  const raisons = c.refusees > 0 ? ` (${[...c.parRaison].map(([r, n]) => `${r} ${n}`).join(", ")})` : ""
  return `${compte(c.pages, "page")}, ${compte(c.lues, "partie lue", "parties lues")} : ${compte(c.ajoutees, "ajoutée")}, `
    + `${compte(c.dejaGardees, "déjà gardée", "déjà gardées")}, ${compte(c.ecartees, "écartée")}, ${compte(c.refusees, "refusée")}${raisons}`
}

/** Une collecte qui s'arrête en cours : ce qui a été lu et gardé au journal, puis le dernier échec. */
async function arreter(k: Collecte, type: TypeEchec, detail: string, delai: number | null): Promise<Bilan> {
  await note(`stats : parties avant l'arrêt : ${resumeParties(k.c)} ; gardées, rien n'est effacé.`)
  return await echouer(k.m, type, detail, delai, k.c.ajoutees)
}

/** Une partie refusée : jamais écrite, comptée, journalisée (raison, puis chemins ou détail), relue à la collecte suivante. */
async function refuser(k: Collecte, raison: string, detail: string): Promise<void> {
  k.c.refusees++
  k.c.parRaison.set(raison, (k.c.parRaison.get(raison) ?? 0) + 1)
  await note(`stats : partie refusée (${raison}), non gardée, relue à la prochaine collecte : ${detail}.`)
}

/** Des chemins JSON pour le journal, les premiers seulement. */
function cheminsEnClair(chemins: readonly string[]): string {
  const reste = chemins.length - CHEMINS_AU_JOURNAL
  return chemins.slice(0, CHEMINS_AU_JOURNAL).join(", ") + (reste > 0 ? ` (+${reste})` : "")
}

/**
 * Relit les rôles sur valorant-api, une fois par collecte au plus ; vrai s'ils ont été relus. Collecte de ↻ : `avant`
 * ou `pendant`, l'échéance atteinte avant la requête ou sur elle (son délai borné) : à l'appelant de s'arrêter.
 */
async function relireRoles(k: Collecte): Promise<boolean | "avant" | "pendant"> {
  k.relus = true
  rafraichirMarqueur(k.debut, Date.now())
  const delai = delaiBorne(DELAI_REQUETE, Date.now(), echeanceDu(k.rafraichir))
  if (delai === null) return "avant"
  k.c.valorantApi++
  const lu = await lireAgents(delai, echeanceDu(k.rafraichir))
  if (!lu.ok && coupeeParEcheance(lu, k.rafraichir)) return "pendant"
  const roles = lu.ok ? rolesDeSection(lu.agents) : null
  if (!lu.ok || !roles) {
    await note(`stats : rôles des agents non relus (${lu.ok ? "aucun rôle" : lu.detail}).`)
    return false
  }
  k.roles = roles
  await note(`stats : rôles des agents relus sur valorant-api (${compte(Object.keys(roles).length, "agent")}), ${rangerAgents(lu.agents)}.`)
  return true
}

/** Ton Riot ID, tiré de la partie la plus récente : gardé dans meta.json s'il a changé, jamais au journal. */
async function garderRiotId(k: Collecte, r: RiotId): Promise<void> {
  k.riotIdVu = true
  if (k.m.riotId?.name === r.name && k.m.riotId?.tag === r.tag) return
  k.m = { ...k.m, riotId: r }
  try {
    ecrireMeta(k.m)
  } catch (e) {
    await note("stats : Riot ID non gardé (" + sansIdentifiant(e, k.secrets) + ").")
  }
}

/**
 * Ticket 4.54 : la dépense de Riot de chaque joueur-manche d'une partie nouvelle d'une file à achat, seconde source de ta poche :
 * `/valorant/v2/match/{id}` de HenrikDev, à son rythme (attenteAvantDetail : sous 2 unités de quota lues, la remise à zéro), sa réponse et son quota gardés pour la requête suivante (la page suivante attend ses 6 s depuis la
 * page d'avant, et la remise à zéro depuis ce détail si le quota qu'il dit est sous 12). Rend la dépense lue (depensesDeV2), ou
 * null : partie gardée sans seconde source (réponse en échec autre qu'une limite, clé refusée comprise : la page suivante le dira ;
 * réponse d'une autre partie ou sans dépense), une ligne de journal sans identifiant ; ou le bilan d'un arrêt, comme pour une page
 * (limite, échéance de ↻ : la partie n'est pas gardée, la page se relit depuis le repère écrit). Jamais au rendu.
 */
async function lireDepensesRiot(k: Collecte, brute: unknown, matchId: string): Promise<{ arret: Bilan } | { arret: null; depenses: DepensesRiot | null }> {
  const echeance = echeanceDu(k.rafraichir)
  rafraichirMarqueur(k.debut, Date.now())
  const attente = attenteAvantDetail(k.precedente, Date.now())
  if (attente === null) {
    return { arret: await arreter(k, "limite", `x-ratelimit-reset de ${k.precedente.quota.reset} s annoncé avant la dépense de Riot d'une partie, au-delà de ${RESET_MAX_S} s`, null) }
  }
  if (!attenteAdmise(attente, Date.now(), echeance)) {
    return { arret: await interrompre(k.rafraichir, k.m, "avant la dépense de Riot d'une partie", k.c) }
  }
  for (let reste = attente; reste > 0;) {
    const tranche = Math.min(reste, TRANCHE_MS)
    await dormir(tranche)
    reste -= tranche
    k.c.attenteMs += tranche
    rafraichirMarqueur(k.debut, Date.now())
  }
  const delai = delaiBorne(DELAI_REQUETE, Date.now(), echeance)
  if (delai === null) return { arret: await interrompre(k.rafraichir, k.m, "avant la dépense de Riot d'une partie", k.c) }
  k.c.henrikdev++
  k.c.depensesDemandees++
  const lu = await lire("dépense v2", `/valorant/v2/match/${encodeURIComponent(matchId)}`, k.cle, k.secrets, delai, echeance)
  rafraichirMarqueur(k.debut, Date.now())
  if (!lu.ok) {
    if (coupeeParEcheance(lu, k.rafraichir)) return { arret: await interrompre(k.rafraichir, k.m, "pendant la dépense de Riot d'une partie", k.c) }
    if (lu.type === "limite") return { arret: await arreter(k, lu.type, lu.detail, lu.delai) }
    retenirQuota(k, lu.quota ?? null)
    // Une partie que HenrikDev n'a pas en v2 (404) est gardée sans seconde source, sans rien dire ; un autre échec, le premier seul.
    if (!lu.detail.endsWith("HTTP 404")) await echecDeDepense(k, lu.detail)
    return { arret: null, depenses: null }
  }
  retenirQuota(k, lu.quota)
  const depenses = depensesDeV2(lu.valeur, brute)
  if (depenses === null) await echecDeDepense(k, "dépense v2 : réponse illisible, d'une autre partie ou sans dépense")
  else k.c.depensesLues++
  return { arret: null, depenses }
}

/**
 * Ticket 4.54 : le quota après un détail v2 : celui que disent ses en-têtes, compté depuis sa réponse ; sans eux, celui d'avant moins
 * 2 unités (quotaApresEchec), compté depuis la réponse d'avant (sa remise à zéro ne recule pas).
 */
function retenirQuota(k: Collecte, quota: Quota | null): void {
  k.precedente = quota !== null && quota.restant !== null
    ? { ...k.precedente, reponse: Date.now(), quota }
    : { ...k.precedente, quota: quotaApresEchec(k.precedente.quota) }
}

/** Ticket 4.54 : un détail v2 en échec ; le premier de la collecte seul au journal, sans identifiant, les autres comptés au bilan. */
async function echecDeDepense(k: Collecte, detail: string): Promise<void> {
  k.c.depensesEnEchec++
  if (k.c.depensesEnEchec === 1) await note(`stats : dépense de Riot par manche non lue (${detail}) : partie gardée sans elle ; les échecs suivants ne sont que comptés.`)
}





function coutDesDepenses(c: Compteurs): string {
  if (c.depensesDemandees === 0) return ""
  const echecs = c.depensesEnEchec > 0 ? `, ${c.depensesEnEchec} en échec` : ""
  return ` (dont ${c.depensesDemandees} pour la dépense de Riot par manche, ${compte(c.depensesLues, "lue")}${echecs})`
}

/**
 * Une partie de la page : déjà gardée, passée sans réduction ; sinon réduite (rôles relus une
 * fois si un agent de ton équipe en manque), contrôlée, puis gardée : cumuls de sa semaine
 * d'abord, s'ils n'y sont pas encore comptés, puis son fichier. Rend son issue, pour
 * reprise.ts, ou le bilan si la collecte doit s'arrêter (écriture impossible).
 */
async function traiterPartie(k: Collecte, brute: unknown): Promise<Traitement> {
  k.c.lues++
  if (!k.riotIdVu) {
    const r = riotIdDe(brute, k.id.puuid)
    if (r) await garderRiotId(k, r)
  }
  const place = placeBrute(brute)
  if (place && partieGardee(k.id.puuid, place)) {
    k.c.dejaGardees++
    return { arret: null, issue: k.ici.has(place.matchId) ? "ici" : "deja" }
  }
  const refusee = { arret: null, issue: "refusee" } as const
  // Ticket 4.54 : la seconde source de la dépense, avant la réduction, pour une partie nouvelle d'une file à achat.
  let depensesRiot: DepensesRiot | null = null
  if (place && fileAAchat(brute) && !abandonneeBrute(brute)) {
    const d = await lireDepensesRiot(k, brute, place.matchId)
    if (d.arret) return { arret: d.arret }
    depensesRiot = d.depenses
  }
  let r = reduirePartie(brute, k.id.puuid, k.roles, { depensesRiot })
  if (r.statut === "refusee" && r.raison === "roles" && !k.relus) {
    const relus = await relireRoles(k)
    // ↻ : échéance atteinte, la partie n'est ni refusée ni gardée ; la page reste à traiter, depuis le repère écrit.
    if (relus === "avant" || relus === "pendant") return { arret: await interrompre(k.rafraichir, k.m, `${relus} la relecture des rôles des agents`, k.c) }
    if (relus) r = reduirePartie(brute, k.id.puuid, k.roles, { depensesRiot })
  }
  if (r.statut === "ecartee") {
    k.c.ecartees++
    return { arret: null, issue: "ecartee" }
  }
  if (r.statut === "refusee") {
    // `rôles` : un agent de ton équipe sans rôle, même après la relecture ; jamais compté comme une fuite.
    const raison = r.raison === "roles" ? "rôles" : r.raison === "confidentialite" ? "confidentialité" : "forme"
    const chemins = "chemins" in r ? r.chemins : []
    await refuser(k, raison, cheminsEnClair(chemins) || "agent de ton équipe sans rôle")
    return refusee
  }
  const lieu = placeDe(r.partie.matchId, r.partie.debut)
  if (!lieu) {
    // matchId qui n'est pas un UUID, ou début illisible : aucun nom de fichier sûr.
    await refuser(k, "forme", "partie $.matchId, $.debut")
    return refusee
  }
  const parSemaine = new Map<string, CumulAgent[]>()
  for (const [i, cumul] of r.cumulsAgents.entries()) {
    if (!estSemaine(cumul.semaine)) {
      await refuser(k, "forme", `cumuls $.cumulsAgents[${i}].semaine`)
      return refusee
    }
    parSemaine.set(cumul.semaine, [...(parSemaine.get(cumul.semaine) ?? []), cumul])
  }
  const aEcrire: { semaine: string; contenu: Semaine }[] = []
  for (const [semaine, cumuls] of parSemaine) {
    const lue = lireSemaine(k.id.puuid, semaine)
    if (lue.etat === "illisible") {
      await refuser(k, "cumuls illisibles", "fichier d'une semaine de cumuls illisible, laissé tel quel")
      return refusee
    }
    const { semaine: contenu, ajoute } = ajouterCumuls(lue.semaine, lieu.matchId, cumuls)
    if (ajoute) aEcrire.push({ semaine, contenu })
  }
  const suspects = [
    ...cheminsSuspects(r.partie).map((c) => "partie " + c),
    ...aEcrire.flatMap((e) => cheminsSuspects(e.contenu).map((c) => "cumuls " + c)),
  ]
  if (suspects.length > 0) {
    await refuser(k, "chemins suspects", cheminsEnClair(suspects))
    return refusee
  }
  let ecrite: boolean
  try {
    // Cumuls d'abord : une partie présente a toujours ses cumuls comptés.
    for (const e of aEcrire) ecrireSemaine(k.id.puuid, e.semaine, e.contenu)
    ecrite = ecrirePartie(k.id.puuid, lieu, r.partie)
  } catch (e) {
    return { arret: await arreter(k, "stockage", "écriture impossible (" + sansIdentifiant(e, k.secrets) + ")", null) }
  }
  if (!ecrite) {
    k.c.dejaGardees++
    return { arret: null, issue: "presente" }
  }
  k.c.ajoutees++
  k.c.gardees++
  k.ici.add(lieu.matchId)
  return { arret: null, issue: "ajoutee" }
}

/**
 * Garde le repère de reprise que dit reprise.ts (après une page traitée entièrement, ou avant une
 * page du haut d'une reprise qui montre une partie nouvelle), daté de son écriture (`quand`, entrée
 * 18 : la Ligne d'état en dit l'âge) ; seul écrivain d'un repère neuf (mettreAJour redate, à son
 * départ, celui qui attend). `k.m` ne le porte qu'une fois
 * écrit, pour qu'un échec ne garde que ce qui l'est. Rend le bilan d'un arrêt si l'écriture
 * échoue : sans repère à jour, une reprise pourrait sauter des parties jamais lues.
 */
async function garderRepere(k: Collecte, reprise: Reprise): Promise<Bilan | null> {
  const m: Meta = { ...k.m, reprise: { ...reprise, quand: new Date(Date.now()).toISOString() } }
  try {
    ecrireMeta(m)
  } catch (e) {
    return await arreter(k, "stockage", "repère de reprise non gardé (" + sansIdentifiant(e, k.secrets) + ")", null)
  }
  k.m = m
  return null
}

/**
 * Les pages de la liste v4, du haut, sans plafond, chacune après son attente (6 s depuis la
 * requête précédente, et la remise à zéro du quota s'il en reste moins de 12) : où lire chaque
 * page et quand s'arrêter, reprise.ts le dit ; chaque partie d'une page à traiter l'est aussitôt,
 * l'avancée dite après chaque page, le repère gardé quand reprise.ts le dit (avant une page du
 * haut d'une reprise qui montre une partie nouvelle, après chaque page traitée entièrement). Rend
 * le bilan d'un arrêt (page en échec, écriture impossible, échéance de ↻), ou la fin d'une
 * collecte complète (frontière ou page vide). Collecte de ↻ : une attente, même nulle, ne
 * commence que s'il restera 5 s avant l'échéance après elle, la requête de la page a son délai
 * borné par l'échéance ; sinon, ou coupée par elle, arrêt propre (interrompre).
 */
async function lirePages(k: Collecte): Promise<{ arret: Bilan } | { arret: null; fin: Fin }> {
  const echeance = echeanceDu(k.rafraichir)
  let etat = depart({
    reprise: k.m.reprise, frontiere: k.m.frontiere, suivante: k.m.premiereCollecte.terminee !== null, taille: TAILLE_PAGE,
  })
  if (k.m.reprise) await note(`stats : reprise au repère (position ${k.m.reprise.position}) : le haut de la liste d'abord.`)
  for (;;) {
    const numero = k.c.pages + 1
    const start = etat.start
    // La page d'avant traitée : marqueur rafraîchi avant l'attente, jamais plus d'une tranche sans activité.
    rafraichirMarqueur(k.debut, Date.now())
    const attente = attenteAvantPage(k.precedente, Date.now())
    if (attente === null) {
      // x-ratelimit-reset déraisonnable : ni attente ni requête de plus, une limite sans délai lisible.
      return { arret: await arreter(k, "limite", `x-ratelimit-reset de ${k.precedente.quota.reset} s annoncé avant la page ${numero}, au-delà de ${RESET_MAX_S} s`, null) }
    }
    if (!attenteAdmise(attente, Date.now(), echeance)) {
      const avant = attente > 0 ? `avant l'attente de ${Math.ceil(attente / 1000)} s de la page ${numero}` : `avant la page ${numero}`
      return { arret: await interrompre(k.rafraichir, k.m, avant, k.c) }
    }
    for (let reste = attente; reste > 0;) {
      const tranche = Math.min(reste, TRANCHE_MS)
      await dormir(tranche)
      reste -= tranche
      k.c.attenteMs += tranche
      rafraichirMarqueur(k.debut, Date.now())
    }
    rafraichirMarqueur(k.debut, Date.now())
    const delai = delaiBorne(DELAI_PAGE, Date.now(), echeance)
    if (delai === null) return { arret: await interrompre(k.rafraichir, k.m, `avant la page ${numero}`, k.c) }
    const departPage = Date.now()
    k.c.henrikdev++
    const page = await lire(`page ${numero} v4`, `/valorant/v4/by-puuid/matches/${k.compte}?size=${TAILLE_PAGE}&start=${start}`,
      k.cle, k.secrets, delai, echeance, true)
    if (!page.ok) {
      if (coupeeParEcheance(page, k.rafraichir)) return { arret: await interrompre(k.rafraichir, k.m, `pendant la page ${numero}`, k.c) }
      return { arret: await arreter(k, page.type, detailDe(page), page.delai) }
    }
    k.precedente = { depart: departPage, reponse: Date.now(), quota: page.quota }
    rafraichirMarqueur(k.debut, Date.now())
    const parties = partiesDeLaPage(page.valeur)
    if (!parties) return { arret: await arreter(k, "panne", `page ${numero} v4 : réponse inattendue`, null) }
    k.c.pages++
    const ou = start === (numero - 1) * TAILLE_PAGE ? "" : ` (position ${start})`
    const rythme = `${attente > 0 ? `${Math.round(attente / 1000)} s d'attente avant, ` : ""}quota restant ${quotaEnClair(page.quota)}`
    // Chaque partie avant son traitement : son repère, et gardée avant cette collecte (fichier présent, pas écrit par elle).
    const vues: Vue[] = parties.map((brute) => {
      const place = placeBrute(brute)
      return { repere: repereBrut(brute), gardeeAvant: place !== null && partieGardee(k.id.puuid, place) && !k.ici.has(place.matchId) }
    })
    const examen = examiner(etat, vues)
    if (!examen.traiter) {
      etat = examen.etat
      await note(`stats : page ${numero}${ou} ${parties.length === 0 ? "vide" : "sans l'ancre"}, non raccordée : recul à la position ${etat.start} (${rythme}).`)
      continue
    }
    if (etat.phase === "saut") await note(`stats : page ${numero}${ou} raccordée.`)
    etat = examen.etat
    if (examen.ecrire) {
      const arret = await garderRepere(k, examen.ecrire)
      if (arret) return { arret }
    }
    const traitees: Traitee[] = []
    if (parties.length === 0) await note(`stats : page ${numero}${ou} vide (${rythme}).`)
    else {
      const avant = { ...k.c }
      for (const [i, brute] of parties.entries()) {
        const t = await traiterPartie(k, brute)
        if (t.arret) return { arret: t.arret }
        traitees.push({ ...vues[i], refusee: t.issue === "refusee" })
      }
      await note(`stats : page ${numero}${ou} : ${compte(parties.length, "partie")}, ${compte(k.c.ajoutees - avant.ajoutees, "ajoutée")}, `
        + `${compte(k.c.dejaGardees - avant.dejaGardees, "déjà gardée", "déjà gardées")}, ${compte(k.c.ecartees - avant.ecartees, "écartée")}, `
        + `${compte(k.c.refusees - avant.refusees, "refusée")} (${rythme}).`)
      try {
        k.avancee?.(texteAvancee(k.c.lues), k.c.gardees)
      } catch { /* l'écran ne fait jamais échouer la collecte */ }
    }
    const d = conclure(etat, traitees)
    if (d.fin) return { arret: null, fin: d.fin }
    etat = d.etat
    if (d.ecrire) {
      const arret = await garderRepere(k, d.ecrire)
      if (arret) return { arret }
    }
    if (d.saut !== null) {
      await note(`stats : haut de la liste lu, ${compte(d.saut, "partie")} au-dessus de la première déjà gardée : saut à la position ${etat.start}.`)
    }
  }
}

/** Le contrôle des fichiers à la fin de la première collecte : chaque fichier de partie et de cumuls du compte relu, chemins suspects comptés. */
function controlerFichiers(puuid: string): { fichiers: number; chemins: number; illisibles: number } {
  let fichiers = 0, chemins = 0, illisibles = 0
  for (const f of [...fichiersParties(puuid), ...fichiersCumuls(puuid)]) {
    fichiers++
    const lu = lireJson(f)
    if (lu.etat === "ok") chemins += cheminsSuspects(lu.valeur).length
    else illisibles++
  }
  return { fichiers, chemins, illisibles }
}

// ─────────────────────────── Scripting Pro (entrée 7) ───────────────────────────

/**
 * Pro sur cet iPhone (pro.ts, lirePro) : le mode « sans Pro » forcé d'abord, puis Script.hasFullAccess() de l'hôte ;
 * illisible, Pro inconnu (la fonction Pro est alors essayée, repli sur son erreur). Lu sur place, sans requête ; ne lève
 * jamais. Repris par l'index SQLite (entrée 8) et l'import de l'historique (entrée 6 de epic-stats-import).
 */
export function proActif(): Pro {
  return lirePro(() => Script.hasFullAccess(), SANS_PRO_FORCE, (e) => sansIdentifiant(e, []))
}

/**
 * Le maintien en arrière-plan de cette exécution (pro.ts, creerMaintien), sur l'hôte réel : les phases de la scène par
 * AppEvents.scenePhase, BackgroundKeeper (offert à l'app seule, `Script.env === "index"`), le journal, chaque message de
 * l'hôte sans chemin ni UUID. Un seul, que partagent la mise à jour de l'app et l'import de l'historique.
 */
const maintien = creerMaintien({
  pro: proActif,
  keepAlive: () => BackgroundKeeper.keepAlive(),
  stopKeepAlive: () => BackgroundKeeper.stopKeepAlive(),
  ecouter: (rappel) => {
    const ecouteur = (phase: unknown) => rappel(phase)
    AppEvents.scenePhase.addListener(ecouteur)
    return () => AppEvents.scenePhase.removeListener(ecouteur)
  },
  noter: note,
  texteErreur: (e) => sansIdentifiant(e, []),
})

/**
 * Ouvre une tâche lancée par un geste dans l'app, gardée en vie avec Pro quand on quitte l'app (pro.ts), sur place (écoute
 * posée avant tout `await`, rien d'écrit) ; rend sa fin, à attendre une fois la tâche finie, quelle qu'en soit l'issue.
 * Ne lève jamais. Mettre à jour l'ouvre sous le marqueur de collecte ; l'import de l'historique (entrée 6 de
 * epic-stats-import), dès l'appui (lancerImport d'importation.ts).
 */
export function commencerMaintien(tache: TacheMaintenue): FinMaintien {
  return maintien.commencer(tache)
}

/** Mettre à jour, pour le maintien et ses lignes au journal. */
const TACHE_COLLECTE: TacheMaintenue = { prefixe: "stats", quoi: "la mise à jour" }

// ─────────────────────────── index SQLite (entrée 8) ───────────────────────────

/**
 * Configuration de l'index : journal d'annulation (`default`), jamais de WAL : Scripting n'offre pas de `close`, une
 * connexion par usage reste ouverte jusqu'à sa libération, et l'import efface la base sous ses pieds (effacerIndex) ; sans
 * fichier `-wal` ou `-shm` qui survive à une connexion, rien n'est rejoué dans une base refaite. Attente d'un verrou : 5 s.
 */
const CONFIG_INDEX: SQLite.Configuration = {
  foreignKeysEnabled: false, readonly: false, label: null, busyMode: 5, journalMode: "default", maximumReaderCount: 1,
}

/** L'index du compte ouvert par SQLite.open (fonction Pro), en lecture seule ou non, vu comme une Base (base.ts). Lève si l'hôte refuse. */
function ouvrirIndex(puuid: string, lectureSeule: boolean): Base {
  const db = SQLite.open(cheminIndex(puuid), { ...CONFIG_INDEX, readonly: lectureSeule })
  return {
    execute: (sql, args) => db.execute(sql, args),
    transaction: (etapes) => db.transaction(etapes),
    fetchAll: (sql, args) => db.fetchAll<Ligne>(sql, args),
  }
}

/**
 * L'index du compte à lire (lireDonnees) : présent, Pro qui n'est pas `non` (proActif), ouvert en lecture seule (rien n'y
 * est créé ni écrit) ; null sinon, ou si l'hôte refuse. Pro n'est demandé que si la base existe. Ne lève jamais.
 */
function indexALire(puuid: string): Base | null {
  try {
    if (!indexPresent(puuid)) return null
    if (proActif().etat === "non") return null
    return ouvrirIndex(puuid, true)
  } catch {
    return null
  }
}

/** Les fichiers de parties du compte, tels que base.ts les reçoit : chemin relatif (clé dans la base) et lecture. */
function fichiersDuCompte(puuid: string): { relatif: string; lire: () => Partie | null }[] {
  return fichiersParties(puuid).map((f) => ({ relatif: relatifPartie(puuid, f), lire: () => partieDuFichier(f) }))
}

/**
 * La ligne du journal d'une tenue de l'index : construite ou refaite, ou rattrapée (parties ajoutées ou retirées, RR relu) ;
 * null si elle n'a rien changé, même avec des fichiers illisibles passés (dits seulement avec un changement).
 */
function ligneIndex(b: BilanIndex, ms: number): string | null {
  const illisibles = compte(b.illisibles, "fichier illisible passé", "fichiers illisibles passés")
  if (b.avant !== "valide") {
    const quoi = b.avant === "absente" ? "construit" : "reconstruit (schéma ou numéro de réduction changé)"
    return `stats : index stats.sqlite ${quoi} : ${compte(b.parties, "partie")} (${compte(b.manches, "manche")}, `
      + `${compte(b.kills, "kill")}), ${b.rr ?? 0} RR${b.illisibles > 0 ? ", " + illisibles : ""}, en ${ms} ms.`
  }
  const faits: string[] = []
  if (b.ajoutees > 0) faits.push(compte(b.ajoutees, "partie ajoutée", "parties ajoutées"))
  if (b.retirees > 0) faits.push(compte(b.retirees, "partie retirée", "parties retirées"))
  if (b.rr !== null) faits.push(`RR relu (${b.rr})`)
  if (faits.length === 0) return null
  if (b.illisibles > 0) faits.push(illisibles)
  return `stats : index stats.sqlite mis à jour : ${faits.join(", ")}, en ${ms} ms.`
}

/** Rafraîchir le marqueur de collecte entre deux lots de la tenue, au plus une fois par tranche de ce temps (ms). */
const MARQUEUR_INDEX_MS = 30_000

/**
 * Tient l'index du compte (base.ts, synchroniser), à la fin de Mettre à jour de l'app, sous le marqueur de collecte (`debut` :
 * sa prise), rafraîchi entre les lots. Ni base ni fichier de partie : rien, Pro pas même demandé ; Pro `non` : rien, sans
 * appel à SQLite ni lecture d'une partie ; sans base, aucune partie lisible : rien (jamais de base sans partie ; la lecture
 * faite pour le savoir, reprise par la tenue : chaque fichier lu une fois). Une ligne au journal si la tenue construit,
 * refait ou change la base (ligneIndex) ; une erreur (ouverture, requête,
 * transaction : Pro `inconnu` compris, la fonction Pro essayée) remet l'index à reconstruire (effacerIndex) et le dit. Ne
 * lève jamais ; ne touche ni au bilan, ni aux fichiers JSON.
 */
async function tenirIndex(puuid: string, debut: number): Promise<void> {
  let pro: Pro = { etat: "oui" }
  try {
    const listes = fichiersDuCompte(puuid)
    const presente = indexPresent(puuid)
    if (listes.length === 0 && !presente) return
    pro = proActif()
    if (pro.etat === "non") return
    // Sans base, la première partie lisible d'abord (jamais de base sans partie) ; ces lectures, reprises par la tenue.
    let fichiers = listes
    if (!presente) {
      const d = premiereLecture(listes)
      if (!d.lisible) return
      fichiers = d.fichiers
    }
    const depart = Date.now()
    let rafraichi = depart
    const base = ouvrirIndex(puuid, false)
    const table = lireRr(puuid)
    const bilan = await synchroniser(base, {
      fichiers, rr: table.etat === "ok" ? table.lignes : [], reduction: lireMeta({ puuid, region: "" }).reduction,
    }, () => {
      if (Date.now() - rafraichi < MARQUEUR_INDEX_MS) return
      rafraichi = Date.now()
      rafraichirMarqueur(debut, rafraichi)
    })
    const ligne = ligneIndex(bilan, Date.now() - depart)
    if (ligne) await note(ligne)
  } catch (e) {
    try {
      const inconnu = pro.etat === "inconnu" ? ` ; Pro non lu par l'hôte : ${pro.detail}` : ""
      let suite: string
      try {
        suite = effacerIndex(puuid) ? "remis à reconstruire ; l'onglet lit les fichiers" : "aucun index ; l'onglet lit les fichiers"
      } catch (f) {
        suite = `effacement refusé (${sansIdentifiant(f, [puuid])}) ; repris à la prochaine mise à jour`
      }
      await note(`stats : index stats.sqlite en erreur (${sansIdentifiant(e, [puuid])}${inconnu}) : ${suite}.`)
    } catch { /* journal indisponible : rien de plus */ }
  }
}

// ─────────────────────────── mise à jour ───────────────────────────

/** Pourquoi ↻ ne collecte pas (garde de l'entrée 6) : la cause dite au journal, et rendue en issue. */
type CauseGarde = "metaIllisible" | "sansNumero" | "pasLancee"
const GARDE: Record<CauseGarde, string> = {
  metaIllisible: "meta.json illisible : rien à collecter par ↻ (Mettre à jour le numérote), aucune requête.",
  sansNumero: "historique sans numéro de réduction : rien à collecter par ↻ (Mettre à jour le reprend), aucune requête.",
  pasLancee: "première collecte jamais lancée depuis l'onglet Stats : rien à collecter par ↻, aucune requête.",
}

/**
 * La cause de la garde de ↻ : meta.json présent mais illisible ; sinon historique sans numéro de réduction (première
 * collecte lancée, ou dossier `parties/` ou `cumuls/` présent, meta.json absent compris) ; sinon première collecte
 * jamais lancée. Ne lève jamais : une existence illisible ne change que la cause dite.
 */
function causeGarde(m: Meta, puuid: string): CauseGarde {
  if (metaIllisible(puuid)) return "metaIllisible"
  let present = false
  try {
    present = historiquePresent(puuid)
  } catch { /* existence illisible : rien ne bouge, seule la cause dite en dépend */ }
  return m.reduction === null && (m.premiereCollecte.lancee !== null || present) ? "sansNumero" : "pasLancee"
}

/**
 * Mettre à jour : rang, RR et parties du compte connecté. Marqueur actif, quel qu'en soit l'auteur,
 * rien, sans requête (entrée 18) : tenu par cette exécution, « déjà en cours » ; par la collecte de
 * ↻, « en cours (↻) » ; par une autre exécution de l'app, sa collecte arrêtée sans le relâcher
 * (Fermer : l'app ne tourne qu'en une exécution), « vient de s'arrêter », avec l'heure de réessai
 * (son activité + 2 min). Sans compte ou sans clé, limite gardée pas encore passée : aucune
 * requête, rien de déplacé. meta.json sans numéro de réduction (entrée 17) : historique gardé
 * mis de côté et meta.json remis à zéro, puis numéroté, avant toute requête (un refus arrête tout). Table du RR
 * illisible : aucune requête. Un repère qui attend : daté du départ, avant toute requête (entrée
 * 18 ; écriture refusée, arrêt sans requête). Sinon mmr v3 puis, s'il reste du quota, mmr-history v2 ; les deux
 * lus, le RR nouveau s'ajoute à la table et le rang est remplacé. Puis les rôles des agents (sans eux,
 * aucune page), la première collecte marquée lancée, les ressources des stats (entrée 9, rangerRessources :
 * dans l'app seulement, sans jamais faire échouer la collecte), les pages que dit reprise.ts (jusqu'à une
 * page vide pour la première collecte, jusqu'à la frontière ensuite, au repère après une
 * coupure), chaque partie gardée aussitôt, le repère gardé après chaque page traitée
 * entièrement ; `avancee` reçoit la Ligne d'état après chaque page. À la fin d'une collecte
 * complète : contrôle des fichiers du compte à la première collecte seulement, puis, en une
 * écriture, repère effacé, frontière avancée sauf refus, réussite datée, première collecte
 * terminée sans refus, trou possible. Tout échec s'arrête là, sans nouvel essai, sans rien
 * effacer de ce qui est gardé ; seul le dernier échec s'écrit en plus.
 * `rafraichir` : la collecte de ↻ (entrée 6, collecteRafraichir) ; le marqueur posé `par:
 * "rafraichir"` ; sous lui, avant toute requête, meta.json sans numéro de réduction ou première
 * collecte jamais lancée : rien, ni mise de côté ni requête, la cause dite (causeGarde) ; puis son
 * échéance avant chaque attente et requête (mmr v3, mmr-history v2, rôles, pages), chaque requête
 * coupée à elle, corps compris : atteinte, arrêt propre (« interrompue »), sans dernier échec.
 * Sans lui (l'app), tout reste comme avant, sans échéance.
 * Entrée 4 de epic-stats-import : un import de l'historique de cette exécution (importIci de stockage.ts), même avant qu'il
 * prenne le marqueur (téléchargement du fichier) : rien, sans requête, comme « déjà en cours ».
 * Entrée 7 : sans `rafraichir` (l'app), une tâche gardée en vie avec Pro (commencerMaintien), ouverte dès le marqueur
 * pris, avant le titre au journal (une écriture qui attend le disque : une sortie aussitôt après l'appui serait sinon
 * manquée), et fermée après le marqueur relâché, quelle que soit l'issue ; rien d'autre n'en dépend.
 * Entrée 8 : sans `rafraichir`, une fois les gardes passées (compte, clé, limite, numéro, table du RR, heure du repère),
 * l'index SQLite du compte se tient à la fin, quelle que soit l'issue, sous le marqueur, avant de le relâcher (tenirIndex :
 * ses lignes après celles de la collecte, avant le résumé du maintien) ; ni bilan, ni Ligne, ni fichiers JSON n'en dépendent.
 */
export async function mettreAJour(avancee?: Avancee, rafraichir: Rafraichir | null = null): Promise<Bilan> {
  const debut = Date.now()
  const echeance = echeanceDu(rafraichir), par = parDu(rafraichir)
  const titre = rafraichir ? "— Mise à jour des stats (↻) —" : "— Mise à jour des stats —"
  if (importIci()) {
    await note(`${titre} déjà en cours : import de l'historique`)
    return { resultat: "deja", ligne: LIGNE_DEJA, ajoutees: 0, ecran: null }
  }
  // Avant tout `await` : un second appel concurrent trouve le marqueur.
  const marqueur = prendreMarqueur(debut, par)
  if (!marqueur.pris) {
    if (marqueur.ici) {
      await note(`${titre} déjà en cours (depuis ${Math.round(marqueur.age / 1000)} s)`)
      return { resultat: "deja", ligne: LIGNE_DEJA, ajoutees: 0, ecran: null }
    }
    if (marqueur.par === "rafraichir") {
      await note(`${titre} déjà en cours par ↻ (depuis ${Math.round(marqueur.age / 1000)} s)`)
      return { resultat: "dejaRafraichir", ligne: LIGNE_DEJA_RAFRAICHIR, ajoutees: 0, ecran: null, reessai: marqueur.reessai }
    }
    // Tenu par une autre exécution de l'app : sa collecte s'est arrêtée sans le relâcher. Jamais pris avant `reessai`.
    const sans = Math.max(0, Math.floor(marqueur.age / 1000)), reste = Math.ceil((marqueur.reessai - debut) / 1000)
    await note(`${titre} une mise à jour vient de s'arrêter (aucune activité depuis ${sans} s) : réessaie dans ${reste} s`)
    return { resultat: "arretee", ligne: ligneArretee(marqueur.reessai, debut), ajoutees: 0, ecran: null, reessai: marqueur.reessai }
  }
  // Entrée 7 : Mettre à jour de l'app, gardée en vie avec Pro quand on quitte l'app, du marqueur pris au marqueur relâché ;
  // jamais ↻. Écoute posée avant tout `await` : une sortie pendant l'écriture du titre est vue.
  const finMaintien = rafraichir === null ? commencerMaintien(TACHE_COLLECTE) : null
  // Entrée 8 : le compte dont l'index se tient à la fin (Mettre à jour de l'app), une fois les gardes passées.
  let indexer: string | null = null
  try {
    await note(titre)
    if (!marqueur.ecrit) await note("stats : marqueur de collecte non écrit.")

    const id = identite()
    if (!id) {
      await note("stats : aucun compte connu (ni compte gardé, ni PUUID dans les cookies avec une région dans shop.json) : aucune requête.")
      return { resultat: "sansCompte", ligne: LIGNE_SANS_COMPTE, ajoutees: 0, ecran: null }
    }
    const cle = lireCle()
    if (!cle) {
      await note("stats : aucune clé HenrikDev : aucune requête.")
      return { resultat: "sansCle", ligne: LIGNE_SANS_CLE, ajoutees: 0, ecran: null }
    }
    let m: Meta = { ...lireMeta(id), region: id.region }
    // ── ↻ (entrée 6) : seulement une fois la première collecte lancée depuis l'onglet Stats, sur un historique numéroté :
    // sans numéro, numeroter mettrait l'historique de côté et relancerait une première collecte depuis ↻ ──
    if (rafraichir && (m.reduction === null || m.premiereCollecte.lancee === null)) {
      const cause = causeGarde(m, id.puuid)
      await note("stats : " + GARDE[cause])
      const parties = nombreParties(id.puuid)
      return { resultat: cause, ligne: texteLigne(m, debut, parties), ajoutees: 0, ecran: { meta: m, parties } }
    }
    const attente = attenteRestante(m, debut)
    if (attente !== null) {
      await note(`stats : limite atteinte, réessaie dans ${attente} s : aucune requête.`)
      const parties = nombreParties(id.puuid)
      return { resultat: "attente", ligne: texteLigne(m, debut, parties), ajoutees: 0, ecran: { meta: m, parties } }
    }
    const secrets = [cle, id.puuid]
    // ── numéro de la réduction (entrée 17), avant toute requête : meta.json sans numéro → historique gardé mis de
    // côté et meta.json remis à zéro, puis numéroté ; un refus arrête tout ──
    if (m.reduction === null) {
      const n = await numeroter(m, secrets)
      if (n.arret) return n.arret
      m = n.m
    }
    // Le RR gardé ne s'écrase jamais : une table illisible arrête tout, avant toute requête.
    const table = lireRr(id.puuid)
    if (table.etat === "illisible") {
      return await echouer(m, "stockage", "rr.json illisible, laissé tel quel : aucune requête", null)
    }
    const compteAdresse = `${encodeURIComponent(id.region)}/${PLATEFORME}/${encodeURIComponent(id.puuid)}`
    // Un repère qui attend (entrée 18) : daté du départ de cette collecte, avant toute requête, pour qu'une reprise coupée
    // avant son premier repère neuf (Fermer, panne, limite) ne laisse jamais l'heure d'une coupure plus ancienne.
    if (m.reprise) {
      const datee: Meta = { ...m, reprise: { ...m.reprise, quand: new Date(Date.now()).toISOString() } }
      try {
        ecrireMeta(datee)
      } catch (e) {
        return await echouer(datee, "stockage", `heure du repère non gardée (${sansIdentifiant(e, secrets)}) : aucune requête`, null)
      }
      m = datee
    }
    // Gardes passées : quelle qu'en soit l'issue, l'index du compte se tient à la fin (entrée 8), jamais par ↻.
    if (rafraichir === null) indexer = id.puuid

    // ── rang et RR (↻ : chaque requête bornée par l'échéance, qui atteinte l'arrête avant ou pendant) ──
    rafraichirMarqueur(debut, Date.now())
    const delaiMmr = delaiBorne(DELAI_REQUETE, Date.now(), echeance)
    if (delaiMmr === null) return await interrompre(rafraichir, m, "avant mmr v3", null)
    const mmr = await lire("mmr v3", `/valorant/v3/by-puuid/mmr/${compteAdresse}`, cle, secrets, delaiMmr, echeance, true)
    // La requête d'avant la première page : son départ, sa réponse, son quota (l'attente avant la page 1 en part).
    let precedente: Precedente
    if (!mmr.ok) {
      if (coupeeParEcheance(mmr, rafraichir)) return await interrompre(rafraichir, m, "pendant mmr v3", null)
      // HenrikDev a répondu « pas de classement pour ce compte » (404, code 25 : un compte jamais classé) : ce n'est pas une
      // panne. Ni rang ni RR ne sont lus ni écrits (ceux déjà gardés restent), et la mise à jour continue avec les parties.
      if (!(mmr.type === "panne" && mmr.code === CODE_SANS_CLASSEMENT)) return await echouer(m, mmr.type, detailDe(mmr), mmr.delai)
      const quota: Quota = mmr.quota ?? { restant: null, limite: null, reset: null }
      const ici = Date.now()
      precedente = { depart: ici, reponse: ici, quota }
      await note(`stats : HenrikDev n'a pas de classement pour ce compte (${mmr.detail}) : ni rang ni RR, la mise à jour continue ; `
        + `quota restant ${quotaEnClair(quota)}.`)
    } else {
      const rang = rangDepuisMmr(mmr.valeur, Date.now())
      if (!rang) return await echouer(m, "panne", "mmr v3 : réponse inattendue", null)
      if (quotaEpuise(mmr.quota)) {
        return await echouer(m, "limite", `quota épuisé avant mmr-history v2 (${quotaEnClair(mmr.quota)})`, mmr.quota.reset)
      }

      rafraichirMarqueur(debut, Date.now())
      const delaiHistorique = delaiBorne(DELAI_REQUETE, Date.now(), echeance)
      if (delaiHistorique === null) return await interrompre(rafraichir, m, "avant mmr-history v2", null)
      const departHistorique = Date.now()
      const historique = await lire("mmr-history v2", `/valorant/v2/by-puuid/mmr-history/${compteAdresse}`, cle, secrets, delaiHistorique, echeance)
      if (!historique.ok) {
        if (coupeeParEcheance(historique, rafraichir)) return await interrompre(rafraichir, m, "pendant mmr-history v2", null)
        return await echouer(m, historique.type, historique.detail, historique.delai)
      }
      const reponseHistorique = Date.now()
      const lues = lignesRr(historique.valeur)
      if (!lues) return await echouer(m, "panne", "mmr-history v2 : réponse inattendue", null)

      const { lignes, nouvelles } = fusionnerRr(table.lignes, lues.lignes)
      try {
        if (nouvelles.length > 0) ecrireRr(id.puuid, lignes)
        ecrireRang(id.puuid, rang)
      } catch (e) {
        return await echouer(m, "stockage", "écriture impossible (" + sansIdentifiant(e, secrets) + ")", null)
      }
      const palier = rang.current.tier?.name ?? "inconnu"
      const ignorees = lues.ignorees > 0 ? `, ${lues.ignorees} sans match_id ignorés` : ""
      await note(`stats : rang ${palier}, ${rang.current.rr ?? "?"} RR ; RR : ${lues.lignes.length} lus, `
        + `${nouvelles.length} nouveaux${ignorees}, ${lignes.length} gardés ; quota restant ${quotaEnClair(mmr.quota)} `
        + `puis ${quotaEnClair(historique.quota)}.`)
      precedente = { depart: departHistorique, reponse: reponseHistorique, quota: historique.quota }
    }

    // ── rôles des agents : catalog.json, sinon valorant-api ; sans eux, aucune page ──
    let valorantApi = 0
    const catalogue = lireJson(CATALOG)
    let roles = catalogue.etat === "ok" && estObjet(catalogue.valeur) ? rolesDeSection(catalogue.valeur.agents) : null
    if (!roles) {
      rafraichirMarqueur(debut, Date.now())
      const delaiRoles = delaiBorne(DELAI_REQUETE, Date.now(), echeance)
      if (delaiRoles === null) return await interrompre(rafraichir, m, "avant la lecture des rôles des agents", null)
      valorantApi++
      const lu = await lireAgents(delaiRoles, echeance)
      if (!lu.ok && coupeeParEcheance(lu, rafraichir)) return await interrompre(rafraichir, m, "pendant la lecture des rôles des agents", null)
      roles = lu.ok ? rolesDeSection(lu.agents) : null
      if (!lu.ok || !roles) {
        return await echouer(m, "roles", `rôles des agents (${lu.ok ? "aucun rôle" : lu.detail}) : aucune page lue`, null)
      }
      await note(`stats : rôles des agents lus sur valorant-api (${compte(Object.keys(roles).length, "agent")}), ${rangerAgents(lu.agents)}.`)
    }

    // ── première collecte lancée, avant la première page ──
    let meta = m
    if (meta.premiereCollecte.lancee === null) {
      meta = { ...meta, premiereCollecte: { ...meta.premiereCollecte, lancee: new Date(Date.now()).toISOString() } }
      try {
        ecrireMeta(meta)
      } catch (e) {
        await note("stats : première collecte lancée, non gardée (" + sansIdentifiant(e, secrets) + ").")
      }
    }

    // ── ressources des stats (entrée 9) : Mettre à jour de l'app seulement, jamais ↻ ; leur temps tombe dans l'attente
    // de la page 1, qui part de mmr-history ; un échec ne fait jamais échouer la collecte ──
    if (rafraichir === null) valorantApi += await rangerRessources(debut, secrets)

    // ── pages ──
    const k: Collecte = {
      id, cle, secrets, compte: compteAdresse, debut, m: meta, roles, relus: false, riotIdVu: false, ici: new Set(),
      precedente,
      avancee, rafraichir,
      c: {
        henrikdev: 2, valorantApi, pages: 0, lues: 0, ajoutees: 0, dejaGardees: 0, ecartees: 0, refusees: 0,
        parRaison: new Map(), gardees: nombreParties(id.puuid), attenteMs: 0, depensesDemandees: 0, depensesLues: 0, depensesEnEchec: 0,
      },
    }
    const pages = await lirePages(k)
    if (pages.arret) return pages.arret
    const f = pages.fin

    // ── fin d'une collecte complète : contrôle des fichiers à la première collecte seulement ; puis, en
    // une écriture, repère effacé, frontière avancée sauf refus, réussite datée, première collecte
    // terminée sans refus, trou possible ──
    const premiere = k.m.premiereCollecte.terminee === null
    const controle = premiere ? controlerFichiers(id.puuid) : null
    const fin = Date.now()
    const total = nombreParties(id.puuid)
    const finIso = new Date(fin).toISOString()
    const neuve: Meta = {
      ...k.m,
      reprise: null,
      frontiere: f.frontiere,
      derniereReussite: finIso,
      premiereCollecte: { ...k.m.premiereCollecte, terminee: k.m.premiereCollecte.terminee ?? (f.refus ? null : finIso) },
      dernierTrou: f.trou ? { quand: finIso, de: f.trou.de, a: f.trou.a } : k.m.dernierTrou,
    }
    try {
      ecrireMeta(neuve)
    } catch (e) {
      // Fin non gardée : pas une réussite ; le repère écrit reste, la collecte suivante reprendra.
      return await arreter(k, "stockage", "fin de la collecte non gardée (" + sansIdentifiant(e, secrets) + ")", null)
    }
    const cause = f.cible ? `au moins ${PARTIES_AVANT_TROU} parties avant la frontière, la liste n'étant complète que sur les plus récentes` : "la liste finit avant la frontière"
    if (f.trou) await note(`stats ⚠️ trou possible : ${cause} ; parties entre ${f.trou.de} et ${f.trou.a ?? "?"} peut-être absentes.`)
    const frontiere = f.refus ? "inchangée (refus depuis la dernière collecte complète)" : f.frontiere ? `au ${f.frontiere.debut}` : "aucune"
    await note(`stats : fin ${f.cible ? "à la frontière" : "à la page vide"}${k.m.reprise ? ", repère effacé" : ""} ; frontière ${frontiere}.`)
    const illisibles = controle && controle.illisibles > 0 ? `, ${compte(controle.illisibles, "illisible")}` : ""
    const verif = controle
      ? `contrôle : ${compte(controle.fichiers, "fichier")}, ${compte(controle.chemins, "chemin suspect", "chemins suspects")}${illisibles} ; `
      : ""
    // ⚠️ : trou possible, ou le contrôle a trouvé un chemin suspect ou un fichier illisible parmi ceux du compte.
    const alerte = f.trou !== null || (controle !== null && (controle.chemins > 0 || controle.illisibles > 0))
    await note(`stats ${alerte ? "⚠️" : "✅"} parties : ${resumeParties(k.c)} ; ${compte(total, "partie gardée", "parties gardées")} en tout ; `
      + verif
      + `coût : ${compte(k.c.henrikdev, "requête")} à HenrikDev${coutDesDepenses(k.c)}, ${k.c.valorantApi} à valorant-api, ${Math.round(k.c.attenteMs / 1000)} s d'attente ; `
      + `en ${fin - debut} ms.`)
    return {
      resultat: "reussie", ligne: texteLigne(neuve, fin, total, suiteDeLigne("reussie", k.c.ajoutees)), ajoutees: k.c.ajoutees,
      ecran: { meta: neuve, parties: total },
    }
  } finally {
    if (indexer !== null) await tenirIndex(indexer, debut)
    relacherMarqueur()
    if (finMaintien !== null) await finMaintien()
  }
}

// ─────────────────────────── ↻ (entrée 6) ───────────────────────────

/** La clé et le PUUID connus, pour masquer le texte d'une erreur inattendue ; ce qui ne se lit pas est passé. */
function secretsConnus(): string[] {
  const s: string[] = []
  try {
    const cle = lireCle()
    if (cle) s.push(cle)
  } catch { /* trousseau illisible */ }
  try {
    const id = identite()
    if (id) s.push(id.puuid)
  } catch { /* compte illisible */ }
  return s
}

/**
 * La collecte de ↻ (AppIntent RefreshShop, app_intents.tsx), lancée après la boutique et le rechargement du widget,
 * quelle qu'en soit l'issue : celle de Mettre à jour (compte gardé, même session expirée ; clé ; rang, RR, parties,
 * repère), sans notification, son marqueur posé `par: "rafraichir"` ; seulement une fois la première collecte lancée
 * depuis l'onglet Stats sur un historique numéroté ; avant l'échéance de `r` : arrêtée à temps, elle laisse le repère
 * de l'entrée 5, sans échec (mettreAJour). Ne lève jamais : une erreur inattendue va au journal, sans chemin, clé,
 * PUUID ni UUID, et rend null.
 */
export async function collecteRafraichir(r: Rafraichir): Promise<Bilan | null> {
  try {
    return await mettreAJour(undefined, r)
  } catch (e) {
    try {
      await note("stats : collecte de ↻ en erreur (" + sansIdentifiant(e, secretsConnus()) + ").")
    } catch { /* journal indisponible : rien de plus */ }
    return null
  }
}

// ─────────────────────────── à l'ouverture de l'app (entrée 20) ───────────────────────────

/**
 * La mise à jour automatique de l'ouverture part-elle (entrée 20 ; deciderMajAuto de historique.ts) ? Ce que l'onglet Stats
 * tient (`premier`, le Premier lancement à l'écran ; `cle`, la clé rangée ; `occupe`, sa collecte ou son import en cours),
 * plus ce qui se lit ici sur place, sans requête, au moment de décider : les métadonnées du compte connecté (celles du
 * disque, pas celles de l'ouverture : une collecte finie depuis, ici ou par ↻, compte), l'import de cette exécution et le
 * marqueur de collecte (↻, ou une autre exécution de l'app). Appelée une fois par ouverture, la première page montrée,
 * jamais avant. Ne lève jamais : compte ou métadonnées illisibles, rien de connu ; un marqueur illisible ne compte pas.
 */
export function majAutoALOuverture(e: { premier: boolean; cle: boolean; occupe: boolean }, now: number): DecisionMajAuto {
  let meta: Meta | null = null
  try {
    const id = identite()
    meta = id ? lireMeta(id) : null
  } catch { /* compte illisible : rien de connu, rien ne part */ }
  return deciderMajAuto({ premier: e.premier, cle: e.cle, meta, enCours: e.occupe || importIci(), marqueur: lireMarqueur(), now })
}

// ─────────────────────────── données du tableau de bord (entrée 16 de epic-stats-tableau-de-bord) ───────────────────────────

/**
 * L'attente, en ms, au-delà de laquelle la lecture des données du tableau de bord se voit (décision 1 de l'entrée) : elle
 * cède alors la main, puis de nouveau chaque fois que ce temps repasse.
 */
export const ATTENTE_VISIBLE_MS = 300

/**
 * Les données du tableau de bord d'un compte, que l'onglet Stats tient et que ses sous-onglets recevront : ses parties, la
 * plus récente d'abord ; ses cumuls par agent, à plat, semaine après semaine, chacun portant sa semaine, sa file et son
 * agent ; sa table du RR, lignes sans matchId passées ; son rang gardé (null : inconnu) ; les ressources des stats
 * (lireRessources) ; `roles` : le rôle de chaque agent (id → rôle de valorant-api), tiré de la section `agents` de
 * catalog.json par rolesDeSection, null sans elle (entrée 24 : le rôle de la fiche d'un agent, que le sous-onglet ne lit
 * pas lui-même) ; `illisibles` : les fichiers de partie et de semaine passés.
 */
export type DonneesTableau = {
  parties: Partie[]
  cumuls: CumulAgent[]
  rr: LigneRr[]
  rang: Rang | null
  ressources: Ressources
  roles: Roles | null
  illisibles: number
}

/**
 * Lit les données du tableau de bord du compte `puuid` (DonneesTableau), sur place, chaque fichier une fois : ses parties,
 * ses semaines de cumuls, rr.json, rang.json, puis catalog.json (ressources des stats et rôles des agents). Ni requête, ni
 * collecte, ni écriture, pas même au journal.
 * Entrée 8 : avec Pro, l'index stats.sqlite du compte présent (indexALire, en lecture seule) et répondant au numéro de
 * réduction de meta.json, chaque partie qui y est se prend dans la base, par lots, les autres de leur fichier (base.ts,
 * etapesDesParties) : mêmes parties, dans le même ordre, mêmes illisibles ; sans index, rien ne change.
 * Tolérante, ne lève jamais : un fichier de partie ou de semaine illisible est passé et compté ; rr.json absent ou illisible,
 * RR vide ; rang.json, rang null ; catalog.json, sections vides et rôles null. D'un trait tant que l'attente ne se voit
 * pas ; au-delà de ATTENTE_VISIBLE_MS, `attente` est appelé, une fois, puis la lecture cède la main (dormir) avant le
 * fichier suivant, et de nouveau chaque fois que ce temps repasse : l'écran montre son indicateur et reste vivant.
 */
export async function lireDonnees(puuid: string, attente: () => void): Promise<DonneesTableau> {
  let depuis = Date.now()
  let vue = false
  const d: DonneesTableau = {
    parties: [], cumuls: [], rr: [], rang: null, ressources: lireRessources(null), roles: null, illisibles: 0,
  }
  // Entrée 8 : l'index du compte, s'il se lit (Pro, présent), avec le numéro de réduction auquel il doit répondre.
  const index = indexALire(puuid)
  const reduction = index ? lireMeta({ puuid, region: "" }).reduction : null
  // Une étape par fichier, dans l'ordre de lecture (avec l'index, une requête par lot de parties en plus).
  const etapes: EtapeLecture[] = [
    ...etapesDesParties(index, reduction, fichiersDuCompte(puuid), (p) => {
      if (p) d.parties.push(p)
      else d.illisibles++
    }),
    ...fichiersCumuls(puuid).map((f) => () => {
      const c = lireCumuls(f)
      if (c) for (const x of c) d.cumuls.push(x)
      else d.illisibles++
    }),
    () => {
      const table = lireRr(puuid)
      d.rr = table.etat === "ok" ? lignesRrLues(table.lignes) : []
    },
    () => {
      d.rang = lireRang(puuid)
    },
    () => {
      const lu = lireJson(CATALOG)
      d.ressources = lireRessources(lu.etat === "ok" ? lu.valeur : null)
      // Entrée 24 : les rôles des agents, de la même lecture.
      d.roles = lu.etat === "ok" && estObjet(lu.valeur) ? rolesDeSection(lu.valeur.agents) : null
    },
  ]
  for (const etape of etapes) {
    if (Date.now() - depuis >= ATTENTE_VISIBLE_MS) {
      if (!vue) {
        vue = true
        try {
          attente()
        } catch { /* l'écran ne fait jamais échouer la lecture */ }
      }
      await dormir(0)
      depuis = Date.now()
    }
    const requete = etape()
    if (requete instanceof Promise) await requete
  }
  d.parties.sort(plusRecenteDabord)
  return d
}
