import {
  EnvironmentValuesReader, Rectangle, Text, VStack,
  type DynamicTypeSize, type VirtualNode,
} from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ESPACES, TYPO, couleurs, type Palette } from "./design"
import { PileDeBlocs } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import {
  Barres, BarresEmpilees, Bloc, CourbeVisee, GrilleChiffres, Legende, Tableau, couleurEvaluation, sansMauvaiseCoupure, titreDeBloc,
  type Barre, type BarreEmpilee, type ChiffreDeGrille, type ItemLegende, type LigneTableau, type Zones,
} from "./dessin"
import {
  KILLS_CAPACITES, LEGENDE_TETE_PAR_ARME, LIBELLES_ZONES, MIN_KILLS_DISTANCE, NOTE_TETE_PAR_ARME, TIRET, distanceDesKills, effectifEnClair,
  killsParArme, nombreEnClair, retenues, teteCorpsJambesParArme, viseeALEntrainement, zonesTouchees,
  type BarreZones, type BlocZones, type DistanceArme, type KillsParArme, type Mode, type PartZone, type TeteParArme, type ViseeEntrainement,
  type ZoneComptee, type ZonesTouchees,
} from "./metriques"
import { TRANCHES_DISTANCE, type EffectifAnalyse } from "./analyses"
import {
  SANS_CATEGORIES, armeRamassee, chiffresArmeEtFusil, duelsSelonLaDistance, effectifArmeEtFusil, fusilPerdu, noteArmeEtFusil,
  noteDuelsDistance, noteSansCategories, noteTeteDistance, sansCategories, teteSelonLaDistance,
  type ArmeRamassee, type ChiffreArme, type DuelsSelonLaDistance, type FusilPerdu, type TeteSelonLaDistance,
} from "./analyses-armes"
import type { Emplacement, PropsEmplacement } from "./app"

// Module du sous-onglet Armes et visée de l'onglet Stats (entrée 30 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture : Armes et visée ; Component Patterns : Barre empilée, Barre, Tableau, Courbe, Légende ; State Patterns : Trop peu
// de parties, Groupe trop petit, Aucune partie de deathmatch ; Définitions des métriques ; Accessibility Floor ; DESIGN.md ;
// maquette Armes). Son emplacement, EMPLACEMENT_ARMES, huitième de la Barre de sous-onglets (entrée 18), reçoit de app.tsx
// PropsEmplacement : les données tenues, l'état du périmètre commun (entrée 17), un choix d'arrivée (aucun ne le vise) et `ouvrir`.
// De haut en bas, à 14 l'un de l'autre : le Bloc « Tête, corps, jambes par arme » (une Barre empilée par arme) ; les analyses 1 et 2
// (epic-stats-analyses, entrée 3 : analyses-armes.ts) : le Bloc « Tête selon la distance » (Tableau, une ligne par arme) et le Bloc
// « Duels gagnés selon la distance » (Barres des trois tranches, toutes armes), puis, sous les tranches, les analyses 3 et 4 (entrée 4 :
// les Chiffres « Kills à l'arme ramassée » et « Fusil perdu », catégories des armes tirées des ressources des stats) ; le Bloc « Zones touchées, toutes armes » (tes touches face à tes lobbys, puis « Où tu te fais toucher ») ; le Bloc
// « Kills par arme » (Barres) ; le Bloc « Distance de tes kills » (Tableau) ; le Bloc « Ta visée à l'entraînement » (Courbe du
// deathmatch contre la compétition sur les 8 dernières semaines, sur tout l'historique, hors du périmètre). Valeurs, couleurs,
// écarts et phrases VoiceOver tels que les rendent teteCorpsJambesParArme, zonesTouchees (écart et couleur de blocZones, par
// ecartDe : entrée 40), killsParArme, distanceDesKills et viseeALEntrainement de metriques.ts (entrée 11), jamais recalculés,
// calculés une fois par périmètre et par données avec la sélection (`agregat` de l'état du périmètre) ; briques de dessin.tsx
// (Bloc et son titre, Barres, Barres empilées, Tableau, Légende, Courbe de la visée : entrées 13, 15, 30, 37 et 42) reprises
// telles quelles ; titres de bloc toujours par la brique, jamais une casse posée ici. Sans lecture, requête ni écriture ; aucun
// état. Rendu jugé sur l'iPhone.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)
const MOINS = String.fromCharCode(0x2212)
/** Le trait d'union conditionnel (U+00AD) : invisible, il permet une césure, marquée d'un trait d'union, là seulement où il est. */
const TRAIT_CONDITIONNEL = String.fromCharCode(0xad)

