
























import type { Cote, Partie } from "./reduction"
import {
  TIRET, effectifEnClair, libelleReference, nombreEnClair, palierMoyen, retenues,
  type Evaluation, type Files, type Fraction, type LirePartie, type Selection,
} from "./metriques"
import {
  PEU_DE_DONNEES, chiffreDAnalyse, chiffreDEquipe, partiesDAutresFiles, statDEquipe, type ChiffreAnalyse, type ChiffreDEquipe, type StatDEquipe,
} from "./analyses"

/** Espace insécable : entre un nombre et son mot, devant « : ». */
const NBSP = String.fromCharCode(0xa0)
/** Signe moins (U+2212), tel que l'écrit ecartDe. */
const MOINS = String.fromCharCode(0x2212)


function compte(n: number, mot: string): string {
  return `${nombreEnClair(n, 0)}${NBSP}${mot}${n > 1 ? "s" : ""}`
}
/** Des mots en liste : « a », « a et b », « a, b et c ». */
function enListe(mots: readonly string[]): string {
  return mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}` : mots.length === 1 ? mots[0] : ""
}

// ─────────────────────────── files, titres et textes fixes ───────────────────────────

/** Les files des analyses 12 et 14 : les complètes (analyses-entrainement.md, Règles communes). */
export const FILES_CONDITIONS: Files = "completes"
/** Les files de l'analyse 13 : la compétition seule (seuls ses joueurs ont un rang gardé). */
export const FILES_RANG_DU_LOBBY: Files = "competition"
/** Ton palier n'est un rang qu'à partir de 3 (Fer 1) : en dessous, non classé ou en placement. */
const PALIER_CLASSE = 3

/** Titre du bloc (maquette Évolution), en capitales par le Bloc. */
export const TITRE_CONDITIONS = "Dans quelles conditions tu gagnes"
/** Étiquettes des trois groupes (maquette), plus de trois mots : en casse de phrase ; celle du détail par compo, en capitales. */
export const ETIQUETTE_RANG = "Selon le rang de ton lobby"
export const ETIQUETTE_COTE = "Selon ton côté de départ"
export const ETIQUETTE_COMPO = "Selon la compo de ton équipe"
export const ETIQUETTE_PAR_COMPO = "Par compo"

/** Aucune partie des files complètes dans la période : la phrase du bloc, à la place de tout. */
export const SANS_PARTIE_COMPLETE = `Aucune partie de cette période ne compte ici${NBSP}: seuls la compétition, le non classé, la vélocité et Premier y entrent.`
/** Le rang du lobby en mode Non classé : la sélection ne lit aucune partie de compétition. */
export const RANG_MODE_NON_CLASSE = `Le rang du lobby ne se lit qu'en compétition${NBSP}: il paraît en mode Compétition ou Tout.`
/** Le rang du lobby en mode Tout, sans aucune partie de compétition dans la période (toutes lues). */
export const RANG_HORS_COMPETITION = `Le rang du lobby ne se lit qu'en compétition${NBSP}: aucune partie de compétition dans cette période.`
/** Ce qui manque à une partie pour chaque groupe, dit dans la phrase d'un groupe sans partie (avec son possessif). */
export const MANQUE_RANG = "ton rang avec ceux de tout le lobby"
export const MANQUE_COTE = "son côté de départ"
export const MANQUE_COMPO = "la compo de ton équipe"

/**
 * La phrase d'un groupe dont aucune partie ne se range, sur les parties que le bloc compte (`debut` : « Aucune partie comptée ici »),
 * selon ce qui leur manque : toutes sans résultat, « n'a son résultat » ; aucune sans résultat, « n'a {manque} » ; les deux à la fois,
 * « n'a à la fois son résultat et {manque} ».
 */
export function videDuGroupe(debut: string, sansResultat: number, total: number, manque: string): string {
  if (sansResultat >= total) return `${debut} n'a son résultat.`
  return sansResultat === 0 ? `${debut} n'a ${manque}.` : `${debut} n'a à la fois son résultat et ${manque}.`
}
const COMPTEE_ICI = "Aucune partie comptée ici"
const COMPETITION_COMPTEE_ICI = "Aucune partie de compétition comptée ici"

