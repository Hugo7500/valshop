// Réduction d'une partie v4 de HenrikDev au contrat (contrat-donnees.md, Historique des
// parties (v2)) : la partie, tes manches jouées, tes kills, les groupes de comparaison et
// les cumuls par agent, faits de manche compris (EXPERIENCE.md, Définitions des métriques),
// en valeurs brutes, chaque type dérivé (côté, achat) à côté de sa source. Puis le contrôle
// de confidentialité : une sortie où reste un identifiant d'un autre joueur est refusée en
// entier, chemins JSON seulement, jamais une valeur.
//
// Deux temps : lireV4 lit la partie brute en forme neutre (joueurs à identifiant opaque,
// manches, kills, relevés), puis calculer travaille depuis elle seule ; l'import tracker.gg
// n'aura qu'à écrire sa propre lecture vers la même forme.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni
// horloge, seulement des types effaçables, pour tourner tel quel sous `node --test`
// (spike-s0/tests/). Garder la partie et ses cumuls reste le travail de l'entrée 4.

import type { Palier } from "./historique"

/**
 * Numéro de la réduction (entrée 17), écrit dans chaque partie gardée (`reduction`) et dans
 * meta.json : une partie gardée ne se recalcule jamais (la brute est oubliée), le numéro dit
 * quelle réduction l'a faite. 1 : première version numérotée, corrections de l'entrée 14
 * comprises ; un historique sans numéro est d'avant elles (collecte.ts le met de côté).
 */
export const VERSION_REDUCTION = 1

// ─────────────────────────── types de sortie ───────────────────────────

/** Agent ou carte : `{ id, name }`, tels que HenrikDev les donne. */
export type Ref = { id: string; name: string }
export type Saison = { id: string; short: string }
/** Coordonnées du jeu (pas les coordonnées d'affichage de la carte). */
export type Position = { x: number; y: number }
/** Arme ou capacité d'un kill, arme d'une manche : `id` vide et `name` null pour le spike ou une chute. */
export type Arme = { id: string | null; name: string | null; type: string | null }
/** Somme et effectif, jamais une moyenne (EXPERIENCE.md, Rapport de sommes). */
export type Somme = { somme: number; effectif: number }
/** Qui, vu de toi : toi, un joueur de ton équipe, ou l'adversaire. */
export type Camp = "toi" | "equipe" | "adversaire"
export type Cote = "attaque" | "defense"
/** EXPERIENCE.md, Types d'achat : pistolet aux manches de pistolet, sinon selon la valeur d'équipement. */
export type TypeAchat = "pistolet" | "eco" | "force" | "complet"
/** État de ton équipe après la première mort de la manche (analyse 10). */
export type Etat = "5contre4" | "4contre5"
/** Utilisations de C, Q, E, X ; null pour une valeur absente. */
export type Capacites = { c: number | null; q: number | null; e: number | null; x: number | null }
export type Touches = { tete: number; corps: number; jambes: number }
/** Tes totaux de fin de partie (`stats` de ton entrée de `players[]`). */
export type Totaux = {
  score: number | null
  kills: number | null
  morts: number | null
  assists: number | null
  degatsInfliges: number | null
  degatsRecus: number | null
  tete: number | null
  corps: number | null
  jambes: number | null
}
/** Une flèche de performance de Riot (schéma de HenrikDev : « Known trends: double_down, down, neutral, up, double_up »). */
export type Tendance = "double_down" | "down" | "neutral" | "up" | "double_up"
/** Les huit flèches de Riot en fin de partie (`performance.ratings.combat` et `.utility`), chacune null si absente ou inconnue. */
export type Fleches = {
  degats: Tendance | null
  impactKills: Tendance | null
  impactMorts: Tendance | null
  echanges: Tendance | null
  assists: Tendance | null
  poses: Tendance | null
  desamorcages: Tendance | null
  capacites: Tendance | null
}
export type Pose = { site: string | null; moment: number | null; position: Position | null; poseur: Camp | null }
export type Desamorcage = { moment: number | null; position: Position | null; desamorceur: Camp | null }

/** Une manche jouée : ni deathmatch, ni `hurm`, ni manche `Surrendered`. */
export type Manche = {
  numero: number
  /** Selon la règle du jeu et ton équipe ; null en escarmouche et hors des files à côtés. */
  cote: Cote | null
  gagnee: boolean | null
  issue: string | null
  ceremonie: string | null
  /** Ton type d'achat, tiré de `equipement` (et du numéro pour un pistolet) ; null hors des files à achat. */
  achat: TypeAchat | null
  equipement: number | null
  restant: number | null
  arme: Arme | null
  armure: Ref | null
  achatEquipe: TypeAchat | null
  /** Valeur d'équipement de ton équipe, toi compris : source de `achatEquipe` ; null sous 3 alliés autres que toi (de même sous 3 adversaires). */
  equipementEquipe: Somme | null
  achatAdverse: TypeAchat | null
  equipementAdverse: Somme | null
  /**
   * Ticket 4.47 : crédits gardés après l'achat (`remaining`) de ton équipe, toi compris, et des adversaires, comme `equipementEquipe` et
   * `equipementAdverse` (null sous 3 autres joueurs que toi) ; absents d'une partie gardée avant ce ticket.
   */
  restantEquipe?: Somme | null
  restantAdverse?: Somme | null
  /**
   * Ticket 4.54 : ta dépense de la manche (ta poche : crédits sortis de ta poche à l'achat), seulement prouvée (depensesProuvees) ; null :
   * pas prouvée. Les quatre champs de la dépense ne sont présents qu'avec une seconde source (la dépense de Riot par manche) : absents d'une
   * partie lue sans elle ou gardée avant ce ticket.
   */
  poche?: number | null
  /** Ticket 4.54 : Σ des dépenses de Riot de ton équipe (toi compris) et des adversaires, quand la somme d'équipe est prouvée ; null sinon. */
  depenseEquipe?: Somme | null
  depenseAdverse?: Somme | null
  score: number | null
  /** Tes kills d'adversaires dans la manche (liste des kills), comme les groupes et le K/D ; null sans tes stats de manche. */
  kills: number | null
  tete: number | null
  corps: number | null
  jambes: number | null
  /** Tes dégâts aux adversaires (tes `damage_events` vers eux : ni tir allié, ni dégâts à toi-même), comme tracker.gg. */
  degatsInfliges: number | null
  /** Dégâts et touches reçus des adversaires (`damage_events` vers toi). */
  degatsRecus: number
  touchesRecues: Touches
  capacites: Capacites | null
  afk: boolean | null
  pose: Pose | null
  desamorcage: Desamorcage | null
  // Faits de manche, calculés depuis tous les kills de la manche, avec un seul modèle du vivant (calculer).
  /**
   * Vivant à la fin de la manche (EXPERIENCE.md, Survie) : sans mort, ou relevé après ta dernière
   * mort ; la mort par le spike ne compte pas ; jamais dans une manche qui suit une manche où tu es
   * AFK (l'AFK de tracker.gg, une manche après `was_afk`).
   */
  survie: boolean
  /** Un kill d'adversaire, un assist (hors mort par le spike), la survie ou une mort échangée (EXPERIENCE.md, KAST). */
  kast: boolean
  /** Camp du tueur du premier kill de la manche ; null sans kill ou si ce kill n'a pas de tueur adverse. */
  premierKill: Camp | null
  /** Camp de la victime du premier kill de la manche, quelle qu'en soit la cause ; null sans kill. */
  premiereMort: Camp | null
  etatApresPremiereMort: Etat | null
  clutch: { adversaires: number; gagne: boolean } | null
  /** Tes kills d'adversaires dans la manche (multi-kill). */
  multiKill: number
  /** Tous les adversaires de la manche tués par toi (les cinq en 5 contre 5, les deux en escarmouche), comme tracker.gg. */
  ace: boolean
  /** Alliés tués par un adversaire pendant que tu vis ; `alliesVenges` : ceux dont tu tues le tueur dans les 5 s. */
  alliesTues: number
  alliesVenges: number
  /** Tes morts par un adversaire ; `mortsVengees` : celles dont un allié tue le tueur dans les 5 s. */
  mortsParAdversaire: number
  mortsVengees: number
  sansPerte: boolean
  aceEquipe: boolean
  /** Ta position et ton regard au premier kill de la manche (ta position de mort si tu en es la victime). */
  positionPremierKill: Position | null
  regardPremierKill: number | null
  /** Ta position au premier kill qui suit la pose de ton équipe, et ta distance au spike (m). */
  positionApresPose: Position | null
  distanceSpike: number | null
  ultime: boolean | null
}

/** Un kill où tu es le tueur ou la victime. */
export type Kill = {
  manche: number
  momentManche: number
  momentPartie: number | null
  sens: "kill" | "mort"
  /** L'autre joueur du kill est un adversaire (faux : toi-même ou un allié). */
  adverse: boolean
  arme: Arme | null
  tirSecondaire: boolean | null
  premierDuel: boolean
  apresPose: boolean
  position: Position | null
  regard: number | null
  /** Mort seulement : âge (ms) de ton dernier relevé de la manche. */
  ageRegard: number | null
  distance: number | null
  angleTueur: number | null
  allieLePlusProche: number | null
  /** Kill seulement : tes touches sur la victime dans la manche, à ton dernier kill d'elle (null aux précédents). */
  touchesVictime: (Touches & { degats: number }) | null
}

/** Compteurs tirés des manches, pour un ensemble de joueurs. */
export type CompteursManche = {
  manches: number
  score: number
  /** Kills d'adversaires (liste des kills), comme `stats.kills`. */
  kills: number
  /** Morts hors mort par le spike, quelle que soit l'équipe, comme `stats.deaths`. */
  morts: number
  assists: number
  degatsInfliges: number
  degatsRecus: number
  touchesDonnees: Touches
  touchesRecues: Touches
  manchesKast: number
  manchesSurvecues: number
  clutchs: number
  clutchsGagnes: number
  /** Moment (ms) de la première mort de chaque manche où le joueur meurt. */
  premiereMort: Somme
}

/** Utilisations d'une capacité par les joueurs qui en ont une valeur, et leurs manches jouées. */
export type CompteCapacite = { somme: number; joueurs: number; manches: number }

/**
 * Sommes et effectifs d'un groupe d'autres joueurs (EXPERIENCE.md, Groupes de comparaison).
 * Dans `groupes`, une somme où ne contribuent que 1 ou 2 joueurs vaut null (aucun : zéros).
 */
export type Groupe = {
  effectif: number
  manches: number
  score: number
  kills: number
  morts: number
  assists: number
  degatsInfliges: number
  degatsRecus: number
  touchesDonnees: Touches
  capacites: { c: CompteCapacite | null; q: CompteCapacite | null; e: CompteCapacite | null; x: CompteCapacite | null }
  depense: Somme | null
  note: Somme | null
  /** Toutes les manches jouées ; null en deathmatch et en `hurm`. */
  detailManches: CompteursManche | null
  parCote: Record<Cote, CompteursManche | null> | null
  /** Par type d'achat du joueur ; `parAchat[t].manches` donne la répartition des types. */
  parAchat: Record<TypeAchat, CompteursManche | null> | null
  /** Manches qui suivent un pistolet perdu par l'équipe du joueur (effectif), dont en achat forcé (somme). */
  apresPistoletPerdu: Somme | null
}

export type Groupes = { lobby: Groupe | null; allies: Groupe | null; adversaires: Groupe | null }

export type Resultat = "victoire" | "defaite" | "nul"

/**
 * Ce qu'un agent adverse te fait dans la partie, et ce que tu lui fais (epic-stats-analyses, entrée 11) : l'agent seul, par son id
 * (UUID public du jeu, comme `CumulAgent.agent`), jamais un nom, un tag, un PUUID ni une autre stat de ce joueur. Deux adversaires du
 * même agent sont additionnés ; un adversaire sans agent connu n'a pas d'entrée. Sur les manches jouées (une manche abandonnée n'y
 * compte pas, comme les cumuls).
 */
