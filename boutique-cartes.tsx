import { Button, HStack, Image, Rectangle, RoundedRectangle, ScrollView, Spacer, Text, VStack, ZStack, gradient, type Color, type VirtualNode } from "scripting"
import { C, Din, Etiquette, ImageFichier, Pastille, mille, mix } from "./widgets-briques"







/** Les couleurs de l'app dont les cartes ont besoin (un sous-ensemble de la Palette de design.tsx). */
export type Teintes = {
  fond: Color; surface: Color; surfaceHaute: Color; bordure: Color; texte: Color; texteDoux: Color; texteDiscret: Color
  rouge: Color; or: Color; vert: Color
}
/** Une offre telle qu'une carte la montre ; `barre` : prix d'avant la remise ; `remise` : pourcentage (Night Market). */
export type OffreVue = {
  cle: string; nom: string; arme: string; prix: number | null; icone: string | null; couleur: string | null
  barre?: number | null; remise?: number | null; souhait?: boolean; voix: string; onAppui: () => void
}

export type AccessoireVu = { cle: string; nom: string; type: string; fin?: string; prix: number | null; icone: string | null; voix: string; onAppui: () => void }
export type BundleVu = { cle: string; nom: string; prix: number | null; barre: number | null; fin: string; image: string | null; voix: string; onAppui: () => void }

/** Marge de page et écart entre deux cartes, en points. */
export const MARGE_PAGE = 16
export const ECART = 10
const RAYON = 18

/** Une image gardée sur l'appareil (chemin) ou restée en adresse web : à la taille donnée, proportions gardées. */
function Visuel({ source, l, h, rotation, ombre, remplir }: { source: string; l: number; h: number; rotation?: number; ombre?: boolean; remplir?: boolean }) {
  if (!source.startsWith("http")) return <ImageFichier chemin={source} l={l} h={h} rotation={rotation} ombre={ombre} remplir={remplir} />
  return <Image imageUrl={source} resizable {...(remplir ? { scaleToFill: true } : { scaleToFit: true })} frame={{ width: l, height: h }} rotationEffect={rotation} />
}

/** Titre de section : le trait d'accent penché des widgets, le titre en capitales étroites, un texte discret à droite. */
export function TitreSection({ t, titre, droite, accent }: { t: Teintes; titre: string; droite?: string | null; accent?: Color }) {
  return (
    <HStack spacing={8} padding={{ top: 8 }}>
      <RoundedRectangle cornerRadius={1} fill={accent ?? t.rouge} frame={{ width: 5, height: 16 }} rotationEffect={14} accessibilityHidden />
      <Text font="title3" fontWeight="heavy" fontWidth="condensed" kerning={1} textCase="uppercase" foregroundStyle={t.texte} accessibilityAddTraits="isHeader">
        {titre}
      </Text>
      <Spacer />
      {droite ? <Text font="footnote" foregroundStyle={t.texteDiscret}>{droite}</Text> : null}
    </HStack>
  )
}

/** Une carte de l'app : surface arrondie, marge de 16. */
export function Carte({ t, children, teinte }: { t: Teintes; children?: VirtualNode | (VirtualNode | null | false)[]; teinte?: string }) {
  const fond = teinte
    ? gradient("linear", { colors: [mix(teinte, 0.26, t.surface as string), t.surface], startPoint: "topLeading", endPoint: "bottomTrailing" })
    : t.surface
  return (
    <VStack alignment="leading" spacing={12} padding={16} frame={{ maxWidth: "infinity", alignment: "leading" }} background={{ style: fond, shape: { type: "rect", cornerRadius: 20 } }}>
      {children}
    </VStack>
  )
}





