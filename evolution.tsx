import { traduire } from "./langue"
import {
  EnvironmentValuesReader, HStack, Rectangle, Text, VStack, ZStack, type Color, type DynamicTypeSize, type StyledText, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ESPACES, TYPO, couleurs, policeCondensee, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs, fondTuile } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import {
  Barres, BarresDeRR, Bloc, CourbeDeuxSeries, EscalierDuRang, Legende, PucesDeChoix, SEGMENTS_PERIODE, SelecteurSegmente, couleurEvaluation, couleurIssue,
  type Barre, type ItemLegende, type Puce,
} from "./dessin"
import { MiniCourbe } from "./vue-ensemble"
import {
  LIBELLES_PERIODE, MIN_PARTIES_HEURES, PARTIES_BARRES_RR, PARTIES_DEBUT_SESSION, PARTIES_TENDANCE, PREMIER_EPISODE_ESCALIER, STATS_EVOLUTION, TIRET,
  barresRr as calculerBarresRr, courbe as calculerCourbe, effectifEnClair, escalierDuRang as calculerEscalier, miniCourbesEvolution,
  nombreEnClair, quandTuJouesLeMieux as calculerHeures, sensVariation, tendances as calculerTendances,
  type BarresRr, type CleEvolution, type CleTendance, type CleTranche, type Courbe, type Escalier, type Evaluation, type LigneTendance,
  type MarcheEscalier, type MiniCourbeEvolution, type Mode, type Periode, type QuandTuJoues, type Sens, type SensVariation, type StatEvolution,
  type TrancheHoraire, type ValeurCategorie,
} from "./metriques"
import type { SectionPaliers } from "./ressources"
import type { Emplacement, PropsEmplacement } from "./app"
import { conditionsDeVictoire } from "./analyses-evolution"
import { BlocConditions } from "./conditions-victoire"

// Module du sous-onglet Évolution de l'onglet Stats (entrée 22 de epic-stats-tableau-de-bord ; EXPERIENCE.md, Information
// Architecture, Component Patterns : Courbe, Mini-courbe, Sélecteur segmenté, Puces de choix ; State Patterns ; Définitions
// des métriques : Variation, Tendance ; Accessibility Floor ; DESIGN.md ; maquette Evolution). Son emplacement,
// EMPLACEMENT_EVOLUTION, deuxième de la Barre de sous-onglets (entrée 18), reçoit de app.tsx PropsEmplacement : les données
// tenues, l'état du périmètre commun (entrée 17), le choix d'arrivée (une clé de STATS_EVOLUTION, la stat d'une tuile de la
// Vue d'ensemble, entrée 32) et `ouvrir`. De haut en bas, à 14 l'un de l'autre : la période, par le Sélecteur segmenté du
// périmètre commun (le même état que le Réglage du périmètre de la Ligne d'état : l'un règle l'autre) ; la stat, par les
// Puces de choix (Score de combat par défaut, ou la stat d'arrivée) ; le Bloc de la Courbe de cette stat face à sa référence,
// avec sa moyenne, sa variation et sa Légende ; ton rang acte par acte (Escalier du rang), tes RR partie par partie (Barres
// de RR), ces deux-là quel que soit le périmètre, et Quand tu joues le mieux (entrée 23) ; la grille des six Mini-courbes ;
// le Bloc des Tendances ; Dans quelles conditions tu gagnes (entrée 7 de epic-stats-analyses : analyses-evolution.ts, conditions-victoire.tsx). Valeurs, textes et phrases VoiceOver tels que les rendent courbe, miniCourbesEvolution et tendances
// (entrée 4), escalierDuRang, barresRr et quandTuJouesLeMieux (entrée 5) de metriques.ts, calculés une fois par périmètre et
// par données avec la sélection (`agregat` de l'état du périmètre), le sens d'une Mini-courbe par sensVariation (ticket 4.41) ; briques de dessin.tsx (entrées 13 à 15 et 37) et
// Mini-courbe de la Vue d'ensemble (entrée 38), reprises telles quelles. Sans lecture, requête ni écriture ; la stat choisie est le seul état,
// jamais gardé. Rendu jugé sur l'iPhone.

// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const MOINS = String.fromCharCode(0x2212)
const NBSP = String.fromCharCode(0xa0)
const FINE = String.fromCharCode(0x202f)

/** La stat ouverte par défaut (EXPERIENCE.md, Puces de choix : Score de combat, comme la maquette). */
export const STAT_DEFAUT: CleEvolution = "score"

export const NOM_PUCES = "Stat"

export const MAX_POINTS_MINI = 40
/** Hauteur d'une Mini-courbe d'Évolution (DESIGN.md, mini-courbe : `height-evolution`). */
const HAUTEUR_MINI = 34
/** Tuile de Mini-courbe (maquette Evolution) : marge et écart entre ses éléments, en points. */
const TUILE_MINI = { marge: 12, ecart: 4 } as const
/** Entre la moyenne en vedette, « en moyenne » et la variation (maquette : 10) ; l'un sous l'autre aux tailles d'accessibilité : 4. */
const ECART_VEDETTE = { ligne: 10, pile: 4 } as const
/** Tendances (maquette) : entre les deux colonnes, entre les lignes d'une colonne. */
const TENDANCES_ECARTS = { colonnes: 14, lignes: 6 } as const


