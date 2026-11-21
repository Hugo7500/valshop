import { AccessoryWidgetBackground, Capsule, Circle, HStack, RoundedRectangle, Spacer, Text, TimerIntervalLabel, VStack, ZStack, type Color, type VirtualNode } from "scripting"
import { DIN, Din, ImageFichier } from "./widgets-briques"
import type { Cadre, Donnees } from "./widgets-types"
import { SANS_BOUTIQUE, ligne, rectangle, rond, type RectVu, type RondVu } from "./widgets-verrou"








const BLANC = "#ffffff" as Color
const DOUX = "rgba(255,255,255,0.8)" as Color
const MOYEN = "rgba(255,255,255,0.5)" as Color
const FAIBLE = "rgba(255,255,255,0.28)" as Color

/** Une ligne de texte, sur une ligne, réduite plutôt que coupée. */
function Ecrit({ t, s, c }: { t: string; s: number; c?: Color }) {
  return <Text font={s} fontWeight="semibold" foregroundStyle={c ?? BLANC} lineLimit={1} minScaleFactor={0.7}>{t}</Text>
}

function Rect({ c, v }: { c: Cadre; v: RectVu }) {
  const liste = v.forme === "liste", vedette = v.forme === "vedette"
  // Un titre et quatre lignes (la boutique, session expirée) : plus petites, pour tenir dans la hauteur de la carte.
  const dense = !liste && v.lignes.length > 3
  // Sur un iPhone où le rectangle ne fait que 72 points de haut, un demi-point de moins pour que les quatre lignes tiennent.
  const s = dense ? (c.h < 74 ? 10 : 10.5) : c.h < 74 ? 12 : 12.5
  const bord = 9, haut = dense ? 4 : 5
  const l = c.l - 2 * bord
  const lettres = v.derniers ? v.derniers.join(" ") : null
  /** Un texte de ligne ; celui des derniers résultats : une lettre par partie, la victoire appuyée, le reste effacé. */
  const texte = (t: string, couleur?: Color) => t === lettres && v.derniers ? (
    <HStack spacing={5}>{v.derniers.map((x) => <Text font={s} fontWeight="heavy" foregroundStyle={x === "V" ? BLANC : MOYEN}>{x}</Text>)}</HStack>
  ) : <Ecrit t={t} s={s} c={couleur} />
  return (
    <ZStack frame={{ width: c.l, height: c.h }}>
      {c.apercu ? <RoundedRectangle cornerRadius={14} fill="rgba(255,255,255,0.14)" frame={{ width: c.l, height: c.h }} /> : <AccessoryWidgetBackground />}
      <VStack alignment="leading" spacing={dense ? 0 : 1} frame={{ width: l, height: c.h - 2 * haut, alignment: "leading" }}>
        {liste ? null : (
          <HStack spacing={5} frame={{ height: dense ? 14 : vedette ? (v.image ? 20 : 15) : 20 }}>
            {v.image && !v.image.silhouette ? <ImageFichier chemin={v.image.chemin} l={20} h={20} /> : null}
            <Din t={v.titre} s={dense ? 14 : vedette ? 13.5 : 18} k={0.8} c={vedette ? DOUX : BLANC} />
            <Spacer minLength={0} />
            {v.compte !== null ? (
              <TimerIntervalLabel from={new Date()} to={new Date(v.compte)} font={{ name: DIN, size: dense ? 14 : 16 }} foregroundStyle={DOUX} multilineTextAlignment="trailing" frame={{ width: 60 }} />
            ) : v.image?.silhouette ? <ImageFichier chemin={v.image.chemin} l={74} h={20} silhouette />
              : v.droite ? <Din t={v.droite} s={vedette ? 12 : 18} k={0.6} c={vedette ? MOYEN : BLANC} /> : null}
          </HStack>
        )}
        {v.jauge !== undefined ? (
          <ZStack alignment="leading" frame={{ width: l, height: 7, alignment: "leading" }}>
            <Capsule fill={FAIBLE} frame={{ width: l, height: 4 }} />
            {v.jauge > 0 ? <Capsule fill={BLANC} frame={{ width: Math.max(4, l * v.jauge), height: 4 }} /> : null}
          </ZStack>
        ) : null}
        {v.lignes.map((x, i) => vedette && i === 0 && typeof x === "string" ? (
          <HStack spacing={0} frame={{ width: l, height: 26, alignment: "leading" }}><Din t={x.toUpperCase()} s={26} k={0.6} c={BLANC} echelle={0.5} /></HStack>
        ) : typeof x === "string" ? texte(x, liste || dense ? undefined : DOUX) : (
          <HStack spacing={4} frame={liste ? { height: (c.h - 2 * haut - 3) / 4 } : undefined}>
            {texte(x[0])}
            <Spacer minLength={2} />
            {liste ? <Din t={x[1]} s={s + 2.5} k={0.4} c={DOUX} /> : <Ecrit t={x[1]} s={s} c={DOUX} />}
          </HStack>
        ))}
      </VStack>
    </ZStack>
  )
}

function Rond({ c, v }: { c: Cadre; v: RondVu }) {
  const t = Math.min(c.l, c.h)
  const trait = 5
  const anneau = t - trait
  return (
    <ZStack frame={{ width: c.l, height: c.h }}>
      {c.apercu ? <Circle fill="rgba(255,255,255,0.14)" frame={{ width: t, height: t }} /> : <AccessoryWidgetBackground />}
      {v.part !== null ? <Circle stroke={{ shapeStyle: FAIBLE, strokeStyle: { lineWidth: trait } }} frame={{ width: anneau, height: anneau }} /> : null}
      {v.part !== null && v.part > 0 ? (
        <Circle trim={{ from: 0, to: v.part }} stroke={{ shapeStyle: BLANC, strokeStyle: { lineWidth: trait, lineCap: "round" } }} frame={{ width: anneau, height: anneau }} rotationEffect={-90} />
      ) : null}
      <VStack spacing={0} frame={{ width: t - 16, height: t - 16 }}>
        <Spacer minLength={0} />
        {v.compte !== null ? (
          <TimerIntervalLabel from={new Date()} to={new Date(v.compte)} font={{ name: DIN, size: 18 }} foregroundStyle={BLANC} multilineTextAlignment="center" frame={{ width: t - 16 }} />
        ) : v.grand !== null ? <Din t={v.grand} s={v.grand.length > 3 ? 17 : 27} c={BLANC} echelle={0.5} /> : null}
        <Text font={8.5} fontWeight="bold" foregroundStyle={DOUX} kerning={0.4} lineLimit={1} minScaleFactor={0.6}>{v.sous}</Text>
        <Spacer minLength={0} />
      </VStack>
    </ZStack>
  )
}

/** La vue d'un widget de l'écran verrouillé, d'après sa famille (rectangle, rond, ligne) et son contenu. */
export function vueVerrou(contenu: string, d: Donnees | null, c: Cadre): VirtualNode {
  const maintenant = Date.now()
  if (c.famille === "accessoryInline") return <Text>{d === null ? SANS_BOUTIQUE.ligne : ligne(d, maintenant)}</Text>
  if (c.famille === "accessoryCircular") return <Rond c={c} v={d === null ? SANS_BOUTIQUE.rond : rond(contenu, d, maintenant)} />
  return <Rect c={c} v={d === null ? SANS_BOUTIQUE.rect : rectangle(contenu, d, maintenant)} />
}
