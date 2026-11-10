import { Navigation, ScrollView, Text, VStack } from "scripting"
import { BoutonPrincipal, ESPACES, EnTete, TYPO, type Palette } from "./design"
import type { ChoixVue } from "./vue"

// Écran de connexion (EXPERIENCE.md, Information Architecture et State Patterns, Session
// Riot expirée) : ce que montre l'app (app.tsx) à son ouverture tant qu'etat.json dit la
// session Riot expirée, à la place des onglets, ni Stats ni Boutique derrière lui.
// L'En-tête ValShop et son Bouton Fermer, sans Barre d'onglets ; la phrase ; le Bouton
// principal « Me connecter ». Aucune requête, aucune lecture : l'écran ne fait que fermer
// l'app. Fermer la ferme sans rien rendre ; « Me connecter » la ferme en rendant
// « connexion » à index.tsx, qui fait alors une seule tentative de login (`refresh(true)`,
// garde-fou et verrou compris), hors de l'app, puis la rouvre.

/**
 * L'écran, sur le fond de l'app. En-tête ValShop à 20 du haut et 16 des côtés, puis à 12 la
 * phrase en `corps` `texte-doux`, et à 14 le Bouton principal, pleine largeur : VoiceOver
 * lit la phrase, puis « Me connecter, bouton ». Le tout défile au besoin ; l'En-tête reste
 * fixe aux tailles de texte ordinaires, et défile avec le reste dès la première taille
 * d'accessibilité (`defile` ; DESIGN.md, Layout & Spacing).
 */
export function EcranConnexion({ defile, palette }: { defile: boolean; palette: Palette }) {
  const fermer: (choix?: ChoixVue) => void = Navigation.useDismiss()
  const entete = (
    <VStack padding={{ top: ESPACES.hautPage, horizontal: ESPACES.margePage }}>
      <EnTete onFermer={() => fermer()} />
    </VStack>
  )
  return (
    <VStack spacing={0}>
      {defile ? null : entete}
      <ScrollView>
        <VStack spacing={0}>
          {defile ? entete : null}
          <VStack
            alignment="leading"
            spacing={ESPACES.entreBlocs}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
            padding={{ top: ESPACES.entete, horizontal: ESPACES.margePage, bottom: ESPACES.basPage }}
          >
            <Text {...TYPO.corps} foregroundStyle={palette.texteDoux}>
              Connecte-toi à ton compte Riot
            </Text>
            <BoutonPrincipal libelle="Me connecter" action={() => fermer("connexion")} />
          </VStack>
        </VStack>
      </ScrollView>
    </VStack>
  )
}
