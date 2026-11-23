
















import { traduire } from "./langue"
import type { AgentAdverse, Partie, Touches } from "./reduction"
import { LIBELLES_ZONES, MOYENNE, NOMS_AGENTS, POURCENTAGE, TIRET, effectifEnClair, nombreEnClair, valeurEnClair, type Selection } from "./metriques"
import {
  MIN_CAS_ANALYSE, chiffreDAnalyse, effectifDAnalyse, partiesDeLAnalyse,
  type Champ, type ChiffreAnalyse, type EffectifAnalyse, type PartiesDAnalyse,
} from "./analyses"


const NBSP = String.fromCharCode(0xa0)


function compte(n: number, mot: string, aucun: string | null = null): string {
  if (n === 0 && aucun !== null) return aucun
  return `${nombreEnClair(n, 0)}${NBSP}${mot}${n > 1 ? "s" : ""}`
}
/** Une phrase qui commence par une majuscule. */
function majuscule(s: string): string {
  return s === "" ? s : s[0].toUpperCase() + s.slice(1)
}

// ─────────────────────────── textes ───────────────────────────

/** Les titres (Bloc, en capitales par titreDeBloc) : Duels, sur la période ; Détail d'une partie. */
export const TITRE_AGENTS = "Ce que chaque agent te fait"
export const TITRE_AGENTS_PARTIE = "Ce que chaque agent t'a fait"
/** Les étiquettes des trois listes du bloc de Duels. */
export const ETIQUETTE_KILLS = "Ses kills et ses dégâts"
export const ETIQUETTE_TOUCHES = "Ses touches sur toi"
export const ETIQUETTE_ARME = "L'arme qui te tue le plus"
/** Les colonnes des Tableaux. */
/** La première colonne : l'agent, puis ses parties face à toi (décision 6), coupée seulement après « · ». */
export const COLONNES_AGENTS: readonly string[] = [`Agent${NBSP}· parties`, "Te tue", "Tu le tues", "Dégâts par manche"]
export const COLONNES_ARME: readonly string[] = ["Agent", "Arme", "Kills"]
export const COLONNES_PARTIE: readonly string[] = ["Agent", "Te tue", "Tu le tues", "Tête", "Dégâts"]
/** Le délai « il te voit, il te tue » : dit, jamais estimé. */
export const NOTE_DELAI = "Le délai entre le moment où un adversaire te voit et celui où il te tue n'existe dans aucune source : ValShop ne l'estime pas."
/** Agents seulement (EXPERIENCE.md, Confidentialité). */
export const NOTE_AGENTS = "Agents seulement, jamais un joueur."
/** La méthode du bloc de Duels. */
export const NOTE_METHODE = "Agent · parties face à lui. Te tue : ses kills sur toi ; tu le tues : tes kills sur lui ; dégâts : les siens sur toi, par manche jouée face à lui ; tête : part de ses touches sur toi à la tête."
/** Ce que dit un « — » du bloc de Duels. */
export const NOTE_TIRET = `«${NBSP}${TIRET}${NBSP}» : peu de données, moins de ${MIN_CAS_ANALYSE} manches ou ${MIN_CAS_ANALYSE} touches.`
/** La méthode de la section du Détail. */
export const NOTE_PARTIE = `Te tue : ses kills sur toi ; tu le tues : tes kills sur lui ; tête : part de ses touches sur toi à la tête, en pourcentage dès ${MIN_CAS_ANALYSE} touches ; dégâts : les siens sur toi dans la partie.`
/** Aucune partie de la période n'a le champ. */
export const SANS_DETAIL_PERIODE = "Aucune partie de cette période n'a le détail par agent adverse : ValShop le garde pour les parties lues depuis sa mise à jour."
/** Une partie sans le champ, dans son Détail. */
export const SANS_DETAIL_PARTIE = "Pas de détail par agent adverse pour cette partie : ValShop ne le garde que pour les parties lues depuis sa mise à jour."
/** Des parties de la période ont le détail, mais aucun adversaire d'agent connu. */
export const SANS_AGENT_PERIODE = "Aucun agent adverse connu dans les parties de cette période."
/** Une partie à manches sans aucun adversaire d'agent connu. */
export const SANS_AGENT_PARTIE = "Aucun agent adverse connu dans cette partie."

