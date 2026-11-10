import {
  identiteLue, marqueurLu, metaLue, nouveauCompte, nouveauMarqueur, rangLu, tableRrLue,
  type Identite, type LigneRr, type Meta, type OrigineMarqueur, type Rang,
} from "./historique"
import { estSemaine, partieLue, semaineLue, type Place, type Semaine } from "./parties"
import type { CumulAgent, Partie } from "./reduction"




































const STATS = FileManager.appGroupDocumentsDirectory + "/stats"
/** Le compte connecté : `{ "puuid", "region", "depuis" }`. */
export const COMPTE_FILE = STATS + "/compte.json"
/** Le marqueur de collecte : `{ "depuis", "activite", "par" }`. */
export const MARQUEUR_FILE = STATS + "/collecte.json"
const TEMP = ".tmp"

/** Dossier d'un compte : `stats/<puuid>`. */
export function dossierCompte(puuid: string): string {
  return `${STATS}/${puuid}`
}

/** Un fichier JSON lu : absent, illisible (contenu ou JSON), ou sa valeur. */
export type Lu = { etat: "absent" } | { etat: "illisible" } | { etat: "ok"; valeur: unknown }

/**
 * Lit un fichier JSON, ou, s'il manque, le temporaire laissé par un remplacement
 * interrompu (complet : il n'est jamais renommé avant d'être écrit en entier). Un
 * temporaire illisible vient d'une première écriture interrompue : rien n'avait encore
 * été gardé, il compte pour absent.
 */
export function lireJson(chemin: string): Lu {
  try {
    if (FileManager.existsSync(chemin)) return { etat: "ok", valeur: JSON.parse(FileManager.readAsStringSync(chemin)) }
  } catch {
    return { etat: "illisible" }
  }
  try {
    if (FileManager.existsSync(chemin + TEMP)) return { etat: "ok", valeur: JSON.parse(FileManager.readAsStringSync(chemin + TEMP)) }
  } catch { /* première écriture interrompue */ }
  return { etat: "absent" }
}

/**
 * Écriture sûre : le dossier au besoin, le contenu entier dans `<chemin>.tmp`, puis
 * l'ancien fichier retiré et le temporaire renommé à sa place. Fichier absent et
 * temporaire lisible (remplacement interrompu) : le temporaire est d'abord remis en place,
 * pour qu'il ne soit jamais la seule copie au moment où on le récrit. Lève l'erreur de
 * l'hôte : à l'appelant de la journaliser.
 */
export function ecrireSur(chemin: string, contenu: string): void {
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"))
  if (!FileManager.existsSync(dossier)) FileManager.createDirectorySync(dossier, true)
  const temp = chemin + TEMP
  if (!FileManager.existsSync(chemin) && FileManager.existsSync(temp)) {
    let lisible = false
    try {
      JSON.parse(FileManager.readAsStringSync(temp))
      lisible = true
    } catch { /* première écriture interrompue : rien à remettre en place */ }
    if (lisible) FileManager.renameSync(temp, chemin)
  }
  FileManager.writeAsStringSync(temp, contenu)
  if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
  FileManager.renameSync(temp, chemin)
}

// ─────────────────────────── images des ressources des stats (entrée 9) ───────────────────────────

/** Le dossier du groupe d'apps, auquel les ressources des stats rapportent le chemin de leurs images. */
const GROUPE = FileManager.appGroupDocumentsDirectory
/** Le dossier des images : `icons/`, celui des icônes de la boutique (valshop.ts). */
export const DOSSIER_ICONES = GROUPE + "/icons"
/** Le chemin relatif d'une image rangée : `icons/<nom>.png`, un seul segment fait de chiffres, de lettres et de tirets. */
const IMAGE = /^icons\/[0-9a-z][0-9a-z-]*\.png$/i

/** Le chemin entier d'une image d'après son chemin relatif (`icons/<uuid>.png`). Lève pour un chemin d'une autre forme : jamais hors de `icons/`. */
function cheminImage(relatif: string): string {
  if (!IMAGE.test(relatif)) throw new Error("image d'un nom inattendu")
  return GROUPE + "/" + relatif
}

