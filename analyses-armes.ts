


























import { traduire } from "./langue"
import type { Arme, Kill, Manche, Partie, Touches } from "./reduction"
import type { SectionArmes } from "./ressources"
import { FILES_ARMES, POURCENTAGE, TIRET, armeDuKill, fileAdmise, nombreEnClair, type Files, type Selection } from "./metriques"
import {
  CHAMP_ARME_DE_MANCHE, DISTANCE_LOIN, DISTANCE_PRES, MIN_CAS_ANALYSE, PEU_DE_DONNEES, TRANCHES_DISTANCE, armeDuDuel, aucuneEcartee,
  chiffreDAnalyse, duelALArme, duelGagne, effectifDAnalyse, effectifEnPhrase, estDuel, genreDeFile, killAUneCapacite, partiesDeLAnalyse,
  trancheDuKill,
  type Champ, type ChiffreAnalyse, type CleTrancheDistance, type EffectifAnalyse, type Ecartees, type GenreEcarte, type PartiesDAnalyse,
} from "./analyses"

/** Espace insécable : avant « m », entre un nombre et son mot. */
const NBSP = String.fromCharCode(0xa0)


function compte(n: number, mot: string, aucun: string | null = null): string {
  if (n === 0 && aucun !== null) return aucun
  return `${nombreEnClair(n, 0)}${NBSP}${mot}${n > 1 ? "s" : ""}`
}
/** Une phrase qui commence par une majuscule. */
function majuscule(s: string): string {
  return s === "" ? s : s[0].toUpperCase() + s.slice(1)
}


export const TRANCHES_DITES: Readonly<Record<CleTrancheDistance, string>> = {
  pres: `moins de ${DISTANCE_PRES}${NBSP}mètres`,
  milieu: `de ${DISTANCE_PRES} à ${DISTANCE_LOIN}${NBSP}mètres`,
  loin: `plus de ${DISTANCE_LOIN}${NBSP}mètres`,
}

const TRANCHES_EN_NOTE: Readonly<Record<CleTrancheDistance, string>> = {
  pres: `à moins de ${DISTANCE_PRES}${NBSP}m`,
  milieu: `de ${DISTANCE_PRES} à ${DISTANCE_LOIN}${NBSP}m`,
  loin: `à plus de ${DISTANCE_LOIN}${NBSP}m`,
}

// ─────────────────────────── parties écartées, par genre ───────────────────────────

// Le genre d'une partie écartée (genreDeFile), les comptes par genre (Ecartees) et la phrase d'effectif (effectifEnPhrase) sont ceux du
// socle (analyses.ts), partagés avec Cartes.

/** Compte les parties d'une liste hors de `files`, par genre. */
function horsDesFiles(parties: readonly Partie[], files: Files, e: Record<GenreEcarte, number>): void {
  for (const p of parties) if (!fileAdmise(p.file, files)) e[genreDeFile(p.file)]++
}

// ─────────────────────────── analyse 1 : tête selon la distance ───────────────────────────

/** La note de méthode de Tête selon la distance (maquette Armes). */
export const NOTE_TETE_DISTANCE = "Même méthode que tracker.gg (balles mises aux ennemis tués), classée selon la distance du kill."
/** Ce que dit un « — » sous 5 cas (EXPERIENCE.md, State Patterns, Analyse sous l'effectif minimal) : les kills aux touches relevées. */
export const NOTE_TIRET_TETE_DISTANCE = `«${NBSP}${TIRET}${NBSP}» : ${PEU_DE_DONNEES}, moins de ${MIN_CAS_ANALYSE} kills aux touches relevées.`

/**
 * Le champ que lit Tête selon la distance : tes touches de fin de partie (totaux tête, corps, jambes), lues à la partie et non à la
 * manche (aucune manche n'est retirée par lui ; partiesDeLAnalyse ne le reçoit jamais).
 */
export const TOUCHES_RELEVEES: Champ = { nom: "touches relevées", manche: () => true }

/** Tes touches de fin de partie se lisent : les trois totaux connus, des nombres, et au moins une touche (touchesDonneesDe de 4.11). */
export function touchesRelevees(p: Partie): boolean {
  const t = p.totaux
  if (t == null) return false
  const v = [t.tete, t.corps, t.jambes]
  return v.every((x) => typeof x === "number" && Number.isFinite(x)) && (t.tete as number) + (t.corps as number) + (t.jambes as number) > 0
}

/** Tes touches à la victime d'un kill, si elles se lisent (comme teteCorpsJambesParArme) ; null sinon. */
function touchesDuKill(k: Kill): Touches | null {
  const t = k.touchesVictime
  return t != null && [t.tete, t.corps, t.jambes].every((v) => typeof v === "number" && Number.isFinite(v)) ? t : null
}