// ─────────────────────────── parties ───────────────────────────

/** Le champ lu, à la partie et non à la manche (partiesDeLAnalyse ne le reçoit jamais) : son nom, dans l'effectif. */
export const CHAMP_AGENTS_ADVERSES: Champ = { nom: "le détail par agent adverse", manche: () => true }

/** La partie a-t-elle le champ (une liste, même vide) ? */
export function aLeDetailParAgent(p: Partie): boolean {
  return Array.isArray(p.agentsAdverses)
}

/**
 * Les parties du bloc de Duels dans une liste : celles des files complètes (partiesDeLAnalyse du socle), puis celles qui ont le champ ;
 * les autres écartées et comptées, dont les importées de tracker.gg. `horsFiles` : les parties d'une autre file (le mode Tout).
 */
export function partiesDesAgents(parties: readonly Partie[]): PartiesDAnalyse {
  const desFiles = partiesDeLAnalyse(parties, "completes")
  const avec: Partie[] = []
  let sans = 0, importees = 0
  for (const p of desFiles.parties) {
    if (aLeDetailParAgent(p)) avec.push(p)
    else {
      sans++
      if (p.provenance === "tracker.gg") importees++
    }
  }
  return { parties: avec, horsFiles: desFiles.horsFiles, sansChamp: sans, importees, manchesRetirees: 0, files: "completes", champ: CHAMP_AGENTS_ADVERSES }
}

// ─────────────────────────── noms ───────────────────────────


export function nomDeLAgent(id: string, noms: Readonly<Record<string, string>> = NOMS_AGENTS): string {
  const cle = String(id).toLowerCase()
  if (Object.prototype.hasOwnProperty.call(noms, cle)) return noms[cle]
  return `agent non reconnu (${cle === "" ? "sans id" : `id ${cle.slice(0, 8)}`})`
}

// ─────────────────────────── comptes ───────────────────────────

/** Les comptes d'un agent sur une ou plusieurs parties. */
type Comptes = {
  nom: string
  parties: number
  manches: number
  killsSurToi: number
  killsSurLui: number
  touches: Touches
  degats: number
  armes: Map<string, number>
}

/** Un nombre lu d'une partie gardée : fini et positif, sinon 0 (une partie abîmée ne fait jamais lever). */
function n0(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0
}

/** Ajoute une entrée d'une partie aux comptes de son agent (par nom), `vue` : la partie déjà comptée pour ce nom. */
function ajouter(parNom: Map<string, Comptes>, e: AgentAdverse, vus: Set<string>, noms: Readonly<Record<string, string>>): void {
  if (e == null || typeof e.agent !== "string" || e.agent === "") return
  const nom = nomDeLAgent(e.agent, noms)
  let c = parNom.get(nom)
  if (c === undefined) {
    c = { nom, parties: 0, manches: 0, killsSurToi: 0, killsSurLui: 0, touches: { tete: 0, corps: 0, jambes: 0 }, degats: 0, armes: new Map() }
    parNom.set(nom, c)
  }
  if (!vus.has(nom)) {
    c.parties++
    vus.add(nom)
  }
  c.manches += n0(e.manches)
  c.killsSurToi += n0(e.killsSurToi)
  c.killsSurLui += n0(e.killsSurLui)
  const t = e.touchesSurToi
  if (t != null) {
    c.touches.tete += n0(t.tete)
    c.touches.corps += n0(t.corps)
    c.touches.jambes += n0(t.jambes)
  }
  c.degats += n0(e.degatsSurToi)
  for (const a of Array.isArray(e.armes) ? e.armes : []) {
    const arme = a != null && typeof a.nom === "string" ? a.nom.trim() : ""
    if (arme !== "") c.armes.set(arme, (c.armes.get(arme) ?? 0) + n0(a.kills))
  }
}

