// Récap pour ton coach IA (epic-stats-recap, entrée 1) : la sélection du récap (période demandée Semaine, Mois, Acte ou
// Autre ; mode Compétition ou Tout ; période couverte, bornée par ta première partie gardée ; période précédente), les
// 13 cases de la maquette Recap, le plan des sections du document (EXPERIENCE.md, Structure du récap texte), son cadre
// (titre, citation, consigne au coach, pied), ses règles de forme (une phrase avant chaque tableau, 4 colonnes au plus,
// donnée manquante dite en une ligne) et le nom du fichier. Entrée 2 : les sections 4 à 6 (Contexte, Note de performance de
// Valorant, Synthèse face à tes lobbys et à ta période précédente). Entrée 3 : les sections 7 à 9 (Tendances et rang ; Seul ou
// en duo, heures et sessions ; Par agent). Entrée 4 : les sections 10 à 13 (Par carte ; Où et quand je meurs ; Attaque, défense
// et retakes ; Duels). Entrée 5 : les sections 14 à 16 (Économie ; Armes et visée ; Visée à l'entraînement (deathmatch)). Entrée 6 :
// les sections 17 et 18 (Ce que disent mes chiffres ; Questions pour toi, coach), sur les Constats de l'entrée 4.12. Entrée 8 de
// epic-stats-analyses : les analyses d'entraînement dans les sections 8, 10 à 13 et 15, après leur contenu, sous leur case (bloc
// « analyses d'entraînement », avant les cases).
//
// Interface, que gardent les entrées 7 à 9 (sous-onglet Récap) : selectionnerRecap(données, demande, now) donne la
// sélection ; genererRecap(sélection, cases cochées, date) donne { nom, texte } ; CASES_RECAP, la liste des cases. Les
// entrées 2 à 6 l'étendent : chacune pose l'écriture de ses sections dans SECTIONS_RECAP, avec les fonctions du module
// des métriques sur `metriques` (la sélection de metriques.ts) et sur `donnees`. Entrée 9 (Aperçu du récap) :
// debutDuRecap(sélection, cases cochées, date, caractères) donne le début du même document, sans écrire les sections qui
// viennent après, et debutDuTexte la même coupe d'un texte.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni horloge (l'heure arrive en
// paramètre), pour tourner tel quel sous `node --test` (spike-s0/tests/ ; tests/resoudre-ts.ts y résout l'import sans
// extension de ./metriques). Il lit le module des métriques sans le modifier : mêmes périodes, mêmes parties, mêmes
// formats que l'onglet Stats. Le document ne contient aucun identifiant : des dates, des comptes, des actes et ses
// phrases ; il ne vit que le temps de la feuille de partage (entrée 8).

import type { Cote, CumulAgent, Partie, Saison } from "./reduction"
import { traduire } from "./langue"
import type { Acte, LigneRr, Rang } from "./historique"
import type { Ressources, SectionArmes } from "./ressources"
import {
  CHIFFRES_CLES, CLUTCHS, ECOS_GAGNEES, ECRITURE_SESSION, FILES_CAPACITES, MIN_OCCURRENCES, MIN_PARTIES_ECART_NOTE, MIN_PARTIES_FICHE, MIN_PARTIES_GROUPE,
  MIN_PARTIES_GROUPE_DE_3, MIN_PARTIES_HEURES, NOTE, PALIER_MIN, PARTIES_BARRES_RR, PARTIES_COURBE_NOTE, PARTIES_TENDANCE,
  PAS_ENCORE_CLASSE, PREMIER_EPISODE_ESCALIER, PREMIERS_KILLS, RETAKES, STATS_EVOLUTION, TIRET, VICTOIRES,
  acteEnClair, acteEnCours, actePrecedent, additionner, agentsJoues, barresRr, capacitesAgent, cartesJouees, categorieDeGroupe, comparer,
  cumulsDeLAgent, cumulsDuPerimetre,
  ecartEcrit, ecartEnClair, ecritureDe, escalierDuRang, ficheAgent, fractions, mentionDe, niveauReel, nomDuPalier, nombreEnClair, partEnClair, partiesCourbeNote,
  quandTuJouesLeMieux, quotient, retenues, selectionner, seulOuEnDuo, sommer, sommerGroupe, tendance, tendances, tuile, valeurEnClair,
  type AgentJoue, type BarreGroupe, type ChiffreAgent, type ChiffreCle, type CleChiffre, type CleChiffreAgent, type CleGroupe, type Comparaison, type Ecriture,
  type CleTendance, type FicheAgent, type LigneTendance, type MarcheEscalier, type Mode, type NiveauReel, type Periode, type QuandTuJoues,
  type Selection, type Sommes, type Stat, type Tuile, type ValeurCategorie,
} from "./metriques"
// Cartes, morts, côtés et duels (entrée 4) : les métriques des entrées 4.7 à 4.9.
import {
  COTES, ECRITURE_SECONDES, LIBELLES_TRANCHES_MORT, NOTE_CE_QUI_TE_TUE, PREMIERES_MORTS, RATIO_PREMIERS_DUELS, STATS_COTES, STATS_DU_COTE,
  apresLaPose, ceQuiTeTue, clutchs, duelsParAgentAdverse, echangesEtSurvie, ficheCarte, histogrammeDesMorts, manchesParCote,
  momentDeTaMort, multiKills, planDeCarte, premiersDuelsParCarte, premiersDuelsParCote, toutesTesCartes, victoiresParCarte,
  cleCarte, effectifEnClair, partiesDeLaCarte, semaineDe,
  type CarteJouee, type ChiffreCote, type ChiffreDuel, type CleCote, type MomentDeTaMort, type PlanDeCarte, type ZoneComptee,
} from "./metriques"
// Économie, armes et visée (entrée 5) : les métriques des entrées 4.10 et 4.11.
import {
  ACHATS_FACE_AUX_LOBBYS, KILLS_CAPACITES, MIN_KILLS_ARME, MIN_KILLS_DISTANCE, POURCENTAGE, SEMAINES_VISEE, STATS_DEPENSES,
  DEPENSE_POCHE, achatsParType, apresUnPistoletPerdu, depensePoche, depenses, distanceDesKills, fileAdmise, killsParArme, manchesMarquantes, partieRefaite,
  teteCorpsJambesParArme, viseeALEntrainement, zonesTouchees,
  type BlocZones, type ChiffreDepense, type ChiffrePoche, type RaisonPoche, type CleDepense, type RaisonDepense, type DistanceArme, type LigneAchat, type SerieVisee, type TeteParArme,
} from "./metriques"
// Points forts, points à travailler et questions (entrée 6) : les Constats de l'entrée 4.12.
import {
  FACTEUR_ERREUR_TYPE, MIN_PARTIES_COULEUR, candidatsConstats, constatsRecap,
  type ConstatTire, type FamilleConstat, type GenreDuConstat, type OptionsConstats, type SourcesConstats,
} from "./metriques"
// Ce qu'est une zone (ticket 4.48) : la formule des analyses de Cartes (6.6), une seule constante.
import { ZONE_LA_PLUS_PROCHE } from "./analyses-cartes"
// Les analyses d'entraînement (epic-stats-analyses, entrée 8) : les modules des entrées 2 à 7 et 11, lus sans être modifiés.
import { RATIO } from "./metriques"
import {
  DISTANCE_LOIN, DISTANCE_PRES, MIN_CAS_ANALYSE, PEU_DE_DONNEES, TRANCHES_DISTANCE, chiffreDAnalyse,
  type ChiffreAnalyse, type ChiffreDEquipe, type CleTrancheDistance, type EffectifAnalyse, type ReferenceDEquipe,
} from "./analyses"
import {
  GROSSES_ARMES_DITES, NOTE_ARME_RAMASSEE, armeRamassee, duelsSelonLaDistance, effectifArmeEtFusil, fusilPerdu, sansCategories, teteSelonLaDistance,
  type ArmeRamassee, type FusilPerdu, type TeteDUneTranche,
} from "./analyses-armes"
import { NOTE_ISOLEE, NOTE_VENGEE, commentTuMeurs, etatsApresPremiereMort } from "./analyses-duels"
import {
  METHODE_DEFENSE, METHODE_PREMIERS_DUELS, SPIKE_LOIN, SPIKE_PRES, TRANCHES_SPIKE, analysesDeCarte,
  type AnalysesDeCarte, type CleTrancheSpike, type PositionsEnDefense, type PremiersDuels,
} from "./analyses-cartes"
import {
  CLES_COMPO, CLES_RANG, METHODE_COMPO, METHODE_COTE, METHODE_RANG, compoEnClair, conditionsDeVictoire,
  type CleCompo, type CleRang,
} from "./analyses-evolution"
import { agentsAdversesDeLaPeriode, type AgentsDeLaPeriode } from "./analyses-agents"

// ─────────────────────────── demande et données ───────────────────────────

/** Période du Récap (EXPERIENCE.md, Sélecteur segmenté) : Semaine et Mois glissants, l'acte en cours, ou deux dates (« Autre »). */
export type PeriodeRecap = "semaine" | "mois" | "acte" | "autre"
/** Mode du Récap, sous sa période : Compétition, par défaut, ou Tout (toutes les files, chaque stat gardant ses files admises). */
export type ModeRecap = Extract<Mode, "competition" | "tout">

/** Ce que demande l'écran : la période et le mode ; Autre, ses deux dates (valeurs des DatePicker « Du » et « Au », en ms), incluses. */
export type DemandeRecap =
  | { periode: "semaine" | "mois" | "acte"; mode: ModeRecap }
  | { periode: "autre"; mode: ModeRecap; du: number; au: number }

/** Le Récap à l'ouverture : Mois, Compétition (EXPERIENCE.md, Sélecteur segmenté). */
export const DEMANDE_DEFAUT: DemandeRecap = { periode: "mois", mode: "competition" }
export const LIBELLES_PERIODE_RECAP: Readonly<Record<PeriodeRecap, string>> = { semaine: "Semaine", mois: "Mois", acte: "Acte", autre: "Autre" }
export const LIBELLES_MODE_RECAP: Readonly<Record<ModeRecap, string>> = { competition: "Compétition", tout: "Tout" }

/**
 * Les données lues une fois par l'onglet Stats (DonneesTableau de collecte.ts, que l'écran passe telles quelles) : parties
 * gardées, cumuls par agent, RR, rang et ressources. La sélection ne lit que les parties ; les sections des entrées 2 à 6
 * y prennent le reste (rang, RR, cumuls des mêmes agents, zones des cartes).
 */
export type DonneesRecap = {
  parties: readonly Partie[]
  cumuls: readonly CumulAgent[]
  rr: readonly LigneRr[]
  rang: Rang | null
  ressources: Ressources
}

// ─────────────────────────── jours ───────────────────────────

const JOUR_MS = 86_400_000

/** Une période en jours inclus, à l'heure de l'iPhone : « AAAA-MM-JJ » (deux jours se comparent comme deux chaînes). */
export type Jours = { debut: string; fin: string }


export function jourDe(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Minuit du jour de `ms`, décalé de `decalage` jours, à l'heure de l'iPhone (un jour de changement d'heure compte 23 ou 25 h). */
function minuit(ms: number, decalage: number = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + decalage).getTime()
}

/** Le nombre de jours de `du` à `au` inclus (`du` au plus tard le jour de `au`). */
function nombreDeJours(du: number, au: number): number {
  return Math.round((minuit(au, 1) - minuit(du)) / JOUR_MS)
}

/** L'instant du début d'une partie (ms) ; NaN s'il est illisible : elle n'entre alors dans aucune période datée. */
function instant(p: Partie): number {
  return Date.parse(p.debut)
}

/** La plus ancienne de ces parties au début lisible ; null sans elle. */
function plusAncienne(parties: readonly Partie[]): Partie | null {
  let ancienne: Partie | null = null
  for (const p of parties) if (instant(p) < (ancienne === null ? Infinity : instant(ancienne))) ancienne = p
  return ancienne
}

const MOIS: readonly string[] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


export function jourEnClair(jour: string, annee: boolean = true): string {
  const [a, m, j] = jour.split("-").map(Number)
  return `${j === 1 ? "1\u1d49\u02b3" : String(j)} ${MOIS[m - 1]}${annee ? ` ${a}` : ""}`
}






export function periodeEnClair(p: Jours): string {
  if (p.debut === p.fin) return `le ${jourEnClair(p.fin)}`
  return `du ${jourEnClair(p.debut, p.debut.slice(0, 4) !== p.fin.slice(0, 4))} au ${jourEnClair(p.fin)}`
}

// ─────────────────────────── sélection ───────────────────────────

/**
 * Le récap sélectionné (EXPERIENCE.md, Structure du récap texte, Règles ; State Patterns, Période antérieure à la première
 * partie gardée). `metriques` est la sélection du module des métriques, que lisent les sections : parties de la période
 * (mode appliqué, refaites écartées, la plus récente d'abord) et parties de sa période précédente.
 */
export type SelectionRecap = {
  /** La demande de l'écran ; Autre : ses deux dates remises dans l'ordre. */
  demande: DemandeRecap
  /** La période demandée, gardée pour le document (Contexte, phrase d'une période qui commence avant l'historique). */
  demandee: Jours
  /**
   * La période couverte, celle du titre et du nom : la demandée, partant de ta première partie gardée quand elle commence
   * avant, finissant au plus tard aujourd'hui ; null sans partie gardée, sans acte (Acte), ou vide.
   */
  couverte: Jours | null
  /** La période demandée commence avant ta première partie gardée (Acte : l'historique commence dans l'acte) ; le document le dit. */
  avantPremiere: boolean
  /** Le jour de ta première partie gardée : tout l'historique, toutes files, refaites écartées ; null sans partie. */
  premiere: string | null
  /** Acte : l'acte en cours (acteEnCours) et l'acte juste avant (actePrecedent) ; null sinon, ou sans eux. */
  acte: Saison | null
  actePrecedent: Saison | null
  /** La sélection de metriques.ts ; Autre : périmètre « tout » (aucun libellé « vs … d'avant »), parties et précédentes des dates. */
  metriques: Selection
  /** Les données reçues, pour les sections des entrées 2 à 6. */
  donnees: DonneesRecap
}

/** Semaine et Mois : les périodes du périmètre commun, 7 et 30 jours glissants jusqu'à `now`. */
const DUREE_JOURS: Readonly<Record<"semaine" | "mois", number>> = { semaine: 7, mois: 30 }
const PERIODE_METRIQUES: Readonly<Record<"semaine" | "mois", Periode>> = { semaine: "7j", mois: "30j" }

/** Un acte se reconnaît à son id, à son nom court s'il n'a pas d'id (comme cleActe de metriques.ts, privée). */
function cleActe(s: Saison): string {
  return s.id || s.short
}

/** Cette partie est-elle de cet acte ? */
function deLActe(p: Partie, acte: Saison): boolean {
  return p.saison != null && cleActe(p.saison) === cleActe(acte)
}

/** Ce que fixe chaque période ; la période couverte en découle ensuite, par les mêmes règles pour toutes. */
type Base = { demande: DemandeRecap; demandee: Jours; metriques: Selection; acte: Saison | null; actePrecedent: Saison | null; avant: boolean }


function glissante(donnees: DonneesRecap, periode: "semaine" | "mois", mode: ModeRecap, now: number, premiere: string | null): Base {
  const demandee = { debut: jourDe(now - DUREE_JOURS[periode] * JOUR_MS), fin: jourDe(now) }
  return {
    demande: { periode, mode },
    demandee,
    metriques: selectionner(donnees.parties, { mode, periode: PERIODE_METRIQUES[periode] }, now),
    acte: null,
    actePrecedent: null,
    avant: premiere !== null && demandee.debut < premiere,
  }
}

/**
 * Acte : la sélection du périmètre « Acte » (l'acte de ta partie la plus récente, toutes files, et l'acte juste avant),
 * du jour de la première partie gardée de l'acte, toutes files, au jour de `now` ; son début n'étant pas connu, la période
 * commence avant ta première partie gardée quand l'historique commence dans l'acte.
 */
function acteDuRecap(donnees: DonneesRecap, mode: ModeRecap, now: number, gardees: readonly Partie[], ancienne: Partie | null): Base {
  const acte = acteEnCours(gardees)
  const premiereDeLActe = acte === null ? null : plusAncienne(gardees.filter((p) => deLActe(p, acte)))
  return {
    demande: { periode: "acte", mode },
    demandee: { debut: jourDe(premiereDeLActe === null ? now : instant(premiereDeLActe)), fin: jourDe(now) },
    metriques: selectionner(donnees.parties, { mode, periode: "acte" }, now),
    acte,
    actePrecedent: acte === null ? null : actePrecedent(gardees, acte),
    avant: acte !== null && ancienne !== null && deLActe(ancienne, acte),
  }
}

/**
 * Autre : les parties gardées du mode dont le début tombe dans les jours de `du` à `au` inclus (remis dans l'ordre ; une
 * date illisible vaut `now`), et la période précédente, autant de jours juste avant `du`. Le périmètre des métriques n'a
 * pas de dates libres : « tout » n'y sert qu'aux libellés des écarts, qui restent sans « vs … d'avant ».
 */
function datesLibres(donnees: DonneesRecap, mode: ModeRecap, x: number, y: number, now: number, premiere: string | null): Base {
  const a = Number.isFinite(x) ? x : now, b = Number.isFinite(y) ? y : now
  const [du, au] = minuit(a) <= minuit(b) ? [a, b] : [b, a]
  const debut = minuit(du), fin = minuit(au, 1), debutAvant = minuit(du, -nombreDeJours(du, au))
  const duMode = selectionner(donnees.parties, { mode, periode: "tout" }, now).parties
  const entre = (de: number, jusqua: number) => duMode.filter((p) => instant(p) >= de && instant(p) < jusqua)
  const demandee = { debut: jourDe(du), fin: jourDe(au) }
  return {
    demande: { periode: "autre", mode, du, au },
    demandee,
    metriques: { perimetre: { mode, periode: "tout" }, parties: entre(debut, fin), precedentes: entre(debutAvant, debut) },
    acte: null,
    actePrecedent: null,
    avant: premiere !== null && demandee.debut < premiere,
  }
}






export function selectionnerRecap(donnees: DonneesRecap, demande: DemandeRecap, now: number): SelectionRecap {
  const gardees = selectionner(donnees.parties, { mode: "tout", periode: "tout" }, now).parties
  const ancienne = plusAncienne(gardees)
  const premiere = ancienne === null ? null : jourDe(instant(ancienne))
  const base =
    demande.periode === "autre" ? datesLibres(donnees, demande.mode, demande.du, demande.au, now, premiere)
    : demande.periode === "acte" ? acteDuRecap(donnees, demande.mode, now, gardees, ancienne)
    : glissante(donnees, demande.periode, demande.mode, now, premiere)
  const aujourdhui = jourDe(now)
  const debut = premiere !== null && premiere > base.demandee.debut ? premiere : base.demandee.debut
  const fin = base.demandee.fin < aujourdhui ? base.demandee.fin : aujourdhui
  const vide = premiere === null || (base.demande.periode === "acte" && base.acte === null) || debut > fin
  const couverte = vide ? null : { debut, fin }
  return {
    demande: base.demande,
    demandee: base.demandee,
    couverte,
    avantPremiere: couverte !== null && base.avant,
    premiere,
    acte: base.acte,
    actePrecedent: base.actePrecedent,
    metriques: base.metriques,
    donnees,
  }
}

// ─────────────────────────── périodes en clair ───────────────────────────

/** La période du titre et du nom : la couverte, sinon la demandée. */
export function periodeDuRecap(sel: SelectionRecap): Jours {
  return sel.couverte ?? sel.demandee
}


function nomDeLActe(s: Saison | null): string | null {
  return s === null ? null : acteEnClair(s.short)?.libelle ?? null
}





export function demandeeEnClair(sel: SelectionRecap): string {
  switch (sel.demande.periode) {
    case "semaine":
      return `la semaine, ${periodeEnClair(sel.demandee)}`
    case "mois":
      return `le mois, ${periodeEnClair(sel.demandee)}`
    case "acte": {
      const nom = nomDeLActe(sel.acte)
      return nom === null ? "l'acte en cours" : `l'acte en cours, ${nom}`
    }
    case "autre":
      return periodeEnClair(sel.demandee)
  }
}





export function precedenteEnClair(sel: SelectionRecap): string {
  const d = sel.demande
  switch (d.periode) {
    case "semaine":
      return "la semaine d'avant"
    case "mois":
      return "le mois d'avant"
    case "acte": {
      const nom = nomDeLActe(sel.actePrecedent)
      return nom === null ? "l'acte d'avant" : `l'acte d'avant, ${nom}`
    }
    case "autre": {
      const n = nombreDeJours(d.du, d.au)
      return n === 1 ? "le jour d'avant" : `les ${nombreEnClair(n, 0)} jours d'avant`
    }
  }
}


export function partiesDuRecap(sel: SelectionRecap): string {
  const n = sel.metriques.parties.length
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}${sel.demande.mode === "competition" ? " de compétition" : ""}`
}

// ─────────────────────────── cadre ───────────────────────────

/** La citation sous le titre (section 2). */
export const CITATION = "Document généré par ValShop sur l'iPhone, à partir des parties gardées."
/** La phrase de confidentialité du pied (section 19). */
export const PHRASE_CONFIDENTIALITE = "Aucune donnée nominative d'un autre joueur : seulement les moyennes de mes lobbys."
/** Ce que dit une section cochée qui n'a rien écrit : une donnée manquante n'est jamais omise en silence. */
export const AUCUNE_DONNEE = "Aucune donnée sur cette période."

/** Section 3, la consigne au coach : celle de l'exemple, la consigne 3 citant aussi ta période précédente (EXPERIENCE.md, Règles). */
function consigne(sel: SelectionRecap): string[] {
  return [
    "Tu es mon coach Valorant. À partir de ces stats :",
    "1. donne-moi mes trois priorités d'entraînement, chacune avec un exercice concret ;",
    "2. dis-moi ce que je dois arrêter de faire en partie ;",
    `3. appuie-toi sur les écarts avec mes lobbys et avec ma période précédente (${precedenteEnClair(sel)}) plutôt que sur les chiffres bruts ;`,
    "4. utilise les zones et les moments où je meurs pour expliquer mes erreurs de placement.",
  ]
}

/** Le pied (section 19) : date de génération, parties du récap et leur mode, phrase de confidentialité. */
function pied(sel: SelectionRecap, date: number, parAgent: boolean = false): string {
  const n = sel.metriques.parties.length
  const tous = sel.demande.mode === "tout" ? ", tous modes confondus" : ""
  return `Généré par ValShop le ${jourEnClair(jourDe(date))}, à partir de ${partiesDuRecap(sel)} gardée${n > 1 ? "s" : ""} sur l'iPhone${tous}. ${parAgent ? PHRASE_CONFIDENTIALITE_AGENTS : PHRASE_CONFIDENTIALITE}`
}

// ─────────────────────────── contexte, note et synthèse (entrée 2) ───────────────────────────
//
// Sections 4 à 6 (EXPERIENCE.md, Structure du récap texte, lignes 4 à 6), sur la sélection du récap, par les fonctions du module
// des métriques : chaque chiffre est celui de l'onglet pour la même sélection (tuiles de la Vue d'ensemble, Ton niveau réel, Seul
// ou en duo, puces d'Agents et de Cartes), à ses formats ; un groupe ne sert de référence que dès 5 parties (comparer, niveauReel) ;
// une donnée manquante est dite en une ligne ; aucun identifiant, aucune valeur d'un autre joueur.


const NBSP = "\u00a0"


function demandeeCourte(sel: SelectionRecap): string {
  switch (sel.demande.periode) {
    case "semaine":
      return "la semaine"
    case "mois":
      return "le mois"
    case "acte":
      return demandeeEnClair(sel)
    case "autre":
      return "les mêmes dates"
  }
}

/** La période couverte, puis la demandée : celle-ci en peu de mots quand elles sont égales, en entier sinon. */
function lignePeriode(sel: SelectionRecap): string {
  const c = sel.couverte
  if (c === null) return `- Période couverte : aucune partie gardée dans la période demandée (${demandeeEnClair(sel)})`
  const egale = c.debut === sel.demandee.debut && c.fin === sel.demandee.fin
  return `- Période couverte : ${periodeEnClair(c)} (période demandée : ${egale ? demandeeCourte(sel) : demandeeEnClair(sel)})`
}

/** Un chiffre clé de la Vue d'ensemble, par sa clé. */
function chiffreCle(cle: CleChiffre): ChiffreCle {
  return CHIFFRES_CLES.find((c) => c.cle === cle)!
}


const GROUPES_DITS: Readonly<Record<CleGroupe, string>> = { seul: "seul", duo: "en duo", groupe: "en groupe de 3 et plus" }

/**
 * Tes parties, puis la valeur et l'effectif de la tuile Victoires (files complètes, nuls au dénominateur), puis les barres de Seul
 * ou en duo et leurs effectifs, le groupe de 3 et plus quand l'onglet le montre ; sans partie, « aucune ».
 */
function ligneParties(sel: SelectionRecap): string {
  const m = sel.metriques
  const competition = sel.demande.mode === "competition"
  if (m.parties.length === 0) return `- Parties : aucune${competition ? " en compétition" : ""}`
  const v = tuile(m, chiffreCle("victoires"))
  const victoires = v.effectif === null ? `victoires : ${TIRET}` : `${v.valeur} de victoires ${v.effectif}`
  const groupes = seulOuEnDuo(m).map((b) => `${nombreEnClair(b.victoires.parties, 0)} ${GROUPES_DITS[b.cle]}`).join(", ")
  return `- Parties : ${nombreEnClair(m.parties.length, 0)}${competition ? " en compétition" : ", tous modes confondus"} ; ${victoires} ; ${groupes}`
}


function palierDeLaPartie(p: Partie): string {
  const id = p.rang?.id
  const nom = nomDuPalier(id)
  if (nom !== null) return nom
  return id != null && Number.isInteger(id) && id >= 0 && id < PALIER_MIN ? PAS_ENCORE_CLASSE : "inconnu"
}

/**
 * Ta dernière partie de compétition avant la période (rang au début de la période) : ta partie de compétition gardée la plus récente
 * qui commence avant elle, la borne étant le début de la période couverte, le même dans les deux modes ; null sans elle. Autre :
 * avant minuit de « Du ». Acte : avant sa première partie gardée, toutes files (une partie de compétition sans acte reconnu, hors de
 * la sélection, peut tomber dans la période). Semaine et Mois : avant la plus ancienne partie de la sélection, à l'instant, comme
 * dans selectionner, toute partie de compétition plus récente en faisant partie (les deux modes comptent la compétition) ;
 * sélection vide, la plus récente de toutes, aucune n'étant dans la période ni après.
 */
