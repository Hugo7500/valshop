






























import type { Cote, Kill, Manche, Partie } from "./reduction"
import type { SectionCartes } from "./ressources"
import { POURCENTAGE, RATIO, TIRET, carteDuCatalogue, cleCarte, effectifEnClair, fileAdmise, nombreEnClair, zoneDe, type Selection } from "./metriques"
import {
  MIN_CAS_ANALYSE, PEU_DE_DONNEES, aucuneEcartee, chiffreDAnalyse, effectifEnPhrase, estDuel, genreDeFile, type ChiffreAnalyse,
} from "./analyses"

/** Espace insécable : avant « m », entre un nombre et son mot, devant les deux-points d'un titre. */
const NBSP = String.fromCharCode(0xa0)


function compte(n: number, singulier: string, pluriel: string = `${singulier}s`): string {
  return `${nombreEnClair(n, 0)}${NBSP}${n > 1 ? pluriel : singulier}`
}

function duelsDits(n: number): string {
  return compte(n, "premier duel", "premiers duels")
}
/** Le côté en minuscules : « attaque », « défense ». */
function coteDit(cote: Cote): string {
  return cote === "attaque" ? "attaque" : "défense"
}

// ─────────────────────────── tranches de distance au spike ───────────────────────────

/** Tranche de ta distance au spike après la pose : moins de 10 m (`pres`), de 10 à 25 m (`milieu`), plus de 25 m (`loin`). */
export type CleTrancheSpike = "pres" | "milieu" | "loin"

export const SPIKE_PRES = 10
export const SPIKE_LOIN = 25
/** Les trois tranches, dans l'ordre, libellées comme la maquette Cartes, et dites par VoiceOver, unités en toutes lettres. */
export const TRANCHES_SPIKE: readonly { readonly cle: CleTrancheSpike; readonly libelle: string; readonly dit: string }[] = [
  { cle: "pres", libelle: `Moins de ${SPIKE_PRES}${NBSP}m`, dit: `Moins de ${SPIKE_PRES}${NBSP}mètres` },
  { cle: "milieu", libelle: `${SPIKE_PRES} à ${SPIKE_LOIN}${NBSP}m`, dit: `De ${SPIKE_PRES} à ${SPIKE_LOIN}${NBSP}mètres` },
  { cle: "loin", libelle: `Plus de ${SPIKE_LOIN}${NBSP}m`, dit: `Plus de ${SPIKE_LOIN}${NBSP}mètres` },
]

/** La tranche d'une distance au spike en mètres (sans arrondi : 9,999 m est à moins de 10 m) ; null pour une distance absente, négative ou illisible. */
export function trancheSpike(metres: number | null | undefined): CleTrancheSpike | null {
  if (typeof metres !== "number" || !Number.isFinite(metres) || metres < 0) return null
  if (metres < SPIKE_PRES) return "pres"
  return metres <= SPIKE_LOIN ? "milieu" : "loin"
}

// ─────────────────────────── textes ───────────────────────────

/** Les notes de méthode des trois blocs. */
export const METHODE_PREMIERS_DUELS =
  "Premier kill de chaque manche, toi tueur ou victime d'un adversaire, rangé par ta zone la plus proche à ce moment ; part gagnée."
export const METHODE_DEFENSE =
  "Ta zone la plus proche au premier kill de chaque manche en défense, même quand le spike est posé avant lui ; part gagnée, survie, kills et morts par manche."




export const ZONE_LA_PLUS_PROCHE = "Zone la plus proche : le nom du repère le plus proche de ta position, sans les étages."
export const METHODE_APRES_POSE =
  "Manches où ton équipe pose et où tu vis au premier kill qui suit : ta distance au spike à ce kill ; tes kills après la pose, par manche."
/** Ce que dit un « — » (EXPERIENCE.md, State Patterns, Analyse sous l'effectif minimal). */
export const TIRET_PREMIERS_DUELS = `«${NBSP}${TIRET}${NBSP}» : ${PEU_DE_DONNEES}, moins de ${MIN_CAS_ANALYSE} premiers duels.`
export const TIRET_MANCHES = `«${NBSP}${TIRET}${NBSP}» : ${PEU_DE_DONNEES}, moins de ${MIN_CAS_ANALYSE} manches.`

