






















import type { Etat, Kill, Manche, Partie } from "./reduction"
import {
  TIRET, effectifEnClair, libelleReference, nombreEnClair, retenues,
  type Evaluation, type Files, type LirePartie, type Selection,
} from "./metriques"
import { PEU_DE_DONNEES, chiffreDAnalyse, chiffreDEquipe, estDuel, statDEquipe, type ChiffreAnalyse, type ChiffreDEquipe, type StatDEquipe } from "./analyses"

/** Espace insécable : entre un nombre et son mot, avant « m » et « s ». */
const NBSP = String.fromCharCode(0xa0)


function compte(n: number, mot: string): string {
  return `${nombreEnClair(n, 0)}${NBSP}${mot}${n > 1 ? "s" : ""}`
}

function n0(n: number): string {
  return nombreEnClair(n, 0)
}

// ─────────────────────────── seuils et textes fixes ───────────────────────────

/** Les files des trois analyses : les complètes (analyses-entrainement.md, Règles communes). */
export const FILES_MORTS: Files = "completes"

export const RAYON_ISOLEMENT = 25
/** Titres des deux blocs (maquette Duels), en capitales par le Bloc. */
export const TITRE_COMMENT_TU_MEURS = "Comment tu meurs"
export const TITRE_ETATS = "À 4 contre 5, à 5 contre 4"
/** Étiquette de la liste de Comment tu meurs. */
export const ETIQUETTE_VENGEES = "Vengées selon ton isolement"
/** Libellés des Chiffres. */
export const LIBELLE_ISOLEES = "Morts isolées"
export const LIBELLE_VENGEES = "Morts vengées"
export const LIBELLE_QUATRE = "Après la première mort de ton équipe"
export const LIBELLE_CINQ = "Après la première mort adverse"
/** La phrase d'une période sans mort par un adversaire dans les files des analyses. */
export const AUCUNE_MORT_ADVERSE = "Aucune mort par un adversaire dans cette période."
/** La phrase d'une période dont aucune partie n'a sa liste des kills. */
export const AUCUNE_LISTE_DES_KILLS = "Aucune partie de cette période n'a sa liste des kills."
/** Les morts d'un Chiffre, dites. */
const PAR_UN_ADVERSAIRE = "par un adversaire"

/** Méthodes dites dans la note de Comment tu meurs. */
export const NOTE_ISOLEE = `Mort isolée${NBSP}: aucun allié vivant à ${RAYON_ISOLEMENT}${NBSP}m ou moins de toi, à vol d'oiseau, sans ligne de vue ni hauteur.`
export const NOTE_VENGEE = `Vengée${NBSP}: un allié tue ton tueur dans les 5${NBSP}s.`
export const NOTE_TIRET_MORTS = `«${NBSP}${TIRET}${NBSP}»${NBSP}: ${PEU_DE_DONNEES}, moins de 5 morts.`
export const NOTE_ETATS = "État de la manche après sa première mort, quelle qu'en soit la cause (spike et chute comprises)"
export const NOTE_TIRET_ETATS = `«${NBSP}${TIRET}${NBSP}»${NBSP}: ${PEU_DE_DONNEES}, moins de 5 manches.`

// ─────────────────────────── types de l'écran (structurels : ceux de dessin.tsx et de duels.tsx) ───────────────────────────

/** Un Chiffre tel que l'écran le pose (ChiffreDuels de duels.tsx). */
export type ChiffreMort = { cle: string; libelle: string; valeur: string; sousTexte: string | null; evaluation: Evaluation; voix: string }
/** Une Barre (Barre de dessin.tsx). */
export type BarreMort = { libelle: string; valeur: string; part: number | null; evaluation: Evaluation; voix: string }

// ─────────────────────────── analyse 5 : morts isolées ───────────────────────────

/** Une de tes morts par un adversaire (estDuel, sens « mort »). */
export function mortParAdversaire(k: Kill): boolean {
  return k.sens === "mort" && estDuel(k)
}

/**
 * Ta mort est-elle isolée (analyse 5) : vrai quand ta position est connue et qu'aucun allié vivant n'est à 25 m ou moins
 * (`allieLePlusProche` null : aucun allié vivant relevé) ; faux avec un allié à 25 m ou moins ; null sans ta position (mort retirée).
 */
export function morteIsolee(k: Kill): boolean | null {
  if (k.position == null) return null
  const d = k.allieLePlusProche
  return typeof d !== "number" || !Number.isFinite(d) || d > RAYON_ISOLEMENT
}

