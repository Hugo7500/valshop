import {
  EnvironmentValuesReader, Rectangle, Text, VStack, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ESPACES, TYPO, couleurs, policeCondensee } from "./design"
import { PileDeBlocs } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import { Barres, Bloc, GrilleChiffres, Histogramme, SEGMENTS_COTE, SelecteurSegmente, sansMauvaiseCoupure, type Barre } from "./dessin"
import {
  MIN_OCCURRENCES, MIN_PARTIES_FICHE, NOTE_CE_QUI_TE_TUE, PREMIERES_MORTS, PREMIERS_KILLS, RATIO_PREMIERS_DUELS, TIRET, ceQuiTeTue, clutchs,
  comparer, cumulsDuPerimetre, duelsParAgentAdverse, ecartDe, echangesEtSurvie, ecritureDe, effectifEnClair, histogrammeDesMorts, libelleReference,
  momentDeTaMort, multiKills, nombreEnClair, premiersDuelsParCarte, retenues, selectionner, semaineDe, valeurEnClair,
  type CeQuiTeTue, type ChiffreDuel as ChiffreDuMetrique, type CleMultiKill, type Clutchs, type DuelAgent, type EchangesEtSurvie,
  type Evaluation, type Histogramme as HistogrammeDesMorts, type Mode, type MomentDeTaMort, type MultiKills, type PremiersDuelsCarte,
  type Selection, type Stat,
} from "./metriques"
import type { Cote, CumulAgent, Partie } from "./reduction"
import type { Emplacement, PropsEmplacement } from "./app"
import { agentsAdversesDeLaPeriode } from "./analyses-agents"
import { BlocAgentsAdverses } from "./agents-adverses"
import {
  ETIQUETTE_VENGEES, TITRE_COMMENT_TU_MEURS, TITRE_ETATS, chiffresEtats, commentTuMeurs, etatsApresPremiereMort, noteEtats,
  type CommentTuMeurs, type Etats,
} from "./analyses-duels"

























// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const MOINS = String.fromCharCode(0x2212)
const NBSP = String.fromCharCode(0xa0)

const ERS = String.fromCharCode(0x1d49, 0x02b3, 0x02e2)
const RES = String.fromCharCode(0x02b3, 0x1d49, 0x02e2)

/** Les titres des blocs (maquette) : toujours en capitales, quelle que soit leur longueur (Bloc, entrée 42 ; DESIGN.md, Typography). */
export const TITRE_PREMIERS = "Premiers duels"
export const TITRE_MOMENT = "À quel moment tu meurs"
export const TITRE_CARTES = "Premiers duels par carte"
/** Le côté ouvert par défaut (EXPERIENCE.md, Sélecteur segmenté : Attaque, comme la maquette). */
export const COTE_DEFAUT: Cote = "attaque"
/** La phrase d'une période sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties dans la période, aucune des files complètes (escarmouche, deathmatch) : aucun duel compté. */
export const SANS_DUEL = "Aucune partie de cette période ne compte pour les duels."
/** Le sous-texte d'un moment sans écart écrit, et celui de tes lobbys (maquette). */
export const EN_MOYENNE = "en moyenne"
/** Le libellé du Chiffre de tes lobbys (maquette). */
export const TES_LOBBYS = "Tes lobbys"
/** La note de Premiers duels par carte (maquette), puis ce que dit un « — ». */
export const NOTE_RATIO = "Ratio = premiers kills divisés par premières morts."
export const NOTE_TIRET = `«${NBSP}${TIRET}${NBSP}» : moins de ${MIN_PARTIES_FICHE} parties sur la carte, ou aucune première mort.`
/** Le ratio qui remplit une barre de Premiers duels par carte, au moins (maquette : 1,05 à 70 %) ; plus, si un ratio écrit le dépasse. */
export const ECHELLE_CARTES = 1.5

/** Le côté dit dans une phrase : « attaque », « défense ». */
const COTE_DIT: Readonly<Record<Cote, string>> = { attaque: "attaque", defense: "défense" }

/** Côté sans mort dans la période (une partie de défense seule…) : la phrase à la place de l'Histogramme et des Chiffres. */
export function sansMort(cote: Cote): string {
  return `Aucune mort en ${COTE_DIT[cote]} dans cette période.`
}

// ─────────────────────────── textes ───────────────────────────

/** La référence d'un écart telle que l'écrit metriques.ts, puis telle que la dit VoiceOver (Voice and Tone : « par rapport à tes lobbys »). */
const REFERENCES_DITES: readonly (readonly [string, string])[] = [
  [" vs lobby", " par rapport à tes lobbys"],
  [" vs semaine d'avant", " par rapport à la semaine d'avant"],
  [" vs mois d'avant", " par rapport au mois d'avant"],
  [" vs acte d'avant", " par rapport à l'acte d'avant"],
]

const SECONDES = new RegExp(`(\\d+)${NBSP}s(?!\\p{L})`, "gu")

const POINTS = new RegExp(`(\\d+)${NBSP}pts?(?!\\p{L})`, "gu")







export function ditEnClair(texte: string): string {
  if (texte === TIRET) return "aucune valeur"
  let t = texte
  for (const [ecrit, dit] of REFERENCES_DITES) {
    const i = t.indexOf(ecrit)
    if (i >= 0) {
      t = t.slice(0, i) + dit + t.slice(i + ecrit.length)
      break
    }
  }
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t
    .replace(SECONDES, (_tout: string, n: string) => `${n} seconde${Number(n) >= 2 ? "s" : ""}`)
    .replace(POINTS, (_tout: string, n: string) => `${n} point${Number(n) >= 2 ? "s" : ""}`)
}

