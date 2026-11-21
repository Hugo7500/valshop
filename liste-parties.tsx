import {
  Button, EnvironmentValuesReader, FlowLayout, HStack, Image, LazyVStack, PathShape, Rectangle, RoundedRectangle, ScrollView, Text, VStack,
  ZStack, type Color, type DynamicTypeSize, type Path2D, type Size, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import type { Emplacement, PropsEmplacement } from "./app"
import type { DonneesTableau } from "./collecte"
import {
  ARRONDIS, BoutonSecondaire, ESPACES, TYPO, couleurs, policeCondensee, tailleAccessibilite, type Palette,
  FinDuRendu, debutDeRendu, mesurerAppui, useLigneDeMesure,
} from "./design"
import { PileDeBlocs, creux } from "./design" // ticket 4.46 : blocs du sous-onglet et du Détail dans une pile paresseuse
import {
  Bloc, ChoixDeManche, ElementAjustable, Legende, LignesDetaillees, REPLIS, SEGMENTS_MODE, SelecteurSegmente, Tableau, sansMauvaiseCoupure,
  titreAffiche, type ItemLegende, type LigneDetaillee, type LigneTableau,
} from "./dessin"
import {
  DEGATS, ECART_DEGATS, LIBELLES_ACHAT_MANCHE, SCORE, TETE, TIRET, chiffresPartie, depenseDEquipe, ecartEnClair, libellePerimetre, mentionDe,
  nombreEnClair, nomDuPalier, palierMoyen, rrEnClair, trancheDuMoment, typeDeManche, valeurEnClair, zonesDeLaPartie,
  type ChiffrePartie, type Mention, type Mode, type Selection, type TypeDeManche, type Zone,
} from "./metriques"
import { colonnesChiffres } from "./vue-ensemble"
import type { LigneRr } from "./historique"
import { mvpDeLaPartie, type Cote, type Fleches, type Groupe, type Kill, type Manche, type Partie, type Somme, type Tendance } from "./reduction"
import type { SectionCartes } from "./ressources"
import { SectionAgentsDeLaPartie } from "./agents-adverses"
import { ZONE_LA_PLUS_PROCHE } from "./analyses-cartes"

// Module du sous-onglet Parties de l'onglet Stats (entrée 31 de epic-stats-tableau-de-bord ; DESIGN.md, selecteur-segmente,
// bloc, frise-manches, legende, ligne-partie, badge-mention, bouton-mettre-a-jour ; EXPERIENCE.md, Information Architecture,
// Component Patterns, State Patterns, Définitions des métriques, Voice and Tone, Accessibility Floor ; maquette Parties).
// Nommé ainsi, parties.ts étant le module des parties de HenrikDev. Son emplacement, EMPLACEMENT_PARTIES, neuvième libellé
// de la Barre de sous-onglets (entrée 18), reçoit les données tenues et l'état du périmètre commun (entrée 17) ; il montre,
// dans une pile à 14 : le Sélecteur segmenté du mode, qui règle ce périmètre (la Ligne d'état et son Réglage disent le
// même) ; la dernière partie du périmètre manche par manche (Frise des manches, dans un Bloc) ; les Lignes de partie du
// périmètre, la plus récente en haut, par lots de 50 dans une liste paresseuse, « Voir plus » sous le dernier lot. Les
// vues d'une seule partie se calculent ici (epic, décision « vues d'une seule partie »), des champs gardés par la
// réduction, de rr.json et des chiffres d'une partie de l'entrée 2 (`chiffresPartie`), avec les formats de metriques.ts ;
// chaque lot une fois avec sa sélection, gardé par l'état du périmètre (`agregat`). Sans requête, lecture ni écriture ;
// rien gardé sur le disque. Rendu jugé sur l'iPhone (demi-cases, bordure, faits à la ligne, liste paresseuse, VoiceOver).
// Lignes, faits et badges sont des fonctions qui rendent leur vue, pas des composants : aucun état, et rien à suivre pour
// l'hôte, ligne par ligne.
// Entrée 33 : chaque Ligne de partie et tout le Bloc de la Frise sont des boutons, qui poussent le Détail de leur partie
// (`ouvrirPartie` de l'emplacement) dans la pile de navigation de l'onglet (app.tsx) ; le Détail d'une partie (DetailPartie ;
// DESIGN.md, lien-retour, bloc, chiffre, tableau ; EXPERIENCE.md, Information Architecture : Détail ; maquette
// Detail-partie) s'écrit ici, de la même partie réduite et des mêmes écritures que sa Ligne : Lien retour, résumé (résultat,
// RR, carte, agent, date, durée, groupe, six Chiffres), puis Ton équipe et l'adversaire en moyennes.
// Entrée 34 : entre les deux, Manche par manche (Cases de manche par mi-temps puis prolongation, Légende, Choix de manche de
// dessin.tsx, Encadré de la manche choisie ; DESIGN.md, case-manche, choix-manche, encadre-manche ; EXPERIENCE.md, Component
// Patterns) et Tes morts dans cette partie (moments, zones de l'entrée 8, premiers duels et clutch), calculés ici de la même
// partie (manchesDuDetail, mortsDuDetail) ; la manche choisie est le seul état du Détail, remise à la manche 1 à chaque
// ouverture (jeton `ouverture` de app.tsx).
// Entrée 44 : le type d'une manche (lettre et Encadré) se lit par typeDeManche de metriques.ts : une manche jouée avec l'arme
// gardée de la manche d'avant se dit « Arme gardée », lettre G, jamais un achat.
// Ticket 4.48 : Manche par manche et Tes morts dans cette partie disent ce qu'est une zone dans leur note (MENTION_ZONE, la formule
// des analyses de 6.6), quand un Encadré de la partie ou la phrase de tes morts en nomme une.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
/** Espace insécable : tient chaque fait entier, et le « · » au bout du fait qu'il suit. */
const NBSP = String.fromCharCode(0x00a0)

const TIRET_SCORE = String.fromCharCode(0x2013)

const EXPOSANT_E = String.fromCharCode(0x1d49)
const EXPOSANT_R = String.fromCharCode(0x02b3)
/** Séparateur de deux faits (Formats : point médian entouré d'espaces) ; la ligne ne se coupe qu'après lui. */
const SEP = `${NBSP}· `

/** Les parties d'un lot de la liste (EXPERIENCE.md, Component Patterns, Ligne de partie). */
export const LOT_PARTIES = 50
/** Le titre du Bloc de la Frise (maquette) : en capitales par le Bloc, comme tout titre de bloc (entrée 42 ; DESIGN.md, Typography). */
export const TITRE_FRISE = "Dernière partie, manche par manche"
/** Le libellé du bouton qui charge le lot suivant (DESIGN.md, Ligne de partie). */
export const VOIR_PLUS = "Voir plus"




export const MENTION_ZONE = sansMauvaiseCoupure(ZONE_LA_PLUS_PROCHE)
/** La Légende de la Frise (DESIGN.md, Légende : demi-case vers le haut ou le bas). */
export const LEGENDE_FRISE: readonly ItemLegende[] = [
  { marque: "demiCaseHaut", libelle: "Manche gagnée" },
  { marque: "demiCaseBas", libelle: "Manche perdue" },
]
/** La phrase d'un périmètre sans partie (State Patterns : une phrase à la place de la liste), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}

/** Frise des manches (DESIGN.md, frise-manches) : hauteur, demi-case, axe, trait de mi-temps, écart entre deux manches. */
const FRISE = { hauteur: 22, demi: 10.5, axe: 1, miTemps: 2, ecart: ESPACES.frise } as const
/** Ligne de partie (DESIGN.md, ligne-partie ; maquette) : bordure gauche, marges, écart des rangées, des colonnes, des lignes. */
const LIGNE = { bordure: 4, vertical: 10, horizontal: 12, rangees: 4, colonnes: 10, liste: ESPACES.grille } as const
/** Badge de mention (maquette) : marges. */
const BADGE = { vertical: 2, horizontal: 5 } as const
/** Faits de la deuxième rangée, en `FlowLayout` : l'écart d'une espace entre deux faits, entre deux lignes, et avant le libellé d'un pictogramme. */
const FAITS = { horizontal: 4, vertical: 2, pictogramme: 3 } as const

// ─────────────────────────── entrée 33 : Détail d'une partie ───────────────────────────

/** Le gluon (U+2060, WORD JOINER) : invisible, sans largeur, il interdit le retour à la ligne après le tiret d'un score. */
const GLUON = String.fromCharCode(0x2060)
/** La flèche du Lien retour (DESIGN.md, lien-retour : « ← Parties »). */
const FLECHE = String.fromCharCode(0x2190)
/** L'indice VoiceOver d'une Ligne de partie et de la Frise : où mène l'appui. */
export const OUVRE_DETAIL = "Ouvre le détail de la partie."
/** Le Lien retour (DESIGN.md, lien-retour), la flèche tenue au mot ; ce que VoiceOver en lit, sans la flèche. */
export const LIEN_RETOUR = `${FLECHE}${NBSP}Parties`
export const RETOUR_DIT = "Retour à Parties"
/** Le titre du Bloc des moyennes (maquette) : en capitales par le Bloc (entrée 42). */
export const TITRE_EQUIPE = "Ton équipe et l'adversaire"
/** Les colonnes de son Tableau (maquette) : la 1re, sans en-tête, nomme la ligne. */
const COLONNES_EQUIPE: readonly string[] = ["", "Ton équipe", "Adversaires"]
/** Sa note (EXPERIENCE.md, Voice and Tone, Confidentialité), toujours dite, avec ou sans moyenne. */
export const NOTE_MOYENNES = "Moyennes seulement : aucun nom, aucune stat individuelle d'un autre joueur n'est gardé."
/** Ticket 4.54 : la ligne de la dépense d'équipe (Σ des dépenses de Riot de l'équipe, par manche) de Ton équipe et l'adversaire. */
export const LIGNE_DEPENSE_EQUIPE = "Dépense d'équipe / manche"
/**
 * Ticket 4.54 : ce que compte une dépense dite dans un Encadré de manche (Manche par manche, en note après celle de la zone) : ta poche,
 * et seulement sur une manche vérifiée.
 */
export const MENTION_DEPENSE_MANCHE = "Dépense : les crédits sortis de la poche à l'achat, armes payées pour un coéquipier comprises ; dite seulement pour une manche vérifiée par la dépense que Riot compte."

export function noteDepenseEquipe(manches: number): string {
  return `Dépense d'équipe : la dépense que Riot compte à chaque équipe, toi compris dans la tienne, sur ${nombreEnClair(manches, 0)}${NBSP}manche${manches >= 2 ? "s" : ""} vérifiée${manches >= 2 ? "s" : ""} de la partie.`
}
/** Sa phrase quand aucune moyenne d'équipe n'est gardée (deathmatch, escarmouche, match à mort en équipe ; Bloc vide). */
export const SANS_MOYENNE = "Aucune moyenne d'équipe gardée pour cette partie."
/** Une valeur absente (« — »), dite. */
const SANS_VALEUR = "aucune valeur"
/** La hauteur d'une ligne de texte du rôle ligne à la taille par défaut (subheadline), en points. */
const HAUTEUR_LIGNE = 20
/**
 * Le Lien retour : sa case d'au moins 44 (ESPACES.cible) centre son texte (HAUTEUR_LIGNE à la taille par défaut), soit 12
 * au-dessus (la maquette : 12 sous la Barre d'onglets) et 12 dessous ; `apres`, ce qu'il faut encore sous la case pour que le
 * résumé tombe à 14 du texte (ESPACES.entreBlocs).
 */
const RETOUR = { apres: ESPACES.entreBlocs - (ESPACES.cible - HAUTEUR_LIGNE) / 2 } as const





const CHIFFRE = { ecart: 2, pile: 4, reduction: 0.6 } as const

// Entrée 34.
/** Les titres des deux Blocs (maquette : Manche par manche en titre de section) : en capitales par le Bloc (entrée 42). */
export const TITRE_MANCHES = "Manche par manche"
export const TITRE_MORTS = "Tes morts dans cette partie"
/** Ticket 4.52 : le titre du détail du RR de la partie (rr.json). */
export const TITRE_RR = "Détail du RR"
/** Ticket 4.52 : le titre des flèches de performance de Riot. */
export const TITRE_FLECHES = "Tes flèches de Valorant"
/** Ticket 4.52 : la note des flèches, qui ne disent que ce que Valorant affiche (aucune référence connue, aucune couleur). */
export const NOTE_FLECHES = "Les flèches que Valorant affiche en fin de partie, telles qu'il les donne."
/** Les légendes des groupes de la grille (EXPERIENCE.md, Case de manche : la première mi-temps, son côté indiqué ; prolongations en fin de grille). */
export const GROUPE_ATTAQUE = "Attaque"
export const GROUPE_DEFENSE = "Défense"
export const GROUPE_PROLONGATION = "Prolongation"
/** La Légende des Cases de manche (DESIGN.md, case-manche : « Légende dessous » ; legende : barre pleine ou creuse, disque, croix). */
export const LEGENDE_MANCHES: readonly ItemLegende[] = [
  { marque: "barrePleine", libelle: "Manche gagnée" },
  { marque: "barreCreuse", libelle: "Manche perdue" },
  { marque: "disque", libelle: "Tes kills" },
  { marque: "croix", libelle: "Ta mort" },
]
/** La note des lettres d'achat (maquette ; G de l'arme gardée, entrée 44), quand la grille en montre. */
export const NOTE_LETTRES = "Lettre : P pistolet, É éco, F forcé, C complet, G arme gardée."

export const NOM_AJUSTABLE = "Manche"
/** La lettre de chaque type (DESIGN.md, case-manche : P, É, F, C ; G de l'arme gardée, entrée 44). */
const LETTRES_ACHAT: Readonly<Record<TypeDeManche, string>> = { pistolet: "P", eco: "É", force: "F", complet: "C", gardee: "G" }
/** Les marques d'une case, écrites par leur code : un kill (« ● ») et ta mort (« ✕ »). */
const KILL = String.fromCharCode(0x25cf)
const MORT = String.fromCharCode(0x2715)
/** Au-delà de 3 kills, le nombre suivi d'un seul « ● » (DESIGN.md, case-manche). */
const KILLS_EN_POINTS = 3
/**
 * Case de manche (DESIGN.md, case-manche ; maquette), en points : bord réservé tout autour (la bordure de la choisie s'y
 * dessine), marge verticale, barre de résultat et contour de la barre creuse, écart des lignes ; réduction au plus d'une ligne,
 * tenue sur sa ligne : « ●●● » demande 0,70 sur 402 points et 0,62 sur 375 à la taille par défaut, 0,40 à accessibility5
 * (mesure CoreText du plan).
 */
const CASE_MANCHE = { bord: 2, vertical: 3, barre: 5, contour: 1.5, ecart: 2, reduction: 0.35 } as const
/** Grille des Cases de manche (DESIGN.md, Layout & Spacing) : 12 colonnes, 6 aux tailles d'accessibilité ; écart des cases et des rangées ; entre deux groupes. */
const GRILLE_MANCHES = { colonnes: 12, colonnesGrand: 6, ecart: ESPACES.manches, groupes: ESPACES.grille } as const
/** Encadré de manche (DESIGN.md, encadre-manche ; maquette) : bordure gauche, marge, écart entre l'étiquette et le récit. */
const ENCADRE = { bordure: 3, marge: 12, ecart: 6 } as const
/** Les armures de HenrikDev en français (Voice and Tone : termes du jeu en français) ; une autre reste telle quelle. */
const ARMURES: Readonly<Record<string, string>> = {
  "Heavy Armor": "armure lourde", "Heavy Shields": "armure lourde", "Light Armor": "armure légère", "Light Shields": "armure légère",
  "Regen Shield": "bouclier régénérant",
}

const LIEUX_TRANCHES: readonly { ecrit: string; dit: string }[] = [
  { ecrit: `avant 15${NBSP}s`, dit: "avant 15 secondes" },
  { ecrit: `entre 15 et 30${NBSP}s`, dit: "entre 15 et 30 secondes" },
  { ecrit: `entre 30 et 45${NBSP}s`, dit: "entre 30 et 45 secondes" },
  { ecrit: `entre 45 et 60${NBSP}s`, dit: "entre 45 et 60 secondes" },
  { ecrit: `après 60${NBSP}s`, dit: "après 60 secondes" },
]

// ─────────────────────────── calculs d'une partie ───────────────────────────

/** Ton d'un résultat, d'un RR et de la bordure d'une ligne : `bleu` (victoire, gain), `orange` (défaite, perte), `texte-doux` sinon. */
export type Ton = "victoire" | "defaite" | "neutre"

/** Un fait de la deuxième rangée d'une ligne : son texte écrit, son pictogramme (SF Symbol, masqué à VoiceOver) s'il en a un. */
export type Fait = { texte: string; icone: string | null }







export type LignePartie = {
  cle: string
  bordure: Ton
  resultat: { texte: string; ton: Ton } | null
  suite: string
  rr: { texte: string; ton: Ton } | null
  faits: Fait[]
  note: string | null
  kda: string
  mention: Mention | null
  phrase: string
}

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const ORDINAUX_DITS = [
  "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième", "huitième", "neuvième", "dixième",
  "onzième", "douzième", "treizième", "quatorzième", "quinzième", "seizième", "dix-septième", "dix-huitième", "dix-neuvième", "vingtième",
]
const RESULTATS: Readonly<Record<"victoire" | "defaite" | "nul", { texte: string; dit: string; ton: Ton }>> = {
  victoire: { texte: "Victoire", dit: "victoire", ton: "victoire" },
  defaite: { texte: "Défaite", dit: "défaite", ton: "defaite" },
  nul: { texte: "Nul", dit: "nul", ton: "neutre" },
}
const MENTIONS_DITES: Readonly<Record<Mention, string>> = { merite: "mérite", distinction: "distinction" }

/** Un fait tenu entier : ses espaces deviennent insécables. */
function insecable(s: string): string {
  return s.replace(/ /g, NBSP)
}

/** Un entier positif ou nul, ou null. */
function entier(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null
}


export function ordinalEcrit(n: number): string {
  return n === 1 ? `1${EXPOSANT_E}${EXPOSANT_R}` : `${n}${EXPOSANT_E}`
}


export function ordinalDit(n: number): string {
  return ORDINAUX_DITS[n - 1] ?? `${n}e`
}


function compte(n: number, nom: string): string {
  return `${nombreEnClair(n, 0)} ${nom}${n > 1 ? "s" : ""}`
}

/** Le score de manches gardé (`manchesGagnees`, `manchesPerdues`), ou null : en deathmatch et en match à mort en équipe, aucun. */
function scoreDe(p: Partie): { gagnees: number; perdues: number } | null {
  const g = entier(p.manchesGagnees), d = entier(p.manchesPerdues)
  return g === null || d === null ? null : { gagnees: g, perdues: d }
}

/** Le résultat d'une partie, ou null (deathmatch, résultat absent). */
function resultatDe(p: Partie) {
  return p.resultat === "victoire" || p.resultat === "defaite" || p.resultat === "nul" ? RESULTATS[p.resultat] : null
}


function dateDe(debut: string, annee: number): { faits: string[]; dite: string } | null {
  const d = new Date(debut)
  if (Number.isNaN(d.getTime())) return null
  const j = d.getDate(), m = d.getMonth(), a = d.getFullYear()
  const h = d.getHours(), mn = String(d.getMinutes()).padStart(2, "0")
  const an = a === annee ? "" : ` ${a}`
  return {
    faits: [insecable(`${j} ${MOIS_COURTS[m]}${an}`), `${String(h).padStart(2, "0")}:${mn}`],
    dite: `${j === 1 ? "1er" : j} ${MOIS_LONGS[m]}${an} à ${h} h ${mn}`,
  }
}

/** Le groupe (taille, toi compris) : pictogramme d'une, deux ou trois personnes, écrit et dit ; null sans taille lisible. */
function groupeDe(taille: number | null): { fait: Fait; dit: string } | null {
  if (taille === null || taille < 1) return null
  if (taille === 1) return { fait: { texte: "seul", icone: "person.fill" }, dit: "seul" }
  if (taille === 2) return { fait: { texte: "duo", icone: "person.2.fill" }, dit: "en duo" }
  return { fait: { texte: insecable(`groupe de ${taille}`), icone: "person.3.fill" }, dit: `en groupe de ${taille}` }
}






function placementDe(p: Partie): { ecrit: string; dit: string } | null {
  const rang = entier(p.placement)
  if (rang === null || rang < 1) return null
  const mvp = mvpDeLaPartie(p)
  if (mvp === "match") return { ecrit: "MVP", dit: "MVP" }
  if (mvp === "equipe") return { ecrit: insecable("MVP de l'équipe"), dit: "MVP de l'équipe" }
  return { ecrit: insecable(`${ordinalEcrit(rang)} de l'équipe`), dit: `${ordinalDit(rang)} de l'équipe` }
}

/** Les lignes de RR par matchId (en minuscules, comme les Barres de RR), la première de chaque partie. */
export function tableDesRr(rr: readonly LigneRr[]): Map<string, LigneRr> {
  const t = new Map<string, LigneRr>()
  for (const l of rr) {
    if (typeof l !== "object" || l === null || typeof l.matchId !== "string") continue
    const cle = l.matchId.toLowerCase()
    if (!t.has(cle)) t.set(cle, l)
  }
  return t
}

/** Le RR d'une partie (`last_change` tel quel ; State Patterns, RR absent) : écrit, ton et dit ; null sans ligne chiffrée. */
function rrDe(p: Partie, rr: ReadonlyMap<string, LigneRr>): { texte: string; ton: Ton; dit: string } | null {
  const l = rr.get(p.matchId.toLowerCase())
  const x = l ? l.last_change : null
  if (typeof x !== "number" || !Number.isFinite(x)) return null
  const n = Math.round(x)
  return {
    texte: rrEnClair(n),
    ton: n > 0 ? "victoire" : n < 0 ? "defaite" : "neutre",
    dit: n > 0 ? `plus ${nombreEnClair(n, 0)} RR` : n < 0 ? `moins ${nombreEnClair(-n, 0)} RR` : "0 RR",
  }
}

/** Première lettre en capitale (début de la phrase VoiceOver). */
function capitale(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}











export function ligneDePartie(p: Partie, rr: ReadonlyMap<string, LigneRr>, annee: number): LignePartie {
  const res = resultatDe(p)
  const score = scoreDe(p)
  const place = entier(p.place)
  const t = p.totaux ?? null
  const kills = entier(t?.kills), morts = entier(t?.morts), assists = entier(t?.assists)
  const carte = p.carte?.name ? p.carte.name : null
  const agent = p.agent?.name ? p.agent.name : null
  const ecrits: string[] = [], dits: string[] = []
  // 1ʳᵉ rangée : le résultat et son score, ou en deathmatch la place et les kills ; puis l'abandon, la carte et l'agent.
  let tete = ""
  if (res !== null) {
    if (score !== null) {
      tete = `${NBSP}${scoreEcrit(score)}`
      dits.push(`${res.texte} ${score.gagnees} à ${score.perdues}`)
    } else dits.push(res.texte)
  } else if (place !== null && place >= 1) {
    const joueurs = entier(p.joueurs)
    const sur = joueurs !== null && joueurs > 0 ? ` sur ${joueurs}` : ""
    ecrits.push(insecable(`${ordinalEcrit(place)}${sur}`))
    dits.push(`${ordinalDit(place)}${sur}`)
    if (kills !== null) ecrits.push(insecable(compte(kills, "kill")))
  }
  if (p.abandon === true) {
    ecrits.push("abandon")
    dits.push("abandon")
  }
  for (const nom of [carte, agent]) {
    if (nom === null) continue
    ecrits.push(insecable(nom))
    dits.push(nom)
  }
  const suite = tete + (ecrits.length === 0 ? "" : (res !== null ? SEP : "") + ecrits.join(SEP))
  const r = rrDe(p, rr)
  if (r !== null) dits.push(r.dit)
  // 2ᵉ rangée : date, heure, groupe, placement ; la note et sa mention.
  const faits: Fait[] = []
  const quand = dateDe(p.debut, annee)
  if (quand !== null) {
    for (const f of quand.faits) faits.push({ texte: f, icone: null })
    dits.push(quand.dite)
  }
  const groupe = groupeDe(entier(p.groupe))
  if (groupe !== null) {
    faits.push(groupe.fait)
    dits.push(groupe.dit)
  }
  const placement = res !== null ? placementDe(p) : null
  if (placement !== null) {
    faits.push({ texte: placement.ecrit, icone: null })
    dits.push(placement.dit)
  }
  const note = typeof p.note === "number" && Number.isFinite(p.note) ? nombreEnClair(p.note, 0) : null
  const mention = mentionDe(p)
  if (note !== null) dits.push(`note ${note}${mention !== null ? `, ${MENTIONS_DITES[mention]}` : ""}`)
  else if (mention !== null) dits.push(MENTIONS_DITES[mention])
  // 3ᵉ rangée : K/D/A, le score de combat.
  const bas: string[] = []
  if (kills !== null || morts !== null || assists !== null) {
    const v = (x: number | null) => (x === null ? valeurEnClair(null, SCORE.mesure) : nombreEnClair(x, 0))
    bas.push(insecable(`K/D/A ${v(kills)} / ${v(morts)} / ${v(assists)}`))
    if (kills !== null) dits.push(compte(kills, "kill"))
    if (morts !== null) dits.push(compte(morts, "mort"))
    if (assists !== null) dits.push(compte(assists, "assist"))
  }
  const sc = chiffresPartie(p).score
  if (sc !== null && sc.valeur !== null) {
    const texte = valeurEnClair(sc.valeur, SCORE.mesure)
    bas.push(insecable(`score ${texte}`))
    dits.push(`score de combat ${texte}`)
  }
  return {
    cle: p.matchId,
    bordure: res !== null ? res.ton : "neutre",
    resultat: res !== null ? { texte: res.texte, ton: res.ton } : null,
    suite,
    rr: r !== null ? { texte: r.texte, ton: r.ton } : null,
    faits,
    note,
    kda: bas.join(SEP),
    mention,
    phrase: `${capitale(dits.join(", "))}.`,
  }
}


export type MancheFrise = { numero: number; gagnee: boolean | null; libelle: string }






export type Frise = { manches: MancheFrise[]; miTemps: number | null; note: string; phrase: string }

/**
 * La Frise des manches de la partie (DESIGN.md, frise-manches ; EXPERIENCE.md, Frise des manches, Partie sans manches, Partie
 * abandonnée) : ses manches jouées (`manches`, la manche « Surrendered » déjà écartée par la réduction) ; la mi-temps, avant
 * la première manche dont le côté diffère de celui de la première (côtés posés par la réduction selon la règle du jeu, import
 * compris ; aucun en escarmouche) ; null sans manche (deathmatch, match à mort en équipe) : pas de Frise.
 */
export function friseDeLaPartie(p: Partie): Frise | null {
  const ms = p.manches ?? []
  if (ms.length === 0) return null
  const manches: MancheFrise[] = ms.map((m, i) => {
    const numero = entier(m.numero) ?? i + 1
    const gagnee = m.gagnee === true ? true : m.gagnee === false ? false : null
    return { numero, gagnee, libelle: `Manche ${numero}, ${gagnee === true ? "gagnée" : gagnee === false ? "perdue" : "issue inconnue"}` }
  })
  const premier = ms[0].cote
  const k = premier == null ? -1 : ms.findIndex((m) => m.cote != null && m.cote !== premier)
  const miTemps = k > 0 ? k : null
  const res = resultatDe(p)
  const score = scoreDe(p)
  const carte = p.carte?.name ? p.carte.name : null
  const ecrits: string[] = []
  if (carte !== null) ecrits.push(insecable(carte))
  if (score !== null) ecrits.push(`${score.gagnees}${TIRET_SCORE}${score.perdues}`)
  if (p.abandon === true) ecrits.push("abandon")
  if (miTemps !== null) ecrits.push("le trait blanc marque la mi-temps.")
  const gagnees = manches.filter((m) => m.gagnee === true).length
  const issue: string[] = []
  if (res !== null) issue.push(score !== null ? `${res.dit} ${score.gagnees} à ${score.perdues}` : res.dit)
  if (p.abandon === true) issue.push("abandon")
  issue.push(`${nombreEnClair(gagnees, 0)} manche${gagnees > 1 ? "s" : ""} gagnée${gagnees > 1 ? "s" : ""} sur ${nombreEnClair(manches.length, 0)}`)
  const mi = miTemps !== null ? ` ; mi-temps après la manche ${manches[miTemps - 1].numero}` : ""
  return {
    manches,
    miTemps,
    note: ecrits.join(SEP),
    phrase: `Dernière partie${carte !== null ? `, ${carte}` : ""} : ${issue.join(", ")}${mi}.`,
  }
}

/**
 * Les Lignes du lot `k` (le premier : 0) d'une sélection, sur ses parties dans leur ordre (la plus récente d'abord) ; une
 * partie dont le calcul lève est sautée, dite en console : le lot, gardé avec sa sélection, ne le dit qu'une fois.
 */
export function lignesDuLot(sel: Selection, k: number, rr: ReadonlyMap<string, LigneRr>, annee: number): LignePartie[] {
  const lignes: LignePartie[] = []
  for (const p of sel.parties.slice(k * LOT_PARTIES, (k + 1) * LOT_PARTIES)) {
    try {
      lignes.push(ligneDePartie(p, rr, annee))
    } catch (e) {
      console.log(`parties : ligne impossible (${e})`)
    }
  }
  return lignes
}

/** La Frise de la dernière partie d'une sélection ; null sans partie, sans manche, ou si son calcul lève (dit en console). */
export function friseDuPerimetre(sel: Selection): Frise | null {
  if (sel.parties.length === 0) return null
  try {
    return friseDeLaPartie(sel.parties[0])
  } catch (e) {
    console.log(`parties : frise impossible (${e})`)
    return null
  }
}

// ─────────────────────────── calculs du Détail (entrée 33) ───────────────────────────

/** Un Chiffre du résumé : sa clé, son libellé, sa valeur écrite (« — » : absente), son sous-texte (null : aucun), sa phrase VoiceOver. */
export type ChiffreDetail = { cle: string; libelle: string; valeur: string; sousTexte: string | null; voix: string }








export type DetailVu = {
  cle: string
  titre: string | null
  ton: Ton | null
  rr: { texte: string; ton: Ton } | null
  enTete: string
  sousTitre: string
  sousTitreDit: string
  chiffres: ChiffreDetail[]
  equipe: LigneTableau[]
  /** Ticket 4.52 : le détail du RR de la partie (rrDuDetail) ; vide sans ligne de rr.json. */
  rrDetail: LigneDetaillee[]
  /** Ticket 4.52 : tes flèches de performance de Riot (flechesDuDetail) ; vide sans elles. */
  fleches: LigneDetaillee[]
  /** Ticket 4.54 : la note de la dépense d'équipe (noteDepenseEquipe), null sans manche dont les deux équipes sont vérifiées. */
  noteDepense: string | null
}


function scoreEcrit(score: { gagnees: number; perdues: number }): string {
  return `${score.gagnees}${TIRET_SCORE}${GLUON}${score.perdues}`
}


function dureeDe(ms: number | null | undefined): { ecrit: string; dit: string } | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null
  const n = Math.max(1, Math.round(ms / 60_000))
  return { ecrit: `${nombreEnClair(n, 0)}${NBSP}min`, dit: `${nombreEnClair(n, 0)} minute${n > 1 ? "s" : ""}` }
}