/** Méthodes, dites dans la note. */
export const METHODE_RANG = `Rang du lobby${NBSP}: rang moyen des autres joueurs classés de la partie, alliés et adversaires réunis, arrondi à la division, face à ton rang de la partie${NBSP}; à ton rang${NBSP}: même division${NBSP}; en compétition seulement.`
export const METHODE_COTE = `Côté de départ${NBSP}: celui de ton équipe à la première manche.`
export const METHODE_COMPO = `Compo${NBSP}: les rôles des agents de ton équipe, toi compris${NBSP}; avec un contrôleur${NBSP}: au moins un.`
export const NOTE_TIRET = `«${NBSP}${TIRET}${NBSP}»${NBSP}: ${PEU_DE_DONNEES}, moins de 5 parties.`
export const NOTE_FILES = "Files : compétition, non classé, vélocité et Premier"

// ─────────────────────────── lectures d'une partie ───────────────────────────

/** Les trois tranches du rang du lobby (seuil de l'entrée 1) : au-dessus du tien, à ton rang (même division), en dessous. */
export type CleRang = "dessus" | "egal" | "dessous"
export const CLES_RANG: readonly CleRang[] = ["dessus", "egal", "dessous"]
/** Avec un contrôleur dans la compo de ton équipe, ou sans. */
export type CleCompo = "avec" | "sans"
export const CLES_COMPO: readonly CleCompo[] = ["avec", "sans"]
export const CLES_COTE: readonly Cote[] = ["attaque", "defense"]

/** Une somme de rangs lisible (somme et effectif finis, effectif positif). */
function sommeLisible(s: { somme: number; effectif: number } | null | undefined): s is { somme: number; effectif: number } {
  return s != null && Number.isFinite(s.somme) && Number.isFinite(s.effectif) && s.effectif > 0
}

/** Ton palier de la partie, s'il est un rang (dès Fer 1) ; null sinon. */
function tonPalier(p: Partie): number | null {
  const id = p.rang?.id
  return typeof id === "number" && Number.isInteger(id) && id >= PALIER_CLASSE ? id : null
}

/**
 * Pourquoi une partie de compétition sort du rang du lobby : `sansTonRang` (non classé, en placement, rang absent), `lobbyIncomplet` (un
 * camp ou les deux sans rangs gardés : moins de 3 classés autres que toi) ; null quand elle s'y range, ou hors de la compétition.
 */
export type RaisonSansRang = "sansTonRang" | "lobbyIncomplet"
export function raisonSansRang(p: Partie): RaisonSansRang | null {
  if (p.file !== "competitive") return null
  if (tonPalier(p) === null) return "sansTonRang"
  return ecartDuLobby(p) === null ? "lobbyIncomplet" : null
}

/**
 * L'écart, en divisions, entre le rang moyen des autres joueurs classés (les deux camps réunis, arrondi à la division) et ton rang de
 * la partie ; null hors de la compétition, sans ton rang, ou sans les rangs gardés des deux camps.
 */
export function ecartDuLobby(p: Partie): number | null {
  if (p.file !== "competitive") return null
  const moi = tonPalier(p)
  const a = p.rangsAllies, b = p.rangsAdversaires
  if (moi === null || !sommeLisible(a) || !sommeLisible(b)) return null
  const lobby = palierMoyen({ somme: a.somme + b.somme, effectif: a.effectif + b.effectif })
  return lobby === null ? null : lobby - moi
}

/** La tranche du lobby d'une partie : au-dessus du tien, à ton rang, en dessous ; null quand la partie ne s'y range pas. */
export function trancheDuLobby(p: Partie): CleRang | null {
  const e = ecartDuLobby(p)
  return e === null ? null : e > 0 ? "dessus" : e === 0 ? "egal" : "dessous"
}

/** Le côté de ton équipe à la manche 1 ; null sans manche 1 ou sans côté (escarmouche, partie gardée sans lui). */
export function coteDeDepart(p: Partie): Cote | null {
  const m = (p.manches ?? []).find((x) => x.numero === 1)
  return m?.cote === "attaque" || m?.cote === "defense" ? m.cote : null
}

/** La compo de ton équipe a-t-elle au moins un contrôleur ; null sans compo (deathmatch, moins de 3 alliés). */
export function aUnControleur(p: Partie): boolean | null {
  const c = p.compo
  if (c == null || typeof c !== "object") return null
  const n = c.Controller
  return typeof n === "number" && n > 0
}

/** Ta partie gagnée : 1 sur 1 si victoire, 0 sur 1 sinon ; null sans résultat. */
function victoire(p: Partie): Fraction | null {
  return p.resultat == null ? null : { num: p.resultat === "victoire" ? 1 : 0, den: 1 }
}
/** La lecture des victoires des seules parties d'une condition. */
function victoiresSi(dans: (p: Partie) => boolean): LirePartie {
  return (p) => (dans(p) ? victoire(p) : null)
}