export type AgentAdverse = {
  agent: string
  /** Manches jouées par un adversaire de cet agent : celles où il est présent (toutes, sans présence connue). */
  manches: number
  /** Ses kills sur toi (règle de `mortsContre` : la mort par le spike n'en est pas un) ; tes kills sur lui (`killsContre`). */
  killsSurToi: number
  killsSurLui: number
  /** Ses touches et ses dégâts sur toi (ses `damage_events` vers toi), dont la somme sur les agents redonne tes reçus des manches. */
  touchesSurToi: Touches
  degatsSurToi: number
  /** L'arme ou la capacité de chacun de ses kills sur toi, par nom (sans espaces autour ; un kill sans nom n'y est pas), par kills décroissants puis nom. */
  armes: { nom: string; kills: number }[]
}

/** Un élément de `parties[]` du fichier d'import, champs du contrat. */
export type Partie = {
  matchId: string
  provenance: "henrikdev" | "tracker.gg"
  /** Numéro de la réduction qui l'a faite : VERSION_REDUCTION. */
  reduction: number
  debut: string
  duree: number | null
  file: string
  carte: Ref | null
  saison: Saison | null
  agent: Ref | null
  /** `Red` ou `Blue` ; null en deathmatch. */
  equipe: string | null
  /** null en deathmatch, où comptent `place` et `joueurs`. */
  resultat: Resultat | null
  /** Deathmatch : ta place au score parmi tous les joueurs, ex aequo au même rang (placeAuScore ; tracker.gg, lui, départage toujours, par une règle que l'export ne permet pas de retrouver) ; null ailleurs. */
  place: number | null
  joueurs: number
  manchesGagnees: number | null
  manchesPerdues: number | null
  abandon: boolean
  /** Taille de ton groupe, toi compris (1 : seul). */
  groupe: number | null
  rang: Palier | null
  rangsAllies: Somme | null
  rangsAdversaires: Somme | null
  placement: number | null
  /**
   * Tu es le MVP du match (ticket 4.52) : `metadata.mvp` de Riot, depuis le patch 13.06 ; avant (sans ce champ), le plus haut
   * score des dix, seul en tête, règle de Riot à l'époque, seulement avant 13.06 (ancienneRegleMvp) ; null : inconnu. Une
   * partie gardée avant 4.52 (sans `mvpEquipe`) l'a par l'ancienne règle en toute date, égalités comprises : mvpDeLaPartie.
   */
  mvp: boolean | null
  /**
   * Tu es le MVP de ton équipe sans être celui du match (`teams[ton équipe].mvp` de Riot, depuis 13.06) ; null : inconnu
   * (avant 13.06, partie importée). Absent : partie gardée avant le ticket 4.52.
   */
  mvpEquipe?: boolean | null
  note: number | null
  mention: string | null
  /** Tes flèches de performance de Riot (`performance.ratings`, ticket 4.52) ; null sans elles ; absent : gardée avant 4.52. */
  fleches?: Fleches | null
  totaux: Totaux
  capacites: Capacites | null
  depense: number | null
  equipement: number | null
  manchesAfk: number | null
  /** Nombre d'agents de ton équipe par rôle, sans lien à un joueur ; null en deathmatch et avec moins de 3 alliés. */
  compo: Record<string, number> | null
  manches: Manche[]
  kills: Kill[]
  groupes: Groupes
  /**
   * Ce que chaque agent adverse te fait (entrée 11 de epic-stats-analyses), triés par id ; null sans manches (deathmatch, match à mort
   * en équipe) ; absent d'une partie gardée avant cette entrée (la brute oubliée, elle ne se recalcule pas).
   */
  agentsAdverses?: AgentAdverse[] | null
  /**
   * Ticket 4.54 : les poches prouvées des autres joueurs de la partie (depensesProuvees), en somme et en nombre de joueurs-manches sur
   * toute la partie, seulement si au moins 3 joueurs différents y contribuent (Confidentialité, comme les groupes), sinon { 0, 0 } ;
   * jamais par manche : avec la dépense de chaque équipe, une somme de manche redonnerait la poche d'un joueur. Absent sans seconde source.
   */
  pochesAutres?: Somme
}

/** Un élément de `cumulsAgents[]` : les autres joueurs d'un agent dans la partie, sans identifiant de partie. */
export type CumulAgent = { semaine: string; file: string; agent: string } & Groupe & { killsContre: number; mortsContre: number }

export type Sortie = { partie: Partie; cumulsAgents: CumulAgent[] }

export type Reduction =
  | { statut: "gardee"; partie: Partie; cumulsAgents: CumulAgent[] }
  | { statut: "ecartee"; raison: "personnalisee" }
  | { statut: "refusee"; raison: "confidentialite" | "forme" | "roles"; chemins: string[] }

/** Rôle de chaque agent (id d'agent → rôle), tiré du catalogue. */
export type Roles = Readonly<Record<string, string>>

export type Options = {
  /**
   * Un joueur AFK de la manche (l'AFK de tracker.gg : `was_afk` de la manche précédente) compte
   * comme mort dès le début d'un clutch. Faux par défaut, tranché en 2b : un joueur AFK compte
   * vivant, comme le fait tracker.gg (EXPERIENCE.md, Clutchs) ; vrai seulement pour la comparaison
   * de l'outil de concordance. Dans les deux cas, il n'a jamais de clutch dans cette manche.
   */
  afkMortEnClutch?: boolean
  /**
   * Ticket 4.54 : la seconde source de la dépense, la dépense de Riot de chaque joueur-manche (HenrikDev v2, depensesDeV2), lue par
   * lireV4 ; absente ou null : partie sans seconde source, aucune dépense gardée.
   */
  depensesRiot?: DepensesRiot | null
}

/**
 * Ticket 4.54 : la dépense de Riot par manche (`rounds[].player_stats[].economy.spent` de HenrikDev v2), par joueur (son PUUID en
 * minuscules, en mémoire seulement, jamais gardé) et par rang de manche (numéro − 1) ; null : valeur absente.
 */
export type DepensesRiot = ReadonlyMap<string, readonly (number | null)[]>

// ─────────────────────────── forme neutre ───────────────────────────

/** Un joueur, désigné partout par son rang dans `joueurs` : aucun identifiant. */
export type JoueurNeutre = {
  /** `Red`, `Blue`, ou une clé à lui seul quand chacun joue pour soi. */
  equipe: string
  /** Numéro de groupe, opaque ; null s'il est inconnu. */
  groupe: number | null
  agent: Ref | null
  rang: Palier | null
  totaux: Totaux
  capacites: Capacites | null
  depense: number | null
  equipement: number | null
  manchesAfk: number | null
  note: number | null
  mention: string | null
  /** Ses flèches de performance (ticket 4.52) ; absent : lecture sans elles (tracker.gg). */
  fleches?: Fleches | null
}
export type Releve = { joueur: number; position: Position; regard: number | null }
export type DegatNeutre = { cible: number; degats: number; tete: number; corps: number; jambes: number }
export type JoueurMancheNeutre = {
  score: number | null
  kills: number | null
  tete: number | null
  corps: number | null
  jambes: number | null
  degats: DegatNeutre[]
  equipement: number | null
  restant: number | null
  arme: Arme | null
  armure: Ref | null
  capacites: Capacites | null
  afk: boolean | null
  /**
   * Ticket 4.54 : la dépense de Riot de la manche (`economy.spent` de HenrikDev v2, `spentCredits` de l'export), seconde source de la
   * poche ; absente : lecture sans seconde source ; null : valeur absente de la seconde source.
   */
  depenseRiot?: number | null
}
export type SpikeNeutre = { moment: number | null; position: Position | null; joueur: number | null; releves: Releve[] }
export type MancheNeutre = {
  numero: number
  issue: string | null
  /** Clé d'équipe gagnante ; null si inconnue. */
  gagnante: string | null
  ceremonie: string | null
  pose: (SpikeNeutre & { site: string | null }) | null
  desamorcage: SpikeNeutre | null
  /** Par joueur ; null pour un joueur absent de la manche. */
  joueurs: (JoueurMancheNeutre | null)[]
}
export type KillNeutre = {
  manche: number
  momentManche: number
  momentPartie: number | null
  tueur: number | null
  victime: number
  assistants: number[]
  /** Position de la victime. */
  position: Position | null
  arme: Arme | null
  tirSecondaire: boolean | null
  releves: Releve[]
}
/** Une équipe ; `teams[].placement` de HenrikDev n'est pas lu (faux ou absent dans 3 deathmatchs réels sur 10, entrée 15) : voir placeAuScore. */
export type EquipeNeutre = { cle: string; gagnee: boolean | null; manchesGagnees: number | null; manchesPerdues: number | null }
export type Neutre = {
  matchId: string
  provenance: "henrikdev" | "tracker.gg"
  debut: string
  duree: number | null
  file: string
  carte: Ref | null
  saison: Saison | null
  /** Deathmatch : chaque joueur forme son équipe. */
  chacunPourSoi: boolean
  toi: number
  joueurs: JoueurNeutre[]
  equipes: EquipeNeutre[]
  manches: MancheNeutre[]
  kills: KillNeutre[]
  /**
   * Les MVP de Riot (ticket 4.52) : `metadata.mvp` en rang de joueur (`match`, null : joueur introuvable) et chaque
   * `teams[].mvp` par clé d'équipe ; null sans `metadata.mvp` (avant le patch 13.06) ; absent : lecture sans eux (tracker.gg).
   */
  mvpRiot?: { match: number | null; parEquipe: Record<string, number> } | null

  version?: [number, number] | null
}

export type Lecture =
  | { statut: "lue"; neutre: Neutre }
  | { statut: "ecartee"; raison: "personnalisee" }
  | { statut: "illisible"; chemins: string[] }

// ─────────────────────────── aides de lecture (recopiées de historique.ts) ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

function nombre(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

function booleen(x: unknown): boolean | null {
  return typeof x === "boolean" ? x : null
}

function texte(x: unknown): string | null {
  return typeof x === "string" ? x : null
}

function dateIso(x: unknown): string | null {
  return typeof x === "string" && !Number.isNaN(Date.parse(x)) ? x : null
}

function palier(x: unknown): Palier | null {
  return estObjet(x) && Number.isInteger(x.id) && typeof x.name === "string" ? { id: x.id, name: x.name } : null
}

function ref(x: unknown): Ref | null {
  return estObjet(x) && typeof x.id === "string" && typeof x.name === "string" ? { id: x.id, name: x.name } : null
}

function saison(x: unknown): Saison | null {
  return estObjet(x) && typeof x.id === "string" && typeof x.short === "string" ? { id: x.id, short: x.short } : null
}

function position(x: unknown): Position | null {
  if (!estObjet(x)) return null
  const px = nombre(x.x), py = nombre(x.y)
  return px === null || py === null ? null : { x: px, y: py }
}

function arme(x: unknown): Arme | null {
  return estObjet(x) ? { id: texte(x.id), name: texte(x.name), type: texte(x.type) } : null
}

/** Capacités sous les clés de HenrikDev (`ability1` pour la partie, `ability_1` pour la manche) ; null si aucune n'a de valeur. */
function capacites(x: unknown, cles: readonly [string, string, string, string]): Capacites | null {
  if (!estObjet(x)) return null
  const c: Capacites = { c: nombre(x[cles[0]]), q: nombre(x[cles[1]]), e: nombre(x[cles[2]]), x: nombre(x[cles[3]]) }
  return c.c === null && c.q === null && c.e === null && c.x === null ? null : c
}

const CAPACITES_PARTIE = ["grenade", "ability1", "ability2", "ultimate"] as const
const CAPACITES_MANCHE = ["grenade", "ability_1", "ability_2", "ultimate"] as const

// ─────────────────────────── lecture de la v4 ───────────────────────────

/**
 * Ticket 4.54 : la dépense de Riot de chaque joueur-manche dans une réponse de `/valorant/v2/match/{id}` de HenrikDev
 * (`data.rounds[].player_stats[].economy.spent`, OpenAPI 4.6.0), pour la partie v4 `brute` : null si la réponse n'est pas celle de
 * cette partie (`data.metadata.matchid`), n'a pas autant de manches, ou ne donne aucune dépense. Un joueur vu deux fois dans une
 * manche, ou une dépense qui n'est pas un entier positif ou nul : null à cette manche. Les PUUID ne servent qu'en mémoire.
 */
export function depensesDeV2(reponse: unknown, brute: unknown): DepensesRiot | null {
  const data = estObjet(reponse) ? reponse.data : undefined
  if (!estObjet(data) || !estObjet(data.metadata) || !Array.isArray(data.rounds)) return null
  if (!estObjet(brute) || !estObjet(brute.metadata) || !Array.isArray(brute.rounds)) return null
  const id = typeof brute.metadata.match_id === "string" ? brute.metadata.match_id.toLowerCase() : null
  if (id === null || typeof data.metadata.matchid !== "string" || data.metadata.matchid.toLowerCase() !== id) return null
  const nb = brute.rounds.length
  if (data.rounds.length !== nb) return null
  const r = new Map<string, (number | null)[]>()
  let lues = 0
  data.rounds.forEach((m: unknown, i: number) => {
    if (!estObjet(m) || !Array.isArray(m.player_stats)) return
    const vus = new Set<string>()
    for (const s of m.player_stats) {
      if (!estObjet(s) || typeof s.player_puuid !== "string") continue
      const p = s.player_puuid.toLowerCase()
      let l = r.get(p)
      if (l === undefined) r.set(p, (l = Array.from({ length: nb }, (): number | null => null)))
      const v = estObjet(s.economy) ? s.economy.spent : undefined
      if (vus.has(p)) {
        if (l[i] !== null) lues--
        l[i] = null
        continue
      }
      vus.add(p)
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
        l[i] = v
        lues++
      }
    }
  })
  return lues === 0 ? null : r
}