function derniereAvant(sel: SelectionRecap): Partie | null {
  let limite = Infinity
  const acte = sel.acte
  if (sel.demande.periode === "autre") limite = minuit(sel.demande.du)
  else if (acte !== null) {
    const premiere = plusAncienne(selectionner(sel.donnees.parties, { mode: "tout", periode: "tout" }, 0).parties.filter((p) => deLActe(p, acte)))
    if (premiere !== null) limite = instant(premiere)
  } else for (const p of sel.metriques.parties) if (instant(p) < limite) limite = instant(p)
  const competition = selectionner(sel.donnees.parties, { mode: "competition", periode: "tout" }, 0).parties
  return competition.find((p) => instant(p) < limite) ?? null
}

/**
 * Ton rang actuel et son RR (Ton niveau réel : rang.json, pas la fin de la période), le rang au début de la période (celui de ta
 * dernière partie de compétition avant elle, avec son jour ; sans période couverte, rien) et ton rang max avec son acte. Classé
 * sans RR : « RR inconnu », une donnée manquante étant dite.
 */
function ligneRang(sel: SelectionRecap, niveau: NiveauReel): string {
  const rr = niveau.rr !== null ? ` (${nombreEnClair(niveau.rr, 0)}${NBSP}RR)` : niveau.classe ? " (RR inconnu)" : ""
  const segments = [`- Rang actuel : ${niveau.rang}${rr}`]
  if (sel.couverte !== null) {
    const p = derniereAvant(sel)
    segments.push(p === null
      ? "au début de la période : inconnu, aucune partie de compétition gardée avant elle"
      : `au début de la période : ${palierDeLaPartie(p)} (ma dernière partie de compétition avant elle, le ${jourEnClair(jourDe(instant(p)))})`)
  }
  const max = niveau.max
  segments.push(`rang max : ${max === null ? "inconnu" : `${max.rang}${max.acte === null ? "" : ` (${max.acte.libelle})`}`}`)
  return segments.join(" ; ")
}

/** Les rangs moyens de tes alliés et de tes adversaires (compétition, dès 5 parties) ; un absent : « — », et pourquoi. */
function ligneRangsMoyens(niveau: NiveauReel): string {
  const raison = `moins de ${MIN_PARTIES_GROUPE} parties de compétition avec leurs rangs`
  const { allies, adversaires } = niveau
  const texte = `- Rangs moyens de mes lobbys : alliés ${allies?.rang ?? TIRET}, adversaires ${adversaires?.rang ?? TIRET}`
  return allies === null || adversaires === null ? `${texte} (${TIRET} : ${raison})` : texte
}

/** « Lobbys » (EXPERIENCE.md, Définitions des métriques) : en Compétition, la phrase de l'exemple ; en Tout, la taille de chaque lobby. */
const LOBBYS_COMPETITION = "- « Lobbys » : les neuf autres joueurs de chacune de mes parties, en moyenne"
const LOBBYS_TOUT = "- « Lobbys » : les autres joueurs de chacune de mes parties (9 en 5 contre 5, 3 en escarmouche, 13 en deathmatch), en moyenne"

/**
 * Section 4, le Contexte : période couverte et demandée ; parties, victoires, seul et en duo ; rang actuel, au début de la période
 * et max ; rangs moyens de tes lobbys ; agents (toutes les files du mode) et cartes (files complètes) avec leurs parties, comme les
 * puces de l'onglet ; « lobbys ». Sans partie : la période, « aucune » et le rang, puis « lobbys ».
 */
export function contexte(sel: SelectionRecap): string[] {
  const m = sel.metriques
  const niveau = niveauReel(sel.donnees.rang, m)
  const lignes = [lignePeriode(sel), ligneParties(sel), ligneRang(sel, niveau)]
  if (m.parties.length > 0) {
    const agents = agentsJoues(m), cartes = cartesJouees(m)
    lignes.push(
      ligneRangsMoyens(niveau),
      agents.length === 0 ? "- Agents : aucun connu" : `- Agents, avec leurs parties : ${agents.map((a) => a.libelle).join(", ")}`,
      cartes.length === 0 ? "- Cartes : aucune connue" : `- Cartes, avec leurs parties : ${cartes.map((c) => c.libelle).join(", ")}`,
    )
  }
  lignes.push(sel.demande.mode === "competition" ? LOBBYS_COMPETITION : LOBBYS_TOUT)
  return lignes
}

/** Sans partie de compétition notée (EXPERIENCE.md, Note officielle absente) : jamais d'estimation. */
export const NOTE_ABSENTE = "Aucune partie de compétition notée sur cette période : la note officielle que Valorant affiche en fin de partie existe depuis septembre 2026."


function partiesEnLettres(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}


function mentionsDites(merites: number, distinctions: number): string {
  const m = merites > 0 ? `${nombreEnClair(merites, 0)} mérite${merites > 1 ? "s" : ""}` : null
  const d = distinctions > 0 ? `${nombreEnClair(distinctions, 0)} distinction${distinctions > 1 ? "s" : ""}` : null
  return m !== null && d !== null ? `${m} et ${d}` : m ?? d ?? "Aucun mérite ni distinction"
}

/**
 * Section 5, la Note de performance de Valorant, sur tes parties de compétition notées de la sélection, dans les deux modes (NOTE) :
 * ta moyenne et celle de tes lobbys (comparer : dès 5 parties où ils sont notés) ; dès 10 parties notées, la moyenne des
 * min(10, ⌊n ÷ 2⌋) premières et celle d'autant de dernières, comme la Courbe de la note ; tes mérites et distinctions sur les parties
 * notées non importées, une partie importée de tracker.gg gardant sa note sans mention. Aucune notée : NOTE_ABSENTE.
 */
export function note(sel: SelectionRecap): string[] {
  const notees = retenues(sel.metriques.parties, NOTE.files).filter((p) => fractions([p], NOTE.toi).length > 0)
  const n = notees.length
  if (n === 0) return [NOTE_ABSENTE]
  const c = comparer(sel.metriques, NOTE)
  const lobbys = c.reference === null ? `moins de ${MIN_PARTIES_GROUPE} parties notées, sans référence` : valeurEnClair(c.reference, NOTE.mesure)
  const moyenne = n > 1 ? `Moyenne sur mes ${nombreEnClair(n, 0)} parties de compétition notées` : "Note de ma seule partie de compétition notée"
  const lignes = [`- ${moyenne} : ${valeurEnClair(c.valeur, NOTE.mesure)} (mes lobbys : ${lobbys})`]
  if (n >= MIN_PARTIES_ECART_NOTE) {
    // Les notées viennent la plus récente d'abord : les k dernières en tête, les k premières en queue.
    const k = Math.min(PARTIES_COURBE_NOTE / 2, Math.floor(n / 2))
    const sur = (ps: readonly Partie[]) => valeurEnClair(quotient(additionner(fractions(ps, NOTE.toi))), NOTE.mesure)
    lignes.push(`- De ${sur(notees.slice(n - k))} sur les ${nombreEnClair(k, 0)} premières à ${sur(notees.slice(0, k))} sur les ${nombreEnClair(k, 0)} dernières`)
  } else lignes.push(`- Moins de ${MIN_PARTIES_ECART_NOTE} parties notées : pas de comparaison des premières et des dernières.`)
  const avecMention = notees.filter((p) => p.provenance !== "tracker.gg")
  const importees = n - avecMention.length
  if (avecMention.length === 0) {
    lignes.push(`- Pas de mention : ${importees > 1 ? `mes ${nombreEnClair(importees, 0)} parties notées sont importées` : "ma partie notée est importée"} de tracker.gg, qui ne les donne pas.`)
  } else {
    const merites = avecMention.filter((p) => mentionDe(p) === "merite").length
    const distinctions = avecMention.filter((p) => mentionDe(p) === "distinction").length
    const suite = importees === 0 ? "" : ` ; ${partiesEnLettres(importees)} importée${importees > 1 ? "s" : ""} de tracker.gg, sans mention`
    lignes.push(`- ${mentionsDites(merites, distinctions)} sur ${partiesEnLettres(avecMention.length)}${suite}`)
  }
  return lignes
}

/** Une rangée d'un tableau de la Synthèse : son libellé (EXPERIENCE.md, Structure du récap texte, ligne 6) et son chiffre clé. */
type RangeeSynthese = { libelle: string; cle: CleChiffre }

/** Les chiffres clés individuels, face à tes lobbys. */
const FACE_AUX_LOBBYS: readonly RangeeSynthese[] = [
  { libelle: "Score de combat", cle: "score" },
  { libelle: "K/D", cle: "kd" },
  { libelle: "Dégâts / manche", cle: "degats" },
  { libelle: "Tirs à la tête", cle: "tete" },
  { libelle: "KAST", cle: "kast" },
  { libelle: "Survie", cle: "survie" },
  { libelle: "Clutchs", cle: "clutchs" },
]

/** Les stats d'équipe, face à ta période précédente (Victoires reste au Contexte). */
const FACE_A_LA_PERIODE: readonly RangeeSynthese[] = [
  { libelle: "Écart de dégâts / manche", cle: "ecartDegats" },
  { libelle: "1\u1d49\u02b3\u02e2 kills / manche", cle: "premiersKills" },
  { libelle: "Retakes", cle: "retakes" },
  { libelle: "Écos gagnées", cle: "ecos" },
]

/**
 * La référence d'une tuile, écrite comme sa valeur (colonnes Mes lobbys et Période précédente) : part d'une catégorie par
 * partEnClair (« x sur y » sous 5 occurrences), Écart de dégâts signé, sinon valeurEnClair ; « — » sans référence (groupe sous
 * 5 parties, aucune partie avant, dénominateur nul).
 */
function referenceEnClair(sel: Selection, c: ChiffreCle, t: Tuile): string {
  const r = t.comparaison.reference
  if (r === null) return TIRET
  const stat = c.stat
  if (c.categorie) {
    const s = stat.reference === "periode"
      ? sommer(retenues(sel.precedentes ?? [], stat.files), stat.toi)
      : sommerGroupe(retenues(sel.parties, stat.files), stat.reference, stat.groupe)
    return partEnClair(s.num, s.den)
  }
  return c.signee ? ecartEnClair(r, stat.mesure) : valeurEnClair(r, stat.mesure)
}

/**
 * L'écart d'une tuile sans son libellé, la colonne nommant la référence, comme l'exemple : sur les valeurs écrites (ecartDuRecap) ; deux
 * valeurs qui s'écrivent pareil, « pas d'écart » ; « — » quand la tuile n'en écrit pas.
 */
function ecartSansLibelle(c: ChiffreCle, t: Tuile): string {
  if (t.ecart === null) return TIRET
  return ecartDuRecap(t.comparaison.valeur, t.comparaison.reference, ecritureDe(c.stat.mesure), "") ?? TIRET
}








function faceALaPeriode(sel: Selection, c: ChiffreCle, t: Tuile, precedente: string): string[] {
  const { valeur, parties, reference, partiesReference } = t.comparaison
  const texte = referenceEnClair(sel, c, t)
  const avant = reference === null || partiesReference === parties ? texte : avecSesParties(texte, partiesReference, parties)
  const avecParties = partiesReference > 0 || retenues(sel.precedentes ?? [], c.stat.files).length > 0
  if (valeur !== null && avecParties && partiesReference < MIN_PARTIES_GROUPE) return [avant, `pas d'écart (moins de ${MIN_PARTIES_GROUPE} parties ${precedente})`]
  return [avant, ecartSansLibelle(c, t)]
}

/**
 * Les rangées d'un tableau de la Synthèse : Stat, Moi (la valeur de la tuile), la référence, l'Écart ; `precedente` (en clair) pour le
 * tableau face à ta période précédente (faceALaPeriode).
 */
function rangees(sel: Selection, liste: readonly RangeeSynthese[], precedente: string | null = null): { libelle: string; tuile: Tuile; cellules: string[] }[] {
  return liste.map((x) => {
    const c = chiffreCle(x.cle), t = tuile(sel, c)
    const suite = precedente === null ? [referenceEnClair(sel, c, t), ecartSansLibelle(c, t)] : faceALaPeriode(sel, c, t, precedente)
    return { libelle: x.libelle, tuile: t, cellules: [x.libelle, t.valeur, ...suite] }
  })
}

/**
 * Section 6, la Synthèse : tes chiffres clés individuels face à tes lobbys, puis les stats d'équipe face à ta période précédente
 * (ses parties dites quand elles diffèrent des tiennes, sans écart sous 5 parties : faceALaPeriode, entrée 43),
 * chaque tableau après sa phrase ; dessous, les stats sans référence faute de 5 parties de lobbys, et une période précédente sans
 * partie (« Tout » du module : aucune). Sans partie : rien (AUCUNE_DONNEE).
 */
export function synthese(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const lobbys = rangees(m, FACE_AUX_LOBBYS)
  const lignes = tableau("Face à mes lobbys, sur mes chiffres clés individuels :", ["Stat", "Moi", "Mes lobbys", "Écart"], lobbys.map((x) => x.cellules))
  const sansReference = lobbys.filter((x) => x.tuile.comparaison.reference === null && x.tuile.comparaison.partiesReference < MIN_PARTIES_GROUPE)
  if (sansReference.length > 0) lignes.push("", `- Sans référence (mes lobbys sur moins de ${MIN_PARTIES_GROUPE} parties) : ${sansReference.map((x) => x.libelle).join(", ")}.`)
  const precedente = precedenteEnClair(sel)
  lignes.push("", ...tableau(
    `Face à ma période précédente (${precedente}), sur les stats d'équipe, où la comparaison à mes lobbys ne veut rien dire :`,
    ["Stat", "Moi", "Période précédente", "Écart"],
    rangees(m, FACE_A_LA_PERIODE, precedente).map((x) => x.cellules),
  ))
  // Les quatre stats d'équipe se calculent sur les files complètes ; en Tout, la période précédente peut n'avoir que d'autres files.
  if (retenues(m.precedentes ?? [], "completes").length === 0) {
    const files = (m.precedentes ?? []).length === 0 ? "" : " de compétition, non classé, vélocité ou Premier (les files de ces stats)"
    lignes.push("", `- Aucune partie${files} dans ma période précédente (${precedente}) : pas d'écart.`)
  }
  return lignes
}

// ─────────────────────────── tendances, rang, groupe, heures et agents (entrée 3) ───────────────────────────
//
// Sections 7 à 9 (EXPERIENCE.md, Structure du récap texte, lignes 7 à 9), sur la sélection du récap, par les fonctions des entrées
// 4.4 à 4.6 du module des métriques : Tendances (tendances, tendance), Escalier du rang, Barres de RR, Seul ou en duo, Quand tu joues
// le mieux, fiches et capacités des agents ; chaque chiffre est celui de l'onglet, à ses formats. Chaque phrase dit sur quoi porte
// son chiffre : ce qui ne suit pas la période (note des Tendances, rang par acte, RR) le dit, tout « — » donne sa raison, et une
// donnée manquante est dite en une ligne ; un groupe de lobbys ne sert de référence que dès 5 parties (capacitesAgent).


const QUATRIEME = "4\u1d49"

const PREMIERS_KILLS_DITS = "1\u1d49\u02b3\u02e2 kills"

/**
 * Les stats des Tendances hors note, dans l'ordre du module (TENDANCES de metriques.ts, privée, recopiée) : leur libellé et leur
 * stat, pour dire celles qui restent stables ou sans tendance ; la note, sur ses 20 parties à elle, a sa propre ligne.
 */
const STATS_TENDANCES: readonly { cle: CleTendance; libelle: string; stat: Stat }[] = [
  ...STATS_EVOLUTION.filter((e) => e.cle !== "note").map((e) => ({ cle: e.cle, libelle: e.libelle, stat: e.stat })),
  { cle: "premiersKills", libelle: PREMIERS_KILLS_DITS, stat: PREMIERS_KILLS },
  { cle: "clutchs", libelle: "Clutchs", stat: CLUTCHS },
  { cle: "ecos", libelle: "Écos gagnées", stat: ECOS_GAGNEES },
  { cle: "retakes", libelle: "Retakes", stat: RETAKES },
]

/** Les parties qu'il faut à une Tendance : tes 10 dernières contre les 10 d'avant. */
const PARTIES_D_UNE_TENDANCE = 2 * PARTIES_TENDANCE






function lignesTendancesDeLaPeriode(m: Selection, lignes: readonly LigneTendance[]): string[] {
  const stables: string[] = [], sansEffectif: string[] = [], sansCas: string[] = []
  for (const d of STATS_TENDANCES) {
    const t = tendance(m, d.stat)
    if (t !== null) {
      if (t.sens === "stable") stables.push(d.libelle)
      continue
    }
    // Même compte que tendance : les parties de la stat (files admises) dont la fraction est lisible.
    if (fractions(retenues(m.parties, d.stat.files), d.stat.toi).length < PARTIES_D_UNE_TENDANCE) sansEffectif.push(d.libelle)
    else sansCas.push(d.libelle)
  }
  if (sansEffectif.length === STATS_TENDANCES.length) {
    return [m.parties.length === 0
      ? "- Pas de tendance sur la période : aucune partie."
      : `- Pas de tendance sur la période : chaque stat y compte moins de ${PARTIES_D_UNE_TENDANCE} parties (il en faut ${PARTIES_D_UNE_TENDANCE} : mes ${PARTIES_TENDANCE} dernières contre les ${PARTIES_TENDANCE} d'avant).`]
  }
  const dites = (sens: "hausse" | "baisse") => {
    const xs = lignes.filter((l) => l.cle !== "note" && l.sens === sens).map((l) => `${l.libelle} (${l.ecart})`)
    return xs.length === 0 ? "aucune" : xs.join(", ")
  }
  const resultat = [
    `- En hausse, chaque stat comparant ses ${PARTIES_TENDANCE} dernières parties de la période où elle se calcule aux ${PARTIES_TENDANCE} d'avant : ${dites("hausse")}`,
    `- En baisse : ${dites("baisse")}`,
  ]
  if (stables.length > 0) resultat.push(`- Stables : ${stables.join(", ")}`)
  if (sansEffectif.length > 0) resultat.push(`- Sans tendance, moins de ${PARTIES_D_UNE_TENDANCE} parties où la stat se calcule : ${sansEffectif.join(", ")}`)
  if (sansCas.length > 0) resultat.push(`- Sans tendance, aucun cas compté dans l'une des deux séries de ${PARTIES_TENDANCE} parties : ${sansCas.join(", ")}`)
  return resultat
}

/**
 * La Tendance de la note (ligne Note des Tendances de l'onglet) : sur tes 20 dernières parties de compétition notées, quelle que soit
 * la période, en hausse, en baisse ou stable ; moins de 20 notées en tout (partiesCourbeNote en prend 20 au plus) : leur nombre.
 */
function ligneTendanceNote(historique: readonly Partie[], lignes: readonly LigneTendance[]): string {
  const n = partiesCourbeNote(historique).length
  if (n < PARTIES_D_UNE_TENDANCE) {
    const notees = n === 0 ? "aucune partie de compétition notée" : `${partiesEnLettres(n)} de compétition notée${n > 1 ? "s" : ""} en tout`
    return `- Note Valorant : pas de tendance, ${notees} (il en faut ${PARTIES_D_UNE_TENDANCE}).`
  }
  const l = lignes.find((x) => x.cle === "note")
  const sens = l === undefined ? "stable" : `en ${l.sens} (${l.ecart})`
  return `- Note Valorant, sur mes ${PARTIES_COURBE_NOTE} dernières parties de compétition notées, quelle que soit la période : ${sens}`
}

/**
 * Une marche de l'Escalier : son rang et son acte ; vide, « — » et pourquoi : aucune partie classée, non classé en fin d'acte (des
 * parties et un `end_tier` de 0 à 2, « Unrated »), ou rang de fin inconnu (parties ou `end_tier` absents) ; l'acte en cours porte ton
 * rang actuel. `acte` : l'entrée de `seasonal[]` de la marche, la première de son nom, comme escalierDuRang.
 */
function marcheDite(m: MarcheEscalier, acte: Acte | undefined): string {
  if (m.enCours) return m.rang === null ? `${TIRET} (${m.libelle}, acte en cours : pas encore classé)` : `${m.rang} (${m.libelle}, acte en cours : mon rang actuel)`
  if (m.rang !== null) return `${m.rang} (${m.libelle})`
  if (m.parties === 0) return `${TIRET} (${m.libelle} : aucune partie classée)`
  const fin = acte?.end_tier?.id
  const nonClasse = m.parties !== null && m.parties > 0 && fin != null && Number.isInteger(fin) && fin >= 0 && fin < PALIER_MIN
  return `${TIRET} (${m.libelle} : ${nonClasse ? "non classé en fin d'acte" : "rang de fin inconnu"})`
}

/** Le rang de fin de chaque acte depuis E8 A1 (escalierDuRang), sur tout l'historique, quelle que soit la période. */
function ligneEscalier(sel: SelectionRecap): string {
  const debut = `- Rang de fin de chaque acte depuis E${PREMIER_EPISODE_ESCALIER} A1, quelle que soit la période`
  const rang = sel.donnees.rang
  if (rang === null) return `${debut} : inconnu, aucun rang gardé sur l'iPhone`
  const { marches } = escalierDuRang(rang, sel.donnees.parties)
  const acteDe = (m: MarcheEscalier) => (rang.seasonal ?? []).find((x) => acteEnClair(x.season.short)?.libelle === m.libelle)
  return marches.length === 0 ? `${debut} : aucun acte connu` : `${debut} : ${marches.map((m) => marcheDite(m, acteDe(m))).join(", ")}`
}

/**
 * Tes RR (barresRr) : sur tes 20 dernières parties classées dont le RR est connu, quelle que soit la période, leur total et les
 * moyennes par victoire et par défaite, placements et nuls exclus, une moyenne absente dite ; le RR remboursé, hors du total.
 */
function ligneRr(sel: SelectionRecap): string {
  const b = barresRr(sel.donnees.parties, sel.donnees.rr)
  const n = b.barres.length
  if (n === 0) return `- RR : aucune partie classée dont le RR est connu (Valorant ne garde le RR que de mes ${PARTIES_BARRES_RR} dernières parties classées).`
  const quelles = n >= PARTIES_BARRES_RR ? `de mes ${nombreEnClair(n, 0)} dernières parties classées` : n > 1 ? `de mes ${nombreEnClair(n, 0)} parties classées` : "de ma seule partie classée"
  const victoire = b.texteParVictoire === null ? `par victoire : ${TIRET} (aucune victoire hors placements)` : `${b.texteParVictoire} par victoire`
  const defaite = b.texteParDefaite === null ? `par défaite : ${TIRET} (aucune défaite hors placements)` : `${b.texteParDefaite} par défaite`
  let texte = `- RR ${quelles} dont le RR est connu, quelle que soit la période : ${b.texteTotal} ; ${victoire} et ${defaite} en moyenne, placements et nuls exclus`
  if (b.rembourse > 0) {
    const s = b.rembourse > 1 ? "s" : ""
    texte += ` ; ${nombreEnClair(b.rembourse, 0)}${NBSP}RR remboursé${s} sur ces parties, non ajouté${s} au total`
  }
  return texte
}

/**
 * Section 7, Tendances et rang : les Tendances de la période, celle de la note, le rang de fin de chaque acte et tes RR, ces trois
 * dernières quelle que soit la période (Tendances, Escalier du rang et Barres de RR de l'onglet).
 */
export function tendancesEtRang(sel: SelectionRecap): string[] {
  const lignes = tendances(sel.metriques, sel.donnees.parties)
  return [...lignesTendancesDeLaPeriode(sel.metriques, lignes), ligneTendanceNote(sel.donnees.parties, lignes), ligneEscalier(sel), ligneRr(sel)]
}

/** Le nom d'une catégorie de Seul ou en duo en tête de ligne. */
const GROUPES_EN_TETE: Readonly<Record<CleGroupe, string>> = { seul: "Seul", duo: "En duo", groupe: "En groupe de 3 et plus" }

/** Les parties d'une liste où se calculent tes victoires (files complètes, résultat lu) : l'effectif d'une barre de Seul ou en duo. */
function partiesAVictoires(parties: readonly Partie[]): number {
  return sommer(retenues(parties, VICTOIRES.files), VICTOIRES.toi).parties
}

/** Ton K/D d'une barre : sa valeur, avec ses parties quand elles diffèrent de l'effectif de la barre ; « — » et pourquoi. */
function kdDit(kd: ValeurCategorie, effectif: number): string {
  if (kd.valeur !== null) return kd.parties === effectif ? kd.texte : `${kd.texte} sur ${partiesEnLettres(kd.parties)}`
  if (kd.parties === 0) return `${TIRET} (aucune partie où il se calcule)`
  return kd.parties < MIN_OCCURRENCES ? `${TIRET} (moins de ${MIN_OCCURRENCES} parties)` : `${TIRET} (aucune mort)`
}

/** Une barre de Seul ou en duo : son effectif, tes victoires (« x sur y » sous 5), ton K/D. */
function ligneBarre(b: BarreGroupe): string {
  const nom = GROUPES_EN_TETE[b.cle], n = b.victoires.parties
  if (n === 0 && b.kd.parties === 0) return `- ${nom} : aucune partie`
  const tete = n === 0 ? `- ${nom} : victoires ${TIRET} (aucune partie où elles se calculent)` : `- ${nom}, ${partiesEnLettres(n)} : victoires ${b.victoires.texte}`
  return `${tete}, K/D ${kdDit(b.kd, n)}`
}

/**
 * Seul ou en duo (seulOuEnDuo) : une ligne par barre ; le groupe de 3 et plus, que l'onglet ne montre que dès 3 parties, dit sous le
 * seuil ; tes parties sans groupe connu, hors de toutes les barres, dites.
 */
function lignesGroupe(m: Selection): string[] {
  const barres = seulOuEnDuo(m)
  const lignes = barres.map(ligneBarre)
  if (!barres.some((b) => b.cle === "groupe")) {
    const enGroupe = m.parties.filter((p) => categorieDeGroupe(p.groupe) === "groupe")
    const n = partiesAVictoires(enGroupe)
    lignes.push(enGroupe.length === 0
      ? `- ${GROUPES_EN_TETE.groupe} : aucune partie`
      : `- ${GROUPES_EN_TETE.groupe} : ${n === 0 ? "aucune partie où les victoires se calculent" : partiesEnLettres(n)}, pas de valeur sous ${MIN_PARTIES_GROUPE_DE_3} parties`)
  }
  const sans = m.parties.filter((p) => categorieDeGroupe(p.groupe) === null).length
  if (sans > 0) lignes.push(`- Sans groupe connu : ${partiesEnLettres(sans)}, hors de ces lignes`)
  return lignes
}

/** L'effectif d'une valeur de Quand tu joues le mieux : ses parties ; sans valeur, pourquoi. */
function effectifHeure(v: ValeurCategorie): string {
  if (v.valeur !== null) return partiesEnLettres(v.parties)
  if (v.parties === 0) return "aucune partie"
  return v.parties < MIN_PARTIES_HEURES ? `${partiesEnLettres(v.parties)}, moins de ${MIN_PARTIES_HEURES}` : `${partiesEnLettres(v.parties)}, incalculable`
}