/** Les titres des blocs (maquette) : toujours en capitales, quelle que soit leur longueur (Bloc, entrée 42 ; DESIGN.md, Typography). */
export const TITRE_TETE = "Tête, corps, jambes par arme"
export const TITRE_KILLS = "Kills par arme"
export const TITRE_DISTANCE = "Distance de tes kills"
export const TITRE_VISEE = "Ta visée à l'entraînement"
/** Les titres des analyses 1 et 2 (maquette ; epic-stats-analyses, entrée 3). */
export const TITRE_TETE_DISTANCE = "Tête selon la distance"
export const TITRE_DUELS_DISTANCE = "Duels gagnés selon la distance"
/**
 * Le titre de la Visée écrit avec une césure permise dans « entraî-nement », dès accessibility3 : « L'ENTRAÎNEMENT » en titre de
 * section dépasse la largeur d'un bloc à accessibility4 et 5 (402 et 375 points, mesure CoreText de l'entrée 30), et CoreText le
 * couperait n'importe où (« L'ENTRAÎNEMEN|T ») ; plus petit, sans trait d'union, que CoreText prendrait sans besoin.
 */
export const TITRE_VISEE_CESURE = `Ta visée à l'entraî${TRAIT_CONDITIONNEL}nement`
/** La phrase d'une période sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble et de Duels. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Des parties, aucune des files à manches (deathmatch, match à mort en équipe) : aucune arme comptée. */
export const SANS_ARMES = "Aucune partie de cette période ne compte pour tes armes."
/** Des parties à manches, aucune touche lue sur tes kills à l'arme (l'escarmouche n'en relève pas). */
export const SANS_TOUCHE_ARME = "Aucune touche relevée sur tes kills dans cette période."
/** Aucune touche donnée dans la période. */
export const SANS_TOUCHE = "Aucune touche relevée dans cette période."
/** Aucune touche reçue des adversaires dans la période. */
export const SANS_TOUCHE_RECUE = "Aucune touche reçue relevée dans cette période."
/** Aucun kill d'adversaire dans les parties à manches de la période. */
export const SANS_KILL = "Aucun kill dans cette période."
/** Des kills, aucun à une arme nommée (capacités, autres kills seulement). */
export const SANS_KILL_ARME = "Aucun kill à l'arme dans cette période."
/** La Visée sans aucune des deux séries sur les 8 semaines. */
export const SANS_VISEE = "Aucune partie de deathmatch ni de compétition ces 8 dernières semaines."
/** La Visée sans compétition (celle sans deathmatch vient du module : SANS_DEATHMATCH). */
export const SANS_COMPETITION = "Aucune partie de compétition ces 8 dernières semaines."
/** Ajouté à la note de Tête, corps, jambes quand une arme y a moins de kills que dans Kills par arme. */
export const NOTE_ESCARMOUCHE = "Écartées : tes parties d'escarmouche (aucune touche relevée)."
/** La note de Distance de tes kills quand un « — » paraît (Trop peu de parties : moins de 5 kills mesurés). */
export const NOTE_TIRET_DISTANCE = `«${NBSP}${TIRET}${NBSP}» : moins de ${MIN_KILLS_DISTANCE} kills mesurés.`
/** Les colonnes du Tableau de Tête selon la distance (maquette) : l'arme, puis les trois tranches du socle. */
export const COLONNES_TETE_DISTANCE: readonly string[] = ["Arme", ...TRANCHES_DISTANCE.map((t) => t.libelle)]
/** Duels gagnés selon la distance sans aucun duel à une arme nommée. */
export const SANS_DUEL_ARME = "Aucun duel à l'arme dans cette période."
/** Le libellé de l'écart de ta tête face à celle de tes lobbys, sous les barres des Zones. */
export const ECART_TETE = "À la tête"
/** Les colonnes du Tableau de Distance de tes kills (maquette). */
export const COLONNES_DISTANCE: readonly string[] = ["Arme", "Moyenne", "Plus long"]
/** La Légende d'une Barre empilée (maquette) : tête en bleu, corps en texte-doux, jambes en orange, pastilles de la Légende. */
export const LEGENDE_ZONES: readonly ItemLegende[] = [
  { marque: "pastilleForte", libelle: LIBELLES_ZONES.tete },
  { marque: "pastilleNeutre", libelle: LIBELLES_ZONES.corps },
  { marque: "pastilleFaible", libelle: LIBELLES_ZONES.jambes },
]