// ─────────────────────────── Comment tu meurs ───────────────────────────

/** Une Barre des vengées : ses morts, ses vengées et sa part (cas : ses morts). */
export type Vengees = { readonly morts: number; readonly vengees: number; readonly part: ChiffreAnalyse; readonly barre: BarreMort }

/**
 * Comment tu meurs sur la sélection : les parties portées (files complètes avec leur liste des kills) et `sansKills`, celles des files
 * sans elle, écartées ; tes morts par un adversaire (`morts`), dont `sansPosition`, retirées des isolées ; les isolées (`isolees`, part
 * sur les morts à ta position connue) ; les vengées (`vengees` : Σ `mortsVengees` ÷ Σ `mortsParAdversaire` des manches des parties
 * portées, `parties` celles qui les ont toutes, `sansVengees` les portées dont une manche ne les a pas, retirées des vengées) ; les
 * vengées de tes morts isolées et des autres, sur tes morts seules de leur manche, `horsVengees` les autres ; les Chiffres, les Barres et
 * la note de l'écran ; `vide`, la phrase à la place du contenu (null quand il y a une mort).
 */
export type CommentTuMeurs = {
  readonly parties: number
  readonly sansKills: number
  readonly morts: number
  readonly sansPosition: number
  readonly isolees: ChiffreAnalyse & { readonly isolees: number; readonly mesurees: number }
  readonly vengees: ChiffreAnalyse & { readonly parties: number; readonly sansVengees: number }
  readonly vengeesIsolees: Vengees
  readonly vengeesNonIsolees: Vengees
  readonly horsVengees: number
  readonly chiffres: readonly ChiffreMort[]
  readonly barresVengees: readonly BarreMort[]
  readonly note: string | null
  readonly vide: string | null
}

/** Le Chiffre des morts isolées. */
function chiffreIsolees(c: ChiffreAnalyse, isolees: number, mesurees: number, morts: number): ChiffreMort {
  const aPosition = mesurees < morts ? ` à ta position connue` : ""
  const sousTexte = mesurees === 0
    ? (morts === 0 ? `aucune mort ${PAR_UN_ADVERSAIRE}` : `aucune mort ${PAR_UN_ADVERSAIRE} à ta position connue`)
    : c.mention !== null ? `${c.mention} : ${compte(mesurees, "mort")} ${PAR_UN_ADVERSAIRE}${aPosition}`
    : `${n0(isolees)} de tes ${compte(mesurees, "mort")} ${PAR_UN_ADVERSAIRE}${aPosition}`
  const voix = c.valeur !== null ? `${LIBELLE_ISOLEES} : ${c.texte}, ${sousTexte}.`
    : c.mention !== null && mesurees > 0 ? `${LIBELLE_ISOLEES}, ${sousTexte}.` : `${LIBELLE_ISOLEES} : ${sousTexte}.`
  return { cle: "isolees", libelle: LIBELLE_ISOLEES, valeur: c.texte, sousTexte, evaluation: "neutre", voix }
}

/** Le Chiffre des morts vengées (la lecture de 4.9, sur les parties du bloc). */
function chiffreVengees(c: ChiffreAnalyse): ChiffreMort {
  const sousTexte = c.den === 0 ? `aucune mort ${PAR_UN_ADVERSAIRE}`
    : c.mention !== null ? `${c.mention} : ${compte(c.den, "mort")} ${PAR_UN_ADVERSAIRE}`
    : `${n0(c.num)} de tes ${compte(c.den, "mort")} ${PAR_UN_ADVERSAIRE}`
  const voix = c.valeur !== null ? `${LIBELLE_VENGEES} : ${c.texte}, ${sousTexte}.`
    : c.mention !== null && c.den > 0 ? `${LIBELLE_VENGEES}, ${sousTexte}.` : `${LIBELLE_VENGEES} : ${sousTexte}.`
  return { cle: "vengees", libelle: LIBELLE_VENGEES, valeur: c.texte, sousTexte, evaluation: "neutre", voix }
}





function vengeesDe(libelle: string, dit: string, morts: number, vengees: number): Vengees {
  const part = chiffreDAnalyse({ num: vengees, den: morts, cas: morts })
  const voix = morts === 0 ? `${dit} : aucune.`
    : part.valeur === null ? `${dit}, ${compte(morts, "mort")} : ${PEU_DE_DONNEES}.`
    : `${dit}, ${compte(morts, "mort")} : ${part.texte} vengées.`
  return { morts, vengees, part, barre: { libelle: effectifEnClair(libelle, morts), valeur: part.texte, part: part.valeur, evaluation: "neutre", voix } }
}