/**
 * La partie brute (un élément de `data[]` de la liste v4) en forme neutre. `illisible` :
 * chemins de ce qui manque (ton PUUID dans `players[]`, `players`, `teams`, `rounds`,
 * `kills`, `metadata` et ses champs clés) ; `ecartee` : partie personnalisée
 * (`metadata.queue.id` vide). Ne modifie jamais `brute`. Ticket 4.54 :
 * `depensesRiot`, la dépense de Riot de chaque joueur (depensesDeV2), posée sur ses manches par leur rang.
 */
export function lireV4(brute: unknown, puuid: string, depensesRiot: DepensesRiot | null = null): Lecture {
  if (!estObjet(brute)) return { statut: "illisible", chemins: ["$"] }
  const moi = String(puuid).toLowerCase()
  const chemins: string[] = []
  const meta = brute.metadata
  if (!estObjet(meta)) chemins.push("$.metadata")
  else {
    if (typeof meta.match_id !== "string" || meta.match_id === "") chemins.push("$.metadata.match_id")
    if (dateIso(meta.started_at) === null) chemins.push("$.metadata.started_at")
    const q = estObjet(meta.queue) ? meta.queue.id : undefined
    if (q !== null && typeof q !== "string") chemins.push("$.metadata.queue.id")
  }
  for (const cle of ["players", "teams", "rounds", "kills"]) if (!Array.isArray(brute[cle])) chemins.push("$." + cle)
  const lus: Record<string, any>[] = Array.isArray(brute.players) ? brute.players.filter(estObjet) : []
  const puuidDe = (p: Record<string, any>) => (typeof p.puuid === "string" ? p.puuid.toLowerCase() : null)
  if (Array.isArray(brute.players) && lus.filter((p) => puuidDe(p) === moi).length !== 1) chemins.push("$.players[].puuid")
  if (chemins.length > 0) return { statut: "illisible", chemins }

  const file: string | null = brute.metadata.queue.id
  if (file === null || file === "") return { statut: "ecartee", raison: "personnalisee" }

  // Joueurs : rang dans `joueurs`, seul lien gardé ; équipes et groupes en clés opaques.
  const index = new Map<string, number>()
  lus.forEach((p, i) => {
    const id = puuidDe(p)
    if (id !== null && !index.has(id)) index.set(id, i)
  })
  const de = (x: unknown): number | null => {
    const id = estObjet(x) && typeof x.puuid === "string" ? x.puuid.toLowerCase() : null
    return id === null ? null : index.get(id) ?? null
  }
  const toi = index.get(moi)!
  const cleEquipe = (teamId: unknown, i: number): string =>
    teamId === "Red" || teamId === "Blue" ? teamId : `j${i}`
  const groupes = new Map<string, number>()
  const joueurs: JoueurNeutre[] = lus.map((p, i) => {
    const s = estObjet(p.stats) ? p.stats : {}
    const d = estObjet(s.damage) ? s.damage : {}
    const perf = estObjet(p.performance) ? p.performance : null
    let groupe: number | null = null
    if (typeof p.party_id === "string" && p.party_id !== "") {
      if (!groupes.has(p.party_id)) groupes.set(p.party_id, groupes.size)
      groupe = groupes.get(p.party_id)!
    }
    return {
      equipe: cleEquipe(p.team_id, i),
      groupe,
      agent: ref(p.agent),
      rang: palier(p.tier),
      totaux: {
        score: nombre(s.score), kills: nombre(s.kills), morts: nombre(s.deaths), assists: nombre(s.assists),
        degatsInfliges: nombre(d.dealt), degatsRecus: nombre(d.received),
        tete: nombre(s.headshots), corps: nombre(s.bodyshots), jambes: nombre(s.legshots),
      },
      capacites: capacites(p.ability_casts, CAPACITES_PARTIE),
      depense: estObjet(p.economy) && estObjet(p.economy.spent) ? nombre(p.economy.spent.overall) : null,
      equipement: estObjet(p.economy) && estObjet(p.economy.loadout_value) ? nombre(p.economy.loadout_value.overall) : null,
      manchesAfk: estObjet(p.behavior) ? nombre(p.behavior.afk_rounds) : null,
      note: perf ? nombre(perf.score) : null,
      mention: perf && estObjet(perf.ratings) ? texte(perf.ratings.grade) : null,
      fleches: perf ? flechesDe(perf.ratings) : null,
    }
  })
  const chacunPourSoi = file === "deathmatch" || (joueurs[toi].equipe !== "Red" && joueurs[toi].equipe !== "Blue")
  // Une équipe désignée par un PUUID (deathmatch) prend la clé de ce joueur.
  const cleDe = (teamId: unknown): string | null => {
    if (teamId === "Red" || teamId === "Blue") return teamId
    if (typeof teamId !== "string") return null
    const i = index.get(teamId.toLowerCase())
    return i === undefined ? null : `j${i}`
  }

  const releves = (liste: unknown): Releve[] => {
    const r: Releve[] = []
    if (!Array.isArray(liste)) return r
    for (const l of liste) {
      if (!estObjet(l)) continue
      const j = de(l.player), pos = position(l.location)
      if (j !== null && pos !== null) r.push({ joueur: j, position: pos, regard: nombre(l.view_radians) })
    }
    return r
  }
  const spike = (x: unknown): SpikeNeutre | null =>
    estObjet(x) ? { moment: nombre(x.round_time_in_ms), position: position(x.location), joueur: de(x.player), releves: releves(x.player_locations) } : null

  const equipes: EquipeNeutre[] = []
  for (const t of brute.teams) {
    if (!estObjet(t)) continue
    const cle = cleDe(t.team_id)
    if (cle === null) continue
    const r = estObjet(t.rounds) ? t.rounds : {}
    equipes.push({ cle, gagnee: booleen(t.won), manchesGagnees: nombre(r.won), manchesPerdues: nombre(r.lost) })
  }
  // MVP de Riot (ticket 4.52) : rangs de joueur seulement, jamais l'identifiant.
  let mvpRiot: Neutre["mvpRiot"] = null
  if (estObjet(meta.mvp)) {
    const parEquipe: Record<string, number> = {}
    for (const t of brute.teams) {
      if (!estObjet(t) || !estObjet(t.mvp)) continue
      const cle = cleDe(t.team_id), j = de(t.mvp)
      if (cle !== null && j !== null) parEquipe[cle] = j
    }
    mvpRiot = { match: de(meta.mvp), parEquipe }
  }

  const manches: MancheNeutre[] = []
  brute.rounds.forEach((r: unknown, i: number) => {
    if (!estObjet(r)) return
    const numero = Number.isInteger(r.id) ? r.id + 1 : i + 1
    const parJoueur: (JoueurMancheNeutre | null)[] = joueurs.map(() => null)
    for (const s of Array.isArray(r.stats) ? r.stats : []) {
      if (!estObjet(s)) continue
      const j = de(s.player)
      if (j === null) continue
      // Ticket 4.54 : la dépense de Riot de ce joueur à cette manche (même rang dans `rounds[]` des deux réponses), par son PUUID, jamais gardé.
      const id = estObjet(s.player) && typeof s.player.puuid === "string" ? s.player.puuid.toLowerCase() : null
      const depense = depensesRiot === null ? undefined : id === null ? null : depensesRiot.get(id)?.[i] ?? null
      const st = estObjet(s.stats) ? s.stats : {}
      const eco = estObjet(s.economy) ? s.economy : {}
      const degats: DegatNeutre[] = []
      for (const d of Array.isArray(s.damage_events) ? s.damage_events : []) {
        if (!estObjet(d)) continue
        const cible = de(d.player)
        if (cible === null) continue
        degats.push({ cible, degats: nombre(d.damage) ?? 0, tete: nombre(d.headshots) ?? 0, corps: nombre(d.bodyshots) ?? 0, jambes: nombre(d.legshots) ?? 0 })
      }
      parJoueur[j] = {
        score: nombre(st.score), kills: nombre(st.kills), tete: nombre(st.headshots), corps: nombre(st.bodyshots), jambes: nombre(st.legshots),
        degats,
        equipement: nombre(eco.loadout_value), restant: nombre(eco.remaining), arme: arme(eco.weapon), armure: ref(eco.armor),
        capacites: capacites(s.ability_casts, CAPACITES_MANCHE),
        afk: booleen(s.was_afk),
        ...(depense === undefined ? {} : { depenseRiot: depense }),
      }
    }
    const pose = spike(r.plant)
    manches.push({
      numero,
      issue: texte(r.result),
      gagnante: cleDe(r.winning_team),
      ceremonie: texte(r.ceremony),
      pose: pose && estObjet(r.plant) ? { ...pose, site: texte(r.plant.site) } : null,
      desamorcage: spike(r.defuse),
      joueurs: parJoueur,
    })
  })

  const kills: KillNeutre[] = []
  for (const k of brute.kills) {
    if (!estObjet(k)) continue
    const victime = de(k.victim), moment = nombre(k.time_in_round_in_ms)
    if (victime === null || moment === null || !Number.isInteger(k.round)) continue
    kills.push({
      manche: k.round + 1,
      momentManche: moment,
      momentPartie: nombre(k.time_in_match_in_ms),
      tueur: de(k.killer),
      victime,
      assistants: (Array.isArray(k.assistants) ? k.assistants : []).map(de).filter((a: number | null): a is number => a !== null),
      position: position(k.location),
      arme: arme(k.weapon),
      tirSecondaire: booleen(k.secondary_fire_mode),
      releves: releves(k.player_locations),
    })
  }

  const meta2 = brute.metadata
  return {
    statut: "lue",
    neutre: {
      matchId: meta2.match_id,
      provenance: "henrikdev",
      debut: meta2.started_at,
      duree: nombre(meta2.game_length_in_ms),
      file,
      carte: ref(meta2.map),
      saison: saison(meta2.season),
      chacunPourSoi,
      toi,
      joueurs,
      equipes,
      manches,
      kills,
      mvpRiot,
      version: versionDuJeu(meta2.game_version),
    },
  }
}


function versionDuJeu(x: unknown): [number, number] | null {
  const m = typeof x === "string" ? /^release-(\d+)\.(\d+)/.exec(x) : null
  return m ? [Number(m[1]), Number(m[2])] : null
}

const TENDANCES: readonly Tendance[] = ["double_down", "down", "neutral", "up", "double_up"]

/** Une flèche connue, ou null (absente, ou valeur hors des cinq du schéma). */
function tendance(x: unknown): Tendance | null {
  return typeof x === "string" && (TENDANCES as readonly string[]).includes(x) ? (x as Tendance) : null
}