/** Des kills d'une arme : tous, ceux dont les touches se lisent (`killsMesures`, les kills mesurés de 4.11), et leurs touches. */
export type ComptesTete = { kills: number; killsMesures: number; touches: Touches }

function comptesVides(): ComptesTete {
  return { kills: 0, killsMesures: 0, touches: { tete: 0, corps: 0, jambes: 0 } }
}
function compterKill(c: ComptesTete, k: Kill): void {
  c.kills++
  const t = touchesDuKill(k)
  if (t === null) return
  c.killsMesures++
  c.touches.tete += t.tete
  c.touches.corps += t.corps
  c.touches.jambes += t.jambes
}

/**
 * Une tranche d'une arme : ses comptes, et son % de tête (chiffreDAnalyse : touches à la tête sur touches, cas = kills aux touches
 * relevées ; « — » et « peu de données » sous 5 ; « — » seul quand 5 kills ou plus n'ont aucune touche relevée ; jamais coloré).
 */
export type TeteDUneTranche = ChiffreAnalyse & ComptesTete & { readonly cle: CleTrancheDistance; readonly libelle: string }






export type TeteSelonLaDistanceArme = ComptesTete & {
  readonly nom: string
  readonly libelle: string
  readonly tranches: readonly TeteDUneTranche[]
  readonly sansPosition: ComptesTete
  readonly precision: string | null
  readonly phrase: string
}

/**
 * Tête selon la distance : une ligne par arme, ordre de 4.11 (kills décroissants, puis nom) ; kills sans position ; l'effectif du socle
 * (`effectif`), ses parties écartées par genre (`ecartees`) et sa phrase (`texteEffectif`).
 */
export type TeteSelonLaDistance = {
  readonly lignes: readonly TeteSelonLaDistanceArme[]
  readonly sansPosition: number
  readonly effectif: EffectifAnalyse
  readonly ecartees: Ecartees
  readonly texteEffectif: string | null
}





function trancheTeteDite(t: TeteDUneTranche): string {
  const dit = TRANCHES_DITES[t.cle]
  if (t.kills === 0) return `${dit}, aucun kill`
  const dont = t.cas < t.kills ? ` dont ${t.cas === 0 ? "aucun" : nombreEnClair(t.cas, 0)} aux touches relevées` : ""
  const quoi = t.mention !== null ? t.mention : t.valeur === null ? "aucune touche relevée" : `${t.texte} de tête`
  return `${dit}, ${compte(t.kills, "kill")}${dont}, ${quoi}`
}

/** Une tranche de Tête selon la distance, ses comptes faits. */
function trancheTete(cle: CleTrancheDistance, libelle: string, c: ComptesTete): TeteDUneTranche {
  const total = c.touches.tete + c.touches.corps + c.touches.jambes
  return { ...chiffreDAnalyse({ num: c.touches.tete, den: total, cas: c.killsMesures }), ...c, cle, libelle }
}

/**
 * Les parties de Tête selon la distance : celles de ses files (FILES_ARMES, une autre file écartée et comptée), puis celles dont tes
 * touches se lisent, les autres écartées et comptées (dont les importées), comme partiesDeLAnalyse le ferait d'un champ.
 */
export function partiesDeLaTete(parties: readonly Partie[]): PartiesDAnalyse {
  const desFiles = partiesDeLAnalyse(parties, FILES_ARMES)
  const avec: Partie[] = []
  let sans = 0, importees = 0
  for (const p of desFiles.parties) {
    if (touchesRelevees(p)) avec.push(p)
    else {
      sans++
      if (p.provenance === "tracker.gg") importees++
    }
  }
  return { parties: avec, horsFiles: desFiles.horsFiles, sansChamp: sans, importees, manchesRetirees: 0, files: FILES_ARMES, champ: TOUCHES_RELEVEES }
}

/**
 * Tête selon la distance sur la sélection (Armes et visée ; récap) : pour chaque arme de tes kills d'adversaires, tes touches à chaque
 * victime dans la manche du kill, par tranche de distance du kill ; un kill sans ta position (ou sans celle de la victime) hors des
 * tranches, compté. Écartées : les parties hors des files à manches, par genre ; celles sans touches relevées, l'escarmouche à part.
 */
