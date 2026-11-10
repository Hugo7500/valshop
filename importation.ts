import { messageHote, type Identite, type Meta } from "./historique"
import { estSemaine, etatImport, preparerImport, refusHistorique, type EtatImport, type Preparation, type SemaineLocale } from "./parties"
import {
  ecrireMeta, ecrirePartie, ecrireSemaine, effacerIndex, fichierDansIcloud, fichiersCumuls, fichiersParties, importIci, lireImport,
  lireMeta, lireSemaine, partieDuFichier, poserImportIci, prendreMarqueur, rafraichirMarqueur, relacherMarqueur, retirerImport,
  telechargerImport,
} from "./stockage"
import { commencerMaintien, identite } from "./collecte"
import type { TacheMaintenue } from "./pro"
import { note } from "./valshop"

// Import de l'historique tracker.gg (entrée 4 de epic-stats-import ; contrat-donnees.md, Fichier d'import) : la procédure,
// sur les règles de l'entrée 3 (parties.ts : preparerImport, etatImport). Le fichier `valshop-import.json` du dossier
// Documents de Scripting sur iCloud Drive (stockage.ts) : iCloud actif, fichier présent, téléchargé au besoin, avant le
// marqueur (un téléchargement long le laisserait périmer) ; puis, sous le marqueur de collecte, pris sous `app` comme
// Mettre à jour (aucune collecte, ↻ compris, pendant que l'import écrit) : le fichier lu et validé en entier en mémoire,
// les semaines de cumuls locales lues (une illisible arrête tout, jamais écrasée), la jonction et le plan ; rien n'est
// écrit avant. Puis `importLance` (premier lancement seulement), et le plan par lots d'au plus PARTIES_PAR_LOT parties,
// chaque semaine avant ses parties, en écriture sûre (stockage.ts) : entre deux lots, le marqueur rafraîchi, l'avancée
// dite et la main rendue à l'écran. Coupé (app fermée, écriture refusée), l'historique reste continu depuis le plus
// récent, et le geste suivant recalcule ce qui reste, sans doublon. À la fin seulement : index `stats.sqlite` du compte
// remis à reconstruire, `importFait` dans meta.json, fichier retiré d'iCloud Drive. Le journal dit des nombres et des
// étapes, jamais un chemin, un identifiant ni une valeur du fichier (messageHote pour un message de l'hôte). Aucune
// requête : ce module n'importe pas `fetch`. Exposés pour la section « Ton historique d'avant » (entrée 5) :
// etatDeLImport (lecture seule), lancerImport (une issue, jamais d'exception), importEnCours. Entrée 6 : chaque lancement
// est une tâche gardée en vie avec Scripting Pro quand on quitte l'app (commencerMaintien de collecte.ts, pro.ts), de
// l'appui à son issue, téléchargement compris ; sans Pro, la ligne du repli au journal, et une coupure reprend au geste
// suivant ; le maintien ne lance jamais d'import.

/** Parties écrites au plus par lot : entre deux lots, le marqueur rafraîchi, l'avancée dite et la main rendue à l'écran. */
export const PARTIES_PAR_LOT = 10

/**
 * Ce qui empêche de lire le fichier ou l'historique sans que le fichier soit refusé : aucun compte connu ; iCloud Drive
 * inactif pour Scripting ; fichier présent mais pas téléchargé ; fichier ou historique illisible (erreur de l'hôte) ; une
 * semaine de cumuls locale illisible, que l'import n'écrase jamais.
 */
export type Indisponibilite = "compte" | "icloud" | "telechargement" | "lecture" | "semaines"

/** L'état de la section « Ton historique d'avant » (entrée 5) : celui des règles (etatImport), ou ce qui empêche de lire. */
export type EtatHistoriqueAvant = EtatImport | { etat: "indisponible"; cause: Indisponibilite }

/**
 * L'issue d'un lancement : `fait`, l'import fini maintenant (`quand`, `parties` : celles de `importFait` ; `ajoutees` : par
 * ce lancement) ; `rienEcrit`, arrêté avant toute écriture, et l'état qui dit pourquoi (déjà fait, absent, indisponible,
 * refusé) ; `stockage`, une écriture refusée : `importLance` au premier lancement, et rien n'est écrit, l'import reste prêt ;
 * une écriture refusée ensuite (semaine, partie, index, `importFait`), et l'import reste interrompu, rien n'est effacé, le
 * geste suivant reprend ou le finit (`ajoutees` : parties écrites avant l'arrêt) ; `collecte`, le marqueur tenu par une collecte de cette
 * exécution (`reessai` null) ou d'une autre (la collecte de ↻, ou une exécution arrêtée : `reessai`, en ms depuis l'epoch,
 * l'heure où il ne bloque plus) ; `dejaEnCours`, cet import tourne déjà dans cette exécution.
 */