/** Une valeur écrite, dite : « — » devient « aucune valeur ». */
function dite(texte: string): string {
  return texte === TIRET ? SANS_VALEUR : texte
}

/** La valeur d'un chiffre d'une partie, ou null (hors des files de sa stat, donnée absente, dénominateur nul). */
function valeurDe(c: ChiffrePartie | null): number | null {
  return c === null ? null : c.valeur
}

/** Un Chiffre : son libellé écrit (coupé entre les mots seulement), son nom dit, sa valeur, son sous-texte écrit et dit (null : aucun). */
function chiffreDetail(cle: string, libelle: string, nom: string, valeur: string, sous: { ecrit: string; dit: string } | null): ChiffreDetail {
  return {
    cle, libelle: sansMauvaiseCoupure(libelle), valeur, sousTexte: sous === null ? null : sous.ecrit,
    voix: `${nom} : ${dite(valeur)}${sous === null ? "" : `, ${sous.dit}`}.`,
  }
}


function rangMoyenDe(rangs: Somme | null | undefined): string | null {
  const palier = palierMoyen(rangs ?? null)
  return palier === null ? null : nomDuPalier(palier)
}

/** La note moyenne d'un groupe (somme ÷ effectif de ses notes), à l'entier comme ta note ; null sans groupe ni note. */
function noteMoyenneDe(g: Groupe | null): string | null {
  const n = g === null ? null : g.note
  return n == null || !(n.effectif > 0) ? null : nombreEnClair(n.somme / n.effectif, 0)
}

