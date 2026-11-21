import {
  EmptyView, EnvironmentValuesReader, HStack, Link, NavigationStack, ProgressView, Rectangle, RoundedRectangle, Script, ScrollView, SecureField, Spacer, Text, Toggle, VStack,
  Widget, type Color, type VirtualNode,
} from "scripting"
import { createElement, Fragment, useEffect, useRef, useState } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import {
  ARRONDIS, BoutonFermer, BoutonPrincipal, BoutonSecondaire, BoutonSysteme, Chiffre, ESPACES, TYPO, couleurs, melange, policeCondensee, tailleAccessibilite,
  type Palette,
} from "./design"
import { SelecteurSegmente } from "./dessin"
import { garderPreferences, preferencesGardees, type Ouverture } from "./preferences"
import { ecrireReglage, lireReglageGarde } from "./widgets-fichier"
import { PHRASES_ILE, type EtatIle } from "./widgets-ile"
import { arreterIle, assurerIle } from "./widgets-ile-app"
import { choisirIle } from "./widgets-reglage"
import { LIEN_CLE, aUneCle, collerCle, normaliserCle, rangerCle, retirerCle } from "./cle"
import { NOTE_COLLECTE, chiffresCollecte, phraseCompte } from "./historique"
import { etatDeLImport, lancerImport, type BilanImport } from "./importation"
import {
  BOUTON_IMPORT, NOTE_IMPORT, SUIVI_NEUF, TITRE_HISTORIQUE_AVANT, aRelire, suiviApres, type SuiviImport, type VueHistoriqueAvant,
} from "./historique-avant"
import type { EtatEcran } from "./collecte"
import {
  BOUTON_PARTAGE, DEPOT_VALSHOP, MENTION_RIOT, NOTE_PARTAGE, REFUS_PARTAGE, TITRE_A_PROPOS, TITRE_PARTAGE, lienInstallation, ligneVersion,
} from "./partage"
import {
  BOUTON_MISE_A_JOUR, NOTE_MISE_A_JOUR, REFUS_MISE_A_JOUR, TITRE_MISE_A_JOUR, ecouterNouvelleVersion, nouvelleVersionConnue,
  phraseMiseAJour, type NouvelleVersion,
} from "./mise-a-jour"
import { lireEtatPrix, lignesPrixCatalogue } from "./prix-retenus"
import { ETAT_PRIX_FILE } from "./valshop"
import { MesWidgets } from "./mes-widgets"

