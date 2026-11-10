// Scripting Pro (entrée 7 de epic-stats-collecte ; spec, « Rien à payer pour installer ValShop » ; stack.md) : ce que
// ValShop sait de Pro, le mode « sans Pro » forcé des essais, et le maintien en arrière-plan d'une tâche lancée par un
// geste (la mise à jour des stats de l'app ; l'import de l'historique, entrée 6 de epic-stats-import). Module pur, sans
// import de `scripting` : collecte.ts lui donne l'hôte (HoteMaintien : Script.hasFullAccess, AppEvents.scenePhase,
// BackgroundKeeper, le journal) et exporte la détection (proActif) et le maintien de l'exécution (commencerMaintien), que
// l'entrée 8 (SQLite) et l'import reprennent.
//
// Détection : le mode forcé d'abord, sans rien demander à l'hôte ; puis Script.hasFullAccess() : vrai, Pro ; faux, sans
// Pro, et aucune fonction Pro n'est appelée ; illisible (absente, en erreur, réponse non booléenne), Pro inconnu : la
// fonction Pro est essayée, et son erreur ou son refus font le repli.
//
// Maintien : un seul par exécution (BackgroundKeeper tient une file par script, pas par appel), partagé par les tâches qui
// l'ouvrent. Tant qu'une tâche tourne, l'écoute des phases de la scène est posée ; au passage en arrière-plan, keepAlive()
// une fois ; au retour (toute autre phase), ou quand plus aucune tâche ne tourne, stopKeepAlive(). Jamais au premier plan,
// jamais hors d'une tâche, et rien n'est jamais lancé. Sans Pro, refusé ou en erreur : une ligne au journal, une fois par
// passage en arrière-plan ; une coupure de la tâche reprendra au geste suivant (repère de l'entrée 5 ; import : entrée 4).
// Avec Pro, rien au journal sur le moment (contrat-donnees.md, journal.log) : la fin de la tâche écrit un résumé, après
// ses propres lignes et avant stopKeepAlive() (après lui, iOS peut
// suspendre l'app). L'ouverture d'une tâche pose l'écoute sur place, sans rien attendre ni écrire : une sortie aussitôt
// après le geste est vue ; une écoute impossible ne se dit qu'en fin de tâche, avec Pro. Chaque événement et chaque fin
// relancent une même file, qui rapproche l'état voulu (une tâche en cours, et l'arrière-plan) de l'état réel, un appel à
// l'hôte à la fois : un retour pendant une demande finit en arrêt. Ni l'ouverture ni la fin d'une tâche ne lèvent.

/**
 * Mode « sans Pro » forcé, réglé ici pour les essais : vrai, ValShop fait comme sans Scripting Pro, même avec (aucune
 * fonction Pro n'est appelée, ni demandée à l'hôte). Partagé par le maintien (entrée 7), l'index SQLite (entrée 8) et
 * l'import (entrée 6 de epic-stats-import). Faux dans toute version livrée.
 */
export const SANS_PRO_FORCE = false

/**
 * Ce que ValShop sait de Pro : `oui` ; `non`, par le mode forcé (`force`) ou par l'hôte (`hote` : Script.hasFullAccess
 * faux) ; `inconnu`, l'hôte n'a pas su répondre (`detail`, pour le journal, sans chemin) : la fonction Pro est essayée,
 * repli sur son erreur.
 */
export type Pro = { etat: "oui" } | { etat: "non"; raison: "force" | "hote" } | { etat: "inconnu"; detail: string }

/** Le texte d'une erreur par `texteErreur`, ou « erreur illisible » s'il lève lui-même. */
function texteSur(texteErreur: (e: unknown) => string, e: unknown): string {
  try {
    return String(texteErreur(e))
  } catch {
    return "erreur illisible"
  }
}

/**
 * Pro, d'après le mode forcé, puis la réponse de l'hôte (`demander` : Script.hasFullAccess), qui n'est pas demandée en
 * mode forcé ; `texteErreur` : le texte d'une erreur de l'hôte pour le journal. Ne lève jamais.
 */
export function lirePro(demander: () => unknown, force: boolean = SANS_PRO_FORCE, texteErreur: (e: unknown) => string = String): Pro {
  if (force) return { etat: "non", raison: "force" }
  let reponse: unknown
  try {
    reponse = demander()
  } catch (e) {
    return { etat: "inconnu", detail: texteSur(texteErreur, e) }
  }
  if (reponse === true) return { etat: "oui" }
  if (reponse === false) return { etat: "non", raison: "hote" }
  return { etat: "inconnu", detail: "réponse inattendue" }
}

/** Phase de la scène de l'app (AppEvents.scenePhase) ; toute autre valeur reçue est passée. */
export type Phase = "active" | "inactive" | "background"