/** Le score de combat moyen d'un groupe (SCORE.groupe : Σ score ÷ Σ manches), à une décimale ; null sans groupe ni manche. */
function scoreMoyenDe(g: Groupe | null): string | null {
  const f = g === null || !("groupe" in SCORE) ? null : SCORE.groupe(g)
  return f === null || !(f.den > 0) ? null : valeurEnClair(f.num / f.den, SCORE.mesure)
}














export function detailDePartie(p: Partie, rr: ReadonlyMap<string, LigneRr>, annee: number): DetailVu {
  const res = resultatDe(p)
  const score = scoreDe(p)
  const place = entier(p.place)
  let titre: string | null = null, titreDit: string | null = null
  if (res !== null) {
    titre = score !== null ? `${res.texte} ${scoreEcrit(score)}` : res.texte
    titreDit = score !== null ? `${res.texte} ${score.gagnees} à ${score.perdues}` : res.texte
  } else if (place !== null && place >= 1) {
    const joueurs = entier(p.joueurs)
    const sur = joueurs !== null && joueurs > 0 ? ` sur ${joueurs}` : ""
    titre = titreAffiche(`${ordinalEcrit(place)}${sur}`)
    titreDit = capitale(`${ordinalDit(place)}${sur}`)
  }
  const ecrits: string[] = [], dits: string[] = []
  if (p.abandon === true) {
    if (titre !== null && titreDit !== null) {
      titre += `${SEP}abandon`
      titreDit += ", abandon"
    } else {
      ecrits.push("abandon")
      dits.push("abandon")
    }
  }
  const r = rrDe(p, rr)
  const enTete = [titreDit, r === null ? null : r.dit].filter((x): x is string => x !== null).join(", ")
  // Sous-titre : carte, agent, date et heure, durée, groupe.
  for (const nom of [p.carte?.name ? p.carte.name : null, p.agent?.name ? p.agent.name : null]) {
    if (nom === null) continue
    ecrits.push(insecable(nom))
    dits.push(nom)
  }
  const quand = dateDe(p.debut, annee)
  if (quand !== null) {
    ecrits.push(...quand.faits)
    dits.push(quand.dite)
  }
  const duree = dureeDe(p.duree)
  if (duree !== null) {
    ecrits.push(duree.ecrit)
    dits.push(duree.dit)
  }
  const groupe = groupeDe(entier(p.groupe))
  if (groupe !== null) {
    ecrits.push(insecable(groupe.dit))
    dits.push(groupe.dit)
  }
  // Six Chiffres.
  const ch = chiffresPartie(p)
  const note = typeof p.note === "number" && Number.isFinite(p.note) ? nombreEnClair(p.note, 0) : TIRET
  const mention = mentionDe(p)
  const pass = typeof p.mention === "string" && p.mention.toLowerCase() === "pass"
  const sousNote = note === TIRET ? null : mention !== null ? MENTIONS_DITES[mention] : pass ? "sans mention" : null
  const t = p.totaux ?? null
  const kda = [entier(t?.kills), entier(t?.morts), entier(t?.assists)].map((x) => (x === null ? TIRET : nombreEnClair(x, 0)))
  const placement = res !== null ? placementDe(p) : null
  const ecart = valeurDe(ch.ecartDegats)
  const chiffres: ChiffreDetail[] = [
    chiffreDetail("note", "Note Valorant", "Note Valorant", note, sousNote === null ? null : { ecrit: sousNote, dit: sousNote }),
    {
      cle: "kda", libelle: sansMauvaiseCoupure("K/D/A"), valeur: sansMauvaiseCoupure(kda.join("/")), sousTexte: null,
      voix: `Kills, morts, assists : ${kda.map(dite).join(", ")}.`,
    },

    chiffreDetail("score", "Score", "Score de combat", valeurEnClair(valeurDe(ch.score), SCORE.mesure),
      placement === null ? null : { ecrit: placement.ecrit.split(NBSP).join(" "), dit: placement.dit }),
    chiffreDetail("degats", "Dégâts / manche", "Dégâts par manche", valeurEnClair(valeurDe(ch.degats), DEGATS.mesure), null),
    chiffreDetail("ecartDegats", "Écart de dégâts", "Écart de dégâts", ecart === null ? TIRET : ecartEnClair(ecart, ECART_DEGATS.mesure), null),
    chiffreDetail("tete", "Tirs à la tête", "Tirs à la tête", valeurEnClair(valeurDe(ch.tete), TETE.mesure), null),
  ]
  // Ton équipe et l'adversaire : les moyennes des groupes gardés (Confidentialité : au moins 3 autres joueurs).
  const allies = p.groupes?.allies ?? null, adversaires = p.groupes?.adversaires ?? null
  const rangees: { libelle: string; equipe: string | null; adversaires: string | null }[] = [
    { libelle: "Rang moyen", equipe: rangMoyenDe(p.rangsAllies), adversaires: rangMoyenDe(p.rangsAdversaires) },
    { libelle: "Note Valorant moyenne", equipe: noteMoyenneDe(allies), adversaires: noteMoyenneDe(adversaires) },
    { libelle: "Score de combat moyen", equipe: scoreMoyenDe(allies), adversaires: scoreMoyenDe(adversaires) },
  ]
  // Ticket 4.54 : la dépense de chaque équipe par manche, sur les manches où les deux sont vérifiées.
  const depense = depenseDEquipe(p)
  if (depense !== null) rangees.push({ libelle: LIGNE_DEPENSE_EQUIPE, equipe: nombreEnClair(depense.equipe, 0), adversaires: nombreEnClair(depense.adverse, 0) })
  const equipe: LigneTableau[] = []
  for (const x of rangees) {
    if (x.equipe === null && x.adversaires === null) continue
    equipe.push({
      cellules: [x.libelle, x.equipe ?? TIRET, x.adversaires ?? TIRET],
      voix: `${x.libelle} : ton équipe ${x.equipe ?? SANS_VALEUR}, adversaires ${x.adversaires ?? SANS_VALEUR}.`,
    })
  }
  return {
    cle: p.matchId,
    titre,
    ton: res !== null ? res.ton : null,
    rr: r === null ? null : { texte: r.texte, ton: r.ton },
    enTete,
    sousTitre: ecrits.join(SEP),
    sousTitreDit: dits.length === 0 ? "" : `${capitale(dits.join(", "))}.`,
    chiffres,
    equipe,
    rrDetail: rrDuDetail(p, rr),
    fleches: flechesDuDetail(p.fleches ?? null),
    noteDepense: depense === null ? null : noteDepenseEquipe(depense.manches),
  }
}

