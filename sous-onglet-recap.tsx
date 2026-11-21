import {
  Button, DatePicker, EnvironmentValuesReader, HStack, Image, Spacer, Text, VStack, type DynamicTypeSize,
} from "scripting"
import { createElement, Fragment, useRef, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { BoutonPrincipal, ESPACES, TYPO, couleurs, tailleAccessibilite, type Palette } from "./design"
import { PileDeBlocs, creux } from "./design" // ticket 4.46 : blocs du sous-onglet dans une pile paresseuse
import { Bloc, SelecteurSegmente, sansMauvaiseCoupure, type Segment } from "./dessin"
import {
  CASES_RECAP, DEMANDE_DEFAUT, LIBELLES_MODE_RECAP, LIBELLES_PERIODE_RECAP, TOUTES_LES_CASES, debutDuRecap, debutDuTexte, genererRecap,
  partiesDuRecap, periodeDuRecap, periodeEnClair, selectionnerRecap,
  type CleCase, type DebutRecap, type DemandeRecap, type DocumentRecap, type DonneesRecap, type ModeRecap, type PeriodeRecap,
  type SelectionRecap,
} from "./recap"
import type { Emplacement, PropsEmplacement } from "./app"

























// Caractères écrits par leur code : l'outil d'écriture les rendrait invisibles dans la source.
const NBSP = String.fromCharCode(0xa0)

const PREMIER = new RegExp("1" + String.fromCharCode(0x1d49, 0x2b3), "g")
const JOUR_MS = 86_400_000

/** Le titre du Bloc (maquette) : en capitales par le Bloc (entrée 4.42), jamais par l'écran. */
export const TITRE_PERIODE = "Période"
/** La période du Récap (EXPERIENCE.md, Sélecteur segmenté) : Semaine, Mois, Acte, Autre, aux libellés de recap.ts. */
export const SEGMENTS_PERIODE_RECAP: readonly Segment<PeriodeRecap>[] = (["semaine", "mois", "acte", "autre"] as const).map((cle) => ({ cle, libelle: LIBELLES_PERIODE_RECAP[cle] }))
/** Le mode du Récap, sous sa période : Compétition, Tout. */
export const SEGMENTS_MODE_RECAP: readonly Segment<ModeRecap>[] = (["competition", "tout"] as const).map((cle) => ({ cle, libelle: LIBELLES_MODE_RECAP[cle] }))
/** Les deux dates libres d'Autre (EXPERIENCE.md, Sélecteur segmenté) : leur libellé, écrit et dit. */
export const LIBELLE_DU = "Du"
export const LIBELLE_AU = "Au"
/**
 * La phrase de State Patterns (Période antérieure à la première partie gardée : « Si la période commence avant ta première
 * partie gardée, le récap le dit et part de celle-ci. »), dite au présent, seulement quand c'est le cas ; la date de départ est
 * celle de la période réelle, juste au-dessus.
 */
export const AVANT_PREMIERE = "La période demandée commence avant ta première partie gardée : le récap part de celle-ci."
/**
 * Les tailles de texte ordinaires où les segments du Récap passent l'un sous l'autre (aux tailles d'accessibilité, la brique
 * le fait d'elle-même) : mesuré sur le Mac, « SEMAINE » ne tient plus dans un quart du Bloc à xxxLarge sur 402 points, dès
 * xxLarge sur 375 ; les deux Sélecteurs ensemble, pour un Bloc d'une seule allure.
 */
export const TAILLES_EMPILEES: readonly DynamicTypeSize[] = ["xxLarge", "xxxLarge"]

export const PLAFOND_DATES: DynamicTypeSize = "accessibility2"
/** Écart entre l'étiquette d'une date et sa valeur, au-dessus d'elle aux tailles d'accessibilité. */
const ECART_DATE = 4

export const BOUTON_TELECHARGER = "Télécharger le récap"
export const ICONE_TELECHARGER = "square.and.arrow.down"
/** La phrase sous le bouton (EXPERIENCE.md, Voice and Tone ; maquette). */
export const PHRASE_PARTAGE = "Le document s'ouvre dans la feuille de partage : envoie-le à Claude, à ChatGPT, ou garde-le dans Fichiers."
/** Ce que VoiceOver lit après le libellé, de l'appui à l'effacement du fichier (comme « Import lancé » de l'import). */
export const EN_PREPARATION = "Récap en préparation"
/**
 * La raison sous le bouton inactif (State Patterns : aucune partie dans la période du récap, « raison écrite dessous »), par
 * mode : les phrases des autres sous-onglets et du document.
 */
export const SANS_PARTIE_RECAP: Readonly<Record<ModeRecap, string>> = {
  competition: "Aucune partie de compétition gardée dans cette période.",
  tout: "Aucune partie gardée dans cette période.",
}
/** La raison quand la sélection n'a pas pu être calculée (ni période réelle ni phrase au-dessus). */
export const RECAP_INCALCULABLE = "Le récap ne peut pas être préparé sur cette période."
/** Le message d'un appui qui n'a pas abouti : génération, écriture ou feuille de partage en échec ; rien n'est parti. */
export const RECAP_PAS_ENVOYE = "Récap pas envoyé : il n'a pas pu être préparé ou partagé. Réessaie."
/** Les titres des Blocs du Contenu et de l'Aperçu (maquette) : en capitales par le Bloc (entrée 4.42), jamais par l'écran. */
export const TITRE_CONTENU = "Contenu"
export const TITRE_APERCU = "Aperçu"
/** Ce que VoiceOver lit après le libellé d'une case (EXPERIENCE.md, Case à cocher : bascule, « cochée » ou « décochée »). */
export const VALEUR_COCHEE = "cochée"
export const VALEUR_DECOCHEE = "décochée"
/** Les SF Symbols de la case (DESIGN.md, Case à cocher) : pleine et cochée, ou vide. */
export const ICONE_COCHEE = "checkmark.square.fill"
export const ICONE_VIDE = "square"
/** La case (DESIGN.md, case-a-cocher : size 18 ; vide-border-width 2) : côté de l'icône, et la graisse qui donne ce contour. */
const CASE = { icone: 18, graisse: "semibold" } as const
/**
 * La plus grande taille d'un libellé de case : mesuré sur le Mac (SF Pro, subheadline), « l'entraînement » ne tient plus à côté
 * de la case à accessibility5 sur un écran de 375 points ; il tient jusqu'à accessibility4, sur 402 comme sur 375.
 */
export const PLAFOND_CASES: DynamicTypeSize = "accessibility4"
/**
 * La raison sous le bouton inactif quand aucune case n'est cochée (State Patterns : « aucune case cochée », raison écrite
 * dessous) : le document n'aurait que son titre et son pied.
 */
export const AUCUNE_CASE = "Aucune case cochée : coche au moins une case du Contenu."
/**
 * Le début du document que montre l'Aperçu, en caractères (debutDuTexte) : 600 jusqu'à large (la consigne et le début du
 * Contexte), 400 de xLarge à xxxLarge (TAILLES_APERCU_COURT), 200 aux tailles d'accessibilité, pour un Aperçu de hauteur
 * voisine à toute taille ; jamais plus de 600, ce que l'écran calcule une fois.
 */
export const CARACTERES_APERCU = { ordinaire: 600, grand: 400, accessibilite: 200 } as const
export const TAILLES_APERCU_COURT: readonly DynamicTypeSize[] = ["xLarge", "xxLarge", "xxxLarge"]
/**
 * La plus grande taille de l'Aperçu : mesuré sur le Mac (SF Mono, footnote), « d'entraînement, » se couperait dans le mot dès
 * accessibility4, sur 402 comme sur 375 ; aucun mot coupé jusqu'à accessibility2.
 */
export const PLAFOND_APERCU: DynamicTypeSize = "accessibility2"
/** Marge du cadre de l'Aperçu (DESIGN.md, apercu-recap : padding 12). */
const MARGE_APERCU = 12

// ─────────────────────────── dates libres ───────────────────────────

/** Les deux dates libres d'Autre, à midi de leur jour. */
export type DatesLibres = { du: number; au: number }

/** Le jour de `ms` à `heure` h, décalé de `decalage` jours, à l'heure de l'iPhone. */
function aLHeure(ms: number, heure: number, decalage: number = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + decalage, heure).getTime()
}