export function teteSelonLaDistance(sel: Selection): TeteSelonLaDistance {
  const a = partiesDeLaTete(sel.parties)
  const ecartees = aucuneEcartee()
  horsDesFiles(sel.parties, FILES_ARMES, ecartees)
  for (const p of partiesDeLAnalyse(sel.parties, FILES_ARMES).parties) {
    if (!touchesRelevees(p)) ecartees[genreDeFile(p.file) === "escarmouche" ? "escarmouche" : "sansTouches"]++
  }
  const parArme = new Map<string, { tout: ComptesTete; tranches: Record<CleTrancheDistance, ComptesTete>; sansPosition: ComptesTete }>()
  for (const p of a.parties) {
    for (const k of p.kills ?? []) {
      const nom = armeDuKill(k)
      if (nom === null) continue
      let x = parArme.get(nom)
      if (x === undefined) {
        x = { tout: comptesVides(), tranches: { pres: comptesVides(), milieu: comptesVides(), loin: comptesVides() }, sansPosition: comptesVides() }
        parArme.set(nom, x)
      }
      compterKill(x.tout, k)
      const cle = trancheDuKill(k)
      compterKill(cle === null ? x.sansPosition : x.tranches[cle], k)
    }
  }
  let sansPosition = 0
  const lignes = [...parArme].map(([nom, x]): TeteSelonLaDistanceArme => {
    const tranches = TRANCHES_DISTANCE.map((t) => trancheTete(t.cle, t.libelle, x.tranches[t.cle]))
    const sp = x.sansPosition.kills
    sansPosition += sp
    const places = x.tout.kills - sp
    const precision = sp > 0 ? `sur ${nombreEnClair(places, 0)} kill${places > 1 ? "s" : ""} avec position` : null
    const dits = tranches.map(trancheTeteDite)
    if (sp > 0) dits.push(`${compte(sp, "kill")} sans position, hors du calcul`)
    return {
      ...x.tout, nom, libelle: `${nom}${NBSP}· ${nombreEnClair(x.tout.kills, 0)}`, tranches, sansPosition: x.sansPosition, precision,
      phrase: `${nom}, ${compte(x.tout.kills, "kill")} : ${dits.map(traduire).join(" ; ")}.`,
    }
  })
  lignes.sort((p, q) => q.kills - p.kills || p.nom.localeCompare(q.nom, "fr"))
  return { lignes, sansPosition, effectif: effectifDAnalyse(a), ecartees, texteEffectif: effectifEnPhrase(a.parties.length, ecartees, true) }
}






export function noteTeteDistance(t: TeteSelonLaDistance): string {
  const morceaux = [NOTE_TETE_DISTANCE]
  if (t.lignes.some((l) => l.tranches.some((x) => x.mention !== null))) morceaux.push(NOTE_TIRET_TETE_DISTANCE)
  const sansTouche = t.lignes.flatMap((l) => l.tranches.filter((x) => x.mention === null && x.valeur === null).map((x) => `${l.nom} ${TRANCHES_EN_NOTE[x.cle]}`))
  if (sansTouche.length > 0) morceaux.push(`${majuscule(TIRET_SANS_TOUCHE)} : ${sansTouche.join(", ")}.`)
  const precises = t.lignes.filter((l) => l.precision !== null).map((l) => `${l.nom} ${l.precision}`)
  if (precises.length > 0) morceaux.push(`Un kill sans position sort du calcul : ${precises.join(", ")}.`)
  if (t.texteEffectif !== null) morceaux.push(t.texteEffectif)
  return morceaux.map(traduire).join(" ")
}
/** Ce que dit un « — » sans « peu de données » : 5 kills ou plus dans la tranche, aucune touche relevée. */
const TIRET_SANS_TOUCHE = `«${NBSP}${TIRET}${NBSP}», aucune touche relevée`

// ─────────────────────────── analyse 2 : duels gagnés selon la distance ───────────────────────────

/** Les files des duels : les files complètes, comme Ce qui te tue et les duels de l'entrée 4.9 (analyses-entrainement.md, Règles communes). */
export const FILES_DUELS: Files = "completes"
/** Ce que dit un « — » des duels, sous 5 duels à l'arme. */
export const NOTE_TIRET_DUELS = `«${NBSP}${TIRET}${NBSP}» : ${PEU_DE_DONNEES}, moins de ${MIN_CAS_ANALYSE} duels à l'arme.`

/** Des duels : tous, et ceux que tu gagnes. */
export type ComptesDuels = { duels: number; gagnes: number }

/** Une tranche de duels : ses comptes, sa part gagnée (chiffreDAnalyse, cas = duels, sens « haut ») et sa phrase VoiceOver. */
export type DuelsDUneTranche = ChiffreAnalyse & ComptesDuels & { readonly cle: CleTrancheDistance; readonly libelle: string; readonly phrase: string }

/** Une arme du détail : son nom, ses duels dans les tranches, ses tranches, ses duels sans position. */
export type DuelsParArme = ComptesDuels & { readonly nom: string; readonly tranches: readonly DuelsDUneTranche[]; readonly sansPosition: ComptesDuels }