/**
 * Une tâche gardée en vie : le préfixe de ses lignes au journal (« stats ») et ce qu'elle est, avec son article (« la mise
 * à jour »), tel qu'il se lit après « pendant » et « à la fin de ».
 */
export type TacheMaintenue = { prefixe: string; quoi: string }

/** Ce que le maintien demande à l'hôte ; collecte.ts le donne, les tests en donnent un faux. */
export type HoteMaintien = {
  /** Pro, lu à chaque sortie de l'app pendant une tâche (lirePro sur l'hôte). */
  pro: () => Pro
  /** BackgroundKeeper.keepAlive() : vrai si le maintien a démarré. */
  keepAlive: () => Promise<boolean>
  /** BackgroundKeeper.stopKeepAlive(). */
  stopKeepAlive: () => Promise<void>
  /** Pose l'écoute des phases de la scène (AppEvents.scenePhase) et rend de quoi la retirer ; lève si l'hôte n'en a pas. */
  ecouter: (rappel: (phase: unknown) => void) => () => void
  /** Une ligne au journal (note de valshop.ts). */
  noter: (ligne: string) => Promise<void>
  /** Le texte d'une erreur de l'hôte pour le journal, sans chemin ni identifiant. */
  texteErreur: (e: unknown) => string
}

/** La fin d'une tâche gardée en vie : à appeler une fois qu'elle a tout fini ; une seconde fois, rien. Ne lève jamais. */
export type FinMaintien = () => Promise<void>

/**
 * Le maintien d'une exécution : `commencer` ouvre une tâche, sur place (son écoute posée si elle est la première, avant
 * tout `await` de l'appelant), et rend sa fin. Ne lève jamais et n'écrit rien : une écoute impossible laisse la tâche
 * tourner sans maintien, et sa fin le dit, avec Pro.
 */
export type Maintien = { commencer: (tache: TacheMaintenue) => FinMaintien }

/**
 * Le suivi d'une tâche, de son ouverture à son résumé : en cours ou finie ; demandes réussies pendant elle ; cause du
 * dernier arrêt depuis la dernière demande (null : toujours maintenu) ; erreur d'un arrêt ; Pro non lu à une demande
 * réussie ; résumé écrit ; écoute refusée à son ouverture (le texte de l'erreur).
 */
type Suivi = {
  tache: TacheMaintenue
  enCours: boolean
  demandes: number
  arret: "retour" | "fin" | null
  erreurArret: string | null
  proInconnu: string | null
  resumee: boolean
  ecouteRefusee: string | null
}

/**
 * Ligne de repli, à une sortie de l'app, sans maintien : pourquoi (`motif`, avec sa ponctuation d'attache), puis ce que
 * devient une coupure.
 */
function ligneRepli(t: TacheMaintenue, motif: string): string {
  return `${t.prefixe} : app quittée pendant ${t.quoi}${motif} ; une coupure reprendra au geste suivant.`
}

/** Le motif d'un repli : sans Pro (mode forcé ou hôte) ; keepAlive() qui refuse (`erreur` null) ou lève ; Pro non lu dit. */
function motifRepli(p: Pro, erreur: string | null): string {
  if (p.etat === "non") return `, ${p.raison === "force" ? "mode sans Pro forcé" : "sans Scripting Pro"} : pas de maintien en arrière-plan`
  const nonLu = p.etat === "inconnu" ? `Pro non lu par l'hôte : ${p.detail}` : null
  if (erreur === null) return ` : maintien refusé par Scripting${nonLu === null ? "" : ` (${nonLu})`}`
  return ` : maintien en erreur (${erreur}${nonLu === null ? "" : ` ; ${nonLu}`})`
}

/** Le résumé de fin d'une tâche maintenue au moins une fois. */
function resume(s: Suivi): string {
  const fois = s.demandes > 1 ? `${s.demandes} fois ` : ""
  const inconnu = s.proInconnu !== null ? ` (Pro non lu par l'hôte : ${s.proInconnu} ; essai réussi)` : ""
  const arret = s.arret === "fin" ? `arrêté à la fin de ${s.tache.quoi}`
    : s.arret === "retour" ? "arrêté au retour dans l'app" : "toujours demandé pour une autre tâche en cours"
  const erreur = s.erreurArret !== null ? ` ; arrêt en erreur (${s.erreurArret})` : ""
  return `${s.tache.prefixe} : maintien en arrière-plan (Scripting Pro) demandé ${fois}en quittant l'app${inconnu}, ${arret}${erreur}.`
}