/** Midi du jour de `ms`, à l'heure de l'iPhone : la valeur d'un DatePicker de jours, loin de minuit et des changements d'heure. */
export function midi(ms: number): number {
  return aLHeure(ms, 12)
}

/** Le début (minuit) et la fin (la dernière milliseconde) du jour de `ms` : les bornes d'un DatePicker de jours. */
export function debutDuJour(ms: number): number {
  return aLHeure(ms, 0)
}
export function finDuJour(ms: number): number {
  return aLHeure(ms, 0, 1) - 1
}

/** Les dates d'Autre au premier choix : la période du Mois, du jour de `now` − 30 jours à aujourd'hui. */
export function datesParDefaut(now: number): DatesLibres {
  return { du: midi(now - 30 * JOUR_MS), au: midi(now) }
}

/** La demande du Récap pour ces choix (recap.ts, DemandeRecap) ; Autre, avec ses dates. */
export function demandeDe(periode: PeriodeRecap, mode: ModeRecap, dates: DatesLibres): DemandeRecap {
  return periode === "autre" ? { periode, mode, du: dates.du, au: dates.au } : { periode, mode }
}

// ─────────────────────────── période réelle ───────────────────────────


function periodeEcrite(sel: SelectionRecap): string {
  const p = periodeEnClair(periodeDuRecap(sel))
  return p.charAt(0).toUpperCase() + p.slice(1)
}