/** Après une défaite ou une victoire : ta part de victoires et ses cas ; sans valeur, pourquoi. */
function apresDit(v: ValeurCategorie): string {
  if (v.valeur !== null) return `${v.texte} (sur ${nombreEnClair(v.parties, 0)})`
  return v.parties === 0 ? `${TIRET} (aucun cas)` : `${TIRET} (sur ${nombreEnClair(v.parties, 0)}, moins de ${MIN_PARTIES_HEURES})`
}

/**
 * Quand tu joues le mieux (quandTuJouesLeMieux, sessions sur tout l'historique) : ton Score de combat par tranche horaire, puis dans
 * une session, parties 1 à 3 contre 4ᵉ et suivantes ; ta part de victoires à la partie suivante de la même session, après une
 * défaite et après une victoire, nuls exclus ; chaque valeur dès 5 parties, « — » et pourquoi en dessous.
 */
function lignesHeures(sel: SelectionRecap, q: QuandTuJoues): string[] {
  const lignes: string[] = []
  if (q.tranches.length === 0) lignes.push("- Score de combat selon l'heure et dans une session : aucune partie où il se calcule sur la période")
  else {
    lignes.push(`- Score de combat selon l'heure de début : ${q.tranches.map((t) => `${t.libelle} : ${t.texte} (${effectifHeure(t)})`).join(" ; ")}`)

    const ecart = q.texteEcartSession === null ? null : ecartDuRecap(q.suivantes.valeur, q.premieres.valeur, ECRITURE_SESSION, "soit ")
    lignes.push(
      "- Dans une session (chaque partie commence moins d'une heure après la fin de la précédente, toutes files comprises) : score de combat "
        + `${q.premieres.texte} sur les parties 1 à 3 (${effectifHeure(q.premieres)}), ${q.suivantes.texte} à partir de la ${QUATRIEME} (${effectifHeure(q.suivantes)})${ecart === null ? "" : `, ${ecart}`}`,
    )
  }
  const suivante = sel.demande.mode === "competition" ? "ma partie de compétition suivante" : "ma partie suivante de compétition, non classé, vélocité ou Premier"
  lignes.push(`- Après une défaite, je gagne ${suivante} de la même session : ${apresDit(q.apresDefaite)} ; après une victoire : ${apresDit(q.apresVictoire)} ; nuls exclus`)
  return lignes
}

/** Section 8, Seul ou en duo, heures et sessions, sur les parties de la période ; sans partie : rien (AUCUNE_DONNEE). */
export function groupeEtHeures(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  return [...lignesGroupe(m), ...lignesHeures(sel, quandTuJouesLeMieux(m, sel.donnees.parties))]
}

/** Un chiffre de la fiche d'un agent, parmi ses six Chiffres et ses premiers duels. */
function chiffreDeLaFiche(f: FicheAgent, cle: CleChiffreAgent): ChiffreAgent {
  return [...f.chiffres, ...f.premiersDuels].find((c) => c.cle === cle)!
}

/** Les colonnes du tableau par agent, après l'agent et ses parties ; les deux dernières passent en liste (4 colonnes au plus). */
const COLONNES_AGENT: readonly CleChiffreAgent[] = ["victoires", "kd", "score", "premieresMorts"]

/**
 * Une valeur de la fiche d'un agent, jugée sur les parties où elle se calcule (ses sommes : files admises, donnée lue), qui peuvent
 * être moins nombreuses que les parties de l'agent en Tout : écrite dès 3 de ces parties, avec leur nombre quand il diffère ; sinon
 * « — » et pourquoi (aucune partie comptée, moins de 3, ou aucune mort pour le K/D).
 */
function valeurDeLaFiche(c: ChiffreAgent, parties: number): string {
  const n = c.sommes.parties
  if (n === 0) return `${TIRET} (aucune partie comptée)`
  if (n < MIN_PARTIES_FICHE) return `${TIRET} (${partiesEnLettres(n)} comptée${n > 1 ? "s" : ""}, moins de ${MIN_PARTIES_FICHE})`
  if (c.valeur === null) return `${TIRET} (aucune mort)`
  return n === parties ? c.texte : `${c.texte} sur ${partiesEnLettres(n)}`
}

/**
 * Le tableau par agent, dès 3 parties avec lui (fiche d'agent), chaque valeur jugée sur ses propres parties ; quand l'une d'elles en
 * compte moins que l'agent, la règle des files dite dessous ; les agents sous 3 parties, en une ligne.
 */
function lignesAgents(m: Selection, agents: readonly AgentJoue[]): string[] {
  const fiches = agents.filter((a) => a.parties >= MIN_PARTIES_FICHE).map((a) => ficheAgent(m, a.id, null)!)
  const lignes: string[] = []
  if (fiches.length > 0) {
    const libelle = (c: CleChiffreAgent) => chiffreDeLaFiche(fiches[0], c).libelle
    const entetes = ["Agent", "Parties", ...COLONNES_AGENT.map(libelle)]
    const rangees = fiches.map((f) => [
      f.nom,
      `${nombreEnClair(f.parties, 0)}${f.mention === null ? "" : ` (${f.mention})`}`,
      ...COLONNES_AGENT.map((c) => valeurDeLaFiche(chiffreDeLaFiche(f, c), f.parties)),
    ])
    lignes.push(...tableau("Mes agents de la période, du plus joué au moins joué, dès 3 parties avec eux :", entetes, rangees))
    if (fiches.some((f) => COLONNES_AGENT.some((c) => chiffreDeLaFiche(f, c).sommes.parties !== f.parties))) {
      lignes.push("", `- Chaque valeur ne compte que les parties où elle se calcule : ${libelle("victoires")}, ${libelle("score")} et ${libelle("premieresMorts")}, `
        + `les files complètes (compétition, non classé, vélocité, Premier) ; ${libelle("kd")}, toutes les files. Quand elles diffèrent des parties de l'agent, la valeur dit les siennes ; sous ${MIN_PARTIES_FICHE}, elle s'écrit ${TIRET}.`)
    }
  }
  const peu = agents.filter((a) => a.parties < MIN_PARTIES_FICHE)
  if (peu.length > 0) lignes.push(...(lignes.length > 0 ? [""] : []), `- Moins de ${MIN_PARTIES_FICHE} parties, sans valeur : ${peu.map((a) => a.libelle).join(", ")}`)
  return lignes
}

/**
 * La référence des mêmes agents de tes lobbys : leur valeur ; sans elle, « — » et pourquoi : aucun joueur de cet agent dans tes lobbys
 * (aucun cumul de lui sur les semaines et les files de la période), ou sous le seuil de 5 parties (celles, sûres, que comptent les
 * cumuls, ⌈joueurs ÷ 2⌉ : un minimum). Une référence absente dès 5 parties n'existe pas : les cumuls lus ont des joueurs et des manches.
 */
function euxDit(reference: string | null, groupe: Sommes, sansJoueur: boolean): string {
  if (reference !== null) return `eux : ${reference}`
  return sansJoueur ? `eux : ${TIRET}, aucun joueur de cet agent dans mes lobbys` : `eux : ${TIRET}, sous le seuil de ${MIN_PARTIES_GROUPE} parties`
}

/**
 * Une de tes valeurs de capacité ou d'assists, jugée sur ses propres parties (files des capacités, donnée lue) : écrite dès 3, avec
 * leur nombre quand il diffère des parties de l'agent, et la référence de tes lobbys ; sinon « — » et pourquoi.
 */
function capaciteDite(nom: string, unite: string, texte: string, n: number, parties: number, eux: string): string {
  if (n === 0) return `${nom} ${TIRET} (aucune donnée sur mes parties)`
  if (n < MIN_PARTIES_FICHE) return `${nom} ${TIRET} (${partiesEnLettres(n)}, moins de ${MIN_PARTIES_FICHE})`
  return `${nom} ${texte} par ${unite}${n === parties ? "" : ` sur ${partiesEnLettres(n)}`} (${eux})`
}

/**
 * Les capacités de ton agent le plus joué (capacitesAgent) face aux mêmes agents de tes lobbys, lus dans les cumuls des semaines et
 * des files de la période : C, Q et E par manche, X par partie, assists par manche, kills aux capacités ; sous 3 parties avec lui,
 * aucune valeur ; aucune de ses parties dans les files des capacités, ou une capacité sans donnée sur tes parties, dites.
 */
function ligneCapacites(sel: SelectionRecap, a: AgentJoue): string {
  const tete = `- Capacités de ${a.nom}, mon agent le plus joué`
  if (a.parties < MIN_PARTIES_FICHE) return `${tete} : moins de ${MIN_PARTIES_FICHE} parties avec cet agent, pas de valeur.`
  const c = capacitesAgent(sel.metriques, sel.donnees.cumuls, a.id)
  const entete = `${tete}, face aux ${a.nom} de mes lobbys (semaines de la période) : `
  // Ses parties dans les files des capacités (killsCapacites.parties) : aucune, rien ne s'y compte, données présentes ou non.
  if (c.killsCapacites.parties === 0) {
    return `${entete}C, Q, E, X, assists et kills aux capacités : aucune partie avec cet agent dans les files où ils se comptent (compétition, non classé, vélocité, Premier)`
  }
  const sansJoueur = cumulsDeLAgent(cumulsDuPerimetre(sel.metriques, sel.donnees.cumuls, FILES_CAPACITES), a.id).length === 0
  const segments: string[] = []
  if (c.capacites.every((x) => x.toi.parties === 0)) segments.push("C, Q, E et X : aucune donnée sur mes parties avec cet agent")
  else {
    for (const x of c.capacites) segments.push(capaciteDite(x.touche, x.parManche ? "manche" : "partie", x.texte, x.toi.parties, a.parties, euxDit(x.reference, x.groupe, sansJoueur)))
  }
  segments.push(capaciteDite("assists", "manche", c.assists.texte, c.assists.toi.parties, a.parties, euxDit(c.assists.reference, c.assists.groupe, sansJoueur)))
  segments.push(`kills aux capacités : ${c.killsCapacites.texte}`)
  return `${entete}${segments.join(" ; ")}`
}

/**
 * Section 9, Par agent : le tableau par agent de la période (parties, victoires, K/D, score, 1ʳᵉˢ morts par manche, valeurs de
 * ficheAgent), puis les capacités de ton agent le plus joué ; sans partie : rien (AUCUNE_DONNEE) ; sans agent connu : une ligne.
 */
export function parAgent(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const agents = agentsJoues(m)
  if (agents.length === 0) return ["- Agents : aucun connu"]
  return [...lignesAgents(m, agents), "", ligneCapacites(sel, agents[0])]
}

// ─────────────────────────── cartes, morts, côtés et duels (entrée 4) ───────────────────────────
//
// Sections 10 à 13 (EXPERIENCE.md, Structure du récap texte, lignes 10 à 13), sur la sélection du récap, par les fonctions des entrées
// 4.7 à 4.9 du module des métriques : Par carte (ligne et fiche de chaque carte, premiers duels par carte, victoires par carte de tes
// agents), Où et quand je meurs (Plan de carte de chaque carte et de chaque côté, Histogramme, moment de ta première mort), Attaque,
// défense et retakes (chiffres d'Attaque · défense) et Duels (premiers duels, échanges, clutchs, multi-kills, ce qui te tue, duels par
// agent adverse) ; chaque chiffre est celui de l'onglet, à ses formats. Tout s'y compte sur les files complètes, comme dans l'onglet :
// en Tout, chaque section le dit en tête ; seuls les duels par agent adverse, lus dans les cumuls par semaine, disent sur leur ligne ce
// qu'ils comptent. Chaque valeur est jugée sur ses propres parties, leur nombre écrit quand il diffère de celui de sa ligne ; une
// référence (période précédente, lobbys) écrit aussi le sien, et une période précédente sous 5 parties ne donne pas d'écart ; un écart se
// calcule sur les valeurs telles qu'elles s'écrivent ; tout « — » donne sa raison ; aucun joueur nommé : des cartes, des zones, des
// armes et des agents, un agent ou une carte sans nom dit « non reconnu », avec le début de son id.


const PREMIERES_MORTS_DITES = `1${String.fromCharCode(0x02b3, 0x1d49, 0x02e2)} morts`
const PREMIERE_MORT_DITE = `1${String.fromCharCode(0x02b3, 0x1d49)} mort`
/** Le vrai signe moins, et les espaces d'un nombre écrit (fine insécable, insécable, ordinaire), par leur code. */
const MOINS_ECRIT = String.fromCharCode(0x2212)
const ESPACES_ECRITES = new RegExp(`[${String.fromCharCode(0x202f, 0x00a0)} ]`, "g")

/** Les files où se comptent les sections 10 à 13 (Files admises : côtés, échanges, clutchs, premiers duels). */
const FILES_COMPLETES_DITES = "compétition, non classé, vélocité ou Premier"
/** Le nom de chaque file complète, pour dire celles des cumuls des duels par agent adverse. */
const NOMS_DES_FILES: Readonly<Record<string, string>> = { competitive: "compétition", unrated: "non classé", swiftplay: "vélocité", premier: "Premier" }

/** Un côté en clair : « attaque », « défense ». */
function coteDit(cote: Cote): string {
  return cote === "attaque" ? "attaque" : "défense"
}


function idCourt(id: string): string {
  return id === "" ? "sans id" : `id ${id.slice(0, 8)}`
}


function nomDeCarte(nom: string, id: string): string {
  return nom === "?" ? `carte non reconnue (${idCourt(id)})` : nom
}


function nomDAgentAdverse(nom: string, id: string): string {
  return nom === "?" ? `un agent non reconnu (${idCourt(id)})` : nom
}


function partiesComptees(n: number): string {
  return `${partiesEnLettres(n)} comptée${n > 1 ? "s" : ""}`
}


function nulsDits(n: number): string {
  return n === 0 ? "" : `dont ${nombreEnClair(n, 0)} nul${n > 1 ? "s" : ""}`
}

/**
 * Les files des sections 10 à 13 : le nombre de parties des files complètes de la sélection, et la ligne de tête : aucune quand toutes
 * en sont (Compétition) ; en Tout, celles qui comptent et les autres, `sauf` ce que la section compte autrement (dit sur sa ligne) ;
 * aucune partie de ces files : la ligne qui est toute la section.
 */
function teteDesFiles(m: Selection, sauf: string | null = null): { completes: number; lignes: string[] } {
  const completes = retenues(m.parties, "completes").length
  const autres = m.parties.length - completes
  if (completes === 0) return { completes, lignes: [`- Aucune partie de ${FILES_COMPLETES_DITES} sur la période : ces stats ne comptent que ces files.`] }
  if (autres === 0) return { completes, lignes: [] }
  const comptent = completes > 1 ? `mes ${partiesEnLettres(completes)}` : "ma seule partie"
  const restent = autres > 1 ? `mes ${partiesEnLettres(autres)} des autres files n'y entrent pas` : "ma partie des autres files n'y entre pas"
  const stats = sauf === null ? "ces stats" : `ces stats, sauf ${sauf} (dits sur leur ligne),`
  return { completes, lignes: [`- Mode Tout : ${stats} ne comptent que ${comptent} de ${FILES_COMPLETES_DITES} ; ${restent}.`] }
}


function avecSesParties(texte: string, n: number, base: number): string {
  if (n === base) return texte
  return texte.includes(" sur ") ? `${texte} (${partiesEnLettres(n)})` : `${texte} sur ${partiesEnLettres(n)}`
}


function unitesEcrites(texte: string): number | null {
  const t = texte.replace(ESPACES_ECRITES, "").replace(/(%|s)$/, "").replace(MOINS_ECRIT, "-")
  return /^-?\d+(,\d+)?$/.test(t) ? Number(t.replace(",", "")) : null
}






function ecartDuRecap(valeur: number | null, reference: number | null, ecriture: Ecriture, mot: string = "écart ", libelle: string | null = null): string | null {
  if (valeur === null || reference === null) return null
  if (ecriture.unites(valeur) === ecriture.unites(reference)) return "pas d'écart"
  return `${mot}${ecartEcrit(valeur, reference, ecriture, libelle)}`
}






function valeurDeCarte(texte: string, n: number, parties: number, sansPartie: string, vide: string | null, suite: string = ""): string {
  if (n === 0) return `${TIRET} (${sansPartie})`
  if (n < MIN_PARTIES_FICHE) return `${TIRET} (${partiesComptees(n)}, moins de ${MIN_PARTIES_FICHE})`
  if (vide !== null) return `${TIRET} (${vide})`
  return `${avecSesParties(texte, n, parties)}${suite === "" ? "" : `, ${suite}`}`
}

/** Les colonnes du tableau par carte ; Défense et le ratio passent en liste (4 colonnes au plus). */
const ENTETES_CARTE: readonly string[] = ["Carte", "Parties", "Victoires", "Attaque", "Défense", "Ratio des premiers duels"]

/** La raison d'un côté sans partie lue (partGagnee : manches jouées, côté de chaque manche, issue des manches du côté). */
const COTE_ILLISIBLE = "aucune partie à manches jouées dont le côté et l'issue des manches sont connus"

/**
 * Le tableau par carte : les cartes jouées des files complètes dès 3 parties, de la plus jouée à la moins jouée ; parties (« peu de
 * parties » de 3 à 9), victoires et leurs nuls, manches gagnées en attaque et en défense (toutesTesCartes), ratio des premiers duels
 * (premiersDuelsParCarte), chaque valeur jugée sur ses propres parties ; puis les cartes sous 3 parties et les parties sans carte, dites,
 * et tes victoires par carte avec chacun de tes agents (lignesAgentParCarte).
 */
function lignesParCarte(m: Selection): string[] {
  const cartes = cartesJouees(m)
  if (cartes.length === 0) return ["- Cartes : aucune connue"]
  const table: string[] = [], liste: string[] = []
  const fiches = cartes.filter((c) => c.parties >= MIN_PARTIES_FICHE)
  if (fiches.length > 0) {
    const lignesCarte = new Map(toutesTesCartes(m).map((l) => [l.id, l]))
    const duels = new Map(premiersDuelsParCarte(m).map((d) => [d.id, d]))
    const rangees = fiches.map((c) => {
      const parties = partiesDeLaCarte(m.parties, c.id)
      const l = lignesCarte.get(c.id)!, d = duels.get(c.id)!
      const mention = ficheCarte(m, c.id)?.mention ?? null
      const cote = (x: Cote) => valeurDeCarte(l[x].texte, sommer(parties, STATS_DU_COTE[x].manches.toi).parties, c.parties, COTE_ILLISIBLE,
        l[x].manches === 0 ? `aucune manche en ${coteDit(x)}` : null)
      return [
        nomDeCarte(c.nom, c.id),
        `${nombreEnClair(c.parties, 0)}${mention === null ? "" : ` (${mention})`}`,
        valeurDeCarte(l.victoires.texte, l.victoires.parties, c.parties, "résultat de ses parties inconnu", null, nulsDits(l.nuls)),
        cote("attaque"),
        cote("defense"),
        valeurDeCarte(d.texte, sommer(parties, RATIO_PREMIERS_DUELS.toi).parties, c.parties, "aucune manche jouée",
          d.premieresMorts === 0 ? `aucune ${PREMIERE_MORT_DITE} en duel` : null),
      ]
    })
    table.push(...tableau(
      `Mes cartes de la période dès ${MIN_PARTIES_FICHE} parties, de la plus jouée à la moins jouée (Attaque et Défense : mes manches gagnées de ce côté ; `
        + `ratio des premiers duels : mes ${PREMIERS_KILLS_DITS} divisés par mes ${PREMIERES_MORTS_DITES} en duel) :`,
      ENTETES_CARTE, rangees,
    ))
  }
  const peu = cartes.filter((c) => c.parties < MIN_PARTIES_FICHE)
  if (peu.length > 0) {
    const dite = fiches.length > 0 ? `- Moins de ${MIN_PARTIES_FICHE} parties, hors du tableau (une carte s'y lit dès ${MIN_PARTIES_FICHE} parties)` : `- Aucune carte sur ${MIN_PARTIES_FICHE} parties ou plus, pas de tableau (une carte s'y lit dès ${MIN_PARTIES_FICHE} parties)`
    liste.push(`${dite} : ${peu.map((c) => effectifEnClair(nomDeCarte(c.nom, c.id), c.parties)).join(", ")}`)
  }
  const sansCarte = retenues(m.parties, "completes").filter((p) => cleCarte(p.carte) === null).length
  if (sansCarte > 0) liste.push(`- Sans carte connue : ${partiesEnLettres(sansCarte)}${fiches.length > 0 ? ", hors du tableau" : ""}`)
  liste.push(...lignesAgentParCarte(m))
  return [...table, ...(table.length > 0 && liste.length > 0 ? [""] : []), ...liste]
}

/** Une carte de tes parties avec un agent : son nom et son id, tes parties au résultat connu, tes victoires et tes nuls. */
type CarteDeLAgent = { nom: string; id: string; parties: number; victoires: number; nuls: number }

/**
 * Les cartes de tes parties avec cet agent sur les files complètes, carte et résultat connus, regroupées comme victoiresParCarte (id de
 * la carte, son nom sinon, sans casse) : de quoi dire les nuls et l'id d'une carte sans nom, que ses lignes ne portent pas.
 */
function cartesDeLAgent(m: Selection, idAgent: string): CarteDeLAgent[] {
  const agent = idAgent.toLowerCase()
  const parCarte = new Map<string, CarteDeLAgent>()
  for (const p of retenues(m.parties, "completes")) {
    if (p.agent == null || typeof p.agent.id !== "string" || p.agent.id.toLowerCase() !== agent || p.carte == null || p.resultat == null) continue
    const nom = p.carte.name || "?"
    const cle = (p.carte.id || nom).toLowerCase()
    const x = parCarte.get(cle) ?? { nom, id: p.carte.id || "", parties: 0, victoires: 0, nuls: 0 }
    x.parties++
    if (p.resultat === "victoire") x.victoires++
    if (p.resultat === "nul") x.nuls++
    parCarte.set(cle, x)
  }
  return [...parCarte.values()]
}

/**
 * Agent par carte : pour chacun de tes agents dès 3 parties (ceux du tableau Par agent), tes victoires sur chaque carte avec lui
 * (victoiresParCarte : « x sur y » sous 5 parties), de la carte la plus jouée à la moins jouée, comme l'onglet Agents ; les nuls dits.
 */
function lignesAgentParCarte(m: Selection): string[] {
  return agentsJoues(m).filter((a) => a.parties >= MIN_PARTIES_FICHE).map((a) => {
    const cartes = victoiresParCarte(m, a.id)
    const tete = `- Victoires ${a.nom === "?" ? `d'un agent non reconnu (${idCourt(a.id)})` : `de ${a.nom}`} par carte`
    if (cartes.length === 0) return `${tete} : aucune partie de ${FILES_COMPLETES_DITES} dont la carte et le résultat sont connus`
    const groupes = cartesDeLAgent(m, a.id)
    const dites = cartes.map((c) => {
      // Le groupe de cette ligne : même nom, mêmes parties, mêmes victoires (le module ne donne pas l'id de la carte).
      const i = groupes.findIndex((g) => g.nom === c.carte && g.parties === c.parties && g.victoires === c.victoires)
      const g = i < 0 ? null : groupes.splice(i, 1)[0]
      const dedans = [c.valeur === null ? "" : partiesEnLettres(c.parties), g === null ? "" : nulsDits(g.nuls)].filter((x) => x !== "").join(", ")
      return `${g === null ? c.carte : nomDeCarte(g.nom, g.id)} ${c.texte}${dedans === "" ? "" : ` (${dedans})`}`
    })
    return `${tete} : ${dites.join(", ")}`
  })
}

/**
 * Section 10, Par carte : le tableau par carte, puis tes victoires par carte avec chacun de tes agents ; en Tout, les files dites en
 * tête ; sans partie : rien (AUCUNE_DONNEE).
 */
export function parCarteEtAgents(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesFiles(m)
  if (t.completes === 0) return t.lignes
  return [...t.lignes, ...(t.lignes.length > 0 ? [""] : []), ...lignesParCarte(m)]
}

/** La phrase avant les zones : ce qu'elles comptent. */
const PHRASE_ZONES = "Mes morts par zone, carte par carte et de chaque côté (toutes mes morts sauf celles par le spike ; noms du jeu en anglais) :"




export const ZONE_DU_RECAP = enPremierePersonne(ZONE_LA_PLUS_PROCHE)

/** La raison d'une partie qui sort des stats par côté (killsEtMortsParCote, premières morts : manches jouées, côté de chaque manche). */
const SANS_COTE = "aucune partie à manches jouées dont le côté de chaque manche est connu"


function mortsEnLettres(n: number): string {
  return `${nombreEnClair(n, 0)} mort${n > 1 ? "s" : ""}`
}

/** Le total d'une liste par zone. */
function totalDesZones(zones: readonly ZoneComptee[]): number {
  let n = 0
  for (const z of zones) n += z.nombre
  return n
}






function ligneMortsParZone(p: PlanDeCarte, nom: string, partiesCarte: number): string {
  const tete = `- ${nom} en ${coteDit(p.cote)}${p.parties === partiesCarte ? "" : `, sur ${partiesEnLettres(p.parties)}`}`
  if (p.morts === 0) return `${tete} : aucune mort relevée`
  const morts = mortsEnLettres(p.morts)
  if (!p.zonesNommees) {
    return `${tete}, ${morts} : zones non nommées (${p.placable ? "aucun lieu nommé pour cette carte dans les ressources de l'iPhone" : "carte absente des ressources de l'iPhone"})`
  }
  const placees = totalDesZones(p.zonesMorts)
  if (placees === 0) return `${tete}, ${morts} : aucune position connue`
  const zones = p.zonesMorts.map((z) => `${z.texte} à ${z.nom}`).join(", ")
  if (placees === p.morts) return `${tete}, ${morts} : ${zones}`
  return `${tete}, ${morts}, dont ${nombreEnClair(p.morts - placees, 0)} sans position connue ; ${placees > 1 ? `les ${nombreEnClair(placees, 0)} autres` : "l'autre"} : ${zones}`
}

/** Le moment de tes morts d'un côté par tranche de 15 s (histogrammeDesMorts) : tes premières morts de chaque manche où tu meurs. */
function ligneHistogramme(m: Selection, cote: Cote, completes: number): string {
  const h = histogrammeDesMorts(m, cote)
  const tete = `- Moment de mes morts en ${coteDit(cote)} (ma ${PREMIERE_MORT_DITE} de chaque manche où je meurs, toute cause, depuis la chute des barrières)`
  if (h.parties === 0) return `${tete} : ${SANS_COTE}`
  const en = h.parties === completes ? "" : ` en ${partiesEnLettres(h.parties)}`
  if (h.morts === 0) return `${tete} : aucune mort relevée${en}`
  return `${tete}, ${nombreEnClair(h.morts, 0)} manche${h.morts > 1 ? "s" : ""}${en} : ${h.tranches.map((t, i) => `${LIBELLES_TRANCHES_MORT[i]} ${t.texte}`).join(", ")}`
}

