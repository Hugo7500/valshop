import {
  BarChart, Button, Canvas, Chart, Circle, EmptyView, EnvironmentValuesReader, FlowLayout, Grid, GridRow, HStack, Image, LineCategoryChart,
  LineChart, PathShape, RangeAreaChart, Rectangle, RoundedRectangle, RuleLineForValueChart, ScrollView, Spacer, Stepper, Text, VStack, ZStack,
  type CanvasRenderingContext, type CanvasSize, type Color, type Path2D, type ShapeStyle, type Size, type StrokeStyle, type VirtualNode,
  type CommonViewProps, type DynamicTypeSize,
} from "scripting"
import { createElement, Fragment, useEffect, useRef, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ARRONDIS, ESPACES, TYPO, blocMesure, couleurs, creux, melange, enCapitales, policeCondensee, tailleAccessibilite, type Palette } from "./design"
import {
  AXE_LOBBYS, AXE_MAX, LIBELLES_MODE, LIBELLES_PERIODE, NOTE, PART_FAIBLE, PART_FORTE, STATS_EVOLUTION, TIRET, ecartEnClair, nomDuPalier,
  nombreEnClair, rrEnClair, valeurEnClair,
  type ActeRepere, type Affichage, type AxeProfil, type BandeLobbys, type BarreRr, type CleEvolution, type Evaluation,
  type MarcheEscalier, type Mention, type Mode, type Periode, type PointCarte, type PointCourbe, type PointNote,
} from "./metriques"
import type { Cote } from "./reduction"
import type { SectionPaliers } from "./ressources"

// Module de dessin de l'onglet Stats (entrées 13, 14, 15 et 37 de epic-stats-tableau-de-bord ; DESIGN.md, Shapes et
// Components ; EXPERIENCE.md, Component Patterns et points 3 à 7 et 13 de « À vérifier au spike ») : Bloc à coin coupé,
// Barres biseautées, Barre paire, Barres empilées et Jauge de RR (entrée 13) ; Radar, Escalier du rang et Plan de carte
// (entrée 14) ; Courbe de la note, Courbe à deux séries, Barres de RR, Histogramme et Légende (entrée 15) ; Tableau,
// Constat, Case colorée, Sélecteur segmenté et Puces de choix (entrée 37) ; Chiffre coloré, sa grille et Lignes détaillées
// (entrée 10 de epic-stats-analyses) ; Choix de manche du Détail (entrée 34, seul
// porteur du rôle titre de bloc hors d'un titre, qu'aucun écran ne pose lui-même). La Mini-courbe est celle de la Vue d'ensemble
// (entrée 38). Briques partagées, que les sous-onglets reprennent sans les refaire : elles ne dessinent que leurs props
// (valeurs déjà écrites par les formats de metriques.ts, parts de 0 à 1 pour le dessin ; ce que rendent profilDeJeu,
// escalierDuRang, planDeCarte, courbeNote, courbe, barresRr, histogrammeDesMorts, parCarte, agentsJoues…), sans lecture
// ni requête. Aucune ne garde de valeur ni de choix : le Sélecteur segmenté et les Puces de choix montrent le choix reçu
// et rendent l'appui à l'écran (`onChoix`), qui tient l'état (le périmètre commun de l'entrée 17, un côté, un agent) ;
// seules les Puces gardent leur position de défilement. De metriques.ts, module pur, elles ne prennent que des
// constantes et des formats. Couleurs du réglage « Augmenter le contraste » en cours (`couleurs`) ; textes aux rôles
// de design.tsx, qui suivent la taille de texte d'iOS, sans limite de lignes ni hauteur fixe, sauf les noms du Radar
// et les axes, fixes. Coins coupés et biseaux par
// `PathShape`, dont `draw` reçoit la taille de la vue : en `background` pour les coins, en `mask` pour les biseaux
// (DESIGN.md, Shapes) ; Radar et points du Plan en `PathShape`, Escalier en `Canvas` ; courbes et Barres de RR en `Chart`
// natif (point 6), Histogramme en colonnes ; Tableau en `Grid`. Rendu jugé à l'usage sur l'iPhone ; replis prêts dans
// `REPLIS`. Aucun écran ne l'importe encore.

















export const REPLIS = {
  anglesDroits: false, radarEnBarres: false, escalierEnListe: false, planEnBarres: false, courbesEnCanvas: false, mentionsEnLegende: false,
  pucesEnBoutons: false,
}

/** Côté du coin coupé d'un Bloc (DESIGN.md, bloc : `coin-coupe`). */
const COIN_COUPE = 18
/** Barre (DESIGN.md, barre) : hauteur de la piste et biseau de son bout droit. */
const BARRE = { hauteur: 10, biseau: 6 } as const
/** Barre paire (DESIGN.md, barre-paire) : toi en barre pleine ; la référence, fine et en creux, et son contour. */
const BARRE_PAIRE = { toi: 8, reference: 4, contour: 1 } as const
/** Hauteur d'une Barre empilée (DESIGN.md, barre-empilee). */
const HAUTEUR_EMPILEE = 12
/** Jauge de RR (DESIGN.md, jauge-rr) : hauteur de la piste et biseau de son bout droit. */
const JAUGE = { hauteur: 8, biseau: 6 } as const
/** Écarts de la maquette, que DESIGN.md ne donne pas : entre les colonnes d'une Barre ; sous la piste de la Jauge. */
const ECART_BARRE = 8
const ECART_JAUGE = 6
/** Espace insécable : garde « toi » et « lobbys » sur la ligne de leur valeur. */
const NBSP = "\u00a0"

/** Couleur d'une évaluation (DESIGN.md, Colors, lecture « Évaluation ») : `fort` en bleu, `faible` en orange, `neutre` en texte-doux. */
export function couleurEvaluation(c: Palette, e: Evaluation): Color {
  return e === "fort" ? c.bleu : e === "faible" ? c.orange : c.texteDoux
}


export function couleurIssue(c: Palette, e: Evaluation): Color {
  return e === "fort" ? c.vert : e === "faible" ? c.rougeClair : c.texteDoux
}

/** Une part à dessiner, bornée à 0…1 ; absente ou non finie : rien à dessiner (valeur « — »). */
function borner(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null
}

/**
 * Rectangle aux coins ronds de rayon `r`, en polygone (cinq points par coin) : x ne dépend que de la largeur, y que de la
 * hauteur, si bien que la page web en fait un `clip-path` de CSS, comme du biseau.
 */
function contourRond(p: Path2D, s: Size, r: number) {
  const w = s.width, h = s.height, k = Math.min(r, h / 2)
  const coins: [number, number, number][] = [[w - k, k, -90], [w - k, h - k, 0], [k, h - k, 90], [k, k, 180]]
  let premier = true
  for (const [cx, cy, a0] of coins) {
    for (let i = 0; i <= 4; i++) {
      const a = (a0 + i * 22.5) * Math.PI / 180
      const pt = { x: cx + k * Math.cos(a), y: cy + k * Math.sin(a) }
      if (premier) { p.move(pt); premier = false } else p.addLine(pt)
    }
  }
  p.closeSubpath()
}

/**
 * Piste d'une barre : creux `fond` de `hauteur`, sur toute la largeur donnée, rempli de `couleur` depuis la gauche
 * sur sa part (rien à 0 ni sans part) ; avec `biseau`, bout droit biseauté par un masque, remplissage compris, sauf
 * repli `anglesDroits`. Masquée à VoiceOver : la valeur est écrite à côté.
 */
function Piste({ c, hauteur, part, couleur, biseau }: {
  c: Palette; hauteur: number; part: number | null; couleur: Color; biseau?: number
}) {
  const f = part, b = biseau

  const masque = REPLIS.anglesDroits ? undefined : <PathShape fill="black" draw={(p, s) => contourRond(p, s, hauteur / 2)} />
  return (
    <ZStack frame={{ height: hauteur }} mask={masque} accessibilityHidden>
      <Rectangle fill={c.fond} />
      {f !== null && f > 0 ? (
        <PathShape fill={couleur} draw={(p, s) => p.addRect({ x: 0, y: 0, width: s.width * f, height: s.height })} />
      ) : null}
    </ZStack>
  )
}

/** Coin d'un Bloc (DESIGN.md, Shapes) : coupé en bas à droite, en haut à gauche, ou aucun. */
export type Coin = "bas" | "haut" | "aucun"

/** Contenu d'un Bloc : des vues, en listes imbriquées au besoin (ce que donnent `map` et les conditions), jamais du texte nu. */
export type Contenu = VirtualNode | boolean | null | undefined | Contenu[]

/** Le contenu à plat : une pile ne prend qu'un niveau de liste parmi ses enfants. */
function aplatir(x: Contenu): (VirtualNode | boolean | null | undefined)[] {
  return Array.isArray(x) ? x.flatMap(aplatir) : [x]
}

/** Les lettres en exposant des ordinaux (EXPERIENCE.md, Formats, Ordinal) et leurs lettres simples, écrites par leur code. */
const LETTRES_EXPOSANT: Readonly<Record<string, string>> = { "\u1d49": "e", "\u02b3": "r", "\u02e2": "s" }







export function titreAffiche(titre: string): string {
  return titre.replace(/[\u1d49\u02b3\u02e2]/g, (lettre: string) => LETTRES_EXPOSANT[lettre])
}

/**
 * Titre de bloc (entrée 42 ; DESIGN.md, Typography, bloc) : en titre de section (`niveau` « section ») ou de bloc, condensé, en
 * `texte`, toujours en capitales et dans la graisse de son rôle, quelle que soit sa longueur (la maquette ; la règle des trois
 * mots reste aux autres libellés), ses ordinaux en lettres simples (titreAffiche), annoncé comme en-tête ; à la ligne entre deux
 * mots, sans limite de lignes. `dit` : ce que lit VoiceOver s'il diffère de l'écrit, le titre devenant un seul élément ;
 * `auDessus` : une marge au-dessus de lui. Porté par Bloc ; un titre posé hors d'un Bloc (Vue d'ensemble) le prend ici : aucun
 * écran ne décide de sa casse. Une vue, pas un composant : l'arbre est celui d'un `Text`.
 */
export function titreDeBloc(c: Palette, titre: string, { niveau = "bloc", dit, auDessus }: {
  niveau?: "section" | "bloc"; dit?: string; auDessus?: number
} = {}): VirtualNode {
  return (
    <Text
      {...policeCondensee(niveau === "section" ? TYPO.titreSection : TYPO.titreBloc)}
      foregroundStyle={c.texte}
      {...(auDessus !== undefined ? { padding: { top: auDessus } } : {})}
      {...(dit !== undefined ? { accessibilityElement: true, accessibilityLabel: dit } : {})}
      accessibilityAddTraits="isHeader"
    >
      {titreAffiche(titre)}
    </Text>
  )
}

/**
 * Bloc (DESIGN.md, bloc ; EXPERIENCE.md, Component Patterns) : un sujet, sur `surface`, sans rayon, toute la largeur ;
 * marge de 16 (`serre` : 14, pour Seul ou en duo, Profil de jeu et Attaque · défense de la Vue d'ensemble), 10 entre
 * ses éléments ; jamais de hauteur fixe. `coin` : coin bas ou coin haut coupé de 18 en diagonale par un `PathShape`
 * en fond, dont `draw` reçoit la taille du bloc, si bien que la coupe suit sa hauteur ; sans coin par défaut et au
 * repli `anglesDroits`. `titre` en tête, en titre de section (`niveau` « section ») ou de bloc, toujours en capitales
 * (titreDeBloc, entrée 42), dit `titreDit` s'il est donné ; sans titre, l'écran pose ce qui coiffe le bloc (nom d'une
 * carte, d'un agent, note Valorant), jamais un titre de bloc. `vide` (sans données) : sa phrase, en corps `texte-doux`, à
 * la place du contenu, titre et note gardés. `note` en bas, en note `texte-discret`. Aucune action : sur la Vue d'ensemble,
 * l'appui qui ouvre le sous-onglet du bloc est posé autour de lui (zoneDAppui, entrée 32).
 */
