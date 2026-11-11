import { HStack, Link, Navigation, Rectangle, Text, VStack } from "scripting"
import { createElement, Fragment } from "./rendu" // ticket 4.50 : JSX et crochets par le module intermédiaire
import { BoutonPrincipal, ESPACES, TYPO, policeCondensee, type Palette } from "./design"
import { LIEN_CLE } from "./cle"
import type { ChoixVue } from "./vue"

// Premier lancement (EXPERIENCE.md, Information Architecture, Component Patterns « Étape de
// démarrage », Flow 7 ; maquette Premier-lancement, sans ses chiffres d'exemple, ni sa carte
// « Facultatif », retirée à l'entrée 10 de epic-installation-ami : elle invitait à importer un historique tracker.gg, dont un
// nouvel utilisateur ne peut pas fabriquer le fichier) : ce que montre l'onglet Stats (app.tsx) à la place de sa rangée, de ses
// Bandeaux d'alerte et de sa phrase dès que la clé HenrikDev manque, à l'ouverture de l'app
// ou à la fermeture de la feuille « Réglages des stats », et, clé collée, jusqu'à l'appui sur
// l'étape 3. Bienvenue, puis trois Étapes de démarrage dans un ordre fixe : compte Riot, clé
// HenrikDev, première collecte ; la première qui n'est pas faite est en cours, seule à porter
// son Bouton principal, les suivantes à faire. Aucune lecture ni requête ici : l'onglet dit
// ce qui est fait, d'après le compte connu (etatEcran, collecte.ts) et la clé au trousseau
// (cle.ts). « Me connecter » ferme l'app en rendant « connexion » à index.tsx, qui fait une
// seule tentative de login (`refresh(true)`, garde-fou et verrou compris), hors de l'app,
// puis la rouvre, comme l'Écran de connexion ; « Coller ma clé » et « Récupérer mes parties »
// sont ceux de l'onglet. Blocs sans coins coupés (spike de `PathShape`).

/** État d'une Étape de démarrage, dit tel quel par VoiceOver. */
type EtatEtape = "faite" | "en cours" | "à faire"

/** Une Étape de démarrage : son titre, son texte, et le Bouton principal qu'elle porte quand elle est en cours. */
type Etape = { titre: string; texte: string; bouton: string; action: () => void }

/** Filet gauche d'une Étape de démarrage et côté minimal de son carré, en points. */
const FILET_ETAPE = 4
const CARRE_ETAPE = 32
/** ✓ ou numéro du carré : callout en 800 (16 à la taille par défaut), qui suit la taille du texte. */
const MARQUE_ETAPE = { font: "callout", fontWeight: "heavy" } as const












function CarteEtape({ numero, etat, etape, lien, c }: {
  numero: number; etat: EtatEtape; etape: Etape; lien: boolean; c: Palette
}) {
  const accent = etat === "faite" ? c.bleu : etat === "en cours" ? c.orange : c.bordure
  const aFaire = etat === "à faire"
  return (
    <VStack
      alignment="leading"
      spacing={ESPACES.dansBloc}
      padding={{ top: ESPACES.blocSerre, bottom: ESPACES.blocSerre, leading: FILET_ETAPE + ESPACES.blocSerre, trailing: ESPACES.blocSerre }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={
        <HStack spacing={0}>
          <Rectangle fill={accent} frame={{ width: FILET_ETAPE }} />
          <Rectangle fill={c.surface} />
        </HStack>
      }
    >
      <VStack
        alignment="leading"
        spacing={ESPACES.dansBloc}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
        accessibilityElement
        accessibilityLabel={`Étape ${numero} sur 3, ${etat}. ${etape.titre}. ${etape.texte}`}
      >
        <HStack spacing={ESPACES.dansBloc}>
          <Text
            {...MARQUE_ETAPE}
            foregroundStyle={aFaire ? c.texteDiscret : c.fond}
            frame={{ minWidth: CARRE_ETAPE, minHeight: CARRE_ETAPE }}
            background={aFaire ? <Rectangle stroke={c.bordure} /> : <Rectangle fill={accent} />}
          >
            {etat === "faite" ? "✓" : String(numero)}
          </Text>
          <Text {...policeCondensee({ ...TYPO.titreBloc, fontWeight: "bold" }, false)} foregroundStyle={c.texte}>
            {etape.titre}
          </Text>
        </HStack>
        <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
          {etape.texte}
        </Text>
      </VStack>
      {etat === "en cours" ? <BoutonPrincipal libelle={etape.bouton} action={etape.action} /> : null}
      {etat === "en cours" && lien ? (
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
      ) : null}
    </VStack>
  )
}

/**
 * Le Premier lancement, dans la page de l'onglet Stats : Bienvenue (bloc `surface`, titre en
 * `titre-section`, en capitales, annoncé comme en-tête, puis la phrase en `corps`
 * `texte-doux`), puis les trois Étapes de démarrage, 14 entre chaque bloc ; rien d'autre : aucune
 * mention de l'import tracker.gg (entrée 10 de epic-installation-ami). `compte` : un compte
 * Riot connu (étape 1 faite) ; `cle` : la clé au trousseau (étape 2 faite) ; l'étape 3 n'est
 * jamais faite ici, son appui quittant l'écran. `onColler`, `onRecuperer` : les Boutons
 * principaux des étapes 2 et 3 ; celui de l'étape 1 ferme l'app sur « connexion ».
 */
export function PremierLancement({ compte, cle, onColler, onRecuperer, palette: c }: {
  compte: boolean; cle: boolean; onColler: () => void; onRecuperer: () => void; palette: Palette
}) {
  const fermer: (choix?: ChoixVue) => void = Navigation.useDismiss()
  const etapes: Etape[] = [
    {
      titre: "Connecte ton compte Riot", texte: "Ta boutique du jour, chaque matin, dans le widget.",
      bouton: "Me connecter", action: () => fermer("connexion"),
    },
    {
      titre: "Colle ta clé HenrikDev", texte: "Gratuite, à créer sur le tableau de bord de HenrikDev. Elle reste dans ton trousseau.",
      bouton: "Coller ma clé", action: onColler,
    },
    {
      titre: "Récupère tes parties", texte: "Plusieurs minutes, l'app ouverte : toutes les parties que HenrikDev garde, tous modes.",
      bouton: "Récupérer mes parties", action: onRecuperer,
    },
  ]
  const faites = [compte, cle, false]
  const enCours = faites.indexOf(false)
  return (
    <VStack alignment="leading" spacing={ESPACES.entreBlocs} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack
        alignment="leading"
        spacing={ESPACES.dansBloc}
        padding={ESPACES.bloc}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
        background={c.surface}
      >
        <Text {...policeCondensee(TYPO.titreSection)} foregroundStyle={c.texte} accessibilityAddTraits="isHeader">
          Bienvenue
        </Text>
        <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>
          Trois étapes, et ta boutique et tes stats sont prêtes. Tout reste sur ton iPhone.
        </Text>
      </VStack>
      {etapes.map((etape, i) => (
        <CarteEtape
          key={etape.bouton}
          numero={i + 1}
          etat={faites[i] ? "faite" : i === enCours ? "en cours" : "à faire"}
          etape={etape}
          lien={i === 1}
          c={c}
        />
      ))}
    </VStack>
  )
}