/** Les sept stats d'équipe, déclarées une fois (comparer() les garde par identité) : part des parties gagnées de chaque condition. */
export const STATS_RANG: Readonly<Record<CleRang, StatDEquipe>> = {
  dessus: statDEquipe(victoiresSi((p) => trancheDuLobby(p) === "dessus"), FILES_RANG_DU_LOBBY),
  egal: statDEquipe(victoiresSi((p) => trancheDuLobby(p) === "egal"), FILES_RANG_DU_LOBBY),
  dessous: statDEquipe(victoiresSi((p) => trancheDuLobby(p) === "dessous"), FILES_RANG_DU_LOBBY),
}
export const STATS_COTE: Readonly<Record<Cote, StatDEquipe>> = {
  attaque: statDEquipe(victoiresSi((p) => coteDeDepart(p) === "attaque"), FILES_CONDITIONS),
  defense: statDEquipe(victoiresSi((p) => coteDeDepart(p) === "defense"), FILES_CONDITIONS),
}
export const STATS_COMPO: Readonly<Record<CleCompo, StatDEquipe>> = {
  avec: statDEquipe(victoiresSi((p) => aUnControleur(p) === true), FILES_CONDITIONS),
  sans: statDEquipe(victoiresSi((p) => aUnControleur(p) === false), FILES_CONDITIONS),
}

// ─────────────────────────── compo en clair ───────────────────────────

/** Les rôles du catalogue (displayName anglais), dans l'ordre où la compo les dit, et leur nom en minuscules, au singulier. */
const ORDRE_DES_ROLES: readonly (readonly [string, string])[] = [
  ["Duelist", "duelliste"], ["Initiator", "initiateur"], ["Controller", "contrôleur"], ["Sentinel", "sentinelle"],
]


export function compoEnClair(compo: Readonly<Record<string, number>>): string {
  const connus = new Set(ORDRE_DES_ROLES.map(([r]) => r))
  const morceaux: string[] = []
  for (const [role, nom] of ORDRE_DES_ROLES) {
    const n = compo[role]
    if (typeof n === "number" && n > 0) morceaux.push(compte(n, nom))
  }
  for (const role of Object.keys(compo).filter((r) => !connus.has(r)).sort()) {
    const n = compo[role]
    if (typeof n === "number" && n > 0) morceaux.push(`${nombreEnClair(n, 0)}${NBSP}${role}`)
  }
  return morceaux.join(", ")
}


function cleDeCompo(compo: Readonly<Record<string, number>>): string {
  return Object.keys(compo).sort().map((r) => `${r}:${compo[r]}`).join(",")
}

// ─────────────────────────── types de l'écran ───────────────────────────

/** Un Chiffre tel que l'écran le pose (forme de ChiffreDuels de duels.tsx). */
export type ChiffreCondition = { cle: string; libelle: string; valeur: string; sousTexte: string | null; evaluation: Evaluation; voix: string }

/** Un groupe du bloc : son étiquette, ses Chiffres, ou sa phrase à leur place (`vide`). */
export type GroupeConditions = { readonly cle: "rang" | "cote" | "compo"; readonly etiquette: string; readonly chiffres: readonly ChiffreCondition[]; readonly vide: string | null }

/** Une ligne du détail par compo (ligne détaillée) : sa compo, ses parties et victoires, sa part (neutre), son libellé, son détail, sa voix. */
export type LigneCompo = {
  readonly compo: Readonly<Record<string, number>>
  readonly parties: number
  readonly victoires: number
  readonly part: ChiffreAnalyse
  readonly libelle: string
  readonly detail: string
  readonly voix: string
}

/**
 * Dans quelles conditions tu gagnes, sur la sélection : les parties des files complètes (`completes`) et celles d'autres files
 * (`horsFiles`) ; les parties de compétition (`competition`) ; les sept chiffres d'équipe ; les retraits comptés (`sansResultat` sur les
 * files complètes, `sansTonRang` et `lobbyIncomplet` sur la compétition, `sansCote`, `sansCompo`) ; le détail par compo ; les groupes
 * de l'écran, la note et la phrase du bloc (`vide`, null dès une partie des files complètes) ; ta période précédente en mots (null en Tout).
 */