/**
 * Un Chiffre de Duels écrit (DESIGN.md, chiffre) : son libellé, sa valeur, son sous-texte (l'écart à sa référence, « en
 * moyenne », ou rien), sa couleur (l'évaluation, quand le sous-texte écrit la référence ; neutre sinon) et sa phrase VoiceOver.
 */
export type ChiffreDuels = { cle: string; libelle: string; valeur: string; sousTexte: string | null; evaluation: Evaluation; voix: string }

/** Les trois Chiffres de Premiers duels : libellé écrit (casse de phrase, ordinal en exposant), nom dit, stat (entrée 2). */
const PREMIERS: readonly { cle: string; libelle: string; dit: string; stat: Stat }[] = [
  { cle: "kills", libelle: `1${ERS} kills / manche`, dit: "Premiers kills par manche", stat: PREMIERS_KILLS },
  { cle: "morts", libelle: `1${RES} morts / manche`, dit: "Premières morts par manche", stat: PREMIERES_MORTS },
  { cle: "ratio", libelle: "Ratio", dit: "Ratio des premiers duels", stat: RATIO_PREMIERS_DUELS },
]








export function premiersDuels(sel: Selection): ChiffreDuels[] {
  return PREMIERS.map((d): ChiffreDuels => {
    const c = comparer(sel, d.stat)
    const valeur = valeurEnClair(c.valeur, d.stat.mesure)
    const { ecart, evaluation } = ecartDe(c, ecritureDe(d.stat.mesure), libelleReference(d.stat.reference, sel.perimetre.periode))
    return {
      cle: d.cle, libelle: d.libelle, valeur, sousTexte: ecart, evaluation,
      voix: `${d.dit} : ${ditEnClair(valeur)}${ecart === null ? "" : `, ${ditEnClair(ecart)}`}.`,
    }
  })
}






export function chiffresMoment(m: MomentDeTaMort): ChiffreDuels[] {
  const nom = `Ta première mort en ${COTE_DIT[m.cote]}`
  const toi: ChiffreDuels = m.ecart === null
    ? { cle: "toi", libelle: m.libelle, valeur: m.valeur, sousTexte: EN_MOYENNE, evaluation: "neutre", voix: `${nom} : ${ditEnClair(m.valeur)} ${EN_MOYENNE}.` }
    : { cle: "toi", libelle: m.libelle, valeur: m.valeur, sousTexte: m.ecart, evaluation: m.evaluation, voix: `${nom} : ${ditEnClair(m.valeur)}, ${ditEnClair(m.ecart)}.` }
  if (m.reference === null) return [toi]
  return [toi, { cle: "lobbys", libelle: TES_LOBBYS, valeur: m.reference, sousTexte: EN_MOYENNE, evaluation: "neutre", voix: `${TES_LOBBYS} : ${ditEnClair(m.reference)} ${EN_MOYENNE}.` }]
}

/** Le ratio qui remplit une barre de Premiers duels par carte : 1,5 (maquette), ou le plus grand ratio écrit s'il le dépasse. */
export function echelleCartes(lignes: readonly PremiersDuelsCarte[]): number {
  let max = ECHELLE_CARTES
  for (const l of lignes) if (l.ratio !== null && l.ratio > max) max = l.ratio
  return max
}





export function voixCarte(l: PremiersDuelsCarte): string {
  const tete = `${l.carte}, ${nombreEnClair(l.parties, 0)} partie${l.parties > 1 ? "s" : ""}`
  if (l.ratio !== null) return `${tete} : ratio des premiers duels ${l.texte}.`
  return l.parties < MIN_PARTIES_FICHE ? `${tete} : pas de ratio sous ${MIN_PARTIES_FICHE} parties.` : `${tete} : aucune première mort, pas de ratio.`
}


export function barresCartes(lignes: readonly PremiersDuelsCarte[]): Barre[] {
  const echelle = echelleCartes(lignes)
  return lignes.map((l): Barre => ({
    libelle: l.libelle, valeur: l.texte, part: l.ratio === null ? null : l.ratio / echelle, evaluation: l.evaluation, voix: voixCarte(l),
  }))
}

/** La note de Premiers duels par carte : la définition du ratio (maquette), puis ce que dit un « — » s'il en paraît un. */
export function noteCartes(lignes: readonly PremiersDuelsCarte[]): string {
  return lignes.some((l) => l.ratio === null) ? `${NOTE_RATIO} ${NOTE_TIRET}` : NOTE_RATIO
}

// ─────────────────────────── ce qui te tue, échanges, clutchs, multi-kills (entrée 27) ───────────────────────────

/** Les titres des blocs de l'entrée 27 (maquette), toujours en capitales par le Bloc (entrée 42). */
export const TITRE_TUE = "Ce qui te tue"
export const TITRE_ECHANGES = "Échanges et survie"
export const TITRE_CLUTCHS = "Clutchs"
export const TITRE_MULTI = "Multi-kills"