/**
 * Duels gagnés selon la distance : toutes armes (`tranches`, leurs comptes, les duels à l'arme sans position, les duels hors de l'arme :
 * à une capacité ou à une arme sans nom ; l'effectif du socle, les parties écartées par genre et leur phrase) ; par arme (`parArme`, sur
 * les mêmes parties moins celles sans l'arme de ta manche, que `effectifParArme` dit ; `sansNom`, les duels perdus dont l'arme de manche
 * n'a pas de nom, hors du détail).
 */
export type DuelsSelonLaDistance = ComptesDuels & {
  readonly tranches: readonly DuelsDUneTranche[]
  readonly sansPosition: ComptesDuels
  readonly horsArme: { readonly capacites: number; readonly sansNom: number }
  readonly effectif: EffectifAnalyse
  readonly ecartees: Ecartees
  readonly texteEffectif: string | null
  readonly parArme: readonly DuelsParArme[]
  readonly effectifParArme: EffectifAnalyse
  readonly sansNom: number
}

function duelsVides(): ComptesDuels {
  return { duels: 0, gagnes: 0 }
}
function compterDuel(c: ComptesDuels, k: Kill): void {
  c.duels++
  if (duelGagne(k)) c.gagnes++
}
type ComptesTranches = { tranches: Record<CleTrancheDistance, ComptesDuels>; sansPosition: ComptesDuels }
function tranchesVides(): ComptesTranches {
  return { tranches: { pres: duelsVides(), milieu: duelsVides(), loin: duelsVides() }, sansPosition: duelsVides() }
}
function ranger(c: ComptesTranches, k: Kill): void {
  const cle = trancheDuKill(k)
  compterDuel(cle === null ? c.sansPosition : c.tranches[cle], k)
}


function trancheDuels(cle: CleTrancheDistance, libelle: string, c: ComptesDuels): DuelsDUneTranche {
  const chiffre = chiffreDAnalyse({ num: c.gagnes, den: c.duels, cas: c.duels }, POURCENTAGE, "haut")
  const dit = majuscule(TRANCHES_DITES[cle])
  const duels = `${compte(c.duels, "duel")} à l'arme`
  const phrase = c.duels === 0
    ? `${dit}, aucun duel à l'arme.`
    : chiffre.mention !== null ? `${dit}, ${duels} : ${chiffre.mention}.` : `${dit}, ${duels} : ${chiffre.texte} gagnés.`
  return { ...chiffre, ...c, cle, libelle, phrase }
}
function tranchesDuels(c: ComptesTranches): DuelsDUneTranche[] {
  return TRANCHES_DISTANCE.map((t) => trancheDuels(t.cle, t.libelle, c.tranches[t.cle]))
}
function sommeDesTranches(c: ComptesTranches): ComptesDuels {
  const s = duelsVides()
  for (const t of Object.values(c.tranches)) {
    s.duels += t.duels
    s.gagnes += t.gagnes
  }
  return s
}

/** Le nom d'une arme de manche, sans espaces autour ; null sans nom. */
function nomDeLArme(a: Arme | null): string | null {
  const nom = a !== null && typeof a.name === "string" ? a.name.trim() : ""
  return nom === "" ? null : nom
}

/**
 * Duels gagnés selon la distance sur la sélection (Armes et visée ; récap) : tes duels à une arme nommée, gagnés sur duels par tranche
 * de distance, toutes armes ; et par arme, l'arme du kill d'un duel gagné, l'arme de ta manche d'un duel perdu.
 */
export function duelsSelonLaDistance(sel: Selection): DuelsSelonLaDistance {
  const toutes = partiesDeLAnalyse(sel.parties, FILES_DUELS)
  const tout = tranchesVides()
  let capacites = 0, horsNom = 0
  for (const p of toutes.parties) {
    for (const k of p.kills ?? []) {
      if (duelALArme(k)) ranger(tout, k)
      else if (estDuel(k)) {
        if (killAUneCapacite(k)) capacites++
        else horsNom++
      }
    }
  }
  const detail = partiesDeLAnalyse(sel.parties, FILES_DUELS, CHAMP_ARME_DE_MANCHE)
  const parArme = new Map<string, ComptesTranches>()
  let sansNom = 0
  for (const p of detail.parties) {
    const manches = new Map<number, Manche>()
    for (const m of p.manches ?? []) manches.set(m.numero, m)
    for (const k of p.kills ?? []) {
      if (!duelALArme(k)) continue
      const nom = k.sens === "kill" ? armeDuDuel(k) : nomDeLArme(manches.get(k.manche)?.arme ?? null)
      if (nom === null) {
        sansNom++
        continue
      }
      let x = parArme.get(nom)
      if (x === undefined) {
        x = tranchesVides()
        parArme.set(nom, x)
      }
      ranger(x, k)
    }
  }
  const armes = [...parArme].map(([nom, x]): DuelsParArme => ({ nom, ...sommeDesTranches(x), tranches: tranchesDuels(x), sansPosition: x.sansPosition }))
  armes.sort((p, q) => q.duels + q.sansPosition.duels - (p.duels + p.sansPosition.duels) || p.nom.localeCompare(q.nom, "fr"))
  const ecartees = aucuneEcartee()
  horsDesFiles(sel.parties, FILES_DUELS, ecartees)
  return {
    ...sommeDesTranches(tout), tranches: tranchesDuels(tout), sansPosition: tout.sansPosition, horsArme: { capacites, sansNom: horsNom },
    effectif: effectifDAnalyse(toutes), ecartees, texteEffectif: effectifEnPhrase(toutes.parties.length, ecartees),
    // Le détail ne dit que ce qu'il retire de plus que les barres : les parties et les manches sans l'arme de ta manche.
    parArme: armes, effectifParArme: effectifDAnalyse({ ...detail, horsFiles: 0 }), sansNom,
  }
}






