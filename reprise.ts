// Reprise, frontière et trou des collectes de parties (entrée 5) : où lire chaque page de la
// liste v4, quand s'arrêter, quel repère garder, la frontière qui avance à la fin d'une collecte
// complète et le trou possible.
//
// Une collecte lit la liste du haut (`start` 0) : la première jusqu'à une page vide ; une
// suivante (première terminée) jusqu'à sa cible, la page qui contient la frontière ou une partie
// qui n'est pas plus récente qu'elle (frontière sortie de la liste) ; sans frontière, quel que
// soit meta.json, pas de cible : la page vide termine, sans trou. Cible et page vide ne comptent
// que sur une page lue à la suite (du haut sans trou, ou raccordée à l'ancre). « Déjà gardée » :
// avant cette collecte (l'appui en cours), une collecte coupée comprise.
// Un repère qui attend (collecte coupée, la première comprise) : le haut de la liste d'abord,
// jusqu'à une page qui contient une partie déjà gardée, les parties jouées depuis la coupure étant
// au-dessus d'elle ; puis saut à position − 1 + le nombre de parties au-dessus d'elle, pour relire
// l'ancre ; raccord si la page contient l'ancre ou commence plus récente qu'elle ; sinon (liste
// remontée, page vide), recul d'une page, jamais avant la fin du haut, la page qui la suit étant
// raccordée d'office. Une page sautée sans raccord n'est pas traitée.
// Repère : l'ancre (tout ce qui la précède étant traité ; relue au raccord), sa position (son rang
// dans la liste + 1) et un refus depuis la dernière collecte complète. Écrit après chaque page traitée
// entièrement à la suite ; dans le haut d'une reprise, avant chaque page qui montre une partie
// nouvelle, l'ancre étant sa première partie lisible : sans lui, une coupure laisserait en haut
// des parties gardées au-dessus de parties jamais lues, que la reprise suivante prendrait pour le
// bas des nouvelles avant de sauter par-dessus. Jamais après la page qui finit le haut ni avant le
// raccord, où le repère écrit dit encore vrai. Fin d'une collecte complète : repère effacé ;
// frontière = la première partie de la page 1 si rien n'a été refusé depuis la dernière collecte
// complète, sinon inchangée ; trou possible si une suivante atteint la page vide avant sa
// frontière, ou si au moins 90 parties la précèdent (la liste v4 n'est complète que sur ses ~97
// plus récentes, puis des parties éparses du stock de HenrikDev : api-henrikdev.md) ; jamais pour
// la première.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni horloge,
// seulement des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).
// Lire les pages, traiter les parties et écrire meta.json reste le travail de collecte.ts.

import type { Repere, Reprise } from "./historique"

/** Une partie de la page avant son traitement : son repère (null si son matchId ou son début ne se lit pas) ; gardée avant cette collecte. */
export type Vue = { repere: Repere | null; gardeeAvant: boolean }

/** Une partie de la page traitée : la même vue, et son refus. */
export type Traitee = Vue & { refusee: boolean }

/** Ce que sait la collecte au départ : meta.json du compte. */
export type Depart = {
  /** Repère de reprise qui attend (`meta.reprise`), ou null. */
  reprise: Reprise | null
  /** Frontière (`meta.frontiere`), ou null. */
  frontiere: Repere | null
  /** Première collecte terminée : une suivante, qui lit jusqu'à sa frontière. */
  suivante: boolean
  /** Parties demandées par page (`size`) : un recul est d'une page. */
  taille: number
}

/** `suite` : pages lues à la suite (du haut, ou raccordées à l'ancre) ; `haut` : haut d'une reprise ; `saut` : page sautée, pas encore raccordée. */
export type Phase = "suite" | "haut" | "saut"