const EN_PERIODE: Readonly<Record<Periode, string>> = { "7j": "en 7 jours", "30j": "en 30 jours", acte: "sur l'acte", tout: "sur tout l'historique" }
/** « stable », suivi de sa période. */
const SUR_PERIODE: Readonly<Record<Periode, string>> = { "7j": "sur 7 jours", "30j": "sur 30 jours", acte: "sur l'acte", tout: "sur tout l'historique" }
/** Le nom de ta période précédente dans la Légende d'une stat d'équipe ; aucune en Tout. */
const PRECEDENTE: Readonly<Record<Periode, string | null>> = { "7j": "Semaine d'avant", "30j": "Mois d'avant", acte: "Acte d'avant", tout: null }
/** La phrase d'une période sans partie (EXPERIENCE.md, State Patterns), aux mots de la Vue d'ensemble. */
export const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** Note Valorant sans note dans la période (EXPERIENCE.md, Note officielle absente). */
export const SANS_NOTE = "Aucune note officielle dans cette période : Valorant la donne en fin de partie de compétition, depuis septembre 2026."
/** Une autre stat sans partie lisible dans une période qui en a (deathmatch seul en mode Tout…). */
export const SANS_POINT = "Aucune partie de cette période ne compte pour cette stat."
/** Les Tendances sans ligne, la période ayant au moins 20 parties. */
export const TENDANCES_STABLES = "Aucune tendance nette : tes stats sont stables sur cette période."
/** Sous la colonne des Tendances qui n'a aucune ligne. */
export const AUCUNE_TENDANCE = "Aucune"
/** Sous des Tendances montrées avec moins de 20 parties dans la période (la Note porte sur ses 20 dernières parties notées). */
export const AUTRES_TENDANCES = "Les autres tendances dès 20 parties dans la période."
/** Les titres des deux colonnes des Tendances (maquette). */
export const EN_HAUSSE = "En hausse"
export const EN_BAISSE = "En baisse"

const MIN_PARTIES_TENDANCES = 2 * PARTIES_TENDANCE


export function tendancesTropTot(parties: number): string {
  return `Tes tendances apparaissent dès ${MIN_PARTIES_TENDANCES} parties : ${parties} dans cette période.`
}

/** Le libellé dit d'une ligne des Tendances qui n'est pas une stat d'Évolution (Voice and Tone : chaque abréviation dite). */
const PARLE_TENDANCE: Readonly<Partial<Record<CleTendance, string>>> = { premiersKills: "Premiers kills par manche" }

/** Les neuf puces d'Évolution, dans l'ordre de STATS_EVOLUTION : nom court, nom dit (« K/D », « Ratio kills sur morts »). */
const PUCES: readonly Puce<CleEvolution>[] = STATS_EVOLUTION.map((e) => ({ cle: e.cle, libelle: e.puce, parle: e.parle }))

// ─────────────────────────── textes ───────────────────────────


const UN_PTS = new RegExp(`(^|[^\\d,${FINE}])([01])${NBSP}pts(?!\\p{L})`, "gu")

const DES_POINTS = new RegExp(`(\\d+)${NBSP}pts?(?!\\p{L})`, "gu")





export function accorderPoints(texte: string): string {
  return texte.replace(UN_PTS, `$1$2${NBSP}pt`)
}

/** Une valeur ou un écart écrits, dits par VoiceOver : signe en toutes lettres, « pts » en « points » accordés, « — » « aucune valeur ». */
export function ditEnClair(texte: string): string {
  if (texte === TIRET) return "aucune valeur"
  let t = texte
  if (t.startsWith("+")) t = `plus ${t.slice(1)}`
  else if (t.startsWith(MOINS)) t = `moins ${t.slice(1)}`
  return t.replace(DES_POINTS, (_tout: string, n: string) => `${n} point${Number(n) >= 2 ? "s" : ""}`)
}

/** La stat d'Évolution de cette clé ; Score de combat pour une clé inconnue. */
function statEvolution(cle: CleEvolution): StatEvolution {
  return STATS_EVOLUTION.find((e) => e.cle === cle) ?? STATS_EVOLUTION.find((e) => e.cle === STAT_DEFAUT)!
}

/** La stat ouverte au montage : celle d'arrivée si c'est une clé de STATS_EVOLUTION (entrée 32), sinon Score de combat. */
export function statDArrivee(arrivee: string | null): CleEvolution {
  const e = STATS_EVOLUTION.find((x) => x.cle === arrivee)
  return e ? e.cle : STAT_DEFAUT
}


export function titreCourbe(e: StatEvolution, periode: Periode): { ecrit: string; dit: string } {
  return { ecrit: `${e.libelle}${NBSP}· ${LIBELLES_PERIODE[periode]}`, dit: `${e.parle}, ${LIBELLES_PERIODE[periode]}` }
}

/** La couleur d'une variation selon le sens de la stat : `fort` dans le bon sens, `faible` dans l'autre ; `neutre` sans variation ou de sens neutre. */
function evaluationDuSens(sens: SensVariation | null, stat: Sens): Evaluation {
  if ((sens !== "hausse" && sens !== "baisse") || stat === "neutre") return "neutre"
  return (sens === "hausse") === (stat === "haut") ? "fort" : "faible"
}





export function texteVariationCourbe(c: Courbe): string | null {
  if (c.sens === null) return null
  if (c.sens === "stable") return "stable sur la période"
  const v = c.texteVariation === null || c.texteVariation === TIRET ? `en ${c.sens}` : c.texteVariation
  return accorderPoints(`${v} sur la période`)
}

/**
 * La Légende de la Courbe (DESIGN.md, Légende ; maquette) : « Toi » (trait), puis « Tes lobbys » (tirets) quand leurs points
 * se dessinent, ou ta période précédente (« Mois d'avant »…, tirets) pour une stat d'équipe qui en a une, dès 5 parties (entrée 43 :
 * sinon, la note de la Courbe à sa place) ; sans référence, aucune légende (une seule série).
 */
export function legendeCourbe(c: Courbe, periode: Periode): ItemLegende[] {
  const toi: ItemLegende = { marque: "trait", libelle: "Toi" }
  if (c.points.some((p) => typeof p.valeurLobby === "number" && Number.isFinite(p.valeurLobby))) return [toi, { marque: "tirets", libelle: "Tes lobbys" }]
  const avant = PRECEDENTE[periode]
  if (typeof c.ligne === "number" && Number.isFinite(c.ligne) && avant !== null) return [toi, { marque: "tirets", libelle: avant }]
  return []
}

/** Vrai si la Courbe a au moins une valeur à dessiner. */
function aDesPoints(c: Courbe): boolean {
  return c.points.some((p) => typeof p.valeur === "number" && Number.isFinite(p.valeur))
}

/** Une Mini-courbe d'Évolution et le sens de sa variation (« stable » quand le test ne passe pas ; null sous 20 parties lisibles). */
export type MiniEtSens = { mini: MiniCourbeEvolution; sens: SensVariation | null }