export function noteDuelsDistance(d: DuelsSelonLaDistance): string | null {
  const morceaux: string[] = []
  // Le « — » n'est dit que sous des barres dessinées : sans aucun duel à l'arme, le bloc dit sa phrase à leur place.
  if (d.duels + d.sansPosition.duels > 0 && d.tranches.some((x) => x.mention !== null)) morceaux.push(NOTE_TIRET_DUELS)
  const hors: string[] = []
  if (d.horsArme.capacites > 0) hors.push(`${compte(d.horsArme.capacites, "duel")} à une capacité`)
  if (d.horsArme.sansNom > 0) hors.push(`${compte(d.horsArme.sansNom, "duel")} à une arme sans nom`)
  if (hors.length > 0) morceaux.push(`Duels à l'arme seulement : ${hors.join(" et ")}, hors du calcul.`)
  if (d.sansPosition.duels > 0) morceaux.push(`${compte(d.sansPosition.duels, "duel")} à l'arme sans position, hors du calcul.`)
  if (d.texteEffectif !== null) morceaux.push(d.texteEffectif)
  return morceaux.length === 0 ? null : morceaux.map(traduire).join(" ")
}

// ─────────────────────────── analyses 3 et 4 : arme ramassée et grosse arme perdue ───────────────────────────

/**
 * L'Operator (identifiant du catalogue public des armes) : la seule grosse arme hors des fusils (seuil de l'entrée 1,
 * analyses-entrainement.md, analyse 4).
 */
export const OPERATOR = "a03b24d3-4319-996d-0f8c-94bbfba1dfc7"
/** Les catégories des grosses armes (seuil de l'entrée 1) : les fusils, `Rifle` du catalogue, et tout fusil qu'il ajoutera. */
export const CATEGORIES_GROSSES_ARMES: readonly string[] = ["Rifle"]
/** Les grosses armes dites, d'après le seuil : « un fusil ou l'Operator ». */
export const GROSSES_ARMES_DITES = "un fusil ou l'Operator"
/** Les libellés des deux Chiffres (maquette Armes). */
export const LIBELLE_ARME_RAMASSEE = "Kills à l'arme ramassée"
export const LIBELLE_FUSIL_PERDU = "Fusil perdu"
/** La méthode de l'arme ramassée (analyses-entrainement.md, analyse 3), dans la note du bloc. */
export const NOTE_ARME_RAMASSEE =
  "Arme ramassée : un kill à une autre arme que celle de ta manche ; un pistolet n'y compte pas quand ta manche a une arme principale, le couteau jamais."
/**
 * Sans aucune catégorie d'arme sur l'iPhone (section `armes` des ressources vide) : les deux Chiffres ne se calculent pas. Les
 * ressources se rangent au bouton « Mettre à jour » (jamais par ↻), et l'onglet ne les relit qu'avec ses données : à coup sûr à la
 * prochaine ouverture de l'app.
 */
export const SANS_CATEGORIES =
  "Arme ramassée et fusil perdu : catégories des armes absentes de l'iPhone ; « Mettre à jour » les range, visibles à la prochaine ouverture de l'app."

/** La section `armes` des ressources est-elle vide (aucune catégorie connue) ? */
export function sansCategories(armes: SectionArmes | null | undefined): boolean {
  return armes == null || Object.keys(armes).length === 0
}

