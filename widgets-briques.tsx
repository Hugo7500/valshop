import { Capsule, HStack, Image, Rectangle, Spacer, Text, TimerIntervalLabel, VStack, ZStack, gradient, type Color, type VirtualNode } from "scripting"
import type { SkinVu } from "./widgets-types"






export const C = {
  fondHaut: "#19212c" as Color, fondBas: "#0b0e13" as Color,
  carteHaut: "#1b222d" as Color, carteBas: "#0f1319" as Color,
  rouge: "#ff4655" as Color, vert: "#4ade80" as Color, or: "#ffd166" as Color, bleu: "#5a9fe2" as Color, violet: "#b56cff" as Color,
  blanc: "#ffffff" as Color, doux: "rgba(255,255,255,0.6)" as Color, pale: "rgba(255,255,255,0.08)" as Color,
}

export const DIN = "DINCondensed-Bold"
/** Marge intérieure d'un widget, en points. */
export const MARGE = 12

/** La couleur `hex` mêlée à `base` : `k` = part de la couleur. Sans couleur lisible : la base. */
export function mix(hex: string | null, k: number, base: string = C.carteHaut): Color {
  if (!hex || !/^#[0-9a-fA-F]{6}/.test(hex)) return base as Color
  const part = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16)
  const c = (a: number, b: number) => Math.round(a * k + b * (1 - k)).toString(16).padStart(2, "0")
  return ("#" + c(part(hex, 1), part(base, 1)) + c(part(hex, 3), part(base, 3)) + c(part(hex, 5), part(base, 5))) as Color
}