/**
 * Les armes de ses kills sur toi en tête : celles qui en ont le plus (`noms`, par nom ; plusieurs à égalité, jamais départagées), leurs
 * kills chacune, et le nombre d'armes nommées (`distinctes`) ; null sans arme nommée.
 */
export type ArmesEnTete = { readonly noms: readonly string[]; readonly kills: number; readonly distinctes: number }

function armesEnTete(armes: ReadonlyMap<string, number>): ArmesEnTete | null {
  let max = 0, distinctes = 0
  for (const kills of armes.values()) if (kills > 0) { distinctes++; max = Math.max(max, kills) }
  if (max === 0) return null
  const noms = [...armes].filter(([, k]) => k === max).map(([nom]) => nom).sort((a, b) => a.localeCompare(b, "fr"))
  return { noms, kills: max, distinctes }
}

/** Des noms en liste : « Vandal », « Ghost et Vandal », « Ghost, Sheriff et Vandal ». */
export function armesEnMots(noms: readonly string[]): string {
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}` : noms[0] ?? ""
}


function partDeSesKills(k: number, total: number): string {
  if (total === 1) return "son seul kill sur toi"
  if (k === total) return `ses ${compte(total, "kill")} sur toi`
  return `${nombreEnClair(k, 0)} de ses ${compte(total, "kill")} sur toi`
}






function armesDites(a: ArmesEnTete, total: number, passe: boolean): string {
  if (a.distinctes === 1) return `son arme contre toi : ${a.noms[0]}, ${partDeSesKills(a.kills, total)}`
  if (a.noms.length === 1) return `l'arme qui ${passe ? "t'a tué" : "te tue"} le plus : ${a.noms[0]}, ${partDeSesKills(a.kills, total)}`
  return `ses armes à égalité : ${armesEnMots(a.noms)}, ${compte(a.kills, "kill")} chacune sur ses ${compte(total, "kill")} sur toi`
}

/** L'ordre des lignes : kills sur toi décroissants, puis parties face à lui, puis nom. */
function ordre(a: Comptes, b: Comptes): number {
  return b.killsSurToi - a.killsSurToi || b.parties - a.parties || a.nom.localeCompare(b.nom, "fr")
}


function killsDits(c: Comptes): string {
  const sur = c.killsSurToi === 0 ? "aucun kill sur toi" : `${compte(c.killsSurToi, "kill")} sur toi`
  const lui = c.killsSurLui === 0 ? "aucun de tes kills sur lui" : `${nombreEnClair(c.killsSurLui, 0)} de tes kills sur lui`
  return `${sur}, ${lui}`
}


function touchesDites(t: Touches): string {
  const total = t.tete + t.corps + t.jambes
  if (total === 0) return "aucune touche sur toi"
  return `${compte(total, "touche")} sur toi : ${nombreEnClair(t.tete, 0)} à la tête, ${nombreEnClair(t.corps, 0)} au corps, ${nombreEnClair(t.jambes, 0)} aux jambes`
}

// ─────────────────────────── Duels : la période ───────────────────────────

/** Les zones d'une Barre empilée : parts dès 5 touches, null dessous (piste vide), et leur légende. */
export type ZonesDeLAgent = { parts: Touches | null; legende: string }






export type LigneAgentAdverse = {
  readonly nom: string
  readonly parties: number
  readonly manches: number
  readonly killsSurToi: number
  readonly killsSurLui: number
  readonly touches: Touches
  readonly totalTouches: number
  readonly degats: number
  readonly tete: ChiffreAnalyse
  readonly degatsParManche: ChiffreAnalyse
  readonly arme: ArmesEnTete | null
  /** Ses armes contre toi, dites (armesDites) ; null sans arme nommée. */
  readonly texteArme: string | null
  readonly libelle: string
  readonly libelleTouches: string
  readonly zones: ZonesDeLAgent
  readonly phrase: string
}