// Feuille « Réglages des stats » (DESIGN.md, feuille-reglages ; EXPERIENCE.md, Component
// Patterns), présentée sur l'onglet Stats (app.tsx) : à mi-hauteur, agrandissable, sombre
// même quand iOS est en mode clair, sur `surface`. Quatre sections, chacune titrée d'une
// étiquette condensée annoncée comme en-tête : Clé HenrikDev, en contrôles du système ; puis
// Ton compte et Collecte (entrée 19), en affichage seul de ce que l'onglet tient déjà, son état
// d'écran et son heure, reçus en props (`ecran`, `maintenant`) : aucune lecture, écriture ni
// requête de plus, et l'âge comme le nombre de parties suivent l'onglet, feuille ouverte
// (sa minuterie, une mise à jour qui finit). Ton compte : une phrase, le seul endroit où
// s'écrit le Riot ID ; Collecte : deux Chiffres, « Dernière mise à jour » et « À faire au
// moins », côte à côte, l'un sous l'autre dès la première taille de texte d'accessibilité,
// puis la note sur la fenêtre de HenrikDev. Entre elles, Ton historique d'avant (entrée 5 de
// epic-stats-import) : l'import de l'historique tracker.gg, en affichage seul, lui aussi, de la
// vue que l'onglet calcule (historique-avant.ts) du suivi qu'il tient (useHistoriqueAvant, plus
// bas : lecture de l'état à l'ouverture de la feuille, appui, avancée, fin), et l'appui rendu à
// l'onglet (`onImporter`) : fermer la feuille ne coupe ni la lecture ni l'import. Entrée 10 de epic-installation-ami : cette
// section n'est dans l'arbre que lorsqu'un fichier d'import est connu, qu'un import tourne, est fait, ou qu'un appui vient d'y
// répondre (`historique` null sinon, historiqueAvantMontre) : un nouvel utilisateur, qui ne peut pas fabriquer ce fichier,
// n'en lit rien ; l'état se lit toujours à l'ouverture de la feuille, section cachée ou non. Après Collecte,
// Prix du catalogue (ticket 8.9 de epic-boutique-visuels : skins à prix par source et dernier contrôle HenrikDev, lus une fois
// dans etat-prix.json à l'ouverture ; entrée 15 : un contrôle non lu n'y est pas montré, sauf une clé refusée), puis Partager ValShop (epic-installation-ami, entrée 3) : le seul lien d'installation passé à la
// feuille de partage d'iOS (partage.ts), sans requête ni fichier. Sous le titre, Nouvelle version
// (entrée 4), seulement quand une version plus récente est sue (mise-a-jour.ts) : ajoutée à
// l'arbre, jamais montrée par un modificateur changé après coup. En dernier, À propos (entrée 7) :
// la version installée et la mention de Riot Games.
// Champ protégé : il s'ouvre vide, la note dit si une clé est rangée. Une nouvelle clé n'est
// rangée que par « Coller » ou par la validation du champ (touche Entrée), jamais à la
// frappe : un champ secret d'iOS s'efface à la première frappe qui suit une reprise du
// focus, et ni ce champ effacé, ni un champ vidé, ni une frappe par erreur ne changent la
// clé rangée. Seul « Retirer la clé » la retire. Chaque écriture au trousseau est relue
// (cle.ts) : refusée, la feuille le dit et rien ne change. La clé n'est jamais affichée en
// clair, jamais dans un fichier, la console ni le journal. Aucune requête : elle n'est
// éprouvée qu'à la première mise à jour ; le lien n'ouvre Safari que sur appui. « Coller »
// et le lien sont ceux de l'étape 2 du Premier lancement (cle.ts).

/** Note sous le champ, avec ou sans clé rangée. */
const NOTE_RANGEE = "Une clé est rangée dans le trousseau de ton iPhone."
const NOTE_SANS_CLE = "Rangée dans le trousseau de ton iPhone, jamais affichée en clair."

/** Écriture refusée par le trousseau : la clé d'avant reste. */
const REFUS_RANGER = "Clé non rangée, réessaie."
const REFUS_RETIRER = "Clé non retirée, réessaie."

/**
 * Le suivi de l'import de l'historique tracker.gg (entrée 5 de epic-stats-import), tenu par l'onglet Stats (app.tsx), qui
 * l'appelle à chacun de ses rendus : il survit à la feuille, fermée ou rouverte, et l'import continue sans elle. Rend le
 * suivi (SuiviImport) et trois gestes :
 * - `surOuverture`, à chaque ouverture de la feuille : l'état de l'import lu (etatDeLImport, qui télécharge et lit tout le
 *   fichier, jamais à l'ouverture de l'app) s'il est à relire (aRelire), sauf pendant une lecture ou un import ;
 * - `importer(allumer)`, l'appui sur « Importer mon historique » : un seul import à la fois, par une garde posée avant tout
 *   `await` (un second appui reçu avant le rendu suivant ne lance rien, null), puis celle de lancerImport ; une lecture en
 *   cours écartée ; l'écran gardé allumé (`allumer`) jusqu'à l'issue ; l'avancée suivie à chaque lot ; puis le suivi de
 *   l'issue (suiviApres). Rend l'issue (BilanImport) dès qu'elle est connue : l'onglet se relit ensuite comme après une
 *   collecte qui ajoute des parties. Avec Pro, lancerImport garde l'import en vie de l'appui à son issue (entrée 6), cette
 *   relecture restant hors du maintien ;
 * - `relireEtat`, après une écriture refusée, l'onglet déjà mis à jour : l'état relu (interrompu, ou prêt si le lancement
 *   n'a pas été gardé), sans tenir l'onglet ni le bilan pendant cette lecture.
 * Seule la dernière lecture lancée compte : une lecture plus ancienne, ou écartée par un appui, ne change rien.
 */