export type BilanImport =
  | { issue: "fait"; quand: string; parties: number; ajoutees: number }
  | { issue: "rienEcrit"; etat: EtatHistoriqueAvant }
  | { issue: "stockage"; ajoutees: number }
  | { issue: "collecte"; reessai: number | null }
  | { issue: "dejaEnCours" }

/** L'avancée de l'import, au départ puis après chaque lot : parties ajoutées, sur les parties du premier lancement (comme `interrompu`). */
export type AvanceeImport = (ajoutees: number, parties: number) => void

/**
 * Un import tourne-t-il dans cette exécution ? Du lancement à son issue, téléchargement compris (importIci de stockage.ts,
 * que Mettre à jour lit aussi : il n'y collecte pas). Sans rien lire.
 */
export function importEnCours(): boolean {
  return importIci()
}

const TITRE = "— Import de l'historique tracker.gg —"

/** L'import, pour le maintien avec Pro et ses lignes au journal (entrée 6 ; contrat-donnees.md, journal.log). */
const TACHE_IMPORT: TacheMaintenue = { prefixe: "import", quoi: "l'import" }

/** Une ligne au journal, sans jamais faire échouer l'import. */
async function journal(ligne: string): Promise<void> {
  try {
    await note(ligne)
  } catch { /* journal indisponible : rien de plus */ }
}

/** Attend `ms` millisecondes : 0 rend la main à l'écran. */
function dormir(ms: number): Promise<void> {
  return new Promise((fin) => setTimeout(() => fin(), ms))
}


function compte(n: number, singulier: string, pluriel = singulier + "s"): string {
  return `${n} ${n > 1 ? pluriel : singulier}`
}

/** Un message de l'hôte pour le journal : sans chemin, tout UUID masqué, coupé. */
function sansChemin(e: unknown): string {
  return messageHote(String(e), [])
}

const indisponible = (cause: Indisponibilite): EtatHistoriqueAvant => ({ etat: "indisponible", cause })

/** Un arrêt avant toute écriture : l'état qui le dit, et sa raison pour le journal (en nombres, sans chemin). */
type Arret = { arret: EtatHistoriqueAvant; raison: string }

/** Le fichier trouvé : le compte, ses métadonnées, le chemin du fichier, et la durée de son téléchargement (null : déjà là). */
type Trouve = { arret: null; id: Identite; meta: Meta; chemin: string; telechargement: number | null }






async function trouver(): Promise<Arret | Trouve> {
  const id = identite()
  if (!id) return { arret: indisponible("compte"), raison: "aucun compte connu" }
  const meta = lireMeta(id)
  if (meta.importFait) return { arret: { etat: "fait", quand: meta.importFait.quand, parties: meta.importFait.parties }, raison: "déjà fait" }
  const f = fichierDansIcloud()
  if (f.etat === "inactif") return { arret: indisponible("icloud"), raison: "iCloud Drive inactif pour Scripting" }
  if (f.etat === "absent") return { arret: { etat: "absent" }, raison: "aucun fichier d'import dans iCloud Drive" }
  const refus = refusHistorique(meta)
  if (refus) return { arret: { etat: "refuse", refus }, raison: `refusé : ${refus.detail}` }
  if (f.telecharge) return { arret: null, id, meta, chemin: f.chemin, telechargement: null }
  const t = Date.now()
  if (!(await telechargerImport(f.chemin))) return { arret: indisponible("telechargement"), raison: "fichier pas téléchargé d'iCloud Drive" }
  return { arret: null, id, meta, chemin: f.chemin, telechargement: Date.now() - t }
}

/** Le fichier préparé : les métadonnées relues, la préparation de l'entrée 3, la taille du texte et les durées (ms). */
type Prepare = { arret: null; meta: Meta; preparation: Extract<Preparation, { ok: true }>; taille: number; lecture: number; analyse: number }