export type AgentsDeLaPeriode = {
  readonly lignes: readonly LigneAgentAdverse[]
  readonly effectif: EffectifAnalyse
  readonly texteEffectif: string | null
}


function zonesDe(t: Touches): ZonesDeLAgent {
  const total = t.tete + t.corps + t.jambes
  const assez = total >= MIN_CAS_ANALYSE
  const morceau = (cle: keyof Touches) => {
    const ecrit = assez ? valeurEnClair(t[cle] / total, POURCENTAGE) : nombreEnClair(t[cle], 0)
    return `${LIBELLES_ZONES[cle].toLowerCase()} ${ecrit}`.replace(/ /g, NBSP)
  }
  return { parts: assez ? { tete: t.tete / total, corps: t.corps / total, jambes: t.jambes / total } : null, legende: [morceau("tete"), morceau("corps"), morceau("jambes")].join(`${NBSP}· `) }
}

/** Une ligne de la période, ses comptes faits. */
function ligneDeLaPeriode(c: Comptes): LigneAgentAdverse {
  const total = c.touches.tete + c.touches.corps + c.touches.jambes
  const tete = chiffreDAnalyse({ num: c.touches.tete, den: total, cas: total })
  const degatsParManche = chiffreDAnalyse({ num: c.degats, den: c.manches, cas: c.manches }, MOYENNE)
  const arme = armesEnTete(c.armes)
  const texteArme = arme === null ? null : armesDites(arme, c.killsSurToi, false)
  const teteDite = tete.valeur !== null ? `, ${tete.texte} à la tête` : total > 0 ? `, ${tete.mention ?? "aucune valeur"} pour sa part à la tête` : ""
  const degatsDits = degatsParManche.valeur !== null ? `${degatsParManche.texte} dégâts par manche` : `${compte(c.degats, "dégât", "aucun dégât")} sur ${compte(c.manches, "manche")}, peu de données`
  const armeDite = texteArme === null ? "" : ` ; ${texteArme}`
  return {
    nom: c.nom, parties: c.parties, manches: c.manches, killsSurToi: c.killsSurToi, killsSurLui: c.killsSurLui, touches: c.touches, totalTouches: total,
    degats: c.degats, tete, degatsParManche, arme, texteArme,
    libelle: effectifEnClair(c.nom, c.parties),
    libelleTouches: effectifEnClair(c.nom, total),
    zones: zonesDe(c.touches),
    phrase: `${c.nom}, ${compte(c.parties, "partie")} face à toi : ${killsDits(c)} ; ${touchesDites(c.touches)}${teteDite} ; ${degatsDits}${armeDite}.`,
  }
}


function phraseEffectif(e: EffectifAnalyse): string | null {
  if (e.parties > 0) return `${majuscule(e.texte)}${e.texteEcartees === null ? "" : ` ; ${e.texteEcartees}`}.`
  return e.texteEcartees === null ? null : `${majuscule(e.texteEcartees)}.`
}

/**
 * Ce que chaque agent adverse te fait sur la sélection (Duels) : les parties des files complètes qui ont le champ ; une ligne par agent
 * (par nom), dans l'ordre : kills sur toi, parties, nom. L'effectif ne dit pas les parties d'une autre file (la phrase du mode Tout de
 * Duels les dit déjà) : seulement celles sans le champ.
 */