/** L'image de ce chemin relatif est-elle là ? Lève si l'hôte ne sait pas le dire, ou pour un chemin d'une autre forme. */
export function imagePresente(relatif: string): boolean {
  return FileManager.existsSync(cheminImage(relatif))
}

/**
 * Range une image telle que reçue, à sa taille d'origine, en écriture sûre : `icons/` au besoin, ses octets entiers
 * dans `<chemin>.tmp` (`writeAsData`, comme les icônes de la boutique), puis l'image d'avant retirée et le temporaire
 * renommé à sa place ; interrompue, l'écriture laisse l'image d'avant, ou aucune, que la collecte suivante télécharge.
 * Lève l'erreur de l'hôte : à l'appelant de la journaliser, sans chemin.
 */
export async function ecrireImage(relatif: string, octets: Data): Promise<void> {
  const chemin = cheminImage(relatif)
  if (!FileManager.existsSync(DOSSIER_ICONES)) FileManager.createDirectorySync(DOSSIER_ICONES, true)
  const temp = chemin + TEMP
  await FileManager.writeAsData(temp, octets)
  if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
  FileManager.renameSync(temp, chemin)
}

// ─────────────────────────── compte connecté ───────────────────────────

/** Le compte gardé à la dernière lecture de boutique réussie ; null s'il manque ou ne se lit pas. */
export function lireCompte(): Identite | null {
  const lu = lireJson(COMPTE_FILE)
  return lu.etat === "ok" ? identiteLue(lu.valeur) : null
}

/** Garde le compte d'une lecture de boutique réussie. Lève si le PUUID ou la région n'ont pas leur forme (sans les citer), ou si l'écriture échoue. */
export function garderCompte(id: Identite, now: number): void {
  if (!identiteLue(id)) throw new Error("PUUID ou région d'une forme inattendue")
  ecrireSur(COMPTE_FILE, nouveauCompte(id, now))
}

/** Oublie le compte connecté (changement de compte) ; les dossiers des comptes restent. Lève si l'effacement échoue. */
export function effacerCompte(): void {
  for (const p of [COMPTE_FILE, COMPTE_FILE + TEMP]) if (FileManager.existsSync(p)) FileManager.removeSync(p)
}

// ─────────────────────────── données d'un compte ───────────────────────────

const meta = (puuid: string) => dossierCompte(puuid) + "/meta.json"
const rr = (puuid: string) => dossierCompte(puuid) + "/rr.json"
const rang = (puuid: string) => dossierCompte(puuid) + "/rang.json"

/** Les métadonnées du compte ; absentes ou illisibles : rien de connu. */
export function lireMeta(id: Identite): Meta {
  const lu = lireJson(meta(id.puuid))
  return metaLue(lu.etat === "ok" ? lu.valeur : null, id)
}

export function ecrireMeta(m: Meta): void {
  ecrireSur(meta(m.puuid), JSON.stringify(m, null, 2))
}

/**
 * meta.json du compte existe sans se lire en objet JSON (contenu, JSON ou forme ; temporaire
 * d'un remplacement interrompu compris, comme lireMeta) : rien n'en est connu, pas même son
 * numéro de réduction, et il ne vaut pas « sans numéro » (entrée 17). Absent : faux.
 */
export function metaIllisible(puuid: string): boolean {
  const lu = lireJson(meta(puuid))
  return lu.etat === "illisible" || (lu.etat === "ok" && (typeof lu.valeur !== "object" || lu.valeur === null || Array.isArray(lu.valeur)))
}

/**
 * La table du RR du compte : vide si elle n'existe pas encore ; `illisible` si le fichier
 * existe sans se lire, auquel cas il ne doit jamais être écrasé.
 */
export function lireRr(puuid: string): { etat: "ok"; lignes: LigneRr[] } | { etat: "illisible" } {
  const lu = lireJson(rr(puuid))
  if (lu.etat === "absent") return { etat: "ok", lignes: [] }
  const table = lu.etat === "ok" ? tableRrLue(lu.valeur) : null
  return table ? { etat: "ok", lignes: table } : { etat: "illisible" }
}