/** L'identifiant d'une arme, en minuscules comme les clés des ressources ; null sans identifiant. */
function idDeLArme(a: Arme | null | undefined): string | null {
  const id = a != null && typeof a.id === "string" ? a.id.trim().toLowerCase() : ""
  return id === "" ? null : id
}
/** La catégorie d'une arme dans les ressources (« Rifle », « Sidearm », « Melee »…) ; null si elle n'y est pas. */
function categorieDeLArme(a: Arme | null | undefined, armes: SectionArmes): string | null {
  const id = idDeLArme(a)
  if (id === null) return null
  const x = Object.prototype.hasOwnProperty.call(armes, id) ? armes[id] : undefined
  return x != null && typeof x.categorie === "string" && x.categorie !== "" ? x.categorie : null
}
/** Une arme principale : ni un pistolet, ni le couteau. */
function principale(categorie: string): boolean {
  return categorie !== "Sidearm" && categorie !== "Melee"
}

/** Une grosse arme (seuil de l'entrée 1) : l'Operator, ou une arme d'une catégorie de grosse arme ; null si sa catégorie est inconnue. */
export function grosseArme(a: Arme | null | undefined, armes: SectionArmes): boolean | null {
  if (idDeLArme(a) === OPERATOR) return true
  const c = categorieDeLArme(a, armes)
  return c === null ? null : CATEGORIES_GROSSES_ARMES.includes(c)
}

/**
 * Un de tes kills à l'arme face à l'arme de ta manche : à l'arme de ta manche (`manche` : même identifiant, à défaut même nom), à une
 * arme ramassée (`ramassee`), au pistolet quand ta manche a une arme principale (`pistolet` : peut-être le tien, acheté en second, que
 * rien ne dit), au couteau (`couteau`, toujours à toi), ou sans la catégorie qu'il faut pour trancher (`inconnue`).
 */
export type ClasseDuKill = "manche" | "ramassee" | "pistolet" | "couteau" | "inconnue"

/** Classe un de tes kills à l'arme (armeDuKill non nul) d'après l'arme de sa manche et les catégories des ressources. */
export function classerKill(k: Kill, armeDeManche: Arme, armes: SectionArmes): ClasseDuKill {
  const ik = idDeLArme(k.arme), im = idDeLArme(armeDeManche)
  if (ik !== null && im !== null ? ik === im : armeDuKill(k) === nomDeLArme(armeDeManche)) return "manche"
  const ck = categorieDeLArme(k.arme, armes)
  if (ck === null) return "inconnue"
  if (ck === "Melee") return "couteau"
  if (ck === "Sidearm") {
    const cm = categorieDeLArme(armeDeManche, armes)
    if (cm === null) return "inconnue"
    if (principale(cm)) return "pistolet"
  }
  return "ramassee"
}

/** Un Chiffre des deux analyses, tel que l'écran le pose : sa clé, son libellé, sa valeur écrite, son sous-texte et sa phrase VoiceOver. */
export type ChiffreArme = { readonly cle: string; readonly libelle: string; readonly valeur: string; readonly sousTexte: string; readonly voix: string }

/**
 * Kills à l'arme ramassée (analyse 3) : la part de tes kills à l'arme classés faits à une arme ramassée (chiffreDAnalyse : cas = kills
 * classés, sens neutre) ; ses comptes (`kills` classés, `ramassees`, `pistolets` et `couteau` restés à toi, `inconnues` hors du calcul) ;
 * les armes ramassées, par kills décroissants puis nom ; l'effectif du socle ; le Chiffre de l'écran.
 */
export type ArmeRamassee = ChiffreAnalyse & {
  readonly kills: number
  readonly ramassees: number
  readonly pistolets: number
  readonly couteau: number
  readonly inconnues: number
  readonly parArme: readonly { readonly nom: string; readonly kills: number }[]
  readonly effectif: EffectifAnalyse
  readonly chiffre: ChiffreArme
}

/** Les parties des analyses 3 et 4 : celles du détail par arme des duels (files complètes, avec l'arme de ta manche). */
function partiesArmeDeManche(sel: Selection): PartiesDAnalyse {
  return partiesDeLAnalyse(sel.parties, FILES_DUELS, CHAMP_ARME_DE_MANCHE)
}
/** Les manches d'une partie par numéro. */
function manchesParNumero(p: Partie): Map<number, Manche> {
  const r = new Map<number, Manche>()
  for (const m of p.manches ?? []) r.set(m.numero, m)
  return r
}