export type Conditions = {
  readonly completes: number
  readonly horsFiles: number
  readonly competition: number
  readonly rang: Readonly<Record<CleRang, ChiffreDEquipe>>
  readonly cote: Readonly<Record<Cote, ChiffreDEquipe>>
  readonly compo: Readonly<Record<CleCompo, ChiffreDEquipe>>
  readonly sansResultat: number
  readonly sansTonRang: number
  readonly lobbyIncomplet: number
  readonly sansCote: number
  readonly sansCompo: number
  readonly compos: readonly LigneCompo[]
  readonly groupes: readonly GroupeConditions[]
  readonly note: string | null
  readonly vide: string | null
  readonly avant: string | null
}

// ─────────────────────────── textes d'un chiffre ───────────────────────────

/** La référence d'un écart telle que l'écrit ecartDe, puis telle que la dit VoiceOver. */
const REFERENCES_DITES: readonly (readonly [string, string])[] = [
  [" vs semaine d'avant", " par rapport à la semaine d'avant"],
  [" vs mois d'avant", " par rapport au mois d'avant"],
  [" vs acte d'avant", " par rapport à l'acte d'avant"],
]

const POINTS = new RegExp(`(\\d+)${NBSP}pts?(?!\\p{L})`, "gu")


export function ecartDit(ecart: string): string {
  let t = ecart
  for (const [ecrit, dit] of REFERENCES_DITES) {
    const i = t.indexOf(ecrit)
    if (i >= 0) {
      t = t.slice(0, i) + dit + t.slice(i + ecrit.length)
      break
    }
  }
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t.replace(POINTS, (_tout: string, n: string) => `${n} point${Number(n) >= 2 ? "s" : ""}`)
}


function victoiresEnClair(n: number): string {
  return n === 0 ? "aucune victoire" : `${nombreEnClair(n, 0)}${NBSP}${n > 1 ? "victoires" : "victoire"}`
}






function chiffreCondition(cle: string, libelle: string, dit: string, c: ChiffreDEquipe): ChiffreCondition {
  const base = c.den === 0 ? "aucune partie"
    : c.mention !== null ? `${c.mention} : ${compte(c.den, "partie")}`
    : `${victoiresEnClair(c.num)} sur ${compte(c.den, "partie")}`
  const raison = c.raison === null || (c.raison.cause === "cas" && c.mention !== null && c.raison.texte.endsWith("sur la période")) ? null : c.raison.texte
  const suite = c.ecart ?? raison
  const sousTexte = suite === null ? base : `${base}, ${suite}`
  const dite = suite === null ? base : `${base}, ${c.ecart !== null ? ecartDit(c.ecart) : suite}`
  const voix = c.valeur !== null ? `${dit} : ${c.texte}, ${dite}.` : c.mention !== null && c.den > 0 ? `${dit}, ${dite}.` : `${dit} : ${dite}.`
  return { cle, libelle, valeur: c.texte, sousTexte, evaluation: c.ecart === null ? "neutre" : c.evaluation, voix }
}

/** Libellés de chaque condition : écrit (maquette, sous son étiquette) et dit (seul, à VoiceOver). */
const LIBELLES_RANG: Readonly<Record<CleRang, readonly [string, string]>> = {
  dessus: ["Au-dessus du tien", "Lobby au-dessus de ton rang"],
  egal: ["À ton rang", "Lobby à ton rang"],
  dessous: ["En dessous", "Lobby en dessous de ton rang"],
}
const LIBELLES_COTE: Readonly<Record<Cote, readonly [string, string]>> = {
  attaque: ["Attaque d'abord", "Départ en attaque"],
  defense: ["Défense d'abord", "Départ en défense"],
}
const LIBELLES_COMPO: Readonly<Record<CleCompo, readonly [string, string]>> = {
  avec: ["Avec un contrôleur", "Équipe avec un contrôleur"],
  sans: ["Sans contrôleur", "Équipe sans contrôleur"],
}

/** Ta période précédente en tête de phrase (« Le mois d'avant ») ; null en Tout. */
function avantEnMots(sel: Selection): string | null {
  const libelle = libelleReference("periode", sel.perimetre.periode)
  if (libelle === null) return null
  const mots = libelle.replace(/^vs /, "")
  return mots.startsWith("semaine") ? `La ${mots}` : mots.startsWith("acte") ? `L'${mots}` : `Le ${mots}`
}

// ─────────────────────────── détail par compo ───────────────────────────