/** La phrase d'une carte sans callouts, à la place des zones : vraie que la section `cartes` manque à l'iPhone ou que la carte n'en ait pas. */
export function sansZones(quoi: string): string {
  return `Zones non nommées sur cette carte : ${quoi} ne se rangent pas par zone.`
}

// ─────────────────────────── parties d'une carte ───────────────────────────

// Une carte se reconnaît à son id, à son nom s'il n'en a pas, sans casse (cleCarte de metriques.ts, comme Cartes) ; le genre d'une file
// hors des files complètes et la phrase d'effectif sont ceux du socle (analyses.ts), comme les blocs d'Armes et visée.

/** Ton kill compté, comme au K/D : un kill d'un adversaire. */
function killCompte(k: Kill): boolean {
  return k.sens === "kill" && k.adverse === true
}
/** Ta mort comptée, comme au K/D : toute mort sauf celle par le spike. */
function mortComptee(k: Kill): boolean {
  return k.sens === "mort" && k.arme?.type !== "Bomb"
}

// ─────────────────────────── lignes ───────────────────────────

/** Une part écrite, pour l'ordre des lignes : son pourcentage entier tel que l'écran l'écrit ; null sans valeur (« — »). */
function partEcrite(c: ChiffreAnalyse): number | null {
  return c.valeur === null ? null : Math.round(c.valeur * 100)
}
/** L'ordre des lignes : part écrite décroissante, puis les lignes « — », puis effectif décroissant, puis nom. */
function ordreDesLignes(a: { part: ChiffreAnalyse; n: number; nom: string }, b: { part: ChiffreAnalyse; n: number; nom: string }): number {
  const x = partEcrite(a.part), y = partEcrite(b.part)
  if ((x === null) !== (y === null)) return x === null ? 1 : -1
  if (x !== null && y !== null && x !== y) return y - x
  return b.n - a.n || a.nom.localeCompare(b.nom, "fr")
}

function parManche(c: ChiffreAnalyse, mot: string): string {
  return `${c.texte}${NBSP}${c.valeur !== null && Math.round(c.valeur * 100) >= 200 ? `${mot}s` : mot}`
}

const POINT = `${NBSP}· `

/** Des manches comptées : leur nombre, gagnées, survécues, et tes kills et tes morts (ou tes kills après la pose). */
type Comptes = { manches: number; gagnees: number; survies: number; kills: number; morts: number }
function comptesVides(): Comptes {
  return { manches: 0, gagnees: 0, survies: 0, kills: 0, morts: 0 }
}
/**
 * Les chiffres de manches comptées : part gagnée, survie, kills et morts par manche ; cas = manches ; tous neutres (aucune référence
 * écrite : l'après-pose est une stat d'équipe, et une manche après la pose se gagne souvent par construction).
 */
function chiffresDe(c: Comptes): { gagnees: ChiffreAnalyse; survie: ChiffreAnalyse; kills: ChiffreAnalyse; morts: ChiffreAnalyse } {
  const n = c.manches
  return {
    gagnees: chiffreDAnalyse({ num: c.gagnees, den: n, cas: n }),
    survie: chiffreDAnalyse({ num: c.survies, den: n, cas: n }),
    kills: chiffreDAnalyse({ num: c.kills, den: n, cas: n }, RATIO),
    morts: chiffreDAnalyse({ num: c.morts, den: n, cas: n }, RATIO),
  }
}


export type ZoneDeDuels = { zone: string; duels: number; gagnes: number; part: ChiffreAnalyse; libelle: string; voix: string }





export type ZoneDeDefense = {
  zone: string
  manches: number
  gagnees: ChiffreAnalyse
  survie: ChiffreAnalyse
  kills: ChiffreAnalyse
  morts: ChiffreAnalyse
  libelle: string
  detail: string
  voix: string
}





export type TrancheApresPose = {
  cle: CleTrancheSpike
  manches: number
  gagnees: ChiffreAnalyse
  survie: ChiffreAnalyse
  kills: ChiffreAnalyse
  libelle: string
  detail: string
  voix: string
}

/**
 * Tes premiers duels d'un côté de la carte : `duels` et `gagnes` retenus (avec une zone ; tous sans callouts), leur part, ceux sans ta
 * position (hors du calcul, comptés seulement quand les zones se nomment), les premières morts sans tueur adverse de ce côté (pas des
 * duels), les zones, la phrase à la place des zones (null avec elles) et la note du bloc.
 */