export function useHistoriqueAvant() {
  const [suivi, setSuivi] = useState<SuiviImport>(SUIVI_NEUF)
  // Garde de l'appui : lue et posée avant tout `await`, elle ne dépend pas d'un rendu.
  const occupe = useRef(false)
  // Numéro de la dernière lecture de l'état lancée ; un appui l'avance, pour écarter celle en cours.
  const derniere = useRef(0)
  // Une lecture de l'état en cours, sue sans attendre un rendu : deux ouvertures rapprochées n'en lancent qu'une.
  const lit = useRef(false)

  /** Lit l'état de l'import (etatDeLImport ne lève jamais) ; seule la dernière lecture lancée le garde. */
  const lire = async () => {
    const n = ++derniere.current
    lit.current = true
    setSuivi((s) => ({ ...s, lecture: true }))
    const etat = await etatDeLImport()
    if (n !== derniere.current) return
    lit.current = false
    setSuivi((s) => ({ ...s, etat, lecture: false }))
  }

  const surOuverture = () => {
    if (occupe.current || lit.current || !aRelire(suivi.etat)) return
    lire()
  }

  const importer = async (allumer: (oui: boolean) => void): Promise<BilanImport | null> => {
    if (occupe.current) return null
    occupe.current = true
    derniere.current++
    lit.current = false
    setSuivi((s) => ({ ...s, enCours: true, lecture: false, avancee: null, arret: null, bilan: null }))
    allumer(true)
    let bilan: BilanImport
    try {
      bilan = await lancerImport((ajoutees, parties) => setSuivi((s) => ({ ...s, avancee: { ajoutees, parties } })))
    } catch {
      // Jamais (lancerImport ne lève pas) : rien d'écrit qu'on sache, l'état relu à l'ouverture suivante.
      bilan = { issue: "rienEcrit", etat: { etat: "indisponible", cause: "lecture" } }
    } finally {
      allumer(false)
    }
    occupe.current = false
    setSuivi((s) => suiviApres(s, bilan, Date.now()))
    return bilan
  }

  const relireEtat = () => {
    if (occupe.current) return
    lire()
  }

  return { suivi, surOuverture, importer, relireEtat }
}

/**
 * Section « Ton historique d'avant » (EXPERIENCE.md, State Patterns, import ; maquette Reglages-stats) : son étiquette,
 * annoncée comme en-tête ; la phrase de l'état, en `corps` `texte-doux`, l'indicateur d'activité devant elle pendant une
 * lecture, trait `updatesFrequently` (VoiceOver la relit quand elle change sous son focus : l'avancée à chaque lot, l'état
 * après une lecture) ; le Bouton principal « Importer mon historique » s'il y en a un, inactif, avec son indicateur, sa
 * valeur VoiceOver (« Import lancé », puis le bilan) ; la raison d'un bouton inactif dessous, en `petit` `texte-discret`,
 * centrée ; la note de la maquette, en `note` `texte-discret` ; le message d'un appui qui n'a pas abouti, en `orange`.
 * Aucune lecture ici : tout vient de `vue` ; l'appui, de l'onglet.
 */
function HistoriqueAvant({ vue, onImporter, c }: { vue: VueHistoriqueAvant; onImporter: () => void; c: Palette }) {
  const { bouton } = vue
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_HISTORIQUE_AVANT}
      </Text>
      <HStack spacing={ESPACES.puces}>
        {vue.lecture ? (
          <ProgressView progressViewStyle="circular" controlSize="small" tint={c.texteDoux} accessibilityHidden />
        ) : null}
        <Text {...TYPO.corps} foregroundStyle={c.texteDoux} accessibilityAddTraits="updatesFrequently">
          {vue.phrase}
        </Text>
      </HStack>
      {bouton ? (
        <BoutonPrincipal
          libelle={BOUTON_IMPORT}
          action={onImporter}
          inactif={bouton.inactif}
          enCours={bouton.enCours}
          valeurAccessibilite={bouton.valeur}
          valeurSuivie
        />
      ) : null}
      {bouton && bouton.raison ? (
        <Text {...TYPO.petit} foregroundStyle={c.texteDiscret} multilineTextAlignment="center" frame={{ maxWidth: "infinity" }}>
          {bouton.raison}
        </Text>
      ) : null}
      {vue.note ? (
        <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
          {NOTE_IMPORT}
        </Text>
      ) : null}
      {vue.message ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {vue.message}
        </Text>
      ) : null}
    </VStack>
  )
}






