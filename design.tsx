import {
  Button, EnvironmentValuesReader, HStack, Image, LazyVStack, Menu, Picker, ProgressView, Rectangle, RoundedRectangle, ScrollView, Section,
  Spacer, Text, VStack, ZStack, type Color, type ColorSchemeContrast, type DynamicTypeSize, type Font, type FontWeight, type VirtualNode,
} from "scripting"
import { createElement, Fragment, sondeRendu, useEffect, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { note } from "./valshop"

// Jetons et composants de l'app v2, tirés de ux-valshop-stats/DESIGN.md, qui fait foi :
// couleurs, typographie, arrondis, espacements ; En-tête ValShop, Bouton Fermer, Barre
// d'onglets, Bouton Réglages des stats, Bouton principal, Bouton secondaire (dont Mettre à
// jour), Ligne d'état et son Réglage du périmètre (entrée 17 de epic-stats-tableau-de-bord),
// Bandeau d'alerte, Chiffre et Bouton système des surfaces passagères.
// Partagés par les écrans de l'app (app.tsx, reglages.tsx, connexion.tsx et premier.tsx
// aujourd'hui ; reste de l'onglet Stats ensuite). Ni ombre ni dégradé. Les briques de
// dessin de l'onglet Stats (Bloc, barres ; graphiques ensuite) sont dans dessin.tsx.
// Couleurs : toujours celles du réglage « Augmenter le contraste » d'iOS en cours, lu par
// `EnvironmentValuesReader` (clé `colorSchemeContrast`) et passé à `couleurs()` ; jamais
// une couleur prise sans ce réglage. Libellés en casse normale dans le code, en capitales
// par `textCase` : VoiceOver lit le mot, pas un sigle.

/** Palette de l'app, thème sombre seul (DESIGN.md, colors) ; les paliers de rang viendront de valorant-api. */
export type Palette = {
  fond: Color; surface: Color; bordure: Color; segmentActif: Color
  texte: Color; texteDoux: Color; texteDiscret: Color
  orange: Color; bleu: Color; or: Color; blanc: Color; zonePlan: Color


  rouge: Color; vert: Color; rougeClair: Color; surfaceHaute: Color
}

const STANDARD: Palette = {
  fond: "#080b10",
  surface: "#121821",
  bordure: "#263040",
  segmentActif: "#5c6b7d",
  texte: "#e8edf2",
  texteDoux: "#c9d3dc",
  texteDiscret: "#9aa7b4",
  orange: "#ff9f43",
  bleu: "#4da3ff",
  or: "#ffd166",
  blanc: "#ffffff",
  zonePlan: "#1f2731",
  rouge: "#ff4655",
  vert: "#4ade80",
  rougeClair: "#ff7b84",
  surfaceHaute: "#222b37",
}

/**
 * Couleurs, par valeur du réglage « Augmenter le contraste » d'iOS (DESIGN.md, Colors) :
 * `standard` ; `increased`, où `bordure` prend la valeur de `segment-actif` et
 * `texte-discret` celle de `texte-doux`.
 */
export const COULEURS: Record<ColorSchemeContrast, Palette> = {
  standard: STANDARD,
  // `rouge` plus sombre : le libellé blanc du Bouton principal y garde 4,5:1.
  increased: { ...STANDARD, bordure: STANDARD.segmentActif, texteDiscret: STANDARD.texteDoux, rouge: "#d92f41" },
}

/** Palette du contraste lu par `EnvironmentValuesReader` (`colorSchemeContrast`) ; standard si la valeur manque. */
export function couleurs(contraste: ColorSchemeContrast | undefined): Palette {
  return contraste === "increased" ? COULEURS.increased : COULEURS.standard
}





export const ARRONDIS = { none: 0, sm: 12, md: 16, bloc: 20, full: 9999 } as const

/** `part` de la couleur `a` dans la couleur `b` (deux « #rrggbb »), en « #rrggbb » : une surface teintée, sans transparence. */
export function melange(a: string, b: string, part: number): Color {
  const lu = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const x = lu(a), y = lu(b)
  return ("#" + x.map((v, i) => Math.round(v * part + y[i] * (1 - part)).toString(16).padStart(2, "0")).join("")) as Color
}
/** Fond d'un creux dans un Bloc (Chiffre, aperçu) : `fond`, arrondi `sm`. */
export const creux = (c: Palette) => ({ style: c.fond, shape: { type: "rect" as const, cornerRadius: ARRONDIS.sm } })
/** Fond d'une tuile posée sur la page : `surface`, arrondi `md`. */
export const fondTuile = (c: Palette) => ({ style: c.surface, shape: { type: "rect" as const, cornerRadius: ARRONDIS.md } })

/** Espacements, en points (DESIGN.md, spacing) ; `cible` : côté minimal d'une zone d'appui. */
export const ESPACES = {
  hautPage: 20,
  margePage: 16,
  basPage: 24,
  entreBlocs: 14,
  entete: 12,
  bloc: 16,
  blocSerre: 14,
  dansBloc: 10,
  cellule: 10,
  grille: 6,
  puces: 6,
  segments: 4,
  manches: 3,
  frise: 2,
  cible: 44,
} as const

/**
 * Vrai dès la première taille de texte d'accessibilité (`accessibility1` à `accessibility5`),
 * lue par `EnvironmentValuesReader` (`dynamicTypeSize`) : seuil des règles de mise en page
 * de DESIGN.md (Layout & Spacing).
 */
export function tailleAccessibilite(taille: DynamicTypeSize | undefined): boolean {
  return typeof taille === "string" && taille.startsWith("accessibility")
}

/** Rôle de texte : style de texte d'iOS suivi (Dynamic Type), graisse, espacement des lettres. */
type RoleTexte = { font: Font; fontWeight: FontWeight; kerning?: number }

/**
 * Rôles de texte (DESIGN.md, typography), tous, dans son ordre. Chacun suit le style de
 * texte d'iOS de sa `note`, donc la taille de texte réglée dans iOS, sauf `axe` (libellés
 * d'axes de graphiques), fixe à 11. Les typages de Scripting n'offrent pas `relativeTo` :
 * à la taille de texte par défaut, la taille est celle du style, soit 34 pour le titre et
 * le nom, 22 pour le titre de section et le bouton principal du récap, 16 pour les
 * sous-onglets, 15 pour le constat et l'étiquette de constat, 13 pour le corps, le petit,
 * la puce et l'aperçu, 20 pour le bouton principal et la valeur, 17 pour le bouton
 * secondaire et 11 pour la note et le micro, comme leurs jetons ; 17 pour les onglets
 * (jeton : 18), 20 pour le titre de bloc (jeton : 18), 15 pour l'étiquette, la ligne et le
 * libellé de case (jeton : 14), 34 pour la vedette (jeton : 40) et le rang (jeton : 32), 28
 * pour l'écart en vedette (jeton : 26). Interlignes des jetons non repris.
 */
export const TYPO = {
  titreAppli: { font: "largeTitle", fontWeight: "heavy", kerning: 1 },
  onglet: { font: "headline", fontWeight: "heavy", kerning: 1 },
  ongletInactif: { font: "headline", fontWeight: "bold", kerning: 1 },
  sousOnglet: { font: "callout", fontWeight: "heavy", kerning: 0.8 },
  sousOngletInactif: { font: "callout", fontWeight: "bold", kerning: 0.8 },
  vedette: { font: "largeTitle", fontWeight: "heavy", kerning: 1 },
  ecartVedette: { font: "title", fontWeight: "heavy" },
  nom: { font: "largeTitle", fontWeight: "heavy" },
  rang: { font: "largeTitle", fontWeight: "heavy", kerning: 1 },
  titreSection: { font: "title2", fontWeight: "heavy", kerning: 1 },
  titreBloc: { font: "title3", fontWeight: "heavy", kerning: 1 },
  etiquette: { font: "subheadline", fontWeight: "bold", kerning: 1 },
  etiquetteConstat: { font: "subheadline", fontWeight: "heavy", kerning: 1 },
  boutonPrincipal: { font: "title3", fontWeight: "heavy", kerning: 1 },
  boutonPrincipalRecap: { font: "title2", fontWeight: "heavy", kerning: 1 },
  boutonSecondaire: { font: "headline", fontWeight: "bold", kerning: 1 },
  valeur: { font: "title3", fontWeight: "heavy" },
  constat: { font: "subheadline", fontWeight: "regular" },
  ligne: { font: "subheadline", fontWeight: "bold" },
  ligneForte: { font: "subheadline", fontWeight: "heavy" },
  libelleCase: { font: "subheadline", fontWeight: "regular" },
  puce: { font: "footnote", fontWeight: "bold" },
  puceInactive: { font: "footnote", fontWeight: "semibold" },
  corps: { font: "footnote", fontWeight: "regular" },
  petit: { font: "footnote", fontWeight: "regular" },
  petitFort: { font: "footnote", fontWeight: "bold" },
  note: { font: "caption2", fontWeight: "regular" },
  micro: { font: "caption2", fontWeight: "regular" },
  microFort: { font: "caption2", fontWeight: "bold" },
  axe: { font: 11, fontWeight: "regular" },
  apercu: { font: "footnote", fontWeight: "regular", fontDesign: "monospaced" },
} as const

/**
 * Vrai si un libellé passe en capitales : jusqu'à trois mots ; au-delà, casse de phrase
 * (DESIGN.md, Typography).
 */
export function enCapitales(libelle: string): boolean {
  return libelle.trim().split(/\s+/).length <= 3
}

/**
 * Police d'un rôle en SF Pro condensée, en capitales sauf `capitales` à faux (DESIGN.md,
 * Typography) : seul porteur de la police condensée, à étaler sur un `Text`.
 */
export function policeCondensee(role: RoleTexte, capitales = true) {
  return {
    font: role.font,
    fontWeight: role.fontWeight,
    fontWidth: "condensed",
    kerning: role.kerning,
    textCase: capitales ? "uppercase" : undefined,
  } as const
}

/**
 * Allure commune du Bouton Fermer et du Bouton Réglages des stats (DESIGN.md,
 * bouton-fermer, bouton-reglages) : carré de 44 à contour `bordure`, fond transparent,
 * icône de 18 en `texte` ; `libelle` : ce que VoiceOver lit.
 */
function BoutonCarre({ icone, libelle, action, point = false }: { icone: string; libelle: string; action: () => void; point?: boolean }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Button buttonStyle="plain" action={action} accessibilityLabel={libelle}>
            <ZStack
              frame={{ width: ESPACES.cible, height: ESPACES.cible }}
              background={{ style: c.surface, shape: { type: "rect", cornerRadius: ARRONDIS.sm } }}
              contentShape="rect"
            >
              <RoundedRectangle cornerRadius={ARRONDIS.sm} stroke={c.bordure} />
              <Image systemName={icone} font={18} foregroundStyle={c.texte} />
              { }
              {point ? <RoundedRectangle cornerRadius={ARRONDIS.full} fill={c.rouge} frame={{ width: 9, height: 9 }} offset={{ x: 13, y: -13 }} accessibilityHidden /> : null}
            </ZStack>
          </Button>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Bouton Fermer (DESIGN.md, bouton-fermer) : carré de 44, contour `bordure`, croix de 18 ; VoiceOver « Fermer ». */
export function BoutonFermer({ action }: { action: () => void }) {
  return <BoutonCarre icone="xmark" libelle="Fermer" action={action} />
}





export function BoutonReglages({ action, aFaire = false }: { action: () => void; aFaire?: boolean }) {
  // `aFaire` : une nouvelle version de ValShop est connue ; le point rouge le montre, VoiceOver le dit.
  return <BoutonCarre icone="gearshape" libelle={aFaire ? "Réglages, une nouvelle version est disponible" : "Réglages"} action={action} point={aFaire} />
}

/** Hauteur minimale du Bouton principal (DESIGN.md, bouton-principal : min-height), puis celle du Récap (min-height-recap). */
const HAUTEUR_PRINCIPAL = 52
const HAUTEUR_PRINCIPAL_RECAP = 56
/** Côté de l'icône du Bouton principal (DESIGN.md, bouton-principal : icone). */
const ICONE_PRINCIPAL = 18

/**
 * Bouton principal (DESIGN.md, bouton-principal ; typographie bouton-principal) : pleine
 * largeur, fond `orange`, angles de 2 ; libellé `fond` en condensée, centré, 800 en
 * capitales jusqu'à trois mots, 700 en casse de phrase au-delà ; 52 de haut au moins, 14
 * de chaque côté et 10 au-dessus et au-dessous, pour un libellé sur plusieurs lignes aux
 * grandes tailles de texte ; toute la case répond à l'appui. VoiceOver lit le libellé, puis
 * « bouton ». « Me connecter » (Écran de connexion, étape 1 du Premier lancement) ; « Coller
 * ma clé » et « Récupérer mes parties » (étapes 2 et 3 du Premier lancement) ; « Importer mon
 * historique » (feuille Réglages des stats, entrée 5 de epic-stats-import), seul à se servir des
 * réglages suivants, absents ailleurs. `inactif` (ou `enCours`) : sans fond, contour `bordure`,
 * libellé `texte-discret`, sans appui (DESIGN.md, Bouton principal, Inactif ; la raison, s'il y
 * en a une, est écrite dessous par l'écran, hors du bouton, qui n'est jamais recréé quand elle
 * paraît) ; `enCours` : l'indicateur d'activité avant le libellé, masqué à VoiceOver.
 * `valeurAccessibilite` : ce que VoiceOver lit après le libellé ; `valeurSuivie` : trait
 * `updatesFrequently`, pour qu'il la relise quand elle change sous son focus.
 * Entrée 8 de epic-stats-recap : `icone`, un SF Symbol de 18 avant le libellé, de sa couleur,
 * masqué à VoiceOver, que l'indicateur remplace en cours (« square.and.arrow.down » pour
 * « Télécharger le récap », « doc.text » pour « Préparer le récap ») ; `recap` : typographie
 * bouton-principal-recap et 56 de haut au moins (DESIGN.md, Récap et boutons). Sans eux, rien
 * ne change.
 */
export function BoutonPrincipal({ libelle, action, inactif = false, enCours = false, valeurAccessibilite, valeurSuivie = false, icone, recap = false }: {
  libelle: string; action: () => void; inactif?: boolean; enCours?: boolean; valeurAccessibilite?: string; valeurSuivie?: boolean
  icone?: string; recap?: boolean
}) {
  const sansAppui = inactif || enCours
  const role = recap ? TYPO.boutonPrincipalRecap : TYPO.boutonPrincipal
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const capitales = enCapitales(libelle)
        const avant = sansAppui ? c.texteDiscret : c.blanc
        return (
          <Button
            buttonStyle="plain"
            action={action}
            disabled={sansAppui ? true : undefined}
            accessibilityValue={valeurAccessibilite}
            accessibilityAddTraits={valeurSuivie ? "updatesFrequently" : undefined}
          >
            <HStack
              spacing={ESPACES.puces}
              padding={{ horizontal: 14, vertical: ESPACES.dansBloc }}
              frame={{ maxWidth: "infinity", minHeight: recap ? HAUTEUR_PRINCIPAL_RECAP : HAUTEUR_PRINCIPAL }}
              background={sansAppui
                ? <RoundedRectangle cornerRadius={ARRONDIS.md} stroke={c.bordure} />
                : <RoundedRectangle cornerRadius={ARRONDIS.md} fill={c.rouge} />}
              contentShape="rect"
            >
              {enCours ? (
                <ProgressView progressViewStyle="circular" controlSize="small" tint={c.texteDiscret} accessibilityHidden />
              ) : icone ? (
                <Image systemName={icone} font={ICONE_PRINCIPAL} foregroundStyle={avant} accessibilityHidden />
              ) : null}
              <Text
                {...policeCondensee(capitales ? role : { ...role, fontWeight: "bold" }, capitales)}
                foregroundStyle={avant}
                multilineTextAlignment="center"
              >
                {libelle}
              </Text>
            </HStack>
          </Button>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Côté de l'icône du Bouton Mettre à jour (DESIGN.md, bouton-mettre-a-jour). */
const ICONE_SECONDAIRE = 16
/** Réduction la plus forte du libellé d'un Bouton secondaire tenu sur une ligne (entrée 39) : une réduction modérée. */
const ECHELLE_MIN_LIBELLE = 0.8

/**
 * Bouton secondaire (DESIGN.md, bouton-mettre-a-jour ; typographie bouton-secondaire) :
 * contour 1 px `texte`, fond transparent, libellé `texte` en condensée 700, capitales
 * jusqu'à trois mots ; 44 de haut au moins, 14 de chaque côté ; toute la case répond à
 * l'appui. `icone` : SF Symbol de 16 avant le libellé (`arrow.clockwise` pour Mettre à
 * jour). `enCours` : indicateur d'activité à la place de l'icône, bouton inactif.
 * `inactif` (ou en cours) : contour `bordure`, libellé `texte-discret`, sans appui ; sa
 * `raison` (« Limite atteinte ») écrite dessous, en `petit` `texte-discret`. Toujours la même
 * pile, le bouton en tête, la raison seule en plus ou en moins : le bouton n'est jamais
 * recréé quand elle paraît, et VoiceOver garde son focus.
 * Icône et indicateur sont masqués à VoiceOver, qui lit le libellé, puis
 * `valeurAccessibilite` s'il y en a une (« Mise à jour lancée », puis le bilan) ;
 * `valeurSuivie` : trait `updatesFrequently`, pour que VoiceOver relise cette valeur quand
 * elle change sous son focus (Scripting n'a aucune annonce). « Mettre à jour ».
 * `uneLigne` (entrée 39 de epic-stats-tableau-de-bord) : libellé sur une ligne, réduit au plus à 0,8 quand la place manque
 * (`lineLimit` 1, `minScaleFactor` 0,8), et le bouton servi le premier dans sa rangée (`layoutPriority` 1), après la
 * largeur minimale de ses voisins (la Ligne d'état et son périmètre tenu sur sa ligne) : Mettre à jour aux tailles de texte
 * ordinaires, comme la maquette, sa rangée n'étant gardée que si 0,8 suffit (LARGEUR_RANGEE, app.tsx). Sans lui, le
 * libellé passe à la ligne au besoin (tailles d'accessibilité).
 */
export function BoutonSecondaire({ libelle, action, icone, enCours = false, inactif = false, raison, valeurAccessibilite, valeurSuivie = false, uneLigne = false, destructif = false }: {
  libelle: string; action: () => void; icone?: string; enCours?: boolean; inactif?: boolean; raison?: string
  valeurAccessibilite?: string; valeurSuivie?: boolean; uneLigne?: boolean

  destructif?: boolean
}) {
  const sansAppui = inactif || enCours
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const avant = sansAppui ? c.texteDiscret : destructif ? c.rougeClair : c.texte
        const bouton = (
          <Button
            buttonStyle="plain"
            action={action}
            disabled={sansAppui}
            accessibilityValue={valeurAccessibilite}
            accessibilityAddTraits={valeurSuivie ? "updatesFrequently" : undefined}
          >
            <HStack contentShape="rect">
              <HStack
                spacing={ESPACES.puces}
                padding={{ horizontal: 14 }}
                frame={{ minHeight: ESPACES.cible }}
                background={sansAppui
                  ? <RoundedRectangle cornerRadius={ARRONDIS.sm} stroke={c.bordure} />
                  : <RoundedRectangle cornerRadius={ARRONDIS.sm} fill={c.surfaceHaute} />}
              >
                {enCours ? (
                  <ProgressView
                    progressViewStyle="circular"
                    controlSize="small"
                    tint={avant}
                    frame={{ width: ICONE_SECONDAIRE, height: ICONE_SECONDAIRE }}
                    accessibilityHidden
                  />
                ) : icone ? (
                  <Image systemName={icone} font={ICONE_SECONDAIRE} foregroundStyle={avant} accessibilityHidden />
                ) : null}
                <Text
                  {...policeCondensee(TYPO.boutonSecondaire, enCapitales(libelle))}
                  foregroundStyle={avant}
                  lineLimit={uneLigne ? 1 : undefined}
                  minScaleFactor={uneLigne ? ECHELLE_MIN_LIBELLE : undefined}
                >
                  {libelle}
                </Text>
              </HStack>
            </HStack>
          </Button>
        )
        return (
          <VStack spacing={ESPACES.segments} layoutPriority={uneLigne ? 1 : undefined}>
            {bouton}
            {sansAppui && raison ? (
              <Text {...TYPO.petit} foregroundStyle={c.texteDiscret} multilineTextAlignment="center">
                {raison}
              </Text>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Icône d'alerte de la Ligne d'état et du Bandeau d'alerte : un triangle (SF Symbol). */
const TRIANGLE = "exclamationmark.triangle.fill"

/** Écart entre le périmètre et le détail de la Ligne d'état, en points (le `gap` des deux lignes de la maquette). */
const ECART_LIGNE = 2





const MARQUE_REGLAGE = "\u00a0\u25be"
/** Indice VoiceOver de la Ligne d'état qui porte le périmètre (entrée 17 de epic-stats-tableau-de-bord). */
export const INDICE_REGLAGE = "Règle le mode et la période."
/** Titre de la feuille du repli du Réglage du périmètre. */
const TITRE_FEUILLE_PERIMETRE = "Périmètre"


export type ChoixReglage = { cle: string; libelle: string }
/**
 * Une section du Réglage du périmètre (EXPERIENCE.md, Component Patterns : Mode, puis Période) : son titre, ses choix dans
 * leur ordre, la clé du choix courant (coché), et ce qu'un autre choix règle (l'état unique de l'onglet, app.tsx).
 */
export type SectionReglage = { titre: string; choix: readonly ChoixReglage[]; choisi: string; onChoix: (cle: string) => void }




export type PerimetreLigne = { libelle: string; parle: string; sections: readonly SectionReglage[] }

/**
 * Repli du Réglage du périmètre (EXPERIENCE.md, point 9 de « À vérifier au spike »), réglé ici une fois pour toute l'app :
 * `reglageEnFeuille`, à mettre à vrai si, sur l'iPhone, le `Menu` du système se dessine mal (étiquette teintée ou
 * recadrée, coches ou titres de section absents) ou que VoiceOver ne le lit pas en une phrase ; la Ligne devient alors un
 * bouton qui ouvre une feuille, mêmes choix, même effet.
 */
export const REPLIS_LIGNE = { reglageEnFeuille: false }






export function phraseLigne(parle: string, detail: string): string {
  const dit = (detail.charAt(0).toLowerCase() + detail.slice(1)).split(" · ").join(", ")
  return `${parle} : ${dit}${/[.…]$/.test(dit) ? "" : "."}`
}

/** Un choix reçu du Réglage : appliqué s'il est l'un de ceux de la section et n'est pas déjà le sien ; sinon rien. */
function choisir(s: SectionReglage, cle: string) {
  if (cle !== s.choisi && s.choix.some((x) => x.cle === cle)) s.onChoix(cle)
}

/**
 * Le détail de la Ligne d'état, en `petit` `texte-discret`, à gauche, sur plusieurs lignes au besoin ; `ancienne` : l'icône
 * d'alerte devant, masquée à VoiceOver, l'âge en `orange` ; `trait` sur son texte ; `cadre` : 44 de haut au moins et toute
 * la largeur (la Ligne d'une seule ligne).
 */
function detailDeLigne(c: Palette, detail: string, ancienne: { avant: string; age: string; apres: string } | undefined, trait: "updatesFrequently" | undefined, cadre: boolean): VirtualNode {
  // Police redite sur le morceau orange : rien n'assure qu'un morceau hérite de celle du texte.
  const age = ancienne ? { content: ancienne.age, font: TYPO.petit.font, fontWeight: TYPO.petit.fontWeight, foregroundColor: c.orange } : null
  return (
    <HStack
      spacing={ESPACES.puces}
      alignment="firstTextBaseline"
      frame={cadre ? { maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" } : undefined}
    >
      {ancienne ? <Image systemName={TRIANGLE} font={TYPO.petit.font} foregroundStyle={c.orange} accessibilityHidden /> : null}
      {ancienne && age ? (
        <Text
          styledText={{
            font: TYPO.petit.font,
            fontWeight: TYPO.petit.fontWeight,
            foregroundColor: c.texteDiscret,
            content: [ancienne.avant, age, ancienne.apres].filter((m) => m !== ""),
          }}
          accessibilityAddTraits={trait}
        />
      ) : (
        <Text {...TYPO.petit} foregroundStyle={c.texteDiscret} accessibilityAddTraits={trait}>
          {detail}
        </Text>
      )}
    </HStack>
  )
}























export function LigneEtat({ detail, ancienne, suivie = true, perimetre, uneLigne = false }: {
  detail: string; ancienne?: { avant: string; age: string; apres: string }; suivie?: boolean; perimetre?: PerimetreLigne; uneLigne?: boolean
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const trait = suivie ? "updatesFrequently" : undefined
        if (!perimetre) return detailDeLigne(c, detail, ancienne, trait, true)
        const etiquette = (
          <VStack
            alignment="leading"
            spacing={ECART_LIGNE}
            frame={{ maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" }}
            contentShape="rect"
          >
            <Text {...TYPO.petitFort} foregroundStyle={c.texte} fixedSize={uneLigne ? { horizontal: true, vertical: false } : undefined}>
              {perimetre.libelle + MARQUE_REGLAGE}
            </Text>
            {detailDeLigne(c, detail, ancienne, undefined, false)}
          </VStack>
        )
        const phrase = phraseLigne(perimetre.parle, detail)
        if (REPLIS_LIGNE.reglageEnFeuille) {
          return <LigneEnFeuille etiquette={etiquette} sections={perimetre.sections} phrase={phrase} trait={trait} />
        }
        return (
          <Menu
            label={etiquette}
            menuStyle="button"
            buttonStyle="plain"
            menuOrder="fixed"
            menuIndicator="hidden"
            accessibilityLabel={phrase}
            accessibilityHint={INDICE_REGLAGE}
            accessibilityAddTraits={trait}
          >
            {perimetre.sections.map((s) => (
              <Section key={s.titre} title={s.titre}>
                <Picker title={s.titre} value={s.choisi} pickerStyle="inline" onChanged={(cle: string) => choisir(s, cle)}>
                  {s.choix.map((x) => (
                    <Text key={x.cle} tag={x.cle}>
                      {x.libelle}
                    </Text>
                  ))}
                </Picker>
              </Section>
            ))}
          </Menu>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Repli du Réglage du périmètre (REPLIS_LIGNE.reglageEnFeuille) : l'étiquette de la Ligne en bouton (plain, toute la case),
 * même phrase, même indice, même trait ; un appui ouvre la feuille du périmètre, qui se ferme par Fermer, par glissement ou
 * par un choix. Seul porteur d'un état : la feuille ouverte.
 */
function LigneEnFeuille({ etiquette, sections, phrase, trait }: {
  etiquette: VirtualNode; sections: readonly SectionReglage[]; phrase: string; trait: "updatesFrequently" | undefined
}) {
  const [ouverte, setOuverte] = useState(false)
  return (
    <Button
      buttonStyle="plain"
      action={() => setOuverte(true)}
      accessibilityLabel={phrase}
      accessibilityHint={INDICE_REGLAGE}
      accessibilityAddTraits={trait}
      sheet={{
        isPresented: ouverte,
        onChanged: setOuverte,
        content: <FeuillePerimetre sections={sections} onFermer={() => setOuverte(false)} />,
      }}
    >
      {etiquette}
    </Button>
  )
}

/**
 * Feuille du repli du Réglage du périmètre (surface passagère : allure de la Feuille « Réglages des stats », DESIGN.md,
 * Components) : à mi-hauteur sur `surface`, sombre ; « Périmètre » en titre de bloc condensé, en-tête, et le Bouton Fermer ;
 * puis chaque section, son titre en étiquette condensée `texte-discret`, en-tête, et une ligne bouton par choix (plain, 44
 * de haut au moins, toute la largeur, libellé en `ligne` `texte`, coche `checkmark` en `texte` sur le choix courant, masquée
 * à VoiceOver qui le dit « sélectionné »), un filet `bordure` de 1 entre deux lignes ; un choix s'applique (le courant : rien)
 * et referme la feuille.
 */
function FeuillePerimetre({ sections, onFermer }: { sections: readonly SectionReglage[]; onFermer: () => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <ScrollView preferredColorScheme="dark" presentationDetents={["medium"]} presentationBackground={c.surface}>
            <VStack
              alignment="leading"
              spacing={ESPACES.entreBlocs}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              padding={{ top: ESPACES.hautPage, horizontal: ESPACES.margePage, bottom: ESPACES.basPage }}
            >
              <HStack>
                <Text {...policeCondensee(TYPO.titreBloc)} foregroundStyle={c.texte} accessibilityAddTraits="isHeader">
                  {TITRE_FEUILLE_PERIMETRE}
                </Text>
                <Spacer />
                <BoutonFermer action={onFermer} />
              </HStack>
              {sections.map((s) => (
                <VStack key={s.titre} alignment="leading" spacing={ESPACES.segments}>
                  <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
                    {s.titre}
                  </Text>
                  <VStack alignment="leading" spacing={0}>
                    {s.choix.map((x, i) => {
                      const coche = x.cle === s.choisi
                      return (
                        <VStack key={x.cle} spacing={0}>
                          {i > 0 ? <Rectangle fill={c.bordure} frame={{ height: 1 }} /> : null}
                          <Button
                            buttonStyle="plain"
                            action={() => {
                              choisir(s, x.cle)
                              onFermer()
                            }}
                            accessibilityLabel={x.libelle}
                            accessibilityAddTraits={coche ? "isSelected" : undefined}
                          >
                            <HStack spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", minHeight: ESPACES.cible }} contentShape="rect">
                              <Text {...TYPO.ligne} foregroundStyle={c.texte}>
                                {x.libelle}
                              </Text>
                              <Spacer />
                              {coche ? <Image systemName="checkmark" font={TYPO.ligne.font} foregroundStyle={c.texte} accessibilityHidden /> : null}
                            </HStack>
                          </Button>
                        </VStack>
                      )
                    })}
                  </VStack>
                </VStack>
              ))}
            </VStack>
          </ScrollView>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Filet du haut et triangle du Bandeau d'alerte (DESIGN.md, bandeau-alerte), en points. */
const ICONE_BANDEAU = 16
/** Marges du Bandeau d'alerte : celles du Constat de la maquette, qui porte le même filet d'accent. */
const MARGE_BANDEAU = { vertical: 12, horizontal: 14 } as const

/**
 * Bandeau d'alerte (DESIGN.md, bandeau-alerte ; EXPERIENCE.md, Component Patterns) : pleine
 * largeur, fond `surface` sous un filet de 3 en `orange`, triangle de 16 en `orange`, phrase
 * en `corps` `texte` sur autant de lignes qu'il faut ; 44 de haut au moins, jamais fixe. Un
 * seul élément pour VoiceOver, qui lit la phrase d'un trait, triangle masqué ; `action` (clé
 * refusée : ouvre Réglages des stats) en fait un bouton, toute la case répondant à l'appui.
 * Jamais le trait `updatesFrequently` : le délai d'une limite s'y décompte à la seconde.
 */
export function BandeauAlerte({ texte, action }: { texte: string; action?: () => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const contenu = (
          <HStack
            spacing={ESPACES.dansBloc}
            alignment="firstTextBaseline"
            padding={MARGE_BANDEAU}
            frame={{ maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" }}
            background={<RoundedRectangle cornerRadius={ARRONDIS.md} fill={melange(c.orange as string, c.surface as string, 0.2)} />}
            contentShape="rect"
            accessibilityElement={action ? undefined : "combine"}
          >
            <Image systemName={TRIANGLE} font={ICONE_BANDEAU} foregroundStyle={c.orange} accessibilityHidden />
            <Text {...TYPO.corps} foregroundStyle={c.texte}>
              {texte}
            </Text>
          </HStack>
        )
        if (!action) return contenu
        return (
          <Button buttonStyle="plain" action={action} accessibilityLabel={texte}>
            {contenu}
          </Button>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Écart entre le libellé, la valeur et le sous-texte d'un Chiffre, en points (celui de la maquette). */
const ECART_CHIFFRE = 2










export function Chiffre({ libelle, valeur, sousTexte }: { libelle: string; valeur: string; sousTexte: string }) {
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
            accessibilityLabel={`${libelle} : ${valeur}, ${sousTexte}`}
          >
            <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
              {libelle}
            </Text>
            <Text {...TYPO.valeur} monospacedDigit foregroundStyle={c.texte}>
              {valeur}
            </Text>
            <Text {...TYPO.note} foregroundStyle={c.texteDoux}>
              {sousTexte}
            </Text>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/**
 * Bouton système (`bordered`), réservé aux surfaces passagères comme la Feuille « Réglages
 * des stats » (DESIGN.md, Components ; feuille-reglages) : libellé et allure du système ;
 * taille `large`, pour 44 de haut au moins ; angles de 2 (`sm`), jamais en pilule ; teinte
 * `texte`, lue selon le contraste. « Coller », « Retirer la clé ».
 */
export function BoutonSysteme({ libelle, action }: { libelle: string; action: () => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <Button
          title={libelle}
          action={action}
          buttonStyle="bordered"
          controlSize="large"
          buttonBorderShape={{ roundedRectangleRadius: ARRONDIS.sm }}
          tint={couleurs(env.colorSchemeContrast).texte}
        />
      )}
    </EnvironmentValuesReader>
  )
}

/** En-tête ValShop (DESIGN.md, en-tete-valshop) : « VALSHOP » à gauche, titre sans action ; Bouton Fermer à droite. */
export function EnTete({ onFermer }: { onFermer: () => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => (
        <HStack spacing={ESPACES.dansBloc}>
          <RoundedRectangle cornerRadius={1.5} fill={couleurs(env.colorSchemeContrast).rouge} frame={{ width: 6, height: 24 }} rotationEffect={14} accessibilityHidden />
          <Text {...policeCondensee(TYPO.titreAppli)} foregroundStyle={couleurs(env.colorSchemeContrast).texte}>
            ValShop
          </Text>
          <Spacer />
          <BoutonFermer action={onFermer} />
        </HStack>
      )}
    </EnvironmentValuesReader>
  )
}

/** Un onglet de la Barre d'onglets : sa clé, son libellé. */
export type Onglet<T extends string> = { cle: T; libelle: string }

/**
 * Barre d'onglets (DESIGN.md, barre-onglets) : colonnes égales sur `surface`, boutons
 * sur toute la hauteur, 44 au moins ; actif : fond `texte` en retrait de 4, libellé
 * `fond` ; inactif : libellé `texte-discret`. Un appui choisit l'onglet ; VoiceOver dit
 * l'actif « sélectionné ». Taille du texte plafonnée à la première taille
 * d'accessibilité (DESIGN.md, Layout & Spacing).
 */
export function BarreOnglets<T extends string>({ onglets, actif, onChoix }: {
  onglets: Onglet<T>[]; actif: T; onChoix: (cle: T) => void
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <HStack
            spacing={0}
            background={{ style: c.surface, shape: { type: "rect", cornerRadius: ARRONDIS.md } }}
            dynamicTypeSize={{ to: "accessibility1" }}
          >
            {onglets.map((onglet) => {
              const choisi = onglet.cle === actif
              // `contentShape` : toute la case répond à l'appui, pas seulement le libellé.
              return (
                <Button
                  key={onglet.cle}
                  buttonStyle="plain"
                  action={() => onChoix(onglet.cle)}
                  accessibilityAddTraits={choisi ? "isSelected" : undefined}
                >
                  <HStack contentShape="rect">
                    <Text
                      {...policeCondensee(choisi ? TYPO.onglet : TYPO.ongletInactif)}
                      foregroundStyle={choisi ? c.texte : c.texteDiscret}
                      frame={{ maxWidth: "infinity", minHeight: ESPACES.cible }}
                      background={choisi ? (
                        <ZStack alignment="bottom" padding={ESPACES.segments}>
                          <RoundedRectangle cornerRadius={ARRONDIS.sm} fill={c.surfaceHaute} />
                          <VStack spacing={0} padding={{ bottom: 4 }}>
                            <RoundedRectangle cornerRadius={1.5} fill={c.rouge} frame={{ width: 22, height: 3 }} />
                          </VStack>
                        </ZStack>
                      ) : undefined}
                    >
                      {onglet.libelle}
                    </Text>
                  </HStack>
                </Button>
              )
            })}
          </HStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ───────── Pile des blocs d'un sous-onglet (ticket 4.46 de epic-stats-tableau-de-bord) ─────────








export function PileDeBlocs({ padding, children }: {
  padding?: { top?: number; bottom?: number; horizontal?: number }; children?: VirtualNode | null | false | (VirtualNode | null | false)[]
}) {
  return (
    <LazyVStack alignment="leading" spacing={ESPACES.entreBlocs} frame={{ maxWidth: "infinity", alignment: "leading" }} {...(padding ? { padding } : {})}>
      {children}
    </LazyVStack>
  )
}

























/** La fin d'écran qui clôt un appui : la page de l'onglet (sous-onglet compris), ou le Détail d'une partie (ticket 4.49). */
export type LieuMesure = "page" | "detail"
/**
 * Un appui mesuré : ce qu'il est, la fin qui le clôt, son heure, le temps des calculs faits depuis, le début et la fin du rendu
 * qui le suit, les Blocs rendus et lus pendant ce rendu (ticket 4.49).
 */
type AppuiMesure = {
  quoi: string; lieu: LieuMesure; depuis: number; calcul: number; debut: number | null; fin: number | null; blocsRendus: number; blocsLus: number
}
let appuiMesure: AppuiMesure | null = null
/** Les rendus mesurés depuis l'ouverture : de quoi relancer l'effet qui écrit la ligne. */
let rendusMesures = 0
/** Ticket 4.49 : le numéro de chaque début de rendu (debutDeRendu), que FinDuRendu reçoit pour être rappelé à chaque rendu. */
let tours = 0
/** Ticket 4.49 : le dernier périmètre dit, pour une ligne écrite hors de la page (le Détail d'une partie). */
let dernierPerimetre = ""
/**
 * Ticket 4.49 : un rendu de l'app est en cours (de debutDeRendu à FinDuRendu) : un Bloc lu pendant lui est de ce rendu, pas
 * une lecture de Scripting hors du rendu.
 */
let enRendu = false
/** Au-delà, un appui sans rendu jusqu'au bout (aucune donnée tenue…) est oublié sans ligne. */
const MESURE_PERIMEE_MS = 60_000
/**
 * Au journal, seuls les appuis qui se voient (ticket 4.46) : de l'appui à l'effet, ou jusqu'au dernier rappel natif, au moins
 * ce délai ; un appui plus rapide garde sa ligne à la console seule.
 */
export const SEUIL_JOURNAL_MS = 100
/** Lignes de mesure au journal par exécution, au plus, la dernière disant la suite tue (ticket 4.46). */
export const LIGNES_DE_MESURE_AU_JOURNAL = 30
/** Rappels natifs comptés pour un appui : ceux de ce délai après lui (au-delà, le défilement). */
const MESURE_DESSIN_MS = 10_000

/** Les lignes de mesure déjà données au journal dans cette exécution. */
let lignesAuJournal = 0

/**
 * Une ligne de mesure, d'un appui de cette durée (ms) : au journal s'il se voit (SEUIL_JOURNAL_MS) et tant que la borne le
 * permet (`note` la dit aussi à la console), sinon à la console ; jamais d'erreur.
 */
function direMesure(ligne: string, duree: number) {
  if (duree >= SEUIL_JOURNAL_MS && lignesAuJournal < LIGNES_DE_MESURE_AU_JOURNAL) {
    lignesAuJournal++
    const texte = lignesAuJournal < LIGNES_DE_MESURE_AU_JOURNAL ? ligne
      : `[mesure] ${LIGNES_DE_MESURE_AU_JOURNAL - 1} lignes de mesure au journal : la suite à la console seulement`
    try {
      note(texte)
      if (texte === ligne) return
    } catch { /* journal indisponible : la console */ }
  }
  try {
    console.log(ligne)
  } catch { /* console indisponible : rien */ }
}

/**
 * Ce que Scripting fait d'un appui après son rendu (tickets 4.46 et 4.49) : les Blocs lus (lecteur d'environnement rappelé hors
 * du rendu) et les tracés de fond de Bloc, chacun compté avec l'heure du premier et du dernier.
 */
type SuiteMesure = {
  quoi: string; ouvert: string; depuis: number; lus: number; dernierLu: number; traces: number; premier: number; dernier: number
}
let suiteMesure: SuiteMesure | null = null

/** Écrit la ligne de suite de l'appui précédent, s'il a eu des lectures ou des tracés après son rendu ; puis l'oublie. */
function direSuite() {
  const s = suiteMesure
  suiteMesure = null
  if (s === null || (s.lus === 0 && s.traces === 0)) return
  const parts: string[] = []
  if (s.lus > 0) parts.push(`${s.lus} blocs lus après le rendu, le dernier à +${s.dernierLu - s.depuis} ms`)
  if (s.traces > 0) parts.push(`${s.traces} tracés de bloc, le premier à +${s.premier - s.depuis} ms, le dernier à +${s.dernier - s.depuis} ms`)
  const fin = Math.max(s.lus > 0 ? s.dernierLu : 0, s.traces > 0 ? s.dernier : 0) - s.depuis
  direMesure(`[mesure] suite ${s.quoi} ${s.ouvert} : ${parts.join(" ; ")} de l'appui`, fin)
}

/**
 * Un appui commence (gestionnaire d'appui) : sa ligne suit le premier effet après le rendu qui va jusqu'à la FinDuRendu de
 * son `lieu` (la page par défaut ; le Détail pour l'ouverture d'une partie, ticket 4.49).
 */
export function mesurerAppui(quoi: string, lieu: LieuMesure = "page") {
  direSuite()
  appuiMesure = { quoi, lieu, depuis: Date.now(), calcul: 0, debut: null, fin: null, blocsRendus: 0, blocsLus: 0 }
}

/** Mettre à jour ou l'import commence (app.tsx) : l'appui en cours n'est plus mesuré (sa ligne dirait la collecte). */
export function oublierAppui() {
  appuiMesure = null
}

/** L'onglet se ferme : la ligne de suite du dernier appui, s'il en a une. */

let sondeDite = false
/**
 * Ticket 4.50, phase A : une ligne au journal, une seule par exécution, à l'ouverture de l'onglet Stats (une clé rangée), sans geste : le JSX
 * des écrans passe-t-il par rendu.ts, la forme d'un nœud de Scripting, iOS, les méthodes de WebViewController (sondeRendu).
 * Jamais d'erreur ; journal indisponible : la console.
 */
export function direSondeRendu() {
  if (sondeDite) return
  sondeDite = true
  let ligne = "[sonde] rendu web : illisible"
  try { ligne = sondeRendu() } catch { /* jamais : la ligne par défaut */ }
  try {
    note(ligne)
  } catch {
    try { console.log(ligne) } catch { /* rien */ }
  }
}

export function finirMesure() {
  direSuite()
}

/** La suite de l'appui dont le rendu est fini (sa ligne pas encore écrite, ou déjà), dans ses MESURE_DESSIN_MS ; sinon null. */
function suiteEnCours(t: number): SuiteMesure | null {
  const m = appuiMesure
  const s = suiteMesure !== null ? suiteMesure
    : m !== null && m.fin !== null ? (suiteMesure = { quoi: m.quoi, ouvert: "", depuis: m.depuis, lus: 0, dernierLu: 0, traces: 0, premier: 0, dernier: 0 })
    : null
  return s !== null && t - s.depuis <= MESURE_DESSIN_MS ? s : null
}

/**
 * Un tracé du fond d'un Bloc (dessin.tsx), rappelé par SwiftUI à la mise en page : compté pour l'appui mesuré s'il vient après
 * son rendu et dans les MESURE_DESSIN_MS qui le suivent. Jamais d'erreur.
 */
export function traceMesure() {
  const t = Date.now()
  const s = suiteEnCours(t)
  if (s === null) return
  if (s.traces === 0) s.premier = t
  s.traces++
  s.dernier = t
}

/**
 * Ticket 4.49 : un Bloc (dessin.tsx) rendu (`lu` faux : sa fonction) ou lu (`lu` vrai : son lecteur d'environnement rappelé) ;
 * pendant le rendu d'un appui, compté dans sa ligne ; après, hors de tout rendu de l'app (Scripting qui le lit de lui-même :
 * pile paresseuse, défilement), dans sa suite (lu seulement). Jamais d'erreur.
 */
export function blocMesure(lu: boolean) {
  const m = appuiMesure
  if (m !== null && m.debut !== null && m.fin === null) {
    if (lu) m.blocsLus++
    else m.blocsRendus++
    return
  }
  if (!lu || enRendu) return
  const t = Date.now()
  const s = suiteEnCours(t)
  if (s === null) return
  s.lus++
  s.dernierLu = t
}

/**
 * Le début d'un rendu de l'appui en cours : `racine` (l'onglet) le repose à chacun de ses rendus, un sous-onglet ou le Détail
 * seul s'il manque. Rend le numéro de ce rendu, à passer à FinDuRendu (ticket 4.49).
 */
export function debutDeRendu(racine: boolean): number {
  const m = appuiMesure
  if (m !== null && m.fin === null && (racine || m.debut === null)) m.debut = Date.now()
  enRendu = true
  return ++tours
}

/** Un calcul du périmètre, son temps compté dans l'appui en cours. */
export function calculMesure<T>(calcul: () => T): T {
  if (appuiMesure === null) return calcul()
  const t = Date.now()
  try {
    return calcul()
  } finally {
    if (appuiMesure !== null) appuiMesure.calcul += Date.now() - t
  }
}

/**
 * Dernier enfant d'un écran mesuré : la fin du rendu de l'appui en cours si `lieu` est le sien (la page par défaut) ; ne rend
 * rien. `tour` : le numéro de ce rendu (debutDeRendu), qui change à chaque rendu pour que Scripting le rappelle (ticket 4.49).
 */
export function FinDuRendu({ lieu = "page" }: { tour: number; lieu?: LieuMesure }) {
  const m = appuiMesure
  if (m !== null && m.lieu === lieu && m.debut !== null && m.fin === null) m.fin = Date.now()
  enRendu = false
  return null
}

/**
 * L'effet qui écrit la ligne de l'appui en cours (`ouvert` : le sous-onglet ou le Détail, `perimetre` : son libellé, le dernier
 * dit s'il manque), une fois son rendu fini, si `lieu` est le sien (ticket 4.49 : le Détail ne dit pas un appui de la page).
 */
export function useLigneDeMesure(ouvert: string, perimetre?: string, lieu: LieuMesure = "page") {
  if (perimetre !== undefined) dernierPerimetre = perimetre
  const libelle = perimetre !== undefined ? perimetre : dernierPerimetre
  const rendu = appuiMesure === null ? 0 : ++rendusMesures
  useEffect(() => {
    const m = appuiMesure
    if (m === null || m.lieu !== lieu || m.debut === null || m.fin === null) {
      if (m !== null && Date.now() - m.depuis > MESURE_PERIMEE_MS) appuiMesure = null
      return
    }
    appuiMesure = null
    const effet = Date.now()
    const total = effet - m.depuis
    // Ticket 4.46 : un appui dont l'effet vient au-delà de MESURE_PERIMEE_MS (une collecte passée entre-temps) ne dit rien.
    if (total > MESURE_PERIMEE_MS) {
      suiteMesure = null
      return
    }
    // Tickets 4.46 et 4.49 : la suite de cet appui, comptée jusqu'à l'appui suivant (déjà commencée avant l'effet, ou neuve).
    const s = suiteMesure !== null && suiteMesure.depuis === m.depuis ? suiteMesure
      : { quoi: m.quoi, ouvert, depuis: m.depuis, lus: 0, dernierLu: 0, traces: 0, premier: 0, dernier: 0 }
    s.ouvert = ouvert
    suiteMesure = s
    const duree = Math.max(0, m.fin - m.debut - m.calcul)
    const parts = `attente ${m.debut - m.depuis}, calcul ${m.calcul}, rendu ${duree}, après le rendu ${effet - m.fin}`
    direMesure(`[mesure] ${m.quoi} ${ouvert} · ${libelle} : de l'appui à l'effet ${total} ms (${parts}) ; blocs pendant le rendu : ${m.blocsRendus} rendus, ${m.blocsLus} lus`, total)
  }, [rendu])
}