/** Où en est la lecture, d'une page à l'autre ; chaque décision en rend un neuf. */
export type Etat = {
  /** Position (`start`) de la page à lire. */
  start: number
  phase: Phase
  taille: number
  /** Repère qui attendait au départ : le saut et le raccord se règlent sur lui. */
  reprise: Reprise | null
  frontiere: Repere | null
  suivante: boolean
  /** Fin du haut d'une reprise : la position qui suit sa dernière page ; une page qui commence avant ou là est à la suite. */
  finHaut: number
  /** Première partie lisible de la page 1 : la frontière à poser. */
  premiere: Repere | null
  /** Une partie refusée depuis la dernière collecte complète, repère compris. */
  refus: boolean
  /** Début de la plus ancienne partie lue, l'ancre d'un repère qui attendait comprise. */
  plusAncienne: string | null
}





export const PARTIES_AVANT_TROU = 90

/** Trou possible : débuts de la frontière et de la plus ancienne partie lue (avant la cible, s'il y en a une). */
export type Bornes = { de: string; a: string | null }

/** Fin d'une collecte complète : ce que meta.json doit garder, en une écriture, avec la réussite datée. */
export type Fin = {
  /** Frontière atteinte ; faux : page vide. */
  cible: boolean
  /** Une partie refusée depuis la dernière collecte complète : la frontière n'avance pas, la première collecte n'est pas terminée. */
  refus: boolean
  /** La frontière à garder : la première partie de la page 1, sauf refus (celle d'avant). */
  frontiere: Repere | null
  /** Trou possible (page vide avant la frontière, ou au moins 90 parties avant elle), ou null. */
  trou: Bornes | null
}

/** Avant de traiter la page : la traiter ou non, l'état qui suit, et le repère à écrire avant elle (null : garder celui qui est écrit). */
export type Examen = { traiter: boolean; etat: Etat; ecrire: Reprise | null }

/**
 * Après une page traitée : la fin, ou l'état pour la page suivante, le repère à écrire avant
 * elle (null : garder celui qui est écrit) et, après le haut d'une reprise, le nombre de parties
 * au-dessus de la première déjà gardée (null sinon).
 */
export type Decision =
  | { fin: Fin }
  | { fin: null; etat: Etat; ecrire: Reprise | null; saut: number | null }

function temps(iso: string): number {
  return Date.parse(iso)
}

function lisibles(reperes: readonly (Repere | null)[]): Repere[] {
  return reperes.filter((r): r is Repere => r !== null)
}

/** Le début le plus ancien, de `p` et de `r`. */
function plusAncienneDe(p: string | null, r: Repere): string {
  return p === null || temps(r.debut) < temps(p) ? r.debut : p
}

/**
 * Le départ d'une collecte : toujours la page du haut (`start` 0) ; un repère qui attend fait
 * lire le haut de la reprise, sinon la lecture est suivie jusqu'à la cible.
 */
export function depart(d: Depart): Etat {
  return {
    start: 0,
    phase: d.reprise ? "haut" : "suite",
    taille: d.taille,
    reprise: d.reprise,
    frontiere: d.frontiere,
    suivante: d.suivante,
    finHaut: 0,
    premiere: null,
    refus: d.reprise ? d.reprise.refus : false,
    plusAncienne: d.reprise ? d.reprise.ancre.debut : null,
  }
}

/** La page sautée retrouve-t-elle l'ancre : elle la contient, ou commence par une partie plus récente qu'elle ? */
function raccordee(lus: readonly Repere[], ancre: Repere): boolean {
  return lus.some((r) => r.matchId === ancre.matchId) || (lus.length > 0 && temps(lus[0].debut) > temps(ancre.debut))
}

/**
 * Avant de traiter la page lue à `etat.start`, d'après ses parties : page sautée sans raccord
 * (liste remontée, page vide), ne pas la traiter et reculer d'une page, jamais avant la fin du
 * haut ; sinon la traiter (page à la suite ; page sautée raccordée, ou qui touche le haut déjà lu).
 * Dans le haut d'une reprise, une page qui montre une partie nouvelle fait d'abord écrire le
 * repère : position et ancre de sa première partie lisible, refus porté (les parties illisibles
 * d'avant elle seront refusées).
 */
