// Socle des analyses d'entraînement (epic-stats-analyses, entrée 2 ; CAP-24) : les règles communes de
// analyses-entrainement.md, que les entrées 3 à 7 lisent sans le modifier, chacune rangeant ses analyses dans son propre
// module pur. Files : celles de chaque analyse, en paramètre (les analyses par arme, 1 à 4, sur les files de tête, corps et
// jambes par arme de l'entrée 4.11, FILES_ARMES ; les autres sur les files complètes), une partie d'une autre file étant
// écartée et comptée. Tranches de distance d'un duel : moins de 10 m, de 10 à 20 m (10 et 20 m compris), plus de 20 m. Duel :
// un kill entre toi et un adversaire, gagné si tu tues ; seul un duel à une arme nommée entre aux analyses par arme (armeDuKill
// de 4.11). Seuil d'effectif : « — » et « peu de données », jamais un pourcentage sur moins de 5 cas (EXPERIENCE.md, State
// Patterns, Analyse sous l'effectif minimal). Référence : une stat d'équipe face à ta période précédente, dans l'ordre de ecartDe
// et du récap (moins de 5 parties d'avant : sansEcartALaPeriode de 4.43 ; puis moins de 5 cas, d'un côté ou de l'autre) ; une
// stat individuelle sans moyenne de lobby, aucune n'étant gardée pour ces analyses, colorée comme une liste par catégorie
// (EXPERIENCE.md, Évaluation). Champ lu : une manche sans le champ que lit une analyse en est retirée, une partie dont aucune
// manche ne l'a (une partie importée de tracker.gg, sans l'arme ni l'ultime de ses manches : contrat-donnees.md, Fichier
// d'import) en est écartée, toutes comptées, pour que chaque bloc dise sur combien de parties il porte et ce qui en est écarté.
// Les quatre seuils de l'entrée 1 (rayon d'isolement, grosses armes, distance au spike, rang du lobby) n'y sont pas.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni horloge, pour tourner tel quel sous
// `node --test` (spike-s0/tests/ ; tests/resoudre-ts.ts y résout l'import sans extension de ./metriques). Il lit le module
// des métriques sans le modifier (retenues, sommer, comparer, ecartDe, sansEcartALaPeriode, armeDuKill, evaluationCategorie,
// formats). Il ne lit que tes manches et tes kills, jamais une somme de groupe : ni moyenne de lobby, ni valeur d'un autre joueur.

import type { Kill, Manche, Partie } from "./reduction"
import {
  MIN_OCCURRENCES, MIN_PARTIES_GROUPE, POURCENTAGE, armeDuKill, comparer, ecartDe, ecritureDe, evaluationCategorie, libelleReference,
  nombreEnClair, retenues, sansEcartALaPeriode, sommer, valeurEnClair,
  type Evaluation, type Files, type LirePartie, type Mesure, type Selection, type Sens, type Stat,
} from "./metriques"

/** Espace insécable : avant « m », et entre un nombre et son mot. */
const NBSP = " "


function compteEnClair(n: number, mot: string): string {
  return `${nombreEnClair(n, 0)}${NBSP}${accord(n, mot)}`
}
/** Un mot accordé au nombre : « écartée », « écartées ». */
function accord(n: number, mot: string): string {
  return `${mot}${n > 1 ? "s" : ""}`
}
/** Une phrase qui commence par une majuscule. */
function majuscule(s: string): string {
  return s === "" ? s : s[0].toUpperCase() + s.slice(1)
}

// ─────────────────────────── tranches de distance ───────────────────────────

/** Tranche de distance d'un duel : moins de 10 m (`pres`), de 10 à 20 m (`milieu`), plus de 20 m (`loin`). */
export type CleTrancheDistance = "pres" | "milieu" | "loin"

export const DISTANCE_PRES = 10
export const DISTANCE_LOIN = 20

export type TrancheDistance = { readonly cle: CleTrancheDistance; readonly libelle: string }

export const TRANCHES_DISTANCE: readonly TrancheDistance[] = [
  { cle: "pres", libelle: `Moins de ${DISTANCE_PRES}${NBSP}m` },
  { cle: "milieu", libelle: `${DISTANCE_PRES} à ${DISTANCE_LOIN}${NBSP}m` },
  { cle: "loin", libelle: `Plus de ${DISTANCE_LOIN}${NBSP}m` },
]