// ─────────────────────────── ticket 4.52 : détail du RR, flèches de Valorant ───────────────────────────


function palierEtRr(tier: { id: number } | null | undefined, rr: number | null | undefined): string | null {
  const nom = nomDuPalier(tier?.id)
  const n = entier(rr)
  return nom === null || n === null ? null : insecable(`${nom} · ${nombreEnClair(n, 0)} RR`)
}

/**
 * Le détail du RR d'une partie, de sa ligne de rr.json (mmr-history v2 de HenrikDev, ticket 4.52), chaque ligne seulement si Riot
 * la donne : avant et après la partie (palier et RR, tels quels), bonus de performance (`rr_performance_bonus` > 0), RR remboursés
 * (`refunded_rr` > 0), bouclier de rang utilisé (`was_derank_protected`), partie de placement (`is_placement_match`). Jamais les
 * pénalités (`afk_penalty`, `rr_penalty` : toujours 0 dans les 40 lignes mesurées, unité non documentée). Vide sans ligne.
 */
export function rrDuDetail(p: Partie, rr: ReadonlyMap<string, LigneRr>): LigneDetaillee[] {
  const l = rr.get(p.matchId.toLowerCase())
  if (!l) return []
  const lignes: LigneDetaillee[] = []
  const ajouter = (libelle: string, detail: string, dit: string = detail) => lignes.push({ libelle, detail, voix: `${libelle} : ${dit}.` })
  const avant = palierEtRr(l.tier_before_update, l.rr_before_update)
  const apres = palierEtRr(l.tier, l.rr)
  if (avant !== null) ajouter("Avant la partie", avant, avant.split(NBSP).join(" "))
  if (apres !== null) ajouter("Après la partie", apres, apres.split(NBSP).join(" "))
  const bonus = entier(l.rr_performance_bonus)
  if (bonus !== null && bonus > 0) ajouter("Bonus de performance", rrEnClair(bonus), `plus ${nombreEnClair(bonus, 0)} RR`)
  const rembourse = entier(l.refunded_rr)
  if (rembourse !== null && rembourse > 0) ajouter("RR remboursés", rrEnClair(rembourse), `plus ${nombreEnClair(rembourse, 0)} RR`)
  if (l.was_derank_protected === true) ajouter("Bouclier de rang", "utilisé, pas de descente")
  if (l.is_placement_match === true) ajouter("Placement", "partie de placement")
  return lignes
}

/** Une flèche de Riot écrite et dite (aucune couleur : Riot ne dit pas à quoi il compare). */
const FLECHES_ECRITES: Readonly<Record<Tendance, { ecrit: string; dit: string }>> = {
  double_up: { ecrit: "↑↑", dit: "deux flèches vers le haut" },
  up: { ecrit: "↑", dit: "une flèche vers le haut" },
  neutral: { ecrit: "=", dit: "neutre" },
  down: { ecrit: "↓", dit: "une flèche vers le bas" },
  double_down: { ecrit: "↓↓", dit: "deux flèches vers le bas" },
}

/** Les deux familles de flèches de Riot (`ratings.combat`, `ratings.utility`), dans l'ordre de l'écran de fin de partie de HenrikDev. */
const FAMILLES_FLECHES: readonly { libelle: string; cles: readonly (readonly [keyof Fleches, string])[] }[] = [
  { libelle: "Combat", cles: [["degats", "Dégâts"], ["impactKills", "Impact des kills"], ["impactMorts", "Impact des morts"], ["echanges", "Échanges"]] },
  {
    libelle: "Utilitaires",
    cles: [["assists", "Assists"], ["poses", "Poses"], ["desamorcages", "Désamorçages"], ["capacites", "Utilisation des capacités"]],
  },
]

/**
 * Tes flèches de performance (ticket 4.52) : une ligne par flèche connue, huit au plus, dans l'ordre des familles (combat, puis
 * utilitaires) : libellé « Dégâts », détail « ↑↑ · combat », dite « Dégâts, combat : deux flèches vers le haut. » ; une flèche
 * absente ou inconnue : sa ligne omise. Vide sans flèches.
 */
export function flechesDuDetail(f: Fleches | null): LigneDetaillee[] {
  if (f === null || typeof f !== "object") return []
  const lignes: LigneDetaillee[] = []
  for (const famille of FAMILLES_FLECHES) {
    for (const [cle, nom] of famille.cles) {
      const t = f[cle]
      const x = typeof t === "string" ? FLECHES_ECRITES[t] : undefined
      if (!x) continue
      const fam = famille.libelle.toLowerCase()
      lignes.push({ libelle: nom, detail: `${x.ecrit}${SEP}${fam}`, voix: `${nom}, ${fam} : ${x.dit}.` })
    }
  }
  return lignes
}

// ─────────────────────────── calculs des manches (entrée 34) ───────────────────────────

/** Un texte écrit et ce que VoiceOver en lit. */
type Dit = { ecrit: string; dit: string }






export type CaseManche = {
  numero: number
  gagnee: boolean | null
  libelle: string
  lettre: string | null
  kills: string
  mort: boolean
  etiquette: string
  etiquetteDite: string
  recit: string
  recitDit: string
}

/** Un groupe de la grille : sa légende (« Attaque », « Défense », « Prolongation » ; null sans côté) et ses manches (rangs dans `cases`). */
export type GroupeManches = { titre: string | null; manches: number[] }

/**
 * Les manches d'une partie, racontées : une case par manche jouée, dans l'ordre ; les groupes de la grille ; des lettres d'achat ou non ;
 * si l'Encadré d'une de ses manches nomme une zone (ticket 4.48).
 */
export type ManchesDetail = { cases: CaseManche[]; groupes: GroupeManches[]; lettres: boolean; zoneNommee: boolean; depenseDite?: boolean }

/** Tes morts dans cette partie : la phrase, écrite et dite ; ses Chiffres (aucun hors des files complètes) ; si la phrase nomme une zone (4.48). */
export type MortsDetail = { phrase: string; phraseDite: string; chiffres: ChiffreDetail[]; zoneNommee: boolean }

/** Ta mort comptée comme au K/D (Définitions des métriques, K/D) : toute mort sauf celle par le spike. */
function mortComptee(k: Kill): boolean {
  return k.sens === "mort" && k.arme?.type !== "Bomb"
}

/** Ton kill compté comme au K/D : celui d'un adversaire. */
function killCompte(k: Kill): boolean {
  return k.sens === "kill" && k.adverse === true
}

/** Le côté écrit d'une manche, ou null (escarmouche, hors des files à côtés). */
function coteEcrit(c: Cote | null | undefined): string | null {
  return c === "attaque" ? "attaque" : c === "defense" ? "défense" : null
}


function momentDe(ms: number | null | undefined): Dit | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null
  const s = Math.floor(Math.max(0, ms) / 1000), mn = Math.floor(s / 60), r = s % 60
  return {
    ecrit: `${mn}:${String(r).padStart(2, "0")}`,
    dit: mn === 0 ? `${r} seconde${r > 1 ? "s" : ""}` : `${mn} minute${mn > 1 ? "s" : ""}${r > 0 ? ` ${r}` : ""}`,
  }
}

/** La zone de chaque kill et de chaque mort de la partie (entrée 8, catalog.json tenu), par kill. */
function zonesParKill(p: Partie, cartes: SectionCartes): Map<Kill, Zone | null> {
  return new Map(zonesDeLaPartie(p, cartes).map((z): [Kill, Zone | null] => [z.kill, z.zone]))
}







function achatDe(m: Manche, type: TypeDeManche | null): Dit | null {
  if (type == null || !Object.prototype.hasOwnProperty.call(LIBELLES_ACHAT_MANCHE, type)) return null
  const objets: string[] = []
  const arme = m.arme?.name
  if (typeof arme === "string" && arme !== "") objets.push(arme)
  const armure = m.armure?.name
  if (typeof armure === "string" && armure !== "") objets.push(Object.prototype.hasOwnProperty.call(ARMURES, armure) ? ARMURES[armure] : armure)
  const valeur = typeof m.equipement === "number" && Number.isFinite(m.equipement) && m.equipement >= 0 ? Math.round(m.equipement) : null

  const eq = valeur !== null ? `${nombreEnClair(valeur, 0)} crédit${valeur >= 2 ? "s" : ""}` : null
  const quoi = `${LIBELLES_ACHAT_MANCHE[type]}${objets.length > 0 ? ` : ${objets.join(" et ")}` : ""}`
  return { ecrit: `${quoi}${eq !== null ? ` (${eq})` : ""}.`, dit: `${quoi}${eq !== null ? `, ${eq}` : ""}.` }
}


function creditsEcrits(n: number): string {
  return `${nombreEnClair(n, 0)} crédit${n >= 2 ? "s" : ""}`
}





function depenseDe(m: Manche): Dit | null {
  const morceaux: string[] = []
  if (typeof m.poche === "number" && Number.isFinite(m.poche)) morceaux.push(`Tu as dépensé ${creditsEcrits(m.poche)}.`)
  const e = m.depenseEquipe ?? null, a = m.depenseAdverse ?? null
  if (e !== null && a !== null) morceaux.push(`Ton équipe a dépensé ${creditsEcrits(e.somme)}, l'adversaire ${nombreEnClair(a.somme, 0)}.`)
  else if (e !== null) morceaux.push(`Ton équipe a dépensé ${creditsEcrits(e.somme)}.`)
  else if (a !== null) morceaux.push(`L'adversaire a dépensé ${creditsEcrits(a.somme)}.`)
  if (morceaux.length === 0) return null
  const t = morceaux.join(" ")
  return { ecrit: t, dit: t }
}





