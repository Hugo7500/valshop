import {
  Button, EmptyView, EnvironmentValuesReader, HStack, LazyVStack, List, Navigation, NavigationStack, ProgressView, Rectangle, RoundedRectangle,
  Script, ScrollView, ScrollViewReader, Section, Text, VStack, ZStack, fetch, type ColorSchemeContrast, type DynamicTypeSize, type ScrollViewProxy,
  type VirtualNode,
} from "scripting"
import { createElement, Fragment, useEffect, useRef, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { planifierResume } from "./widgets-stats-fichier"
import {
  creerMoteurWeb, elementWeb, fermerMoteurWeb, lancerEffetsWeb, rendreWeb, versNatif, vueVersNatif, type MoteurWeb, type VueWeb,
} from "./rendu"
import { garderPreferences, preferencesGardees } from "./preferences"
import { CSS_BASE, SCRIPT_PAGE, creerTraducteur, type Traducteur } from "./traduction-web"
import { SCRIPT_MENU, STYLE_MENU, appliquer, comparer, decouper, menusWeb, type Decoupe } from "./morceaux-web"
import {
  PageWeb, ajouterSection, basculer, defiler, fermerMenus, fermerPageWeb, inserer, montrer, quandPagePrete, reglerPageWeb, remplacer,
} from "./page-web"
import { BORNE_VERSION, ReponseTropGrande, lienAdmis, texteBorne } from "./securite"
import {
  ARRONDIS, BandeauAlerte, BarreOnglets, BoutonReglages, BoutonSecondaire, ESPACES, EnTete, LigneEtat, TYPO, couleurs, enCapitales,
  policeCondensee, tailleAccessibilite, type Onglet, type Palette, type PerimetreLigne, type SectionReglage,
  FinDuRendu, calculMesure, debutDeRendu, direSondeRendu, finirMesure, mesurerAppui, oublierAppui, useLigneDeMesure,
} from "./design"
import { Boutique, SansCache, chargerAvecEmpreinte, chargerListe, relireSiChangee, sessionGardee, type ChoixVue, type EmpreinteBoutique, type Shop } from "./vue"
import { FeuilleReglages, useNouvelleVersion, useHistoriqueAvant } from "./reglages"
import { echeanceHistoriqueAvant, historiqueAvantMontre, reessaiDe, vueHistoriqueAvant } from "./historique-avant"
import { EcranConnexion, InviteConnexion } from "./connexion"
import { PremierLancement } from "./premier"
import { connexionRequise } from "./garde-fou"
import { ETAT_FILE, note } from "./valshop"
import { aUneCle, collerCle } from "./cle"
import { etatEcran, lireDonnees, lireStatutRiot, majAutoALOuverture, mettreAJour, type Bilan, type DonneesTableau, type EtatEcran } from "./collecte"
import { ADRESSE_VERSION, CLE_VERSION, DELAI_VERSION, FICHIER_VERSION, annoncerNouvelleVersion, chercherNouvelleVersion } from "./mise-a-jour"
import {
  ANNONCE_LANCEE, ANNONCE_MS, LIGNE_EN_COURS, RAISON_LIMITE, annonceBilan, attenteRestante, bandeaux, ligneDuPerimetre, ligneFixe,
  ligneMajAuto, messageHote, prochaineEcheance, suiteDeLigne, type ResultatMiseAJour,
} from "./historique"
import { ElementAjustable, REPLIS, SEGMENTS_MODE, SEGMENTS_PERIODE } from "./dessin"
import { EMPLACEMENT_VUE_ENSEMBLE } from "./vue-ensemble"
import { EMPLACEMENT_EVOLUTION } from "./evolution"
import { EMPLACEMENT_AGENTS } from "./agents"
import { EMPLACEMENT_CARTES } from "./cartes"
import { EMPLACEMENT_DUELS } from "./duels"
import { EMPLACEMENT_ECONOMIE } from "./economie"
import { EMPLACEMENT_ATTAQUE_DEFENSE } from "./attaque-defense"
import { EMPLACEMENT_ARMES } from "./armes-visee"
import { DetailPartie, EMPLACEMENT_PARTIES, RETOUR_DIT } from "./liste-parties"
import { EMPLACEMENT_RECAP } from "./sous-onglet-recap"
import {
  LIBELLES_MODE, LIBELLES_PERIODE, PERIMETRE_DEFAUT, fenetreDuPerimetre, libellePerimetre, selectionner,
  type Mode, type Periode, type Perimetre, type Selection,
} from "./metriques"
import type { Partie } from "./reduction"
import type { Souhait } from "./souhaits"



















































type CleOnglet = "boutique" | "stats"
const ONGLETS: Onglet<CleOnglet>[] = [
  { cle: "boutique", libelle: "Boutique" },
  { cle: "stats", libelle: "Stats" },
]






let ouvertureReglages: (() => void) | null = null
function ouvrirReglages() {
  if (ouvertureReglages !== null) ouvertureReglages()
}

/**
 * Onglet affiché, ou masqué : invisible, sans appui, caché à VoiceOver, mais toujours
 * monté. Les trois valeurs sont toujours données, seules elles changent d'un onglet à
 * l'autre.
 */
function masque(visible: boolean) {
  return { opacity: visible ? 1 : 0, allowsHitTesting: visible, accessibilityHidden: !visible }
}

/**
 * En-tête ValShop et Barre d'onglets, 12 entre eux. `marges` : celles du haut de page
 * (20 en haut, 16 sur les côtés), sauf en tête de la liste de la Boutique, qui a les siennes.
 */
export function Haut({ onglet, onChoix, onFermer, marges }: {
  onglet: CleOnglet; onChoix: (cle: CleOnglet) => void; onFermer: () => void; marges: boolean
}) {

  const nouvelle = useNouvelleVersion()
  return (
    <VStack
      spacing={ESPACES.entete}
      padding={marges ? { top: ESPACES.hautPage, horizontal: ESPACES.margePage } : undefined}
    >
      <EnTete onFermer={onFermer} />
      {
}
      <HStack spacing={8}>
        <BarreOnglets onglets={ONGLETS} actif={onglet} onChoix={onChoix} />
        <BoutonReglages action={ouvrirReglages} aFaire={nouvelle !== null} />
      </HStack>
    </VStack>
  )
}

/**
 * Ce qui garde l'écran allumé en ce moment : Mettre à jour, l'import de l'historique (entrée 5 de epic-stats-import). Un
 * Mettre à jour touché pendant l'import (« déjà en cours ») ne rend pas l'écran à l'extinction sous l'import.
 */
let gardesEcran = 0

/**
 * Garde l'écran allumé (vrai), ou le laisse de nouveau s'éteindre (faux) quand plus rien ne le garde ; sans effet hors de
 * l'app Scripting, jamais d'erreur.
 */
function ecranAllume(allume: boolean) {
  gardesEcran = Math.max(0, gardesEcran + (allume ? 1 : -1))
  try {
    Device.setWakeLockEnabled(gardesEcran > 0)
  } catch { /* hors de l'app : rien à garder allumé */ }
}

/** « Lecture de tes parties… » : une lecture des données du tableau de bord qui se voit (entrée 16 de epic-stats-tableau-de-bord ; [HYPOTHÈSE]). */
const LECTURE_VISIBLE = "Lecture de tes parties…"

/**
 * Une lecture des données qui se voit, sans données tenues (entrée 16 de epic-stats-tableau-de-bord, décision 1) : sous
 * l'en-tête, l'indicateur d'activité, masqué à VoiceOver, puis « Lecture de tes parties… » en `corps` `texte-doux`, comme la
 * phrase sans partie gardée (SANS_PARTIE_GARDEE) ; VoiceOver lit la phrase.
 */
function LectureVisible({ palette }: { palette: Palette }) {
  return (
    <HStack spacing={ESPACES.puces}>
      <ProgressView progressViewStyle="circular" controlSize="small" tint={palette.texteDoux} accessibilityHidden />
      <Text {...TYPO.corps} foregroundStyle={palette.texteDoux}>
        {LECTURE_VISIBLE}
      </Text>
    </HStack>
  )
}













export type EtatPerimetre = {
  perimetre: Perimetre
  selection: Selection | null
  choisirMode: (mode: Mode) => void
  choisirPeriode: (periode: Periode) => void
  agregat<T>(cle: string, calcul: (sel: Selection) => T): T | null
}

/**
 * Le calcul d'un périmètre, que l'onglet garde (`usePerimetre`) : les parties tenues sur lesquelles il l'a été (la liste
 * même, que chaque lecture renouvelle), le périmètre, l'heure du calcul, sa fenêtre (fenetreDuPerimetre : les parties de la
 * période et de la période précédente à cette heure), la sélection et ses agrégats déjà demandés.
 */
type CalculPerimetre = {
  parties: readonly Partie[]; perimetre: Perimetre; quand: number; fenetre: string; selection: Selection | null; agregats: Map<string, unknown>
}

/**
 * Les calculs déjà faits sur une liste de parties tenues (ticket 4.41 de epic-stats-tableau-de-bord) : un par périmètre déjà
 * réglé (clé `mode|periode`), le dernier calcul de sa fenêtre, avec sa sélection et ses agrégats ; la table repart vide à chaque
 * nouvelle liste.
 */
type TableCalculs = { parties: readonly Partie[] | null; calculs: Map<string, CalculPerimetre> }

/**
 * L'état du périmètre commun (EtatPerimetre) sur les parties tenues par l'onglet (`parties`, null sans données) : la
 * sélection d'un périmètre se calcule une fois par liste de parties tenues et par fenêtre (fenetreDuPerimetre, à l'heure de
 * l'onglet, `maintenant`, que la minuterie et Mettre à jour avancent), puis reste gardée avec ses agrégats d'un rendu à l'autre
 * (minuterie, pages d'une collecte, appuis) ; ticket 4.41 : chaque périmètre déjà réglé garde la sienne, revenir à lui ne
 * recalcule rien (ni sélection, ni agrégat d'aucun sous-onglet) tant que sa fenêtre n'a pas changé ; dès qu'une partie sort de
 * ses 7 ou 30 jours, ou de la période d'avant, son calcul se refait à cette heure ; une nouvelle liste (données relues) vide
 * tout. Une sélection gardée est donc toujours celle que donnerait le calcul à cet instant. Sans rien lire ni demander ; un
 * calcul qui lève (partie gardée malformée) laisse la sélection de ce périmètre nulle jusqu'aux données ou à la fenêtre
 * suivantes, dit en console une fois, sans faire tomber l'onglet. Hook de l'onglet Stats ; exporté pour les sous-onglets
 * (entrée 18) et le harnais, qui lit le calcul courant dans `garde`.
 */
export function usePerimetre(parties: readonly Partie[] | null, maintenant: number): EtatPerimetre {


  const [perimetre, setPerimetre] = useState<Perimetre>(() => preferencesGardees().perimetre ?? PERIMETRE_DEFAUT)
  const garde = useRef<CalculPerimetre | null>(null)
  const table = useRef<TableCalculs>({ parties: null, calculs: new Map() })
  const rendu = useRef<EtatTenu | null>(null)
  if (table.current.parties !== parties) table.current = { parties, calculs: new Map() }
  let calcul: CalculPerimetre | null = null
  if (parties !== null) {
    const cle = `${perimetre.mode}|${perimetre.periode}`
    // La fenêtre à l'heure de l'onglet (minuterie, Mettre à jour) : une partie qui en sort, ou y entre, et le calcul se refait.
    let fenetre = "?"
    try {
      fenetre = fenetreDuPerimetre(parties, perimetre, maintenant)
    } catch { /* partie illisible : la sélection le dira */ }
    const deja = table.current.calculs.get(cle)
    if (deja !== undefined && deja.fenetre === fenetre) calcul = deja
    else {
      let selection: Selection | null = null
      try {
        selection = calculMesure(() => selectionner(parties, perimetre, maintenant)) // mesure 4.41
      } catch (e) {
        console.log(`périmètre : calcul impossible (${e})`)
      }
      calcul = { parties, perimetre, quand: maintenant, fenetre, selection, agregats: new Map() }
      table.current.calculs.set(cle, calcul)
    }
  }
  garde.current = calcul
  const tenu = calcul
  // Ticket 4.49 : le même état tant que ni le périmètre ni son calcul ne changent (minuterie dans la même fenêtre, feuille,
  // Détail, avancée d'une collecte) : le sous-onglet qui le reçoit garde des props identiques, et Scripting ne le rend pas.
  if (rendu.current !== null && rendu.current.perimetre === perimetre && rendu.current.tenu === tenu) return rendu.current.etat
  const etat: EtatPerimetre = {
    perimetre,
    selection: tenu ? tenu.selection : null,
    choisirMode: (mode) => {
      if (mode !== perimetre.mode) mesurerAppui("périmètre") // mesure 4.41
      if (mode !== perimetre.mode) garderPreferences({ perimetre: { mode, periode: perimetre.periode } })
      setPerimetre((p) => (p.mode === mode ? p : { mode, periode: p.periode }))
    },
    choisirPeriode: (periode) => {
      if (periode !== perimetre.periode) mesurerAppui("périmètre") // mesure 4.41
      if (periode !== perimetre.periode) garderPreferences({ perimetre: { mode: perimetre.mode, periode } })
      setPerimetre((p) => (p.periode === periode ? p : { mode: p.mode, periode }))
    },
    agregat<T>(cle: string, f: (sel: Selection) => T): T | null {
      if (tenu === null || tenu.selection === null) return null
      const sel = tenu.selection
      if (!tenu.agregats.has(cle)) tenu.agregats.set(cle, calculMesure(() => f(sel))) // mesure 4.41
      return tenu.agregats.get(cle) as T
    },
  }
  rendu.current = { perimetre, tenu, etat }
  return etat
}

/** Ticket 4.49 : l'état du périmètre rendu au dernier rendu, avec le périmètre et le calcul dont il est fait (usePerimetre). */
type EtatTenu = { perimetre: Perimetre; tenu: CalculPerimetre | null; etat: EtatPerimetre }

/**
 * Ticket 4.49 : une fonction qui reste la même d'un rendu à l'autre et appelle toujours `f` du dernier rendu. Scripting ne rend
 * pas un composant dont les props sont les mêmes (Object.is, clé par clé : dts, `useCallback`, « This component would not render
 * any more after first render ») ; une fonction neuve à chaque rendu les change toutes. Par useRef : le faux hôte du harnais
 * n'a pas `useCallback`.
 */
function useFonctionStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  const boite = useRef<{ f: (...a: A) => R; stable: ((...a: A) => R) | null }>({ f, stable: null })
  const b = boite.current
  b.f = f
  if (b.stable === null) b.stable = (...a: A) => b.f(...a)
  return b.stable
}