/** La tranche d'une distance brute en mètres (sans arrondi : 9,999 m est à moins de 10 m) ; null pour une distance absente, négative ou illisible. */
export function trancheDeDistance(metres: number | null | undefined): CleTrancheDistance | null {
  if (typeof metres !== "number" || !Number.isFinite(metres) || metres < 0) return null
  if (metres < DISTANCE_PRES) return "pres"
  return metres <= DISTANCE_LOIN ? "milieu" : "loin"
}

/**
 * La tranche d'un de tes kills ou d'une de tes morts, par sa distance gardée à la collecte (`distance` de la réduction : ta position et
 * celle de l'autre joueur au moment du kill, en mètres sans hauteur) ; null, kill retiré de l'analyse, sans ta position (kill hors du
 * plan) ou sans distance (position de la victime ou du tueur absente).
 */
export function trancheDuKill(k: Kill): CleTrancheDistance | null {
  return k.position == null ? null : trancheDeDistance(k.distance)
}

// ─────────────────────────── duels ───────────────────────────

/** Un kill fait avec une capacité (`arme.type` « Ability »), que tu sois le tueur ou la victime. */
export function killAUneCapacite(k: Kill): boolean {
  return k.arme?.type === "Ability"
}

/**
 * Un duel (analyses-entrainement.md, Règles communes ; EXPERIENCE.md, Ce qui te tue) : un kill entre toi et un adversaire, que tu tues
 * ou que tu meures. Ni un allié, ni toi-même, ni le spike (arme `Bomb` : une mort sans tueur adverse n'est pas un duel).
 */
export function estDuel(k: Kill): boolean {
  return k.adverse === true && (k.sens === "kill" || k.sens === "mort") && k.arme?.type !== "Bomb"
}

/** Un duel gagné : tu tues l'adversaire. */
export function duelGagne(k: Kill): boolean {
  return estDuel(k) && k.sens === "kill"
}

/**
 * L'arme d'un duel, selon la règle de armeDuKill (entrée 4.11) : son nom tel que HenrikDev le donne, sans espaces autour ; null pour une
 * capacité, une arme absente ou sans nom, et hors d'un duel. Ton kill : armeDuKill même ; ta mort : l'arme de ton tueur, même règle.
 */
export function armeDuDuel(k: Kill): string | null {
  if (!estDuel(k)) return null
  if (k.sens === "kill") return armeDuKill(k)
  if (k.arme == null || k.arme.type === "Ability") return null
  const nom = typeof k.arme.name === "string" ? k.arme.name.trim() : ""
  return nom === "" ? null : nom
}

/** Un duel des analyses par arme : un duel à une arme nommée (armeDuDuel) ; une capacité, une arme absente ou sans nom en sortent. */
export function duelALArme(k: Kill): boolean {
  return armeDuDuel(k) !== null
}

// ─────────────────────────── effectif d'un chiffre ───────────────────────────

/** Jamais un pourcentage sur moins de 5 cas (EXPERIENCE.md, State Patterns) : le seuil des occurrences d'une catégorie. */
export const MIN_CAS_ANALYSE = MIN_OCCURRENCES
/** La mention d'un chiffre sous son effectif minimal, avec « — » à sa place. */
export const PEU_DE_DONNEES = "peu de données"

/**
 * Les comptes d'un chiffre : numérateur et dénominateur, additionnés avant une seule division (Rapport de sommes), et ses cas, qui
 * fixent son effectif : les duels pour une part gagnée (le dénominateur), les kills pour un % de tête (touches sur kills).
 */
export type CasAnalyse = { num: number; den: number; cas: number }





export type ChiffreAnalyse = CasAnalyse & { valeur: number | null; texte: string; mention: string | null; evaluation: Evaluation }