export const ETIQUETTE_ARMES = "Arme de l'adversaire"
export const ETIQUETTE_AGENTS = "Tes duels gagnés, par agent adverse"
const ETIQUETTE_ARMES_EN_CAPITALES = true
const ETIQUETTE_AGENTS_EN_CAPITALES = false
/** L'étiquette de Comment tu meurs (entrée 5 de epic-stats-analyses), plus de trois mots : en casse de phrase (DESIGN.md, Typography). */
const ETIQUETTE_VENGEES_EN_CAPITALES = false
/** Aucune de tes morts relevée (la liste des kills de tes parties : « relevée », comme le récap, entrée 5.4). */
export const AUCUNE_MORT = "Aucune mort relevée dans cette période."
/** Des morts, aucune par un adversaire dont l'arme ou la capacité est connue. */
export const AUCUNE_CONNUE = "Aucune mort par un adversaire dont l'arme ou la capacité est connue."
/** Ce que sont tes autres morts, comptées à part (ligneDeTaMort de metriques.ts). */
export const AUTRES_MORTS_DITES = "spike, chute, tir allié ou sur toi-même, ou arme sans nom"
/** Aucun duel par agent adverse dans les cumuls des semaines et des files de tes parties (relecture : les files, comme le récap). */
export const AUCUN_DUEL_AGENT = "Aucun duel par agent adverse dans les cumuls des semaines et des files de tes parties de la période."
/** La note d'Échanges et survie : ce qu'est venger (EXPERIENCE.md, Échanges : 5 s), et pourquoi les échanges n'ont pas de référence. */
export const NOTE_ECHANGES = `Vengé : son tueur est tué dans les 5${NBSP}s. Échanges sans référence : ceux de tes lobbys ne sont pas gardés.`
/** La note des Multi-kills : ce que comptent les cinq Chiffres (EXPERIENCE.md, Multi-kills) ; noteMultiKills y ajoute ses parties. */
export const NOTE_MULTI = "Manches où tu fais exactement 2, 3 ou 4 kills, ou 5 et plus. Ace : tous les adversaires de la manche tués par toi."
/** La raison d'une valeur absente faute de manches lues (récap, 5.4 : « aucune partie à manches jouées »). */
export const SANS_MANCHE = "aucune partie à manches jouées"
/** Un bloc des clutchs ou des multi-kills sans aucune partie à manches lue : sa phrase à la place des Chiffres. */
export const SANS_MANCHE_PHRASE = "Aucune partie à manches jouées dans cette période."
/** La raison de ta part de clutchs absente, des parties à manches lues mais aucune situation. */
export const SANS_SITUATION = "aucune situation de clutch"
/** La note des Clutchs quand un « — » paraît : sa raison (récap : « aucune situation »). */
export const NOTE_SANS_SITUATION = `«${NBSP}${TIRET}${NBSP}» : aucune situation.`
/** Le nom de chaque file complète, dit dans les phrases des files, et leur ordre (EXPERIENCE.md, Files admises). */
const NOMS_DES_FILES: Readonly<Record<string, string>> = { competitive: "compétition", unrated: "non classé", swiftplay: "vélocité", premier: "Premier" }
const ORDRE_DES_FILES: readonly string[] = ["competitive", "unrated", "swiftplay", "premier"]


function compte(n: number, nom: string): string {
  return `${nombreEnClair(n, 0)} ${nom}${n > 1 ? "s" : ""}`
}

/** Des mots en liste : « a », « a et b », « a, b et c ». */
function enListe(mots: readonly string[]): string {
  return mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}` : mots.length === 1 ? mots[0] : ""
}

/** Des files sans doublon, dans l'ordre compétition, non classé, vélocité, Premier, puis les autres par nom. */
function filesEnOrdre(files: Iterable<string>): string[] {
  const presentes = new Set(files)
  return [...ORDRE_DES_FILES.filter((f) => presentes.has(f)), ...[...presentes].filter((f) => !ORDRE_DES_FILES.includes(f)).sort()]
}

/**
 * Les parties dont parlent les blocs de l'entrée 27 : celles de la période, les complètes (compétition, non classé, vélocité, Premier,
 * seules comptées par ces blocs : Files admises), leurs files, et celles dont la liste des kills est lue (Ce qui te tue).
 */
export type PartiesDesBlocs = { periode: number; completes: number; files: string[]; avecKills: number }

/** Les parties des blocs de l'entrée 27 sur la sélection. */
export function partiesDesBlocs(sel: Selection): PartiesDesBlocs {
  const completes = retenues(sel.parties, "completes")
  return {
    periode: sel.parties.length, completes: completes.length, files: filesEnOrdre(completes.map((p) => p.file)),
    avecKills: completes.filter((p) => Array.isArray(p.kills)).length,
  }
}









export function phraseFilesDuTout(p: PartiesDesBlocs): string | null {
  if (p.completes === 0 || p.completes >= p.periode) return null
  const noms = p.files.map((f) => `de ${NOMS_DES_FILES[f] ?? f}`)
  return sansMauvaiseCoupure(`En mode Tout, les blocs qui suivent ne comptent que tes parties ${enListe(noms)} : ${nombreEnClair(p.completes, 0)} sur ${nombreEnClair(p.periode, 0)}.`)
}


export function surParties(lues: number, completes: number): string | null {
  return lues === completes || lues <= 0 ? null : `sur ${compte(lues, "partie")}`
}









export function phraseArmes(q: CeQuiTeTue, lues: number, completes: number): string {
  const sur = surParties(lues, completes)
  if (q.morts === 0) return sur === null ? AUCUNE_MORT : `Aucune mort relevée ${sur} de cette période.`
  const connues = q.morts - q.autres
  const releve = (n: number) => (sur === null ? "" : `, relevée${n > 1 ? "s" : ""} ${sur}`)
  const tete = connues <= 0 ? `${AUCUNE_CONNUE.slice(0, -1)}${sur === null ? "" : `, ${sur}`}.`
    : connues === 1 ? `Sur ta seule mort par un adversaire dont l'arme ou la capacité est connue${releve(1)}.`
    : `Sur tes ${compte(connues, "mort")} par un adversaire dont l'arme ou la capacité est connue${releve(connues)}.`
  return sansMauvaiseCoupure(q.texteAutres === null ? tete : `${tete} À part : ${q.texteAutres} (${AUTRES_MORTS_DITES}).`)
}