function killsDe(tues: readonly Kill[], zones: ReadonlyMap<Kill, Zone | null>): Dit {
  if (tues.length === 0) return { ecrit: "Aucun kill.", dit: "Aucun kill." }
  const ordre = [...tues].sort((a, b) => (a.momentManche ?? 0) - (b.momentManche ?? 0))
  const items = ordre.map((k): Dit => {
    const t = momentDe(k.momentManche)
    const z = zones.get(k) ?? null
    const ou = z !== null ? ` à ${z.nom}` : ""
    const premier = k.premierDuel === true ? ", le premier de la manche" : ""
    return t !== null
      ? { ecrit: `${t.ecrit}${ou}${premier}`, dit: `${t.dit}${ou}${premier}` }
      : { ecrit: `moment inconnu${ou}${premier}`, dit: `moment inconnu${ou}${premier}` }
  })
  const tete = tues.length === 1 ? "Ton kill" : `Tes ${tues.length} kills`
  return { ecrit: `${tete} : ${items.map((x) => x.ecrit).join(" ; ")}.`, dit: `${tete} : ${items.map((x) => x.dit).join(" ; ")}.` }
}

/** Comment finit une manche (`issue`) : élimination, explosion du spike, désamorçage (qui, à quel moment), temps écoulé ; null sinon. */
function issueDe(m: Manche): Dit | null {
  switch (m.issue) {
    case "Elimination":
      return { ecrit: " par élimination", dit: " par élimination" }
    case "Detonate":
      return { ecrit: " par explosion du spike", dit: " par explosion du spike" }
    case "Defuse": {
      const d = m.desamorcage
      const qui = d?.desamorceur === "toi" ? "par ton désamorçage" : d?.desamorceur === "equipe" ? "par le désamorçage de ton équipe"
        : d?.desamorceur === "adversaire" ? "par le désamorçage adverse" : "par désamorçage"
      const t = momentDe(d?.moment)
      return { ecrit: ` ${qui}${t !== null ? ` à ${t.ecrit}` : ""}`, dit: ` ${qui}${t !== null ? ` à ${t.dit}` : ""}` }
    }
    case "":
      return { ecrit: " au temps écoulé", dit: " au temps écoulé" }
    default:
      return null
  }
}


function finDe(m: Manche, gagnee: boolean | null): Dit | null {
  const morceaux: Dit[] = []
  if (m.pose) {
    const qui = m.pose.poseur === "toi" ? "Ta pose" : m.pose.poseur === "equipe" ? "Pose de ton équipe" : m.pose.poseur === "adversaire" ? "Pose adverse" : "Pose"
    const sur = typeof m.pose.site === "string" && m.pose.site !== "" ? ` sur ${m.pose.site}` : ""
    const t = momentDe(m.pose.moment)
    morceaux.push({ ecrit: `${qui}${sur}${t !== null ? ` à ${t.ecrit}` : ""}`, dit: `${qui}${sur}${t !== null ? ` à ${t.dit}` : ""}` })
  }
  if (gagnee !== null) {
    const res = gagnee ? "victoire" : "défaite"
    const comment = issueDe(m)
    morceaux.push({ ecrit: `${res}${comment?.ecrit ?? ""}`, dit: `${res}${comment?.dit ?? ""}` })
  }
  if (morceaux.length === 0) return null
  return {
    ecrit: `${capitale(morceaux.map((x) => x.ecrit).join(" ; "))}.`,
    dit: `${capitale(morceaux.map((x) => x.dit).join(" ; "))}.`,
  }
}

/**
 * Une Case de manche et le récit de sa manche (le rang `i` en repli du numéro), de son type lu (`type`), de tes kills et morts de la
 * partie et de leurs zones.
 */
function caseDeManche(m: Manche, i: number, type: TypeDeManche | null, kills: readonly Kill[], zones: ReadonlyMap<Kill, Zone | null>): CaseManche {
  const numero = entier(m.numero) ?? i + 1
  const gagnee = m.gagnee === true ? true : m.gagnee === false ? false : null
  const issue = gagnee === true ? "gagnée" : gagnee === false ? "perdue" : null
  const cote = coteEcrit(m.cote)
  const siens = kills.filter((k) => k.manche === numero)
  const tues = siens.filter(killCompte)
  const n = tues.length
  const etiquette = [`Manche${NBSP}${numero}`, ...(cote !== null ? [cote] : []), ...(issue !== null ? [issue] : [])]
  const dite = [`Manche ${numero}`, ...(cote !== null ? [cote] : []), ...(issue !== null ? [issue] : [])]
  const recit = [achatDe(m, type), depenseDe(m), killsDe(tues, zones), finDe(m, gagnee)].filter((x): x is Dit => x !== null)
  return {
    numero,
    gagnee,
    libelle: `Manche ${numero}, ${issue ?? "issue inconnue"}`,
    lettre: type != null && Object.prototype.hasOwnProperty.call(LETTRES_ACHAT, type) ? LETTRES_ACHAT[type] : null,
    kills: n === 0 ? "" : n <= KILLS_EN_POINTS ? KILL.repeat(n) : `${nombreEnClair(n, 0)}${KILL}`,
    mort: siens.some(mortComptee),
    etiquette: etiquette.join(SEP),
    etiquetteDite: `${dite.join(", ")}.`,
    recit: sansMauvaiseCoupure(recit.map((x) => x.ecrit).join(" ")),
    recitDit: recit.map((x) => x.dit).join(" "),
  }
}

/**
 * Les groupes de la grille (EXPERIENCE.md, Case de manche) : la première mi-temps, les manches avant le premier changement de côté
 * (côtés posés par la réduction selon la règle du jeu, import compris), sous son côté ; la seconde, autant de manches, sous l'autre ;
 * la prolongation, le reste ; sans côté à la première manche (escarmouche), un seul groupe sans légende ; sans changement de côté
 * (partie abandonnée avant la mi-temps), un seul groupe sous son côté.
 */
function groupesDe(ms: readonly Manche[]): GroupeManches[] {
  const tous = ms.map((_, i) => i)
  const nom = (c: Cote | null | undefined) => (c === "attaque" ? GROUPE_ATTAQUE : GROUPE_DEFENSE)
  const premier = ms[0].cote
  if (premier !== "attaque" && premier !== "defense") return [{ titre: null, manches: tous }]
  const k = ms.findIndex((m) => m.cote != null && m.cote !== premier)
  if (k <= 0) return [{ titre: nom(premier), manches: tous }]
  const groupes: GroupeManches[] = [{ titre: nom(premier), manches: tous.slice(0, k) }, { titre: nom(ms[k].cote), manches: tous.slice(k, 2 * k) }]
  if (tous.length > 2 * k) groupes.push({ titre: GROUPE_PROLONGATION, manches: tous.slice(2 * k) })
  return groupes
}

/**
 * Les manches d'une partie, racontées (Manche par manche ; DESIGN.md, case-manche, encadre-manche ; EXPERIENCE.md, Case de manche,
 * Encadré de manche, Partie sans manches, Partie abandonnée), de ses manches jouées (la manche « Surrendered » déjà écartée par la
 * réduction), de tes kills et morts et de leurs zones (catalog.json, `cartes`) : une case par manche, les groupes de la grille, et
 * si la grille porte des lettres d'achat ; null sans manche (deathmatch, match à mort en équipe) : ni grille ni Encadré.
 */
export function manchesDuDetail(p: Partie, cartes: SectionCartes): ManchesDetail | null {
  const ms = p.manches ?? []
  if (ms.length === 0) return null
  const zones = zonesParKill(p, cartes)
  const kills = p.kills ?? []
  const cases = ms.map((m, i) => caseDeManche(m, i, typeDeManche(p, m), kills, zones))
  // Une zone nommée dans un Encadré : un de tes kills comptés d'une manche jouée (ceux que killsDe raconte) qui a la sienne.
  const numeros = new Set(cases.map((c) => c.numero))
  const zoneNommee = kills.some((k) => killCompte(k) && numeros.has(k.manche) && (zones.get(k) ?? null) !== null)
  // Ticket 4.54 : une dépense dite dans un Encadré (MENTION_DEPENSE_MANCHE en note).
  const depenseDite = ms.some((m) => depenseDe(m) !== null)
  return { cases, groupes: groupesDe(ms), lettres: cases.some((c) => c.lettre !== null), zoneNommee, depenseDite }
}


function meilleurClutch(ms: readonly Manche[]): { adversaires: number; numero: number } | null {
  let meilleur: { adversaires: number; numero: number } | null = null
  for (let i = 0; i < ms.length; i++) {
    const c = ms[i].clutch
    if (c == null || c.gagne !== true || !(c.adversaires >= 1)) continue
    if (meilleur === null || c.adversaires > meilleur.adversaires) meilleur = { adversaires: c.adversaires, numero: entier(ms[i].numero) ?? i + 1 }
  }
  return meilleur
}

/**
 * La note de Manche par manche : ce qu'est une zone (MENTION_ZONE, 4.48) si un Encadré en nomme une, puis ce que compte une dépense
 * (MENTION_DEPENSE_MANCHE, 4.54) si un Encadré en dit une ; undefined sans l'une ni l'autre.
 */
export function noteDesManches(md: ManchesDetail): string | undefined {
  const l = [...(md.zoneNommee ? [MENTION_ZONE] : []), ...(md.depenseDite === true ? [sansMauvaiseCoupure(MENTION_DEPENSE_MANCHE)] : [])]
  return l.length === 0 ? undefined : l.join(" ")
}











export function mortsDuDetail(p: Partie, cartes: SectionCartes): MortsDetail | null {
  const ms = p.manches ?? []
  if (ms.length === 0) return null
  const cotes = new Map<number, Cote | null>()
  ms.forEach((m, i) => cotes.set(entier(m.numero) ?? i + 1, m.cote ?? null))
  const zones = zonesParKill(p, cartes)
  const morts = (p.kills ?? []).filter((k) => mortComptee(k) && cotes.has(k.manche))
  let phrase: Dit
  let zoneNommee = false
  if (morts.length === 0) {
    phrase = { ecrit: "Aucune mort dans cette partie.", dit: "Aucune mort dans cette partie." }
  } else if (morts.length === 1) {
    const k = morts[0]
    const t = momentDe(k.momentManche)
    const z = zones.get(k) ?? null
    const cote = coteEcrit(cotes.get(k.manche))
    zoneNommee = z !== null
    const reste = [...(z !== null ? [`à ${z.nom}`] : []), ...(cote !== null ? [`en ${cote}`] : [])]
    const dite = (x: string | null) => [`manche ${k.manche}${x !== null ? ` à ${x}` : ""}`, ...reste].join(", ")
    phrase = { ecrit: `Ta seule mort : ${dite(t?.ecrit ?? null)}.`, dit: `Ta seule mort : ${dite(t?.dit ?? null)}.` }
  } else {
    const datees = morts.filter((k) => typeof k.momentManche === "number" && Number.isFinite(k.momentManche))
    const comptes = LIEUX_TRANCHES.map(() => 0)
    for (const k of datees) comptes[trancheDuMoment(k.momentManche)]++
    let t = 0
    for (let i = 1; i < comptes.length; i++) if (comptes[i] > comptes[t]) t = i
    if (comptes[t] === 0) {
      const ecrit = `${nombreEnClair(morts.length, 0)} morts dans cette partie.`
      phrase = { ecrit, dit: ecrit }
    } else {
      const paires: { zone: string; cote: string | null; n: number }[] = []
      for (const k of datees) {
        const z = zones.get(k) ?? null
        if (trancheDuMoment(k.momentManche) !== t || z === null) continue
        const cote = coteEcrit(cotes.get(k.manche))
        const x = paires.find((q) => q.zone === z.nom && q.cote === cote)
        if (x) x.n++
        else paires.push({ zone: z.nom, cote, n: 1 })
      }
      let haut: { zone: string; cote: string | null; n: number } | null = null
      for (const q of paires) if (haut === null || q.n > haut.n) haut = q
      zoneNommee = haut !== null && haut.n >= 2
      const dont = haut !== null && haut.n >= 2 ? `, dont ${nombreEnClair(haut.n, 0)} à ${haut.zone}${haut.cote !== null ? ` en ${haut.cote}` : ""}` : ""
      const tete = `${nombreEnClair(comptes[t], 0)} mort${comptes[t] > 1 ? "s" : ""} sur ${nombreEnClair(morts.length, 0)}`
      phrase = { ecrit: `${tete} ${LIEUX_TRANCHES[t].ecrit} de manche${dont}.`, dit: `${tete} ${LIEUX_TRANCHES[t].dit} de manche${dont}.` }
    }
  }
  const chiffres: ChiffreDetail[] = []
  const ch = chiffresPartie(p)
  if (ch.premiersKills !== null && ch.premieresMorts !== null) {
    chiffres.push(chiffreDetail("premiersKills", "Premiers kills", "Premiers kills", nombreEnClair(ch.premiersKills.fraction.num, 0), null))
    chiffres.push(chiffreDetail("premieresMorts", "Premières morts", "Premières morts", nombreEnClair(ch.premieresMorts.fraction.num, 0), null))
    const clutch = meilleurClutch(ms)
    chiffres.push(clutch === null
      ? { cle: "clutch", libelle: "Clutch", valeur: TIRET, sousTexte: null, voix: "Clutch : aucun clutch gagné." }
      : chiffreDetail("clutch", "Clutch", "Clutch", `1 contre ${nombreEnClair(clutch.adversaires, 0)}`, { ecrit: `manche ${clutch.numero}`, dit: `manche ${clutch.numero}` }))
  }
  return { phrase: sansMauvaiseCoupure(phrase.ecrit), phraseDite: phrase.dit, chiffres, zoneNommee }
}