/**
 * Un chiffre d'analyse d'une stat individuelle : sous 5 cas, « — », « peu de données », sans couleur ; dès 5 cas, la valeur écrite selon
 * sa mesure, un dénominateur nul donnant « — » sans mention. Couleur d'une liste par catégorie (evaluationCategorie : un pourcentage
 * bleu dès 55 %, orange sous 45 % ; une autre valeur face à `moyenne`, ta propre moyenne) ; sens neutre par défaut, jamais coloré.
 */
export function chiffreDAnalyse(c: CasAnalyse, mesure: Mesure = POURCENTAGE, sens: Sens = "neutre", moyenne: number | null = null): ChiffreAnalyse {
  const assez = c.cas >= MIN_CAS_ANALYSE
  const quotient = c.num / c.den
  const valeur = assez && c.den > 0 && Number.isFinite(quotient) ? quotient : null
  return {
    num: c.num, den: c.den, cas: c.cas, valeur, texte: valeurEnClair(valeur, mesure), mention: assez ? null : PEU_DE_DONNEES,
    evaluation: evaluationCategorie(valeur, moyenne, mesure, sens),
  }
}

// ─────────────────────────── champ lu, files et parties écartées ───────────────────────────

/**
 * Un champ que lit une analyse, manche par manche : son nom (« l'arme de ta manche »), et si une manche l'a. Une manche sans lui est
 * retirée de l'analyse, une partie dont aucune manche ne l'a en est écartée, toutes comptées (partiesDeLAnalyse).
 */
export type Champ = { readonly nom: string; readonly manche: (m: Manche) => boolean }

/** L'arme de ta manche (`Manche.arme`) : lue par les analyses 2 (arme d'un duel perdu), 3 et 4, absente de toute partie importée (contrat-donnees.md, Fichier d'import). */
export const CHAMP_ARME_DE_MANCHE: Champ = { nom: "l'arme de ta manche", manche: (m) => m.arme != null }

/** Ton ultime de chaque manche (`Manche.ultime`, « non » compris) : lue par l'analyse 11, absente de toute partie importée. */
export const CHAMP_ULTIME: Champ = { nom: "l'ultime de tes manches", manche: (m) => m.ultime != null }

/** Une partie a-t-elle le champ : au moins une de ses manches l'a. */
export function partieAvecLeChamp(p: Partie, champ: Champ): boolean {
  return (p.manches ?? []).some(champ.manche)
}

/**
 * Les parties d'une analyse dans une liste (le périmètre, sa période précédente, les parties d'une carte), dans leur ordre : celles de
 * ses files qui ont le champ lu (`parties`), chacune réduite à ses manches qui l'ont, les kills des manches retirées ôtés (une partie à
 * qui il ne manque nulle part reste elle-même) ; les écartées, `horsFiles` (une autre file, que le mode Tout a sélectionnée) et
 * `sansChamp` (aucune manche avec le champ, dont `importees`, les parties importées de tracker.gg) ; `manchesRetirees`, les manches sans
 * le champ des parties portées.
 */
export type PartiesDAnalyse = {
  readonly parties: readonly Partie[]
  readonly horsFiles: number
  readonly sansChamp: number
  readonly importees: number
  readonly manchesRetirees: number
  readonly files: Files
  readonly champ: Champ | null
}

/**
 * Les parties d'une analyse de chaque liste (la liste même), par files et par champ, gardées : une liste de parties ne change pas une
 * fois faite (4.41) ; le résultat ne se lit qu'en lecture. Clés faibles : une liste relue s'en va avec ses résultats.
 */
const PARTIES_DES_ANALYSES = new WeakMap<readonly Partie[], Map<Files, Map<Champ | null, PartiesDAnalyse>>>()

/** Une partie réduite à ses manches qui ont le champ, les kills des manches retirées ôtés ; elle-même s'il ne lui manque nulle part. */
function partieDuChamp(p: Partie, champ: Champ): { partie: Partie; retirees: number } {
  const manches = p.manches ?? []
  const gardees = manches.filter(champ.manche)
  if (gardees.length === manches.length) return { partie: p, retirees: 0 }
  const retirees = new Set(manches.filter((m) => !champ.manche(m)).map((m) => m.numero))
  return { partie: { ...p, manches: gardees, kills: (p.kills ?? []).filter((k) => !retirees.has(k.manche)) }, retirees: retirees.size }
}