export function barresArmes(q: CeQuiTeTue): Barre[] {
  return q.armes.map((a): Barre => ({
    libelle: sansMauvaiseCoupure(effectifEnClair(a.nom, a.nombre)), valeur: a.texte, part: a.part, evaluation: a.evaluation,
    voix: `${a.nom}, ${compte(a.nombre, "mort")} : ${a.texte} de tes morts par une arme ou une capacité adverse connue.`,
  }))
}

/**
 * Les cumuls lus pour les duels par agent adverse (cumulsDuPerimetre de metriques.ts, que lit duelsParAgentAdverse) : les cumuls par semaine et par
 * file comptent toutes tes parties, celles gardées avant le détail par agent (entrée 11 de epic-stats-analyses) comprises ; la somme couvre la semaine entière
 * (du lundi au dimanche) de chaque couple (semaine, file) d'une partie complète de la période dont un cumul est tenu. `semaines` et
 * `files` : celles de ces couples lus (files dans l'ordre compétition, non classé, vélocité, Premier) ; `gardees` : tes parties tenues
 * (refaites écartées) de ces couples, celles de l'historique, non celles des cumuls, qui ne gardent pas leurs parties ; `periode` :
 * celles de la période. Recompté comme la ligne du récap (5.4).
 */
export type SemainesDesDuels = { semaines: number; files: string[]; gardees: number; periode: number }

/** Les semaines des duels par agent adverse sur la sélection : les couples (semaine, file) lus dans `cumuls`, comptés dans tout l'historique tenu. */
export function semainesDesDuels(sel: Selection, historique: readonly Partie[], cumuls: readonly CumulAgent[]): SemainesDesDuels {
  const lus = new Set(cumulsDuPerimetre(sel, cumuls, "completes").map((c) => `${c.semaine}|${c.file}`))
  const cle = (p: Partie) => `${semaineDe(p.debut)}|${p.file}`
  const couples = [...lus].map((k) => k.split("|"))
  return {
    semaines: new Set(couples.map((c) => c[0])).size,
    files: filesEnOrdre(couples.map((c) => c[1])),
    gardees: selectionner(historique, { mode: "tout", periode: "tout" }, 0).parties.filter((p) => lus.has(cle(p))).length,
    periode: retenues(sel.parties, "completes").filter((p) => lus.has(cle(p))).length,
  }
}








export function phraseSemaines(s: SemainesDesDuels): string {
  const quelles = s.semaines > 1
    ? `les ${nombreEnClair(s.semaines, 0)} semaines entières (du lundi au dimanche) de tes parties de la période`
    : "la semaine entière (du lundi au dimanche) de tes parties de la période"
  const files = s.files.length > 0 ? `, ${enListe(s.files.map((f) => `en ${NOMS_DES_FILES[f] ?? f}`))}` : ""
  const dont = s.gardees === s.periode ? (s.gardees > 1 ? "toutes de la période" : "de la période") : `dont ${nombreEnClair(s.periode, 0)} de la période`
  return sansMauvaiseCoupure(`Lus dans les cumuls par semaine, qui comptent aussi tes parties gardées avant le détail par agent : ${quelles}${files}, où tu as ${compte(s.gardees, "partie")} gardée${s.gardees > 1 ? "s" : ""}, ${dont}.`)
}


export function nomAgentAdverse(d: DuelAgent): string {
  if (d.nom !== "?") return d.nom
  return `un agent non reconnu (${d.id === "" ? "sans id" : `id ${d.id.slice(0, 8)}`})`
}







export function barresAgents(lignes: readonly DuelAgent[]): Barre[] {
  return lignes.map((d): Barre => {
    const nom = nomAgentAdverse(d)
    const tete = `Contre ${nom}, ${compte(d.duels, "duel")}`
    const voix = d.valeur !== null
      ? `${tete} : ${d.texte} gagnés.`
      : `${tete} : ${nombreEnClair(d.gagnes, 0)} gagné${d.gagnes > 1 ? "s" : ""} sur ${nombreEnClair(d.duels, 0)}.`
    return { libelle: sansMauvaiseCoupure(effectifEnClair(`contre ${nom}`, d.duels)), valeur: d.texte, part: d.valeur, evaluation: d.evaluation, voix }
  })
}







export function chiffreDuModule(c: ChiffreDuMetrique, libelle: string, dit: string, completes: number, aucun: string = SANS_MANCHE): ChiffreDuels {
  const raison = c.valeur === TIRET ? (c.sommes.parties > 0 ? aucun : SANS_MANCHE) : null
  const sur = surParties(c.sommes.parties, completes)
  const ecrits = [raison ?? c.ecart, sur].filter((x): x is string => x !== null)
  const dits = [raison ?? (c.ecart === null ? null : ditEnClair(c.ecart)), sur].filter((x): x is string => x !== null)
  return {
    cle: c.cle, libelle, valeur: c.valeur, sousTexte: ecrits.length > 0 ? ecrits.join(", ") : null, evaluation: c.ecart === null ? "neutre" : c.evaluation,
    voix: `${dit} : ${ditEnClair(c.valeur)}${dits.length > 0 ? `, ${dits.join(", ")}` : ""}.`,
  }
}