/** Rang d'une ligne : part écrite décroissante, puis « — » par effectif décroissant, puis compo. */
function ordreDesCompos(a: LigneCompo, b: LigneCompo): number {
  const va = a.part.valeur === null ? null : Number.parseInt(a.part.texte, 10)
  const vb = b.part.valeur === null ? null : Number.parseInt(b.part.texte, 10)
  if (va !== null && vb !== null && va !== vb) return vb - va
  if ((va === null) !== (vb === null)) return va === null ? 1 : -1
  if (a.parties !== b.parties) return b.parties - a.parties
  const la = compoEnClair(a.compo), lb = compoEnClair(b.compo)
  return la < lb ? -1 : la > lb ? 1 : 0
}

/** Le détail par compo des parties des files complètes, à résultat et à compo : une ligne par compo. */
function detailParCompo(completes: readonly Partie[]): LigneCompo[] {
  const parCle = new Map<string, { compo: Readonly<Record<string, number>>; parties: number; victoires: number }>()
  for (const p of completes) {
    if (p.resultat == null || aUnControleur(p) === null) continue
    const compo = p.compo as Readonly<Record<string, number>>
    const cle = cleDeCompo(compo)
    const x = parCle.get(cle) ?? { compo, parties: 0, victoires: 0 }
    x.parties++
    if (p.resultat === "victoire") x.victoires++
    parCle.set(cle, x)
  }
  const lignes = [...parCle.values()].map((x): LigneCompo => {
    const part = chiffreDAnalyse({ num: x.victoires, den: x.parties, cas: x.parties })
    const nom = compoEnClair(x.compo)
    const detail = part.valeur === null ? PEU_DE_DONNEES : `${part.texte} gagnées`
    return { ...x, part, libelle: effectifEnClair(nom, x.parties), detail, voix: `${nom}, ${compte(x.parties, "partie")} : ${detail}.` }
  })
  return lignes.sort(ordreDesCompos)
}

// ─────────────────────────── le bloc ───────────────────────────

/** Un groupe de l'écran : ses Chiffres dans l'ordre de `cles`, ou sa phrase (`vide`) à leur place. */
function groupe<K extends string>(cle: GroupeConditions["cle"], etiquette: string, cles: readonly K[], chiffres: Readonly<Record<K, ChiffreDEquipe>>,
  libelles: Readonly<Record<K, readonly [string, string]>>, vide: string | null): GroupeConditions {
  return { cle, etiquette, vide, chiffres: vide !== null ? [] : cles.map((k) => chiffreCondition(k, libelles[k][0], libelles[k][1], chiffres[k])) }
}


function referencesEcrites<K extends string>(cles: readonly K[], cs: Readonly<Record<K, ChiffreDEquipe>>, libelles: Readonly<Record<K, readonly [string, string]>>): string[] {
  const refs: string[] = []
  for (const k of cles) {
    const ref = cs[k].reference
    if (ref !== null && ref.valeur !== null) refs.push(`${libelles[k][0].charAt(0).toLowerCase()}${libelles[k][0].slice(1)} ${ref.texte}`)
  }
  return refs
}

/** Dans quelles conditions tu gagnes, sur la sélection (Évolution ; récap, section 8). */
export function conditionsDeVictoire(sel: Selection): Conditions {
  const completes = retenues(sel.parties, FILES_CONDITIONS)
  const competition = retenues(sel.parties, FILES_RANG_DU_LOBBY)
  let sansResultat = 0, sansResultatCompetition = 0, sansTonRang = 0, lobbyIncomplet = 0, sansCote = 0, sansCompo = 0
  for (const p of completes) {
    if (p.resultat == null) {
      sansResultat++
      if (p.file === "competitive") sansResultatCompetition++
      continue
    }
    const r = raisonSansRang(p)
    if (r === "sansTonRang") sansTonRang++
    else if (r === "lobbyIncomplet") lobbyIncomplet++
    if (coteDeDepart(p) === null) sansCote++
    if (aUnControleur(p) === null) sansCompo++
  }
  const rang = { dessus: chiffreDEquipe(sel, STATS_RANG.dessus), egal: chiffreDEquipe(sel, STATS_RANG.egal), dessous: chiffreDEquipe(sel, STATS_RANG.dessous) }
  const cote = { attaque: chiffreDEquipe(sel, STATS_COTE.attaque), defense: chiffreDEquipe(sel, STATS_COTE.defense) }
  const compo = { avec: chiffreDEquipe(sel, STATS_COMPO.avec), sans: chiffreDEquipe(sel, STATS_COMPO.sans) }
  const compos = detailParCompo(completes)
  const avant = avantEnMots(sel)
  const base = {
    completes: completes.length, horsFiles: sel.parties.length - completes.length, competition: competition.length, rang, cote, compo,
    sansResultat, sansTonRang, lobbyIncomplet, sansCote, sansCompo, compos, avant,
  }
  if (completes.length === 0) return { ...base, groupes: [], note: null, vide: SANS_PARTIE_COMPLETE }
  const somme = (cs: readonly ChiffreDEquipe[]) => cs.reduce((s, c) => s + c.den, 0)
  const videRang = competition.length === 0 ? (sel.perimetre.mode === "non-classe" ? RANG_MODE_NON_CLASSE : RANG_HORS_COMPETITION)
    : somme(CLES_RANG.map((k) => rang[k])) === 0 ? videDuGroupe(COMPETITION_COMPTEE_ICI, sansResultatCompetition, competition.length, MANQUE_RANG) : null
  const videCote = somme(CLES_COTE.map((k) => cote[k])) === 0 ? videDuGroupe(COMPTEE_ICI, sansResultat, completes.length, MANQUE_COTE) : null
  const videCompo = somme(CLES_COMPO.map((k) => compo[k])) === 0 ? videDuGroupe(COMPTEE_ICI, sansResultat, completes.length, MANQUE_COMPO) : null
  const groupes = [
    groupe("rang", ETIQUETTE_RANG, CLES_RANG, rang, LIBELLES_RANG, videRang),
    groupe("cote", ETIQUETTE_COTE, CLES_COTE, cote, LIBELLES_COTE, videCote),
    groupe("compo", ETIQUETTE_COMPO, CLES_COMPO, compo, LIBELLES_COMPO, videCompo),
  ]
  return { ...base, groupes, note: noteConditions(base, groupes), vide: null }
}