function EnTeteFeuille({ c, onFermer }: { c: Palette; onFermer: () => void }) {
  return (
    <HStack>
      <Text
        {...policeCondensee(TYPO.titreBloc)}
        foregroundStyle={c.texte}
        accessibilityAddTraits="isHeader"
      >
        Réglages
      </Text>
      <Spacer />
      <BoutonFermer action={onFermer} />
    </HStack>
  )
}

/**
 * Ticket 4.51 : section Clé HenrikDev, avec son état (champ, présence de la clé, refus) : `refusee`, ouverte sur un « Coller
 * ma clé » que le trousseau a refusé (étape 2 du Premier lancement) : le message de refus d'emblée, comme après son propre
 * « Coller ». La présence de la clé est lue au trousseau à chaque montage, puis relue après chaque écriture.
 */
function SectionCle({ c, refusee }: { c: Palette; refusee: boolean }) {
  const [saisie, setSaisie] = useState("")
  const [rangee, setRangee] = useState<boolean>(() => aUneCle())
  const [refus, setRefus] = useState<string | null>(() => (refusee ? REFUS_RANGER : null))

  /** Range la clé de `texte` ; vrai si le trousseau la porte. Refusée : le message, et rien d'autre ne change. */
  const ranger = (texte: string): boolean => {
    const ok = rangerCle(texte)
    setRangee(aUneCle())
    setRefus(ok ? null : REFUS_RANGER)
    return ok
  }

  /** Validation du champ (touche Entrée) : vide ou blanc, rien ne change ; rangée, le champ se vide. */
  const valider = () => {
    if (!normaliserCle(saisie)) return
    if (ranger(saisie)) setSaisie("")
  }

  /**
   * « Coller » (cle.ts) : reprend le presse-papiers ; rangée, le champ masqué la porte ; refusée, le message ; vide,
   * blanc ou illisible, rien ne change.
   */
  const coller = async () => {
    const collage = await collerCle()
    if (collage.issue === "vide") return
    setRangee(aUneCle())
    setRefus(collage.issue === "rangee" ? null : REFUS_RANGER)
    if (collage.issue === "rangee") setSaisie(collage.cle)
  }

  /** « Retirer la clé » : retirée, le champ se vide ; refusé, le message, et la clé reste. */
  const retirer = () => {
    const ok = retirerCle()
    if (ok) setSaisie("")
    setRangee(aUneCle())
    setRefus(ok ? null : REFUS_RETIRER)
  }

  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text
        {...policeCondensee(TYPO.etiquette)}
        foregroundStyle={c.texteDiscret}
        accessibilityAddTraits="isHeader"
      >
        Clé HenrikDev
      </Text>
      <HStack spacing={ESPACES.dansBloc}>
        <SecureField
          title="Clé HenrikDev"
          prompt="HDEV-…"
          value={saisie}
          onChanged={setSaisie}
          onSubmit={valider}
          textFieldStyle="roundedBorder"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          foregroundStyle={c.texte}
          frame={{ maxWidth: "infinity", minHeight: ESPACES.cible }}
        />
        <BoutonSysteme libelle="Coller" action={coller} />
      </HStack>
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {rangee ? NOTE_RANGEE : NOTE_SANS_CLE}
      </Text>
      {refus ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {refus}
        </Text>
      ) : null}
      {rangee ? <BoutonSysteme libelle="Retirer la clé" action={retirer} /> : null}
      <Link url={LIEN_CLE}>
        <Text
          {...TYPO.ligne}
          foregroundStyle={c.texteDoux}
          frame={{ minHeight: ESPACES.cible, alignment: "leading" }}
          contentShape="rect"
        >
          Obtenir une clé gratuite
        </Text>
      </Link>
    </VStack>
  )
}