export function EtatBoutique({ t, reset, lue, solde }: {
  t: Teintes; reset: string; lue: string; solde: { texte: string; date: string | null; voix: string } | null
}) {
  return (
    <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack alignment="bottom" spacing={12}>
        <VStack alignment="leading" spacing={2} accessibilityElement accessibilityLabel={`Reset, ${reset}`}>
          <Text font="caption2" fontWeight="bold" kerning={1.2} textCase="uppercase" foregroundStyle={t.texteDiscret}>Nouvelle boutique</Text>
          <Text font="largeTitle" fontWeight="heavy" fontWidth="condensed" textCase="uppercase" monospacedDigit foregroundStyle={t.texte} lineLimit={1} minScaleFactor={0.6}>
            {reset}
          </Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2} accessibilityElement accessibilityLabel={`Dernière lecture, ${lue}`}>
          <Text font="caption2" fontWeight="bold" kerning={1.2} textCase="uppercase" foregroundStyle={t.texteDiscret}>Lue le</Text>
          <Text font="footnote" fontWeight="semibold" monospacedDigit foregroundStyle={t.texteDoux}>{lue}</Text>
        </VStack>
      </HStack>
      {solde !== null ? (
        <VStack alignment="leading" spacing={2} padding={{ top: 12 }} frame={{ maxWidth: "infinity", alignment: "leading" }}
          background={<VStack spacing={0}><Rectangle fill={t.bordure} frame={{ height: 1 }} /><Spacer /></VStack>}
          accessibilityElement accessibilityLabel={solde.voix}>
          <Text font="caption2" fontWeight="bold" kerning={1.2} textCase="uppercase" foregroundStyle={t.texteDiscret}>Solde</Text>
          <Text font="subheadline" fontWeight="semibold" monospacedDigit foregroundStyle={t.texte} fixedSize={{ horizontal: false, vertical: true }}>{solde.texte}</Text>
          {solde.date !== null ? <Text font="caption" foregroundStyle={t.texteDiscret}>{solde.date}</Text> : null}
        </VStack>
      ) : null}
    </VStack>
  )
}

/** Le prix d'une offre : l'icône de la monnaie si elle est gardée, le montant, le prix d'avant barré. */
function PrixOffre({ prix, barre, monnaie, unite }: { prix: number | null; barre?: number | null; monnaie: string | null; unite?: string }) {
  return (
    <HStack spacing={5} padding={{ horizontal: 9 }} frame={{ height: 24 }} background={{ style: "rgba(255,255,255,0.1)", shape: "capsule" }}>
      {monnaie ? <ImageFichier chemin={monnaie} l={12} h={12} /> : null}
      <Din t={prix == null ? "—" : mille(prix)} s={17} />
      {unite && !monnaie ? <Etiquette t={unite} s={8} /> : null}
      {barre != null && barre !== prix ? (
        <Text font={{ name: "DINCondensed-Bold", size: 13 }} foregroundStyle="rgba(255,255,255,0.45)" strikethrough="rgba(255,255,255,0.45)" lineLimit={1}>{mille(barre)}</Text>
      ) : null}
    </HStack>
  )
}

/**
 * La carte d'une offre : l'arme en grand et en biais sur la lueur de sa rareté, un voile en bas pour le texte, le type d'arme,
 * le nom, le prix, le trait de rareté ; la remise du Night Market en haut à gauche, l'étoile d'un souhait en haut à droite.
 */
export function CarteOffre({ o, l, h, monnaie }: { o: OffreVue; l: number; h: number; monnaie: string | null }) {
  const li = l * 1.12
  const forme = { type: "rect" as const, cornerRadius: RAYON }
  return (
    <Button buttonStyle="plain" action={o.onAppui} accessibilityLabel={o.voix}>
      <ZStack
        frame={{ width: l, height: h }}
        background={{ style: gradient("radial", { colors: [mix(o.couleur, 0.74), "#11151b"], center: "top", startRadius: 0, endRadius: h * 0.9 }), shape: forme }}
        clipShape={forme}
        contentShape="rect"
      >
        {o.icone ? (
          <ZStack frame={{ width: l, height: h }}>
            <Visuel source={o.icone} l={li} h={li / 2.8} rotation={-18} ombre />
          </ZStack>
        ) : null}
        <VStack spacing={0} frame={{ width: l, height: h }}>
          <Spacer />
          <Rectangle fill={gradient("linear", { colors: ["rgba(7,9,13,0)", "rgba(7,9,13,0.95)"], startPoint: "top", endPoint: "bottom" })} frame={{ width: l, height: h * 0.6 }} />
        </VStack>
        <VStack alignment="leading" spacing={3} padding={{ leading: 11, trailing: 8, bottom: 12 }} frame={{ width: l, height: h, alignment: "bottomLeading" }}>
          {o.arme !== "" ? <Etiquette t={o.arme} s={9.5} /> : null}
          <Din t={o.nom.toUpperCase()} s={25} />
          <PrixOffre prix={o.prix} barre={o.barre} monnaie={monnaie} />
        </VStack>
        <VStack spacing={0} frame={{ width: l, height: h }}>
          <Spacer />
          <Rectangle fill={(o.couleur ?? C.rouge) as Color} frame={{ width: l, height: 3 }} />
        </VStack>
        {o.remise != null ? (
          <VStack alignment="leading" padding={9} frame={{ width: l, height: h, alignment: "topLeading" }}>
            <ZStack padding={{ horizontal: 7, top: 4, bottom: 1 }} background={{ style: C.violet, shape: { type: "rect", cornerRadius: 8 } }}>
              <Din t={`−${o.remise} %`} s={15} />
            </ZStack>
          </VStack>
        ) : null}
        {o.souhait ? (
          <VStack alignment="trailing" padding={9} frame={{ width: l, height: h, alignment: "topTrailing" }}>
            <ZStack frame={{ width: 28, height: 28 }} background={{ style: "rgba(255,209,102,0.22)", shape: "circle" }}>
              <Image systemName="star.fill" font={13} foregroundStyle={C.or} />
            </ZStack>
          </VStack>
        ) : null}
      </ZStack>
    </Button>
  )
}