/** Récrit la table entière, lignes gardées comprises, telles quelles (fusionnerRr). */
export function ecrireRr(puuid: string, lignes: readonly LigneRr[]): void {
  ecrireSur(rr(puuid), JSON.stringify(lignes, null, 2))
}

/** Remplace le rang du compte. */
export function ecrireRang(puuid: string, r: Rang): void {
  ecrireSur(rang(puuid), JSON.stringify(r, null, 2))
}

/**
 * Le rang gardé du compte (entrée 16 de epic-stats-tableau-de-bord), relu comme une réponse de mmr v3 (rangLu) ; null s'il
 * manque, ne se lit pas, ou n'a ni `updatedAt` daté ni `current`. Jamais écrit ici.
 */
export function lireRang(puuid: string): Rang | null {
  const lu = lireJson(rang(puuid))
  return lu.etat === "ok" ? rangLu(lu.valeur) : null
}

// ─────────────────────────── parties et cumuls d'un compte ───────────────────────────

const dossierParties = (puuid: string) => dossierCompte(puuid) + "/parties"
const dossierCumuls = (puuid: string) => dossierCompte(puuid) + "/cumuls"
const MOIS = /^\d{4}-\d{2}$/
const FICHIER_PARTIE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i
const FICHIER_SEMAINE = /^\d{4}-W\d{2}\.json$/

/** Fichier d'une partie : `stats/<puuid>/parties/<AAAA-MM>/<matchId>.json` (place de parties.ts : UUID en minuscules, mois UTC). */
export function cheminPartie(puuid: string, place: Place): string {
  return `${dossierParties(puuid)}/${place.mois}/${place.matchId}.json`
}

/** Fichier d'une semaine de cumuls : `stats/<puuid>/cumuls/<semaine>.json`. Lève pour une semaine d'une autre forme (jamais dans un chemin). */
export function cheminSemaine(puuid: string, semaine: string): string {
  if (!estSemaine(semaine)) throw new Error("semaine d'une forme inattendue")
  return `${dossierCumuls(puuid)}/${semaine}.json`
}

/** La partie est-elle déjà gardée ? Son fichier existe ; il n'est jamais récrit. */
export function partieGardee(puuid: string, place: Place): boolean {
  return FileManager.existsSync(cheminPartie(puuid, place))
}

/**
 * Garde une partie réduite, en JSON compact, en écriture sûre ; jamais récrite : faux, sans
 * rien écrire, si son fichier existe déjà. Lève si l'écriture échoue.
 */
export function ecrirePartie(puuid: string, place: Place, partie: Partie): boolean {
  const chemin = cheminPartie(puuid, place)
  if (FileManager.existsSync(chemin)) return false
  ecrireSur(chemin, JSON.stringify(partie))
  return true
}

/**
 * Une semaine de cumuls : vide si son fichier n'existe pas encore ; `illisible` si le fichier
 * existe sans se lire ou sans sa forme, auquel cas il ne doit jamais être écrasé.
 */
export function lireSemaine(puuid: string, semaine: string): { etat: "ok"; semaine: Semaine } | { etat: "illisible" } {
  const lu = lireJson(cheminSemaine(puuid, semaine))
  if (lu.etat === "absent") return { etat: "ok", semaine: { comptees: [], cumulsAgents: [] } }
  const s = lu.etat === "ok" ? semaineLue(lu.valeur) : null
  return s ? { etat: "ok", semaine: s } : { etat: "illisible" }
}

/** Récrit une semaine de cumuls entière, `comptees` compris, en une écriture sûre (JSON compact). Lève si l'écriture échoue. */
export function ecrireSemaine(puuid: string, semaine: string, contenu: Semaine): void {
  ecrireSur(cheminSemaine(puuid, semaine), JSON.stringify(contenu))
}