/** Où changer de compte : dit dans le groupe « Ton compte » (les deux boutons restent en bas de l'onglet Boutique). */
export const NOTE_COMPTE = "Pour changer de compte ou te déconnecter : tout en bas de l'onglet Boutique."

/** Ticket 4.51 : section Ton compte : une phrase, le seul endroit où s'écrit le Riot ID. */
function SectionCompte({ c, meta }: { c: Palette; meta: EtatEcran["meta"] }) {
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      { }
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {phraseCompte(meta)}
      </Text>
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {NOTE_COMPTE}
      </Text>
    </VStack>
  )
}

/** Ticket 4.51 : section Collecte : deux Chiffres, côte à côte, l'un sous l'autre aux tailles d'accessibilité (`grand`), puis la note. */
function SectionCollecte({ c, grand, meta, parties, maintenant }: {
  c: Palette; grand: boolean; meta: EtatEcran["meta"]; parties: number; maintenant: number
}) {
  const [derniere, rythme] = chiffresCollecte(meta, parties, maintenant)
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text
        {...policeCondensee(TYPO.etiquette)}
        foregroundStyle={c.texteDiscret}
        accessibilityAddTraits="isHeader"
      >
        Collecte
      </Text>
      {grand ? (
        <VStack alignment="leading" spacing={ESPACES.grille}>
          <Chiffre {...derniere} />
          <Chiffre {...rythme} />
        </VStack>
      ) : (
        <HStack alignment="top" spacing={ESPACES.grille} fixedSize={{ horizontal: false, vertical: true }}>
          <Chiffre {...derniere} />
          <Chiffre {...rythme} />
        </HStack>
      )}
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {NOTE_COLLECTE}
      </Text>
    </VStack>
  )
}

/**
 * Ticket 8.9 de epic-boutique-visuels : section Prix du catalogue : son étiquette, annoncée comme en-tête ; le nombre de skins
 * à prix sur le total et par source (boutique, retenus, HenrikDev, référence), puis le dernier contrôle HenrikDev en clair,
 * s'il a eu lieu ou si la clé est refusée (prix-retenus.ts, lignesPrixCatalogue), tirés de etat-prix.json, que la lecture de la boutique écrit ; lu une fois, à
 * l'ouverture de la feuille (absent ou illisible : « Après la prochaine lecture de la boutique. »). Sans le journal ; ni
 * requête, ni écriture.
 */
function SectionPrixCatalogue({ c }: { c: Palette }) {
  const [lignes] = useState<string[]>(() => {
    let contenu: string | null = null
    try {
      contenu = FileManager.existsSync(ETAT_PRIX_FILE) ? FileManager.readAsStringSync(ETAT_PRIX_FILE) : null
    } catch { /* illisible : comme absent */ }
    return lignesPrixCatalogue(lireEtatPrix(contenu))
  })
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        Prix du catalogue
      </Text>
      {lignes.map((l, i) => (
        <Text key={`prix-${i}`} {...(i === 0 ? TYPO.corps : TYPO.note)} foregroundStyle={i === 0 ? c.texteDoux : c.texteDiscret}>
          {l}
        </Text>
      ))}
    </VStack>
  )
}

/** Textes de la section « Widgets » de la feuille. */
export const TITRE_WIDGETS = "Widgets"
export const BOUTON_WIDGETS = "Mes widgets"
export const NOTE_WIDGETS = "Choisis ce que montre chaque widget de ton écran d'accueil."






function SectionWidgets({ c, onOuvrir }: { c: Palette; onOuvrir: () => void }) {
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_WIDGETS}
      </Text>
      <BoutonSecondaire libelle={BOUTON_WIDGETS} action={onOuvrir} />
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {NOTE_WIDGETS}
      </Text>
    </VStack>
  )
}

/**
 * Epic-installation-ami, entrée 3 : section Partager ValShop (maquette Reglages-stats) : son étiquette, annoncée comme en-tête ;
 * le Bouton secondaire « Envoyer le lien d'installation », qui passe le seul lien d'installation (partage.ts, fait à l'appui) à
 * la feuille de partage d'iOS ; la note de la maquette, en `corps` `texte-doux`. Un seul partage à la fois (garde posée avant
 * tout `await`) ; la feuille refusée par iOS : REFUS_PARTAGE en orange, ajouté à l'arbre, retiré au prochain appui. Ni
 * requête, ni fichier, ni trousseau, ni journal : le lien ne porte que l'adresse publique du dépôt.
 */