/** Les manches d'une partie par numéro. */
function manchesParNumero(p: Partie): Map<number, Manche> {
  const r = new Map<number, Manche>()
  for (const m of p.manches ?? []) r.set(m.numero, m)
  return r
}

/** Une manche porte-t-elle ses comptes de vengeance (nombres lisibles) ? */
function avecVengeances(m: Manche): boolean {
  return Number.isFinite(m.mortsVengees) && Number.isFinite(m.mortsParAdversaire)
}

/** Comment tu meurs sur la sélection (Duels ; récap, section 11). */
export function commentTuMeurs(sel: Selection): CommentTuMeurs {
  const completes = retenues(sel.parties, FILES_MORTS)
  let parties = 0, sansKills = 0, morts = 0, sansPosition = 0, isolees = 0, mesurees = 0, horsVengees = 0
  let vNum = 0, vDen = 0, vParties = 0, sansVengees = 0
  const v = { isolees: { morts: 0, vengees: 0 }, autres: { morts: 0, vengees: 0 } }
  for (const p of completes) {
    if (!Array.isArray(p.kills)) {
      sansKills++
      continue
    }
    parties++
    const ms = p.manches ?? []
    if (ms.every(avecVengeances)) {
      vParties++
      for (const m of ms) {
        vNum += m.mortsVengees
        vDen += m.mortsParAdversaire
      }
    } else sansVengees++
    const manches = manchesParNumero(p)
    const parManche = new Map<number, number>()
    for (const k of p.kills) if (mortParAdversaire(k)) parManche.set(k.manche, (parManche.get(k.manche) ?? 0) + 1)
    for (const k of p.kills) {
      if (!mortParAdversaire(k)) continue
      morts++
      const isolee = morteIsolee(k)
      if (isolee === null) {
        sansPosition++
        continue
      }
      mesurees++
      if (isolee) isolees++
      // Vengeance d'une mort seule de sa manche : celle de la manche (une mort par un adversaire, vengée ou non).
      const m = manches.get(k.manche)
      if (m !== undefined && avecVengeances(m) && parManche.get(k.manche) === 1 && m.mortsParAdversaire === 1 && (m.mortsVengees === 0 || m.mortsVengees === 1)) {
        const x = isolee ? v.isolees : v.autres
        x.morts++
        x.vengees += m.mortsVengees
      } else horsVengees++
    }
  }
  const cIsolees = chiffreDAnalyse({ num: isolees, den: mesurees, cas: mesurees })
  const cVengees = chiffreDAnalyse({ num: vNum, den: vDen, cas: vDen })
  const vi = vengeesDe("Isolées", "Morts isolées", v.isolees.morts, v.isolees.vengees)
  const vn = vengeesDe("Non isolées", "Morts non isolées", v.autres.morts, v.autres.vengees)
  const r = {
    parties, sansKills, morts, sansPosition,
    isolees: { ...cIsolees, isolees, mesurees },
    vengees: { ...cVengees, parties: vParties, sansVengees },
    vengeesIsolees: vi, vengeesNonIsolees: vn, horsVengees,
  }
  const vide = morts > 0 ? null : parties === 0 && sansKills > 0 ? AUCUNE_LISTE_DES_KILLS : AUCUNE_MORT_ADVERSE
  return {
    ...r,
    chiffres: vide !== null ? [] : [chiffreIsolees(cIsolees, isolees, mesurees, morts), chiffreVengees(cVengees)],
    barresVengees: vide !== null || vi.morts + vn.morts === 0 ? [] : [vi.barre, vn.barre],
    note: noteCommentTuMeurs(r, vide !== null),
    vide,
  }
}


function effectifMorts(parties: number, sansKills: number): string {
  const sur = parties > 0 ? `Sur ${compte(parties, "partie")}` : "Aucune partie portée"
  const ecart = sansKills > 0 ? ` ; ${compte(sansKills, "partie")} sans la liste des kills ${sansKills > 1 ? "écartées" : "écartée"}` : ""
  return `${sur}${ecart}.`
}

/**
 * La note de Comment tu meurs : les méthodes (isolée, vengée), les morts hors du détail des vengées, les parties retirées des vengées, les
 * morts sans ta position, ce que dit un « — » s'il en paraît un, l'effectif. Sans mort : les parties écartées seules, s'il y en a (null
 * sinon).
 */