export function chiffresEchanges(e: EchangesEtSurvie, completes: number): ChiffreDuels[] {
  const part = (c: ChiffreDuMetrique, cle: string, libelle: string, aucun: string, de: string, des: (n: string) => string): ChiffreDuels => {
    const s = c.sommes
    const base = s.parties === 0 ? SANS_MANCHE : s.den === 0 ? aucun : s.den < MIN_OCCURRENCES ? de : des(nombreEnClair(s.den, 0))
    const sur = surParties(s.parties, completes)
    const sous = sur === null ? base : `${base}, ${sur}`
    const voix = s.den === 0 ? `${libelle} : ${ditEnClair(c.valeur)}, ${sous}.` : `${libelle} ${c.valeur} ${sous}.`
    return { cle, libelle, valeur: c.valeur, sousTexte: sous, evaluation: "neutre", voix }
  }
  return [
    part(e.alliesVenges, "venges", "Tu venges", "aucun allié tué par un adversaire pendant que tu vis",
      "des alliés tués par un adversaire pendant que tu vis", (n) => `des ${n} alliés tués par un adversaire pendant que tu vis`),
    part(e.mortsVengees, "vengees", "Tes alliés vengent", "aucune mort par un adversaire",
      "de tes morts par un adversaire", (n) => `de tes ${n} morts par un adversaire`),
  ]
}

/**
 * Les Chiffres d'Échanges et survie par groupe (rangeesDeChiffres de dessin.tsx) : tes échanges ; tes manches survécues, seules sur leur rangée ;
 * ton écart de dégâts et tes dégâts reçus, par manche (« par manche » de la maquette passé dans le libellé, le sous-texte portant
 * l'écart à leur référence, ou la raison d'un « — »).
 */
export function groupesEchanges(e: EchangesEtSurvie, completes: number): ChiffreDuels[][] {
  return [
    chiffresEchanges(e, completes),
    [chiffreDuModule(e.survie, "Manches survécues", "Manches survécues", completes)],
    [chiffreDuModule(e.ecartDegats, "Écart de dégâts / manche", "Écart de dégâts par manche", completes), chiffreDuModule(e.degatsRecus, "Dégâts reçus / manche", "Dégâts reçus par manche", completes)],
  ]
}

/** Le Chiffre de ta part de clutchs gagnés (clutchs().partGagnee, écrite comme sa tuile ; « — » : aucune situation de clutch). */
export function chiffreClutchs(c: Clutchs, completes: number): ChiffreDuels {
  return chiffreDuModule(c.partGagnee, "Clutchs gagnés", "Clutchs gagnés", completes, SANS_SITUATION)
}







export function barresClutchs(c: Clutchs): Barre[] {
  return c.detail.map((x): Barre => {
    const tete = `${x.libelle}, ${compte(x.situations, "situation")}`
    const voix = x.situations === 0 ? `${x.libelle} : aucune situation.`
      : x.valeur !== null ? `${tete} : ${x.texte} gagnés.`
      : `${tete} : ${nombreEnClair(x.gagnes, 0)} gagné${x.gagnes > 1 ? "s" : ""} sur ${nombreEnClair(x.situations, 0)}.`
    return { libelle: sansMauvaiseCoupure(effectifEnClair(x.libelle, x.situations)), valeur: x.texte, part: x.valeur, evaluation: x.evaluation, voix }
  })
}

/** La note des Clutchs : la raison d'un « — » s'il en paraît un ; aucune sinon. */
export function noteClutchs(c: Clutchs): string | null {
  return c.detail.some((x) => x.situations === 0) ? sansMauvaiseCoupure(NOTE_SANS_SITUATION) : null
}

/** Ce que dit VoiceOver de chaque compte des Multi-kills. */
const MULTI_KILLS_DITS: Readonly<Record<CleMultiKill, string>> = {
  deux: "Manches à exactement 2 kills", trois: "Manches à exactement 3 kills", quatre: "Manches à exactement 4 kills",
  cinq: "Manches à 5 kills et plus", aces: "Aces",
}


export function chiffresMultiKills(mk: MultiKills): ChiffreDuels[] {
  return mk.lignes.map((l): ChiffreDuels => ({
    cle: l.cle, libelle: l.libelle, valeur: l.texte, sousTexte: null, evaluation: "neutre", voix: `${MULTI_KILLS_DITS[l.cle]} : ${ditEnClair(l.texte)}.`,
  }))
}