export function mille(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

/** Texte en police étroite, sur une ligne, réduit plutôt que coupé. */
export function Din({ t, s, c, k, echelle }: { t: string; s: number; c?: Color; k?: number; echelle?: number }) {
  return (
    <Text font={{ name: DIN, size: s }} foregroundStyle={c ?? C.blanc} kerning={k ?? 0.4} lineLimit={1} minScaleFactor={echelle ?? 0.6}>
      {t}
    </Text>
  )
}

/** Petit libellé en capitales espacées. */
export function Etiquette({ t, c, s }: { t: string; c?: Color; s?: number }) {
  return (
    <Text font={s ?? 8} fontWeight="semibold" foregroundStyle={c ?? C.doux} kerning={1} lineLimit={1} minScaleFactor={0.6}>
      {t.toUpperCase()}
    </Text>
  )
}

/**
 * Une image rangée sur l'appareil, à la taille donnée. Sur l'iPhone, par son chemin ; dans Scripting sur le Mac (banc de rendu),
 * par un objet image, car l'aperçu du Mac n'affiche rien par chemin. `remplir` : l'image couvre le cadre et dépasse, coupée.
 */
export function ImageFichier({ chemin, l, h, remplir, rotation, ombre, dx, dy, silhouette }: {
  chemin: string; l: number; h: number; remplir?: boolean; rotation?: number; ombre?: boolean; dx?: number; dy?: number; silhouette?: boolean
}) {


  const commun = {
    resizable: true,
    // `silhouette` : la forme seule, en blanc (écran verrouillé, où iOS dessine tout en une couleur).
    ...(silhouette ? { renderingMode: "template" as const, foregroundStyle: "#ffffff" as Color } : {}),
    ...(remplir ? { scaleToFill: true } : { scaleToFit: true }),
    frame: { width: l, height: h },
    ...(remplir ? { clipped: true } : {}),
    rotationEffect: rotation,
    shadow: ombre ? { color: "rgba(0,0,0,0.6)" as Color, radius: 6, x: 0, y: 5 } : undefined,
    offset: dx || dy ? { x: dx ?? 0, y: dy ?? 0 } : undefined,
  }
  if (Device.isiOSAppOnMac) {
    const image = UIImage.fromFile(chemin)
    return image ? <Image image={image} {...commun} /> : <Rectangle fill="rgba(0,0,0,0)" frame={{ width: l, height: h }} />
  }
  return <Image filePath={chemin} {...commun} />
}

/** Le fond d'un widget : dégradé sombre, ou teinté d'une couleur (or des souhaits, violet du Night Market). */
export function fondWidget(teinte?: string, force: number = 0.24) {
  return gradient("linear", {
    colors: [teinte ? mix(teinte, force, C.fondHaut) : C.fondHaut, teinte ? mix(teinte, force / 6, C.fondBas) : C.fondBas],
    startPoint: "topLeading", endPoint: "bottomTrailing",
  })
}

/**
 * L'en-tête d'un widget : trait d'accent, titre, puis à droite le compte à rebours du reset (`reset`, vivant), sinon un texte
 * (`droite`) ; `bouton` : le rond ↻ (son appui est une zone posée par-dessus, plus large que lui).
 */
export function Entete({ titre, accent, couleurTitre, reset, droite, bouton, suite, etat }: {
  titre: string; accent?: Color | null; couleurTitre?: Color; reset?: number | null; droite?: string; bouton?: boolean; suite?: VirtualNode
  /** La réponse à un appui sur ↻, dite à la place du compte à rebours : texte et couleur. */
  etat?: { texte: string; couleur: Color } | null
}) {
  return (
    <HStack spacing={6} frame={{ height: 18 }}>
      {accent === null ? null : <Rectangle fill={accent ?? C.rouge} frame={{ width: 4, height: 12 }} rotationEffect={14} />}
      <Din t={titre} s={16} k={1.3} c={couleurTitre} />
      <Spacer />
      {etat ? <Din t={etat.texte} s={14} c={etat.couleur} k={1} /> : reset != null && reset > Date.now() ? (
        // Borné au reset : il s'arrête à 0:00, au lieu de repartir à l'endroit si iOS tarde à redessiner le widget.
        <TimerIntervalLabel from={new Date()} to={new Date(reset)} font={{ name: DIN, size: 14 }} foregroundStyle={C.doux} multilineTextAlignment="trailing" frame={{ width: 62 }} />
      ) : droite ? <Din t={droite} s={14} c={C.doux} k={1} /> : null}
      {suite ?? null}
      {bouton ? (
        <ZStack frame={{ width: 18, height: 18 }} background={{ style: "rgba(255,255,255,0.12)", shape: "circle" }} opacity={etat?.texte.startsWith("LECTURE") ? 0.4 : 1}>
          <Text font={11} foregroundStyle={C.blanc}>↻</Text>
        </ZStack>
      ) : null}
    </HStack>
  )
}

/** Un prix : l'icône de la monnaie (si elle est gardée) puis le montant ; `ok` : en vert avec une coche (assez de VP). */
export function Prix({ montant, icone, s, ok, barre }: { montant: number | null; icone: string | null; s?: number; ok?: boolean; barre?: number | null }) {
  const taille = s ?? 15
  return (
    <HStack spacing={3}>
      {icone ? <ImageFichier chemin={icone} l={taille * 0.66} h={taille * 0.66} dy={-1.5} /> : null}
      <Din t={montant == null ? "—" : mille(montant)} s={taille} c={ok ? C.vert : C.blanc} />
      {ok ? <Text font={taille * 0.6} fontWeight="bold" foregroundStyle={C.vert}>✓</Text> : null}
      {barre != null ? (
        <Text font={{ name: DIN, size: taille * 0.78 }} foregroundStyle="rgba(255,255,255,0.45)" strikethrough="rgba(255,255,255,0.45)" lineLimit={1}>
          {mille(barre)}
        </Text>
      ) : null}
    </HStack>
  )
}

/** La pastille d'une remise du Night Market. */
function Remise({ pourcent, s }: { pourcent: number; s: number }) {
  return (
    <ZStack padding={{ horizontal: 5, top: 3, bottom: 1 }} background={{ style: C.violet, shape: { type: "rect", cornerRadius: 4 } }}>
      <Din t={`−${pourcent} %`} s={s} c={"#150a26"} />
    </ZStack>
  )
}


/** Le fond d'une carte : la lueur de la rareté sur le dégradé sombre. `centre` : d'où part la lueur. */
function fondCarte(couleur: string | null, rayon: number, centre: "top" | "trailing" | "topTrailing" = "top") {
  return gradient("radial", { colors: [mix(couleur, 0.78), "#11151b"], center: centre, startRadius: 0, endRadius: rayon })
}

/**
 * La carte d'un skin, en hauteur : l'arme en grand et en biais sur la lueur de sa rareté, un voile en bas pour le texte, le
 * type d'arme, le nom, le prix, le trait de rareté. `court` : carte basse, sans le type d'arme. `assez` : prix en vert.
 */
export function CarteSkin({ skin, l, h, monnaie, court, assez }: { skin: SkinVu; l: number; h: number; monnaie: string | null; court?: boolean; assez?: boolean }) {
  const li = l * (court ? 1.5 : 1.7)
  return (
    <ZStack frame={{ width: l, height: h }} background={{ style: fondCarte(skin.couleur, h * 0.85), shape: { type: "rect", cornerRadius: 12 } }} clipShape={{ type: "rect", cornerRadius: 12 }}>
      {skin.icone ? (
        <ZStack frame={{ width: l, height: h }}>
          <ImageFichier chemin={skin.icone} l={li} h={li / 2.8} rotation={-44} ombre dy={-h * (court ? 0.2 : 0.15)} />
        </ZStack>
      ) : null}
      <VStack spacing={0} frame={{ width: l, height: h }}>
        <Spacer />
        <Rectangle fill={gradient("linear", { colors: ["rgba(7,9,13,0)", "rgba(7,9,13,0.95)"], startPoint: "top", endPoint: "bottom" })} frame={{ width: l, height: h * 0.62 }} />
      </VStack>
      <VStack alignment="leading" spacing={1} padding={{ leading: 7, trailing: 5, bottom: 8 }} frame={{ width: l, height: h, alignment: "bottomLeading" }}>
        {court ? null : <Etiquette t={skin.arme} s={7.5} />}
        <Din t={skin.nom.toUpperCase()} s={15} />
        <Prix montant={skin.prix} icone={monnaie} ok={assez} barre={skin.origine} />
      </VStack>
      <VStack spacing={0} frame={{ width: l, height: h }}>
        <Spacer />
        <Rectangle fill={(skin.couleur ?? C.rouge) as Color} frame={{ width: l, height: 3 }} />
      </VStack>
      {skin.remise != null ? (
        <VStack alignment="leading" padding={6} frame={{ width: l, height: h, alignment: "topLeading" }}>
          <Remise pourcent={skin.remise} s={12} />
        </VStack>
      ) : null}
    </ZStack>
  )
}

/** La tuile d'un skin, pour les petits formats : l'arme presque à plat, le prix en bas à droite, le trait de rareté à gauche. */
export function TuileSkin({ skin, l, h, monnaie }: { skin: SkinVu; l: number; h: number; monnaie: string | null }) {
  const li = l * (skin.remise != null ? 0.84 : 1.14)
  return (
    <ZStack frame={{ width: l, height: h }} background={{ style: fondCarte(skin.couleur, l * 0.95, "topTrailing"), shape: { type: "rect", cornerRadius: 10 } }} clipShape={{ type: "rect", cornerRadius: 10 }}>
      {skin.icone ? (
        <ZStack frame={{ width: l, height: h }}>
          <ImageFichier chemin={skin.icone} l={li} h={li / 2.8} rotation={-16} ombre dx={skin.remise != null ? l * 0.08 : 0} dy={-h * 0.08} />
        </ZStack>
      ) : null}
      <HStack spacing={0} frame={{ width: l, height: h }}>
        <Rectangle fill={(skin.couleur ?? C.rouge) as Color} frame={{ width: 3, height: h }} />
        <Spacer />
      </HStack>
      <VStack alignment="trailing" padding={{ trailing: 6, bottom: 4 }} frame={{ width: l, height: h, alignment: "bottomTrailing" }}>
        <Prix montant={skin.prix} icone={monnaie} s={13} />
      </VStack>
      {skin.remise != null ? (
        <VStack alignment="leading" padding={{ leading: 8, top: 4 }} frame={{ width: l, height: h, alignment: "topLeading" }}>
          <Remise pourcent={skin.remise} s={10} />
        </VStack>
      ) : null}
    </ZStack>
  )
}

/** La carte d'un skin, couchée (grand widget) : le texte à gauche, l'arme en très grand à droite, le trait de rareté à gauche. */
export function CarteCouchee({ skin, l, h, monnaie }: { skin: SkinVu; l: number; h: number; monnaie: string | null }) {
  const li = Math.min(l * 0.64, h * 2.9)
  return (
    <ZStack frame={{ width: l, height: h }} background={{ style: fondCarte(skin.couleur, l * 0.6, "trailing"), shape: { type: "rect", cornerRadius: 12 } }} clipShape={{ type: "rect", cornerRadius: 12 }}>
      {skin.icone ? (
        <ZStack frame={{ width: l, height: h }}>
          <ImageFichier chemin={skin.icone} l={li} h={li / 2.8} rotation={-9} ombre dx={l * 0.5 - li * 0.5 + 4} />
        </ZStack>
      ) : null}
      <HStack spacing={0} frame={{ width: l, height: h }}>
        <Rectangle fill={(skin.couleur ?? C.rouge) as Color} frame={{ width: 4, height: h }} />
        <Spacer />
      </HStack>
      <VStack alignment="leading" spacing={1} padding={{ leading: 15 }} frame={{ width: l, height: h, alignment: "leading" }}>
        <Etiquette t={skin.arme} s={7.5} />
        <Din t={skin.nom.toUpperCase()} s={Math.min(25, h * 0.32)} />
        <Prix montant={skin.prix} icone={monnaie} s={Math.min(17, h * 0.22)} />
      </VStack>
    </ZStack>
  )
}

/** Une pastille de solde : icône, montant, unité ; `accent` : fond rougi (les VP). */
export function Pastille({ icone, texte, unite, accent, h, sombre, couleur }: {
  icone: string | null; texte: string; unite?: string; accent?: boolean; h?: number
  /** `sombre` : fond foncé, pour une pastille posée sur une image ; `couleur` : celle du montant. */
  sombre?: boolean; couleur?: Color
}) {
  return (
    <HStack spacing={4} padding={{ horizontal: 8 }} frame={{ height: h ?? 20 }} background={{ style: sombre ? "rgba(9,11,16,0.74)" : accent ? "rgba(255,70,85,0.2)" : C.pale, shape: "capsule" }}>
      {icone ? <ImageFichier chemin={icone} l={11} h={11} /> : null}
      <Din t={texte} s={14} c={couleur} />
      {unite ? <Etiquette t={unite} s={7.5} /> : null}
    </HStack>
  )
}

/** Un trait fin, pour séparer deux parties d'un grand widget. */
export function Trait({ l }: { l: number }) {
  return <Capsule fill={C.pale} frame={{ width: l, height: 1 }} />
}
