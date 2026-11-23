import {
  HStack, Image, LiveActivity, LiveActivityUI, LiveActivityUIExpandedBottom, LiveActivityUIExpandedLeading, LiveActivityUIExpandedTrailing,
  Spacer, Text, TimerIntervalLabel, VStack, type Color, type LiveActivityUIBuilder,
} from "scripting"
import type { IleSouhait } from "./widgets-ile"
import { installerTraduction, langueDe } from "./langue"
import { preferencesGardees } from "./preferences"







const DIN = "DINCondensed-Bold"
const OR = "#ffd166" as Color
const BLANC = "#ffffff" as Color
const DOUX = "rgba(255,255,255,0.7)" as Color

/** Le compte à rebours jusqu'au reset, tenu par iOS ; `l` : sa largeur, pour qu'il ne prenne pas toute l'île. */
function Compte({ e, s, l }: { e: IleSouhait; s: number; l: number }) {
  return (
    <TimerIntervalLabel from={new Date(e.debut)} to={new Date(e.reset)} font={{ name: DIN, size: s }} foregroundStyle={BLANC}
      monospacedDigit multilineTextAlignment="trailing" frame={{ width: l }} />
  )
}

const Etoile = ({ s }: { s: number }) => <Text font={s} foregroundStyle={OR}>★</Text>

/** L'arme, en biais comme sur les widgets ; rien si son image n'est pas gardée. */
function Arme({ e, l }: { e: IleSouhait; l: number }) {
  if (e.icone === null) return <Etoile s={26} />
  return <Image filePath={e.icone} resizable scaleToFit frame={{ width: l, height: l / 2.8 }} rotationEffect={-12} />
}

/**
 * Le skin, son prix et l'heure du reset. Le titre dit jusqu'à quand : il reste vrai si l'activité est encore affichée après
 * le reset (rien ne la redessine alors, et le compte à rebours est à 0:00).
 */
function Textes({ e, grand }: { e: IleSouhait; grand: number }) {
  const suite = [e.prix !== null ? `${e.prix} VP` : "", e.autres > 0 ? `+ ${e.autres} ${e.autres > 1 ? "autres souhaits" : "autre souhait"}` : ""].filter((x) => x !== "").join(" · ")
  return (
    <VStack alignment="leading" spacing={1}>
      <Text font={10} fontWeight="semibold" foregroundStyle={OR} kerning={0.6} lineLimit={1} minScaleFactor={0.6}>{`★ EN BOUTIQUE JUSQU'À ${e.fin}`}</Text>
      <Text font={{ name: DIN, size: grand }} foregroundStyle={BLANC} lineLimit={1} minScaleFactor={0.6}>{e.nom.toUpperCase()}</Text>
      {suite !== "" ? <Text font={12} foregroundStyle={DOUX} lineLimit={1} minScaleFactor={0.7}>{suite}</Text> : null}
    </VStack>
  )
}

/** L'écran verrouillé (et la bannière des iPhone sans île) : l'arme, les textes, le compte à rebours. */
function Bandeau({ e }: { e: IleSouhait }) {
  return (
    <HStack spacing={12} padding={{ horizontal: 16, vertical: 14 }} activityBackgroundTint="rgba(12,14,20,0.86)" activitySystemActionForegroundColor={BLANC}>
      <Arme e={e} l={84} />
      <Textes e={e} grand={24} />
      <Spacer minLength={4} />
      <VStack alignment="trailing" spacing={0}>
        <Compte e={e} s={28} l={96} />
        <Text font={10} foregroundStyle={DOUX} lineLimit={1}>avant le reset</Text>
      </VStack>
    </HStack>
  )
}

const dessiner: LiveActivityUIBuilder<IleSouhait> = (e) => (
  <LiveActivityUI
    content={<Bandeau e={e} />}
    compactLeading={<Etoile s={15} />}
    compactTrailing={<Compte e={e} s={16} l={56} />}
    minimal={<Etoile s={14} />}>
    <LiveActivityUIExpandedLeading>
      <Arme e={e} l={72} />
    </LiveActivityUIExpandedLeading>
    <LiveActivityUIExpandedTrailing>
      <Compte e={e} s={24} l={84} />
    </LiveActivityUIExpandedTrailing>
    <LiveActivityUIExpandedBottom>
      <HStack spacing={0}>
        <Textes e={e} grand={26} />
        <Spacer minLength={0} />
      </HStack>
    </LiveActivityUIExpandedBottom>
  </LiveActivityUI>
)


try {
  const l = langueDe(preferencesGardees().langue, Device.systemLanguageCode)
  if (l === "en") installerTraduction(l).catch(() => { /* français */ })
} catch { /* français */ }

export const IleValShop = LiveActivity.register("ValShopSouhait", dessiner)