function SectionPartage({ c }: { c: Palette }) {
  const ouverte = useRef(false)
  const [refus, setRefus] = useState(false)
  const partager = async () => {
    if (ouverte.current) return
    ouverte.current = true
    setRefus(false)
    try {
      await ShareSheet.present([lienInstallation()])
    } catch {
      setRefus(true)
    } finally {
      ouverte.current = false
    }
  }
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_PARTAGE}
      </Text>
      <BoutonSecondaire libelle={BOUTON_PARTAGE} action={partager} />
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {NOTE_PARTAGE}
      </Text>
      {refus ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {REFUS_PARTAGE}
        </Text>
      ) : null}
    </VStack>
  )
}

/**
 * Epic-installation-ami, entrée 4 : section Nouvelle version, présente seulement quand une version plus récente que celle
 * installée est sue : son étiquette, annoncée comme en-tête ; la phrase (versions publiée et installée) et chaque note, en
 * `corps` `texte-doux` ; le Bouton secondaire « Mettre à jour ValShop », qui ouvre le lien d'import du dépôt
 * (Script.createImportScriptsURLScheme) : Scripting importe la nouvelle version ; la note, en `note` `texte-discret`. Le lien
 * pas ouvert : REFUS_MISE_A_JOUR en orange, ajouté à l'arbre, retiré au prochain appui. Aucune requête ici.
 */
function SectionMiseAJour({ c, v }: { c: Palette; v: NouvelleVersion }) {
  const [refus, setRefus] = useState(false)
  const ouvrir = async () => {
    setRefus(false)
    let ok = false
    try {
      ok = await Safari.openURL(Script.createImportScriptsURLScheme([DEPOT_VALSHOP]))
    } catch {
      ok = false
    }
    if (!ok) setRefus(true)
  }
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_MISE_A_JOUR}
      </Text>
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {phraseMiseAJour(v)}
      </Text>
      {v.notes.map((n, i) => (
        <Text key={`note-${i}`} {...TYPO.corps} foregroundStyle={c.texteDoux}>
          {`– ${n}`}
        </Text>
      ))}
      <BoutonSecondaire libelle={BOUTON_MISE_A_JOUR} action={ouvrir} />
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {NOTE_MISE_A_JOUR}
      </Text>
      {refus ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {REFUS_MISE_A_JOUR}
        </Text>
      ) : null}
    </VStack>
  )
}

/**
 * Epic-installation-ami, entrée 7 : section À propos, en dernier : son étiquette, annoncée comme en-tête ; la version installée
 * (Script.metadata, lue sans requête), en `corps` `texte-doux`, si elle se lit ; la mention de Riot Games (partage.ts), en
 * `note` `texte-discret`. Rien d'autre : ni lien, ni requête.
 */
function SectionAPropos({ c }: { c: Palette }) {
  let version: string | null = null
  try { version = ligneVersion(Script.metadata?.version) } catch { /* métadonnées illisibles : pas de ligne */ }
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_A_PROPOS}
      </Text>
      {version !== null ? (
        <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
          {version}
        </Text>
      ) : null}
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {MENTION_RIOT}
      </Text>
    </VStack>
  )
}







export const TITRE_OUVERTURE = "Écran d'ouverture"
export const REFUS_OUVERTURE = "Réglage non gardé, réessaie."
export const NOTE_OUVERTURE = "L'onglet que ValShop montre quand tu l'ouvres. Ta vue des stats (mode et période) est gardée d'une fois sur l'autre."
const SEGMENTS_OUVERTURE = [{ cle: "boutique", libelle: "Boutique" }, { cle: "stats", libelle: "Stats" }] as const