/**
 * Les cumuls par agent d'une semaine gardée, lus de son fichier (`chemin`, l'un de fichiersCumuls ; entrée 16 de
 * epic-stats-tableau-de-bord), tels qu'écrits, chacun portant sa semaine, sa file et son agent ; `comptees` n'en sort pas.
 * null si le fichier ne se lit pas ou n'a pas la forme d'une semaine (semaineLue).
 */
export function lireCumuls(chemin: string): CumulAgent[] | null {
  const lu = lireJson(chemin)
  const s = lu.etat === "ok" ? semaineLue(lu.valeur) : null
  return s ? s.cumulsAgents : null
}

/**
 * Noms des éléments d'un dossier, triés : le dernier segment de chaque chemin que rend l'hôte
 * (nom seul ou chemin entier) ; vide si le dossier manque ou ne se lit pas. `strict` (l'import,
 * entrée 4 de epic-stats-import) : un dossier présent que l'hôte ne sait pas lister lève, au lieu
 * de passer pour vide.
 */
function lister(dossier: string, strict = false): string[] {
  try {
    if (!FileManager.existsSync(dossier)) return []
    return FileManager.readDirectorySync(dossier).map((p) => p.slice(p.lastIndexOf("/") + 1)).filter((n) => n !== "").sort()
  } catch (e) {
    if (strict) throw e
    return []
  }
}

/**
 * Les fichiers des parties gardées du compte, en chemins entiers : les dossiers de mois de
 * `parties/` listés, puis leurs fichiers `<matchId>.json` ; ni temporaire, ni autre fichier.
 * `strict` : un listage refusé lève (lister).
 */
export function fichiersParties(puuid: string, strict = false): string[] {
  const racine = dossierParties(puuid)
  return lister(racine, strict).filter((m) => MOIS.test(m))
    .flatMap((m) => lister(`${racine}/${m}`, strict).filter((f) => FICHIER_PARTIE.test(f)).map((f) => `${racine}/${m}/${f}`))
}

/** Les fichiers des semaines de cumuls du compte, en chemins entiers ; ni temporaire, ni autre fichier. `strict` : un listage refusé lève (lister). */
export function fichiersCumuls(puuid: string, strict = false): string[] {
  const racine = dossierCumuls(puuid)
  return lister(racine, strict).filter((f) => FICHIER_SEMAINE.test(f)).map((f) => `${racine}/${f}`)
}

/** Nombre de parties gardées du compte, dossiers listés, sans lire une seule partie. */
export function nombreParties(puuid: string): number {
  return fichiersParties(puuid).length
}

/**
 * Le chemin d'un fichier de partie du compte (l'un de fichiersParties) relatif à `parties/` : `<AAAA-MM>/<matchId>.json`, sa
 * clé dans l'index `stats.sqlite` (entrée 2.8 de epic-stats-collecte).
 */
export function relatifPartie(puuid: string, chemin: string): string {
  const racine = dossierParties(puuid) + "/"
  return chemin.startsWith(racine) ? chemin.slice(racine.length) : chemin
}

/**
 * Une partie gardée, lue de son fichier (`chemin`, l'un de fichiersParties) : un objet avec son `matchId` et un `debut` qui
 * se lit ; null si le fichier ne se lit pas ou n'a pas cette forme. lireHistorique, et le tableau de bord (entrée 16 de
 * epic-stats-tableau-de-bord), qui lit ses fichiers un à un.
 */
export function partieDuFichier(chemin: string): Partie | null {
  const lu = lireJson(chemin)
  return lu.etat === "ok" ? partieLue(lu.valeur) : null
}

/** L'ordre de l'historique, pour `sort` : la plus récente d'abord (`debut`), puis par matchId. */
export function plusRecenteDabord(a: Partie, b: Partie): number {
  return Date.parse(b.debut) - Date.parse(a.debut) || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0)
}

/**
 * L'historique du compte `puuid` (celui du compte connecté : `historiqueConnecte` de collecte.ts,
 * résolu comme la Ligne d'état) : ses parties gardées, la plus récente d'abord (`debut`, puis
 * matchId) ; un fichier illisible, ou sans `matchId` ni `debut` lisible, est passé et compté
 * (`illisibles`).
 */
