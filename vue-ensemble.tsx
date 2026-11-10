import {
  EnvironmentValuesReader, HStack, PathShape, Text, VStack, ZStack,
  type Color, type DynamicTypeSize, type Path2D, type Size, type VirtualNode,
} from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { ESPACES, TYPO, couleurs, policeCondensee, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import { Constat, couleurEvaluation, titreDeBloc } from "./dessin"
import {
  TIRET, constatsVueDEnsemble, tuiles as calculerTuiles,
  type CleChiffre, type ConstatsChoisis, type Mode, type Selection, type SourcesConstats, type Tuile,
} from "./metriques"
import type { Emplacement, EtatPerimetre, PropsEmplacement } from "./app"
// Entrée 20 : Courbe de la note et Ton niveau réel.
import { Image, Rectangle } from "scripting"
import { Bloc, CourbeDeLaNote, JaugeRR, Legende, legendeNote, sansMauvaiseCoupure, titreAffiche } from "./dessin"
import {
  NOTE, bouclierDit, courbeNote, ecartEnClair, niveauReel, nombreEnClair, valeurEnClair,
  type CourbeNote, type Evaluation, type Mesure, type NiveauReel, type RangMax, type RangMoyen, type TitreNote,
} from "./metriques"
import { cheminImage } from "./cartes"
import type { Partie } from "./reduction"
// Entrée 21 : Seul ou en duo, Profil de jeu et Attaque · défense.
import type { StyledText } from "scripting"
import { Barres, Radar, type Barre, type ItemLegende } from "./dessin"
import {
  AXE_LOBBYS, MIN_OCCURRENCES, STATS_COTES, chiffreCote, profilDeJeu, retenues, seulOuEnDuo,
  type BarreGroupe, type ChiffreCote, type CleGroupe, type ProfilDeJeu,
} from "./metriques"
import type { CumulAgent } from "./reduction"
// Entrée 32 : la Vue d'ensemble mène aux sous-onglets qui la détaillent.
import { CASE_APPUI, zoneDAppui, type CadreAppui, type Ouverture } from "./dessin"
import type { CleAxe, CleEvolution } from "./metriques"
import type { CleSousOnglet } from "./app"
// Entrée 10 de epic-stats-recap : « Préparer le récap » ouvre le Récap depuis la Vue d'ensemble.
import { BoutonPrincipal } from "./design"





































/** Écart entre le nom, la valeur, la Mini-courbe et l'écart d'une tuile, en points (celui de la maquette). */
const ECART_TUILE = 3
/** Mini-courbe (DESIGN.md, mini-courbe) : épaisseur du trait et hauteur dans une tuile ; limite des onglets, celle du SVG de la maquette. */
export const MINI_COURBE = { trait: 2, hauteur: 20, onglets: 4 } as const
/** Le titre qui coiffe les tuiles (EXPERIENCE.md, Accessibility Floor). */
export const TITRE_CHIFFRES = "Chiffres clés"

const MOINS = "\u2212"

/** Le nom que dit VoiceOver de chaque tuile (EXPERIENCE.md, Voice and Tone : « K/D », « ratio kills sur morts »). */
const NOMS_DITS: Readonly<Record<CleChiffre, string>> = {
  victoires: "Victoires",
  kd: "Ratio kills sur morts",
  score: "Score de combat",
  degats: "Dégâts par manche",
  ecartDegats: "Écart de dégâts par manche",
  tete: "Tirs à la tête",
  kast: "KAST",
  survie: "Survie",
  premiersKills: "Premiers kills par manche",
  clutchs: "Clutchs",
  ecos: "Écos gagnées",
  retakes: "Retakes",
}

/**
 * L'indice VoiceOver des tuiles dont le nom est un terme du jeu à définir (EXPERIENCE.md, Tuile de chiffre clé : KAST,
 * clutch, retake ; aucune tuile ne compte les aces), selon Définitions des métriques.
 */
export const INDICES: Readonly<Partial<Record<CleChiffre, string>>> = {
  kast: "Part des manches avec un kill, un assist, une survie ou une mort échangée.",
  clutchs: "Part des manches gagnées quand tu restes le dernier en vie de ton équipe, face à un adversaire ou plus.",
  retakes: "Part des manches de défense gagnées après la pose du spike par l'adversaire.",
}

/** La référence d'un écart telle que l'écrit metriques.ts, puis telle que la dit VoiceOver (Voice and Tone : « vs lobby », « par rapport à tes lobbys »). */
const REFERENCES_DITES: readonly (readonly [string, string])[] = [
  ["vs lobby", "par rapport à tes lobbys"],
  ["vs semaine d'avant", "par rapport à la semaine d'avant"],
  ["vs mois d'avant", "par rapport au mois d'avant"],
  ["vs acte d'avant", "par rapport à l'acte d'avant"],
]


function signeDit(texte: string): string {
  if (texte.startsWith("+")) return `plus ${texte.slice(1)}`
  if (texte.startsWith(MOINS)) return `moins ${texte.slice(1)}`
  return texte
}





function ecartDit(ecart: string): string {
  let texte = ecart
  for (const [ecrit, dit] of REFERENCES_DITES) {
    const i = texte.indexOf(` ${ecrit}`)
    if (i >= 0) {
      texte = texte.slice(0, i + 1) + dit + texte.slice(i + 1 + ecrit.length)
      break
    }
  }
  texte = texte.replace(/(\d+)\u00a0pts?\b/, (_tout: string, n: string) => `${n} point${Number(n) > 1 ? "s" : ""}`)
  return signeDit(texte)
}








export function phraseTuile(t: Tuile): string {
  const valeur = t.valeur === TIRET ? "aucune valeur" : signeDit(t.valeur)
  const suite = t.enEntier ? ecartDit(t.enEntier) : t.ecart !== null ? ecartDit(t.ecart) : t.effectif
  return `${NOMS_DITS[t.cle]} : ${valeur}${suite ? `, ${suite}` : ""}.`
}

/**
 * Colonnes de la grille selon la taille du texte (DESIGN.md, Layout & Spacing) : 3 ; dès la première taille
 * d'accessibilité, 2, puis 1 dès la troisième, où le plus long nom d'un seul mot (« VICTOIRES ») ne tiendrait plus dans
 * une demi-largeur.
 */
export function colonnesChiffres(taille: DynamicTypeSize | undefined): number {
  if (!tailleAccessibilite(taille)) return 3
  return taille === "accessibility1" || taille === "accessibility2" ? 2 : 1
}

/**
 * Le tracé d'une Mini-courbe à la taille reçue : un point par valeur, également espacés d'un bord à l'autre, le plus
 * ancien à gauche ; de son plus bas à son plus haut point sur la hauteur moins le demi-trait, tous égaux au milieu ; une
 * valeur absente ou non finie coupe le trait ; moins de deux valeurs lisibles : rien.
 */
export function traceMiniCourbe(p: Path2D, s: Size, points: readonly (number | null)[], trait: number) {
  const lisibles = points.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (lisibles.length < 2) return
  const bas = Math.min(...lisibles), haut = Math.max(...lisibles)
  const marge = trait / 2, n = points.length
  const x = (i: number) => (i / (n - 1)) * s.width
  const y = (v: number) => (haut === bas ? s.height / 2 : marge + ((haut - v) / (haut - bas)) * (s.height - 2 * marge))
  let relie = false
  for (let i = 0; i < n; i++) {
    const v = points[i]
    if (typeof v !== "number" || !Number.isFinite(v)) {
      relie = false
      continue
    }
    const q = { x: x(i), y: y(v) }
    if (relie) p.addLine(q)
    else p.move(q)
    relie = true
  }
}

/**
 * Mini-courbe (DESIGN.md, mini-courbe ; EXPERIENCE.md, Mini-courbe) : trait de 2 sans axe, à la couleur reçue (couleur
 * d'évaluation, ou `texte-discret` sans écart), sur toute la largeur donnée et `hauteur` (20 dans une tuile, 34 dans
 * Évolution) ; angles vifs, onglets limités à 4 ; tracée par `PathShape`, dont `draw` reçoit la taille de la vue. Sans
 * deux points à relier (moins de 5 parties), rien de tracé, la hauteur gardée. Masquée à VoiceOver : valeur et écart
 * sont écrits.
 */
export function MiniCourbe({ points, couleur, hauteur = MINI_COURBE.hauteur }: {
  points: readonly (number | null)[]; couleur: Color; hauteur?: number
}) {
  return (
    <PathShape
      stroke={{ shapeStyle: couleur, strokeStyle: { lineWidth: MINI_COURBE.trait, lineJoin: "miter", mitterLimit: MINI_COURBE.onglets } }}
      draw={(p, s) => traceMiniCourbe(p, s, points, MINI_COURBE.trait)}
      frame={{ height: hauteur }}
      accessibilityHidden
    />
  )
}





function dessousDe(t: Tuile): string | null {
  return t.ecart ?? t.effectif
}







function nomDeTuile(c: Palette, t: Tuile, fantome: boolean): VirtualNode {
  return (
    <Text
      key={t.cle}
      {...policeCondensee(TYPO.etiquette)}
      foregroundStyle={c.texteDiscret}
      opacity={fantome ? 0 : undefined}
      accessibilityHidden={fantome ? true : undefined}
    >
      {titreAffiche(t.libelle)}
    </Text>
  )
}

/** Le texte du dessous d'une tuile, en `corps`, de sa couleur ; `fantome` : invisible et masqué à VoiceOver, pour la hauteur seule. */
function texteDessous(texte: string, couleur: Color, fantome: boolean, cle: string): VirtualNode {
  return (
    <Text
      key={cle}
      {...TYPO.corps}
      foregroundStyle={couleur}
      opacity={fantome ? 0 : undefined}
      accessibilityHidden={fantome ? true : undefined}
    >
      {texte}
    </Text>
  )
}

/**
 * Tuile de chiffre clé (DESIGN.md, tuile-chiffre-cle ; EXPERIENCE.md, Tuile de chiffre clé) : sur `surface`, sans coin
 * ni rayon, marge de 10, ses éléments à 3 l'un de l'autre, à gauche : le nom, toujours en capitales (nomDeTuile) ; la valeur
 * en `valeur` `texte`, chiffres à chasse fixe (« — » sous le seuil, jamais en couleur) ; la Mini-courbe ; dessous, l'écart
 * en `corps` à la couleur d'évaluation, ou l'effectif de Victoires ; sans écart, Mini-courbe et effectif en
 * `texte-discret`. Toute la largeur et toute la hauteur qu'on lui donne. `rangee` : les tuiles de sa rangée, elle
 * comprise ; elle porte leurs noms et leurs textes du dessous, invisibles et masqués à VoiceOver, pour que chaque case
 * ait la hauteur de la plus haute de la rangée : noms, valeurs, courbes et écarts s'alignent d'une tuile à l'autre. Un
 * seul élément VoiceOver, qui lit phraseTuile, avec l'indice de KAST, Clutchs et Retakes. Aucune action ici : dans la Vue
 * d'ensemble, la grille l'entoure du bouton qui ouvre le sous-onglet qui la détaille (entrée 32).
 */
export function TuileChiffreCle({ tuile, rangee }: { tuile: Tuile; rangee?: readonly Tuile[] }) {
  const voisines = (rangee ?? []).filter((v) => v.cle !== tuile.cle)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const accent = tuile.ecart !== null ? couleurEvaluation(c, tuile.evaluation) : c.texteDiscret
        const dessous = dessousDe(tuile)
        const fantomes: VirtualNode[] = []
        for (const v of voisines) {
          const d = dessousDe(v)
          if (d !== null) fantomes.push(texteDessous(d, c.texteDiscret, true, v.cle))
        }
        return (
          <VStack
            alignment="leading"
            spacing={ECART_TUILE}
            padding={ESPACES.cellule}
            frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" }}
            background={c.surface}
            accessibilityElement
            accessibilityLabel={phraseTuile(tuile)}
            accessibilityHint={INDICES[tuile.cle]}
          >
            <ZStack alignment="topLeading">
              {voisines.map((v) => nomDeTuile(c, v, true))}
              {nomDeTuile(c, tuile, false)}
            </ZStack>
            <Text {...TYPO.valeur} monospacedDigit foregroundStyle={c.texte}>
              {tuile.valeur}
            </Text>
            <MiniCourbe points={tuile.miniCourbe} couleur={accent} />
            {dessous !== null || fantomes.length > 0 ? (
              <ZStack alignment="topLeading">
                {fantomes}
                {dessous !== null ? texteDessous(dessous, accent, false, tuile.cle) : null}
              </ZStack>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Grille des Tuiles de chiffre clé (DESIGN.md, Layout & Spacing) : dans l'ordre reçu (celui de la Vue d'ensemble), en
 * rangées de 3 tuiles (2, puis 1, aux tailles d'accessibilité : colonnesChiffres), à 6 l'une de l'autre et d'une rangée
 * à l'autre ; chaque rangée tenue à sa hauteur idéale, ses tuiles à toute cette hauteur et à parts égales de la largeur.
 * VoiceOver lit les tuiles rangée après rangée. Entrée 32 : `ouvrir` donné (Vue d'ensemble), chaque tuile est entourée d'un
 * bouton plain (zoneDAppui, case CASE_TUILE : toute la tuile, 44 de haut au moins) qui ouvre son sous-onglet
 * (DESTINATIONS_TUILES), lu « {phrase de la tuile} Ouvre Évolution. », avec son indice ; sans lui, les tuiles seules.
 */
export function GrilleChiffresCles({ tuiles, ouvrir }: { tuiles: readonly Tuile[]; ouvrir?: PropsEmplacement["ouvrir"] }) {
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize"]}>
      {(env) => {
        const n = colonnesChiffres(env.dynamicTypeSize)
        const rangees: Tuile[][] = []
        for (let i = 0; i < tuiles.length; i += n) rangees.push(tuiles.slice(i, i + n))
        return (
          <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {rangees.map((r, i) => (
              <HStack key={i} alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
                {r.map((t) => {
                  if (!ouvrir) return <TuileChiffreCle key={t.cle} tuile={t} rangee={r} />
                  const o = ouverture(DESTINATIONS_TUILES[t.cle], ouvrir)
                  return zoneDAppui(
                    { cle: t.cle, action: o.action, voix: `${phraseTuile(t)} ${o.dit}`, indice: INDICES[t.cle], cadre: CASE_TUILE },
                    <TuileChiffreCle tuile={t} rangee={r} />,
                  )
                })}
              </HStack>
            ))}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** La phrase d'un périmètre sans partie (EXPERIENCE.md, State Patterns : une phrase à la place de la liste), aux mots du récap. */
const SANS_PARTIE: Readonly<Record<Mode, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  "non-classe": "Aucune partie non classée gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}

/**
 * Les douze tuiles d'une sélection (metriques.ts : tuiles) ; [] sans partie dans le périmètre ; null si le calcul lève (une
 * partie gardée malformée), dit en console : la section se retire, l'onglet reste. Agrégat du périmètre (« tuiles »), gardé
 * avec sa sélection par l'état de l'onglet (entrée 17) : calculé, et dit en console, une fois par périmètre et par données.
 */
export function tuilesDeLaSelection(sel: Selection): Tuile[] | null {
  try {
    return sel.parties.length === 0 ? [] : calculerTuiles(sel)
  } catch (e) {
    console.log(`chiffres clés : calcul impossible (${e})`)
    return null
  }
}

/**
 * Section « Chiffres clés » de l'onglet Stats (entrée 38) : le titre en titre de section, en capitales (titreDeBloc, entrée
 * 42), annoncé comme en-tête (EXPERIENCE.md, Accessibility Floor) ; à 6 dessous, la grille des douze tuiles du périmètre commun
 * (`perimetre`, l'état de l'onglet, entrée 17 : sa sélection, ses tuiles gardées avec elle), ou, sans partie dans le
 * périmètre, la phrase de son mode en `corps` `texte-doux`. Le périmètre lui-même, la Ligne d'état le dit (entrée 17) :
 * plus sous le titre. Sans lecture ni calcul au rendu ; sans sélection, ou un calcul qui lève : rien. Entrée 32 : `ouvrir`
 * donné (Vue d'ensemble), chaque tuile ouvre son sous-onglet (GrilleChiffresCles) ; le titre ne s'ouvre pas.
 */
export function ChiffresCles({ perimetre, ouvrir }: { perimetre: EtatPerimetre; ouvrir?: PropsEmplacement["ouvrir"] }) {
  const liste = perimetre.agregat("tuiles", tuilesDeLaSelection)
  if (liste === null) return null
  const mode = perimetre.perimetre.mode
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {titreDeBloc(c, TITRE_CHIFFRES, { niveau: "section" })}
            {liste.length === 0 ? (
              <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
                {SANS_PARTIE[mode]}
              </Text>
            ) : (
              <GrilleChiffresCles tuiles={liste} ouvrir={ouvrir} />
            )}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Le titre des Constats de la Vue d'ensemble (EXPERIENCE.md, Information Architecture, Voice and Tone ; maquette Main). */
export const TITRE_CONSTATS = "Ce que disent tes chiffres"
/** Ce que le titre des Constats prend au-dessus de lui, en plus de l'écart entre blocs (maquette Main : marge de 4). */
const AU_DESSUS_CONSTATS = 4

/**
 * Les Constats de la Vue d'ensemble sur une sélection (metriques.ts : constatsVueDEnsemble, entrée 12), sur tout l'historique
 * tenu et ses cumuls par agent ; null si le calcul lève, dit en console : la section se retire, les tuiles restent. Agrégat du
 * périmètre (« constats »), gardé avec sa sélection par l'état de l'onglet (entrée 17) : calculé, et dit en console, une fois
 * par périmètre et par données.
 */
export function constatsDeLaSelection(sel: Selection, sources: SourcesConstats): ConstatsChoisis | null {
  try {
    return constatsVueDEnsemble(sel, sources)
  } catch (e) {
    console.log(`constats : calcul impossible (${e})`)
    return null
  }
}

/**
 * Les Constats que montre la Vue d'ensemble : null sans sélection (aucun calcul), pour un périmètre sans partie (les Chiffres
 * clés le disent déjà par leur phrase), ou si le calcul lève.
 */
function constatsAMontrer({ donnees, perimetre }: Pick<PropsEmplacement, "donnees" | "perimetre">): ConstatsChoisis | null {
  const sel = perimetre.selection
  if (sel === null || sel.parties.length === 0) return null
  return perimetre.agregat("constats", (s) => constatsDeLaSelection(s, { historique: donnees.parties, cumuls: donnees.cumuls }))
}

/**
 * Ce que disent tes chiffres (EXPERIENCE.md, Component Patterns : Constat ; DESIGN.md, constat ; maquette Main) : le titre en
 * titre de section, en capitales comme tout titre de bloc (titreDeBloc, entrée 42 ; DESIGN.md, Typography), annoncé comme
 * en-tête, 4 au-dessus de lui ; dessous, à 6, un Constat par
 * constat choisi, points forts d'abord (au plus un Point fort et deux À travailler, moins s'il y en a moins), ou, sans
 * constat, la phrase du module en `corps` `texte-doux`. Aucune action : la section ne s'ouvre pas (Information Architecture).
 * Rien sans constats à montrer (constatsAMontrer). Entrée 32 : sa pile porte la clé CLE_CONSTATS (`.id()` de SwiftUI), où le
 * lien des constats fait défiler la page.
 */
export function CeQueDisentTesChiffres({ donnees, perimetre }: Pick<PropsEmplacement, "donnees" | "perimetre">) {
  const choisis = constatsAMontrer({ donnees, perimetre })
  if (choisis === null) return null
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack key={CLE_CONSTATS} alignment="leading" spacing={ESPACES.grille} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            {titreDeBloc(c, TITRE_CONSTATS, { niveau: "section", auDessus: AU_DESSUS_CONSTATS })}
            {choisis.constats.length === 0 ? (
              <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
                {choisis.aucun}
              </Text>
            ) : (
              choisis.constats.map((k) => <Constat key={k.cle} genre={k.genre} phrase={k.phrase} />)
            )}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── entrée 20 : ta note Valorant et ton niveau réel ───────────────────────────

/** Le titre de la Courbe de la note, avant le nombre de ses parties (EXPERIENCE.md, Information Architecture, Voice and Tone). */
export const TITRE_NOTE = "Ta note Valorant"
/** Le titre de Ton niveau réel (EXPERIENCE.md, Information Architecture, Voice and Tone). */
export const TITRE_NIVEAU = "Ton niveau réel"
/** La note fixe du bloc de la note, gardée sans partie notée (EXPERIENCE.md, State Patterns, Note officielle absente ; maquette Main). */
export const NOTE_FIXE = "La note officielle que Valorant affiche en fin de partie, en compétition. Elle existe depuis septembre 2026."
/** Les libellés des rangs moyens de Ton niveau réel (maquette Main). */
export const LIBELLE_ALLIES = "Tes alliés, en moyenne"
export const LIBELLE_ADVERSAIRES = "Tes adversaires, en moyenne"


const INSECABLE = String.fromCharCode(0xa0)
/**
 * Ton niveau réel (DESIGN.md, embleme-rang ; maquette Main) : côté de l'Emblème ; écart entre l'emblème et sa colonne ; entre
 * les éléments de la colonne ; entre les deux rangs moyens ; entre le libellé et la valeur d'un rang moyen.
 */
const NIVEAU = { embleme: 88, aCote: 14, colonne: 6, moyens: 8, libelle: 2 } as const
/** Écart entre la vedette et son écart : 10 sur leur ligne de base (maquette Main) ; 2 l'un sous l'autre, aux tailles d'accessibilité. */
const ECART_VEDETTE = { ligne: 10, pile: 2 } as const

const RR_SIGNE: Mesure = { genre: "nombre", decimales: 0, variation: "absolue" }






export function titreNote(n: number): string {
  if (n <= 0) return TITRE_NOTE
  return `${TITRE_NOTE}${INSECABLE}· ${nombreEnClair(n, 0)} ${n > 1 ? "parties classées" : "partie classée"}`
}







export function phraseSousVedette(c: CourbeNote): string | null {
  const n = c.points.length
  if (n === 0 || c.moyenne === null) return null
  const v = (x: number) => valeurEnClair(x, NOTE.mesure)
  const note = c.test !== null ? `passe de ${v(c.test.ancien)} à ${v(c.test.recent)} en moyenne`
    : n > 1 ? `est de ${v(c.moyenne)} en moyenne` : `est de ${v(c.moyenne)}`
  const lobbys = c.bande === null ? "" : ` ; celle de tes lobbys tourne autour de ${v(c.bande.centre)}`
  return `Ta note de fin de partie ${note}${lobbys}.`
}

/** La couleur de l'écart en vedette, celle de son titre : bleu pour « Tu progresses », orange pour « Tu baisses », texte-doux sinon. */
function couleurTitreNote(c: Palette, titre: TitreNote): Color {
  return titre === "Tu progresses" ? c.bleu : titre === "Tu baisses" ? c.orange : c.texteDoux
}

/**
 * La Courbe de la note sur tout l'historique tenu (metriques.ts : courbeNote, entrée 4), quel que soit le périmètre ; null si le
 * calcul lève, dit en console : le bloc se retire, le reste de la Vue d'ensemble demeure. Agrégat du périmètre (« courbeNote »),
 * calculé, et dit en console, une fois par périmètre et par données.
 */
export function courbeNoteDe(historique: readonly Partie[]): CourbeNote | null {
  try {
    return courbeNote(historique)
  } catch (e) {
    console.log(`courbe de la note : calcul impossible (${e})`)
    return null
  }
}

/** Ton niveau réel et le chemin entier de l'Emblème de ton palier (null : non classé, ou ressource absente). */
export type NiveauAffiche = { niveau: NiveauReel; embleme: string | null }

/**
 * Ton niveau réel sur une sélection (metriques.ts : niveauReel, entrée 5 : rang gardé, rangs moyens du périmètre) et l'Emblème
 * de son palier, tiré des ressources des stats (`paliers`, chemin entier par cheminImage) ; null si le calcul lève, dit en
 * console : le bloc se retire. Agrégat du périmètre (« niveauReel »), une fois par périmètre et par données.
 */
export function niveauDeLaSelection(donnees: Pick<PropsEmplacement["donnees"], "rang" | "ressources">, sel: Selection): NiveauAffiche | null {
  try {
    const niveau = niveauReel(donnees.rang, sel)
    const palier = niveau.palier === null ? null : donnees.ressources.paliers[String(niveau.palier)] ?? null
    return { niveau, embleme: cheminImage(palier === null ? null : palier.embleme) }
  } catch (e) {
    console.log(`ton niveau réel : calcul impossible (${e})`)
    return null
  }
}


export function valeurJauge(rr: number): string {
  const n = nombreEnClair(rr, 0)
  return rr <= 100 ? `${n}${INSECABLE}/${INSECABLE}100${INSECABLE}RR` : `${n}${INSECABLE}RR`
}


export function derniereJauge(n: NiveauReel): { texte: string; evaluation: Evaluation } | null {
  if (n.derniere === null) return null
  return { texte: ecartEnClair(n.derniere, RR_SIGNE), evaluation: n.derniere > 0 ? "fort" : n.derniere < 0 ? "faible" : "neutre" }
}

/** Ticket 4.52 : la phrase VoiceOver de Ton niveau réel, tes boucliers de rang dits à la fin quand l'écran les montre. */
export function phraseNiveauAffichee(n: NiveauReel): string {
  const b = bouclierDit(n.boucliers ?? null)
  return b === null ? n.phrase : `${n.phrase} ${b[0].toUpperCase()}${b.slice(1)}.`
}


export function ligneRangMax(max: RangMax): string {
  const acte = max.acte === null ? "" : `${INSECABLE}· ${max.acte.libelle.split(" ").join(INSECABLE)}`
  return `Rang max${INSECABLE}: ${max.rang}${acte}`
}

/**
 * Courbe de la note de la Vue d'ensemble (entrée 20 ; DESIGN.md, bloc, courbe-note, Typography ; EXPERIENCE.md, Courbe de la
 * note, Note officielle absente, Accessibility Floor ; maquette Main) : Bloc coin bas titré par la brique (titreNote, dit titreNoteDit) ; dès 10
 * parties, la vedette (le titre du module, condensé, en capitales) et, sur sa ligne de base, l'écart du module tel quel à la
 * couleur du titre, l'un sous l'autre aux tailles d'accessibilité ; la phrase sous la vedette en corps texte-doux ; la Courbe de
 * la note telle que la rend courbeNote ; sa Légende. Ces quatre-là, un seul élément VoiceOver qui lit la phrase du module. La
 * note fixe du Bloc dessous, toujours ; seule sous le titre sans partie notée.
 */
export function TaNoteValorant({ courbe }: { courbe: CourbeNote }) {
  const n = courbe.points.length
  const phrase = phraseSousVedette(courbe)
  const titre = courbe.titre, ecart = courbe.ecart
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        // L'écart garde sa place (layoutPriority) : c'est la vedette qui passe à la ligne.
        const vedette = titre === null || ecart === null ? null : [
          <Text key="titre" {...policeCondensee(TYPO.vedette)} foregroundStyle={c.texte}>
            {titre}
          </Text>,
          <Text key="ecart" {...policeCondensee(TYPO.ecartVedette, false)} monospacedDigit foregroundStyle={couleurTitreNote(c, titre)} layoutPriority={1}>
            {ecart}
          </Text>,
        ]
        return (
          <Bloc titre={titreNote(n)} titreDit={n > 0 ? titreNoteDit(n) : undefined} coin="bas" note={NOTE_FIXE}>
            {n > 0 ? (
              <VStack
                key="note"
                alignment="leading"
                spacing={ESPACES.dansBloc}
                frame={{ maxWidth: "infinity", alignment: "leading" }}
                accessibilityElement
                accessibilityLabel={courbe.phrase ?? undefined}
              >
                {vedette === null ? null : grand ? (
                  <VStack key="vedette" alignment="leading" spacing={ECART_VEDETTE.pile}>
                    {vedette}
                  </VStack>
                ) : (
                  <HStack key="vedette" alignment="firstTextBaseline" spacing={ECART_VEDETTE.ligne}>
                    {vedette}
                  </HStack>
                )}
                {phrase !== null ? (
                  <Text key="phrase" {...TYPO.corps} foregroundStyle={c.texteDoux}>
                    {sansMauvaiseCoupure(phrase)}
                  </Text>
                ) : null}
                <CourbeDeLaNote key="graphique" points={courbe.points} bande={courbe.bande} phrase={courbe.phrase} />
                <Legende key="legende" items={legendeNote(courbe)} />
              </VStack>
            ) : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}












export function TonNiveauReel({ niveau, embleme }: NiveauAffiche) {
  const dit = bouclierDit(niveau.boucliers ?? null)
  const boucliers = dit === null ? null : dit[0].toUpperCase() + dit.slice(1)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const grand = tailleAccessibilite(env.dynamicTypeSize)
        const colonne = (
          <VStack key="colonne" alignment="leading" spacing={NIVEAU.colonne} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text {...policeCondensee(TYPO.rang)} foregroundStyle={c.texte}>
              {niveau.rang}
            </Text>
            {niveau.classe && niveau.rr !== null ? (
              <JaugeRR rr={niveau.rr} valeur={valeurJauge(niveau.rr)} derniere={derniereJauge(niveau)} voix={niveau.phrase} />
            ) : null}
            {niveau.max !== null ? (
              <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
                {ligneRangMax(niveau.max)}
              </Text>
            ) : null}
            {/* Ticket 4.52 : tes boucliers de rang (mmr v3), seulement quand ton palier est protégé. */}
            {boucliers !== null ? (
              <Text {...TYPO.petit} foregroundStyle={c.texteDoux}>
                {boucliers}
              </Text>
            ) : null}
          </VStack>
        )
        const image = embleme === null ? null : (
          <Image key="embleme" filePath={embleme} resizable scaleToFit frame={{ width: NIVEAU.embleme, height: NIVEAU.embleme }} accessibilityHidden />
        )
        const rangee = image === null ? colonne : grand ? (
          <VStack key="rangee" alignment="leading" spacing={NIVEAU.aCote}>
            {image}
            {colonne}
          </VStack>
        ) : (
          <HStack key="rangee" alignment="center" spacing={NIVEAU.aCote}>
            {image}
            {colonne}
          </HStack>
        )
        const moyen = (cle: string, libelle: string, r: RangMoyen | null) => (
          <VStack key={cle} alignment="leading" spacing={NIVEAU.libelle} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
              {libelle}
            </Text>
            <Text {...TYPO.ligne} foregroundStyle={c.texte}>
              {r === null ? TIRET : r.rang}
            </Text>
          </VStack>
        )
        const moyens = [moyen("allies", LIBELLE_ALLIES, niveau.allies), moyen("adversaires", LIBELLE_ADVERSAIRES, niveau.adversaires)]
        return (
          <Bloc titre={TITRE_NIVEAU} coin="haut">
            <VStack
              key="niveau"
              alignment="leading"
              spacing={ESPACES.dansBloc}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              accessibilityElement
              accessibilityLabel={phraseNiveauAffichee(niveau)}
            >
              {rangee}
              <Rectangle key="filet" fill={c.bordure} frame={{ height: 1 }} />
              {grand ? (
                <VStack key="moyens" alignment="leading" spacing={NIVEAU.moyens}>
                  {moyens}
                </VStack>
              ) : (
                <HStack key="moyens" alignment="top" spacing={NIVEAU.moyens}>
                  {moyens}
                </HStack>
              )}
            </VStack>
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── entrée 21 : seul ou en duo, profil de jeu, attaque · défense ───────────────────────────

/** Le titre de Seul ou en duo (EXPERIENCE.md, Information Architecture ; maquette Main). */
export const TITRE_GROUPE = "Seul ou en duo"
/** Le titre du Profil de jeu (EXPERIENCE.md, Information Architecture ; maquette Main : titre de section). */
export const TITRE_PROFIL = "Profil de jeu"
/** Le titre d'Attaque · défense, espace insécable devant « · » ; ce qu'en dit VoiceOver (maquette Main : « Attaque et défense »). */
export const TITRE_COTES = `Attaque${INSECABLE}· défense`
export const TITRE_COTES_DIT = "Attaque et défense"
/** Ce que montrent les barres de Seul ou en duo, en tête de la phrase de dessous (maquette Main). */
export const PHRASE_GROUPE = "Victoires selon ton groupe."
/** Ce que montrent les barres d'Attaque · défense, en tête de la phrase de dessous. */
export const PHRASE_COTES = "Manches gagnées par côté."
/**
 * Un périmètre aux parties sans manche à côté lue (EXPERIENCE.md, Aucune partie dans la période ; mots du sous-onglet Attaque ·
 * défense, entrée 29) : aucune partie des files complètes (escarmouche, deathmatch), ou aucune qui dise ses côtés.
 */
export const SANS_COTES_FILES = "Aucune partie de cette période ne compte pour les côtés : ni l'escarmouche ni le deathmatch n'en ont."
export const SANS_COTES_LUS = "Aucune partie de cette période ne dit ses côtés."
/** La Légende du Radar (maquette Main) : toi en trait plein, tes lobbys, qui valent 50, en tirets (DESIGN.md, legende). */
export const LEGENDE_PROFIL: readonly ItemLegende[] = [
  { marque: "trait", libelle: "Toi" },
  { marque: "tirets", libelle: `Moyenne de tes lobbys${INSECABLE}(${AXE_LOBBYS})` },
]

const GROUPE_DANS_LA_PHRASE: Readonly<Record<CleGroupe, string>> = { seul: "seul", duo: "en duo", groupe: "en groupe de 3 et plus" }


function effectifDit(n: number, un: string, plusieurs: string): string {
  return `${nombreEnClair(n, 0)} ${n > 1 ? plusieurs : un}`
}

/**
 * Seul ou en duo sur une sélection (metriques.ts : seulOuEnDuo, entrée 5) ; null sans partie (aucun calcul : les Chiffres clés disent
 * la phrase du mode) ou si le calcul lève, dit en console : le bloc se retire. Agrégat du périmètre (« seulOuEnDuo »), calculé une fois
 * par périmètre et par données.
 */
export function groupesDeLaSelection(sel: Selection): BarreGroupe[] | null {
  try {
    return sel.parties.length === 0 ? null : seulOuEnDuo(sel)
  } catch (e) {
    console.log(`seul ou en duo : calcul impossible (${e})`)
    return null
  }
}

/**
 * Le Profil de jeu sur une sélection (metriques.ts : profilDeJeu, entrée 6), sur tous les cumuls par agent tenus ; null sans partie ou
 * si le calcul lève, dit en console. Agrégat du périmètre (« profilDeJeu »), une fois par périmètre et par données.
 */
export function profilDeLaSelection(sel: Selection, cumuls: readonly CumulAgent[]): ProfilDeJeu | null {
  try {
    return sel.parties.length === 0 ? null : profilDeJeu(sel, cumuls)
  } catch (e) {
    console.log(`profil de jeu : calcul impossible (${e})`)
    return null
  }
}

/** Attaque · défense d'une sélection : tes manches gagnées de chaque côté (chiffreCote), et, sans manche à côté lue, la phrase qui le dit. */
export type CotesAffichees = { attaque: ChiffreCote; defense: ChiffreCote; vide: string | null }

/**
 * Attaque · défense sur une sélection (metriques.ts : chiffreCote, entrée 7, manches en attaque et en défense, stats d'équipe face à
 * ta période précédente) ; sans manche à côté lue, `vide` dit pourquoi (SANS_COTES_FILES, SANS_COTES_LUS) ; null sans partie ou si le
 * calcul lève, dit en console. Agrégat du périmètre (« manchesParCote »), une fois par périmètre et par données.
 */
export function cotesDeLaSelection(sel: Selection): CotesAffichees | null {
  try {
    if (sel.parties.length === 0) return null
    const attaque = chiffreCote(sel, "manchesAttaque"), defense = chiffreCote(sel, "manchesDefense")
    const lus = attaque.sommes.parties > 0 || defense.sommes.parties > 0
    const vide = lus ? null : retenues(sel.parties, STATS_COTES.manchesAttaque.files).length === 0 ? SANS_COTES_FILES : SANS_COTES_LUS
    return { attaque, defense, vide }
  } catch (e) {
    console.log(`attaque · défense : calcul impossible (${e})`)
    return null
  }
}







export function voixGroupe(b: BarreGroupe): string {
  const n = b.victoires.parties
  const tete = n === 0 ? `${b.libelle}, aucune partie` : `${b.libelle}, ${effectifDit(n, "partie", "parties")}`
  const victoires = n === 0 ? "" : b.victoires.valeur !== null ? ` : ${b.victoires.texte} de victoires` : ` : victoires, ${b.victoires.texte}`
  return `${tete}${victoires}. Ratio kills sur morts : ${b.kd.texte === TIRET ? "aucune valeur" : b.kd.texte}.`
}






export function barresGroupe(groupes: readonly BarreGroupe[]): Barre[] {
  return groupes.map((b) => ({
    libelle: `${b.libelle}${INSECABLE}· ${nombreEnClair(b.victoires.parties, 0)}`,
    valeur: b.victoires.texte,
    part: b.victoires.valeur,
    evaluation: b.victoires.evaluation,
    voix: voixGroupe(b),
  }))
}


export function phraseGroupe(groupes: readonly BarreGroupe[]): string {
  return `${PHRASE_GROUPE} K/D : ${groupes.map((b) => `${b.kd.texte} ${GROUPE_DANS_LA_PHRASE[b.cle]}`).join(", ")}.`
}

/**
 * Seul ou en duo (entrée 21 ; DESIGN.md, bloc, barre, Layout & Spacing : bloc serré ; EXPERIENCE.md, Barre, Trop peu de parties,
 * Accessibility Floor ; maquette Main) : Bloc serré, sans coin, titre de bloc par la brique ; les Barres de tes victoires selon ton
 * groupe (barresGroupe), une par catégorie que rend le module (le groupe de 3 et plus dès 3 parties) ; dessous, la phrase du K/D en
 * corps texte-doux, coupée entre les mots seulement, masquée à VoiceOver (chaque barre dit son K/D).
 */
export function BlocSeulOuEnDuo({ groupes }: { groupes: readonly BarreGroupe[] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Bloc titre={TITRE_GROUPE} serre>
            <Barres key="barres" barres={barresGroupe(groupes)} />
            <Text key="phrase" {...TYPO.corps} foregroundStyle={c.texteDoux} accessibilityHidden>
              {sansMauvaiseCoupure(phraseGroupe(groupes))}
            </Text>
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}





export function valeursDuProfil(texte: string): string {
  return texte.split(" · ").map((v) => v.replace(" ", INSECABLE)).join(`${INSECABLE}· `)
}

/**
 * Profil de jeu (entrée 21 ; DESIGN.md, bloc, radar, legende ; EXPERIENCE.md, Radar, Trop peu de parties, Accessibility Floor ; maquette
 * Main) : Bloc serré, coin bas, titre de section par la brique ; le Radar tel que le rend profilDeJeu (un axe sous son effectif grisé à
 * 50, « — » ; ses six valeurs dessous, valeursDuProfil) ; la Légende, toi et tes lobbys à 50. VoiceOver : la phrase du profil, puis un
 * élément par axe (brique) ; la Légende masquée. Entrée 32 : `ouvertures` (une par axe, dans leur ordre) font de chaque nom
 * d'axe le bouton qui ouvre son sous-onglet (brique Radar) ; le bloc lui-même ne s'ouvre pas.
 */
export function BlocProfilDeJeu({ profil, ouvertures }: { profil: ProfilDeJeu; ouvertures?: readonly (Ouverture | null)[] }) {
  return (
    <Bloc titre={TITRE_PROFIL} niveau="section" coin="bas" serre>
      <Radar key="radar" axes={profil.axes} texte={valeursDuProfil(profil.texte)} phrase={profil.phrase} ouvertures={ouvertures} />
      <Legende key="legende" items={LEGENDE_PROFIL} />
    </Bloc>
  )
}






export function voixCote(libelle: string, x: ChiffreCote): string {
  const n = x.sommes.den
  if (!(n > 0)) return `${libelle} : aucune manche.`
  const valeur = n >= MIN_OCCURRENCES ? `${x.valeur} gagnées` : `gagnées, ${x.valeur}`
  return `${libelle}, ${effectifDit(n, "manche", "manches")} : ${valeur}${x.ecart === null ? "" : `, ${ecartDit(x.ecart)}`}.`
}






export function barresCotes(cotes: CotesAffichees): Barre[] {
  const barre = (libelle: string, x: ChiffreCote): Barre => ({
    libelle: `${libelle}${INSECABLE}· ${nombreEnClair(x.sommes.den, 0)}`,
    valeur: x.valeur,
    part: x.sommes.den >= MIN_OCCURRENCES ? x.comparaison.valeur : null,
    evaluation: x.evaluation,
    voix: voixCote(libelle, x),
  })
  return [barre("Attaque", cotes.attaque), barre("Défense", cotes.defense)]
}






export function phraseCotes(c: Palette, cotes: CotesAffichees): (string | StyledText)[] {
  const morceaux: (string | StyledText)[] = [PHRASE_COTES]
  const avecEcart = ([["Attaque", cotes.attaque], ["Défense", cotes.defense]] as const).filter(([, x]) => x.ecart !== null)
  avecEcart.forEach(([libelle, x], i) => {
    morceaux.push(`${i === 0 ? ` ${libelle}` : `${INSECABLE}; ${libelle.toLowerCase()}`}${INSECABLE}: `)
    morceaux.push({ content: x.ecart ?? "", font: TYPO.corps.font, fontWeight: TYPO.corps.fontWeight, foregroundColor: couleurEvaluation(c, x.evaluation) })
  })
  if (avecEcart.length > 0) morceaux.push(".")
  return morceaux
}

/**
 * Attaque · défense (entrée 21 ; DESIGN.md, bloc, barre ; EXPERIENCE.md, Barre, Définitions des métriques : Référence, Écart,
 * Évaluation ; maquette Main) : Bloc serré, sans coin, titre de bloc par la brique, dit « Attaque et défense » ; les Barres de tes
 * manches gagnées en attaque et en défense (barresCotes) ; dessous, la phrase des écarts en corps texte-doux (phraseCotes), masquée à
 * VoiceOver (chaque barre dit son écart). Sans manche à côté lue : le titre et sa phrase (SANS_COTES_FILES, SANS_COTES_LUS).
 */
export function BlocAttaqueDefense({ cotes }: { cotes: CotesAffichees }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Bloc titre={TITRE_COTES} titreDit={TITRE_COTES_DIT} serre vide={cotes.vide === null ? null : sansMauvaiseCoupure(cotes.vide)}>
            {cotes.vide === null ? [
              <Barres key="barres" barres={barresCotes(cotes)} />,
              <Text
                key="phrase"
                styledText={{ font: TYPO.corps.font, fontWeight: TYPO.corps.fontWeight, foregroundColor: c.texteDoux, content: phraseCotes(c, cotes) }}
                accessibilityHidden
              />,
            ] : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── entrée 32 : la Vue d'ensemble mène aux sous-onglets ───────────────────────────

/**
 * Une destination (EXPERIENCE.md, Information Architecture, tableau de la Vue d'ensemble : le premier sous-onglet cité) : le
 * sous-onglet qui détaille une tuile, un bloc ou un axe, et, pour Évolution, la stat d'arrivée (STATS_EVOLUTION, entrée 22).
 */
export type Destination = { cle: CleSousOnglet; arrivee?: CleEvolution }

/** Ce que VoiceOver dit de chaque sous-onglet après « Ouvre » : son libellé de la Barre ; Attaque · défense dit « Attaque et défense ». */
const SOUS_ONGLETS_DITS: Readonly<Record<CleSousOnglet, string>> = {
  "vue-ensemble": "Vue d'ensemble", evolution: "Évolution", agents: "Agents", cartes: "Cartes", duels: "Duels", economie: "Économie",
  "attaque-defense": TITRE_COTES_DIT, armes: "Armes et visée", parties: "Parties", recap: "Récap",
}

/**
 * Les tuiles (EXPERIENCE.md, Information Architecture) : Victoires, K/D, Score, Dégâts / manche, KAST, et, premier cité, Écart de
 * dégâts, Survie et Tirs à la tête dans Évolution, sur leur stat (même clé) ; 1ᵉʳˢ kills et Clutchs dans Duels ; Écos gagnées dans
 * Économie ; Retakes dans Attaque · défense.
 */
export const DESTINATIONS_TUILES: Readonly<Record<CleChiffre, Destination>> = {
  victoires: { cle: "evolution", arrivee: "victoires" },
  kd: { cle: "evolution", arrivee: "kd" },
  score: { cle: "evolution", arrivee: "score" },
  degats: { cle: "evolution", arrivee: "degats" },
  ecartDegats: { cle: "evolution", arrivee: "ecartDegats" },
  tete: { cle: "evolution", arrivee: "tete" },
  kast: { cle: "evolution", arrivee: "kast" },
  survie: { cle: "evolution", arrivee: "survie" },
  premiersKills: { cle: "duels" },
  clutchs: { cle: "duels" },
  ecos: { cle: "economie" },
  retakes: { cle: "attaque-defense" },
}

/**
 * Les blocs : la Courbe de la note dans Évolution sur Note Valorant ; Ton niveau réel dans Évolution (rang par acte, RR par partie :
 * aucune stat d'arrivée) ; Seul ou en duo dans Parties (groupe de chaque partie) ; Attaque · défense dans son sous-onglet.
 */
export const DESTINATIONS_BLOCS: Readonly<Record<"note" | "niveau" | "groupe" | "cotes", Destination>> = {
  note: { cle: "evolution", arrivee: "note" },
  niveau: { cle: "evolution" },
  groupe: { cle: "parties" },
  cotes: { cle: "attaque-defense" },
}

/**
 * Les axes du Profil de jeu, chacun dans son sous-onglet [HYPOTHÈSE d'EXPERIENCE.md] : Visée dans Armes et visée, Impact
 * (Dégâts / manche, Définitions des métriques) dans Évolution sur Dégâts, Survie et Clutchs dans Duels, Utilitaires dans Agents,
 * Économie dans Économie.
 */
export const DESTINATIONS_AXES: Readonly<Record<CleAxe, Destination>> = {
  visee: { cle: "armes" },
  impact: { cle: "evolution", arrivee: "degats" },
  survie: { cle: "duels" },
  utilitaires: { cle: "agents" },
  clutchs: { cle: "duels" },
  economie: { cle: "economie" },
}

/** La case d'une tuile devenue bouton : toute la tuile (largeur et hauteur de sa rangée), au moins 44 de haut. */
const CASE_TUILE: CadreAppui = { maxWidth: "infinity", maxHeight: "infinity", minHeight: ESPACES.cible, alignment: "topLeading" }

/** « Ouvre Évolution. » : la fin de ce que dit VoiceOver d'une cible (EXPERIENCE.md, Accessibility Floor). */
export function ouvreDit(cle: CleSousOnglet): string {
  return `Ouvre ${SOUS_ONGLETS_DITS[cle]}.`
}

/** L'ouverture d'une destination : sa fin dite (ouvreDit) et l'appui, `ouvrir` vers son sous-onglet, avec sa stat d'arrivée s'il en a une. */
export function ouverture(d: Destination, ouvrir: PropsEmplacement["ouvrir"]): Ouverture {
  return { dit: ouvreDit(d.cle), action: () => (d.arrivee === undefined ? ouvrir(d.cle) : ouvrir(d.cle, d.arrivee)) }
}

/**
 * Ce que dit VoiceOver d'un bloc devenu bouton, un seul élément (EXPERIENCE.md, Accessibility Floor : un élément par unité de
 * sens, le bloc nommé par son titre) : son titre dit, ses phrases (celles qu'en lisaient ses éléments), puis « Ouvre … » ; une
 * phrase absente omise.
 */
export function voixBloc(titre: string, phrases: readonly (string | null)[], d: Destination): string {
  return [`${titre}.`, ...phrases.filter((p): p is string => p !== null && p !== ""), ouvreDit(d.cle)].join(" ")
}


export function titreNoteDit(n: number): string {
  return n <= 0 ? TITRE_NOTE : `${TITRE_NOTE}, ${nombreEnClair(n, 0)} ${n > 1 ? "parties classées" : "partie classée"}`
}

/** La clé de la section des Constats (`key`, `.id()` de SwiftUI), où le lien des constats fait défiler la page. */
export const CLE_CONSTATS = "constats"
/** L'indice VoiceOver du lien des constats. */
export const INDICE_LIEN = "Fait défiler jusqu'aux constats."
/** La flèche du lien des constats (DESIGN.md, constat), écrite par son code. */
const FLECHE_BAS = String.fromCharCode(0x2193)

/** Un lien des constats : ce qu'il écrit et ce qu'en dit VoiceOver. */
export type LienDesConstats = { ecrit: string; dit: string }







export function lienConstats(choisis: ConstatsChoisis): LienDesConstats | null {
  const forts = choisis.constats.filter((k) => k.genre === "pointFort").length
  const aTravailler = choisis.constats.filter((k) => k.genre === "aTravailler").length
  const morceaux: [string, string][] = []
  if (forts > 0) morceaux.push([nombreEnClair(forts, 0), forts > 1 ? "points forts" : "point fort"])
  if (aTravailler > 0) morceaux.push([nombreEnClair(aTravailler, 0), "à travailler"])
  if (morceaux.length === 0) return null
  return {
    ecrit: `${morceaux.map(([n, mot]) => `${n}${INSECABLE}${mot}`).join(`${INSECABLE}· `)}${INSECABLE}${FLECHE_BAS}`,
    dit: morceaux.map(([n, mot]) => `${n} ${mot}`).join(" et "),
  }
}








export function LienConstats({ lien, defilerVers }: { lien: LienDesConstats; defilerVers: PropsEmplacement["defilerVers"] }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return zoneDAppui(
          { action: () => defilerVers(CLE_CONSTATS), voix: lien.dit, indice: INDICE_LIEN },
          <Text {...TYPO.ligne} foregroundStyle={c.texteDoux}>
            {lien.ecrit}
          </Text>,
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Un bloc de la Vue d'ensemble devenu bouton (zoneDAppui, case CASE_APPUI) : il ouvre sa destination, lu par `voix`, en en-tête. */
function blocOuvrant(d: Destination, ouvrir: PropsEmplacement["ouvrir"], voix: string, indice: string | undefined, bloc: VirtualNode): VirtualNode {
  return zoneDAppui({ action: ouverture(d, ouvrir).action, voix, indice, entete: true, cadre: CASE_APPUI }, bloc)
}

// ─────────────────────────── epic-stats-recap, entrée 10 : « Préparer le récap » ───────────────────────────

/**
 * Le libellé du Bouton principal de la Vue d'ensemble (DESIGN.md, Récap et boutons ; EXPERIENCE.md, Component Patterns, Bouton
 * principal) : « Préparer le récap », une espace insécable entre « le » et « récap », pour que l'article ne finisse jamais une
 * ligne aux grandes tailles de texte (« PRÉPARER », puis « LE RÉCAP ») ; VoiceOver la dit comme une espace : « Préparer le récap,
 * bouton ».
 */
export const BOUTON_PREPARER = `Préparer le${INSECABLE}récap`
/** Son icône de document (DESIGN.md, Récap et boutons : SF Symbol `doc.text`). */
export const ICONE_PREPARER = "doc.text"

/**
 * La Vue d'ensemble dans son emplacement (entrées 18 et 19 ; PropsEmplacement de app.tsx) : une pile à 14, toute la largeur,
 * dans l'ordre de la maquette Main : la Courbe de la note et Ton niveau réel (entrée 20), Seul ou en duo, le Profil de jeu et
 * Attaque · défense (entrée 21), la section « Chiffres clés » telle quelle, puis Ce que disent tes chiffres, sur le périmètre
 * commun. Rien si ni les tuiles ni les constats ne se rendent (sans sélection, calculs qui lèvent). Entrée 32 : chaque bloc,
 * chaque tuile et chaque nom d'axe ouvrent leur destination (`ouvrir`, stat d'arrivée d'Évolution) ; Ce que disent tes chiffres
 * ne s'ouvre pas ; quand ses constats en montrent un au moins, le lien des constats suit la Courbe de la note, dans une pile à 0
 * avec elle (seul en tête sans elle), et fait défiler jusqu'à eux (`defilerVers`). Rien de plus n'est calculé : le lien lit les
 * constats gardés. Entrée 10 de epic-stats-recap : en dernier, à 14 sous les Constats (ou sous les Chiffres clés sans eux), le
 * Bouton principal « Préparer le récap » (typographie bouton-principal, 52 de haut au moins, icône doc.text), toujours actif, qui
 * ouvre le Récap (`ouvrir("recap")`, comme la Barre) sans rien lire ni calculer ; la pile non rendue, aucun bouton.
 */
export function VueEnsemble({ donnees, perimetre, ouvrir, defilerVers }: PropsEmplacement) {
  const tuiles = perimetre.agregat("tuiles", tuilesDeLaSelection)
  const constats = constatsAMontrer({ donnees, perimetre })
  if (tuiles === null && constats === null) return null
  // Entrée 20 : la note sur tout l'historique tenu, le niveau sur la sélection ; une fois par périmètre et par données.
  const courbe = perimetre.agregat("courbeNote", () => courbeNoteDe(donnees.parties))
  const niveau = perimetre.agregat("niveauReel", (s) => niveauDeLaSelection(donnees, s))
  // Entrée 21 : sur la sélection, une fois par périmètre et par données ; aucun sans partie.
  const groupes = perimetre.agregat("seulOuEnDuo", groupesDeLaSelection)
  const profil = perimetre.agregat("profilDeJeu", (s) => profilDeLaSelection(s, donnees.cumuls))
  const cotes = perimetre.agregat("manchesParCote", cotesDeLaSelection)
  // Entrée 32 : les blocs devenus boutons, lus en un élément ; le lien des constats d'après ceux que montre la section.
  const D = DESTINATIONS_BLOCS
  const note = courbe === null ? null
    : blocOuvrant(D.note, ouvrir, voixBloc(titreNoteDit(courbe.points.length), [courbe.phrase], D.note), NOTE_FIXE, <TaNoteValorant courbe={courbe} />)
  const lien = constats === null ? null : lienConstats(constats)
  return (
    <PileDeBlocs>
      {lien === null ? note : (
        <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {note}
          <LienConstats lien={lien} defilerVers={defilerVers} />
        </VStack>
      )}
      {niveau !== null
        ? blocOuvrant(D.niveau, ouvrir, voixBloc(TITRE_NIVEAU, [phraseNiveauAffichee(niveau.niveau)], D.niveau), undefined, <TonNiveauReel niveau={niveau.niveau} embleme={niveau.embleme} />)
        : null}
      {groupes !== null
        ? blocOuvrant(D.groupe, ouvrir, voixBloc(TITRE_GROUPE, groupes.map(voixGroupe), D.groupe), undefined, <BlocSeulOuEnDuo groupes={groupes} />)
        : null}
      {profil !== null
        ? <BlocProfilDeJeu profil={profil} ouvertures={profil.axes.map((a) => ouverture(DESTINATIONS_AXES[a.cle], ouvrir))} />
        : null}
      {cotes !== null
        ? blocOuvrant(D.cotes, ouvrir, voixBloc(TITRE_COTES_DIT, cotes.vide !== null ? [cotes.vide] : [voixCote("Attaque", cotes.attaque), voixCote("Défense", cotes.defense)], D.cotes), undefined, <BlocAttaqueDefense cotes={cotes} />)
        : null}
      <ChiffresCles perimetre={perimetre} ouvrir={ouvrir} />
      <CeQueDisentTesChiffres donnees={donnees} perimetre={perimetre} />
      {/* epic-stats-recap, entrée 10 : le Bouton principal « Préparer le récap », sous les Constats (maquette Main). */}
      <BoutonPrincipal libelle={BOUTON_PREPARER} icone={ICONE_PREPARER} action={() => ouvrir("recap")} />

    </PileDeBlocs>
  )
}

/** L'emplacement de la Vue d'ensemble dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_VUE_ENSEMBLE: Emplacement = VueEnsemble