/** Les flèches de `performance.ratings` ; null sans `combat` ni `utility` lisibles, ou sans aucune flèche connue. */
function flechesDe(r: unknown): Fleches | null {
  if (!estObjet(r)) return null
  const c = estObjet(r.combat) ? r.combat : {}, u = estObjet(r.utility) ? r.utility : {}
  const f: Fleches = {
    degats: tendance(c.damage), impactKills: tendance(c.kill_impact), impactMorts: tendance(c.death_impact), echanges: tendance(c.trades),
    assists: tendance(u.assists), poses: tendance(u.plants), desamorcages: tendance(u.defuses), capacites: tendance(u.utility_usage),
  }
  return Object.values(f).some((v) => v !== null) ? f : null
}

// ─────────────────────────── MVP (ticket 4.52) ───────────────────────────






export const DEBUT_PATCH_13_06 = Date.parse("2026-09-21T00:00:00Z")

/**
 * La partie est d'avant 13.06 (décision 1) : commencée avant la borne sûre, et, sa version lue, d'une version d'avant 13.06.
 */
function avant1306(version: [number, number] | null | undefined, debut: string): boolean {
  const t = Date.parse(debut)
  if (!Number.isFinite(t) || t >= DEBUT_PATCH_13_06) return false
  return !version || version[0] < 13 || (version[0] === 13 && version[1] < 6)
}

/**
 * Ancienne règle de Riot (avant 13.06) : le MVP du match est le plus haut score des joueurs, seul en tête. Vrai : ton score passe
 * strictement chacun des autres ; faux : un autre te passe ; null : égalité au sommet, ou un score absent qui pourrait te passer.
 */
function ancienneRegleMvp(scores: readonly (number | null)[], toi: number): boolean | null {
  const mien = scores[toi]
  if (mien === null) return null
  let inconnu = false
  for (let i = 0; i < scores.length; i++) {
    if (i === toi) continue
    const s = scores[i]
    if (s === null) inconnu = true
    else if (s > mien) return false
    else if (s === mien) inconnu = true
  }
  return inconnu ? null : true
}

/** Tes MVP (ticket 4.52) : du match, puis de ton équipe sans l'être du match. */
function mvpsDe(n: Neutre, cleEquipe: string): { mvp: boolean | null; mvpEquipe: boolean | null } {
  const r = n.mvpRiot
  if (r) {
    const mvp = r.match === null ? null : r.match === n.toi
    const j = r.parEquipe[cleEquipe]
    return { mvp, mvpEquipe: mvp === true ? false : j === undefined ? null : j === n.toi }
  }
  if (avant1306(n.version, n.debut)) return { mvp: ancienneRegleMvp(n.joueurs.map((j) => j.totaux.score), n.toi), mvpEquipe: null }
  return { mvp: null, mvpEquipe: null }
}






export function mvpDeLaPartie(p: Pick<Partie, "mvp" | "mvpEquipe" | "debut">): "match" | "equipe" | null {
  if (p.mvpEquipe === undefined) {
    const t = Date.parse(p.debut)
    return p.mvp === true && Number.isFinite(t) && t < DEBUT_PATCH_13_06 ? "match" : null
  }
  return p.mvp === true ? "match" : p.mvpEquipe === true ? "equipe" : null
}

// ─────────────────────────── règles du jeu ───────────────────────────

/** Côté de `Red` selon le numéro de manche, et manches de pistolet, par file ; null hors des files à côtés et à achat. */
type Regles = { coteRouge: ((numero: number) => Cote) | null; pistolets: readonly number[] | null }

function regles(file: string): Regles {
  switch (file) {
    case "competitive":
    case "unrated":
    case "premier":
      // Red attaque de 1 à 12, défend de 13 à 24, puis attaque les manches impaires de la prolongation.
      return { coteRouge: (n) => (n <= 12 ? "attaque" : n <= 24 ? "defense" : n % 2 === 1 ? "attaque" : "defense"), pistolets: [1, 13] }
    case "swiftplay":
      return { coteRouge: (n) => (n <= 4 ? "attaque" : "defense"), pistolets: [1, 5] }
    default:
      return { coteRouge: null, pistolets: null }
  }
}


function typeSelonValeur(valeur: number): TypeAchat {
  return valeur < 2000 ? "eco" : valeur < 3900 ? "force" : "complet"
}

/** Mètres, sans hauteur (EXPERIENCE.md, Kills par arme, distance). */
function distance(a: Position | null, b: Position | null): number | null {
  return a === null || b === null ? null : Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 100
}

/** Écart de 0 à π entre deux directions (radians). */
function ecartAngle(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI)
  return d > Math.PI ? 2 * Math.PI - d : d
}

/** Échange : le tueur est tué dans les 5 s, bornes incluses (EXPERIENCE.md, Échanges). */
const DELAI_ECHANGE_MS = 5000


function semaineIso(iso: string): string {
  const d = new Date(Date.parse(iso))
  const jour = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const jeudi = jour + (3 - ((new Date(jour).getUTCDay() + 6) % 7)) * 86_400_000
  const annee = new Date(jeudi).getUTCFullYear()
  const n = 1 + Math.floor((jeudi - Date.UTC(annee, 0, 1)) / (7 * 86_400_000))
  return `${annee}-W${String(n).padStart(2, "0")}`
}

/**
 * Place du joueur `toi` au score parmi tous les joueurs d'un deathmatch : 1 plus le nombre de
 * joueurs au score strictement plus haut, ex aequo au même rang ; un score absent ne passe
 * devant personne ; null sans ton score. Le classement au score est celui de tracker.gg (382
 * deathmatchs sur 384 de l'export), plutôt que `teams[].placement` de HenrikDev ; tracker.gg,
 * lui, départage toujours les égalités de score (places toutes distinctes dans ses 384
 * deathmatchs), par une règle que l'export ne livre pas (aucune statistique de `player-summary`
 * ne l'explique) ; les 2 autres deathmatchs sont tes égalités à 0 point. Exportée pour l'outil de
 * concordance.
 */
export function placeAuScore(scores: readonly (number | null)[], toi: number): number | null {
  const mien = scores[toi]
  if (typeof mien !== "number") return null
  return 1 + scores.filter((s, p) => p !== toi && typeof s === "number" && s > mien).length
}

// ─────────────────────────── calcul ───────────────────────────

/** Ce que chaque joueur a fait dans une manche, vivants rejoués kill par kill. */
type FaitsJoueur = {
  /** Morts hors mort par le spike, comme `stats.deaths` (K/D). */
  morts: number
  /** Vivant à la fin de la manche (EXPERIENCE.md, Survie). */
  survie: boolean
  premiereMort: number | null
  killsAdverses: number
  /** Tous ses assists, comme `stats.assists` ; `assistsKast` : hors assists d'une mort par le spike (KAST). */
  assists: number
  assistsKast: number
  echangee: boolean
  clutch: number | null
}

/**
 * Une manche analysée : ses kills dans l'ordre du temps, les faits de chaque joueur, les dégâts reçus des
 * adversaires, et `vivantAvant[i]` : qui vit juste avant le kill `ks[i]`, selon le modèle du vivant.
 */
type Analyse = { m: MancheNeutre; kills: KillNeutre[]; faits: FaitsJoueur[]; recu: (Touches & { degats: number })[]; vivantAvant: boolean[][] }

const zero = (): Touches => ({ tete: 0, corps: 0, jambes: 0 })

/** `lobby` où chaque somme que `a` ou `b` (les deux camps) taisent par null est tue aussi. */
function masquer<T>(lobby: T, a: unknown, b: unknown): T {
  if (!estObjet(lobby)) return lobby
  const r: Record<string, unknown> = {}
  for (const cle of Object.keys(lobby)) {
    const x = estObjet(a) ? a[cle] : undefined, y = estObjet(b) ? b[cle] : undefined
    r[cle] = x === null || y === null ? null : masquer(lobby[cle], x, y)
  }
  return r as unknown as T
}

/**
 * Manche KAST (EXPERIENCE.md, KAST) : un kill d'adversaire, un assist qui n'est pas celui d'une mort par le spike
 * (tracker.gg ne le compte pas au KAST), la survie ou une mort échangée.
 */
function kastDe(f: FaitsJoueur): boolean {
  return f.killsAdverses > 0 || f.assistsKast > 0 || f.survie || f.echangee
}

function compteursVides(): CompteursManche {
  return {
    manches: 0, score: 0, kills: 0, morts: 0, assists: 0, degatsInfliges: 0, degatsRecus: 0,
    touchesDonnees: zero(), touchesRecues: zero(), manchesKast: 0, manchesSurvecues: 0, clutchs: 0, clutchsGagnes: 0,
    premiereMort: { somme: 0, effectif: 0 },
  }
}

/** Ton équipe, toi compris, quand la partie a une compo : ni deathmatch, ni moins de 3 alliés ; sinon null. */
function equipeDeLaCompo(n: Neutre): number[] | null {
  const equipe = n.joueurs.map((_, p) => p).filter((p) => n.joueurs[p].equipe === n.joueurs[n.toi].equipe)
  return n.chacunPourSoi || equipe.length < 4 ? null : equipe
}

function roleDe(roles: Roles, id: string | undefined): string | null {
  return id !== undefined && estObjet(roles) && typeof roles[id] === "string" ? roles[id] : null
}

/**
 * Joueurs de ton équipe (rangs dans `joueurs`, croissants) dont l'agent n'a pas de rôle dans
 * `roles`, quand la partie a une compo. Non vide : reduirePartie refuse la partie (`roles`),
 * pour ne jamais figer une compo incomplète (contrat-donnees.md, catalogue).
 */
export function rolesManquants(n: Neutre, roles: Roles): number[] {
  return (equipeDeLaCompo(n) ?? []).filter((p) => {
    const id = n.joueurs[p].agent?.id
    return id !== undefined && roleDe(roles, id) === null
  })
}







/** Plafond des crédits, départ d'une manche de pistolet et d'une manche de prolongation. */
export const PLAFOND_CREDITS = 9000
export const DEPART_PISTOLET = 800
export const DEPART_PROLONGATION = 5000

const GAIN_VICTOIRE = 3000
const GAINS_DEFAITE: readonly number[] = [1900, 2400, 2900]
const GAIN_SURVIE = 1000
const GAIN_KILL = 200
const GAIN_POSE = 300
/** Vélocité : manches 2 et 6, victoire ou défaite (sans règle de survie) ; manches 3, 4, 7 et 8, un départ fixe de revenu. */
const VELOCITE_VICTOIRE = 3000
const VELOCITE_DEFAITE = 2400
const VELOCITE_FIXE = 4250
const VELOCITE_MANCHES_FIXES: readonly number[] = [3, 4, 7, 8]

/**
 * Un joueur à une manche, pour la dépense prouvée : sa poche (null : incalculable), sa dépense de Riot (null : absente), et si son
 * départ est fixé par la règle (pistolet, prolongation).
 */
export type PocheJoueur = { poche: number | null; riot: number | null; departFixe: boolean; prouvee: boolean }
/** Une manche : chaque joueur (null : absent de la manche), et chaque équipe dont la somme est prouvée (sa somme de Riot), par clé. */
export type PochesManche = { numero: number; joueurs: (PocheJoueur | null)[]; equipes: Record<string, number | null> }

/**
 * Les poches de chaque joueur à chaque manche jouée et leurs preuves (décisions 1 et 2 du plan du ticket 4.54) ; null sans seconde
 * source (aucune dépense de Riot lue), hors des files à achat et à côtés, ou pour une partie abandonnée. Une équipe est prouvée à une
 * manche si elle a ses 5 joueurs, aucun absent dans la manche ni la précédente (pas de ligne, `was_afk`, équipement nul ; partie
 * importée : en plus, un joueur dont le nombre de manches AFK de la partie n'est pas 0), chacun avec son `remaining`, sa dépense de
 * Riot et sa poche (positive), et si Σ de leurs poches = Σ de leurs dépenses de Riot ; un joueur d'une équipe prouvée l'est (a) si sa
 * poche égale sa dépense de Riot, ou (b) à une manche à départ fixé.
 */