export function lireHistorique(puuid: string): { parties: Partie[]; illisibles: number } {
  const parties: Partie[] = []
  let illisibles = 0
  for (const f of fichiersParties(puuid)) {
    const p = partieDuFichier(f)
    if (p) parties.push(p)
    else illisibles++
  }
  parties.sort(plusRecenteDabord)
  return { parties, illisibles }
}

// ─────────────────────────── historique mis de côté (entrée 17) ───────────────────────────

/** Historiques mis de côté du compte : `stats/<puuid>/de-cote`, que rien ne liste ni ne lit. */
const dossierDeCote = (puuid: string) => dossierCompte(puuid) + "/de-cote"

/**
 * Un historique est-il gardé au compte : son dossier `parties/` ou `cumuls/` existe-t-il ? Des
 * cumuls sans aucune partie comptent (une coupure peut en laisser). Lève si l'hôte ne sait pas le
 * dire : à l'appelant d'arrêter, sans rien déplacer.
 */
export function historiquePresent(puuid: string): boolean {
  return FileManager.existsSync(dossierParties(puuid)) || FileManager.existsSync(dossierCumuls(puuid))
}

/** `AAAAMMJJ-HHMMSS`, en heure UTC : le nom du dossier d'une mise de côté. */
function horodatage(now: number): string {
  const t = new Date(now).toISOString()
  return t.slice(0, 4) + t.slice(5, 7) + t.slice(8, 10) + "-" + t.slice(11, 13) + t.slice(14, 16) + t.slice(17, 19)
}

/**
 * Met de côté l'historique du compte : `cumuls/`, puis `parties/`, déplacés tels quels, sans
 * qu'aucun fichier soit lu, récrit ni effacé, sous `stats/<puuid>/de-cote/<AAAAMMJJ-HHMMSS>/`
 * (heure UTC de `now`). Ce dossier n'est jamais relu : l'app, le contrôle des fichiers et le
 * compte des parties ne listent que `parties/` et `cumuls/`. Les cumuls d'abord : laissés sans
 * leurs parties, leur `comptees` bloquerait les cumuls refaits. `parties/` refusé : `cumuls/`
 * remis en place, puis l'erreur levée, rien n'a bougé ; si cette remise échoue aussi, les
 * cumuls restent partis et les parties en place, que la mise de côté suivante prend. Un
 * dossier absent est passé. Lève l'erreur de l'hôte : à l'appelant de la journaliser, masquée.
 */
export function mettreDeCote(puuid: string, now: number): void {
  const dest = `${dossierDeCote(puuid)}/${horodatage(now)}`
  const cumuls = dossierCumuls(puuid), parties = dossierParties(puuid)
  const avecCumuls = FileManager.existsSync(cumuls), avecParties = FileManager.existsSync(parties)
  if (!avecCumuls && !avecParties) return
  // La destination porte le nom final : son parent doit exister ; une destination qui existe fait échouer.
  if (!FileManager.existsSync(dest)) FileManager.createDirectorySync(dest, true)
  if (avecCumuls) FileManager.renameSync(cumuls, dest + "/cumuls")
  if (!avecParties) return
  try {
    FileManager.renameSync(parties, dest + "/parties")
  } catch (e) {
    if (avecCumuls) {
      try {
        FileManager.renameSync(dest + "/cumuls", cumuls)
      } catch { /* cumuls partis, parties en place : la mise de côté suivante prend les parties */ }
    }
    throw e
  }
}

// ─────────────────────────── fichier d'import et index (entrée 4 de epic-stats-import) ───────────────────────────

/** Le nom du fichier d'import dans le dossier Documents de Scripting sur iCloud Drive (contrat-donnees.md, Fichier d'import, Dépôt). */
const NOM_IMPORT = "valshop-import.json"