/**
 * La référence de tes lobbys au moment de ta première mort (dès 5 parties : Confidentialité), son nombre de parties dit quand il diffère
 * des tiennes (`mesParties`), et l'écart calculé sur les moments écrits ; sans elle, « — » et pourquoi.
 */
function lobbysDuMoment(x: MomentDeTaMort, mesParties: number): string {
  const n = x.comparaison.partiesReference
  if (x.reference !== null) {

    const ecart = ecartDuRecap(x.comparaison.valeur, x.comparaison.reference, ECRITURE_SECONDES, "", "vs lobby")
    return `mes lobbys${n === mesParties ? "" : `, sur ${partiesEnLettres(n)}`} : ${x.reference}${ecart === null ? "" : ` ; ${ecart}`}`
  }
  if (n === 0) return `mes lobbys : ${TIRET}, aucune partie où leur moment est gardé`
  if (n < MIN_PARTIES_GROUPE) return `mes lobbys : ${TIRET}, leur moment n'est gardé que sur ${partiesEnLettres(n)}, il en faut ${MIN_PARTIES_GROUPE}`
  return `mes lobbys : ${TIRET}, aucune mort comptée`
}

/** Le moment de ta première mort d'un côté face à tes lobbys (momentDeTaMort) : ta moyenne et ses manches, leur référence et l'écart. */
function ligneMoment(m: Selection, cote: Cote, completes: number): string {
  const x = momentDeTaMort(m, cote)
  const s = x.sommes
  const tete = `- Ma ${PREMIERE_MORT_DITE} en ${coteDit(cote)}`
  if (s.parties === 0) return `${tete} : ${TIRET} (${SANS_COTE})`
  const de = s.parties === completes ? "" : `, en ${partiesEnLettres(s.parties)}`
  const toi = s.den === 0
    ? `${TIRET} (aucune mort relevée${de})`
    : `${x.valeur} en moyenne, sur ${nombreEnClair(s.den, 0)} manche${s.den > 1 ? "s" : ""} où je meurs${de}`
  return `${tete} : ${toi} (${lobbysDuMoment(x, s.parties)})`
}

/**
 * Section 11, Où et quand je meurs : ce qu'est une zone (ZONE_DU_RECAP, ticket 4.48), puis tes morts par zone sur chaque carte jouée des
 * files complètes, en attaque puis en défense, sans seuil
 * de parties (comme le Plan de carte) ; le moment de tes morts par tranche de 15 s, de chaque côté ; le moment de ta première mort face à
 * tes lobbys ; en Tout, les files dites en tête ; sans partie : rien (AUCUNE_DONNEE).
 */
export function ouEtQuandJeMeurs(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesFiles(m)
  if (t.completes === 0) return t.lignes
  const lignes = [...t.lignes, ...(t.lignes.length > 0 ? [""] : [])]
  const cartes: readonly CarteJouee[] = cartesJouees(m)
  if (cartes.length === 0) lignes.push("- Morts par zone : aucune carte connue")
  else {
    lignes.push(ZONE_DU_RECAP, PHRASE_ZONES, "")
    for (const c of cartes) {
      const nom = nomDeCarte(c.nom, c.id)
      const plans = COTES.map((cote) => planDeCarte(m, c.id, cote, sel.donnees.ressources.cartes)!)
      if (plans[0].parties === 0) lignes.push(`- ${nom} : ${SANS_COTE}`)
      else for (const p of plans) lignes.push(ligneMortsParZone(p, nom, c.parties))
    }
  }
  for (const cote of COTES) lignes.push(ligneHistogramme(m, cote, t.completes))
  for (const cote of COTES) lignes.push(ligneMoment(m, cote, t.completes))
  return lignes
}

/**
 * Une stat d'équipe face à ta période précédente (EXPERIENCE.md, Référence), à écrire sur une ligne : sa stat, le début de sa ligne
 * (« - Manches gagnées en attaque : »), son unité (« par manche »), ce qui suit sa valeur (`detail`), la raison d'une partie qui en sort,
 * celle d'un « — » sans cas sur la période (`aucun`) et dans ta période précédente (`aucunAvant`), et ses occurrences au pluriel (« manches
 * de pistolet en attaque » : part d'une catégorie, « x sur y » sous 5) ; null hors des parts.
 */
type FaceALaPeriode = {
  stat: Stat
  prefixe: string
  unite: string
  detail: string
  sansPartie: string
  aucun: string
  aucunAvant: string
  occurrences: string | null
}

/** Ce que le module écrit d'une stat d'équipe : ta valeur, celle de ta période précédente (null sans elle), s'il écrit un écart, et sa comparaison. */
type TextesDuModule = { valeur: string; reference: string | null; ecrit: boolean; comparaison: Comparaison }

/** Les textes d'un chiffre d'Attaque · défense (chiffreCote) : une part d'une catégorie n'a d'écart qu'entre deux parts d'au moins 5 occurrences. */
function textesDuChiffre(c: ChiffreCote): TextesDuModule {
  return { valeur: c.valeur, reference: c.reference, ecrit: c.ecart !== null, comparaison: c.comparaison }
}

/** Les textes d'une stat d'équipe comparée comme une tuile qui n'est pas une part (comparer) : l'écart dès que les deux valeurs existent. */
function textesDeLaStat(m: Selection, stat: Stat): TextesDuModule {
  const c = comparer(m, stat)
  return { valeur: valeurEnClair(c.valeur, stat.mesure), reference: c.reference === null ? null : valeurEnClair(c.reference, stat.mesure), ecrit: c.ecart !== null, comparaison: c }
}

/**
 * Une stat d'équipe face à ta période précédente : ta valeur, avec ses parties quand elles diffèrent de celles des files complètes ;
 * celle de ta période précédente, avec ses parties quand elles diffèrent des tiennes ; l'écart, calculé sur les deux valeurs écrites
 * (ecartDuRecap), sauf sous 5 parties dans ta période précédente ou quand le module n'en écrit pas (moins de 5 occurrences d'un côté ou de
 * l'autre), chaque fois avec sa raison ; « — » et pourquoi. `avecAvant` faux (aucune partie de ces files dans ta période précédente) :
 * ta valeur seule, la section le disant une fois.
 */
function ligneFaceALaPeriode(sel: SelectionRecap, d: FaceALaPeriode, x: TextesDuModule, completes: number, avecAvant: boolean): string {
  const m = sel.metriques
  const toi = sommer(retenues(m.parties, d.stat.files), d.stat.toi)
  const avant = sommer(retenues(m.precedentes ?? [], d.stat.files), d.stat.toi)
  const precedente = precedenteEnClair(sel)
  let texte = d.prefixe
  if (toi.parties === 0) texte += `${TIRET} (${d.sansPartie})`
  else if (toi.den === 0) texte += `${TIRET} (${d.aucun})`
  else texte += `${avecSesParties(`${x.valeur}${d.unite}`, toi.parties, completes)}${d.detail}`
  if (!avecAvant) return texte
  if (avant.parties === 0) return `${texte} ; ${precedente} : ${TIRET} (${d.sansPartie})`
  const quand = avant.parties === toi.parties ? precedente : `${precedente}, sur ${partiesEnLettres(avant.parties)}`
  if (avant.den === 0) return `${texte} ; ${quand} : ${d.aucunAvant}`
  texte += ` ; ${quand} : ${x.reference ?? TIRET}`
  if (toi.parties === 0 || toi.den === 0 || x.reference === null) return texte
  // Une période précédente sous 5 parties n'est pas une référence (un groupe de comparaison agrège au moins 5 parties).
  if (avant.parties < MIN_PARTIES_GROUPE) return `${texte} ; pas d'écart (moins de ${MIN_PARTIES_GROUPE} parties ${precedente})`
  if (!x.ecrit) {
    // Le module n'écrit pas d'écart entre deux parts dont l'une compte moins de 5 occurrences (Trop peu de parties).
    const ou = toi.den < MIN_OCCURRENCES && avant.den < MIN_OCCURRENCES ? `ni sur la période ni ${precedente}` : toi.den < MIN_OCCURRENCES ? "sur la période" : precedente
    return `${texte} ; pas d'écart (moins de ${MIN_OCCURRENCES} ${d.occurrences ?? "cas"} ${ou})`
  }
  const ecart = ecartDuRecap(x.comparaison.valeur, x.comparaison.reference, ecritureDe(d.stat.mesure))
  return ecart === null ? texte : `${texte} ; ${ecart}`
}

/** Ta période précédente a-t-elle des parties des files complètes ? Sinon, la ligne qui le dit (celle de la Synthèse). */
function precedenteVide(sel: SelectionRecap): string | null {
  const precedentes = sel.metriques.precedentes ?? []
  if (retenues(precedentes, "completes").length > 0) return null
  const files = precedentes.length === 0 ? "" : ` de ${FILES_COMPLETES_DITES} (les files de ces stats)`
  return `- Aucune partie${files} dans ma période précédente (${precedenteEnClair(sel)}) : pas d'écart.`
}

/** Les chiffres par côté et après la pose, dans l'ordre de l'onglet Attaque · défense. */
const LIGNES_COTES: readonly { cle: CleCote; tete: string; manches: string }[] = [
  { cle: "manchesAttaque", tete: "Manches gagnées en attaque", manches: "en attaque" },
  { cle: "manchesDefense", tete: "Manches gagnées en défense", manches: "en défense" },
  { cle: "pistoletAttaque", tete: "Pistolets gagnés en attaque", manches: "de pistolet en attaque" },
  { cle: "pistoletDefense", tete: "Pistolets gagnés en défense", manches: "de pistolet en défense" },
  { cle: "apresPose", tete: "Manches gagnées après une pose de mon équipe", manches: "avec une pose de mon équipe" },
  { cle: "retakes", tete: "Retakes (manches gagnées en défense après une pose adverse)", manches: "de défense après une pose adverse" },
]

/**
 * Section 12, Attaque, défense et retakes : tes manches gagnées et tes pistolets de chaque côté, après une pose de ton équipe et tes
 * retakes, face à ta période précédente (manchesParCote, apresLaPose) ; tes kills après la pose, sans référence ; tes poses et tes
 * désamorçages ; en Tout, les files dites en tête ; sans partie : rien (AUCUNE_DONNEE).
 */
export function attaqueDefenseRetakes(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesFiles(m)
  if (t.completes === 0) return t.lignes
  const vide = precedenteVide(sel)
  const parCote = manchesParCote(m), apres = apresLaPose(m)
  const chiffres: Readonly<Partial<Record<CleCote, ChiffreCote>>> = {
    manchesAttaque: parCote.attaque, manchesDefense: parCote.defense, pistoletAttaque: parCote.pistoletAttaque, pistoletDefense: parCote.pistoletDefense,
    apresPose: apres.apresPose, retakes: apres.retakes,
  }
  const lignes = [...t.lignes]
  for (const l of LIGNES_COTES) {
    const aucun = `aucune manche ${l.manches}`
    const d: FaceALaPeriode = {
      stat: STATS_COTES[l.cle], prefixe: `- ${l.tete} : `, unite: "", detail: "", sansPartie: COTE_ILLISIBLE, aucun, aucunAvant: aucun, occurrences: `manches ${l.manches}`,
    }
    lignes.push(ligneFaceALaPeriode(sel, d, textesDuChiffre(chiffres[l.cle]!), t.completes, vide === null))
  }
  const k = apres.killsApresPose, s = k.sommes
  const kills = s.parties === 0
    ? `${TIRET} (aucune partie à manches jouées dont le côté des manches et le moment de chaque pose de mon équipe sont connus)`
    : s.den === 0 ? `${TIRET} (aucune manche avec une pose de mon équipe)`
    : `${avecSesParties(`${k.valeur} par manche avec une pose de mon équipe`, s.parties, t.completes)}, sans référence (ces kills ne sont pas gardés pour mes lobbys)`
  lignes.push(`- Mes kills après la pose : ${kills}`)
  const poses = apres.poses, desamorcages = apres.desamorcages
  lignes.push(poses.parties === 0
    ? `- Mes poses et mes désamorçages : ${TIRET} (aucune partie à manches jouées)`
    : `- Mes poses : ${poses.texte} ; mes désamorçages : ${desamorcages.texte}${poses.parties === t.completes ? "" : `, sur ${partiesEnLettres(poses.parties)}`}`)
  if (vide !== null) lignes.push(vide)
  return lignes
}

/** Les premiers duels, face à ta période précédente, dans l'ordre du bloc Premiers duels de Duels. */
const DUELS_DE_LA_PERIODE: readonly FaceALaPeriode[] = [
  {
    stat: PREMIERS_KILLS, prefixe: `- ${PREMIERS_KILLS_DITS} : `, unite: " par manche", detail: "", sansPartie: "aucune partie à manches jouées",
    aucun: "aucune manche jouée", aucunAvant: "aucune manche jouée", occurrences: null,
  },
  {
    stat: PREMIERES_MORTS, prefixe: `- ${PREMIERES_MORTS_DITES} en duel : `, unite: " par manche", detail: "", sansPartie: "aucune partie à manches jouées",
    aucun: "aucune manche jouée", aucunAvant: "aucune manche jouée", occurrences: null,
  },
  {
    stat: RATIO_PREMIERS_DUELS, prefixe: "- Ratio des premiers duels : ", unite: "", detail: "", sansPartie: "aucune partie à manches jouées",
    aucun: `aucune ${PREMIERE_MORT_DITE} en duel`, aucunAvant: `aucune ${PREMIERE_MORT_DITE} en duel`, occurrences: null,
  },
]

/** Une part d'échanges (alliés vengés, tes morts vengées) : sa valeur, puis son compte : ses occurrences dès 5 (sinon « x sur y »), ses parties quand elles diffèrent. */
function echangeDit(c: ChiffreDuel, completes: number): { valeur: string; compte: string } {
  const s = c.sommes
  const comptes = [s.den < MIN_OCCURRENCES ? "" : `sur ${nombreEnClair(s.den, 0)}`, s.parties === completes ? "" : `en ${partiesEnLettres(s.parties)}`].filter((x) => x !== "")
  return { valeur: c.valeur, compte: comptes.length === 0 ? "" : ` (${comptes.join(", ")})` }
}

/**
 * Tes échanges dans les 5 s, sans référence (echangesEtSurvie) : les alliés tués par un adversaire pendant que tu vis dont tu tues le
 * tueur (alliés vengés : toi seul, jamais l'équipe), puis tes morts par un adversaire dont un allié tue le tueur ; sans cas, pourquoi.
 */
function ligneEchanges(m: Selection, completes: number): string {
  const e = echangesEtSurvie(m)
  const allies = e.alliesVenges.sommes, morts = e.mortsVengees.sommes
  if (allies.parties === 0 && morts.parties === 0) return "- Échanges dans les 5 s : aucune partie à manches jouées"
  const a = echangeDit(e.alliesVenges, completes), b = echangeDit(e.mortsVengees, completes)
  const venges = allies.parties === 0 ? "aucune partie à manches jouées"
    : allies.den === 0 ? "aucun allié tué par un adversaire pendant que je vis"
    : `je venge ${a.valeur} des alliés tués par un adversaire pendant que je vis${a.compte}`
  const vengees = morts.parties === 0 ? "aucune partie à manches jouées"
    : morts.den === 0 ? "aucune mort par un adversaire"
    : `${b.valeur} de mes morts par un adversaire sont vengées par un allié${b.compte}`
  return `- Échanges dans les 5 s, sans référence (ils ne sont pas gardés pour mes lobbys) : ${venges} ; ${vengees}`
}

/**
 * Tes duels par agent adverse (duelsParAgentAdverse), lus dans les cumuls par semaine et par file, qui comptent aussi tes parties gardées
 * avant le détail par agent (entrée 11 de epic-stats-analyses) ; la ligne dit donc ce qu'elle compte vraiment : les semaines entières (du lundi au dimanche) et les files de tes
 * parties de la période, et tes parties gardées de ces semaines et de ces files, dont celles de la période ; un agent sans nom, non reconnu.
 */
function ligneDuelsParAgent(sel: SelectionRecap): string {
  const m = sel.metriques
  const duels = duelsParAgentAdverse(m, sel.donnees.cumuls)
  if (duels.length === 0) return "- Mes duels par agent adverse : aucun dans les cumuls des semaines et des files de mes parties de la période"
  const completes = retenues(m.parties, "completes")
  const cle = (p: Partie) => `${semaineDe(p.debut)}|${p.file}`
  const cles = new Set(completes.map(cle))
  const gardees = selectionner(sel.donnees.parties, { mode: "tout", periode: "tout" }, 0).parties.filter((p) => cles.has(cle(p))).length
  const semaines = new Set(completes.map((p) => semaineDe(p.debut)))
  let lundi = Infinity, dimanche = -Infinity
  for (const p of completes) {
    const t = instant(p)
    if (!Number.isFinite(t)) continue
    const jour = (new Date(t).getDay() + 6) % 7
    lundi = Math.min(lundi, minuit(t, -jour))
    dimanche = Math.max(dimanche, minuit(t, 6 - jour))
  }
  const n = semaines.size
  const quelles = n > 1 ? `les ${nombreEnClair(n, 0)} semaines entières (du lundi au dimanche) de mes parties de la période` : "la semaine entière (du lundi au dimanche) de mes parties de la période"
  const suivies = Math.round((minuit(dimanche, 1) - lundi) / JOUR_MS) === 7 * n
  const dates = !Number.isFinite(lundi) ? "" : suivies ? `, ${periodeEnClair({ debut: jourDe(lundi), fin: jourDe(dimanche) })}` : `, entre le ${jourEnClair(jourDe(lundi))} et le ${jourEnClair(jourDe(dimanche))}`
  const noms = [...new Set(completes.map((p) => `en ${NOMS_DES_FILES[p.file] ?? p.file}`))]
  const files = noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0]
  const parties = `${partiesEnLettres(gardees)} gardée${gardees > 1 ? "s" : ""}, ${gardees === completes.length ? (gardees > 1 ? "toutes de la période" : "de la période") : `dont ${nombreEnClair(completes.length, 0)} de la période`}`
  const liste = duels.map((d) => `contre ${nomDAgentAdverse(d.nom, d.id)} ${d.texte}${d.valeur === null ? "" : ` (sur ${nombreEnClair(d.duels, 0)})`}`).join(", ")
  return "- Mes duels gagnés par agent adverse (un kill entre moi et un adversaire de cet agent), lus dans les cumuls par semaine et par file, "
    + `qui comptent aussi mes parties gardées avant le détail par agent : ${quelles}${dates}, ${files}, où j'ai ${parties} : ${liste}`
}

/**
 * Section 13, Duels : tes premiers duels face à ta période précédente, puis le ratio de chaque côté avec ses 1ᵉʳˢ kills et ses 1ʳᵉˢ morts ;
 * tes échanges, sans référence ; tes clutchs de 1 contre 1 à 1 contre 4 et plus ; tes multi-kills ; ce qui te tue ; tes duels par agent
 * adverse ; la note de Ce qui te tue ; en Tout, les files dites en tête ; sans partie : rien (AUCUNE_DONNEE).
 */
export function duelsEtClutchs(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesFiles(m, "les duels par agent adverse")
  if (t.completes === 0) return t.lignes
  const vide = precedenteVide(sel)
  const lignes = [...t.lignes]
  for (const d of DUELS_DE_LA_PERIODE) lignes.push(ligneFaceALaPeriode(sel, d, textesDeLaStat(m, d.stat), t.completes, vide === null))
  const parCote = premiersDuelsParCote(m)
  for (const cote of COTES) {
    const c = parCote[cote]
    const kills = `${PREMIERS_KILLS_DITS} ${c.premiersKills.valeur}`
    const aucune = `aucune ${PREMIERE_MORT_DITE} en duel en ${coteDit(cote)}`
    const d: FaceALaPeriode = {
      stat: STATS_DU_COTE[cote].ratio, prefixe: `- En ${coteDit(cote)} : ratio `, unite: "",
      detail: ` (${kills} et ${PREMIERES_MORTS_DITES} en duel ${c.premieresMorts.valeur} par manche)`, sansPartie: SANS_COTE,
      aucun: `${aucune} ; ${kills} par manche`, aucunAvant: aucune, occurrences: null,
    }
    lignes.push(ligneFaceALaPeriode(sel, d, textesDuChiffre(c.ratio), t.completes, vide === null))
  }
  if (vide !== null) lignes.push(vide)
  lignes.push(ligneEchanges(m, t.completes))
  const c = clutchs(m)
  const situations = c.detail.map((x) => `${x.libelle}, ${x.situations === 0 ? "aucune situation" : x.valeur === null ? x.texte : `${x.texte} (${nombreEnClair(x.gagnes, 0)} sur ${nombreEnClair(x.situations, 0)})`}`)
  const lues = c.partGagnee.sommes.parties
  lignes.push(lues === 0 ? `- Clutchs : aucune partie à manches jouées où ils se lisent` : `- Clutchs gagnés${lues === t.completes ? "" : `, sur ${partiesEnLettres(lues)}`} : ${situations.join(" ; ")}`)
  const mk = multiKills(m)
  lignes.push(mk.parties === 0
    ? "- Multi-kills : aucune partie à manches jouées"
    : `- Multi-kills, en manches${mk.parties === t.completes ? "" : `, sur ${partiesEnLettres(mk.parties)}`} : ${mk.lignes.map((l) => `${l.libelle} ${l.texte}`).join(" ; ")} (ace : tous les adversaires de la manche tués par moi)`)
  const q = ceQuiTeTue(m)
  const autres = q.texteAutres === null ? "" : ` ; à part, ${q.texteAutres} (spike, chute, tir allié ou sur moi-même, ou arme sans nom)`
  const connues = q.morts - q.autres
  if (q.morts === 0) lignes.push("- Ce qui me tue : aucune mort relevée")
  else if (connues === 0) lignes.push(`- Ce qui me tue : aucune mort par un adversaire dont l'arme ou la capacité est connue${autres}`)
  else {
    const sur = connues > 1 ? `mes ${mortsEnLettres(connues)}` : "ma seule mort"
    lignes.push(`- Ce qui me tue, sur ${sur} par un adversaire dont l'arme ou la capacité est connue : ${q.armes.map((a) => `${a.nom} ${a.texte}`).join(", ")}${autres}`)
  }
  lignes.push(ligneDuelsParAgent(sel))
  lignes.push(`- ${NOTE_CE_QUI_TE_TUE}`)
  return lignes
}

// ─────────────────────────── économie, armes et visée (entrée 5) ───────────────────────────
//
// Sections 14 à 16 (EXPERIENCE.md, Structure du récap texte, lignes 14 à 16), sur la sélection du récap, par les fonctions des entrées
// 4.10 et 4.11 du module des métriques : Économie (types d'achat et leurs stats, achat après un pistolet perdu, manches marquantes,
// dépenses), Armes et visée (kills, tête, corps et jambes, distance par arme ; zones touchées, données et reçues) et Visée à
// l'entraînement (deathmatch contre compétition, sur 8 semaines) ; chaque chiffre est celui de l'onglet, à ses formats. Files, comme le
// module : l'économie sur les files complètes ; les armes et les touches reçues sur les files à manches, les touches données sur toutes
// les files, ce que la tête de section dit en Tout ; la visée sur tout l'historique, quel que soit le mode. Chaque référence est celle de
// mes lobbys, dès 5 parties, son nombre de parties écrit quand il diffère du mien ; un écart se calcule sur les valeurs telles qu'elles
// s'écrivent ; chaque valeur est jugée sur ses propres manches, kills ou parties ; tout « — » donne sa raison ; les 8 semaines de la
// visée, qui peuvent déborder de la période, sont datées.


function manchesEnLettres(n: number): string {
  return `${nombreEnClair(n, 0)} manche${n > 1 ? "s" : ""}`
}


function killsEnLettres(n: number): string {
  return `${nombreEnClair(n, 0)} kill${n > 1 ? "s" : ""}`
}

/** Ce que tes lobbys gardent, accordé : « leur achat est gardé », « leur achat n'est gardé que ». */
type Gardee = { est: string; seulement: string }
const ACHAT_GARDE: Gardee = { est: "leur achat est gardé", seulement: "leur achat n'est gardé que" }
const ECONOMIE_GARDEE: Gardee = { est: "ils sont comparables", seulement: "ils ne sont comparables que" }
const TOUCHES_GARDEES: Gardee = { est: "leurs touches sont gardées", seulement: "leurs touches ne sont gardées que" }
/**
 * La raison d'une référence de lobbys absente (`qui` : « mes lobbys », ou ce qu'ils comptent) : aucune partie où leur valeur est gardée, ou
 * moins de 5 (Confidentialité) ; sinon `sinon`.
 */
function lobbysAbsents(qui: string, g: Gardee, n: number, sinon: string): string {
  if (n === 0) return `${qui} : ${TIRET} (aucune partie où ${g.est})`
  if (n < MIN_PARTIES_GROUPE) return `${qui} : ${TIRET} (${g.seulement} sur ${partiesEnLettres(n)}, il en faut ${MIN_PARTIES_GROUPE})`
  return `${qui} : ${TIRET} (${sinon})`
}

/** La phrase avant le tableau des types d'achat : ce que sont ces types (Définitions des métriques, Types d'achat) et ce que dit chaque colonne. */
const PHRASE_ACHATS = "Mes manches par type d'achat, le mien, d'après la valeur de mon équipement dans la manche : pistolet aux manches 1 et 13 (1 et 5 en vélocité), "
  + `puis éco sous ${nombreEnClair(2000, 0)} crédits, forcé de ${nombreEnClair(2000, 0)} à ${nombreEnClair(3899, 0)}, complet dès ${nombreEnClair(3900, 0)} ; `
  + "ces types diffèrent de ceux de tracker.gg, tirés de la dépense. À part, l'arme gardée : une manche forcée ou complète par la valeur, "
  + "du même côté que la manche d'avant, à laquelle j'ai survécu, avec la même arme ou celle d'un de mes kills ; sa part se lit sur mes "
  + "manches où l'arme est connue (les parties importées de tracker.gg ne l'ont pas : leurs armes gardées restent comptées selon la valeur). "
  + "Le nombre après le type : mes manches de ce type ; victoires, K/D et tête : "
  + "dans ces manches ; chez mes lobbys : leur part de ce type sur leurs manches, par la valeur de l'équipement, armes gardées comprises, "
  + "avec entre parenthèses la mienne comptée de même quand elle diffère :"

/** Les colonnes du tableau des types d'achat ; K/D et tête passent en liste (4 colonnes au plus). */
const ENTETES_ACHATS: readonly string[] = ["Type de manche", "Part de mes manches", "Chez mes lobbys", "Mes victoires", "Mon K/D", "Ma tête"]