function SectionOuverture({ c }: { c: Palette }) {
  const [ouverture, setOuverture] = useState<Ouverture>(() => preferencesGardees().ouverture)
  const [refus, setRefus] = useState(false)
  /** Écriture refusée : le choix ne change pas, et c'est dit. */
  const choisir = (o: Ouverture) => {
    const ok = garderPreferences({ ouverture: o })
    setRefus(!ok)
    if (ok) setOuverture(o)
  }
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_OUVERTURE}
      </Text>
      <SelecteurSegmente segments={SEGMENTS_OUVERTURE} choisi={ouverture} onChoix={choisir} />
      {refus ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {REFUS_OUVERTURE}
        </Text>
      ) : null}
      <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
        {NOTE_OUVERTURE}
      </Text>
    </VStack>
  )
}

export const TITRE_ILE = "Île dynamique"
export const LIBELLE_ILE = "Quand un souhait est en boutique"
export const NOTE_ILE = "L'étoile et le compte à rebours du reset dans l'île dynamique. Elle se lance quand ValShop lit ta boutique, app ouverte."
export const REFUS_ILE = "Réglage non gardé, réessaie."

function SectionIle({ c }: { c: Palette }) {
  const [allumee, setAllumee] = useState<boolean>(() => lireReglageGarde().ile === true)
  const [etat, setEtat] = useState<EtatIle>("eteinte")
  const [refus, setRefus] = useState(false)
  /** Garde le choix dans widgets.json (relu à l'instant : « Mes widgets » a pu changer le reste), puis lance ou arrête l'île. */
  const basculer = (oui: boolean) => {
    try {
      ecrireReglage(choisirIle(lireReglageGarde(), oui))
    } catch {
      setRefus(true)
      return
    }
    setRefus(false)
    setAllumee(oui)
    try { Widget.reloadAll() } catch { /* les widgets se rechargeront seuls */ }
    if (oui) assurerIle().then(setEtat).catch(() => { /* rien à dire */ })
    else {
      setEtat("eteinte")
      arreterIle().catch(() => { /* iOS la retirera de lui-même */ })
    }
  }
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc}>
      <Text {...policeCondensee(TYPO.etiquette)} foregroundStyle={c.texteDiscret} accessibilityAddTraits="isHeader">
        {TITRE_ILE}
      </Text>
      <Toggle title={LIBELLE_ILE} value={allumee} onChanged={basculer} tint={c.vert} foregroundStyle={c.texte} />
      {allumee && PHRASES_ILE[etat] !== "" ? (
        <Text {...TYPO.corps} foregroundStyle={etat === "refusee" || etat === "echec" ? c.orange : c.texteDoux}>
          {PHRASES_ILE[etat]}
        </Text>
      ) : null}
      {refus ? (
        <Text {...TYPO.corps} foregroundStyle={c.orange}>
          {REFUS_ILE}
        </Text>
      ) : null}
      <Text {...TYPO.note} foregroundStyle={c.texteDiscret}>
        {NOTE_ILE}
      </Text>
    </VStack>
  )
}

/** Les titres des groupes de la feuille, dans l'ordre. */
export const GROUPES = { nouvelle: "À faire", compte: "Ton compte", stats: "Stats", affichage: "Affichage", boutique: "Boutique", valshop: "ValShop" } as const

/**
 * Un groupe de la feuille : son titre (le trait d'accent penché, puis le titre en titre de bloc), et une carte `surface`
 * portant ses sections, un filet `bordure` entre deux. `teinte` : la carte teintée (rouge : ce qui est à faire).
 */
function Groupe({ c, titre, teinte, children }: { c: Palette; titre: string; teinte?: Color; children: (VirtualNode | null | false)[] | VirtualNode }) {
  const sections = (Array.isArray(children) ? children : [children]).filter((x): x is VirtualNode => !!x)
  if (sections.length === 0) return <EmptyView />
  return (
    <VStack alignment="leading" spacing={ESPACES.dansBloc} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={8}>
        <RoundedRectangle cornerRadius={1} fill={teinte ?? c.rouge} frame={{ width: 5, height: 16 }} rotationEffect={14} accessibilityHidden />
        <Text {...policeCondensee(TYPO.titreBloc)} foregroundStyle={c.texte} accessibilityAddTraits="isHeader">
          {titre}
        </Text>
      </HStack>
      <VStack
        alignment="leading"
        spacing={ESPACES.bloc}
        padding={ESPACES.bloc}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
        background={{ style: teinte ? melange(teinte as string, c.surface as string, 0.18) : c.surface, shape: { type: "rect", cornerRadius: ARRONDIS.bloc } }}
      >
        {sections.flatMap((s, i) => (i === 0 ? [s] : [<Rectangle key={`filet-${i}`} fill={c.bordure} frame={{ height: 1 }} accessibilityHidden />, s]))}
      </VStack>
    </VStack>
  )
}