/**
 * Le fichier d'import vu d'iCloud Drive : `inactif`, iCloud désactivé ou refusé à Scripting (`iCloudDocumentsDirectory`
 * n'est alors pas lu : il lèverait) ; `absent` ; ou `present`, son chemin (pour les fonctions ci-dessous seulement,
 * jamais au journal) et s'il est téléchargé.
 */
export type FichierDansIcloud =
  | { etat: "inactif" }
  | { etat: "absent" }
  | { etat: "present"; chemin: string; telecharge: boolean }

/** Où en est le fichier d'import dans iCloud Drive, sans rien télécharger ni lire. Lève si l'hôte ne sait pas le dire. */
export function fichierDansIcloud(): FichierDansIcloud {
  if (!FileManager.isiCloudEnabled) return { etat: "inactif" }
  const chemin = `${FileManager.iCloudDocumentsDirectory}/${NOM_IMPORT}`
  if (!FileManager.existsSync(chemin)) return { etat: "absent" }
  return { etat: "present", chemin, telecharge: FileManager.isiCloudFileDownloaded(chemin) }
}

/** Télécharge d'iCloud Drive le fichier d'import (`chemin` de fichierDansIcloud) ; vrai s'il l'est. Ne lève pas : un échec de l'hôte rend faux. */
export async function telechargerImport(chemin: string): Promise<boolean> {
  try {
    return (await FileManager.downloadFileFromiCloud(chemin)) === true
  } catch {
    return false
  }
}


export async function lireImport(chemin: string): Promise<string> {
  return await FileManager.readAsString(chemin)
}

/** Retire le fichier d'import d'iCloud Drive, s'il y est encore ; la copie du Mac reste. Lève si l'hôte refuse. */
export function retirerImport(chemin: string): void {
  if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
}

/** Les fichiers de l'index SQLite d'un compte : ses journaux (WAL, mémoire partagée, journal d'annulation), puis la base. */
const FICHIERS_INDEX = ["stats.sqlite-wal", "stats.sqlite-shm", "stats.sqlite-journal", "stats.sqlite"]

/** L'index SQLite du compte (entrée 2.8 de epic-stats-collecte) : `stats/<puuid>/stats.sqlite`, celui qu'efface effacerIndex. */
export function cheminIndex(puuid: string): string {
  return `${dossierCompte(puuid)}/${FICHIERS_INDEX[FICHIERS_INDEX.length - 1]}`
}

/** L'index SQLite du compte existe-t-il ? Lève si l'hôte ne sait pas le dire. */
export function indexPresent(puuid: string): boolean {
  return FileManager.existsSync(cheminIndex(puuid))
}

/**
 * Remet à reconstruire l'index `stats.sqlite` du compte (`stats/<puuid>/`, entrée 2.8 de epic-stats-collecte : reconstruit
 * s'il manque), index des fichiers JSON qui font foi : chacun de ses fichiers présent est effacé, les journaux d'abord et la
 * base en dernier (un journal laissé seul serait rejoué dans la base refaite : un effacement refusé laisse la base avec
 * lui). Vrai si l'un d'eux était là. Lève si l'hôte refuse un effacement.
 */
export function effacerIndex(puuid: string): boolean {
  let present = false
  for (const nom of FICHIERS_INDEX) {
    const chemin = `${dossierCompte(puuid)}/${nom}`
    if (FileManager.existsSync(chemin)) {
      FileManager.removeSync(chemin)
      present = true
    }
  }
  return present
}

/**
 * Un import de l'historique tourne-t-il dans cette exécution ? Du lancement à son issue, téléchargement compris, avant
 * même qu'il prenne le marqueur de collecte : Mettre à jour n'y collecte pas (collecte.ts). Posé et levé par
 * importation.ts ; état du module, comme le marqueur tenu : Fermer, qui finit l'exécution, l'efface avec elle.
 */
let importEnCoursIci = false

/** Un import tourne-t-il dans cette exécution ? Sans rien lire. */
export function importIci(): boolean {
  return importEnCoursIci
}

/** L'import de cette exécution commence (vrai) ou finit (faux) : importation.ts seulement. */
export function poserImportIci(enCours: boolean): void {
  importEnCoursIci = enCours
}

