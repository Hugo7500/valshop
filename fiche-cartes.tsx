import { Button, HStack, Image, Rectangle, Spacer, Text, VStack, ZStack, gradient, type Color, type VirtualNode } from "scripting"
import { C, mix } from "./widgets-briques"





/** Les couleurs de l'app dont ces pièces ont besoin (un sous-ensemble de la Palette de design.tsx). */
export type TeintesFiche = { fond: Color; surface: Color; surfaceHaute: Color; texte: Color; texteDoux: Color; texteDiscret: Color; or: Color }

/** Le fond d'une rangée de fiche : la surface de l'app, à la place du gris des listes d'iOS. */
export function fondRangee(t: TeintesFiche): VirtualNode {
  return <Rectangle fill={t.surface} />
}

/**
 * L'en-tête d'une fiche : l'image sur une carte à lueur (celle de la rareté si elle est sue, sinon neutre), puis le petit
 * intitulé (l'arme, le type) et le nom en très gros. `image` : la vue de l'image, que la fiche charge et remplace elle-même.
 * VoiceOver lit l'intitulé, puis le nom, annoncé comme un titre.
 */
export function EnTeteFiche({ t, image, nom, intitule, couleur, hauteur }: {
  /** `image` null : pas de carte (un titre de joueur n'a pas d'image), l'intitulé et le nom seuls. */
  t: TeintesFiche; image: VirtualNode | null; nom: string; intitule?: string | null; couleur?: string | null; hauteur?: number
}) {
  const h = hauteur ?? 220
  const forme = { type: "rect" as const, cornerRadius: 22 }
  return (
    <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {image === null ? null : <ZStack
        frame={{ maxWidth: "infinity", height: h }}
        background={{ style: gradient("radial", { colors: [mix(couleur ?? "#4a5a70", couleur ? 0.74 : 0.6), "#11151b"], center: "top", startRadius: 0, endRadius: h * 1.25 }), shape: forme }}
        clipShape={forme}
      >
        <VStack padding={16}>{image}</VStack>
      </ZStack>}
      <VStack alignment="leading" spacing={2}>
        {intitule ? (
          <Text font="caption" fontWeight="bold" kerning={1.4} textCase="uppercase" foregroundStyle={(couleur ?? t.texteDiscret) as Color}>{intitule}</Text>
        ) : null}
        <Text font="largeTitle" fontWeight="heavy" fontWidth="condensed" kerning={0.6} textCase="uppercase" foregroundStyle={t.texte} accessibilityAddTraits="isHeader">
          {nom}
        </Text>
      </VStack>
    </VStack>
  )
}

/** Le bouton de la liste de souhaits : une étoile et son libellé, en or ; pleine quand le skin y est déjà. */
export function BoutonSouhait({ dedans, libelle, onAppui }: { dedans: boolean; libelle: string; onAppui: () => void }) {
  return (
    <Button buttonStyle="plain" action={onAppui}>
      <HStack spacing={8} frame={{ maxWidth: "infinity", minHeight: 44 }} contentShape="rect">
        <Image systemName={dedans ? "star.fill" : "star"} font={17} foregroundStyle={C.or} accessibilityHidden />
        <Text font="headline" fontWeight="bold" fontWidth="condensed" kerning={1} textCase="uppercase" foregroundStyle={C.or}>{libelle}</Text>
        <Spacer />
      </HStack>
    </Button>
  )
}