/** Les offres du jour, deux par rangée, sur toute la largeur de la page. */
export function GrilleOffres({ offres, largeur, monnaie }: { offres: OffreVue[]; largeur: number; monnaie: string | null }) {
  const l = Math.floor((largeur - ECART) / 2), h = Math.round(l * 0.84)
  const rangees: OffreVue[][] = []
  for (let i = 0; i < offres.length; i += 2) rangees.push(offres.slice(i, i + 2))
  return (
    <VStack alignment="leading" spacing={ECART}>
      {rangees.map((r) => (
        <HStack key={r[0].cle} spacing={ECART}>
          {r.map((o) => <CarteOffre key={o.cle} o={o} l={l} h={h} monnaie={monnaie} />)}
        </HStack>
      ))}
    </VStack>
  )
}

/** Une rangée qui défile de côté, d'un bord à l'autre de l'écran (les marges de la page sont rendues à ses deux bouts). */
export function Defilant({ children }: { children: VirtualNode[] }) {
  return (
    <ScrollView axes="horizontal" scrollIndicator="hidden" padding={{ horizontal: -MARGE_PAGE }}>
      <HStack spacing={ECART} padding={{ horizontal: MARGE_PAGE }}>{children}</HStack>
    </ScrollView>
  )
}

/** Un bundle : son image sur toute la carte, un voile à gauche pour le nom, le prix et l'échéance. */
export function CarteBundle({ b, l, monnaie }: { b: BundleVu; l: number; monnaie: string | null }) {
  const h = 170
  const forme = { type: "rect" as const, cornerRadius: 22 }
  return (
    <Button buttonStyle="plain" action={b.onAppui} accessibilityLabel={b.voix}>
      <ZStack frame={{ width: l, height: h }} background={{ style: "#141a22", shape: forme }} clipShape={forme} contentShape="rect">
        {b.image ? <ZStack frame={{ width: l, height: h }}><Visuel source={b.image} l={l} h={h} remplir /></ZStack> : null}
        <Rectangle fill={gradient("linear", { colors: ["rgba(9,11,16,0.95)", "rgba(9,11,16,0.5)", "rgba(9,11,16,0)"], startPoint: "leading", endPoint: "trailing" })} frame={{ width: l, height: h }} />
        <VStack alignment="leading" spacing={6} padding={16} frame={{ width: l, height: h, alignment: "bottomLeading" }}>
          <ZStack padding={{ horizontal: 8, top: 4, bottom: 1 }} background={{ style: C.rouge, shape: { type: "rect", cornerRadius: 7 } }}>
            <Din t="EN VEDETTE" s={12.5} k={1.4} />
          </ZStack>
          <Din t={b.nom.toUpperCase()} s={40} echelle={0.5} />
          <HStack spacing={8}>
            <PrixOffre prix={b.prix} barre={b.barre} monnaie={monnaie} />
            {b.fin !== "" ? <Text font="caption" foregroundStyle="rgba(255,255,255,0.75)">{b.fin}</Text> : null}
          </HStack>
        </VStack>
      </ZStack>
    </Button>
  )
}