// ─────────────────────────── marqueur de collecte ───────────────────────────

/**
 * Le marqueur que tient cette exécution (entrée 18) : qui le tient et sa dernière activité, de la
 * prise à la relâche, qu'il soit écrit ou non. Le fichier ne dit pas si sa collecte vit encore ;
 * l'exécution, elle, sait si elle le tient. État du module : une exécution de Scripting (l'app,
 * l'AppIntent de ↻) le charge une fois, et Fermer, qui la finit, l'efface avec elle.
 */
let tenu: { par: OrigineMarqueur; activite: number } | null = null

/**
 * Ce que dit la prise du marqueur : `pris`, la collecte peut partir (`ecrit` faux si l'hôte a
 * refusé l'écriture : elle part quand même, comme pour `verrou.json`) ; sinon `ici`, cette
 * exécution le tient déjà, son activité date de `age` ms ; ou tenu ailleurs : un marqueur actif
 * (activité de moins de 2 min, il y a `age` ms) d'une autre exécution, qui le tient `par` l'app ou
 * par ↻, et qui ne se prend qu'à `reessai` (ms depuis l'epoch).
 */
export type PriseMarqueur =
  | { pris: true; ecrit: boolean }
  | { pris: false; ici: true; age: number }
  | { pris: false; ici: false; par: OrigineMarqueur; age: number; reessai: number }

/**
 * Prend le marqueur pour `par` (`app` par défaut ; `rafraichir`, la collecte de ↻), sans `await`
 * entre la lecture et l'écriture : la collision se réduit à quelques millisecondes. Tenu par cette
 * exécution : rien, pas même une lecture. Actif, quel qu'en soit l'auteur : rien, son origine et son
 * heure de réessai rendues. Absent, illisible ou périmé : remplacé, et retenu tenu, écrit ou non.
 */
export function prendreMarqueur(now: number, par: OrigineMarqueur = "app"): PriseMarqueur {
  if (tenu) return { pris: false, ici: true, age: now - tenu.activite }
  let contenu: string | null = null
  try {
    if (FileManager.existsSync(MARQUEUR_FILE)) contenu = FileManager.readAsStringSync(MARQUEUR_FILE)
  } catch { /* illisible : il ne compte pas */ }
  const actif = marqueurLu(contenu, now)
  if (actif) return { pris: false, ici: false, par: actif.par, age: actif.age, reessai: actif.reessai }
  tenu = { par, activite: now }
  try {
    if (!FileManager.existsSync(STATS)) FileManager.createDirectorySync(STATS, true)
    FileManager.writeAsStringSync(MARQUEUR_FILE, nouveauMarqueur(now, now, par))
    return { pris: true, ecrit: true }
  } catch {
    return { pris: true, ecrit: false }
  }
}

/** Rafraîchit l'activité du marqueur, avant chaque requête, sous l'origine de sa prise ; une erreur est sans conséquence. */
export function rafraichirMarqueur(depuis: number, now: number): void {
  if (tenu) tenu = { ...tenu, activite: now }
  try {
    FileManager.writeAsStringSync(MARQUEUR_FILE, nouveauMarqueur(depuis, now, tenu ? tenu.par : "app"))
  } catch { /* le marqueur périmera plus tôt, rien de plus */ }
}

/** Le contenu du marqueur, lu sur place, sans requête (↻ : un autre ↻ collecte-t-il ?) ; null s'il manque ou ne se lit pas. */
export function lireMarqueur(): string | null {
  try {
    return FileManager.existsSync(MARQUEUR_FILE) ? FileManager.readAsStringSync(MARQUEUR_FILE) : null
  } catch {
    return null
  }
}

/** Relâche le marqueur à la fin, succès ou échec : l'appui suivant n'est jamais bloqué. */
export function relacherMarqueur(): void {
  tenu = null
  try {
    if (FileManager.existsSync(MARQUEUR_FILE)) FileManager.removeSync(MARQUEUR_FILE)
  } catch { /* il périmera seul */ }
}