export function noteMultiKills(mk: MultiKills, completes: number): string {
  const sur = surParties(mk.parties, completes)
  return sansMauvaiseCoupure(sur === null ? NOTE_MULTI : NOTE_MULTI.replace(" ou 5 et plus.", ` ou 5 et plus, ${sur}.`))
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`duels : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── blocs ───────────────────────────

/** Un texte en `corps` `texte-doux` : la phrase d'un bloc sans données (DESIGN.md, bloc : `vide`). */
function Phrase({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.corps} foregroundStyle={couleurs(env.colorSchemeContrast).texteDoux}>
          {texte}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/**
 * Bloc « Premiers duels » (maquette), coin bas, titre de bloc en capitales : 1ᵉʳˢ kills et 1ʳᵉˢ morts par manche sur une
 * rangée, le Ratio dessous sur toute la largeur. `vide` : la phrase à la place des Chiffres, titre gardé.
 */
function BlocPremiers({ chiffres, vide }: { chiffres: readonly ChiffreDuels[] | null; vide: string | null }) {
  return (
    <Bloc titre={TITRE_PREMIERS} coin="bas" vide={vide}>
      {chiffres !== null ? <GrilleChiffres chiffres={chiffres} /> : null}
    </Bloc>
  )
}

/**
 * Bloc « À quel moment tu meurs » (maquette ; EXPERIENCE.md, Histogramme, Sélecteur segmenté), coin haut, titre de section (en
 * capitales) : le Sélecteur du côté posé dans le bloc ; l'Histogramme de ce côté tel que le rend
 * histogrammeDesMorts (dominante orange, sa phrase VoiceOver) ; les Chiffres de ta première mort face à tes lobbys. Côté sans
 * mort : sa phrase à la place de l'Histogramme et des Chiffres.
 */
function BlocMoment({ cote, onCote, histogramme, moment }: {
  cote: Cote; onCote: (cote: Cote) => void; histogramme: HistogrammeDesMorts; moment: MomentDeTaMort
}) {
  const contenu: VirtualNode[] = histogramme.morts === 0
    ? [<Phrase key="sans-mort" texte={sansMort(cote)} />]
    : [
      <Histogramme key="histogramme" tranches={histogramme.tranches} phrase={histogramme.phrase} />,
      <GrilleChiffres key="moment" chiffres={chiffresMoment(moment)} />,
    ]
  return (
    <Bloc titre={TITRE_MOMENT} niveau="section" coin="haut">
      <SelecteurSegmente key="cote" segments={SEGMENTS_COTE} choisi={cote} onChoix={onCote} />
      {contenu}
    </Bloc>
  )
}

/**
 * La tête d'une liste de Ce qui te tue (maquette ; DESIGN.md, étiquette) : l'étiquette condensée, en capitales ou en casse de phrase
 * selon sa longueur (posée par l'écran), `texte-discret`, annoncée comme en-tête ; dessous, à 4, sa ligne de compte en note
 * `texte-discret`, s'il y en a une, sur autant de lignes qu'il faut.
 */
function TeteDeListe({ etiquette, capitales, ligne }: { etiquette: string; capitales: boolean; ligne: string | null }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack alignment="leading" spacing={ESPACES.segments} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text {...policeCondensee(TYPO.etiquette, capitales)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
              {sansMauvaiseCoupure(etiquette)}
            </Text>
            {ligne !== null ? (
              <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
                {ligne}
              </Text>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Le filet entre les deux listes de Ce qui te tue (maquette) : 1 point de `bordure`, toute la largeur, masqué à VoiceOver. */
function Filet() {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => <Rectangle fill={couleurs(env.colorSchemeContrast).bordure} frame={{ maxWidth: "infinity", height: 1 }} accessibilityHidden />}
    </EnvironmentValuesReader>
  )
}

/** Tes duels par agent adverse et les semaines qu'ils couvrent (agrégat `duels:agents`). */
export type DuelsParAgent = { lignes: DuelAgent[]; semaines: SemainesDesDuels }

/**
 * La phrase du mode Tout (phraseFilesDuTout), hors d'un Bloc, en tête de l'écran Duels : en corps `texte-doux`, toute la largeur,
 * sur autant de lignes qu'il faut.
 */
function LigneDuTout({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.corps} foregroundStyle={couleurs(env.colorSchemeContrast).texteDoux} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {texte}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/**
 * Bloc « Ce qui te tue » (maquette ; EXPERIENCE.md, Ce qui te tue ; Confidentialité), sans coin, titre de section : « Arme de
 * l'adversaire », sa ligne de compte (tes morts dont l'arme est connue, tes autres morts à part, les parties lues), une Barre par arme
 * ou capacité ; le filet ; « Tes duels gagnés, par agent adverse », la ligne des semaines et des parties des cumuls, une Barre par
 * agent ; la note « Moyennes par arme et par agent, jamais par joueur. ». Sans arme connue ou sans duel : la phrase à la place des
 * Barres. Une moitié dont le calcul a levé (null) est retirée.
 */
function BlocTue({ tue, agents, parties }: { tue: CeQuiTeTue | null; agents: DuelsParAgent | null; parties: PartiesDesBlocs }) {
  const contenu: VirtualNode[] = []
  if (tue !== null) {
    const barres = barresArmes(tue)
    const phrase = phraseArmes(tue, parties.avecKills, parties.completes)
    contenu.push(<TeteDeListe key="armes" etiquette={ETIQUETTE_ARMES} capitales={ETIQUETTE_ARMES_EN_CAPITALES} ligne={barres.length > 0 ? phrase : null} />)
    contenu.push(barres.length > 0 ? <Barres key="barres-armes" barres={barres} /> : <Phrase key="sans-arme" texte={phrase} />)
  }
  if (agents !== null) {
    if (contenu.length > 0) contenu.push(<Filet key="filet" />)
    const barres = barresAgents(agents.lignes)
    contenu.push(<TeteDeListe key="agents" etiquette={ETIQUETTE_AGENTS} capitales={ETIQUETTE_AGENTS_EN_CAPITALES} ligne={barres.length > 0 ? phraseSemaines(agents.semaines) : null} />)
    contenu.push(barres.length > 0 ? <Barres key="barres-agents" barres={barres} /> : <Phrase key="sans-agent" texte={AUCUN_DUEL_AGENT} />)
  }
  return (
    <Bloc titre={TITRE_TUE} niveau="section" note={NOTE_CE_QUI_TE_TUE}>
      {contenu}
    </Bloc>
  )
}

/** Un Chiffre du module d'analyse tel qu'il s'affiche : son sous-texte coupé seulement entre les mots ; sa voix telle quelle. */
function chiffreAffiche(c: ChiffreDuels): ChiffreDuels {
  return { ...c, sousTexte: c.sousTexte === null ? null : sansMauvaiseCoupure(c.sousTexte) }
}

/**
 * Bloc « Comment tu meurs » (maquette ; entrée 5 de epic-stats-analyses, analyse 5), coin haut, titre de section : tes morts isolées et
 * tes morts vengées (deux Chiffres) ; « Vengées selon ton isolement » (deux Barres, isolées puis non isolées) ; la note (méthodes,
 * retraits, effectif). Le regard de la maquette n'y est pas (aucune source ne le donne). Sans mort par un adversaire : sa phrase à la
 * place, titre et note gardés. Étiquette en casse de phrase (plus de trois mots).
 */
function BlocCommentTuMeurs({ r }: { r: CommentTuMeurs }) {
  const note = r.note === null ? undefined : sansMauvaiseCoupure(r.note)
  if (r.vide !== null) return <Bloc titre={TITRE_COMMENT_TU_MEURS} niveau="section" coin="haut" vide={r.vide} note={note} />
  const contenu: VirtualNode[] = [<GrilleChiffres key="chiffres" chiffres={r.chiffres.map(chiffreAffiche)} />]
  if (r.barresVengees.length > 0) {
    contenu.push(<TeteDeListe key="vengees" etiquette={ETIQUETTE_VENGEES} capitales={ETIQUETTE_VENGEES_EN_CAPITALES} ligne={null} />)
    contenu.push(<Barres key="barres-vengees" barres={r.barresVengees.map((b) => ({ ...b, libelle: sansMauvaiseCoupure(b.libelle) }))} />)
  }
  return (
    <Bloc titre={TITRE_COMMENT_TU_MEURS} niveau="section" coin="haut" note={note}>
      {contenu}
    </Bloc>
  )
}






function BlocEtats({ e }: { e: Etats }) {
  return (
    <Bloc titre={TITRE_ETATS} coin="bas" note={sansMauvaiseCoupure(noteEtats(e))}>
      <GrilleChiffres chiffres={chiffresEtats(e, ditEnClair).map(chiffreAffiche)} />
    </Bloc>
  )
}

/**
 * Bloc « Échanges et survie » (maquette), coin bas, titre de bloc : tes échanges (« Tu venges », « Tes alliés vengent »), tes manches
 * survécues sur toute la largeur, ton écart de dégâts et tes dégâts reçus par manche ; la note (5 s, aucune référence).
 */
function BlocEchanges({ echanges, completes }: { echanges: EchangesEtSurvie; completes: number }) {
  return (
    <Bloc titre={TITRE_ECHANGES} coin="bas" note={sansMauvaiseCoupure(NOTE_ECHANGES)}>
      <GrilleChiffres groupes={groupesEchanges(echanges, completes)} />
    </Bloc>
  )
}

/**
 * Bloc « Clutchs » (maquette), sans coin, titre de bloc : ta part gagnée face à tes lobbys, sur toute la largeur, puis une Barre de
 * 1 contre 1 à 1 contre 4 et plus ; la raison d'un « — » en note. Sans partie à manches lue : sa phrase à la place.
 */
function BlocClutchs({ c, completes }: { c: Clutchs; completes: number }) {
  if (c.partGagnee.sommes.parties === 0) return <Bloc titre={TITRE_CLUTCHS} vide={SANS_MANCHE_PHRASE} />
  const note = noteClutchs(c)
  return (
    <Bloc titre={TITRE_CLUTCHS} note={note ?? undefined}>
      <GrilleChiffres chiffres={[chiffreClutchs(c, completes)]} />
      <Barres barres={barresClutchs(c)} />
    </Bloc>
  )
}

/**
 * Bloc « Multi-kills » (maquette), coin bas, titre de bloc : cinq Chiffres en deux colonnes, l'Ace seul sur sa rangée ; la note, et
 * ses parties lues si elles diffèrent. Sans partie à manches lue : sa phrase à la place.
 */
function BlocMultiKills({ mk, completes }: { mk: MultiKills; completes: number }) {
  if (mk.parties === 0) return <Bloc titre={TITRE_MULTI} coin="bas" vide={SANS_MANCHE_PHRASE} />
  return (
    <Bloc titre={TITRE_MULTI} coin="bas" note={noteMultiKills(mk, completes)}>
      <GrilleChiffres chiffres={chiffresMultiKills(mk)} />
    </Bloc>
  )
}

/** Bloc « Premiers duels par carte » (maquette), sans coin, titre de bloc (en capitales) : une Barre par carte, la note dessous. */
function BlocCartes({ lignes }: { lignes: readonly PremiersDuelsCarte[] }) {
  return (
    <Bloc titre={TITRE_CARTES} note={noteCartes(lignes)}>
      <Barres barres={barresCartes(lignes)} />
    </Bloc>
  )
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Duels dans son emplacement (PropsEmplacement de app.tsx) : le côté choisi, seul état (Attaque, à chaque ouverture : l'emplacement
 * est remonté ; gardé au changement de périmètre) ; le mode et la période, ceux du périmètre commun. Une pile à 14, sur la
 * sélection du périmètre : en mode Tout, quand une partie de la période n'est pas d'une file complète, la phrase des files
 * (phraseFilesDuTout) ; Premiers duels ; À quel moment tu meurs ; Ce qui te tue (tes duels par agent adverse dans les cumuls par agent
 * tenus, `donnees.cumuls`, leurs semaines comptées dans tout l'historique tenu, `donnees.parties`) ; Comment tu meurs ; À 4 contre 5,
 * à 5 contre 4 ; Échanges et survie ; Clutchs ;
 * Multi-kills ; Premiers duels par carte, s'il y a une carte. Période sans partie : Premiers duels seul, avec la phrase
 * du mode ; des parties, aucune des files complètes : sa phrase. Calculs gardés une fois par périmètre et par données (`agregat`),
 * un calcul qui lève retirant son bloc ; sans sélection, rien. Ni lecture, ni requête, ni écriture.
 */
export function Duels({ donnees, perimetre }: PropsEmplacement) {
  const [cote, setCote] = useState<Cote>(COTE_DEFAUT)
  const sel = perimetre.selection
  const blocs: VirtualNode[] = []
  if (sel !== null) {
    if (sel.parties.length === 0) {
      blocs.push(<BlocPremiers key="premiers" chiffres={null} vide={SANS_PARTIE[perimetre.perimetre.mode]} />)
    } else {
      // Les parties des blocs d'abord : en mode Tout, la phrase des files se pose en tête de l'écran, avant Premiers duels.
      const parties = perimetre.agregat("duels:parties", (s) => attraper("parties des blocs", () => partiesDesBlocs(s)))
      const tout = parties === null ? null : phraseFilesDuTout(parties)
      if (tout !== null) blocs.push(<LigneDuTout key="tout" texte={tout} />)
      const premiers = perimetre.agregat("duels:premiers", (s) => attraper("premiers duels", () => ({
        completes: retenues(s.parties, "completes").length, chiffres: premiersDuels(s),
      })))
      if (premiers !== null && premiers.completes === 0) {
        blocs.push(<BlocPremiers key="premiers" chiffres={null} vide={SANS_DUEL} />)
      } else {
        if (premiers !== null) blocs.push(<BlocPremiers key="premiers" chiffres={premiers.chiffres} vide={null} />)
        const histogramme = perimetre.agregat(`duels:histogramme:${cote}`, (s) => attraper("histogramme", () => histogrammeDesMorts(s, cote)))
        const moment = perimetre.agregat(`duels:moment:${cote}`, (s) => attraper("moment de ta mort", () => momentDeTaMort(s, cote)))
        if (histogramme !== null && moment !== null) {
          blocs.push(<BlocMoment key="moment" cote={cote} onCote={(k) => setCote(k)} histogramme={histogramme} moment={moment} />)
        }
        if (parties !== null) {
          const tue = perimetre.agregat("duels:tue", (s) => attraper("ce qui te tue", () => ceQuiTeTue(s)))
          const agents = perimetre.agregat("duels:agents", (s) => attraper("duels par agent adverse", (): DuelsParAgent => ({
            lignes: duelsParAgentAdverse(s, donnees.cumuls), semaines: semainesDesDuels(s, donnees.parties, donnees.cumuls),
          })))
          if (tue !== null || agents !== null) blocs.push(<BlocTue key="tue" tue={tue} agents={agents} parties={parties} />)
          // Entrée 5 de epic-stats-analyses : comment tu meurs, puis à 4 contre 5 et à 5 contre 4 (analyses-duels.ts).
          const morts = perimetre.agregat("duels:morts", (s) => attraper("comment tu meurs", () => commentTuMeurs(s)))
          if (morts !== null) blocs.push(<BlocCommentTuMeurs key="morts" r={morts} />)
          const etats = perimetre.agregat("duels:etats", (s) => attraper("4 contre 5", () => etatsApresPremiereMort(s)))
          if (etats !== null) blocs.push(<BlocEtats key="etats" e={etats} />)
          const echanges = perimetre.agregat("duels:echanges", (s) => attraper("échanges et survie", () => echangesEtSurvie(s)))
          if (echanges !== null) blocs.push(<BlocEchanges key="echanges" echanges={echanges} completes={parties.completes} />)
          const lesClutchs = perimetre.agregat("duels:clutchs", (s) => attraper("clutchs", () => clutchs(s)))
          if (lesClutchs !== null) blocs.push(<BlocClutchs key="clutchs" c={lesClutchs} completes={parties.completes} />)
          const mk = perimetre.agregat("duels:multikills", (s) => attraper("multi-kills", () => multiKills(s)))
          if (mk !== null) blocs.push(<BlocMultiKills key="multikills" mk={mk} completes={parties.completes} />)
        }
        const cartes = perimetre.agregat("duels:cartes", (s) => attraper("premiers duels par carte", () => premiersDuelsParCarte(s)))
        if (cartes !== null && cartes.length > 0) blocs.push(<BlocCartes key="cartes" lignes={cartes} />)
        // Entrée 11 de epic-stats-analyses : ce que chaque agent adverse te fait, en dernier (agents-adverses.tsx).
        const agentsAdverses = perimetre.agregat("duels:agents-adverses", (s) => attraper("agents adverses", () => agentsAdversesDeLaPeriode(s)))
        if (agentsAdverses !== null) blocs.push(<BlocAgentsAdverses key="agents-adverses" r={agentsAdverses} />)
      }
    }
  }
  return (
    <PileDeBlocs>
      {blocs}
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Duels dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_DUELS: Emplacement = Duels