/** Le sous-texte et la voix du Chiffre de l'arme ramassée. */
function chiffreRamassee(c: ChiffreAnalyse, kills: number, ramassees: number, inconnues: number): ChiffreArme {
  // « classés » dès qu'un kill sort du calcul faute de catégorie : le total n'est plus celui de tes kills à l'arme.
  const classe = inconnues > 0 ? (kills > 1 ? " classés" : " classé") : ""
  const aLArme = `${compte(kills, "kill")} à l'arme${classe}`
  const sousTexte = kills === 0
    ? `aucun kill à l'arme${inconnues > 0 ? " classé" : ""}`
    : c.mention !== null ? `${c.mention} : ${aLArme}` : `${nombreEnClair(ramassees, 0)} de tes ${aLArme}`
  const voix = c.mention !== null && kills > 0
    ? `${LIBELLE_ARME_RAMASSEE}, ${sousTexte}.`
    : c.valeur === null ? `${LIBELLE_ARME_RAMASSEE} : ${sousTexte}.` : `${LIBELLE_ARME_RAMASSEE} : ${c.texte}, ${sousTexte}.`
  return { cle: "ramassee", libelle: LIBELLE_ARME_RAMASSEE, valeur: c.texte, sousTexte, voix }
}

/**
 * Kills à l'arme ramassée sur la sélection (Armes et visée ; récap), avec les catégories des ressources (`armes`, section des
 * ressources des stats) : tes kills à l'arme des parties qui ont l'arme de ta manche, chacun classé par classerKill.
 */
export function armeRamassee(sel: Selection, armes: SectionArmes): ArmeRamassee {
  const a = partiesArmeDeManche(sel)
  let kills = 0, ramassees = 0, pistolets = 0, couteau = 0, inconnues = 0
  const parArme = new Map<string, number>()
  for (const p of a.parties) {
    const manches = manchesParNumero(p)
    for (const k of p.kills ?? []) {
      const nom = armeDuKill(k)
      const m = manches.get(k.manche)
      if (nom === null || m === undefined || m.arme == null) continue
      const classe = classerKill(k, m.arme, armes)
      if (classe === "inconnue") {
        inconnues++
        continue
      }
      kills++
      if (classe === "pistolet") pistolets++
      else if (classe === "couteau") couteau++
      else if (classe === "ramassee") {
        ramassees++
        parArme.set(nom, (parArme.get(nom) ?? 0) + 1)
      }
    }
  }
  const c = chiffreDAnalyse({ num: ramassees, den: kills, cas: kills })
  const liste = [...parArme].map(([nom, n]) => ({ nom, kills: n }))
  liste.sort((x, y) => y.kills - x.kills || x.nom.localeCompare(y.nom, "fr"))
  return {
    ...c, kills, ramassees, pistolets, couteau, inconnues, parArme: liste, effectif: effectifDAnalyse({ ...a, horsFiles: 0 }),
    chiffre: chiffreRamassee(c, kills, ramassees, inconnues),
  }
}

/**
 * Fusil perdu (analyse 4) : tes manches jouées avec une grosse arme (`jouees`), celles que ton équipe perd (`perduesAvec`), celles-ci où
 * tu meurs (`perdues`, la valeur : l'arme tombe), les manches à une arme de catégorie inconnue, quelle qu'en soit l'issue (`inconnues`,
 * retirées du calcul et dites) ;
 * la part des perdues où tu meurs (`part`, chiffreDAnalyse, pour le récap ; jamais écrite arrondie à l'écran) ; l'effectif du socle ;
 * le Chiffre de l'écran.
 */
export type FusilPerdu = {
  readonly jouees: number
  readonly perduesAvec: number
  readonly perdues: number
  readonly inconnues: number
  readonly part: ChiffreAnalyse
  readonly effectif: EffectifAnalyse
  readonly chiffre: ChiffreArme
}


function chiffreFusil(jouees: number, perduesAvec: number, perdues: number, inconnues: number): ChiffreArme {
  if (jouees === 0 && inconnues > 0) {
    // Aucune manche classée : on ne sait pas si l'une d'elles l'était avec une grosse arme.
    const sousTexte = `catégorie d'arme inconnue pour ${inconnues > 1 ? "tes" : "ta"} ${compte(inconnues, "manche")}`
    return { cle: "fusil-perdu", libelle: LIBELLE_FUSIL_PERDU, valeur: TIRET, sousTexte, voix: `${LIBELLE_FUSIL_PERDU} : ${sousTexte}.` }
  }
  const valeur = nombreEnClair(perdues, 0)
  let sousTexte: string, voix: string
  if (jouees === 0) {
    sousTexte = `aucune manche jouée avec ${GROSSES_ARMES_DITES}`
    voix = `${LIBELLE_FUSIL_PERDU} : ${sousTexte}.`
  } else if (perduesAvec === 0) {
    sousTexte = `aucune manche perdue avec ${GROSSES_ARMES_DITES}, sur ${compte(jouees, "manche")} ${jouees > 1 ? "jouées" : "jouée"} avec l'un d'eux`
    voix = `${LIBELLE_FUSIL_PERDU} : ${sousTexte}.`
  } else {
    const pl = perdues > 1 ? "s" : ""
    sousTexte = `manche${pl} perdue${pl} où tu meurs avec ${GROSSES_ARMES_DITES}, sur ${nombreEnClair(perduesAvec, 0)}${NBSP}${perduesAvec > 1 ? "perdues" : "perdue"} et ${nombreEnClair(jouees, 0)}${NBSP}${jouees > 1 ? "jouées" : "jouée"} avec l'un d'eux`
    voix = `${LIBELLE_FUSIL_PERDU} : ${valeur} ${sousTexte}.`
  }
  return { cle: "fusil-perdu", libelle: LIBELLE_FUSIL_PERDU, valeur, sousTexte, voix }
}