// ─────────────────────────── textes ───────────────────────────


export function insecable(texte: string): string {
  return texte.replace(/ /g, NBSP)
}


function killsDits(n: number): string {
  return `${nombreEnClair(n, 0)} kill${n > 1 ? "s" : ""}`
}

/** La référence d'un écart telle que l'écrit metriques.ts, puis telle que la dit VoiceOver (Voice and Tone : « par rapport à tes lobbys »). */
const REFERENCES_DITES: readonly (readonly [string, string])[] = [
  [" vs lobby", " par rapport à tes lobbys"],
  [" vs semaine d'avant", " par rapport à la semaine d'avant"],
  [" vs mois d'avant", " par rapport au mois d'avant"],
  [" vs acte d'avant", " par rapport à l'acte d'avant"],
]

const POINTS = new RegExp(`(\\d+)${NBSP}pts?(?!\\p{L})`, "gu")





export function ditEnClair(texte: string): string {
  let t = texte
  for (const [ecrit, dit] of REFERENCES_DITES) {
    if (t.endsWith(ecrit)) {
      t = t.slice(0, t.length - ecrit.length) + dit
      break
    }
  }
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t.replace(POINTS, (_tout: string, n: string) => `${n} point${Number(n) >= 2 ? "s" : ""}`)
}






export function legendeZones(zones: readonly PartZone[], precision: string | null): string {
  const morceaux = zones.map((z) => insecable(`${z.libelle.toLowerCase()} ${z.texte}`))
  if (precision !== null) morceaux.push(insecable(precision))
  return morceaux.join(`${NBSP}· `)
}

/** Les parts d'une Barre empilée : celles des trois zones du module, ou null si l'une manque (sous son seuil, sans touche : piste vide). */
export function partsDesZones(zones: readonly PartZone[]): Zones | null {
  const [t, c, j] = zones
  if (t === undefined || c === undefined || j === undefined || t.part === null || c.part === null || j.part === null) return null
  return { tete: t.part, corps: c.part, jambes: j.part }
}

/** Les Barres empilées de Tête, corps, jambes par arme, dans l'ordre du module : libellé, ta tête, parts, légende, phrase du module. */
export function barresTete(lignes: readonly TeteParArme[]): BarreEmpilee[] {
  return lignes.map((l): BarreEmpilee => ({
    libelle: insecable(l.libelle), valeur: l.tete, parts: partsDesZones(l.zones), legende: legendeZones(l.zones, l.precision), voix: l.phrase,
  }))
}

/** Vrai si une arme de Kills par arme a plus de kills que dans Tête, corps, jambes (parties sans touches relevées : l'escarmouche). */
export function horsDesTouches(lignes: readonly TeteParArme[], kills: KillsParArme | null): boolean {
  if (kills === null) return false
  return kills.lignes.some((l) => l.nom !== KILLS_CAPACITES && (lignes.find((x) => x.nom === l.nom)?.kills ?? 0) < l.nombre)
}

/** Le nombre de touches d'une barre des Zones. */
function touchesDe(b: BarreZones): number {
  return b.touches.tete + b.touches.corps + b.touches.jambes
}