/**
 * Les parties d'une analyse sur `files` (ses files admises : FILES_ARMES pour les analyses par arme, `"completes"` pour les autres) qui
 * lit `champ` (null : aucun champ absent des parties importées).
 */
export function partiesDeLAnalyse(parties: readonly Partie[], files: Files, champ: Champ | null = null): PartiesDAnalyse {
  let parFiles = PARTIES_DES_ANALYSES.get(parties)
  if (parFiles === undefined) {
    parFiles = new Map()
    PARTIES_DES_ANALYSES.set(parties, parFiles)
  }
  let parChamp = parFiles.get(files)
  if (parChamp === undefined) {
    parChamp = new Map()
    parFiles.set(files, parChamp)
  }
  const deja = parChamp.get(champ)
  if (deja !== undefined) return deja
  const desFiles = retenues(parties, files)
  const horsFiles = parties.length - desFiles.length
  let r: PartiesDAnalyse
  if (champ === null) r = { parties: desFiles, horsFiles, sansChamp: 0, importees: 0, manchesRetirees: 0, files, champ }
  else {
    const portees: Partie[] = []
    let sansChamp = 0, importees = 0, manchesRetirees = 0
    for (const p of desFiles) {
      if (!partieAvecLeChamp(p, champ)) {
        sansChamp++
        if (p.provenance === "tracker.gg") importees++
        continue
      }
      const d = partieDuChamp(p, champ)
      portees.push(d.partie)
      manchesRetirees += d.retirees
    }
    r = { parties: portees, horsFiles, sansChamp, importees, manchesRetirees, files, champ }
  }
  parChamp.set(champ, r)
  return r
}







export type EffectifAnalyse = {
  readonly parties: number
  readonly ecartees: number
  readonly horsFiles: number
  readonly sansChamp: number
  readonly importees: number
  readonly manchesRetirees: number
  readonly texte: string
  readonly texteEcartees: string | null
}

/**
 * L'effectif d'un bloc sur les parties d'une analyse ; `portees`, les parties sur lesquelles il porte, quand elles ne sont pas toutes
 * celles de l'analyse (une stat d'équipe : celles où elle se lit, `parties` de chiffreDEquipe).
 */
export function effectifDAnalyse(a: PartiesDAnalyse, portees: number = a.parties.length): EffectifAnalyse {
  const texte = portees > 0 ? `sur ${compteEnClair(portees, "partie")}` : "aucune partie"
  const dits: string[] = []
  if (a.horsFiles > 0) dits.push(partiesDAutresFiles(a.horsFiles))
  const sans = a.champ === null ? "" : `, sans ${a.champ.nom}`
  if (a.sansChamp > 0) {
    const dont = a.importees > 0 ? `, dont ${nombreEnClair(a.importees, 0)} ${accord(a.importees, "importée")}` : ""
    dits.push(a.importees === a.sansChamp
      ? `${compteEnClair(a.sansChamp, "partie")} ${accord(a.sansChamp, "importée")} ${accord(a.sansChamp, "écartée")}${sans}`
      : `${compteEnClair(a.sansChamp, "partie")} ${accord(a.sansChamp, "écartée")}${sans}${dont}`)
  }
  if (a.manchesRetirees > 0 && a.champ !== null) {
    dits.push(`${compteEnClair(a.manchesRetirees, "manche")} sans ${a.champ.nom} ${accord(a.manchesRetirees, "retirée")}`)
  }
  return {
    parties: portees, ecartees: a.horsFiles + a.sansChamp, horsFiles: a.horsFiles, sansChamp: a.sansChamp, importees: a.importees,
    manchesRetirees: a.manchesRetirees, texte, texteEcartees: dits.length === 0 ? null : dits.join(" ; "),
  }
}


export function partiesDAutresFiles(n: number): string {
  return `${compteEnClair(n, "partie")} ${n > 1 ? "d'autres files" : "d'une autre file"} ${accord(n, "écartée")}`
}

// ─────────────────────────── parties écartées par genre (entrées 3 et 6, regroupées à l'entrée 10) ───────────────────────────