/** Vrai si la Mini-courbe a une variation à écrire. */
function variationEcrite(mini: MiniCourbeEvolution): mini is MiniCourbeEvolution & { texteVariation: string } {
  return mini.variation !== null && mini.texteVariation !== null && mini.texteVariation !== TIRET
}





export function texteVariationMini({ mini, sens }: MiniEtSens, periode: Periode): string | null {
  if (variationEcrite(mini)) return accorderPoints(`${mini.texteVariation} ${mini.cle === "ecartDegats" ? "par manche" : EN_PERIODE[periode]}`)
  return sens === "stable" ? `stable ${SUR_PERIODE[periode]}` : null
}


export function phraseMini({ mini, sens }: MiniEtSens, periode: Periode): string {
  const e = STATS_EVOLUTION.find((x) => x.cle === mini.cle)
  let suite = ""
  if (variationEcrite(mini)) suite = `, ${ditEnClair(mini.texteVariation)} ${mini.cle === "ecartDegats" ? `par manche ${EN_PERIODE[periode]}` : EN_PERIODE[periode]}`
  else if (sens === "stable") suite = `, stable ${SUR_PERIODE[periode]}`
  return `${e ? e.parle : mini.libelle} : ${ditEnClair(mini.valeur)}${suite}.`
}

/** La couleur d'une Mini-courbe et de son texte : celle de sa variation ; `texte-doux` stable ; `texte-discret` sans test (sous 20 parties). */
function couleurMini(c: Palette, m: MiniEtSens): Color {
  if (m.mini.variation !== null) return couleurEvaluation(c, m.mini.evaluation)
  return m.sens === "stable" ? c.texteDoux : c.texteDiscret
}


export function ligneTendance(l: LigneTendance): { ecrit: string; dit: string } {
  const e = STATS_EVOLUTION.find((x) => x.cle === l.cle)
  const nom = e ? e.parle : PARLE_TENDANCE[l.cle] ?? l.libelle
  return { ecrit: accorderPoints(`${l.libelle}${NBSP}· ${l.ecart}`), dit: `${nom} : ${ditEnClair(l.ecart)}` }
}






export function reduirePoints(points: readonly (number | null)[], max: number = MAX_POINTS_MINI): (number | null)[] {
  const n = points.length
  if (n <= max) return [...points]
  const r: (number | null)[] = []
  for (let j = 0; j < max; j++) {
    const debut = Math.floor((j * n) / max), fin = Math.floor(((j + 1) * n) / max)
    let somme = 0, k = 0
    for (let i = debut; i < fin; i++) {
      const v = points[i]
      if (typeof v === "number" && Number.isFinite(v)) {
        somme += v
        k++
      }
    }
    r.push(k === 0 ? null : somme / k)
  }
  return r
}

/** Colonnes de la grille des Mini-courbes (DESIGN.md, Layout & Spacing) : 2 ; 1 dès la troisième taille d'accessibilité. */
export function colonnesMinis(taille: DynamicTypeSize | undefined): number {
  return !tailleAccessibilite(taille) || taille === "accessibility1" || taille === "accessibility2" ? 2 : 1
}

/** Un calcul du module rattrapé : null s'il lève, dit en console (agrégat gardé avec la sélection : dit une fois). */
function attraper<T>(quoi: string, calcul: () => T): T | null {
  try {
    return calcul()
  } catch (e) {
    console.log(`évolution : ${quoi} impossible (${e})`)
    return null
  }
}

// ─────────────────────────── blocs ───────────────────────────

/** Un texte en `corps` `texte-doux` : la phrase d'un bloc sans données (DESIGN.md, bloc : `vide`). */
function Phrase({ texte, c }: { texte: string; c: Palette }) {
  return (
    <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
      {texte}
    </Text>
  )
}