export function periodeReelle(sel: SelectionRecap): string {
  return `${periodeEcrite(sel)}${NBSP}· ${partiesDuRecap(sel)}`
}


export function periodeReelleDite(sel: SelectionRecap): string {
  return `${periodeEcrite(sel).replace(PREMIER, "1er")}, ${partiesDuRecap(sel)}`
}

// ─────────────────────────── le Bloc « Période » ───────────────────────────

/**
 * Une date libre (DESIGN.md, Contrôles : allure du système admise pour le choix des dates) : un DatePicker compact, jours seuls,
 * titré « Du » ou « Au » (son libellé VoiceOver), son étiquette du système masquée ; la nôtre en libellé de case `texte`, masquée
 * à VoiceOver ; la valeur rendue à midi de son jour ; bornes `debut` et `fin` (ms). Une rangée de 44 au moins, étiquette à
 * gauche, date à droite ; aux tailles d'accessibilité, l'étiquette au-dessus ; DatePicker plafonné à PLAFOND_DATES.
 */
function DateLibre({ c, grand, libelle, valeur, debut, fin, onChoix }: {
  c: Palette; grand: boolean; libelle: string; valeur: number; debut?: number; fin: number; onChoix: (ms: number) => void
}) {
  const etiquette = (
    <Text {...TYPO.libelleCase} foregroundStyle={c.texte} accessibilityHidden>
      {libelle}
    </Text>
  )
  const choix = (
    <DatePicker
      title={libelle}
      value={valeur}
      onChanged={(ms: number) => onChoix(midi(ms))}
      startDate={debut}
      endDate={fin}
      displayedComponents={["date"]}
      datePickerStyle="compact"
      labelsHidden
      dynamicTypeSize={{ to: PLAFOND_DATES }}
      frame={{ minHeight: ESPACES.cible }}
    />
  )
  return grand ? (
    <VStack alignment="leading" spacing={ECART_DATE} frame={{ maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" }}>
      {etiquette}
      {choix}
    </VStack>
  ) : (
    <HStack spacing={ESPACES.cellule} frame={{ maxWidth: "infinity", minHeight: ESPACES.cible }}>
      {etiquette}
      <Spacer />
      {choix}
    </HStack>
  )
}







function BlocPeriode({ periode, mode, dates, sel, onPeriode, onMode, onDates }: {
  periode: PeriodeRecap; mode: ModeRecap; dates: DatesLibres; sel: SelectionRecap | null
  onPeriode: (p: PeriodeRecap) => void; onMode: (m: ModeRecap) => void; onDates: (d: DatesLibres) => void
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const taille = env.dynamicTypeSize
        const empile = taille !== undefined && TAILLES_EMPILEES.includes(taille)
        const grand = tailleAccessibilite(taille)
        const note = sel !== null && sel.avantPremiere ? sansMauvaiseCoupure(AVANT_PREMIERE) : undefined
        return (
          <Bloc titre={TITRE_PERIODE} niveau="section" coin="bas" note={note}>
            <SelecteurSegmente segments={SEGMENTS_PERIODE_RECAP} choisi={periode} onChoix={onPeriode} empile={empile} />
            {periode === "autre" ? (
              <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <DateLibre
                  c={c} grand={grand} libelle={LIBELLE_DU} valeur={dates.du} fin={finDuJour(dates.au)}
                  onChoix={(du) => onDates({ du, au: dates.au })}
                />
                <DateLibre
                  c={c} grand={grand} libelle={LIBELLE_AU} valeur={dates.au} debut={debutDuJour(dates.du)} fin={finDuJour(Date.now())}
                  onChoix={(au) => onDates({ du: dates.du, au })}
                />
              </VStack>
            ) : null}
            <SelecteurSegmente segments={SEGMENTS_MODE_RECAP} choisi={mode} onChoix={onMode} empile={empile} />
            {sel !== null ? (
              <Text {...TYPO.ligne} foregroundStyle={c.texte} accessibilityElement accessibilityLabel={periodeReelleDite(sel)}>
                {periodeReelle(sel)}
              </Text>
            ) : null}
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── le Contenu ───────────────────────────

/** Les cases cochées après un appui sur la case `cle` : elle bascule, les autres restent ; toujours dans l'ordre de la maquette. */
export function basculer(cochees: readonly CleCase[], cle: CleCase): CleCase[] {
  return TOUTES_LES_CASES.filter((c) => (c === cle ? !cochees.includes(c) : cochees.includes(c)))
}

/**
 * Une Case à cocher (DESIGN.md, Case à cocher ; EXPERIENCE.md, Component Patterns ; iOS n'a pas de style case à cocher) : un
 * bouton plain, toute la rangée, 44 de haut au moins sur toute la largeur ; la case, SF Symbol de 18, semi-gras : pleine
 * `orange` et coche `fond` (palette), ou vide, contour `texte-doux`, masquée à VoiceOver ; à 10, le libellé en libellé de case
 * `texte`, à la ligne entre deux mots (sansMauvaiseCoupure), la case alignée sur sa première ligne, plafonné à PLAFOND_CASES.
 * VoiceOver : le libellé, puis « cochée » ou « décochée », bascule (trait `isToggle`).
 */
function CaseACocher({ c, libelle, cochee, onBascule }: { c: Palette; libelle: string; cochee: boolean; onBascule: () => void }) {
  return (
    <Button
      buttonStyle="plain"
      action={onBascule}
      accessibilityLabel={libelle}
      accessibilityValue={cochee ? VALEUR_COCHEE : VALEUR_DECOCHEE}
      accessibilityAddTraits="isToggle"
    >
      <HStack
        alignment="firstTextBaseline"
        spacing={ESPACES.cellule}
        frame={{ maxWidth: "infinity", minHeight: ESPACES.cible, alignment: "leading" }}
        contentShape="rect"
      >
        {cochee ? (
          <Image
            systemName={ICONE_COCHEE} font={CASE.icone} fontWeight={CASE.graisse}
            symbolRenderingMode="palette" foregroundStyle={{ primary: c.fond, secondary: c.orange }} accessibilityHidden
          />
        ) : (
          <Image
            systemName={ICONE_VIDE} font={CASE.icone} fontWeight={CASE.graisse}
            symbolRenderingMode="monochrome" foregroundStyle={c.texteDoux} accessibilityHidden
          />
        )}
        <Text {...TYPO.libelleCase} foregroundStyle={c.texte} dynamicTypeSize={{ to: PLAFOND_CASES }}>
          {sansMauvaiseCoupure(libelle)}
        </Text>
      </HStack>
    </Button>
  )
}

/**
 * Le Bloc « Contenu » (maquette : titre de section, coin haut) : les 13 cases de l'entrée 1, dans l'ordre de CASES_RECAP, l'une
 * sous l'autre à 0 (leurs rangées de 44 font l'écart) ; `cochees` les montre, `onBascule` rend l'appui au Récap.
 */
function BlocContenu({ cochees, onBascule }: { cochees: readonly CleCase[]; onBascule: (cle: CleCase) => void }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Bloc titre={TITRE_CONTENU} niveau="section" coin="haut">
            <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {CASES_RECAP.map((k) => (
                <CaseACocher key={k.cle} c={c} libelle={k.libelle} cochee={cochees.includes(k.cle)} onBascule={() => onBascule(k.cle)} />
              ))}
            </VStack>
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── l'Aperçu ───────────────────────────

/** Les caractères du début que montre l'Aperçu à cette taille de texte (CARACTERES_APERCU). */
export function caracteresDeLApercu(taille: DynamicTypeSize | undefined): number {
  if (tailleAccessibilite(taille)) return CARACTERES_APERCU.accessibilite
  if (taille !== undefined && TAILLES_APERCU_COURT.includes(taille)) return CARACTERES_APERCU.grand
  return CARACTERES_APERCU.ordinaire
}

/**
 * Le texte de l'Aperçu : le début du document (debutDuRecap), raccourci à `caracteres` par la même coupe (debutDuTexte), puis,
 * si le document continue, « … » seul sur la ligne suivante quand la coupe tombe en fin de ligne, collé au dernier mot sinon
 * (maquette).
 */
export function texteDeLApercu(debut: DebutRecap, caracteres: number): string {
  const court = debutDuTexte(debut.texte, caracteres)
  const suite = court.suite === "aucune" ? debut.suite : court.suite
  return suite === "aucune" ? court.texte : suite === "ligne" ? `${court.texte}\n…` : `${court.texte}…`
}






export function apercuDit(sel: SelectionRecap, cochees: number): string {
  const pluriel = cochees > 1 ? "s" : ""
  return `Aperçu du récap : ${cochees} case${pluriel} cochée${pluriel} sur ${CASES_RECAP.length}, ${periodeEnClair(periodeDuRecap(sel)).replace(PREMIER, "1er")}, ${partiesDuRecap(sel)}`
}

/**
 * Le Bloc « Aperçu » (maquette : titre de section, sans coin ; DESIGN.md, apercu-recap) : un cadre `fond` de marge 12, toute la
 * largeur ; dedans, le texte de l'Aperçu (caracteresDeLApercu, texteDeLApercu) en aperçu `texte-doux`, chasse fixe, Markdown
 * brut, retours à la ligne gardés, à la ligne entre deux mots (sansMauvaiseCoupure), plafonné à PLAFOND_APERCU ; lecture
 * seule ; un seul élément VoiceOver, la phrase d'apercuDit. Sans sélection ou sans début (calcul impossible) : sa phrase
 * RECAP_INCALCULABLE à la place.
 */
function BlocApercu({ sel, debut, cochees }: { sel: SelectionRecap | null; debut: DebutRecap | null; cochees: number }) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        if (sel === null || debut === null) return <Bloc titre={TITRE_APERCU} niveau="section" vide={RECAP_INCALCULABLE} />
        const c = couleurs(env.colorSchemeContrast)
        return (
          <Bloc titre={TITRE_APERCU} niveau="section">
            <VStack
              alignment="leading"
              padding={MARGE_APERCU}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              background={creux(c)}
              accessibilityElement
              accessibilityLabel={apercuDit(sel, cochees)}
            >
              <Text {...TYPO.apercu} foregroundStyle={c.texteDoux} dynamicTypeSize={{ to: PLAFOND_APERCU }}>
                {sansMauvaiseCoupure(texteDeLApercu(debut, caracteresDeLApercu(env.dynamicTypeSize)))}
              </Text>
            </VStack>
          </Bloc>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── le partage ───────────────────────────

/** L'issue d'un partage : partagé (feuille fermée sur un envoi), annulé (fermée sans), ou échec (rien n'est parti). */
export type IssuePartage = "partage" | "annule" | "echec"

/**
 * Le chemin du fichier `nom` dans le dossier temporaire de Scripting (FileManager.temporaryDirectory ; stack.md), que l'hôte
 * le donne avec ou sans « / » final.
 */
export function cheminTemporaire(nom: string): string {
  const dossier = FileManager.temporaryDirectory
  return dossier.endsWith("/") ? dossier + nom : `${dossier}/${nom}`
}

/** Efface le fichier temporaire s'il existe ; un refus est dit en console (iOS vide aussi ce dossier de lui-même). */
function effacer(chemin: string): void {
  try {
    if (FileManager.existsSync(chemin)) FileManager.removeSync(chemin)
  } catch (e) {
    console.log(`récap : fichier temporaire pas effacé (${e})`)
  }
}

/**
 * Passe un document à la feuille de partage d'iOS (stack.md ; contrat-donnees.md, « Le récap n'est pas conservé ») : l'écrit
 * sous son nom dans le dossier temporaire, seul fichier écrit, le passe seul à ShareSheet.present, qui rend la main à la
 * fermeture de la feuille, puis l'efface, quelle qu'en soit l'issue : partagé, annulé, feuille refusée ou fermée en erreur,
 * écriture qui lève (un fichier commencé est effacé aussi). Ni lecture ni requête. Ne lève pas : l'échec est une issue.
 */
export async function partagerRecap(doc: DocumentRecap): Promise<IssuePartage> {
  let chemin: string | null = null
  try {
    chemin = cheminTemporaire(doc.nom)
    await FileManager.writeAsString(chemin, doc.texte)
    return (await ShareSheet.present([chemin])) ? "partage" : "annule"
  } catch (e) {
    console.log(`récap : partage impossible (${e})`)
    return "echec"
  } finally {
    if (chemin !== null) effacer(chemin)
  }
}

/** Rend la main à l'écran (comme `dormir(0)` de l'import), pour qu'il montre l'état en cours avant le calcul du document. */
function laisserPeindre(): Promise<void> {
  return new Promise((fin) => setTimeout(() => fin(), 0))
}

/**
 * Le Bouton principal du Récap et ce qui l'accompagne (DESIGN.md, Récap et boutons ; maquette), à 14, sur toute la largeur :
 * « Télécharger le récap », icône de téléchargement, typographie du Récap, 56 de haut au moins ; inactif, sa `raison` dessous ;
 * en cours (`enCours`), l'indicateur à la place de l'icône et « Récap en préparation » lu après le libellé ; la phrase de la
 * feuille de partage ; le `message` d'un appui en échec, en `corps` `orange`. Raison et phrase en `petit` `texte-discret` ;
 * tout centré, à la ligne entre deux mots (sansMauvaiseCoupure : « Aucune case cochée : … » de l'entrée 9 ne laisse pas ses
 * deux-points seuls en tête de ligne). Le bouton toujours en tête : jamais recréé quand une ligne paraît.
 */
function ZoneTelecharger({ raison, enCours, message, onTelecharger }: {
  raison: string | null; enCours: boolean; message: string | null; onTelecharger: () => void
}) {
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <VStack spacing={ESPACES.entreBlocs} frame={{ maxWidth: "infinity" }}>
            <BoutonPrincipal
              libelle={BOUTON_TELECHARGER} icone={ICONE_TELECHARGER} recap action={onTelecharger}
              inactif={raison !== null} enCours={enCours}
              valeurAccessibilite={enCours ? EN_PREPARATION : undefined} valeurSuivie
            />
            {raison !== null ? (
              <Text {...TYPO.petit} foregroundStyle={c.texteDiscret} multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
                {sansMauvaiseCoupure(raison)}
              </Text>
            ) : null}
            <Text {...TYPO.petit} foregroundStyle={c.texteDiscret} multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
              {sansMauvaiseCoupure(PHRASE_PARTAGE)}
            </Text>
            {message !== null ? (
              <Text {...TYPO.corps} foregroundStyle={c.orange} multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
                {sansMauvaiseCoupure(message)}
              </Text>
            ) : null}
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

// ─────────────────────────── le sous-onglet ───────────────────────────

/** La sélection gardée : sur quelles données, pour quelle demande (sa clé), et elle (null : calcul impossible). */
type CalculRecap = { donnees: DonneesRecap; cle: string; sel: SelectionRecap | null }
/** Le début gardé pour l'Aperçu : de quelle sélection, pour quelles cases cochées (jointes), et lui (null : calcul impossible). */
type ApercuGarde = { sel: SelectionRecap | null; cases: string; debut: DebutRecap | null }

/**
 * Le Récap dans son emplacement (PropsEmplacement de app.tsx) : sa période (Mois), son mode (Compétition) et ses dates libres
 * (posées au premier choix d'Autre, la période du Mois, puis gardées tant que le Récap reste ouvert) ; la sélection du récap
 * (selectionnerRecap, à l'heure du calcul) gardée d'un rendu à l'autre et recalculée seulement quand les données ou la demande
 * changent ; un calcul qui lève la laisse nulle, dit en console. Les cases cochées (entrée 9) : toutes à l'ouverture, gardées
 * quand la période, le mode ou les dates changent ; le début du document pour l'Aperçu (debutDuRecap, CARACTERES_APERCU.ordinaire
 * au plus, à l'heure du calcul) gardé de même et recalculé seulement quand la sélection ou les cases cochées changent : seules
 * ses premières sections s'écrivent, jamais le document entier ; un calcul qui lève le laisse nul, dit en console. Une pile à
 * 14 : le Bloc « Période », le Bloc « Contenu », le Bloc « Aperçu », puis le Bouton principal et ses lignes (entrée 8). Raison
 * du bouton inactif : sélection ou début incalculable, puis aucune partie, puis aucune case cochée. L'appui (un seul à la fois,
 * jusqu'à l'effacement du fichier ; aucun avec une raison) : état en cours, la main rendue à l'écran, le document de la
 * sélection courante avec les cases cochées à l'heure de l'appui, partagé par partagerRecap ; un échec (génération comprise)
 * laisse le message, retiré à l'appui suivant ou au prochain choix de période, de mode, de dates ou de cases. Aucune lecture
 * ni requête ; une seule écriture, le fichier temporaire de l'appui ; le périmètre commun n'est ni lu ni réglé.
 */
export function Recap({ donnees }: PropsEmplacement) {
  const [periode, setPeriode] = useState<PeriodeRecap>(DEMANDE_DEFAUT.periode)
  const [mode, setMode] = useState<ModeRecap>(DEMANDE_DEFAUT.mode)
  const [libres, setLibres] = useState<DatesLibres | null>(null)
  const garde = useRef<CalculRecap | null>(null)
  const [enCours, setEnCours] = useState(false)
  /** Le dernier appui a échoué : son message, jusqu'à l'appui suivant ou au prochain choix de période, de mode, de dates ou de cases. */
  const [echec, setEchec] = useState(false)
  const occupe = useRef(false)
  const [cochees, setCochees] = useState<readonly CleCase[]>(TOUTES_LES_CASES)
  const gardeApercu = useRef<ApercuGarde | null>(null)
  const dates = libres ?? datesParDefaut(Date.now())
  const demande = demandeDe(periode, mode, dates)
  const cle = demande.periode === "autre" ? `autre|${mode}|${demande.du}|${demande.au}` : `${demande.periode}|${mode}`
  let calcul = garde.current
  if (calcul === null || calcul.donnees !== donnees || calcul.cle !== cle) {
    let sel: SelectionRecap | null = null
    try {
      sel = selectionnerRecap(donnees, demande, Date.now())
    } catch (e) {
      console.log(`récap : calcul impossible (${e})`)
    }
    calcul = { donnees, cle, sel }
    garde.current = calcul
  }
  const sel = calcul.sel
  const choisirPeriode = (p: PeriodeRecap) => {
    if (p === "autre" && libres === null) setLibres(datesParDefaut(Date.now()))
    setEchec(false)
    setPeriode(p)
  }
  const choisirMode = (m: ModeRecap) => {
    setEchec(false)
    setMode(m)
  }
  const choisirDates = (d: DatesLibres) => {
    setEchec(false)
    setLibres(d)
  }
  const choisirCase = (touchee: CleCase) => {
    setEchec(false)
    setCochees((avant) => basculer(avant, touchee))
  }
  const cases = cochees.join(",")
  let apercu = gardeApercu.current
  if (apercu === null || apercu.sel !== sel || apercu.cases !== cases) {
    let debut: DebutRecap | null = null
    if (sel !== null) {
      try {
        debut = debutDuRecap(sel, cochees, Date.now(), CARACTERES_APERCU.ordinaire)
      } catch (e) {
        console.log(`récap : aperçu impossible (${e})`)
      }
    }
    apercu = { sel, cases, debut }
    gardeApercu.current = apercu
  }
  const debut = apercu.debut
  const raison = sel === null || debut === null
    ? RECAP_INCALCULABLE
    : sel.metriques.parties.length === 0 ? SANS_PARTIE_RECAP[sel.demande.mode] : cochees.length === 0 ? AUCUNE_CASE : null
  const telecharger = async () => {
    if (occupe.current || sel === null || raison !== null) return
    occupe.current = true
    setEnCours(true)
    setEchec(false)
    let issue: IssuePartage = "echec"
    try {
      await laisserPeindre()
      issue = await partagerRecap(genererRecap(sel, cochees, Date.now()))
    } catch (e) {
      console.log(`récap : document impossible à générer (${e})`)
    } finally {
      occupe.current = false
      setEnCours(false)
      setEchec(issue === "echec")
    }
  }
  return (
    <PileDeBlocs>
      <BlocPeriode
        periode={periode} mode={mode} dates={dates} sel={sel}
        onPeriode={choisirPeriode} onMode={choisirMode} onDates={choisirDates}
      />
      <BlocContenu cochees={cochees} onBascule={choisirCase} />
      <BlocApercu sel={sel} debut={debut} cochees={cochees.length} />
      <ZoneTelecharger raison={raison} enCours={enCours} message={echec ? RECAP_PAS_ENVOYE : null} onTelecharger={telecharger} />
    </PileDeBlocs>
  )
}

/** L'emplacement du sous-onglet Récap dans la Barre de sous-onglets (SOUS_ONGLETS de app.tsx) : rempli. */
export const EMPLACEMENT_RECAP: Emplacement = Recap