/**
 * Le fichier lu en entier et préparé sur l'historique du compte `id`, sans écriture (sous le marqueur pour un lancement) :
 * meta.json relu ; le texte lu (illisible : `lecture`) ; analysé (JSON illisible : refusé, forme, avant les semaines locales,
 * à sa place dans l'ordre des refus de preparerImport) ; les semaines de cumuls locales lues par leur nom, celles du dossier
 * et celles du fichier, qu'il pourrait écrire (une semaine restée dans son seul temporaire, lu en repli, compte comme
 * présente ; une illisible : `semaines`, jamais écrasée) ; puis preparerImport : refus de l'historique, validation, jonction
 * (fichiers des parties gardées, début lu d'une gardée quand elle le demande), plan. Un listage que l'hôte refuse lève (rien
 * d'écrit, `lecture` chez l'appelant). La main est rendue à l'écran entre lecture, analyse et préparation.
 */
async function preparer(id: Identite, chemin: string): Promise<Arret | Prepare> {
  const meta = lireMeta(id)
  const t0 = Date.now()
  let texte: string
  try {
    texte = await lireImport(chemin)
  } catch (e) {
    return { arret: indisponible("lecture"), raison: `fichier illisible (${sansChemin(e)})` }
  }
  const lecture = Date.now() - t0, taille = texte.length
  await dormir(0)
  const t1 = Date.now()
  let valeur: unknown = null
  let lisible = true
  try {
    valeur = JSON.parse(texte)
  } catch {
    lisible = false
  }

  texte = ""
  if (!lisible) {
    // JSON illisible : refusé (forme) avant de lire les semaines locales, après les refus de l'historique (preparerImport).
    const refuse = preparerImport(null, id.puuid, meta, [], [], () => null)
    if (!refuse.ok) return { arret: { etat: "refuse", refus: refuse.refus }, raison: `refusé : ${refuse.refus.detail}` }
  }
  await dormir(0)
  const noms = new Set(fichiersCumuls(id.puuid, true).map((f) => f.slice(f.lastIndexOf("/") + 1).replace(/\.json$/, "")))
  const duFichier = typeof valeur === "object" && valeur !== null ? (valeur as { semaines?: unknown }).semaines : null
  if (Array.isArray(duFichier)) {
    for (const s of duFichier) {
      const nom = typeof s === "object" && s !== null ? (s as { semaine?: unknown }).semaine : null
      if (estSemaine(nom)) noms.add(nom)
    }
  }
  const locales: SemaineLocale[] = []
  let illisibles = 0
  for (const semaine of noms) {
    const lue = lireSemaine(id.puuid, semaine)
    if (lue.etat === "ok") locales.push({ semaine, comptees: lue.semaine.comptees })
    else illisibles++
  }
  if (illisibles > 0) {
    return {
      arret: indisponible("semaines"),
      raison: `${compte(illisibles, "semaine de cumuls illisible", "semaines de cumuls illisibles")}, laissée${illisibles > 1 ? "s" : ""} telle${illisibles > 1 ? "s" : ""} quelle${illisibles > 1 ? "s" : ""}`,
    }
  }
  const p = preparerImport(valeur, id.puuid, meta, fichiersParties(id.puuid, true), locales, (c) => partieDuFichier(c)?.debut ?? null)
  if (!p.ok) return { arret: { etat: "refuse", refus: p.refus }, raison: `refusé : ${p.refus.detail}` }
  return { arret: null, meta, preparation: p, taille, lecture, analyse: Date.now() - t1 }
}

/**
 * L'état de l'import pour la section « Ton historique d'avant » (entrée 5), lu comme le ferait un lancement, sans marqueur
 * ni écriture : en cours (cette exécution importe) ; sinon les contrôles de trouver puis de preparer, le fichier téléchargé
 * au besoin et lu en entier (« prêt » dit ses parties et ses dates) ; puis etatImport (interrompu ou prêt). Ne lève jamais :
 * une erreur de l'hôte rend `indisponible` (`lecture`).
 */
export async function etatDeLImport(): Promise<EtatHistoriqueAvant> {
  if (importIci()) return { etat: "enCours" }
  try {
    const t = await trouver()
    if (t.arret !== null) return t.arret
    const p = await preparer(t.id, t.chemin)
    if (p.arret !== null) return p.arret
    return etatImport(importIci(), p.meta, p.preparation)
  } catch {
    return indisponible("lecture")
  }
}

/** Un arrêt avant toute écriture : dit au journal, rendu avec son état. */
async function rienEcrit(a: Arret): Promise<BilanImport> {
  await journal(`import : ${a.raison} ; rien d'écrit.`)
  return { issue: "rienEcrit", etat: a.arret }
}


