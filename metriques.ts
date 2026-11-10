
















import type { CompteursManche, Groupe, Manche, Partie, Resultat, Saison, Somme, Totaux } from "./reduction"
// Rang et RR gardés (entrée 5) : rang.json et rr.json, relus par historique.ts.
import type { Acte, LigneRr, Rang } from "./historique"
// Agents, capacités et profil de jeu (entrée 6) : cumuls par agent (cumuls/<semaine>.json) et rôles du catalogue.
import type { CumulAgent, Kill, Roles } from "./reduction"
// Cartes, côtés et après-pose (entrée 7) : côté de chaque manche, carte de chaque partie.
import type { Cote, Ref } from "./reduction"
// Zones de chaque carte (entrée 8) : positions des kills et des morts ; callouts et coefficients de catalog.json (entrée 2.9).
import type { Position } from "./reduction"
import type { Callout, Carte as CarteDuCatalogue, SectionCartes, SectionSaisons } from "./ressources"
// Économie (entrée 10) : ton type d'achat de chaque manche, tiré de ta valeur d'équipement par la réduction ; l'arme gardée
// (entrée 44), déduite ici à la lecture de tes manches gardées, sans changer la réduction.
import type { TypeAchat } from "./reduction"
// Armes et visée (entrée 11) : tes touches et celles que tu reçois (tête, corps, jambes).
import type { Touches } from "./reduction"

// ─────────────────────────── périmètre ───────────────────────────

/** Mode du périmètre commun (EXPERIENCE.md, Information Architecture). */
export type Mode = "competition" | "non-classe" | "tout"
/** Période du périmètre commun : 7 jours, 30 jours, l'acte en cours, ou tout l'historique. */
export type Periode = "7j" | "30j" | "acte" | "tout"
export type Perimetre = { mode: Mode; periode: Periode }


export const PERIMETRE_DEFAUT: Perimetre = { mode: "competition", periode: "30j" }

export const LIBELLES_MODE: Readonly<Record<Mode, string>> = { competition: "Compétition", "non-classe": "Non classé", tout: "Tout" }
export const LIBELLES_PERIODE: Readonly<Record<Periode, string>> = { "7j": "7 jours", "30j": "30 jours", acte: "Acte", tout: "Tout" }


export function libellePerimetre(p: Perimetre): string {
  return `${LIBELLES_MODE[p.mode]} · ${LIBELLES_PERIODE[p.periode]}`
}

/** La file de chaque mode (`metadata.queue.id`) ; « Tout » les réunit toutes. */
const FILE_DU_MODE: Readonly<Record<Exclude<Mode, "tout">, string>> = { competition: "competitive", "non-classe": "unrated" }

function dansLeMode(p: Partie, mode: Mode): boolean {
  return mode === "tout" || p.file === FILE_DU_MODE[mode]
}

// ─────────────────────────── files admises ───────────────────────────









export type Files = "competition" | "completes" | "a-manches" | "toutes"

const FILES_COMPLETES: ReadonlySet<string> = new Set(["competitive", "unrated", "swiftplay", "premier"])
const FILES_DEATHMATCH: ReadonlySet<string> = new Set(["deathmatch", "hurm"])

/** Une partie de cette file entre-t-elle dans une stat qui admet `files` ? Une autre file compte comme un mode à manches sans achat. */
export function fileAdmise(file: string, files: Files): boolean {
  if (files === "competition") return file === FILE_DU_MODE.competition
  if (FILES_COMPLETES.has(file)) return true
  if (FILES_DEATHMATCH.has(file)) return files === "toutes"
  return files !== "completes"
}

/**
 * Ticket 4.41 : les parties retenues de chaque liste de parties (la liste même) pour chaque `files`, gardées. Une liste de parties
 * ne change pas une fois faite (sélection, parties d'un agent ou d'une carte) ; la liste rendue ne se lit qu'en lecture (aucun
 * appelant ne la modifie).
 */
const RETENUES = new WeakMap<readonly Partie[], Map<Files, readonly Partie[]>>()

/** Les parties qu'une stat admet, dans leur ordre. */
export function retenues(parties: readonly Partie[], files: Files): readonly Partie[] {
  let parFiles = RETENUES.get(parties)
  if (parFiles === undefined) {
    parFiles = new Map()
    RETENUES.set(parties, parFiles)
  }
  const deja = parFiles.get(files)
  if (deja !== undefined) return deja
  const r = parties.filter((p) => fileAdmise(p.file, files))
  parFiles.set(files, r)
  return r
}

// ─────────────────────────── parties refaites ───────────────────────────







export const MANCHES_PARTIE_REFAITE = 8

/** Partie refaite : aucune équipe gagnante (`resultat` « nul ») et moins de 8 manches jouées ; un vrai nul reste compté. */
export function partieRefaite(p: Partie): boolean {
  if (p.resultat !== "nul") return false
  const jouees = p.manchesGagnees != null && p.manchesPerdues != null ? p.manchesGagnees + p.manchesPerdues : (p.manches ?? []).length
  return jouees < MANCHES_PARTIE_REFAITE
}

// ─────────────────────────── actes ───────────────────────────

/** Instant du début d'une partie ; un début illisible la met hors de toute période datée. */
function instant(p: Partie): number {
  const t = Date.parse(p.debut)
  return Number.isNaN(t) ? -Infinity : t
}

/** La plus récente d'abord (`debut`), puis matchId : l'ordre de lireHistorique. */
function plusRecenteDabord(a: Partie, b: Partie): number {
  const ta = instant(a), tb = instant(b)
  if (ta !== tb) return tb > ta ? 1 : -1
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0
}

/** Un acte se reconnaît à son id, à son nom court s'il n'a pas d'id. */
function cleActe(s: Saison): string {
  return s.id || s.short
}

/** L'acte en cours : la saison de ta partie la plus récente qui en a une, toutes files ; null sans elle. */
export function acteEnCours(parties: readonly Partie[]): Saison | null {
  let derniere: Partie | null = null
  for (const p of parties) if (p.saison && (derniere === null || plusRecenteDabord(p, derniere) < 0)) derniere = p
  return derniere?.saison ?? null
}

/** Nom court d'un acte : `e11a6`, épisode 11, acte 6. */
const NOM_ACTE = /^e(\d+)a(\d+)$/i

/**
 * L'acte juste avant l'acte en cours `acte` (acteEnCours) : la saison de ta partie la plus récente
 * d'une autre saison, si elle le précède immédiatement (`eNaM` : même épisode et acte M − 1, ou
 * épisode N − 1 quand M = 1, le nombre d'actes d'un épisode variant) ; null sinon (aucune partie
 * dans l'acte d'avant). Noms d'une autre écriture : cette dernière autre saison, sans contrôle.
 */
export function actePrecedent(parties: readonly Partie[], acte: Saison): Saison | null {
  const avant = acteEnCours(parties.filter((p) => p.saison && cleActe(p.saison) !== cleActe(acte)))
  if (avant === null) return null
  const a = NOM_ACTE.exec(acte.short), b = NOM_ACTE.exec(avant.short)
  if (!a || !b) return avant
  const episode = Number(a[1]), numero = Number(a[2]), episodeAvant = Number(b[1]), numeroAvant = Number(b[2])
  const juste = numero > 1 ? episodeAvant === episode && numeroAvant === numero - 1 : episodeAvant === episode - 1
  return juste ? avant : null
}

// ─────────────────────────── sélection ───────────────────────────

const JOUR_MS = 86_400_000
/** Les périodes glissantes, en millisecondes : 7 et 30 fois 24 h jusqu'à maintenant. */
const DUREE_MS: Readonly<Record<"7j" | "30j", number>> = { "7j": 7 * JOUR_MS, "30j": 30 * JOUR_MS }

/**
 * Les parties d'un périmètre (`parties`), la plus récente d'abord, parties refaites écartées : leur
 * nombre est celui de la Ligne d'état ; et celles de sa période précédente, même mode
 * (`precedentes`) : les 7 ou 30 jours d'avant, l'acte précédent pour Acte, null pour Tout (aucune).
 */
export type Selection = { perimetre: Perimetre; parties: Partie[]; precedentes: Partie[] | null }

/**
 * Sélectionne le périmètre dans l'historique, à l'instant `now` (ms) : 7 et 30 jours glissants,
 * début à `now` − durée compris, période précédente de `now` − 2 durées compris à `now` − durée
 * exclu ; Acte : la saison de ta partie la plus récente, toutes files (acteEnCours), et l'acte juste
 * avant (actePrecedent). L'historique et ses parties ne sont pas modifiés.
 */
export function selectionner(historique: readonly Partie[], perimetre: Perimetre, now: number): Selection {
  const gardees = historique.filter((p) => !partieRefaite(p)).sort(plusRecenteDabord)
  const duMode = gardees.filter((p) => dansLeMode(p, perimetre.mode))
  const periode = perimetre.periode
  if (periode === "tout") return { perimetre, parties: duMode, precedentes: null }
  if (periode === "acte") {
    const acte = acteEnCours(gardees)
    const precedent = acte === null ? null : actePrecedent(gardees, acte)
    const de = (s: Saison | null) => (s === null ? [] : duMode.filter((p) => p.saison != null && cleActe(p.saison) === cleActe(s)))
    return { perimetre, parties: de(acte), precedentes: de(precedent) }
  }
  const duree = DUREE_MS[periode]
  return {
    perimetre,
    parties: duMode.filter((p) => instant(p) >= now - duree),
    precedentes: duMode.filter((p) => instant(p) >= now - 2 * duree && instant(p) < now - duree),
  }
}

/** Ticket 4.41 : les débuts lisibles des parties de chaque historique tenu (la liste même), du plus récent au plus ancien, gardés. */
const DEBUTS_TRIES = new WeakMap<readonly Partie[], readonly number[]>()

/** Le nombre de débuts à `depuis` ou après, dans des débuts triés du plus récent au plus ancien (recherche dichotomique). */
function debutsDepuis(debuts: readonly number[], depuis: number): number {
  let bas = 0, haut = debuts.length
  while (bas < haut) {
    const milieu = (bas + haut) >> 1
    if (debuts[milieu] >= depuis) bas = milieu + 1
    else haut = milieu
  }
  return bas
}

/**
 * La fenêtre d'un périmètre dans l'historique à l'instant `now` (ticket 4.41) : vide pour Acte et Tout, que l'heure ne change pas ;
 * pour 7 et 30 jours, le nombre de parties commencées depuis le début de la période (`now` − durée), puis depuis celui de la période
 * précédente (`now` − 2 durées), parties refaites et autres modes compris. Deux instants de même fenêtre donnent la même sélection
 * (selectionner : mêmes parties, mêmes précédentes) : une sélection gardée ne vaut que pour sa fenêtre.
 */
export function fenetreDuPerimetre(historique: readonly Partie[], perimetre: Perimetre, now: number): string {
  const periode = perimetre.periode
  if (periode === "tout" || periode === "acte") return ""
  let debuts = DEBUTS_TRIES.get(historique)
  if (debuts === undefined) {
    debuts = historique.map(instant).filter((t) => t !== -Infinity).sort((a, b) => b - a)
    DEBUTS_TRIES.set(historique, debuts)
  }
  const duree = DUREE_MS[periode]
  return `${debutsDepuis(debuts, now - duree)}|${debutsDepuis(debuts, now - 2 * duree)}`
}

// ─────────────────────────── rapport de sommes ───────────────────────────

/** Numérateur et dénominateur d'une stat, sur une partie ou un groupe (EXPERIENCE.md, Rapport de sommes). */
export type Fraction = { num: number; den: number }
/** Les sommes d'une stat : numérateurs, dénominateurs, et parties qui y contribuent. */
export type Sommes = { num: number; den: number; parties: number }
/** La fraction d'une partie, null pour une donnée absente : la partie sort de cette stat seule. */
export type LirePartie = (p: Partie) => Fraction | null
/** La fraction d'un groupe dans une partie (ses joueurs additionnés par la réduction), null si absente. */
/** Ce qu'une stat lit d'un groupe ; `p`, la partie du groupe (ticket 4.47 : tes lobbys lus dans tes manches). */
export type LireGroupe = (g: Groupe, p?: Partie) => Fraction | null
/** Les groupes de comparaison d'une partie (contrat-donnees.md, Groupes de comparaison). */
export type Quel = "lobby" | "allies" | "adversaires"

function lisible(f: Fraction | null): f is Fraction {
  return f !== null && Number.isFinite(f.num) && Number.isFinite(f.den)
}

/**
 * Ticket 4.41 : la fraction de chaque partie pour chaque lecture, gardée après sa première lecture. Une partie tenue ne change
 * pas et une lecture est une fonction de sa seule partie : tuiles, constats, courbes et sous-onglets relisent les mêmes parties
 * pour les mêmes stats (les constats, une fois par agent joué). Clés faibles : une lecture faite à la volée, ou des parties
 * relues, s'en vont avec elles. Une lecture qui lève n'est pas gardée.
 */
const FRACTIONS_LUES = new WeakMap<LirePartie, WeakMap<Partie, Readonly<Fraction> | null>>()

/**
 * Ticket 4.41 : les fractions d'une liste de parties (la liste même : sélection, parties retenues, d'un agent, d'une carte) pour
 * chaque lecture, gardées à partir de LISTE_GARDEE parties (une liste d'une partie se refait plus vite qu'elle ne se garde) ;
 * fractions() en rend toujours un tableau neuf, que l'appelant peut modifier ; les fractions dedans sont partagées, en lecture
 * seule.
 */
const FRACTIONS_DES_LISTES = new WeakMap<readonly Partie[], Map<LirePartie, readonly Readonly<Fraction>[]>>()
const LISTE_GARDEE = 8

/** Les fractions lisibles d'une stat, dans l'ordre des parties (chaque partie lue une fois par lecture : FRACTIONS_LUES). */
export function fractions(parties: readonly Partie[], lire: LirePartie): Readonly<Fraction>[] {
  let parLecture: Map<LirePartie, readonly Readonly<Fraction>[]> | undefined
  if (parties.length >= LISTE_GARDEE) {
    parLecture = FRACTIONS_DES_LISTES.get(parties)
    if (parLecture === undefined) {
      parLecture = new Map()
      FRACTIONS_DES_LISTES.set(parties, parLecture)
    }
    const deja = parLecture.get(lire)
    if (deja !== undefined) return deja.slice()
  }
  let lues = FRACTIONS_LUES.get(lire)
  if (lues === undefined) {
    lues = new WeakMap()
    FRACTIONS_LUES.set(lire, lues)
  }
  const fs: Readonly<Fraction>[] = []
  for (const p of parties) {
    let f = lues.get(p)
    if (f === undefined) {
      f = lire(p)
      lues.set(p, f)
    }
    if (lisible(f)) fs.push(f)
  }
  if (parLecture !== undefined) parLecture.set(lire, fs)
  return parLecture !== undefined ? fs.slice() : fs
}

/** Additionne des fractions ; la seule division vient ensuite (quotient). */
export function additionner(fs: readonly Fraction[]): Sommes {
  let num = 0, den = 0
  for (const f of fs) {
    num += f.num
    den += f.den
  }
  return { num, den, parties: fs.length }
}

/** Tes sommes d'une stat sur ces parties. */
export function sommer(parties: readonly Partie[], lire: LirePartie): Sommes {
  return additionner(fractions(parties, lire))
}

/** Les sommes d'un groupe sur ces parties : celles de chaque partie où il est gardé et où la lecture existe. */
export function sommerGroupe(parties: readonly Partie[], quel: Quel, lire: LireGroupe): Sommes {
  const fs: Fraction[] = []
  for (const p of parties) {
    const g = p.groupes?.[quel] ?? null
    const f = g === null ? null : lire(g, p)
    if (lisible(f)) fs.push(f)
  }
  return additionner(fs)
}

/** Le rapport, divisé une seule fois ; null pour un dénominateur nul (« — »). */
export function quotient(s: Fraction): number | null {
  return s.den === 0 ? null : s.num / s.den
}

// ─────────────────────────── stats ───────────────────────────

/**
 * Comment une valeur s'écrit et se compare : un pourcentage (part de 0 à 1, entier en %, écart et
 * variation en points, seuil de 2 points), ou un nombre (`decimales`, seuil de 3 % relatifs,
 * variation en % relatif, `relative`, ou en valeur, `absolue`).
 */
export type Mesure = { genre: "pourcentage" } | { genre: "nombre"; decimales: number; variation: "relative" | "absolue" }

/**
 * Les mesures d'EXPERIENCE.md, Formats et Variation : pourcentage entier ; ratio à deux décimales,
 * variation en valeur (K/D) ; moyenne par partie ou par manche à une décimale, variation en %
 * relatif (score, dégâts). Une stat peut déclarer la sienne.
 */
export const POURCENTAGE: Mesure = { genre: "pourcentage" }
export const RATIO: Mesure = { genre: "nombre", decimales: 2, variation: "absolue" }
export const MOYENNE: Mesure = { genre: "nombre", decimales: 1, variation: "relative" }

/** Sens d'une stat : plus haut vaut mieux, plus bas vaut mieux, ou neutre (jamais colorée ni tirée en constat). */
export type Sens = "haut" | "bas" | "neutre"

/**
 * Une stat d'affichage, que déclarent les entrées 2 à 12 : sa lecture d'une partie (`toi`), sa
 * mesure, son sens, ses files admises en mode Tout, et sa référence (EXPERIENCE.md, Référence) :
 * un groupe de tes parties pour une stat individuelle, lu par `groupe` ; ta période précédente
 * (`periode`) pour une stat d'équipe.
 */
export type Stat = {
  mesure: Mesure
  sens: Sens
  files: Files
  toi: LirePartie
} & ({ reference: "periode" } | { reference: Quel; groupe: LireGroupe })

// ─────────────────────────── seuils ───────────────────────────

/**
 * Confidentialité : un groupe de comparaison ne se montre que s'il agrège au moins 5 parties. Une période précédente sous 5 parties
 * n'est pas non plus une référence : ni écart ni couleur, sa raison à la place (sansEcartALaPeriode, entrée 43).
 */
export const MIN_PARTIES_GROUPE = 5
/** Évaluation : couleur seulement dès 10 parties, de ton côté comme de celui de la référence (groupe ou période précédente). */
export const MIN_PARTIES_COULEUR = 10
/** Tendance et Variation : deux séries de 10 parties, donc dès 20. */
export const PARTIES_TENDANCE = 10
/** Trop peu de parties : le pourcentage d'une catégorie dès 5 occurrences, sinon « x sur y ». */
export const MIN_OCCURRENCES = 5
/** Seuils de l'Évaluation et de la Tendance : 2 points pour un pourcentage, 3 % relatifs sinon. */
export const SEUIL_POINTS = 0.02
export const SEUIL_RELATIF = 0.03
/** Tendance : l'écart doit aussi dépasser 1,5 fois son erreur type. */
export const FACTEUR_ERREUR_TYPE = 1.5
/** Un écart égal à sa limite ne la dépasse pas, malgré l'arrondi binaire (0,25 − 0,23 > 0,02). */
const MARGE = 1e-9

function depasse(x: number, limite: number): boolean {
  return x > limite + MARGE
}

// ─────────────────────────── évaluation ───────────────────────────

/** Couleur et étiquette d'une valeur (DESIGN.md, Colors) : `fort` en bleu, `faible` en orange, `neutre` en texte-doux. */
export type Evaluation = "fort" | "faible" | "neutre"

/** Le seuil de l'Évaluation et de la Tendance autour de `reference` : 2 points, ou 3 % de sa valeur absolue. */
export function seuil(reference: number, mesure: Mesure): number {
  return mesure.genre === "pourcentage" ? SEUIL_POINTS : SEUIL_RELATIF * Math.abs(reference)
}

/** Toi face à la référence, selon le sens : au-delà du seuil, mieux (`fort`) ou moins bien (`faible`) ; entre les deux, sans valeur, sans référence ou de sens neutre, `neutre`. */
export function evaluer(valeur: number | null, reference: number | null, mesure: Mesure, sens: Sens): Evaluation {
  if (valeur === null || reference === null || sens === "neutre") return "neutre"
  const ecart = valeur - reference
  if (!depasse(Math.abs(ecart), seuil(reference, mesure))) return "neutre"
  return (ecart > 0) === (sens === "haut") ? "fort" : "faible"
}

// ─────────────────────────── comparaison ───────────────────────────

/**
 * Une stat sur une sélection : ta valeur (null : « — ») et tes parties retenues ; la référence et
 * ses parties ; l'écart (toi moins la référence) et l'évaluation. Référence null : groupe sous
 * 5 parties (ses parties restent dites), période « Tout », ou dénominateur nul.
 */
export type Comparaison = {
  valeur: number | null
  parties: number
  reference: number | null
  partiesReference: number
  ecart: number | null
  evaluation: Evaluation
}

/** Compare une stat à sa référence sur la sélection, files admises appliquées des deux côtés. */
export function comparer(sel: Selection, stat: Stat): Comparaison {
  let parStat = COMPARAISONS.get(sel)
  if (parStat === undefined) {
    parStat = new Map()
    COMPARAISONS.set(sel, parStat)
  }
  const deja = parStat.get(stat)
  if (deja !== undefined) return { ...deja }
  const c = comparaisonDe(sel, stat)
  parStat.set(stat, c)
  return { ...c }
}

/**
 * Ticket 4.41 : la comparaison de chaque stat sur chaque sélection, gardée (tuiles, constats, Courbes et Mini-courbes la
 * redemandaient) ; comparer() en rend une copie.
 */
const COMPARAISONS = new WeakMap<Selection, Map<Stat, Comparaison>>()

/** Le calcul de comparer(). */
function comparaisonDe(sel: Selection, stat: Stat): Comparaison {
  const toi = sommer(retenues(sel.parties, stat.files), stat.toi)
  const valeur = quotient(toi)
  let reference: number | null = null
  let partiesReference = 0
  if (stat.reference === "periode") {
    if (sel.precedentes !== null) {
      const avant = sommer(retenues(sel.precedentes, stat.files), stat.toi)
      reference = quotient(avant)
      partiesReference = avant.parties
    }
  } else {
    const groupe = sommerGroupe(retenues(sel.parties, stat.files), stat.reference, stat.groupe)
    partiesReference = groupe.parties
    if (groupe.parties >= MIN_PARTIES_GROUPE) reference = quotient(groupe)
  }
  // Groupe ou période précédente : couleur dès 10 parties, au plus petit des deux effectifs.
  const couleur = Math.min(toi.parties, partiesReference) >= MIN_PARTIES_COULEUR
  const ecart = valeur !== null && reference !== null ? valeur - reference : null
  const evaluation = couleur ? evaluer(valeur, reference, stat.mesure, stat.sens) : "neutre"
  return { valeur, parties: toi.parties, reference, partiesReference, ecart, evaluation }
}

// ─────────────────────────── tendance et variation ───────────────────────────

/**
 * Erreur type du rapport de ces fractions (EXPERIENCE.md, Tendance) : pour un pourcentage,
 * √(p(1 − p) ÷ n), n la somme des dénominateurs (manches, situations, duels) ; sinon celle d'un
 * rapport de sommes sur k parties, √(Σ(yᵢ − R·xᵢ)² · k ÷ ((k − 1)(Σxᵢ)²)), égale à √(s² ÷ k) d'une
 * moyenne par partie (tous les xᵢ à 1). null sans dénominateur, et sous 2 parties hors pourcentage.
 */
export function erreurType(fs: readonly Fraction[], mesure: Mesure): number | null {
  const s = additionner(fs)
  const r = quotient(s)
  if (r === null) return null
  if (mesure.genre === "pourcentage") return Math.sqrt(Math.max(0, r * (1 - r)) / s.den)
  const k = fs.length
  if (k < 2) return null
  let carres = 0
  for (const f of fs) carres += (f.num - r * f.den) ** 2
  return Math.sqrt((carres * k) / ((k - 1) * s.den * s.den))
}

/**
 * Deux séries de parties comparées : la valeur de chacune, leur écart (`recent` moins `ancien`),
 * son erreur type, et le test de la Tendance (`passe`) : l'écart dépasse le seuil de l'Évaluation,
 * pris autour de la série ancienne, et 1,5 fois son erreur type.
 */
export type Test = { recent: number; ancien: number; ecart: number; erreurType: number; passe: boolean }

/** Le test de la Tendance entre deux séries de fractions ; null si l'une n'a pas de valeur ou d'erreur type. */
export function testerEcart(recentes: readonly Fraction[], anciennes: readonly Fraction[], mesure: Mesure): Test | null {
  const recent = quotient(additionner(recentes)), ancien = quotient(additionner(anciennes))
  const e1 = erreurType(recentes, mesure), e2 = erreurType(anciennes, mesure)
  if (recent === null || ancien === null || e1 === null || e2 === null) return null
  const ecart = recent - ancien
  const erreur = Math.sqrt(e1 * e1 + e2 * e2)
  const passe = depasse(Math.abs(ecart), seuil(ancien, mesure)) && depasse(Math.abs(ecart), FACTEUR_ERREUR_TYPE * erreur)
  return { recent, ancien, ecart, erreurType: erreur, passe }
}

/** La Tendance d'une stat : « hausse », « baisse » ou « stable », et son test. */
export type Tendance = { sens: "hausse" | "baisse" | "stable"; test: Test }

/** Tes 10 dernières parties de la sélection contre les 10 précédentes, pour cette stat, dès 20 parties lisibles ; null en dessous. */
export function tendance(sel: Selection, stat: Stat): Tendance | null {
  const fs = fractions(retenues(sel.parties, stat.files), stat.toi)
  if (fs.length < 2 * PARTIES_TENDANCE) return null
  const t = testerEcart(fs.slice(0, PARTIES_TENDANCE), fs.slice(PARTIES_TENDANCE, 2 * PARTIES_TENDANCE), stat.mesure)
  if (t === null) return null
  return { sens: t.passe ? (t.ecart > 0 ? "hausse" : "baisse") : "stable", test: t }
}

/**
 * La Variation d'une stat sur la période (Courbe, Mini-courbes d'Évolution) : ses 10 dernières
 * parties moins ses 10 premières, dès 20 parties lisibles, seulement si elle passe le test de la
 * Tendance ; null sinon (non écrite).
 */
export function variation(sel: Selection, stat: Stat): Test | null {
  const fs = fractions(retenues(sel.parties, stat.files), stat.toi)
  if (fs.length < 2 * PARTIES_TENDANCE) return null
  const t = testerEcart(fs.slice(0, PARTIES_TENDANCE), fs.slice(-PARTIES_TENDANCE), stat.mesure)
  return t !== null && t.passe ? t : null
}

// ─────────────────────────── formats ───────────────────────────

/** Une valeur absente ou sous son seuil (EXPERIENCE.md, Trop peu de parties). */
export const TIRET = "—"
/** Espace fine insécable : séparateur des milliers, avant « % ». */
const FINE = "\u202f"
/** Espace insécable : avant une unité (« pts ») et avant le « · » d'un effectif. */
const NBSP = "\u00a0"
/** Le vrai signe moins. */
const MOINS = "\u2212"

/** |x| arrondi à `decimales`, compté en unités de la dernière décimale, demi vers le haut sur l'écriture décimale (1,005 → 1,01). */
function unites(x: number, decimales: number): number {
  const n = Math.round(Number(`${Math.abs(x)}e${decimales}`))
  return Number.isFinite(n) ? n : Math.round(Math.abs(x) * 10 ** decimales)
}

/** Des unités en clair, sans signe : milliers séparés, virgule décimale. */
function chiffres(n: number, decimales: number): string {
  const s = String(n).padStart(decimales + 1, "0")
  const entier = s.slice(0, s.length - decimales).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)
  return decimales > 0 ? `${entier},${s.slice(s.length - decimales)}` : entier
}

/** Le signe toujours écrit d'un écart : « + », zéro arrondi compris, ou le vrai moins. */
function signe(x: number, n: number): string {
  return x < 0 && n > 0 ? MOINS : "+"
}


export function nombreEnClair(x: number, decimales: number): string {
  if (!Number.isFinite(x)) return TIRET
  const n = unites(x, decimales)
  return (x < 0 && n > 0 ? MOINS : "") + chiffres(n, decimales)
}


export function pourcentageEnClair(part: number): string {
  if (!Number.isFinite(part)) return TIRET
  const n = unites(part, 2)
  return `${part < 0 && n > 0 ? MOINS : ""}${chiffres(n, 0)}${FINE}%`
}

/** Une valeur selon sa mesure ; null : « — ». */
export function valeurEnClair(valeur: number | null, mesure: Mesure): string {
  if (valeur === null) return TIRET
  return mesure.genre === "pourcentage" ? pourcentageEnClair(valeur) : nombreEnClair(valeur, mesure.decimales)
}






export function ecartEnClair(ecart: number, mesure: Mesure, libelle: string | null = null): string {
  if (!Number.isFinite(ecart)) return TIRET
  const decimales = mesure.genre === "pourcentage" ? 0 : mesure.decimales
  const n = unites(ecart, mesure.genre === "pourcentage" ? 2 : decimales)
  const texte = `${signe(ecart, n)}${chiffres(n, decimales)}${mesure.genre === "pourcentage" ? `${NBSP}pt${n >= 2 ? "s" : ""}` : ""}`
  return libelle ? `${texte} ${libelle}` : texte
}


export function variationEnClair(t: Test, mesure: Mesure): string {
  if (mesure.genre === "pourcentage" || mesure.variation === "absolue") return ecartEnClair(t.ecart, mesure)
  if (t.ancien === 0) return TIRET
  return relatifEnClair(t.ecart / Math.abs(t.ancien))
}


function relatifEnClair(relatif: number): string {
  const n = unites(relatif, 2)
  return `${signe(relatif, n)}${chiffres(n, 0)}${FINE}%`
}

const VS_PERIODE: Readonly<Record<Periode, string | null>> = { "7j": "vs semaine d'avant", "30j": "vs mois d'avant", acte: "vs acte d'avant", tout: null }

/**
 * Le libellé de la référence d'une stat dans cette période (EXPERIENCE.md, Formats, Écart) :
 * « vs lobby » ; pour une stat d'équipe « vs semaine d'avant », « vs mois d'avant », « vs acte
 * d'avant », null en Tout ; null pour les alliés et les adversaires, que l'écran nomme.
 */
export function libelleReference(reference: Stat["reference"], periode: Periode): string | null {
  if (reference === "lobby") return "vs lobby"
  return reference === "periode" ? VS_PERIODE[periode] : null
}

/** Ta période précédente dans une phrase : « la semaine d'avant », « le mois d'avant », « l'acte d'avant » ; aucune en Tout. */
const PERIODE_EN_MOTS: Readonly<Record<Periode, string | null>> = { "7j": "la semaine d'avant", "30j": "le mois d'avant", acte: "l'acte d'avant", tout: null }

/** Entrée 43 : chaque libellé d'une période précédente (VS_PERIODE) et sa période, pour reconnaître l'écart d'une stat d'équipe à elle. */
const PERIODE_DU_LIBELLE: ReadonlyMap<string, Periode> = new Map(
  (["7j", "30j", "acte"] as const).map((p): [string, Periode] => [VS_PERIODE[p] ?? "", p]),
)


export function effectifEnClair(libelle: string, n: number): string {
  return `${libelle}${NBSP}· ${nombreEnClair(n, 0)}`
}


export function surEnClair(x: number, y: number): string {
  return `${nombreEnClair(x, 0)} sur ${nombreEnClair(y, 0)}`
}

/** La part d'une catégorie : en pourcentage dès `minimum` occurrences (5), sinon « x sur y » ; aucune : « — ». */
export function partEnClair(num: number, den: number, minimum: number = MIN_OCCURRENCES): string {
  if (!(den > 0)) return TIRET
  return den < minimum ? surEnClair(num, den) : pourcentageEnClair(num / den)
}

// ─────────────────────────── écart écrit (entrée 40) ───────────────────────────

/**
 * Comment une valeur s'écrit : son texte (formats de l'écran), ses unités écrites, signées (points de pourcentage, centièmes,
 * secondes…), et un écart de ces unités en clair ; `base`, les unités écrites de la référence, sert à un écart relatif.
 */
export type Ecriture = { texte: (x: number) => string; unites: (x: number) => number; ecart: (u: number, base: number) => string }

/** Les unités écrites d'une valeur, avec son signe : l'arrondi de nombreEnClair et de pourcentageEnClair. */
function unitesSignees(x: number, decimales: number): number {
  const n = unites(x, decimales)
  return x < 0 ? -n : n
}

/** L'écriture d'une mesure : pourcentage entier, ou nombre à ses décimales, signé comme un écart (`signee`). */
export function ecritureDe(mesure: Mesure, signee: boolean = false): Ecriture {
  if (mesure.genre === "pourcentage") {
    return { texte: (x) => pourcentageEnClair(x), unites: (x) => unitesSignees(x, 2), ecart: (u) => ecartEnClair(u / 100, mesure) }
  }
  const d = mesure.decimales
  return {
    texte: (x) => (signee ? ecartEnClair(x, mesure) : nombreEnClair(x, d)),
    unites: (x) => unitesSignees(x, d),
    ecart: (u) => ecartEnClair(u / 10 ** d, mesure),
  }
}







export function ecartEcrit(valeur: number, reference: number, ecriture: Ecriture, libelle: string | null = null): string {
  const base = ecriture.unites(reference)
  const texte = ecriture.ecart(ecriture.unites(valeur) - base, base)
  return libelle ? `${texte} ${libelle}` : texte
}








export function sansEcartALaPeriode(c: Comparaison, libelle: string | null): string | null {
  const periode = libelle === null ? undefined : PERIODE_DU_LIBELLE.get(libelle)
  if (periode === undefined || c.valeur === null || c.partiesReference >= MIN_PARTIES_GROUPE) return null
  return `moins de ${MIN_PARTIES_GROUPE} parties ${PERIODE_EN_MOTS[periode]}`
}







export function sansEcartCourt(c: Comparaison, libelle: string | null): string | null {
  if (libelle === null || sansEcartALaPeriode(c, libelle) === null) return null
  const n = c.partiesReference
  return `${libelle.replace(/^vs /, "")} ${n === 0 ? "sans donnée" : `sur${NBSP}${partiesInsecables(n)}`}`
}


function partiesInsecables(n: number): string {
  return `${nombreEnClair(n, 0)}${NBSP}partie${n > 1 ? "s" : ""}`
}


function libelleAvecSesParties(c: Comparaison, libelle: string | null): string | null {
  if (libelle === null || !PERIODE_DU_LIBELLE.has(libelle) || c.partiesReference === c.parties) return libelle
  return `${libelle} (${partiesInsecables(c.partiesReference)})`
}










export function ecartDe(
  c: Comparaison, ecriture: Ecriture, libelle: string | null, ecrit: boolean = true, avecSesParties: boolean = true,
): { ecart: string | null; evaluation: Evaluation } {
  const raison = sansEcartALaPeriode(c, libelle)
  if (raison !== null) return { ecart: raison, evaluation: "neutre" }
  if (!ecrit || c.valeur === null || c.reference === null) return { ecart: null, evaluation: "neutre" }
  const nul = ecriture.unites(c.valeur) === ecriture.unites(c.reference)
  const reference = avecSesParties ? libelleAvecSesParties(c, libelle) : libelle
  return { ecart: ecartEcrit(c.valeur, c.reference, ecriture, reference), evaluation: nul ? "neutre" : c.evaluation }
}

// ═══════════════════════ chiffres clés (entrée 2) ═══════════════════════
//
// Les métriques des Tuiles de chiffre clé de la Vue d'ensemble (EXPERIENCE.md, Component Patterns,
// Définitions des métriques), les premiers duels entiers, que reprennent les entrées 6, 7 et 9, et
// ces chiffres pour une seule partie, que reprennent Parties (31) et le Détail (33). Chaque lecture
// est celle que l'outil de concordance (outils/concordance.ts) a jugée conforme à tracker.gg :
// manches jouées, totaux de fin de partie, dégâts de tes manches, faits de manche.

// ─────────────────────────── lectures d'une partie ───────────────────────────

/**
 * Tes manches jouées : celles que la réduction garde (`manches`), la manche « Surrendered » d'une
 * partie abandonnée exclue, comme le `metadata.rounds` de tracker.gg ; aucune en deathmatch.
 */
export function manchesJouees(p: Partie): number {
  return (p.manches ?? []).length
}

/** Un total de fin de partie (`stats` de HenrikDev) ; null s'il manque. */
function total(p: Partie, cle: keyof Totaux): number | null {
  return p.totaux?.[cle] ?? null
}

/** 1 pour vrai, 0 pour faux : un fait de manche compté. */
function un(vrai: boolean): number {
  return vrai ? 1 : 0
}

/**
 * Une valeur de tes manches rapportée à tes manches jouées : Σ `lire` ÷ manches ; null sans manche
 * jouée, ou si une manche n'a pas la valeur (donnée absente : la partie sort de cette stat seule).
 */
function parManche(p: Partie, lire: (m: Manche) => number | null): Fraction | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  let num = 0
  for (const m of manches) {
    const v = lire(m)
    if (v === null) return null
    num += v
  }
  return { num, den: manches.length }
}

/**
 * La part gagnée des manches d'une catégorie : manches gagnées sur manches de la catégorie
 * (`dans`). null sans manche jouée, si une manche ne dit pas sa catégorie (`dans` null), ou si une
 * manche de la catégorie ne dit pas son issue.
 */
function partGagnee(p: Partie, dans: (m: Manche) => boolean | null): Fraction | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  let num = 0, den = 0
  for (const m of manches) {
    const d = dans(m)
    if (d === null) return null
    if (!d) continue
    if (m.gagnee == null) return null
    den++
    num += un(m.gagnee)
  }
  return { num, den }
}

/** Une somme des manches d'un groupe (`detailManches`) rapportée à ses manches ; null s'il n'en a pas. */
function parMancheDuGroupe(g: Groupe, lire: (d: CompteursManche) => number): Fraction | null {
  const d = g.detailManches
  return d == null || !(d.manches > 0) ? null : { num: lire(d), den: d.manches }
}

// ─────────────────────────── premiers duels ───────────────────────────

/** 1ᵉʳ kill de la manche (EXPERIENCE.md, 1ᵉʳˢ kills) : le premier kill de la manche est le tien, sur un adversaire. */
export function premierKillDeToi(m: Manche): boolean {
  return m.premierKill === "toi"
}

/**
 * 1ʳᵉ mort de la manche en duel : tu es la victime du premier kill de la manche, tué par un
 * adversaire ; une 1ʳᵉ mort sans tueur adverse (spike, chute, allié) n'est pas un duel.
 */
export function premiereMortEnDuel(m: Manche): boolean {
  return m.premiereMort === "toi" && m.premierKill === "adversaire"
}

// ─────────────────────────── stats ───────────────────────────






const DIFFERENCE_PAR_MANCHE: Mesure = { genre: "nombre", decimales: 1, variation: "absolue" }

/** Victoires, stat d'équipe : parties gagnées ÷ parties jouées, nuls au dénominateur ; files complètes ; face à ta période précédente. */
export const VICTOIRES: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => (p.resultat == null ? null : { num: un(p.resultat === "victoire"), den: 1 }),
}

/** K/D : Σ kills ÷ Σ morts, kills d'adversaires et morts hors mort par le spike (`stats.kills`, `stats.deaths`) ; toutes les files ; face à tes lobbys. */
export const KD: Stat = {
  mesure: RATIO,
  sens: "haut",
  files: "toutes",
  reference: "lobby",
  toi: (p) => {
    const kills = total(p, "kills"), morts = total(p, "morts")
    return kills === null || morts === null ? null : { num: kills, den: morts }
  },
  groupe: (g) => ({ num: g.kills, den: g.morts }),
}

/** Score de combat : Σ `stats.score` ÷ Σ manches jouées, comme le `scorePerRound` de tracker.gg ; face à tes lobbys. */
export const SCORE: Stat = {
  mesure: MOYENNE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => {
    const score = total(p, "score"), manches = manchesJouees(p)
    return score === null || manches === 0 ? null : { num: score, den: manches }
  },
  groupe: (g) => (g.manches > 0 ? { num: g.score, den: g.manches } : null),
}

/** Dégâts / manche : tes dégâts aux adversaires (`degatsInfliges` de tes manches, sans tir allié) ÷ manches jouées ; face à tes lobbys. */
export const DEGATS: Stat = {
  mesure: MOYENNE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => parManche(p, (m) => m.degatsInfliges ?? null),
  groupe: (g) => parMancheDuGroupe(g, (d) => d.degatsInfliges),
}

/** Écart de dégâts, stat d'équipe : dégâts infligés moins dégâts reçus des adversaires, par manche jouée ; face à ta période précédente. */
export const ECART_DEGATS: Stat = {
  mesure: DIFFERENCE_PAR_MANCHE,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => parManche(p, (m) => (m.degatsInfliges == null || m.degatsRecus == null ? null : m.degatsInfliges - m.degatsRecus)),
}

/** Touches à la tête sur touches ; aucune touche : rien à mesurer, donnée absente. */
function partDeTete(tete: number, corps: number, jambes: number): Fraction | null {
  const touches = tete + corps + jambes
  return touches > 0 ? { num: tete, den: touches } : null
}







export const TETE: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "toutes",
  reference: "lobby",
  toi: (p) => {
    const tete = total(p, "tete"), corps = total(p, "corps"), jambes = total(p, "jambes")
    return tete === null || corps === null || jambes === null ? null : partDeTete(tete, corps, jambes)
  },
  groupe: (g) => {
    const t = g.touchesDonnees
    return t == null ? null : partDeTete(t.tete, t.corps, t.jambes)
  },
}

/** KAST : part des manches jouées avec un kill, un assist, la survie ou une mort échangée (fait `kast`) ; face à tes lobbys. */
export const KAST: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => parManche(p, (m) => (m.kast == null ? null : un(m.kast))),
  groupe: (g) => parMancheDuGroupe(g, (d) => d.manchesKast),
}

/** Survie : part des manches jouées où tu es vivant à la fin (fait `survie`) ; face à tes lobbys. */
export const SURVIE: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => parManche(p, (m) => (m.survie == null ? null : un(m.survie))),
  groupe: (g) => parMancheDuGroupe(g, (d) => d.manchesSurvecues),
}

/** Clutchs : situations 1 contre N gagnées sur situations ; face à tes lobbys. */
export const CLUTCHS: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => {
    const manches = p.manches ?? []
    if (manches.length === 0) return null
    let num = 0, den = 0
    for (const m of manches) {
      if (m.clutch === undefined) return null
      if (m.clutch === null) continue
      den++
      num += un(m.clutch.gagne)
    }
    return { num, den }
  },
  groupe: (g) => (g.detailManches == null ? null : { num: g.detailManches.clutchsGagnes, den: g.detailManches.clutchs }),
}






export const PREMIERS_KILLS: Stat = {
  mesure: RATIO,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => parManche(p, (m) => un(premierKillDeToi(m))),
}

/** 1ʳᵉˢ morts par manche, en duel seulement (premiereMortEnDuel) ; plus bas vaut mieux ; deux décimales, comme les 1ᵉʳˢ kills. */
export const PREMIERES_MORTS: Stat = {
  mesure: RATIO,
  sens: "bas",
  files: "completes",
  reference: "periode",
  toi: (p) => parManche(p, (m) => un(premiereMortEnDuel(m))),
}

/** Ratio des premiers duels : 1ᵉʳˢ kills ÷ 1ʳᵉˢ morts, sommés sur les parties ; stat d'équipe. */
export const RATIO_PREMIERS_DUELS: Stat = {
  mesure: RATIO,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => {
    const kills = PREMIERS_KILLS.toi(p), morts = PREMIERES_MORTS.toi(p)
    return kills === null || morts === null ? null : { num: kills.num, den: morts.num }
  },
}

/** Écos gagnées, stat d'équipe : part gagnée des manches où ton achat est une éco (Types d'achat) ; face à ta période précédente. */
export const ECOS_GAGNEES: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => partGagnee(p, (m) => (m.achat == null ? null : m.achat === "eco")),
}

/**
 * Retakes, stat d'équipe : part gagnée de tes manches de défense après une pose adverse (en défense,
 * toute pose est adverse, son poseur fût-il inconnu) ; face à ta période précédente.
 */
export const RETAKES: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => partGagnee(p, (m) => (m.cote == null ? null : m.cote === "defense" && m.pose != null)),
}

// ─────────────────────────── tuiles ───────────────────────────

/** Les clés des douze chiffres clés. */
export type CleChiffre = "victoires" | "kd" | "score" | "degats" | "ecartDegats" | "tete" | "kast" | "survie" | "premiersKills" | "clutchs" | "ecos" | "retakes"

/**
 * Une Tuile de chiffre clé déclarée : sa clé, son nom (EXPERIENCE.md, Information Architecture), sa
 * stat, et comment s'écrivent sa valeur et ce qu'elle porte dessous : `categorie`, part d'une
 * catégorie (pourcentage dès 5 occurrences, sinon « x sur y ») ; `signee`, valeur écrite avec son
 * signe, comme un écart ; `effectif`, l'effectif à la place de l'écart.
 */
export type ChiffreCle = { cle: CleChiffre; libelle: string; stat: Stat; categorie: boolean; signee: boolean; effectif: boolean }

function chiffre(cle: CleChiffre, libelle: string, stat: Stat, options: Partial<Pick<ChiffreCle, "categorie" | "signee" | "effectif">> = {}): ChiffreCle {
  return { cle, libelle, stat, categorie: false, signee: false, effectif: false, ...options }
}

/** Les douze Tuiles de chiffre clé, dans l'ordre de la Vue d'ensemble (3 colonnes sur 4 rangées). */
export const CHIFFRES_CLES: readonly ChiffreCle[] = [
  chiffre("victoires", "Victoires", VICTOIRES, { effectif: true }),
  chiffre("kd", "K/D", KD),
  chiffre("score", "Score", SCORE),
  chiffre("degats", "Dégâts / manche", DEGATS),
  chiffre("ecartDegats", "Écart de dégâts", ECART_DEGATS, { signee: true }),
  chiffre("tete", "Tirs à la tête", TETE),
  chiffre("kast", "KAST", KAST),
  chiffre("survie", "Survie", SURVIE),
  chiffre("premiersKills", "1\u1d49\u02b3\u02e2 kills / manche", PREMIERS_KILLS),
  chiffre("clutchs", "Clutchs", CLUTCHS, { categorie: true }),
  chiffre("ecos", "Écos gagnées", ECOS_GAGNEES, { categorie: true }),
  chiffre("retakes", "Retakes", RETAKES, { categorie: true }),
]

/** Parties d'une fenêtre de la Mini-courbe (tranches, au-delà de TRANCHES_MINI_COURBE parties). */
export const PARTIES_MINI_COURBE = 5
/** Points d'une Mini-courbe, au plus : une quarantaine à la largeur d'une tuile (EXPERIENCE.md, Mini-courbe ; entrée 39). */
export const POINTS_MINI_COURBE = 40
/** Tranches d'une Mini-courbe au-delà de la limite : de quoi faire POINTS_MINI_COURBE fenêtres de PARTIES_MINI_COURBE tranches. */
const TRANCHES_MINI_COURBE = POINTS_MINI_COURBE + PARTIES_MINI_COURBE - 1

/**
 * Les tranches d'une Mini-courbe, de la plus ancienne à la plus récente : jusqu'à TRANCHES_MINI_COURBE (44) parties, une
 * partie par tranche ; au-delà, les n parties réparties en 44 tranches consécutives, égales à une partie près (la tranche k
 * va de la partie ⌊k·n/44⌋ à la partie ⌊(k+1)·n/44⌋ − 1), chacune la somme de ses fractions.
 */
function tranchesMiniCourbe(fs: readonly Fraction[]): Fraction[] {
  if (fs.length <= TRANCHES_MINI_COURBE) return [...fs]
  const tranches: Fraction[] = []
  for (let k = 0; k < TRANCHES_MINI_COURBE; k++) {
    const debut = Math.floor((k * fs.length) / TRANCHES_MINI_COURBE), fin = Math.floor(((k + 1) * fs.length) / TRANCHES_MINI_COURBE)
    const s = additionner(fs.slice(debut, fin))
    tranches.push({ num: s.num, den: s.den })
  }
  return tranches
}









export function miniCourbe(sel: Selection, stat: Stat): (number | null)[] {
  const ts = tranchesMiniCourbe(fractions(retenues(sel.parties, stat.files), stat.toi).reverse())
  const points: (number | null)[] = []
  for (let fin = PARTIES_MINI_COURBE; fin <= ts.length; fin++) points.push(quotient(additionner(ts.slice(fin - PARTIES_MINI_COURBE, fin))))
  return points
}

/**
 * Une tuile calculée sur une sélection : la comparaison du socle (valeurs brutes, pour la
 * concordance et le récap), puis ce que montre la tuile. `ecart` null : rien à écrire (référence
 * absente, Victoires, part sous 5 occurrences, période précédente sous 5 parties), l'`effectif`
 * et la Mini-courbe passent alors en texte-discret (DESIGN.md, Tuile de chiffre clé) et
 * `evaluation` vaut « neutre ».
 */
export type Tuile = {
  cle: CleChiffre
  libelle: string
  comparaison: Comparaison

  valeur: string




  ecart: string | null





  effectif: string | null





  enEntier: string | null
  /** Couleur de l'écart et de la Mini-courbe (ecartDe) : neutre aussi pour un écart écrit nul. */
  evaluation: Evaluation
  miniCourbe: (number | null)[]
}


export function partiesEnClair(parties: number, nuls: number): string {
  const texte = `sur ${nombreEnClair(parties, 0)} partie${parties > 1 ? "s" : ""}`
  return nuls > 0 ? `${texte}, dont ${nombreEnClair(nuls, 0)} nul${nuls > 1 ? "s" : ""}` : texte
}

/** Le dénominateur de la référence d'une stat sur la sélection : ses occurrences, pour une part d'une catégorie. */
function denominateurReference(sel: Selection, stat: Stat): number {
  if (stat.reference === "periode") return sommer(retenues(sel.precedentes ?? [], stat.files), stat.toi).den
  return sommerGroupe(retenues(sel.parties, stat.files), stat.reference, stat.groupe).den
}

/** Une Tuile de chiffre clé sur la sélection (Component Patterns, Tuile de chiffre clé). */
export function tuile(sel: Selection, c: ChiffreCle): Tuile {
  const comparaison = comparer(sel, c.stat)
  const mesure = c.stat.mesure
  let valeur = c.signee && comparaison.valeur !== null ? ecartEnClair(comparaison.valeur, mesure) : valeurEnClair(comparaison.valeur, mesure)
  let ecrit = true
  if (c.categorie) {
    const toi = sommer(retenues(sel.parties, c.stat.files), c.stat.toi)
    valeur = partEnClair(toi.num, toi.den)
    // Trop peu de parties : un écart seulement entre deux parts d'au moins 5 occurrences chacune.
    if (toi.den < MIN_OCCURRENCES || denominateurReference(sel, c.stat) < MIN_OCCURRENCES) ecrit = false
  }
  const libelle = libelleReference(c.stat.reference, sel.perimetre.periode)
  // Entrée 43 : face à une période précédente de moins de 5 parties, ni écart ni couleur ; la raison courte s'écrit à la place, dans
  // l'effectif, en texte-discret comme celui de Victoires (qui n'écrit jamais d'écart, et garde le sien), la raison entière pour
  // VoiceOver. Dès 5, l'écart sans les parties de la référence, qui ne tiendraient pas en 2 lignes ; VoiceOver les dit.
  const raison = c.effectif ? null : sansEcartALaPeriode(comparaison, libelle)
  const ecriture = ecritureDe(mesure, c.signee)
  const { ecart, evaluation }: { ecart: string | null; evaluation: Evaluation } = c.effectif || raison !== null
    ? { ecart: null, evaluation: "neutre" }
    : ecartDe(comparaison, ecriture, libelle, ecrit, false)
  const long = ecart === null ? null : ecartDe(comparaison, ecriture, libelle, ecrit).ecart
  const enEntier = raison ?? (long !== ecart ? long : null)
  let effectif: string | null = raison === null ? null : sansEcartCourt(comparaison, libelle)
  if (c.effectif && comparaison.parties > 0) {
    const nuls = retenues(sel.parties, c.stat.files).filter((p) => p.resultat === "nul").length
    effectif = partiesEnClair(comparaison.parties, nuls)
  }
  return {
    cle: c.cle,
    libelle: c.libelle,
    comparaison,
    valeur,
    ecart,
    effectif,
    enEntier,
    evaluation,
    miniCourbe: miniCourbe(sel, c.stat),
  }
}

/** Les douze tuiles de la Vue d'ensemble sur la sélection, dans leur ordre. */
export function tuiles(sel: Selection): Tuile[] {
  return CHIFFRES_CLES.map((c) => tuile(sel, c))
}

// ─────────────────────────── une seule partie ───────────────────────────

/** Les clés des stats d'une partie : les douze chiffres clés et les premiers duels entiers. */
export type CleStat = CleChiffre | "premieresMorts" | "ratioPremiersDuels"

/** Les stats de cette entrée, par clé. */
export const STATS_CHIFFRES: Readonly<Record<CleStat, Stat>> = {
  victoires: VICTOIRES,
  kd: KD,
  score: SCORE,
  degats: DEGATS,
  ecartDegats: ECART_DEGATS,
  tete: TETE,
  kast: KAST,
  survie: SURVIE,
  premiersKills: PREMIERS_KILLS,
  clutchs: CLUTCHS,
  ecos: ECOS_GAGNEES,
  retakes: RETAKES,
  premieresMorts: PREMIERES_MORTS,
  ratioPremiersDuels: RATIO_PREMIERS_DUELS,
}


export type ChiffrePartie = { fraction: Fraction; valeur: number | null }

/**
 * Les chiffres d'une seule partie (Lignes de partie, Détail) : chaque stat de STATS_CHIFFRES sur
 * cette partie seule, même calcul que sur le périmètre ; null hors des files de la stat ou pour une
 * donnée absente.
 */
export function chiffresPartie(p: Partie): Record<CleStat, ChiffrePartie | null> {
  const chiffres: Partial<Record<CleStat, ChiffrePartie | null>> = {}
  for (const [cle, stat] of Object.entries(STATS_CHIFFRES) as [CleStat, Stat][]) {
    const [f] = fractions(retenues([p], stat.files), stat.toi)
    chiffres[cle] = f === undefined ? null : { fraction: f, valeur: quotient(f) }
  }
  return chiffres as Record<CleStat, ChiffrePartie | null>
}

// ═══════════════════════ courbes, note et tendances (entrée 4) ═══════════════════════
//
// La Courbe d'une stat d'Évolution face à sa référence (un point par partie lisible jusqu'à 60 parties, puis un par
// jour, par semaine ou par mois : au plus une soixantaine de points, entrée 22), sa moyenne et sa référence (celles de sa tuile), sa variation et sa phrase VoiceOver ; les six Mini-courbes
// d'Évolution ; la Courbe de la note de la Vue d'ensemble (20 dernières parties de compétition notées, quel que soit le
// périmètre : écart des moitiés, titre, bande des lobbys, mentions, phrase VoiceOver) ; les Tendances (EXPERIENCE.md,
// Component Patterns : Courbe, Courbe de la note, Mini-courbe ; Définitions des métriques : Note Valorant, Variation,
// Tendances ; Accessibility Floor). L'outil de concordance compare la note et chaque point par partie à tracker.gg.

// ─────────────────────────── note ───────────────────────────

/** Note Valorant : une décimale, comme toute moyenne par partie (Formats) ; écart et variation en valeur, écrits en entiers (NOTE_ECART). */
const NOTE_MESURE: Mesure = { genre: "nombre", decimales: 1, variation: "absolue" }

/**
 * Note Valorant (EXPERIENCE.md, Note Valorant) : la note officielle de fin de partie (`performance.score`), en
 * compétition seulement, une note de vélocité restant sur sa Ligne de partie ; face à tes lobbys : somme et effectif des
 * notes de leurs joueurs notés, que la réduction tait de 1 à 2 notés et dans un lobby dont un camp tait la sienne ; sans
 * joueur noté, aucune note de lobby.
 */
export const NOTE: Stat = {
  mesure: NOTE_MESURE,
  sens: "haut",
  files: "competition",
  reference: "lobby",
  toi: (p) => (p.note == null ? null : { num: p.note, den: 1 }),
  groupe: (g) => (g.note == null || !(g.note.effectif > 0) ? null : { num: g.note.somme, den: g.note.effectif }),
}


const NOTE_ECART: Mesure = { genre: "nombre", decimales: 0, variation: "absolue" }


const ECRITURE_NOTE: Ecriture = { ...ecritureDe(NOTE_MESURE), ecart: (u) => ecartEnClair(u / 10, NOTE_ECART) }

/** La mesure d'un écart ou d'une variation écrits : celle de la stat, en entiers pour la note. */
function mesureEcrite(stat: Stat): Mesure {
  return stat === NOTE ? NOTE_ECART : stat.mesure
}

// ─────────────────────────── stats d'Évolution ───────────────────────────

/** Les clés des stats d'Évolution. */
export type CleEvolution = "note" | "score" | "kd" | "degats" | "ecartDegats" | "tete" | "kast" | "survie" | "victoires"

/**
 * Une stat d'Évolution déclarée : sa clé, son nom dans les puces d'Évolution, son nom complet (titre de la Courbe,
 * Tendances), son libellé dit par VoiceOver (« Ratio kills sur morts » pour K/D, Voice and Tone), sa stat, et
 * `signee` : valeur écrite avec son signe, comme sa tuile.
 */
export type StatEvolution = { cle: CleEvolution; puce: string; libelle: string; parle: string; stat: Stat; signee: boolean }

function evolution(cle: CleEvolution, puce: string, libelle: string, parle: string, stat: Stat, signee: boolean = false): StatEvolution {
  return { cle, puce, libelle, parle, stat, signee }
}

/** Les stats d'Évolution, dans l'ordre de ses puces (EXPERIENCE.md, Information Architecture). */
export const STATS_EVOLUTION: readonly StatEvolution[] = [
  evolution("note", "Note Valorant", "Note Valorant", "Note Valorant", NOTE),
  evolution("score", "Score de combat", "Score de combat", "Score de combat", SCORE),
  evolution("kd", "K/D", "K/D", "Ratio kills sur morts", KD),
  evolution("degats", "Dégâts", "Dégâts / manche", "Dégâts par manche", DEGATS),
  evolution("ecartDegats", "Écart de dégâts", "Écart de dégâts", "Écart de dégâts par manche", ECART_DEGATS, true),
  evolution("tete", "Tête", "Tirs à la tête", "Tirs à la tête", TETE),
  evolution("kast", "KAST", "KAST", "KAST", KAST),
  evolution("survie", "Survie", "Survie", "Survie", SURVIE),
  evolution("victoires", "Victoires", "Victoires", "Victoires", VICTOIRES),
]

// ─────────────────────────── points ───────────────────────────






export type PointCourbe = { quand: string; parties: number; toi: Fraction; valeur: number | null; lobby: Fraction | null; valeurLobby: number | null }

function point(quand: string, parties: number, toi: Fraction, lobby: Fraction | null): PointCourbe {
  return { quand, parties, toi, valeur: quotient(toi), lobby, valeurLobby: lobby === null ? null : quotient(lobby) }
}

/** La fraction du groupe de référence d'une stat dans une partie (sommerGroupe) ; null pour une stat d'équipe, sans groupe gardé ou pour une donnée absente. */
function fractionDuGroupe(p: Partie, stat: Stat): Fraction | null {
  if (stat.reference === "periode") return null
  const s = sommerGroupe([p], stat.reference, stat.groupe)
  return s.parties === 0 ? null : { num: s.num, den: s.den }
}

/**
 * Un point par partie lisible de la stat (files admises, donnée présente), la plus ancienne d'abord ; `parties` vient
 * la plus récente d'abord, comme celles d'une Selection.
 */
export function pointsParPartie(parties: readonly Partie[], stat: Stat): PointCourbe[] {
  const points: PointCourbe[] = []
  for (const p of retenues(parties, stat.files)) {
    const [toi] = fractions([p], stat.toi)
    if (toi !== undefined) points.push(point(p.debut, 1, toi, fractionDuGroupe(p, stat)))
  }
  return points.reverse()
}


function jourLocal(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "?"
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}


function moisLocal(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "?"
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}






function regrouper(points: readonly PointCourbe[], cle: (iso: string) => string): PointCourbe[] {
  const groupes = new Map<string, PointCourbe[]>()
  for (const x of points) {
    const k = cle(x.quand)
    const duGroupe = groupes.get(k)
    if (duGroupe === undefined) groupes.set(k, [x])
    else duGroupe.push(x)
  }
  const r: PointCourbe[] = []
  for (const [k, xs] of groupes) {
    const toi = additionner(xs.map((x) => x.toi))
    const lobbys = xs.flatMap((x) => (x.lobby === null ? [] : [x.lobby]))
    const lobby = lobbys.length === 0 ? null : additionner(lobbys)
    r.push(point(k, xs.length, { num: toi.num, den: toi.den }, lobby === null ? null : { num: lobby.num, den: lobby.den }))
  }
  return r
}

/** Un point par jour local où la stat a une partie lisible, le plus ancien d'abord : le rapport des sommes de ses parties, pour toi et pour ta référence. */
export function pointsParJour(parties: readonly Partie[], stat: Stat): PointCourbe[] {
  return regrouper(pointsParPartie(parties, stat), jourLocal)
}

// ─────────────────────────── courbe ───────────────────────────

/** Jusqu'à 60 parties lisibles, la Courbe a un point par partie (EXPERIENCE.md, Courbe). */
export const MAX_POINTS_PAR_PARTIE = 60
/** Au-delà, un point par jour tant qu'il y a au plus 60 jours joués, puis par semaine tant qu'il y en a au plus 60, puis par mois. */
export const MAX_POINTS_REGROUPES = 60

/**
 * Le regroupement des points d'une Courbe : un point par partie, par jour, par semaine (lundi à dimanche, la semaine ISO des
 * cumuls : semaineDe) ou par mois, à l'heure de l'iPhone.
 */
export type Regroupement = "partie" | "jour" | "semaine" | "mois"








export function pointsDeCourbe(parPartie: readonly PointCourbe[]): { regroupement: Regroupement; points: PointCourbe[] } {
  if (parPartie.length <= MAX_POINTS_PAR_PARTIE) return { regroupement: "partie", points: [...parPartie] }
  const jours = regrouper(parPartie, jourLocal)
  if (jours.length <= MAX_POINTS_REGROUPES) return { regroupement: "jour", points: jours }
  const semaines = regrouper(parPartie, semaineDe)
  if (semaines.length <= MAX_POINTS_REGROUPES) return { regroupement: "semaine", points: semaines }
  return { regroupement: "mois", points: regrouper(parPartie, moisLocal) }
}

/** Le sens de la Variation : hausse ou baisse quand elle passe le test de la Tendance, stable sinon. */
export type SensVariation = "hausse" | "baisse" | "stable"

/**
 * La Courbe d'une stat d'Évolution sur la sélection. `comparaison` : celle du socle, la même que la tuile de la stat
 * (moyenne : `valeur` ; `reference`). `points` : le plus ancien d'abord (pointsDeCourbe : par partie, jour, semaine ou mois,
 * `regroupement`), avec ceux de tes lobbys quand leur courbe se montre (`courbeLobbys` : stat individuelle dont comparer a une
 * référence, dès 5 parties) ; `parJour` : vrai pour un point par jour ; `ligne` : ta période précédente, pour une stat
 * d'équipe, dès 5 parties (entrée 43 ; `reference` aussi). `variation` : celle du socle, seulement si elle passe le test ; `sens` : null sous 20 parties lisibles ou sans
 * test possible.
 */
export type Courbe = {
  cle: CleEvolution
  libelle: string
  comparaison: Comparaison
  regroupement: Regroupement
  parJour: boolean
  points: PointCourbe[]
  courbeLobbys: boolean
  ligne: number | null

  moyenne: string
  /** La référence en clair ; null sans référence. */
  reference: string | null
  variation: Test | null

  texteVariation: string | null
  sens: SensVariation | null
  /** La phrase VoiceOver ; null sans point. */
  phrase: string | null




  note: string | null
}

/**
 * Le sens de la Variation de la stat (ses 10 premières parties lisibles de la période contre ses 10 dernières, test de la
 * Tendance) ; null sous 20 parties lisibles ou sans test possible. Celui de la Courbe (`courbe().sens`) ; exporté pour les
 * Mini-courbes d'Évolution, qui n'ont besoin que de lui (ticket 4.41 : sans calculer six Courbes entières).
 */
export function sensVariation(sel: Selection, stat: Stat): SensVariation | null {
  const fs = fractions(retenues(sel.parties, stat.files), stat.toi)
  if (fs.length < 2 * PARTIES_TENDANCE) return null
  const t = testerEcart(fs.slice(0, PARTIES_TENDANCE), fs.slice(-PARTIES_TENDANCE), stat.mesure)
  if (t === null) return null
  return !t.passe ? "stable" : t.ecart > 0 ? "hausse" : "baisse"
}

/** Une valeur de la stat en clair, comme sa tuile : avec son signe pour une stat `signee` ; null : « — ». */
function commeSaTuile(valeur: number | null, e: StatEvolution): string {
  return e.signee && valeur !== null ? ecartEnClair(valeur, e.stat.mesure) : valeurEnClair(valeur, e.stat.mesure)
}

/** La période dite par VoiceOver. */
const PERIODE_DITE: Readonly<Record<Periode, string>> = { "7j": "sur 7 jours", "30j": "sur 30 jours", acte: "sur l'acte en cours", tout: "sur tout l'historique" }
/** Ta période précédente, dite après « au-dessus », « en dessous » ou « au niveau » ; aucune en Tout. */
const PRECEDENTE_DITE: Readonly<Record<Periode, string | null>> = { "7j": "de la semaine d'avant", "30j": "du mois d'avant", acte: "de l'acte d'avant", tout: null }
/** Un groupe de référence, dit de même. */
const GROUPE_DIT: Readonly<Record<Quel, string>> = { lobby: "de tes lobbys", allies: "de tes alliés", adversaires: "de tes adversaires" }


function partiesDites(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}





function variationDite(texte: string): string {
  return texte.replace(/^[+\u2212]/, "").replace(/\u00a0pt(s?)\b/, "\u00a0point$1")
}









function phraseCourbe(e: StatEvolution, periode: Periode, c: Omit<Courbe, "phrase" | "note">): string | null {
  if (c.points.length === 0) return null
  let texte = `${e.parle} ${PERIODE_DITE[periode]}, ${partiesDites(c.comparaison.parties)}`
  if (c.sens === "stable") texte += ", stable"
  else if (c.sens !== null) texte += `, en ${c.sens}${c.texteVariation === null || c.texteVariation === TIRET ? "" : ` de ${variationDite(c.texteVariation)}`}`
  const { valeur, reference, parties, partiesReference } = c.comparaison
  if (valeur === null) return `${texte}.`
  texte += ` : ${c.moyenne} en moyenne`
  const ref = e.stat.reference
  const raison = sansEcartALaPeriode(c.comparaison, libelleReference(ref, periode))
  if (raison !== null) return `${texte} ; ${raison}.`
  const qui = ref === "periode" ? PRECEDENTE_DITE[periode] : GROUPE_DIT[ref]
  if (reference !== null && c.reference !== null && qui !== null) {
    const position = c.moyenne === c.reference ? "au niveau" : valeur > reference ? "au-dessus" : "en dessous"
    const sesParties = ref === "periode" && partiesReference !== parties ? ` sur ${partiesDites(partiesReference)}` : ""
    texte += `, ${position} ${qui} (${c.reference}${sesParties})`
  }
  return `${texte}.`
}

/** La Courbe d'une stat d'Évolution sur la sélection (EXPERIENCE.md, Courbe ; Définitions des métriques, Variation). */
export function courbe(sel: Selection, e: StatEvolution): Courbe {
  const stat = e.stat
  const comparaison = comparer(sel, stat)
  const { regroupement, points: regroupes } = pointsDeCourbe(pointsParPartie(sel.parties, stat))
  // La courbe de tes lobbys, sur les mêmes parties : seulement si comparer en donne la référence (dès 5 parties).
  const courbeLobbys = stat.reference !== "periode" && comparaison.reference !== null
  const points = regroupes.map((x) => (courbeLobbys ? x : { ...x, lobby: null, valeurLobby: null }))
  // Entrée 43 : une période précédente sous 5 parties n'est pas une référence : ni ligne ni légende, comme sans partie avant.
  const avant = stat.reference === "periode" && comparaison.partiesReference >= MIN_PARTIES_GROUPE ? comparaison.reference : null
  const v = variation(sel, stat)
  const sansPhrase: Omit<Courbe, "phrase" | "note"> = {
    cle: e.cle,
    libelle: e.libelle,
    comparaison,
    regroupement,
    parJour: regroupement === "jour",
    points,
    courbeLobbys,
    ligne: avant,
    moyenne: commeSaTuile(comparaison.valeur, e),
    reference: comparaison.reference === null || (stat.reference === "periode" && avant === null) ? null : commeSaTuile(comparaison.reference, e),
    variation: v,
    texteVariation: v === null ? null : variationEnClair(v, mesureEcrite(stat)),
    sens: sensVariation(sel, stat),
  }
  const raison = sansEcartALaPeriode(comparaison, libelleReference(stat.reference, sel.perimetre.periode))
  const note = raison === null ? null : `Pas de comparaison${NBSP}: ${raison}.`
  return { ...sansPhrase, phrase: phraseCourbe(e, sel.perimetre.periode, sansPhrase), note }
}

// ─────────────────────────── mini-courbes d'Évolution ───────────────────────────

/** Les six Mini-courbes d'Évolution, dans l'ordre de la maquette : des chiffres clés. */
const MINI_COURBES: readonly CleChiffre[] = ["kd", "tete", "kast", "victoires", "ecartDegats", "survie"]

/**
 * Une Mini-courbe d'Évolution : la valeur de la période comme sa tuile l'écrit, les points de miniCourbe (moyenne
 * glissante sur 5 parties), la variation du socle (seulement si elle passe le test) et son texte, et la couleur du sens
 * de la variation : `fort` (bleu) dans le bon sens de la stat, `faible` (orange) dans l'autre, `neutre` sans variation.
 */
export type MiniCourbeEvolution = {
  cle: CleChiffre
  libelle: string
  valeur: string
  points: (number | null)[]
  variation: Test | null
  texteVariation: string | null
  evaluation: Evaluation
}

/** La couleur d'une Variation selon le sens de la stat ; sans variation, ou de sens neutre : `neutre`. */
function evaluationVariation(v: Test | null, sens: Sens): Evaluation {
  if (v === null || sens === "neutre") return "neutre"
  return (v.ecart > 0) === (sens === "haut") ? "fort" : "faible"
}

/** Les six Mini-courbes d'Évolution sur la sélection (EXPERIENCE.md, Mini-courbe ; Définitions des métriques, Variation). */
export function miniCourbesEvolution(sel: Selection): MiniCourbeEvolution[] {
  return MINI_COURBES.map((cle) => {
    const c = CHIFFRES_CLES.find((x) => x.cle === cle)!
    const t = tuile(sel, c)
    const v = variation(sel, c.stat)
    return {
      cle, libelle: c.libelle, valeur: t.valeur, points: t.miniCourbe, variation: v,
      texteVariation: v === null ? null : variationEnClair(v, c.stat.mesure), evaluation: evaluationVariation(v, c.stat.sens),
    }
  })
}

// ─────────────────────────── courbe de la note ───────────────────────────

/** La Courbe de la note porte sur tes 20 dernières parties de compétition notées. */
export const PARTIES_COURBE_NOTE = 20
/** Sous 10 parties notées, ni titre ni écart. */
export const MIN_PARTIES_ECART_NOTE = 10

/** Une mention de Valorant (`performance.ratings.grade`) : mérite ou distinction ; « pass » n'en est pas une. */
export type Mention = "merite" | "distinction"

/** La mention d'une partie, telle que Valorant la donne (`merit`, `distinction`) ; null pour `pass`, sans mention, ou pour une partie importée. */
export function mentionDe(p: Partie): Mention | null {
  const g = typeof p.mention === "string" ? p.mention.toLowerCase() : null
  return g === "merit" ? "merite" : g === "distinction" ? "distinction" : null
}

/** Un point de la Courbe de la note : ta note (`valeur`), la moyenne de tes lobbys (`valeurLobby`), ta mention. */
export type PointNote = PointCourbe & { mention: Mention | null }

/** La bande des lobbys : centre, rapport des sommes de leurs notes ; demi-largeur, écart-type (n − 1) de leurs moyennes par partie ; ses parties. */
export type BandeLobbys = { centre: number; demiLargeur: number; parties: number }

/** Le titre de la Courbe de la note. */
export type TitreNote = "Tu progresses" | "Tu te maintiens" | "Tu baisses"







export type CourbeNote = {
  points: PointNote[]
  moyenne: number | null
  test: Test | null
  ecart: string | null
  titre: TitreNote | null
  bande: BandeLobbys | null
  merites: number
  distinctions: number
  phrase: string | null
}

/** Les parties de la Courbe de la note : tes 20 dernières parties de compétition notées, quel que soit le périmètre, parties refaites écartées ; la plus récente d'abord. */
export function partiesCourbeNote(historique: readonly Partie[]): Partie[] {
  const competition = selectionner(historique, { mode: "competition", periode: "tout" }, 0).parties
  return competition.filter((p) => fractions([p], NOTE.toi).length > 0).slice(0, PARTIES_COURBE_NOTE)
}

/** L'écart-type d'échantillon (n − 1), le s de l'erreur type du socle : √(Σ(xᵢ − x̄)² ÷ (n − 1)) ; null sous 2 valeurs. */
function ecartType(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  let somme = 0
  for (const x of xs) somme += x
  const moyenne = somme / xs.length
  let carres = 0
  for (const x of xs) carres += (x - moyenne) ** 2
  return Math.sqrt(carres / (xs.length - 1))
}

/** La bande des lobbys sur ces points : dès 5 parties dont tes lobbys ont une note (MIN_PARTIES_GROUPE) ; null sinon. */
function bandeLobbys(points: readonly PointCourbe[]): BandeLobbys | null {
  const lobbys = points.flatMap((x) => (x.lobby !== null && x.lobby.den > 0 ? [x.lobby] : []))
  if (lobbys.length < MIN_PARTIES_GROUPE) return null
  const centre = quotient(additionner(lobbys))
  const demiLargeur = ecartType(lobbys.map((f) => f.num / f.den))
  return centre === null || demiLargeur === null ? null : { centre, demiLargeur, parties: lobbys.length }
}


function mentionsDites(merites: number, distinctions: number): string | null {
  const m = merites > 0 ? `${nombreEnClair(merites, 0)} mérite${merites > 1 ? "s" : ""}` : null
  const d = distinctions > 0 ? `${nombreEnClair(distinctions, 0)} distinction${distinctions > 1 ? "s" : ""}` : null
  return m !== null && d !== null ? `${m} et ${d}` : m ?? d
}






function phraseNote(c: Omit<CourbeNote, "phrase">): string | null {
  const n = c.points.length
  if (n === 0 || c.moyenne === null) return null
  let texte = `Note de performance de Valorant sur ${n > 1 ? `tes ${nombreEnClair(n, 0)} dernières parties classées` : "ta dernière partie classée"}`
  if (c.test !== null) {
    const sens = !c.test.passe ? "stable" : c.test.ecart > 0 ? "en hausse" : "en baisse"
    texte += `, ${sens} : de ${valeurEnClair(c.test.ancien, NOTE.mesure)} à ${valeurEnClair(c.test.recent, NOTE.mesure)}`
  } else texte += ` : ${valeurEnClair(c.moyenne, NOTE.mesure)}${n > 1 ? " en moyenne" : ""}`
  if (c.bande !== null) texte += `, lobbys autour de ${valeurEnClair(c.bande.centre, NOTE.mesure)}`
  const mentions = mentionsDites(c.merites, c.distinctions)
  return `${texte}${mentions === null ? "" : `, ${mentions}`}.`
}

/**
 * La Courbe de la note de la Vue d'ensemble, sur tout l'historique (EXPERIENCE.md, Courbe de la note ; Note officielle
 * absente) : tes notes et leurs mentions, la plus ancienne d'abord ; dès 10 parties, l'écart de la moyenne des ⌊n ÷ 2⌋
 * dernières à celle des ⌊n ÷ 2⌋ premières, et le titre par son test (testerEcart) : « Tu progresses » ou « Tu baisses »
 * s'il passe, sinon « Tu te maintiens » ; la bande des lobbys ; la phrase VoiceOver.
 */
export function courbeNote(historique: readonly Partie[]): CourbeNote {
  const parties = partiesCourbeNote(historique)
  const anciennes = [...parties].reverse()
  const points: PointNote[] = pointsParPartie(parties, NOTE).map((x, i) => ({ ...x, mention: mentionDe(anciennes[i]) }))
  const n = points.length
  const moitie = Math.floor(n / 2)
  const notes = (xs: readonly PointNote[]) => xs.map((x) => x.toi)
  const test = n < MIN_PARTIES_ECART_NOTE ? null : testerEcart(notes(points.slice(n - moitie)), notes(points.slice(0, moitie)), NOTE.mesure)
  const bande = bandeLobbys(points)
  const sansPhrase: Omit<CourbeNote, "phrase"> = {
    // Sans bande (moins de 5 parties dont tes lobbys ont une note), aucun point de lobby ne se montre, comme dans courbe().
    points: bande === null ? points.map((x) => ({ ...x, lobby: null, valeurLobby: null })) : points,
    moyenne: quotient(additionner(notes(points))),
    test,
    ecart: test === null ? null : ecartEcrit(test.recent, test.ancien, ECRITURE_NOTE),
    titre: test === null ? null : !test.passe ? "Tu te maintiens" : test.ecart > 0 ? "Tu progresses" : "Tu baisses",
    bande,
    merites: points.filter((x) => x.mention === "merite").length,
    distinctions: points.filter((x) => x.mention === "distinction").length,
  }
  return { ...sansPhrase, phrase: phraseNote(sansPhrase) }
}

// ─────────────────────────── tendances ───────────────────────────

/** Les clés des Tendances : les stats d'Évolution, puis 1ᵉʳˢ kills, Clutchs, Écos gagnées, Retakes. */
export type CleTendance = CleEvolution | "premiersKills" | "clutchs" | "ecos" | "retakes"


export type LigneTendance = { cle: CleTendance; libelle: string; sens: "hausse" | "baisse"; test: Test; ecart: string }

/** Les stats des Tendances, dans l'ordre de la maquette : Note, les autres stats d'Évolution, puis 1ᵉʳˢ kills, Clutchs, Écos gagnées, Retakes. */
const TENDANCES: readonly { cle: CleTendance; libelle: string; stat: Stat }[] = [
  ...STATS_EVOLUTION.map((e) => ({ cle: e.cle, libelle: e.libelle, stat: e.stat })),
  { cle: "premiersKills", libelle: "1\u1d49\u02b3\u02e2 kills", stat: PREMIERS_KILLS },
  { cle: "clutchs", libelle: "Clutchs", stat: CLUTCHS },
  { cle: "ecos", libelle: "Écos gagnées", stat: ECOS_GAGNEES },
  { cle: "retakes", libelle: "Retakes", stat: RETAKES },
]

/**
 * Les Tendances (EXPERIENCE.md, Tendances) : par le test du socle (tendance), tes 10 dernières parties lisibles du
 * périmètre contre les 10 précédentes, dès 20 ; ligne Note : les 20 parties de la Courbe de la note, quel que soit le
 * périmètre ; lignes stables omises ; dans l'ordre de la maquette.
 */
export function tendances(sel: Selection, historique: readonly Partie[]): LigneTendance[] {
  const note: Selection = { perimetre: { mode: "competition", periode: "tout" }, parties: partiesCourbeNote(historique), precedentes: null }
  const lignes: LigneTendance[] = []
  for (const d of TENDANCES) {
    const t = tendance(d.cle === "note" ? note : sel, d.stat)
    if (t === null || t.sens === "stable") continue
    lignes.push({ cle: d.cle, libelle: d.libelle, sens: t.sens, test: t.test, ecart: variationEnClair(t.test, mesureEcrite(d.stat)) })
  }
  return lignes
}

// ═══════════════════════ rang, RR, groupe et heures (entrée 5) ═══════════════════════
//
// Ton niveau réel (rang et RR actuels, RR de ta dernière partie classée, rang max et son acte, rangs moyens de tes alliés et
// de tes adversaires), l'Escalier du rang (rang de fin de chaque acte depuis E8 A1, trois actes repères et leurs victoires),
// les Barres de RR (tes 20 dernières parties classées dont le RR est connu), Seul ou en duo et Quand tu joues le mieux
// (tranches horaires, sessions, après une défaite ou une victoire), avec les phrases VoiceOver de Ton niveau réel, de
// l'Escalier et des Barres de RR (EXPERIENCE.md, Component Patterns : Escalier du rang, Barres de RR, Jauge de RR ; State
// Patterns : RR absent, Pas encore classé, Trop peu de parties ; Définitions des métriques : Évaluation, Rang et RR, Rang acte
// par acte, Rangs moyens, Seul ou en duo, Quand tu joues le mieux ; Accessibility Floor). Le rang et la table du RR sont ceux
// de rang.json et rr.json (historique.ts : Rang, LigneRr) ; l'Escalier et les Barres de RR portent sur tout l'historique,
// quel que soit le périmètre. L'outil de concordance compare à tracker.gg les rangs moyens et le groupe de chaque partie, les
// victoires des actes et le palier du rang max.

// ─────────────────────────── paliers et actes ───────────────────────────

/** Les paliers de rang par numéro (`tier.id` de HenrikDev, `tierId` de tracker.gg) : 3 = Fer 1, 15 = Platine 1, 27 = Radiant. */
export const PALIER_MIN = 3
export const PALIER_MAX = 27
const NOMS_PALIERS: readonly string[] = ["Fer", "Bronze", "Argent", "Or", "Platine", "Diamant", "Ascendant", "Immortel"]





export function nomDuPalier(id: number | null | undefined): string | null {
  if (id == null || !Number.isInteger(id) || id < PALIER_MIN || id > PALIER_MAX) return null
  if (id === PALIER_MAX) return "Radiant"
  const k = id - PALIER_MIN
  return `${NOMS_PALIERS[Math.floor(k / 3)]} ${(k % 3) + 1}`
}


export type ActeEnClair = { episode: number; numero: number; libelle: string; parle: string }

/** L'acte d'un nom court de HenrikDev (`e11a5`) ; null pour un nom d'une autre forme, ou sans nom. */
export function acteEnClair(court: string | null | undefined): ActeEnClair | null {
  const m = typeof court === "string" ? NOM_ACTE.exec(court) : null
  if (m === null) return null
  const episode = Number(m[1]), numero = Number(m[2])
  return { episode, numero, libelle: `E${episode} A${numero}`, parle: `épisode ${episode} acte ${numero}` }
}

/** L'acte `a` vient-il avant l'acte `b` ? */
function acteAvant(a: ActeEnClair, b: ActeEnClair): boolean {
  return a.episode < b.episode || (a.episode === b.episode && a.numero < b.numero)
}


const RR_MESURE: Mesure = { genre: "nombre", decimales: 0, variation: "absolue" }


export function rrEnClair(rr: number): string {
  return `${ecartEnClair(rr, RR_MESURE)}${NBSP}RR`
}

// ─────────────────────────── liste par catégorie ───────────────────────────

/** Liste par catégorie sans autre référence (Évaluation) : un pourcentage est bleu dès 55 % écrits, orange sous 45 %. */
export const PART_FORTE = 55
export const PART_FAIBLE = 45

/**
 * La couleur d'une valeur d'une liste par catégorie sans autre référence (EXPERIENCE.md, Évaluation : cartes, heures, groupes,
 * agents adverses), selon le sens de la stat : un pourcentage, par sa valeur écrite, bleu dès 55 %, orange sous 45 %, neutre
 * entre ; un ratio ou une valeur, face à ta propre moyenne `moyenne`, au seuil de l'Évaluation (evaluer) ; sans valeur, ou de
 * sens neutre : neutre.
 */
export function evaluationCategorie(valeur: number | null, moyenne: number | null, mesure: Mesure, sens: Sens): Evaluation {
  if (valeur === null || sens === "neutre") return "neutre"
  if (mesure.genre !== "pourcentage") return evaluer(valeur, moyenne, mesure, sens)
  const ecrit = unites(valeur, 2)
  const haute = ecrit >= PART_FORTE, basse = ecrit < PART_FAIBLE
  if (!haute && !basse) return "neutre"
  return haute === (sens === "haut") ? "fort" : "faible"
}

/**
 * Une valeur d'une liste par catégorie : la valeur (null : « — », sous son effectif minimal ou sans dénominateur), ses
 * parties, son texte (valeurEnClair) et sa couleur (evaluationCategorie, neutre sans valeur).
 */
export type ValeurCategorie = { valeur: number | null; parties: number; texte: string; evaluation: Evaluation }

/** Des sommes en valeur d'une liste par catégorie : écrite dès `minimum` parties, colorée face à `moyenne`. */
function enCategorie(s: Sommes, mesure: Mesure, sens: Sens, moyenne: number | null, minimum: number): ValeurCategorie {
  const valeur = s.parties >= minimum ? quotient(s) : null
  return { valeur, parties: s.parties, texte: valeurEnClair(valeur, mesure), evaluation: evaluationCategorie(valeur, moyenne, mesure, sens) }
}

/** Une stat sur des parties (files admises, données lisibles), en valeur d'une liste par catégorie. */
function statEnCategorie(parties: readonly Partie[], stat: Stat, moyenne: number | null, minimum: number): ValeurCategorie {
  return enCategorie(sommer(retenues(parties, stat.files), stat.toi), stat.mesure, stat.sens, moyenne, minimum)
}

/**
 * La part d'une catégorie (Trop peu de parties) : en pourcentage, coloré, dès 5 occurrences ; « x sur y » en dessous, « — »
 * sans aucune, sans couleur (partEnClair).
 */
function partEnCategorie(parties: readonly Partie[], stat: Stat): ValeurCategorie {
  const s = sommer(retenues(parties, stat.files), stat.toi)
  const valeur = s.den >= MIN_OCCURRENCES ? quotient(s) : null
  return { valeur, parties: s.parties, texte: partEnClair(s.num, s.den), evaluation: evaluationCategorie(valeur, null, stat.mesure, stat.sens) }
}

/** Une stat sur tout le périmètre : ta propre moyenne, référence d'une liste par catégorie. */
function moyenneDu(sel: Selection, stat: Stat): number | null {
  return quotient(sommer(retenues(sel.parties, stat.files), stat.toi))
}

// ─────────────────────────── ton niveau réel ───────────────────────────

/** Sans rang actuel (compte non classé, placements, début d'épisode) : ce texte à la place du rang, sans Jauge de RR (State Patterns). */
export const PAS_ENCORE_CLASSE = "Pas encore classé"

/** Un rang moyen : le palier arrondi, son nom, et les parties dont le groupe a des rangs. */
export type RangMoyen = { palier: number; rang: string; parties: number }

/**
 * Le palier moyen de rangs gardés, somme et effectif des `tier.id` dès 3 (EXPERIENCE.md, Rangs moyens) : arrondi à la division
 * la plus proche, demi vers le haut (14,5 : Platine 1) ; null sans effectif, ou hors des paliers.
 */
export function palierMoyen(rangs: Somme | null | undefined): number | null {
  if (rangs == null) return null
  // Sans effectif, le quotient n'est pas un entier (NaN, Infinity) : aucun palier.
  const palier = Math.round(rangs.somme / rangs.effectif)
  return nomDuPalier(palier) === null ? null : palier
}

/**
 * Le rang moyen d'un groupe (`rangsAllies`, `rangsAdversaires`) sur les parties de compétition : rapport des sommes, puis
 * palierMoyen ; seulement s'il agrège au moins 5 parties (Confidentialité), null sinon.
 */
function rangMoyen(parties: readonly Partie[], lire: (p: Partie) => Somme | null): RangMoyen | null {
  let somme = 0, effectif = 0, n = 0
  for (const p of retenues(parties, "competition")) {
    const r = lire(p)
    if (r == null) continue
    somme += r.somme
    effectif += r.effectif
    n++
  }
  const palier = n < MIN_PARTIES_GROUPE ? null : palierMoyen({ somme, effectif })
  return palier === null ? null : { palier, rang: nomDuPalier(palier)!, parties: n }
}

/** Le rang max (`peak`) : son palier, son nom et son acte, celui que donne HenrikDev (le premier où il est atteint). */
export type RangMax = { palier: number; rang: string; acte: ActeEnClair | null }

/**
 * Ton niveau réel (Vue d'ensemble) : classé si ton rang actuel va de Fer 1 à Radiant, sinon « Pas encore classé », sans RR ni
 * RR de la dernière partie ; ton rang max, même non classé ; les rangs moyens de tes alliés et de tes adversaires sur le
 * périmètre ; la phrase VoiceOver.
 */
export type NiveauReel = {
  classe: boolean
  /** Ton palier actuel ; null sans rang. */
  palier: number | null

  rang: string
  /** Ton RR dans le palier (Jauge de RR, sur 100) ; null sans rang ou sans RR. */
  rr: number | null
  /** Le RR de ta dernière partie classée, signé (`current.last_change`) ; null sans rang. */
  derniere: number | null

  texteDerniere: string | null
  max: RangMax | null
  allies: RangMoyen | null
  adversaires: RangMoyen | null
  /**
   * Ticket 4.52 : tes boucliers de rang (mmr v3 `current.rank_protection_shields`), seulement classé et quand ton palier est
   * protégé (`is_at_rank_protected_tier` vrai) ; null sinon (rang.json d'avant compris). Hors de `phrase` (le récap la reprend) :
   * l'écran les dit (bouclierDit).
   */
  boucliers: number | null
  /** La phrase VoiceOver (Accessibility Floor). */
  phrase: string
}


export function bouclierDit(n: number | null): string | null {
  if (n === null || !Number.isInteger(n) || n < 0) return null
  return n === 0 ? "aucun bouclier de rang" : `${nombreEnClair(n, 0)} bouclier${n > 1 ? "s" : ""} de rang`
}


function rangsMoyensDits(allies: RangMoyen | null, adversaires: RangMoyen | null): string | null {
  const dits: string[] = []
  if (allies !== null) dits.push(`de tes alliés ${allies.rang}`)
  if (adversaires !== null) dits.push(`de tes adversaires ${adversaires.rang}`)
  return dits.length === 0 ? null : `rang moyen ${dits.join(", ")}`
}






function phraseNiveau(n: Omit<NiveauReel, "phrase">): string {
  let texte = n.rang
  if (n.rr !== null) texte += `, ${nombreEnClair(n.rr, 0)}${NBSP}RR${n.rr <= 100 ? " sur 100" : ""}`
  if (n.derniere !== null) texte += `, ${n.derniere > 0 ? "plus " : n.derniere < 0 ? "moins " : ""}${nombreEnClair(Math.abs(n.derniere), 0)} à la dernière partie`
  const suite: string[] = []
  if (n.max !== null) suite.push(`rang max ${n.max.rang}${n.max.acte === null ? "" : `, ${n.max.acte.parle}`}`)
  const moyens = rangsMoyensDits(n.allies, n.adversaires)
  if (moyens !== null) suite.push(moyens)
  return `${texte}${suite.length === 0 ? "" : ` ; ${suite.join(" ; ")}`}.`
}

/** Ton niveau réel, depuis ton rang gardé (rang.json ; null sans lui) et les parties de compétition du périmètre (rangs moyens). */
export function niveauReel(rang: Rang | null, sel: Selection): NiveauReel {
  const actuel = rang?.current ?? null
  const palier = actuel?.tier?.id ?? null
  const nom = nomDuPalier(palier)
  const derniere = nom === null ? null : actuel?.last_change ?? null
  const pic = rang?.peak ?? null
  const nomMax = nomDuPalier(pic?.tier?.id)
  const boucliers = actuel?.rank_protection_shields
  const sansPhrase: Omit<NiveauReel, "phrase"> = {
    boucliers: nom !== null && actuel?.is_at_rank_protected_tier === true && typeof boucliers === "number" && Number.isInteger(boucliers) && boucliers >= 0
      ? boucliers : null,
    classe: nom !== null,
    palier: nom === null ? null : palier,
    rang: nom ?? PAS_ENCORE_CLASSE,
    rr: nom === null ? null : actuel?.rr ?? null,
    derniere,
    texteDerniere: derniere === null ? null : rrEnClair(derniere),
    max: nomMax === null ? null : { palier: pic!.tier!.id, rang: nomMax, acte: acteEnClair(pic!.season.short) },
    allies: rangMoyen(sel.parties, (p) => p.rangsAllies),
    adversaires: rangMoyen(sel.parties, (p) => p.rangsAdversaires),
  }
  return { ...sansPhrase, phrase: phraseNiveau(sansPhrase) }
}

// ─────────────────────────── escalier du rang ───────────────────────────


export const PREMIER_EPISODE_ESCALIER = 8

/**
 * Une marche de l'Escalier : son acte (nom court en minuscules, en clair, dit), son palier de fin d'acte, ou ton rang actuel
 * pour l'acte en cours (null : marche vide, aucune partie ou aucun rang, le nom de l'acte gardé sur l'axe), et ses victoires
 * (`wins_with_placements`) sur ses parties (`games`), null quand HenrikDev ne les donne pas.
 */
export type MarcheEscalier = {
  acte: string
  libelle: string
  parle: string
  palier: number | null
  rang: string | null
  enCours: boolean
  victoires: number | null
  parties: number | null
}

/** Les trois actes repères, sous l'Escalier. */
export type RoleRepere = "meilleur" | "precedent" | "enCours"





export type ActeRepere = { role: RoleRepere; marche: MarcheEscalier; victoires: string | null; dates: string | null; datesDites: string | null }

const MOIS_ACTE_DITS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


function jourUtc(iso: string): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const j = d.getUTCDate()
  return `${j === 1 ? "1er" : j} ${MOIS_ACTE_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}





function datesDeLActe(id: string | null | undefined, saisons: SectionSaisons | null | undefined): { ecrit: string; dit: string } | null {
  if (!id || !saisons) return null
  const x = saisons[id.toLowerCase()]
  if (!x) return null
  const debut = jourUtc(x.debut), fin = jourUtc(x.fin)
  if (debut === null || fin === null) return null
  const tenu = (s: string) => s.split(" ").join(NBSP)
  return { ecrit: `Du ${tenu(debut)} au ${tenu(fin)}`, dit: `du ${debut} au ${fin}` }
}

/** L'Escalier du rang : ses marches, de la plus ancienne à la plus récente ; ses actes repères, dans l'ordre meilleur, précédent, en cours ; la phrase VoiceOver, null sans marche. */
export type Escalier = { marches: MarcheEscalier[]; reperes: ActeRepere[]; phrase: string | null }

const LIBELLES_REPERE: Readonly<Record<RoleRepere, string>> = { meilleur: "meilleur acte", precedent: "acte précédent", enCours: "acte en cours" }


function victoiresEnClair(m: MarcheEscalier): string | null {
  if (m.parties === null || m.victoires === null) return null
  if (m.parties === 0) return "aucune partie"
  return `${nombreEnClair(m.victoires, 0)} victoire${m.victoires > 1 ? "s" : ""} sur ${nombreEnClair(m.parties, 0)}`
}


function dePalier(nom: string): string {
  return /^[AEIOU]/.test(nom) ? `d'${nom}` : `de ${nom}`
}







function phraseEscalier(marches: readonly MarcheEscalier[], reperes: readonly ActeRepere[]): string | null {
  if (marches.length === 0) return null
  const classees = marches.filter((m) => m.rang !== null)
  const etendue = classees.length === 0 ? "aucun acte classé"
    : classees.length === 1 ? `${classees[0].rang}` : `${dePalier(classees[0].rang!)} à ${classees[classees.length - 1].rang}`
  let texte = `Ton rang acte par acte, ${nombreEnClair(marches.length, 0)} acte${marches.length > 1 ? "s" : ""} depuis l'${marches[0].parle} : ${etendue}`
  for (const r of reperes) {
    texte += ` ; ${LIBELLES_REPERE[r.role]} ${r.marche.rang ?? "sans rang"}, ${r.marche.parle}${r.victoires === null ? "" : `, ${r.victoires}`}`
    if (r.datesDites !== null) texte += `, ${r.datesDites}`
  }
  return `${texte}.`
}

/**
 * L'Escalier du rang (Component Patterns ; Définitions des métriques, Rang acte par acte), sur tout l'historique : une marche
 * par acte de `seasonal[]` nommé `eNaM` depuis l'épisode 8, de la plus ancienne à la plus récente, un acte vu deux fois gardé
 * une fois ; palier de fin d'acte (`end_tier`) dès une partie (`games` > 0) et de Fer 1 à Radiant, sinon marche vide ; acte en
 * cours : celui de ta partie la plus récente (acteEnCours), au rang actuel (`current.tier`). Actes repères, ceux qui existent :
 * le meilleur (palier le plus haut hors acte en cours et acte précédent, pour ne jamais montrer deux fois le même acte, le plus
 * récent à égalité), l'acte précédent (la dernière marche d'un acte antérieur à l'acte en cours) et l'acte en cours.
 */
export function escalierDuRang(rang: Rang | null, historique: readonly Partie[], saisons: SectionSaisons | null = null): Escalier {
  // Ticket 4.52 : l'id de chaque acte (son nom court → l'UUID de `/v1/seasons`), de rang.json, sinon des parties gardées.
  const idDe = new Map<string, string>()
  for (const p of historique) if (p.saison && typeof p.saison.short === "string" && typeof p.saison.id === "string") idDe.set(p.saison.short.toLowerCase(), p.saison.id)
  for (const a of rang?.seasonal ?? []) if (typeof a.season.short === "string" && typeof a.season.id === "string" && a.season.id !== "") idDe.set(a.season.short.toLowerCase(), a.season.id)
  const lus: { a: ActeEnClair; acte: Acte }[] = []
  const vus = new Set<string>()
  for (const acte of rang?.seasonal ?? []) {
    const a = acteEnClair(acte.season.short)
    if (a === null || a.episode < PREMIER_EPISODE_ESCALIER || vus.has(a.libelle)) continue
    vus.add(a.libelle)
    lus.push({ a, acte })
  }
  lus.sort((x, y) => x.a.episode - y.a.episode || x.a.numero - y.a.numero)
  const courant = acteEnClair(acteEnCours(historique.filter((p) => !partieRefaite(p)))?.short)
  const marches: MarcheEscalier[] = lus.map(({ a, acte }) => {
    const enCours = courant !== null && a.libelle === courant.libelle
    const fin = enCours ? rang?.current.tier?.id ?? null : acte.games !== null && acte.games > 0 ? acte.end_tier?.id ?? null : null
    const nom = nomDuPalier(fin)
    return {
      acte: `e${a.episode}a${a.numero}`, libelle: a.libelle, parle: a.parle, palier: nom === null ? null : fin, rang: nom, enCours,
      victoires: acte.wins_with_placements, parties: acte.games,
    }
  })
  const iCours = marches.findIndex((m) => m.enCours)
  let iPrecedent = -1
  if (courant !== null) lus.forEach((x, i) => { if (acteAvant(x.a, courant)) iPrecedent = i })
  let iMeilleur = -1
  marches.forEach((m, i) => {
    if (i === iCours || i === iPrecedent || m.palier === null) return
    if (iMeilleur < 0 || m.palier >= marches[iMeilleur].palier!) iMeilleur = i
  })
  const reperes: ActeRepere[] = []
  const repere = (role: RoleRepere, i: number) => {
    if (i < 0) return
    const dates = datesDeLActe(idDe.get(marches[i].acte), saisons)
    reperes.push({ role, marche: marches[i], victoires: victoiresEnClair(marches[i]), dates: dates?.ecrit ?? null, datesDites: dates?.dit ?? null })
  }
  repere("meilleur", iMeilleur)
  repere("precedent", iPrecedent)
  repere("enCours", iCours)
  return { marches, reperes, phrase: phraseEscalier(marches, reperes) }
}

// ─────────────────────────── barres de RR ───────────────────────────

/** Les Barres de RR portent sur tes 20 dernières parties classées dont le RR est connu (HenrikDev n'en rend pas plus). */
export const PARTIES_BARRES_RR = 20

/**
 * Une Barre de RR : le début de sa partie, son RR (`last_change` tel quel, bonus et pénalités compris), son résultat, placement
 * ou non, et le RR remboursé qu'elle signale (`refunded_rr`, jamais ajouté) ; null sans remboursement.
 */
export type BarreRr = { debut: string; rr: number; resultat: Resultat | null; placement: boolean; rembourse: number | null }

/**
 * Les Barres de RR : une barre par partie, la plus ancienne d'abord ; leur total, leurs gains et leurs pertes (par le signe) ;
 * les moyennes par victoire et par défaite, placements et nuls exclus (null sans victoire, sans défaite) ; le RR remboursé de
 * ces parties, signalé, hors du total ; leurs textes ; la phrase VoiceOver, null sans barre.
 */
export type BarresRr = {
  barres: BarreRr[]
  total: number
  gains: number
  pertes: number
  parVictoire: number | null
  parDefaite: number | null
  rembourse: number

  texteTotal: string | null

  texteParVictoire: string | null
  texteParDefaite: string | null
  phrase: string | null
}


function compteDit(n: number, nom: string): string {
  return `${nombreEnClair(n, 0)} ${nom}${n > 1 ? "s" : ""}`
}






function phraseRr(b: Omit<BarresRr, "phrase">): string | null {
  const n = b.barres.length
  if (n === 0) return null
  let texte = `${n > 1 ? `${nombreEnClair(n, 0)} dernières parties classées` : "Ta dernière partie classée"} : ${b.texteTotal}, ${compteDit(b.gains, "gain")}, ${compteDit(b.pertes, "perte")}`
  const moyennes: string[] = []
  if (b.texteParVictoire !== null) moyennes.push(`${b.texteParVictoire} par victoire`)
  if (b.texteParDefaite !== null) moyennes.push(`${b.texteParDefaite} par défaite`)
  if (moyennes.length > 0) texte += ` ; ${moyennes.join(", ")}`
  if (b.rembourse > 0) texte += ` ; ${nombreEnClair(b.rembourse, 0)}${NBSP}RR remboursé${b.rembourse > 1 ? "s" : ""}, hors du total`
  return `${texte}.`
}






export function barresRr(historique: readonly Partie[], rr: readonly LigneRr[]): BarresRr {
  const lignes = new Map<string, LigneRr>()
  for (const l of rr) {
    if (typeof l !== "object" || l === null || typeof l.matchId !== "string") continue
    const cle = l.matchId.toLowerCase()
    if (!lignes.has(cle)) lignes.set(cle, l)
  }
  const barres: BarreRr[] = []
  for (const p of selectionner(historique, { mode: "competition", periode: "tout" }, 0).parties) {
    if (barres.length === PARTIES_BARRES_RR) break
    const l = lignes.get(p.matchId.toLowerCase())
    if (l === undefined || typeof l.last_change !== "number" || !Number.isFinite(l.last_change)) continue
    const rembourse = typeof l.refunded_rr === "number" && l.refunded_rr > 0 ? l.refunded_rr : null
    barres.push({ debut: p.debut, rr: l.last_change, resultat: p.resultat, placement: l.is_placement_match === true, rembourse })
  }
  barres.reverse()
  let total = 0, gains = 0, pertes = 0, rembourse = 0
  const victoires: Fraction = { num: 0, den: 0 }, defaites: Fraction = { num: 0, den: 0 }
  for (const b of barres) {
    total += b.rr
    if (b.rr > 0) gains++
    if (b.rr < 0) pertes++
    rembourse += b.rembourse ?? 0
    // Placements et nuls : ni dans la moyenne par victoire, ni dans celle par défaite.
    const f = b.placement ? null : b.resultat === "victoire" ? victoires : b.resultat === "defaite" ? defaites : null
    if (f !== null) {
      f.num += b.rr
      f.den++
    }
  }
  const parVictoire = quotient(victoires), parDefaite = quotient(defaites)
  const sansPhrase: Omit<BarresRr, "phrase"> = {
    barres, total, gains, pertes, parVictoire, parDefaite, rembourse,
    texteTotal: barres.length === 0 ? null : rrEnClair(total),
    texteParVictoire: parVictoire === null ? null : ecartEnClair(parVictoire, RR_MESURE),
    texteParDefaite: parDefaite === null ? null : ecartEnClair(parDefaite, RR_MESURE),
  }
  return { ...sansPhrase, phrase: phraseRr(sansPhrase) }
}

// ─────────────────────────── seul ou en duo ───────────────────────────

/** Les trois catégories de Seul ou en duo : seul, en duo, en groupe de 3 et plus. */
export type CleGroupe = "seul" | "duo" | "groupe"
export const LIBELLES_GROUPE: Readonly<Record<CleGroupe, string>> = { seul: "Seul", duo: "En duo", groupe: "Groupe de 3 et plus" }
/** La barre du groupe de 3 et plus apparaît dès 3 parties. */
export const MIN_PARTIES_GROUPE_DE_3 = 3

/** La catégorie d'une taille de groupe, toi compris (`Partie.groupe`) : 1 seul, 2 duo, 3 et plus ; null sans taille lisible. */
export function categorieDeGroupe(taille: number | null | undefined): CleGroupe | null {
  if (taille == null || !Number.isInteger(taille) || taille < 1) return null
  return taille === 1 ? "seul" : taille === 2 ? "duo" : "groupe"
}





export type BarreGroupe = { cle: CleGroupe; libelle: string; victoires: ValeurCategorie; kd: ValeurCategorie }

/**
 * Seul ou en duo (Définitions des métriques), sur le périmètre : seul et en duo toujours, le groupe de 3 et plus dès 3 parties de
 * ses victoires ; chaque valeur sous son seuil (Trop peu de parties) : tes victoires en pourcentage dès 5 parties, « x sur y »
 * en dessous, ton K/D dès 5 parties, « — » en dessous, sans couleur ; couleur d'une liste par catégorie : tes victoires par leur
 * part écrite (55 %, 45 %), ton K/D face à ton K/D du périmètre.
 */
export function seulOuEnDuo(sel: Selection): BarreGroupe[] {
  const kd = moyenneDu(sel, KD)
  const barres: BarreGroupe[] = []
  for (const cle of ["seul", "duo", "groupe"] as const) {
    const parties = sel.parties.filter((p) => categorieDeGroupe(p.groupe) === cle)
    const victoires = partEnCategorie(parties, VICTOIRES)
    if (cle === "groupe" && victoires.parties < MIN_PARTIES_GROUPE_DE_3) continue
    barres.push({ cle, libelle: LIBELLES_GROUPE[cle], victoires, kd: statEnCategorie(parties, KD, kd, MIN_OCCURRENCES) })
  }
  return barres
}

// ─────────────────────────── quand tu joues le mieux ───────────────────────────

/** Quand tu joues le mieux : chaque valeur dès 5 parties (Trop peu de parties). */
export const MIN_PARTIES_HEURES = 5
/** Session : chaque partie commence moins de 60 min après la fin de la précédente. */
export const ECART_SESSION_MS = 3_600_000
/** Dans une session : les parties 1 à 3 contre la 4ᵉ et les suivantes. */
export const PARTIES_DEBUT_SESSION = 3


const DEMI_CADRATIN = String.fromCharCode(0x2013)

/** Les tranches horaires, en heure locale au début de la partie (Définitions des métriques), dans leur ordre. */
export type CleTranche = "6-14" | "14-18" | "18-21" | "21-24" | "0-6"
const TRANCHES: readonly { cle: CleTranche; de: number; a: number; libelle: string }[] = [
  { cle: "6-14", de: 6, a: 14, libelle: `6${NBSP}h ${DEMI_CADRATIN} 14${NBSP}h` },
  { cle: "14-18", de: 14, a: 18, libelle: `14${NBSP}h ${DEMI_CADRATIN} 18${NBSP}h` },
  { cle: "18-21", de: 18, a: 21, libelle: `18${NBSP}h ${DEMI_CADRATIN} 21${NBSP}h` },
  { cle: "21-24", de: 21, a: 24, libelle: `21${NBSP}h ${DEMI_CADRATIN} minuit` },
  { cle: "0-6", de: 0, a: 6, libelle: `minuit ${DEMI_CADRATIN} 6${NBSP}h` },
]

/** Ticket 4.41 : la tranche de chaque partie tenue, gardée (Quand tu joues le mieux et les constats la demandent par tranche). */
const TRANCHES_LUES = new WeakMap<Partie, CleTranche | null>()

/** La tranche horaire d'une partie, à l'heure locale de l'iPhone au début de la partie ; null pour un début illisible. */
export function trancheDe(p: Partie): CleTranche | null {
  const deja = TRANCHES_LUES.get(p)
  if (deja !== undefined) return deja
  const t = Date.parse(p.debut)
  let cle: CleTranche | null = null
  if (!Number.isNaN(t)) {
    const h = new Date(t).getHours()
    cle = TRANCHES.find((x) => h >= x.de && h < x.a)!.cle
  }
  TRANCHES_LUES.set(p, cle)
  return cle
}

/** La place d'une partie dans tes sessions : le numéro de sa session, de la plus ancienne, et son rang dans la session, de 1. */
export type PlaceSession = { session: number; rang: number }

/**
 * Tes sessions (Définitions des métriques, Quand tu joues le mieux), sur tout l'historique : parties de toutes files, refaites
 * écartées, de la plus ancienne à la plus récente ; une partie qui commence moins de 60 min après la fin de la précédente (son
 * début plus sa durée) reste dans sa session, à minuit aussi. Par matchId.
 */
export function sessions(historique: readonly Partie[]): ReadonlyMap<string, PlaceSession> {
  const deja = SESSIONS_LUES.get(historique)
  if (deja !== undefined) return deja
  const places = sessionsDe(historique)
  SESSIONS_LUES.set(historique, places)
  return places
}

/** Ticket 4.41 : les sessions de chaque historique tenu (la liste même), gardées ; à ne lire que par `get` et `has`. */
const SESSIONS_LUES = new WeakMap<readonly Partie[], ReadonlyMap<string, PlaceSession>>()

/** Le calcul de sessions(). */
function sessionsDe(historique: readonly Partie[]): Map<string, PlaceSession> {
  const parties = historique.filter((p) => !partieRefaite(p) && !Number.isNaN(Date.parse(p.debut))).sort((a, b) => plusRecenteDabord(b, a))
  const places = new Map<string, PlaceSession>()
  let session = 0, rang = 0, fin = -Infinity
  for (const p of parties) {
    const debut = Date.parse(p.debut)
    if (!(debut - fin < ECART_SESSION_MS)) {
      session++
      rang = 0
    }
    rang++
    places.set(p.matchId, { session, rang })
    fin = debut + (p.duree ?? 0)
  }
  return places
}


export type TrancheHoraire = { cle: CleTranche; libelle: string } & ValeurCategorie

/**
 * Quand tu joues le mieux : ton Score de combat par tranche horaire, sur le périmètre, une tranche sans partie lisible omise,
 * coloré face à ton Score du périmètre (`moyenne`) ; dans une session, ton Score des parties 1 à 3 (`premieres`) contre la 4ᵉ
 * et les suivantes (`suivantes`, colorées face à celles-là) et leur écart relatif ; après une défaite et après une victoire, ta
 * part de victoires à la partie suivante du périmètre dans la même session, nuls exclus. Chaque valeur dès 5 parties, sinon « — ».
 */
export type QuandTuJoues = {
  tranches: TrancheHoraire[]
  moyenne: number | null
  premieres: ValeurCategorie
  suivantes: ValeurCategorie
  /** Écart relatif des 4ᵉ et suivantes aux parties 1 à 3 (−0,15) ; null sans les deux valeurs. */
  ecartSession: number | null

  texteEcartSession: string | null
  apresDefaite: ValeurCategorie
  apresVictoire: ValeurCategorie
}


export const ECRITURE_SESSION: Ecriture = { ...ecritureDe(SCORE.mesure), ecart: (u, base) => (base === 0 ? TIRET : relatifEnClair(u / Math.abs(base))) }

/** Quand tu joues le mieux sur le périmètre ; `historique` : tout l'historique, d'où viennent tes sessions (toutes files). */
export function quandTuJouesLeMieux(sel: Selection, historique: readonly Partie[]): QuandTuJoues {
  const moyenne = moyenneDu(sel, SCORE)
  const tranches: TrancheHoraire[] = []
  for (const t of TRANCHES) {
    const v = statEnCategorie(sel.parties.filter((p) => trancheDe(p) === t.cle), SCORE, moyenne, MIN_PARTIES_HEURES)
    if (v.parties > 0) tranches.push({ cle: t.cle, libelle: t.libelle, ...v })
  }
  const places = sessions(historique)
  const rangDe = (p: Partie) => places.get(p.matchId)?.rang ?? null
  const debutDeSession = (p: Partie, oui: boolean) => {
    const r = rangDe(p)
    return r !== null && (r <= PARTIES_DEBUT_SESSION) === oui
  }
  const premieres = statEnCategorie(sel.parties.filter((p) => debutDeSession(p, true)), SCORE, null, MIN_PARTIES_HEURES)
  const suivantes = statEnCategorie(sel.parties.filter((p) => debutDeSession(p, false)), SCORE, premieres.valeur, MIN_PARTIES_HEURES)
  const ecartSession = premieres.valeur === null || suivantes.valeur === null || premieres.valeur === 0
    ? null
    : (suivantes.valeur - premieres.valeur) / Math.abs(premieres.valeur)
  // Après une défaite, une victoire : chaque partie du périmètre (files de Victoires) et la suivante du périmètre dans sa session.
  const chrono = retenues(sel.parties, VICTOIRES.files).filter((p) => places.has(p.matchId)).reverse()
  const apres = { defaite: { num: 0, den: 0, parties: 0 }, victoire: { num: 0, den: 0, parties: 0 } }
  for (let i = 0; i + 1 < chrono.length; i++) {
    const p = chrono[i], suivante = chrono[i + 1]
    if (places.get(p.matchId)!.session !== places.get(suivante.matchId)!.session) continue
    if (p.resultat !== "defaite" && p.resultat !== "victoire") continue
    if (suivante.resultat !== "defaite" && suivante.resultat !== "victoire") continue
    const s = apres[p.resultat]
    s.den++
    s.parties++
    if (suivante.resultat === "victoire") s.num++
  }
  return {
    tranches, moyenne, premieres, suivantes, ecartSession,

    texteEcartSession: ecartSession === null || ECRITURE_SESSION.unites(premieres.valeur!) === 0 ? null : ecartEcrit(suivantes.valeur!, premieres.valeur!, ECRITURE_SESSION),
    apresDefaite: enCategorie(apres.defaite, POURCENTAGE, "haut", null, MIN_PARTIES_HEURES),
    apresVictoire: enCategorie(apres.victoire, POURCENTAGE, "haut", null, MIN_PARTIES_HEURES),
  }
}















// ─────────────────────────── rôles et agents joués ───────────────────────────

/** Les rôles de valorant-api (displayName anglais de la section `agents` du catalogue), en français, comme les nomme le jeu. */
const ROLES_EN_FRANCAIS: Readonly<Record<string, string>> = { Duelist: "Duelliste", Initiator: "Initiateur", Controller: "Contrôleur", Sentinel: "Sentinelle" }

/** Un rôle du catalogue en clair : « Sentinel » → « Sentinelle » ; un autre nom, tel quel ; null sans rôle. */
export function roleEnClair(role: string | null | undefined): string | null {
  if (typeof role !== "string" || role.trim() === "") return null
  return ROLES_EN_FRANCAIS[role.trim()] ?? role.trim()
}

/** Le rôle d'un agent dans la table du catalogue (id d'agent → rôle), l'id lu tel quel puis en minuscules, en clair ; null sans lui. */
export function roleDeLAgent(roles: Roles | null | undefined, id: string): string | null {
  if (roles == null || typeof roles !== "object") return null
  return roleEnClair(roles[id] ?? roles[id.toLowerCase()])
}

/** Un agent se reconnaît à son id, sans casse. */
function cleAgent(id: string): string {
  return id.toLowerCase()
}

/** L'agent d'une partie, s'il a un id. */
function agentDe(p: Partie): { id: string; name: string } | null {
  return p.agent != null && typeof p.agent.id === "string" && p.agent.id !== "" ? p.agent : null
}

/**
 * Ticket 4.41 : les parties d'un agent, et celles de tes autres agents, de chaque liste de parties, gardées par agent (les constats
 * et les comparaisons d'un agent les redemandent) ; listes rendues en lecture seule.
 */
const PARTIES_DE_L_AGENT = new WeakMap<readonly Partie[], Map<string, readonly Partie[]>>()
const PARTIES_DES_AUTRES = new WeakMap<readonly Partie[], Map<string, readonly Partie[]>>()

/** La liste gardée de `table` pour `parties` et `cle`, calculée par `calcul` à la première demande. */
function gardeeParCle(
  table: WeakMap<readonly Partie[], Map<string, readonly Partie[]>>, parties: readonly Partie[], cle: string, calcul: () => readonly Partie[],
): readonly Partie[] {
  let parCle = table.get(parties)
  if (parCle === undefined) {
    parCle = new Map()
    table.set(parties, parCle)
  }
  const deja = parCle.get(cle)
  if (deja !== undefined) return deja
  const r = calcul()
  parCle.set(cle, r)
  return r
}

/** Les parties jouées avec cet agent (id sans casse), dans leur ordre. */
function partiesDeLAgent(parties: readonly Partie[], id: string): readonly Partie[] {
  const cle = cleAgent(id)
  return gardeeParCle(PARTIES_DE_L_AGENT, parties, cle, () => parties.filter((p) => {
    const a = agentDe(p)
    return a !== null && cleAgent(a.id) === cle
  }))
}

/** Les parties jouées avec un autre agent que celui-ci (id sans casse ; parties sans agent écartées), dans leur ordre. */
function partiesDesAutresAgents(parties: readonly Partie[], id: string): readonly Partie[] {
  const cle = cleAgent(id)
  return gardeeParCle(PARTIES_DES_AUTRES, parties, cle, () => parties.filter((p) => {
    const a = agentDe(p)
    return a !== null && cleAgent(a.id) !== cle
  }))
}


export type AgentJoue = { id: string; nom: string; parties: number; libelle: string }

/** Les agents joués dans le périmètre, toutes files, du plus joué au moins joué, puis par nom ; le premier est le choix par défaut. */
export function agentsJoues(sel: Selection): AgentJoue[] {
  const vus = new Map<string, { id: string; nom: string; parties: number }>()
  for (const p of sel.parties) {
    const a = agentDe(p)
    if (a === null) continue
    const x = vus.get(cleAgent(a.id))
    if (x) x.parties++
    else vus.set(cleAgent(a.id), { id: a.id, nom: a.name || "?", parties: 1 })
  }
  return [...vus.values()]
    .sort((a, b) => b.parties - a.parties || a.nom.localeCompare(b.nom, "fr"))
    .map((a) => ({ ...a, libelle: effectifEnClair(a.nom, a.parties) }))
}

// ─────────────────────────── fiche d'un agent ───────────────────────────

/** Trop peu de parties : la fiche d'un agent dès 3 parties (« — » en dessous), avec la mention « peu de parties » sous 10. */
export const MIN_PARTIES_FICHE = 3
export const PARTIES_PEU = 10
export const PEU_DE_PARTIES = "peu de parties"


const ERS = String.fromCharCode(0x1d49, 0x02b3, 0x02e2)
const RES = String.fromCharCode(0x02b3, 0x1d49, 0x02e2)

/** Les clés des six Chiffres de la fiche et des premiers duels. */
export type CleChiffreAgent = "victoires" | "kd" | "score" | "degats" | "tete" | "note" | "premiersKills" | "premieresMorts" | "ratioPremiersDuels"

/**
 * Un chiffre d'un agent : sa clé, son libellé, sa valeur (null : « — », sous 3 parties de l'agent ou sans dénominateur), ses parties
 * retenues, son texte, et ses sommes, même sous le seuil (concordance, récap).
 */
export type ChiffreAgent = { cle: CleChiffreAgent; libelle: string; valeur: number | null; parties: number; texte: string; sommes: Sommes }

type DefChiffreAgent = { cle: CleChiffreAgent; libelle: string; stat: Stat }

/** Les six Chiffres de la fiche, dans l'ordre de la maquette ; la Note Valorant est ta moyenne de compétition. */
const CHIFFRES_FICHE: readonly DefChiffreAgent[] = [
  { cle: "victoires", libelle: "Victoires", stat: VICTOIRES },
  { cle: "kd", libelle: "K/D", stat: KD },
  { cle: "score", libelle: "Score", stat: SCORE },
  { cle: "degats", libelle: "Dégâts / manche", stat: DEGATS },
  { cle: "tete", libelle: "Tirs à la tête", stat: TETE },
  { cle: "note", libelle: "Note Valorant", stat: NOTE },
]

/** Les premiers duels de la fiche, par la règle de l'entrée 2 : par manche, à deux décimales (la maquette écrit « / partie »). */
const PREMIERS_DUELS_FICHE: readonly DefChiffreAgent[] = [
  { cle: "premiersKills", libelle: `1${ERS} kills / manche`, stat: PREMIERS_KILLS },
  { cle: "premieresMorts", libelle: `1${RES} morts / manche`, stat: PREMIERES_MORTS },
  { cle: "ratioPremiersDuels", libelle: "Ratio", stat: RATIO_PREMIERS_DUELS },
]

/**
 * La fiche d'un agent : son id et son nom, son rôle en clair (null sans lui), ses parties du périmètre et leur texte, la mention
 * « peu de parties » (de 3 à 9 parties ; null sinon), ses victoires (files de Victoires : gagnées, parties, nuls), ses six Chiffres
 * et ses premiers duels.
 */
export type FicheAgent = {
  id: string
  nom: string
  role: string | null
  parties: number

  texteParties: string
  mention: string | null
  victoires: { gagnees: number; parties: number; nuls: number }
  chiffres: ChiffreAgent[]
  premiersDuels: ChiffreAgent[]
}

/** Un chiffre sur les parties d'un agent, files admises : écrit si `ecrit` (dès 3 parties de l'agent), « — » sinon. */
function chiffreAgent(parties: readonly Partie[], d: DefChiffreAgent, ecrit: boolean): ChiffreAgent {
  const s = sommer(retenues(parties, d.stat.files), d.stat.toi)
  const valeur = ecrit ? quotient(s) : null
  return { cle: d.cle, libelle: d.libelle, valeur, parties: s.parties, texte: valeurEnClair(valeur, d.stat.mesure), sommes: s }
}

/** La fiche d'un agent sur le périmètre (Information Architecture, Agents) ; `roles` : la table du catalogue ; null pour un agent sans partie. */
export function ficheAgent(sel: Selection, id: string, roles: Roles | null): FicheAgent | null {
  const parties = partiesDeLAgent(sel.parties, id)
  if (parties.length === 0) return null
  const agent = agentDe(parties[0])!
  const ecrit = parties.length >= MIN_PARTIES_FICHE
  const jugees = retenues(parties, VICTOIRES.files).filter((p) => p.resultat != null)
  return {
    id: agent.id,
    nom: agent.name || "?",
    role: roleDeLAgent(roles, agent.id),
    parties: parties.length,
    texteParties: partiesDites(parties.length),
    mention: ecrit && parties.length < PARTIES_PEU ? PEU_DE_PARTIES : null,
    victoires: {
      gagnees: jugees.filter((p) => p.resultat === "victoire").length,
      parties: jugees.length,
      nuls: jugees.filter((p) => p.resultat === "nul").length,
    },
    chiffres: CHIFFRES_FICHE.map((d) => chiffreAgent(parties, d, ecrit)),
    premiersDuels: PREMIERS_DUELS_FICHE.map((d) => chiffreAgent(parties, d, ecrit)),
  }
}

// ─────────────────────────── cumuls par agent du périmètre ───────────────────────────





export function semaineDe(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return "?"
  const d = new Date(t)
  const jour = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const jeudi = jour + (3 - ((new Date(jour).getUTCDay() + 6) % 7)) * 86_400_000
  const annee = new Date(jeudi).getUTCFullYear()
  const n = 1 + Math.floor((jeudi - Date.UTC(annee, 0, 1)) / (7 * 86_400_000))
  return `${annee}-W${String(n).padStart(2, "0")}`
}

/**
 * Les cumuls par agent du périmètre (Confidentialité : par semaine et par file, pour suivre le périmètre) : ceux des semaines et
 * des files des parties de la sélection qu'admettent `files`. Une semaine à cheval sur le bord de la période compte entière, ses
 * cumuls n'ayant pas d'identifiant de partie. La somme que reprend l'entrée 9 pour les agents adverses.
 */
export function cumulsDuPerimetre(sel: Selection, cumuls: readonly CumulAgent[], files: Files): readonly CumulAgent[] {
  let parCumuls = CUMULS_DU_PERIMETRE.get(sel)
  if (parCumuls === undefined) {
    parCumuls = new WeakMap()
    CUMULS_DU_PERIMETRE.set(sel, parCumuls)
  }
  let parFiles = parCumuls.get(cumuls)
  if (parFiles === undefined) {
    parFiles = new Map()
    parCumuls.set(cumuls, parFiles)
  }
  const deja = parFiles.get(files)
  if (deja !== undefined) return deja
  const cles = new Set(retenues(sel.parties, files).map((p) => `${semaineDe(p.debut)}|${p.file}`))
  const r = cumuls.filter((c) => c != null && typeof c === "object" && cles.has(`${c.semaine}|${c.file}`))
  parFiles.set(files, r)
  return r
}

/**
 * Ticket 4.41 : les cumuls du périmètre d'une sélection, par liste de cumuls et par files, gardés (les capacités de chaque agent et
 * les constats les redemandaient pour chaque agent) ; les cumuls d'un agent, par liste et par agent, de même. Une sélection et ses
 * listes ne changent pas ; les listes rendues ne se lisent qu'en lecture (aucun appelant ne les modifie).
 */
const CUMULS_DU_PERIMETRE = new WeakMap<Selection, WeakMap<readonly CumulAgent[], Map<Files, readonly CumulAgent[]>>>()
const CUMULS_DE_L_AGENT = new WeakMap<readonly CumulAgent[], Map<string, readonly CumulAgent[]>>()

/** Les cumuls d'un agent (id sans casse). */
export function cumulsDeLAgent(cumuls: readonly CumulAgent[], id: string): readonly CumulAgent[] {
  const cle = cleAgent(id)
  let parAgent = CUMULS_DE_L_AGENT.get(cumuls)
  if (parAgent === undefined) {
    parAgent = new Map()
    CUMULS_DE_L_AGENT.set(cumuls, parAgent)
  }
  const deja = parAgent.get(cle)
  if (deja !== undefined) return deja
  const r = cumuls.filter((c) => typeof c.agent === "string" && cleAgent(c.agent) === cle)
  parAgent.set(cle, r)
  return r
}

/** La lecture d'un cumul : sa fraction et ses parties (chaque lecture dit comment elle les compte) ; null si absente. */
export type LireCumul = (c: CumulAgent) => Sommes | null

/**
 * Les parties sûres d'un cumul des mêmes agents (une semaine, une file) : au moins ⌈joueurs ÷ 2⌉, un agent n'étant joué qu'une fois
 * par équipe, donc au plus deux fois par partie (`membres` de la réduction prend les deux camps) ; la fusion par semaine ne garde pas
 * le nombre de parties. Les parties de cumuls différents sont différentes : leurs bornes s'additionnent (sommerCumuls).
 */
function partiesDesMemesAgents(joueurs: number): number {
  return Math.ceil(joueurs / 2)
}

/** Les sommes d'une lecture sur des cumuls : numérateurs, dénominateurs et parties ; une lecture absente ou illisible passe. */
export function sommerCumuls(cumuls: readonly CumulAgent[], lire: LireCumul): Sommes {
  let num = 0, den = 0, parties = 0
  for (const c of cumuls) {
    const s = lire(c)
    if (s === null || !Number.isFinite(s.num) || !Number.isFinite(s.den) || !Number.isFinite(s.parties)) continue
    num += s.num
    den += s.den
    parties += s.parties
  }
  return { num, den, parties }
}

// ─────────────────────────── capacités ───────────────────────────

/** Les quatre capacités d'un agent : C (`grenade`), Q (`ability1`), E (`ability2`), X (`ultimate`) ; leurs noms ne sont pas au catalogue. */
export type CleCapacite = "c" | "q" | "e" | "x"
export const CLES_CAPACITES: readonly CleCapacite[] = ["c", "q", "e", "x"]
export const TOUCHES: Readonly<Record<CleCapacite, string>> = { c: "C", q: "Q", e: "E", x: "X" }

/** Capacités et assists : les files à achat et à côtés (Files admises) ; HenrikDev ne donne pas de capacités en escarmouche. */
export const FILES_CAPACITES: Files = "completes"

/** Une utilisation de capacité ou un assist, par manche ou par partie : une décimale, comme toute moyenne par manche ou par partie (Formats). */
const PAR_MANCHE: Mesure = MOYENNE

/** Tes utilisations d'une capacité dans une partie (`capacites`), sur tes manches jouées ou sur la partie ; valeur absente : partie retirée de cette capacité. */
function capaciteDeToi(k: CleCapacite, parManche: boolean): LirePartie {
  return LECTURES_CAPACITES[k][parManche ? 1 : 0]
}

/** La lecture d'une capacité, par partie (`parManche` faux) ou par manche. */
function lectureCapacite(k: CleCapacite, parManche: boolean): LirePartie {
  return (p) => {
    const v = p.capacites?.[k]
    if (typeof v !== "number" || !Number.isFinite(v)) return null
    if (!parManche) return { num: v, den: 1 }
    const manches = manchesJouees(p)
    return manches === 0 ? null : { num: v, den: manches }
  }
}

/**
 * Ticket 4.41 : les lectures des capacités faites une fois, par partie puis par manche, pour que chaque demande reprenne la même
 * (les fractions gardées le sont par lecture : FRACTIONS_LUES).
 */
const LECTURES_CAPACITES: Readonly<Record<CleCapacite, readonly [LirePartie, LirePartie]>> = {
  c: [lectureCapacite("c", false), lectureCapacite("c", true)],
  q: [lectureCapacite("q", false), lectureCapacite("q", true)],
  e: [lectureCapacite("e", false), lectureCapacite("e", true)],
  x: [lectureCapacite("x", false), lectureCapacite("x", true)],
}

/**
 * Les utilisations d'une capacité des mêmes agents d'un cumul : sur leurs manches, ou par joueur et par partie ; ses parties : celles,
 * sûres, des joueurs qui en ont une valeur (partiesDesMemesAgents).
 */
function capaciteDuCumul(k: CleCapacite, parManche: boolean): LireCumul {
  return (c) => {
    const cc = c.capacites?.[k]
    if (cc == null || !(cc.joueurs > 0) || (parManche && !(cc.manches > 0))) return null
    return { num: cc.somme, den: parManche ? cc.manches : cc.joueurs, parties: partiesDesMemesAgents(cc.joueurs) }
  }
}

/** Assists par manche (Tes capacités ; Profil de jeu, Utilitaires) : Σ tes assists ÷ Σ tes manches jouées ; face à tes lobbys, leurs assists sur leurs manches. */
export const ASSISTS_PAR_MANCHE: Stat = {
  mesure: PAR_MANCHE,
  sens: "haut",
  files: FILES_CAPACITES,
  reference: "lobby",
  toi: (p) => {
    const assists = total(p, "assists"), manches = manchesJouees(p)
    return assists === null || manches === 0 ? null : { num: assists, den: manches }
  },
  groupe: (g) => (g.manches > 0 ? { num: g.assists, den: g.manches } : null),
}

/** Les assists des mêmes agents d'un cumul, sur leurs manches ; ses parties : celles, sûres, de ses joueurs (partiesDesMemesAgents). */
const assistsDuCumul: LireCumul = (c) => (c.manches > 0 && c.effectif > 0 ? { num: c.assists, den: c.manches, parties: partiesDesMemesAgents(c.effectif) } : null)

/**
 * Toi face aux mêmes agents de tes lobbys, comme comparer face à un groupe : ta valeur (null si `ecrit` est faux, sous 3 parties de
 * l'agent), la référence dès 5 parties sûres du groupe (partiesDesMemesAgents), l'écart, l'évaluation dès 10 parties de part et
 * d'autre.
 */
function comparerAuxMemesAgents(toi: Sommes, groupe: Sommes, mesure: Mesure, sens: Sens, ecrit: boolean): Comparaison {
  const valeur = ecrit ? quotient(toi) : null
  const reference = groupe.parties >= MIN_PARTIES_GROUPE ? quotient(groupe) : null
  const couleur = Math.min(toi.parties, groupe.parties) >= MIN_PARTIES_COULEUR
  const ecart = valeur !== null && reference !== null ? valeur - reference : null
  return { valeur, parties: toi.parties, reference, partiesReference: groupe.parties, ecart, evaluation: couleur ? evaluer(valeur, reference, mesure, sens) : "neutre" }
}

/**
 * Une capacité de l'agent face aux mêmes agents de tes lobbys : sa touche, par manche (C, Q, E) ou par partie (X), sa comparaison,
 * ta valeur et la leur en clair (null sans référence), tes sommes et les leurs, même sous les seuils (concordance, récap).
 */
export type CapaciteAgent = { cle: CleCapacite; touche: string; parManche: boolean; comparaison: Comparaison; texte: string; reference: string | null; toi: Sommes; groupe: Sommes }

/** Tes assists par manche avec l'agent, face aux mêmes agents de tes lobbys ; tes sommes et les leurs. */
export type AssistsAgent = { comparaison: Comparaison; texte: string; reference: string | null; toi: Sommes; groupe: Sommes }


export type KillsCapacites = { kills: number; parties: number; texte: string }

/** Tes capacités avec un agent : C, Q et E par manche, X par partie, tes assists par manche, tes kills aux capacités. */
export type CapacitesAgent = { capacites: CapaciteAgent[]; assists: AssistsAgent; killsCapacites: KillsCapacites }

/** Un de tes kills fait avec une capacité (`arme.type` « Ability »), sur un adversaire. */
export function killCapacite(k: Kill): boolean {
  return k.sens === "kill" && k.adverse && k.arme?.type === "Ability"
}

/** Tes kills aux capacités dans une partie. */
function killsAuxCapacites(p: Partie): number {
  let n = 0
  for (const k of p.kills ?? []) if (killCapacite(k)) n++
  return n
}

/** Une comparaison en clair : ta valeur et la référence (null sans elle), une décimale. */
function enClairParManche(c: Comparaison): { texte: string; reference: string | null } {
  return { texte: valeurEnClair(c.valeur, PAR_MANCHE), reference: c.reference === null ? null : valeurEnClair(c.reference, PAR_MANCHE) }
}

/**
 * Tes capacités avec un agent (Information Architecture, Agents ; Définitions des métriques, Capacités), sur le périmètre : files
 * à achat, valeur absente d'une capacité : partie retirée de celle-ci ; face aux mêmes agents de tes lobbys, sommes des cumuls de
 * cet agent des semaines et des files du périmètre (cumulsDuPerimetre).
 */
export function capacitesAgent(sel: Selection, cumuls: readonly CumulAgent[], id: string): CapacitesAgent {
  const parties = partiesDeLAgent(sel.parties, id)
  const ecrit = parties.length >= MIN_PARTIES_FICHE
  const siennes = retenues(parties, FILES_CAPACITES)
  const memes = cumulsDeLAgent(cumulsDuPerimetre(sel, cumuls, FILES_CAPACITES), id)
  const capacites = CLES_CAPACITES.map((k): CapaciteAgent => {
    const parManche = k !== "x"
    const toi = sommer(siennes, capaciteDeToi(k, parManche)), groupe = sommerCumuls(memes, capaciteDuCumul(k, parManche))
    const comparaison = comparerAuxMemesAgents(toi, groupe, PAR_MANCHE, "haut", ecrit)
    return { cle: k, touche: TOUCHES[k], parManche, comparaison, ...enClairParManche(comparaison), toi, groupe }
  })
  const toi = sommer(siennes, ASSISTS_PAR_MANCHE.toi), groupe = sommerCumuls(memes, assistsDuCumul)
  const assists = comparerAuxMemesAgents(toi, groupe, PAR_MANCHE, "haut", ecrit)
  let kills = 0
  for (const p of siennes) kills += killsAuxCapacites(p)
  return {
    capacites,
    assists: { comparaison: assists, ...enClairParManche(assists), toi, groupe },
    killsCapacites: { kills, parties: siennes.length, texte: ecrit && siennes.length > 0 ? `${nombreEnClair(kills, 0)} en ${partiesDites(siennes.length)}` : TIRET },
  }
}

/** Les clés des capacités d'une seule partie : C, Q, E par manche, X par partie, assists par manche, kills aux capacités. */
export type CleCapacitePartie = CleCapacite | "assists" | "killsCapacites"

/**
 * Tes capacités d'une seule partie (concordance, Détail d'une partie), même calcul que sur le périmètre : C, Q et E par manche, X
 * par partie, assists par manche, kills aux capacités sur la partie ; null hors des files des capacités ou pour une valeur absente.
 */
export function capacitesPartie(p: Partie): Record<CleCapacitePartie, ChiffrePartie | null> {
  const une = (lire: LirePartie): ChiffrePartie | null => {
    const [f] = fractions(retenues([p], FILES_CAPACITES), lire)
    return f === undefined ? null : { fraction: f, valeur: quotient(f) }
  }
  return {
    c: une(capaciteDeToi("c", true)),
    q: une(capaciteDeToi("q", true)),
    e: une(capaciteDeToi("e", true)),
    x: une(capaciteDeToi("x", false)),
    assists: une(ASSISTS_PAR_MANCHE.toi),
    killsCapacites: une((q) => ({ num: killsAuxCapacites(q), den: 1 })),
  }
}

// ─────────────────────────── face à tes autres agents ───────────────────────────

/** Un côté d'une Barre paire : sa valeur (null : « — », sous 3 parties ou sans dénominateur), ses parties retenues, son texte. */
export type ValeurAgent = { valeur: number | null; parties: number; texte: string }

/** Une ligne de Face à tes autres agents : ta valeur avec l'agent, celle de tes autres agents, l'évaluation de la tienne (dès 10 parties de part et d'autre, selon le sens). */
export type LigneAutresAgents = { cle: "kd" | "score" | "premieresMorts"; libelle: string; toi: ValeurAgent; autres: ValeurAgent; evaluation: Evaluation }

/** Les lignes de Face à tes autres agents, dans l'ordre de la maquette. */
const FACE_AUX_AUTRES: readonly { cle: LigneAutresAgents["cle"]; libelle: string; stat: Stat }[] = [
  { cle: "kd", libelle: "K/D", stat: KD },
  { cle: "score", libelle: "Score de combat", stat: SCORE },
  { cle: "premieresMorts", libelle: `1${RES} morts / manche`, stat: PREMIERES_MORTS },
]

/** Une stat sur des parties, files admises, écrite si `ecrit` (dès 3 parties). */
function valeurAgent(parties: readonly Partie[], stat: Stat, ecrit: boolean): ValeurAgent {
  const s = sommer(retenues(parties, stat.files), stat.toi)
  const valeur = ecrit ? quotient(s) : null
  return { valeur, parties: s.parties, texte: valeurEnClair(valeur, stat.mesure) }
}

/** Face à tes autres agents (Barre paire) : K/D, Score de combat et 1ʳᵉˢ morts par manche avec l'agent, contre tes parties d'autres agents du périmètre ; chaque côté dès 3 parties. */
export function faceATesAutresAgents(sel: Selection, id: string): LigneAutresAgents[] {
  const siennes = partiesDeLAgent(sel.parties, id)
  const autres = partiesDesAutresAgents(sel.parties, id)
  return FACE_AUX_AUTRES.map((d) => {
    const toi = valeurAgent(siennes, d.stat, siennes.length >= MIN_PARTIES_FICHE)
    const eux = valeurAgent(autres, d.stat, autres.length >= MIN_PARTIES_FICHE)
    const couleur = Math.min(toi.parties, eux.parties) >= MIN_PARTIES_COULEUR
    return { cle: d.cle, libelle: d.libelle, toi, autres: eux, evaluation: couleur ? evaluer(toi.valeur, eux.valeur, d.stat.mesure, d.stat.sens) : "neutre" }
  })
}

// ─────────────────────────── victoires par carte avec l'agent ───────────────────────────


export type VictoiresCarte = { carte: string; libelle: string; victoires: number } & ValeurCategorie

/**
 * Victoires par carte avec l'agent (files de Victoires) : liste par catégorie (Trop peu de parties), en pourcentage dès 5 parties,
 * sinon « x sur y », bleu dès 55 %, orange sous 45 % ; de la carte la plus jouée à la moins jouée, puis par part, puis par nom.
 */
export function victoiresParCarte(sel: Selection, id: string): VictoiresCarte[] {
  const parCarte = new Map<string, { nom: string; parties: Partie[] }>()
  for (const p of retenues(partiesDeLAgent(sel.parties, id), VICTOIRES.files)) {
    if (p.carte == null) continue
    const nom = p.carte.name || "?"
    const cle = (p.carte.id || nom).toLowerCase()
    const x = parCarte.get(cle)
    if (x) x.parties.push(p)
    else parCarte.set(cle, { nom, parties: [p] })
  }
  const lignes: { ligne: VictoiresCarte; part: number }[] = []
  for (const x of parCarte.values()) {
    const v = partEnCategorie(x.parties, VICTOIRES)
    if (v.parties === 0) continue
    const s = sommer(x.parties, VICTOIRES.toi)
    lignes.push({ ligne: { carte: x.nom, libelle: effectifEnClair(x.nom, v.parties), victoires: s.num, ...v }, part: s.num / s.den })
  }
  lignes.sort((a, b) => b.ligne.parties - a.ligne.parties || b.part - a.part || a.ligne.carte.localeCompare(b.ligne.carte, "fr"))
  return lignes.map((x) => x.ligne)
}

// ─────────────────────────── profil de jeu ───────────────────────────


const PAR_1000_CREDITS: Mesure = { genre: "nombre", decimales: 0, variation: "relative" }

/**
 * Ticket 4.47 : une valeur de manche de Riot (`loadout_value` ou `remaining`) pour toi et pour tes lobbys, les autres joueurs de la
 * partie, sur les mêmes parties : celles où ton lobby compte tous les autres joueurs (aucun écarté pour l'AFK) et où chaque manche donne ta
 * valeur et celle de chacun d'eux (les sommes de manche de ton équipe, toi compris, et des adversaires). `toi` : Σ ta valeur sur tes
 * manches ; `autres` : Σ leur valeur sur leurs joueurs-manches. null sinon : la partie sort des deux côtés.
 */
type ValeurDeManche = { toi: (m: Manche) => number | null; equipe: (m: Manche) => Somme | null | undefined; adverse: (m: Manche) => Somme | null | undefined }
const EQUIPEMENT_DE_MANCHE: ValeurDeManche = { toi: (m) => m.equipement ?? null, equipe: (m) => m.equipementEquipe, adverse: (m) => m.equipementAdverse }
const RESTANT_DE_MANCHE: ValeurDeManche = { toi: (m) => m.restant ?? null, equipe: (m) => m.restantEquipe, adverse: (m) => m.restantAdverse }
function valeursComparables(p: Partie, v: ValeurDeManche): { toi: Fraction; autres: Fraction } | null {
  const lobby = p.groupes?.lobby ?? null, manches = p.manches ?? []
  if (lobby === null || lobby.effectif !== p.joueurs - 1 || manches.length === 0) return null
  const toi: Fraction = { num: 0, den: 0 }, autres: Fraction = { num: 0, den: 0 }
  for (const m of manches) {
    const t = v.toi(m), e = v.equipe(m), a = v.adverse(m)
    if (t === null || e == null || a == null || e.effectif - 1 + a.effectif !== lobby.effectif) return null
    toi.num += t
    toi.den++
    autres.num += e.somme - t + a.somme
    autres.den += lobby.effectif
  }
  return { toi, autres }
}

/**
 * Ticket 4.47 : les dégâts et l'équipement d'une partie pour toi et pour tes lobbys, sur les mêmes joueurs-manches des deux côtés par
 * construction : une seule condition pour les deux (valeursComparables de l'équipement ; tes dégâts de chaque manche connus ; le détail des
 * manches du lobby sur exactement ses joueurs-manches comparés ; un équipement non nul de chaque côté). null : la partie sort des deux côtés.
 */
function degatsComparables(p: Partie, g: Groupe | null): { toi: Fraction; autres: Fraction } | null {
  const c = valeursComparables(p, EQUIPEMENT_DE_MANCHE), d = g?.detailManches ?? null
  if (c === null || d === null || d.manches !== c.autres.den || !(c.toi.num > 0) || !(c.autres.num > 0)) return null
  let degats = 0
  for (const m of p.manches) {
    if (m.degatsInfliges == null) return null
    degats += m.degatsInfliges
  }
  return { toi: { num: 1000 * degats, den: c.toi.num }, autres: { num: 1000 * d.degatsInfliges, den: c.autres.num } }
}







export const DEGATS_POUR_1000_CREDITS: Stat = {
  mesure: PAR_1000_CREDITS,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => degatsComparables(p, p.groupes?.lobby ?? null)?.toi ?? null,
  groupe: (g, p) => (p === undefined || g !== (p.groupes?.lobby ?? null) ? null : degatsComparables(p, g)?.autres ?? null),
}

/** Les six axes du Profil de jeu, tous individuels, dans l'ordre du radar (sens horaire depuis Visée, en haut). */
export type CleAxe = "visee" | "impact" | "survie" | "utilitaires" | "clutchs" | "economie"

const AXES: readonly { cle: CleAxe; libelle: string }[] = [
  { cle: "visee", libelle: "Visée" },
  { cle: "impact", libelle: "Impact" },
  { cle: "survie", libelle: "Survie" },
  { cle: "utilitaires", libelle: "Utilitaires" },
  { cle: "clutchs", libelle: "Clutchs" },
  { cle: "economie", libelle: "Économie" },
]

/** Tes lobbys valent 50 sur chaque axe ; l'échelle va de 0 à 100. */
export const AXE_LOBBYS = 50
export const AXE_MAX = 100





export type AxeProfil = { cle: CleAxe; libelle: string; valeur: number; mesure: boolean; rapport: number | null; texte: string; phrase: string }


export type ProfilDeJeu = { axes: AxeProfil[]; texte: string; phrase: string }

/** Ton rapport à tes lobbys sur une stat (comparer) : ta valeur sur leur référence, dès 5 parties de lobby ; null sans l'une, ou référence nulle. */
function rapportAuxLobbys(sel: Selection, stat: Stat): number | null {
  const c = comparer(sel, stat)
  return c.valeur === null || c.reference === null || !(c.reference > 0) ? null : c.valeur / c.reference
}

/** Clutchs, part d'une catégorie (Trop peu de parties) : le rapport seulement quand ta part et celle de tes lobbys portent chacune sur 5 situations au moins. */
function rapportClutchs(sel: Selection): number | null {
  const toi = sommer(retenues(sel.parties, CLUTCHS.files), CLUTCHS.toi)
  if (toi.den < MIN_OCCURRENCES || denominateurReference(sel, CLUTCHS) < MIN_OCCURRENCES) return null
  return rapportAuxLobbys(sel, CLUTCHS)
}

/**
 * Utilitaires, premier rapport (Définitions des métriques, Profil de jeu) : tes utilisations de C, Q, E et X sur celles qu'auraient
 * eues les mêmes agents de tes lobbys en tes manches, agent par agent et capacité par capacité (tes manches × leur taux par manche :
 * pondéré par tes manches sur chaque agent) ; un agent dont une capacité n'a pas sa référence (moins de 5 parties) sort des deux
 * côtés ; null sous 5 de tes parties sur les agents comparables, comme chaque axe face à tes lobbys (5 parties de chaque côté).
 */
function rapportCapacites(sel: Selection, cumuls: readonly CumulAgent[]): number | null {
  const memes = cumulsDuPerimetre(sel, cumuls, FILES_CAPACITES)
  let tiennes = 0, attendues = 0, comparees = 0
  for (const a of agentsJoues(sel)) {
    const siennes = retenues(partiesDeLAgent(sel.parties, a.id), FILES_CAPACITES)
    const cumulsA = cumulsDeLAgent(memes, a.id)
    const parCle = CLES_CAPACITES.map((k) => ({ toi: sommer(siennes, capaciteDeToi(k, true)), groupe: sommerCumuls(cumulsA, capaciteDuCumul(k, true)) }))
    if (parCle.some((x) => x.groupe.parties < MIN_PARTIES_GROUPE)) continue
    // Tes parties de cet agent qui ont une capacité au moins.
    comparees += siennes.filter((p) => CLES_CAPACITES.some((k) => capaciteDeToi(k, true)(p) !== null)).length
    for (const x of parCle) {
      tiennes += x.toi.num
      attendues += (x.toi.den * x.groupe.num) / x.groupe.den
    }
  }
  return comparees < MIN_PARTIES_GROUPE || !(attendues > 0) ? null : tiennes / attendues
}

/** Un axe : 50 × ton rapport à tes lobbys, borné de 0 à 100 ; sans rapport (sous son effectif minimal), 50 et « — ». */
function axeProfil(cle: CleAxe, libelle: string, rapport: number | null): AxeProfil {
  if (rapport === null || !Number.isFinite(rapport)) return { cle, libelle, valeur: AXE_LOBBYS, mesure: false, rapport: null, texte: TIRET, phrase: `${libelle} : trop peu de parties.` }
  const valeur = Math.min(AXE_MAX, Math.max(0, AXE_LOBBYS * rapport))
  const texte = nombreEnClair(valeur, 0)
  return { cle, libelle, valeur, mesure: true, rapport, texte, phrase: `${libelle} : ${texte}, tes lobbys à ${AXE_LOBBYS}.` }
}

/** Des mots énumérés : « a », « a et b », « a, b et c ». */
function enumeration(mots: readonly string[]): string {
  return mots.length <= 1 ? mots.join("") : `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`
}






function phraseProfil(axes: readonly AxeProfil[], periode: Periode, sur: Partial<Record<CleAxe, string>> = {}): string {
  const mesures = axes.filter((a) => a.mesure), autres = axes.filter((a) => !a.mesure)
  if (mesures.length === 0) return `Profil de jeu ${PERIODE_DITE[periode]} : trop peu de parties pour te comparer à tes lobbys.`
  let texte = `Profil de jeu ${PERIODE_DITE[periode]}, face à tes lobbys, qui valent ${AXE_LOBBYS} : ${mesures.map((a) => `${a.libelle.toLowerCase()} ${a.texte}${sur[a.cle] ? ` (${sur[a.cle]})` : ""}`).join(", ")}`
  if (autres.length > 0) texte += ` ; trop peu de parties pour ${enumeration(autres.map((a) => a.libelle.toLowerCase()))}`
  return `${texte}.`
}







export function profilDeJeu(sel: Selection, cumuls: readonly CumulAgent[]): ProfilDeJeu {
  const capacites = rapportCapacites(sel, cumuls), assists = rapportAuxLobbys(sel, ASSISTS_PAR_MANCHE)
  const rapports: Record<CleAxe, number | null> = {
    visee: rapportAuxLobbys(sel, TETE),
    impact: rapportAuxLobbys(sel, DEGATS),
    survie: rapportAuxLobbys(sel, SURVIE),
    utilitaires: capacites === null || assists === null ? null : (capacites + assists) / 2,
    clutchs: rapportClutchs(sel),
    economie: rapportAuxLobbys(sel, DEGATS_POUR_1000_CREDITS),
  }
  const axes = AXES.map((a) => axeProfil(a.cle, a.libelle, rapports[a.cle]))
  // Ticket 4.47 : l'axe Économie ne compte que les parties où chaque joueur a son équipement à chaque manche ; sur moins de parties que
  // l'Impact (les autres axes), la ligne des six valeurs et les phrases disent son effectif, entre parenthèses après sa valeur.
  const sur: Partial<Record<CleAxe, string>> = {}
  const eco = axes.find((a) => a.cle === "economie")!, n = comparer(sel, DEGATS_POUR_1000_CREDITS).parties
  if (eco.mesure && n !== comparer(sel, DEGATS).parties) {
    sur.economie = `sur ${nombreEnClair(n, 0)}${NBSP}partie${n >= 2 ? "s" : ""}`
    eco.phrase = `${eco.libelle} : ${eco.texte} (${sur.economie}), tes lobbys à ${AXE_LOBBYS}.`
  }
  return {
    axes,
    texte: axes.map((a, i) => `${i === 0 ? a.libelle : a.libelle.toLowerCase()} ${a.texte}${sur[a.cle] ? ` (${sur[a.cle]})` : ""}`).join(" · "),
    phrase: phraseProfil(axes, sel.perimetre.periode, sur),
  }
}

// ═══════════════════════ cartes, côtés et après-pose (entrée 7) ═══════════════════════
//
// Par côté et par carte, sur les files complètes, seules à côtés, à poses et à victoires (EXPERIENCE.md, Information Architecture :
// Cartes, Attaque · défense ; Component Patterns : Puces de choix, Tableau, Case colorée, Barre ; State Patterns : Trop peu de
// parties ; Définitions des métriques : Côté, Référence, Évaluation, 1ᵉʳˢ kills, Retakes, Après la pose, Types d'achat ; Structure du
// récap, sections 10 et 12) : tes manches gagnées et tes pistolets par côté, après une pose de ton équipe, Retakes (entrée 2), tes
// premiers duels par côté (règle de l'entrée 2), stats d'équipe face à ta période précédente ; tes kills après la pose, tes poses et
// tes désamorçages ; les cartes jouées (Puces de choix de Cartes), la fiche d'une carte (victoires, attaque, défense), Par carte (les
// Cases colorées d'Attaque · défense), Toutes tes cartes, Tes agents sur une carte et Sites plantés ; ces chiffres pour une seule
// partie (concordance, Détail). Le côté de chaque manche est celui de la réduction (règle du jeu, prolongation comprise), un pistolet
// une manche dont l'achat vaut « pistolet » (1 et 13, 1 et 5 en vélocité, jamais en prolongation). L'outil de concordance compare à
// tracker.gg ces chiffres partie par partie, puis les segments `season` et `map` de l'acte en cours.

// ─────────────────────────── stats par côté ───────────────────────────

/** Les deux côtés, dans l'ordre des blocs : l'attaque, puis la défense. */
export const COTES: readonly Cote[] = ["attaque", "defense"]

/**
 * Une valeur des manches d'un côté rapportée aux manches jouées de ce côté : Σ `lire` ÷ ces manches ; null sans manche jouée, si une
 * manche ne dit pas son côté, ou si une manche du côté n'a pas la valeur (donnée absente : la partie sort de cette stat seule).
 */
function parMancheDuCote(p: Partie, cote: Cote, lire: (m: Manche) => number | null): Fraction | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  let num = 0, den = 0
  for (const m of manches) {
    if (m.cote == null) return null
    if (m.cote !== cote) continue
    const v = lire(m)
    if (v === null) return null
    num += v
    den++
  }
  return { num, den }
}

/**
 * Les stats d'un côté, toutes stats d'équipe face à ta période précédente, sur les files complètes : tes manches gagnées de ce côté,
 * tes pistolets de ce côté (part gagnée), tes 1ᵉʳˢ kills et tes 1ʳᵉˢ morts en duel par manche de ce côté (règle de l'entrée 2, deux
 * décimales), et leur ratio.
 */
export type StatsDuCote = { manches: Stat; pistolets: Stat; premiersKills: Stat; premieresMorts: Stat; ratio: Stat }

function statsDuCote(cote: Cote): StatsDuCote {
  const premiersKills: Stat = {
    mesure: RATIO, sens: "haut", files: "completes", reference: "periode",
    toi: (p) => parMancheDuCote(p, cote, (m) => un(premierKillDeToi(m))),
  }
  const premieresMorts: Stat = {
    mesure: RATIO, sens: "bas", files: "completes", reference: "periode",
    toi: (p) => parMancheDuCote(p, cote, (m) => un(premiereMortEnDuel(m))),
  }
  return {
    manches: {
      mesure: POURCENTAGE, sens: "haut", files: "completes", reference: "periode",
      toi: (p) => partGagnee(p, (m) => (m.cote == null ? null : m.cote === cote)),
    },
    pistolets: {
      mesure: POURCENTAGE, sens: "haut", files: "completes", reference: "periode",
      toi: (p) => partGagnee(p, (m) => (m.cote == null ? null : m.cote === cote && m.achat === "pistolet")),
    },
    premiersKills,
    premieresMorts,
    ratio: {
      mesure: RATIO, sens: "haut", files: "completes", reference: "periode",
      toi: (p) => {
        const kills = premiersKills.toi(p), morts = premieresMorts.toi(p)
        return kills === null || morts === null ? null : { num: kills.num, den: morts.num }
      },
    },
  }
}

/** Les stats de chaque côté. */
export const STATS_DU_COTE: Readonly<Record<Cote, StatsDuCote>> = { attaque: statsDuCote("attaque"), defense: statsDuCote("defense") }

// ─────────────────────────── après la pose ───────────────────────────

/** Une manche avec une pose de ton équipe : une pose en attaque, seule l'attaque posant (comme Retakes, en défense) ; null sans côté. */
function poseDeTonEquipe(m: Manche): boolean | null {
  return m.cote == null ? null : m.cote === "attaque" && m.pose != null
}

/** Après une pose de ton équipe, stat d'équipe : part gagnée de tes manches avec une pose de ton équipe ; face à ta période précédente. */
export const APRES_POSE: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "periode",
  toi: (p) => partGagnee(p, poseDeTonEquipe),
}

/**
 * Tes kills après la pose (Définitions des métriques, Après la pose) : tes kills d'un adversaire postérieurs à la pose de ton équipe
 * (`apresPose`), par manche avec une pose de ton équipe ; une décimale. Stat individuelle, face à tes lobbys, mais la collecte ne garde
 * pas leurs kills après la pose : jamais de référence (Groupe trop petit : valeur seule). Une de ces poses sans moment : la partie sort
 * de cette stat.
 */
export const KILLS_APRES_POSE: Stat = {
  mesure: MOYENNE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => {
    const manches = p.manches ?? []
    if (manches.length === 0) return null
    const numeros = new Set<number>()
    for (const m of manches) {
      const avec = poseDeTonEquipe(m)
      if (avec === null) return null
      if (!avec) continue
      if (m.pose?.moment == null) return null
      numeros.add(m.numero)
    }
    let num = 0
    for (const k of p.kills ?? []) if (k.sens === "kill" && k.adverse && k.apresPose && numeros.has(k.manche)) num++
    return { num, den: numeros.size }
  },
  groupe: () => null,
}

/** Tes poses d'une partie : manches où `plant.player` est toi ; null sans manche jouée. */
function posesDeToi(p: Partie): number | null {
  const manches = p.manches ?? []
  return manches.length === 0 ? null : manches.filter((m) => m.pose?.poseur === "toi").length
}

/** Tes désamorçages d'une partie : manches où `defuse.player` est toi ; null sans manche jouée. */
function desamorcagesDeToi(p: Partie): number | null {
  const manches = p.manches ?? []
  return manches.length === 0 ? null : manches.filter((m) => m.desamorcage?.desamorceur === "toi").length
}

// ─────────────────────────── chiffres d'Attaque · défense ───────────────────────────

/** Les clés des stats de cette entrée : par côté, et après la pose. */
export type CleCote =
  | "manchesAttaque" | "manchesDefense" | "pistoletAttaque" | "pistoletDefense"
  | "premiersKillsAttaque" | "premiersKillsDefense" | "premieresMortsAttaque" | "premieresMortsDefense" | "ratioAttaque" | "ratioDefense"
  | "apresPose" | "killsApresPose" | "retakes"

/** Les stats de cette entrée, par clé ; Retakes est celle de l'entrée 2. */
export const STATS_COTES: Readonly<Record<CleCote, Stat>> = {
  manchesAttaque: STATS_DU_COTE.attaque.manches,
  manchesDefense: STATS_DU_COTE.defense.manches,
  pistoletAttaque: STATS_DU_COTE.attaque.pistolets,
  pistoletDefense: STATS_DU_COTE.defense.pistolets,
  premiersKillsAttaque: STATS_DU_COTE.attaque.premiersKills,
  premiersKillsDefense: STATS_DU_COTE.defense.premiersKills,
  premieresMortsAttaque: STATS_DU_COTE.attaque.premieresMorts,
  premieresMortsDefense: STATS_DU_COTE.defense.premieresMorts,
  ratioAttaque: STATS_DU_COTE.attaque.ratio,
  ratioDefense: STATS_DU_COTE.defense.ratio,
  apresPose: APRES_POSE,
  killsApresPose: KILLS_APRES_POSE,
  retakes: RETAKES,
}

/** Les libellés de la maquette, en toutes lettres : son « Pistolet att. » abrège « Pistolet en attaque » (Voice and Tone : chaque abréviation a son libellé parlé). */
export const LIBELLES_COTE: Readonly<Record<CleCote, string>> = {
  manchesAttaque: "Manches en attaque",
  manchesDefense: "Manches en défense",
  pistoletAttaque: "Pistolet en attaque",
  pistoletDefense: "Pistolet en défense",
  premiersKillsAttaque: `1${ERS} kills / manche en attaque`,
  premiersKillsDefense: `1${ERS} kills / manche en défense`,
  premieresMortsAttaque: `1${RES} morts / manche en attaque`,
  premieresMortsDefense: `1${RES} morts / manche en défense`,
  ratioAttaque: "Ratio en attaque",
  ratioDefense: "Ratio en défense",
  apresPose: "Après une pose de ton équipe",
  killsApresPose: "Kills après la pose",
  retakes: "Retakes",
}

/** Les parts d'une catégorie (Trop peu de parties) : en pourcentage dès 5 occurrences (manches, pistolets, poses), sinon « x sur y ». */
const PARTS_COTE: ReadonlySet<CleCote> = new Set<CleCote>(["manchesAttaque", "manchesDefense", "pistoletAttaque", "pistoletDefense", "apresPose", "retakes"])








export type ChiffreCote = {
  cle: CleCote
  libelle: string
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  evaluation: Evaluation
  sommes: Sommes
}

/**
 * Un chiffre d'Attaque · défense sur la sélection, écrit comme une tuile (tuile) : une part d'une catégorie en « x sur y » sous
 * 5 occurrences, un écart seulement entre deux parts d'au moins 5 occurrences chacune ; sans écart à écrire, couleur neutre.
 */
export function chiffreCote(sel: Selection, cle: CleCote): ChiffreCote {
  const stat = STATS_COTES[cle]
  const comparaison = comparer(sel, stat)
  const sommes = sommer(retenues(sel.parties, stat.files), stat.toi)
  let valeur = valeurEnClair(comparaison.valeur, stat.mesure)
  let reference = comparaison.reference === null ? null : valeurEnClair(comparaison.reference, stat.mesure)
  let ecrit = true
  if (PARTS_COTE.has(cle)) {
    const avant = stat.reference === "periode" && sel.precedentes !== null ? sommer(retenues(sel.precedentes, stat.files), stat.toi) : null
    valeur = partEnClair(sommes.num, sommes.den)
    reference = avant === null || !(avant.den > 0) ? null : partEnClair(avant.num, avant.den)
    if (sommes.den < MIN_OCCURRENCES || avant === null || avant.den < MIN_OCCURRENCES) ecrit = false
  }
  const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure), libelleReference(stat.reference, sel.perimetre.periode), ecrit)
  return { cle, libelle: LIBELLES_COTE[cle], comparaison, valeur, reference, ecart, evaluation, sommes }
}

/** Manches par côté et pistolets (Attaque · défense ; bloc Attaque · défense de la Vue d'ensemble) : tes manches gagnées en attaque et en défense, tes pistolets de chaque côté. */
export type ManchesParCote = { attaque: ChiffreCote; defense: ChiffreCote; pistoletAttaque: ChiffreCote; pistoletDefense: ChiffreCote }

/** Manches par côté et pistolets sur la sélection. */
export function manchesParCote(sel: Selection): ManchesParCote {
  return {
    attaque: chiffreCote(sel, "manchesAttaque"),
    defense: chiffreCote(sel, "manchesDefense"),
    pistoletAttaque: chiffreCote(sel, "pistoletAttaque"),
    pistoletDefense: chiffreCote(sel, "pistoletDefense"),
  }
}


export type CompteCote = { nombre: number; parties: number; texte: string }

/** Un compte de chaque partie des files complètes de la sélection ; une partie sans manche jouée passe. */
function compteCote(parties: readonly Partie[], compter: (p: Partie) => number | null): CompteCote {
  let nombre = 0, n = 0
  for (const p of retenues(parties, "completes")) {
    const x = compter(p)
    if (x === null) continue
    nombre += x
    n++
  }
  return { nombre, parties: n, texte: n === 0 ? TIRET : nombreEnClair(nombre, 0) }
}

/** Après la pose (Attaque · défense) : après une pose de ton équipe et Retakes (stats d'équipe), tes kills après la pose (sans référence), tes poses et tes désamorçages (des comptes). */
export type ApresLaPose = { apresPose: ChiffreCote; retakes: ChiffreCote; killsApresPose: ChiffreCote; poses: CompteCote; desamorcages: CompteCote }

/** Après la pose sur la sélection. */
export function apresLaPose(sel: Selection): ApresLaPose {
  return {
    apresPose: chiffreCote(sel, "apresPose"),
    retakes: chiffreCote(sel, "retakes"),
    killsApresPose: chiffreCote(sel, "killsApresPose"),
    poses: compteCote(sel.parties, posesDeToi),
    desamorcages: compteCote(sel.parties, desamorcagesDeToi),
  }
}

/** Les premiers duels d'un côté (Premiers duels par côté) : 1ᵉʳˢ kills et 1ʳᵉˢ morts par manche, et leur ratio, que montre la maquette. */
export type PremiersDuelsDuCote = { premiersKills: ChiffreCote; premieresMorts: ChiffreCote; ratio: ChiffreCote }

/** Premiers duels par côté sur la sélection, par la règle de l'entrée 2 (une 1ʳᵉ mort sans tueur adverse n'est pas un duel). */
export function premiersDuelsParCote(sel: Selection): Record<Cote, PremiersDuelsDuCote> {
  return {
    attaque: { premiersKills: chiffreCote(sel, "premiersKillsAttaque"), premieresMorts: chiffreCote(sel, "premieresMortsAttaque"), ratio: chiffreCote(sel, "ratioAttaque") },
    defense: { premiersKills: chiffreCote(sel, "premiersKillsDefense"), premieresMorts: chiffreCote(sel, "premieresMortsDefense"), ratio: chiffreCote(sel, "ratioDefense") },
  }
}

/** Les clés des chiffres d'une seule partie : les stats de cette entrée, tes poses, tes désamorçages. */
export type CleCotePartie = CleCote | "poses" | "desamorcages"

/**
 * Les chiffres de cette entrée pour une seule partie (concordance, Détail d'une partie), même calcul que sur le périmètre : chaque stat
 * de STATS_COTES, tes poses et tes désamorçages (sur 1) ; null hors des files complètes ou pour une donnée absente.
 */
export function cotesPartie(p: Partie): Record<CleCotePartie, ChiffrePartie | null> {
  const chiffres: Partial<Record<CleCotePartie, ChiffrePartie | null>> = {}
  for (const [cle, stat] of Object.entries(STATS_COTES) as [CleCote, Stat][]) {
    const [f] = fractions(retenues([p], stat.files), stat.toi)
    chiffres[cle] = f === undefined ? null : { fraction: f, valeur: quotient(f) }
  }
  const compte = (n: number | null): ChiffrePartie | null => (n === null || !fileAdmise(p.file, "completes") ? null : { fraction: { num: n, den: 1 }, valeur: n })
  chiffres.poses = compte(posesDeToi(p))
  chiffres.desamorcages = compte(desamorcagesDeToi(p))
  return chiffres as Record<CleCotePartie, ChiffrePartie | null>
}

// ─────────────────────────── cartes jouées et fiche d'une carte ───────────────────────────

/** Une carte se reconnaît à son id, à son nom s'il n'en a pas, sans casse ; null sans carte (lue aussi par analyses-cartes.ts et recap.ts). */
export function cleCarte(c: Ref | null | undefined): string | null {
  if (c == null) return null
  const cle = (c.id || c.name || "").toLowerCase()
  return cle === "" ? null : cle
}

/** Les parties des files complètes jouées sur cette carte (id sans casse), dans leur ordre (lue aussi par recap.ts). */
export function partiesDeLaCarte(parties: readonly Partie[], id: string): Partie[] {
  const cle = id.toLowerCase()
  return retenues(parties, "completes").filter((p) => cleCarte(p.carte) === cle)
}


export type CarteJouee = { id: string; nom: string; parties: number; libelle: string }

/**
 * Les cartes jouées dans le périmètre, sur les files complètes (l'escarmouche a ses cartes, sans côté ; le deathmatch n'a ni côté ni
 * victoire), de la plus jouée à la moins jouée, puis par nom ; la première est le choix par défaut.
 */
export function cartesJouees(sel: Selection): CarteJouee[] {
  const vues = new Map<string, { id: string; nom: string; parties: number }>()
  for (const p of retenues(sel.parties, "completes")) {
    const cle = cleCarte(p.carte)
    if (cle === null) continue
    const x = vues.get(cle)
    if (x) x.parties++
    else vues.set(cle, { id: p.carte?.id || cle, nom: p.carte?.name || "?", parties: 1 })
  }
  return [...vues.values()]
    .sort((a, b) => b.parties - a.parties || a.nom.localeCompare(b.nom, "fr"))
    .map((c) => ({ ...c, libelle: effectifEnClair(c.nom, c.parties) }))
}

/**
 * Un côté d'une carte (fiche, Par carte) : tes manches gagnées et jouées de ce côté sur la carte, ta part (null : sous 3 parties de la
 * carte, ou sous 5 manches, « — » ou « x sur y »), son texte, et sa couleur de Case colorée (bleu dès 55 %, orange sous 45 %).
 */
export type CoteCarte = { gagnees: number; manches: number; valeur: number | null; texte: string; evaluation: Evaluation }

/** Un côté sur les parties d'une carte, écrit si `ecrit` (dès 3 parties de la carte). */
function coteCarte(parties: readonly Partie[], cote: Cote, ecrit: boolean): CoteCarte {
  const s = sommer(parties, STATS_DU_COTE[cote].manches.toi)
  const valeur = ecrit && s.den >= MIN_OCCURRENCES ? s.num / s.den : null
  return {
    gagnees: s.num, manches: s.den, valeur,
    texte: ecrit ? partEnClair(s.num, s.den) : TIRET,
    evaluation: evaluationCategorie(valeur, null, POURCENTAGE, "haut"),
  }
}

/**
 * La fiche d'une carte : son id et son nom, ses parties des files complètes et leur texte, la mention « peu de parties » (de 3 à 9
 * parties ; null sinon), tes victoires (gagnées, parties, nuls), ta part de victoires (null sous 3 parties : « — ») et son texte, tes
 * manches gagnées en attaque et en défense.
 */
export type FicheCarte = {
  id: string
  nom: string
  parties: number

  texteParties: string
  mention: string | null
  victoires: { gagnees: number; parties: number; nuls: number }
  valeurVictoires: number | null

  texteVictoires: string
  attaque: CoteCarte
  defense: CoteCarte
}

/** La fiche d'une carte sur le périmètre (Information Architecture, Cartes : fiche, victoires et par côté) ; null pour une carte sans partie. */
export function ficheCarte(sel: Selection, id: string): FicheCarte | null {
  const parties = partiesDeLaCarte(sel.parties, id)
  if (parties.length === 0) return null
  const carte = parties[0].carte
  const ecrit = parties.length >= MIN_PARTIES_FICHE
  const valeurVictoires = ecrit ? quotient(sommer(parties, VICTOIRES.toi)) : null
  return {
    id: carte?.id || id.toLowerCase(),
    nom: carte?.name || "?",
    parties: parties.length,
    texteParties: partiesDites(parties.length),
    mention: ecrit && parties.length < PARTIES_PEU ? PEU_DE_PARTIES : null,
    victoires: {
      gagnees: parties.filter((p) => p.resultat === "victoire").length,
      parties: parties.filter((p) => p.resultat != null).length,
      nuls: parties.filter((p) => p.resultat === "nul").length,
    },
    valeurVictoires,
    texteVictoires: valeurEnClair(valeurVictoires, POURCENTAGE),
    attaque: coteCarte(parties, "attaque", ecrit),
    defense: coteCarte(parties, "defense", ecrit),
  }
}

// ─────────────────────────── toutes tes cartes, par carte ───────────────────────────






export type LigneCarte = { id: string; carte: string; libelle: string; parties: number; gagnees: number; nuls: number; victoires: ValeurCategorie; attaque: CoteCarte; defense: CoteCarte }

/** Une ligne par carte jouée, dans l'ordre des Puces de choix. */
function lignesCartes(sel: Selection): LigneCarte[] {
  return cartesJouees(sel).map((c) => {
    const parties = partiesDeLaCarte(sel.parties, c.id)
    const ecrit = parties.length >= MIN_PARTIES_FICHE
    return {
      id: c.id, carte: c.nom, libelle: c.libelle, parties: c.parties,
      gagnees: parties.filter((p) => p.resultat === "victoire").length,
      nuls: parties.filter((p) => p.resultat === "nul").length,
      victoires: partEnCategorie(parties, VICTOIRES),
      attaque: coteCarte(parties, "attaque", ecrit),
      defense: coteCarte(parties, "defense", ecrit),
    }
  })
}

/**
 * L'ordre d'une liste par sa valeur écrite décroissante (maquette), soit son pourcentage entier tel que l'écran l'écrit (comme
 * evaluationCategorie), les lignes sans valeur écrite ensuite, puis par parties décroissantes, puis par nom.
 */
function parValeurEcrite(a: number | null, b: number | null, x: LigneCarte, y: LigneCarte): number {
  if ((a === null) !== (b === null)) return a === null ? 1 : -1
  if (a !== null && b !== null && unites(a, 2) !== unites(b, 2)) return unites(b, 2) - unites(a, 2)
  return y.parties - x.parties || x.carte.localeCompare(y.carte, "fr")
}

/** Toutes tes cartes (Cartes) : chaque carte jouée et tes victoires, par part de victoires écrite décroissante, puis les cartes sous 5 parties. */
export function toutesTesCartes(sel: Selection): LigneCarte[] {
  return lignesCartes(sel).sort((x, y) => parValeurEcrite(x.victoires.valeur, y.victoires.valeur, x, y))
}

/** Par carte (Attaque · défense, Cases colorées) : chaque carte jouée, attaque et défense, par part en attaque écrite décroissante, puis les cartes sans elle. */
export function parCarte(sel: Selection): LigneCarte[] {
  return lignesCartes(sel).sort((x, y) => parValeurEcrite(x.attaque.valeur, y.attaque.valeur, x, y))
}

// ─────────────────────────── tes agents sur une carte ───────────────────────────


export type AgentSurCarte = { id: string; nom: string; libelle: string; gagnees: number } & ValeurCategorie

/**
 * Tes agents sur une carte (files complètes) : liste par catégorie (Trop peu de parties), tes victoires en pourcentage dès 5 parties,
 * sinon « x sur y », bleu dès 55 %, orange sous 45 % ; de l'agent le plus joué au moins joué, puis par part, puis par nom.
 */
export function agentsSurLaCarte(sel: Selection, idCarte: string): AgentSurCarte[] {
  const parAgent = new Map<string, { id: string; nom: string; parties: Partie[] }>()
  for (const p of partiesDeLaCarte(sel.parties, idCarte)) {
    const a = agentDe(p)
    if (a === null) continue
    const x = parAgent.get(cleAgent(a.id))
    if (x) x.parties.push(p)
    else parAgent.set(cleAgent(a.id), { id: a.id, nom: a.name || "?", parties: [p] })
  }
  const lignes: { ligne: AgentSurCarte; part: number }[] = []
  for (const x of parAgent.values()) {
    const v = partEnCategorie(x.parties, VICTOIRES)
    if (v.parties === 0) continue
    const s = sommer(x.parties, VICTOIRES.toi)
    lignes.push({ ligne: { id: x.id, nom: x.nom, libelle: effectifEnClair(x.nom, v.parties), gagnees: s.num, ...v }, part: s.num / s.den })
  }
  lignes.sort((a, b) => b.ligne.parties - a.ligne.parties || b.part - a.part || a.ligne.nom.localeCompare(b.ligne.nom, "fr"))
  return lignes.map((x) => x.ligne)
}

// ─────────────────────────── sites plantés ───────────────────────────

/**
 * Tes poses d'une partie par site (Sites plantés) : pour chaque site, tes poses (`plant.player` toi) et les manches gagnées après
 * elles ; null sans manche jouée, ou si une de tes poses n'a pas de site ou sa manche pas d'issue (la partie sort de Sites plantés).
 */
export function posesParSite(p: Partie): Map<string, { poses: number; gagnees: number }> | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  const sites = new Map<string, { poses: number; gagnees: number }>()
  for (const m of manches) {
    const pose = m.pose
    if (pose == null || pose.poseur !== "toi") continue
    if (pose.site == null || pose.site === "" || m.gagnee == null) return null
    const x = sites.get(pose.site) ?? { poses: 0, gagnees: 0 }
    x.poses++
    x.gagnees += un(m.gagnee)
    sites.set(pose.site, x)
  }
  return sites
}






export type SitePlante = {
  site: string
  libelle: string
  poses: number
  gagnees: number
  part: number | null
  textePart: string
  gagneesApres: number | null
  texteGagnees: string
  evaluation: Evaluation
}

/** Sites plantés d'une carte : tes poses sur la carte (sites connus), les parties lues, et chaque site dans l'ordre du jeu (A, B, C). */
export type SitesPlantes = { poses: number; parties: number; sites: SitePlante[] }

/** Sites plantés d'une carte sur le périmètre (files complètes) : part de tes poses par site, et des manches gagnées après elles. */
export function sitesPlantes(sel: Selection, idCarte: string): SitesPlantes {
  const parSite = new Map<string, { poses: number; gagnees: number }>()
  let parties = 0
  for (const p of partiesDeLaCarte(sel.parties, idCarte)) {
    const s = posesParSite(p)
    if (s === null) continue
    parties++
    for (const [site, x] of s) {
      const t = parSite.get(site) ?? { poses: 0, gagnees: 0 }
      t.poses += x.poses
      t.gagnees += x.gagnees
      parSite.set(site, t)
    }
  }
  let poses = 0
  for (const x of parSite.values()) poses += x.poses
  const sites = [...parSite].sort(([a], [b]) => a.localeCompare(b, "fr")).map(([site, x]): SitePlante => {
    const part = poses >= MIN_OCCURRENCES ? x.poses / poses : null
    const gagneesApres = x.poses >= MIN_OCCURRENCES ? x.gagnees / x.poses : null
    return {
      site, libelle: `Site ${site}`, poses: x.poses, gagnees: x.gagnees,
      part, textePart: partEnClair(x.poses, poses),
      gagneesApres, texteGagnees: partEnClair(x.gagnees, x.poses),
      evaluation: evaluationCategorie(gagneesApres, null, POURCENTAGE, "haut"),
    }
  })
  return { poses, parties, sites }
}

// ═══════════════════════ zones de chaque carte (entrée 8) ═══════════════════════
//
// Où tu meurs, où tu tues (EXPERIENCE.md, Définitions des métriques, Évaluation ; Component Patterns : Plan de carte, Barre ; State
// Patterns : Trop peu de parties, Ressource de valorant-api absente, Zones non nommées ; Accessibility Floor ; Structure du récap,
// section 11) : la zone d'une position (le callout de valorant-api le plus proche, en coordonnées du jeu) et sa position d'affichage
// sur l'image de la carte (ses coefficients, formule qui échange x et y) ; la zone de chaque kill et de chaque mort d'une partie
// (Détail) ; tes kills et tes morts d'une partie par côté ; le Plan de carte d'une carte et d'un côté sur le périmètre : ses points,
// tes comptes, tes morts par zone, tes kills par zone et sa phrase VoiceOver ; que reprennent le Plan de carte (entrée 14), Cartes
// (25), le Détail (34) et le récap. Callouts et coefficients : la section `cartes` de catalog.json, rangée par l'entrée 2.9 et lue par
// lireRessources (ressources.ts) ; sans callouts, des points sans zone. Tes kills : ceux d'un adversaire ; tes morts : toutes sauf celle
// par le spike ; comme le K/D, et comme les comptes par côté de tracker.gg, que l'outil de concordance compare ; les zones, il ne les a
// pas. Aucune référence : la collecte ne garde pas les positions de tes lobbys.

// ─────────────────────────── zone et position d'affichage ───────────────────────────

/** Une position sur l'image d'une carte : fractions de sa largeur (`u`) et de sa hauteur (`v`), depuis son coin haut gauche. */
export type Affichage = { u: number; v: number }

/** La zone d'une position : le nom du callout le plus proche (« A Main ») et sa distance à lui, en mètres, sans hauteur. */
export type Zone = { nom: string; distance: number }

/** Le nom d'une zone, région puis zone du callout, en anglais comme catalog.json les range : « A Main », « Mid Courtyard », « Attacker Side Spawn ». */
export function nomDeZone(c: Callout): string {
  return `${c.superRegionName} ${c.regionName}`
}

/**
 * La carte d'id `id` dans la section `cartes` de catalog.json (lireRessources), clé sans casse ; null si elle n'y est pas, ou si elle y
 * est sans coefficients (Range, deathmatch, escarmouche : null au catalogue).
 */
export function carteDuCatalogue(cartes: SectionCartes, id: string | null | undefined): CarteDuCatalogue | null {
  if (id == null || id === "") return null
  const cle = id.toLowerCase()
  return Object.prototype.hasOwnProperty.call(cartes, cle) ? cartes[cle] ?? null : null
}

/**
 * La zone d'une position sur sa carte (Définitions des métriques, Où tu meurs, où tu tues) : le callout le plus proche en coordonnées
 * du jeu (x, y, sans hauteur), sans distance maximale ; à égalité, le premier rangé (l'ordre de valorant-api : Pearl range « Mid
 * Shops » et « B Club » au même point). null sans position, sans carte (absente du catalogue ou sans coefficients) ou sans callouts.
 */
export function zoneDe(position: Position | null | undefined, carte: CarteDuCatalogue | null | undefined): Zone | null {
  if (position == null || carte == null) return null
  let retenu: Callout | null = null
  let carre = Infinity
  for (const c of carte.callouts) {
    const d = (position.x - c.x) ** 2 + (position.y - c.y) ** 2
    if (d < carre) {
      carre = d
      retenu = c
    }
  }
  return retenu === null ? null : { nom: nomDeZone(retenu), distance: Math.sqrt(carre) / 100 }
}

/**
 * La position d'affichage d'une position du jeu sur l'image de sa carte (coefficients de valorant-api, formule qui échange x et y) :
 * u = y × xMultiplier + xScalarToAdd, v = x × yMultiplier + yScalarToAdd. null sans position, sans carte, ou hors de l'image (u ou v
 * hors de [0 ; 1], bornes comprises) : un tel point n'est pas dessiné, il garde sa zone.
 */
export function positionAffichage(position: Position | null | undefined, carte: CarteDuCatalogue | null | undefined): Affichage | null {
  if (position == null || carte == null) return null
  const u = position.y * carte.xMultiplier + carte.xScalarToAdd
  const v = position.x * carte.yMultiplier + carte.yScalarToAdd
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null
}

// ─────────────────────────── zones d'une partie ───────────────────────────

/** Un kill ou une mort d'une partie (le kill même, sans copie), sa zone et sa position d'affichage ; null sans elles. */
export type KillEnZone = { kill: Kill; zone: Zone | null; affichage: Affichage | null }

/**
 * La zone de chaque kill et de chaque mort d'une partie (Détail d'une partie : tes kills avec moment et zone, tes morts dans cette
 * partie), toute file, dans l'ordre de `kills`, sur la carte de la partie dans catalog.json.
 */
export function zonesDeLaPartie(p: Partie, cartes: SectionCartes): KillEnZone[] {
  const carte = carteDuCatalogue(cartes, p.carte?.id)
  return (p.kills ?? []).map((kill) => ({ kill, zone: zoneDe(kill.position, carte), affichage: positionAffichage(kill.position, carte) }))
}

// ─────────────────────────── tes kills et tes morts par côté ───────────────────────────

/** Ton kill compté, comme au K/D : un kill d'un adversaire. */
function killCompte(k: Kill): boolean {
  return k.sens === "kill" && k.adverse
}

/** Ta mort comptée, comme au K/D : toute mort, chute et tir allié compris, sauf celle par le spike (arme `Bomb`). */
function mortComptee(k: Kill): boolean {
  return k.sens === "mort" && k.arme?.type !== "Bomb"
}

/** Tes kills et tes morts comptés d'un côté, dans l'ordre de la partie. */
export type KillsEtMorts = { kills: Kill[]; morts: Kill[] }

/**
 * Tes kills et tes morts d'une partie par côté (Où tu meurs, où tu tues) : tes kills d'un adversaire et tes morts hors mort par le spike,
 * chacun au côté de sa manche ; un kill d'une manche non jouée (« Surrendered ») n'est pas compté, comme toute stat par manche. null hors
 * des files complètes (seules à côtés), sans manche jouée, ou si une manche jouée n'a pas de côté (la partie sort de ces stats).
 */
export function killsEtMortsParCote(p: Partie): Record<Cote, KillsEtMorts> | null {
  if (!fileAdmise(p.file, "completes")) return null
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  const cotes = new Map<number, Cote>()
  for (const m of manches) {
    if (m.cote == null) return null
    cotes.set(m.numero, m.cote)
  }
  const r: Record<Cote, KillsEtMorts> = { attaque: { kills: [], morts: [] }, defense: { kills: [], morts: [] } }
  for (const k of p.kills ?? []) {
    const cote = cotes.get(k.manche)
    if (cote === undefined) continue
    if (killCompte(k)) r[cote].kills.push(k)
    else if (mortComptee(k)) r[cote].morts.push(k)
  }
  return r
}

// ─────────────────────────── plan de carte ───────────────────────────

/** Un point du Plan de carte : ta mort (croix) ou ton kill (disque), sa position du jeu, sa zone et sa position d'affichage (null : pas dessiné). */
export type PointCarte = { sens: "kill" | "mort"; position: Position; zone: Zone | null; affichage: Affichage | null }






export type ZoneComptee = { nom: string; nombre: number; part: number | null; texte: string; evaluation: Evaluation }

/**
 * Le Plan de carte d'une carte et d'un côté sur le périmètre (files complètes) : l'id et le nom de la carte, le côté, les parties lues
 * (une manche sans côté retire la partie) ; l'image de la carte (null sans elle : les seuls points), si ses points se placent
 * (coefficients) et si ses zones se nomment (callouts) ; tes kills et tes morts de ce côté, placés ou non ; les points placés (position
 * connue) ; tes morts par zone et tes kills par zone (vides sans callouts) ; la phrase VoiceOver (null sans partie lue).
 */
export type PlanDeCarte = {
  id: string
  nom: string
  cote: Cote
  parties: number
  image: string | null
  placable: boolean
  zonesNommees: boolean
  kills: number
  morts: number
  points: PointCarte[]
  zonesMorts: ZoneComptee[]
  zonesKills: ZoneComptee[]
  phrase: string | null
}

/**
 * Les zones de ces noms (un par mort ou par kill), de la part écrite la plus forte à la plus faible (son pourcentage entier tel que
 * l'écran l'écrit ; sous 5, « x sur y », par nombre), puis par nombre, puis par nom ; en pourcentage dès 5 (Trop peu de parties), sinon
 * « x sur y » ; `dominante` : chaque zone écrite à la part de la première en orange, dès 5 seulement, le reste neutre.
 */
function zonesComptees(noms: readonly string[], dominante: boolean): ZoneComptee[] {
  const parNom = new Map<string, number>()
  for (const nom of noms) parNom.set(nom, (parNom.get(nom) ?? 0) + 1)
  const total = noms.length
  const ecrit = total >= MIN_OCCURRENCES
  const lignes = [...parNom].map(([nom, nombre]) => ({ nom, nombre, part: ecrit ? nombre / total : null }))
  const ecrite = (x: { nombre: number; part: number | null }) => (x.part === null ? x.nombre : unites(x.part, 2))
  lignes.sort((a, b) => ecrite(b) - ecrite(a) || b.nombre - a.nombre || a.nom.localeCompare(b.nom, "fr"))
  const haut = lignes.length > 0 ? ecrite(lignes[0]) : null
  return lignes.map((x): ZoneComptee => ({
    nom: x.nom, nombre: x.nombre, part: x.part, texte: partEnClair(x.nombre, total),
    evaluation: dominante && ecrit && ecrite(x) === haut ? "faible" : "neutre",
  }))
}


function nombreDe(n: number, nom: "mort" | "kill"): string {
  if (n === 0) return nom === "mort" ? "aucune mort" : "aucun kill"
  return compteDit(n, nom)
}

/** Le total d'une liste par zone. */
function totalDes(zones: readonly ZoneComptee[]): number {
  let n = 0
  for (const z of zones) n += z.nombre
  return n
}








function sensDit(n: number, zones: readonly ZoneComptee[], sens: "mort" | "kill"): string {
  if (n === 0) return sens === "mort" ? "aucune mort" : "aucun kill"
  const seul = sens === "mort" ? "ta seule mort" : "ton seul kill"
  const [z1, z2] = zones
  if (z1 === undefined) return n === 1 ? `${seul}, sans zone` : `${nombreDe(n, sens)}, sans zone`
  if (n === 1) return `${seul} à ${z1.nom}`
  const avec = totalDes(zones)
  const reste = n > avec ? `, ${nombreEnClair(n - avec, 0)} sans zone` : ""
  if (avec === 1) return `1 de tes ${sens}s à ${z1.nom}${reste}`
  if (sens === "mort") return `${z1.texte} de tes morts à ${z1.nom}${z2 === undefined ? "" : `, ${z2.texte} à ${z2.nom}`}${reste}`
  return `tes kills surtout à ${z1.nom}${z2 === undefined ? "" : ` et à ${z2.nom}`}${reste}`
}








function phrasePlan(plan: Omit<PlanDeCarte, "phrase">): string | null {
  if (plan.parties === 0) return null
  const tete = `${plan.nom}, ${plan.cote === "attaque" ? "attaque" : "défense"}`
  if (!plan.zonesNommees) return `${tete} : ${nombreDe(plan.morts, "mort")}, ${nombreDe(plan.kills, "kill")} ; zones non nommées.`
  return `${tete} : ${sensDit(plan.morts, plan.zonesMorts, "mort")} ; ${sensDit(plan.kills, plan.zonesKills, "kill")}.`
}

/**
 * Le Plan de carte d'une carte (id sans casse, celui de cartesJouees) et d'un côté sur le périmètre, depuis la section `cartes` de
 * catalog.json (lireRessources) : tes kills et tes morts de ce côté sur les files complètes, tous en points, sans seuil de parties (la
 * fiche de la carte garde le sien) ; un kill sans ta position compte sans point. null pour une carte sans partie des files complètes.
 */
export function planDeCarte(sel: Selection, idCarte: string, cote: Cote, cartes: SectionCartes): PlanDeCarte | null {
  const parties = partiesDeLaCarte(sel.parties, idCarte)
  if (parties.length === 0) return null
  const ref = parties[0].carte
  const carte = carteDuCatalogue(cartes, ref?.id || idCarte)
  const points: PointCarte[] = []
  const placer = (sens: "kill" | "mort", position: Position) => {
    points.push({ sens, position: { x: position.x, y: position.y }, zone: zoneDe(position, carte), affichage: positionAffichage(position, carte) })
  }
  let lues = 0, kills = 0, morts = 0
  for (const p of parties) {
    const parCote = killsEtMortsParCote(p)
    if (parCote === null) continue
    lues++
    const duCote = parCote[cote]
    kills += duCote.kills.length
    morts += duCote.morts.length
    for (const k of duCote.morts) if (k.position != null) placer("mort", k.position)
    for (const k of duCote.kills) if (k.position != null) placer("kill", k.position)
  }
  const noms = (sens: "kill" | "mort") => {
    const r: string[] = []
    for (const x of points) if (x.sens === sens && x.zone !== null) r.push(x.zone.nom)
    return r
  }
  const zonesNommees = carte !== null && carte.callouts.length > 0
  const sansPhrase: Omit<PlanDeCarte, "phrase"> = {
    id: ref?.id || idCarte.toLowerCase(),
    nom: ref?.name || "?",
    cote,
    parties: lues,
    image: carte?.image ?? null,
    placable: carte !== null,
    zonesNommees,
    kills,
    morts,
    points,
    // Sans callouts, aucun point n'a de zone : les deux listes sont vides.
    zonesMorts: zonesComptees(noms("mort"), true),
    zonesKills: zonesComptees(noms("kill"), false),
  }
  return { ...sansPhrase, phrase: phrasePlan(sansPhrase) }
}

// ═══════════════════════ duels, clutchs et ce qui te tue (entrée 9) ═══════════════════════
//
// Le sous-onglet Duels (EXPERIENCE.md, Information Architecture : Duels ; Component Patterns : Histogramme, Barre, Chiffre ; State
// Patterns : Trop peu de parties, Groupe trop petit ; Définitions des métriques : 1ᵉʳˢ kills, À quel moment tu meurs, Ce qui te tue,
// Échanges, Survie, Clutchs, Multi-kills, Évaluation ; Accessibility Floor ; Confidentialité ; Structure du récap, sections 11 et 13) :
// premiers duels par carte (règle et ratio de l'entrée 2) ; moment de ta première mort par côté face à tes lobbys et son Histogramme par
// tranche de 15 s, avec sa phrase VoiceOver ; ce qui te tue (armes et capacités adverses, autres morts à part) et tes duels par agent
// adverse, tirés des cumuls de l'entrée 6 ; échanges, survie, écart de dégâts et dégâts reçus ; clutchs, de 1 contre 1 à 1 contre 4 et
// plus ; multi-kills et aces ; ces chiffres pour une seule partie (concordance). Tout sur les files complètes, seules à manches
// complètes, échanges, clutchs et premiers duels (Files admises, ligne « toutes ») : en Tout, ni l'escarmouche ni le deathmatch ; l'ace
// d'escarmouche (les deux adversaires) ne compte que dans multiKillsDes, que l'outil de concordance compare aux segments de l'escarmouche.
// L'outil compare à tracker.gg ce qu'il donne aussi, partie par partie, puis les segments `season` et `map` de l'acte en cours.

// ─────────────────────────── premiers duels par carte ───────────────────────────







export type PremiersDuelsCarte = {
  id: string
  carte: string
  libelle: string
  parties: number
  premiersKills: number
  premieresMorts: number
  ratio: number | null
  texte: string
  evaluation: Evaluation
}

/**
 * Premiers duels par carte (Duels, en dernier ; récap, section 10) : chaque carte jouée des files complètes, par ratio écrit décroissant
 * (deux décimales, tel que l'écran l'écrit), les cartes sans ratio écrit ensuite, puis par parties décroissantes, puis par nom.
 */
export function premiersDuelsParCarte(sel: Selection): PremiersDuelsCarte[] {
  const moyenne = moyenneDu(sel, RATIO_PREMIERS_DUELS)
  const lignes = cartesJouees(sel).map((c): PremiersDuelsCarte => {
    const parties = partiesDeLaCarte(sel.parties, c.id)
    const s = sommer(parties, RATIO_PREMIERS_DUELS.toi)
    const ratio = parties.length >= MIN_PARTIES_FICHE ? quotient(s) : null
    return {
      id: c.id, carte: c.nom, libelle: c.libelle, parties: c.parties, premiersKills: s.num, premieresMorts: s.den, ratio,
      texte: valeurEnClair(ratio, RATIO), evaluation: evaluationCategorie(ratio, moyenne, RATIO, "haut"),
    }
  })
  return lignes.sort((a, b) => {
    if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null ? 1 : -1
    if (a.ratio !== null && b.ratio !== null && unites(a.ratio, 2) !== unites(b.ratio, 2)) return unites(b.ratio, 2) - unites(a.ratio, 2)
    return b.parties - a.parties || a.carte.localeCompare(b.carte, "fr")
  })
}

// ─────────────────────────── moment de ta première mort ───────────────────────────


const RE = String.fromCharCode(0x02b3, 0x1d49)

/**
 * Tes premières morts d'une partie par côté (À quel moment tu meurs) : le moment (ms depuis la chute des barrières) de ta première mort de
 * chaque manche jouée où tu meurs, quelle qu'en soit la cause (chute, tir allié, spike compris), comme la `premiereMort` des groupes et le
 * `roundTime` de tracker.gg ; dans l'ordre des manches. null sans manche jouée, ou si une manche jouée n'a pas de côté (la partie sort de
 * ces stats, règle de l'entrée 7).
 */
function premieresMortsParCote(p: Partie): Record<Cote, number[]> | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  for (const m of manches) if (m.cote == null) return null
  const premiere = new Map<number, number>()
  for (const k of p.kills ?? []) {
    if (k.sens !== "mort" || !Number.isFinite(k.momentManche)) continue
    const t = premiere.get(k.manche)
    if (t === undefined || k.momentManche < t) premiere.set(k.manche, k.momentManche)
  }
  const r: Record<Cote, number[]> = { attaque: [], defense: [] }
  for (const m of manches) {
    const t = premiere.get(m.numero)
    if (t !== undefined) r[m.cote!].push(t)
  }
  return r
}


const MOMENT: Mesure = { genre: "nombre", decimales: 0, variation: "relative" }

/**
 * Le moment de ta première mort d'un côté, stat individuelle face à tes lobbys : Σ moments ÷ manches où tu meurs (premieresMortsParCote),
 * sur les files complètes ; le lobby : la `premiereMort` de ce côté (somme et effectif des moments de ses joueurs). Sens « plus haut »,
 * celui d'EXPERIENCE.md quand la colonne n'en dit pas.
 */
function momentDuCote(cote: Cote): Stat {
  return {
    mesure: MOMENT,
    sens: "haut",
    files: "completes",
    reference: "lobby",
    toi: (p) => {
      const r = premieresMortsParCote(p)
      if (r === null) return null
      let num = 0
      for (const t of r[cote]) num += t
      return { num, den: r[cote].length }
    },
    groupe: (g) => {
      const c = g.parCote?.[cote]?.premiereMort
      return c == null ? null : { num: c.somme, den: c.effectif }
    },
  }
}

/** Le moment de ta première mort, de chaque côté. */
export const MOMENT_PREMIERE_MORT: Readonly<Record<Cote, Stat>> = { attaque: momentDuCote("attaque"), defense: momentDuCote("defense") }


function secondesEnClair(ms: number | null): string {
  return ms === null ? TIRET : `${nombreEnClair(ms / 1000, 0)}${NBSP}s`
}


function ecartSecondesEnClair(ms: number, libelle: string | null): string {
  const n = unites(ms / 1000, 0)
  const texte = `${signe(ms, n)}${chiffres(n, 0)}${NBSP}s`
  return libelle ? `${texte} ${libelle}` : texte
}


export const ECRITURE_SECONDES: Ecriture = {
  texte: (ms) => secondesEnClair(ms),
  unites: (ms) => unitesSignees(ms / 1000, 0),
  ecart: (u) => ecartSecondesEnClair(u * 1000, null),
}






export type MomentDeTaMort = {
  cote: Cote
  libelle: string
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  evaluation: Evaluation
  sommes: Sommes
}

/** Le moment de ta première mort d'un côté sur la sélection, face à tes lobbys. */
export function momentDeTaMort(sel: Selection, cote: Cote): MomentDeTaMort {
  const stat = MOMENT_PREMIERE_MORT[cote]
  const comparaison = comparer(sel, stat)
  const { ecart, evaluation } = ecartDe(comparaison, ECRITURE_SECONDES, libelleReference(stat.reference, sel.perimetre.periode))
  return {
    cote,
    libelle: `Ta 1${RE} mort en ${cote === "attaque" ? "attaque" : "défense"}`,
    comparaison,
    valeur: secondesEnClair(comparaison.valeur),
    reference: comparaison.reference === null ? null : secondesEnClair(comparaison.reference),
    ecart,
    evaluation,
    sommes: sommer(retenues(sel.parties, stat.files), stat.toi),
  }
}

// ─────────────────────────── histogramme ───────────────────────────


const TRANCHE_MORT_MS = 15_000
const TRANCHES_MORT = 5
/** Les libellés des tranches (Formats, Durées : « et plus » pour la dernière). */
export const LIBELLES_TRANCHES_MORT: readonly string[] = [`0–15${NBSP}s`, `15–30${NBSP}s`, `30–45${NBSP}s`, `45–60${NBSP}s`, `60${NBSP}s et plus`]

const LIEUX_TRANCHES_MORT: readonly string[] = [`avant 15${NBSP}s`, `entre 15 et 30${NBSP}s`, `entre 30 et 45${NBSP}s`, `entre 45 et 60${NBSP}s`, `après 60${NBSP}s`]


export function trancheDuMoment(ms: number): number {
  return Math.min(TRANCHES_MORT - 1, Math.max(0, Math.floor(ms / TRANCHE_MORT_MS)))
}





export type TrancheMort = { libelle: string; morts: number; part: number | null; texte: string; evaluation: Evaluation }

/**
 * L'Histogramme d'un côté (À quel moment tu meurs) : le côté, les parties lues (une manche sans côté retire la partie), tes morts (la
 * première de chaque manche où tu meurs), les cinq tranches et la phrase VoiceOver (null sans partie lue).
 */
export type Histogramme = { cote: Cote; parties: number; morts: number; tranches: TrancheMort[]; phrase: string | null }







function phraseHistogramme(cote: Cote, tranches: readonly TrancheMort[], morts: number): string {
  const tete = `Tes morts en ${cote === "attaque" ? "attaque" : "défense"} par tranche de 15${NBSP}s`
  if (morts === 0) return `${tete} : aucune mort.`
  if (morts === 1) return `${tete} : ta seule mort ${LIEUX_TRANCHES_MORT[tranches.findIndex((t) => t.morts === 1)]}.`
  const ecrit = morts >= MIN_OCCURRENCES
  const poids = tranches.map((t) => (ecrit ? unites(t.morts / morts, 2) : t.morts))
  const haut = Math.max(...poids)
  const tetes = poids.map((x, i) => (x === haut ? i : -1)).filter((i) => i >= 0)
  const dite = (i: number) => `${tranches[i].texte} ${LIEUX_TRANCHES_MORT[i]}`
  const premieres = ecrit ? [`pic de ${tranches[tetes[0]].texte} ${tetes.map((i) => LIEUX_TRANCHES_MORT[i]).join(" et ")}`] : tetes.map(dite)
  const bords = [0, TRANCHES_MORT - 1].filter((i) => !tetes.includes(i)).map(dite)
  return `${tete} : ${[...premieres, ...bords].join(" ; ")}.`
}

/** L'Histogramme d'un côté sur la sélection (files complètes) : tes premières morts par tranche de 15 s, temps compté depuis la chute des barrières. */
export function histogrammeDesMorts(sel: Selection, cote: Cote): Histogramme {
  const comptes = Array.from({ length: TRANCHES_MORT }, () => 0)
  let parties = 0
  for (const p of retenues(sel.parties, "completes")) {
    const r = premieresMortsParCote(p)
    if (r === null) continue
    parties++
    for (const t of r[cote]) comptes[trancheDuMoment(t)]++
  }
  let morts = 0
  for (const n of comptes) morts += n
  const ecrit = morts >= MIN_OCCURRENCES
  const ecrite = (n: number) => (ecrit ? unites(n / morts, 2) : n)
  const haut = Math.max(...comptes.map(ecrite))
  const tranches = comptes.map((n, i): TrancheMort => ({
    libelle: LIBELLES_TRANCHES_MORT[i], morts: n, part: ecrit ? n / morts : null, texte: partEnClair(n, morts),
    evaluation: ecrit && ecrite(n) === haut ? "faible" : "neutre",
  }))
  return { cote, parties, morts, tranches, phrase: parties === 0 ? null : phraseHistogramme(cote, tranches, morts) }
}

// ─────────────────────────── ce qui te tue ───────────────────────────

/** La note de Ce qui te tue (Confidentialité) : des armes et des agents, jamais des joueurs. */
export const NOTE_CE_QUI_TE_TUE = "Moyennes par arme et par agent, jamais par joueur."
/** La ligne des capacités adverses, regroupées : HenrikDev ne nomme pas toutes les capacités, et l'agent du tueur n'est pas gardé. */
export const CAPACITES_ADVERSES = "Capacités"

/**
 * La ligne de Ce qui te tue d'une de tes morts : par un adversaire, le nom de son arme tel que HenrikDev le donne (« Vandal »), ou
 * « Capacités » pour une capacité (`type` « Ability ») ; null pour une autre mort (spike, chute, tir allié ou sur toi-même, arme sans nom),
 * comptée à part, et pour un de tes kills.
 */
export function ligneDeTaMort(k: Kill): string | null {
  if (k.sens !== "mort" || !k.adverse || k.arme == null) return null
  if (k.arme.type === "Ability") return CAPACITES_ADVERSES
  return typeof k.arme.name === "string" && k.arme.name !== "" ? k.arme.name : null
}

/**
 * Une ligne de Ce qui te tue (zonesComptees, la répartition de tes morts par zone) : son nom, tes morts, leur part (null sous 5 morts dont
 * l'arme est connue : « x sur y »), son texte et sa couleur (la dominante en orange, dès 5, le reste neutre).
 */
export type LigneCeQuiTeTue = ZoneComptee






export type CeQuiTeTue = { parties: number; morts: number; armes: LigneCeQuiTeTue[]; autres: number; texteAutres: string | null }


function autresMortsEnClair(n: number): string {
  return n > 1 ? `${nombreEnClair(n, 0)} autres morts` : `${nombreEnClair(n, 0)} autre mort`
}

/** Ce qui te tue sur la sélection : part de tes morts par un adversaire dont l'arme ou la capacité est connue, autres morts à part. */
export function ceQuiTeTue(sel: Selection): CeQuiTeTue {
  const noms: string[] = []
  let parties = 0, morts = 0
  for (const p of retenues(sel.parties, "completes")) {
    parties++
    for (const k of p.kills ?? []) {
      if (k.sens !== "mort") continue
      morts++
      const nom = ligneDeTaMort(k)
      if (nom !== null) noms.push(nom)
    }
  }
  const autres = morts - noms.length
  return { parties, morts, armes: zonesComptees(noms, true), autres, texteAutres: autres === 0 ? null : autresMortsEnClair(autres) }
}

// ─────────────────────────── duels par agent adverse ───────────────────────────





export const NOMS_AGENTS: Readonly<Record<string, string>> = {
  "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": "Astra", "5f8d3a7f-467b-97f3-062c-13acf203c006": "Breach", "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": "Brimstone",
  "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": "Chamber", "1dbf2edd-4729-0984-3115-daa5eed44993": "Clove", "117ed9e3-49f3-6512-3ccf-0cada7e3823b": "Cypher",
  "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": "Deadlock", "dade69b4-4f5a-8528-247b-219e5a1facd6": "Fade", "e370fa57-4757-3604-3648-499e1f642d3f": "Gekko",
  "95b78ed7-4637-86d9-7e41-71ba8c293152": "Harbor", "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": "Iso", "add6443a-41bd-e414-f6ad-e58d267f4e95": "Jett",
  "773f0c78-4486-752b-68ef-4585d7f4b848": "KAY/O", "601dbbe7-43ce-be57-2a40-4abd24953621": "KAY/O", "1e58de9c-4950-5125-93e9-a0aee9f98746": "Killjoy",
  "7c8a4701-4de6-9355-b254-e09bc2a34b72": "Miks", "bb2a4828-46eb-8cd1-e765-15848195d751": "Neon", "8e253930-4c05-31dd-1b6c-968525494517": "Omen",
  "eb93336a-449b-9c1b-0a54-a891f7921d69": "Phoenix", "f94c3b30-42be-e959-889c-5aa313dba261": "Raze", "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": "Reyna",
  "569fdd95-4d10-43ab-ca70-79becc718b46": "Sage", "6f2a04ca-43e0-be17-7f36-b3908627744d": "Skye", "320b2a48-4d9b-a075-30f1-1f93a9b638fa": "Sova",
  "b444168c-4e35-8076-db47-ef9bf368f384": "Tejo", "92eeef5d-43b5-1d4a-8d03-b3927a09034b": "Veto", "707eab51-4836-f488-046a-cda6bf494859": "Viper",
  "efba5359-4016-a1e5-7626-b1ae76895940": "Vyse", "df1cb487-4902-002e-5c17-d28e83e78588": "Waylay", "7f94d92c-4234-0a36-9646-3a87eb8b5c89": "Yoru",
}

/**
 * Un agent adverse de Tes duels gagnés, par agent adverse : son id, son nom (la table `noms`, sinon celui de ta partie avec l'agent, sinon
 * « ? »), son libellé (« contre Jett »), tes duels gagnés et tes duels contre lui (un kill entre toi et un adversaire de cet agent), leur part
 * (null sous 5 duels : « x sur y »), son texte et sa couleur (agents adverses, liste par catégorie : bleu dès 55 %, orange sous 45 %).
 */
export type DuelAgent = { id: string; nom: string; libelle: string; gagnes: number; duels: number; valeur: number | null; texte: string; evaluation: Evaluation }

/**
 * Tes duels gagnés, par agent adverse (Ce qui te tue) : les cumuls des semaines et des files complètes du périmètre (cumulsDuPerimetre de
 * l'entrée 6 ; une semaine à cheval compte entière), par agent, gagnés = Σ `killsContre`, duels = Σ `killsContre` + `mortsContre` ; les
 * agents sans duel omis ; un agent sous plusieurs UUID de la table (KAY/O) n'a qu'une ligne, ses cumuls additionnés, seuil et couleur sur
 * leur somme. Ordre de la maquette : part écrite croissante (le moins gagné en tête), puis duels décroissants, puis nom ; les agents sous
 * 5 duels ensuite, par duels décroissants, puis nom.
 */
export function duelsParAgentAdverse(sel: Selection, cumuls: readonly CumulAgent[], noms: Readonly<Record<string, string>> = NOMS_AGENTS): DuelAgent[] {
  const tiens = new Map<string, string>()
  for (const p of sel.parties) {
    const a = agentDe(p)
    if (a !== null && a.name) tiens.set(cleAgent(a.id), a.name)
  }
  // Une ligne par agent : les UUID d'un même nom de la table (KAY/O) réunis sous lui ; un agent hors de la table, par son UUID.
  const parAgent = new Map<string, { id: string; nom: string; gagnes: number; duels: number }>()
  for (const c of cumulsDuPerimetre(sel, cumuls, "completes")) {
    if (typeof c.agent !== "string" || c.agent === "") continue
    const k = c.killsContre, m = c.mortsContre
    if (!Number.isFinite(k) || !Number.isFinite(m) || k + m <= 0) continue
    const id = cleAgent(c.agent)
    const deLaTable = Object.prototype.hasOwnProperty.call(noms, id) ? noms[id] : undefined
    const cle = deLaTable === undefined ? `uuid:${id}` : `nom:${deLaTable}`
    const x = parAgent.get(cle) ?? { id: c.agent, nom: deLaTable ?? tiens.get(id) ?? "?", gagnes: 0, duels: 0 }
    x.gagnes += k
    x.duels += k + m
    parAgent.set(cle, x)
  }
  const lignes = [...parAgent.values()].map((x): DuelAgent => {
    const nom = x.nom
    const valeur = x.duels >= MIN_OCCURRENCES ? x.gagnes / x.duels : null
    return {
      id: x.id, nom, libelle: `contre ${nom}`, gagnes: x.gagnes, duels: x.duels, valeur, texte: partEnClair(x.gagnes, x.duels),
      evaluation: evaluationCategorie(valeur, null, POURCENTAGE, "haut"),
    }
  })
  return lignes.sort((a, b) => {
    if ((a.valeur === null) !== (b.valeur === null)) return a.valeur === null ? 1 : -1
    if (a.valeur !== null && b.valeur !== null && unites(a.valeur, 2) !== unites(b.valeur, 2)) return unites(a.valeur, 2) - unites(b.valeur, 2)
    return b.duels - a.duels || a.nom.localeCompare(b.nom, "fr")
  })
}

// ─────────────────────────── échanges et survie ───────────────────────────

/** Σ `num` sur Σ `den` des manches jouées d'une partie ; null sans manche jouée, ou si une manche n'a pas ces faits. */
function sommeDesManches(p: Partie, num: (m: Manche) => number, den: (m: Manche) => number): Fraction | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  let a = 0, b = 0
  for (const m of manches) {
    const x = num(m), y = den(m)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    a += x
    b += y
  }
  return { num: a, den: b }
}

/**
 * Alliés vengés (Échanges) : part des alliés tués par un adversaire pendant que tu vis dont tu tues le tueur dans les 5 s ; stat
 * individuelle, mais la collecte ne garde pas les échanges des groupes : jamais de référence (Groupe trop petit : valeur seule).
 */
export const ALLIES_VENGES: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => sommeDesManches(p, (m) => m.alliesVenges, (m) => m.alliesTues),
  groupe: () => null,
}

/** Tes morts vengées (Échanges) : part de tes morts par un adversaire dont un allié tue le tueur dans les 5 s ; sans référence, comme les alliés vengés. */
export const MORTS_VENGEES: Stat = {
  mesure: POURCENTAGE,
  sens: "haut",
  files: "completes",
  reference: "lobby",
  toi: (p) => sommeDesManches(p, (m) => m.mortsVengees, (m) => m.mortsParAdversaire),
  groupe: () => null,
}

/**
 * Dégâts reçus par manche : les dégâts reçus des adversaires (`degatsRecus` de tes manches) ÷ manches jouées, une décimale ; face à tes
 * lobbys (`degatsRecus` de leurs manches) ; de sens neutre, comme les zones reçues : jamais colorés ni tirés en constat.
 */
export const DEGATS_RECUS: Stat = {
  mesure: MOYENNE,
  sens: "neutre",
  files: "completes",
  reference: "lobby",
  toi: (p) => parManche(p, (m) => (typeof m.degatsRecus === "number" ? m.degatsRecus : null)),
  groupe: (g) => parMancheDuGroupe(g, (d) => d.degatsRecus),
}

/** Les clés des chiffres de Duels qu'écrit chiffreDuel. */
export type CleDuel = "alliesVenges" | "mortsVengees" | "survie" | "ecartDegats" | "degatsRecus" | "clutchs"

/** Les stats de Duels par clé : celles de cette entrée ; Survie, Écart de dégâts et Clutchs sont celles de l'entrée 2. */
export const STATS_DUELS: Readonly<Record<CleDuel, Stat>> = {
  alliesVenges: ALLIES_VENGES,
  mortsVengees: MORTS_VENGEES,
  survie: SURVIE,
  ecartDegats: ECART_DEGATS,
  degatsRecus: DEGATS_RECUS,
  clutchs: CLUTCHS,
}

/** Les libellés de la maquette. */
export const LIBELLES_DUEL: Readonly<Record<CleDuel, string>> = {
  alliesVenges: "Alliés vengés",
  mortsVengees: "Tes morts vengées",
  survie: "Manches survécues",
  ecartDegats: "Écart de dégâts",
  degatsRecus: "Dégâts reçus",
  clutchs: "Clutchs",
}

/** Les parts d'occurrences (Trop peu de parties) : en pourcentage dès 5 (alliés tués, tes morts, situations de clutch), sinon « x sur y ». */
const PARTS_DUEL: ReadonlySet<CleDuel> = new Set<CleDuel>(["alliesVenges", "mortsVengees", "clutchs"])







export type ChiffreDuel = {
  cle: CleDuel
  libelle: string
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  evaluation: Evaluation
  sommes: Sommes
}

/**
 * Un chiffre de Duels sur la sélection, écrit comme une tuile (tuile) : une part d'occurrences en « x sur y » sous 5, un écart seulement
 * entre deux parts d'au moins 5 occurrences chacune ; l'Écart de dégâts signé ; sans écart à écrire, couleur neutre.
 */
export function chiffreDuel(sel: Selection, cle: CleDuel): ChiffreDuel {
  const stat = STATS_DUELS[cle]
  const comparaison = comparer(sel, stat)
  const sommes = sommer(retenues(sel.parties, stat.files), stat.toi)
  const enClair = (v: number | null) => (v !== null && cle === "ecartDegats" ? ecartEnClair(v, stat.mesure) : valeurEnClair(v, stat.mesure))
  let valeur = enClair(comparaison.valeur)
  let reference = comparaison.reference === null ? null : enClair(comparaison.reference)
  let ecrit = true
  if (PARTS_DUEL.has(cle)) {
    valeur = partEnClair(sommes.num, sommes.den)
    if (comparaison.reference !== null && stat.reference !== "periode") {
      const g = sommerGroupe(retenues(sel.parties, stat.files), stat.reference, stat.groupe)
      reference = partEnClair(g.num, g.den)
    }
    if (sommes.den < MIN_OCCURRENCES || denominateurReference(sel, stat) < MIN_OCCURRENCES) ecrit = false
  }
  const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure, cle === "ecartDegats"), libelleReference(stat.reference, sel.perimetre.periode), ecrit)
  return { cle, libelle: LIBELLES_DUEL[cle], comparaison, valeur, reference, ecart, evaluation, sommes }
}

/** Échanges et survie (Duels) : alliés vengés et tes morts vengées (sans référence), manches survécues et dégâts reçus face à tes lobbys, écart de dégâts face à ta période précédente. */
export type EchangesEtSurvie = { alliesVenges: ChiffreDuel; mortsVengees: ChiffreDuel; survie: ChiffreDuel; ecartDegats: ChiffreDuel; degatsRecus: ChiffreDuel }

/** Échanges et survie sur la sélection. */
export function echangesEtSurvie(sel: Selection): EchangesEtSurvie {
  return {
    alliesVenges: chiffreDuel(sel, "alliesVenges"),
    mortsVengees: chiffreDuel(sel, "mortsVengees"),
    survie: chiffreDuel(sel, "survie"),
    ecartDegats: chiffreDuel(sel, "ecartDegats"),
    degatsRecus: chiffreDuel(sel, "degatsRecus"),
  }
}

// ─────────────────────────── clutchs ───────────────────────────

/** Les situations de clutch du détail : 1 contre 1, 1 contre 2, 1 contre 3, puis 1 contre 4 et plus (4 et 5 réunis). */
const CLUTCHS_DETAIL = 4

/** Tes clutchs d'une partie de 1 contre 1 à 1 contre 4 et plus : gagnés et situations ; null sans manche jouée, ou si une manche n'a pas son fait de clutch. */
function clutchsParAdversaires(p: Partie): { gagnes: number; situations: number }[] | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  const r = Array.from({ length: CLUTCHS_DETAIL }, () => ({ gagnes: 0, situations: 0 }))
  for (const m of manches) {
    if (m.clutch === undefined) return null
    if (m.clutch === null) continue
    const x = r[Math.min(CLUTCHS_DETAIL, Math.max(1, m.clutch.adversaires)) - 1]
    x.situations++
    x.gagnes += un(m.clutch.gagne)
  }
  return r
}







export type ClutchContre = { adversaires: number; libelle: string; gagnes: number; situations: number; valeur: number | null; texte: string; evaluation: Evaluation }

/** Clutchs (Duels) : la part gagnée face à tes lobbys, écrite comme sa tuile, et le détail dans l'ordre du jeu. */
export type Clutchs = { partGagnee: ChiffreDuel; detail: ClutchContre[] }

/** Les Clutchs sur la sélection (files complètes). */
export function clutchs(sel: Selection): Clutchs {
  const totaux = Array.from({ length: CLUTCHS_DETAIL }, () => ({ gagnes: 0, situations: 0 }))
  for (const p of retenues(sel.parties, "completes")) {
    const r = clutchsParAdversaires(p)
    if (r === null) continue
    r.forEach((x, i) => {
      totaux[i].gagnes += x.gagnes
      totaux[i].situations += x.situations
    })
  }
  return {
    partGagnee: chiffreDuel(sel, "clutchs"),
    detail: totaux.map((x, i): ClutchContre => {
      const valeur = x.situations >= MIN_OCCURRENCES ? x.gagnes / x.situations : null
      return {
        adversaires: i + 1, libelle: i + 1 === CLUTCHS_DETAIL ? `1 contre ${CLUTCHS_DETAIL} et plus` : `1 contre ${i + 1}`,
        gagnes: x.gagnes, situations: x.situations, valeur, texte: partEnClair(x.gagnes, x.situations),
        evaluation: i === 0 ? evaluationCategorie(valeur, null, POURCENTAGE, "haut") : "neutre",
      }
    }),
  }
}

// ─────────────────────────── multi-kills ───────────────────────────

/** Les clés des Multi-kills, dans l'ordre de la maquette : exactement 2, 3 et 4 kills, 5 et plus, puis les aces. */
export type CleMultiKill = "deux" | "trois" | "quatre" | "cinq" | "aces"
const CLES_MULTI_KILLS: readonly CleMultiKill[] = ["deux", "trois", "quatre", "cinq", "aces"]
const LIBELLES_MULTI_KILLS: Readonly<Record<CleMultiKill, string>> = { deux: "2 kills", trois: "3 kills", quatre: "4 kills", cinq: "5 kills et plus", aces: "Ace" }


export type MultiKill = { cle: CleMultiKill; libelle: string; nombre: number; texte: string }
/** Les Multi-kills : les parties lues (avec des manches jouées) et les cinq comptes. */
export type MultiKills = { parties: number; lignes: MultiKill[] }

/**
 * Les Multi-kills de ces parties, quelle que soit leur file : tes manches jouées à exactement 2, 3 et 4 kills d'adversaires, à 5 et plus
 * (`multiKill`), et tes aces (`ace` de la réduction : tous les adversaires de la manche tués par toi, les cinq en 5 contre 5, les deux en
 * escarmouche, comme tracker.gg) ; une partie sans manche jouée passe. L'outil de concordance s'en sert pour les segments de l'escarmouche,
 * que le périmètre n'admet pas (multiKills).
 */
export function multiKillsDes(parties: readonly Partie[]): MultiKills {
  const n: Record<CleMultiKill, number> = { deux: 0, trois: 0, quatre: 0, cinq: 0, aces: 0 }
  let lues = 0
  for (const p of parties) {
    const manches = p.manches ?? []
    if (manches.length === 0) continue
    lues++
    for (const m of manches) {
      const k = m.multiKill
      if (k === 2) n.deux++
      else if (k === 3) n.trois++
      else if (k === 4) n.quatre++
      else if (k >= 5) n.cinq++
      if (m.ace === true) n.aces++
    }
  }
  return { parties: lues, lignes: CLES_MULTI_KILLS.map((cle) => ({ cle, libelle: LIBELLES_MULTI_KILLS[cle], nombre: n[cle], texte: lues === 0 ? TIRET : nombreEnClair(n[cle], 0) })) }
}

/** Les Multi-kills sur la sélection (Duels) : files complètes seulement ; en Tout, ni l'escarmouche ni le deathmatch. */
export function multiKills(sel: Selection): MultiKills {
  return multiKillsDes(retenues(sel.parties, "completes"))
}

// ─────────────────────────── une seule partie ───────────────────────────

/** Les clés des chiffres d'une seule partie : le moment de ta première mort par côté, les échanges, les dégâts reçus, les clutchs de 1 contre 1 à 1 contre 4 et plus. */
export type CleDuelPartie =
  | "premiereMortAttaque" | "premiereMortDefense" | "alliesVenges" | "mortsVengees" | "degatsRecus"
  | "clutch1" | "clutch2" | "clutch3" | "clutch4"

/**
 * Les chiffres de cette entrée pour une seule partie (concordance), même calcul que sur le périmètre : le moment de ta première mort de
 * chaque côté (moments en ms sur manches où tu meurs), alliés vengés, tes morts vengées, dégâts reçus par manche, et tes clutchs gagnés sur
 * situations de 1 contre 1 à 1 contre 4 et plus ; null hors des files complètes ou pour une donnée absente. Survie, Clutchs et premiers
 * duels : chiffresPartie (entrée 2) ; multi-kills : multiKillsDes ; ce qui te tue : ligneDeTaMort.
 */
export function duelsPartie(p: Partie): Record<CleDuelPartie, ChiffrePartie | null> {
  const chiffre = (stat: Stat): ChiffrePartie | null => {
    const [f] = fractions(retenues([p], stat.files), stat.toi)
    return f === undefined ? null : { fraction: f, valeur: quotient(f) }
  }
  const detail = fileAdmise(p.file, "completes") ? clutchsParAdversaires(p) : null
  const clutch = (i: number): ChiffrePartie | null => {
    if (detail === null) return null
    const f = { num: detail[i].gagnes, den: detail[i].situations }
    return { fraction: f, valeur: quotient(f) }
  }
  return {
    premiereMortAttaque: chiffre(MOMENT_PREMIERE_MORT.attaque),
    premiereMortDefense: chiffre(MOMENT_PREMIERE_MORT.defense),
    alliesVenges: chiffre(ALLIES_VENGES),
    mortsVengees: chiffre(MORTS_VENGEES),
    degatsRecus: chiffre(DEGATS_RECUS),
    clutch1: clutch(0),
    clutch2: clutch(1),
    clutch3: clutch(2),
    clutch4: clutch(3),
  }
}














// ─────────────────────────── arme gardée (entrée 44) ───────────────────────────

/**
 * Le type de ta manche tel qu'il se lit (EXPERIENCE.md, Types d'achat) : celui de la réduction, ou « gardee », une manche jouée avec
 * l'arme gardée de la manche d'avant, qui ne se dit jamais un achat.
 */
export type TypeDeManche = TypeAchat | "gardee"
/** Le Classic, gratuit à chaque manche : jamais une arme gardée. */
const CLASSIC = "29a0cfab-485b-f5d5-779a-b59f85e204a8"

/** L'id d'une arme, sans casse ; null s'il manque. */
function idArme(id: string | null | undefined): string | null {
  return typeof id === "string" && id !== "" ? id.toLowerCase() : null
}










function armeGardee(m: Manche, avant: Manche | undefined, kills: readonly Kill[]): boolean {
  if (m.achat !== "force" && m.achat !== "complet") return false
  if (avant === undefined || avant.survie !== true) return false
  if (m.cote == null || avant.cote == null || m.cote !== avant.cote) return false
  const id = idArme(m.arme?.id)
  if (id === null || id === CLASSIC) return false
  let memeArme = idArme(avant.arme?.id) === id
  for (const k of kills) {
    if (k.manche !== avant.numero) continue
    if (k.sens === "mort" && k.arme?.type === "Bomb") return false
    if (k.sens === "kill" && idArme(k.arme?.id) === id) memeArme = true
  }
  return memeArme
}

/** Le type lu de chaque manche d'une partie, calculé une fois par partie (les stats d'achat le redemandent manche par manche). */
const TYPES_DE_MANCHE = new WeakMap<Partie, Map<Manche, TypeDeManche | null>>()

/** Le type de ta manche tel qu'il se lit : « gardee » pour une arme gardée, sinon ton type de la réduction (null : inconnu). */
export function typeDeManche(p: Partie, m: Manche): TypeDeManche | null {
  let types = TYPES_DE_MANCHE.get(p)
  if (types === undefined) {
    types = new Map()
    const manches = p.manches ?? []
    const parNumero = new Map<number, Manche>()
    for (const x of manches) parNumero.set(x.numero, x)
    const kills = p.kills ?? []
    for (const x of manches) types.set(x, armeGardee(x, parNumero.get(x.numero - 1), kills) ? "gardee" : x.achat ?? null)
    TYPES_DE_MANCHE.set(p, types)
  }
  const t = types.get(m)
  return t !== undefined ? t : m.achat ?? null
}

// ─────────────────────────── types d'achat ───────────────────────────

/**
 * Les quatre types d'achat de la réduction dans l'ordre du jeu (EXPERIENCE.md, Barre : ordre du jeu pour les types d'achat), ceux
 * de tracker.gg en regard (economiePartie, concordance).
 */
export const ORDRE_ACHATS: readonly TypeAchat[] = ["pistolet", "eco", "force", "complet"]
/** Les types de tes manches à l'écran (Économie, récap) : les quatre types, puis l'arme gardée, à part (entrée 44). */
export const ORDRE_TYPES_DE_MANCHE: readonly TypeDeManche[] = ["pistolet", "eco", "force", "complet", "gardee"]
/** Les noms des types du Tableau et des Barres de Victoires par type de manche (maquette). */
export const LIBELLES_ACHAT: Readonly<Record<TypeDeManche, string>> = { pistolet: "Pistolet", eco: "Éco", force: "Forcé", complet: "Complet", gardee: "Arme gardée" }
/**
 * Les noms de l'achat d'une manche dans son Encadré (Détail d'une partie) : « Achat complet : Vandal… », « Arme gardée : Vandal… ».
 * Face à tes lobbys, les noms courts de LIBELLES_ACHAT (entrée 44 : une comparaison ne dit pas « achat »).
 */
export const LIBELLES_ACHAT_MANCHE: Readonly<Record<TypeDeManche, string>> = {
  pistolet: "Pistolet", eco: "Éco", force: "Achat forcé", complet: "Achat complet", gardee: "Arme gardée",
}
/**
 * Les Barres paires de Tes achats face à tes lobbys, dans l'ordre du jeu (EXPERIENCE.md, Barre ; la maquette met « Achat forcé » en tête) :
 * la part du pistolet, fixée par la règle du jeu, est la même pour tout joueur et ne se compare pas. Comparées par la valeur de
 * l'équipement des deux côtés, tes armes gardées comprises comme les leurs (entrée 44 : l'arme gardée décrit tes manches, jamais une
 * comparaison).
 */
export const ACHATS_FACE_AUX_LOBBYS: readonly TypeAchat[] = ["eco", "force", "complet"]
/** La note du Tableau (maquette) ; la règle de l'arme gardée, en court (entrée 44). */
export const NOTE_STATS_ACHAT = "1ᵉʳˢ kills par manche. Types d'achat d'après la valeur de l'équipement de la manche. Arme gardée : manche forcée "
  + "ou complète par la valeur, du même côté que la manche d'avant, à laquelle tu as survécu, avec la même arme ou celle d'un de tes kills. "
  + "Les parties importées de tracker.gg n'ont pas l'arme de chaque manche : leurs armes gardées restent comptées selon la valeur."
/** La note de Tes achats face à tes lobbys (entrée 44) : ce que compare chaque Barre paire. */
export const NOTE_ACHATS_LOBBYS = "Par la valeur de l'équipement, armes gardées comprises, comme pour tes lobbys."

/**
 * Tes manches jouées d'un type dans une partie (type lu : l'arme gardée à part) ; null sans manche jouée, ou si une manche ne dit pas son
 * type (donnée absente : la partie sort de ces stats, comme d'Écos gagnées).
 */
function manchesDuType(p: Partie, type: TypeDeManche, lire: LireType): Manche[] | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  for (const m of manches) if (m.achat == null) return null
  return manches.filter((m) => lire(p, m) === type)
}

/** Ton arme de la manche est connue (id non vide) : seules ces manches peuvent dire une arme gardée (entrée 44). */
function armeConnue(m: Manche): boolean {
  return idArme(m.arme?.id) !== null
}

/** Le type d'une manche : lu (typeDeManche, l'arme gardée à part), ou celui de la réduction (concordance, face aux types de tracker.gg). */
type LireType = (p: Partie, m: Manche) => TypeDeManche | null
const typeDeLaReduction: LireType = (_p, m) => m.achat ?? null

/** Les stats de chaque type : victoires, K/D, tête, 1ᵉʳˢ kills par manche, et ta part de ce type sur tes manches typées. */
export type CleStatAchat = "victoires" | "kd" | "tete" | "premiersKills" | "part"
const CLES_STATS_ACHAT: readonly CleStatAchat[] = ["victoires", "kd", "tete", "premiersKills", "part"]

/** La part de tes lobbys pour un type de la réduction : ses manches sur celles des quatre types (`parAchat`) ; null si la réduction en tait un (1 ou 2 joueurs). */
function partDuGroupe(type: TypeAchat): LireGroupe {
  return (g) => {
    const a = g.parAchat
    if (a == null) return null
    let num = 0, den = 0
    for (const t of ORDRE_ACHATS) {
      const c = a[t]
      if (c == null) return null
      den += c.manches
      if (t === type) num = c.manches
    }
    return { num, den }
  }
}

/**
 * Les stats d'un type (files complètes) : victoires, part gagnée de tes manches du type (stat d'équipe, comme Écos gagnées) ; K/D, tes kills
 * d'adversaires sur tes morts hors mort par le spike dans ces manches (comme le K/D ; tes lobbys par `parAchat`) ; tête, tes touches de ces
 * manches ; 1ᵉʳˢ kills par manche (règle de l'entrée 2, deux décimales) ; part, tes manches du type sur tes manches typées (répartition,
 * sens neutre ; tes lobbys par `parAchat`).
 */
function statsDuType(type: TypeDeManche, lire: LireType = typeDeManche): Readonly<Record<CleStatAchat, Stat>> {
  // Entrée 44 : tes lobbys seulement face aux types de la réduction (par la valeur des deux côtés), jamais face à un type lu.
  const parAchatDe = (g: Groupe): CompteursManche | null => (lire === typeDeLaReduction && type !== "gardee" ? g.parAchat?.[type] ?? null : null)
  return {
    victoires: {
      mesure: POURCENTAGE, sens: "haut", files: "completes", reference: "periode",
      toi: (p) => partGagnee(p, (m) => (m.achat == null ? null : lire(p, m) === type)),
    },
    kd: {
      mesure: RATIO, sens: "haut", files: "completes", reference: "lobby",
      toi: (p) => {
        const ms = manchesDuType(p, type, lire)
        if (ms === null) return null
        const numeros = new Set(ms.map((m) => m.numero))
        let kills = 0, morts = 0
        for (const k of p.kills ?? []) {
          if (!numeros.has(k.manche)) continue
          if (killCompte(k)) kills++
          else if (mortComptee(k)) morts++
        }
        return { num: kills, den: morts }
      },
      groupe: (g) => {
        const c = parAchatDe(g)
        return c == null ? null : { num: c.kills, den: c.morts }
      },
    },
    tete: {
      mesure: POURCENTAGE, sens: "haut", files: "completes", reference: "lobby",
      toi: (p) => {
        const ms = manchesDuType(p, type, lire)
        if (ms === null) return null
        let tete = 0, touches = 0
        for (const m of ms) {
          if (m.tete == null || m.corps == null || m.jambes == null) return null
          tete += m.tete
          touches += m.tete + m.corps + m.jambes
        }
        return { num: tete, den: touches }
      },
      groupe: (g) => {
        const t = parAchatDe(g)?.touchesDonnees
        return t == null ? null : { num: t.tete, den: t.tete + t.corps + t.jambes }
      },
    },
    premiersKills: {
      mesure: RATIO, sens: "haut", files: "completes", reference: "periode",
      toi: (p) => {
        const ms = manchesDuType(p, type, lire)
        if (ms === null) return null
        let num = 0
        for (const m of ms) num += un(premierKillDeToi(m))
        return { num, den: ms.length }
      },
    },
    part: {
      mesure: POURCENTAGE, sens: "neutre", files: "completes", reference: "lobby",
      toi: (p) => {
        const ms = manchesDuType(p, type, lire)
        if (ms === null) return null
        // L'arme gardée, sur tes seules manches où l'arme est connue (aucune dans une partie importée : la partie sort de cette part).
        if (type === "gardee") {
          const connues = (p.manches ?? []).filter(armeConnue).length
          return connues === 0 ? null : { num: ms.length, den: connues }
        }
        return { num: ms.length, den: (p.manches ?? []).length }
      },
      groupe: lire === typeDeLaReduction && type !== "gardee" ? partDuGroupe(type) : () => null,
    },
  }
}

/** Les stats de chaque type de manche, par type puis par clé (l'arme gardée sans groupe de lobbys). */
export const STATS_ACHAT: Readonly<Record<TypeDeManche, Readonly<Record<CleStatAchat, Stat>>>> = {
  pistolet: statsDuType("pistolet"),
  eco: statsDuType("eco"),
  force: statsDuType("force"),
  complet: statsDuType("complet"),
  gardee: statsDuType("gardee"),
}
/**
 * Les stats des quatre types de la réduction (ta valeur d'équipement seule, tes armes gardées comprises) : toute comparaison avec tes
 * lobbys (ta part face à la leur, Tes achats face à tes lobbys, récap) et celles d'une seule partie face aux `player-loadout` de
 * tracker.gg (economiePartie, concordance) ; la concordance reste celle d'avant l'entrée 44.
 */
const STATS_ACHAT_DE_LA_REDUCTION: Readonly<Record<TypeAchat, Readonly<Record<CleStatAchat, Stat>>>> = {
  pistolet: statsDuType("pistolet", typeDeLaReduction),
  eco: statsDuType("eco", typeDeLaReduction),
  force: statsDuType("force", typeDeLaReduction),
  complet: statsDuType("complet", typeDeLaReduction),
}












export type LigneAchat = {
  type: TypeDeManche
  libelle: string
  effectif: string
  manches: number
  victoires: ValeurCategorie
  kd: ValeurCategorie
  tete: ValeurCategorie
  premiersKills: ValeurCategorie
  manchesDe: Record<CleValeurAchat, number>
  precisions: Record<CleValeurAchat, string | null>
  part: ValeurCategorie
  /** L'arme gardée : tes manches où l'arme est connue, sur lesquelles se lit sa part (null pour les autres types). */
  manchesConnues: number | null
  /** Ta part par la valeur, tes armes gardées comprises (le type de la réduction), celle qui se compare à tes lobbys ; null pour l'arme gardée. */
  partValeur: ValeurCategorie | null
  partLobbys: string | null
  comparaisonPart: Comparaison
  phrase: string
  sommes: Record<CleStatAchat, Sommes>
}

/** Les valeurs du Tableau d'un type. */
export type CleValeurAchat = "victoires" | "kd" | "tete" | "premiersKills"
const CLES_VALEURS_ACHAT: readonly CleValeurAchat[] = ["victoires", "kd", "tete", "premiersKills"]

/** Tes manches d'un type dans les parties où la stat se lit (une partie sans sa donnée en sort) : celles sur lesquelles porte sa valeur. */
function manchesDeLaStat(parties: readonly Partie[], type: TypeDeManche, stat: Stat): number {
  let n = 0
  for (const p of parties) if (lisible(stat.toi(p))) n += manchesDuType(p, type, typeDeManche)?.length ?? 0
  return n
}







function phraseAchat(libelle: string, manches: number, l: Pick<LigneAchat, "victoires" | "kd" | "tete" | "premiersKills" | "manchesDe" | "precisions">): string {
  if (manches === 0) return `${libelle} : aucune manche.`
  const morceaux: string[] = []
  let tropPeu = false
  const dire = (cle: CleValeurAchat, texte: string | null) => {
    if (texte !== null) morceaux.push(l.precisions[cle] === null ? texte : `${texte} ${l.precisions[cle]}`)
    else if (l.manchesDe[cle] < MIN_OCCURRENCES) tropPeu = true
  }
  dire("kd", l.kd.valeur === null ? null : `kills sur morts ${l.kd.texte}`)
  dire("tete", l.tete.valeur === null ? null : `tête ${l.tete.texte}`)
  dire("premiersKills", l.premiersKills.valeur === null ? null : `premiers kills ${l.premiersKills.texte} par manche`)
  dire("victoires", l.manchesDe.victoires === 0 ? null : `victoires ${l.victoires.texte}`)
  if (morceaux.length === 0) return `${libelle} : trop peu de manches.`
  return `${libelle} : ${morceaux.join(", ")}${tropPeu ? " ; trop peu de manches pour le reste" : ""}.`
}

/** Les quatre types d'achat sur la sélection (files complètes), dans l'ordre du jeu, puis l'arme gardée (entrée 44). */
export function achatsParType(sel: Selection): LigneAchat[] {
  const parties = retenues(sel.parties, "completes")
  return ORDRE_TYPES_DE_MANCHE.map((type): LigneAchat => {
    const stats = STATS_ACHAT[type]
    const sommes = {} as Record<CleStatAchat, Sommes>
    for (const cle of CLES_STATS_ACHAT) sommes[cle] = sommer(parties, stats[cle].toi)
    const manches = sommes.part.num
    const manchesDe = {} as Record<CleValeurAchat, number>
    for (const cle of CLES_VALEURS_ACHAT) manchesDe[cle] = manchesDeLaStat(parties, type, stats[cle])
    const assez = (cle: CleValeurAchat) => manchesDe[cle] >= MIN_OCCURRENCES
    const enValeur = (cle: CleValeurAchat): ValeurCategorie => {
      const valeur = assez(cle) ? quotient(sommes[cle]) : null
      return { valeur, parties: sommes[cle].parties, texte: valeurEnClair(valeur, stats[cle].mesure), evaluation: "neutre" }
    }
    const gagnees = assez("victoires") ? quotient(sommes.victoires) : null
    const victoires: ValeurCategorie = {
      valeur: gagnees, parties: sommes.victoires.parties, texte: partEnClair(sommes.victoires.num, sommes.victoires.den),
      evaluation: type === "pistolet" ? evaluationCategorie(gagnees, null, POURCENTAGE, "haut") : "neutre",
    }
    const kd = enValeur("kd"), tete = enValeur("tete"), premiersKills = enValeur("premiersKills")
    const valeurs: Record<CleValeurAchat, ValeurCategorie> = { victoires, kd, tete, premiersKills }
    const precisions = {} as Record<CleValeurAchat, string | null>
    for (const cle of CLES_VALEURS_ACHAT) {
      precisions[cle] = valeurs[cle].valeur !== null && manchesDe[cle] !== manches ? `sur ${nombreEnClair(manchesDe[cle], 0)} manches` : null
    }
    const enPart = (x: Sommes): ValeurCategorie => ({ valeur: x.den >= MIN_OCCURRENCES ? quotient(x) : null, parties: x.parties, texte: partEnClair(x.num, x.den), evaluation: "neutre" })
    const part = enPart(sommes.part)
    // Face à tes lobbys : le type de la réduction des deux côtés (entrée 44) ; l'arme gardée ne se compare pas.
    const valeur = type === "gardee" ? null : STATS_ACHAT_DE_LA_REDUCTION[type]
    const comparaisonPart = valeur === null
      ? { valeur: null, parties: 0, reference: null, partiesReference: 0, ecart: null, evaluation: "neutre" as Evaluation }
      : comparer(sel, valeur.part)
    const partValeur = valeur === null ? null : enPart(sommer(parties, valeur.part.toi))
    const g = valeur === null ? null : sommerGroupe(parties, "lobby", partDuGroupe(type as TypeAchat))
    return {
      type, libelle: LIBELLES_ACHAT[type], effectif: effectifEnClair(LIBELLES_ACHAT[type], manches), manches,
      victoires, kd, tete, premiersKills, manchesDe, precisions, part, manchesConnues: type === "gardee" ? sommes.part.den : null, partValeur,
      partLobbys: comparaisonPart.reference === null || g === null ? null : partEnClair(g.num, g.den),
      comparaisonPart, phrase: phraseAchat(LIBELLES_ACHAT[type], manches, { victoires, kd, tete, premiersKills, manchesDe, precisions }), sommes,
    }
  })
}

// ─────────────────────────── après un pistolet perdu ───────────────────────────

/** Les manches qui suivent un pistolet perdu par l'équipe de chaque joueur de tes lobbys (effectif), dont en achat forcé (somme). */
function apresPistoletDuGroupe(g: Groupe): Fraction | null {
  const a = g.apresPistoletPerdu
  return a == null ? null : { num: a.somme, den: a.effectif }
}

/**
 * Achat après un pistolet perdu (Définitions des métriques) : part des manches qui suivent un pistolet perdu par ton équipe (la manche dont
 * le numéro suit, si elle est jouée) où ton type est « forcé » (par la valeur, comme pour tes lobbys : une arme gardée y compte, entrée 44) ;
 * une telle manche sans type est sautée, comme pour le groupe ; plus bas vaut mieux ; face à tes lobbys, les mêmes manches pour les joueurs dont l'équipe a perdu le pistolet (`apresPistoletPerdu`).
 */
export const APRES_PISTOLET_PERDU: Stat = {
  mesure: POURCENTAGE,
  sens: "bas",
  files: "completes",
  reference: "lobby",
  toi: (p) => {
    const manches = p.manches ?? []
    if (manches.length === 0) return null
    let num = 0, den = 0
    for (const m of manches) {
      if (m.achat !== "pistolet" || m.gagnee !== false) continue
      const suivante = manches.find((x) => x.numero === m.numero + 1)
      if (suivante === undefined || suivante.achat == null) continue
      den++
      num += un(suivante.achat === "force")
    }
    return { num, den }
  },
  groupe: apresPistoletDuGroupe,
}







export type ApresPistolet = {
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  evaluation: Evaluation
  phrase: string
  sommes: Sommes
}


function foisEnClair(num: number, den: number, desCas: boolean): string {
  if (den >= MIN_OCCURRENCES) return `dans ${pourcentageEnClair(num / den)}${desCas ? " des cas" : ""}`
  return `${nombreEnClair(num, 0)} fois sur ${nombreEnClair(den, 0)}`
}







export function apresUnPistoletPerdu(sel: Selection): ApresPistolet {
  const stat = APRES_PISTOLET_PERDU
  const parties = retenues(sel.parties, stat.files)
  const comparaison = comparer(sel, stat)
  const sommes = sommer(parties, stat.toi)
  const g = sommerGroupe(parties, "lobby", apresPistoletDuGroupe)
  const reference = comparaison.reference === null ? null : partEnClair(g.num, g.den)
  const ecrit = sommes.den >= MIN_OCCURRENCES && g.den >= MIN_OCCURRENCES
  const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure), libelleReference(stat.reference, sel.perimetre.periode), ecrit)
  let phrase = "Aucune manche après un pistolet perdu."
  if (sommes.den > 0) {
    const toi = sommes.den >= MIN_OCCURRENCES
    phrase = `Après un pistolet perdu, tu forces l'achat ${foisEnClair(sommes.num, sommes.den, true)}`
    if (reference !== null) phrase += ` ; tes lobbys, ${foisEnClair(g.num, g.den, !toi)}`
    phrase += "."
  }
  return { comparaison, valeur: partEnClair(sommes.num, sommes.den), reference, ecart, evaluation, phrase, sommes }
}

// ─────────────────────────── manches marquantes ───────────────────────────

/** Les Manches marquantes, dans l'ordre de la maquette. */
export type CleMarquante = "sansPerte" | "ecoGagnee" | "completPerdu" | "aceEquipe"
const CLES_MARQUANTES: readonly CleMarquante[] = ["sansPerte", "ecoGagnee", "completPerdu", "aceEquipe"]
/** Leurs noms (Définitions des métriques, Manches marquantes ; « Sans perte », jamais « flawless »). */
export const LIBELLES_MARQUANTES: Readonly<Record<CleMarquante, string>> = {
  sansPerte: "Sans perte",
  ecoGagnee: "Éco gagnée contre un achat complet",
  completPerdu: "Achat complet perdu contre une éco",
  aceEquipe: "Ace d'équipe",
}
/** Leur sens (Définitions des métriques : achat complet perdu, plus bas), pour les Constats : des comptes sans référence, jamais colorés ici. */
export const SENS_MARQUANTES: Readonly<Record<CleMarquante, Sens>> = { sansPerte: "haut", ecoGagnee: "haut", completPerdu: "bas", aceEquipe: "haut" }

/**
 * Une manche marquante : sans perte (gagnée sans aucun mort dans ton équipe, `sansPerte`) ; éco gagnée contre un achat complet (ton équipe en
 * éco, l'adversaire en complet, par leur valeur d'équipement moyenne) ; achat complet perdu contre une éco (l'inverse) ; ace d'équipe
 * (chacun des cinq joueurs de ton équipe tue, `aceEquipe`). Une équipe sans type (moins de 3 autres joueurs avec une valeur) : non comptée.
 */
const MARQUANTE: Readonly<Record<CleMarquante, (m: Manche) => boolean>> = {
  sansPerte: (m) => m.sansPerte === true,
  ecoGagnee: (m) => m.gagnee === true && m.achatEquipe === "eco" && m.achatAdverse === "complet",
  completPerdu: (m) => m.gagnee === false && m.achatEquipe === "complet" && m.achatAdverse === "eco",
  aceEquipe: (m) => m.aceEquipe === true,
}


export type MancheMarquante = { cle: CleMarquante; libelle: string; sens: Sens; nombre: number; texte: string }
/** Les Manches marquantes : les parties lues (avec des manches jouées) et les quatre comptes, sans couleur. */
export type ManchesMarquantes = { parties: number; lignes: MancheMarquante[] }

/** Les Manches marquantes de ces parties, quelle que soit leur file (l'outil de concordance, partie par partie) ; une partie sans manche jouée passe. */
export function manchesMarquantesDes(parties: readonly Partie[]): ManchesMarquantes {
  const n: Record<CleMarquante, number> = { sansPerte: 0, ecoGagnee: 0, completPerdu: 0, aceEquipe: 0 }
  let lues = 0
  for (const p of parties) {
    const manches = p.manches ?? []
    if (manches.length === 0) continue
    lues++
    for (const m of manches) for (const cle of CLES_MARQUANTES) if (MARQUANTE[cle](m)) n[cle]++
  }
  return {
    parties: lues,
    lignes: CLES_MARQUANTES.map((cle) => ({ cle, libelle: LIBELLES_MARQUANTES[cle], sens: SENS_MARQUANTES[cle], nombre: n[cle], texte: lues === 0 ? TIRET : nombreEnClair(n[cle], 0) })),
  }
}

/** Les Manches marquantes sur la sélection (Économie) : files complètes seulement. */
export function manchesMarquantes(sel: Selection): ManchesMarquantes {
  return manchesMarquantesDes(retenues(sel.parties, "completes"))
}

// ─────────────────────────── dépenses ───────────────────────────


const CREDITS: Mesure = { genre: "nombre", decimales: 0, variation: "relative" }

/** Une valeur de manche de Riot par manche, toi et tes lobbys sur les mêmes parties (valeursComparables) ; sens neutre. */
function statDeManche(v: ValeurDeManche): Stat {
  return {
    mesure: CREDITS, sens: "neutre", files: "completes", reference: "lobby",
    toi: (p) => valeursComparables(p, v)?.toi ?? null,
    groupe: (_g, p) => (p === undefined ? null : valeursComparables(p, v)?.autres ?? null),
  }
}

/** Équipement par manche (ticket 4.47) : `loadout_value`, ce que tu tiens à la fin de l'achat, capacités comprises. */
export const EQUIPEMENT_MOYEN: Stat = statDeManche(EQUIPEMENT_DE_MANCHE)

/** Crédits gardés par manche (ticket 4.47) : `remaining`, ce qui te reste après l'achat ; seulement les parties qui gardent ceux de chacun. */
export const CREDITS_GARDES: Stat = statDeManche(RESTANT_DE_MANCHE)





export type CleDepense = "equipement" | "restant" | "degatsPour1000"
const CLES_DEPENSES: readonly CleDepense[] = ["equipement", "restant", "degatsPour1000"]
export const STATS_DEPENSES: Readonly<Record<CleDepense, Stat>> = { equipement: EQUIPEMENT_MOYEN, restant: CREDITS_GARDES, degatsPour1000: DEGATS_POUR_1000_CREDITS }
export const LIBELLES_DEPENSES: Readonly<Record<CleDepense, string>> = {
  equipement: "Équipement / manche", restant: "Crédits gardés / manche", degatsPour1000: `Dégâts / 1${FINE}000 crédits d'équipement`,
}
/** Les champs bruts de chaque chiffre dans une manche : sans eux (partie gardée avant le ticket 4.47 pour les crédits gardés), la partie ne les garde pas. */
const CHAMPS_DEPENSES: Readonly<Record<CleDepense, ValeurDeManche>> = { equipement: EQUIPEMENT_DE_MANCHE, restant: RESTANT_DE_MANCHE, degatsPour1000: EQUIPEMENT_DE_MANCHE }

/**
 * Pourquoi un chiffre des Dépenses vaut « — » (ticket 4.47), écrit par l'écran et le récap : `nonGardees`, aucune partie ne garde ces
 * valeurs pour chaque joueur (parties d'avant le ticket, pour les crédits gardés) ; `afk`, dans chaque partie qui les garde, un joueur
 * AFK est retiré du lobby (lobby incomplet ou absent) ; `manquantes`, sinon (une valeur manque à une manche).
 */
export type RaisonDepense = "nonGardees" | "afk" | "manquantes"







export type ChiffreDepense = {
  cle: CleDepense
  libelle: string
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  evaluation: Evaluation
  sommes: Sommes
  /** Ticket 4.47 : sans valeur (« — »), pourquoi (RaisonDepense) ; null sinon. */
  raison: RaisonDepense | null
}

/** Les Dépenses sur la sélection (files complètes). */
export function depenses(sel: Selection): ChiffreDepense[] {
  return CLES_DEPENSES.map((cle): ChiffreDepense => {
    const stat = STATS_DEPENSES[cle]
    const comparaison = comparer(sel, stat)
    const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure), libelleReference(stat.reference, sel.perimetre.periode))
    const parties = retenues(sel.parties, stat.files)
    const sommes = sommer(parties, stat.toi)
    const champs = CHAMPS_DEPENSES[cle]
    const gardees = parties.filter((p) => (p.manches ?? []).length > 0 && p.manches.every((m) => champs.equipe(m) !== undefined && champs.adverse(m) !== undefined))
    // Un lobby absent (sous 3 autres joueurs gardés) ou incomplet : des joueurs AFK en ont été retirés (reduction.ts, afkPartie).
    const afk = gardees.length > 0 && gardees.every((p) => p.groupes?.lobby == null || p.groupes.lobby.effectif < p.joueurs - 1)
    return {
      cle, libelle: LIBELLES_DEPENSES[cle], comparaison, valeur: valeurEnClair(comparaison.valeur, stat.mesure),
      reference: comparaison.reference === null ? null : valeurEnClair(comparaison.reference, stat.mesure),
      ecart, evaluation, sommes, raison: comparaison.valeur !== null ? null : gardees.length === 0 ? "nonGardees" : afk ? "afk" : "manquantes",
    }
  })
}

// ─────────────────────────── ticket 4.54 : ta dépense prouvée ───────────────────────────

/**
 * Une partie qui a la seconde source de la dépense (la dépense de Riot par manche, ticket 4.54) : ses manches portent `poche`. Une
 * partie lue sans elle, gardée avant ce ticket ou importée avant lui, ne l'a pas : elle sort de ta dépense des deux côtés.
 */
export function aDepenseProuvee(p: Partie): boolean {
  return (p.manches ?? []).some((m) => m.poche !== undefined)
}

/**
 * Ta dépense par manche (ticket 4.54) : Σ de ta poche prouvée sur tes manches prouvées (reduction.ts, depensesProuvees) ; tes lobbys :
 * Σ des poches prouvées des autres joueurs (`pochesAutres` de la partie, au moins 3 joueurs différents) sur leurs joueurs-manches prouvés,
 * sur les mêmes parties (celles qui ont la seconde source et ton lobby) ; sens neutre, jamais colorée ni tirée en constat. Jamais `spent.overall` ni la poche du modèle seule.
 */
export const DEPENSE_POCHE: Stat = {
  mesure: CREDITS, sens: "neutre", files: "completes", reference: "lobby",
  toi: (p) => {
    if (!aDepenseProuvee(p) || p.groupes?.lobby == null) return null
    const f: Fraction = { num: 0, den: 0 }
    for (const m of p.manches) {
      if (typeof m.poche !== "number") continue
      f.num += m.poche
      f.den++
    }
    return f
  },
  groupe: (_g, p) => (p === undefined || !aDepenseProuvee(p) ? null : { num: p.pochesAutres?.somme ?? 0, den: p.pochesAutres?.effectif ?? 0 }),
}
export const LIBELLE_DEPENSE_POCHE = "Ta dépense / manche"

/**
 * Pourquoi ta dépense vaut « — » : aucune partie n'a la seconde source ; celles qui l'ont n'ont pas de lobby gardé (joueurs AFK retirés :
 * mêmes parties des deux côtés) ; ou aucune de tes manches n'y est prouvée.
 */
export type RaisonPoche = "sansSecondeSource" | "sansLobby" | "aucuneVerifiee"

/**
 * Ta dépense par manche sur la sélection (Économie, récap) : la comparaison du socle (tes lobbys, mêmes parties), ta valeur en clair,
 * celle de tes lobbys (null sans référence : moins de 5 parties), l'écart écrit et sa référence, tes manches vérifiées (`manches`) et
 * leurs parties (`parties` : celles qui ont la seconde source), la raison d'un « — ».
 */
export type ChiffrePoche = {
  libelle: string
  comparaison: Comparaison
  valeur: string
  reference: string | null
  ecart: string | null
  manches: number
  parties: number
  raison: RaisonPoche | null
}

export function depensePoche(sel: Selection): ChiffrePoche {
  const comparaison = comparer(sel, DEPENSE_POCHE)
  const { ecart } = ecartDe(comparaison, ecritureDe(CREDITS), libelleReference("lobby", sel.perimetre.periode))
  const parties = retenues(sel.parties, DEPENSE_POCHE.files)
  const s = sommer(parties, DEPENSE_POCHE.toi)
  return {
    libelle: LIBELLE_DEPENSE_POCHE, comparaison, valeur: valeurEnClair(comparaison.valeur, CREDITS),
    reference: comparaison.reference === null ? null : valeurEnClair(comparaison.reference, CREDITS),
    ecart, manches: s.den, parties: s.parties,
    raison: comparaison.valeur !== null ? null : !parties.some(aDepenseProuvee) ? "sansSecondeSource"
      : !parties.some((p) => aDepenseProuvee(p) && p.groupes?.lobby != null) ? "sansLobby" : "aucuneVerifiee",
  }
}

/**
 * La dépense d'équipe d'une partie (Détail, Ton équipe et l'adversaire ; ticket 4.54) : Σ des dépenses de Riot de ton équipe (toi
 * compris) et des adversaires, en moyenne par manche, sur les manches où les deux sommes sont prouvées (`manches`) ; null sans aucune.
 */
export function depenseDEquipe(p: Partie): { equipe: number; adverse: number; manches: number } | null {
  let equipe = 0, adverse = 0, manches = 0
  for (const m of p.manches ?? []) {
    if (m.depenseEquipe == null || m.depenseAdverse == null) continue
    equipe += m.depenseEquipe.somme
    adverse += m.depenseAdverse.somme
    manches++
  }
  return manches === 0 ? null : { equipe: equipe / manches, adverse: adverse / manches, manches }
}

// ─────────────────────────── une seule partie ───────────────────────────







export type EconomiePartie = {
  equipement: ChiffrePartie | null
  restant: ChiffrePartie | null
  degatsPour1000: ChiffrePartie | null
  apresPistoletPerdu: ChiffrePartie | null
  parType: Record<TypeAchat, { victoires: ChiffrePartie | null; kd: ChiffrePartie | null }>
  marquantes: Record<CleMarquante, number> | null
}

export function economiePartie(p: Partie): EconomiePartie {
  const chiffre = (stat: Stat): ChiffrePartie | null => {
    const [f] = fractions(retenues([p], stat.files), stat.toi)
    return f === undefined ? null : { fraction: f, valeur: quotient(f) }
  }
  const parType = {} as Record<TypeAchat, { victoires: ChiffrePartie | null; kd: ChiffrePartie | null }>
  for (const t of ORDRE_ACHATS) parType[t] = { victoires: chiffre(STATS_ACHAT_DE_LA_REDUCTION[t].victoires), kd: chiffre(STATS_ACHAT_DE_LA_REDUCTION[t].kd) }
  let marquantes: Record<CleMarquante, number> | null = null
  if (fileAdmise(p.file, "completes") && (p.manches ?? []).length > 0) {
    const m = manchesMarquantesDes([p])
    marquantes = { sansPerte: 0, ecoGagnee: 0, completPerdu: 0, aceEquipe: 0 }
    for (const x of m.lignes) marquantes[x.cle] = x.nombre
  }
  return {
    equipement: chiffre(EQUIPEMENT_MOYEN),
    restant: chiffre(CREDITS_GARDES),
    degatsPour1000: chiffre(DEGATS_POUR_1000_CREDITS),
    apresPistoletPerdu: chiffre(APRES_PISTOLET_PERDU),
    parType,
    marquantes,
  }
}

// ═══════════════════════ armes et visée (entrée 11) ═══════════════════════
//
// Le sous-onglet Armes et visée (EXPERIENCE.md, Information Architecture : Armes et visée ; Component Patterns : Barre empilée, Barre,
// Tableau, Courbe ; State Patterns : Trop peu de parties, Groupe trop petit, Aucune partie de deathmatch ; Définitions des métriques : Tête,
// corps, jambes par arme, Kills par arme, distance, Zones touchées, reçues, Visée à l'entraînement ; Accessibility Floor ; Structure du
// récap, sections 15 et 16) : tête, corps et jambes par arme (tes touches à chaque victime dans la manche du kill, `touchesVictime` de la
// réduction, attribuées à l'arme du kill, comme tracker.gg), tes zones touchées données et reçues face à tes lobbys, tes kills par arme
// (capacités en une ligne, autres kills à part), la distance de tes kills par arme, et ta visée à l'entraînement (deathmatch contre
// compétition, un point par semaine sur 8 semaines, quel que soit le périmètre) ; ces chiffres pour une seule partie (concordance). Une arme
// est son nom chez HenrikDev : deux identifiants d'un même nom font une ligne. Tes kills d'adversaires seulement, comme le K/D. Files :
// tête, corps et jambes par arme, kills par arme et distance sur les files à manches (l'escarmouche n'a aucune touche : elle ne sort que
// de la première) ; zones données sur toutes les files, comme Tirs à la tête ; zones reçues sur les files à manches ; visée : deathmatch et
// match à mort en équipe contre la compétition. Rien n'y est coloré, sauf ta tête donnée face à tes lobbys, comme Tirs à la tête.

// ─────────────────────────── arme d'un kill ───────────────────────────

/** La note de Tête, corps, jambes par arme (maquette). */
export const NOTE_TETE_PAR_ARME = "Balles mises aux ennemis que tu as tués avec chaque arme, comme sur tracker.gg."
/** La légende de Tête, corps, jambes par arme (maquette). */
export const LEGENDE_TETE_PAR_ARME = "Le chiffre après l'arme : tes kills avec elle. À droite : ton % de tête."
/** La ligne des capacités de Kills par arme, regroupées (Définitions des métriques, Kills par arme). */
export const KILLS_CAPACITES = "Capacités"
/** Trop peu de parties : le % de tête d'une arme dès 10 kills avec elle, sinon « x sur y » touches. */
export const MIN_KILLS_ARME = 10
/** Files de tête, corps et jambes par arme, des kills par arme et de la distance (Files admises : l'escarmouche a « kills par arme »). */
export const FILES_ARMES: Files = "a-manches"

/**
 * L'arme d'un de tes kills d'adversaire : son nom tel que HenrikDev le donne (« Vandal »), sans espaces autour ; null pour une capacité
 * (`type` « Ability »), une arme sans nom, une chute ou le spike, et pour un kill qui n'est pas le tien sur un adversaire.
 */
export function armeDuKill(k: Kill): string | null {
  if (!killCompte(k) || k.arme == null || k.arme.type === "Ability") return null
  const nom = typeof k.arme.name === "string" ? k.arme.name.trim() : ""
  return nom === "" ? null : nom
}

/** La ligne de Kills par arme d'un de tes kills d'adversaire : son arme, ou « Capacités » ; null pour un autre kill (arme sans nom, chute, spike) ou hors de tes kills. */
export function ligneDuKill(k: Kill): string | null {
  return armeDuKill(k) ?? (killCapacite(k) ? KILLS_CAPACITES : null)
}

// ─────────────────────────── touches d'une partie ───────────────────────────

/** Des touches lisibles et non toutes nulles ; sinon null (rien à mesurer, comme Tirs à la tête). */
function touchesMesurees(t: Touches | null | undefined): Touches | null {
  if (t == null) return null
  const { tete, corps, jambes } = t
  if (![tete, corps, jambes].every((x) => typeof x === "number" && Number.isFinite(x))) return null
  return tete + corps + jambes > 0 ? { tete, corps, jambes } : null
}

/** Tes touches données d'une partie (totaux de fin de partie, toutes armes) ; null si l'une manque ou sans aucune touche, comme Tirs à la tête. */
function touchesDonneesDe(p: Partie): Touches | null {
  const tete = total(p, "tete"), corps = total(p, "corps"), jambes = total(p, "jambes")
  return tete === null || corps === null || jambes === null ? null : touchesMesurees({ tete, corps, jambes })
}

/** Tes touches reçues des adversaires (Σ `touchesRecues` de tes manches jouées) ; null sans manche jouée, si une manche ne les a pas, ou sans aucune. */
function touchesRecuesDe(p: Partie): Touches | null {
  const manches = p.manches ?? []
  if (manches.length === 0) return null
  const s: Touches = { tete: 0, corps: 0, jambes: 0 }
  for (const m of manches) {
    const t = m.touchesRecues
    if (t == null) return null
    s.tete += t.tete
    s.corps += t.corps
    s.jambes += t.jambes
  }
  return touchesMesurees(s)
}

/** Les touches données de tes lobbys dans une partie (`touchesDonnees`) ; null sans elles. */
function touchesDonneesDuGroupe(g: Groupe): Touches | null {
  return touchesMesurees(g.touchesDonnees)
}

/** Les touches reçues des adversaires par tes lobbys sur leurs manches (`detailManches.touchesRecues`) ; null sans manches (deathmatch) ou sans elles. */
function touchesRecuesDuGroupe(g: Groupe): Touches | null {
  return touchesMesurees(g.detailManches?.touchesRecues)
}

/** Touches à la tête sur touches : la lecture d'une partie ou d'un groupe pour une stat, null sans touche. */
function teteDes(t: Touches | null): Fraction | null {
  return t === null ? null : { num: t.tete, den: t.tete + t.corps + t.jambes }
}

/**
 * Ta tête reçue (touches à la tête sur touches reçues des adversaires), face à celle de tes lobbys : files à manches, sens neutre (Zones
 * touchées, reçues : hors tête donnée, neutre). Ta tête donnée, elle, est Tirs à la tête (TETE).
 */
export const TETE_RECUE: Stat = {
  mesure: POURCENTAGE,
  sens: "neutre",
  files: "a-manches",
  reference: "lobby",
  toi: (p) => teteDes(touchesRecuesDe(p)),
  groupe: (g) => teteDes(touchesRecuesDuGroupe(g)),
}

// ─────────────────────────── parts des zones ───────────────────────────

/** Les zones d'une Barre empilée, dans l'ordre de la maquette. */
export type CleZone = "tete" | "corps" | "jambes"
export const CLES_ZONES: readonly CleZone[] = ["tete", "corps", "jambes"]
export const LIBELLES_ZONES: Readonly<Record<CleZone, string>> = { tete: "Tête", corps: "Corps", jambes: "Jambes" }
/** « à la tête », « au corps », « aux jambes » : une zone dite par VoiceOver. */
const ZONES_DITES: Readonly<Record<CleZone, string>> = { tete: "à la tête", corps: "au corps", jambes: "aux jambes" }





export type PartZone = { cle: CleZone; libelle: string; touches: number; part: number | null; texte: string }

/** Les trois zones de ces touches, en parts si `ecrites` (seuil atteint), sinon en « x sur y ». */
function partsDesZones(t: Touches, ecrites: boolean): PartZone[] {
  const totalTouches = t.tete + t.corps + t.jambes
  return CLES_ZONES.map((cle): PartZone => ({
    cle, libelle: LIBELLES_ZONES[cle], touches: t[cle],
    part: ecrites && totalTouches > 0 ? t[cle] / totalTouches : null,
    texte: totalTouches === 0 ? TIRET : ecrites ? pourcentageEnClair(t[cle] / totalTouches) : surEnClair(t[cle], totalTouches),
  }))
}


function touchesDites(n: number): string {
  return `${nombreEnClair(n, 0)} touche${n > 1 ? "s" : ""}`
}





function zonesDites(zones: readonly PartZone[], bref = false): string {
  const totalTouches = zones.reduce((s, z) => s + z.touches, 0)
  if (zones.every((z) => z.part !== null)) return zones.map((z) => (bref ? z.texte : `${z.texte} ${ZONES_DITES[z.cle]}`)).join(", ")
  return zones.map((z, i) => (i === 0 ? `${touchesDites(z.touches)} sur ${nombreEnClair(totalTouches, 0)} ${ZONES_DITES[z.cle]}` : `${nombreEnClair(z.touches, 0)} ${ZONES_DITES[z.cle]}`)).join(", ")
}

// ─────────────────────────── tête, corps, jambes par arme ───────────────────────────








export type TeteParArme = {
  nom: string
  libelle: string
  kills: number
  killsMesures: number
  touches: Touches
  zones: PartZone[]
  tete: string
  precision: string | null
  evaluation: Evaluation
  phrase: string
}


function killsDits(n: number): string {
  return `${nombreEnClair(n, 0)} kill${n > 1 ? "s" : ""}`
}

/** Les parties de Tête, corps, jambes par arme : files à manches, celles où tes touches se lisent (comme Tirs à la tête ; l'escarmouche n'en a aucune). */
function partiesAvecTouches(sel: Selection): Partie[] {
  return retenues(sel.parties, FILES_ARMES).filter((p) => touchesDonneesDe(p) !== null)
}

/**
 * Tête, corps, jambes par arme (Armes et visée ; récap, section 15) : pour chaque arme de tes kills d'adversaires (nom de HenrikDev ; ni
 * capacité, ni arme sans nom), tes touches à chaque victime dans la manche du kill, sur les files à manches où tes touches se lisent ; un kill
 * sans touches lisibles reste dans la ligne et sort des kills mesurés. Ordre : kills décroissants, puis nom.
 */
export function teteCorpsJambesParArme(sel: Selection): TeteParArme[] {
  const parArme = new Map<string, { kills: number; mesures: number; touches: Touches }>()
  for (const p of partiesAvecTouches(sel)) {
    for (const k of p.kills ?? []) {
      const nom = armeDuKill(k)
      if (nom === null) continue
      const x = parArme.get(nom) ?? { kills: 0, mesures: 0, touches: { tete: 0, corps: 0, jambes: 0 } }
      x.kills++
      const t = k.touchesVictime
      if (t != null && [t.tete, t.corps, t.jambes].every((v) => typeof v === "number" && Number.isFinite(v))) {
        x.mesures++
        x.touches.tete += t.tete
        x.touches.corps += t.corps
        x.touches.jambes += t.jambes
      }
      parArme.set(nom, x)
    }
  }
  const lignes = [...parArme].map(([nom, x]): TeteParArme => {
    const zones = partsDesZones(x.touches, x.mesures >= MIN_KILLS_ARME)
    const precision = x.mesures !== x.kills ? `sur ${killsDits(x.mesures)}` : null
    const totalTouches = x.touches.tete + x.touches.corps + x.touches.jambes
    const dites = totalTouches === 0 ? "aucune touche mesurée" : `${zonesDites(zones)}${precision === null ? "" : `, ${precision}`}`
    return {
      nom, libelle: effectifEnClair(nom, x.kills), kills: x.kills, killsMesures: x.mesures, touches: x.touches, zones, tete: zones[0].texte,
      precision, evaluation: "neutre", phrase: `${nom}, ${killsDits(x.kills)} : ${dites}.`,
    }
  })
  return lignes.sort((a, b) => b.kills - a.kills || a.nom.localeCompare(b.nom, "fr"))
}

// ─────────────────────────── zones touchées, données et reçues ───────────────────────────


export type BarreZones = { libelle: string; parties: number; touches: Touches; zones: PartZone[]; precision: string | null }







export type BlocZones = {
  titre: string
  toi: BarreZones
  lobbys: BarreZones | null
  comparaison: Comparaison
  ecart: string | null
  evaluation: Evaluation
  phrase: string
}
/** Zones touchées, données et reçues, face à tes lobbys. */
export type ZonesTouchees = { donnees: BlocZones; recues: BlocZones }

/** Des touches sommées sur des parties, et leur nombre. */
function sommerTouches(liste: readonly (Touches | null)[]): { touches: Touches; parties: number } {
  const touches: Touches = { tete: 0, corps: 0, jambes: 0 }
  let parties = 0
  for (const t of liste) {
    if (t === null) continue
    parties++
    touches.tete += t.tete
    touches.corps += t.corps
    touches.jambes += t.jambes
  }
  return { touches, parties }
}


function precisionParties(parties: number, sel: Selection): string | null {
  return parties === sel.parties.length ? null : `sur ${partiesDites(parties)}`
}

/** Une barre des Zones touchées sur ces touches sommées : parts dès 5 touches (Trop peu de parties), sinon « x sur y ». */
function barreZones(libelle: string, s: { touches: Touches; parties: number }, sel: Selection): BarreZones {
  const n = s.touches.tete + s.touches.corps + s.touches.jambes
  return { libelle, parties: s.parties, touches: s.touches, zones: partsDesZones(s.touches, n >= MIN_OCCURRENCES), precision: precisionParties(s.parties, sel) }
}






function phraseZones(dit: string, toi: BarreZones, lobbys: BarreZones | null): string {
  const n = toi.touches.tete + toi.touches.corps + toi.touches.jambes
  if (n === 0) return `${dit} : aucune touche.`
  const tesParties = toi.precision === null ? "" : `, ${toi.precision}`
  const leurs = lobbys === null ? "" : ` ; tes lobbys${lobbys.precision === null ? "" : `, ${lobbys.precision}`} : ${zonesDites(lobbys.zones, true)}`
  return `${dit}${tesParties} : ${zonesDites(toi.zones)}${leurs}.`
}

/** Un bloc des Zones touchées sur la sélection : ta lecture et celle de tes lobbys, sur les files de `stat`. */
function blocZones(sel: Selection, titre: string, dit: string, stat: Stat, toi: (p: Partie) => Touches | null, groupe: (g: Groupe) => Touches | null): BlocZones {
  const parties = retenues(sel.parties, stat.files)
  const comparaison = comparer(sel, stat)
  const barreToi = barreZones("Toi", sommerTouches(parties.map(toi)), sel)
  const leurs = sommerTouches(parties.map((p) => {
    const g = p.groupes?.lobby ?? null
    return g === null ? null : groupe(g)
  }))
  const lobbys = comparaison.reference === null ? null : barreZones("Lobbys", leurs, sel)
  // Un écart seulement entre deux parts écrites (Trop peu de parties : une barre sous 5 touches s'écrit « x sur y »), comme le récap.
  const ecrit = barreToi.zones[0].part !== null && lobbys !== null && lobbys.zones[0].part !== null
  const { ecart, evaluation } = ecartDe(comparaison, ecritureDe(stat.mesure), libelleReference(stat.reference, sel.perimetre.periode), ecrit)
  return {
    titre, toi: barreToi, lobbys, comparaison, ecart, evaluation, phrase: phraseZones(dit, barreToi, lobbys),
  }
}

/**
 * Zones touchées, données et reçues, face à tes lobbys (Armes et visée ; récap, section 15) : tes touches (toutes armes, toutes les files,
 * comme Tirs à la tête, dont ta part de tête est la valeur) et celles que tu reçois des adversaires (files à manches), en parts de tête, corps
 * et jambes, contre celles de tes lobbys dès 5 parties ; chaque partie sans touche lisible sort de sa barre.
 */
export function zonesTouchees(sel: Selection): ZonesTouchees {
  return {
    donnees: blocZones(sel, "Zones touchées, toutes armes", "Tes touches, toutes armes", TETE, touchesDonneesDe, touchesDonneesDuGroupe),
    recues: blocZones(sel, "Où tu te fais toucher", "Les touches que tu reçois", TETE_RECUE, touchesRecuesDe, touchesRecuesDuGroupe),
  }
}

// ─────────────────────────── kills par arme ───────────────────────────







export type KillsParArme = { parties: number; kills: number; lignes: ZoneComptee[]; autres: number; texteAutres: string | null }


function autresKillsEnClair(n: number): string {
  return n > 1 ? `${nombreEnClair(n, 0)} autres kills` : `${nombreEnClair(n, 0)} autre kill`
}

/** Kills par arme sur la sélection (Armes et visée ; récap, section 15) : part de tes kills par arme, capacités regroupées en une ligne. */
export function killsParArme(sel: Selection): KillsParArme {
  const noms: string[] = []
  let parties = 0, kills = 0
  for (const p of retenues(sel.parties, FILES_ARMES)) {
    parties++
    for (const k of p.kills ?? []) {
      if (!killCompte(k)) continue
      kills++
      const nom = ligneDuKill(k)
      if (nom !== null) noms.push(nom)
    }
  }
  const autres = kills - noms.length
  return { parties, kills, lignes: zonesComptees(noms, false), autres, texteAutres: autres === 0 ? null : autresKillsEnClair(autres) }
}

// ─────────────────────────── distance de tes kills ───────────────────────────

/** Distance de tes kills : moyenne et plus long dès 5 kills mesurés (une valeur d'une catégorie, Trop peu de parties), sinon « — ». */
export const MIN_KILLS_DISTANCE = MIN_OCCURRENCES







export type DistanceArme = {
  nom: string
  libelle: string
  kills: number
  mesures: number
  somme: number
  max: number | null
  moyenne: number | null
  plusLong: number | null
  texteMoyenne: string
  textePlusLong: string
  precision: string | null
  phrase: string
}


export function metresEnClair(m: number | null): string {
  return m === null || !Number.isFinite(m) ? TIRET : `${nombreEnClair(m, 0)}${NBSP}m`
}

/**
 * Distance de tes kills (Armes et visée ; récap, section 15) : par arme (nom de HenrikDev ; ni capacité, ni arme sans nom), sur les files à
 * manches, Σ distances ÷ kills mesurés et le plus long, en mètres sans hauteur (`distance` de la réduction) ; un kill sans position reste
 * dans la ligne et sort des kills mesurés. Ordre : kills décroissants, puis nom.
 */
export function distanceDesKills(sel: Selection): DistanceArme[] {
  const parArme = new Map<string, { kills: number; mesures: number; somme: number; max: number | null }>()
  for (const p of retenues(sel.parties, FILES_ARMES)) {
    for (const k of p.kills ?? []) {
      const nom = armeDuKill(k)
      if (nom === null) continue
      const x = parArme.get(nom) ?? { kills: 0, mesures: 0, somme: 0, max: null }
      x.kills++
      const d = k.distance
      if (typeof d === "number" && Number.isFinite(d)) {
        x.mesures++
        x.somme += d
        x.max = x.max === null ? d : Math.max(x.max, d)
      }
      parArme.set(nom, x)
    }
  }
  const lignes = [...parArme].map(([nom, x]): DistanceArme => {
    const assez = x.mesures >= MIN_KILLS_DISTANCE
    const moyenne = assez ? x.somme / x.mesures : null
    const plusLong = assez ? x.max : null
    const precision = x.mesures !== x.kills ? `sur ${nombreEnClair(x.mesures, 0)} kill${x.mesures > 1 ? "s" : ""} mesuré${x.mesures > 1 ? "s" : ""}` : null
    const dites = x.mesures === 0
      ? "aucun kill mesuré"
      : !assez
        ? `${nombreEnClair(x.mesures, 0)} kill${x.mesures > 1 ? "s" : ""} mesuré${x.mesures > 1 ? "s" : ""}, trop peu pour une distance`
        : `${metresEnClair(moyenne)} en moyenne, ${metresEnClair(plusLong)} au plus long${precision === null ? "" : `, ${precision}`}`
    return {
      nom, libelle: effectifEnClair(nom, x.kills), kills: x.kills, mesures: x.mesures, somme: x.somme, max: x.max, moyenne, plusLong,
      texteMoyenne: metresEnClair(moyenne), textePlusLong: metresEnClair(plusLong), precision, phrase: `${nom}, ${killsDits(x.kills)} : ${dites}.`,
    }
  })
  return lignes.sort((a, b) => b.kills - a.kills || a.nom.localeCompare(b.nom, "fr"))
}

// ─────────────────────────── visée à l'entraînement ───────────────────────────

/** Visée à l'entraînement : 8 semaines, celle de maintenant et les 7 d'avant. */
export const SEMAINES_VISEE = 8
/** Les deux séries de la Courbe : le deathmatch (et le match à mort en équipe, que Files admises range avec lui) contre la compétition. */
export type CleSerieVisee = "deathmatch" | "competition"
export const LIBELLES_SERIES_VISEE: Readonly<Record<CleSerieVisee, string>> = { deathmatch: "Deathmatch", competition: "Compétition" }
/** Le texte du bloc sans deathmatch (State Patterns, Aucune partie de deathmatch [HYPOTHÈSE]). */
export const SANS_DEATHMATCH = "Aucune partie de deathmatch ces 8 dernières semaines."


export type PointVisee = { semaine: string; parties: number; toi: Fraction; valeur: number; texte: string }




export type SerieVisee = { cle: CleSerieVisee; libelle: string; parties: number; points: PointVisee[]; texte: string }
/**
 * Ta visée à l'entraînement : les 8 semaines (la plus ancienne d'abord), les deux séries, le sous-titre (maquette, avec les deux effectifs),
 * le texte sans deathmatch (null avec), et la phrase VoiceOver de la Courbe.
 */
export type ViseeEntrainement = {
  semaines: string[]
  deathmatch: SerieVisee
  competition: SerieVisee
  sousTitre: string
  sansDeathmatch: string | null
  phrase: string
}

/** Les 8 semaines ISO à l'heure de l'iPhone, la plus ancienne d'abord : celle de `now` et les 7 d'avant (midi de chaque jour, au-delà des changements d'heure). */
function semainesVisee(now: number): string[] {
  if (!Number.isFinite(now)) return []
  const d = new Date(now)
  const r: string[] = []
  for (let k = SEMAINES_VISEE - 1; k >= 0; k--) r.push(semaineDe(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7 * k, 12).toISOString()))
  return r
}

/** La série d'une partie : deathmatch (deathmatch, match à mort en équipe), compétition, ou aucune. */
function serieVisee(p: Partie): CleSerieVisee | null {
  if (fileAdmise(p.file, "competition")) return "competition"
  return fileAdmise(p.file, "toutes") && !fileAdmise(p.file, "a-manches") ? "deathmatch" : null
}

/** Une série de ses points semaine par semaine. */
function serieDe(cle: CleSerieVisee, parSemaine: ReadonlyMap<string, Fraction[]>, semaines: readonly string[]): SerieVisee {
  const points: PointVisee[] = []
  let parties = 0
  for (const semaine of semaines) {
    const fs = parSemaine.get(semaine)
    if (fs === undefined || fs.length === 0) continue
    const s = additionner(fs)
    const valeur = quotient(s)
    if (valeur === null) continue
    parties += s.parties
    points.push({ semaine, parties: s.parties, toi: { num: s.num, den: s.den }, valeur, texte: pourcentageEnClair(valeur) })
  }
  const texte = points.length === 0 ? TIRET : points.length === 1 ? points[0].texte : `${points[0].texte} → ${points[points.length - 1].texte}`
  return { cle, libelle: LIBELLES_SERIES_VISEE[cle], parties, points, texte }
}


function serieDite(s: SerieVisee): string {
  const nom = s.cle === "deathmatch" ? "en deathmatch" : "en compétition"
  const n = s.points.length
  if (n === 0) return `${nom}, aucune partie`
  const effectifs = `(${nombreEnClair(n, 0)} semaine${n > 1 ? "s" : ""}, ${partiesDites(s.parties)})`
  return n === 1 ? `${nom}, ${s.points[0].texte} ${effectifs}` : `${nom}, de ${s.points[0].texte} à ${s.points[n - 1].texte} ${effectifs}`
}

/**
 * Ta visée à l'entraînement (Armes et visée ; récap, section 16) : Tirs à la tête en deathmatch contre compétition, sur tout l'historique
 * (parties refaites écartées), quel que soit le périmètre, comme la Courbe de la note (le mode Compétition tairait le deathmatch) ; un point
 * par semaine des 8 semaines et par série, rapport de sommes des touches de ses parties (la lecture de Tirs à la tête : une partie sans
 * touche sort), semaines vides sautées. `now` : l'instant de l'iPhone (ms).
 */
export function viseeALEntrainement(historique: readonly Partie[], now: number): ViseeEntrainement {
  const semaines = semainesVisee(now)
  const dans = new Set(semaines)
  const parSerie: Record<CleSerieVisee, Map<string, Fraction[]>> = { deathmatch: new Map(), competition: new Map() }
  for (const p of historique) {
    if (p == null || partieRefaite(p)) continue
    const cle = serieVisee(p)
    if (cle === null) continue
    const semaine = semaineDe(p.debut)
    if (!dans.has(semaine)) continue
    const f = TETE.toi(p)
    if (!lisible(f)) continue
    const fs = parSerie[cle].get(semaine) ?? []
    fs.push(f)
    parSerie[cle].set(semaine, fs)
  }
  const deathmatch = serieDe("deathmatch", parSerie.deathmatch, semaines)
  const competition = serieDe("competition", parSerie.competition, semaines)
  const phrase = deathmatch.points.length === 0 && competition.points.length === 0
    ? "Tirs à la tête sur 8 semaines : aucune partie de deathmatch ni de compétition."
    : `Tirs à la tête sur 8 semaines : ${serieDite(deathmatch)} ; ${serieDite(competition)}.`
  return {
    semaines, deathmatch, competition,
    sousTitre: `% de tête en deathmatch (${partiesDites(deathmatch.parties)}) et en compétition (${partiesDites(competition.parties)}), sur 8 semaines.`,
    sansDeathmatch: deathmatch.parties === 0 ? SANS_DEATHMATCH : null,
    phrase,
  }
}

// ─────────────────────────── une seule partie ───────────────────────────

/**
 * Les chiffres de cette entrée pour une seule partie (concordance), même lecture que sur le périmètre : tes touches données (null sans
 * aucune) et reçues des adversaires (null hors des files à manches ou sans aucune), celles de tes lobbys (de même), tes kills par arme (par
 * ligne de Kills par arme, et tes autres kills ; null hors des files à manches) et ta part de tête pour la visée (deathmatch et compétition
 * seulement ; null ailleurs ou sans touche).
 */
export type ArmesPartie = {
  touchesDonnees: Touches | null
  touchesRecues: Touches | null
  lobbyDonnees: Touches | null
  lobbyRecues: Touches | null
  killsParArme: { lignes: Record<string, number>; autres: number } | null
  visee: ChiffrePartie | null
}

export function armesPartie(p: Partie): ArmesPartie {
  const aManches = fileAdmise(p.file, FILES_ARMES)
  const g = p.groupes?.lobby ?? null
  let killsParArmePartie: ArmesPartie["killsParArme"] = null
  if (aManches) {
    const lignes: Record<string, number> = {}
    let autres = 0
    for (const k of p.kills ?? []) {
      if (!killCompte(k)) continue
      const nom = ligneDuKill(k)
      if (nom === null) autres++
      else lignes[nom] = (lignes[nom] ?? 0) + 1
    }
    killsParArmePartie = { lignes, autres }
  }
  const f = serieVisee(p) === null ? null : TETE.toi(p)
  return {
    touchesDonnees: touchesDonneesDe(p),
    touchesRecues: aManches ? touchesRecuesDe(p) : null,
    lobbyDonnees: g === null ? null : touchesDonneesDuGroupe(g),
    lobbyRecues: g === null || !aManches ? null : touchesRecuesDuGroupe(g),
    killsParArme: killsParArmePartie,
    visee: lisible(f) ? { fraction: f, valeur: quotient(f) } : null,
  }
}

















// ─────────────────────────── types ───────────────────────────

/** Le genre d'un constat, comme la brique Constat de dessin.tsx (GenreConstat) : « Point fort » ou « À travailler ». */
export type GenreDuConstat = "pointFort" | "aTravailler"

/**
 * La famille d'un constat : sa comparaison. `lobbys`, une stat individuelle face à tes lobbys ; `memesAgents`, une capacité ou tes assists
 * avec un agent face aux mêmes agents de tes lobbys ; `periode`, une stat d'équipe face à ta période précédente ; `agents`, un agent face à
 * tes autres agents ; `cartes`, une carte face à tes autres cartes ; `cotes`, l'attaque face à la défense ; `groupe`, en duo ou en groupe
 * face à seul ; `session`, tes 4ᵉ parties et suivantes d'une session face aux trois premières ; `heure`, une tranche horaire face au reste.
 */
export type FamilleConstat = "lobbys" | "memesAgents" | "periode" | "agents" | "cartes" | "cotes" | "groupe" | "session" | "heure"

/** Aucun constat (Component Patterns : « aucun : une phrase ») : la phrase à la place du bloc. */
export const AUCUN_CONSTAT = "Rien ne ressort assez nettement de tes chiffres pour en tirer un constat."










export type ConstatTire = {
  cle: string
  famille: FamilleConstat
  stat: string
  genre: GenreDuConstat
  phrase: string
  situation: string | null
  sujet: string
  valeur: string
  reference: string
  face: string
  ecart: string
  parties: number
  partiesReference: number
  force: number
  agent: string | null
  miroir: string | null
}

/** Les constats d'une surface, points forts d'abord ; `aucun` : AUCUN_CONSTAT quand la liste est vide, null sinon. */
export type ConstatsChoisis = { constats: ConstatTire[]; aucun: string | null }

/** Ce que lisent les constats en plus de la sélection : tout l'historique (sessions, toutes files) et les cumuls par agent (mêmes agents). */
export type SourcesConstats = { historique: readonly Partie[]; cumuls: readonly CumulAgent[] }


export type OptionsConstats = { periodePrecedente?: string }

// ─────────────────────────── écriture ───────────────────────────

// L'écriture d'une valeur et de son écart (Ecriture, ecritureDe, ecartEcrit) est dans les formats (entrée 40).

/** La première lettre en capitale : début de phrase. */
function enTete(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─────────────────────────── jugement d'un candidat ───────────────────────────









export type EntreeConstat = {
  cle: string
  famille: FamilleConstat
  stat: string
  mesure: Mesure
  sens: Sens
  ecriture: Ecriture
  toi: readonly Fraction[]
  reference: readonly Fraction[]
  partiesToi: number
  partiesReference: number
  couleur: Evaluation
  situation: string | null
  sujet: string
  face: string
  partiesPerimetre: number
  unite?: string
  compteReference?: (n: number) => string
  agent?: string | null
  miroir?: string | null
  uniteReference?: "partie" | "cumul"
}

/** Les cumuls des mêmes agents qu'il faut pour tirer une erreur type de leurs propres écarts : autant que de parties pour une couleur. */
export const MIN_CUMULS_ERREUR = MIN_PARTIES_COULEUR

/**
 * L'erreur type de l'écart d'un candidat, √(e₁² + e₂²), chaque côté par `erreurType` (Tendance) ; null, et le candidat écarté, quand un côté
 * n'en a pas. Pour un pourcentage dont un côté vaut 0 % ou 100 %, où p(1 − p) s'annule et tiendrait ce côté pour certain (0 sur 5 contre 6 %
 * passerait), au moins celle de la part commune des deux côtés, √(p̄(1 − p̄)(1 ÷ n₁ + 1 ÷ n₂)). Pour un rapport, chaque côté doit avoir la
 * sienne, non nulle : des parties toutes égales ne disent pas leur dispersion. Les mêmes agents n'ont que des cumuls, sans valeur par partie
 * (Confidentialité) : leur erreur type est au moins e₁ × √(n₁ ÷ n₂), celle de leurs n₂ parties sûres si chacune variait comme les tiennes
 * (un groupe de joueurs différents varie au moins autant qu'un seul joueur ; n₂ est une borne basse de leurs parties), et celle de leurs
 * cumuls seulement s'ils sont au moins 10 (deux cumuls égaux ne disent rien de leur dispersion).
 */
function erreurDuConstat(e: EntreeConstat): number | null {
  const e1 = erreurType(e.toi, e.mesure)
  if (e1 === null) return null
  if (e.mesure.genre === "pourcentage") {
    const e2 = erreurType(e.reference, e.mesure)
    if (e2 === null) return null
    const tendance = Math.sqrt(e1 * e1 + e2 * e2)
    const a = additionner(e.toi), b = additionner(e.reference)
    const extreme = (s: Sommes) => s.num <= 0 || s.num >= s.den
    if (!extreme(a) && !extreme(b)) return tendance
    const p = (a.num + b.num) / (a.den + b.den)
    return Math.max(tendance, Math.sqrt(Math.max(0, p * (1 - p)) * (1 / a.den + 1 / b.den)))
  }
  if (!(e1 > 0)) return null
  let e2: number | null
  if (e.uniteReference === "cumul") {
    const cumuls = e.reference.length >= MIN_CUMULS_ERREUR ? erreurType(e.reference, e.mesure) : null
    e2 = Math.max(e1 * Math.sqrt(e.partiesToi / e.partiesReference), cumuls ?? 0)
  } else {
    e2 = erreurType(e.reference, e.mesure)
  }
  if (e2 === null || !(e2 > 0)) return null
  return Math.sqrt(e1 * e1 + e2 * e2)
}

/**
 * Juge un candidat : null pour une stat de sens neutre, un côté sous 10 parties (ou, pour un pourcentage, sous 5 occurrences), un écart
 * qui ne passe pas le test de la Tendance (seuil de l'Évaluation autour de la référence et 1,5 fois son erreur type, erreurDuConstat), une
 * erreur type absente ou nulle (d'un côté, pour un rapport), une couleur à l'écran qui ne dit pas le genre, ou un écart écrit nul ou de signe contraire ; sinon le constat et sa
 * phrase : « {Situation, }{sujet} : {valeur}{ (n parties)}, contre {référence} {face}{ (m parties)}. », ton compte quand il diffère des
 * parties du périmètre, celui de la référence quand il diffère du tien.
 */
export function jugerConstat(e: EntreeConstat): ConstatTire | null {
  if (e.sens === "neutre") return null
  if (e.partiesToi < MIN_PARTIES_COULEUR || e.partiesReference < MIN_PARTIES_COULEUR) return null
  if (e.mesure.genre === "pourcentage" && (additionner(e.toi).den < MIN_OCCURRENCES || additionner(e.reference).den < MIN_OCCURRENCES)) return null
  const recent = quotient(additionner(e.toi)), ancien = quotient(additionner(e.reference))
  if (recent === null || ancien === null) return null
  const ecart = recent - ancien
  const erreur = erreurDuConstat(e)
  if (erreur === null || !(erreur > 0) || !depasse(Math.abs(ecart), seuil(ancien, e.mesure)) || !depasse(Math.abs(ecart), FACTEUR_ERREUR_TYPE * erreur)) return null
  const mieux = (ecart > 0) === (e.sens === "haut")
  if (e.couleur !== (mieux ? "fort" : "faible")) return null
  const du = e.ecriture.unites(recent) - e.ecriture.unites(ancien)
  if (du === 0 || (du > 0) !== (ecart > 0)) return null
  const valeur = `${e.ecriture.texte(recent)}${e.unite ?? ""}`, reference = e.ecriture.texte(ancien)
  const compteToi = e.partiesToi !== e.partiesPerimetre ? ` (${partiesDites(e.partiesToi)})` : ""
  const compteRef = e.partiesReference !== e.partiesToi ? ` (${(e.compteReference ?? partiesDites)(e.partiesReference)})` : ""
  const debut = e.situation === null ? enTete(e.sujet) : `${enTete(e.situation)}, ${e.sujet}`
  return {
    cle: e.cle,
    famille: e.famille,
    stat: e.stat,
    genre: mieux ? "pointFort" : "aTravailler",
    phrase: `${debut} : ${valeur}${compteToi}, contre ${reference} ${e.face}${compteRef}.`,
    situation: e.situation,
    sujet: e.sujet,
    valeur,
    reference,
    face: e.face,
    ecart: ecartEcrit(recent, ancien, e.ecriture),
    parties: e.partiesToi,
    partiesReference: e.partiesReference,
    force: Math.abs(ecart) / erreur,
    agent: e.agent ?? null,
    miroir: e.miroir ?? null,
  }
}

/** Les constats gardés parmi des candidats jugés. */
function gardes(candidats: readonly (ConstatTire | null)[]): ConstatTire[] {
  const r: ConstatTire[] = []
  for (const c of candidats) if (c !== null) r.push(c)
  return r
}

/** L'ordre des candidats : force décroissante, puis clé. */
function parForce(a: ConstatTire, b: ConstatTire): number {
  return b.force - a.force || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0)
}

/** Les fractions lisibles d'un groupe, une par partie où il est gardé. */
function fractionsDuGroupe(parties: readonly Partie[], quel: Quel, lire: LireGroupe): Fraction[] {
  const fs: Fraction[] = []
  for (const p of parties) {
    const g = p.groupes?.[quel] ?? null
    const f = g === null ? null : lire(g, p)
    if (lisible(f)) fs.push(f)
  }
  return fs
}

/** La clé de miroir de deux catégories (deux agents, deux cartes, deux tranches) : la même dans les deux sens. */
function cleMiroir(famille: FamilleConstat, stat: string, a: string, b: string): string {
  return `${famille}:${stat}:${[a, b].sort().join("|")}`
}

// ─────────────────────────── tes lobbys ───────────────────────────

/** Une stat individuelle face à tes lobbys : sa clé, sa stat, son sujet, son écriture (celle de sa mesure par défaut), et sa stat côté confondu (sa clé par défaut). */
type DefConstatLobbys = { cle: string; stat: Stat; sujet: string; ecriture?: Ecriture; groupe?: string }








const CONSTATS_LOBBYS: readonly DefConstatLobbys[] = [
  { cle: "kd", stat: KD, sujet: "ton K/D" },
  { cle: "score", stat: SCORE, sujet: "ton score de combat" },
  { cle: "degats", stat: DEGATS, sujet: "tes dégâts par manche" },
  { cle: "tete", stat: TETE, sujet: "tes tirs à la tête" },
  { cle: "kast", stat: KAST, sujet: "ton KAST" },
  { cle: "survie", stat: SURVIE, sujet: "tes manches survécues" },
  { cle: "clutchs", stat: CLUTCHS, sujet: "tes clutchs gagnés" },
  { cle: "assists", stat: ASSISTS_PAR_MANCHE, sujet: "tes assists par manche" },
  { cle: "momentAttaque", stat: MOMENT_PREMIERE_MORT.attaque, sujet: `le moment de ta 1${RE} mort en attaque`, ecriture: ECRITURE_SECONDES, groupe: "moment" },
  { cle: "momentDefense", stat: MOMENT_PREMIERE_MORT.defense, sujet: `le moment de ta 1${RE} mort en défense`, ecriture: ECRITURE_SECONDES, groupe: "moment" },
  { cle: "apresPistolet", stat: APRES_PISTOLET_PERDU, sujet: "ton achat forcé après un pistolet perdu" },
]

/** Tes stats individuelles face à tes lobbys : tes fractions et celles de tes lobbys sur les mêmes parties (files admises), la couleur de comparer. */
function candidatsLobbys(sel: Selection): ConstatTire[] {
  return gardes(CONSTATS_LOBBYS.map((d) => {
    const stat = d.stat
    if (stat.reference === "periode") return null
    const parties = retenues(sel.parties, stat.files)
    const toi = fractions(parties, stat.toi), reference = fractionsDuGroupe(parties, stat.reference, stat.groupe)
    return jugerConstat({
      cle: `lobbys:${d.cle}`, famille: "lobbys", stat: d.groupe ?? d.cle, mesure: stat.mesure, sens: stat.sens, ecriture: d.ecriture ?? ecritureDe(stat.mesure),
      toi, reference, partiesToi: toi.length, partiesReference: reference.length, couleur: comparer(sel, stat).evaluation,
      situation: null, sujet: d.sujet, face: "pour tes lobbys", partiesPerimetre: sel.parties.length,
    })
  }))
}

// ─────────────────────────── ta période précédente ───────────────────────────

/** Une stat d'équipe face à ta période précédente : sa clé, sa stat, son sujet, écrite signée (Écart de dégâts), d'Attaque · défense (`cote`). */
type DefConstatPeriode = { cle: string; stat: Stat; sujet: string; signee: boolean; cote: boolean; groupe: string }

/** Une stat d'équipe ; `groupe` : sa stat côté confondu (« premieresMorts » pour les 1ʳᵉˢ morts, en attaque et en défense aussi). */
function defPeriode(cle: string, stat: Stat, sujet: string, cote: boolean, signee: boolean = false, groupe: string = cle): DefConstatPeriode {
  return { cle, stat, sujet, signee, cote, groupe }
}

/** Les stats d'équipe des entrées 2 et 7, chacune une fois ; `cote` : celles d'Attaque · défense (stats par côté, après la pose, Retakes). */
const CONSTATS_PERIODE: readonly DefConstatPeriode[] = [
  defPeriode("victoires", VICTOIRES, "tes victoires", false),
  defPeriode("ecartDegats", ECART_DEGATS, "ton écart de dégâts par manche", false, true),
  defPeriode("premiersKills", PREMIERS_KILLS, `tes 1${ERS} kills par manche`, false),
  defPeriode("premieresMorts", PREMIERES_MORTS, `tes 1${RES} morts par manche`, false),
  defPeriode("ratioPremiersDuels", RATIO_PREMIERS_DUELS, "ton ratio de premiers duels", false),
  defPeriode("ecos", ECOS_GAGNEES, "tes écos gagnées", false),
  defPeriode("retakes", RETAKES, "tes retakes gagnés", true),
  defPeriode("manchesAttaque", STATS_COTES.manchesAttaque, "tes manches gagnées en attaque", true, false, "manches"),
  defPeriode("manchesDefense", STATS_COTES.manchesDefense, "tes manches gagnées en défense", true, false, "manches"),
  defPeriode("pistoletAttaque", STATS_COTES.pistoletAttaque, "tes pistolets gagnés en attaque", true, false, "pistolets"),
  defPeriode("pistoletDefense", STATS_COTES.pistoletDefense, "tes pistolets gagnés en défense", true, false, "pistolets"),
  defPeriode("premiersKillsAttaque", STATS_COTES.premiersKillsAttaque, `tes 1${ERS} kills par manche en attaque`, true, false, "premiersKills"),
  defPeriode("premiersKillsDefense", STATS_COTES.premiersKillsDefense, `tes 1${ERS} kills par manche en défense`, true, false, "premiersKills"),
  defPeriode("premieresMortsAttaque", STATS_COTES.premieresMortsAttaque, `tes 1${RES} morts par manche en attaque`, true, false, "premieresMorts"),
  defPeriode("premieresMortsDefense", STATS_COTES.premieresMortsDefense, `tes 1${RES} morts par manche en défense`, true, false, "premieresMorts"),
  defPeriode("ratioAttaque", STATS_COTES.ratioAttaque, "ton ratio de premiers duels en attaque", true, false, "ratioPremiersDuels"),
  defPeriode("ratioDefense", STATS_COTES.ratioDefense, "ton ratio de premiers duels en défense", true, false, "ratioPremiersDuels"),
  defPeriode("apresPose", STATS_COTES.apresPose, "tes manches gagnées après une pose de ton équipe", true),
]

/** Les clés des constats de période d'Attaque · défense. */
const CLES_PERIODE_COTES: ReadonlySet<string> = new Set(CONSTATS_PERIODE.filter((d) => d.cote).map((d) => `periode:${d.cle}`))

/** Tes stats d'équipe face à ta période précédente (aucune sans elle) : tes fractions et celles d'avant, la couleur de comparer. */
function candidatsPeriode(sel: Selection, options: OptionsConstats): ConstatTire[] {
  const avant = sel.precedentes
  if (avant === null) return []
  const face = options.periodePrecedente ?? PERIODE_EN_MOTS[sel.perimetre.periode] ?? "ta période précédente"
  return gardes(CONSTATS_PERIODE.map((d) => {
    const stat = d.stat
    const toi = fractions(retenues(sel.parties, stat.files), stat.toi), reference = fractions(retenues(avant, stat.files), stat.toi)
    return jugerConstat({
      cle: `periode:${d.cle}`, famille: "periode", stat: d.groupe, mesure: stat.mesure, sens: stat.sens, ecriture: ecritureDe(stat.mesure, d.signee),
      toi, reference, partiesToi: toi.length, partiesReference: reference.length, couleur: comparer(sel, stat).evaluation,
      situation: null, sujet: d.sujet, face, partiesPerimetre: sel.parties.length,
    })
  }))
}

// ─────────────────────────── agents ───────────────────────────

/** Les sujets de Face à tes autres agents. */
const SUJETS_AUTRES_AGENTS: Readonly<Record<LigneAutresAgents["cle"], string>> = { kd: "ton K/D", score: "ton score de combat", premieresMorts: `tes 1${RES} morts par manche` }

/** Le compte des mêmes agents : leurs parties sûres, une borne basse (partiesDesMemesAgents). */
function auMoins(n: number): string {
  return `au moins ${partiesDites(n)}`
}

/** Les fractions des mêmes agents, une par cumul (semaine × file), faute de valeur par partie (Confidentialité), et leurs parties sûres. */
function unitesDesCumuls(cumuls: readonly CumulAgent[], lire: LireCumul): { fs: Fraction[]; parties: number } {
  const fs: Fraction[] = []
  let parties = 0
  for (const c of cumuls) {
    const s = lire(c)
    if (s === null || !Number.isFinite(s.num) || !Number.isFinite(s.den) || !Number.isFinite(s.parties)) continue
    fs.push({ num: s.num, den: s.den })
    parties += s.parties
  }
  return { fs, parties }
}

/**
 * Les candidats d'agents, pour les agents `ids` (tous ceux du périmètre par défaut) : K/D, Score et 1ʳᵉˢ morts avec l'agent face à tes autres
 * agents (couleur de faceATesAutresAgents) ; C, Q, E (par manche), X (par partie) et assists face aux mêmes agents de tes lobbys (couleur de
 * capacitesAgent), leurs cumuls pour unités.
 */
function candidatsAgents(sel: Selection, cumuls: readonly CumulAgent[], ids: readonly string[] | null): ConstatTire[] {
  const joues = agentsJoues(sel)
  const choisis = ids === null ? joues : joues.filter((a) => ids.some((id) => cleAgent(id) === cleAgent(a.id)))
  const memesDuPerimetre = cumulsDuPerimetre(sel, cumuls, FILES_CAPACITES)
  const r: (ConstatTire | null)[] = []
  for (const a of choisis) {
    const cle = cleAgent(a.id)
    const siennes = partiesDeLAgent(sel.parties, a.id)
    const autres = partiesDesAutresAgents(sel.parties, a.id)
    const lignes = faceATesAutresAgents(sel, a.id)
    for (const d of FACE_AUX_AUTRES) {
      // Le miroir se compte sur les files de la stat : un agent joué seulement en deathmatch n'est pas dans le Score.
      const autresDeLaStat = retenues(autres, d.stat.files)
      const autresAgents = new Set(autresDeLaStat.map((p) => cleAgent(agentDe(p)!.id)))
      const seul = autresAgents.size === 1 ? [...autresAgents][0] : null
      const toi = fractions(retenues(siennes, d.stat.files), d.stat.toi), reference = fractions(autresDeLaStat, d.stat.toi)
      r.push(jugerConstat({
        cle: `agents:${cle}:${d.cle}`, famille: "agents", stat: d.cle, mesure: d.stat.mesure, sens: d.stat.sens, ecriture: ecritureDe(d.stat.mesure),
        toi, reference, partiesToi: toi.length, partiesReference: reference.length,
        couleur: lignes.find((l) => l.cle === d.cle)?.evaluation ?? "neutre",
        situation: `avec ${a.nom}`, sujet: SUJETS_AUTRES_AGENTS[d.cle], face: "avec tes autres agents", partiesPerimetre: sel.parties.length,
        agent: cle, miroir: seul === null ? null : cleMiroir("agents", d.cle, cle, seul),
      }))
    }
    const caps = capacitesAgent(sel, cumuls, a.id)
    const sienneCapacites = retenues(siennes, FILES_CAPACITES)
    const memes = cumulsDeLAgent(memesDuPerimetre, a.id)
    const face = `pour les ${a.nom} de tes lobbys`
    for (const k of CLES_CAPACITES) {
      const parManche = k !== "x"
      const toi = fractions(sienneCapacites, capaciteDeToi(k, parManche)), groupe = unitesDesCumuls(memes, capaciteDuCumul(k, parManche))
      r.push(jugerConstat({
        cle: `memesAgents:${cle}:${k}`, famille: "memesAgents", stat: k, uniteReference: "cumul", mesure: PAR_MANCHE, sens: "haut",
        ecriture: ecritureDe(PAR_MANCHE), unite: parManche ? " par manche" : " par partie",
        toi, reference: groupe.fs, partiesToi: toi.length, partiesReference: groupe.parties,
        couleur: caps.capacites.find((x) => x.cle === k)?.comparaison.evaluation ?? "neutre",
        situation: `avec ${a.nom}`, sujet: `ta capacité ${TOUCHES[k]}`, face, partiesPerimetre: sel.parties.length, compteReference: auMoins, agent: cle,
      }))
    }
    const toi = fractions(sienneCapacites, ASSISTS_PAR_MANCHE.toi), groupe = unitesDesCumuls(memes, assistsDuCumul)
    r.push(jugerConstat({
      cle: `memesAgents:${cle}:assists`, famille: "memesAgents", stat: "assists", uniteReference: "cumul", mesure: PAR_MANCHE, sens: "haut", ecriture: ecritureDe(PAR_MANCHE), unite: " par manche",
      toi, reference: groupe.fs, partiesToi: toi.length, partiesReference: groupe.parties, couleur: caps.assists.comparaison.evaluation,
      situation: `avec ${a.nom}`, sujet: "tes assists", face, partiesPerimetre: sel.parties.length, compteReference: auMoins, agent: cle,
    }))
  }
  return gardes(r)
}

// ─────────────────────────── cartes et côtés ───────────────────────────

/** Tes victoires sur une carte face à tes autres cartes (files complètes, carte connue), couleur de Toutes tes cartes (55 % / 45 %). */
function candidatsCartes(sel: Selection): ConstatTire[] {
  const cartes = cartesJouees(sel)
  const lignes = toutesTesCartes(sel)
  const connues = retenues(sel.parties, "completes").filter((p) => cleCarte(p.carte) !== null)
  return gardes(cartes.map((c) => {
    const cle = c.id.toLowerCase()
    const siennes = partiesDeLaCarte(sel.parties, c.id)
    const autres = connues.filter((p) => cleCarte(p.carte) !== cle)
    const toi = fractions(siennes, VICTOIRES.toi), reference = fractions(autres, VICTOIRES.toi)
    const seule = cartes.length === 2 ? cartes.find((x) => x.id.toLowerCase() !== cle)!.id.toLowerCase() : null
    return jugerConstat({
      cle: `cartes:${cle}`, famille: "cartes", stat: "victoires", mesure: VICTOIRES.mesure, sens: VICTOIRES.sens, ecriture: ecritureDe(VICTOIRES.mesure),
      toi, reference, partiesToi: toi.length, partiesReference: reference.length,
      couleur: lignes.find((l) => l.id === c.id)?.victoires.evaluation ?? "neutre",
      situation: `sur ${c.nom}`, sujet: "tes victoires", face: "sur tes autres cartes", partiesPerimetre: sel.parties.length,
      miroir: seule === null ? null : cleMiroir("cartes", "victoires", cle, seule),
    })
  }))
}

/**
 * Tes manches gagnées en attaque face à la défense, sur les mêmes parties, carte par carte : la Case colorée (55 % / 45 %) est la seule
 * couleur de ta valeur sur une carte. Pas d'ensemble : Manches par côté colore tes manches d'ensemble face à ta période précédente, et leurs
 * constats sont ceux de la période (`periode:manchesAttaque`, `periode:manchesDefense`) ; une carte qui a toutes les parties à côtés n'en a
 * pas non plus, sa valeur étant celle de l'ensemble.
 */
function candidatsCotes(sel: Selection): ConstatTire[] {
  const attaque = STATS_DU_COTE.attaque.manches, defense = STATS_DU_COTE.defense.manches
  const ensemble = fractions(retenues(sel.parties, attaque.files), attaque.toi).length
  const r: (ConstatTire | null)[] = []
  for (const l of parCarte(sel)) {
    const siennes = partiesDeLaCarte(sel.parties, l.id)
    const toi = fractions(siennes, attaque.toi), reference = fractions(siennes, defense.toi)
    if (toi.length === ensemble) continue
    r.push(jugerConstat({
      cle: `cotes:${l.id.toLowerCase()}`, famille: "cotes", stat: "manches", mesure: POURCENTAGE, sens: "haut", ecriture: ecritureDe(POURCENTAGE),
      toi, reference, partiesToi: toi.length, partiesReference: reference.length, couleur: l.attaque.evaluation,
      situation: `sur ${l.carte}, en attaque`, sujet: "tes manches gagnées", face: "en défense", partiesPerimetre: sel.parties.length,
    }))
  }
  return gardes(r)
}

// ─────────────────────────── seul ou en duo ───────────────────────────

/** Tes victoires et ton K/D en duo, puis en groupe de 3 et plus, face à seul (couleurs de Seul ou en duo). */
function candidatsGroupe(sel: Selection): ConstatTire[] {
  const barres = seulOuEnDuo(sel)
  const seul = sel.parties.filter((p) => categorieDeGroupe(p.groupe) === "seul")
  const r: (ConstatTire | null)[] = []
  for (const cle of ["duo", "groupe"] as const) {
    const barre = barres.find((b) => b.cle === cle)
    if (barre === undefined) continue
    const parties = sel.parties.filter((p) => categorieDeGroupe(p.groupe) === cle)
    const defs: readonly { k: string; stat: Stat; sujet: string; couleur: Evaluation }[] = [
      { k: "victoires", stat: VICTOIRES, sujet: "tes victoires", couleur: barre.victoires.evaluation },
      { k: "kd", stat: KD, sujet: "ton K/D", couleur: barre.kd.evaluation },
    ]
    for (const d of defs) {
      const toi = fractions(retenues(parties, d.stat.files), d.stat.toi), reference = fractions(retenues(seul, d.stat.files), d.stat.toi)
      r.push(jugerConstat({
        cle: `groupe:${cle}:${d.k}`, famille: "groupe", stat: d.k, mesure: d.stat.mesure, sens: d.stat.sens, ecriture: ecritureDe(d.stat.mesure),
        toi, reference, partiesToi: toi.length, partiesReference: reference.length, couleur: d.couleur,
        situation: cle === "duo" ? "en duo" : "en groupe de 3 et plus", sujet: d.sujet, face: "seul", partiesPerimetre: sel.parties.length,
      }))
    }
  }
  return gardes(r)
}

// ─────────────────────────── session et heure ───────────────────────────


const QUATRIEME = `4${String.fromCharCode(0x1d49)}`


function heureDite(h: number): string {
  return h === 0 || h === 24 ? "minuit" : `${h}${NBSP}h`
}

/**
 * Ton Score de combat de tes 4ᵉ parties et suivantes d'une session face aux trois premières (couleur des suivantes de Quand tu joues le mieux),
 * puis celui de chaque tranche horaire face au reste du temps (couleur de la tranche, face à ton Score du périmètre).
 */
function candidatsSessionEtHeure(sel: Selection, historique: readonly Partie[]): ConstatTire[] {
  const quand = quandTuJouesLeMieux(sel, historique)
  const places = sessions(historique)
  const score = (parties: readonly Partie[]) => fractions(retenues(parties, SCORE.files), SCORE.toi)
  const rangDe = (p: Partie) => places.get(p.matchId)?.rang ?? null
  const premieres = sel.parties.filter((p) => {
    const r = rangDe(p)
    return r !== null && r <= PARTIES_DEBUT_SESSION
  })
  const suivantes = sel.parties.filter((p) => {
    const r = rangDe(p)
    return r !== null && r > PARTIES_DEBUT_SESSION
  })
  const base = { famille: "session" as const, stat: "score", mesure: SCORE.mesure, sens: SCORE.sens, ecriture: ecritureDe(SCORE.mesure), sujet: "ton score de combat", partiesPerimetre: sel.parties.length }
  const s1 = score(suivantes), s0 = score(premieres)
  const r: (ConstatTire | null)[] = [jugerConstat({
    ...base, cle: "session", toi: s1, reference: s0, partiesToi: s1.length, partiesReference: s0.length, couleur: quand.suivantes.evaluation,
    situation: `à partir de ta ${QUATRIEME} partie d'une session`, face: "sur tes trois premières parties",
  })]
  // Le miroir se compte sur les files du Score : une tranche vue seulement en deathmatch n'y est pas.
  const vues = new Set<CleTranche>()
  for (const p of retenues(sel.parties, SCORE.files)) {
    const t = trancheDe(p)
    if (t !== null) vues.add(t)
  }
  for (const t of TRANCHES) {
    const tranche = quand.tranches.find((x) => x.cle === t.cle)
    if (tranche === undefined) continue
    const siennes = sel.parties.filter((p) => trancheDe(p) === t.cle)
    const autres = sel.parties.filter((p) => {
      const x = trancheDe(p)
      return x !== null && x !== t.cle
    })
    const toi = score(siennes), reference = score(autres)
    const seule = vues.size === 2 ? [...vues].find((x) => x !== t.cle)! : null
    r.push(jugerConstat({
      ...base, famille: "heure", cle: `heure:${t.cle}`, toi, reference, partiesToi: toi.length, partiesReference: reference.length, couleur: tranche.evaluation,
      situation: `entre ${heureDite(t.de)} et ${heureDite(t.a)}`, face: "le reste du temps",
      miroir: seule === null ? null : cleMiroir("heure", "score", t.cle, seule),
    }))
  }
  return gardes(r)
}

// ─────────────────────────── candidats et surfaces ───────────────────────────

/** Tous les constats gardés sur la sélection, de toutes les familles, du plus fort au moins fort (force, puis clé), doublons compris : chaque surface les écarte (sansDoublon). */
export function candidatsConstats(sel: Selection, sources: SourcesConstats, options: OptionsConstats = {}): ConstatTire[] {
  return [
    ...candidatsLobbys(sel),
    ...candidatsPeriode(sel, options),
    ...candidatsAgents(sel, sources.cumuls, null),
    ...candidatsCartes(sel),
    ...candidatsCotes(sel),
    ...candidatsGroupe(sel),
    ...candidatsSessionEtHeure(sel, sources.historique),
  ].sort(parForce)
}

/**
 * Les candidats classés qu'une surface peut montrer ensemble : au plus un par famille et par stat, côté confondu, le plus fort (deux tranches
 * horaires, deux cartes, tes 1ʳᵉˢ morts et tes 1ʳᵉˢ morts en attaque disent un même fait vu de deux bouts), et jamais le miroir d'un constat
 * gardé (le même fait à l'envers).
 */
function sansDoublon(candidats: readonly ConstatTire[]): ConstatTire[] {
  const vus = new Set<string>()
  const r: ConstatTire[] = []
  for (const c of candidats) {
    const cle = `${c.famille}:${c.stat}`
    if (vus.has(cle) || (c.miroir !== null && vus.has(c.miroir))) continue
    vus.add(cle)
    if (c.miroir !== null) vus.add(c.miroir)
    r.push(c)
  }
  return r
}

/**
 * Choisit `forts` points forts puis `aTravailler` points à travailler parmi des candidats classés, sans doublon (sansDoublon), chacun dans
 * son ordre ; moins de candidats : ceux qui existent ; aucun : AUCUN_CONSTAT.
 */
function choisir(candidats: readonly ConstatTire[], forts: number, aTravailler: number): ConstatsChoisis {
  const uniques = sansDoublon(candidats)
  const pris = [
    ...uniques.filter((c) => c.genre === "pointFort").slice(0, forts),
    ...uniques.filter((c) => c.genre === "aTravailler").slice(0, aTravailler),
  ]
  return { constats: pris, aucun: pris.length === 0 ? AUCUN_CONSTAT : null }
}

/** Le plus fort des candidats, de l'un ou l'autre genre ; aucun : AUCUN_CONSTAT. */
function lePlusFort(candidats: readonly ConstatTire[]): ConstatsChoisis {
  const c = [...candidats].sort(parForce)[0]
  return c === undefined ? { constats: [], aucun: AUCUN_CONSTAT } : { constats: [c], aucun: null }
}

/** Ce que disent tes chiffres, dans la Vue d'ensemble (entrée 19) : un Point fort et deux À travailler. */
export function constatsVueDEnsemble(sel: Selection, sources: SourcesConstats): ConstatsChoisis {
  return choisir(candidatsConstats(sel, sources), 1, 2)
}

/** Les constats du récap (epic-stats-recap, section 17) : deux points forts et trois à travailler ; `options` : le nom de la période précédente d'Autre. */
export function constatsRecap(sel: Selection, sources: SourcesConstats, options: OptionsConstats = {}): ConstatsChoisis {
  return choisir(candidatsConstats(sel, sources, options), 2, 3)
}

/** Le constat d'Agents (entrée 24) pour l'agent choisi : le plus fort de ses candidats (autres agents, mêmes agents de tes lobbys). */
export function constatAgent(sel: Selection, sources: SourcesConstats, id: string): ConstatsChoisis {
  return lePlusFort(candidatsAgents(sel, sources.cumuls, [id]))
}

/** Le constat d'Attaque · défense (entrée 29) : le plus fort des côtés carte par carte et des stats d'équipe par côté face à ta période précédente. */
export function constatAttaqueDefense(sel: Selection, options: OptionsConstats = {}): ConstatsChoisis {
  return lePlusFort([...candidatsCotes(sel), ...candidatsPeriode(sel, options).filter((c) => CLES_PERIODE_COTES.has(c.cle))])
}