export type PremiersDuels = {
  cote: Cote
  duels: number
  gagnes: number
  part: ChiffreAnalyse
  sansPosition: number
  sansTueur: number
  zones: readonly ZoneDeDuels[]
  vide: string | null
  note: string
}

/** Tes positions en défense : manches retenues et leurs chiffres, retraits comptés, zones, phrase à la place des zones, note. */
export type PositionsEnDefense = {
  manches: number
  gagnees: ChiffreAnalyse
  survie: ChiffreAnalyse
  kills: ChiffreAnalyse
  morts: ChiffreAnalyse
  sansPosition: number
  sansIssue: number
  zones: readonly ZoneDeDefense[]
  vide: string | null
  note: string
}

/**
 * L'après-pose : poses de ton équipe (issue connue), celles avec ta distance, celles sans (pose sans moment, pose sans position du spike,
 * mort avant la pose, sans ta position au premier kill qui suit), les trois tranches dans l'ordre des distances, phrase, note.
 */
export type ApresPose = {
  poses: number
  avecDistance: number
  sansMoment: number
  sansSpike: number
  mortAvant: number
  sansPosition: number
  sansIssue: number
  tranches: readonly TrancheApresPose[]
  vide: string | null
  note: string
}





export type AnalysesDeCarte = {
  id: string
  nom: string
  parties: number
  zonesNommees: boolean
  manchesSansCote: number
  effectif: string
  premiersDuels: Readonly<Record<Cote, PremiersDuels>>
  defense: PositionsEnDefense
  apresPose: ApresPose
}

// ─────────────────────────── calcul ───────────────────────────

/** Ce qu'une manche apporte : ta mort la plus tôt (tout genre), tes kills et morts comptés, tes kills après la pose. */
type FaitsDeManche = { kills: number; morts: number; killsApres: number; premiereMort: number | null }

/** Les phrases de retrait communes : manches sans côté, effectif. */
function finDeNote(parts: string[], manchesSansCote: number, effectif: string): string {
  if (manchesSansCote > 0) parts.push(`${compte(manchesSansCote, "manche")} sans côté, hors du calcul.`)
  parts.push(effectif)
  return parts.join(" ")
}

/**
 * Les trois analyses d'une carte (id sans casse, celui de cartesJouees) sur le périmètre, depuis la section `cartes` de catalog.json
 * (lireRessources) ; null pour une carte sans partie des files complètes.
 */