function noteCommentTuMeurs(r: Omit<CommentTuMeurs, "chiffres" | "barresVengees" | "note" | "vide">, vide: boolean): string | null {
  if (vide) return r.sansKills > 0 && r.parties > 0 ? effectifMorts(r.parties, r.sansKills) : null
  const morceaux = [NOTE_ISOLEE, NOTE_VENGEE]
  if (r.horsVengees > 0) {
    const leur = r.horsVengees > 1 ? "leur manche" : "sa manche"
    morceaux.push(`Hors des vengées selon ton isolement${NBSP}: ${compte(r.horsVengees, "mort")}, ${leur} n'ayant pas exactement une mort par un adversaire (tu y meurs plus d'une fois, ou ses comptes manquent).`)
  }
  const sv = r.vengees.sansVengees
  if (sv > 0) morceaux.push(`${compte(sv, "partie")} dont une manche n'a pas ses comptes de vengeance, ${sv > 1 ? "retirées" : "retirée"} des morts vengées.`)
  if (r.sansPosition > 0) morceaux.push(`Hors du calcul, sans ta position${NBSP}: ${compte(r.sansPosition, "mort")}.`)
  const tirets = [r.isolees, r.vengees, r.vengeesIsolees.part, r.vengeesNonIsolees.part].some((c) => c.mention !== null && c.cas > 0)
  if (tirets) morceaux.push(NOTE_TIRET_MORTS)
  morceaux.push(effectifMorts(r.parties, r.sansKills))
  return morceaux.join(" ")
}

// ─────────────────────────── analyse 10 : à 4 contre 5, à 5 contre 4 ───────────────────────────

/**
 * La lecture d'un état dans une partie : ses manches dans cet état dont l'issue est connue (`den`) et celles gagnées (`num`) ; null sans
 * manche jouée, ou si une manche n'a pas son état (partie gardée avant ce fait), la partie sortant de la stat.
 */
function lireEtat(etat: Etat): LirePartie {
  return (p) => {
    const manches = p.manches ?? []
    if (manches.length === 0) return null
    let num = 0, den = 0
    for (const m of manches) {
      if (m.etatApresPremiereMort === undefined) return null
      if (m.etatApresPremiereMort !== etat || typeof m.gagnee !== "boolean") continue
      den++
      if (m.gagnee) num++
    }
    return { num, den }
  }
}

/** Part gagnée de tes manches à 4 contre 5 et à 5 contre 4 : deux stats d'équipe, face à ta période précédente (déclarées une fois). */
export const STAT_QUATRE_CONTRE_CINQ: StatDEquipe = statDEquipe(lireEtat("4contre5"), FILES_MORTS)
export const STAT_CINQ_CONTRE_QUATRE: StatDEquipe = statDEquipe(lireEtat("5contre4"), FILES_MORTS)

/**
 * À 4 contre 5, à 5 contre 4 sur la sélection : les deux chiffres d'équipe (chiffreDEquipe : num, les manches gagnées ; den, les manches
 * de cet état ; écart à ta période précédente ou sa raison) ; les parties des files complètes (`completes`) et celles lues (`parties`) ;
 * les manches de ces parties sans aucune mort (`sansMort`) ou d'issue inconnue (`issueInconnue`), retirées ; la période précédente en mots
 * (« Le mois d'avant », null en Tout).
 */
export type Etats = {
  readonly quatre: ChiffreDEquipe
  readonly cinq: ChiffreDEquipe
  readonly completes: number
  readonly parties: number
  readonly sansMort: number
  readonly issueInconnue: number
  readonly avant: string | null
}

/** Ta période précédente en tête de phrase, d'après son libellé d'écart (« vs mois d'avant » → « Le mois d'avant ») ; null en Tout. */
function avantEnMots(sel: Selection): string | null {
  const libelle = libelleReference("periode", sel.perimetre.periode)
  if (libelle === null) return null
  const mots = libelle.replace(/^vs /, "")
  return mots.startsWith("semaine") ? `La ${mots}` : mots.startsWith("acte") ? `L'${mots}` : `Le ${mots}`
}

/** À 4 contre 5, à 5 contre 4 sur la sélection (Duels ; récap, section 13). */
export function etatsApresPremiereMort(sel: Selection): Etats {
  const completes = retenues(sel.parties, FILES_MORTS)
  const quatre = chiffreDEquipe(sel, STAT_QUATRE_CONTRE_CINQ)
  const cinq = chiffreDEquipe(sel, STAT_CINQ_CONTRE_QUATRE)
  let sansMort = 0, issueInconnue = 0
  for (const p of completes) {
    const manches = p.manches ?? []
    if (manches.length === 0 || manches.some((m) => m.etatApresPremiereMort === undefined)) continue
    for (const m of manches) {
      if (m.etatApresPremiereMort === null) sansMort++
      else if (typeof m.gagnee !== "boolean") issueInconnue++
    }
  }
  return { quatre, cinq, completes: completes.length, parties: quatre.parties, sansMort, issueInconnue, avant: avantEnMots(sel) }
}