export function examiner(etat: Etat, vues: readonly Vue[]): Examen {
  if (etat.phase === "saut") {
    const ancre = etat.reprise ? etat.reprise.ancre : null
    if (etat.start <= etat.finHaut || ancre === null || raccordee(lisibles(vues.map((v) => v.repere)), ancre)) {
      return { traiter: true, etat: { ...etat, phase: "suite" }, ecrire: null }
    }
    return { traiter: false, etat: { ...etat, start: Math.max(etat.start - etat.taille, etat.finHaut) }, ecrire: null }
  }
  if (etat.phase === "haut" && vues.some((v) => !v.gardeeAvant)) {
    const i = vues.findIndex((v) => v.repere !== null)
    const ancre = i >= 0 ? vues[i].repere : null
    if (ancre) return { traiter: true, etat, ecrire: { position: etat.start + i + 1, ancre, refus: etat.refus || i > 0 } }
  }
  return { traiter: true, etat, ecrire: null }
}

/**
 * Rang dans la page, lue à la suite, de la cible : la frontière, ou la première partie qui n'est
 * pas plus récente qu'elle ; −1 si elle n'y est pas. Jamais pour la première collecte, ni sans frontière.
 */
function rangCible(e: Etat, vues: readonly Traitee[]): number {
  const f = e.frontiere
  if (!e.suivante || f === null) return -1
  return vues.findIndex((v) => v.repere !== null && (v.repere.matchId === f.matchId || temps(v.repere.debut) <= temps(f.debut)))
}

function terminer(e: Etat, cible: boolean, trou: Bornes | null): Fin {
  return { cible, refus: e.refus, frontiere: e.refus ? e.frontiere : e.premiere ?? e.frontiere, trou }
}

/**
 * Après avoir traité la page lue à `etat.start` (`vues` : ses parties, dans l'ordre ; vide :
 * page vide) : fin à la page vide ou à la cible ; après le haut d'une reprise, saut à l'ancre ;
 * sinon la page suivante, et, hors du haut, le repère qui la désigne.
 */
export function conclure(etat: Etat, vues: readonly Traitee[]): Decision {
  const lus = lisibles(vues.map((v) => v.repere))
  const e: Etat = {
    ...etat,
    premiere: etat.start === 0 && etat.premiere === null ? lus[0] ?? null : etat.premiere,
    refus: etat.refus || vues.some((v) => v.refusee),
    plusAncienne: lus.reduce(plusAncienneDe, etat.plusAncienne),
  }
  if (vues.length === 0) {
    const trou = e.suivante && e.frontiere ? { de: e.frontiere.debut, a: e.plusAncienne } : null
    return { fin: terminer(e, false, trou) }
  }
  const cible = rangCible(e, vues)
  if (cible >= 0) {
    // Au moins 90 parties avant la cible : trou possible, borné par la plus ancienne lue avant elle.
    const avant = lisibles(vues.slice(0, cible).map((v) => v.repere)).reduce(plusAncienneDe, etat.plusAncienne)
    const trou = e.frontiere && e.start + cible >= PARTIES_AVANT_TROU ? { de: e.frontiere.debut, a: avant } : null
    return { fin: terminer(e, true, trou) }
  }
  const start = e.start + e.taille
  if (e.phase === "haut" && e.reprise) {
    const i = vues.findIndex((v) => v.gardeeAvant)
    if (i < 0) return { fin: null, etat: { ...e, start }, ecrire: null, saut: null }
    const saut = Math.max(0, e.reprise.position - 1 + e.start + i)
    return { fin: null, etat: { ...e, phase: saut <= start ? "suite" : "saut", start: saut, finHaut: start }, ecrire: null, saut: e.start + i }
  }
  // Ancre : la dernière partie lisible de la page ; position : son rang + 1 (le `start` suivant si la page est pleine et finit lisible).
  const derniere = vues.map((v) => v.repere !== null).lastIndexOf(true)
  const ancre = derniere >= 0 ? vues[derniere].repere : null
  return { fin: null, etat: { ...e, start }, ecrire: ancre ? { position: e.start + derniere + 1, ancre, refus: e.refus } : null, saut: null }
}