export function analysesDeCarte(sel: Selection, idCarte: string, cartes: SectionCartes): AnalysesDeCarte | null {
  const cle = idCarte.toLowerCase()
  const parties: Partie[] = []
  const ecartees = aucuneEcartee()
  for (const p of sel.parties) {
    if (cleCarte(p.carte) !== cle) continue
    if (fileAdmise(p.file, "completes")) parties.push(p)
    else ecartees[genreDeFile(p.file)]++
  }
  if (parties.length === 0) return null
  const ref = parties[0].carte
  const nom = ref?.name || "?"
  const carte = carteDuCatalogue(cartes, ref?.id || cle)
  const zonesNommees = carte !== null && carte.callouts.length > 0
  const effectif = effectifEnPhrase(parties.length, ecartees) ?? ""

  // Analyse 7, par côté ; analyse 8 ; analyse 9.
  const duels: Record<Cote, { duels: number; gagnes: number; sansPosition: number; sansTueur: number; zones: Map<string, { duels: number; gagnes: number }> }> = {
    attaque: { duels: 0, gagnes: 0, sansPosition: 0, sansTueur: 0, zones: new Map() },
    defense: { duels: 0, gagnes: 0, sansPosition: 0, sansTueur: 0, zones: new Map() },
  }
  const defense = { total: comptesVides(), sansPosition: 0, sansIssue: 0, avecIssue: 0, zones: new Map<string, Comptes>() }
  const pose = { poses: 0, sansIssue: 0, sansMoment: 0, sansSpike: 0, mortAvant: 0, sansPosition: 0, tranches: new Map<CleTrancheSpike, Comptes>() }
  let manchesSansCote = 0

  for (const p of parties) {
    const manches = new Map<number, Manche>()
    for (const m of p.manches ?? []) manches.set(m.numero, m)
    const faits = new Map<number, FaitsDeManche>()
    for (const k of p.kills ?? []) {
      const m = manches.get(k.manche)
      if (m === undefined) continue // kill d'une manche non jouée
      const f = faits.get(k.manche) ?? { kills: 0, morts: 0, killsApres: 0, premiereMort: null }
      if (killCompte(k)) {
        f.kills++
        if (k.apresPose) f.killsApres++
      } else if (mortComptee(k)) f.morts++
      if (k.sens === "mort" && (f.premiereMort === null || k.momentManche < f.premiereMort)) f.premiereMort = k.momentManche
      faits.set(k.manche, f)
      // Analyse 7 : un premier duel de ce côté.
      if (!k.premierDuel || !estDuel(k) || m.cote == null) continue
      const d = duels[m.cote]
      const zone = zoneDe(k.position, carte)
      if (zonesNommees && zone === null) {
        d.sansPosition++
        continue
      }
      const gagne = k.sens === "kill" ? 1 : 0
      d.duels++
      d.gagnes += gagne
      if (zone !== null) {
        const z = d.zones.get(zone.nom) ?? { duels: 0, gagnes: 0 }
        z.duels++
        z.gagnes += gagne
        d.zones.set(zone.nom, z)
      }
    }
    for (const m of p.manches ?? []) {
      const f = faits.get(m.numero) ?? { kills: 0, morts: 0, killsApres: 0, premiereMort: null }
      if (m.cote == null) manchesSansCote++
      else if (m.premiereMort === "toi" && m.premierKill === null) duels[m.cote].sansTueur++
      // Analyse 8 : une manche en défense.
      if (m.cote === "defense") {
        if (m.gagnee == null) defense.sansIssue++
        else {
          defense.avecIssue++
          const zone = zoneDe(m.positionPremierKill, carte)
          if (zonesNommees && zone === null) defense.sansPosition++
          else {
            ajouter(defense.total, m, f.kills, f.morts)
            if (zone !== null) {
              const z = defense.zones.get(zone.nom) ?? comptesVides()
              ajouter(z, m, f.kills, f.morts)
              defense.zones.set(zone.nom, z)
            }
          }
        }
      }
      // Analyse 9 : une pose de ton équipe.
      const pz = m.pose
      if (pz != null && (pz.poseur === "toi" || pz.poseur === "equipe")) {
        if (m.gagnee == null) {
          pose.sansIssue++
          continue
        }
        pose.poses++
        const t = trancheSpike(m.distanceSpike)
        if (t !== null) {
          const c = pose.tranches.get(t) ?? comptesVides()
          ajouter(c, m, f.killsApres, 0)
          pose.tranches.set(t, c)
        } else if (pz.moment == null) pose.sansMoment++
        else if (pz.position == null) pose.sansSpike++
        else if (f.premiereMort !== null && f.premiereMort <= pz.moment) pose.mortAvant++
        else pose.sansPosition++
      }
    }
  }

  const premiersDuels = {
    attaque: premiersDuelsDe("attaque", duels.attaque, nom, zonesNommees, manchesSansCote, effectif),
    defense: premiersDuelsDe("defense", duels.defense, nom, zonesNommees, manchesSansCote, effectif),
  }
  return {
    id: ref?.id || cle,
    nom,
    parties: parties.length,
    zonesNommees,
    manchesSansCote,
    effectif,
    premiersDuels,
    defense: defenseDe(defense, nom, zonesNommees, manchesSansCote, effectif),
    apresPose: apresPoseDe(pose, nom, effectif),
  }
}

/** Ajoute une manche à des comptes : gagnée, survécue, `kills` et `morts` (tes kills après la pose pour l'analyse 9). */
function ajouter(c: Comptes, m: Manche, kills: number, morts: number): void {
  c.manches++
  if (m.gagnee === true) c.gagnees++
  if (m.survie === true) c.survies++
  c.kills += kills
  c.morts += morts
}