function enMo(caracteres: number): string {
  return (caracteres / 1_000_000).toFixed(1).replace(".", ",")
}

/**
 * Écrit le fichier préparé `p` pour le compte `id`, sous le marqueur pris à `depuis` : `importLance` au premier lancement,
 * avant toute autre écriture ; puis les étapes du plan par lots ; puis la fin. Rend l'issue ; ne lève jamais.
 */
async function ecrire(id: Identite, chemin: string, p: Prepare, debut: number, depuis: number, avancee?: AvanceeImport): Promise<BilanImport> {
  const { fichier, suite, plan } = p.preparation
  let meta = p.meta
  // Parties du premier lancement, comme l'état interrompu : celles déjà ajoutées comptent dans l'avancée.
  const total = Math.max(meta.importLance?.parties ?? 0, plan.parties)
  const deja = total - plan.parties
  const lancement = meta.importLance === null ? "premier lancement" : `reprise (${compte(deja, "partie déjà ajoutée", "parties déjà ajoutées")} sur ${total})`
  await journal(`import : fichier lu en ${p.lecture} ms (${enMo(p.taille)} Mo), validé et préparé en ${p.analyse} ms : `
    + `${compte(fichier.parties.length, "partie")}, ${compte(fichier.semaines.length, "semaine")} ; jonction après ${compte(suite, "partie gardée", "parties gardées")} ; `
    + `${lancement} : ${compte(plan.parties, "partie")} à ajouter, ${compte(plan.prises.length, "semaine prise", "semaines prises")}, `
    + `${compte(plan.gardees.length, "semaine gardée", "semaines gardées")}, ${compte(plan.sansCumuls, "partie sans cumuls", "parties sans cumuls")}.`)
  if (meta.importLance === null) {
    const lance: Meta = { ...meta, importLance: { quand: new Date(Date.now()).toISOString(), parties: plan.parties } }
    try {
      ecrireMeta(lance)
    } catch (e) {
      await journal(`import ❌ lancement non gardé (${sansChemin(e)}) : rien d'écrit.`)
      return { issue: "stockage", ajoutees: 0 }
    }
    meta = lance
  }

  let ajoutees = 0, presentes = 0, semaines = 0, dansLeLot = 0
  const signaler = () => {
    try {
      if (avancee) avancee(deja + ajoutees + presentes, total)
    } catch { /* l'écran ne fait jamais échouer l'import */ }
  }
  signaler()
  try {
    for (const e of plan.etapes) {
      // Un lot finit avant chaque semaine (chaque semaine avant ses parties) et à PARTIES_PAR_LOT parties.
      if (dansLeLot > 0 && (e.type === "semaine" || dansLeLot >= PARTIES_PAR_LOT)) {
        rafraichirMarqueur(depuis, Date.now())
        signaler()
        await dormir(0)
        dansLeLot = 0
      }
      if (e.type === "semaine") {
        ecrireSemaine(id.puuid, e.semaine, e.contenu)
        semaines++
      } else {
        // Une partie déjà gardée (son fichier apparu depuis la préparation) n'est jamais récrite.
        if (ecrirePartie(id.puuid, e.place, e.partie)) ajoutees++
        else presentes++
        dansLeLot++
      }
    }
  } catch (e) {
    await journal(`import ❌ écriture impossible (${sansChemin(e)}) : arrêt après ${compte(ajoutees, "partie ajoutée", "parties ajoutées")} ; `
      + "rien n'est effacé, le prochain geste reprend.")
    return { issue: "stockage", ajoutees }
  }
  signaler()

  // ── fin, toutes les parties écrites : l'index d'abord (refait ensuite avec elles), puis import fait, puis le fichier ──
  let index: boolean
  try {
    index = effacerIndex(id.puuid)
  } catch (e) {
    await journal(`import ❌ index stats.sqlite non remis à reconstruire (${sansChemin(e)}) : import pas fait, le prochain geste le finit.`)
    return { issue: "stockage", ajoutees }
  }
  const quand = new Date(Date.now()).toISOString()
  try {
    ecrireMeta({ ...meta, importFait: { quand, parties: total } })
  } catch (e) {
    await journal(`import ❌ fin non gardée (${sansChemin(e)}) : import pas fait, le prochain geste le finit.`)
    return { issue: "stockage", ajoutees }
  }
  let retrait = "fichier retiré d'iCloud Drive"
  try {
    retirerImport(chemin)
  } catch (e) {
    retrait = `fichier non retiré d'iCloud Drive (${sansChemin(e)})`
  }
  const dejaLa = presentes > 0 ? `, ${compte(presentes, "déjà présente", "déjà présentes")}` : ""
  await journal(`import ✅ ${compte(ajoutees, "partie ajoutée", "parties ajoutées")}${dejaLa}, ${compte(semaines, "semaine écrite", "semaines écrites")}, `
    + `${total} en tout pour l'import, en ${Date.now() - debut} ms ; ${index ? "index stats.sqlite remis à reconstruire" : "aucun index stats.sqlite"} ; ${retrait}.`)
  return { issue: "fait", quand, parties: total, ajoutees }
}