/**
 * Fusil perdu sur la sélection (Armes et visée ; récap), avec les catégories des ressources : les manches des parties qui ont l'arme de
 * ta manche dont cette arme est une grosse arme ; une manche perdue où tu meurs, de toute cause (une de tes morts dans la manche).
 */
export function fusilPerdu(sel: Selection, armes: SectionArmes): FusilPerdu {
  const a = partiesArmeDeManche(sel)
  let jouees = 0, perduesAvec = 0, perdues = 0, inconnues = 0
  for (const p of a.parties) {
    const mortes = new Set<number>()
    for (const k of p.kills ?? []) if (k.sens === "mort") mortes.add(k.manche)
    for (const m of p.manches ?? []) {
      if (m.arme == null) continue
      const grosse = grosseArme(m.arme, armes)
      if (grosse === null) {
        inconnues++
        continue
      }
      if (!grosse) continue
      jouees++
      if (m.gagnee !== false) continue
      perduesAvec++
      if (mortes.has(m.numero)) perdues++
    }
  }
  return {
    jouees, perduesAvec, perdues, inconnues, part: chiffreDAnalyse({ num: perdues, den: perduesAvec, cas: perduesAvec }),
    effectif: effectifDAnalyse({ ...a, horsFiles: 0 }), chiffre: chiffreFusil(jouees, perduesAvec, perdues, inconnues),
  }
}

/** Les deux Chiffres de l'écran, dans l'ordre de la maquette ; aucun quand les analyses ne portent sur aucune partie. */
export function chiffresArmeEtFusil(r: ArmeRamassee, f: FusilPerdu): ChiffreArme[] {
  return r.effectif.parties === 0 ? [] : [r.chiffre, f.chiffre]
}







export function noteArmeEtFusil(r: ArmeRamassee, f: FusilPerdu): string | null {
  const e = r.effectif
  const effectif = phraseEffectifArmes(e)
  if (e.parties === 0) return effectif
  const morceaux = [NOTE_ARME_RAMASSEE]
  if (r.parArme.length > 0) {
    const dites = r.parArme.slice(0, 3).map((x) => `${x.nom} (${nombreEnClair(x.kills, 0)})`)
    const reste = r.parArme.length - dites.length
    const tete = dites.length > 1 ? `${dites.slice(0, -1).join(", ")} et ${dites[dites.length - 1]}` : dites[0]
    morceaux.push(reste > 0 ? `Armes ramassées : ${dites.join(", ")} et ${reste} ${reste > 1 ? "autres" : "autre"}.` : `Armes ramassées : ${tete}.`)
  }
  const hors: string[] = []
  if (r.inconnues > 0) hors.push(compte(r.inconnues, "kill"))
  if (f.inconnues > 0) hors.push(compte(f.inconnues, "manche"))
  if (hors.length > 0) morceaux.push(`Hors du calcul, faute de catégorie d'arme connue : ${hors.join(" et ")}.`)
  if (effectif !== null) morceaux.push(effectif)
  return morceaux.map(traduire).join(" ")
}


function phraseEffectifArmes(e: EffectifAnalyse): string | null {
  return e.texteEcartees === null ? null : `Arme ramassée et fusil perdu : ${e.texte} ; ${e.texteEcartees}.`
}

/** L'effectif des deux analyses, sans catégorie d'arme : leurs parties (celles du détail des duels), ce qu'elles retirent de plus que les barres. */
export function effectifArmeEtFusil(sel: Selection): EffectifAnalyse {
  return effectifDAnalyse({ ...partiesArmeDeManche(sel), horsFiles: 0 })
}

/**
 * La note des deux analyses sans aucune catégorie d'arme : SANS_CATEGORIES quand elles porteraient sur des parties, puis leur effectif
 * s'il retire plus que les barres ; sans aucune partie (toutes importées), l'effectif seul, qui dit pourquoi.
 */
export function noteSansCategories(e: EffectifAnalyse): string | null {
  const effectif = phraseEffectifArmes(e)
  if (e.parties === 0) return effectif
  return effectif === null ? SANS_CATEGORIES : `${SANS_CATEGORIES} ${effectif}`
}