// ─────────────────────────── vues ───────────────────────────

/** La couleur d'un ton : `bleu`, `orange`, `texte-doux`. */
function couleurTon(c: Palette, t: Ton): Color {

  return t === "victoire" ? c.vert : t === "defaite" ? c.rougeClair : c.texteDoux
}







function vueFrise(frise: Frise, c: Palette): VirtualNode {
  const colonnes: VirtualNode[] = []
  frise.manches.forEach((m, i) => {
    if (i === frise.miTemps) {
      colonnes.push(<Rectangle key="mi-temps" fill={c.texte} frame={{ width: FRISE.miTemps, height: FRISE.hauteur }} accessibilityHidden />)
    }
    colonnes.push(
      <VStack
        key={`manche-${i}`}
        spacing={0}
        frame={{ maxWidth: "infinity", height: FRISE.hauteur }}
        accessibilityElement
        accessibilityLabel={m.libelle}
      >
        <Rectangle fill={m.gagnee === true ? c.vert : "clear"} frame={{ height: FRISE.demi }} />
        <Rectangle fill={c.bordure} frame={{ height: FRISE.axe }} />
        <Rectangle fill={m.gagnee === false ? c.rougeClair : "clear"} frame={{ height: FRISE.demi }} />
      </VStack>,
    )
  })
  return (
    <HStack
      spacing={FRISE.ecart}
      frame={{ maxWidth: "infinity", height: FRISE.hauteur }}
      background={<Rectangle fill={c.bordure} frame={{ height: FRISE.axe }} />}
      accessibilityElement="contain"
      accessibilityLabel={frise.phrase}
    >
      {colonnes}
    </HStack>
  )
}

/** Badge de mention (DESIGN.md, badge-mention ; maquette) : contour 1 de rayon 2, `texte` (mérite) ou `or` (distinction), capitales, 11 en 800. */
function vueBadge(mention: Mention, c: Palette): VirtualNode {
  const couleur = mention === "distinction" ? c.or : c.texte
  return (
    <HStack
      padding={{ vertical: BADGE.vertical, horizontal: BADGE.horizontal }}
      background={<RoundedRectangle cornerRadius={ARRONDIS.sm} stroke={couleur} />}
    >
      <Text font="caption2" fontWeight="heavy" textCase="uppercase" foregroundStyle={couleur}>
        {MENTIONS_DITES[mention]}
      </Text>
    </HStack>
  )
}

/** Un fait de la 2ᵉ rangée, son « · » au bout s'il n'est pas le dernier ; son pictogramme devant, masqué à VoiceOver. */
function vueFait(fait: Fait, dernier: boolean, c: Palette, cle: number): VirtualNode {
  const ecrit = dernier ? fait.texte : `${fait.texte}${NBSP}·`
  if (fait.icone === null) {
    return (
      <Text key={cle} {...TYPO.petit} foregroundStyle={c.texteDoux}>
        {ecrit}
      </Text>
    )
  }
  return (
    <HStack key={cle} spacing={FAITS.pictogramme}>
      <Image systemName={fait.icone} font={TYPO.petit.font} foregroundStyle={c.texteDoux} accessibilityHidden />
      <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
        {ecrit}
      </Text>
    </HStack>
  )
}