/** Les Barres empilées d'une partie des Zones : « Toi », puis « Lobbys » s'il y a une référence ; ta tête à droite ; légende du module. */
export function barresZones(b: BlocZones): BarreEmpilee[] {
  const barres: BarreZones[] = b.lobbys === null ? [b.toi] : [b.toi, b.lobbys]
  return barres.map((x): BarreEmpilee => ({
    libelle: x.libelle, valeur: x.zones[0] !== undefined ? x.zones[0].texte : TIRET, parts: partsDesZones(x.zones),
    legende: legendeZones(x.zones, x.precision), voix: x.libelle,
  }))
}


export function voixZones(b: BlocZones): string {
  return b.ecart === null ? b.phrase : `${b.phrase} ${ECART_TETE}, ${ditEnClair(b.ecart)}.`
}


export function voixKill(l: ZoneComptee): string {
  return `${l.nom}, ${killsDits(l.nombre)} : ${l.texte} de tes kills.`
}


export function barresKills(k: KillsParArme): Barre[] {
  return k.lignes.map((l): Barre => ({ libelle: insecable(effectifEnClair(l.nom, l.nombre)), valeur: l.texte, part: l.part, evaluation: l.evaluation, voix: voixKill(l) }))
}


export function noteKills(k: KillsParArme): string | null {
  return k.texteAutres === null ? null : `Hors de la liste${NBSP}: ${k.texteAutres} (arme sans nom, chute ou spike).`
}


export function lignesDistance(lignes: readonly DistanceArme[]): LigneTableau[] {
  return lignes.map((l): LigneTableau => ({ cellules: [insecable(l.libelle), l.texteMoyenne, l.textePlusLong], voix: l.phrase }))
}





export function noteDistance(lignes: readonly DistanceArme[]): string | null {
  const morceaux: string[] = []
  if (lignes.some((l) => l.moyenne === null)) morceaux.push(NOTE_TIRET_DISTANCE)
  const precises = lignes.filter((l) => l.precision !== null).map((l) => `${l.nom} ${l.precision}`)
  if (precises.length > 0) morceaux.push(`Un kill sans position sort du calcul${NBSP}: ${precises.join(", ")}.`)
  return morceaux.length === 0 ? null : morceaux.join(" ")
}


export function lignesTeteDistance(t: TeteSelonLaDistance): LigneTableau[] {
  return t.lignes.map((l): LigneTableau => ({ cellules: [insecable(l.libelle), ...l.tranches.map((x) => x.texte)], voix: l.phrase }))
}


export function barresDuels(d: DuelsSelonLaDistance): Barre[] {
  return d.tranches.map((t): Barre => ({ libelle: insecable(effectifEnClair(t.libelle, t.duels)), valeur: t.texte, part: t.valeur, evaluation: t.evaluation, voix: t.phrase }))
}


export function legendeVisee(v: ViseeEntrainement): ItemLegende[] {
  const items: ItemLegende[] = []
  if (v.deathmatch.points.length > 0) items.push({ marque: "tirets", libelle: `${v.deathmatch.libelle}${NBSP}· ${v.deathmatch.texte}` })
  if (v.competition.points.length > 0) items.push({ marque: "trait", libelle: `${v.competition.libelle}${NBSP}· ${v.competition.texte}` })
  return items
}