/**
 * Ticket 4.51 : la valeur du dernier rendu tant qu'elle dit la même chose (même JSON) : une vue recalculée à chaque rendu (Ton
 * historique d'avant) garde son identité, et le composant qui la reçoit n'est pas rendu de nouveau.
 */
function useValeurStable<T>(v: T): T {
  const tenue = useRef<{ v: T; cle: string }>({ v, cle: JSON.stringify(v) })
  const cle = JSON.stringify(v)
  if (cle !== tenue.current.cle) tenue.current = { v, cle }
  return tenue.current.v
}

/** Ticket 4.49 : la liste du dernier rendu tant qu'elle a les mêmes éléments, dans le même ordre (props identiques, voir plus haut). */
function useListeStable<T>(liste: T[]): T[] {
  const tenue = useRef<T[]>(liste)
  const t = tenue.current
  if (t.length !== liste.length || t.some((x, i) => x !== liste[i])) tenue.current = liste
  return tenue.current
}






function jourDe(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * Les deux sections du Réglage du périmètre (EXPERIENCE.md, Component Patterns) sur cet état : « Mode » (Compétition, Non
 * classé, Tout) puis « Période » (7 jours, 30 jours, Acte, Tout), les listes mêmes des Sélecteurs segmentés (SEGMENTS_MODE,
 * SEGMENTS_PERIODE de dessin.tsx), le choix courant coché ; un choix règle l'état unique ; une clé inconnue ne fait rien.
 */
export function sectionsReglage(etat: EtatPerimetre): SectionReglage[] {
  return [
    {
      titre: "Mode", choix: SEGMENTS_MODE, choisi: etat.perimetre.mode,
      onChoix: (cle) => {
        const s = SEGMENTS_MODE.find((x) => x.cle === cle)
        if (s) etat.choisirMode(s.cle)
      },
    },
    {
      titre: "Période", choix: SEGMENTS_PERIODE, choisi: etat.perimetre.periode,
      onChoix: (cle) => {
        const s = SEGMENTS_PERIODE.find((x) => x.cle === cle)
        if (s) etat.choisirPeriode(s.cle)
      },
    },
  ]
}


export function perimetreDeLigne(etat: EtatPerimetre): PerimetreLigne {
  const p = etat.perimetre
  return { libelle: libellePerimetre(p), parle: `${LIBELLES_MODE[p.mode]}, ${LIBELLES_PERIODE[p.periode]}`, sections: sectionsReglage(etat) }
}

// ─────────────────────────── entrée 18 : Barre de sous-onglets et emplacements ───────────────────────────

/** Les dix sous-onglets de l'onglet Stats (EXPERIENCE.md, Information Architecture), le Récap dixième (epic-stats-recap, entrée 7). */
export type CleSousOnglet = "vue-ensemble" | "evolution" | "agents" | "cartes" | "duels" | "economie" | "attaque-defense" | "armes" | "parties" | "recap"

/**
 * Ce que reçoit l'emplacement d'un sous-onglet (entrée 18 de epic-stats-tableau-de-bord) : `donnees`, les données du tableau
 * de bord tenues par l'onglet (entrée 16) ; `perimetre`, l'état du périmètre commun (entrée 17 : sa sélection, ses agrégats
 * gardés, de quoi le régler) ; `arrivee`, le choix d'arrivée donné à l'ouverture de ce sous-onglet, une clé qu'il reconnaît
 * (Évolution : une stat de STATS_EVOLUTION, entrées 22 et 32), null sinon ; `ouvrir(cle, arrivee?)`, qui ouvre un autre
 * sous-onglet, avec ou sans choix d'arrivée (une tuile de la Vue d'ensemble vers Évolution sur sa stat, entrée 32) ;
 * `ouvrirPartie(matchId)`, qui pousse le Détail de cette partie dans la pile de navigation de l'onglet (Parties, entrée 33) ;
 * `defilerVers(id)`, qui fait défiler le contenu de l'onglet jusqu'à la vue de clé `id` (`key`, `.id()` de SwiftUI), en haut,
 * sans animation ni remontage (le lien des constats de la Vue d'ensemble, entrée 32).
 */
export type PropsEmplacement = {
  donnees: DonneesTableau
  perimetre: EtatPerimetre
  arrivee: string | null
  ouvrir: (cle: CleSousOnglet, arrivee?: string) => void
  ouvrirPartie: (matchId: string) => void
  defilerVers: (id: string) => void
  /** Ticket 4.49 : le jour local de l'onglet (jourDe) ; aucun emplacement ne le lit : il le fait rendre au changement de jour. */
  jour?: string
}

/** Ticket 4.49 : un sous-onglet monté : son composant, le numéro de son montage, la visite qui l'a monté, ses dernières props. */
type SousOngletMonte = { contenu: NonNullable<Emplacement>; montage: number; visite: number; props: PropsEmplacement }

/** Ticket 4.49 : les sous-onglets montés de l'onglet, pour les données `donnees` (d'autres données : aucun). */
type SousOngletsMontes = { donnees: DonneesTableau | null; parCle: Map<CleSousOnglet, SousOngletMonte>; montages: number }

/** Toute la largeur, à gauche : la pile des sous-onglets montés et la case de chacun (ticket 4.49). */
const PLEINE_LARGEUR = { maxWidth: "infinity", alignment: "leading" } as const

/**
 * La case d'un sous-onglet monté mais caché (ticket 4.49) : sans hauteur et rognée (rien ne dépasse ni ne prend de place),
 * invisible, sans appui, absente pour VoiceOver ; comme `masque` des onglets, son contenu reste monté.
 */
const CASE_CACHEE = {
  frame: { maxWidth: "infinity", height: 0, alignment: "leading" }, clipped: true, opacity: 0, allowsHitTesting: false, accessibilityHidden: true,
} as const

/**
 * Ticket 4.49 : les cases des sous-onglets déjà ouverts, dans l'ordre fixe de la barre (`remplis`), chacune une pile à sa clé
 * qui porte l'emplacement monté ; seule celle de `actif` se voit, les autres cachées (CASE_CACHEE). L'ouvert reçoit `props`, les
 * cachés gardent leurs dernières props, identiques : Scripting ne les rend pas (un périmètre neuf, une minuterie ne touchent que
 * l'ouvert) ; revenu à l'écran, un sous-onglet se montre tel qu'on l'a laissé, rendu de nouveau si ses props ont changé. Un
 * sous-onglet est monté à sa première ouverture, et remonté à une ouverture `neuf` (depuis un emplacement, avec ou sans
 * choix d'arrivée, `props.arrivee`, qu'il ne lit qu'à son montage ; visite `visite`) ; il garde sinon l'arrivée de son montage. De nouvelles données démontent tous les
 * cachés (ils tiendraient les anciennes) ; l'ouvert reste monté, comme avant. Écrit dans `m`, que l'onglet garde (useRef). L'emplacement, seul dans sa case, y est
 * posé dans une liste à sa clé de montage : un nouveau montage le remonte (le faux hôte n'identifie par la clé que dans une liste).
 */
function sousOngletsMontes(
  m: SousOngletsMontes, remplis: SousOnglet[], actif: CleSousOnglet, props: PropsEmplacement, visite: number, neuf: boolean,
): VirtualNode[] {
  if (m.donnees !== props.donnees) {
    m.donnees = props.donnees
    for (const cle of [...m.parCle.keys()]) if (cle !== actif) m.parCle.delete(cle)
  }
  const contenu = remplis.find((s) => s.cle === actif)?.contenu ?? null
  if (contenu !== null) {
    const deja = m.parCle.get(actif)
    const remonter = deja === undefined || deja.contenu !== contenu || (neuf && deja.visite !== visite)
    const montage = remonter || deja === undefined ? ++m.montages : deja.montage
    const arrivee = remonter || deja === undefined ? props.arrivee : deja.props.arrivee
    m.parCle.set(actif, { contenu, montage, visite: remonter || deja === undefined ? visite : deja.visite, props: { ...props, arrivee } })
  }
  const cases: VirtualNode[] = []
  for (const s of remplis) {
    const e = m.parCle.get(s.cle)
    if (e === undefined) continue
    const Emplacement = e.contenu
    cases.push(
      <VStack key={s.cle} alignment="leading" spacing={0} {...(s.cle === actif ? { frame: PLEINE_LARGEUR } : CASE_CACHEE)}>
        {[<Emplacement key={`${s.cle}:${e.montage}`} {...e.props} />]}
      </VStack>,
    )
  }
  return cases
}

/**
 * L'emplacement d'un sous-onglet : le composant de son module (jamais design.tsx), qui ne dessine que ce qu'il reçoit, sans
 * requête ni lecture ; null tant qu'il est vide, le sous-onglet restant alors hors de la barre.
 */
export type Emplacement = ((props: PropsEmplacement) => VirtualNode | null) | null

/** Un sous-onglet : sa clé, son libellé (casse normale ; capitales par `textCase`), son emplacement. */
export type SousOnglet = { cle: CleSousOnglet; libelle: string; contenu: Emplacement }

/**
 * Les sous-onglets dans leur ordre fixe (EXPERIENCE.md, Information Architecture ; maquette), chacun avec l'emplacement de
 * son module : chaque entrée de sous-onglet (19 à 31) remplit le sien dans son module, sans toucher à cette liste ;
 * epic-stats-recap y ajoute le Récap. Lue à chaque rendu.
 */
export const SOUS_ONGLETS: SousOnglet[] = [
  { cle: "vue-ensemble", libelle: "Vue d'ensemble", contenu: EMPLACEMENT_VUE_ENSEMBLE },
  { cle: "evolution", libelle: "Évolution", contenu: EMPLACEMENT_EVOLUTION },
  { cle: "agents", libelle: "Agents", contenu: EMPLACEMENT_AGENTS },
  { cle: "cartes", libelle: "Cartes", contenu: EMPLACEMENT_CARTES },
  { cle: "duels", libelle: "Duels", contenu: EMPLACEMENT_DUELS },
  { cle: "economie", libelle: "Économie", contenu: EMPLACEMENT_ECONOMIE },
  { cle: "attaque-defense", libelle: "Attaque · défense", contenu: EMPLACEMENT_ATTAQUE_DEFENSE },
  { cle: "armes", libelle: "Armes et visée", contenu: EMPLACEMENT_ARMES },
  { cle: "parties", libelle: "Parties", contenu: EMPLACEMENT_PARTIES },
  { cle: "recap", libelle: "Récap", contenu: EMPLACEMENT_RECAP },
]

/** Le sous-onglet ouvert à chaque ouverture de l'app (EXPERIENCE.md, Component Patterns). */
const SOUS_ONGLET_DEFAUT: CleSousOnglet = "vue-ensemble"

/** Sans partie gardée, ce que dit chaque sous-onglet sous Mettre à jour (EXPERIENCE.md, State Patterns, Aucune partie gardée). */
export const SANS_PARTIE_GARDEE = "Aucune partie gardée. Touche Mettre à jour pour récupérer tes parties."


export const NOM_SOUS_ONGLET = "Sous-onglet"

/** Marge horizontale d'un libellé de la barre (DESIGN.md, barre-sous-onglets : `padding-x`). */
const MARGE_SOUS_ONGLET = 12

/** L'identifiant du début du contenu qui défile, où revient le défilement à chaque ouverture d'un sous-onglet. */
const DEBUT_DU_CONTENU = "debut"


export function valeurSousOnglet(libelles: readonly string[], i: number): string {
  return i < 0 || i >= libelles.length ? "aucun choix" : `${libelles[i]}, ${i + 1} sur ${libelles.length}`
}
















/**
 * Une case de la Barre de sous-onglets (entrée 18) : comme Mettre à jour (vu sur l'iPhone), toute la case répond à l'appui ;
 * marge, cadre et fond sur la pile du libellé ; l'appui sur la choisie ne fait rien. Ticket 4.49 : en composant, aux props
 * stables (`onChoix` de l'onglet, la palette) : au changement de sous-onglet, Scripting ne rend que les deux cases dont `choisi`
 * change, pas les dix ; même arbre qu'avant.
 */
function PuceSousOnglet({ cle, libelle, choisi, valeur, c, onChoix }: {
  cle: CleSousOnglet; libelle: string; choisi: boolean; valeur: string | undefined; c: Palette; onChoix: (cle: CleSousOnglet) => void
}) {
  return (
    <Button
      key={cle}
      buttonStyle="plain"
      action={() => {
        if (!choisi) onChoix(cle)
      }}
      accessibilityLabel={libelle}
      accessibilityValue={valeur}
      accessibilityAddTraits={choisi ? "isSelected" : undefined}
    >
      <HStack contentShape="rect">
        <HStack
          padding={{ horizontal: MARGE_SOUS_ONGLET }}
          frame={{ minWidth: ESPACES.cible, minHeight: ESPACES.cible }}
          background={choisi
            ? <RoundedRectangle cornerRadius={ARRONDIS.full} fill={c.texte} />
            : <RoundedRectangle cornerRadius={ARRONDIS.full} fill={c.surface} />}
        >
          <Text
            {...policeCondensee(choisi ? TYPO.sousOnglet : TYPO.sousOngletInactif, enCapitales(libelle))}
            foregroundStyle={choisi ? c.fond : c.texteDoux}
          >
            {libelle}
          </Text>
        </HStack>
      </HStack>
    </Button>
  )
}

function BarreSousOnglets({ sousOnglets, actif, onChoix }: {
  sousOnglets: readonly SousOnglet[]; actif: CleSousOnglet; onChoix: (cle: CleSousOnglet) => void
}) {
  // Le proxy du lecteur de défilement, rendu à chaque rendu de la rangée.
  const lecteur = useRef<ScrollViewProxy | null>(null)
  useEffect(() => {
    if (lecteur.current) lecteur.current.scrollTo(actif, "center")
  }, [actif])
  const n = sousOnglets.length
  const i = sousOnglets.findIndex((s) => s.cle === actif)
  const suivant = () => {
    if (i >= 0 && i + 1 < n) onChoix(sousOnglets[i + 1].cle)
  }
  const precedent = () => {
    if (i > 0) onChoix(sousOnglets[i - 1].cle)
  }
  const valeur = valeurSousOnglet(sousOnglets.map((s) => s.libelle), i)
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const enBoutons = REPLIS.pucesEnBoutons
        const rangee = (
          <ScrollViewReader>
            {(proxy) => {
              lecteur.current = proxy
              // Hauteur idéale tenue : la rangée ne prend jamais la place du contenu qui défile dessous.
              return (
                <ScrollView
                  axes="horizontal"
                  scrollIndicator="hidden"
                  fixedSize={{ horizontal: false, vertical: true }}
                  accessibilityHidden={enBoutons ? undefined : true}
                >
                  <HStack spacing={ESPACES.puces} onAppear={() => proxy.scrollTo(actif, "center")}>
                    {sousOnglets.map((s, k) => (
                      <PuceSousOnglet
                        key={s.cle}
                        cle={s.cle}
                        libelle={s.libelle}
                        choisi={s.cle === actif}
                        valeur={enBoutons ? `${k + 1} sur ${n}` : undefined}
                        c={c}
                        onChoix={onChoix}
                      />
                    ))}
                  </HStack>
                </ScrollView>
              )
            }}
          </ScrollViewReader>
        )
        // Fond et plafond sur la pile extérieure, marges sur celle du milieu, l'élément ajustable derrière la seule rangée :
        // le rendu ne dépend pas de l'ordre des modificateurs.
        return (
          <VStack frame={{ maxWidth: "infinity", alignment: "leading" }} background={c.fond} dynamicTypeSize={{ to: "accessibility1" }}>
            <VStack
              alignment="leading"
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              padding={{ top: ESPACES.entete, horizontal: ESPACES.margePage }}
            >
              {enBoutons ? rangee : (
                <VStack
                  alignment="leading"
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                  background={<ElementAjustable nom={NOM_SOUS_ONGLET} valeur={valeur} onSuivant={suivant} onPrecedent={precedent} />}
                >
                  {rangee}
                </VStack>
              )}
            </VStack>
          </VStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Le sous-onglet ouvert : sa clé, son choix d'arrivée, et le rang de son ouverture (son emplacement est remonté à chacune). */
type Ouvert = { cle: CleSousOnglet; arrivee: string | null; visite: number }

/**
 * Entrée 33 : le Détail d'une partie dans la pile de navigation de l'onglet : la partie montrée (matchId ; null avant le premier
 * appui) et s'il est poussé ; au retour, la partie reste, le temps de l'animation. Entrée 34 : `ouverture`, compté à chaque
 * appui, que le Détail reçoit : chaque ouverture, même de la partie déjà vue, repart de la manche 1.
 */
type DetailOuvert = { matchId: string | null; pousse: boolean; ouverture: number }












export const LARGEUR_RANGEE: Readonly<Partial<Record<DynamicTypeSize, number>>> = {
  xSmall: 336, small: 340, medium: 345, large: 359, xLarge: 388, xxLarge: 415, xxxLarge: 447,
}

/** Vrai si la rangée de l'en-tête tient la Ligne d'état à gauche des boutons (LARGEUR_RANGEE), à cette taille et sur cet écran. */
export function rangeeTient(taille: DynamicTypeSize | undefined, largeurEcran: number): boolean {
  const minimum = taille === undefined ? undefined : LARGEUR_RANGEE[taille]
  return minimum !== undefined && largeurEcran - 2 * ESPACES.margePage >= minimum
}

/**
 * La dernière mise à jour de cette session : son issue et ses parties ajoutées, d'où le « +N
 * parties », le « rien de nouveau » et les Lignes fixes de la Ligne d'état, jamais gardés ; son
 * bilan (VoiceOver), et l'heure où il quitte le Bouton Mettre à jour ; `reessai`, d'une mise à
 * jour arrêtée ou en cours par ↻ (entrée 18) : l'heure où sa Ligne fixe s'efface, null sinon.
 */
type Session = { resultat: ResultatMiseAJour; ajoutees: number; annonce: string; finAnnonce: number; reessai: number | null }


















































































export function Stats({ haut, palette, taille, auto, quandPrete }: {
  haut: VirtualNode | null; palette: Palette; taille: DynamicTypeSize | undefined
  auto?: OuvertureAuto; quandPrete?: (f: () => void) => () => void
}) {
  // mesure 4.41 : l'ouverture de l'onglet, mesurée de son premier rendu ; le début de chaque rendu d'un appui mesuré.
  const ouvertureMesuree = useRef(false)
  if (!ouvertureMesuree.current) {
    ouvertureMesuree.current = true
    mesurerAppui("ouverture")
  }
  const tour = debutDeRendu(true) // mesure 4.49 : le numéro de ce rendu, pour FinDuRendu
  const [feuille, setFeuille] = useState(false)
  // La feuille ouverte sur un « Coller ma clé » refusé par le trousseau : elle le dit d'emblée.
  const [refusee, setRefusee] = useState(false)
  const [cle, setCle] = useState<boolean>(() => aUneCle())


  if (cle) direSondeRendu()
  // Premier lancement : la clé absente à l'ouverture (cette même lecture), puis à une fermeture de la feuille.
  const [premier, setPremier] = useState<boolean>(() => !cle)
  const [ecran, setEcran] = useState<EtatEcran>(() => etatEcran())
  const [maintenant, setMaintenant] = useState<number>(() => Date.now())
  const [enCours, setEnCours] = useState(false)
  const [avancee, setAvancee] = useState<string>(LIGNE_EN_COURS)
  const [session, setSession] = useState<Session | null>(null)
  // Garde de la mise à jour locale : lu et posé avant tout `await`, il ne dépend pas d'un rendu.
  const occupe = useRef(false)
  // Entrée 16 de epic-stats-tableau-de-bord : les données du tableau de bord du compte connecté (lireDonnees), que les
  // sous-onglets recevront ; null : rien de tenu. `lectureVue` : la lecture en cours se voit ; `derniereLecture` : le numéro
  // de la dernière lecture lancée, la seule qui compte ; `demonte` : l'onglet démonté (app fermée), plus rien n'est lu ni tenu.
  const [donnees, setDonnees] = useState<DonneesTableau | null>(null)
  const [lectureVue, setLectureVue] = useState(false)
  const derniereLecture = useRef(0)
  const demonte = useRef(false)
  // Entrée 5 de epic-stats-import : l'import de l'historique tracker.gg, qui survit à la feuille.
  const historique = useHistoriqueAvant()
  const finBilanImport = historique.suivi.bilan ? historique.suivi.bilan.fin : null
  const reessaiImport = reessaiDe(historique.suivi)
  // Entrée 17 de epic-stats-tableau-de-bord : le périmètre commun, sa sélection gardée jusqu'au changement de périmètre ou de données.
  const etatPerimetre = usePerimetre(donnees ? donnees.parties : null, maintenant)
  // Entrée 18 : le sous-onglet ouvert, Vue d'ensemble à chaque ouverture de l'app ; le proxy du défilement vertical, rendu à
  // chaque rendu, qui ramène le contenu à son début à chaque ouverture d'un sous-onglet (jamais au montage).
  const [ouvert, setOuvert] = useState<Ouvert>({ cle: SOUS_ONGLET_DEFAUT, arrivee: null, visite: 0 })
  // Ticket 4.49 : la visite qui remonte son sous-onglet (une ouverture depuis un emplacement, ouvrirDepuisContenu), -1 sinon.
  const visiteNeuve = useRef(-1)
  const defilement = useRef<ScrollViewProxy | null>(null)
  // Entrée 33 : le Détail d'une partie, poussé par Parties ; jamais gardé sur le disque.
  const [partieOuverte, setPartieOuverte] = useState<DetailOuvert>({ matchId: null, pousse: false, ouverture: 0 })
  // Mesure 4.49 : le Détail poussé au dernier rendu, pour ne mesurer son retour qu'une fois.
  const detailPousse = useRef(false)
  detailPousse.current = partieOuverte.pousse
  useEffect(() => {
    if (ouvert.visite > 0 && defilement.current) defilement.current.scrollTo(DEBUT_DU_CONTENU, "top")
  }, [ouvert.visite])

  // Minuterie : posée à chaque heure affichée, jamais dans son rappel, retirée au démontage ;
  // son rappel ne fait que donner l'heure. Elle dépend des métadonnées, jamais du nombre de
  // parties : l'avancée d'une page, qui garde la même `meta`, ne la réarme pas, et l'heure suit
  // pendant une collecte (âge de la feuille « Réglages des stats »). De l'import, seules la fin
  // de son bilan et l'heure de réessai d'un appui arrêté comptent : son avancée ne la réarme pas.
  useEffect(() => {
    const onglet = prochaineEcheance(ecran.meta, maintenant, session ? session.finAnnonce : null, session ? session.reessai : null)
    const importation = echeanceHistoriqueAvant(finBilanImport, reessaiImport, maintenant)
    const delai = onglet === null ? importation : importation === null ? onglet : Math.min(onglet, importation)
    if (delai === null) return
    const minuterie = setTimeout(() => setMaintenant(Date.now()), delai)
    return () => clearTimeout(minuterie)
  }, [maintenant, ecran.meta, session, finBilanImport, reessaiImport])

  /**
   * Lit les données du tableau de bord du compte de cet état d'écran (lireDonnees) ; sans partie, rien de tenu, rien de lu.
   * Celles d'avant restent jusqu'à la fin de la lecture, et si elle échoue ; seule la dernière lecture lancée compte : une
   * plus ancienne, ou qui finit l'onglet démonté (app fermée), est écartée. L'onglet démonté (une mise à jour qui finit
   * après la fermeture de l'app), rien n'est lu.
   */
  const relire = async (e: EtatEcran) => {
    if (demonte.current) return
    const numero = ++derniereLecture.current
    const derniere = () => numero === derniereLecture.current && !demonte.current
    if (e.meta === null || e.parties === 0) {
      setDonnees(null)
      setLectureVue(false)
      return
    }
    let lues: DonneesTableau | null = null
    try {
      lues = await lireDonnees(e.meta.puuid, () => {
        if (derniere()) setLectureVue(true)
      })
    } catch { /* jamais : la lecture est tolérante ; les données d'avant restent */ }
    if (!derniere()) return
    if (lues) {
      setDonnees(lues)
      // Lot 2 des widgets : le résumé des stats (widget-stats.json), un peu plus tard, l'écran d'abord.
      planifierResume(e.meta, lues)
    }
    setLectureVue(false)
  }

  // Lecture au montage de l'onglet s'il y a des parties, Premier lancement compris ; jamais au changement d'onglet, par la
  // minuterie ni par un sous-onglet. Démonté (app fermée), la lecture en cours est écartée, et aucune autre ne part.
  useEffect(() => {
    if (ecran.parties > 0) relire(ecran)
    return () => {
      demonte.current = true
      finirMesure() // mesure 4.46 : la ligne de dessin du dernier appui
    }
  }, [])

  /** La feuille ouverte, d'où qu'on l'ouvre : l'état de l'import lu s'il est à relire (entrée 5 de epic-stats-import). */
  const ouvrir = () => {
    setFeuille(true)
    historique.surOuverture()
  }
  // L'engrenage de la Barre d'onglets ouvre cette feuille (ouvrirReglages).
  const ouvrirStable = useFonctionStable(ouvrir)
  useEffect(() => {
    ouvertureReglages = ouvrirStable
    return () => { if (ouvertureReglages === ouvrirStable) ouvertureReglages = null }
  }, [])
  const fermer = useFonctionStable(() => {
    setFeuille(false)
    setRefusee(false)
    const rangee = aUneCle()
    setCle(rangee)
    if (!rangee) setPremier(true)
  })
  /** Étape 2 du Premier lancement : la clé du presse-papiers rangée et relue ; sinon, la feuille, qui dit un refus du trousseau. */
  const collerMaCle = async () => {
    const collage = await collerCle()
    setCle(aUneCle())
    if (collage.issue === "rangee") return
    setRefusee(collage.issue === "refusee")
    ouvrir()
  }
  /**
   * « Importer mon historique » (entrée 5 de epic-stats-import) : l'import, un seul à la fois (useHistoriqueAvant), l'écran
   * gardé allumé jusqu'à l'issue ; puis l'état d'écran relu, et les données du tableau de bord si des parties ont été
   * ajoutées ou si leur nombre a changé, comme après Mettre à jour ; la Ligne fixe « Mise à jour déjà en cours » d'un Mettre
   * à jour touché pendant l'import, qui ne disait que lui, retirée ; après une écriture refusée, l'état de l'import relu,
   * l'onglet déjà mis à jour, sans l'attendre ; un appui écarté (déjà en cours) ne relit rien.
   */
  const importerEtRelire = async () => {
    oublierAppui() // mesure 4.46 : l'import n'est pas un appui mesuré
    const avant = ecran.parties
    const bilan = await historique.importer(ecranAllume)
    if (bilan === null) return
    const apres = etatEcran()
    setEcran(apres)
    setMaintenant(Date.now())
    setSession((s) => (s !== null && s.resultat === "deja" ? null : s))
    if (bilan.issue === "stockage") historique.relireEtat()
    const ajoutees = bilan.issue === "fait" || bilan.issue === "stockage" ? bilan.ajoutees : 0
    if (ajoutees > 0 || apres.parties !== avant) await relire(apres)
  }
  // Ticket 2.20 : l'import tient le marqueur de collecte : l'ouverture le suit (`suivre`), la lecture automatique de la
  // boutique attend sa fin.
  const importer = useFonctionStable(() => {
    const fin = importerEtRelire()
    suivre(auto, fin)
    return fin
  })
  /**
   * La collecte de l'onglet, par le Bouton Mettre à jour (`lancer`), l'étape 3 du Premier lancement, ou toute seule à
   * l'ouverture (ticket 2.20, `automatique`) : le même chemin dans les trois cas. Seules différences : partie toute seule, elle
   * n'oublie pas l'appui mesuré en cours (l'ouverture de l'onglet garde sa ligne de mesure) ; et, dans les trois cas, elle
   * attend d'abord la fin de la lecture automatique de la boutique, si elle court.
   */
  const collecte = async (automatique: boolean) => {
    if (occupe.current) return
    occupe.current = true
    // Mesure 4.46 : la collecte n'est pas un appui mesuré. Partie toute seule (ticket 2.20), elle laisse l'ouverture de l'onglet
    // finir sa mesure, sauf sans partie gardée : rien ne se dessinera avant la relecture d'après collecte, et la ligne de
    // l'ouverture dirait la collecte.
    if (!automatique || ecran.parties === 0) oublierAppui()
    // Les parties gardées avant cette mise à jour (entrée 16 de epic-stats-tableau-de-bord) : comparées à celles d'après.
    const avant = ecran.parties
    setEnCours(true)
    setAvancee(LIGNE_EN_COURS)
    setSession(null)
    ecranAllume(true)
    let bilan: Bilan | null = null
    try {
      // Ticket 2.20 : la lecture automatique de la boutique de cette ouverture court encore (Mettre à jour touché pendant
      // elle) : la collecte attend sa fin, « Mise à jour… » déjà à l'écran, pour que cette lecture contrôle les prix de HenrikDev
      // (rangerPrix de valshop.ts ne les lit pas sous le marqueur d'une collecte, et la boutique ne se relit plus de la journée).
      if (auto !== undefined && auto.lecture !== null) await auto.lecture
      // L'app fermée pendant cette attente : la collecte ne part plus (son marqueur resterait pris, sans rien pour le rendre).
      if (!demonte.current) bilan = await mettreAJour((ligneLue, gardees) => {
        setAvancee(ligneLue)
        setEcran((e) => ({ meta: e.meta, parties: gardees }))
      })
    } catch {
      // Erreur inattendue : aucun bilan, l'écran relit l'état gardé.
    } finally {
      ecranAllume(false)
    }
    const fin = Date.now()
    occupe.current = false
    const apres = bilan?.ecran ?? etatEcran()
    setEcran(apres)
    setMaintenant(fin)
    // Le détail de l'échec dit, pour un échec de stockage, une lecture ou une écriture.
    const detailEchec = bilan?.ecran?.meta?.dernierEchec?.detail ?? ""
    const reessai = bilan?.reessai ?? null
    setSession(bilan ? {
      resultat: bilan.resultat, ajoutees: bilan.ajoutees, annonce: annonceBilan(bilan.resultat, bilan.ajoutees, detailEchec, fin, reessai),
      finAnnonce: fin + ANNONCE_MS, reessai,
    } : null)
    setEnCours(false)
    // Entrée 16 de epic-stats-tableau-de-bord : relue si des parties ont été ajoutées, ou si leur nombre a changé (↻
    // entre-temps, mise de côté, sans bilan) ; plus aucune partie : rien de tenu.
    if ((bilan?.ajoutees ?? 0) > 0 || apres.parties !== avant) await relire(apres)
  }
  /**
   * La collecte, suivie par l'ouverture (ticket 2.20, `suivre`) : sa fin, jamais rejetée, que la lecture automatique de la
   * boutique attend avant de partir. Une collecte déjà en cours ici : rien.
   */
  const collecter = (automatique: boolean): Promise<void> => {
    if (occupe.current) return Promise.resolve()
    const fin = collecte(automatique).then(() => {}, () => {})
    suivre(auto, fin)
    return fin
  }
  /** Le Bouton Mettre à jour : la collecte, sur un appui. */
  const lancer = () => collecter(false)
  /** Étape 3 du Premier lancement : l'accueil des stats, et la collecte, par le chemin de Mettre à jour. */
  const recuperer = () => {
    setPremier(false)
    return lancer()
  }
  /**
   * Entrée 18 : ouvre le sous-onglet `cle`, avec le choix d'arrivée `arrivee` s'il est donné (Barre de sous-onglets, son
   * élément ajustable, un emplacement : une tuile vers Évolution sur sa stat, entrée 32) ; son emplacement est remonté, le
   * contenu revient à son début. Un emplacement vide (hors de la barre), ou le sous-onglet déjà ouvert sans arrivée : rien.
   * Ni lecture ni requête. Ticket 4.49 : un sous-onglet déjà ouvert est gardé monté et revient tel qu'on l'a laissé
   * (sousOngletsMontes) ; `neuf` (un emplacement qui en ouvre un autre, `ouvrirDepuisContenu`) le remonte, comme avant.
   */
  const ouvrirSousOnglet = useFonctionStable((cle: CleSousOnglet, arrivee?: string, neuf?: boolean) => {
    if (!SOUS_ONGLETS.some((s) => s.cle === cle && s.contenu !== null)) return
    if (cle !== ouvert.cle || arrivee !== undefined) mesurerAppui("sous-onglet") // mesure 4.41
    if ((cle !== ouvert.cle || arrivee !== undefined) && (neuf === true || arrivee !== undefined)) visiteNeuve.current = ouvert.visite + 1
    setOuvert((o) => (o.cle === cle && arrivee === undefined ? o : { cle, arrivee: arrivee ?? null, visite: o.visite + 1 }))
  })
  /**
   * Ticket 4.49 : l'ouverture que reçoivent les emplacements (une tuile, un bloc ou un axe de la Vue d'ensemble, « Préparer le
   * récap ») : le sous-onglet visé est remonté, sur son choix d'arrivée ou son début (« Ton niveau réel » → Évolution sur le
   * Score de combat), même s'il était gardé monté ailleurs.
   */
  const ouvrirDepuisContenu = useFonctionStable((cle: CleSousOnglet, arrivee?: string) => ouvrirSousOnglet(cle, arrivee, true))
  /**
   * Entrée 32 : fait défiler le contenu jusqu'à la vue de clé `id` (le lien des constats de la Vue d'ensemble), en haut, par le
   * lecteur du défilement vertical ; sans `withAnimation` (un saut, avec ou sans « Réduire les animations ») ; le sous-onglet
   * reste ouvert, rien n'est remonté, lu ni demandé.
   */
  const defilerVers = useFonctionStable((id: string) => {
    if (defilement.current) defilement.current.scrollTo(id, "top")
  })
  /**
   * Entrée 33 : pousse le Détail de la partie `matchId` (une Ligne de partie, la Frise de Parties) ; `changerDetail(false)` le
   * dépile (Lien retour ; geste de retour d'iOS, par `onChanged`), la partie gardée le temps de l'animation. La racine reste
   * montée dessous : sous-onglet, périmètre, lots montrés et défilement retrouvés tels quels. Ni lecture ni requête.
   */
  const ouvrirPartie = useFonctionStable((matchId: string) => {
    mesurerAppui("partie", "detail") // mesure 4.49 : close par la fin du Détail
    setPartieOuverte((d) => ({ matchId, pousse: true, ouverture: d.ouverture + 1 }))
  })
  const changerDetail = (pousse: boolean) => {
    // Mesure 4.49 : le Détail dépilé, une fois (le Lien retour, puis le `onChanged` de la pile).
    if (!pousse && detailPousse.current) {
      detailPousse.current = false
      mesurerAppui("retour")
    }
    setPartieOuverte((d) => (d.pousse === pousse ? d : { ...d, pousse }))
  }

  const { meta, parties } = ecran
  // Délai d'une limite en cours : Mettre à jour inactif, la raison dessous.
  const limite = !enCours && attenteRestante(meta, maintenant) !== null
  const fixe = session ? ligneFixe(session.resultat, maintenant, session.reessai) : null
  // Entrée 17 : devant l'âge, le nombre de parties du périmètre, dès que les données sont tenues ; jamais le total.
  const compte = parties > 0 && etatPerimetre.selection ? etatPerimetre.selection.parties.length : null
  const ligne = ligneDuPerimetre(meta, maintenant, compte, session ? suiteDeLigne(session.resultat, session.ajoutees) : null)
  const detail = enCours ? avancee : fixe ?? ligne.avant + ligne.age + ligne.apres
  const ancienne = !enCours && fixe === null && ligne.ancienne
  // Le bilan d'une mise à jour arrêtée ou en cours par ↻ suit sa Ligne fixe (entrée 18) : retiré avec elle à l'heure dite.
  const bilanDit = session === null ? undefined : session.reessai !== null ? fixe ?? undefined : session.annonce
  const valeur = enCours ? ANNONCE_LANCEE
    : session && maintenant < session.finAnnonce ? bilanDit : undefined
  // Pendant une mise à jour, l'échec d'avant se tait ; le trou reste, jusqu'à la réussite suivante.
  const alertes = bandeaux(meta, maintenant).filter((b) => !enCours || b.genre === "trou")
  // Tailles d'accessibilité : `haut` (En-tête et Barre d'onglets, qui défilent) n'est donné qu'à elles.
  const grand = haut !== null
  // Entrée 39 : la Ligne au-dessus des boutons quand la rangée ne la tient pas à gauche (toujours aux tailles d'accessibilité).
  const ligneAuDessus = grand || !rangeeTient(taille, Device.screen.width)
  // Entrée 18 : les sous-onglets dont l'emplacement est rempli, dans l'ordre fixe ; l'ouvert, ou le premier s'il ne l'est pas.
  const remplis = useListeStable(SOUS_ONGLETS.filter((s) => s.contenu !== null))
  // Ticket 4.49 : les sous-onglets déjà ouverts, gardés montés (sousOngletsMontes).
  const montes = useRef<SousOngletsMontes>({ donnees: null, parCle: new Map(), montages: 0 })
  const actif = remplis.find((s) => s.cle === ouvert.cle) ?? remplis[0] ?? null
  const Contenu = actif ? actif.contenu : null
  // Ticket 4.49 : des props identiques d'un rendu à l'autre (liste gardée, appui stable) : Scripting ne rend la barre qu'au
  // changement de sous-onglet.
  const choisirSousOnglet = useFonctionStable((cle: CleSousOnglet) => ouvrirSousOnglet(cle))
  const barre = !premier && actif ? (
    <BarreSousOnglets sousOnglets={remplis} actif={actif.cle} onChoix={choisirSousOnglet} />
  ) : null
  useLigneDeMesure(actif ? actif.cle : "", libellePerimetre(etatPerimetre.perimetre)) // mesure 4.41

  // Pendant une collecte, l'avancée change la Ligne à chaque page : jamais relue par VoiceOver. Entrée 17 : dès qu'une partie
  // est gardée, le périmètre en tête, qui ouvre son Réglage.
  const ligneEtat = (
    <LigneEtat
      detail={detail}
      ancienne={ancienne ? ligne : undefined}
      suivie={!enCours}
      perimetre={parties > 0 ? perimetreDeLigne(etatPerimetre) : undefined}
      uneLigne={!grand}
    />
  )
  const page = (
    <VStack
      alignment="leading"
      spacing={ESPACES.entreBlocs}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      padding={{ top: ESPACES.entete, horizontal: ESPACES.margePage, bottom: ESPACES.basPage }}
    >
      {premier ? (
        <PremierLancement compte={meta !== null} cle={cle} onColler={collerMaCle} onRecuperer={recuperer} palette={palette} />
      ) : (
        <VStack alignment="leading" spacing={ESPACES.entete}>
          {ligneAuDessus ? ligneEtat : null}
          {/* La raison sous le bouton : rangée alignée en haut, l'engrenage à hauteur du bouton. */}
          <HStack spacing={ESPACES.puces} alignment={limite ? "top" : undefined}>
            {ligneAuDessus ? null : ligneEtat}
            <BoutonSecondaire
              libelle="Mettre à jour"
              icone="arrow.clockwise"
              enCours={enCours}
              inactif={limite}
              raison={limite ? RAISON_LIMITE : undefined}
              valeurAccessibilite={valeur}
              valeurSuivie
              uneLigne={!grand}
              action={lancer}
            />
          </HStack>
          {alertes.map((b) => (
            <BandeauAlerte key={b.genre} texte={b.texte} action={b.genre === "cle" ? ouvrir : undefined} />
          ))}
        </VStack>
      )}
      {!premier && lectureVue && donnees === null ? <LectureVisible palette={palette} /> : null}
      {!premier && parties === 0 ? (
        <Text {...TYPO.corps} foregroundStyle={palette.texteDoux}>
          {SANS_PARTIE_GARDEE}
        </Text>
      ) : null}
      {/* Entrée 18 : l'emplacement du sous-onglet ouvert (la Vue d'ensemble : les chiffres clés, entrée 38), dès que des
          données sont tenues. Ticket 4.49 : avec ceux déjà ouverts, gardés montés et cachés (sousOngletsMontes). */}
      {!premier && donnees !== null && actif && Contenu ? (
        <VStack key="sous-onglets" alignment="leading" spacing={0} frame={PLEINE_LARGEUR}>
          {sousOngletsMontes(montes.current, remplis, actif.cle, {
            donnees,
            perimetre: etatPerimetre,
            arrivee: actif.cle === ouvert.cle ? ouvert.arrivee : null,
            ouvrir: ouvrirDepuisContenu,
            ouvrirPartie,
            defilerVers,
            jour: jourDe(Date.now()),
          }, ouvert.visite, actif.cle === ouvert.cle && visiteNeuve.current === ouvert.visite)}
        </VStack>
      ) : null}
      {/* mesure 4.41 : la fin du rendu d'un appui mesuré, après l'emplacement ; ne rend rien. 4.49 : `tour` change à chaque
          rendu, pour que Scripting la rappelle. */}
      {!premier && donnees !== null && actif && Contenu ? <FinDuRendu tour={tour} /> : null}
    </VStack>
  )
  // Ticket 4.51 : la vue de Ton historique d'avant, la même d'un rendu à l'autre tant qu'elle dit la même chose : la feuille
  // n'est rendue de nouveau que quand ce qu'elle montre change (props de Scripting ; fermer et importer stables). Entrée 10 de
  // epic-installation-ami : null tant qu'aucun fichier d'import n'est connu (historiqueAvantMontre) : la feuille n'a alors pas
  // cette section.
  const vueHistorique = useValeurStable(historiqueAvantMontre(historique.suivi, maintenant) ? vueHistoriqueAvant(historique.suivi, maintenant, enCours) : null)
  /**
   * Ticket 2.20 : la mise à jour automatique de cette ouverture, décidée une fois (`auto.stats`), sur l'état du dernier rendu
   * et les métadonnées relues sur place (majAutoALOuverture) :
   * lancée par le chemin du bouton (`collecter`, que l'ouverture suit), ou écartée (la
   * raison à la console, rien à l'écran ni au journal). L'onglet démonté : rien, et la tentative reste à l'onglet qui le
   * remplace (repli de la page web vers Stats natif).
   */
  const deciderAuto = useFonctionStable(() => {
    if (auto === undefined || auto.stats || demonte.current) return
    auto.stats = true
    const decision = majAutoALOuverture({ premier, cle, occupe: occupe.current || historique.suivi.enCours }, Date.now())
    if (!decision.lancer) {
      try { console.log(`ouverture : pas de mise à jour automatique des stats (${decision.raison})`) } catch { /* console indisponible */ }
      return
    }
    try { note(ligneMajAuto(decision.age, decision.reprise)).catch(() => {}) } catch { /* journal indisponible : la collecte part quand même */ }
    collecter(true)
  })
  /**
   * Ticket 2.20 : l'attente passée, la décision ; la boutique d'abord, comme ↻ : tant que la lecture automatique de la boutique
   * de cette ouverture court (`auto.lecture`), la décision attend sa fin, quelle qu'en soit l'issue. Jamais les deux en même
   * temps : la lecture de la boutique ne contrôle pas les prix de HenrikDev sous le marqueur d'une collecte (rangerPrix de
   * valshop.ts), et ne les relit plus de la journée.
   */
  const majAuto = useFonctionStable(() => {
    if (auto === undefined || auto.stats || demonte.current) return
    if (auto.lecture !== null) auto.lecture.then(() => deciderAuto())
    else deciderAuto()
  })
  // Ticket 2.20 : armée à la première page montrée (`quandPrete` ; Stats natif : son montage), elle part ATTENTE_MAJ_AUTO_MS
  // après ; démonté avant (app fermée, repli de la page web vers le natif), rien ne part d'ici.
  useEffect(() => {
    if (auto === undefined || auto.stats) return
    let minuterie: ReturnType<typeof setTimeout> | null = null
    const armer = () => { if (minuterie === null) minuterie = setTimeout(() => majAuto(), ATTENTE_MAJ_AUTO_MS) }
    let desabonner = () => {}
    if (quandPrete) desabonner = quandPrete(armer)
    else armer()
    return () => { desabonner(); if (minuterie !== null) clearTimeout(minuterie) }
  }, [])
  // Le contenu qui défile, dans le lecteur de défilement vertical ; le ScrollView porte la Feuille « Réglages des stats ».
  const defile = (corps: VirtualNode) => (
    <ScrollViewReader>
      {(proxy) => {
        defilement.current = proxy
        return (
          <ScrollView
            sheet={{
              isPresented: feuille,
              onChanged: (ouverte) => (ouverte ? setFeuille(true) : fermer()),
              content: (
                <FeuilleReglages
                  onFermer={fermer}
                  refusee={refusee}
                  ecran={ecran}
                  maintenant={maintenant}
                  historique={vueHistorique}
                  onImporter={importer}
                />
              ),
            }}
          >
            {corps}
          </ScrollView>
        )
      }}
    </ScrollViewReader>
  )
  /**
   * Entrée 33 : la pile de navigation (EXPERIENCE.md, Component Patterns, Lien retour ; À vérifier au spike, point 10) qui porte
   * la racine `corps` de l'onglet, sous l'En-tête et la Barre d'onglets fixes, et pousse le Détail d'une partie
   * (`navigationDestination`, comme la Boutique) ; barre de navigation masquée ici et dans le Détail, qui a son Lien retour ;
   * le bouton retour n'est jamais masqué, pour que le geste de retour d'iOS reste celui de la pile. Fond `fond` sous la racine
   * (la pile peindrait sinon le fond du système). Sans données tenues, rien à pousser.
   */
  const pile = (corps: VirtualNode) => (
    <NavigationStack>
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={palette.fond}
        navigationBarVisibility="hidden"
        navigationDestination={{
          isPresented: partieOuverte.pousse,
          onChanged: changerDetail,
          content: partieOuverte.matchId !== null && donnees !== null
            ? <DetailPartie donnees={donnees} matchId={partieOuverte.matchId} ouverture={partieOuverte.ouverture} haut={haut} onRetour={() => changerDetail(false)} />
            : <EmptyView />,
        }}
      >
        {corps}
      </VStack>
    </NavigationStack>
  )
  // Sans barre (Premier lancement) : le haut, aux tailles d'accessibilité, au-dessus de la page, comme avant l'entrée 18 ; sans
  // pile de navigation (aucune partie à ouvrir).
  if (barre === null) {
    return defile(
      <VStack key={DEBUT_DU_CONTENU} spacing={0}>
        {haut}
        {page}
      </VStack>,
    )
  }
  // Tailles d'accessibilité : En-tête et Barre d'onglets défilent, la barre, en-tête épinglé de sa section, reste seule en haut.
  if (grand) {
    return pile(defile(
      <LazyVStack key={DEBUT_DU_CONTENU} spacing={0} pinnedViews="sectionHeaders">
        {haut}
        <Section header={barre}>{page}</Section>
      </LazyVStack>,
    ))
  }
  // Tailles ordinaires : la barre hors du défilement, sous l'En-tête et la Barre d'onglets fixes.
  return pile(
    <VStack spacing={0}>
      {barre}
      {defile(
        <VStack key={DEBUT_DU_CONTENU} spacing={0}>
          {page}
        </VStack>,
      )}
    </VStack>,
  )
}















export const INTERRUPTEURS = { statsWeb: true, statsEphemere: false, navigationGardee: false, nettoyageCookies: true, majAuto: true }

/**
 * Ticket 2.20 : ce qu'une ouverture de l'app (une présentation, presenterApp) a déjà tenté toute seule : `stats`, la collecte
 * de Mettre à jour ; `boutique`, la lecture de la boutique expirée. Chacune décidée une fois, lancée ou non, puis plus jamais
 * dans cette ouverture, quelle qu'en soit l'issue : ni boucle, ni nouvel essai. `lecture` : la fin de la lecture automatique
 * de la boutique tant qu'elle court ; `collecte` : la fin de ce qui tient le marqueur de collecte dans cet onglet (une
 * collecte, automatique ou lancée par Mettre à jour, un import : `suivre`) ; des promesses jamais rejetées, null hors d'elles.
 * Chacune attend l'autre avant de partir : la lecture automatique ne croise jamais une collecte de cette ouverture (elle ne
 * contrôlerait pas les prix de HenrikDev : rangerPrix de valshop.ts), et une collecte, même touchée, attend la lecture
 * automatique en cours. Un seul objet par ouverture, tenu par `App` (il survit au repli de la page web vers Stats natif) et
 * passé tel quel aux onglets, qui y écrivent.
 */
export type OuvertureAuto = { stats: boolean; boutique: boolean; lecture: Promise<void> | null; collecte: Promise<void> | null }

/**
 * Ticket 2.20 : `p` (une collecte ou un import de l'onglet Stats) tient le marqueur de collecte : l'ouverture `auto` en garde
 * la fin dans `collecte`, avec celle de ce qui courait déjà, jusqu'à ce que tout soit fini. Sans ouverture suivie (interrupteur
 * éteint) : rien. Ne rejette jamais.
 */
function suivre(auto: OuvertureAuto | undefined, p: Promise<unknown>): void {
  if (auto === undefined) return
  const avant = auto.collecte ?? Promise.resolve()
  const fin: Promise<void> = Promise.all([avant, p.then(() => {}, () => {})]).then(() => {})
  auto.collecte = fin
  fin.then(() => { if (auto.collecte === fin) auto.collecte = null })
}

/**
 * Ticket 2.20 : l'attente entre la première page montrée et la décision de la mise à jour automatique : le tour qui montre la
 * page (cache retiré, page-web.tsx) ne porte rien de plus, et la collecte ne commence qu'une fois l'écran affiché ; plus
 * longue que DELAI_BOUTIQUE_MS, pour que la Boutique, montée ce délai après la page, ait décidé avant : la boutique expirée se
 * lit d'abord, la collecte ensuite, comme ↻. L'ordre n'en dépend pas pour être juste : celle qui part la seconde attend la
 * fin de la première (OuvertureAuto).
 */
export const ATTENTE_MAJ_AUTO_MS = 1500
reglerPageWeb({ ephemere: () => INTERRUPTEURS.statsEphemere, garde: () => INTERRUPTEURS.navigationGardee })
/**
 * Le dernier corps de page traduit par StatsWeb, son arbre et son moteur : pour le harnais (page tenue, arbre vu, état des
 * composants). Le moteur par une référence faible : ce module, gardé par d'autres, ne le retient pas après la session.
 */
export const DERNIERE_PAGE_WEB: {
  html: string | null; arbre: VueWeb | null; moteur: WeakRef<MoteurWeb> | null
  /**
   * Ticket 4.51 : le Détail d'une partie dans la page : son arbre web (rendu par le moteur du Détail, null s'il n'est pas
   * poussé) et la destination de Stats telle que le moteur web la rend (le faux hôte la refait pour Scripting et la remet à
   * sa place native, comme avant ; rien n'est refait ici).
   */
  detail: VueWeb | null; destination: { isPresented: boolean; onChanged: (v: boolean) => void; content: unknown } | null
} = { html: null, arbre: null, moteur: null, detail: null, destination: null }

/** Ticket 4.51 : l'action que la page renvoie quand le geste de retour a dépilé le Détail (`data-retour` de sa vue). */
const RETOUR_WEB = "vue-retour"

/** Les props de l'En-tête que l'onglet web rend lui-même aux tailles d'accessibilité (il y défile avec la page). */
type PropsHaut = { onglet: CleOnglet; onChoix: (o: CleOnglet) => void; onFermer: () => void; marges: boolean }

/** L'état d'une page web de Stats pour la session : moteur, traducteur (classes gardées), page envoyée, rendu demandé. */
type EtatPageWeb = {
  moteur: MoteurWeb; traducteur: Traducteur; html: Decoupe | null; document: string; demande: boolean; env: string; echecDit: boolean
  /** Ticket 4.51 : le moteur du Détail d'une partie (son état : la manche choisie) ; sa dernière traduction, gardée caché. */
  moteurDetail: MoteurWeb; htmlDetail: string
  /** Rendus de l'onglet (l'effet qui lance ceux des composants), refus de suite de la page, actions des menus du périmètre. */
  rendus: number; refus: number; menus: Map<string, () => void>
  /** Démonté (relecture C5) ; l'onglet à l'écran au rendu d'avant (relecture C2). */
  demonte: boolean; visible: boolean
}

/** Ticket 4.55 : ce que calcule un rendu de la page (calculerPageWeb) : arbres, Détail poussé, traducteur, page de ce rendu. */
type CalculPageWeb = {
  arbre: VueWeb; d: any; poussee: boolean; arbreDetail: VueWeb | null; T: Traducteur; classes: number; html: string
}

/**
 * Le calcul de la page d'un rendu de StatsWeb (tickets 4.50 et 4.51) : Stats rendu par le moteur web, le Détail d'une partie
 * (destination de Stats) par le sien tant qu'il est poussé, leur traduction en HTML et les menus du périmètre. Lève si un
 * composant ou la traduction lève (ticket 4.55 : StatsWeb le dit au journal et passe au natif).
 */
function calculerPageWeb(e: EtatPageWeb, haut: PropsHaut | null, palette: Palette, taille: DynamicTypeSize | undefined, auto: OuvertureAuto | undefined): CalculPageWeb {
  // Ticket 2.20 : `auto` et quandPagePrete, deux références stables (le moteur web ne rend pas Stats de nouveau pour elles).
  const arbre = rendreWeb(e.moteur, () => (
    <Stats haut={haut ? elementWeb(Haut, haut) : null} palette={palette} taille={taille} auto={auto} quandPrete={quandPagePrete} />
  ), { effetsApres: true })
  // Ticket 4.51 : le Détail d'une partie (destination de Stats), rendu par son moteur tant qu'il est poussé.
  const destination = porteur(arbre, "navigationDestination")
  const d = destination ? destination.props.navigationDestination : null
  const poussee = d !== null && d.isPresented === true
  const arbreDetail = poussee ? rendreWeb(e.moteurDetail, () => d.content, { effetsApres: true }) : null
  const T = e.traducteur
  T.actions.clear(); T.menus.clear(); T.dates.clear()
  const classes = T.nombreDeClasses()
  // Tout l'onglet dans un morceau « stats » : un changement hors des morceaux de la traduction le remplace, sans recharger ;
  // les menus du périmètre à côté, dans le morceau « menus-web ». Ticket 4.51 : l'onglet et le Détail, deux vues de la page,
  // une seule montrée ; le Détail dépilé reste dans la page, caché, tel qu'il était (rien à envoyer au retour).
  const corps = T.vue(arbre)
  if (arbreDetail !== null) e.htmlDetail = T.vueSeparee("detail", arbreDetail)
  const menus = menusWeb(T.menus) // après la traduction, qui garde les Menu dans `menus`
  e.menus = menus.actions
  const html = `<div id="stats" data-vue="stats"${poussee ? " hidden" : ""}>${corps}</div>` +
    `<div id="detail" data-vue="detail" data-retour="${RETOUR_WEB}" data-focus="${RETOUR_DIT}"${poussee ? "" : " hidden"}>${e.htmlDetail}</div>${menus.html}`
  return { arbre, d, poussee, arbreDetail, T, classes, html }
}





export function ligneErreurDeCalcul(erreur: unknown): string {
  let pile = ""
  try {
    const p = erreur instanceof Error && typeof erreur.stack === "string" ? erreur.stack.split("\n").slice(1, 3).map((l) => l.trim()).join(" ; ") : ""
    if (p !== "") pile = ` ; pile : ${p}`
  } catch { /* pile illisible */ }
  const texte = messageHote(`${String(erreur)}${pile}`, []).replace(/\S+#\S+/g, "…")
  return `[page web] le calcul de la page de Stats a levé (${texte}) : Stats natif à sa place`
}

/** Le document de la page : feuille de base et classes du traducteur, corps, script de dessin (traduction-web.ts). */
function documentWeb(corps: string, css: string): string {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    `<style>${CSS_BASE}${STYLE_MENU}${css}</style></head><body>${corps}<script>${SCRIPT_PAGE}</script><script>${SCRIPT_MENU}</script></body></html>`
}

/**
 * Les vues de l'arbre qui portent la prop `cle`, dans l'ordre : la vue, puis les vues de ses props, puis ses enfants (l'ordre
 * où le harnais les remet, faux-hote/scripting-app.js).
 */
function porteurs(n: VueWeb, cle: string, out: VueWeb[] = []): VueWeb[] {
  if (n.props && n.props[cle] !== undefined) out.push(n)
  for (const v of Object.values(n.props || {})) {
    if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && "children" in c) porteurs(c, cle, out)
  }
  for (const c of n.children || []) porteurs(c, cle, out)
  return out
}
/** La première vue de l'arbre qui porte la prop `cle` (le Détail d'une partie : sa destination, que la page montre). */
function porteur(n: VueWeb, cle: string): VueWeb | null {
  if (n.props && n.props[cle] !== undefined) return n
  for (const c of n.children || []) { const r = porteur(c, cle); if (r) return r }
  for (const v of Object.values(n.props || {})) {
    if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && "children" in c) { const r = porteur(c, cle); if (r) return r }
  }
  return null
}

/**
 * Ticket 4.50 (phases B et C) : l'onglet Stats en une seule vue web. Les mêmes composants (Stats et ses sous-onglets) rendus
 * en JS pur par le moteur web de rendu.ts, à chaque changement de leur état ; leur arbre traduit en HTML (traduction-web.ts) ;
 * la page reçoit au premier rendu le document entier, ensuite seulement ce qui change (morceaux-web.ts : morceaux remplacés,
 * section ajoutée à la première ouverture d'un sous-onglet, bascule), par l'hôte natif (page-web.tsx, fonctions de module
 * qui rendent vrai une fois fait). Une opération refusée (faux) : le document entier de nouveau ; deux fois de suite, Stats
 * natif. Les appuis reviennent par `onAction` : l'action gardée par la traduction (même identifiant tant que l'arbre ne bouge
 * pas) ; un choix du menu du périmètre (menusWeb : un menu HTML dans la page, ouvert et fermé par la page seule) ; « date » :
 * le DatePicker du Récap, en feuille native ; « lien » : Safari. Reste natif, piloté par l'état de la page : la feuille
 * Réglages (son contenu refait pour Scripting, versNatif). Ticket 4.51 : le Détail d'une partie est une vue de la même page
 * (`data-vue` « detail », à côté de « stats ») : sa destination (`navigationDestination` de Stats, jamais rendue en web par
 * rendu.ts) rendue par un second moteur web tant qu'elle est poussée, traduite à part (`vueSeparee` : actions sous « detail »,
 * un morceau par bloc), gardée cachée après le retour ; la page la pousse et la dépile (opération « vue », page-web.tsx :
 * glissée de la pile d'iOS, geste depuis le bord gauche, qui renvoie « vue-retour »). Les effets des composants partent
 * après l'affichage (effet natif de l'onglet), comme sous Scripting. Taille de texte ou contraste changés : le document
 * entier. La page ne se charge pas (`onEchec`) : une ligne au journal, et Stats natif à sa place.
 */
function StatsWeb({ haut, palette, taille, contraste, visible = true, auto }: {
  haut: PropsHaut | null; palette: Palette; taille: DynamicTypeSize | undefined; contraste: ColorSchemeContrast | undefined
  /** L'onglet Stats à l'écran (faux : Boutique) : le menu ouvert dans la page se ferme, la garde de chargement attend. */
  visible?: boolean
  /** Ticket 2.20 : les tentatives automatiques de cette ouverture, passées à Stats (web, ou natif après un repli). */
  auto?: OuvertureAuto
}) {
  const [, setTour] = useState(0)
  const [echec, setEchec] = useState(false)
  // Le DatePicker ouvert, par son identifiant dans la page (stable) : relu à chaque rendu, valeur à jour.
  const [dateOuverte, setDate] = useState<string | null>(null)
  const etat = useRef<EtatPageWeb | null>(null)
  useEffect(() => () => {
    // Relecture C5 : démonté, plus rien ne part (ni ligne d'échec, ni rendu demandé, ni suite d'une opération).
    if (etat.current) { etat.current.demonte = true; fermerMoteurWeb(etat.current.moteur); fermerMoteurWeb(etat.current.moteurDetail) }
    fermerPageWeb()
    DERNIERE_PAGE_WEB.html = null; DERNIERE_PAGE_WEB.arbre = null; DERNIERE_PAGE_WEB.detail = null; DERNIERE_PAGE_WEB.destination = null
  }, [])
  const demander = () => {
    const x = etat.current
    if (x === null || x.demande || x.demonte) return
    x.demande = true
    Promise.resolve().then(() => { x.demande = false; if (!x.demonte) setTour((t) => t + 1) })
  }
  const surEchec = () => {
    const x = etat.current
    if (x !== null && x.demonte) return
    if (x !== null && !x.echecDit) {
      x.echecDit = true
      try { note("[page web] la page de Stats ne se charge pas : Stats natif à sa place") } catch { /* journal indisponible */ }
    }
    if (x !== null) { fermerMoteurWeb(x.moteur); fermerMoteurWeb(x.moteurDetail) }
    // Relecture C12 : le contrôleur libéré dès le repli (le natif n'en a plus besoin).
    fermerPageWeb()
    setEchec(true)
  }
  if (etat.current === null) {
    const surDefilement = (id: string | number, ancre: unknown, lecteur: string) => { defiler(String(id), ancre === undefined ? undefined : String(ancre), lecteur) }
    etat.current = {
      moteur: creerMoteurWeb({}, demander, surDefilement), moteurDetail: creerMoteurWeb({}, demander, surDefilement), htmlDetail: "",
      traducteur: creerTraducteur(taille ?? "large"), html: null, document: "", demande: false, env: "", echecDit: false,
      rendus: 0, refus: 0, menus: new Map(), demonte: false, visible: true,
    }
  }
  const e = etat.current
  // Les effets des composants rendus ci-dessous, après l'affichage de ce rendu (comme sous Scripting).
  const numero = ++e.rendus
  useEffect(() => { if (!echec) { lancerEffetsWeb(e.moteur); lancerEffetsWeb(e.moteurDetail) } }, [numero])
  if (echec) return <Stats haut={haut ? <Haut {...haut} /> : null} palette={palette} taille={taille} auto={auto} />
  const env = `${taille}|${contraste}`
  if (env !== e.env) {
    e.env = env
    for (const m of [e.moteur, e.moteurDetail]) { m.env.dynamicTypeSize = taille; m.env.colorSchemeContrast = contraste }
    e.traducteur = creerTraducteur(taille ?? "large")
    e.html = null
    e.htmlDetail = ""
  }
  // Ticket 4.55 : une erreur levée pendant le calcul de la page (rendu web d'un composant, traduction) ne remonte plus hors de
  // l'onglet, qu'elle laissait vide sans rien écrire : une ligne au journal (sans identifiant), et Stats natif à sa place.
  let calcul: CalculPageWeb
  try {
    calcul = calculerPageWeb(e, haut, palette, taille, auto)
  } catch (erreur) {
    if (!e.echecDit) {
      e.echecDit = true
      try { note(ligneErreurDeCalcul(erreur)).catch(() => {}) } catch { /* journal indisponible */ }
    }
    fermerMoteurWeb(e.moteur); fermerMoteurWeb(e.moteurDetail)
    Promise.resolve().then(() => { if (!e.demonte) { fermerPageWeb(); setEchec(true) } })
    return <Stats haut={haut ? <Haut {...haut} /> : null} palette={palette} taille={taille} auto={auto} />
  }
  const { arbre, d, poussee, arbreDetail, T, classes, html } = calcul
  /**
   * Relecture C4 : les opérations de ce rendu suivies ensemble ; une refusée (faux) fait de ce rendu un refus : le premier, le
   * document entier au rendu suivant ; deux rendus refusés de suite, Stats natif. Un rendu accepté remet le compte à zéro.
   */
  const operationsDuRendu: Promise<boolean>[] = []
  const suivre = (p: Promise<boolean>) => { operationsDuRendu.push(p) }
  if (e.html === null) {
    e.document = documentWeb(html, T.css())
    e.html = decouper(html)
  } else {
    const { ops, decoupe } = comparer(e.html, html)
    e.html = decoupe
    if (ops.some((o) => o.genre === "page")) e.document = documentWeb(html, T.css())
    else {
      // Classes neuves : envoyées avec le premier morceau (ou la première section) qui part ; aucune ne sert ailleurs.
      let css: string | undefined = T.nombreDeClasses() > classes ? T.css(classes) : undefined
      for (const o of ops) {
        if (o.genre === "remplacer") { suivre(remplacer(o.id, o.html, css)); css = undefined }
        else if (o.genre === "inserer") { suivre(inserer(o.dans, o.apres, o.html, css)); css = undefined }
        else if (o.genre === "section") { suivre(ajouterSection(o.cle, o.html, css)); css = undefined }
        else if (o.genre === "basculer") suivre(basculer(o.cle))
        else if (o.genre === "vue") suivre(montrer(o.cle))
      }
    }
  }
  if (operationsDuRendu.length > 0) {
    Promise.all(operationsDuRendu.map((p) => p.then((ok) => ok, () => false))).then((oks) => {
      if (e.demonte || echec) return
      if (oks.every((ok) => ok)) { e.refus = 0; return }
      if (++e.refus >= 2) { surEchec(); return }
      e.html = null
      demander()
    })
  }
  // Relecture C2 : l'onglet caché (Boutique) ferme le menu ouvert dans la page.
  if (e.visible && !visible) fermerMenus()
  e.visible = visible
  DERNIERE_PAGE_WEB.html = html
  DERNIERE_PAGE_WEB.arbre = arbre
  DERNIERE_PAGE_WEB.detail = arbreDetail
  DERNIERE_PAGE_WEB.destination = d
  // Relecture C11 : pour le harnais seulement ; sans WeakRef (moteur JavaScript ancien), rien.
  if (typeof WeakRef === "function" && (DERNIERE_PAGE_WEB.moteur === null || DERNIERE_PAGE_WEB.moteur.deref() !== e.moteur)) DERNIERE_PAGE_WEB.moteur = new WeakRef(e.moteur)
  const surAction = (action: string, valeur?: string) => {
    if (action === "menu") return // ouvert par la page elle-même
    if (action === "date") { if (valeur !== undefined && T.dates.has(valeur)) setDate(valeur); return }
    // Ticket 7.8 (M2) : seulement une adresse de la liste blanche (securite.ts, LIENS_ADMIS) ; toute autre, rien d'ouvert.
    if (action === "lien") { if (lienAdmis(valeur)) Safari.openURL(valeur); return }
    // Ticket 4.51 : le geste de retour fait par la page (le Détail déjà dépilé à l'écran) : l'état de Stats suit.
    // Relecture 4 : la page montre déjà « stats » : le modèle de la page aussi, pour que le rendu suivant (même s'il pousse
    // aussitôt une autre partie, sans rendu entre les deux) compare avec ce qui est à l'écran.
    if (action === RETOUR_WEB) {
      if (e.html !== null && e.html.vues.has("stats")) e.html = decouper(appliquer(e.html.html, [{ genre: "vue", cle: "stats" }]))
      if (d) d.onChanged(false)
      return
    }
    const f = T.actions.get(action) ?? e.menus.get(action)
    if (f) f()
  }
  const date = dateOuverte === null ? null : T.dates.get(dateOuverte) ?? null
  // Chaque feuille de la page (Réglages ; repli d'une Ligne en feuille…) portée par une pile native, dans l'ordre de l'arbre.
  const feuilles = porteurs(arbre, "sheet").map((v) => v.props.sheet)
  // Relecture C3 : après un arrêt de WebKit, la page rechargée avec ce qu'elle montrait (le document de la page courante).
  const surRecharge = () => (e.html === null ? e.document : documentWeb(e.html.html, e.traducteur.css()))
  // Relecture C9 : la page hors de l'écran (autre onglet) : pas de garde de chargement. Ticket 4.51 : le Détail est dans la page.
  const cachee = !visible
  let page: VirtualNode = <PageWeb html={e.document} onAction={surAction} onEchec={surEchec} onRecharge={surRecharge} cachee={cachee} />
  for (let k = feuilles.length - 1; k >= 0; k--) {
    const f = feuilles[k]
    page = (
      <VStack key={`page-web-feuille-${k}`} spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        sheet={{ isPresented: f.isPresented, onChanged: f.onChanged, content: versNatif(f.content) }}>
        {page}
      </VStack>
    )
  }
  return (
    <NavigationStack>
      <VStack
        key="page-web"
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={palette.fond}
        navigationBarVisibility="hidden"
      >
        <VStack
          key="page-web-date"
          spacing={0}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          sheet={{
            isPresented: date !== null,
            onChanged: (ouverte: boolean) => { if (!ouverte) setDate(null) },
            content: (
              <VStack presentationDetents={["medium", "large"]} preferredColorScheme="dark" padding={16} spacing={12}>
                {date ? vueVersNatif(date) : null}
                <Button title="OK" action={() => setDate(null)} />
              </VStack>
            ),
          }}
        >
          {page}
        </VStack>
      </VStack>
    </NavigationStack>
  )
}

/** Relecture 2 (ticket 4.51) : la Boutique montée cachée ce délai après la page de Stats montrée (ses données lues, en général). */
export const DELAI_BOUTIQUE_MS = 800

/**
 * L'app : Stats à l'ouverture ; `expiree` (session Riot expirée, lue dans etat.json par
 * `presenterApp`) : l'Écran de connexion seul, ni Barre d'onglets ni onglet monté. Taille du
 * texte et contraste lus dans l'environnement : En-tête ValShop et Barre d'onglets fixes, ou
 * dans l'onglet aux tailles d'accessibilité. Ticket 2.20 : elle tient les tentatives automatiques de l'ouverture
 * (OuvertureAuto), que Stats et la Boutique reçoivent ; session expirée : aucun onglet, donc aucune tentative.
 */
function App({ shop: shopOuvert, empreinte, souhaits, expiree, deconnecte = false, statut = null }: {
  shop: Shop | null; empreinte?: EmpreinteBoutique; souhaits?: Souhait[]; expiree: boolean; deconnecte?: boolean
  statut?: Promise<string | null> | null
}) {
  const fermer: (choix?: ChoixVue) => void = Navigation.useDismiss()
  // Ticket 4.52 : le bandeau de l'état des serveurs de Riot, quand la lecture lancée à l'ouverture (presenterApp) en donne un.
  const [bandeau, setBandeau] = useState<string | null>(null)
  useEffect(() => {
    let vivant = true
    if (statut) statut.then((t) => { if (vivant && typeof t === "string" && t !== "") setBandeau(t) }, () => {})
    return () => { vivant = false }
  }, [])

  const [onglet, setOnglet] = useState<CleOnglet>(() => preferencesGardees().ouverture)
  // Ticket 4.51 : la Boutique n'est pas rendue à l'ouverture (≈ 117 éléments natifs, ≈ 0,27 s au modèle, de moins) ; relecture 2 :
  // elle est montée, cachée, après coup (monterBoutique), ou au premier appui sur son onglet s'il vient avant ; puis gardée.
  // `shop` : la boutique lue à l'ouverture, relue au montage si shop.json a changé entre-temps (relireSiChangee).
  const [boutique, setBoutique] = useState<{ montee: boolean; shop: Shop | null }>({ montee: onglet === "boutique", shop: shopOuvert })
  const monterBoutique = useFonctionStable(() => {
    if (boutique.montee) return
    const relue = empreinte ? relireSiChangee(empreinte) : null
    setBoutique({ montee: true, shop: relue ? relue.shop : boutique.shop })
  })
  const choisir = useFonctionStable((o: CleOnglet) => {
    if (o === "boutique") monterBoutique()
    setOnglet(o)
  })
  const boutiqueMontee = boutique.montee
  const shop = boutique.shop
  // Relecture 2 : le montage caché, après coup : DELAI_BOUTIQUE_MS après que la page web de Stats s'est montrée. Sans page
  // (Stats natif : repli ou interrupteur éteint), au premier appui sur Boutique, comme avant. Ni requête, ni écriture, ni
  // alerte : la liste de souhaits est lue à l'ouverture (presenterApp) ; shop.json n'est que daté (statSync), et relu
  // seulement s'il a changé.
  useEffect(() => {
    if (expiree || boutiqueMontee || !INTERRUPTEURS.statsWeb) return
    let minuterie: ReturnType<typeof setTimeout> | null = null
    const desabonner = quandPagePrete(() => { if (minuterie === null) minuterie = setTimeout(() => monterBoutique(), DELAI_BOUTIQUE_MS) })
    return () => { desabonner(); if (minuterie !== null) clearTimeout(minuterie) }
  }, [boutiqueMontee])
  const haut = (marges: boolean) => (
    <Haut onglet={onglet} onChoix={choisir} onFermer={() => fermer()} marges={marges} />
  )
  const propsHaut = (marges: boolean): PropsHaut => ({ onglet, onChoix: choisir, onFermer: () => fermer(), marges })
  // Ticket 2.20 : les tentatives automatiques de cette ouverture, le même objet à chaque rendu ; interrupteur éteint : aucune.
  const tentatives = useRef<OuvertureAuto>({ stats: false, boutique: false, lecture: null, collecte: null })
  const auto = INTERRUPTEURS.majAuto ? tentatives.current : undefined
  return (
    <EnvironmentValuesReader keys={["dynamicTypeSize", "colorSchemeContrast"]}>
      {(env) => {
        const palette = couleurs(env.colorSchemeContrast)
        const defile = tailleAccessibilite(env.dynamicTypeSize)
        return (
          <ZStack alignment="top" preferredColorScheme="dark">
            <Rectangle fill={palette.fond} ignoresSafeArea />
            {expiree ? (
              <EcranConnexion defile={defile} palette={palette} />
            ) : (
              <VStack spacing={0}>
                {defile ? null : haut(true)}
                {bandeau !== null ? (
                  <VStack key="bandeau-riot" padding={{ top: ESPACES.entete, horizontal: ESPACES.margePage }}>
                    <BandeauAlerte texte={bandeau} />
                  </VStack>
                ) : null}
                <ZStack>
                  <VStack {...masque(onglet === "stats")}>
                    {INTERRUPTEURS.statsWeb ? (
                      <StatsWeb haut={defile ? propsHaut(true) : null} palette={palette} taille={env.dynamicTypeSize} contraste={env.colorSchemeContrast} visible={onglet === "stats"} auto={auto} />
                    ) : (
                      <Stats haut={defile ? haut(true) : null} palette={palette} taille={env.dynamicTypeSize} auto={auto} />
                    )}
                  </VStack>
                  <VStack {...masque(onglet === "boutique")}>
                    {!boutiqueMontee && onglet !== "boutique" ? null : shop ? (
                      <Boutique shop={shop} souhaits={souhaits} entete={defile ? haut(false) : undefined} auto={auto} />
                    ) : defile ? (
                      <ScrollView>
                        <VStack spacing={0}>
                          {haut(true)}
                          {deconnecte ? <InviteConnexion palette={palette} /> : <SansCache />}
                        </VStack>
                      </ScrollView>
                    ) : deconnecte ? (
                      <InviteConnexion palette={palette} />
                    ) : (
                      <SansCache />
                    )}
                  </VStack>
                </ZStack>
              </VStack>
            )}
          </ZStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}

/** Contenu d'etat.json, lu sur place, jamais sur le réseau ; null s'il manque ou ne se lit pas. */
function lireEtat(): string | null {
  try {
    return FileManager.existsSync(ETAT_FILE) ? FileManager.readAsStringSync(ETAT_FILE) : null
  } catch {
    return null
  }
}

/**
 * Epic-installation-ami, entrée 4 : le contrôle de la nouvelle version (mise-a-jour.ts), au plus une fois par jour ; un GET public de
 * version.json du dépôt, sans en-tête ni corps, sans redirection suivie ; la version installée, celle de script.json
 * (Script.metadata). La réponse est annoncée à la feuille Réglages (annoncerNouvelleVersion). Ticket 7.8 (M1, F4) : le dernier
 * contrôle gardé dans le `Storage` du script (CLE_VERSION), propre à ValShop, plus dans le dossier du groupe d'apps que tout
 * script partage (l'ancien version-en-ligne.json y est retiré) ; le corps de version.json borné (securite.ts, BORNE_VERSION) :
 * au-delà, une réponse inattendue. Ne lève jamais.
 */
async function controlerVersion(): Promise<void> {
  const ancien = `${FileManager.appGroupDocumentsDirectory}/${FICHIER_VERSION}`
  try { if (FileManager.existsSync(ancien)) FileManager.removeSync(ancien) } catch { /* retiré au prochain contrôle */ }
  let installee: string | null = null
  try { installee = Script.metadata?.version ?? null } catch { /* métadonnées illisibles : aucune comparaison */ }
  const v = await chercherNouvelleVersion({
    installee,
    maintenant: Date.now(),
    lireCache: () => {
      const t = Storage.get<string>(CLE_VERSION)
      return typeof t === "string" ? t : null
    },
    ecrireCache: (texte) => { Storage.set(CLE_VERSION, texte) },
    telecharger: async () => {
      const r = await fetch(ADRESSE_VERSION, { timeout: DELAI_VERSION, handleRedirect: async () => null })
      if (r.status < 200 || r.status > 299) return { statut: r.status, corps: null }
      try {
        return { statut: r.status, corps: await texteBorne(r, BORNE_VERSION) }
      } catch (e) {
        // Trop grand : une réponse inattendue (corps illisible) ; une coupure en route reste « sans réponse ».
        if (e instanceof ReponseTropGrande) return { statut: r.status, corps: "" }
        throw e
      }
    },
    noter: (ligne) => note(ligne),
  })
  annoncerNouvelleVersion(v)
}

/**
 * Ce que l'app lit à chaque ouverture : la boutique gardée (null : absente ou illisible), son empreinte, et si l'Écran de
 * connexion s'impose.
 */
export type LectureOuverture = { shop: Shop | null; empreinte: EmpreinteBoutique; expiree: boolean; deconnecte: boolean }

/**
 * La lecture de chaque ouverture de l'app, sur place, sans requête : shop.json, puis etat.json (session expirée depuis la
 * dernière lecture réussie de la boutique : `connexionRequise`, garde-fou.ts). Entrée 22 de epic-stats-collecte : le lancement
 * sans paramètre (index.tsx) la fait lui-même, pour savoir si une boutique est gardée, et la donne à presenterApp : rien n'est
 * lu deux fois.
 */
export function lireOuverture(): LectureOuverture {
  const { shop, empreinte } = chargerAvecEmpreinte()
  // Epic-installation-ami, entrée 11 : aucune boutique gardée ni aucune session Riot au trousseau (jamais connecté, ou
  // déconnecté) : l'onglet Boutique invite à se connecter. Le trousseau n'est lu que sans boutique gardée.
  return { shop, empreinte, expiree: connexionRequise(lireEtat(), shop), deconnecte: shop === null && !sessionGardee() }
}

/**
 * Présente l'app en plein écran et rend la main quand elle se ferme : « changer-de-compte »
 * si Boutique l'a demandé, « connexion » si l'Écran de connexion ou l'étape 1 du Premier
 * lancement l'a demandé, null après le Bouton Fermer. etat.json et shop.json sont lus à
 * chaque ouverture (`lue`, ou lireOuverture) : session expirée depuis la dernière lecture
 * réussie de la boutique, l'Écran de connexion ; sinon les onglets.
 */
export async function presenterApp(lue: LectureOuverture = lireOuverture()): Promise<ChoixVue> {
  const { shop, empreinte, expiree, deconnecte } = lue
  // Relecture 2 : la liste de souhaits lue à l'ouverture (sans boutique ni session expirée : rien, comme avant 4.51).
  const souhaits = shop && !expiree ? chargerListe() : undefined
  // Ticket 4.52 : l'état des serveurs de Riot, lu une fois par ouverture, sans retenir l'app (Écran de connexion : rien).
  const statut = expiree ? null : lireStatutRiot()
  // Epic-installation-ami, entrée 4 : la nouvelle version, une clé rangée (une première installation ne demande rien), sans
  // retenir l'app ; la feuille Réglages la montre dès qu'elle est sue.
  if (!expiree && aUneCle()) controlerVersion().catch(() => {})
  const choix = await Navigation.present<unknown>({
    element: <App shop={shop} empreinte={empreinte} souhaits={souhaits} expiree={expiree} deconnecte={deconnecte} statut={statut} />,
    modalPresentationStyle: "fullScreen",
  })
  return choix === "changer-de-compte" || choix === "deconnexion" || choix === "connexion" ? choix : null
}