export function pochesDeLaPartie(n: Neutre): PochesManche[] | null {
  const r = regles(n.file)
  if (r.coteRouge === null || r.pistolets === null || n.chacunPourSoi) return null
  if (!n.manches.some((m) => m.joueurs.some((jm) => jm !== null && typeof jm.depenseRiot === "number"))) return null
  if (n.manches.some((m) => m.issue === "Surrendered")) return null
  const velocite = n.file === "swiftplay"
  const fin = velocite ? 8 : 24
  const eq = n.joueurs.map((j) => j.equipe)
  const manches = [...n.manches].sort((a, b) => a.numero - b.numero)
  const mancheDe = new Map(manches.map((m) => [m.numero, m]))
  const cote = (equipe: string, numero: number): Cote => {
    const c = r.coteRouge!(numero)
    return equipe === "Red" ? c : c === "attaque" ? "defense" : "attaque"
  }


  const killsParManche = new Map<number, number[]>()
  const mortsParManche = new Map<number, Set<number>>()
  const tries = n.kills.map((k, i) => ({ k, i })).sort((a, b) => a.k.manche - b.k.manche || a.k.momentManche - b.k.momentManche || a.i - b.i)
  for (const { k } of tries) {
    let kills = killsParManche.get(k.manche), morts = mortsParManche.get(k.manche)
    if (kills === undefined) killsParManche.set(k.manche, (kills = n.joueurs.map(() => 0)))
    if (morts === undefined) mortsParManche.set(k.manche, (morts = new Set()))
    for (const rl of k.releves) morts.delete(rl.joueur)
    morts.add(k.victime)
    if (k.tueur !== null && eq[k.tueur] !== undefined && eq[k.tueur] !== eq[k.victime]) kills[k.tueur]++
  }
  const absent = (p: number, numero: number): boolean => {
    const m = mancheDe.get(numero)
    if (m === undefined) return false
    const jm = m.joueurs[p]
    return jm === null || jm === undefined || jm.afk === true || !(typeof jm.equipement === "number" && jm.equipement > 0)
  }
  const afkImport = (p: number) => n.provenance === "tracker.gg" && n.joueurs[p].manchesAfk !== 0
  // Série de défaites de chaque équipe à la fin de chaque manche (remise à zéro au pistolet, puis à chaque victoire).
  const serie = new Map<string, Map<number, number>>()
  for (const e of new Set(eq)) {
    const parManche = new Map<number, number>()
    let s = 0
    for (const m of manches) {
      if (r.pistolets.includes(m.numero)) s = 0
      s = m.gagnante === null ? s : m.gagnante === e ? 0 : s + 1
      parManche.set(m.numero, s)
    }
    serie.set(e, parManche)
  }
  const depart = (p: number, m: MancheNeutre): { credits: number; fixe: boolean } | null => {
    if (r.pistolets!.includes(m.numero)) return { credits: DEPART_PISTOLET, fixe: true }
    if (m.numero > fin) return { credits: DEPART_PROLONGATION, fixe: true }
    const a = mancheDe.get(m.numero - 1)
    const ja = a?.joueurs[p] ?? null
    if (a === undefined || ja === null || ja.restant === null || a.gagnante === null) return null
    const e = eq[p]
    const gagne = a.gagnante === e
    const attaque = cote(e, a.numero) === "attaque"
    const pose = a.pose !== null
    const vivant = !(mortsParManche.get(a.numero)?.has(p) ?? false)
    const survie = vivant && ((attaque && !pose) || (!attaque && a.issue === "Detonate"))
    let base: number
    if (velocite && VELOCITE_MANCHES_FIXES.includes(m.numero)) base = VELOCITE_FIXE
    else if (velocite) base = gagne ? VELOCITE_VICTOIRE : VELOCITE_DEFAITE
    else if (gagne) base = GAIN_VICTOIRE
    else base = survie ? GAIN_SURVIE : GAINS_DEFAITE[Math.min(serie.get(e)!.get(a.numero)!, 3) - 1]
    const brut = ja.restant + base + GAIN_KILL * (killsParManche.get(a.numero)?.[p] ?? 0) + (attaque && pose ? GAIN_POSE : 0)
    return { credits: Math.min(PLAFOND_CREDITS, brut), fixe: false }
  }
  const membres = new Map<string, number[]>()
  eq.forEach((e, p) => membres.set(e, [...(membres.get(e) ?? []), p]))
  return manches.filter((m) => m.issue !== "Surrendered").map((m): PochesManche => {
    const joueurs = m.joueurs.map((jm, p): PocheJoueur | null => {
      if (jm === null) return null
      const d = depart(p, m)
      const poche = d === null || jm.restant === null ? null : d.credits - jm.restant
      const riot = typeof jm.depenseRiot === "number" && Number.isInteger(jm.depenseRiot) && jm.depenseRiot >= 0 ? jm.depenseRiot : null
      return { poche, riot, departFixe: d?.fixe ?? false, prouvee: false }
    })
    const equipes: Record<string, number | null> = {}
    for (const [e, ps] of membres) {
      const prouvee = ps.length === 5 && ps.every((p) => {
        const x = joueurs[p]
        return x !== null && x.poche !== null && x.poche >= 0 && x.riot !== null && !absent(p, m.numero) && !absent(p, m.numero - 1) && !afkImport(p)
      }) && ps.reduce((t, p) => t + joueurs[p]!.poche!, 0) === ps.reduce((t, p) => t + joueurs[p]!.riot!, 0)
      equipes[e] = prouvee ? ps.reduce((t, p) => t + joueurs[p]!.riot!, 0) : null
      if (prouvee) for (const p of ps) {
        const x = joueurs[p]!
        x.prouvee = x.departFixe || x.poche === x.riot
      }
    }
    return { numero: m.numero, joueurs, equipes }
  })
}

/** Ce que garde une manche (décision 3 du plan du ticket 4.54) : ta poche prouvée, les dépenses d'équipe prouvées. */
export type DepenseManche = { poche: number | null; depenseEquipe: Somme | null; depenseAdverse: Somme | null }
/** Au moins 3 autres joueurs différents dans la somme de leurs poches (Confidentialité, comme les groupes). */
export const MIN_JOUEURS_POCHES = 3

/**
 * Les champs de la dépense, pour le joueur `toi` : ceux de chaque manche jouée, par numéro ; les poches prouvées des autres joueurs sur
 * toute la partie (en somme et en joueurs-manches, { 0, 0 } sous 3 joueurs différents) ; null sans seconde source (pochesDeLaPartie).
 */
export function depensesProuvees(n: Neutre): { manches: Map<number, DepenseManche>; autres: Somme } | null {
  const poches = pochesDeLaPartie(n)
  if (poches === null) return null
  const moi = n.joueurs[n.toi].equipe
  const adverse = n.joueurs.find((j) => j.equipe !== moi)?.equipe ?? null
  const somme = (pm: PochesManche, e: string | null): Somme | null => {
    const v = e === null ? null : pm.equipes[e] ?? null
    return v === null ? null : { somme: v, effectif: n.joueurs.filter((j) => j.equipe === e).length }
  }
  const manches = new Map<number, DepenseManche>()
  const autres: Somme = { somme: 0, effectif: 0 }
  const contributeurs = new Set<number>()
  for (const pm of poches) {
    const toi = pm.joueurs[n.toi]
    pm.joueurs.forEach((x, p) => {
      if (p !== n.toi && x !== null && x.prouvee) {
        autres.somme += x.poche!
        autres.effectif++
        contributeurs.add(p)
      }
    })
    manches.set(pm.numero, { poche: toi !== null && toi.prouvee ? toi.poche : null, depenseEquipe: somme(pm, moi), depenseAdverse: somme(pm, adverse) })
  }
  return { manches, autres: contributeurs.size >= MIN_JOUEURS_POCHES ? autres : { somme: 0, effectif: 0 } }
}

/**
 * La partie réduite au contrat depuis sa forme neutre : ta partie, tes manches jouées et tes
 * kills, les groupes (d'au moins 3 autres joueurs, AFK d'au moins un quart des manches
 * exclus) et les cumuls par agent des autres. Aucun contrôle de confidentialité ici : voir
 * reduirePartie. Compo null s'il manque un rôle ou un agent de ton équipe.
 */