const ETAT_DIT: Readonly<Record<"quatre" | "cinq", string>> = { quatre: "à 4 contre 5", cinq: "à 5 contre 4" }





function chiffreEtat(cle: "quatre" | "cinq", c: ChiffreDEquipe, dire: (ecart: string) => string): ChiffreMort {
  const libelle = cle === "quatre" ? LIBELLE_QUATRE : LIBELLE_CINQ
  const etat = ETAT_DIT[cle]
  const base = c.den === 0 ? `aucune manche ${etat}`
    : c.mention !== null ? `${c.mention} : ${compte(c.den, "manche")} ${etat}`
    : `${n0(c.num)} ${c.num > 1 ? "gagnées" : "gagnée"} sur ${compte(c.den, "manche")} ${etat}`
  const raison = c.raison === null || (c.raison.cause === "cas" && c.mention !== null && c.raison.texte.endsWith("sur la période")) ? null : c.raison.texte
  const suite = c.ecart ?? raison
  const sousTexte = suite === null ? base : `${base}, ${suite}`
  const dite = suite === null ? base : `${base}, ${c.ecart !== null ? dire(c.ecart) : suite}`
  const voix = c.valeur !== null ? `${libelle} : ${c.texte}, ${dite}.`
    : c.mention !== null && c.den > 0 ? `${libelle}, ${dite}.` : `${libelle} : ${dite}.`
  return { cle, libelle, valeur: c.texte, sousTexte, evaluation: c.ecart === null ? "neutre" : c.evaluation, voix }
}

/** Les deux Chiffres du bloc, 4 contre 5 puis 5 contre 4 (maquette) ; `dire` : l'écart dit en toutes lettres (ditEnClair de l'écran). */
export function chiffresEtats(e: Etats, dire: (ecart: string) => string = (x) => x): ChiffreMort[] {
  return [chiffreEtat("quatre", e.quatre, dire), chiffreEtat("cinq", e.cinq, dire)]
}

/**
 * La note du bloc : la définition et les manches de chaque état, sur les parties lues ; ta période précédente (ses deux valeurs, quand
 * elles s'écrivent) ; les manches retirées (sans aucune mort, d'issue inconnue) ; les parties écartées sans l'état des manches ; ce que
 * dit un « — » s'il en paraît un.
 */
export function noteEtats(e: Etats): string {
  const q = e.quatre.den, c = e.cinq.den
  const manches = q + c === 0 ? "aucune manche" : `${compte(q, "manche")} ${ETAT_DIT.quatre} et ${n0(c)} ${ETAT_DIT.cinq}`
  const morceaux = [e.parties > 0 ? `${NOTE_ETATS}${NBSP}: ${manches}, sur ${compte(e.parties, "partie")}.` : `${NOTE_ETATS}.`]
  const refs: string[] = []
  if (e.avant !== null && e.quatre.reference !== null && e.quatre.reference.valeur !== null) refs.push(`${e.quatre.reference.texte} ${ETAT_DIT.quatre}`)
  if (e.avant !== null && e.cinq.reference !== null && e.cinq.reference.valeur !== null) refs.push(`${e.cinq.reference.texte} ${ETAT_DIT.cinq}`)
  if (e.avant !== null && refs.length > 0) morceaux.push(`${e.avant}${NBSP}: ${refs.join(", ")}.`)
  const retirees: string[] = []
  if (e.sansMort > 0) retirees.push(`${compte(e.sansMort, "manche")} sans aucune mort`)
  if (e.issueInconnue > 0) retirees.push(`${compte(e.issueInconnue, "manche")} d'issue inconnue`)
  if (retirees.length > 0) morceaux.push(`Hors du calcul${NBSP}: ${retirees.join(" et ")}.`)
  const ecartees = e.completes - e.parties
  if (ecartees > 0) morceaux.push(`${compte(ecartees, "partie")} sans l'état des manches ${ecartees > 1 ? "écartées" : "écartée"}.`)
  if ([e.quatre, e.cinq].some((x) => x.mention !== null && x.den > 0)) morceaux.push(NOTE_TIRET_ETATS)
  return morceaux.join(" ")
}