export function Bloc({ titre, titreDit, niveau = "bloc", coin = "aucun", serre = false, vide, note, children }: {
  titre?: string; titreDit?: string; niveau?: "section" | "bloc"; coin?: Coin; serre?: boolean; vide?: string | null; note?: string
  children?: Contenu
}) {
  blocMesure(false) // mesure 4.49 : un Bloc rendu
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        blocMesure(true) // mesure 4.49 : un Bloc lu (pendant le rendu, ou après, par Scripting)
        const c = couleurs(env.colorSchemeContrast)

        const fond = { style: c.surface, shape: { type: "rect" as const, cornerRadius: ARRONDIS.bloc } }
        return (
          <VStack
            alignment="leading"
            spacing={ESPACES.dansBloc}
            padding={serre ? ESPACES.blocSerre : ESPACES.bloc}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            background={fond}
          >
            {titre !== undefined ? titreDeBloc(c, titre, { niveau, dit: titreDit }) : null}
            {typeof vide === "string" ? (
              <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
                {vide}
              </Text>
            ) : aplatir(children)}
            {note !== undefined ? (
              <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
                {note}
              </Text>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── zone d'appui (entrée 32) ───────────────────────────

/**
 * Une ouverture vers un sous-onglet (entrée 32, Vue d'ensemble) : ce que VoiceOver dit après la phrase de sa cible (« Ouvre
 * Évolution. », EXPERIENCE.md, Accessibility Floor) et l'appui.
 */
export type Ouverture = { dit: string; action: () => void }

/** La case d'une zone d'appui : un cadre de pile (dimensions fixes, ou bornes min et max). */
export type CadreAppui = NonNullable<CommonViewProps["frame"]>

/** La case par défaut d'une zone d'appui : toute la largeur, au moins une cible de haut (DESIGN.md, Layout & Spacing), à gauche. */
export const CASE_APPUI: CadreAppui = { maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" }

/**
 * Zone d'appui (entrée 32 ; DESIGN.md, Components : contrôle maison en `Button` plain ; Layout & Spacing : cible de 44 au moins,
 * seule la zone d'appui grandit) : un bouton plain autour de `contenu`, dans une case `contentShape` rect (`cadre` : par défaut
 * toute la largeur et au moins 44 de haut), si bien que tout son rectangle répond, coin coupé d'un Bloc compris. L'allure du
 * contenu ne change pas ; le retour d'appui est celui du style plain, comme pour tous les contrôles maison ; rien de dessiné,
 * aucune animation. VoiceOver : un seul élément, le bouton, qui lit `voix`, puis l'indice ; `entete` : il garde le trait
 * d'en-tête du titre qu'il recouvre (un Bloc). `cle` : sa clé dans une liste. Une vue, pas un composant : l'arbre est celui du
 * bouton.
 */
export function zoneDAppui(
  { action, voix, indice, entete = false, cadre = CASE_APPUI, cle }: {
    action: () => void; voix: string; indice?: string; entete?: boolean; cadre?: CadreAppui; cle?: string
  },
  contenu: VirtualNode,
): VirtualNode {
  return (
    <Button
      key={cle}
      buttonStyle="plain"
      action={action}
      accessibilityLabel={voix}
      accessibilityHint={indice}
      accessibilityAddTraits={entete ? "isHeader" : undefined}
    >
      <VStack alignment="leading" spacing={0} contentShape="rect" frame={cadre}>
        {contenu}
      </VStack>
    </Button>
  )
}






export type Barre = { libelle: string; valeur: string; part: number | null; evaluation: Evaluation; voix: string }

/**
 * Barres (DESIGN.md, barre et Layout & Spacing ; EXPERIENCE.md, Component Patterns) : une ligne par valeur, dans
 * l'ordre reçu, en trois colonnes d'une `Grid` : libellé en petit `texte-doux`, à la largeur du plus long de la liste ;
 * piste souple, creux `fond` de 10, remplie de la couleur d'évaluation sur sa part, bout biseauté de 6 ; valeur à
 * droite, en petit gras `texte`, chiffres à chasse fixe ; 8 entre les colonnes, 10 entre les lignes. Dès la première
 * taille d'accessibilité, chaque libellé au-dessus de sa piste. Un élément VoiceOver par barre, qui lit sa `voix` : la
 * cellule du libellé, piste et valeur masquées (une `GridRow` ne prend aucun modificateur) ; aux tailles
 * d'accessibilité, la barre entière.
 */
export function Barres({ barres }: { barres: Barre[] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const piste = (b: Barre) => (
          <Piste c={c} hauteur={BARRE.hauteur} part={borner(b.part)} couleur={couleurEvaluation(c, b.evaluation)} biseau={BARRE.biseau} />
        )
        if (tailleAccessibilite(env.dynamicTypeSize)) {
          return (
            <VStack alignment="leading" spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {barres.map((b, i) => (
                <VStack key={i} alignment="leading" spacing={ESPACES.segments} accessibilityElement accessibilityLabel={b.voix}>
                  <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
                    {b.libelle}
                  </Text>
                  <HStack spacing={ECART_BARRE}>
                    {piste(b)}
                    <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte}>
                      {b.valeur}
                    </Text>
                  </HStack>
                </VStack>
              ))}
            </VStack>
          )
        }
        return (
          <Grid alignment="leading" horizontalSpacing={ECART_BARRE} verticalSpacing={ESPACES.dansBloc}>
            {barres.map((b, i) => (
              <GridRow key={i} alignment="center">
                <Text {...TYPO.petit} foregroundStyle={c.texteDoux} accessibilityElement accessibilityLabel={b.voix}>
                  {b.libelle}
                </Text>
                {piste(b)}
                <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte} gridColumnAlignment="trailing" accessibilityHidden>
                  {b.valeur}
                </Text>
              </GridRow>
            ))}
          </Grid>
        )
      }}
    </EnvironmentValuesReader>
  )
}


export type ValeurPaire = { valeur: string; part: number | null }

/**
 * Piste de la référence d'une Barre paire : creux `fond` de 4, la référence en creux sur sa part, contour `bleu` de 1
 * tracé à l'intérieur de la piste ; sans biseau. Masquée à VoiceOver.
 */
function PisteCreuse({ c, part }: { c: Palette; part: number | null }) {
  const f = part, trait = BARRE_PAIRE.contour
  return (
    <ZStack frame={{ height: BARRE_PAIRE.reference }} accessibilityHidden>
      <Rectangle fill={c.fond} />
      {f !== null && f > 0 ? (
        <PathShape
          stroke={{ shapeStyle: c.bleu, strokeStyle: { lineWidth: trait } }}
          draw={(p, s) => p.addRect({
            x: trait / 2, y: trait / 2, width: Math.max(0, s.width * f - trait), height: Math.max(0, s.height - trait),
          })}
        />
      ) : null}
    </ZStack>
  )
}










export function BarrePaire({ libelle, toi, reference, voix }: {
  libelle: string; toi: ValeurPaire; reference: (ValeurPaire & { nom: string }) | null; voix: string
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const etiquette = (
          <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
            {libelle}
          </Text>
        )
        // Police redite sur le morceau en gras : rien n'assure qu'un morceau hérite de celle du texte.
        const valeurs = (
          <Text
            styledText={{
              font: TYPO.petit.font,
              fontWeight: TYPO.petit.fontWeight,
              foregroundColor: c.texteDiscret,
              monospacedDigit: true,
              content: [
                "toi" + NBSP,
                { content: toi.valeur, font: TYPO.petitFort.font, fontWeight: TYPO.petitFort.fontWeight, foregroundColor: c.texte, monospacedDigit: true },
                ...(reference ? [` · ${reference.nom}${NBSP}${reference.valeur}`] : []),
              ],
            }}
          />
        )
        return (
          <VStack
            alignment="leading"
            spacing={ESPACES.segments}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            accessibilityElement
            accessibilityLabel={voix}
          >
            {tailleAccessibilite(env.dynamicTypeSize) ? (
              <VStack alignment="leading" spacing={ESPACES.segments}>
                {etiquette}
                {valeurs}
              </VStack>
            ) : (
              <HStack alignment="firstTextBaseline" spacing={ECART_BARRE}>
                {etiquette}
                <Spacer />
                {valeurs}
              </HStack>
            )}
            <Piste c={c} hauteur={BARRE_PAIRE.toi} part={borner(toi.part)} couleur={c.orange} />
            {reference ? <PisteCreuse c={c} part={borner(reference.part)} /> : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Les trois parts d'une Barre empilée, ramenées à leur somme : tête, corps, jambes. */
export type Zones = { tete: number; corps: number; jambes: number }






export type BarreEmpilee = { libelle: string; valeur: string; parts: Zones | null; legende: string; voix: string }

/**
 * Piste d'une Barre empilée : creux `fond` de 12, segments qui font 100 % dans l'ordre tête `bleu`, corps
 * `texte-doux`, jambes `orange`, chacun à sa part de la somme des trois ; ni texte ni biseau ; somme nulle : vide.
 * Masquée à VoiceOver.
 */
function PisteEmpilee({ c, parts }: { c: Palette; parts: Zones | null }) {
  const zones: [number, Color][] = parts
    ? [[parts.tete, c.bleu], [parts.corps, c.texteDoux], [parts.jambes, c.orange]]
    : []
  const tailles = zones.map(([x]) => (Number.isFinite(x) && x > 0 ? x : 0))
  const somme = tailles.reduce((a, x) => a + x, 0)
  const segments: VirtualNode[] = []
  let debut = 0
  for (let i = 0; i < zones.length && somme > 0; i++) {
    const x0 = debut / somme, largeur = tailles[i] / somme
    debut += tailles[i]
    if (largeur > 0) {
      segments.push(
        <PathShape key={i} fill={zones[i][1]} draw={(p, s) => p.addRect({ x: s.width * x0, y: 0, width: s.width * largeur, height: s.height })} />
      )
    }
  }
  return (
    <ZStack frame={{ height: HAUTEUR_EMPILEE }} accessibilityHidden>
      <Rectangle fill={c.fond} />
      {segments}
    </ZStack>
  )
}

/**
 * Barres empilées (DESIGN.md, barre-empilee ; EXPERIENCE.md, Component Patterns) : une ligne par arme, dans l'ordre
 * reçu, en trois colonnes d'une `Grid` comme les Barres (libellé ; piste de 12 aux segments tête, corps, jambes ;
 * valeur à droite) ; sous la piste, à 4, la légende en petit `texte-doux` ; 10 entre deux barres. Dès la première
 * taille d'accessibilité, libellé au-dessus de la piste. Un élément VoiceOver par barre, qui lit sa `voix`, comme les
 * Barres.
 */
export function BarresEmpilees({ barres }: { barres: BarreEmpilee[] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (tailleAccessibilite(env.dynamicTypeSize)) {
          return (
            <VStack alignment="leading" spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {barres.map((b, i) => (
                <VStack key={i} alignment="leading" spacing={ESPACES.segments} accessibilityElement accessibilityLabel={b.voix}>
                  <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
                    {b.libelle}
                  </Text>
                  <HStack spacing={ECART_BARRE}>
                    <PisteEmpilee c={c} parts={b.parts} />
                    <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte}>
                      {b.valeur}
                    </Text>
                  </HStack>
                  <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
                    {b.legende}
                  </Text>
                </VStack>
              ))}
            </VStack>
          )
        }
        // Deux rangées par barre, à 4 : la barre, puis sa légende sous la piste et la valeur ; la légende porte le
        // reste des 10 qui séparent deux barres. La cellule vide ne demande aucune place.
        return (
          <Grid alignment="leading" horizontalSpacing={ECART_BARRE} verticalSpacing={ESPACES.segments}>
            {barres.flatMap((b, i) => [
              <GridRow key={"barre" + i} alignment="center">
                <Text {...TYPO.petit} foregroundStyle={c.texteDoux} accessibilityElement accessibilityLabel={b.voix}>
                  {b.libelle}
                </Text>
                <PisteEmpilee c={c} parts={b.parts} />
                <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte} gridColumnAlignment="trailing" accessibilityHidden>
                  {b.valeur}
                </Text>
              </GridRow>,
              <GridRow key={"legende" + i}>
                <Rectangle fill="clear" gridCellUnsizedAxes="all" accessibilityHidden />
                <Text
                  {...TYPO.petit}
                  foregroundStyle={c.texteDoux}
                  gridCellColumns={2}
                  padding={i < barres.length - 1 ? { bottom: ESPACES.dansBloc - ESPACES.segments } : undefined}
                  accessibilityHidden
                >
                  {b.legende}
                </Text>
              </GridRow>,
            ])}
          </Grid>
        )
      }}
    </EnvironmentValuesReader>
  )
}








export function JaugeRR({ rr, valeur, derniere, voix }: {
  rr: number; valeur: string; derniere?: { texte: string; evaluation: Evaluation } | null; voix: string
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack
            alignment="leading"
            spacing={ECART_JAUGE}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            accessibilityElement
            accessibilityLabel={voix}
          >
            <Piste c={c} hauteur={JAUGE.hauteur} part={borner(rr / 100)} couleur={c.bleu} biseau={JAUGE.biseau} />
            <Text
              styledText={{
                font: TYPO.petit.font,
                fontWeight: TYPO.petit.fontWeight,
                foregroundColor: c.texteDoux,
                monospacedDigit: true,
                content: derniere
                  ? [
                    valeur + " · ",
                    {
                      content: derniere.texte, font: TYPO.petitFort.font, fontWeight: TYPO.petitFort.fontWeight,
                      foregroundColor: couleurIssue(c, derniere.evaluation), monospacedDigit: true,
                    },
                    " à la dernière partie",
                  ]
                  : [valeur],
              }}
            />
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ═══════════════════════ radar, escalier du rang, plan de carte (entrée 14) ═══════════════════════

/** Ce que VoiceOver lit d'une figure : sa phrase, en un seul élément ; sans phrase, rien (figure masquée). */
function voixFigure(phrase: string | null) {
  return phrase === null ? { accessibilityHidden: true } : { accessibilityElement: true, accessibilityLabel: phrase }
}

// ─────────────────────────── radar ───────────────────────────

/** Radar (DESIGN.md, radar ; maquette `Main`) : figure fixe, centre et rayon d'un axe à 100, en points. */
const RADAR = { largeur: 300, hauteur: 224, cx: 150, cy: 110, rayon: 90 } as const
/** Hexagones de la grille, en part du rayon : ceux de la maquette. */
const GRILLE_RADAR = [1 / 3, 2 / 3, 1]
/** Traits du Radar : grille et rayons, tes lobbys (tirets 4/3), contour de toi ; remplissage de toi à 22 %. */
const TRAITS_RADAR = { grille: 1, lobbys: 1.5, toi: 2 } as const
const TIRETS_LOBBYS = [4, 3]
const AIRE_TOI = 0.22
/**
 * Noms des axes (DESIGN.md, radar : `noms`, 12, fixes), posés comme dans la maquette : sur un côté, une case de 62 à 10
 * du sommet, 7 plus haut pour un sommet du haut, 5 plus bas pour un sommet du bas ; en haut et en bas, une case de 124
 * centrée, à 13 du sommet.
 */
const NOM_RADAR = { taille: 12, caseCote: 62, ecart: 10, dessusDessous: 13, coteHaut: 7, coteBas: 5 } as const
/** Écart entre la figure et ses valeurs (maquette). */
const ECART_RADAR = 6

/** L'angle de l'axe `i` sur `n`, en sens horaire depuis le haut. */
function angleAxe(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / n
}

/** Centre et rayon d'un axe à 100 dans la taille reçue (300 × 224 : centre 150, 110 ; rayon 90). */
function repereRadar(s: Size) {
  return {
    cx: s.width / 2,
    cy: (s.height * RADAR.cy) / RADAR.hauteur,
    r: RADAR.rayon * Math.min(s.width / RADAR.largeur, s.height / RADAR.hauteur),
  }
}

/** Un polygone du Radar à la taille reçue : un sommet par axe, à sa part du rayon (0 à 1), dans l'ordre des axes, fermé. */
function polygoneRadar(p: Path2D, s: Size, parts: readonly number[]) {
  const { cx, cy, r } = repereRadar(s)
  parts.forEach((f, i) => {
    const a = angleAxe(i, parts.length)
    const q = { x: cx + r * f * Math.cos(a), y: cy + r * f * Math.sin(a) }
    if (i === 0) p.move(q)
    else p.addLine(q)
  })
  if (parts.length > 0) p.closeSubpath()
}

/** La grille du Radar à `n` axes : ses trois hexagones, puis un rayon du centre à chaque sommet. */
function grilleRadar(p: Path2D, s: Size, n: number) {
  for (const f of GRILLE_RADAR) polygoneRadar(p, s, Array.from({ length: n }, () => f))
  const { cx, cy, r } = repereRadar(s)
  for (let i = 0; i < n; i++) {
    const a = angleAxe(i, n)
    p.move({ x: cx, y: cy })
    p.addLine({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
}

/** La case du nom de l'axe `i` sur `n` dans la figure fixe : son centre, sa largeur, l'alignement du nom. */
function caseNom(i: number, n: number): { x: number; y: number; largeur: number; alignement: "center" | "leading" | "trailing" } {
  const a = angleAxe(i, n), cos = Math.cos(a), sin = Math.sin(a)
  const x = RADAR.cx + RADAR.rayon * cos, y = RADAR.cy + RADAR.rayon * sin
  if (Math.abs(cos) < 1e-6) {
    return { x, y: y + (sin < 0 ? -NOM_RADAR.dessusDessous : NOM_RADAR.dessusDessous), largeur: 2 * NOM_RADAR.caseCote, alignement: "center" }
  }
  return {
    x: x + (cos > 0 ? 1 : -1) * (NOM_RADAR.ecart + NOM_RADAR.caseCote / 2),
    y: y + (sin < -1e-6 ? -NOM_RADAR.coteHaut : sin > 1e-6 ? NOM_RADAR.coteBas : 0),
    largeur: NOM_RADAR.caseCote,
    alignement: cos > 0 ? "leading" : "trailing",
  }
}
















export function Radar({ axes, texte, phrase, ouvertures }: {
  axes: readonly AxeProfil[]; texte: string; phrase: string; ouvertures?: readonly (Ouverture | null)[]
}) {
  /** L'ouverture de l'axe `i`, ou null. */
  const ouvertureDe = (i: number): Ouverture | null => (ouvertures ? ouvertures[i] ?? null : null)
  if (REPLIS.radarEnBarres) {
    return (
      <VStack alignment="leading" spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        {axes.map((a, i) => {
          const o = ouvertureDe(i)
          const barre = (
            <BarrePaire
              key={i}
              libelle={a.libelle}
              toi={{ valeur: a.texte, part: a.mesure ? a.valeur / AXE_MAX : null }}
              reference={{ nom: "lobbys", valeur: String(AXE_LOBBYS), part: AXE_LOBBYS / AXE_MAX }}
              voix={a.phrase}
            />
          )
          return o === null ? barre : zoneDAppui({ cle: String(i), action: o.action, voix: `${a.phrase} ${o.dit}` }, barre)
        })}
      </VStack>
    )
  }
  const n = axes.length
  const lobbys = axes.map(() => AXE_LOBBYS / AXE_MAX)
  // Sommet de chaque axe, en part du rayon ; sous l'effectif ou sans valeur finie : celui de tes lobbys.
  const parts = axes.map((a) => (a.mesure ? borner(a.valeur / AXE_MAX) : null) ?? AXE_LOBBYS / AXE_MAX)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack spacing={ECART_RADAR} frame={{ maxWidth: "infinity" }}>
            <ZStack frame={{ width: RADAR.largeur, height: RADAR.hauteur }}>
              <ZStack {...voixFigure(phrase)}>
                <PathShape stroke={{ shapeStyle: c.bordure, strokeStyle: { lineWidth: TRAITS_RADAR.grille } }} draw={(p, s) => grilleRadar(p, s, n)} />
                <PathShape
                  stroke={{ shapeStyle: c.bleu, strokeStyle: { lineWidth: TRAITS_RADAR.lobbys, dash: TIRETS_LOBBYS } }}
                  draw={(p, s) => polygoneRadar(p, s, lobbys)}
                />
                <PathShape fill={c.orange} opacity={AIRE_TOI} draw={(p, s) => polygoneRadar(p, s, parts)} />
                <PathShape stroke={{ shapeStyle: c.orange, strokeStyle: { lineWidth: TRAITS_RADAR.toi } }} draw={(p, s) => polygoneRadar(p, s, parts)} />
              </ZStack>
              {axes.map((a, i) => {
                const k = caseNom(i, n)
                const o = ouvertureDe(i)
                // La case porte le nom et son alignement, la pile autour la place : aucun ordre de modificateurs à supposer.
                const nom = (
                  <Text
                    font={NOM_RADAR.taille}
                    fontWeight="regular"
                    foregroundStyle={a.mesure ? c.texteDoux : c.texteDiscret}
                    frame={{ width: k.largeur, alignment: k.alignement }}
                    accessibilityElement
                    accessibilityLabel={a.phrase}
                  >
                    {a.libelle}
                  </Text>
                )
                // Entrée 32 : la case d'appui, de la largeur du nom et de 44 de haut, centrée sur lui (même point placé).
                return (
                  <VStack key={i} position={{ x: k.x, y: k.y }}>
                    {o === null ? nom : zoneDAppui({
                      action: o.action,
                      voix: `${a.phrase} ${o.dit}`,
                      cadre: { minWidth: k.largeur, maxWidth: k.largeur, minHeight: ESPACES.cible },
                    }, nom)}
                  </VStack>
                )
              })}
            </ZStack>
            <Text {...TYPO.petit} foregroundStyle={c.texteDoux} frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityHidden>
              {texte}
            </Text>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── escalier du rang ───────────────────────────

/**
 * Escalier du rang (DESIGN.md, escalier-rang ; maquette `Evolution`), en points : colonne des rangs à gauche (carré de 8,
 * nom à 12) ; bandes jusqu'à 2 du bord droit ; 6 au-dessus des rangées ; premier et dernier acte à 6 des bouts des bandes ;
 * rangée de 12,5 jusqu'à 9 rangées, la plage tenue dans 9 × 12,5 au-delà ; carré d'un acte ; marches ; bandes à 7 % ;
 * lignes des actes à 14 et 26 sous les rangées, 30 en tout.
 */
const ESCALIER = {
  gauche: 66, nom: 12, droite: 2, haut: 6, marge: 6, rangee: 12.5, rangees: 9, carre: 8, trait: 2.5, bande: 0.07,
  axe1: 14, axe2: 26, bas: 30,
} as const
/** Écart entre la figure et les actes repères (maquette). */
const ECART_ESCALIER = 8
/** Les rangs de l'axe, chacun par son premier et son dernier palier : Fer à Immortel (trois paliers), Radiant (un). */
const RANGS_ESCALIER: readonly (readonly [number, number])[] = [
  [3, 5], [6, 8], [9, 11], [12, 14], [15, 17], [18, 20], [21, 23], [24, 26], [27, 27],
]

/**
 * La géométrie d'un Escalier : plage des paliers des marches classées (null sans aucune), hauteur d'une rangée, hauteur
 * des rangées (une rangée vide sans marche classée) et du Canvas.
 */
function geometrieEscalier(marches: readonly MarcheEscalier[]) {
  let bas: number | null = null, haut: number | null = null
  for (const m of marches) {
    if (m.palier === null) continue
    bas = bas === null ? m.palier : Math.min(bas, m.palier)
    haut = haut === null ? m.palier : Math.max(haut, m.palier)
  }
  const rangees = bas === null || haut === null ? 0 : haut - bas + 1
  const rangee = rangees <= ESCALIER.rangees ? ESCALIER.rangee : (ESCALIER.rangee * ESCALIER.rangees) / rangees
  const trace = Math.max(1, rangees) * rangee
  return { bas, haut, rangee, trace, hauteur: ESCALIER.haut + trace + ESCALIER.bas }
}







const ACTES_SERRES = { ecart: 1, ecartSerre: 3, pasCarre: 11, jeuCarre: 3, carreMin: 4 } as const





function largeurActe(texte: string): number {
  let l = 0
  for (const ch of texte) l += ch === "1" ? 5.2 : ch === "E" ? 7 : ch === "A" ? 7.4 : 7.3
  return l
}

/**
 * Les actes nommés sur une ligne de l'axe, à leurs abscisses `xs` : tous, si le plus large libellé tient dans le pas avec
 * l'écart minimal ; sinon, parmi les `candidats`, en partant du plus récent (toujours nommé), chacun seulement s'il reste à
 * une espace du dernier écrit à sa droite.
 */
function actesNommes(xs: readonly number[], textes: readonly string[], candidats: readonly boolean[], pas: number): boolean[] {
  const largeurs = textes.map(largeurActe)
  if (Math.max(0, ...largeurs) + ACTES_SERRES.ecart <= pas) return textes.map(() => true)
  const nommes = textes.map(() => false)
  let gauche = Infinity
  for (let i = xs.length - 1; i >= 0; i--) {
    if (!candidats[i] || xs[i] + largeurs[i] / 2 + ACTES_SERRES.ecartSerre > gauche) continue
    nommes[i] = true
    gauche = xs[i] - largeurs[i] / 2
  }
  return nommes
}

/** La couleur d'un palier dans la section de catalog.json (`#rrggbb`), ou null : palier absent, ou sans couleur. */
function couleurDuPalier(paliers: SectionPaliers, palier: number): string | null {
  const p = paliers[String(palier)]
  return p && typeof p.couleur === "string" ? p.couleur : null
}

/**
 * Le dessin de l'Escalier dans son Canvas, à la largeur reçue : bandes des paliers de la plage, noms des rangs et leurs
 * carrés, marches, carrés des actes, puis chaque acte sur deux lignes sous les rangées.
 */
function dessinerEscalier(ctx: CanvasRenderingContext, s: CanvasSize, marches: readonly MarcheEscalier[], paliers: SectionPaliers, c: Palette) {
  const g = geometrieEscalier(marches)
  const finBandes = s.width - ESCALIER.droite
  const x0 = ESCALIER.gauche + ESCALIER.marge, x1 = finBandes - ESCALIER.marge
  const n = marches.length
  const xActe = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1))
  // Le pas entre deux actes ; serrés, des carrés plus petits, qui ne se touchent pas.
  const pas = n > 1 ? (x1 - x0) / (n - 1) : Infinity
  const carre = pas >= ACTES_SERRES.pasCarre ? ESCALIER.carre : Math.max(ACTES_SERRES.carreMin, pas - ACTES_SERRES.jeuCarre)
  if (g.bas !== null && g.haut !== null) {
    const bas = g.bas, haut = g.haut
    const yHaut = (palier: number) => ESCALIER.haut + (haut - palier) * g.rangee
    const yPalier = (palier: number) => yHaut(palier) + g.rangee / 2
    // Une bande par palier de la plage, à 7 % de sa couleur ; sans couleur, aucune.
    ctx.save()
    ctx.globalAlpha = ESCALIER.bande
    for (let t = haut; t >= bas; t--) {
      const couleur = couleurDuPalier(paliers, t)
      if (couleur === null) continue
      ctx.fillStyle = couleur
      ctx.fillRect(ESCALIER.gauche, yHaut(t), finBandes - ESCALIER.gauche, g.rangee)
    }
    ctx.restore()
    // Chaque rang de la plage, au milieu de ses rangées : carré à la couleur de son plus haut palier qui en a une, puis son nom.
    ctx.font = TYPO.axe.font
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    for (const [premier, dernier] of RANGS_ESCALIER) {
      const dessus = Math.min(haut, dernier), dessous = Math.max(bas, premier)
      if (dessus < dessous) continue
      const milieu = (yHaut(dessus) + yHaut(dessous) + g.rangee) / 2
      let couleur: string | null = null
      for (let t = dessus; t >= dessous && couleur === null; t--) couleur = couleurDuPalier(paliers, t)
      if (couleur !== null) {
        ctx.fillStyle = couleur
        ctx.fillRect(0, milieu - ESCALIER.carre / 2, ESCALIER.carre, ESCALIER.carre)
      }
      const nom = nomDuPalier(premier)
      if (nom === null) continue
      ctx.fillStyle = c.texteDoux
      ctx.fillText(nom.replace(/ \d$/, ""), ESCALIER.nom, milieu, ESCALIER.gauche - ESCALIER.nom - 4)
    }
    // Marches : d'un acte classé au suivant s'il l'est, à plat puis d'aplomb ; brisées à une marche vide.
    ctx.strokeStyle = c.bleu
    ctx.lineWidth = ESCALIER.trait
    ctx.beginPath()
    marches.forEach((m, i) => {
      if (m.palier === null) return
      const avant = i > 0 ? marches[i - 1].palier : null
      if (avant === null) {
        ctx.moveTo(xActe(i), yPalier(m.palier))
      } else {
        ctx.lineTo(xActe(i), yPalier(avant))
        ctx.lineTo(xActe(i), yPalier(m.palier))
      }
    })
    ctx.stroke()
    // Un carré par acte classé, celui de l'acte en cours en orange.
    marches.forEach((m, i) => {
      if (m.palier === null) return
      ctx.fillStyle = m.enCours ? c.orange : c.bleu
      ctx.fillRect(xActe(i) - carre / 2, yPalier(m.palier) - carre / 2, carre, carre)
    })
  }


  const ligne1 = ESCALIER.haut + g.trace + ESCALIER.axe1, ligne2 = ESCALIER.haut + g.trace + ESCALIER.axe2
  const xs = marches.map((_, i) => xActe(i))
  const episodes: string[] = [], actes: string[] = []
  for (const m of marches) {
    const coupe = m.libelle.indexOf(" ")
    episodes.push(coupe < 0 ? m.libelle : m.libelle.slice(0, coupe))
    actes.push(coupe < 0 ? "" : m.libelle.slice(coupe + 1))
  }
  const nommes1 = actesNommes(xs, episodes, episodes.map((e, i) => i === 0 || e !== episodes[i - 1]), pas)
  const nommes2 = actesNommes(xs, actes, actes.map((a) => a !== ""), pas)
  ctx.font = TYPO.axe.font
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = c.texteDiscret
  marches.forEach((_, i) => {
    if (nommes1[i]) ctx.fillText(episodes[i], xs[i], ligne1)
    if (nommes2[i] && actes[i] !== "") ctx.fillText(actes[i], xs[i], ligne2)
  })
}


function victoiresDites(m: MarcheEscalier): string | null {
  if (m.parties === null || m.victoires === null) return null
  if (m.parties === 0) return "aucune partie"
  return `${nombreEnClair(m.victoires, 0)} victoire${m.victoires > 1 ? "s" : ""} sur ${nombreEnClair(m.parties, 0)}`
}






function Reperes({ reperes, c, empiles }: { reperes: readonly ActeRepere[]; c: Palette; empiles: boolean }) {
  const colonnes = reperes.map((r, i) => (
    <VStack key={i} alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "topLeading" }}>
      <Text
        styledText={{
          font: TYPO.note.font,
          fontWeight: TYPO.note.fontWeight,
          foregroundColor: c.texteDoux,
          content: [
            { content: r.marche.rang ?? "Sans rang", font: TYPO.note.font, fontWeight: "bold", foregroundColor: r.marche.enCours ? c.orange : c.texte },
            ` · ${r.marche.libelle}`,
          ],
        }}
      />
      {r.victoires !== null ? (
        <Text {...TYPO.note} foregroundStyle={c.texteDoux}>
          {r.victoires}
        </Text>
      ) : null}
      {/* Ticket 4.52 : les dates de l'acte, de /v1/seasons (valorant-api). */}
      {r.dates != null ? (
        <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
          {r.dates}
        </Text>
      ) : null}
    </VStack>
  ))
  return empiles ? (
    <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityHidden>
      {colonnes}
    </VStack>
  ) : (
    <HStack alignment="top" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityHidden>
      {colonnes}
    </HStack>
  )
}















export function EscalierDuRang({ marches, reperes, phrase, paliers }: {
  marches: readonly MarcheEscalier[]; reperes: readonly ActeRepere[]; phrase: string | null; paliers: SectionPaliers
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const figure = REPLIS.escalierEnListe ? (
          <VStack alignment="leading" spacing={ESPACES.segments} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {marches.map((m, i) => {
              const rang = m.rang ?? "sans rang", victoires = victoiresDites(m)
              return (
                <Text
                  key={i}
                  {...TYPO.petit}
                  foregroundStyle={c.texteDoux}
                  accessibilityElement
                  accessibilityLabel={`${m.parle} : ${rang}${victoires === null ? "" : `, ${victoires}`}.`}
                >
                  {`${m.libelle} · ${rang}${victoires === null ? "" : ` · ${victoires}`}`}
                </Text>
              )
            })}
          </VStack>
        ) : (
          <Canvas
            opaque={false}
            frame={{ maxWidth: "infinity", height: geometrieEscalier(marches).hauteur }}
            draw={(ctx, s) => dessinerEscalier(ctx, s, marches, paliers, c)}
            {...voixFigure(phrase)}
          />
        )
        return (
          <VStack alignment="leading" spacing={ECART_ESCALIER} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {figure}
            {reperes.length > 0 ? <Reperes reperes={reperes} c={c} empiles={tailleAccessibilite(env.dynamicTypeSize)} /> : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── plan de carte ───────────────────────────

/** Plan de carte (DESIGN.md, plan-carte), en points : diamètre d'un kill, côté d'une mort et son trait, liseré ; opacité des points. */
const PLAN = { kill: 7, mort: 8, traitMort: 2, lisere: 1, opacite: 0.85 } as const

/** Les affichages des points d'un sens qu'on peut dessiner : ceux qui en ont un, fini. */
function places(points: readonly PointCarte[], sens: "kill" | "mort"): Affichage[] {
  const r: Affichage[] = []
  for (const p of points) {
    const a = p.affichage
    if (p.sens === sens && a !== null && Number.isFinite(a.u) && Number.isFinite(a.v)) r.push(a)
  }
  return r
}

/** Un disque de `rayon` sur chaque point, à la taille reçue (u × largeur, v × hauteur). */
function disques(p: Path2D, s: Size, points: readonly Affichage[], rayon: number) {
  for (const a of points) p.addEllipse({ x: a.u * s.width - rayon, y: a.v * s.height - rayon, width: 2 * rayon, height: 2 * rayon })
}

/** Une croix sur chaque point, à la taille reçue : deux diagonales de `demi` de part et d'autre, en x comme en y. */
function croix(p: Path2D, s: Size, points: readonly Affichage[], demi: number) {
  for (const a of points) {
    const x = a.u * s.width, y = a.v * s.height
    p.move({ x: x - demi, y: y - demi })
    p.addLine({ x: x + demi, y: y + demi })
    p.move({ x: x + demi, y: y - demi })
    p.addLine({ x: x - demi, y: y + demi })
  }
}

/**
 * Plan de carte (DESIGN.md, plan-carte ; EXPERIENCE.md, Component Patterns et State Patterns ; point 7 du spike) : les
 * points de planDeCarte (`points` ; `phrase`) sur l'image de la carte en cache, dont l'écran donne le chemin entier
 * (`image` ; null : les seuls points). Carré à la largeur reçue, sur `fond` ; l'image étirée au carré, teinte en
 * `zone-plan` (`renderingMode="template"`) ; chaque point à son affichage (u × largeur, v × hauteur) ; un point sans
 * affichage, ou d'affichage non fini, n'est pas dessiné. Tes kills en disques `bleu` de 7, tes morts en croix `orange`
 * de 8 au trait de 2, à 85 %, chacun sur un liseré `fond` de 1, tes morts au-dessus. Ni contours en `bordure` ni noms des
 * grandes zones : aucune position de zone n'est encore calculée. VoiceOver : la phrase du plan ; sans phrase, masqué.
 * Repli `planEnBarres` : rien (`EmptyView`) ; les barres par zone que l'écran pose dessous restent seules.
 */
export function PlanCarte({ points, image, phrase }: { points: readonly PointCarte[]; image: string | null; phrase: string | null }) {
  if (REPLIS.planEnBarres) return <EmptyView />
  const kills = places(points, "kill"), morts = places(points, "mort")
  const rayon = PLAN.kill / 2, demi = PLAN.mort / 2
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <ZStack frame={{ maxWidth: "infinity" }} aspectRatio={{ value: 1, contentMode: "fit" }} {...voixFigure(phrase)}>
            <Rectangle fill={c.fond} />
            {image !== null ? <Image filePath={image} resizable renderingMode="template" foregroundStyle={c.zonePlan} /> : null}
            {kills.length > 0 ? <PathShape fill={c.fond} draw={(p, s) => disques(p, s, kills, rayon + PLAN.lisere)} /> : null}
            {kills.length > 0 ? <PathShape fill={c.bleu} opacity={PLAN.opacite} draw={(p, s) => disques(p, s, kills, rayon)} /> : null}
            {morts.length > 0 ? (
              <PathShape
                stroke={{ shapeStyle: c.fond, strokeStyle: { lineWidth: PLAN.traitMort + 2 * PLAN.lisere } }}
                draw={(p, s) => croix(p, s, morts, demi + PLAN.lisere / Math.SQRT2)}
              />
            ) : null}
            {morts.length > 0 ? (
              <PathShape stroke={{ shapeStyle: c.orange, strokeStyle: { lineWidth: PLAN.traitMort } }} opacity={PLAN.opacite} draw={(p, s) => croix(p, s, morts, demi)} />
            ) : null}
          </ZStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ═══════════════════════ courbes, barres de RR, histogramme, légende (entrée 15) ═══════════════════════

/**
 * Ce que VoiceOver lit d'un graphique à marques : sa phrase, sur un conteneur qui garde ses marques, lues ensuite une à une
 * (Accessibility Floor : « Graphiques natifs : en plus, un libellé par marque ») ; sans phrase, rien (graphique masqué).
 */
function voixGraphique(phrase: string | null) {
  return phrase === null ? { accessibilityHidden: true } : { accessibilityElement: "contain" as const, accessibilityLabel: phrase }
}

/** Une valeur à dessiner : finie ; absente ou non finie, elle n'est pas dessinée. */
function fini(x: number | null | undefined): x is number {
  return typeof x === "number" && Number.isFinite(x)
}

// ─────────────────────────── géométrie commune des courbes ───────────────────────────

/** Courbe (DESIGN.md, courbe ; maquette `Evolution`), en points : hauteur ; traits de toi et de la référence ; marge au-dessus et au-dessous des valeurs, en part de leur écart. */
const COURBE = { hauteur: 112, toi: 2.5, reference: 1.5, marge: 0.12 } as const
/** Tirets de la référence (DESIGN.md, courbe : `reference-dash`). */
const TIRETS_REFERENCE = [4, 4]
/**
 * Courbe de la note (DESIGN.md, courbe-note ; maquette `Main`) : hauteur ; opacités de ton aire, de la bande des lobbys et de
 * ses bords ; trait des bords ; diagonale d'un losange, contour du mérite, liseré de la distinction (maquette), cadre du losange.
 */
const NOTE_GRAPHE = { hauteur: 132, aire: 0.16, bande: 0.12, bord: 0.6, traitBord: 1, losange: 12, contour: 2, lisere: 1.5, cadre: 16 } as const
/**
 * Limite d'onglet du trait de la Courbe de la note (entrée 20), celle du SVG de la maquette et de la Mini-courbe : angles vifs,
 * mais un pic aigu finit en biseau au lieu de pointer au-delà de sa partie (la limite par défaut d'iOS, 10, hérisse le trait).
 */
const ONGLETS_NOTE = 4
/** Point seul d'une série, qu'un trait ne montrerait pas : diamètre du disque ; trait du disque creux de la référence. */
const POINT_SEUL = { diametre: 6, trait: 1.5 } as const
/** Écart entre deux marques : un jour, sur une échelle de dates factices à pas égal (une marque par point, quel que soit son moment). */
const PAS_X = 86_400_000
/** Les séries des graphiques, nommées comme dans `chartForegroundStyleScale` et `chartLineStyleScale`. */
const SERIES = { toi: "Toi", lobbys: "Tes lobbys", aire: "Aire", bande: "Bande" } as const
/** Une mention dite par VoiceOver. */
const MENTION_DITE: Readonly<Record<Mention, string>> = { merite: "mérite", distinction: "distinction" }

/** L'abscisse de la marque `i` : une date factice, un jour après celle de la marque précédente. */
function xDe(i: number): Date {
  return new Date(i * PAS_X)
}

/** L'échelle des abscisses de `n` marques : du premier au dernier point, pour une courbe d'un bord à l'autre ; un seul point : au milieu. */
function domaineX(n: number): { from: Date; to: Date } {
  return n <= 1 ? { from: xDe(-1), to: xDe(1) } : { from: xDe(0), to: xDe(n - 1) }
}

/**
 * L'échelle des ordonnées : de la plus basse à la plus haute valeur dessinée, plus `marge` de leur écart de chaque côté ;
 * valeur unique : `marge` d'elle ; zéro : ±1 ; null sans valeur finie.
 */
function domaineY(valeurs: readonly number[], marge: number): { bas: number; haut: number } | null {
  let bas = Infinity, haut = -Infinity
  for (const v of valeurs) {
    if (!fini(v)) continue
    bas = Math.min(bas, v)
    haut = Math.max(haut, v)
  }
  if (bas > haut) return null
  const m = haut > bas ? (haut - bas) * marge : bas !== 0 ? Math.abs(bas) * marge : 1
  return { bas: bas - m, haut: haut + m }
}

/** Un losange de 12 de diagonale au centre de la taille reçue : sommets haut, droite, bas, gauche. */
function cheminLosange(p: Path2D, s: Size) {
  const cx = s.width / 2, cy = s.height / 2, d = NOTE_GRAPHE.losange / 2
  p.move({ x: cx, y: cy - d })
  p.addLine({ x: cx + d, y: cy })
  p.addLine({ x: cx, y: cy + d })
  p.addLine({ x: cx - d, y: cy })
  p.closeSubpath()
}

/**
 * Losange d'une mention (DESIGN.md, courbe-note ; Légende), de 12 dans un cadre de 16 : mérite creux, intérieur `surface` et
 * contour `texte` de 2 ; distinction pleine `or`, cernée de `fond` à 1,5 (maquette). Masqué à VoiceOver.
 */
function Losange({ mention, c }: { mention: Mention; c: Palette }) {
  const merite = mention === "merite"
  return (
    <ZStack frame={{ width: NOTE_GRAPHE.cadre, height: NOTE_GRAPHE.cadre }} accessibilityHidden>
      <PathShape fill={merite ? c.surface : c.or} draw={cheminLosange} />
      <PathShape
        stroke={{ shapeStyle: merite ? c.texte : c.fond, strokeStyle: { lineWidth: merite ? NOTE_GRAPHE.contour : NOTE_GRAPHE.lisere } }}
        draw={cheminLosange}
      />
    </ZStack>
  )
}

/** Le point seul d'une série : disque de 6, plein pour toi, creux (trait de 1,5) pour la référence. Masqué à VoiceOver. */
function PointSeul({ couleur, plein }: { couleur: Color; plein: boolean }) {
  const cadre = { width: POINT_SEUL.diametre, height: POINT_SEUL.diametre }
  return plein
    ? <Circle fill={couleur} frame={cadre} accessibilityHidden />
    : <Circle stroke={{ shapeStyle: couleur, strokeStyle: { lineWidth: POINT_SEUL.trait } }} frame={cadre} accessibilityHidden />
}

/** Le losange d'une mention dans un Canvas, centré en (`cx`, `cy`), comme `Losange`. */
function losangeCanvas(ctx: CanvasRenderingContext, cx: number, cy: number, m: Mention, c: Palette) {
  const d = NOTE_GRAPHE.losange / 2, merite = m === "merite"
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx, cy - d)
  ctx.lineTo(cx + d, cy)
  ctx.lineTo(cx, cy + d)
  ctx.lineTo(cx - d, cy)
  ctx.closePath()
  ctx.fillStyle = merite ? c.surface : c.or
  ctx.fill()
  ctx.strokeStyle = merite ? c.texte : c.fond
  ctx.lineWidth = merite ? NOTE_GRAPHE.contour : NOTE_GRAPHE.lisere
  ctx.lineJoin = "miter"
  ctx.stroke()
  ctx.restore()
}

/**
 * Ce que dessine une courbe en Canvas (repli `courbesEnCanvas`) : tes valeurs par marque (null : non dessinée), la série de
 * référence ou la ligne de ta période précédente, la bande des lobbys, ton aire, tes mentions (null : aucun losange), l'échelle.
 */
type TraceCourbe = {
  toi: readonly (number | null)[]
  reference: readonly (number | null)[] | null
  ligne: number | null
  bande: BandeLobbys | null
  aire: boolean
  mentions: readonly (Mention | null)[] | null
  domaine: { bas: number; haut: number }
}

/**
 * Une courbe dans son Canvas, à la taille reçue, avec la géométrie du `Chart` (marques à pas égal d'un bord à l'autre, un
 * seul point au milieu ; échelle reçue) : bande, ses bords et sa ligne médiane en tirets ; ligne de ta période précédente ;
 * série de référence en tirets ; ton aire ; ton trait ; tes losanges. Une série d'un seul point : son disque.
 */
function dessinerCourbe(ctx: CanvasRenderingContext, s: CanvasSize, t: TraceCourbe, c: Palette) {
  const n = t.toi.length, w = s.width, h = s.height
  const x = (i: number) => (n <= 1 ? w / 2 : (i * w) / (n - 1))
  const y = (v: number) => ((t.domaine.haut - v) / (t.domaine.haut - t.domaine.bas)) * h
  const points = (valeurs: readonly (number | null)[]) => {
    const r: { i: number; x: number; y: number }[] = []
    valeurs.forEach((v, i) => {
      if (fini(v)) r.push({ i, x: x(i), y: y(v) })
    })
    return r
  }
  const horizontale = (yy: number, couleur: Color, alpha: number, trait: number, tirets: number[]) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = couleur
    ctx.lineWidth = trait
    ctx.setLineDash(tirets)
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
    ctx.restore()
  }
  // Une série : son trait ; un seul point : son disque, plein ou creux, sauf sous un losange.
  const serie = (valeurs: readonly (number | null)[], couleur: Color, trait: number, tirets: number[], plein: boolean) => {
    const pts = points(valeurs)
    if (pts.length === 0) return
    ctx.save()
    if (pts.length === 1) {
      const [p] = pts
      if (plein && t.mentions !== null && t.mentions[p.i] != null) {
        ctx.restore()
        return
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, POINT_SEUL.diametre / 2, 0, 2 * Math.PI)
      if (plein) {
        ctx.fillStyle = couleur
        ctx.fill()
      } else {
        ctx.strokeStyle = couleur
        ctx.lineWidth = POINT_SEUL.trait
        ctx.stroke()
      }
    } else {
      ctx.strokeStyle = couleur
      ctx.lineWidth = trait
      ctx.lineJoin = "miter"
      // Entrée 20 : le trait de la Courbe de la note (la seule avec une aire), onglets limités.
      if (t.aire) ctx.miterLimit = ONGLETS_NOTE
      ctx.setLineDash(tirets)
      ctx.beginPath()
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    }
    ctx.restore()
  }
  if (t.bande !== null) {
    const dessus = y(t.bande.centre + t.bande.demiLargeur), dessous = y(t.bande.centre - t.bande.demiLargeur)
    ctx.save()
    ctx.globalAlpha = NOTE_GRAPHE.bande
    ctx.fillStyle = c.bleu
    ctx.fillRect(0, dessus, w, dessous - dessus)
    ctx.restore()
    horizontale(dessus, c.bleu, NOTE_GRAPHE.bord, NOTE_GRAPHE.traitBord, [])
    horizontale(dessous, c.bleu, NOTE_GRAPHE.bord, NOTE_GRAPHE.traitBord, [])
    horizontale(y(t.bande.centre), c.bleu, 1, COURBE.reference, TIRETS_REFERENCE)
  }
  if (fini(t.ligne)) horizontale(y(t.ligne), c.bleu, 1, COURBE.reference, TIRETS_REFERENCE)
  if (t.reference !== null) serie(t.reference, c.bleu, COURBE.reference, TIRETS_REFERENCE, false)
  const pts = points(t.toi)
  if (t.aire && pts.length >= 2) {
    ctx.save()
    ctx.globalAlpha = NOTE_GRAPHE.aire
    ctx.fillStyle = c.orange
    ctx.beginPath()
    ctx.moveTo(pts[0].x, h)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(pts[pts.length - 1].x, h)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  serie(t.toi, c.orange, COURBE.toi, [], true)
  if (t.mentions !== null) {
    for (const p of pts) {
      const m = t.mentions[p.i]
      if (m != null) losangeCanvas(ctx, p.x, p.y, m, c)
    }
  }
}

// ─────────────────────────── courbe de la note ───────────────────────────













export function CourbeDeLaNote({ points, bande, phrase }: { points: readonly PointNote[]; bande: BandeLobbys | null; phrase: string | null }) {
  const toi = points.map((p) => (fini(p.valeur) ? p.valeur : null))
  const valeurs = toi.filter(fini)
  const bornes = bande === null ? [] : [bande.centre - bande.demiLargeur, bande.centre + bande.demiLargeur]
  const dom = domaineY([...valeurs, ...bornes], COURBE.marge)
  if (valeurs.length === 0 || dom === null) return <EmptyView />
  const mentions = REPLIS.mentionsEnLegende ? null : points.map((p) => p.mention ?? null)
  const ex = domaineX(points.length), seul = valeurs.length === 1
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (REPLIS.courbesEnCanvas) {
          return (
            <Canvas
              opaque={false}
              frame={{ maxWidth: "infinity", height: NOTE_GRAPHE.hauteur }}
              draw={(ctx, s) => dessinerCourbe(ctx, s, { toi, reference: null, ligne: null, bande, aire: true, mentions, domaine: dom }, c)}
              {...voixFigure(phrase)}
            />
          )
        }
        const echelle: Record<string, ShapeStyle> = { [SERIES.aire]: { color: c.orange, opacity: NOTE_GRAPHE.aire } }
        if (bande !== null) echelle[SERIES.bande] = { color: c.bleu, opacity: NOTE_GRAPHE.bande }
        const trait: StrokeStyle = { lineWidth: COURBE.toi, lineJoin: "miter", mitterLimit: ONGLETS_NOTE }
        const aire = toi.flatMap((v, i) => (v === null ? [] : [{ label: xDe(i), start: dom.bas, end: v, foregroundStyleBy: SERIES.aire, accessibilityHidden: true }]))
        const ligne = toi.flatMap((v, i) => {
          if (v === null) return []
          const m = mentions === null ? null : mentions[i]
          const dite = points[i].mention ?? null
          const symbol = m !== null ? <Losange mention={m} c={c} /> : seul ? <PointSeul couleur={c.orange} plein /> : null
          return [{
            label: xDe(i), value: v, foregroundStyle: c.orange, lineStyle: trait, interpolationMethod: "linear" as const,
            accessibilityLabel: `Partie ${i + 1} : ${valeurEnClair(v, NOTE.mesure)}${dite === null ? "" : `, ${MENTION_DITE[dite]}`}`,
            ...(symbol === null ? {} : { symbol }),
          }]
        })
        return (
          <Chart
            frame={{ maxWidth: "infinity", height: NOTE_GRAPHE.hauteur }}
            chartXAxis="hidden"
            chartYAxis="hidden"
            chartLegend="hidden"
            chartXScale={ex}
            chartYScale={{ from: dom.bas, to: dom.haut }}
            chartForegroundStyleScale={echelle}
            {...voixGraphique(phrase)}
          >
            {bande !== null ? (
              <RangeAreaChart
                marks={[ex.from, ex.to].map((x) => ({ label: x, start: bornes[0], end: bornes[1], foregroundStyleBy: SERIES.bande, accessibilityHidden: true }))}
              />
            ) : null}
            {bande !== null ? (
              <RuleLineForValueChart
                marks={[
                  { value: bornes[0], foregroundStyle: { color: c.bleu, opacity: NOTE_GRAPHE.bord }, lineStyle: { lineWidth: NOTE_GRAPHE.traitBord }, accessibilityHidden: true },
                  { value: bornes[1], foregroundStyle: { color: c.bleu, opacity: NOTE_GRAPHE.bord }, lineStyle: { lineWidth: NOTE_GRAPHE.traitBord }, accessibilityHidden: true },
                  { value: bande.centre, foregroundStyle: c.bleu, lineStyle: { lineWidth: COURBE.reference, dash: TIRETS_REFERENCE }, accessibilityHidden: true },
                ]}
              />
            ) : null}
            <RangeAreaChart marks={aire} />
            <LineChart marks={ligne} />
          </Chart>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── courbe à deux séries ───────────────────────────

/** Les mois, pour dire le jour d'un point. */
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


function jourDit(quand: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(quand)
  const mois = m === null ? undefined : MOIS[Number(m[2]) - 1]
  if (m === null || mois === undefined) return null
  const jour = Number(m[3])
  return `${jour === 1 ? "1er" : String(jour)} ${mois}`
}


function quandDit(p: PointCourbe, i: number, parJour: boolean): string {
  if (!parJour) return `Partie ${i + 1}`
  const parties = `${nombreEnClair(p.parties, 0)} partie${p.parties > 1 ? "s" : ""}`
  return `${jourDit(p.quand) ?? `Point ${i + 1}`}, ${parties}`
}

/** Une valeur de la stat d'Évolution `cle`, écrite comme sa tuile : signée pour une stat signée (Écart de dégâts). */
function ecrireValeur(cle: CleEvolution): (v: number) => string {
  const e = STATS_EVOLUTION.find((x) => x.cle === cle)
  if (e === undefined) return (v) => nombreEnClair(v, 1)
  return (v) => (e.signee ? ecartEnClair(v, e.stat.mesure) : valeurEnClair(v, e.stat.mesure))
}













export function CourbeDeuxSeries({ cle, points, ligne, parJour, phrase }: {
  cle: CleEvolution; points: readonly PointCourbe[]; ligne: number | null; parJour: boolean; phrase: string | null
}) {
  const toi = points.map((p) => (fini(p.valeur) ? p.valeur : null))
  const lobbys = points.map((p) => (fini(p.valeurLobby) ? p.valeurLobby : null))
  const reference = fini(ligne) ? ligne : null
  const nToi = toi.filter(fini).length, nLobbys = lobbys.filter(fini).length
  const dom = domaineY([...toi, ...lobbys, reference].filter(fini), COURBE.marge)
  if (nToi === 0 || dom === null) return <EmptyView />
  const ecrire = ecrireValeur(cle)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (REPLIS.courbesEnCanvas) {
          return (
            <Canvas
              opaque={false}
              frame={{ maxWidth: "infinity", height: COURBE.hauteur }}
              draw={(ctx, s) => dessinerCourbe(ctx, s, {
                toi, reference: nLobbys > 0 ? lobbys : null, ligne: reference, bande: null, aire: false, mentions: null, domaine: dom,
              }, c)}
              {...voixFigure(phrase)}
            />
          )
        }
        const traitToi: StrokeStyle = { lineWidth: COURBE.toi, lineJoin: "miter" }
        const traitReference: StrokeStyle = { lineWidth: COURBE.reference, dash: TIRETS_REFERENCE }
        const couleursSeries: Record<string, ShapeStyle> = { [SERIES.toi]: c.orange }
        const traitsSeries: Record<string, StrokeStyle> = { [SERIES.toi]: traitToi }
        if (nLobbys > 0) {
          couleursSeries[SERIES.lobbys] = c.bleu
          traitsSeries[SERIES.lobbys] = traitReference
        }
        const marques = (valeurs: readonly (number | null)[], serie: string, seul: VirtualNode | null, nom: string) => valeurs.flatMap((v, i) => (v === null ? [] : [{
          category: serie, label: xDe(i), value: v, foregroundStyleBy: serie, lineStyleBy: serie, interpolationMethod: "linear" as const,
          accessibilityLabel: `${quandDit(points[i], i, parJour)}${nom} : ${ecrire(v)}`,
          ...(seul === null ? {} : { symbol: seul }),
        }]))
        const marquesLobbys = marques(lobbys, SERIES.lobbys, nLobbys === 1 ? <PointSeul couleur={c.bleu} plein={false} /> : null, ", tes lobbys")
        const marquesToi = marques(toi, SERIES.toi, nToi === 1 ? <PointSeul couleur={c.orange} plein /> : null, "")
        return (
          <Chart
            frame={{ maxWidth: "infinity", height: COURBE.hauteur }}
            chartXAxis="hidden"
            chartYAxis="hidden"
            chartLegend="hidden"
            chartXScale={domaineX(points.length)}
            chartYScale={{ from: dom.bas, to: dom.haut }}
            chartForegroundStyleScale={couleursSeries}
            chartLineStyleScale={traitsSeries}
            {...voixGraphique(phrase)}
          >
            {reference !== null ? (
              <RuleLineForValueChart marks={[{ value: reference, foregroundStyle: c.bleu, lineStyle: traitReference, accessibilityHidden: true }]} />
            ) : null}
            <LineCategoryChart marks={[...marquesLobbys, ...marquesToi]} />
          </Chart>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── courbe de la visée (entrée 30) ───────────────────────────

/**
 * Courbe de la visée (DESIGN.md, courbe : « Ta visée à l'entraînement »), en points : marge de l'échelle, en part de l'écart des
 * valeurs, qui laisse la place d'une valeur écrite au-dessus du plus haut bout et au-dessous du plus bas (11 points et leur écart
 * sur 112 de haut) ; valeur d'un bout, à taille fixe comme un libellé de graphique (DESIGN.md, Typography), et son écart au point.
 */
const VISEE = { marge: 0.25, valeur: { font: 11, fontWeight: "bold" }, ecart: 4 } as const
/** Les deux séries de la visée, nommées comme dans `chartForegroundStyleScale` et `chartLineStyleScale`. */
const SERIES_VISEE = { competition: "Compétition", deathmatch: "Deathmatch" } as const






export type SerieDeLaVisee = { points: readonly { semaine: string; valeur: number; texte: string }[] }

/** Le bout d'une série de la visée : l'indice de sa dernière semaine dessinée, le texte de ce point, sa place (au-dessus, au-dessous). */
export type BoutVisee = { i: number; texte: string; position: "top" | "bottom" }

/** Les valeurs d'une série par semaine des `semaines` (la plus ancienne d'abord) ; null : semaine vide ou valeur illisible, non dessinée. */
export function valeursVisee(semaines: readonly string[], s: SerieDeLaVisee): (number | null)[] {
  return semaines.map((w) => {
    const p = s.points.find((x) => x.semaine === w)
    return p !== undefined && fini(p.valeur) ? p.valeur : null
  })
}

/** Le dernier point dessiné d'une série : l'indice de sa semaine, sa valeur, son texte ; null sans point dans ces semaines. */
function dernierPointVisee(semaines: readonly string[], s: SerieDeLaVisee): { i: number; valeur: number; texte: string } | null {
  for (let k = s.points.length - 1; k >= 0; k--) {
    const p = s.points[k], i = semaines.indexOf(p.semaine)
    if (i >= 0 && fini(p.valeur)) return { i, valeur: p.valeur, texte: p.texte }
  }
  return null
}

/**
 * Les bouts des deux séries (DESIGN.md, courbe : « valeur écrite au bout de chaque courbe ») : le dernier point dessiné de chacune et
 * son texte, tel quel ; la série dont ce point est le plus haut écrite au-dessus, l'autre au-dessous, pour que les deux valeurs ne se
 * chevauchent pas (égalité : la compétition au-dessus) ; une série seule, au-dessus ; sans point, null.
 */
export function boutsVisee(semaines: readonly string[], competition: SerieDeLaVisee, deathmatch: SerieDeLaVisee): { competition: BoutVisee | null; deathmatch: BoutVisee | null } {
  const c = dernierPointVisee(semaines, competition), d = dernierPointVisee(semaines, deathmatch)
  // Faux sans point de compétition : le deathmatch, seul, passe alors au-dessus.
  const competitionAuDessus = d === null || (c !== null && c.valeur >= d.valeur)
  return {
    competition: c === null ? null : { i: c.i, texte: c.texte, position: competitionAuDessus ? "top" : "bottom" },
    deathmatch: d === null ? null : { i: d.i, texte: d.texte, position: competitionAuDessus ? "bottom" : "top" },
  }
}

/** Les bouts écrits dans le Canvas du repli, à la géométrie de dessinerCourbe : au-dessus ou au-dessous du point, vers l'intérieur. */
function ecrireBoutsVisee(ctx: CanvasRenderingContext, s: CanvasSize, n: number, dom: { bas: number; haut: number }, bouts: readonly [BoutVisee | null, readonly (number | null)[], Color][]) {
  ctx.save()
  ctx.font = VISEE.valeur.font
  for (const [b, valeurs, couleur] of bouts) {
    if (b === null) continue
    const v = valeurs[b.i]
    if (v === null || v === undefined) continue
    const x = n <= 1 ? s.width / 2 : (b.i * s.width) / (n - 1)
    const y = ((dom.haut - v) / (dom.haut - dom.bas)) * s.height
    ctx.fillStyle = couleur
    ctx.textAlign = x > s.width / 2 ? "right" : "left"
    ctx.textBaseline = b.position === "top" ? "bottom" : "top"
    ctx.fillText(b.texte, x, b.position === "top" ? y - VISEE.ecart : y + VISEE.ecart)
  }
  ctx.restore()
}

/**
 * Courbe de la visée (DESIGN.md, courbe : « Ta visée à l'entraînement : compétition en trait plein orange, deathmatch en tirets
 * bleus, valeur écrite au bout de chaque courbe » ; EXPERIENCE.md, Component Patterns, Courbe : « un point par semaine » ; point 6
 * du spike) : les deux séries telles que les rend viseeALEntrainement (`semaines`, les 8 de la plus ancienne à la plus récente ;
 * `competition`, `deathmatch` ; `phrase`). `Chart` de 112 de haut, axes, grille et légende du système masqués : une abscisse par
 * semaine, à pas égal, de la première à la dernière des 8 (une semaine vide n'est pas dessinée, le trait la franchit) ; la
 * compétition en trait `orange` de 2,5 à angles vifs, le deathmatch en tirets 4/4 `bleu` de 1,5 (deux séries d'un
 * `LineCategoryChart`) ; une série d'un seul point, son disque, plein pour la compétition, creux pour le deathmatch. Au bout de
 * chaque série, le texte de son dernier point, à sa couleur, en 11 points gras à chasse fixe (taille fixe, comme un libellé
 * d'axe), au-dessus du point pour la plus haute, au-dessous pour l'autre, gardé dans le tracé (boutsVisee). Échelle : de la plus
 * basse à la plus haute valeur, plus 25 % de leur écart de chaque côté, la place des bouts. Au plus 8 points par série, quelle que
 * soit la longueur de l'historique : jamais un trait hérissé. Sans point : rien. VoiceOver : un seul élément, la phrase du module
 * (Component Patterns, Courbe : sans libellé par point) ; sans phrase, masquée. Repli `courbesEnCanvas` : le même dessin en
 * Canvas, bouts compris.
 */
export function CourbeVisee({ semaines, competition, deathmatch, phrase }: {
  semaines: readonly string[]; competition: SerieDeLaVisee; deathmatch: SerieDeLaVisee; phrase: string | null
}) {
  const comp = valeursVisee(semaines, competition), dm = valeursVisee(semaines, deathmatch)
  const nComp = comp.filter(fini).length, nDm = dm.filter(fini).length
  const dom = domaineY([...comp, ...dm].filter(fini), VISEE.marge)
  if (nComp + nDm === 0 || dom === null) return <EmptyView />
  const bouts = boutsVisee(semaines, competition, deathmatch)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (REPLIS.courbesEnCanvas) {
          return (
            <Canvas
              opaque={false}
              frame={{ maxWidth: "infinity", height: COURBE.hauteur }}
              draw={(ctx, s) => {
                dessinerCourbe(ctx, s, { toi: comp, reference: nDm > 0 ? dm : null, ligne: null, bande: null, aire: false, mentions: null, domaine: dom }, c)
                ecrireBoutsVisee(ctx, s, semaines.length, dom, [[bouts.deathmatch, dm, c.bleu], [bouts.competition, comp, c.orange]])
              }}
              {...voixFigure(phrase)}
            />
          )
        }
        const couleursSeries: Record<string, ShapeStyle> = {}
        const traitsSeries: Record<string, StrokeStyle> = {}
        if (nDm > 0) {
          couleursSeries[SERIES_VISEE.deathmatch] = c.bleu
          traitsSeries[SERIES_VISEE.deathmatch] = { lineWidth: COURBE.reference, dash: TIRETS_REFERENCE }
        }
        if (nComp > 0) {
          couleursSeries[SERIES_VISEE.competition] = c.orange
          traitsSeries[SERIES_VISEE.competition] = { lineWidth: COURBE.toi, lineJoin: "miter" }
        }
        const marques = (valeurs: readonly (number | null)[], serie: string, couleur: Color, plein: boolean, bout: BoutVisee | null) => {
          const seul = valeurs.filter(fini).length === 1 ? <PointSeul couleur={couleur} plein={plein} /> : null
          return valeurs.flatMap((v, i) => (v === null ? [] : [{
            category: serie, label: xDe(i), value: v, foregroundStyleBy: serie, lineStyleBy: serie, interpolationMethod: "linear" as const,
            accessibilityHidden: true,
            ...(seul === null ? {} : { symbol: seul }),
            ...(bout === null || bout.i !== i ? {} : {
              annotation: {
                position: bout.position, spacing: VISEE.ecart, overflowResolution: { x: "fit" as const, y: "fit" as const },
                content: <Text {...VISEE.valeur} monospacedDigit foregroundStyle={couleur}>{bout.texte}</Text>,
              },
            }),
          }]))
        }
        return (
          <Chart
            frame={{ maxWidth: "infinity", height: COURBE.hauteur }}
            chartXAxis="hidden"
            chartYAxis="hidden"
            chartLegend="hidden"
            chartXScale={domaineX(semaines.length)}
            chartYScale={{ from: dom.bas, to: dom.haut }}
            chartForegroundStyleScale={couleursSeries}
            chartLineStyleScale={traitsSeries}
            {...voixFigure(phrase)}
          >
            <LineCategoryChart
              marks={[
                ...marques(dm, SERIES_VISEE.deathmatch, c.bleu, false, bouts.deathmatch),
                ...marques(comp, SERIES_VISEE.competition, c.orange, true, bouts.competition),
              ]}
            />
          </Chart>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── barres de RR ───────────────────────────

/** Barres de RR (DESIGN.md, barres-rr ; maquette `Evolution`) : hauteur ; largeur d'une colonne, en part du pas ; marge de l'échelle ; trait de l'axe. */
const BARRES_RR = { hauteur: 92, largeur: 0.75, marge: 0.08, axe: 1 } as const










export function BarresDeRR({ barres, phrase }: { barres: readonly BarreRr[]; phrase: string | null }) {
  if (barres.length === 0) return <EmptyView />
  const rr = barres.map((b) => (fini(b.rr) ? b.rr : 0))
  let bas = 0, haut = 0
  for (const v of rr) {
    bas = Math.min(bas, v)
    haut = Math.max(haut, v)
  }
  const m = (haut - bas) * BARRES_RR.marge
  const echelle = haut === bas ? { from: -1, to: 1 } : { from: bas < 0 ? bas - m : 0, to: haut > 0 ? haut + m : 0 }
  const libelles = barres.map((_, i) => String(i + 1))
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Chart
            frame={{ maxWidth: "infinity", height: BARRES_RR.hauteur }}
            chartXAxis="hidden"
            chartYAxis="hidden"
            chartLegend="hidden"
            chartXScale={libelles}
            chartYScale={echelle}
            {...voixGraphique(phrase)}
          >
            <RuleLineForValueChart marks={[{ value: 0, foregroundStyle: c.bordure, lineStyle: { lineWidth: BARRES_RR.axe }, accessibilityHidden: true }]} />
            <BarChart
              marks={barres.map((b, i) => ({
                label: libelles[i], value: rr[i], foregroundStyle: rr[i] < 0 ? c.rougeClair : c.vert,
                width: { type: "ratio" as const, value: BARRES_RR.largeur },
                accessibilityLabel: `Partie ${i + 1} : ${rrEnClair(rr[i])}${b.placement ? ", placement" : ""}`,
              }))}
            />
          </Chart>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── histogramme ───────────────────────────





export type TrancheHistogramme = { libelle: string; morts: number; texte: string; evaluation: Evaluation }

/** Histogramme (DESIGN.md, histogramme ; maquette `Duels`), en points : hauteur de la plus forte colonne ; entre deux colonnes ; sous la valeur ; au-dessus des tranches. */
const HISTOGRAMME = { hauteur: 74, ecart: 12, ecartValeur: 4, ecartTranche: 4 } as const


function trancheDite(libelle: string): string {
  const entre = /^(\d+)\s*[–-]\s*(\d+)\s*s$/.exec(libelle)
  if (entre !== null) return `de ${entre[1]} à ${entre[2]} secondes`
  const plus = /^(\d+)\s*s et plus$/.exec(libelle)
  return plus !== null ? `${plus[1]} secondes et plus` : libelle
}






function trancheSousColonne(libelle: string): string {
  return libelle.replace(/\s+et plus$/, `${NBSP}+`)
}












export function Histogramme({ tranches, phrase }: { tranches: readonly TrancheHistogramme[]; phrase: string | null }) {
  if (tranches.length === 0) return <EmptyView />
  const comptes = tranches.map((t) => (fini(t.morts) && t.morts > 0 ? t.morts : 0))
  let max = 0, total = 0
  for (const n of comptes) {
    max = Math.max(max, n)
    total += n
  }
  const voix = tranches.map((t) => `${trancheDite(t.libelle)} : ${t.texte}`)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (tailleAccessibilite(env.dynamicTypeSize)) {
          return (
            <VStack alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }} {...voixGraphique(phrase)}>
              <Barres
                barres={tranches.map((t, i) => ({
                  libelle: t.libelle, valeur: t.texte, part: total > 0 ? comptes[i] / total : null, evaluation: t.evaluation, voix: voix[i],
                }))}
              />
            </VStack>
          )
        }
        return (
          <VStack spacing={HISTOGRAMME.ecartTranche} frame={{ maxWidth: "infinity" }} {...voixGraphique(phrase)}>
            <HStack alignment="bottom" spacing={HISTOGRAMME.ecart}>
              {tranches.map((t, i) => (
                <VStack key={i} spacing={HISTOGRAMME.ecartValeur} frame={{ maxWidth: "infinity" }} accessibilityElement accessibilityLabel={voix[i]}>
                  <Text {...TYPO.microFort} monospacedDigit foregroundStyle={c.texte}>
                    {t.texte}
                  </Text>
                  <Rectangle fill={couleurEvaluation(c, t.evaluation)} frame={{ height: max > 0 ? (HISTOGRAMME.hauteur * comptes[i]) / max : 0 }} />
                </VStack>
              ))}
            </HStack>
            <HStack alignment="top" spacing={HISTOGRAMME.ecart} accessibilityHidden>
              {tranches.map((t, i) => (
                <Text key={i} {...TYPO.axe} foregroundStyle={c.texteDiscret} multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
                  {trancheSousColonne(t.libelle)}
                </Text>
              ))}
            </HStack>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── légende ───────────────────────────

/**
 * Les formes de la Légende (DESIGN.md, Légende) : trait plein (toi), tirets (référence), bande cernée (écart habituel des
 * lobbys), losange creux (mérite), losange plein (distinction), disque (kill), croix (mort), demi-case vers le haut ou vers
 * le bas (manche gagnée ou perdue de la Frise), barre pleine ou creuse (manche gagnée ou perdue d'une Case de manche) ;
 * pastille pleine `bleu`, `orange` ou `texte-doux` (Case colorée forte, faible ou entre les deux ; entrée 37).
 */
export type Marque =
  | "trait" | "tirets" | "bande" | "losangeCreux" | "losangePlein" | "disque" | "croix" | "demiCaseHaut" | "demiCaseBas" | "barrePleine" | "barreCreuse"
  | "pastilleForte" | "pastilleFaible" | "pastilleNeutre"

/** Un repère de la Légende : sa forme (null : un texte seul, comme les mentions comptées du repli) et son libellé. */
export type ItemLegende = { marque: Marque | null; libelle: string }

/** Légende (DESIGN.md, legende ; maquette), en points : entre deux repères, entre deux lignes, entre la forme et son libellé ; cadre d'une forme. */
const LEGENDE = { ecart: 12, ecartLignes: 4, ecartMarque: 5, largeur: 16, hauteur: 12 } as const
/** Formes de la Légende, en points : longueur d'un trait ; bande ; demi-case de la Frise ; barre de résultat d'une Case de manche et son contour (case-manche). */
const FORMES = { trait: 12, bande: 8, demiCase: 6, hautDemiCase: 5, barre: 5, contourBarre: 1.5 } as const

/** Un rectangle de `l` × `h` au centre de la taille reçue, rentré de `retrait` de chaque côté. */
function rectangleCentre(p: Path2D, s: Size, l: number, h: number, retrait = 0) {
  p.addRect({ x: (s.width - l) / 2 + retrait, y: (s.height - h) / 2 + retrait, width: l - 2 * retrait, height: h - 2 * retrait })
}

/** Un segment horizontal de 12 au milieu de la taille reçue. */
function segmentCentre(p: Path2D, s: Size) {
  p.move({ x: (s.width - FORMES.trait) / 2, y: s.height / 2 })
  p.addLine({ x: (s.width + FORMES.trait) / 2, y: s.height / 2 })
}

/** Les couches d'une forme de la Légende (hors losanges), dans un cadre de 16 × 12. */
function couchesRepere(marque: Marque, c: Palette): VirtualNode[] {
  const cx = (s: Size) => s.width / 2, cy = (s: Size) => s.height / 2
  switch (marque) {
    case "trait":
      return [<PathShape key="t" stroke={{ shapeStyle: c.orange, strokeStyle: { lineWidth: COURBE.toi } }} draw={segmentCentre} />]
    case "tirets":
      return [<PathShape key="t" stroke={{ shapeStyle: c.bleu, strokeStyle: { lineWidth: COURBE.reference, dash: TIRETS_REFERENCE } }} draw={segmentCentre} />]
    case "bande":
      return [
        <PathShape key="f" fill={{ color: c.bleu, opacity: NOTE_GRAPHE.bande }} draw={(p, s) => rectangleCentre(p, s, FORMES.trait, FORMES.bande)} />,
        <PathShape
          key="b"
          stroke={{ shapeStyle: { color: c.bleu, opacity: NOTE_GRAPHE.bord }, strokeStyle: { lineWidth: NOTE_GRAPHE.traitBord } }}
          draw={(p, s) => rectangleCentre(p, s, FORMES.trait, FORMES.bande, NOTE_GRAPHE.traitBord / 2)}
        />,
      ]
    case "disque":
      return [
        <PathShape
          key="d"
          fill={c.bleu}
          opacity={PLAN.opacite}
          draw={(p, s) => p.addEllipse({ x: cx(s) - PLAN.kill / 2, y: cy(s) - PLAN.kill / 2, width: PLAN.kill, height: PLAN.kill })}
        />,
      ]
    case "croix":
      return [
        <PathShape
          key="c"
          stroke={{ shapeStyle: c.orange, strokeStyle: { lineWidth: PLAN.traitMort } }}
          opacity={PLAN.opacite}
          draw={(p, s) => croix(p, s, [{ u: 0.5, v: 0.5 }], PLAN.mort / 2)}
        />,
      ]
    case "demiCaseHaut":
    case "demiCaseBas": {
      const haut = marque === "demiCaseHaut"
      return [
        <PathShape key="a" stroke={{ shapeStyle: c.bordure, strokeStyle: { lineWidth: 1 } }} draw={segmentCentre} />,
        <PathShape
          key="d"
          fill={haut ? c.vert : c.rougeClair}
          draw={(p, s) => p.addRect({ x: cx(s) - FORMES.demiCase / 2, y: haut ? cy(s) - FORMES.hautDemiCase : cy(s), width: FORMES.demiCase, height: FORMES.hautDemiCase })}
        />,
      ]
    }
    case "barrePleine":
      return [<PathShape key="b" fill={c.vert} draw={(p, s) => rectangleCentre(p, s, FORMES.trait, FORMES.barre)} />]
    case "barreCreuse":
      return [
        <PathShape
          key="b"
          stroke={{ shapeStyle: c.rougeClair, strokeStyle: { lineWidth: FORMES.contourBarre } }}
          draw={(p, s) => rectangleCentre(p, s, FORMES.trait, FORMES.barre, FORMES.contourBarre / 2)}
        />,
      ]
    case "pastilleForte":
    case "pastilleFaible":
    case "pastilleNeutre": {
      // Pastille de la légende des Cases colorées : 12 × 8 pleine, à la couleur de son évaluation (maquette `Attaque-defense`).
      const e: Evaluation = marque === "pastilleForte" ? "fort" : marque === "pastilleFaible" ? "faible" : "neutre"
      return [<PathShape key="p" fill={couleurEvaluation(c, e)} draw={(p, s) => rectangleCentre(p, s, FORMES.trait, FORMES.bande)} />]
    }
    case "losangeCreux":
    case "losangePlein":
      return []
  }
}

/** La forme d'un repère de la Légende : un losange dans son cadre de 16, ou les couches de sa forme dans un cadre de 16 × 12. Masquée à VoiceOver. */
function Repere({ marque, c }: { marque: Marque; c: Palette }) {
  if (marque === "losangeCreux" || marque === "losangePlein") return <Losange mention={marque === "losangeCreux" ? "merite" : "distinction"} c={c} />
  return (
    <ZStack frame={{ width: LEGENDE.largeur, height: LEGENDE.hauteur }} accessibilityHidden>
      {couchesRepere(marque, c)}
    </ZStack>
  )
}

/**
 * Légende (DESIGN.md, legende ; EXPERIENCE.md, Component Patterns) : sous un graphique à plusieurs séries ou marques, posée
 * par l'écran, chaque repère dans l'ordre reçu, son libellé en note `texte-discret` à 5 après sa forme (couleurs fixes de
 * DESIGN.md : toi `orange`, référence `bleu`, mérite `texte`, distinction `or`…) ; 12 entre deux repères, à la ligne au
 * besoin (`FlowLayout`), 4 entre deux lignes ; dès la première taille d'accessibilité, un repère par ligne. Sans repère :
 * rien. Masquée à VoiceOver : la phrase du graphique et ses marques nomment déjà chaque série.
 */
export function Legende({ items }: { items: readonly ItemLegende[] }) {
  if (items.length === 0) return <EmptyView />
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const reperes = items.map((it, i) => (
          <HStack key={i} spacing={LEGENDE.ecartMarque}>
            {it.marque !== null ? <Repere marque={it.marque} c={c} /> : null}
            <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
              {it.libelle}
            </Text>
          </HStack>
        ))
        return tailleAccessibilite(env.dynamicTypeSize) ? (
          <VStack alignment="leading" spacing={LEGENDE.ecartLignes} frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityHidden>
            {reperes}
          </VStack>
        ) : (
          <VStack alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }} accessibilityHidden>
            <FlowLayout horizontalSpacing={LEGENDE.ecart} verticalSpacing={LEGENDE.ecartLignes}>
              {reperes}
            </FlowLayout>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}






export function legendeNote({ bande, merites, distinctions }: { bande: BandeLobbys | null; merites: number; distinctions: number }): ItemLegende[] {
  const items: ItemLegende[] = [{ marque: "trait", libelle: SERIES.toi }]
  if (bande !== null) items.push({ marque: "bande", libelle: SERIES.lobbys })
  if (REPLIS.mentionsEnLegende) {
    const comptes: string[] = []
    if (merites > 0) comptes.push(`${nombreEnClair(merites, 0)} ${MENTION_DITE.merite}${merites > 1 ? "s" : ""}`)
    if (distinctions > 0) comptes.push(`${nombreEnClair(distinctions, 0)} ${MENTION_DITE.distinction}${distinctions > 1 ? "s" : ""}`)
    if (comptes.length > 0) items.push({ marque: null, libelle: comptes.join(", ") })
  } else {
    if (merites > 0) items.push({ marque: "losangeCreux", libelle: "Mérite" })
    if (distinctions > 0) items.push({ marque: "losangePlein", libelle: "Distinction" })
  }
  return items
}

// ═══════════════════════ entrée 37 : briques de texte et de choix ═══════════════════════
//
// Tableau, Constat, Case colorée, Sélecteur segmenté et Puces de choix (DESIGN.md, Contrôles, Blocs et chiffres, Constats ;
// EXPERIENCE.md, Component Patterns, Accessibility Floor), que reprennent Évolution, Agents, Cartes, Duels, Économie,
// Attaque · défense, Armes et visée, Parties et le Détail. Valeurs écrites et évaluations reçues telles quelles ; le
// Sélecteur et les Puces sont contrôlés : ils montrent le choix reçu et rendent chaque appui par `onChoix`, sans garder
// le choix, si bien qu'un seul état, tenu par l'écran (le périmètre commun de l'entrée 17, le côté de Cartes et de
// Duels, l'agent, la carte ou la stat choisis), les règle partout à la fois.

// ─────────────────────────── case colorée ───────────────────────────






export type ValeurCase = { texte: string; evaluation: Evaluation }

/** Case colorée (DESIGN.md, case-coloree : `min-width` ; maquette `Attaque-defense` : marges), en points. */
const CASE = { largeur: 46, vertical: 4, horizontal: 6 } as const
/** Espace fine insécable, avant « % ». */
const FINE = " "

/** Ce que VoiceOver dit d'une valeur écrite : « — » se dit « aucune valeur ». */
function valeurDite(texte: string): string {
  return texte === TIRET ? "aucune valeur" : texte
}

/**
 * La pastille d'une Case colorée, sans lecteur de contraste (le Tableau a déjà le sien) : valeur en ligne forte `fond`,
 * chiffres à chasse fixe, marges de 4 et 6, sur la couleur de son évaluation, 46 de large au moins, valeur à droite
 * (maquette). Marges sur le texte, largeur et fond sur sa pile : le rendu ne dépend pas de l'ordre des modificateurs.
 */
function Pastille({ c, valeur }: { c: Palette; valeur: ValeurCase }) {
  return (
    <HStack
      frame={{ minWidth: CASE.largeur, alignment: "trailing" }}
      background={couleurEvaluation(c, valeur.evaluation)}
      accessibilityElement
      accessibilityLabel={valeurDite(valeur.texte)}
    >
      <Text {...TYPO.ligneForte} monospacedDigit foregroundStyle={c.fond} padding={{ vertical: CASE.vertical, horizontal: CASE.horizontal }}>
        {valeur.texte}
      </Text>
    </HStack>
  )
}

/**
 * Case colorée (DESIGN.md, case-coloree ; EXPERIENCE.md, Component Patterns) : pastille de la grille Par carte d'Attaque ·
 * défense, fond `bleu` (fort), `orange` (faible) ou `texte-doux` (neutre, « — » compris), valeur toujours écrite.
 * VoiceOver lit la valeur (« — » : « aucune valeur ») ; dans un Tableau, la phrase de sa ligne la dit déjà.
 */
export function CaseColoree({ texte, evaluation }: ValeurCase) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => <Pastille c={couleurs(env.colorSchemeContrast)} valeur={{ texte, evaluation }} />}
    </EnvironmentValuesReader>
  )
}





export const LEGENDE_CASES: readonly ItemLegende[] = [
  { marque: "pastilleForte", libelle: `${PART_FORTE}${FINE}% et plus` },
  { marque: "pastilleFaible", libelle: `moins de ${PART_FAIBLE}${FINE}%` },
  { marque: "pastilleNeutre", libelle: "entre les deux" },
]

// ─────────────────────────── chiffre coloré, grille de chiffres, lignes détaillées (entrée 10 de epic-stats-analyses) ───────────────────────────

// Briques de Duels (entrées 26, 27 et 5 de epic-stats-analyses), d'Armes et visée (4) et de Dans quelles conditions tu gagnes (7), et
// lignes détaillées de Cartes (6) et des compos (7), recopiées pendant l'epic des analyses et regroupées ici au Refactor sweep. Elles
// dessinent le texte tel qu'il arrive, déjà coupé par l'écran (sansMauvaiseCoupure là où il le faut) : elles ne coupent rien.

/** Entre le libellé, la valeur et le sous-texte d'un Chiffre, en points (maquette, et Chiffre de design.tsx). */
const ECART_CHIFFRE = 2
/** Ligne détaillée (DESIGN.md, ligne-detaillee) : marges d'une ligne de Tableau, écart entre ses deux textes, filet entre deux lignes. */
const LIGNE_DETAILLEE = { marge: { vertical: 7, horizontal: 4 }, ecart: 2, filet: 1 } as const

/** Un Chiffre d'une grille : sa clé, son libellé, sa valeur écrite, son sous-texte (null : aucun), son évaluation et sa phrase VoiceOver. */
export type ChiffreDeGrille = {
  readonly cle: string
  readonly libelle: string
  readonly valeur: string
  readonly sousTexte: string | null
  readonly evaluation: Evaluation
  readonly voix: string
}

/** Colonnes d'une grille de Chiffres (DESIGN.md, Layout & Spacing) : 2 (trois colonnes couperaient libellés et écarts) ; 1 dès la première taille d'accessibilité. */
export function colonnesChiffres(taille: DynamicTypeSize | undefined): number {
  return tailleAccessibilite(taille) ? 1 : 2
}

/**
 * Les rangées d'une grille de Chiffres : chaque groupe coupé en rangées de `colonnes` Chiffres, un groupe commençant toujours une
 * rangée (Échanges et survie : tes échanges, puis ta survie seule, puis tes dégâts) ; un Chiffre seul sur sa rangée en prend toute
 * la largeur.
 */
export function rangeesDeChiffres<T>(groupes: readonly (readonly T[])[], colonnes: number): T[][] {
  const n = Math.max(1, Math.floor(colonnes))
  const rangees: T[][] = []
  for (const g of groupes) for (let i = 0; i < g.length; i += n) rangees.push(g.slice(i, i + n))
  return rangees
}

/** La couleur de la valeur d'un Chiffre : bleu ou orange selon l'évaluation ; `texte` sans couleur (DESIGN.md, chiffre). */
function couleurValeur(c: Palette, e: Evaluation): Color {
  return e === "neutre" ? c.texte : couleurEvaluation(c, e)
}

/**
 * Un Chiffre coloré (DESIGN.md, chiffre ; maquette) : creux `fond`, marge de 10, à gauche, à 2 l'un de l'autre : libellé en note
 * `texte-discret` ; valeur en `valeur`, chiffres à chasse fixe, à la couleur de son évaluation (`texte` sans couleur) ; sous-texte en
 * note `texte-doux`, s'il y en a un ; chacun sur autant de lignes qu'il faut ; toute la largeur et toute la hauteur données (deux
 * Chiffres d'une rangée ont la même hauteur). Un seul élément VoiceOver, sa phrase.
 */
export function ChiffreColore({ chiffre }: { chiffre: ChiffreDeGrille }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack
            alignment="leading"
            spacing={ECART_CHIFFRE}
            padding={ESPACES.cellule}
            frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
            background={creux(c)}
            accessibilityElement
            accessibilityLabel={chiffre.voix}
          >
            <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
              {chiffre.libelle}
            </Text>
            <Text {...TYPO.valeur} monospacedDigit foregroundStyle={couleurValeur(c, chiffre.evaluation)}>
              {chiffre.valeur}
            </Text>
            {chiffre.sousTexte !== null ? (
              <Text {...TYPO.note} foregroundStyle={c.texteDoux}>
                {chiffre.sousTexte}
              </Text>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Une grille de Chiffres colorés (DESIGN.md, Layout & Spacing : écart de 6) : 2 colonnes, une seule dès la première taille
 * d'accessibilité ; chaque rangée tenue à sa hauteur idéale, ses Chiffres à toute cette hauteur et à parts égales de la largeur ;
 * un Chiffre seul sur sa rangée en prend toute la largeur. `groupes` : chaque groupe commence une rangée (rangeesDeChiffres) ;
 * sinon, `chiffres` en un seul groupe.
 */
export function GrilleChiffres({ chiffres, groupes }: { chiffres?: readonly ChiffreDeGrille[]; groupes?: readonly (readonly ChiffreDeGrille[])[] }) {
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize"]}>
      {(env) => {
        const rangees = rangeesDeChiffres(groupes ?? [chiffres ?? []], colonnesChiffres(env.dynamicTypeSize))
        return (
          <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {rangees.map((r, i) => (
              <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
                {r.map((ch) => <ChiffreColore key={ch.cle} chiffre={ch} />)}
              </HStack>
            ))}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}


export type LigneDetaillee = { readonly libelle: string; readonly detail: string; readonly voix: string }








export function LignesDetaillees({ lignes }: { lignes: readonly LigneDetaillee[] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {lignes.flatMap((l, i) => {
              const ligne = (
                <VStack
                  key={"l" + i}
                  alignment="leading"
                  spacing={LIGNE_DETAILLEE.ecart}
                  padding={LIGNE_DETAILLEE.marge}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                  accessibilityElement
                  accessibilityLabel={l.voix}
                >
                  <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte}>
                    {l.libelle}
                  </Text>
                  <Text {...TYPO.petit} monospacedDigit foregroundStyle={c.texte}>
                    {l.detail}
                  </Text>
                </VStack>
              )
              return i === 0 ? [ligne] : [<Rectangle key={"f" + i} fill={c.fond} frame={{ height: LIGNE_DETAILLEE.filet }} accessibilityHidden />, ligne]
            })}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── tableau ───────────────────────────


export type CelluleTableau = string | ValeurCase






export type LigneTableau = { cellules: readonly CelluleTableau[]; voix: string }

/**
 * Tableau (DESIGN.md, tableau ; maquette `Economie`), en points : marges d'une cellule d'en-tête et d'une cellule de ligne,
 * épaisseur d'un filet, écart entre les lignes d'une carte (tailles d'accessibilité).
 */
const TABLEAU = { enTete: { vertical: 6, horizontal: 4 }, ligne: { vertical: 7, horizontal: 4 }, filet: 1, carte: 4, pile: 2 } as const
/** Les tailles d'accessibilité où une carte du Tableau garde en-tête et valeur côte à côte ; au-delà, l'un sous l'autre. */
const PAIRES_COTE_A_COTE: readonly (DynamicTypeSize | undefined)[] = ["accessibility1", "accessibility2"]
/** Une cellule qui n'est pas la première : elle prend sa part de la largeur restante, contenu à droite. */
const A_DROITE = { maxWidth: "infinity", alignment: "trailing" } as const

/** Un filet de 1 sur toute la largeur ; dans une `Grid`, une rangée pleine qui n'élargit aucune colonne. */
function filet(couleur: Color, cle: string) {
  return <Rectangle key={cle} fill={couleur} frame={{ height: TABLEAU.filet }} gridCellUnsizedAxes="horizontal" accessibilityHidden />
}

/**
 * Une cellule d'une ligne, à la marge de ligne : texte en petit `texte`, chiffres à chasse fixe, ou Case colorée. La
 * première, à sa largeur et à gauche, porte la phrase de la ligne pour VoiceOver ; les autres, à droite, sont masquées.
 */
function celluleLigne(c: Palette, x: CelluleTableau | undefined, j: number, voix: string) {
  const premiere = j === 0
  const acces = { accessibilityElement: premiere ? true : undefined, accessibilityLabel: premiere ? voix : undefined, accessibilityHidden: premiere ? undefined : true }
  if (x === undefined || typeof x === "string") {
    return (
      <Text
        key={j}
        {...TYPO.petit}
        monospacedDigit
        foregroundStyle={c.texte}
        multilineTextAlignment={premiere ? undefined : "trailing"}
        padding={TABLEAU.ligne}
        frame={premiere ? undefined : A_DROITE}
        {...acces}
      >
        {x ?? ""}
      </Text>
    )
  }
  return (
    <HStack key={j} padding={TABLEAU.ligne} frame={premiere ? undefined : A_DROITE} {...acces}>
      <Pastille c={c} valeur={x} />
    </HStack>
  )
}

/** La valeur d'une ligne dans sa carte (tailles d'accessibilité) : texte en petit `texte`, ou Case colorée ; gardée entière. */
function valeurCarte(c: Palette, x: CelluleTableau | undefined) {
  if (x === undefined || typeof x === "string") {
    return (
      <Text {...TYPO.petit} monospacedDigit foregroundStyle={c.texte} layoutPriority={1}>
        {x ?? ""}
      </Text>
    )
  }
  return (
    <HStack layoutPriority={1}>
      <Pastille c={c} valeur={x} />
    </HStack>
  )
}

/**
 * Tableau (DESIGN.md, tableau et Layout & Spacing ; EXPERIENCE.md, Component Patterns, Accessibility Floor) : lecture seule,
 * pleine largeur, lignes dans l'ordre reçu (celui de la maquette). Une `Grid` : en-têtes en note `texte-discret`, sur un
 * filet `bordure` de 1 ; lignes en petit `texte`, chiffres à chasse fixe, séparées par un filet `fond` de 1 ; marges de
 * cellule de la maquette (6 et 4 en tête, 7 et 4 en ligne) ; la 1re colonne à sa largeur, à gauche, les autres se
 * partagent le reste, à droite ; cellules alignées sur leur première ligne de texte. Un élément VoiceOver par ligne, qui
 * lit sa `voix`, sur sa première cellule (une `GridRow` ne prend aucun modificateur), le reste et les en-têtes masqués.
 * Dès la première taille d'accessibilité, une carte par ligne : la 1re cellule en petit gras, puis, pour chaque autre
 * colonne, son en-tête en note `texte-discret` (à la ligne au besoin) et sa valeur à droite ; dès accessibility3, l'en-tête
 * au-dessus de sa valeur, à 2, à gauche (entrée 35 : côte à côte, la valeur gardée entière coupait « Adversaires » dans le mot à
 * côté d'un rang long, mesuré dès AX3 par l'entrée 33) ; un élément par carte. Sans ligne : rien (l'écran dit la phrase de son
 * Bloc vide).
 */
export function Tableau({ colonnes, lignes }: { colonnes: readonly string[]; lignes: readonly LigneTableau[] }) {
  if (lignes.length === 0) return <EmptyView />
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        if (tailleAccessibilite(env.dynamicTypeSize)) {
          const empile = !PAIRES_COTE_A_COTE.includes(env.dynamicTypeSize)
          return (
            <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {lignes.flatMap((l, i) => {
                const premiere = l.cellules[0]
                const carte = (
                  <VStack
                    key={"l" + i}
                    alignment="leading"
                    spacing={TABLEAU.carte}
                    padding={TABLEAU.ligne}
                    frame={{ maxWidth: "infinity", alignment: "leading" }}
                    accessibilityElement
                    accessibilityLabel={l.voix}
                  >
                    {premiere === undefined || typeof premiere === "string" ? (
                      <Text {...TYPO.petitFort} monospacedDigit foregroundStyle={c.texte}>
                        {premiere ?? ""}
                      </Text>
                    ) : (
                      <Pastille c={c} valeur={premiere} />
                    )}
                    {colonnes.slice(1).map((titre, k) => {
                      const enTete = (
                        <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
                          {titre}
                        </Text>
                      )
                      return empile ? (
                        <VStack key={k} alignment="leading" spacing={TABLEAU.pile}>
                          {enTete}
                          {valeurCarte(c, l.cellules[k + 1])}
                        </VStack>
                      ) : (
                        <HStack key={k} alignment="firstTextBaseline" spacing={ECART_BARRE}>
                          {enTete}
                          <Spacer minLength={0} />
                          {valeurCarte(c, l.cellules[k + 1])}
                        </HStack>
                      )
                    })}
                  </VStack>
                )
                return i === 0 ? [carte] : [filet(c.fond, "f" + i), carte]
              })}
            </VStack>
          )
        }
        return (
          <Grid alignment="leading" horizontalSpacing={0} verticalSpacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <GridRow key="t" alignment="firstTextBaseline">
              {colonnes.map((titre, j) => (
                <Text
                  key={j}
                  {...TYPO.note}
                  foregroundStyle={c.texteDiscret}
                  multilineTextAlignment={j === 0 ? undefined : "trailing"}
                  padding={TABLEAU.enTete}
                  frame={j === 0 ? undefined : A_DROITE}
                  accessibilityHidden
                >
                  {titre}
                </Text>
              ))}
            </GridRow>
            {filet(c.bordure, "ft")}
            {lignes.flatMap((l, i) => {
              const rangee = (
                <GridRow key={"l" + i} alignment="firstTextBaseline">
                  {colonnes.map((_, j) => celluleLigne(c, l.cellules[j], j, l.voix))}
                </GridRow>
              )
              return i === 0 ? [rangee] : [filet(c.fond, "f" + i), rangee]
            })}
          </Grid>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── constat ───────────────────────────

/** Genre d'un Constat (EXPERIENCE.md, Component Patterns) : point fort ou à travailler. */
export type GenreConstat = "pointFort" | "aTravailler"
/** Étiquette de chaque genre (EXPERIENCE.md, Voice and Tone). */
export const ETIQUETTES_CONSTAT: Readonly<Record<GenreConstat, string>> = { pointFort: "Point fort", aTravailler: "À travailler" }
/** Constat (DESIGN.md, constat : `filet` ; maquette `Main` : marges et écart), en points. */
const CONSTAT = { filet: 3, vertical: 12, horizontal: 14, ecart: 4 } as const

/** Le gluon (U+2060, WORD JOINER) : invisible, sans largeur, il interdit le retour à la ligne là où il est ; écrit par son code. */
const GLUON = String.fromCharCode(0x2060)
/** L'espace insécable (U+00A0), de la largeur d'une espace : le mot qui la précède et ce qui la suit restent sur la même ligne. */
const INSECABLE = String.fromCharCode(0x00a0)
/** Une barre oblique prise entre deux caractères non blancs (« K/D », « KAY/O »), avec le caractère qui la précède. */
const BARRE_DANS_UN_MOT = /(\S)\/(?=\S)/g

const ESPACE_AVANT_PONCTUATION = / (?=[:;!?])/g








export function sansMauvaiseCoupure(phrase: string): string {
  return phrase.replace(BARRE_DANS_UN_MOT, (_tout: string, avant: string) => `${avant}/${GLUON}`).replace(ESPACE_AVANT_PONCTUATION, INSECABLE)
}

/**
 * Constat (DESIGN.md, constat ; EXPERIENCE.md, Component Patterns) : `surface`, filet supérieur de 3 en `bleu` pour un
 * point fort, en `orange` pour un point à travailler ; l'étiquette, « Point fort » ou « À travailler », en étiquette de
 * constat condensée, en capitales, de la couleur du filet ; dessous, à 4, la phrase en constat `texte`, sur autant de
 * lignes qu'il faut, coupée entre les mots seulement (sansMauvaiseCoupure, entrée 19) ; marges de 12 et 14 ; toute la
 * largeur. Un seul élément VoiceOver : « Point fort : phrase », la phrase reçue. Le titre « Ce que disent tes chiffres » et
 * la phrase sans constat sont à l'écran (entrée 19), le lien des constats aussi (entrées 20 et 32).
 */
export function Constat({ genre, phrase }: { genre: GenreConstat; phrase: string }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const accent = genre === "pointFort" ? c.bleu : c.orange
        const etiquette = ETIQUETTES_CONSTAT[genre]
        return (
          <VStack
            alignment="leading"
            spacing={CONSTAT.ecart}
            padding={{ vertical: CONSTAT.vertical, horizontal: CONSTAT.horizontal }}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            background={<RoundedRectangle cornerRadius={ARRONDIS.md} fill={melange(accent as string, c.surface as string, 0.16)} />}
            accessibilityElement
            accessibilityLabel={`${etiquette} : ${phrase}`}
          >
            <Text {...policeCondensee(TYPO.etiquetteConstat, enCapitales(etiquette))} foregroundStyle={accent}>
              {etiquette}
            </Text>
            <Text {...TYPO.constat} foregroundStyle={c.texte}>
              {sansMauvaiseCoupure(phrase)}
            </Text>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── sélecteur segmenté ───────────────────────────


export type Segment<T extends string> = { cle: T; libelle: string; parle?: string }

/** Des segments dans l'ordre des clés, aux libellés donnés. */
function segmentsDe<T extends string>(cles: readonly T[], libelles: Readonly<Record<T, string>>): Segment<T>[] {
  return cles.map((cle) => ({ cle, libelle: libelles[cle] }))
}

/** La période du périmètre commun (Évolution, entrées 17 et 22) : 7 jours, 30 jours, Acte, Tout, comme le Réglage du périmètre. */
export const SEGMENTS_PERIODE: readonly Segment<Periode>[] = segmentsDe<Periode>(["7j", "30j", "acte", "tout"], LIBELLES_PERIODE)
/** Le mode du périmètre commun (Parties, entrées 17 et 31) : Compétition, Non classé, Tout, comme le Réglage du périmètre. */
export const SEGMENTS_MODE: readonly Segment<Mode>[] = segmentsDe<Mode>(["competition", "non-classe", "tout"], LIBELLES_MODE)
/** Le côté de « Où tu meurs, où tu tues » et de « À quel moment tu meurs » (entrées 25 et 26) : Attaque, Défense. */
export const SEGMENTS_COTE: readonly Segment<Cote>[] = segmentsDe<Cote>(["attaque", "defense"], { attaque: "Attaque", defense: "Défense" })

/**
 * Sélecteur segmenté (DESIGN.md, selecteur-segmente ; EXPERIENCE.md, Component Patterns, Interaction Primitives) : choix
 * exclusif, effet immédiat, sans requête ni validation. Contrôlé : il montre `choisi` et appelle `onChoix` à l'appui
 * d'un autre segment (rien sur celui déjà choisi), sans rien garder ; l'écran tient le choix, et pour la période
 * d'Évolution et le mode de Parties c'est l'état unique du périmètre commun (entrée 17), que le Réglage du périmètre
 * règle aussi : les deux sont donc toujours d'accord. Colonnes égales, à 4 l'une de l'autre, dans un conteneur de rayon
 * 3 et de marge 4, `fond` dans un bloc (défaut) ou `surface` posé sur la page (`surPage`) ; actif : fond `segment-actif`
 * de rayon 2, libellé `blanc` en sous-onglet ; inactif : libellé `texte-discret` en sous-onglet inactif ; condensé, en
 * capitales jusqu'à trois mots, centré, à la ligne au besoin ; 44 de haut au moins, toute la case répondant à l'appui.
 * Dès la première taille d'accessibilité, les segments l'un sous l'autre, pleine largeur, le texte suivant toujours la
 * taille d'iOS ; `empile` : ainsi à toute taille, quand l'écran sait qu'un libellé ne tiendrait plus dans sa colonne (le
 * Récap dès xxLarge : « SEMAINE » en quatre colonnes, mesuré, epic-stats-recap entrée 7). VoiceOver : un bouton par segment,
 * qui lit son libellé, l'actif « sélectionné ». Sans segment : rien ; `choisi` absent des segments : aucun actif.
 */
export function SelecteurSegmente<T extends string>({ segments, choisi, onChoix, surPage = false, empile = false }: {
  segments: readonly Segment<T>[]; choisi: T | null; onChoix: (cle: T) => void; surPage?: boolean; empile?: boolean
}) {
  if (segments.length === 0) return <EmptyView />
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const fondConteneur = surPage ? c.surface : c.fond
        const boutons = segments.map((s) => {
          const actif = s.cle === choisi
          const capitales = enCapitales(s.libelle)
          const role = actif ? TYPO.sousOnglet : TYPO.sousOngletInactif
          // `contentShape` : toute la case répond à l'appui, pas seulement le libellé (comme la Barre d'onglets).
          return (
            <Button
              key={s.cle}
              buttonStyle="plain"
              action={() => { if (!actif) onChoix(s.cle) }}
              accessibilityLabel={s.parle ?? s.libelle}
              accessibilityAddTraits={actif ? "isSelected" : undefined}
            >
              <HStack contentShape="rect">
                <Text
                  {...policeCondensee(capitales ? role : { ...role, fontWeight: "bold" }, capitales)}
                  foregroundStyle={actif ? c.blanc : c.texteDiscret}
                  multilineTextAlignment="center"
                  frame={{ maxWidth: "infinity", minHeight: ESPACES.cible }}
                  background={actif ? <RoundedRectangle cornerRadius={ARRONDIS.sm} fill={c.segmentActif} /> : undefined}
                >
                  {s.libelle}
                </Text>
              </HStack>
            </Button>
          )
        })
        return empile || tailleAccessibilite(env.dynamicTypeSize) ? (
          <VStack
            spacing={ESPACES.segments}
            padding={ESPACES.segments}
            frame={{ maxWidth: "infinity" }}
            background={{ style: fondConteneur, shape: { type: "rect", cornerRadius: ARRONDIS.md } }}
          >
            {boutons}
          </VStack>
        ) : (
          <HStack
            spacing={ESPACES.segments}
            padding={ESPACES.segments}
            frame={{ maxWidth: "infinity" }}
            background={{ style: fondConteneur, shape: { type: "rect", cornerRadius: ARRONDIS.md } }}
          >
            {boutons}
          </HStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── puces de choix ───────────────────────────


export type Puce<T extends string> = { cle: T; libelle: string; parle: string }

/** Marge horizontale d'une puce (DESIGN.md, puces-choix : `padding-x`, et non les 12 de la maquette). */
const MARGE_PUCE = 10

/**
 * Un élément VoiceOver ajustable (EXPERIENCE.md, Accessibility Floor ; point 13 de « À vérifier au spike ») : Scripting
 * n'offrant aucune action ajustable, un `Stepper` du système, que VoiceOver lit « nom, valeur, ajustable » ; balayer vers
 * le haut appelle `onSuivant`, vers le bas `onPrecedent`. Invisible (opacité 0) : à poser derrière la vue qu'il remplace,
 * elle-même masquée à VoiceOver. Puces de choix ; Barre de sous-onglets (entrée 18).
 */
export function ElementAjustable({ nom, valeur, onSuivant, onPrecedent }: {
  nom: string; valeur: string; onSuivant: () => void; onPrecedent: () => void
}) {
  return (
    <Stepper
      title={nom}
      onIncrement={onSuivant}
      onDecrement={onPrecedent}
      opacity={0}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      accessibilityLabel={nom}
      accessibilityValue={valeur}
    />
  )
}

// ─────────────────────────── choix de manche (entrée 34) ───────────────────────────

/** Choix de manche (DESIGN.md, choix-manche), en points : taille des flèches ; écart entre les boutons et le libellé (maquette). */
const CHOIX_MANCHE = { fleche: 20, ecart: 8 } as const
/** Ce que VoiceOver lit des deux boutons (EXPERIENCE.md, Choix de manche). */
export const MANCHE_PRECEDENTE = "Manche précédente"
export const MANCHE_SUIVANTE = "Manche suivante"










export function ChoixDeManche({ libelle, auDebut, aLaFin, onPrecedente, onSuivante }: {
  libelle: string; auDebut: boolean; aLaFin: boolean; onPrecedente: () => void; onSuivante: () => void
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const capitales = enCapitales(libelle)
        const role = policeCondensee(TYPO.titreBloc, capitales)
        const texte = (
          <Text
            key="libelle"
            {...role}
            fontWeight={capitales ? role.fontWeight : "bold"}
            foregroundStyle={c.texte}
            multilineTextAlignment="center"
            frame={{ maxWidth: "infinity" }}
          >
            {libelle}
          </Text>
        )
        const fleche = (cle: string, sens: "left" | "right", inactive: boolean, dit: string, action: () => void) => (
          <Button key={cle} buttonStyle="plain" action={action} disabled={inactive} accessibilityLabel={dit}>
            <ZStack frame={{ width: ESPACES.cible, height: ESPACES.cible }} contentShape="rect">
              <RoundedRectangle cornerRadius={ARRONDIS.sm} stroke={c.bordure} />
              <Image systemName={`arrowtriangle.${sens}.fill`} font={CHOIX_MANCHE.fleche} foregroundStyle={inactive ? c.texteDiscret : c.texte} />
            </ZStack>
          </Button>
        )
        const precedente = fleche("precedente", "left", auDebut, MANCHE_PRECEDENTE, onPrecedente)
        const suivante = fleche("suivante", "right", aLaFin, MANCHE_SUIVANTE, onSuivante)
        return tailleAccessibilite(env.dynamicTypeSize) ? (
          <VStack spacing={CHOIX_MANCHE.ecart} frame={{ maxWidth: "infinity" }}>
            {texte}
            <HStack key="fleches" spacing={0}>
              {precedente}
              <Spacer />
              {suivante}
            </HStack>
          </VStack>
        ) : (
          <HStack spacing={CHOIX_MANCHE.ecart} frame={{ maxWidth: "infinity" }}>
            {precedente}
            {texte}
            {suivante}
          </HStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}














export function PucesDeChoix<T extends string>({ nom, puces, choisie, onChoix }: {
  nom: string; puces: readonly Puce<T>[]; choisie: T | null; onChoix: (cle: T) => void
}) {
  // La clé de la puce au centre de la rangée : seul état de la brique, jamais le choix, que tient l'écran.
  const [position, setPosition] = useState<string | null>(choisie)
  // La dernière puce touchée : son choix, revenu par les props, ne fait pas défiler.
  const touchee = useRef<string | null>(null)
  useEffect(() => {
    const t = touchee.current
    touchee.current = null
    if (t !== choisie && position !== choisie) setPosition(choisie)
  }, [choisie])
  if (puces.length === 0) return <EmptyView />
  const n = puces.length
  const i = puces.findIndex((p) => p.cle === choisie)
  const choisir = (cle: T) => {
    if (cle === choisie) return
    touchee.current = cle
    onChoix(cle)
  }
  const suivante = () => { if (i + 1 < n) onChoix(puces[i + 1].cle) }
  const precedente = () => { if (i > 0) onChoix(puces[i - 1].cle) }
  const valeur = i < 0 ? "aucun choix" : `${puces[i].parle}, ${i + 1} sur ${n}`
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const rangee = (
          <ScrollView
            axes="horizontal"
            scrollIndicator="hidden"
            scrollPosition={{ value: position, onChanged: (v) => setPosition(v === null ? null : String(v)), anchor: "center" }}
            accessibilityHidden={REPLIS.pucesEnBoutons ? undefined : true}
          >
            <HStack spacing={ESPACES.puces} scrollTargetLayout>
              {puces.map((p, k) => {
                const active = p.cle === choisie
                // Marge sur le texte, cadre et fond sur sa pile : le rendu ne dépend pas de l'ordre des modificateurs.
                return (
                  <Button
                    key={p.cle}
                    buttonStyle="plain"
                    action={() => choisir(p.cle)}
                    accessibilityLabel={p.parle}
                    accessibilityValue={`${k + 1} sur ${n}`}
                    accessibilityAddTraits={active ? "isSelected" : undefined}
                  >
                    <HStack
                      frame={{ minWidth: ESPACES.cible, minHeight: ESPACES.cible }}
                      background={active
                        ? <RoundedRectangle cornerRadius={ARRONDIS.sm} fill={c.texte} />
                        : <RoundedRectangle cornerRadius={ARRONDIS.sm} stroke={c.bordure} />}
                      contentShape="rect"
                    >
                      <Text {...(active ? TYPO.puce : TYPO.puceInactive)} foregroundStyle={active ? c.fond : c.texteDoux} padding={{ horizontal: MARGE_PUCE }}>
                        {p.libelle}
                      </Text>
                    </HStack>
                  </Button>
                )
              })}
            </HStack>
          </ScrollView>
        )
        if (REPLIS.pucesEnBoutons) return rangee
        return (
          <VStack
            alignment="leading"
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            background={<ElementAjustable nom={nom} valeur={valeur} onSuivant={suivante} onPrecedent={precedente} />}
          >
            {rangee}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}