/** Toute la largeur, à gauche. */
const PLEINE = { maxWidth: "infinity", alignment: "leading" } as const
/** Toute la largeur, à gauche, au moins une cible de haut (entrée 33 : une Ligne de partie, le Bloc de la Frise, touchables). */
const CASE_LIGNE = { maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" } as const

/**
 * Une Ligne de partie (DESIGN.md, ligne-partie ; maquette) : `surface`, bordure gauche de 4 au ton de son résultat ; marges 10
 * et 12 ; trois rangées à 4, deux colonnes à 10 (la gauche sur le reste, la droite à sa largeur, chiffres à chasse fixe) ;
 * dès la première taille d'accessibilité (`grand`), ses morceaux l'un sous l'autre, chaque fait sur sa ligne. Entrée 33 : un
 * bouton plain, toute la ligne (au moins 44 de haut, fond compris) répondant à l'appui, qui ouvre le Détail de sa partie
 * (`ouvrir`) ; un seul élément VoiceOver, sa phrase, et l'indice OUVRE_DETAIL.
 */
/**
 * Le Bloc de la Frise des manches de Parties (coin bas), tout entier un bouton plain qui ouvre le Détail de la dernière partie
 * (entrée 33) : titre, Frise, Légende, note masquée à VoiceOver. Ticket 4.49 : en composant, ses props (la Frise gardée avec sa
 * sélection, la palette, l'ouverture stable de l'onglet) restent les mêmes à « Voir plus » : Scripting ne le rend pas de nouveau.
 */
function BlocDeLaFrise({ frise, derniere, c, ouvrirPartie }: { frise: Frise; derniere: string; c: Palette; ouvrirPartie: (matchId: string) => void }) {
  return (
    <Button
      buttonStyle="plain"
      action={() => ouvrirPartie(derniere)}
      accessibilityLabel={frise.phrase}
      accessibilityHint={OUVRE_DETAIL}
    >
      <VStack contentShape="rect" frame={CASE_LIGNE}>
        <Bloc titre={TITRE_FRISE} coin="bas">
          {vueFrise(frise, c)}
          <Legende items={LEGENDE_FRISE} />
          {frise.note !== "" ? (
            <Text {...TYPO.note} foregroundStyle={c.texteDiscret} accessibilityHidden>
              {frise.note}
            </Text>
          ) : null}
        </Bloc>
      </VStack>
    </Button>
  )
}

/**
 * Ticket 4.49 : une Ligne de partie en composant, son arbre celui de vueLigne. Ses props (la ligne d'un lot gardé avec sa
 * sélection, la palette, la taille, l'ouverture stable de l'onglet) restent les mêmes d'un rendu à l'autre : à « Voir plus »,
 * Scripting ne rend que les lignes du nouveau lot, et non plus celles déjà montrées.
 */
function LigneDePartie({ l, c, grand, ouvrir }: { l: LignePartie; c: Palette; grand: boolean; ouvrir: (matchId: string) => void }) {
  return vueLigne(l, c, grand, ouvrir)
}

function vueLigne(l: LignePartie, c: Palette, grand: boolean, ouvrir: (matchId: string) => void): VirtualNode {
  return (
    <Button key={l.cle} buttonStyle="plain" action={() => ouvrir(l.cle)} accessibilityLabel={l.phrase} accessibilityHint={OUVRE_DETAIL}>
      {vueLigneSeule(l, c, grand)}
    </Button>
  )
}

/** Le contenu d'une Ligne de partie, sans son bouton (vueLigne) : au moins 44 de haut, fond `surface` à bordure gauche. */
function vueLigneSeule(l: LignePartie, c: Palette, grand: boolean): VirtualNode {
  // Ticket 4.49 : aux tailles ordinaires, le titre et le K/D/A portent eux-mêmes le cadre pleine largeur à gauche (PLEINE) de la
  // pile d'un seul enfant qui les enveloppait, et une rangée d'un seul enfant est cet enfant : même mise en page, moins
  // d'éléments (un texte sans cadre, marge ni fond dans une pile à un enfant cadrée ≡ ce texte cadré ; une pile à un enfant ≡
  // cet enfant). Le pli est vérifié sur l'historique réel (plan, empreintes repliées) et par tableau-49.
  const cadre = grand ? {} : { frame: PLEINE }
  const titre = (
    <Text
      {...cadre}
      styledText={{
        font: TYPO.ligneForte.font,
        fontWeight: TYPO.ligneForte.fontWeight,
        foregroundColor: c.texte,
        content: [
          ...(l.resultat !== null
            ? [{ content: l.resultat.texte, font: TYPO.ligneForte.font, fontWeight: TYPO.ligneForte.fontWeight, foregroundColor: couleurTon(c, l.resultat.ton) }]
            : []),
          ...(l.suite !== "" ? [l.suite] : []),
        ],
      }}
    />
  )
  const rr = l.rr !== null ? (
    <Text {...TYPO.ligneForte} monospacedDigit foregroundStyle={couleurTon(c, l.rr.ton)} layoutPriority={1}>
      {l.rr.texte}
    </Text>
  ) : null
  const note = l.note !== null ? (
    <Text
      layoutPriority={1}
      styledText={{
        font: TYPO.petit.font,
        fontWeight: TYPO.petit.fontWeight,
        foregroundColor: c.texteDoux,
        monospacedDigit: true,
        content: [`note${NBSP}`, { content: l.note, font: TYPO.petitFort.font, fontWeight: TYPO.petitFort.fontWeight, foregroundColor: c.texte, monospacedDigit: true }],
      }}
    />
  ) : null
  const kda = l.kda !== "" ? (
    <Text {...cadre} {...TYPO.petit} monospacedDigit foregroundStyle={c.texteDiscret}>
      {l.kda}
    </Text>
  ) : null
  const badge = l.mention !== null ? vueBadge(l.mention, c) : null

  const fond = (
    <ZStack alignment="leading">
      <RoundedRectangle cornerRadius={ARRONDIS.md} fill={c.surface} />
      <VStack spacing={0} padding={{ vertical: 10, leading: 6 }}>
        <RoundedRectangle cornerRadius={LIGNE.bordure / 2} fill={couleurTon(c, l.bordure)} frame={{ width: LIGNE.bordure }} />
      </VStack>
    </ZStack>
  )
  const marges = { top: LIGNE.vertical, bottom: LIGNE.vertical, leading: LIGNE.bordure + LIGNE.horizontal, trailing: LIGNE.horizontal }
  if (grand) {
    return (
      <VStack alignment="leading" spacing={LIGNE.rangees} padding={marges} frame={CASE_LIGNE} background={fond}>
        {titre}
        {rr}
        {l.faits.map((f, i) => vueFait(f, true, c, i))}
        {note}
        {kda}
        {badge}
      </VStack>
    )
  }
  const n = l.faits.length
  const faits = n > 0 ? (
    <VStack alignment="leading" frame={PLEINE}>
      <FlowLayout horizontalSpacing={FAITS.horizontal} verticalSpacing={FAITS.vertical}>
        {l.faits.map((f, i) => vueFait(f, i === n - 1, c, i))}
      </FlowLayout>
    </VStack>
  ) : (
    <VStack frame={PLEINE} />
  )
  return (
    <VStack alignment="leading" spacing={LIGNE.rangees} padding={marges} frame={CASE_LIGNE} background={fond}>
      {rr !== null ? (
        <HStack alignment="firstTextBaseline" spacing={LIGNE.colonnes}>
          {titre}
          {rr}
        </HStack>
      ) : titre}
      {note !== null ? (
        <HStack alignment="top" spacing={LIGNE.colonnes}>
          {faits}
          {note}
        </HStack>
      ) : n > 0 ? faits : null}
      {badge !== null ? (
        <HStack alignment="center" spacing={LIGNE.colonnes}>
          {kda !== null ? kda : <VStack alignment="leading" frame={PLEINE} />}
          <VStack layoutPriority={1}>{badge}</VStack>
        </HStack>
      ) : kda}
    </VStack>
  )
}

/**
 * Ce que l'écran garde : le jeton de la sélection sur laquelle « Voir plus » a été touché (jetonDe), et ses lots montrés. Ticket
 * 4.41 : un jeton plutôt que la sélection, pour ne pas la garder, ni ses parties, après une relecture des données.
 */
type Montres = { jeton: object | null; lots: number }

/** Un jeton par sélection, gardé tant qu'elle vit (clé faible). */
const JETONS = new WeakMap<Selection, object>()
function jetonDe(sel: Selection): object {
  let jeton = JETONS.get(sel)
  if (jeton === undefined) {
    jeton = {}
    JETONS.set(sel, jeton)
  }
  return jeton
}


















export function Parties({ donnees, perimetre, ouvrirPartie }: PropsEmplacement) {
  const tour = debutDeRendu(false) // mesure 4.41 : « Voir plus » ne rend que ce sous-onglet ; 4.49 : le numéro de ce rendu
  const [montres, setMontres] = useState<Montres>({ jeton: null, lots: 1 })
  useLigneDeMesure("parties", libellePerimetre(perimetre.perimetre)) // mesure 4.41
  const sel = perimetre.selection
  const lots = sel !== null && montres.jeton === jetonDe(sel) ? montres.lots : 1
  const annee = new Date(Date.now()).getFullYear()
  const rr = perimetre.agregat("parties:rr", () => tableDesRr(donnees.rr))
  const frise = perimetre.agregat("parties:frise", friseDuPerimetre)
  const lignes: LignePartie[] = []
  if (sel !== null && rr !== null) {
    for (let k = 0; k < lots && k * LOT_PARTIES < sel.parties.length; k++) {
      // Ticket 4.41 : l'année dans la clé (une date de l'année en cours s'écrit sans elle).
      const lot = perimetre.agregat(`parties:lot:${annee}:${k}`, (s) => lignesDuLot(s, k, rr, annee))
      if (lot !== null) lignes.push(...lot)
    }
  }
  const total = sel !== null ? sel.parties.length : 0
  const affichees = Math.min(total, lots * LOT_PARTIES)
  const voirPlus = () => {
    mesurerAppui("voir plus") // mesure 4.41
    setMontres({ jeton: sel === null ? null : jetonDe(sel), lots: lots + 1 })
  }
  // La partie de la Frise : la dernière du périmètre (friseDuPerimetre).
  const derniere = sel !== null && sel.parties.length > 0 ? sel.parties[0].matchId : null
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        return (
          <PileDeBlocs>
            <VStack frame={{ maxWidth: "infinity" }} dynamicTypeSize={grand ? undefined : { to: "xLarge" }}>
              <SelecteurSegmente segments={SEGMENTS_MODE} choisi={perimetre.perimetre.mode} onChoix={perimetre.choisirMode} surPage />
            </VStack>
            {sel !== null && total === 0 ? (
              <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
                {SANS_PARTIE[perimetre.perimetre.mode]}
              </Text>
            ) : null}
            {frise !== null && derniere !== null ? <BlocDeLaFrise frise={frise} derniere={derniere} c={c} ouvrirPartie={ouvrirPartie} /> : null}
            {lignes.length > 0 ? (
              <LazyVStack alignment="leading" spacing={LIGNE.liste}>
                {lignes.map((l) => <LigneDePartie key={l.cle} l={l} c={c} grand={grand} ouvrir={ouvrirPartie} />)}
              </LazyVStack>
            ) : null}
            {affichees < total ? (
              <VStack frame={{ maxWidth: "infinity" }}>
                <BoutonSecondaire
                  libelle={VOIR_PLUS}
                  action={voirPlus}
                  valeurAccessibilite={`${nombreEnClair(affichees, 0)} parties affichées sur ${nombreEnClair(total, 0)}`}
                />
              </VStack>
            ) : null}
            {/* mesure 4.41 : la fin du rendu d'un appui mesuré ; ne rend rien. 4.49 : `tour` change à chaque rendu. */}
            <FinDuRendu tour={tour} />
          </PileDeBlocs>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** L'emplacement du sous-onglet Parties dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_PARTIES: Emplacement = Parties

// ─────────────────────────── vues du Détail (entrée 33) ───────────────────────────

/** Un texte en note, invisible et masqué à VoiceOver : il donne à un Chiffre la hauteur du libellé ou du sous-texte d'un voisin. */
function vueFantome(cle: string, texte: string, c: Palette): VirtualNode {
  return (
    <Text key={cle} {...TYPO.note} foregroundStyle={c.texteDiscret} opacity={0} accessibilityHidden>
      {texte}
    </Text>
  )
}









function vueChiffre(ch: ChiffreDetail, rangee: readonly ChiffreDetail[], c: Palette): VirtualNode {
  const voisins = rangee.filter((v) => v.cle !== ch.cle)
  const sousTextes = rangee.some((v) => v.sousTexte !== null)
  const fantomesSous: VirtualNode[] = []
  for (const v of voisins) if (v.sousTexte !== null) fantomesSous.push(vueFantome(v.cle, v.sousTexte, c))
  return (
    <VStack
      key={ch.cle}
      alignment="leading"
      spacing={CHIFFRE.ecart}
      padding={ESPACES.cellule}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
      background={creux(c)}
      accessibilityElement
      accessibilityLabel={ch.voix}
    >
      <ZStack alignment="topLeading">
        {voisins.map((v) => vueFantome(v.cle, v.libelle, c))}
        <Text key="libelle" {...TYPO.note} foregroundStyle={c.texteDiscret}>
          {ch.libelle}
        </Text>
      </ZStack>
      <Text {...TYPO.valeur} monospacedDigit foregroundStyle={c.texte} lineLimit={1} minScaleFactor={CHIFFRE.reduction}>
        {ch.valeur}
      </Text>
      {sousTextes ? (
        <ZStack alignment="topLeading">
          {fantomesSous}
          {ch.sousTexte !== null ? (
            <Text key="sous-texte" {...TYPO.note} foregroundStyle={c.texteDoux}>
              {ch.sousTexte}
            </Text>
          ) : null}
        </ZStack>
      ) : null}
    </VStack>
  )
}

/**
 * La grille des six Chiffres (DESIGN.md, Layout & Spacing ; maquette : 3 colonnes ; 2 aux deux premières tailles
 * d'accessibilité, 1 au-delà, comme les tuiles : colonnesChiffres), à 6 l'un de l'autre et d'une rangée à l'autre ; chaque
 * rangée tenue à sa hauteur idéale, ses cases à toute cette hauteur et à parts égales de la largeur.
 */
function vueGrille(chiffres: readonly ChiffreDetail[], c: Palette, taille: DynamicTypeSize | undefined): VirtualNode {
  const n = colonnesChiffres(taille)
  const rangees: ChiffreDetail[][] = []
  for (let i = 0; i < chiffres.length; i += n) rangees.push(chiffres.slice(i, i + n))
  return (
    <VStack key="chiffres" alignment="leading" spacing={ESPACES.grille} frame={PLEINE}>
      {rangees.map((r, i) => (
        <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
          {r.map((ch) => vueChiffre(ch, r, c))}
        </HStack>
      ))}
    </VStack>
  )
}

/**
 * Le résumé (maquette ; DESIGN.md, bloc, Typography : Nom pour le résultat du Détail), un Bloc coin bas : en tête, le titre en
 * Nom condensé, en capitales, au ton du résultat (`texte` en deathmatch), et le RR en ligne-forte coloré, chiffres à chasse
 * fixe, prioritaire, sur la même ligne de base ; l'un sous l'autre aux tailles d'accessibilité (`grand`) ; un seul élément
 * VoiceOver, en-tête, qui lit sa phrase. Dessous, le sous-titre en corps `texte-doux` (dit sans « · »), puis la grille des six
 * Chiffres.
 */
function vueResume(d: DetailVu, c: Palette, grand: boolean, taille: DynamicTypeSize | undefined): VirtualNode {
  const titre = d.titre !== null ? (
    <Text key="titre" {...policeCondensee(TYPO.nom)} foregroundStyle={d.ton === null ? c.texte : couleurTon(c, d.ton)}>
      {d.titre}
    </Text>
  ) : null
  const rr = d.rr !== null ? (
    <Text key="rr" {...TYPO.ligneForte} monospacedDigit foregroundStyle={couleurTon(c, d.rr.ton)} layoutPriority={1}>
      {d.rr.texte}
    </Text>
  ) : null
  const acces = { accessibilityElement: true, accessibilityLabel: d.enTete, accessibilityAddTraits: "isHeader" } as const
  let enTete: VirtualNode | null = null
  if (titre !== null || rr !== null) {
    enTete = grand ? (
      <VStack key="en-tete" alignment="leading" spacing={CHIFFRE.pile} frame={PLEINE} {...acces}>
        {titre}
        {rr}
      </VStack>
    ) : (
      <HStack key="en-tete" alignment="firstTextBaseline" spacing={LIGNE.colonnes} {...acces}>
        <VStack alignment="leading" frame={PLEINE}>{titre}</VStack>
        {rr}
      </HStack>
    )
  }
  return (
    <Bloc key="resume" coin="bas">
      {enTete}
      {d.sousTitre !== "" ? (
        <Text key="sous-titre" {...TYPO.corps} foregroundStyle={c.texteDoux} accessibilityElement accessibilityLabel={d.sousTitreDit}>
          {d.sousTitre}
        </Text>
      ) : null}
      {vueGrille(d.chiffres, c, taille)}
    </Bloc>
  )
}

/**
 * Ton équipe et l'adversaire (maquette ; EXPERIENCE.md, Confidentialité) : un Bloc coin bas, son titre en capitales par le
 * Bloc, le Tableau des moyennes (dessin.tsx : un élément VoiceOver par ligne, une carte par ligne aux tailles d'accessibilité),
 * ou la phrase SANS_MOYENNE sans aucune ligne ; toujours la note NOTE_MOYENNES, coupée entre les mots seulement.
 */
function vueEquipe(d: DetailVu): VirtualNode {
  return (
    <Bloc
      key="equipe"
      titre={TITRE_EQUIPE}
      coin="bas"
      vide={d.equipe.length === 0 ? SANS_MOYENNE : undefined}
      note={sansMauvaiseCoupure(d.noteDepense === null ? NOTE_MOYENNES : `${NOTE_MOYENNES} ${d.noteDepense}`)}
    >
      <Tableau colonnes={COLONNES_EQUIPE} lignes={d.equipe} />
    </Bloc>
  )
}

/** Ticket 4.52 : un Bloc coin bas titré, ses Lignes détaillées (dessin.tsx : un élément VoiceOver par ligne), sa note éventuelle. */
function vueLignes(cle: string, titre: string, lignes: readonly LigneDetaillee[], note?: string): VirtualNode {
  return (
    <Bloc key={cle} titre={titre} coin="bas" note={note === undefined ? undefined : sansMauvaiseCoupure(note)}>
      <LignesDetaillees lignes={lignes} />
    </Bloc>
  )
}

/**
 * Lien retour (DESIGN.md, lien-retour ; EXPERIENCE.md, Component Patterns, Accessibility Floor) : bouton plain « ← Parties »
 * en ligne `texte-doux`, case d'au moins 44 de haut, toute la case répondant à l'appui, du bord gauche de l'écran (marge de
 * page comprise) jusqu'à 16 après le texte, texte centré ; VoiceOver « Retour à Parties ». `onRetour` dépile le Détail.
 */
function vueRetour(c: Palette, onRetour: () => void): VirtualNode {
  return (
    <Button key="retour" buttonStyle="plain" action={onRetour} accessibilityLabel={RETOUR_DIT}>
      <HStack contentShape="rect" padding={{ horizontal: ESPACES.margePage }} frame={{ minHeight: ESPACES.cible }}>
        <Text {...TYPO.ligne} foregroundStyle={c.texteDoux}>
          {LIEN_RETOUR}
        </Text>
      </HStack>
    </Button>
  )
}

// ─────────────────────────── vues des manches (entrée 34) ───────────────────────────

/** Un rectangle rentré de `retrait` de chaque côté de la taille reçue : le trait d'un contour y tient tout entier. */
function rectangleRentre(p: Path2D, s: Size, retrait: number) {
  p.addRect({ x: retrait, y: retrait, width: Math.max(0, s.width - 2 * retrait), height: Math.max(0, s.height - 2 * retrait) })
}










function vueCase(cm: CaseManche, choisie: boolean, lettres: boolean, c: Palette): VirtualNode {
  const ligne = (cle: string, texte: string, vide: string, poids: "regular" | "heavy", couleur: Color, chiffres = false) => (
    <Text
      key={cle}
      font={TYPO.micro.font}
      fontWeight={poids}
      foregroundStyle={couleur}
      lineLimit={1}
      minScaleFactor={CASE_MANCHE.reduction}
      {...(chiffres ? { monospacedDigit: true } : {})}
      {...(texte === "" ? { opacity: 0 } : {})}
    >
      {texte === "" ? vide : texte}
    </Text>
  )
  const hauteur = { maxWidth: "infinity", height: CASE_MANCHE.barre } as const
  const barre = cm.gagnee === true ? (
    <Rectangle key="barre" fill={c.vert} frame={hauteur} />
  ) : cm.gagnee === false ? (
    <PathShape
      key="barre"
      stroke={{ shapeStyle: c.rougeClair, strokeStyle: { lineWidth: CASE_MANCHE.contour } }}
      draw={(p, s) => rectangleRentre(p, s, CASE_MANCHE.contour / 2)}
      frame={hauteur}
    />
  ) : (
    <Rectangle key="barre" fill="clear" frame={hauteur} />
  )
  const fond = choisie ? (
    <ZStack>
      <Rectangle fill={c.fond} />
      <PathShape stroke={{ shapeStyle: c.texte, strokeStyle: { lineWidth: CASE_MANCHE.bord } }} draw={(p, s) => rectangleRentre(p, s, CASE_MANCHE.bord / 2)} />
    </ZStack>
  ) : c.fond
  return (
    <VStack
      key={`manche-${cm.numero}`}
      spacing={CASE_MANCHE.ecart}
      padding={{ top: CASE_MANCHE.bord + CASE_MANCHE.vertical, bottom: CASE_MANCHE.bord + CASE_MANCHE.vertical, horizontal: CASE_MANCHE.bord }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "top" }}
      background={fond}
      accessibilityElement
      accessibilityLabel={cm.libelle}
      {...(choisie ? { accessibilityAddTraits: "isSelected" as const } : {})}
    >
      {barre}
      {ligne("numero", String(cm.numero), "0", "regular", c.texteDoux, true)}
      {lettres ? ligne("lettre", cm.lettre ?? "", "C", "heavy", c.texte) : null}
      {ligne("kills", cm.kills, KILL, "regular", c.bleu)}
      {ligne("mort", cm.mort ? MORT : "", MORT, "regular", c.orange)}
    </VStack>
  )
}

/**
 * La grille des Cases de manche (DESIGN.md, Layout & Spacing : 12 colonnes, 6 aux tailles d'accessibilité, écart de 3) : chaque
 * groupe (mi-temps, prolongation) sous sa légende en note `texte-discret`, lue par VoiceOver, ses cases en rangées de `colonnes`,
 * une rangée incomplète complétée de cellules vides invisibles (cases d'égale largeur), chaque rangée à sa hauteur idéale ; 6 entre
 * deux groupes. `ajustable`, en fond : l'élément ajustable de la grille, ou null.
 */
function vueGrilleManches(md: ManchesDetail, choisie: number, colonnes: number, c: Palette, ajustable: VirtualNode | null): VirtualNode {
  const groupes = md.groupes.map((g, gi) => {
    const rangees: VirtualNode[] = []
    for (let i = 0; i < g.manches.length; i += colonnes) {
      const rangs = g.manches.slice(i, i + colonnes)
      const cellules = rangs.map((k) => vueCase(md.cases[k], k === choisie, md.lettres, c))
      for (let v = rangs.length; v < colonnes; v++) cellules.push(<VStack key={`vide-${v}`} frame={{ maxWidth: "infinity" }} accessibilityHidden />)
      rangees.push(
        <HStack key={`rangee-${i}`} alignment="top" spacing={GRILLE_MANCHES.ecart} fixedSize={{ horizontal: false, vertical: true }}>
          {cellules}
        </HStack>,
      )
    }
    return (
      <VStack key={`groupe-${gi}`} alignment="leading" spacing={GRILLE_MANCHES.ecart} frame={PLEINE}>
        {g.titre !== null ? (
          <Text key="titre" {...TYPO.note} foregroundStyle={c.texteDiscret}>
            {g.titre}
          </Text>
        ) : null}
        {rangees}
      </VStack>
    )
  })
  return (
    <VStack key="grille" alignment="leading" spacing={GRILLE_MANCHES.groupes} frame={PLEINE} {...(ajustable !== null ? { background: ajustable } : {})}>
      {groupes}
    </VStack>
  )
}






function vueEncadre(cm: CaseManche, c: Palette): VirtualNode {
  const fond = (
    <HStack spacing={0}>
      <Rectangle fill={c.texte} frame={{ width: ENCADRE.bordure }} />
      <Rectangle fill={c.fond} />
    </HStack>
  )
  return (
    <VStack
      key="encadre"
      alignment="leading"
      spacing={ENCADRE.ecart}
      padding={{ top: ENCADRE.marge, bottom: ENCADRE.marge, leading: ENCADRE.bordure + ENCADRE.marge, trailing: ENCADRE.marge }}
      frame={PLEINE}
      background={fond}
      accessibilityElement
      accessibilityLabel={`${cm.etiquetteDite} ${cm.recitDit}`}
    >
      <Text key="etiquette" {...policeCondensee(TYPO.etiquette, false)} foregroundStyle={c.texte}>
        {cm.etiquette}
      </Text>
      <Text key="recit" {...TYPO.petit} foregroundStyle={c.texteDoux}>
        {cm.recit}
      </Text>
    </VStack>
  )
}









function vueManches(md: ManchesDetail, choisie: number, colonnes: number, c: Palette, choisir: (k: number) => void): VirtualNode {
  const n = md.cases.length
  const cm = md.cases[choisie]
  const ajustable = REPLIS.pucesEnBoutons ? null : (
    <VStack allowsHitTesting={false} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <ElementAjustable
        nom={NOM_AJUSTABLE}
        valeur={`${cm.numero} sur ${n}`}
        onSuivant={() => choisir(choisie + 1)}
        onPrecedent={() => choisir(choisie - 1)}
      />
    </VStack>
  )
  return (
    <Bloc key="manches" titre={TITRE_MANCHES} niveau="section" coin="haut" note={noteDesManches(md)}>
      {vueGrilleManches(md, choisie, colonnes, c, ajustable)}
      <Legende key="legende" items={LEGENDE_MANCHES} />
      {md.lettres ? (
        <Text key="lettres" {...TYPO.note} foregroundStyle={c.texteDiscret} accessibilityHidden>
          {sansMauvaiseCoupure(NOTE_LETTRES)}
        </Text>
      ) : null}
      <ChoixDeManche
        key="choix"
        libelle={`Manche${NBSP}${cm.numero} sur${NBSP}${n}`}
        auDebut={choisie === 0}
        aLaFin={choisie === n - 1}
        onPrecedente={() => choisir(choisie - 1)}
        onSuivante={() => choisir(choisie + 1)}
      />
      {vueEncadre(cm, c)}
    </Bloc>
  )
}

/**
 * Tes morts dans cette partie (maquette) : un Bloc sans coin, son titre en titre de bloc ; la phrase en corps `texte-doux`, un
 * élément VoiceOver qui la dit ; puis, s'il y en a, ses trois Chiffres sur la grille du résumé ; en note, ce qu'est une zone
 * (MENTION_ZONE) si la phrase en nomme une (4.48).
 */
function vueMorts(m: MortsDetail, c: Palette, taille: DynamicTypeSize | undefined): VirtualNode {
  return (
    <Bloc key="morts" titre={TITRE_MORTS} note={m.zoneNommee ? MENTION_ZONE : undefined}>
      <Text key="phrase" {...TYPO.corps} foregroundStyle={c.texteDoux} accessibilityElement accessibilityLabel={m.phraseDite}>
        {m.phrase}
      </Text>
      {m.chiffres.length > 0 ? vueGrille(m.chiffres, c, taille) : null}
    </Bloc>
  )
}

/**
 * Le Détail d'une partie (entrée 33 ; EXPERIENCE.md, Information Architecture : Détail, Interaction Primitives ; DESIGN.md,
 * Layout & Spacing ; maquette Detail-partie), poussé par Parties dans la pile de navigation de l'onglet Stats (app.tsx), qui
 * le recouvre tout entier, Barre de sous-onglets et Ligne d'état comprises, sous l'En-tête ValShop et la Barre d'onglets
 * fixes. La partie `matchId` des données tenues ; un ScrollView sur `fond`, barre de navigation masquée ; aux tailles
 * d'accessibilité, `haut` (En-tête et Barre d'onglets) en tête, qui défile ; le Lien retour juste sous la Barre d'onglets, qui
 * défile aussi ; puis, à 14, dans les marges de page, 24 en bas : le résumé, Manche par manche et Tes morts dans cette partie
 * (entrée 34 ; aucun des deux sans manche), Ton équipe et l'adversaire. Partie absente des données (jamais : une partie gardée
 * ne part pas) ou dont le calcul lève (dit en console) : le Lien retour seul ; seul le calcul des manches qui lève : ses deux
 * blocs omis, dit en console. Entrée 34 : la manche choisie, seul état du Détail, rang dans les manches jouées, la première à
 * chaque `ouverture` nouvelle (app.tsx la compte à chaque appui), bornée aux manches de la partie. Rien à lire ni à demander :
 * la partie et catalog.json sont déjà tenus.
 */
export function DetailPartie({ donnees, matchId, ouverture = 0, haut, onRetour }: {
  donnees: DonneesTableau; matchId: string; ouverture?: number; haut: VirtualNode | null; onRetour: () => void
}) {
  const tour = debutDeRendu(false) // mesure 4.49 : l'ouverture d'une partie se clôt à la fin du Détail
  const [choix, setChoix] = useState<{ ouverture: number; rang: number }>({ ouverture, rang: 0 })
  useLigneDeMesure("detail", undefined, "detail") // mesure 4.49
  const p = donnees.parties.find((x) => x.matchId === matchId) ?? null
  let d: DetailVu | null = null
  let manches: ManchesDetail | null = null, morts: MortsDetail | null = null
  if (p !== null) {
    try {
      d = detailDePartie(p, tableDesRr(donnees.rr), new Date(Date.now()).getFullYear())
    } catch (e) {
      console.log(`parties : détail impossible (${e})`)
    }
    if (d !== null) {
      const cartes = donnees.ressources?.cartes ?? {}
      try {
        manches = manchesDuDetail(p, cartes)
        morts = mortsDuDetail(p, cartes)
      } catch (e) {
        manches = null
        morts = null
        console.log(`parties : manches impossibles (${e})`)
      }
    }
  }
  const n = manches === null ? 0 : manches.cases.length
  const choisie = choix.ouverture === ouverture ? Math.min(Math.max(0, choix.rang), Math.max(0, n - 1)) : 0
  const choisir = (k: number) => {
    if (k >= 0 && k < n && k !== choisie) setChoix({ ouverture, rang: k })
  }
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        const blocs: VirtualNode[] = []
        if (d !== null) {
          blocs.push(vueResume(d, c, grand, env.dynamicTypeSize))
          // Ticket 4.52 : le détail du RR et tes flèches de Valorant, chacun seulement s'il a une ligne.
          if (d.rrDetail.length > 0) blocs.push(vueLignes("rr", TITRE_RR, d.rrDetail))
          if (d.fleches.length > 0) blocs.push(vueLignes("fleches", TITRE_FLECHES, d.fleches, NOTE_FLECHES))
          if (manches !== null) blocs.push(vueManches(manches, choisie, grand ? GRILLE_MANCHES.colonnesGrand : GRILLE_MANCHES.colonnes, c, choisir))
          if (morts !== null) blocs.push(vueMorts(morts, c, env.dynamicTypeSize))
          // Entrée 11 de epic-stats-analyses : ce que chaque agent adverse t'a fait (agents-adverses.tsx ; rien sans manches).
          if (p !== null) blocs.push(<SectionAgentsDeLaPartie key="agents-adverses" partie={p} />)
          blocs.push(vueEquipe(d))
        }
        return (
          <ScrollView navigationBarVisibility="hidden" background={c.fond}>
            <VStack alignment="leading" spacing={0} frame={PLEINE}>
              {haut}
              {vueRetour(c, onRetour)}
              <PileDeBlocs padding={{ top: RETOUR.apres, horizontal: ESPACES.margePage, bottom: ESPACES.basPage }}>
                {blocs}
              </PileDeBlocs>
              {/* mesure 4.49 : la fin du rendu du Détail ; ne rend rien. */}
              <FinDuRendu tour={tour} lieu="detail" />
            </VStack>
          </ScrollView>
        )
      }}
    </EnvironmentValuesReader>
  )
}