/** Entrée 4 : la version plus récente sue, suivie : une annonce arrivée feuille ouverte la montre aussitôt. */
export function useNouvelleVersion(): NouvelleVersion | null {
  const [v, setV] = useState<NouvelleVersion | null>(() => nouvelleVersionConnue())
  useEffect(() => ecouterNouvelleVersion(() => setV(nouvelleVersionConnue())), [])
  return v
}



















export function FeuilleReglages({ onFermer, refusee = false, ecran, maintenant, historique, onImporter }: {
  onFermer: () => void; refusee?: boolean; ecran: EtatEcran; maintenant: number; historique: VueHistoriqueAvant | null; onImporter: () => void
}) {
  const nouvelle = useNouvelleVersion()
  const [widgets, setWidgets] = useState({ montes: false, pousses: false })
  const ouvrirWidgets = useRef(() => setWidgets({ montes: true, pousses: true })).current
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        return (
          <NavigationStack>
          <ScrollView
            preferredColorScheme="dark"
            presentationDetents={["medium", "large"]}
            presentationBackground={c.fond}
            navigationTitle="Réglages"
            navigationBarVisibility="hidden"
            navigationDestination={{
              isPresented: widgets.pousses,
              onChanged: (pousses: boolean) => setWidgets((w) => ({ montes: w.montes, pousses })),
              content: widgets.montes ? <MesWidgets /> : <EmptyView />,
            }}
          >
            <VStack
              alignment="leading"
              spacing={ESPACES.entreBlocs}
              frame={{ maxWidth: "infinity", alignment: "leading" }}
              padding={{ top: ESPACES.hautPage, horizontal: ESPACES.margePage, bottom: ESPACES.basPage }}
            >
              <EnTeteFeuille c={c} onFermer={onFermer} />
              {nouvelle !== null ? (
                <Groupe c={c} titre={GROUPES.nouvelle} teinte={c.rouge}>
                  <SectionMiseAJour key={`maj-${nouvelle.version}`} c={c} v={nouvelle} />
                </Groupe>
              ) : null}
              <Groupe c={c} titre={GROUPES.compte}>
                <SectionCompte c={c} meta={ecran.meta} />
              </Groupe>
              {/* « Stats » juste sous le compte : la Clé HenrikDev reste près du haut de la feuille, qui s'ouvre à mi-hauteur
                  (« Coller ma clé » du premier lancement l'ouvre pour ce champ et son message de refus). */}
              <Groupe c={c} titre={GROUPES.stats}>
                <SectionCle c={c} refusee={refusee} />
                <SectionCollecte c={c} grand={tailleAccessibilite(env.dynamicTypeSize)} meta={ecran.meta} parties={ecran.parties} maintenant={maintenant} />
                {historique !== null ? <HistoriqueAvant vue={historique} onImporter={onImporter} c={c} /> : null}
              </Groupe>
              <Groupe c={c} titre={GROUPES.affichage}>
                <SectionWidgets c={c} onOuvrir={ouvrirWidgets} />
                <SectionIle c={c} />
                <SectionOuverture c={c} />
              </Groupe>
              <Groupe c={c} titre={GROUPES.boutique}>
                <SectionPrixCatalogue c={c} />
              </Groupe>
              <Groupe c={c} titre={GROUPES.valshop}>
                <SectionPartage c={c} />
                <SectionAPropos c={c} />
              </Groupe>
            </VStack>
          </ScrollView>
          </NavigationStack>
        )
      }}
    </EnvironmentValuesReader>
  )
}