/**
 * Le genre d'une partie écartée d'une analyse, dans l'ordre où le bloc les dit : escarmouche, deathmatch, match à mort en équipe, une
 * autre file, ou une partie de ses files sans touches relevées (Tête selon la distance).
 */
export type GenreEcarte = "escarmouche" | "deathmatch" | "matchAMort" | "autreFile" | "sansTouches"
/** Les parties écartées d'un bloc, par genre. */
export type Ecartees = Readonly<Record<GenreEcarte, number>>

/** Le genre de la file d'une partie hors des files d'une analyse. */
export function genreDeFile(file: string): GenreEcarte {
  if (file.startsWith("skirmish")) return "escarmouche"
  if (file === "deathmatch") return "deathmatch"
  if (file === "hurm") return "matchAMort"
  return "autreFile"
}
/** Aucune partie écartée, genre par genre : le compte de départ d'un bloc. */
export function aucuneEcartee(): Record<GenreEcarte, number> {
  return { escarmouche: 0, deathmatch: 0, matchAMort: 0, autreFile: 0, sansTouches: 0 }
}







export function effectifEnPhrase(portees: number, e: Ecartees, escarmoucheSansTouches = false): string | null {
  const dits: string[] = []
  if (e.escarmouche > 0) dits.push(`${nombreEnClair(e.escarmouche, 0)}${NBSP}d'escarmouche${escarmoucheSansTouches ? " (aucune touche relevée)" : ""}`)
  if (e.deathmatch > 0) dits.push(`${nombreEnClair(e.deathmatch, 0)}${NBSP}de deathmatch`)
  if (e.matchAMort > 0) dits.push(`${nombreEnClair(e.matchAMort, 0)}${NBSP}de match à mort en équipe`)
  if (e.autreFile > 0) dits.push(`${nombreEnClair(e.autreFile, 0)}${NBSP}${e.autreFile > 1 ? "d'autres files" : "d'une autre file"}`)
  if (e.sansTouches > 0) dits.push(`${nombreEnClair(e.sansTouches, 0)}${NBSP}sans touches relevées`)
  const ecartees = dits.length === 0 ? null : `écartées : ${dits.join(", ")}`
  if (portees > 0) return `Sur ${compteEnClair(portees, "partie")}${ecartees === null ? "" : ` ; ${ecartees}`}.`
  return ecartees === null ? null : `${majuscule(ecartees)}.`
}

// ─────────────────────────── stat d'équipe face à ta période précédente ───────────────────────────

/** Une stat d'équipe d'une analyse (4 contre 5, compo, côté de départ, rang du lobby) : face à ta période précédente, jamais à un groupe. */
export type StatDEquipe = Stat & { reference: "periode" }

/**
 * Déclare une stat d'équipe d'une analyse, une fois, au chargement de son module (comparer() la garde par identité) : sa lecture d'une
 * partie (null : donnée absente, partie retirée de la stat), ses files, le champ qu'elle lit (comme partiesDeLAnalyse : une partie sans
 * lui ne compte pas, une partie lue n'a que ses manches qui l'ont, et leurs kills), sa mesure et son sens (une part gagnée par défaut).
 */
export function statDEquipe(lire: LirePartie, files: Files, champ: Champ | null = null, mesure: Mesure = POURCENTAGE, sens: Sens = "haut"): StatDEquipe {
  const toi: LirePartie = champ === null ? lire : (p) => (partieAvecLeChamp(p, champ) ? lire(partieDuChamp(p, champ).partie) : null)
  return { mesure, sens, files, toi, reference: "periode" }
}

/** La référence d'une stat d'équipe : les parties de ta période précédente où la stat se lit, ses cas, sa valeur gardée (null sous 5 parties ou sous 5 cas) et son texte (« — » alors). */
export type ReferenceDEquipe = { readonly parties: number; readonly cas: number; readonly valeur: number | null; readonly texte: string }







export type RaisonSansEcart = { readonly cause: "parties" | "cas"; readonly texte: string; readonly recap: string }