/**
 * La note du bloc : les méthodes (celle du rang seulement quand il se lit), les valeurs de ta période précédente qui s'écrivent, les
 * parties d'autres files écartées, les retraits comptés, ce que dit un « — » s'il en paraît un, l'effectif.
 */
function noteConditions(r: Omit<Conditions, "groupes" | "note" | "vide">, groupes: readonly GroupeConditions[]): string {
  const morceaux: string[] = []
  if (r.competition > 0) morceaux.push(METHODE_RANG)
  morceaux.push(METHODE_COTE, METHODE_COMPO)
  if (r.avant !== null) {
    const refs: string[] = []
    if (r.competition > 0) refs.push(...referencesEcrites(CLES_RANG, r.rang, LIBELLES_RANG))
    refs.push(...referencesEcrites(CLES_COTE, r.cote, LIBELLES_COTE), ...referencesEcrites(CLES_COMPO, r.compo, LIBELLES_COMPO))
    if (refs.length > 0) morceaux.push(`${r.avant}${NBSP}: ${refs.join(", ")}.`)
  }
  if (r.horsFiles > 0) morceaux.push(`${NOTE_FILES}${NBSP}; ${partiesDAutresFiles(r.horsFiles)}.`)
  const horsRang: string[] = []
  if (r.sansTonRang > 0) horsRang.push(`${compte(r.sansTonRang, "partie")} sans ton rang`)
  if (r.lobbyIncomplet > 0) horsRang.push(`${compte(r.lobbyIncomplet, "partie")} aux rangs du lobby incomplets (moins de 3 joueurs classés autres que toi dans une des deux équipes)`)
  if (horsRang.length > 0) morceaux.push(`Hors du rang du lobby${NBSP}: ${enListe(horsRang)}.`)
  if (r.sansCote > 0) morceaux.push(`Hors du côté de départ${NBSP}: ${compte(r.sansCote, "partie")} sans côté à la première manche.`)
  if (r.sansCompo > 0) morceaux.push(`Hors de la compo${NBSP}: ${compte(r.sansCompo, "partie")} sans la compo de ton équipe.`)
  if (r.sansResultat > 0) morceaux.push(`Hors du calcul, sans résultat${NBSP}: ${compte(r.sansResultat, "partie")}.`)
  const montres = groupes.flatMap((g) => g.chiffres)
  const tiret = montres.some((c) => c.valeur === TIRET && !c.sousTexte?.startsWith("aucune partie")) || r.compos.some((l) => l.part.valeur === null)
  if (tiret) morceaux.push(NOTE_TIRET)
  const rangSur = r.competition > 0 && r.competition !== r.completes ? ` ; rang du lobby sur ${compte(r.competition, "partie")} de compétition` : ""
  morceaux.push(`Sur ${compte(r.completes, "partie")}${rangSur}.`)
  return morceaux.join(" ")
}