export function calculer(n: Neutre, roles: Roles, options: Options = {}): Sortie {
  const afkMortEnClutch = options.afkMortEnClutch === true
  const nb = n.joueurs.length
  const toi = n.toi
  const moi = n.joueurs[toi]
  const eq = n.joueurs.map((j) => j.equipe)
  const adverses = (a: number, b: number) => eq[a] !== eq[b]
  const camp = (p: number): Camp => (p === toi ? "toi" : eq[p] === eq[toi] ? "equipe" : "adversaire")
  const sansManches = n.chacunPourSoi || n.file === "hurm"
  const r = regles(n.file)
  const avecCote = r.coteRouge !== null && (moi.equipe === "Red" || moi.equipe === "Blue")
  const coteDe = (equipe: string, numero: number): Cote | null => {
    if (r.coteRouge === null || (equipe !== "Red" && equipe !== "Blue")) return null
    const c = r.coteRouge(numero)
    return equipe === "Red" ? c : c === "attaque" ? "defense" : "attaque"
  }
  const typeAchat = (valeur: number | null, numero: number): TypeAchat | null => {
    if (r.pistolets === null) return null
    if (r.pistolets.includes(numero)) return "pistolet"
    return valeur === null ? null : typeSelonValeur(valeur)
  }

  const abandonnees = new Set(n.manches.filter((m) => m.issue === "Surrendered").map((m) => m.numero))
  const jouees = n.manches.filter((m) => m.issue !== "Surrendered")
  // Kills par manche, dans l'ordre du temps (tri stable), hors manches abandonnées.
  const killsTries = n.kills
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => !abandonnees.has(k.manche))
    .sort((a, b) => a.k.manche - b.k.manche || a.k.momentManche - b.k.momentManche || a.i - b.i)
    .map(({ k }) => k)
  const killsDe = new Map<number, KillNeutre[]>()
  for (const k of killsTries) {
    const l = killsDe.get(k.manche)
    if (l) l.push(k)
    else killsDe.set(k.manche, [k])
  }
  const mancheDe = new Map(n.manches.map((m) => [m.numero, m]))

  // AFK d'au moins un quart des manches jouées (`was_afk`) : hors des groupes et des cumuls. Partie importée de
  // tracker.gg : l'export n'a pas l'AFK de chaque manche, seulement son nombre (`player-loadout`, en compétition et
  // en non classé), que la lecture met dans `manchesAfk` ; ce nombre sert ici, absent il vaut 0.
  const afkPartie = n.joueurs.map((j, p) => {
    if (jouees.length === 0) return false
    const afk = n.provenance === "tracker.gg" ? j.manchesAfk ?? 0 : jouees.filter((m) => m.joueurs[p]?.afk === true).length
    return afk * 4 >= jouees.length
  })






  const afkSelonTracker = (m: MancheNeutre, p: number) => mancheDe.get(m.numero - 1)?.joueurs[p]?.afk === true
  /** La mort par le spike : HenrikDev la donne comme un kill de la victime par elle-même. */
  const parSpike = (k: KillNeutre) => k.tueur === k.victime && k.arme?.type === "Bomb"

  // ── une manche, pour tous les joueurs ──
  const analyser = (m: MancheNeutre): Analyse => {
    const ks = killsDe.get(m.numero) ?? []
    // Un seul modèle du vivant, pour la survie, les clutchs et « pendant que tu vis » (EXPERIENCE.md, Survie, Clutchs,
    // Échanges) : un joueur tué puis vu plus tard dans la manche (relevés d'un kill suivant, ou tué de nouveau) a été
    // relevé et compte vivant dès cette mort ; un mort qui tue encore (son utilitaire, posé avant sa mort) ne revit pas ;
    // la mort par le spike ne tue pas. `vu` : dernier instant où chaque joueur est vu, victime d'un kill ou relevé.
    const vu = n.joueurs.map(() => -Infinity)
    for (const k of ks) {
      vu[k.victime] = Math.max(vu[k.victime], k.momentManche)
      for (const rl of k.releves) vu[rl.joueur] = Math.max(vu[rl.joueur], k.momentManche)
    }
    /** Le kill tue sa victime pour de bon : ni mort par le spike, ni victime revue ensuite. */
    const tue = (k: KillNeutre) => !parSpike(k) && !(vu[k.victime] > k.momentManche)
    const faits: FaitsJoueur[] = n.joueurs.map(() => ({ morts: 0, survie: true, premiereMort: null, killsAdverses: 0, assists: 0, assistsKast: 0, echangee: false, clutch: null }))
    for (const k of ks) {
      const v = faits[k.victime]
      if (v.premiereMort === null) v.premiereMort = k.momentManche
      // Morts qui comptent (K/D) : toutes, sauf celle par le spike.
      if (!parSpike(k)) v.morts++
      for (const a of k.assistants) {
        faits[a].assists++
        if (k.arme?.type !== "Bomb") faits[a].assistsKast++
      }
      if (k.tueur === null || !adverses(k.tueur, k.victime)) continue
      faits[k.tueur].killsAdverses++
      const tueur = k.tueur
      if (ks.some((k2) => k2.victime === tueur && k2.tueur !== null && k2.tueur !== k.victime && eq[k2.tueur] === eq[k.victime]
        && k2.momentManche >= k.momentManche && k2.momentManche <= k.momentManche + DELAI_ECHANGE_MS)) v.echangee = true
    }
    // Survie : vivant à la fin (aucun kill ne l'a tué pour de bon), hors manche AFK selon tracker.gg.
    faits.forEach((f, p) => {
      f.survie = !afkSelonTracker(m, p) && !ks.some((k) => k.victime === p && tue(k))
    })
    // Clutch : premier instant où un joueur est le seul vivant de son équipe face à N ≥ 1 adversaires ; un joueur AFK
    // (selon tracker.gg) compte vivant, ou mort avec l'option, et n'est jamais le joueur du clutch.
    const presents = m.joueurs.some((j) => j !== null) ? m.joueurs.map((j) => j !== null) : n.joueurs.map(() => true)
    const vivant = presents.map((pr, p) => pr && !(afkMortEnClutch && afkSelonTracker(m, p)))
    const verifier = () => {
      for (let p = 0; p < nb; p++) {
        if (!vivant[p] || faits[p].clutch !== null || afkSelonTracker(m, p)) continue
        let allies = 0, adv = 0
        for (let q = 0; q < nb; q++) if (vivant[q]) eq[q] === eq[p] ? allies++ : adv++
        if (allies === 1 && adv >= 1) faits[p].clutch = adv
      }
    }
    verifier()
    const vivantAvant: boolean[][] = []
    const vivantApres: boolean[][] = []
    for (const k of ks) {
      vivantAvant.push(vivant.slice())
      if (tue(k)) vivant[k.victime] = false
      verifier()
      vivantApres.push(vivant.slice())
    }
    // Élimination comptée, règle de tracker.gg (EXPERIENCE.md, Clutchs) : une équipe dont les morts comptées égalent ses
    // joueurs présents est tenue pour éliminée ; une mort compte sauf si sa victime est revue ensuite (relevés d'un kill
    // suivant), si bien qu'un joueur tué deux fois sans être revu compte deux morts. Le dernier tué de l'équipe, sans
    // clutch dans la manche, en a un face aux adversaires vivants à la dernière mort d'un autre joueur de son équipe. La
    // mort par le spike, sans effet sur le vivant, n'y compte pas non plus, ni pour l'élimination ni comme dernier tué.
    for (const e of [...new Set(eq)]) {
      const morts = ks.map((k, i) => ({ k, i })).filter(({ k }) => eq[k.victime] === e && !parSpike(k))
      if (morts.length === 0) continue
      const comptees = morts.filter(({ k }) => !ks.some((k2) => k2.momentManche > k.momentManche && k2.releves.some((rl) => rl.joueur === k.victime))).length
      if (comptees < n.joueurs.filter((_, q) => eq[q] === e && presents[q]).length) continue
      const x = morts[morts.length - 1].k.victime
      const autres = morts.filter(({ k }) => k.victime !== x)
      if (faits[x].clutch !== null || afkSelonTracker(m, x) || autres.length === 0) continue
      const apres = vivantApres[autres[autres.length - 1].i]
      const adv = n.joueurs.filter((_, q) => apres[q] && eq[q] !== e).length
      if (adv >= 1) faits[x].clutch = adv
    }
    // Dégâts et touches reçus des adversaires.
    const recu = n.joueurs.map(() => ({ ...zero(), degats: 0 }))
    m.joueurs.forEach((j, q) => {
      for (const d of j?.degats ?? []) {
        if (!adverses(q, d.cible)) continue
        const c = recu[d.cible]
        c.degats += d.degats; c.tete += d.tete; c.corps += d.corps; c.jambes += d.jambes
      }
    })
    return { m, kills: ks, faits, recu, vivantAvant }
  }
  const analyses = sansManches ? [] : jouees.map(analyser)

  // Ticket 4.54 : la dépense prouvée de chaque manche, seulement avec une seconde source (champs absents sinon).
  const depensesDe = depensesProuvees(n)
  // ── tes manches ──
  const manches: Manche[] = analyses.map(({ m, kills: ks, faits, recu, vivantAvant }) => {
    const j = m.joueurs[toi]
    const f = faits[toi]
    const gagnee = m.gagnante === null ? null : m.gagnante === moi.equipe
    const equipement = (cle: string, lire: (jm: JoueurMancheNeutre) => number | null = (jm) => jm.equipement): Somme | null => {
      if (r.pistolets === null) return null
      let somme = 0, effectif = 0, contributeurs = 0
      m.joueurs.forEach((jm, p) => {
        const v = jm === null ? null : lire(jm)
        if (v !== null && (cle === moi.equipe ? eq[p] === cle : eq[p] !== moi.equipe)) {
          somme += v
          effectif++
          if (p !== toi) contributeurs++
        }
      })
      // Au moins 3 autres joueurs que toi dans la somme, sinon elle redonnerait leur équipement.
      return contributeurs < 3 ? null : { somme, effectif }
    }
    const achatDe = (s: Somme | null) => (s === null ? null : typeAchat(s.somme / s.effectif, m.numero))
    const equipementEquipe = equipement(moi.equipe)
    const equipementAdverse = equipement("")
    const premier = ks[0] ?? null
    const premiereMort = premier ? camp(premier.victime) : null
    const premierKill = premier && premier.tueur !== null && adverses(premier.tueur, premier.victime) ? camp(premier.tueur) : null
    const moiDans = (rs: Releve[]) => rs.find((x) => x.joueur === toi) ?? null
    const relevePremier = premier && premier.victime !== toi ? moiDans(premier.releves) : null
    // Vengeances : « pendant que tu vis » selon le modèle du vivant de la survie et des clutchs (relevé vivant dès sa mort,
    // mort qui tue encore resté mort, mort par le spike sans effet), juste avant la mort de l'allié.
    let alliesTues = 0, alliesVenges = 0, mortsParAdversaire = 0, mortsVengees = 0
    ks.forEach((k, i) => {
      const parAdversaire = k.tueur !== null && adverses(k.tueur, k.victime)
      const tueur = k.tueur
      const venge = (par: (p: number) => boolean) => ks.some((k2) => k2.victime === tueur && k2.tueur !== null && par(k2.tueur)
        && k2.momentManche >= k.momentManche && k2.momentManche <= k.momentManche + DELAI_ECHANGE_MS)
      if (parAdversaire && k.victime !== toi && eq[k.victime] === moi.equipe && vivantAvant[i][toi]) {
        alliesTues++
        if (venge((p) => p === toi)) alliesVenges++
      }
      if (parAdversaire && k.victime === toi) {
        mortsParAdversaire++
        if (venge((p) => p !== toi && eq[p] === moi.equipe)) mortsVengees++
      }
    })
    const victimesDeToi = new Set(ks.filter((k) => k.tueur === toi && adverses(toi, k.victime)).map((k) => k.victime))
    // Adversaires présents dans la manche : un ace les tue tous.
    const adversairesManche = n.joueurs.map((_, p) => p).filter((p) => adverses(toi, p) && (m.joueurs.every((jm) => jm === null) || m.joueurs[p] !== null))
    const monEquipe = n.joueurs.map((_, p) => p).filter((p) => eq[p] === moi.equipe)
    // Distance au spike : ta position au premier kill qui suit la pose de ton équipe.
    let positionApresPose: Position | null = null
    const pose = m.pose
    if (pose && pose.joueur !== null && eq[pose.joueur] === moi.equipe && pose.moment !== null) {
      const t = pose.moment
      const apres = ks.find((k) => k.momentManche > t)
      positionApresPose = apres ? moiDans(apres.releves)?.position ?? null : null
    }
    const caps = j?.capacites ?? null
    return {
      numero: m.numero,
      cote: avecCote ? coteDe(moi.equipe, m.numero) : null,
      gagnee,
      issue: m.issue,
      ceremonie: m.ceremonie,
      achat: typeAchat(j?.equipement ?? null, m.numero),
      equipement: j?.equipement ?? null,
      restant: j?.restant ?? null,
      arme: j?.arme ?? null,
      armure: j?.armure ?? null,
      achatEquipe: achatDe(equipementEquipe),
      equipementEquipe,
      achatAdverse: achatDe(equipementAdverse),
      equipementAdverse,
      restantEquipe: equipement(moi.equipe, (jm) => jm.restant),
      restantAdverse: equipement("", (jm) => jm.restant),
      ...(depensesDe === null ? {} : depensesDe.manches.get(m.numero) ?? { poche: null, depenseEquipe: null, depenseAdverse: null }),
      score: j?.score ?? null,
      kills: j ? f.killsAdverses : null,
      tete: j?.tete ?? null,
      corps: j?.corps ?? null,
      jambes: j?.jambes ?? null,
      degatsInfliges: j ? j.degats.reduce((s, d) => (adverses(toi, d.cible) ? s + d.degats : s), 0) : null,
      degatsRecus: recu[toi].degats,
      touchesRecues: { tete: recu[toi].tete, corps: recu[toi].corps, jambes: recu[toi].jambes },
      capacites: caps,
      afk: j?.afk ?? null,
      pose: m.pose ? { site: m.pose.site, moment: m.pose.moment, position: m.pose.position, poseur: m.pose.joueur === null ? null : camp(m.pose.joueur) } : null,
      desamorcage: m.desamorcage
        ? { moment: m.desamorcage.moment, position: m.desamorcage.position, desamorceur: m.desamorcage.joueur === null ? null : camp(m.desamorcage.joueur) }
        : null,
      survie: f.survie,
      kast: kastDe(f),
      premierKill,
      premiereMort,
      etatApresPremiereMort: premiereMort === null ? null : premiereMort === "adversaire" ? "5contre4" : "4contre5",
      clutch: f.clutch === null ? null : { adversaires: f.clutch, gagne: gagnee === true },
      multiKill: f.killsAdverses,
      ace: adversairesManche.length > 0 && adversairesManche.every((p) => victimesDeToi.has(p)),
      alliesTues,
      alliesVenges,
      mortsParAdversaire,
      mortsVengees,
      sansPerte: gagnee === true && !ks.some((k) => eq[k.victime] === moi.equipe),
      aceEquipe: monEquipe.length >= 5 && monEquipe.every((p) => faits[p].killsAdverses > 0),
      positionPremierKill: premier === null ? null : premier.victime === toi ? premier.position : relevePremier?.position ?? null,
      regardPremierKill: relevePremier?.regard ?? null,
      positionApresPose,
      distanceSpike: pose && positionApresPose ? distance(positionApresPose, pose.position) : null,
      ultime: caps === null || caps.x === null ? null : caps.x >= 1,
    }
  })

  // ── tes kills ──
  const premierDe = new Map<number, KillNeutre>()
  for (const [numero, ks] of killsDe) premierDe.set(numero, ks[0])
  /** Ton dernier relevé de la manche à `t` au plus tard (kills, pose, désamorçage), hors le kill `exclu`. */
  const dernierReleve = (numero: number, t: number, exclu: KillNeutre): { regard: number; moment: number } | null => {
    const evenements: { moment: number; releves: Releve[] }[] = (killsDe.get(numero) ?? []).filter((k) => k !== exclu)
      .map((k) => ({ moment: k.momentManche, releves: k.releves }))
    const m = mancheDe.get(numero)
    for (const s of [m?.pose, m?.desamorcage]) if (s && s.moment !== null) evenements.push({ moment: s.moment, releves: s.releves })
    let meilleur: { regard: number; moment: number } | null = null
    for (const e of evenements) {
      const x = e.releves.find((rl) => rl.joueur === toi)
      if (x && x.regard !== null && e.moment <= t && (meilleur === null || e.moment >= meilleur.moment)) meilleur = { regard: x.regard, moment: e.moment }
    }
    return meilleur
  }
  // Tes touches sur une victime dans une manche vont à ton dernier kill d'elle seulement : en deathmatch et en
  // `hurm`, la manche couvre toute la partie, et une victime relevée peut retomber.
  const dernierKillDe = new Map<string, KillNeutre>()
  for (const k of killsTries) if (k.tueur === toi && k.victime !== toi) dernierKillDe.set(`${k.manche}:${k.victime}`, k)
  const kills: Kill[] = []
  for (const k of killsTries) {
    const meurt = k.victime === toi
    if (!meurt && k.tueur !== toi) continue
    const autre = meurt ? k.tueur : k.victime
    const adverse = autre !== null && autre !== toi && adverses(toi, autre)
    const releveDe = (p: number | null) => (p === null ? null : k.releves.find((x) => x.joueur === p) ?? null)
    const m = mancheDe.get(k.manche)
    const t = m?.pose?.moment ?? null
    const premierDuel = !sansManches && premierDe.get(k.manche) === k && k.tueur !== null && adverses(k.tueur, k.victime)
    if (meurt) {
      const dernier = dernierReleve(k.manche, k.momentManche, k)
      const tueurPos = releveDe(k.tueur)?.position ?? null
      let proche: number | null = null
      for (const x of k.releves) {
        if (x.joueur === toi || eq[x.joueur] !== moi.equipe) continue
        const d = distance(k.position, x.position)
        if (d !== null && (proche === null || d < proche)) proche = d
      }
      kills.push({
        manche: k.manche, momentManche: k.momentManche, momentPartie: k.momentPartie, sens: "mort", adverse,
        arme: k.arme, tirSecondaire: k.tirSecondaire, premierDuel, apresPose: t !== null && k.momentManche > t,
        position: k.position,
        regard: dernier?.regard ?? null,
        ageRegard: dernier ? k.momentManche - dernier.moment : null,
        distance: distance(k.position, tueurPos),
        angleTueur: dernier && k.position && tueurPos
          ? ecartAngle(dernier.regard, Math.atan2(tueurPos.y - k.position.y, tueurPos.x - k.position.x))
          : null,
        allieLePlusProche: proche,
        touchesVictime: null,
      })
    } else {
      const moiIci = releveDe(toi)
      const mesDegats = (m?.joueurs[toi]?.degats ?? null)
      let touches: (Touches & { degats: number }) | null = null
      if (mesDegats !== null && dernierKillDe.get(`${k.manche}:${k.victime}`) === k) {
        touches = { tete: 0, corps: 0, jambes: 0, degats: 0 }
        for (const d of mesDegats) {
          if (d.cible !== k.victime) continue
          touches.tete += d.tete; touches.corps += d.corps; touches.jambes += d.jambes; touches.degats += d.degats
        }
      }
      kills.push({
        manche: k.manche, momentManche: k.momentManche, momentPartie: k.momentPartie, sens: "kill", adverse,
        arme: k.arme, tirSecondaire: k.tirSecondaire, premierDuel, apresPose: t !== null && k.momentManche > t,
        position: moiIci?.position ?? null,
        regard: moiIci?.regard ?? null,
        ageRegard: null,
        distance: distance(moiIci?.position ?? null, k.position),
        angleTueur: null,
        allieLePlusProche: null,
        touchesVictime: touches,
      })
    }
  }

  // ── groupes et cumuls ──
  const manchesPartie = sansManches ? 0 : jouees.length
  const ajouterManche = (c: CompteursManche, p: number, a: Analyse) => {
    const j = a.m.joueurs[p]
    const f = a.faits[p]
    c.manches++
    c.score += j?.score ?? 0
    c.kills += f.killsAdverses
    c.morts += f.morts
    c.assists += f.assists
    c.degatsInfliges += j ? j.degats.reduce((s, d) => (adverses(p, d.cible) ? s + d.degats : s), 0) : 0
    c.degatsRecus += a.recu[p].degats
    c.touchesDonnees.tete += j?.tete ?? 0
    c.touchesDonnees.corps += j?.corps ?? 0
    c.touchesDonnees.jambes += j?.jambes ?? 0
    c.touchesRecues.tete += a.recu[p].tete
    c.touchesRecues.corps += a.recu[p].corps
    c.touchesRecues.jambes += a.recu[p].jambes
    if (kastDe(f)) c.manchesKast++
    if (f.survie) c.manchesSurvecues++
    if (f.clutch !== null) {
      c.clutchs++
      if (a.m.gagnante !== null && a.m.gagnante === eq[p]) c.clutchsGagnes++
    }
    if (f.premiereMort !== null) {
      c.premiereMort.somme += f.premiereMort
      c.premiereMort.effectif++
    }
  }
  /** `minimum` : joueurs contributeurs sous lesquels une somme vaut null (3 pour les groupes ; 1 pour les cumuls, par agent). */
  const compteurs = (membres: readonly number[], minimum: number): Groupe => {
    // Une somme où ne contribuent que 1 ou 2 joueurs redonnerait leurs valeurs ; sur aucun joueur, elle ne dit rien.
    // En fonction, pas en fléchée `<T>(…) =>` : Scripting lit les .ts comme du TSX et y verrait une balise.
    function garder<T>(valeur: T, contributeurs: number): T | null {
      return contributeurs > 0 && contributeurs < minimum ? null : valeur
    }
    const capacite = (cle: keyof Capacites): CompteCapacite | null => {
      const avec = membres.filter((p) => n.joueurs[p].capacites?.[cle] != null)
      return garder({ somme: avec.reduce((s, p) => s + n.joueurs[p].capacites![cle]!, 0), joueurs: avec.length, manches: avec.length * manchesPartie }, avec.length)
    }
    const somme = (lire: (j: JoueurNeutre) => number | null): Somme | null => {
      const valeurs = membres.map((p) => lire(n.joueurs[p])).filter((v): v is number => v !== null)
      return garder({ somme: valeurs.reduce((s, v) => s + v, 0), effectif: valeurs.length }, valeurs.length)
    }
    const total = (lire: (t: Totaux) => number | null) => membres.reduce((s, p) => s + (lire(n.joueurs[p].totaux) ?? 0), 0)
    let detailManches: CompteursManche | null = null
    let parCote: Record<Cote, CompteursManche | null> | null = null
    let parAchat: Record<TypeAchat, CompteursManche | null> | null = null
    let apresPistoletPerdu: Somme | null = null
    if (!sansManches) {
      const contributeurs = new Map<CompteursManche, Set<number>>()
      const ajouter = (c: CompteursManche, p: number, a: Analyse) => {
        ajouterManche(c, p, a)
        contributeurs.set(c, (contributeurs.get(c) ?? new Set<number>()).add(p))
      }
      const garde = (c: CompteursManche) => garder(c, contributeurs.get(c)?.size ?? 0)
      const detail = compteursVides()
      const cotes = avecCote ? { attaque: compteursVides(), defense: compteursVides() } : null
      const achats = r.pistolets !== null ? { pistolet: compteursVides(), eco: compteursVides(), force: compteursVides(), complet: compteursVides() } : null
      for (const a of analyses) {
        for (const p of membres) {
          ajouter(detail, p, a)
          const cote = cotes ? coteDe(eq[p], a.m.numero) : null
          if (cotes && cote) ajouter(cotes[cote], p, a)
          const type = achats ? typeAchat(a.m.joueurs[p]?.equipement ?? null, a.m.numero) : null
          if (achats && type) ajouter(achats[type], p, a)
        }
      }
      detailManches = garde(detail)
      if (cotes) parCote = { attaque: garde(cotes.attaque), defense: garde(cotes.defense) }
      if (achats) parAchat = { pistolet: garde(achats.pistolet), eco: garde(achats.eco), force: garde(achats.force), complet: garde(achats.complet) }
      if (r.pistolets) {
        const apres = { somme: 0, effectif: 0 }
        const comptes = new Set<number>()
        for (const numero of r.pistolets) {
          const pistolet = jouees.find((m) => m.numero === numero)
          const suivante = jouees.find((m) => m.numero === numero + 1)
          if (!pistolet || !suivante || pistolet.gagnante === null) continue
          for (const p of membres) {
            if (eq[p] === pistolet.gagnante) continue
            const type = typeAchat(suivante.joueurs[p]?.equipement ?? null, suivante.numero)
            if (type === null) continue
            apres.effectif++
            comptes.add(p)
            if (type === "force") apres.somme++
          }
        }
        apresPistoletPerdu = garder(apres, comptes.size)
      }
    }
    return {
      effectif: membres.length,
      manches: membres.length * manchesPartie,
      score: total((t) => t.score),
      kills: total((t) => t.kills),
      morts: total((t) => t.morts),
      assists: total((t) => t.assists),
      degatsInfliges: total((t) => t.degatsInfliges),
      degatsRecus: total((t) => t.degatsRecus),
      touchesDonnees: { tete: total((t) => t.tete), corps: total((t) => t.corps), jambes: total((t) => t.jambes) },
      capacites: { c: capacite("c"), q: capacite("q"), e: capacite("e"), x: capacite("x") },
      depense: somme((j) => j.depense),
      note: somme((j) => j.note),
      detailManches,
      parCote,
      parAchat,
      apresPistoletPerdu,
    }
  }
  const autres = n.joueurs.map((_, p) => p).filter((p) => p !== toi)
  const retenus = autres.filter((p) => !afkPartie[p])
  const groupe = (membres: number[]) => (membres.length >= 3 ? compteurs(membres, 3) : null)
  const campAllies = sansManches ? null : groupe(retenus.filter((p) => eq[p] === moi.equipe))
  const campAdversaires = sansManches ? null : groupe(retenus.filter((p) => eq[p] !== moi.equipe))
  // Le lobby moins un camp gardé redonnerait l'autre camp : un seul camp gardé, pas de lobby ; deux camps
  // gardés, le lobby tait chaque somme que l'un d'eux tait. Aucun camp gardé (escarmouche, deathmatch) : lobby seul.
  const lobby = (campAllies === null) !== (campAdversaires === null)
    ? null
    : campAllies && campAdversaires ? masquer(groupe(retenus)!, campAllies, campAdversaires) : groupe(retenus)
  const groupes: Groupes = { lobby, allies: campAllies, adversaires: campAdversaires }

  const semaine = semaineIso(n.debut)
  const agents = [...new Set(autres.map((p) => n.joueurs[p].agent?.id).filter((a): a is string => a !== undefined))].sort()
  const cumulsAgents: CumulAgent[] = []
  for (const agent of agents) {
    const deLAgent = (p: number | null) => p !== null && p !== toi && n.joueurs[p].agent?.id === agent && adverses(toi, p)
    const killsContre = killsTries.filter((k) => k.tueur === toi && deLAgent(k.victime)).length
    const mortsContre = killsTries.filter((k) => k.victime === toi && deLAgent(k.tueur)).length
    const membres = retenus.filter((p) => n.joueurs[p].agent?.id === agent)
    if (membres.length === 0 && killsContre === 0 && mortsContre === 0) continue
    cumulsAgents.push({ semaine, file: n.file, agent, ...compteurs(membres, 1), killsContre, mortsContre })
  }

  // ── ce que chaque agent adverse te fait (entrée 11 de epic-stats-analyses) ──
  let agentsAdverses: AgentAdverse[] | null = null
  if (!sansManches) {
    const parAgent = new Map<string, AgentAdverse>()
    const entree = (p: number | null): AgentAdverse | null => {
      if (p === null || p === toi || !adverses(toi, p)) return null
      const agent = n.joueurs[p].agent?.id
      if (typeof agent !== "string" || agent === "") return null
      let e = parAgent.get(agent)
      if (e === undefined) {
        e = { agent, manches: 0, killsSurToi: 0, killsSurLui: 0, touchesSurToi: zero(), degatsSurToi: 0, armes: [] }
        parAgent.set(agent, e)
      }
      return e
    }
    for (let p = 0; p < nb; p++) entree(p)
    for (const a of analyses) {
      // Présent dans la manche : sa ligne de manche ; sans aucune ligne (présence inconnue), chacun compte, comme pour l'ace.
      const presence = a.m.joueurs.some((j) => j != null)
      for (let q = 0; q < nb; q++) {
        const e = entree(q)
        if (e === null) continue
        const j = a.m.joueurs[q] ?? null
        if (!presence || j !== null) e.manches++
        for (const d of j?.degats ?? []) {
          if (d.cible !== toi) continue
          e.degatsSurToi += d.degats; e.touchesSurToi.tete += d.tete; e.touchesSurToi.corps += d.corps; e.touchesSurToi.jambes += d.jambes
        }
      }
    }
    const armes = new Map<AgentAdverse, Map<string, number>>()
    for (const k of killsTries) {
      if (k.victime === toi) {
        const e = entree(k.tueur)
        if (e === null) continue
        e.killsSurToi++
        const nom = typeof k.arme?.name === "string" ? k.arme.name.trim() : ""
        if (nom === "") continue
        const m = armes.get(e) ?? new Map<string, number>()
        m.set(nom, (m.get(nom) ?? 0) + 1)
        armes.set(e, m)
      } else if (k.tueur === toi) {
        const e = entree(k.victime)
        if (e !== null) e.killsSurLui++
      }
    }
    for (const [e, m] of armes) {
      e.armes = [...m].map(([nom, kills]) => ({ nom, kills })).sort((x, y) => y.kills - x.kills || (x.nom < y.nom ? -1 : x.nom > y.nom ? 1 : 0))
    }
    agentsAdverses = [...parAgent.keys()].sort().map((agent) => parAgent.get(agent)!)
  }

  // ── ta partie ──
  const monEquipe = n.equipes.find((e) => e.cle === moi.equipe) ?? null
  const allies = autres.filter((p) => eq[p] === moi.equipe)
  let resultat: Resultat | null = null
  if (!n.chacunPourSoi && monEquipe && monEquipe.gagnee !== null) {
    resultat = monEquipe.gagnee ? "victoire" : n.equipes.some((e) => e.gagnee === true) ? "defaite" : "nul"
  }
  const rangs = (membres: number[]): Somme | null => {
    if (n.file !== "competitive") return null
    const ids = membres.map((p) => n.joueurs[p].rang?.id ?? null).filter((id): id is number => id !== null && id >= 3)
    return ids.length >= 3 ? { somme: ids.reduce((s, x) => s + x, 0), effectif: ids.length } : null
  }
  const monScore = moi.totaux.score
  let compo: Record<string, number> | null = null
  const roleParJoueur = equipeDeLaCompo(n)?.map((p) => roleDe(roles, n.joueurs[p].agent?.id))
  if (roleParJoueur && roleParJoueur.every((role) => role !== null)) {
    const compte = new Map<string, number>()
    for (const role of roleParJoueur as string[]) compte.set(role, (compte.get(role) ?? 0) + 1)
    compo = {}
    for (const role of [...compte.keys()].sort()) compo[role] = compte.get(role)!
  }
  const partie: Partie = {
    matchId: n.matchId,
    provenance: n.provenance,
    reduction: VERSION_REDUCTION,
    debut: n.debut,
    duree: n.duree,
    file: n.file,
    carte: n.carte,
    saison: n.saison,
    agent: moi.agent,
    equipe: n.chacunPourSoi ? null : moi.equipe,
    resultat,
    place: n.chacunPourSoi ? placeAuScore(n.joueurs.map((j) => j.totaux.score), toi) : null,
    joueurs: nb,
    manchesGagnees: sansManches ? null : monEquipe?.manchesGagnees ?? null,
    manchesPerdues: sansManches ? null : monEquipe?.manchesPerdues ?? null,
    abandon: abandonnees.size > 0,
    groupe: moi.groupe === null ? null : n.joueurs.filter((j, p) => j.groupe === moi.groupe && (n.chacunPourSoi || eq[p] === moi.equipe)).length,
    rang: moi.rang,
    rangsAllies: rangs(allies),
    rangsAdversaires: rangs(autres.filter((p) => eq[p] !== moi.equipe)),
    placement: n.chacunPourSoi || allies.length < 3 || monScore === null
      ? null
      : 1 + allies.filter((p) => (n.joueurs[p].totaux.score ?? -Infinity) > monScore).length,
    ...mvpsDe(n, moi.equipe),
    note: moi.note,
    mention: moi.mention,
    fleches: moi.fleches ?? null,
    totaux: moi.totaux,
    capacites: moi.capacites,
    depense: moi.depense,
    equipement: moi.equipement,
    manchesAfk: moi.manchesAfk,
    compo,
    manches,
    kills,
    groupes,
    agentsAdverses,
    // Ticket 4.54 : les poches prouvées des autres joueurs, sur toute la partie (seulement avec une seconde source).
    ...(depensesDe === null ? {} : { pochesAutres: depensesDe.autres }),
  }
  return { partie, cumulsAgents }
}