/**
 * Lance l'import, sur un geste (Bouton « Importer mon historique », entrée 5), une fois à la fois dans l'exécution : déjà en
 * cours, rien. Puis le fichier trouvé et téléchargé au besoin (trouver) ; puis le marqueur de collecte pris sans `await`
 * entre sa lecture et son écriture (tenu par une collecte, ici, par ↻ ou par une exécution arrêtée : rien d'écrit, l'heure
 * de réessai rendue) ; puis, sous lui, le fichier préparé (preparer) et écrit (ecrire), `avancee` appelée au départ et après
 * chaque lot. Rend l'issue (BilanImport) ; ne lève jamais : une erreur inattendue de l'hôte avant toute écriture rend
 * `indisponible` (`lecture`) ; le marqueur est relâché sur toute issue.
 * Entrée 6 : un lancement (pas « déjà en cours ») est une tâche gardée en vie avec Pro quand on quitte l'app
 * (commencerMaintien), ouverte avant tout `await` (une sortie aussitôt après l'appui, pendant le titre au journal ou le
 * téléchargement, est vue) et fermée après le marqueur relâché, quelle que soit l'issue, sa fin attendue avant de rendre
 * l'issue (avec Pro, son résumé au journal après les lignes de l'import, puis l'arrêt) ; rien d'autre n'en dépend.
 */
export async function lancerImport(avancee?: AvanceeImport): Promise<BilanImport> {
  if (importIci()) {
    await journal(`${TITRE} déjà en cours.`)
    return { issue: "dejaEnCours" }
  }
  // Entrée 6 : sur place, sans rien attendre ni écrire (pro.ts) ; ne lève jamais.
  const finMaintien = commencerMaintien(TACHE_IMPORT)
  // Dès l'appui, téléchargement compris : Mettre à jour de cette exécution ne collecte pas (importIci, collecte.ts).
  poserImportIci(true)
  const debut = Date.now()
  let tenu = false
  try {
    await journal(TITRE)
    let t: Arret | Trouve
    try {
      t = await trouver()
    } catch (e) {
      return await rienEcrit({ arret: indisponible("lecture"), raison: `fichier introuvable (${sansChemin(e)})` })
    }
    if (t.arret !== null) return await rienEcrit(t)
    if (t.telechargement !== null) await journal(`import : fichier téléchargé d'iCloud Drive en ${t.telechargement} ms.`)

    // ── sous le marqueur de collecte : aucune collecte, ↻ compris, pendant que l'import lit l'historique et écrit ──
    const depuis = Date.now()
    const marqueur = prendreMarqueur(depuis)
    if (!marqueur.pris) {
      const qui = marqueur.ici ? "une collecte de cette exécution" : marqueur.par === "rafraichir" ? "la collecte de ↻" : "une mise à jour arrêtée"
      const reessai = marqueur.ici ? null : marqueur.reessai
      const dans = reessai === null ? "" : `, réessai dans ${Math.max(0, Math.ceil((reessai - depuis) / 1000))} s`
      await journal(`import : ${qui} tient le marqueur de collecte${dans} ; rien d'écrit.`)
      return { issue: "collecte", reessai }
    }
    tenu = true
    if (!marqueur.ecrit) await journal("import : marqueur de collecte non écrit.")
    let p: Arret | Prepare
    try {
      p = await preparer(t.id, t.chemin)
    } catch (e) {
      return await rienEcrit({ arret: indisponible("lecture"), raison: `historique illisible (${sansChemin(e)})` })
    }
    if (p.arret !== null) return await rienEcrit(p)
    return await ecrire(t.id, t.chemin, p, debut, depuis, avancee)
  } finally {
    if (tenu) relacherMarqueur()
    poserImportIci(false)
    await finMaintien()
  }
}