/** Le titre de la Visée à cette taille de texte : écrit avec sa césure permise dès accessibility3, dit sans elle (null : dit comme écrit). */
export function titreVisee(taille: DynamicTypeSize | undefined): { ecrit: string; dit: string | null } {
  const cesure = taille === "accessibility3" || taille === "accessibility4" || taille === "accessibility5"
  return cesure ? { ecrit: TITRE_VISEE_CESURE, dit: TITRE_VISEE } : { ecrit: TITRE_VISEE, dit: null }
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`armes : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── blocs ───────────────────────────

/** Un texte en `corps` `texte-doux` (DESIGN.md : phrases d'explication, phrase d'un bloc vide), coupé seulement entre les mots. */
function Phrase({ texte }: { texte: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Text {...TYPO.corps} foregroundStyle={couleurs(env.colorSchemeContrast).texteDoux}>
          {sansMauvaiseCoupure(texte)}
        </Text>
      )}
    </EnvironmentValuesReader>
  )
}

/**
 * Bloc « Tête, corps, jambes par arme » (maquette ; EXPERIENCE.md, Barre empilée), coin bas, titre de section : la note du module
 * sous le titre ; une Barre empilée par arme, dans l'ordre du module ; la Légende des zones dès qu'une barre est dessinée ; en bas,
 * la légende du module, et la raison d'un écart de kills avec Kills par arme. Sans arme : sa phrase.
 */
function BlocTete({ lignes, horsTouches }: { lignes: readonly TeteParArme[]; horsTouches: boolean }) {
  if (lignes.length === 0) {
    return <Bloc titre={TITRE_TETE} niveau="section" coin="bas" vide={SANS_TOUCHE_ARME} note={horsTouches ? NOTE_ESCARMOUCHE : undefined} />
  }
  const barres = barresTete(lignes)
  const note = sansMauvaiseCoupure(horsTouches ? `${LEGENDE_TETE_PAR_ARME} ${NOTE_ESCARMOUCHE}` : LEGENDE_TETE_PAR_ARME)
  return (
    <Bloc titre={TITRE_TETE} niveau="section" coin="bas" note={note}>
      <Phrase key="explication" texte={NOTE_TETE_PAR_ARME} />
      <BarresEmpilees key="barres" barres={barres} />
      {barres.some((b) => b.parts !== null) ? <Legende key="legende" items={LEGENDE_ZONES} /> : null}
    </Bloc>
  )
}






function PartieZones({ b, c, vide }: { b: BlocZones; c: Palette; vide: string }) {
  if (touchesDe(b.toi) === 0) return <Phrase texte={vide} />
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityElement accessibilityLabel={voixZones(b)}>
      <BarresEmpilees barres={barresZones(b)} />
      {b.ecart !== null ? (
        <Text
          styledText={{
            font: TYPO.petit.font,
            fontWeight: TYPO.petit.fontWeight,
            foregroundColor: c.texteDoux,
            monospacedDigit: true,
            content: [
              `${ECART_TETE}${NBSP}: `,
              { content: b.ecart, font: TYPO.petitFort.font, fontWeight: TYPO.petitFort.fontWeight, foregroundColor: couleurEvaluation(c, b.evaluation), monospacedDigit: true },
            ],
          }}
        />
      ) : null}
    </VStack>
  )
}

/**
 * Bloc « Zones touchées, toutes armes » (maquette ; EXPERIENCE.md, Zones touchées, données et reçues), coin haut, titre de bloc :
 * tes touches données face à tes lobbys ; puis, avec des parties à manches, un filet `bordure` et le titre « Où tu te fais toucher »
 * au-dessus des touches reçues ; la Légende des zones dès qu'une barre est dessinée. Aucune touche donnée : la phrase du bloc.
 */
function BlocDesZones({ z, aManches }: { z: ZonesTouchees; aManches: boolean }) {
  const donnees = z.donnees, recues = z.recues
  if (touchesDe(donnees.toi) === 0) return <Bloc titre={donnees.titre} coin="haut" vide={SANS_TOUCHE} />
  const parties = aManches ? [donnees, recues] : [donnees]
  const dessinee = parties.some((b) => barresZones(b).some((x) => x.parts !== null))
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Bloc titre={donnees.titre} coin="haut">
            <PartieZones key="donnees" b={donnees} c={c} vide={SANS_TOUCHE} />
            {aManches ? <Rectangle key="filet" fill={c.bordure} frame={{ maxWidth: "infinity", height: 1 }} accessibilityHidden /> : null}
            {aManches ? titreDeBloc(c, recues.titre) : null}
            {aManches ? <PartieZones key="recues" b={recues} c={c} vide={SANS_TOUCHE_RECUE} /> : null}
            {dessinee ? <Legende key="legende" items={LEGENDE_ZONES} /> : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Bloc « Kills par arme » (maquette ; EXPERIENCE.md, Kills par arme), sans coin : une Barre par arme et les capacités, la note des autres kills. */
function BlocKills({ k }: { k: KillsParArme }) {
  const note = noteKills(k)
  if (k.lignes.length === 0) return <Bloc titre={TITRE_KILLS} vide={k.kills === 0 ? SANS_KILL : SANS_KILL_ARME} note={note ?? undefined} />
  return (
    <Bloc titre={TITRE_KILLS} note={note ?? undefined}>
      <Barres barres={barresKills(k)} />
    </Bloc>
  )
}

/** Bloc « Distance de tes kills » (maquette ; EXPERIENCE.md, Tableau), coin bas : le Tableau des armes, la note du « — » et des kills sans position. */
function BlocDistance({ lignes }: { lignes: readonly DistanceArme[] }) {
  if (lignes.length === 0) return <Bloc titre={TITRE_DISTANCE} coin="bas" vide={SANS_KILL_ARME} />
  const note = noteDistance(lignes)
  return (
    <Bloc titre={TITRE_DISTANCE} coin="bas" note={note === null ? undefined : sansMauvaiseCoupure(note)}>
      <Tableau colonnes={COLONNES_DISTANCE} lignes={lignesDistance(lignes)} />
    </Bloc>
  )
}

/**
 * Bloc « Tête selon la distance » (maquette ; analyses-entrainement.md, analyse 1), coin haut, titre de section : le Tableau des armes
 * (l'arme, puis ton % de tête à moins de 10 m, de 10 à 20 m, à plus de 20 m), dans l'ordre de Tête, corps, jambes par arme ; la note :
 * méthode, « — », kills sans position, effectif. Sans arme : sa phrase, et l'effectif.
 */
function BlocTeteDistance({ t }: { t: TeteSelonLaDistance }) {
  if (t.lignes.length === 0) {
    return <Bloc titre={TITRE_TETE_DISTANCE} niveau="section" coin="haut" vide={SANS_TOUCHE_ARME} note={t.texteEffectif === null ? undefined : sansMauvaiseCoupure(t.texteEffectif)} />
  }
  return (
    <Bloc titre={TITRE_TETE_DISTANCE} niveau="section" coin="haut" note={sansMauvaiseCoupure(noteTeteDistance(t))}>
      <Tableau colonnes={COLONNES_TETE_DISTANCE} lignes={lignesTeteDistance(t)} />
    </Bloc>
  )
}

/**
 * Un Chiffre de l'arme ramassée ou du fusil perdu tel qu'il s'affiche dans la grille de dessin.tsx (DESIGN.md, chiffre) : libellé et
 * sous-texte coupés seulement entre les mots ; valeur en `texte`, aucune référence n'étant écrite (évaluation neutre) ; la phrase du
 * module telle quelle.
 */
function chiffreDArmeAffiche(ch: ChiffreArme): ChiffreDeGrille {
  return { cle: ch.cle, libelle: sansMauvaiseCoupure(ch.libelle), valeur: ch.valeur, sousTexte: sansMauvaiseCoupure(ch.sousTexte), evaluation: "neutre", voix: ch.voix }
}

/**
 * Les analyses 3 et 4 telles que le bloc des duels les reçoit : leurs deux résultats (null : section `armes` des ressources vide, ou
 * calcul qui lève), et si les catégories manquent toutes.
 */
export type ArmesDuBloc = {
  readonly ramassee: ArmeRamassee | null
  readonly fusil: FusilPerdu | null
  readonly sansCategories: boolean
  /** Sans catégorie : l'effectif des deux analyses (null si son calcul lève). */
  readonly effectif?: EffectifAnalyse | null
}

/** Les Chiffres posés sous les tranches : ceux du module, aucun sans l'un des deux résultats. */
export function chiffresDuBloc(a: ArmesDuBloc): ChiffreArme[] {
  return a.ramassee === null || a.fusil === null ? [] : chiffresArmeEtFusil(a.ramassee, a.fusil)
}

/**
 * La note du bloc des duels : celle des duels (noteDuelsDistance), puis, sous des barres dessinées, ce qu'en disent les analyses 3 et 4
 * (noteArmeEtFusil ; sans catégorie d'arme, noteSansCategories : SANS_CATEGORIES et l'effectif) ; null sans rien.
 */
export function noteBlocDuels(d: DuelsSelonLaDistance, a: ArmesDuBloc): string | null {
  const morceaux: string[] = []
  const duels = noteDuelsDistance(d)
  if (duels !== null) morceaux.push(duels)
  if (d.duels + d.sansPosition.duels > 0) {
    const armes = a.sansCategories
      ? a.effectif != null ? noteSansCategories(a.effectif) : SANS_CATEGORIES
      : a.ramassee !== null && a.fusil !== null ? noteArmeEtFusil(a.ramassee, a.fusil) : null
    if (armes !== null) morceaux.push(armes)
  }
  return morceaux.length === 0 ? null : morceaux.join(" ")
}

/**
 * Bloc « Duels gagnés selon la distance » (maquette ; analyses-entrainement.md, analyses 2 à 4), sans coin : une Barre par tranche,
 * toutes armes, colorée par sa part gagnée ; dessous, les Chiffres « Kills à l'arme ramassée » et « Fusil perdu » (entrée 4) ; la note
 * (noteBlocDuels) : « — », duels hors de l'arme, duels sans position, effectif, puis la méthode de l'arme ramassée, ses armes, ce qui
 * sort du calcul et l'effectif des deux Chiffres. Le détail par arme sert au récap. Aucun duel à l'arme : sa phrase, et l'effectif des
 * duels, sans les Chiffres.
 */
function BlocDuelsDistance({ d, armes }: { d: DuelsSelonLaDistance; armes: ArmesDuBloc }) {
  const note = noteBlocDuels(d, armes)
  const enNote = note === null ? undefined : sansMauvaiseCoupure(note)
  if (d.duels + d.sansPosition.duels === 0) return <Bloc titre={TITRE_DUELS_DISTANCE} vide={SANS_DUEL_ARME} note={enNote} />
  const chiffres = chiffresDuBloc(armes)
  return (
    <Bloc titre={TITRE_DUELS_DISTANCE} note={enNote}>
      <Barres key="barres" barres={barresDuels(d)} />
      {chiffres.length > 0 ? <GrilleChiffres key="armes" chiffres={chiffres.map(chiffreDArmeAffiche)} /> : null}
    </Bloc>
  )
}

/**
 * Bloc « Ta visée à l'entraînement » (maquette ; EXPERIENCE.md, Courbe, Aucune partie de deathmatch), sans coin, titre de section :
 * le sous-titre du module ; la Courbe de la visée ; sa Légende ; la phrase d'une série vide. Aucune des deux : sa phrase seule.
 */
function BlocVisee({ v }: { v: ViseeEntrainement }) {
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize"]}>
      {(env) => {
        const titre = titreVisee(env.dynamicTypeSize)
        const dit = titre.dit ?? undefined
        if (v.deathmatch.points.length === 0 && v.competition.points.length === 0) {
          return <Bloc titre={titre.ecrit} titreDit={dit} niveau="section" vide={SANS_VISEE} />
        }
        return (
          <Bloc titre={titre.ecrit} titreDit={dit} niveau="section">
            <Phrase key="sous-titre" texte={v.sousTitre} />
            <CourbeVisee key="courbe" semaines={v.semaines} competition={v.competition} deathmatch={v.deathmatch} phrase={v.phrase} />
            <Legende key="legende" items={legendeVisee(v)} />
            {v.sansDeathmatch !== null ? <Phrase key="sans-deathmatch" texte={v.sansDeathmatch} /> : null}
            {v.competition.points.length === 0 ? <Phrase key="sans-competition" texte={SANS_COMPETITION} /> : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Armes et visée dans son emplacement (PropsEmplacement de app.tsx), sur la sélection du périmètre commun, une pile à 14 : Tête,
 * corps, jambes par arme ; Tête selon la distance et Duels gagnés selon la distance, avec l'arme ramassée et le fusil perdu (avec des
 * parties à manches) ; Zones touchées ;
 * Kills par arme ; Distance de tes kills ; puis Ta visée à l'entraînement, sur tout
 * l'historique (`donnees.parties`) et les 8 semaines qui finissent avec celle d'aujourd'hui, quel que soit le périmètre. Période sans
 * partie : Tête, corps, jambes avec la phrase du mode, puis la Visée ; aucune partie à manches : sa phrase, les Zones données (toutes
 * les files), la Visée. Calculs gardés une fois par périmètre et par données (`agregat`), un calcul qui lève retirant son bloc ; sans
 * sélection, rien. Ni lecture, ni requête, ni écriture.
 */
export function Armes({ donnees, perimetre }: PropsEmplacement) {
  const sel = perimetre.selection
  const blocs: VirtualNode[] = []
  if (sel !== null) {
    if (sel.parties.length === 0) {
      blocs.push(<Bloc key="tete" titre={TITRE_TETE} niveau="section" coin="bas" vide={SANS_PARTIE[perimetre.perimetre.mode]} />)
    } else {
      const tete = perimetre.agregat("armes:tete", (s) => attraper("tête, corps, jambes", () => ({
        aManches: retenues(s.parties, "a-manches").length, lignes: teteCorpsJambesParArme(s),
      })))
      const aManches = tete !== null && tete.aManches > 0
      const kills = aManches ? perimetre.agregat("armes:kills", (s) => attraper("kills par arme", () => killsParArme(s))) : null
      if (tete !== null) {
        blocs.push(tete.aManches === 0
          ? <Bloc key="tete" titre={TITRE_TETE} niveau="section" coin="bas" vide={SANS_ARMES} />
          : <BlocTete key="tete" lignes={tete.lignes} horsTouches={horsDesTouches(tete.lignes, kills)} />)
      }
      // Analyses 1 et 2 (epic-stats-analyses, entrée 3), sur les files à manches, comme Kills par arme et Distance.
      if (aManches) {
        const teteDistance = perimetre.agregat("armes:tete-distance", (s) => attraper("tête selon la distance", () => teteSelonLaDistance(s)))
        if (teteDistance !== null) blocs.push(<BlocTeteDistance key="tete-distance" t={teteDistance} />)
        const duels = perimetre.agregat("armes:duels-distance", (s) => attraper("duels selon la distance", () => duelsSelonLaDistance(s)))
        // Analyses 3 et 4 (entrée 4), sous les tranches : catégories des armes tirées des ressources des stats (une section vide, ou
        // des données sans ressources, et les deux Chiffres ne se calculent pas : la note le dit).
        const categories = donnees.ressources?.armes ?? {}
        const sansCat = sansCategories(categories)
        const ramassee = sansCat ? null : perimetre.agregat("armes:ramassee", (s) => attraper("arme ramassée", () => armeRamassee(s, categories)))
        const fusil = sansCat ? null : perimetre.agregat("armes:fusil-perdu", (s) => attraper("fusil perdu", () => fusilPerdu(s, categories)))
        const effectif = sansCat ? perimetre.agregat("armes:effectif-armes", (s) => attraper("effectif de l'arme ramassée", () => effectifArmeEtFusil(s))) : null
        if (duels !== null) blocs.push(<BlocDuelsDistance key="duels-distance" d={duels} armes={{ ramassee, fusil, sansCategories: sansCat, effectif }} />)
      }
      const zones = perimetre.agregat("armes:zones", (s) => attraper("zones touchées", () => zonesTouchees(s)))
      if (zones !== null) blocs.push(<BlocDesZones key="zones" z={zones} aManches={aManches} />)
      if (aManches) {
        if (kills !== null) blocs.push(<BlocKills key="kills" k={kills} />)
        const distance = perimetre.agregat("armes:distance", (s) => attraper("distance de tes kills", () => distanceDesKills(s)))
        if (distance !== null) blocs.push(<BlocDistance key="distance" lignes={distance} />)
      }
    }
    // Ticket 4.41 : le jour local dans la clé ; les 8 semaines de la visée ne changent qu'avec lui (un résultat gardé reste celui de l'instant).
    const maintenant = Date.now(), jour = new Date(maintenant)
    const visee = perimetre.agregat(`armes:visee:${jour.getFullYear()}-${jour.getMonth() + 1}-${jour.getDate()}`, () => attraper("visée à l'entraînement", () => viseeALEntrainement(donnees.parties, maintenant)))
    if (visee !== null) blocs.push(<BlocVisee key="visee" v={visee} />)
  }
  return (
    <PileDeBlocs>
      {blocs}
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Armes et visée dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_ARMES: Emplacement = Armes