// ─────────────────────────── confidentialité ───────────────────────────

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Mots que la réduction écrit d'elle-même (ses énumérations) ou recopie d'un vocabulaire
 * fermé du jeu (api-henrikdev.md : types d'arme, issues, cérémonies, mentions, sites) :
 * jamais une fuite, même quand un joueur porte ce pseudo ou ce tag.
 */
const VOCABULAIRE: ReadonlySet<string> = new Set([
  "toi", "equipe", "adversaire", "attaque", "defense", "pistolet", "eco", "force", "complet", "5contre4", "4contre5",
  "victoire", "defaite", "nul", "kill", "mort", "henrikdev", "tracker.gg", "Red", "Blue",
  "Weapon", "Ability", "Bomb", "Fall", "Melee",
  "Elimination", "Detonate", "Defuse", "Surrendered",
  "CeremonyAce", "CeremonyCloser", "CeremonyClutch", "CeremonyDefault", "CeremonyFlawless", "CeremonyTeamAce", "CeremonyThrifty",
  "pass", "merit", "distinction", "A", "B", "C",
  // Ticket 4.52 (relecture) : les flèches de performance gardées, valeurs de Riot, jamais un pseudo.
  "double_down", "down", "neutral", "up", "double_up",
])












export function fuites(sortie: unknown, brute: unknown, puuid: string): string[] {
  const moi = String(puuid).toLowerCase()
  const interdits = new Set<string>()
  const pseudos = new Set<string>()
  const permis = new Set<string>([moi])
  const noms = new Set<string>()
  const interdire = (s: unknown) => {
    if (typeof s === "string" && s !== "" && s.toLowerCase() !== moi) interdits.add(s.toLowerCase())
  }
  const permettre = (s: unknown) => {
    if (typeof s === "string") permis.add(s.toLowerCase())
  }
  const nommer = (s: unknown) => {
    if (typeof s === "string" && s !== "") noms.add(s)
  }
  // Tout joueur cité, où qu'il soit : sa fiche, ou `{ puuid, name, tag, team }` dans une manche ou un kill.
  const recueillir = (x: unknown) => {
    if (Array.isArray(x)) {
      for (const e of x) recueillir(e)
      return
    }
    if (!estObjet(x)) return
    if (typeof x.puuid === "string" && x.puuid.toLowerCase() !== moi) {
      interdire(x.puuid)
      const nom = texte(x.name), tag = texte(x.tag)
      if (nom) pseudos.add(nom)
      if (tag) pseudos.add(tag)
      if (nom || tag) interdire(`${nom ?? ""}#${tag ?? ""}`)
    }
    for (const cle of Object.keys(x)) {
      const v = x[cle]
      if (cle === "party_id") interdire(v)
      if ((cle === "team" || cle === "team_id") && v !== "Red" && v !== "Blue") interdire(v)
      recueillir(v)
    }
  }
  recueillir(brute)
  if (estObjet(brute)) {
    const meta = estObjet(brute.metadata) ? brute.metadata : {}
    permettre(meta.match_id)
    if (estObjet(meta.map)) { permettre(meta.map.id); nommer(meta.map.name) }
    if (estObjet(meta.season)) permettre(meta.season.id)
    if (estObjet(meta.queue)) nommer(meta.queue.id)
    for (const p of Array.isArray(brute.players) ? brute.players : []) {
      if (!estObjet(p)) continue
      if (estObjet(p.agent)) { permettre(p.agent.id); nommer(p.agent.name) }
      if (estObjet(p.tier)) nommer(p.tier.name)
    }
    for (const k of Array.isArray(brute.kills) ? brute.kills : []) {
      if (estObjet(k) && estObjet(k.weapon)) { permettre(k.weapon.id); nommer(k.weapon.name) }
    }
    for (const r of Array.isArray(brute.rounds) ? brute.rounds : []) {
      for (const s of estObjet(r) && Array.isArray(r.stats) ? r.stats : []) {
        const eco = estObjet(s) && estObjet(s.economy) ? s.economy : {}
        if (estObjet(eco.weapon)) { permettre(eco.weapon.id); nommer(eco.weapon.name) }
        if (estObjet(eco.armor)) permettre(eco.armor.id)
      }
    }
  }
  const fautive = (s: string, cle: boolean): boolean => {
    if (s.includes("#")) return true
    const bas = s.toLowerCase()
    for (const i of interdits) if (bas.includes(i)) return true
    for (const u of s.match(UUID_G) ?? []) if (!permis.has(u.toLowerCase())) return true
    return !cle && pseudos.has(s) && !noms.has(s) && !VOCABULAIRE.has(s)
  }
  const chemins: string[] = []
  const parcourir = (x: unknown, chemin: string) => {
    if (typeof x === "string") {
      if (fautive(x, false)) chemins.push(chemin)
    } else if (Array.isArray(x)) {
      x.forEach((e, i) => parcourir(e, `${chemin}[${i}]`))
    } else if (estObjet(x)) {
      Object.keys(x).forEach((cle, i) => {
        // Une clé fautive ne s'écrit jamais dans un chemin : seul son rang y figure.
        if (fautive(cle, true)) {
          chemins.push(`${chemin}{clé ${i}}`)
          parcourir(x[cle], `${chemin}{clé ${i}}`)
        } else parcourir(x[cle], `${chemin}.${cle}`)
      })
    }
  }
  parcourir(sortie, "$")
  return chemins
}

// ─────────────────────────── réduction ───────────────────────────

/**
 * Une partie de la liste v4 réduite au contrat avant tout enregistrement. `gardee` : la
 * partie et ses cumuls par agent ; `ecartee` : partie personnalisée, que la collecte
 * dépasse ; `refusee` : identifiant d'un autre joueur resté (`confidentialite`) ou partie
 * illisible (`forme`), ou agent de ton équipe sans rôle (`roles`, chemins de ses champs
 * agent : l'appelant relit la table des rôles) ; chemins JSON seulement, jamais une valeur,
 * aucune sortie partielle, comptée et jamais dépassée. `roles` : rôle de chaque id d'agent,
 * tiré du catalogue.
 */
export function reduirePartie(brute: unknown, puuid: string, roles: Roles, options: Options = {}): Reduction {
  let sortie: Sortie
  try {
    const lecture = lireV4(brute, puuid, options.depensesRiot ?? null)
    if (lecture.statut === "illisible") return { statut: "refusee", raison: "forme", chemins: lecture.chemins }
    if (lecture.statut === "ecartee") return { statut: "ecartee", raison: "personnalisee" }
    const manquants = rolesManquants(lecture.neutre, roles)
    if (manquants.length > 0) {
      // Rang de chaque fiche lue dans `players[]` de la brute : le chemin de son agent, jamais son id.
      const fiches = (brute as { players: unknown[] }).players.flatMap((p, i) => (estObjet(p) ? [i] : []))
      return { statut: "refusee", raison: "roles", chemins: manquants.map((p) => `$.players[${fiches[p]}].agent.id`) }
    }
    sortie = calculer(lecture.neutre, roles, options)
  } catch {
    return { statut: "refusee", raison: "forme", chemins: ["$"] }
  }
  const chemins = fuites(sortie, brute, puuid)
  if (chemins.length > 0) return { statut: "refusee", raison: "confidentialite", chemins }
  return { statut: "gardee", partie: sortie.partie, cumulsAgents: sortie.cumulsAgents }
}