function BlocCourbe({ e, periode, courbe, vide }: { e: StatEvolution; periode: Periode; courbe: Courbe | null; vide: string | null }) {
  const titre = titreCourbe(e, periode)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (vide !== null || courbe === null) {
          return (
            <Bloc titre={titre.ecrit} titreDit={titre.dit} niveau="section" coin="bas">
              {vide !== null ? <Phrase key="vide" texte={vide} c={c} /> : null}
            </Bloc>
          )
        }
        const variation = texteVariationCourbe(courbe)
        const couleurVariation = courbe.sens === "stable" ? c.texteDiscret : couleurEvaluation(c, evaluationDuSens(courbe.sens, e.stat.sens))
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        const morceaux = [
          <Text key="moyenne" {...policeCondensee(TYPO.vedette, false)} monospacedDigit foregroundStyle={c.texte} layoutPriority={1}>
            {courbe.moyenne}
          </Text>,
          <Text key="en-moyenne" {...TYPO.corps} foregroundStyle={c.texteDoux}>
            en moyenne
          </Text>,
          variation !== null ? (
            <Text key="variation" {...TYPO.ligne} foregroundStyle={couleurVariation}>
              {variation}
            </Text>
          ) : null,
        ]
        const legende = legendeCourbe(courbe, periode)
        return (
          <Bloc titre={titre.ecrit} titreDit={titre.dit} niveau="section" coin="bas">
            {grand ? (
              <VStack key="vedette" alignment="leading" spacing={ECART_VEDETTE.pile} accessibilityHidden>
                {morceaux}
              </VStack>
            ) : (
              <HStack key="vedette" alignment="firstTextBaseline" spacing={ECART_VEDETTE.ligne} accessibilityHidden>
                {morceaux}
              </HStack>
            )}
            {/* Un seul élément VoiceOver, la phrase de la Courbe (quoi, période, parties, variation ou « stable », moyenne,
                référence) ; ses points, jamais lus un à un, restent dessous. */}
            <VStack key="courbe" frame={{ maxWidth: "infinity" }} accessibilityElement accessibilityLabel={courbe.phrase ?? undefined}>
              <CourbeDeuxSeries cle={courbe.cle} points={courbe.points} ligne={courbe.ligne} parJour={courbe.regroupement !== "partie"} phrase={courbe.phrase} />
            </VStack>
            {legende.length > 0 ? (
              <Legende key="legende" items={legende} />
            ) : courbe.note ? (
              // Entrée 43 : ta période précédente sous 5 parties, la note du module à la place de la Légende, au style de celle-ci,
              // masquée comme elle (la phrase de la Courbe dit la raison).
              <Text key="note" {...TYPO.note} foregroundStyle={c.texteDiscret} accessibilityHidden>
                {courbe.note}
              </Text>
            ) : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Le nom d'une Mini-courbe, en étiquette condensée toujours en capitales ; `fantome` : invisible et masqué, pour la hauteur seule. */
function nomMini(c: Palette, m: MiniEtSens, fantome: boolean): VirtualNode {
  return (
    <Text
      key={m.mini.cle}
      {...policeCondensee(TYPO.etiquette)}
      foregroundStyle={c.texteDiscret}
      opacity={fantome ? 0 : undefined}
      accessibilityHidden={fantome ? true : undefined}
    >
      {m.mini.libelle}
    </Text>
  )
}

/** Le texte sous une Mini-courbe, en note, de sa couleur ; `fantome` : invisible et masqué, pour la hauteur seule. */
function dessousMini(texte: string, couleur: Color, fantome: boolean, cle: string): VirtualNode {
  return (
    <Text
      key={cle}
      {...TYPO.note}
      foregroundStyle={couleur}
      opacity={fantome ? 0 : undefined}
      accessibilityHidden={fantome ? true : undefined}
    >
      {texte}
    </Text>
  )
}

/**
 * Une tuile de Mini-courbe d'Évolution (DESIGN.md, mini-courbe ; maquette) : sur `surface`, sans coin, marge 12, éléments à 4,
 * à gauche : le nom en étiquette condensée `texte-discret`, en capitales ; la valeur de la période en `valeur` `texte`, chasse
 * fixe ; la Mini-courbe de 34, ses points réduits à 40 au plus (reduirePoints) ; dessous, la variation en note, à la couleur de
 * son sens. Les noms et textes du dessous de ses voisines de rangée, invisibles et masqués, égalisent les hauteurs. Un seul
 * élément VoiceOver (phraseMini).
 */
function TuileMini({ m, rangee, periode }: { m: MiniEtSens; rangee: readonly MiniEtSens[]; periode: Periode }) {
  const voisines = rangee.filter((v) => v.mini.cle !== m.mini.cle)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const accent = couleurMini(c, m)
        const dessous = texteVariationMini(m, periode)
        const fantomes: VirtualNode[] = []
        for (const v of voisines) {
          const d = texteVariationMini(v, periode)
          if (d !== null) fantomes.push(dessousMini(d, c.texteDiscret, true, v.mini.cle))
        }
        return (
          <VStack
            alignment="leading"
            spacing={TUILE_MINI.ecart}
            padding={TUILE_MINI.marge}
            frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
            background={fondTuile(c)}
            accessibilityElement
            accessibilityLabel={phraseMini(m, periode)}
          >
            <ZStack alignment="topLeading">
              {voisines.map((v) => nomMini(c, v, true))}
              {nomMini(c, m, false)}
            </ZStack>
            <Text {...TYPO.valeur} monospacedDigit foregroundStyle={c.texte}>
              {m.mini.valeur}
            </Text>
            <MiniCourbe points={reduirePoints(m.mini.points)} couleur={accent} hauteur={HAUTEUR_MINI} />
            {dessous !== null || fantomes.length > 0 ? (
              <ZStack alignment="topLeading">
                {fantomes}
                {dessous !== null ? dessousMini(dessous, accent, false, m.mini.cle) : null}
              </ZStack>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * La grille des six Mini-courbes (DESIGN.md, Layout & Spacing : 2 colonnes, écart de 6 ; 1 dès la troisième taille
 * d'accessibilité), dans l'ordre de la maquette : chaque rangée tenue à sa hauteur idéale, ses tuiles à toute cette hauteur et
 * à parts égales de la largeur.
 */
function MiniCourbes({ minis, periode }: { minis: readonly MiniEtSens[]; periode: Periode }) {
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize"]}>
      {(env) => {
        const n = colonnesMinis(env.dynamicTypeSize)
        const rangees: MiniEtSens[][] = []
        for (let i = 0; i < minis.length; i += n) rangees.push(minis.slice(i, i + n))
        return (
          <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {rangees.map((r, i) => (
              <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
                {r.map((m) => <TuileMini key={m.mini.cle} m={m} rangee={r} periode={periode} />)}
              </HStack>
            ))}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Une colonne des Tendances : son titre condensé en capitales, à sa couleur, annoncé comme en-tête (`dit` : ce que lit
 * VoiceOver), puis une ligne par stat en petit `texte`, chacune un élément VoiceOver ; sans ligne, « Aucune » en `texte-discret`.
 */
function ColonneTendances({ titre, dit, couleur, lignes, c }: {
  titre: string; dit: string; couleur: Color; lignes: readonly LigneTendance[]; c: Palette
}) {
  return (
    <VStack alignment="leading" spacing={TENDANCES_ECARTS.lignes} frame={{ maxWidth: "infinity", alignment: "topLeading" }}>
      <Text {...policeCondensee(TYPO.sousOngletInactif)} foregroundStyle={couleur} accessibilityElement accessibilityLabel={dit} accessibilityAddTraits="isHeader">
        {titre}
      </Text>
      {lignes.length === 0 ? (
        <Text {...TYPO.petit} foregroundStyle={c.texteDiscret}>
          {AUCUNE_TENDANCE}
        </Text>
      ) : lignes.map((l) => {
        const t = ligneTendance(l)
        return (
          <Text key={l.cle} {...TYPO.petit} foregroundStyle={c.texte} accessibilityElement accessibilityLabel={t.dit}>
            {t.ecrit}
          </Text>
        )
      })}
    </VStack>
  )
}

/**
 * Bloc des Tendances (EXPERIENCE.md, Tendances, Trop peu de parties ; maquette), coin bas, sans titre visible : deux colonnes à
 * 14, « En hausse » en `bleu` (dit « Tendances, en hausse ») puis « En baisse » en `orange`, l'une sous l'autre aux tailles
 * d'accessibilité ; des lignes avec moins de 20 parties dans la période (la Note seule, sur ses 20 parties notées) : la note
 * AUTRES_TENDANCES ; aucune ligne : la phrase de moins de 20 parties, ou celle des stats stables.
 */
function BlocTendances({ lignes, parties }: { lignes: readonly LigneTendance[]; parties: number }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (lignes.length === 0) {
          return (
            <Bloc coin="bas">
              <Phrase texte={parties < MIN_PARTIES_TENDANCES ? tendancesTropTot(parties) : TENDANCES_STABLES} c={c} />
            </Bloc>
          )
        }
        const colonnes = [
          <ColonneTendances key="hausse" titre={EN_HAUSSE} dit={`Tendances, ${EN_HAUSSE.toLowerCase()}`} couleur={c.bleu} lignes={lignes.filter((l) => l.sens === "hausse")} c={c} />,
          <ColonneTendances key="baisse" titre={EN_BAISSE} dit={EN_BAISSE} couleur={c.orange} lignes={lignes.filter((l) => l.sens === "baisse")} c={c} />,
        ]
        return (
          <Bloc coin="bas" note={parties < MIN_PARTIES_TENDANCES ? AUTRES_TENDANCES : undefined}>
            {tailleAccessibilite(env.dynamicTypeSize) ? (
              <VStack alignment="leading" spacing={TENDANCES_ECARTS.colonnes} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {colonnes}
              </VStack>
            ) : (
              <HStack alignment="top" spacing={TENDANCES_ECARTS.colonnes} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {colonnes}
              </HStack>
            )}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── ton rang, tes RR et tes heures (entrée 23) ───────────────────────────

/** Les titres des trois blocs (maquette), en casse normale : la brique Bloc pose leur casse. */
export const TITRE_RANG = "Ton rang, acte par acte"
export const TITRE_RR = "RR, partie par partie"
export const TITRE_HEURES = "Quand tu joues le mieux"
/** Les étiquettes de Quand tu joues le mieux (maquette), en casse normale ; à l'écran, toujours en capitales (`textCase`). */
export const ETIQUETTE_HEURE = "Score de combat selon l'heure"
export const ETIQUETTE_SESSION = "Dans une session"
export const ETIQUETTE_APRES = "Après une défaite"
/** Sans rang gardé : rang.json n'est écrit qu'après une mise à jour réussie. */
export const SANS_RANG = `Aucun rang gardé pour l'instant${NBSP}: il arrive avec la prochaine mise à jour.`

export const SANS_RR = "Aucune partie classée dont le RR est connu."
/** La note fixe des Barres de RR (EXPERIENCE.md, Component Patterns). */
export const NOTE_RR = `Valorant ne garde le RR que de tes ${PARTIES_BARRES_RR} dernières parties classées${NBSP}; ValShop le conserve à chaque mise à jour.`
/** Quand tu joues le mieux sans aucune partie à manches complètes dans la période (escarmouche, deathmatch seuls). */
export const HEURES_SANS_PARTIE = `Aucune partie de cette période ne compte ici${NBSP}: ni l'escarmouche ni le deathmatch n'y entrent.`
/** Sous Quand tu joues le mieux, dès qu'un « — » y paraît (EXPERIENCE.md, Trop peu de parties). */
export const NOTE_TIRET_HEURES = `«${NBSP}${TIRET}${NBSP}»${NBSP}: moins de ${MIN_PARTIES_HEURES} parties.`
/** Le Score de combat qui remplit une barre de tranche : 300 (maquette : 238 à 79 %), ou le plus haut Score écrit s'il le dépasse. */
export const ECHELLE_SCORE = 300

const QUATRIEME = `${PARTIES_DEBUT_SESSION + 1}${String.fromCharCode(0x1d49)}`
/** Rangée du total des RR et colonnes de Quand tu joues le mieux (maquette) : écarts, et entre les lignes d'une colonne. */
const ECARTS_RR_HEURES = { rangee: 10, pile: 4, colonnes: 10, lignes: 3, trait: 1 } as const


function partiesEnClair(n: number): string {
  return `${nombreEnClair(n, 0)} partie${n > 1 ? "s" : ""}`
}


function deRang(rang: string): string {
  return /^[AEIOU]/.test(rang) ? `D'${rang}` : `De ${rang}`
}








export function phraseRang(marches: readonly MarcheEscalier[]): { ecrit: string; dit: string } {
  if (marches.length === 0) {
    const debut = `E${PREMIER_EPISODE_ESCALIER} A1`
    return { ecrit: `Aucun acte classé depuis ${debut}.`, dit: `Aucun acte classé depuis l'épisode ${PREMIER_EPISODE_ESCALIER} acte 1.` }
  }
  const debut = marches[0]
  const classees = marches.filter((m) => m.palier !== null && m.rang !== null)
  if (classees.length === 0) return { ecrit: `Aucun acte classé depuis ${debut.libelle}.`, dit: `Aucun acte classé depuis l'${debut.parle}.` }
  const premier = classees[0], dernier = classees[classees.length - 1]
  if (classees.length === 1) {
    return { ecrit: `${premier.rang} en ${premier.libelle}${NBSP}: ton seul acte classé.`, dit: `${premier.rang} à l'${premier.parle} : ton seul acte classé.` }
  }
  const haut = Math.max(...classees.map((m) => m.palier!))
  const enCours = marches.find((m) => m.enCours)
  const maintenant = enCours !== undefined && enCours.palier !== null && enCours.palier === haut && enCours.palier > premier.palier!
  const fin = maintenant ? `${NBSP}: ton meilleur rang, c'est maintenant.` : "."
  const finDite = maintenant ? " : ton meilleur rang, c'est maintenant." : "."
  if (premier.palier === dernier.palier) {
    return {
      ecrit: `${premier.rang} en ${premier.libelle} comme en ${dernier.libelle}${fin}`,
      dit: `${premier.rang} à l'${premier.parle} comme à l'${dernier.parle}${finDite}`,
    }
  }
  const etendue = `${deRang(premier.rang!)} à ${dernier.rang} depuis`
  return { ecrit: `${etendue} ${debut.libelle}${fin}`, dit: `${etendue} l'${debut.parle}${finDite}` }
}


export function sousTexteRr(n: number): string {
  if (n >= PARTIES_BARRES_RR) return `sur tes ${nombreEnClair(n, 0)} dernières parties classées`
  return n > 1 ? `sur tes ${nombreEnClair(n, 0)} parties classées dont le RR est connu` : "sur ta seule partie classée dont le RR est connu"
}


export function signeEcrit(texte: string): "haut" | "bas" | null {
  if (!/[1-9]/.test(texte)) return null
  return texte.startsWith("+") ? "haut" : texte.startsWith(MOINS) ? "bas" : null
}

/** Un morceau de ligne : du texte, ou une valeur en gras (`valeur`), à la couleur de son évaluation. */
export type Morceau = string | { valeur: string; evaluation: Evaluation }





export function moyennesRr(b: BarresRr): Morceau[] | null {
  const parts: [string, string][] = []
  if (b.texteParVictoire !== null) parts.push([b.texteParVictoire, "par victoire"])
  if (b.texteParDefaite !== null) parts.push([b.texteParDefaite, "par défaite"])
  if (parts.length === 0) return null
  // Texte riche : ses morceaux ne passent pas par la fabrique JSX, traduits ici (en français, tels quels).
  const morceaux: Morceau[] = [traduire(`En moyenne${NBSP}: `)]
  parts.forEach(([valeur, quoi], i) => {
    const s = signeEcrit(valeur)
    morceaux.push({ valeur, evaluation: s === "haut" ? "fort" : s === "bas" ? "faible" : "neutre" })
    morceaux.push(traduire(` ${quoi}${i === parts.length - 1 ? "." : ", "}`))
  })
  return morceaux
}


export function remboursesRr(rembourse: number): string | null {
  if (!(rembourse > 0)) return null
  return `${nombreEnClair(rembourse, 0)}${NBSP}RR remboursé${rembourse > 1 ? "s" : ""} sur ces parties, hors du total.`
}


const TRANCHES_DITES: Readonly<Record<CleTranche, string>> = {
  "6-14": "De 6 heures à 14 heures", "14-18": "De 14 heures à 18 heures", "18-21": "De 18 heures à 21 heures",
  "21-24": "De 21 heures à minuit", "0-6": "De minuit à 6 heures",
}

/** Le Score qui remplit une barre de tranche : ECHELLE_SCORE, ou le plus haut Score écrit s'il le dépasse. */
export function echelleTranches(tranches: readonly TrancheHoraire[]): number {
  let max = ECHELLE_SCORE
  for (const t of tranches) if (t.valeur !== null && t.valeur > max) max = t.valeur
  return max
}






export function barreTranche(t: TrancheHoraire, echelle: number): Barre {
  const tete = `${TRANCHES_DITES[t.cle] ?? t.libelle}, ${partiesEnClair(t.parties)}`
  const voix = t.valeur !== null ? `${tete} : score de combat ${t.texte}.`
    : t.parties < MIN_PARTIES_HEURES ? `${tete} : pas de valeur sous ${MIN_PARTIES_HEURES} parties.` : `${tete} : aucune valeur.`
  return { libelle: effectifEnClair(t.libelle, t.parties), valeur: t.texte, part: t.valeur === null ? null : t.valeur / echelle, evaluation: t.evaluation, voix }
}

/** Une ligne d'une colonne de Quand tu joues le mieux : son libellé, sa valeur. */
export type LigneHeures = { libelle: string; valeur: ValeurCategorie }
/** Une colonne : son étiquette, ses deux lignes, sa note (null : aucune) et sa couleur, ce qu'en lit VoiceOver. */
export type ColonneHeures = { etiquette: string; lignes: LigneHeures[]; note: string | null; evaluationNote: Evaluation | null; dit: string }






export function colonneSession(q: QuandTuJoues): ColonneHeures {
  const note = q.texteEcartSession === null ? null : `${q.texteEcartSession} après trois parties`
  return {
    etiquette: ETIQUETTE_SESSION,
    lignes: [{ libelle: `Parties 1 à ${PARTIES_DEBUT_SESSION}`, valeur: q.premieres }, { libelle: `${QUATRIEME} et suivantes`, valeur: q.suivantes }],
    note, evaluationNote: note === null ? null : q.suivantes.evaluation,
    dit: `${ETIQUETTE_SESSION}, score de combat : parties 1 à ${PARTIES_DEBUT_SESSION}, ${ditEnClair(q.premieres.texte)} ; quatrième et suivantes, ${ditEnClair(q.suivantes.texte)}${note === null ? "" : `, ${ditEnClair(note)}`}.`,
  }
}






export function colonneApres(q: QuandTuJoues): ColonneHeures {
  const n = q.apresDefaite.parties + q.apresVictoire.parties
  const note = n > 0 ? `sur ${partiesEnClair(n)}` : null
  return {
    etiquette: ETIQUETTE_APRES,
    lignes: [{ libelle: "Partie suivante gagnée", valeur: q.apresDefaite }, { libelle: "Après une victoire", valeur: q.apresVictoire }],
    note, evaluationNote: null,
    dit: `${ETIQUETTE_APRES}, partie suivante gagnée : ${ditEnClair(q.apresDefaite.texte)} ; après une victoire : ${ditEnClair(q.apresVictoire.texte)}${note === null ? "" : ` ; ${note}`}.`,
  }
}

/** Vrai si un « — » paraît dans Quand tu joues le mieux : une tranche, une ligne d'une colonne. */
export function tiretDansHeures(q: QuandTuJoues): boolean {
  return q.tranches.some((t) => t.texte === TIRET) || [q.premieres, q.suivantes, q.apresDefaite, q.apresVictoire].some((v) => v.texte === TIRET)
}

/** Une étiquette de bloc (maquette) : condensée, `texte-discret`, toujours en capitales, annoncée comme en-tête. */
function Etiquette({ texte, c, enTete = true }: { texte: string; c: Palette; enTete?: boolean }) {
  return (
    <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits={enTete ? "isHeader" : undefined}>
      {texte}
    </Text>
  )
}

/** Une ligne en corps : ses morceaux, les valeurs en gras à chasse fixe, `texte` si neutres, sinon de la couleur de leur évaluation. */
function LigneMorceaux({ morceaux, c, couleur, masquee = false, issue = false }: { morceaux: readonly Morceau[]; c: Palette; couleur: Color; masquee?: boolean; issue?: boolean }) {
  return (
    <Text
      styledText={{
        font: TYPO.corps.font,
        fontWeight: TYPO.corps.fontWeight,
        foregroundColor: couleur,
        content: morceaux.map((m): string | StyledText => (typeof m === "string" ? m : {
          content: m.valeur, font: TYPO.corps.font, fontWeight: "bold", monospacedDigit: true,
          // `issue` : un gain ou une perte de RR, en vert ou rouge clair, pas une évaluation.
          foregroundColor: m.evaluation === "neutre" ? c.texte : issue ? couleurIssue(c, m.evaluation) : couleurEvaluation(c, m.evaluation),
        })),
      }}
      accessibilityHidden={masquee ? true : undefined}
    />
  )
}

/**
 * Bloc « Ton rang, acte par acte » (maquette ; EXPERIENCE.md, Escalier du rang), coin haut, titre posé par la brique Bloc : la
 * phrase de l'Escalier (phraseRang) en corps `texte-doux`, dite avec les actes en clair, puis l'Escalier du rang tel que le rend
 * escalierDuRang, ses actes repères dessous, sa phrase VoiceOver, aux couleurs de palier du catalogue. Sans rang gardé : SANS_RANG ;
 * aucun acte depuis E8 A1 : la phrase seule.
 */
function BlocRang({ escalier, sansRang, paliers }: { escalier: Escalier; sansRang: boolean; paliers: SectionPaliers }) {
  if (sansRang) return <Bloc titre={TITRE_RANG} niveau="section" coin="haut" vide={SANS_RANG} />
  const phrase = phraseRang(escalier.marches)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Bloc titre={TITRE_RANG} niveau="section" coin="haut">
          <Text key="phrase" {...TYPO.corps} foregroundStyle={couleurs(env.colorSchemeContrast).texteDoux} accessibilityElement accessibilityLabel={phrase.dit}>
            {phrase.ecrit}
          </Text>
          {escalier.marches.length > 0 ? (
            <EscalierDuRang key="escalier" marches={escalier.marches} reperes={escalier.reperes} phrase={escalier.phrase} paliers={paliers} />
          ) : null}
        </Bloc>
      )}
    </EnvironmentValuesReader>
  )
}








function BlocRr({ rr }: { rr: BarresRr }) {
  if (rr.barres.length === 0 || rr.texteTotal === null) return <Bloc titre={TITRE_RR} niveau="section" vide={SANS_RR} note={NOTE_RR} />
  const total = rr.texteTotal
  const moyennes = moyennesRr(rr)
  const rembourses = remboursesRr(rr.rembourse)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const morceaux = [
          <Text key="total" {...policeCondensee(TYPO.nom, false)} monospacedDigit foregroundStyle={c.texte} layoutPriority={1}>
            {total}
          </Text>,
          <Text key="sur" {...TYPO.corps} foregroundStyle={c.texteDoux}>
            {sousTexteRr(rr.barres.length)}
          </Text>,
        ]
        return (
          <Bloc titre={TITRE_RR} niveau="section" note={NOTE_RR}>
            {tailleAccessibilite(env.dynamicTypeSize) ? (
              <VStack key="total" alignment="leading" spacing={ECARTS_RR_HEURES.pile} accessibilityHidden>
                {morceaux}
              </VStack>
            ) : (
              <HStack key="total" alignment="firstTextBaseline" spacing={ECARTS_RR_HEURES.rangee} accessibilityHidden>
                {morceaux}
              </HStack>
            )}
            <BarresDeRR key="barres" barres={rr.barres} phrase={rr.phrase} />
            {moyennes !== null ? <LigneMorceaux key="moyennes" morceaux={moyennes} c={c} couleur={c.texteDoux} masquee issue /> : null}
            {rembourses !== null ? (
              <Text key="rembourses" {...TYPO.note} foregroundStyle={c.texteDoux} accessibilityHidden>
                {rembourses}
              </Text>
            ) : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Une colonne de Quand tu joues le mieux : étiquette, deux lignes, note ; un seul élément VoiceOver (`dit`). */
function ColonneDHeures({ colonne, c }: { colonne: ColonneHeures; c: Palette }) {
  return (
    <VStack
      alignment="leading"
      spacing={ECARTS_RR_HEURES.lignes}
      frame={{ maxWidth: "infinity", alignment: "topLeading" }}
      accessibilityElement
      accessibilityLabel={colonne.dit}
    >
      <Etiquette texte={colonne.etiquette} c={c} enTete={false} />
      {colonne.lignes.map((l, i) => (
        <LigneMorceaux key={i} morceaux={[`${l.libelle}${NBSP}: `, { valeur: l.valeur.texte, evaluation: l.valeur.evaluation }]} c={c} couleur={c.texte} />
      ))}
      {colonne.note !== null ? (
        <Text {...TYPO.note} foregroundStyle={colonne.evaluationNote === null ? c.texteDiscret : couleurEvaluation(c, colonne.evaluationNote)}>
          {colonne.note}
        </Text>
      ) : null}
    </VStack>
  )
}

/**
 * Bloc « Quand tu joues le mieux » (maquette ; EXPERIENCE.md, Trop peu de parties ; Définitions des métriques), coin bas, sur le
 * périmètre : l'étiquette « Score de combat selon l'heure », une Barre par tranche (barreTranche) ; un trait `bordure` ; les
 * colonnes « Dans une session » et « Après une défaite », côte à côte à 10, l'une sous l'autre aux tailles d'accessibilité ; la
 * note NOTE_TIRET_HEURES dès qu'un « — » paraît. Aucune tranche : HEURES_SANS_PARTIE.
 */
function BlocHeures({ q }: { q: QuandTuJoues }) {
  if (q.tranches.length === 0) return <Bloc titre={TITRE_HEURES} niveau="section" coin="bas" vide={HEURES_SANS_PARTIE} />
  const echelle = echelleTranches(q.tranches)
  const barres = q.tranches.map((t) => barreTranche(t, echelle))
  const colonnes = [colonneSession(q), colonneApres(q)]
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const vues = colonnes.map((col, i) => <ColonneDHeures key={i} colonne={col} c={c} />)
        return (
          <Bloc titre={TITRE_HEURES} niveau="section" coin="bas" note={tiretDansHeures(q) ? NOTE_TIRET_HEURES : undefined}>
            <Etiquette key="etiquette" texte={ETIQUETTE_HEURE} c={c} />
            <Barres key="tranches" barres={barres} />
            <Rectangle key="trait" fill={c.bordure} frame={{ maxWidth: "infinity", height: ECARTS_RR_HEURES.trait }} accessibilityHidden />
            {tailleAccessibilite(env.dynamicTypeSize) ? (
              <VStack key="colonnes" alignment="leading" spacing={ECARTS_RR_HEURES.colonnes} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {vues}
              </VStack>
            ) : (
              <HStack key="colonnes" alignment="top" spacing={ECARTS_RR_HEURES.colonnes} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {vues}
              </HStack>
            )}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Les blocs de ton rang et de tes RR (entrée 23), quel que soit le périmètre : l'Escalier sur ton rang gardé (rang.json, null
 * sans lui) et tout l'historique, les Barres de RR sur rr.json ; calculés une fois avec la sélection (`agregat`), un calcul qui
 * lève retirant son bloc.
 */
function blocsRangEtRr({ donnees, perimetre }: Pick<PropsEmplacement, "donnees" | "perimetre">): VirtualNode[] {
  const rang = donnees.rang ?? null
  const blocs: VirtualNode[] = []
  const escalier = perimetre.agregat("evolution:escalier", () => attraper("escalier", () => calculerEscalier(rang, donnees.parties, donnees.ressources?.saisons ?? null)))
  if (escalier) blocs.push(<BlocRang key="rang" escalier={escalier} sansRang={rang === null} paliers={donnees.ressources?.paliers ?? {}} />)
  const rr = perimetre.agregat("evolution:rr", () => attraper("barres de RR", () => calculerBarresRr(donnees.parties, donnees.rr ?? [])))
  if (rr) blocs.push(<BlocRr key="rr" rr={rr} />)
  return blocs
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/**
 * Évolution dans son emplacement (PropsEmplacement de app.tsx) : la stat choisie, seul état (Score de combat, ou la stat
 * d'arrivée, lue au montage : l'emplacement est remonté à chaque ouverture) ; la période et le mode, ceux du périmètre commun.
 * Une pile à 14 : Sélecteur segmenté de la période posé sur la page, qui règle le périmètre commun (la Ligne d'état le suit,
 * et le Sélecteur suit son Réglage) ; Puces des neuf stats ; puis, sur la sélection du périmètre : le Bloc de la Courbe ; ton
 * rang acte par acte et tes RR ; Quand tu joues le mieux, la grille des Mini-courbes et le Bloc des Tendances, sauf dans une
 * période sans partie, où le Bloc de la Courbe dit sa phrase, suivi du rang et des RR. Chaque bloc calculé une fois par
 * périmètre et par données (`agregat`), un calcul qui lève retirant son bloc ; sans sélection, le Sélecteur et les Puces seuls.
 * Ni lecture, ni requête, ni écriture.
 */
export function Evolution({ donnees, perimetre, arrivee }: PropsEmplacement) {
  const [cle, setCle] = useState<CleEvolution>(() => statDArrivee(arrivee))
  const e = statEvolution(cle)
  const { periode, mode } = perimetre.perimetre
  const sel = perimetre.selection
  const blocs: VirtualNode[] = [
    <SelecteurSegmente key="periode" segments={SEGMENTS_PERIODE} choisi={periode} onChoix={perimetre.choisirPeriode} surPage />,
    <PucesDeChoix key="stat" nom={NOM_PUCES} puces={PUCES} choisie={cle} onChoix={(k) => setCle(k)} />,
  ]
  if (sel !== null) {
    if (sel.parties.length === 0) {
      blocs.push(<BlocCourbe key="courbe" e={e} periode={periode} courbe={null} vide={SANS_PARTIE[mode]} />)
      blocs.push(...blocsRangEtRr({ donnees, perimetre }))
    } else {
      const courbe = perimetre.agregat(`evolution:courbe:${e.cle}`, (s) => attraper("courbe", () => calculerCourbe(s, e)))
      if (courbe) {
        const vide = aDesPoints(courbe) ? null : e.cle === "note" ? SANS_NOTE : SANS_POINT
        blocs.push(<BlocCourbe key="courbe" e={e} periode={periode} courbe={courbe} vide={vide} />)
      }
      blocs.push(...blocsRangEtRr({ donnees, perimetre }))
      const heures = perimetre.agregat("evolution:heures", (s) => attraper("quand tu joues le mieux", () => calculerHeures(s, donnees.parties)))
      if (heures) blocs.push(<BlocHeures key="heures" q={heures} />)
      // Ticket 4.41 : le sens de chaque Mini-courbe par sensVariation, celui même de sa Courbe, sans calculer la Courbe.
      const minis = perimetre.agregat("evolution:minis", (s) => attraper("mini-courbes", () => miniCourbesEvolution(s).map((mini): MiniEtSens => ({
        mini, sens: sensVariation(s, statEvolution(mini.cle as CleEvolution).stat),
      }))))
      if (minis && minis.length > 0) blocs.push(<MiniCourbes key="minis" minis={minis} periode={periode} />)
      const lignes = perimetre.agregat("evolution:tendances", (s) => attraper("tendances", () => calculerTendances(s, donnees.parties)))
      if (lignes) blocs.push(<BlocTendances key="tendances" lignes={lignes} parties={sel.parties.length} />)
      // Entrée 7 de epic-stats-analyses : Dans quelles conditions tu gagnes (analyses 12 à 14), après les Tendances.
      const conditions = perimetre.agregat("evolution:conditions", (s) => attraper("conditions de victoire", () => conditionsDeVictoire(s)))
      if (conditions) blocs.push(<BlocConditions key="conditions" c={conditions} />)
    }
  }
  return (
    <PileDeBlocs>
      {blocs}
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Évolution dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_EVOLUTION: Emplacement = Evolution