export function agentsAdversesDeLaPeriode(sel: Selection, noms: Readonly<Record<string, string>> = NOMS_AGENTS): AgentsDeLaPeriode {
  const a = partiesDesAgents(sel.parties)
  const parNom = new Map<string, Comptes>()
  for (const p of a.parties) {
    const vus = new Set<string>()
    for (const e of p.agentsAdverses ?? []) ajouter(parNom, e, vus, noms)
  }
  const lignes = [...parNom.values()].sort(ordre).map(ligneDeLaPeriode)
  const effectif = effectifDAnalyse({ ...a, horsFiles: 0 })
  return { lignes, effectif, texteEffectif: phraseEffectif(effectif) }
}

/** La note du bloc de Duels : l'effectif, la méthode, le « — » s'il en paraît un, le délai, agents seulement. */
export function noteDesAgents(r: AgentsDeLaPeriode): string {
  const morceaux: string[] = []
  if (r.texteEffectif !== null) morceaux.push(r.texteEffectif)
  if (r.lignes.length > 0) {
    morceaux.push(NOTE_METHODE)
    if (r.lignes.some((l) => l.degatsParManche.valeur === null || (l.totalTouches > 0 && l.tete.valeur === null))) morceaux.push(NOTE_TIRET)
  }
  morceaux.push(NOTE_DELAI, NOTE_AGENTS)
  return morceaux.map(traduire).join(" ")
}

// ─────────────────────────── Détail d'une partie ───────────────────────────


export type LigneAgentDeLaPartie = {
  readonly nom: string
  readonly killsSurToi: number
  readonly killsSurLui: number
  readonly touches: Touches
  readonly totalTouches: number
  readonly degats: number
  readonly tete: string
  readonly arme: ArmesEnTete | null
  readonly phrase: string
}

/**
 * La section du Détail : `sansManches` (deathmatch, match à mort en équipe, aucune manche : pas de section) ; `absent`, la partie
 * gardée sans le champ (sa phrase) ; sinon ses lignes (par kills sur toi, puis nom), vides si aucun adversaire n'a d'agent connu.
 */
export type AgentsDeLaPartie =
  | { readonly etat: "sansManches" }
  | { readonly etat: "absent"; readonly phrase: string }
  | { readonly etat: "ok"; readonly lignes: readonly LigneAgentDeLaPartie[] }

/** Ce que chaque agent adverse t'a fait dans la partie `p`. */
export function agentsAdversesDeLaPartie(p: Partie, noms: Readonly<Record<string, string>> = NOMS_AGENTS): AgentsDeLaPartie {
  if (p.agentsAdverses === null || !Array.isArray(p.manches) || p.manches.length === 0) return { etat: "sansManches" }
  if (!aLeDetailParAgent(p)) return { etat: "absent", phrase: SANS_DETAIL_PARTIE }
  const parNom = new Map<string, Comptes>()
  const vus = new Set<string>()
  for (const e of p.agentsAdverses ?? []) ajouter(parNom, e, vus, noms)
  const lignes = [...parNom.values()].sort(ordre).map((c): LigneAgentDeLaPartie => {
    const total = c.touches.tete + c.touches.corps + c.touches.jambes
    const tete = total === 0 ? TIRET : total >= MIN_CAS_ANALYSE ? valeurEnClair(c.touches.tete / total, POURCENTAGE) : `${nombreEnClair(c.touches.tete, 0)} sur ${nombreEnClair(total, 0)}`
    const teteDite = total === 0 ? "" : total >= MIN_CAS_ANALYSE ? `, ${tete} à la tête` : ""
    const arme = armesEnTete(c.armes)
    const armeDite = arme === null ? "" : ` ; ${armesDites(arme, c.killsSurToi, true)}`
    return {
      nom: c.nom, killsSurToi: c.killsSurToi, killsSurLui: c.killsSurLui, touches: c.touches, totalTouches: total, degats: c.degats, tete, arme,
      phrase: `${c.nom} : ${killsDits(c)} ; ${touchesDites(c.touches)}${teteDite} ; ${compte(c.degats, "dégât", "aucun dégât")} sur toi${armeDite}.`,
    }
  })
  return { etat: "ok", lignes }
}