/**
 * Un chiffre de stat d'équipe : ta valeur gardée (chiffreDAnalyse, cas : le dénominateur) et les parties où elle se lit (`parties`, sur
 * lesquelles le bloc porte) ; `reference`, null en Tout ; `ecart`, l'écart écrit (ecartDe), null sans lui ; `raison`, null quand l'écart
 * s'écrit, sans ta valeur ou sans référence ; `evaluation`, la couleur de cet écart, jamais d'une liste par catégorie. Aucune valeur sous
 * son seuil, ni la comparaison brute de comparer().
 */
export type ChiffreDEquipe = ChiffreAnalyse & {
  readonly parties: number
  readonly reference: ReferenceDEquipe | null
  readonly ecart: string | null
  readonly raison: RaisonSansEcart | null
}

/**
 * Ta période précédente en mots (« le mois d'avant »), tirée de la raison de sansEcartALaPeriode (4.43) même, seule écriture de ces
 * mots dans le module des métriques ; null en Tout.
 */
function periodeEnMots(libelle: string | null): string | null {
  const prefixe = `moins de ${MIN_PARTIES_GROUPE} parties `
  const r = sansEcartALaPeriode({ valeur: 0, parties: 0, reference: null, partiesReference: 0, ecart: null, evaluation: "neutre" }, libelle)
  return r !== null && r.startsWith(prefixe) ? r.slice(prefixe.length) : null
}

/** Une raison et sa forme du récap. */
function raisonDe(cause: RaisonSansEcart["cause"], texte: string): RaisonSansEcart {
  return { cause, texte, recap: `pas d'écart (${texte})` }
}

/**
 * Une stat d'équipe sur la sélection, face à ta période précédente (EXPERIENCE.md, Référence), dans l'ordre de ecartDe et du récap :
 * en Tout, aucune référence, ni écart ni couleur ; sans ta valeur (aucune partie, ou aucun cas), ni écart ni raison ; moins de 5 parties
 * d'avant (sansEcartALaPeriode), ta valeur sous 5 cas comprise : sa raison ; puis moins de 5 cas de ton côté, de l'autre ou des deux :
 * la raison des cas ; sinon l'écart écrit par ecartDe (avec les parties de la référence quand elles diffèrent des tiennes), à la couleur
 * de comparer() (dès 10 parties de part et d'autre), neutre quand les deux valeurs s'écrivent pareil.
 */
export function chiffreDEquipe(sel: Selection, stat: StatDEquipe): ChiffreDEquipe {
  const toi = sommer(retenues(sel.parties, stat.files), stat.toi)
  const chiffre = chiffreDAnalyse({ num: toi.num, den: toi.den, cas: toi.den }, stat.mesure)
  const libelle = libelleReference("periode", sel.perimetre.periode)
  const mots = periodeEnMots(libelle)
  const neutre: Evaluation = "neutre"
  const base = { ...chiffre, evaluation: neutre, parties: toi.parties }
  if (sel.precedentes === null || libelle === null || mots === null) return { ...base, reference: null, ecart: null, raison: null }
  const avant = sommer(retenues(sel.precedentes, stat.files), stat.toi)
  const valeurAvant = avant.parties >= MIN_PARTIES_GROUPE && avant.den >= MIN_CAS_ANALYSE ? avant.num / avant.den : null
  const reference: ReferenceDEquipe = { parties: avant.parties, cas: avant.den, valeur: valeurAvant, texte: valeurEnClair(valeurAvant, stat.mesure) }
  if (toi.parties === 0 || toi.den === 0) return { ...base, reference, ecart: null, raison: null }
  const comparaison = comparer(sel, stat)
  const parParties = sansEcartALaPeriode(comparaison, libelle)
  if (parParties !== null) return { ...base, reference, ecart: null, raison: raisonDe("parties", parParties) }
  const peuToi = toi.den < MIN_CAS_ANALYSE, peuAvant = avant.den < MIN_CAS_ANALYSE
  if (peuToi || peuAvant) {
    const ou = peuToi && peuAvant ? `ni sur la période ni ${mots}` : peuToi ? "sur la période" : mots
    return { ...base, reference, ecart: null, raison: raisonDe("cas", `moins de ${MIN_CAS_ANALYSE} cas ${ou}`) }
  }
  const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure), libelle)
  return { ...base, evaluation, reference, ecart, raison: null }
}