/** Analyse 7 d'un côté : lignes, phrase et note. */
function premiersDuelsDe(
  cote: Cote,
  d: { duels: number; gagnes: number; sansPosition: number; sansTueur: number; zones: Map<string, { duels: number; gagnes: number }> },
  nom: string, zonesNommees: boolean, manchesSansCote: number, effectif: string,
): PremiersDuels {
  const part = chiffreDAnalyse({ num: d.gagnes, den: d.duels, cas: d.duels }, POURCENTAGE, "haut")
  const lignes = [...d.zones].map(([zone, z]) => ({ zone, z, part: chiffreDAnalyse({ num: z.gagnes, den: z.duels, cas: z.duels }, POURCENTAGE, "haut") }))
  lignes.sort((a, b) => ordreDesLignes({ part: a.part, n: a.z.duels, nom: a.zone }, { part: b.part, n: b.z.duels, nom: b.zone }))
  const zones = lignes.map(({ zone, z, part: x }): ZoneDeDuels => ({
    zone, duels: z.duels, gagnes: z.gagnes, part: x, libelle: effectifEnClair(zone, z.duels),
    voix: `${zone}, ${duelsDits(z.duels)} : ${x.valeur === null ? PEU_DE_DONNEES : `${x.texte} gagnés`}.`,
  }))
  const tous = d.duels + d.sansPosition
  let vide: string | null = null
  if (tous === 0) vide = `Aucun premier duel en ${coteDit(cote)} sur ${nom} dans cette période.`
  else if (!zonesNommees) vide = sansZones("tes premiers duels")
  else if (d.duels === 0) vide = `Ta position manque à chacun de tes premiers duels en ${coteDit(cote)} : aucune zone.`
  const parts: string[] = zonesNommees ? [METHODE_PREMIERS_DUELS, ZONE_LA_PLUS_PROCHE] : [METHODE_PREMIERS_DUELS]
  if (d.duels > 0) {
    const gagnes = `${nombreEnClair(d.gagnes, 0)}${NBSP}${d.gagnes > 1 ? "gagnés" : "gagné"}`
    parts.push(`En ${coteDit(cote)} sur ${nom} : ${duelsDits(d.duels)}, ${gagnes}${part.valeur === null ? "" : ` (${part.texte})`}.`)
  }
  if (zones.some((z) => z.part.valeur === null && z.part.mention !== null)) parts.push(TIRET_PREMIERS_DUELS)
  if (d.sansPosition > 0) parts.push(`${duelsDits(d.sansPosition)} sans ta position, hors du calcul.`)
  if (d.sansTueur > 0) parts.push(`Hors des duels : ${compte(d.sansTueur, "première mort", "premières morts")} sans tueur adverse.`)
  return { cote, duels: d.duels, gagnes: d.gagnes, part, sansPosition: d.sansPosition, sansTueur: d.sansTueur, zones, vide, note: finDeNote(parts, manchesSansCote, effectif) }
}


function chiffresDits(c: ReturnType<typeof chiffresDe>, sep: string = ", "): string {
  return `${c.gagnees.texte} gagnées${sep}survie ${c.survie.texte}${sep}${parManche(c.kills, "kill")} et ${parManche(c.morts, "mort")} par manche`
}

/** Analyse 8 : lignes, phrase et note. */
function defenseDe(
  d: { total: Comptes; sansPosition: number; sansIssue: number; avecIssue: number; zones: Map<string, Comptes> },
  nom: string, zonesNommees: boolean, manchesSansCote: number, effectif: string,
): PositionsEnDefense {
  const total = chiffresDe(d.total)
  const lignes = [...d.zones].map(([zone, c]) => ({ zone, c, x: chiffresDe(c) }))
  lignes.sort((a, b) => ordreDesLignes({ part: a.x.gagnees, n: a.c.manches, nom: a.zone }, { part: b.x.gagnees, n: b.c.manches, nom: b.zone }))
  const zones = lignes.map(({ zone, c, x }): ZoneDeDefense => {
    const libelle = effectifEnClair(zone, c.manches)
    return {
      zone, manches: c.manches, ...x, libelle,
      detail: x.gagnees.valeur === null ? PEU_DE_DONNEES : chiffresDits(x, POINT),
      voix: `${zone}, ${compte(c.manches, "manche")} : ${x.gagnees.valeur === null ? PEU_DE_DONNEES : chiffresDits(x)}.`,
    }
  })
  let vide: string | null = null
  if (d.avecIssue === 0) vide = `Aucune manche en défense sur ${nom} dans cette période.`
  else if (!zonesNommees) vide = sansZones("tes positions en défense")
  else if (d.total.manches === 0) vide = "Ta position au premier kill manque à chacune de tes manches en défense : aucune zone."
  const parts: string[] = zonesNommees ? [METHODE_DEFENSE, ZONE_LA_PLUS_PROCHE] : [METHODE_DEFENSE]
  if (d.total.manches > 0) {
    parts.push(`En défense sur ${nom}, ${compte(d.total.manches, "manche")} : ${total.gagnees.valeur === null ? PEU_DE_DONNEES : chiffresDits(total)}.`)
  }
  if (zones.some((z) => z.gagnees.valeur === null)) parts.push(TIRET_MANCHES)
  if (d.sansPosition > 0) parts.push(`${compte(d.sansPosition, "manche")} sans ta position au premier kill, hors du calcul.`)
  if (d.sansIssue > 0) parts.push(`${compte(d.sansIssue, "manche")} sans issue connue, hors du calcul.`)
  return {
    manches: d.total.manches, ...total, sansPosition: d.sansPosition, sansIssue: d.sansIssue, zones, vide,
    note: finDeNote(parts, manchesSansCote, effectif),
  }
}