/**
 * La part de tes lobbys pour un type (Barres paires de l'onglet : éco, forcé, complet, par la valeur de l'équipement des deux côtés, armes
 * gardées comprises ; la part du pistolet, fixée par la règle, ne s'y compare pas, ni l'arme gardée, qui ne décrit que mes manches), avec
 * leurs parties quand elles diffèrent des tiennes, et ta part comptée de même quand elle diffère de la colonne d'avant ; sinon « — » et pourquoi.
 */
function partDesLobbys(l: LigneAchat): string {
  if (l.type === "gardee") return `${TIRET} (non comparée : elle ne décrit que mes manches)`
  if (!ACHATS_FACE_AUX_LOBBYS.includes(l.type)) return `${TIRET} (non comparée : la règle du jeu fixe les manches de pistolet)`
  const c = l.comparaisonPart, n = c.partiesReference
  const mienne = l.partValeur !== null && l.partValeur.texte !== l.part.texte ? ` (la mienne comptée de même : ${l.partValeur.texte})` : ""
  if (l.partLobbys !== null) return `${n === c.parties ? l.partLobbys : `${l.partLobbys} (sur ${partiesEnLettres(n)})`}${mienne}`
  if (n === 0) return `${TIRET} (aucune partie où elle est gardée)`
  if (n < MIN_PARTIES_GROUPE) return `${TIRET} (gardée sur ${partiesEnLettres(n)}, il en faut ${MIN_PARTIES_GROUPE})`
  return `${TIRET} (aucune manche de mes lobbys)`
}





function partDeMesManches(l: LigneAchat): string {
  if (l.manchesConnues === null) return l.part.texte
  if (l.manchesConnues === 0) return `${TIRET} (aucune manche où mon arme est connue, comme dans les parties importées de tracker.gg)`
  return `${l.part.texte} sur ${manchesEnLettres(l.manchesConnues)} où mon arme est connue`
}

/** Tes victoires d'un type, « x sur y » sous 5 manches, ses manches dites quand elles diffèrent de celles de la ligne ; sinon « — » et pourquoi. */
function victoiresDuType(l: LigneAchat): string {
  if (l.manches === 0) return `${TIRET} (aucune manche de ce type)`
  if (l.manchesDe.victoires === 0) return `${TIRET} (issue inconnue d'au moins une de ces manches dans chaque partie)`
  return l.precisions.victoires === null ? l.victoires.texte : `${l.victoires.texte} ${l.precisions.victoires}`
}

/** Ton K/D ou ta tête d'un type, dès 5 de ses manches, ses manches dites quand elles diffèrent de celles de la ligne ; sinon « — » et pourquoi. */
function valeurDuType(l: LigneAchat, cle: "kd" | "tete", illisible: string, sansCas: string): string {
  const v = l[cle], n = l.manchesDe[cle]
  if (v.valeur !== null) return l.precisions[cle] === null ? v.texte : `${v.texte} ${l.precisions[cle]}`
  if (l.manches === 0) return `${TIRET} (aucune manche de ce type)`
  if (n === 0) return `${TIRET} (${illisible})`
  if (n < MIN_OCCURRENCES) return `${TIRET} (${manchesEnLettres(n)}, il en faut ${MIN_OCCURRENCES})`
  return `${TIRET} (${sansCas})`
}

/**
 * Le tableau des types d'achat (achatsParType) : effectif, ta part, celle de tes lobbys, tes victoires, ton K/D et ta tête ; puis les
 * parties des files complètes qui en sortent (sans manche connue, ou une manche sans type), dites ; aucune partie typée : une ligne.
 */
function lignesAchats(m: Selection): string[] {
  const achats = achatsParType(m)
  const typees = achats[0].sommes.part.parties
  const completes = retenues(m.parties, "completes")
  const sansManche = completes.filter((p) => (p.manches ?? []).length === 0).length
  const sansType = completes.filter((p) => (p.manches ?? []).some((x) => x.achat == null)).length
  const hors: string[] = []
  if (sansManche > 0) hors.push(`${partiesEnLettres(sansManche)} sans manche connue`)
  if (sansType > 0) hors.push(`${partiesEnLettres(sansType)} dont une manche n'a pas de type d'achat`)
  if (typees === 0) return [`- Types d'achat : aucune partie dont chaque manche a son type (${hors.join(" ; ")})`]
  const rangees = achats.map((l) => [
    l.effectif, partDeMesManches(l), partDesLobbys(l), victoiresDuType(l),
    valeurDuType(l, "kd", "kills inconnus d'au moins une de ces manches dans chaque partie", "aucune mort dans ces manches"),
    valeurDuType(l, "tete", "touches inconnues d'au moins une de ces manches dans chaque partie", "aucune touche relevée dans ces manches"),
  ])
  const lignes = tableau(PHRASE_ACHATS, ENTETES_ACHATS, rangees)
  if (hors.length > 0) lignes.push("", `- Hors du tableau : ${hors.join(" ; ")}`)
  return lignes
}

/**
 * Ce que compte la référence de l'achat après un pistolet perdu : chaque joueur de tes lobbys, adversaires compris, après un pistolet perdu
 * par sa propre équipe (`apresPistoletPerdu` de la réduction), non par la tienne.
 */
const LOBBYS_APRES_PISTOLET = "mes lobbys, après un pistolet perdu par leur équipe"

/**
 * L'achat forcé après un pistolet perdu par ton équipe (apresUnPistoletPerdu) : ta part et ses manches (« x sur y » sous 5), celle de tes
 * lobbys après un pistolet perdu par leur équipe (dès 5 parties, leurs parties dites quand elles diffèrent des tiennes), l'écart sur les
 * parts écrites quand le module en écrit un (deux parts d'au moins 5 manches), sinon pourquoi ; sans manche, pourquoi.
 */
function lignePistoletPerdu(m: Selection, completes: number): string {
  const a = apresUnPistoletPerdu(m), s = a.sommes, c = a.comparaison
  const tete = "- Achat forcé après un pistolet perdu par mon équipe (à la manche suivante)"
  if (s.parties === 0) return `${tete} : ${TIRET} (aucune partie dont les manches sont connues)`
  const de = s.parties === completes ? "" : `, sur ${partiesEnLettres(s.parties)}`
  if (s.den === 0) return `${tete}${de} : ${TIRET} (aucune manche après un pistolet perdu par mon équipe dont le type d'achat est connu)`
  const toi = s.den < MIN_OCCURRENCES ? a.valeur : `${a.valeur} (sur ${manchesEnLettres(s.den)})`
  const n = c.partiesReference
  if (a.reference === null) return `${tete}${de} : ${toi} ; ${lobbysAbsents(LOBBYS_APRES_PISTOLET, ACHAT_GARDE, n, "aucune manche après un pistolet perdu par leur équipe")}`
  const leurs = `${LOBBYS_APRES_PISTOLET}${n === s.parties ? "" : `, sur ${partiesEnLettres(n)}`} : ${a.reference}`
  let ecart: string | null
  if (a.ecart !== null) ecart = ecartDuRecap(c.valeur, c.reference, ecritureDe(POURCENTAGE))
  else {
    // Le module n'écrit pas d'écart entre deux parts dont l'une compte moins de 5 manches (« x sur y »).
    const moi = s.den < MIN_OCCURRENCES, eux = unitesEcrites(a.reference) === null
    const ou = moi && eux ? "ni sur la période ni chez mes lobbys" : moi ? "sur la période" : "chez mes lobbys"
    ecart = `pas d'écart (moins de ${MIN_OCCURRENCES} manches après un pistolet perdu ${ou})`
  }
  return `${tete}${de} : ${toi} ; ${leurs}${ecart === null ? "" : ` ; ${ecart}`}`
}

/** Les Manches marquantes (manchesMarquantes) : leurs quatre comptes, en manches, et ce qu'elles comptent ; sans partie lue, pourquoi. */
function ligneMarquantes(m: Selection, completes: number): string {
  const x = manchesMarquantes(m)
  if (x.parties === 0) return "- Manches marquantes : aucune partie dont les manches sont connues"
  const de = x.parties === completes ? "" : `, sur ${partiesEnLettres(x.parties)}`

  const comptes = x.lignes.map((l) => `${l.libelle.charAt(0).toLowerCase()}${l.libelle.slice(1)} ${l.texte}`)
  return `- Manches marquantes, en manches${de} : ${comptes.join(" ; ")} `
    + "(sans perte : gagnée sans aucun mort dans mon équipe ; types des équipes d'après leur équipement moyen, une manche où l'un est inconnu ne comptant pas ; "
    + "ace d'équipe : chacun des cinq joueurs de mon équipe tue)"
}

/**
 * Ce que comptent les Dépenses (tickets 4.47 et 4.54) : valeurs de Riot (équipement, crédits gardés), face aux autres joueurs de mes parties
 * sur les mêmes parties ; ma dépense, seulement sur mes manches vérifiées (plan du ticket 4.54, mesure).
 */
const LIGNE_DEPENSES = "- Dépenses : mes lobbys sont les autres joueurs de mes parties, comptés sur les mêmes parties que moi (celles où chaque joueur a sa valeur à chaque manche ; "
  + "pour ma dépense, celles qui ont la dépense de Riot par manche) ; ma dépense ne compte que mes manches vérifiées, où mes crédits, par les règles du jeu, "
  + "redonnent la dépense que Riot me compte (ou partent d'un départ fixé, au pistolet et en prolongation), et leurs joueurs-manches vérifiés de même."

/** Ticket 4.47 : pourquoi un chiffre des Dépenses vaut « — » (RaisonDepense du module), à la première personne. */
const RAISONS_DEPENSE: Readonly<Record<RaisonDepense, string>> = {
  nonGardees: "aucune partie ne garde ces valeurs pour chaque joueur",
  afk: "un joueur AFK retiré de mon lobby dans chaque partie",
  manquantes: "une valeur manque à une manche dans chaque partie",
}

/** Ticket 4.54 : pourquoi ma dépense vaut « — » (RaisonPoche du module), à la première personne. */
const RAISONS_POCHE: Readonly<Record<RaisonPoche, string>> = {
  sansSecondeSource: "aucune partie n'a la dépense de Riot par manche",
  sansLobby: "un joueur AFK retiré de mon lobby dans chaque partie qui l'a",
  aucuneVerifiee: "aucune de mes manches n'est vérifiée",
}

/**
 * Ticket 4.54 : ma dépense par manche (depensePoche) : ma valeur et mes manches vérifiées ; celle de mes lobbys (dès 5 parties) et l'écart
 * sur les valeurs écrites ; sans valeur, pourquoi.
 */
function lignePoche(c: ChiffrePoche): string {
  const tete = "- Ma dépense par manche (les crédits sortis de ma poche à l'achat, armes payées pour un coéquipier comprises)"
  if (c.valeur === TIRET) return `${tete} : ${TIRET} (${RAISONS_POCHE[c.raison ?? "sansSecondeSource"]})`
  const toi = `${c.valeur} crédits sur ${nombreEnClair(c.manches, 0)} manche${c.manches >= 2 ? "s" : ""} vérifiée${c.manches >= 2 ? "s" : ""}`
  if (c.reference === null) return `${tete} : ${toi} ; ${lobbysAbsents("mes lobbys", ECONOMIE_GARDEE, c.comparaison.partiesReference, "aucune manche de mes lobbys")}`
  const ecart = ecartDuRecap(c.comparaison.valeur, c.comparaison.reference, ecritureDe(DEPENSE_POCHE.mesure))
  return `${tete} : ${toi} ; mes lobbys : ${c.reference}${ecart === null ? "" : ` ; ${ecart}`}`
}

/** Ce que dit chaque chiffre des Dépenses : sa tête de ligne, son unité, ce qui manque sans partie lue. */
const DEPENSES_DITES: Readonly<Record<CleDepense, { tete: string; unite: string }>> = {
  equipement: { tete: "Équipement par manche (ce que je tiens à la fin de l'achat, capacités comprises)", unite: " crédits" },
  restant: { tete: "Crédits gardés par manche (ce qui me reste après l'achat)", unite: " crédits" },
  degatsPour1000: { tete: `Dégâts pour ${nombreEnClair(1000, 0)} crédits d'équipement`, unite: "" },
}

/**
 * Un chiffre des Dépenses (depenses) : ta valeur, ses parties dites quand elles diffèrent de celles des files complètes ; celle de tes
 * lobbys (dès 5 parties, leurs parties dites quand elles diffèrent des tiennes) et l'écart sur les valeurs écrites ; sans partie lue, pourquoi.
 */
function ligneDepense(c: ChiffreDepense, completes: number): string {
  const d = DEPENSES_DITES[c.cle], s = c.sommes, n = c.comparaison.partiesReference
  const tete = `- ${d.tete}`
  if (s.parties === 0) return `${tete} : ${TIRET} (${RAISONS_DEPENSE[c.raison ?? "manquantes"]})`
  const toi = avecSesParties(`${c.valeur}${d.unite}`, s.parties, completes)
  if (c.reference === null) return `${tete} : ${toi} ; ${lobbysAbsents("mes lobbys", ECONOMIE_GARDEE, n, "aucune manche de mes lobbys")}`
  const ecart = ecartDuRecap(c.comparaison.valeur, c.comparaison.reference, ecritureDe(STATS_DEPENSES[c.cle].mesure))
  return `${tete} : ${toi} ; mes lobbys${n === s.parties ? "" : `, sur ${partiesEnLettres(n)}`} : ${c.reference}${ecart === null ? "" : ` ; ${ecart}`}`
}

/**
 * Section 14, Économie : le tableau des types d'achat, l'achat forcé après un pistolet perdu face à tes lobbys, les Manches marquantes et
 * les Dépenses, tous sur les files complètes ; en Tout, les files dites en tête ; aucune partie de ces files aux manches connues : une
 * ligne ; sans partie : rien (AUCUNE_DONNEE).
 */
export function economie(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesFiles(m)
  if (t.completes === 0) return t.lignes
  const avant = [...t.lignes]
  if (!retenues(m.parties, "completes").some((p) => (p.manches ?? []).length > 0)) {
    return [...avant, `- Aucune partie de ${FILES_COMPLETES_DITES} dont les manches sont connues : types d'achat, achat après un pistolet perdu, manches marquantes et dépenses se lisent manche par manche.`]
  }
  const achats = lignesAchats(m)
  const tableauEnTete = achats[0] === PHRASE_ACHATS
  const lignes = [...avant, ...(avant.length > 0 && tableauEnTete ? [""] : []), ...achats, ...(tableauEnTete ? [""] : [])]
  lignes.push(lignePistoletPerdu(m, t.completes), ligneMarquantes(m, t.completes))
  lignes.push(LIGNE_DEPENSES, lignePoche(depensePoche(m)))
  for (const c of depenses(m)) lignes.push(ligneDepense(c, t.completes))
  return lignes
}

/** Les files des armes, des distances et des touches reçues (Files admises : modes à manches), dites en clair. */
const FILES_A_MANCHES_DITES = "toutes les files sauf le deathmatch et le match à mort en équipe"

/**
 * Les files de la section 15 : le nombre de parties à manches de la sélection, et la ligne de tête : aucune quand toutes en sont ; en
 * Tout avec du deathmatch ou du match à mort en équipe, ce qui compte et ce qui n'entre pas, les touches données (toutes les files) dites
 * sur leur ligne ; aucune partie à manches : la ligne qui le dit.
 */
function teteDesArmes(m: Selection): { aManches: number; lignes: string[] } {
  const aManches = retenues(m.parties, "a-manches").length
  const autres = m.parties.length - aManches
  if (aManches === 0) return { aManches, lignes: [`- Aucune partie à manches (${FILES_A_MANCHES_DITES}) sur la période : mes armes et les touches que je reçois ne comptent que ces files.`] }
  if (autres === 0) return { aManches, lignes: [] }
  const comptent = aManches > 1 ? `mes ${partiesEnLettres(aManches)} à manches` : "ma seule partie à manches"
  const restent = autres > 1 ? `mes ${partiesEnLettres(autres)} de deathmatch ou de match à mort en équipe n'y entrent pas` : "ma partie de deathmatch ou de match à mort en équipe n'y entre pas"
  return { aManches, lignes: [`- Mode Tout : ces stats, sauf mes zones touchées données (dites sur leur ligne), ne comptent que ${comptent} (${FILES_A_MANCHES_DITES}) ; ${restent}.`] }
}

/** La phrase avant le tableau des armes : ce que comptent ses colonnes et leurs seuils. */
const PHRASE_ARMES = "Mes kills d'adversaires par arme, du plus grand nombre de kills au plus petit (tête / corps / jambes : mes balles mises aux ennemis tués avec "
  + `l'arme, dans la manche du kill, comme tracker.gg, en parts dès ${MIN_KILLS_ARME} kills aux touches relevées, sinon en touches ; distance moyenne : `
  + `de ma position à celle de la victime au moment du kill, sans la hauteur, dès ${MIN_KILLS_DISTANCE} kills mesurés, où les deux positions sont connues) :`

/** Les colonnes du tableau des armes : tête, corps et jambes dans une seule, pour tenir dans 4 colonnes sans les séparer. */
const ENTETES_ARMES: readonly string[] = ["Arme", "Kills", "Tête / corps / jambes", "Distance moyenne"]

/**
 * Tête, corps et jambes d'une arme (teteCorpsJambesParArme) : ses trois parts, dès 10 kills aux touches relevées, sinon en touches, et
 * ces kills quand ils diffèrent des kills de la ligne (`kills` : tous ses kills des parties à manches, celles sans touche comprises) ;
 * sinon « — » et pourquoi.
 */
function zonesDeLArme(t: TeteParArme | undefined, kills: number): string {
  if (t === undefined || t.killsMesures === 0) return `${TIRET} (aucun kill aux touches relevées)`
  if (t.touches.tete + t.touches.corps + t.touches.jambes === 0) {
    const n = t.killsMesures
    const sur = n !== kills ? `les ${killsEnLettres(n)} dont les touches sont lues` : n > 1 ? `ses ${killsEnLettres(n)}` : "son kill"
    return `${TIRET} (aucune touche relevée sur ${sur})`
  }
  const sur = t.killsMesures === kills ? "" : ` (sur ${killsEnLettres(t.killsMesures)} aux touches relevées)`
  return `${t.zones.map((z) => z.texte).join(" / ")}${sur}`
}

/** La distance moyenne d'une arme (distanceDesKills) et son plus long kill, dès 5 kills mesurés, ceux-ci dits quand ils diffèrent de ses kills ; sinon « — » et pourquoi. */
function distanceDeLArme(d: DistanceArme): string {
  if (d.moyenne !== null) return `${d.texteMoyenne}, ${d.textePlusLong} au plus long${d.precision === null ? "" : `, ${d.precision}`}`
  if (d.mesures === 0) return `${TIRET} (aucun kill mesuré)`
  return `${TIRET} (${killsEnLettres(d.mesures)} mesuré${d.mesures > 1 ? "s" : ""}, il en faut ${MIN_KILLS_DISTANCE})`
}

/**
 * Le tableau des armes, dans l'ordre de distanceDesKills (kills décroissants, puis nom) : kills, tête / corps / jambes, distance ; puis tes
 * kills aux capacités et tes autres kills (killsParArme), hors du tableau ; aucune arme nommée : une ligne.
 */
function lignesArmes(m: Selection): { table: string[]; liste: string[] } {
  const distances = distanceDesKills(m)
  const zones = new Map(teteCorpsJambesParArme(m).map((t) => [t.nom, t]))
  const k = killsParArme(m)
  const capacites = k.lignes.find((l) => l.nom === KILLS_CAPACITES)?.nombre ?? 0
  const autres: string[] = []
  if (capacites > 0) autres.push(`${killsEnLettres(capacites)} aux capacités`)
  if (k.autres > 0) autres.push(`${k.autres > 1 ? `${nombreEnClair(k.autres, 0)} autres kills` : "1 autre kill"} (arme sans nom, chute ou spike)`)
  if (distances.length === 0) return { table: [], liste: [`- Armes : aucun kill d'adversaire à une arme nommée${autres.length === 0 ? "" : ` ; ${autres.join(" ; ")}`}`] }
  const rangees = distances.map((d) => [d.nom, nombreEnClair(d.kills, 0), zonesDeLArme(zones.get(d.nom), d.kills), distanceDeLArme(d)])
  return { table: tableau(PHRASE_ARMES, ENTETES_ARMES, rangees), liste: autres.length === 0 ? [] : [`- Hors du tableau : ${autres.join(" ; ")}`] }
}


function partsDites(zones: readonly { texte: string }[]): string {
  return `tête ${zones[0].texte}, corps ${zones[1].texte}, jambes ${zones[2].texte}`
}

/**
 * Un bloc des Zones touchées (zonesTouchees) : tes parts, sur tes parties où ces touches sont relevées (dites quand elles diffèrent de
 * `base`, les parties de ses files) ; celles de tes lobbys (dès 5 parties, leurs parties dites quand elles diffèrent des tiennes) ; l'écart
 * de la part à la tête, sur les parts écrites, ou pourquoi il n'y en a pas ; sans touche, pourquoi.
 */
function ligneZones(b: BlocZones, tete: string, base: number): string {
  const toi = b.toi
  const n = toi.touches.tete + toi.touches.corps + toi.touches.jambes
  if (toi.parties === 0 || n === 0) return `${tete} : aucune partie où elles sont relevées`
  const de = toi.parties === base ? "" : `, sur ${toi.parties > 1 ? `mes ${partiesEnLettres(toi.parties)}` : "ma seule partie"} où elles sont relevées`
  const np = b.comparaison.partiesReference
  const lobbys = b.lobbys
  if (lobbys === null) return `${tete}${de} : ${partsDites(toi.zones)} ; ${lobbysAbsents("mes lobbys", TOUCHES_GARDEES, np, "aucune touche de mes lobbys")}`
  const leurs = `mes lobbys${np === toi.parties ? "" : `, sur ${partiesEnLettres(np)}`} : ${partsDites(lobbys.zones)}`
  let ecart = ecartDuRecap(toi.zones[0].part, lobbys.zones[0].part, ecritureDe(POURCENTAGE))
  if (ecart === null) {
    // Une barre sous 5 touches s'écrit en « x sur y » : pas d'écart entre une part et des comptes.
    const nl = lobbys.touches.tete + lobbys.touches.corps + lobbys.touches.jambes
    const ou = n < MIN_OCCURRENCES && nl < MIN_OCCURRENCES ? "de part et d'autre" : n < MIN_OCCURRENCES ? "de mon côté" : "chez mes lobbys"
    ecart = `pas d'écart (moins de ${MIN_OCCURRENCES} touches ${ou})`
  }
  return `${tete}${de} : ${partsDites(toi.zones)} ; ${leurs} ; à la tête, ${ecart}`
}

/**
 * Section 15, Armes et visée : le tableau des armes (kills, tête / corps / jambes, distance), tes kills aux capacités et tes autres kills,
 * puis tes zones touchées, données (toutes les files, comme Tirs à la tête) et reçues des adversaires (files à manches), face à tes lobbys ;
 * en Tout avec du deathmatch ou du match à mort en équipe, les files dites en tête ; sans partie : rien (AUCUNE_DONNEE).
 */
export function armesEtVisee(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const t = teteDesArmes(m)
  const z = zonesTouchees(m)
  const armes = t.aManches > 0 ? lignesArmes(m) : { table: [], liste: [] }
  // Avec la ligne de tête (Tout, deathmatch ou match à mort en équipe dans la période), les touches données disent leurs files.
  const donnees = t.lignes.length > 0 ? "- Mes touches, toutes armes, toutes les files comprises (deathmatch et match à mort en équipe aussi)" : "- Mes touches, toutes armes"
  const apres = [...armes.liste, ligneZones(z.donnees, donnees, m.parties.length)]
  if (t.aManches > 0) apres.push(ligneZones(z.recues, "- Les touches que je reçois des adversaires", t.aManches))
  const table = armes.table
  return [...t.lignes, ...(t.lignes.length > 0 && table.length > 0 ? [""] : []), ...table, ...(table.length > 0 ? [""] : []), ...apres]
}

/** La série d'une partie dans la visée (serieVisee de metriques.ts, privée, recopiée) : deathmatch et match à mort en équipe, compétition, ou aucune. */
function serieDeLaVisee(p: Partie): SerieVisee["cle"] | null {
  if (fileAdmise(p.file, "competition")) return "competition"
  return fileAdmise(p.file, "toutes") && !fileAdmise(p.file, "a-manches") ? "deathmatch" : null
}

/** Le nom de chaque série en tête de ligne : celle du deathmatch compte aussi le match à mort en équipe (Files admises). */
const SERIES_VISEE_DITES: Readonly<Record<SerieVisee["cle"], string>> = { deathmatch: "En deathmatch ou match à mort en équipe", competition: "En compétition" }

/** Midi du jour de `ms`, décalé de `decalage` jours, à l'heure de l'iPhone (la semaine ISO d'un jour se lit à midi, comme la visée du module). */
function midi(ms: number, decalage: number = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + decalage, 12).getTime()
}

/**
 * Une série de la visée : ses points semaine par semaine (le lundi de chacune, `lundis`), de la première à la dernière semaine jouée, ses
 * semaines et ses parties où tes touches sont relevées ; `total`, toutes ses parties de ces semaines, celles sans touche dites à part ;
 * aucune, la ligne qui le dit.
 */
function ligneSerieVisee(s: SerieVisee, total: number, lundis: ReadonlyMap<string, number>): string {
  const nom = SERIES_VISEE_DITES[s.cle]
  const n = s.points.length
  if (n === 0) {
    if (total === 0) return `- ${nom} : aucune partie sur ces ${SEMAINES_VISEE} semaines`
    return `- ${nom} : aucune touche relevée sur ${total > 1 ? `mes ${partiesEnLettres(total)}` : "ma seule partie"} de ces semaines`
  }
  const sans = total - s.parties
  const horsCalcul = sans <= 0 ? "" : ` ; ${sans > 1 ? `${nombreEnClair(sans, 0)} autres parties` : "1 autre partie"} de ces semaines sans touche relevée, hors du calcul`
  const resume = n === 1 ? s.points[0].texte : `de ${s.points[0].texte} à ${s.points[n - 1].texte}`
  const points = s.points.map((p) => {
    const lundi = lundis.get(p.semaine)
    return `${lundi === undefined ? `semaine ${p.semaine}` : `semaine du ${jourEnClair(jourDe(lundi), false)}`} ${p.texte} (${partiesEnLettres(p.parties)})`
  })
  return `- ${nom}, ${resume} (${nombreEnClair(n, 0)} semaine${n > 1 ? "s" : ""}, ${partiesEnLettres(s.parties)}) : ${points.join(", ")}${horsCalcul}`
}

/**
 * Section 16, Visée à l'entraînement (deathmatch) : ton % de tête en deathmatch ou match à mort en équipe contre la compétition, semaine
 * par semaine (viseeALEntrainement), sur les 8 semaines qui finissent avec celle où finit le récap (celle d'aujourd'hui pour Semaine, Mois
 * et Acte, comme l'onglet), sur tout l'historique, quel que soit le mode du récap, écrite même sans partie dans la période ; la phrase date
 * ces semaines et dit si elles débordent de la période ; une série sans partie, la ligne qui le dit.
 */