/** Un accessoire de la semaine : son image (ou son nom en grand, pour un titre), son nom, son type, la fin de l'offre, son prix en KC. */
export function TuileAccessoire({ a, t, monnaie }: { a: AccessoireVu; t: Teintes; monnaie: string | null }) {
  const l = 124
  return (
    <Button buttonStyle="plain" action={a.onAppui} accessibilityLabel={a.voix}>
      <VStack spacing={6} padding={{ top: 10, bottom: 10, horizontal: 6 }} frame={{ width: l }} background={{ style: t.surface, shape: { type: "rect", cornerRadius: 16 } }} contentShape="rect">
        {a.icone ? <Visuel source={a.icone} l={56} h={56} /> : (
          <ZStack frame={{ width: l - 12, height: 56 }}><Din t={a.nom.toUpperCase()} s={19} echelle={0.5} /></ZStack>
        )}
        <VStack spacing={1} frame={{ width: l - 12 }}>
          <Text font="caption" fontWeight="semibold" foregroundStyle={t.texte} lineLimit={1} minScaleFactor={0.7}>{a.nom}</Text>
          <Etiquette t={a.type} s={8.5} />
          {a.fin ? <Text font="caption2" foregroundStyle={t.texteDiscret} lineLimit={1} minScaleFactor={0.7}>{a.fin}</Text> : null}
        </VStack>
        <PrixOffre prix={a.prix} monnaie={monnaie} unite="KC" />
      </VStack>
    </Button>
  )
}

/** Une tuile d'accès (« Tous les skins », « Mes souhaits ») : un titre en capitales étroites, une ligne discrète, une image ou une étoile. */
export function TuileAcces({ t, titre, sous, l, image, or, voix, indice, onAppui }: {
  t: Teintes; titre: string; sous: string; l: number; image?: string | null; or?: boolean; voix: string; indice?: string; onAppui: () => void
}) {
  const h = 104
  const forme = { type: "rect" as const, cornerRadius: 18 }
  const fond = or ? gradient("linear", { colors: [mix("#ffd166", 0.26, t.surface as string), t.surface], startPoint: "topLeading", endPoint: "bottomTrailing" }) : t.surface
  return (
    <Button buttonStyle="plain" action={onAppui} accessibilityLabel={voix} accessibilityHint={indice}>
      <ZStack frame={{ width: l, height: h }} background={{ style: fond, shape: forme }} clipShape={forme} contentShape="rect">
        {image ? (
          <ZStack frame={{ width: l, height: h }} opacity={0.5}>
            <Visuel source={image} l={l * 1.1} h={(l * 1.1) / 2.8} rotation={-24} />
          </ZStack>
        ) : null}
        {or ? (
          <VStack alignment="trailing" padding={10} frame={{ width: l, height: h, alignment: "topTrailing" }}>
            <Image systemName="star.fill" font={20} foregroundStyle={C.or} />
          </VStack>
        ) : null}
        <VStack alignment="leading" spacing={1} padding={12} frame={{ width: l, height: h, alignment: "bottomLeading" }}>
          <Text font="headline" fontWeight="heavy" fontWidth="condensed" kerning={0.8} textCase="uppercase" foregroundStyle={t.texte} lineLimit={2} minScaleFactor={0.7} multilineTextAlignment="leading">{titre}</Text>
          <Text font="caption2" foregroundStyle={t.texteDiscret} lineLimit={1} minScaleFactor={0.7}>{sous}</Text>
        </VStack>
      </ZStack>
    </Button>
  )
}

/** Le bandeau d'un souhait présent dans la boutique du jour : l'étoile, son nom, l'arme à droite. */
export function BandeauSouhait({ o, l }: { o: OffreVue; l: number }) {
  const forme = { type: "rect" as const, cornerRadius: 18 }
  return (
    <Button buttonStyle="plain" action={o.onAppui} accessibilityLabel={`Ton souhait est en boutique : ${o.voix}`}>
      <HStack spacing={12} padding={{ horizontal: 14 }} frame={{ width: l, height: 64 }} contentShape="rect"
        background={{ style: gradient("linear", { colors: ["rgba(255,209,102,0.26)", "rgba(255,209,102,0.07)"], startPoint: "leading", endPoint: "trailing" }), shape: forme }}>
        <Image systemName="star.fill" font={22} foregroundStyle={C.or} />
        <VStack alignment="leading" spacing={0}>
          <Din t={[o.nom, o.arme].filter((x) => x !== "").join(" ").toUpperCase()} s={21} echelle={0.6} />
          <Text font="caption" foregroundStyle="rgba(255,255,255,0.75)" lineLimit={1}>Ton souhait est en boutique</Text>
        </VStack>
        <Spacer />
        {o.icone ? <Visuel source={o.icone} l={96} h={34} rotation={-10} ombre /> : null}
      </HStack>
    </Button>
  )
}

/** Une pastille de solde reprise des widgets : pour l'atelier et les écrans qui montrent un montant seul. */
export { Pastille }