/** Analyse 9 : lignes, phrase et note. */
function apresPoseDe(
  d: { poses: number; sansIssue: number; sansMoment: number; sansSpike: number; mortAvant: number; sansPosition: number; tranches: Map<CleTrancheSpike, Comptes> },
  nom: string, effectif: string,
): ApresPose {
  const tranches = TRANCHES_SPIKE.map((t): TrancheApresPose => {
    const c = d.tranches.get(t.cle) ?? comptesVides()
    const x = chiffresDe(c)
    const libelle = effectifEnClair(t.libelle, c.manches)
    const dits = (sep: string) => `${x.gagnees.texte} gagnées${sep}survie ${x.survie.texte}${sep}${parManche(x.kills, "kill")} après la pose par manche`
    return {
      cle: t.cle, manches: c.manches, gagnees: x.gagnees, survie: x.survie, kills: x.kills, libelle,
      detail: c.manches === 0 ? "aucune manche" : x.gagnees.valeur === null ? PEU_DE_DONNEES : dits(POINT),
      voix: c.manches === 0 ? `${t.dit} : aucune manche.` : `${t.dit}, ${compte(c.manches, "manche")} : ${x.gagnees.valeur === null ? PEU_DE_DONNEES : dits(", ")}.`,
    }
  })
  const avecDistance = d.poses - d.sansMoment - d.sansSpike - d.mortAvant - d.sansPosition
  let vide: string | null = null
  if (d.poses === 0) vide = `Aucune pose de ton équipe sur ${nom} dans cette période.`
  else if (avecDistance === 0) vide = "Ta distance au spike manque à chacune des poses de ton équipe : aucune tranche."
  const parts: string[] = [METHODE_APRES_POSE]
  if (tranches.some((t) => t.manches > 0 && t.gagnees.valeur === null)) parts.push(TIRET_MANCHES)
  if (d.poses > 0) parts.push(`${compte(d.poses, "pose")} de ton équipe, ${nombreEnClair(avecDistance, 0)} avec ta distance.`)
  const sans: string[] = []
  if (d.sansMoment > 0) sans.push(`${nombreEnClair(d.sansMoment, 0)} sans moment de la pose`)
  if (d.sansSpike > 0) sans.push(`${nombreEnClair(d.sansSpike, 0)} sans position du spike`)
  if (d.mortAvant > 0) sans.push(`${nombreEnClair(d.mortAvant, 0)} où tu es mort avant la pose`)
  if (d.sansPosition > 0) sans.push(`${nombreEnClair(d.sansPosition, 0)} sans ta position au premier kill qui suit`)
  if (sans.length > 0) parts.push(`Sans elle, hors du calcul : ${sans.join(", ")}.`)
  if (d.sansIssue > 0) parts.push(`${compte(d.sansIssue, "manche")} avec une pose, sans issue connue, hors du calcul.`)
  parts.push(effectif)
  return { poses: d.poses, avecDistance, sansMoment: d.sansMoment, sansSpike: d.sansSpike, mortAvant: d.mortAvant, sansPosition: d.sansPosition, sansIssue: d.sansIssue, tranches, vide, note: parts.join(" ") }
}