export function viseeALEntrainementDuRecap(sel: SelectionRecap): string[] {
  const periode = periodeDuRecap(sel)
  const [a, mo, j] = periode.fin.split("-").map(Number)
  const fin = new Date(a, mo - 1, j, 12).getTime()
  const v = viseeALEntrainement(sel.donnees.parties, fin)
  const recul = (new Date(fin).getDay() + 6) % 7
  const lundis = new Map<string, number>()
  for (let k = SEMAINES_VISEE - 1; k >= 0; k--) {
    const lundi = midi(fin, -recul - 7 * k)
    lundis.set(semaineDe(new Date(lundi).toISOString()), lundi)
  }
  const premier = jourDe(midi(fin, -recul - 7 * (SEMAINES_VISEE - 1))), dernier = jourDe(midi(fin, 6 - recul))
  const totaux: Record<SerieVisee["cle"], number> = { deathmatch: 0, competition: 0 }
  for (const p of sel.donnees.parties) {
    if (p == null || partieRefaite(p)) continue
    const cle = serieDeLaVisee(p)
    if (cle !== null && lundis.has(semaineDe(p.debut))) totaux[cle]++
  }
  const deborde = premier < periode.debut || dernier > periode.fin
  const phrase = "Mon % de tête (mes touches à la tête sur toutes mes touches, toutes armes), semaine par semaine, en deathmatch ou match à mort en équipe contre la compétition, "
    + `sur les ${SEMAINES_VISEE} semaines (du lundi au dimanche) ${periodeEnClair({ debut: premier, fin: dernier })}, celle où finit le récap et les ${SEMAINES_VISEE - 1} d'avant, `
    + `${deborde ? "qui débordent de sa période" : "toutes dans sa période"} ; mes parties gardées de ces files et de ces semaines où mes touches sont relevées, quel que soit le mode du récap :`
  return [phrase, "", ligneSerieVisee(v.deathmatch, totaux.deathmatch, lundis), ligneSerieVisee(v.competition, totaux.competition, lundis)]
}

// ─────────────────────────── points forts, points à travailler et questions (entrée 6) ───────────────────────────
//
// Sections 17 et 18 (EXPERIENCE.md, Structure du récap texte, lignes 17 et 18 ; Component Patterns, Constat ; Voice and Tone), sur les
// Constats de l'entrée 4.12 (constatsRecap : deux points forts puis trois à travailler, choisis comme dans l'app, chacun du plus net au
// moins net, au plus un par famille et par stat) : chaque constat garde la phrase du module, mise à la première personne, avec la
// précision que la relecture d'une section a exigée pour la même stat, et son écart (sur les valeurs écrites, entrée 4.40) ; puis une
// question par point à travailler, au même numéro, qui reprend sa situation, son moment et son écart, nomme cet écart, tutoie le coach
// et ne suppose ni cause ni conseil. Rien n'est recalculé : valeurs, références, comptes et écarts sont ceux du constat ; une liste vide
// ou courte, une section sans constat ou sans question disent pourquoi, avec leurs comptes ; un agent ou une carte sans nom est dit non
// reconnu.

/** Les constats que prend constatsRecap : deux points forts, puis trois à travailler (Structure du récap texte, Règles, Constats). */
const CONSTATS_VOULUS: Readonly<Record<GenreDuConstat, number>> = { pointFort: 2, aTravailler: 3 }