/** Le maintien d'une exécution, sur `hote` (voir l'en-tête). */
export function creerMaintien(hote: HoteMaintien): Maintien {
  const suivis: Suivi[] = []
  let phase: Phase = "active"
  // keepAlive() a réussi et stopKeepAlive() n'a pas suivi.
  let maintenu = false
  // Une demande (ou le repli dit) a eu lieu dans ce passage en arrière-plan : pas d'autre avant un retour.
  let tente = false
  let retirer: (() => void) | null = null
  let file: Promise<void> = Promise.resolve()

  const enCours = (): boolean => suivis.some((s) => s.enCours)
  const texte = (e: unknown): string => texteSur(hote.texteErreur, e)

  async function noter(ligne: string): Promise<void> {
    try {
      await hote.noter(ligne)
    } catch { /* journal indisponible : rien de plus */ }
  }

  /** Pro selon l'hôte ; une erreur imprévue de sa lecture vaut un Pro inconnu. */
  function pro(): Pro {
    try {
      return hote.pro()
    } catch (e) {
      return { etat: "inconnu", detail: texte(e) }
    }
  }

  /** Rapproche l'état réel de l'état voulu, un appel à l'hôte à la fois, jusqu'à ce qu'ils s'accordent. */
  async function rapprocher(): Promise<void> {
    for (;;) {
      const voulu = enCours() && phase === "background"
      if (voulu && !maintenu && !tente) {
        tente = true
        const t = suivis.filter((s) => s.enCours).slice(-1)[0].tache
        const p = pro()
        if (p.etat === "non") {
          await noter(ligneRepli(t, motifRepli(p, null)))
          continue
        }
        let demarre = false
        let erreur: string | null = null
        try {
          demarre = (await hote.keepAlive()) === true
        } catch (e) {
          erreur = texte(e)
        }
        if (demarre) {
          maintenu = true
          for (const s of suivis) {
            s.demandes++
            s.arret = null
            if (p.etat === "inconnu") s.proInconnu = p.detail
          }
          continue
        }
        await noter(ligneRepli(t, motifRepli(p, erreur)))
        continue
      }
      if (!voulu && maintenu) {
        const cause = enCours() ? "retour" : "fin"
        // À la fin, le résumé de chaque tâche finie, avant l'arrêt : après lui, iOS peut suspendre l'app.
        const resumees: Suivi[] = []
        if (cause === "fin") {
          for (const s of suivis) {
            if (s.enCours || s.demandes === 0 || s.resumee) continue
            s.arret = "fin"
            s.resumee = true
            resumees.push(s)
            await noter(resume(s))
          }
        }
        maintenu = false
        let erreur: string | null = null
        try {
          await hote.stopKeepAlive()
        } catch (e) {
          erreur = texte(e)
        }
        for (const s of suivis) {
          s.arret = cause
          if (erreur !== null) s.erreurArret = erreur
        }
        if (erreur !== null) for (const s of resumees) await noter(`${s.tache.prefixe} : arrêt du maintien en arrière-plan en erreur (${erreur}).`)
        continue
      }
      return
    }
  }

  /** Relance la file, après ce qu'elle a déjà à faire ; rend sa fin. Ne lève jamais. */
  function relancer(): Promise<void> {
    file = file.then(rapprocher).catch(() => { /* rapprocher ne lève pas ; la file reste utilisable */ })
    return file
  }

  /** Rappel de l'écoute : une phase connue change l'état voulu ; quitter l'arrière-plan ouvre un nouveau passage. */
  function surPhase(p: unknown): void {
    if (p !== "active" && p !== "inactive" && p !== "background") return
    if (p !== "background") tente = false
    phase = p
    relancer()
  }

  function commencer(tache: TacheMaintenue): FinMaintien {
    const s: Suivi = { tache, enCours: true, demandes: 0, arret: null, erreurArret: null, proInconnu: null, resumee: false, ecouteRefusee: null }
    suivis.push(s)
    if (retirer === null) {
      // Première tâche (ou plus aucune écoute) : l'app est au premier plan, où le geste vient d'avoir lieu.
      phase = "active"
      tente = false
      try {
        retirer = hote.ecouter(surPhase)
      } catch (e) {
        // Rien au journal ici : sans écoute, aucune sortie ne sera vue ; la fin de la tâche le dit, avec Pro.
        retirer = null
        s.ecouteRefusee = texte(e)
      }
    }
    let fermee = false
    return async () => {
      if (fermee) return
      fermee = true
      s.enCours = false
      await relancer()
      if (s.demandes > 0 && !s.resumee) {
        s.resumee = true
        await noter(resume(s))
      } else if (s.ecouteRefusee !== null && pro().etat !== "non") {
        await noter(`${tache.prefixe} : maintien en arrière-plan (Scripting Pro) impossible pendant ${tache.quoi}, écoute des phases de l'app refusée (${s.ecouteRefusee}) : une sortie de l'app n'a pas pu être vue.`)
      }
      const i = suivis.indexOf(s)
      if (i >= 0) suivis.splice(i, 1)
      if (!enCours() && retirer !== null) {
        const r = retirer
        retirer = null
        try {
          r()
        } catch { /* écoute déjà retirée par l'hôte : rien de plus */ }
      }
    }
  }

  return { commencer }
}