/** Une phrase du module à la première personne, comme tout le récap : « ton », « ta », « tes » (« Ton »…) deviennent « mon », « ma », « mes ». */
function enPremierePersonne(texte: string): string {
  return texte.replace(/(^|[\s(])([Tt])(on|a|es)(?=\s)/g, (_: string, avant: string, t: string, fin: string) => `${avant}${t === "T" ? "M" : "m"}${fin}`)
}


function capitale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

/** Ce que le récap dit d'un constat : sa phrase, sa situation, son sujet et sa face, à la première personne, un agent ou une carte sans nom dits. */
type ConstatDit = { phrase: string; situation: string | null; sujet: string; face: string }

/** Le rang dans une session compte toutes les files (sessions, sur tout l'historique) : la situation d'un constat de session le dit. */
const TOUTES_FILES_COMPRISES = " (toutes files comprises)"







function constatDit(c: ConstatTire): ConstatDit {
  let phrase = enPremierePersonne(c.phrase), face = enPremierePersonne(c.face)
  let situation = c.situation === null ? null : enPremierePersonne(c.situation)
  if (situation !== null) {
    const agent = (c.famille === "agents" || c.famille === "memesAgents") && situation === "avec ?"
    const carte = (c.famille === "cartes" || c.famille === "cotes") && (situation === "sur ?" || situation.startsWith("sur ?,"))
    const dite = agent ? `avec un agent non reconnu (${idCourt(c.agent ?? "")})`
      : carte ? `sur une carte non reconnue (${idCourt(c.cle.slice(c.cle.indexOf(":") + 1))})${situation.slice("sur ?".length)}`
      : c.famille === "session" ? `${situation}${TOUTES_FILES_COMPRISES}`
      : null
    if (dite !== null) {
      const avant = `${capitale(situation)}, `
      if (phrase.startsWith(avant)) phrase = `${capitale(dite)}, ${phrase.slice(avant.length)}`
      situation = dite
    }
  }
  if (c.famille === "memesAgents" && face === "pour les ? de mes lobbys") {
    const dite = "pour les joueurs de cet agent dans mes lobbys"
    phrase = phrase.replace(` ${face}`, () => ` ${dite}`)
    face = dite
  }
  return { phrase, situation, sujet: enPremierePersonne(c.sujet), face }
}







function precisionDu(c: ConstatTire, question: boolean): string {
  if (c.famille === "lobbys" && c.stat === "apresPistolet") return `${question ? "" : ","} quand leur équipe perd le pistolet`
  if (c.famille === "memesAgents" && !question) return ", lus dans les cumuls par semaine et par file de mes parties de la période, une semaine à cheval sur ses bords comptant entière"
  return ""
}

/** La ligne d'un constat (section 17) : sa phrase à la première personne, sans son point, sa précision, puis son écart. */
export function ligneDuConstat(c: ConstatTire): string {
  return `${constatDit(c).phrase.replace(/\.$/, "")}${precisionDu(c, false)} ; écart ${c.ecart}.`
}

/** Un groupe nominal après « face à » : « face au mois d'avant », « face aux Sage de mes lobbys », « face à mes lobbys ». */
function faceA(groupe: string): string {
  if (groupe.startsWith("le ")) return `face au ${groupe.slice(3)}`
  if (groupe.startsWith("les ")) return `face aux ${groupe.slice(4)}`
  return `face à ${groupe}`
}

/** La référence d'un constat dans sa question, après son écart, une seule fois « face à » : « face à mes lobbys », « face au mois d'avant »… */
const REFERENCES_DES_QUESTIONS: Readonly<Record<FamilleConstat, (face: string) => string>> = {
  lobbys: (f: string) => faceA(f.replace(/^pour /, "")),
  memesAgents: (f: string) => faceA(f.replace(/^pour /, "")),
  periode: (f: string) => faceA(f),
  agents: (f: string) => faceA(f.replace(/^avec /, "")),
  cartes: (f: string) => faceA(f.replace(/^sur /, "")),
  cotes: (f: string) => faceA(`mes manches ${f}`),
  groupe: (f: string) => faceA(`mes parties ${f}`),
  session: (f: string) => faceA(f.replace(/^sur /, "")),
  heure: (f: string) => faceA(f),
}

/** Là où se mesure l'écart, selon le type du constat : en jouant cet agent, sur cette carte, de ce côté, dans ces parties-là, à ces heures-là. */
const LIEUX_DES_QUESTIONS: Readonly<Record<FamilleConstat, string>> = {
  lobbys: "", memesAgents: " en jouant cet agent", periode: "", agents: " en jouant cet agent", cartes: " sur cette carte",
  cotes: " de ce côté", groupe: " dans ces parties-là", session: " dans ces parties-là", heure: " à ces heures-là",
}

/**
 * Trois tournures, prises tour à tour d'une question à la suivante : chacune nomme l'écart, demande d'où il vient ou ce qui l'explique, et
 * comment le combler (d'un point à travailler, un écart négatif est celui d'une stat où plus haut vaut mieux) ou le réduire (plus bas vaut
 * mieux), là où il se mesure.
 */
const TOURNURES: readonly ((verbe: string, lieu: string) => string)[] = [
  (verbe: string, lieu: string) => `d'où vient cet écart, d'après toi, et que dois-je travailler${lieu} pour le ${verbe} ?`,
  (verbe: string, lieu: string) => `qu'est-ce qui explique cet écart, selon toi, et comment le ${verbe}${lieu} ?`,
  (verbe: string, lieu: string) => `quel exercice me proposes-tu pour ${verbe} cet écart${lieu} ?`,
]

/** Face à ma période précédente, l'écart d'une stat est une baisse ou une hausse : trois tournures de même, sans cause supposée. */
const TOURNURES_PERIODE: readonly ((evolution: string) => string)[] = [
  (evolution: string) => `qu'est-ce qui peut expliquer ${evolution}, d'après toi, et sur quoi dois-je travailler ?`,
  (evolution: string) => `à quoi attribues-tu ${evolution}, et sur quoi dois-je travailler ?`,
  (evolution: string) => `quel exercice me proposes-tu face à ${evolution} ?`,
]

/**
 * La question d'un point à travailler (section 18), qui tutoie le coach : « {Situation, }{sujet}, {écart}{ par manche} {face à la référence} :
 * {tournure} » ; `rang`, sa place dans la section, choisit la tournure ; ses valeurs et ses comptes sont dans le constat de même numéro.
 */
export function questionDuConstat(c: ConstatTire, rang: number = 0): string {
  const d = constatDit(c)
  const debut = d.situation === null ? capitale(d.sujet) : `${capitale(d.situation)}, ${d.sujet}`
  const unite = / par (manche|partie)$/.exec(c.valeur)?.[0] ?? ""
  const baisse = c.ecart.startsWith(MOINS_ECRIT)
  const demande = c.famille === "periode"
    ? TOURNURES_PERIODE[rang % TOURNURES_PERIODE.length](baisse ? "cette baisse" : "cette hausse")
    : TOURNURES[rang % TOURNURES.length](baisse ? "combler" : "réduire", LIEUX_DES_QUESTIONS[c.famille])
  return `${debut}, ${c.ecart}${unite} ${REFERENCES_DES_QUESTIONS[c.famille](d.face)}${precisionDu(c, true)} : ${demande}`
}

/** Les constats du récap : ceux de constatsRecap par genre, la phrase sans constat, et, à la demande, tous les candidats (raison d'une liste courte). */
type ConstatsDuRecap = { forts: ConstatTire[]; aTravailler: ConstatTire[]; aucun: string | null; candidats: () => ConstatTire[] }

/** Les constats de chaque sélection, calculés une fois pour les sections 17 et 18 (la sélection et ses données ne changent pas). */
const CONSTATS_DES_SELECTIONS = new WeakMap<SelectionRecap, ConstatsDuRecap>()





function constatsDuRecap(sel: SelectionRecap): ConstatsDuRecap {
  const deja = CONSTATS_DES_SELECTIONS.get(sel)
  if (deja !== undefined) return deja
  const sources: SourcesConstats = { historique: sel.donnees.parties, cumuls: sel.donnees.cumuls }
  const options: OptionsConstats = sel.demande.periode === "autre" ? { periodePrecedente: precedenteEnClair(sel) } : {}
  const choisis = constatsRecap(sel.metriques, sources, options)
  let tous: ConstatTire[] | null = null
  const r: ConstatsDuRecap = {
    forts: choisis.constats.filter((c) => c.genre === "pointFort"),
    aTravailler: choisis.constats.filter((c) => c.genre === "aTravailler"),
    aucun: choisis.aucun,
    candidats: () => {
      if (tous === null) tous = candidatsConstats(sel.metriques, sources, options)
      return tous
    },
  }
  CONSTATS_DES_SELECTIONS.set(sel, r)
  return r
}

/** Mes parties de la période, et celles des files complètes, où se comptent toutes les stats des constats sauf le K/D et les tirs à la tête. */
function partiesDesConstats(m: Selection): { toutes: number; completes: number } {
  return { toutes: m.parties.length, completes: retenues(m.parties, "completes").length }
}


function nEnAQue(n: number): string {
  return n === 0 ? "n'en a aucune" : n === 1 ? "n'en a qu'une" : `n'en a que ${nombreEnClair(n, 0)}`
}

/** Chaque liste de la section 17 : son en-tête, son en-tête vide, ce qui manque, le sens de ses écarts et la forme de ses lignes. */
const LISTES_DITES: Readonly<Record<GenreDuConstat, { tete: string; vide: string; pasDAutre: string; sens: string; puce: (i: number) => string }>> = {
  pointFort: { tete: "Mes points forts :", vide: "Mes points forts", pasDAutre: "Pas d'autre point fort", sens: "en ma faveur", puce: () => "- " },
  aTravailler: {
    tete: "Mes points à travailler, chacun repris par la question de même numéro dans la section suivante :",
    vide: "Mes points à travailler", pasDAutre: "Pas d'autre point à travailler", sens: "en ma défaveur", puce: (i: number) => `${i + 1}. `,
  },
}

/**
 * Pourquoi une liste a moins de constats que voulu (`aucun` : elle n'en a pas), sans point final ; `ecartes` : ses candidats que la règle d'un
 * seul constat par famille et par stat a écartés (sansDoublon : une stat déjà jugée dans la même comparaison par un écart plus net ; une liste
 * courte a pris tous les autres), accordés à leur nombre ; sinon, aucun autre écart net de ce sens, et, quand la période a moins de 10 parties
 * des files complètes, les stats qui ne pouvaient pas se comparer (toutes sauf le K/D et les tirs à la tête, comptés sur toutes les files).
 */
function raisonDuManque(sel: SelectionRecap, c: ConstatsDuRecap, genre: GenreDuConstat, aucun: boolean): { ecartes: number; raison: string } {
  const pris = new Set([...c.forts, ...c.aTravailler].map((x) => x.cle))
  const ecartes = c.candidats().filter((x) => x.genre === genre && !pris.has(x.cle)).length
  const sens = LISTES_DITES[genre].sens
  const deja = "sur une stat déjà jugée dans la même comparaison par un écart plus net"
  if (ecartes === 1) return { ecartes, raison: `${aucun ? "le seul" : "l'autre"} écart net ${sens} porte ${deja}` }
  if (ecartes > 1) return { ecartes, raison: `${aucun ? "les" : "les autres"} écarts nets ${sens} portent chacun ${deja}` }
  const { completes } = partiesDesConstats(sel.metriques)
  const seules = completes >= MIN_PARTIES_COULEUR ? ""
    : ` ; hors du K/D et des tirs à la tête, comptés sur toutes les files, aucune stat ne se compare : la période ${nEnAQue(completes)} de ${FILES_COMPLETES_DITES} (il en faut ${MIN_PARTIES_COULEUR})`
  return { ecartes, raison: `aucun${aucun ? "" : " autre"} écart ${sens} ne ressort assez nettement pour en tirer un constat${seules}` }
}

/** Une liste de la section 17 : son en-tête et ses constats ; vide, la ligne qui le dit ; courte, la ligne qui dit pourquoi. */
function listeDuGenre(sel: SelectionRecap, c: ConstatsDuRecap, genre: GenreDuConstat): string[] {
  const l = LISTES_DITES[genre]
  const pris = genre === "pointFort" ? c.forts : c.aTravailler
  if (pris.length === 0) {
    const r = raisonDuManque(sel, c, genre, true)
    return [`${l.vide} : ${r.ecartes > 0 ? "aucun ; " : ""}${r.raison}.`]
  }
  const lignes = [l.tete, "", ...pris.map((x, i) => `${l.puce(i)}${ligneDuConstat(x)}`)]
  if (pris.length < CONSTATS_VOULUS[genre]) lignes.push("", `${l.pasDAutre} : ${raisonDuManque(sel, c, genre, false).raison}.`)
  return lignes
}

/** La phrase avant les deux listes : comment les constats sont choisis et rangés (jugerConstat, choisir de l'entrée 4.12). */
const PHRASE_CONSTATS = `Mes écarts les plus nets, du plus net au moins net dans chaque liste (net : l'écart rapporté à son incertitude, son erreur type) : chacun dépasse ${nombreEnClair(FACTEUR_ERREUR_TYPE, 1)} fois son erreur type, `
  + `sur au moins ${MIN_PARTIES_COULEUR} parties de part et d'autre, et un seul est gardé par stat et par comparaison.`

/** En Tout, les files des constats : le K/D et les tirs à la tête de toutes les files, les autres stats des files complètes (Files admises). */
const TETE_TOUT_CONSTATS = "- Mode Tout : chaque constat ne compte que les parties où sa stat se calcule : de toutes les files pour le K/D et les tirs à la tête, "
  + `de ${FILES_COMPLETES_DITES} pour les autres stats.`

/** La période ou sa précédente a-t-elle des parties hors des files complètes (deathmatch, escarmouche…) ? */
function horsDesFilesCompletes(m: Selection): boolean {
  const avant = m.precedentes ?? []
  return retenues(m.parties, "completes").length < m.parties.length || retenues(avant, "completes").length < avant.length
}

/**
 * La section 17 sans constat, avec la vraie raison : moins de 10 parties dans la période, aucune comparaison possible (chaque constat compte
 * au moins 10 de mes parties, toutes de la période) ; en Tout, moins de 10 parties des files complètes, seuls le K/D et les tirs à la tête
 * pouvaient les atteindre ; sinon, la phrase du module à la première personne (rien ne ressort assez nettement).
 */
function phraseSansConstat(sel: SelectionRecap, aucun: string): string {
  const { toutes, completes } = partiesDesConstats(sel.metriques)
  const enTout = sel.demande.mode === "tout" ? " en tout" : ""
  if (toutes < MIN_PARTIES_COULEUR) return `Aucun constat : chacun compte au moins ${MIN_PARTIES_COULEUR} de mes parties, et la période en a ${nombreEnClair(toutes, 0)}${enTout}.`
  const phrase = enPremierePersonne(aucun).replace(/\.$/, "")
  if (completes >= MIN_PARTIES_COULEUR) return `${phrase}.`
  return `${phrase} : un constat compte au moins ${MIN_PARTIES_COULEUR} de mes parties, et la période ${nEnAQue(completes)} de ${FILES_COMPLETES_DITES}, `
    + `${nombreEnClair(toutes, 0)} en tout ; seuls mon K/D et mes tirs à la tête, comptés sur toutes les files, pouvaient les atteindre.`
}

/**
 * Section 17, Ce que disent mes chiffres : en Tout, les files des constats ; la phrase qui dit comment ils sont choisis ; mes points forts,
 * puis mes points à travailler, numérotés comme leurs questions ; aucun constat : sa raison (phraseSansConstat) ; sans partie : rien
 * (AUCUNE_DONNEE).
 */
export function ceQueDisentMesChiffres(sel: SelectionRecap): string[] {
  const m = sel.metriques
  if (m.parties.length === 0) return []
  const c = constatsDuRecap(sel)
  const tete = sel.demande.mode === "tout" && horsDesFilesCompletes(m) ? [TETE_TOUT_CONSTATS, ""] : []
  if (c.aucun !== null) return [...tete, phraseSansConstat(sel, c.aucun)]
  return [...tete, PHRASE_CONSTATS, "", ...listeDuGenre(sel, c, "pointFort"), "", ...listeDuGenre(sel, c, "aTravailler")]
}

/**
 * Pourquoi la section 18 n'a pas de question : trop peu de parties pour un constat ; en Tout, trop peu de parties des files complètes pour la
 * plupart des stats ; rien d'assez net ; ou la raison de la liste vide des points à travailler (raisonDuManque).
 */
function sansQuestion(sel: SelectionRecap, c: ConstatsDuRecap): string {
  if (c.aucun === null) return `Aucune question : ${raisonDuManque(sel, c, "aTravailler", true).raison}.`
  const { toutes, completes } = partiesDesConstats(sel.metriques)
  if (toutes < MIN_PARTIES_COULEUR) return `Aucune question : trop peu de parties pour un constat (${nombreEnClair(toutes, 0)}, il en faut ${MIN_PARTIES_COULEUR}).`
  if (completes < MIN_PARTIES_COULEUR) {
    return `Aucune question : aucun constat, avec trop peu de parties de ${FILES_COMPLETES_DITES} pour la plupart des stats (${nombreEnClair(completes, 0)}, il en faut ${MIN_PARTIES_COULEUR}).`
  }
  return "Aucune question : rien ne ressort assez nettement de mes chiffres pour un point à travailler."
}

/**
 * Section 18, Questions pour toi, coach : une question numérotée par point à travailler de la section 17, au même numéro, et aucune
 * autre, chacune avec la tournure de son rang ; aucun point à travailler : pourquoi (sansQuestion) ; sans partie : rien (AUCUNE_DONNEE).
 */
export function questionsPourToi(sel: SelectionRecap): string[] {
  if (sel.metriques.parties.length === 0) return []
  const c = constatsDuRecap(sel)
  if (c.aTravailler.length === 0) return [sansQuestion(sel, c)]
  return c.aTravailler.map((x, i) => `${i + 1}. ${questionDuConstat(x, i)}`)
}

// ─────────────────────────── analyses d'entraînement (epic-stats-analyses, entrée 8) ───────────────────────────
//
// Les analyses d'entraînement affichées (CAP-24, analyses-entrainement.md), chacune dans la section que lui donne EXPERIENCE.md,
// Structure du récap texte (entrée 1 de epic-stats-analyses), sous la case de cette section, sans case à part : 12 à 14 dans la 8
// (Dans quelles conditions je gagne), 7 et 8 dans la 10 (par carte), 5 dans la 11 (Comment je meurs), 9 dans la 12 (ma distance au
// spike après une pose de mon équipe, toutes cartes puis par carte), 10 et ce que chaque agent adverse me fait (entrée 11) dans la 13,
// 1 à 4 dans la 15. Chaque valeur, effectif, retrait et écart vient du module de l'analyse sur la sélection du récap (analyses-*.ts, les
// fonctions mêmes de l'écran), écrit à la première personne ; jamais un pourcentage sous 5 cas : « — (peu de données : x sur y …) ».
// En plus de l'écran (EXPERIENCE.md, Règles) : le détail par arme des duels selon la distance, le détail par compo et la distance au
// spike toutes cartes, somme des comptes du module carte par carte. Une stat d'équipe (4 contre 5, conditions de victoire) face à ma
// période précédente se lit de ses parties par la lecture même de la stat, comme chiffreDEquipe du socle et ligneFaceALaPeriode : même
// valeur, mêmes seuils (5 parties d'avant, puis 5 cas de chaque côté), écart sur les valeurs écrites ; en Autre, où le module n'a pas de
// référence (périmètre « tout »), le récap compare aux jours d'avant comme ses autres sections. Ni l'analyse 6 (regard), ni la 11
// (ultime) : aucune source ne les donne (entrées 5 et 7).


const INSECABLE = String.fromCharCode(0x00a0)


function compteDit(n: number, singulier: string, pluriel: string = `${singulier}s`): string {
  return `${nombreEnClair(n, 0)} ${n > 1 ? pluriel : singulier}`
}


function gagnesDits(n: number, feminin: boolean = false): string {
  const e = feminin ? "e" : ""
  return n === 0 ? `aucun${e} gagné${e}` : `${nombreEnClair(n, 0)} gagné${e}${n > 1 ? "s" : ""}`
}

/** La première lettre en minuscule (le texte d'un module repris au milieu d'une ligne). */
function minusculeDebut(texte: string): string {
  return texte.charAt(0).toLowerCase() + texte.slice(1)
}

/** Une phrase sans son point final (reprise dans une ligne de liste). */
function sansPointFinal(texte: string): string {
  return texte.replace(/\.$/, "")
}

/**
 * Une phrase d'un module d'analyse à la première personne : les possessifs (enPremierePersonne), « toi » en « moi », « te tue », « te
 * voit » en « me tue », « me voit ». Seulement pour les phrases dont les modules fixent les mots (ni « tu » ni verbe à la 2ᵉ personne
 * conjugué autrement).
 */
function aLaPremierePersonne(texte: string): string {
  return enPremierePersonne(texte)
    .replace(/(^|[\s(])toi(?=[\s,.;:)]|$)/g, "$1moi")
    .replace(/(^|[\s(])te (?=tue|voit)/g, "$1me ")
}





function chiffreDit(c: ChiffreAnalyse, comptes: string, aucun: string): string {
  if (c.den === 0) return aucun
  if (c.valeur === null) return `${TIRET} (${c.mention === null ? comptes : `${c.mention} : ${comptes}`})`
  return `${c.texte} (${comptes})`
}






type EquipeDite = {
  comptes: (num: number, den: number) => string
  casDits: (n: number) => string
  cas: string
  aucun: string
  sansPartie: string
  casSontParties: boolean
}

/**
 * La référence d'une stat d'équipe telle que le module la donne (ReferenceDEquipe de chiffreDEquipe), dite : sans partie, la phrase sans
 * partie ; sa valeur et ses comptes (le nombre gagné se relit de sa valeur et de ses cas, sans recalcul) ; « — » toujours avec sa raison,
 * moins de 5 parties d'abord, puis moins de 5 cas, comme le module.
 */
function referenceDite(r: ReferenceDEquipe, d: EquipeDite): string {
  if (r.parties === 0) return d.sansPartie
  const enParties = d.casSontParties ? "" : `, en ${partiesEnLettres(r.parties)}`
  if (r.valeur !== null) return `${r.texte} (${d.comptes(Math.round(r.valeur * r.cas), r.cas)}${enParties})`
  const quoi = r.cas === 0 ? `${d.aucun}${enParties}` : `${d.casDits(r.cas)}${enParties}`
  const faut = r.parties < MIN_PARTIES_GROUPE ? `il en faut ${MIN_PARTIES_GROUPE} parties` : `il en faut ${MIN_CAS_ANALYSE} ${d.cas}`
  return `${TIRET} (${quoi}, ${faut})`
}







function ligneDEquipe(sel: SelectionRecap, libelle: string, c: ChiffreDEquipe, d: EquipeDite): string {
  const toi = `- ${libelle} : ${chiffreDit(c, d.comptes(c.num, c.den), c.parties === 0 ? d.sansPartie : d.aucun)}`
  if (c.reference === null) return toi
  const suite = c.ecart !== null ? ` ; écart ${c.ecart}` : c.raison !== null ? ` ; ${c.raison.recap}` : ""
  return `${toi} ; ${precedenteEnClair(sel)} : ${referenceDite(c.reference, d)}${suite}`
}

/** La comparaison d'une analyse d'équipe, dite en tête de sa ligne : « face au mois d'avant » ; en période choisie par dates, pourquoi aucune. */
function faceALaPrecedente(sel: SelectionRecap, avant: string | null): string {
  return avant === null ? "sans comparaison à une période précédente (période choisie par dates : ces analyses n'en ont qu'en semaine, en mois ou en acte, comme à l'écran)" : faceA(precedenteEnClair(sel))
}

// ─── section 8 : dans quelles conditions je gagne (analyses 12 à 14) ───

/** Les conditions, nommées à la première personne (les libellés dits de l'écran). */
const RANGS_DITS: Readonly<Record<CleRang, string>> = { dessus: "Lobby au-dessus de mon rang", egal: "Lobby à mon rang", dessous: "Lobby en dessous de mon rang" }
const COTES_DE_DEPART_DITS: Readonly<Record<Cote, string>> = { attaque: "Départ en attaque", defense: "Départ en défense" }
const COMPOS_DITES: Readonly<Record<CleCompo, string>> = { avec: "Équipe avec un contrôleur", sans: "Équipe sans contrôleur" }
/** Les étiquettes des trois groupes, à la première personne, pour dire un groupe sans partie. */
const GROUPES_DE_CONDITIONS: Readonly<Record<"rang" | "cote" | "compo", string>> = {
  rang: "Selon le rang de mon lobby", cote: "Selon mon côté de départ", compo: "Selon la compo de mon équipe",
}


function victoiresSurParties(num: number, den: number): string {
  return `${num === 0 ? "aucune victoire" : compteDit(num, "victoire")} sur ${compteDit(den, "partie")}`
}
const VICTOIRES_DITES: EquipeDite = {
  comptes: victoiresSurParties, casDits: (n: number) => compteDit(n, "partie"), cas: "parties", aucun: "aucune partie dans ce cas", sansPartie: "aucune partie dans ce cas",
  casSontParties: true,
}

/**
 * Dans quelles conditions je gagne (conditionsDeVictoire, Évolution) : l'effectif ; les sept stats d'équipe face à ma période précédente
 * (rang du lobby en compétition seulement, côté de départ, avec ou sans contrôleur), un groupe sans partie dit par la phrase du module ;
 * le détail par compo, sans référence ; les méthodes ; les retraits, comptés.
 */
function lignesConditions(sel: SelectionRecap): string[] {
  const m = sel.metriques
  const c = conditionsDeVictoire(m)
  if (c.vide !== null) return [`- Dans quelles conditions je gagne : ${minusculeDebut(sansPointFinal(c.vide))}`]
  const effectif = [`sur ${compteDit(c.completes, "partie")} de ${FILES_COMPLETES_DITES}`]
  if (c.horsFiles > 0) effectif.push(`${compteDit(c.horsFiles, "partie")} ${c.horsFiles > 1 ? "d'autres files écartées" : "d'une autre file écartée"}`)
  if (c.competition > 0 && c.competition !== c.completes) effectif.push(`rang du lobby sur ${compteDit(c.competition, "partie")} de compétition`)
  const lignes = [`- Dans quelles conditions je gagne : part de mes parties gagnées ${faceALaPrecedente(sel, c.avant)}, ${effectif.join(" ; ")}`]
  for (const g of c.groupes) {
    if (g.vide !== null) {
      lignes.push(`- ${GROUPES_DE_CONDITIONS[g.cle]} : ${minusculeDebut(sansPointFinal(aLaPremierePersonne(g.vide)))}`)
      continue
    }
    if (g.cle === "rang") for (const k of CLES_RANG) lignes.push(ligneDEquipe(sel, RANGS_DITS[k], c.rang[k], VICTOIRES_DITES))
    if (g.cle === "cote") for (const k of COTES) lignes.push(ligneDEquipe(sel, COTES_DE_DEPART_DITS[k], c.cote[k], VICTOIRES_DITES))
    if (g.cle === "compo") for (const k of CLES_COMPO) lignes.push(ligneDEquipe(sel, COMPOS_DITES[k], c.compo[k], VICTOIRES_DITES))
  }
  if (c.compos.length > 0) {
    const compos = c.compos.map((l) => `${compoEnClair(l.compo)} : ${chiffreDit(l.part, victoiresSurParties(l.victoires, l.parties), "aucune partie")}`)
    lignes.push(`- Par compo de mon équipe, sans référence (parts écrites de la meilleure à la moins bonne, puis les compos à peu de données par nombre de parties) : ${compos.join(" ; ")}`)
  }
  // La méthode de chaque groupe qui a ses chiffres (un groupe sans partie l'a déjà dit en une ligne).
  const methodes: Readonly<Record<"rang" | "cote" | "compo", string>> = { rang: METHODE_RANG, cote: METHODE_COTE, compo: METHODE_COMPO }
  for (const g of c.groupes) if (g.vide === null) lignes.push(`- ${sansPointFinal(aLaPremierePersonne(methodes[g.cle]))}`)
  const horsRang: string[] = []
  if (c.sansTonRang > 0) horsRang.push(`${compteDit(c.sansTonRang, "partie")} sans mon rang`)
  if (c.lobbyIncomplet > 0) horsRang.push(`${compteDit(c.lobbyIncomplet, "partie")} aux rangs du lobby incomplets (moins de 3 joueurs classés autres que moi dans une des deux équipes)`)
  const hors: string[] = []
  if (horsRang.length > 0) hors.push(`hors du rang du lobby, ${horsRang.join(" et ")}`)
  if (c.sansCote > 0) hors.push(`hors du côté de départ, ${compteDit(c.sansCote, "partie")} sans côté à la première manche`)
  if (c.sansCompo > 0) hors.push(`hors de la compo, ${compteDit(c.sansCompo, "partie")} sans la compo de mon équipe`)
  if (c.sansResultat > 0) hors.push(`hors de tout, ${compteDit(c.sansResultat, "partie")} sans résultat`)
  if (hors.length > 0) lignes.push(`- Retirées de ces conditions : ${hors.join(" ; ")}`)
  return lignes
}

// ─── section 10 : par carte, premiers duels par zone et positions en défense (analyses 7 et 8) ───

/** Les trois analyses de chaque carte jouée des files complètes, dans l'ordre de cartesJouees (la plus jouée d'abord). */
function analysesDesCartes(sel: SelectionRecap): { carte: CarteJouee; a: AnalysesDeCarte }[] {
  const r: { carte: CarteJouee; a: AnalysesDeCarte }[] = []
  for (const carte of cartesJouees(sel.metriques)) {
    const a = analysesDeCarte(sel.metriques, carte.id, sel.donnees.ressources.cartes)
    if (a !== null) r.push({ carte, a })
  }
  return r
}


function premiersDuelsDits(n: number): string {
  return compteDit(n, "premier duel", "premiers duels")
}

/** Mes premiers duels d'un côté d'une carte (analyse 7) : le total, puis chaque zone (dans l'ordre du module), ou pourquoi aucune ; les retraits. */
function lignePremiersDuels(nom: string, d: PremiersDuels, zonesNommees: boolean): string {
  const tete = `- ${nom}, mes premiers duels en ${coteDit(d.cote)}`
  const tous = d.duels + d.sansPosition
  const sansTueur = d.sansTueur > 0 ? ` ; hors des duels, ${compteDit(d.sansTueur, "première mort", "premières morts")} sans tueur adverse` : ""
  if (tous === 0) return `${tete} : aucun${sansTueur}`
  const total = chiffreDit(d.part, `${gagnesDits(d.gagnes)} sur ${premiersDuelsDits(d.duels)}`, `aucun à ma position connue, sur ${premiersDuelsDits(tous)}`)
  const morceaux = [`${tete} : ${total}`]
  if (!zonesNommees) morceaux.push("zones non nommées sur cette carte")
  else if (d.zones.length > 0) {
    // Les zones chiffrées, une à une ; celles sous 5 premiers duels réunies en une phrase courte, nom et effectif.
    const chiffrees = d.zones.filter((z) => z.part.valeur !== null), peu = d.zones.filter((z) => z.part.valeur === null)
    if (chiffrees.length > 0) morceaux.push(`par zone : ${chiffrees.map((z) => `${z.zone} ${z.part.texte} (${gagnesDits(z.gagnes)} sur ${nombreEnClair(z.duels, 0)})`).join(" ; ")}`)
    if (peu.length > 0) morceaux.push(`${PEU_DE_DONNEES} (moins de ${MIN_CAS_ANALYSE} premiers duels) : ${peu.map((z) => z.libelle).join(", ")}`)
  }
  if (zonesNommees && d.sansPosition > 0) morceaux.push(`hors du calcul, ${premiersDuelsDits(d.sansPosition)} sans ma position`)
  return `${morceaux.join(" ; ")}${sansTueur}`
}


function parMancheDit(c: ChiffreAnalyse, mot: string): string {
  return `${c.texte} ${c.valeur !== null && Math.round(c.valeur * 100) >= 200 ? `${mot}s` : mot}`
}


function chiffresDeManches(x: { gagnees: ChiffreAnalyse; survie: ChiffreAnalyse; kills: ChiffreAnalyse; morts: ChiffreAnalyse }): string {
  if (x.gagnees.valeur === null) return PEU_DE_DONNEES
  return `${x.gagnees.texte} gagnées, survie ${x.survie.texte}, ${parMancheDit(x.kills, "kill")} et ${parMancheDit(x.morts, "mort")} par manche`
}

/** Mes positions en défense sur une carte (analyse 8) : le total, puis chaque zone (dans l'ordre du module), ou pourquoi aucune ; les retraits. */
function ligneDefense(nom: string, d: PositionsEnDefense, zonesNommees: boolean): string {
  const tete = `- ${nom}, mes positions en défense`
  const retraits: string[] = []
  if (d.sansPosition > 0) retraits.push(`hors du calcul, ${compteDit(d.sansPosition, "manche")} sans ma position au premier kill`)
  if (d.sansIssue > 0) retraits.push(`hors du calcul, ${compteDit(d.sansIssue, "manche")} sans issue connue`)
  const fin = retraits.length === 0 ? "" : ` ; ${retraits.join(" ; ")}`
  if (d.manches + d.sansPosition === 0) return `${tete} : aucune manche en défense à l'issue connue${fin}`
  if (d.manches === 0) return `${tete} : ma position au premier kill manque à chacune de mes manches en défense, aucune zone${fin}`
  const morceaux = [`${tete} : ${compteDit(d.manches, "manche")}, ${chiffresDeManches(d)}`]
  if (!zonesNommees) morceaux.push("zones non nommées sur cette carte")
  else {
    // Les zones chiffrées, une à une ; celles sous 5 manches réunies en une phrase courte, nom et effectif.
    const chiffrees = d.zones.filter((z) => z.gagnees.valeur !== null), peu = d.zones.filter((z) => z.gagnees.valeur === null)
    if (chiffrees.length > 0) morceaux.push(`par zone : ${chiffrees.map((z) => `${z.zone}, ${compteDit(z.manches, "manche")} : ${chiffresDeManches(z)}`).join(" ; ")}`)
    if (peu.length > 0) morceaux.push(`${PEU_DE_DONNEES} (moins de ${MIN_CAS_ANALYSE} manches) : ${peu.map((z) => z.libelle).join(", ")}`)
  }
  return `${morceaux.join(" ; ")}${fin}`
}

/**
 * Par carte (section 10), mes premiers duels par zone de chaque côté et mes positions en défense, carte par carte (analysesDeCarte, fiche
 * de Cartes) : les méthodes, qui disent « ma zone la plus proche » quand une carte nomme ses zones (la définition entière, ZONE_DU_RECAP,
 * reste une fois dans la section 11, ticket 4.48), sans zone sinon ; puis les lignes de chaque carte ; aucune carte des files complètes :
 * rien.
 */
function lignesAnalysesParCarte(sel: SelectionRecap): string[] {
  const cartes = analysesDesCartes(sel)
  if (cartes.length === 0) return []
  const lignes: string[] = cartes.some((x) => x.a.zonesNommees)
    ? [
      `- Premiers duels par zone : ${minusculeDebut(sansPointFinal(aLaPremierePersonne(METHODE_PREMIERS_DUELS)))}`,
      `- Positions en défense : ${minusculeDebut(sansPointFinal(aLaPremierePersonne(METHODE_DEFENSE)))}`,
    ]
    : [
      // Aucune carte n'a ses zones nommées sur l'iPhone : les méthodes sans zone.
      "- Premiers duels : le premier kill de chaque manche, moi tueur ou victime d'un adversaire ; part gagnée",
      "- Positions en défense : mes manches en défense, de chacune la part gagnée, la survie, les kills et les morts par manche",
    ]
  for (const { carte, a } of cartes) {
    const nom = nomDeCarte(carte.nom, carte.id)
    for (const cote of COTES) lignes.push(lignePremiersDuels(nom, a.premiersDuels[cote], a.zonesNommees))
    lignes.push(ligneDefense(nom, a.defense, a.zonesNommees))
    if (a.manchesSansCote > 0) lignes.push(`- ${nom} : ${compteDit(a.manchesSansCote, "manche")} sans côté, hors des premiers duels et des positions en défense`)
  }
  return lignes
}

// ─── section 11 : comment je meurs (analyse 5) ───

/**
 * Comment je meurs (commentTuMeurs, Duels) : l'effectif ; mes morts isolées et mes morts vengées ; vengées selon mon isolement ; les
 * méthodes ; les retraits, comptés ; sans mort par un adversaire, la phrase du module.
 */
function lignesCommentJeMeurs(m: Selection): string[] {
  const c = commentTuMeurs(m)
  const ecartees = c.sansKills > 0 ? ` ; ${compteDit(c.sansKills, "partie")} sans la liste des kills ${c.sansKills > 1 ? "écartées" : "écartée"}` : ""
  const effectif = `${c.parties > 0 ? `sur ${compteDit(c.parties, "partie")}` : "aucune partie lue"}${ecartees}`
  if (c.vide !== null) return [`- Comment je meurs : ${minusculeDebut(sansPointFinal(aLaPremierePersonne(c.vide)))}${c.parties > 0 ? ` ; ${effectif}` : ecartees}`]
  const lignes = [`- Comment je meurs, mes morts par un adversaire (ni le spike, ni une chute, ni un tir allié) : ${effectif}`]
  const i = c.isolees
  const aPosition = i.mesurees < c.morts ? " à ma position connue" : ""
  lignes.push(`- Morts isolées : ${chiffreDit(i, `${nombreEnClair(i.isolees, 0)} sur ${compteDit(i.mesurees, "mort")}${aPosition}`, `${TIRET} (aucune mort à ma position connue)`)}`)
  lignes.push(`- Morts vengées : ${chiffreDit(c.vengees, `${nombreEnClair(c.vengees.num, 0)} sur ${compteDit(c.vengees.den, "mort")}`, `${TIRET} (aucune mort dont la manche a ses comptes de vengeance)`)}`)
  if (c.vengeesIsolees.morts + c.vengeesNonIsolees.morts > 0) {
    const v = (x: { morts: number; vengees: number; part: ChiffreAnalyse }) => chiffreDit(x.part, `${nombreEnClair(x.vengees, 0)} sur ${compteDit(x.morts, "mort")}`, "aucune")
    lignes.push(`- Vengées selon mon isolement, sur mes morts seules de leur manche : isolées ${v(c.vengeesIsolees)} ; non isolées ${v(c.vengeesNonIsolees)}`)
  }
  lignes.push(`- ${sansPointFinal(aLaPremierePersonne(NOTE_ISOLEE))} ; ${minusculeDebut(sansPointFinal(aLaPremierePersonne(NOTE_VENGEE)))}`)
  const hors: string[] = []
  if (c.sansPosition > 0) hors.push(`${compteDit(c.sansPosition, "mort")} sans ma position, hors des isolées`)
  if (c.horsVengees > 0) {
    hors.push(`${compteDit(c.horsVengees, "mort")} hors des vengées selon mon isolement, ${c.horsVengees > 1 ? "leur manche" : "sa manche"} n'ayant pas exactement une mort par un adversaire (j'y meurs plus d'une fois, ou ses comptes manquent)`)
  }
  if (c.vengees.sansVengees > 0) {
    const n = c.vengees.sansVengees
    hors.push(`${compteDit(n, "partie")} dont une manche n'a pas ses comptes de vengeance, ${n > 1 ? "retirées" : "retirée"} des morts vengées`)
  }
  if (hors.length > 0) lignes.push(`- Hors du calcul : ${hors.join(" ; ")}`)
  return lignes
}

// ─── section 12 : ma distance au spike après une pose de mon équipe (analyse 9) ───


const TRANCHES_SPIKE_DITES: Readonly<Record<CleTrancheSpike, string>> = {
  pres: `à moins de ${SPIKE_PRES}${INSECABLE}m`, milieu: `de ${SPIKE_PRES} à ${SPIKE_LOIN}${INSECABLE}m`, loin: `à plus de ${SPIKE_LOIN}${INSECABLE}m`,
}


function trancheApresPoseDite(t: { cle: CleTrancheSpike; manches: number; gagnees: ChiffreAnalyse; survie: ChiffreAnalyse; kills: ChiffreAnalyse }): string {
  const tranche = TRANCHES_SPIKE_DITES[t.cle]
  if (t.manches === 0) return `${tranche}, aucune manche`
  const chiffres = t.gagnees.valeur === null ? PEU_DE_DONNEES : `${t.gagnees.texte} gagnées, survie ${t.survie.texte}, ${parMancheDit(t.kills, "kill")} après la pose par manche`
  return `${tranche}, ${compteDit(t.manches, "manche")} : ${chiffres}`
}

/** La méthode de l'après-pose (METHODE_APRES_POSE de Cartes), à la première personne. */
const METHODE_APRES_POSE_DU_RECAP = "Ma distance au spike après une pose de mon équipe : dans les manches où mon équipe pose et où je vis au premier kill qui suit, ma distance au spike à ce kill ; mes kills après la pose, par manche"


function posesDites(poses: number, avecDistance: number): string {
  return `${compteDit(poses, "pose")} de mon équipe, ${nombreEnClair(avecDistance, 0)} avec ma distance`
}

/**
 * Après une pose de mon équipe, ma distance au spike au premier kill qui suit (section 12) : toutes cartes (somme des comptes de chaque
 * carte, analysesDeCarte, puis chiffreDAnalyse du socle), puis carte par carte ; les poses sans ma distance, par raison, et celles sans
 * issue connue ; aucune carte : rien.
 */
function lignesApresPose(sel: SelectionRecap): string[] {
  const cartes = analysesDesCartes(sel)
  if (cartes.length === 0) return []
  const tranches = TRANCHES_SPIKE.map((t) => {
    let manches = 0, gagnees = 0, survies = 0, kills = 0
    for (const { a } of cartes) {
      const x = a.apresPose.tranches.find((y) => y.cle === t.cle)
      if (x === undefined) continue
      manches += x.manches
      gagnees += x.gagnees.num
      survies += x.survie.num
      kills += x.kills.num
    }
    return {
      cle: t.cle, manches,
      gagnees: chiffreDAnalyse({ num: gagnees, den: manches, cas: manches }),
      survie: chiffreDAnalyse({ num: survies, den: manches, cas: manches }),
      kills: chiffreDAnalyse({ num: kills, den: manches, cas: manches }, RATIO),
    }
  })
  const somme: RetraitsDePose = { poses: 0, avecDistance: 0, sansMoment: 0, sansSpike: 0, mortAvant: 0, sansPosition: 0, sansIssue: 0 }
  for (const { a } of cartes) {
    const p = a.apresPose
    somme.poses += p.poses
    somme.avecDistance += p.avecDistance
    somme.sansMoment += p.sansMoment
    somme.sansSpike += p.sansSpike
    somme.mortAvant += p.mortAvant
    somme.sansPosition += p.sansPosition
    somme.sansIssue += p.sansIssue
  }
  const sansCarte = retenues(sel.metriques.parties, "completes").filter((p) => cleCarte(p.carte) === null).length
  const toutes = sansCarte > 0 ? `toutes mes cartes connues (${compteDit(sansCarte, "partie")} sans carte connue hors du calcul)` : "toutes cartes"
  const lignes = [`- ${METHODE_APRES_POSE_DU_RECAP}`, ligneApresPose(toutes, somme, tranches)]
  for (const { carte, a } of cartes) lignes.push(ligneApresPose(nomDeCarte(carte.nom, carte.id), a.apresPose, a.apresPose.tranches))
  return lignes
}

/** Les poses d'un après-pose et leurs retraits (ApresPose d'une carte, ou leur somme toutes cartes). */
type RetraitsDePose = { poses: number; avecDistance: number; sansMoment: number; sansSpike: number; mortAvant: number; sansPosition: number; sansIssue: number }

/** Phrase du module quand la distance manque à toutes les poses (apresPoseDe), à la première personne. */
const DISTANCE_MANQUANTE = "ma distance au spike manque à chacune des poses de mon équipe : aucune tranche"

/**
 * Une ligne d'après-pose (`quoi` : « toutes cartes » ou le nom d'une carte), comme le bloc de Cartes : ses poses et celles avec ma
 * distance, ses tranches, ou la phrase du module quand la distance manque à toutes ; puis ses retraits par raison (sans moment de la pose,
 * sans position du spike, mort avant la pose, sans ma position au premier kill qui suit) et ses manches avec une pose d'issue inconnue.
 */
function ligneApresPose(quoi: string, p: RetraitsDePose, tranches: readonly { cle: CleTrancheSpike; manches: number; gagnees: ChiffreAnalyse; survie: ChiffreAnalyse; kills: ChiffreAnalyse }[]): string {
  const sans: string[] = []
  if (p.sansMoment > 0) sans.push(`${nombreEnClair(p.sansMoment, 0)} sans moment de la pose`)
  if (p.sansSpike > 0) sans.push(`${nombreEnClair(p.sansSpike, 0)} sans position du spike`)
  if (p.mortAvant > 0) sans.push(`${nombreEnClair(p.mortAvant, 0)} où je suis mort avant la pose`)
  if (p.sansPosition > 0) sans.push(`${nombreEnClair(p.sansPosition, 0)} sans ma position au premier kill qui suit`)
  const hors: string[] = []
  if (sans.length > 0) hors.push(`hors du calcul, poses sans ma distance : ${sans.join(", ")}`)
  if (p.sansIssue > 0) hors.push(`hors du calcul, ${compteDit(p.sansIssue, "manche")} avec une pose, sans issue connue`)
  const fin = hors.length === 0 ? "" : ` ; ${hors.join(" ; ")}`
  if (p.poses === 0) return `- Après la pose, ${quoi} : aucune pose de mon équipe${fin}`
  const corps = p.avecDistance === 0 ? DISTANCE_MANQUANTE : tranches.map(trancheApresPoseDite).join(" ; ")
  return `- Après la pose, ${quoi}, ${posesDites(p.poses, p.avecDistance)} : ${corps}${fin}`
}

// ─── section 13 : à 4 contre 5 et à 5 contre 4 (analyse 10) ; ce que chaque agent adverse me fait (entrée 11) ───


function equipeDEtat(etat: string): EquipeDite {
  return {
    comptes: (num: number, den: number) => `${gagnesDits(num, true)} sur ${compteDit(den, "manche")} ${etat}`, casDits: (n: number) => `${compteDit(n, "manche")} ${etat}`,
    cas: `manches ${etat}`, aucun: `aucune manche ${etat}`, sansPartie: "aucune partie dont l'état des manches est connu", casSontParties: false,
  }
}

/**
 * À 4 contre 5 et à 5 contre 4 (etatsApresPremiereMort, Duels) : l'effectif et la définition, puis la part des manches gagnées dans chaque
 * état face à ma période précédente ; les manches retirées et les parties écartées, comptées.
 */
function lignesEtats(sel: SelectionRecap): string[] {
  const e = etatsApresPremiereMort(sel.metriques)
  const ecartees = e.completes - e.parties
  const effectif = `sur ${compteDit(e.parties, "partie")}${ecartees > 0 ? ` ; ${compteDit(ecartees, "partie")} sans l'état des manches ${ecartees > 1 ? "écartées" : "écartée"}` : ""}`
  if (e.parties === 0) return [`- À 4 contre 5 et à 5 contre 4 : aucune partie dont l'état des manches est connu${ecartees > 0 ? ` ; ${compteDit(ecartees, "partie")} sans lui ${ecartees > 1 ? "écartées" : "écartée"}` : ""}`]
  const lignes = [
    `- À 4 contre 5 et à 5 contre 4 : part de mes manches gagnées dans cet état de la manche après sa première mort, quelle qu'en soit la cause (spike et chute comprises), ${faceALaPrecedente(sel, e.avant)}, ${effectif}`,
    ligneDEquipe(sel, "À 4 contre 5 (après la première mort de mon équipe)", e.quatre, equipeDEtat("à 4 contre 5")),
    ligneDEquipe(sel, "À 5 contre 4 (après la première mort adverse)", e.cinq, equipeDEtat("à 5 contre 4")),
  ]
  const retirees: string[] = []
  if (e.sansMort > 0) retirees.push(`${compteDit(e.sansMort, "manche")} sans aucune mort`)
  if (e.issueInconnue > 0) retirees.push(`${compteDit(e.issueInconnue, "manche")} d'issue inconnue`)
  if (retirees.length > 0) lignes.push(`- Hors du calcul de ces deux états : ${retirees.join(" et ")}`)
  return lignes
}

/** Le délai « il me voit, il me tue », dit, jamais estimé (NOTE_DELAI des agents adverses, à la première personne). */
/** L'exception à « jamais par joueur » des lignes par agent adverse, dite en une phrase courte. */
export const AGENTS_SEULEMENT = "agents seulement, jamais un joueur ni un nom : un agent croisé dans une seule partie peut n'être qu'un seul joueur"
/** Le pied quand le document a des lignes par agent adverse : la phrase de confidentialité et son exception. */
export const PHRASE_CONFIDENTIALITE_AGENTS = "Aucune donnée nominative d'un autre joueur : seulement les moyennes de mes lobbys, et ce que chaque agent adverse m'a fait, par agent, jamais un nom (un agent croisé dans une seule partie peut n'être qu'un seul joueur)."

export const DELAI_DU_RECAP = "Le délai entre le moment où un adversaire me voit et celui où il me tue n'existe dans aucune source : ValShop ne l'estime pas."

/**
 * Ce que chaque agent adverse me fait (agentsAdversesDeLaPeriode, Duels ; entrée 11) : l'effectif et la méthode, puis une ligne par agent
 * (la phrase du module, à la première personne), le délai qu'aucune source ne donne ; agents seulement, jamais un joueur.
 */
function lignesAgentsAdverses(r: AgentsDeLaPeriode): string[] {
  const e = r.effectif
  const ecartees = e.texteEcartees === null ? "" : ` ; ${aLaPremierePersonne(e.texteEcartees)}`
  const tete = "- Ce que chaque agent adverse me fait"
  if (e.parties === 0) return [`${tete} : aucune partie de la période n'a le détail par agent adverse, gardé pour les parties lues depuis sa mise à jour${ecartees}`]
  // Sa base en tête : les parties de la période qui ont le détail, pas les cumuls par semaine des duels par agent juste au-dessus.
  const base = e.parties > 1 ? `sur les ${compteDit(e.parties, "partie")} de la période qui ont ce détail` : "sur la seule partie de la période qui a ce détail"
  if (r.lignes.length === 0) return [`${tete}, ${base}${ecartees} : aucun agent adverse connu`]
  return [
    `${tete}, ${base}${ecartees} (autre base que mes duels par agent ci-dessus, lus dans les cumuls par semaine ; ${AGENTS_SEULEMENT}) : ses kills sur moi, mes kills sur lui, ses touches sur moi et leur part à la tête (dès ${MIN_CAS_ANALYSE} touches), ses dégâts sur moi par manche jouée face à lui (dès ${MIN_CAS_ANALYSE} manches), l'arme qui me tue le plus ; du plus de kills sur moi au moins`,
    ...r.lignes.map((l) => `- ${capitale(sansPointFinal(aLaPremierePersonne(l.phrase)))}`),
    `- ${sansPointFinal(DELAI_DU_RECAP)}`,
  ]
}

// ─── section 15 : tête et duels selon la distance, arme ramassée, fusil perdu (analyses 1 à 4) ───


const TRANCHES_DISTANCE_DITES: Readonly<Record<CleTrancheDistance, string>> = {
  pres: `à moins de ${DISTANCE_PRES}${INSECABLE}m`, milieu: `de ${DISTANCE_PRES} à ${DISTANCE_LOIN}${INSECABLE}m`, loin: `à plus de ${DISTANCE_LOIN}${INSECABLE}m`,
}


function celluleTete(t: TeteDUneTranche): string {
  if (t.kills === 0) return `${TIRET} (aucun kill)`
  const dont = t.cas < t.kills ? ` dont ${t.cas === 0 ? "aucun" : nombreEnClair(t.cas, 0)} aux touches relevées` : ""
  const kills = `${compteDit(t.kills, "kill")}${dont}`
  if (t.mention !== null) return `${TIRET} (${t.mention} : ${kills})`
  if (t.valeur === null) return `${TIRET} (aucune touche relevée sur ${kills})`
  return `${t.texte} (${kills})`
}


function effectifDArmes(texte: string | null): string {
  return texte === null ? "aucune partie" : minusculeDebut(sansPointFinal(aLaPremierePersonne(texte)))
}

/** Tête selon la distance (teteSelonLaDistance, analyse 1) : son tableau par arme, les kills sans position, son effectif. */
function lignesTeteDistance(m: Selection): string[] {
  const t = teteSelonLaDistance(m)
  if (t.lignes.length === 0) return [`- Tête selon la distance : aucun kill d'adversaire à une arme nommée dans mes parties aux touches relevées ; ${effectifDArmes(t.texteEffectif)}`]
  const phrase = "Mon pourcentage de tête selon la distance du kill, par arme, du plus de kills au moins (même méthode que tracker.gg : mes balles mises aux ennemis "
    + "tués avec l'arme, dans la manche du kill ; distance de ma position à celle de la victime, sans la hauteur ; en pourcentage dès "
    + `${MIN_CAS_ANALYSE} kills aux touches relevées) :`
  const lignes = tableau(phrase, ["Arme", ...TRANCHES_DISTANCE.map((x) => x.libelle)], t.lignes.map((l) => [`${l.nom} (${compteDit(l.kills, "kill")})`, ...l.tranches.map(celluleTete)]))
  const sansPosition = t.lignes.filter((l) => l.sansPosition.kills > 0).map((l) => `${l.nom} ${compteDit(l.sansPosition.kills, "kill")}`)
  lignes.push("")
  if (sansPosition.length > 0) lignes.push(`- Hors des tranches, kills sans position : ${sansPosition.join(", ")}`)
  lignes.push(`- Tête selon la distance : ${effectifDArmes(t.texteEffectif)}`)
  return lignes
}


function trancheDuelsDite(c: ChiffreAnalyse & { duels: number; gagnes: number }): string {
  return chiffreDit(c, `${gagnesDits(c.gagnes)} sur ${compteDit(c.duels, "duel")}`, "aucun duel")
}

/**
 * Duels gagnés selon la distance (duelsSelonLaDistance, analyse 2) : toutes armes, par tranche ; ce qui sort du calcul ; l'effectif ; puis
 * le détail par arme (récap seulement), l'arme de mon kill quand je gagne, celle de ma manche quand je perds, et ce qu'il retire de plus.
 */
function lignesDuelsDistance(m: Selection): string[] {
  const d = duelsSelonLaDistance(m)
  const effectif = `- Duels gagnés selon la distance : ${effectifDArmes(d.texteEffectif)}`
  const hors: string[] = []
  if (d.horsArme.capacites > 0) hors.push(`${compteDit(d.horsArme.capacites, "duel")} à une capacité`)
  if (d.horsArme.sansNom > 0) hors.push(`${compteDit(d.horsArme.sansNom, "duel")} à une arme sans nom`)
  if (d.sansPosition.duels > 0) hors.push(`${compteDit(d.sansPosition.duels, "duel")} à l'arme sans position`)
  const horsDit = hors.length === 0 ? [] : [`- Hors du calcul des duels selon la distance : ${hors.join(", ")}`]
  if (d.duels + d.sansPosition.duels === 0) return [`- Duels gagnés selon la distance, toutes armes : aucun duel à l'arme`, ...horsDit, effectif]
  const lignes = [`- Duels gagnés selon la distance, toutes armes (mes duels à une arme nommée, rangés selon la distance entre ma position et celle de l'autre joueur, à mon kill ou à ma mort) : ${d.tranches.map((t) => `${TRANCHES_DISTANCE_DITES[t.cle]}, ${trancheDuelsDite(t)}`).join(" ; ")}`]
  lignes.push(...horsDit, effectif)
  const e = d.effectifParArme
  const detail = `${e.texte}${e.texteEcartees === null ? "" : ` ; ${aLaPremierePersonne(e.texteEcartees)}`}`
  if (d.parArme.length === 0) {
    lignes.push(`- Duels selon la distance, par arme : aucun duel dans une partie où l'arme de ma manche est connue ; ${detail}`)
    return lignes
  }
  const phrase = "Mes duels gagnés selon la distance, par arme, du plus de duels au moins (l'arme de mon kill quand je gagne le duel, celle de ma manche "
    + `quand je le perds ; ${detail}) :`
  const rangees = d.parArme.map((a) => [`${a.nom} (${compteDit(a.duels + a.sansPosition.duels, "duel")})`, ...a.tranches.map(trancheDuelsDite)])
  lignes.push("", ...tableau(phrase, ["Arme", ...TRANCHES_DISTANCE.map((x) => x.libelle)], rangees), "")
  const sansPosition = d.parArme.filter((a) => a.sansPosition.duels > 0).map((a) => `${a.nom} ${compteDit(a.sansPosition.duels, "duel")}`)
  if (sansPosition.length > 0) lignes.push(`- Hors des tranches par arme, duels sans position : ${sansPosition.join(", ")}`)
  if (d.sansNom > 0) lignes.push(`- Hors du détail par arme : ${compteDit(d.sansNom, "duel")} ${d.sansNom > 1 ? "perdus" : "perdu"} dont l'arme de ma manche n'a pas de nom`)
  return lignes
}

/** Kills à l'arme ramassée (armeRamassee, analyse 3) : la part, ses comptes, les armes ramassées, les kills restés à moi. */
function ligneArmeRamassee(r: ArmeRamassee): string {
  const classes = r.inconnues > 0 ? (r.kills > 1 ? " classés" : " classé") : ""
  const tete = "- Kills à l'arme ramassée"
  if (r.kills === 0) return `${tete} : aucun kill à l'arme${classes}`
  const morceaux = [`${tete} : ${chiffreDit(r, `${nombreEnClair(r.ramassees, 0)} sur ${compteDit(r.kills, "kill")} à l'arme${classes}`, TIRET)}`]
  if (r.parArme.length > 0) morceaux.push(`armes ramassées : ${r.parArme.map((x) => `${x.nom} ${nombreEnClair(x.kills, 0)}`).join(", ")}`)
  // Ce que le module ne compte pas comme ramassé, dit comme lui : le pistolet peut être le mien, acheté en second, rien ne le dit ; le couteau est toujours le mien.
  if (r.pistolets > 0) morceaux.push(`non comptés comme ramassés : ${compteDit(r.pistolets, "kill")} au pistolet quand ma manche a une arme principale (peut-être le mien, acheté en second : rien ne le dit)`)
  if (r.couteau > 0) morceaux.push(`${r.pistolets > 0 ? "ni" : "non comptés comme ramassés :"} ${compteDit(r.couteau, "kill")} au couteau (toujours le mien)`)
  return morceaux.join(" ; ")
}

/** Fusil perdu (fusilPerdu, analyse 4) : le nombre de mes manches perdues où je meurs avec une grosse arme, sur ses perdues et ses jouées. */
function ligneFusilPerdu(f: FusilPerdu): string {
  const tete = "- Fusil perdu"
  if (f.jouees === 0 && f.inconnues > 0) return `${tete} : ${TIRET} (catégorie d'arme inconnue pour ${f.inconnues > 1 ? "mes" : "ma"} ${compteDit(f.inconnues, "manche")})`
  if (f.jouees === 0) return `${tete} : aucune manche jouée avec ${GROSSES_ARMES_DITES}`
  const jouees = `${nombreEnClair(f.jouees, 0)} ${f.jouees > 1 ? "jouées" : "jouée"} avec l'un d'eux`
  if (f.perduesAvec === 0) return `${tete} : aucune manche perdue avec ${GROSSES_ARMES_DITES}, sur ${jouees}`
  const pl = f.perdues > 1 ? "s" : ""
  return `${tete} : ${nombreEnClair(f.perdues, 0)} manche${pl} perdue${pl} où je meurs avec ${GROSSES_ARMES_DITES}, sur ${nombreEnClair(f.perduesAvec, 0)} ${f.perduesAvec > 1 ? "perdues" : "perdue"} et ${jouees}`
}

/**
 * Kills à l'arme ramassée et fusil perdu (analyses 3 et 4), avec les catégories des armes des ressources : les deux chiffres, la méthode,
 * ce qui sort du calcul faute de catégorie, l'effectif ; sans aucune catégorie, « — » et pourquoi, et l'effectif.
 */
function lignesArmeEtFusil(m: Selection, armes: SectionArmes): string[] {
  const effectif = (e: EffectifAnalyse) => `- Arme ramassée et fusil perdu : ${e.texte}${e.texteEcartees === null ? "" : ` ; ${aLaPremierePersonne(e.texteEcartees)}`}`
  if (sansCategories(armes)) {
    const e = effectifArmeEtFusil(m)
    return e.parties === 0 ? [effectif(e)] : [`- Kills à l'arme ramassée et fusil perdu : ${TIRET} (catégories des armes absentes de l'iPhone : « Mettre à jour » les range)`, effectif(e)]
  }
  const r = armeRamassee(m, armes), f = fusilPerdu(m, armes)
  if (r.effectif.parties === 0) return [effectif(r.effectif)]
  const lignes = [ligneArmeRamassee(r), ligneFusilPerdu(f), `- ${sansPointFinal(aLaPremierePersonne(NOTE_ARME_RAMASSEE))}`]
  const hors: string[] = []
  if (r.inconnues > 0) hors.push(compteDit(r.inconnues, "kill"))
  if (f.inconnues > 0) hors.push(compteDit(f.inconnues, "manche"))
  if (hors.length > 0) lignes.push(`- Hors du calcul, faute de catégorie d'arme connue : ${hors.join(" et ")}`)
  lignes.push(effectif(r.effectif))
  return lignes
}

/** Les analyses 1 à 4 de la section 15 : tête et duels selon la distance, arme ramassée et fusil perdu, séparées par une ligne vide. */
function lignesAnalysesArmes(sel: SelectionRecap): string[] {
  const m = sel.metriques
  return [...lignesTeteDistance(m), "", ...lignesDuelsDistance(m), ...lignesArmeEtFusil(m, sel.donnees.ressources.armes)]
}

// ─── les sections avec leurs analyses ───
//
// Chaque section qui reçoit des analyses les écrit après son contenu des entrées 2 à 6 de epic-stats-recap, sous sa case : sans partie
// (ou sans partie des files de la section), rien de plus que ce qu'elle écrit déjà.

/** Section 8 : seul ou en duo, heures et sessions (groupeEtHeures), puis dans quelles conditions je gagne (analyses 12 à 14). */
export function groupeHeuresEtConditions(sel: SelectionRecap): string[] {
  const base = groupeEtHeures(sel)
  return base.length === 0 ? base : [...base, ...lignesConditions(sel)]
}

/** Les parties des files complètes de la sélection : sans elles, les sections 10 à 13 n'écrivent que leur ligne de tête. */
function avecFilesCompletes(sel: SelectionRecap): boolean {
  return retenues(sel.metriques.parties, "completes").length > 0
}

/** Section 10 : par carte (parCarteEtAgents), puis mes premiers duels par zone et mes positions en défense, carte par carte (analyses 7 et 8). */
export function parCarteEtAnalyses(sel: SelectionRecap): string[] {
  const base = parCarteEtAgents(sel)
  const analyses = avecFilesCompletes(sel) ? lignesAnalysesParCarte(sel) : []
  return analyses.length === 0 ? base : [...base, "", ...analyses]
}

/** Section 11 : où et quand je meurs (ouEtQuandJeMeurs), puis comment je meurs (analyse 5). */
export function ouQuandEtCommentJeMeurs(sel: SelectionRecap): string[] {
  const base = ouEtQuandJeMeurs(sel)
  return avecFilesCompletes(sel) ? [...base, ...lignesCommentJeMeurs(sel.metriques)] : base
}

/** Section 12 : attaque, défense et retakes (attaqueDefenseRetakes), puis ma distance au spike après une pose de mon équipe (analyse 9). */
export function attaqueDefenseEtApresPose(sel: SelectionRecap): string[] {
  const base = attaqueDefenseRetakes(sel)
  return avecFilesCompletes(sel) ? [...base, ...lignesApresPose(sel)] : base
}

/** Section 13 : duels (duelsEtClutchs), puis ce que chaque agent adverse me fait (entrée 11) et à 4 contre 5, à 5 contre 4 (analyse 10). */
export function duelsEtAnalyses(sel: SelectionRecap): string[] {
  const base = duelsEtClutchs(sel)
  if (!avecFilesCompletes(sel)) return base
  const r = agentsAdversesDeLaPeriode(sel.metriques)
  // Avec des lignes par agent adverse, la note de Ce qui me tue dit son exception, juste dessous, pour rester vraie.
  const note = `- ${NOTE_CE_QUI_TE_TUE}`
  const notee = r.lignes.length === 0 ? base : base.map((l) => (l === note ? `- ${sansPointFinal(NOTE_CE_QUI_TE_TUE)} (ce qui me tue) ; seule exception, ce que chaque agent adverse me fait, juste dessous` : l))
  return [...notee, ...lignesAgentsAdverses(r), ...lignesEtats(sel)]
}

/** Le document a-t-il des lignes par agent adverse (case Duels cochée, une partie au moins avec ce détail et un agent connu) ? */
function avecLignesParAgent(sel: SelectionRecap, coche: ReadonlySet<CleCase>): boolean {
  return coche.has("duels") && avecFilesCompletes(sel) && agentsAdversesDeLaPeriode(sel.metriques).lignes.length > 0
}

/** Section 15 : armes et visée (armesEtVisee), puis tête et duels selon la distance, arme ramassée et fusil perdu (analyses 1 à 4). */
export function armesViseeEtAnalyses(sel: SelectionRecap): string[] {
  const base = armesEtVisee(sel)
  return retenues(sel.metriques.parties, "a-manches").length > 0 ? [...base, "", ...lignesAnalysesArmes(sel)] : base
}

// ─────────────────────────── cases et sections ───────────────────────────

/** Une case du Contenu (maquette Recap) : un groupe de sections du document. */
export type CleCase =
  | "consigne" | "contexte" | "note" | "tendances" | "groupe" | "agentsCartes" | "morts"
  | "cotes" | "duels" | "economie" | "armes" | "deathmatch" | "constats"
export type CaseRecap = { cle: CleCase; libelle: string }

/** Les 13 cases, dans l'ordre de la maquette Recap, avec leur libellé ; toutes cochées au départ (entrée 9). */
export const CASES_RECAP: readonly CaseRecap[] = [
  { cle: "consigne", libelle: "Consigne pour ton coach IA" },
  { cle: "contexte", libelle: "Contexte et synthèse face à tes lobbys" },
  { cle: "note", libelle: "Note de performance de Valorant" },
  { cle: "tendances", libelle: "Tendances, rang acte par acte et RR" },
  { cle: "groupe", libelle: "Seul ou en duo, heures et sessions" },
  { cle: "agentsCartes", libelle: "Agents, cartes et agent par carte" },
  { cle: "morts", libelle: "Où et quand tu meurs" },
  { cle: "cotes", libelle: "Attaque, défense et retakes" },
  { cle: "duels", libelle: "Duels, clutchs et ce qui te tue" },
  { cle: "economie", libelle: "Économie et stats selon l'achat" },
  { cle: "armes", libelle: "Armes : tête, corps, jambes, distance" },
  { cle: "deathmatch", libelle: "Visée à l'entraînement (deathmatch)" },
  { cle: "constats", libelle: "Points forts, points à travailler et questions" },
]

/** Les 13 cases, toutes cochées. */
export const TOUTES_LES_CASES: readonly CleCase[] = CASES_RECAP.map((c) => c.cle)

/** L'écriture d'une section : son corps en lignes Markdown, sans son en-tête. */
export type EcrireSection = (sel: SelectionRecap) => string[]

/**
 * Une section du document (EXPERIENCE.md, Structure du récap texte) : son numéro, son en-tête (« ## … »), sa case et son
 * écriture ; null : section pas encore écrite (entrées 2 à 6), absente du document.
 */
export type SectionRecap = { numero: number; entete: string; cle: CleCase; ecrire: EcrireSection | null }

/**
 * Les sections 3 à 18, dans l'ordre du document, chacune sous sa case (la note avant la synthèse, comme l'exemple, bien que
 * la case de la note vienne après) ; le titre (1), la citation (2) et le pied (19) sont toujours là, hors des cases. Les
 * entrées 2 à 6 posent ici l'écriture de leurs sections.
 */
export const SECTIONS_RECAP: readonly SectionRecap[] = [
  { numero: 3, entete: "À l'attention du coach", cle: "consigne", ecrire: consigne },
  { numero: 4, entete: "Contexte", cle: "contexte", ecrire: contexte },
  { numero: 5, entete: "Note de performance de Valorant", cle: "note", ecrire: note },
  { numero: 6, entete: "Synthèse", cle: "contexte", ecrire: synthese },
  { numero: 7, entete: "Tendances et rang", cle: "tendances", ecrire: tendancesEtRang },
  { numero: 8, entete: "Seul ou en duo, heures et sessions", cle: "groupe", ecrire: groupeHeuresEtConditions },
  { numero: 9, entete: "Par agent", cle: "agentsCartes", ecrire: parAgent },
  { numero: 10, entete: "Par carte", cle: "agentsCartes", ecrire: parCarteEtAnalyses },
  { numero: 11, entete: "Où et quand je meurs", cle: "morts", ecrire: ouQuandEtCommentJeMeurs },
  { numero: 12, entete: "Attaque, défense et retakes", cle: "cotes", ecrire: attaqueDefenseEtApresPose },
  { numero: 13, entete: "Duels", cle: "duels", ecrire: duelsEtAnalyses },
  { numero: 14, entete: "Économie", cle: "economie", ecrire: economie },
  { numero: 15, entete: "Armes et visée", cle: "armes", ecrire: armesViseeEtAnalyses },
  { numero: 16, entete: "Visée à l'entraînement (deathmatch)", cle: "deathmatch", ecrire: viseeALEntrainementDuRecap },
  { numero: 17, entete: "Ce que disent mes chiffres", cle: "constats", ecrire: ceQueDisentMesChiffres },
  { numero: 18, entete: "Questions pour toi, coach", cle: "constats", ecrire: questionsPourToi },
]

// ─────────────────────────── règles de forme ───────────────────────────

/** Un tableau du document a au plus 4 colonnes (EXPERIENCE.md, Règles). */
export const COLONNES_MAX = 4

/** Une cellule de tableau Markdown : sur une seule ligne, « | » échappé. */
function cellule(texte: string): string {
  return texte.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")
}






export function tableau(phrase: string, entetes: readonly string[], rangees: readonly (readonly string[])[]): string[] {
  const n = Math.min(entetes.length, COLONNES_MAX)
  const valeur = (r: readonly string[], i: number) => r[i] ?? TIRET
  const ligne = (cs: readonly string[]) => `| ${cs.map(cellule).join(" | ")} |`
  const lignes = [phrase, "", ligne(entetes.slice(0, n)), `|${"---|".repeat(n)}`]
  for (const r of rangees) lignes.push(ligne(entetes.slice(0, n).map((_, i) => valeur(r, i))))
  if (entetes.length > n) {
    lignes.push("")
    for (const r of rangees) lignes.push(`- ${valeur(r, 0)} : ${entetes.slice(n).map((e, k) => `${e} ${valeur(r, n + k)}`).join(" ; ")}`)
  }
  return lignes
}

// ─────────────────────────── document ───────────────────────────

/**
 * Les lignes du document, dans l'ordre : le titre (période du récap en toutes lettres), la citation, puis, toujours, la phrase
 * d'une période demandée qui commence avant ta première partie gardée et celle d'une période sans partie ; les sections écrites
 * des cases cochées, dans l'ordre de `sections` (SECTIONS_RECAP), une section qui n'écrit rien disant AUCUNE_DONNEE ; `---` et le
 * pied. Dès que le texte des lignes déjà écrites dépasse `limite` caractères (retours à la ligne compris), plus rien n'est écrit :
 * ni les sections suivantes, ni le pied (entrée 9, l'Aperçu du récap) ; les lignes rendues sont alors les premières du document.
 */
function lignesDuDocument(sel: SelectionRecap, cochees: readonly CleCase[], date: number, sections: readonly SectionRecap[], limite: number): string[] {
  const coche = new Set(cochees)
  const lignes: string[] = []
  /** Le texte des lignes écrites : leurs caractères et un retour à la ligne entre deux. */
  let longueur = -1
  const ecrire = (...ls: string[]) => {
    // En anglais, chaque ligne traduite entière, repère Markdown compris (anglais.ts) ; en français, telle quelle.
    for (const l of ls) { const t = traduire(l); lignes.push(t); longueur += t.length + 1 }
  }
  ecrire(`# Récap Valorant · ${periodeEnClair(periodeDuRecap(sel))}`, "", `> ${CITATION}`)
  if (sel.avantPremiere && sel.couverte !== null) {
    ecrire("", `La période demandée (${demandeeEnClair(sel)}) commence avant ma première partie gardée : le récap part de celle-ci, le ${jourEnClair(sel.couverte.debut)}.`)
  }
  if (sel.metriques.parties.length === 0) {
    ecrire("", `Aucune partie${sel.demande.mode === "competition" ? " de compétition" : ""} gardée dans cette période.`)
  }
  for (const s of sections) {
    if (longueur > limite) return lignes
    if (s.ecrire === null || !coche.has(s.cle)) continue
    const corps = s.ecrire(sel)
    ecrire("", `## ${s.entete}`, "", ...(corps.length > 0 ? corps : [AUCUNE_DONNEE]))
  }
  if (longueur > limite) return lignes
  ecrire("", "---", "", pied(sel, date, avecLignesParAgent(sel, coche)))
  return lignes
}

/** Le texte du document (lignesDuDocument, sans limite), terminé par un retour à la ligne. */
export function assembler(sel: SelectionRecap, cochees: readonly CleCase[], date: number, sections: readonly SectionRecap[] = SECTIONS_RECAP): string {
  return `${lignesDuDocument(sel, cochees, date, sections, Infinity).join("\n")}\n`
}

/**
 * Le début d'un document (entrée 9, l'Aperçu du récap) : son texte, préfixe exact de celui du document, et ce qui le suit :
 * « aucune » (c'est le document entier, sans son dernier retour à la ligne), « ligne » (coupé en fin de ligne : la suite
 * commence à la ligne suivante), « mot » (coupé dans une ligne, après un mot).
 */
export type DebutRecap = { texte: string; suite: "aucune" | "ligne" | "mot" }

/** Une ligne réduite à son repère Markdown (titre, puce, citation, rangée de tableau, numéro), sans un mot de son texte. */
const REPERE_SEUL = /^(#{1,6}|[->*|]|\d+\.)$/







export function debutDuTexte(texte: string, caracteres: number): DebutRecap {
  if (texte.length <= caracteres) return { texte, suite: "aucune" }
  let i = Math.max(0, Math.floor(caracteres))
  while (i > 0 && texte[i] !== " " && texte[i] !== "\n") i--
  if (i === 0) return { texte: texte.slice(0, Math.max(0, Math.floor(caracteres))), suite: "mot" }
  const garde = texte.slice(0, i).replace(/[ \n]+$/, "")
  const fin = garde.lastIndexOf("\n")
  if (fin > 0 && REPERE_SEUL.test(garde.slice(fin + 1))) return { texte: garde.slice(0, fin).replace(/[ \n]+$/, ""), suite: "ligne" }
  return { texte: garde, suite: texte[i] === "\n" ? "ligne" : "mot" }
}

/**
 * Le début du récap de cette sélection, avec ces cases cochées, généré à la date `date` (ms), `caracteres` au plus
 * (debutDuTexte) : le début exact du texte de genererRecap pour les mêmes sélection, cases et date, sans écrire les sections qui
 * viennent après lui (lignesDuDocument) : le coût d'un aperçu reste celui de ses premières sections.
 */
export function debutDuRecap(sel: SelectionRecap, cochees: readonly CleCase[], date: number, caracteres: number, sections: readonly SectionRecap[] = SECTIONS_RECAP): DebutRecap {
  return debutDuTexte(lignesDuDocument(sel, cochees, date, sections, caracteres).join("\n"), caracteres)
}

/** Le document du récap : son nom de fichier et son texte (CAP-21). */
export type DocumentRecap = { nom: string; texte: string }


export function nomDuRecap(sel: SelectionRecap): string {
  const p = periodeDuRecap(sel)
  return `ValShop-recap-${p.debut}-${p.fin}.md`
}

/** Le récap de cette sélection, avec ces cases cochées, généré à la date `date` (ms) : son nom et son texte. */
export function genererRecap(sel: SelectionRecap, cochees: readonly CleCase[], date: number): DocumentRecap {
  return { nom: nomDuRecap(sel), texte: assembler(sel, cochees, date) }
}
