import type { VueWeb } from "./rendu"

// Ticket 4.50 de epic-stats-tableau-de-bord (Stats dessiné par une vue web), phase A : la traduction de l'arbre rendu par le
// moteur web (rendu.ts : les mêmes composants, les mêmes calculs) en HTML, CSS et SVG, pour une seule vue native `WebView`
// (phase B). Rien n'est mesuré côté app : une chaîne. Table de correspondance (plan du ticket, Design Notes, puis section
// « Traducteur : fidélité, symboles, VoiceOver, poids ») :
//   piles : VStack/LazyVStack en colonne flexible (`gap` = spacing, 8 par défaut), HStack en rangée, ZStack en grille à une
//     case, FlowLayout en rangée qui passe à la ligne ; la gourmandise de SwiftUI (formes, `maxWidth: infinity`) recalculée :
//     étirement dans une colonne, `flex: 1` dans une rangée ; un cadre plus grand que la pile sur son axe secondaire (colonne
//     plus large, rangée plus haute) devient une boîte autour d'elle, la pile placée en bloc selon l'alignement du cadre ;
//   Text : rôles d'iOS par taille de texte (TAILLES : Dynamic Type, xSmall à accessibility5, plafond `dynamicTypeSize` d'un
//     sous-arbre) ; police système aux graisses et à la chasse de CoreText (axes « wght » et « wdth » relevés au Mac : mêmes
//     largeurs à 10⁻⁷ près), interligne des métriques du SF Pro d'iOS (taille × 2444/2048, celui de SwiftUI, sans l'interligne
//     des tableaux de l'HIG), sauts de ligne gardés ; chiffres tabulaires, capitales, interlettrage ; `styledText` en
//     morceaux ; `lineLimit` 1 et `minScaleFactor` : réduits par le script de la page jusqu'à tenir ;
//   cadres et marges : boîte `border-box` (ordre supposé : marge, cadre, fond) ; fonds en couleur, forme arrondie ou calques ;
//   PathShape : la même fonction `draw` appelée ici à quatre tailles, chaque coordonnée écrite a + b·largeur + c·hauteur ; un
//     polygone plein dont x ne dépend que de la largeur et y de la hauteur devient un `clip-path: polygon(calc(…))` (CSS seul,
//     classe partagée : les fonds des Blocs, les barres) ; sinon un SVG que la page retrace à la taille réelle
//     (ResizeObserver, avant l'image) ; non affine (Radar) : à la taille fixe de sa pile ; `mask` : `clip-path` de même ;
//   Canvas : les appels de `draw(ctx, taille)` relevés de même (arguments affines en largeur et hauteur), rejoués par la page
//     dans un `<canvas>` (même API) ; graphiques (`Chart`) : leurs marques en tracés affines sur leurs échelles ;
//   Image (symboles SF) : cadre et ligne de base du symbole (relevés au Mac, AppKit, à 100 points) ; dessin du système quand
//     Scripting le donne (UIImage.fromSFSymbol, à la taille et à la graisse, en PNG : masque teint, ou palette cuite), sinon
//     un SVG approché ;
//   Button : `<button data-action>`, l'action gardée côté app (`actions`) ; Menu : `data-action="menu"` (natif, phase B) ;
//     Stepper (élément ajustable de VoiceOver) : un curseur natif invisible, ses deux actions en `data-action` ;
//   case cachée de sous-onglet (CASE_CACHEE d'app.tsx) : `hidden` ; accessibilité en attributs ARIA (VoiceOver de WebKit).

/** Rôle → taille (points) par taille de texte d'iOS, de xSmall à accessibility5 (Dynamic Type). */
const TAILLES: Record<string, number[]> = {
  largeTitle: [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60], title: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56], title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  headline: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53], body: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  callout: [13, 14, 15, 16, 18, 20, 22, 26, 32, 38, 44, 51], subheadline: [12, 13, 14, 15, 17, 19, 21, 25, 30, 36, 42, 49],
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44], caption: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
  caption2: [11, 11, 11, 11, 13, 15, 17, 20, 24, 29, 34, 40],
}
/**
 * Hauteur d'une ligne de SF Pro, en tailles : (ascendante + descendante) ÷ unités du cadratin d'iOS, 2444/2048 (la `lineHeight`
 * d'UIFont, 20,287 à 17 points), celle d'un Text de SwiftUI ; l'interligne des tableaux de l'HIG (22 à 17) n'est pas appliqué.
 */
const LIGNE_SF = 2444 / 2048
export const ORDRE_TAILLES = ["xSmall", "small", "medium", "large", "xLarge", "xxLarge", "xxxLarge",
  "accessibility1", "accessibility2", "accessibility3", "accessibility4", "accessibility5"]
const POIDS: Record<string, number> = { ultraLight: 100, thin: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 }
/**
 * Axe « wght » du SF Pro qui rend la largeur de CoreText à chaque graisse de SwiftUI, en chasse normale et condensée (où
 * « wdth » vaut 60) : relevés au Mac (largeurs de NSFont.systemFont contre WebKit, écart < 10⁻⁶), le même SF Pro qu'iOS.
 * `font-weight: 800` seul rend le gras-noir 1 % trop étroit, `font-stretch: condensed` (75 %) le condensé 8 à 11 % trop large.
 */
const WGHT: Record<string, number> = { regular: 400, medium: 510, semibold: 590, bold: 700, heavy: 860, black: 1000 }
const WGHT_CONDENSE: Record<string, number> = { regular: 410, medium: 540, semibold: 650, bold: 760, heavy: 870, black: 1000 }
const WDTH_CONDENSE = 60
const H_ALIGN: Record<string, string> = { leading: "flex-start", center: "center", trailing: "flex-end" }
const ALIGN2: Record<string, [string, string]> = {
  center: ["center", "center"], leading: ["flex-start", "center"], trailing: ["flex-end", "center"], top: ["center", "flex-start"],
  bottom: ["center", "flex-end"], topLeading: ["flex-start", "flex-start"], topTrailing: ["flex-end", "flex-start"],
  bottomLeading: ["flex-start", "flex-end"], bottomTrailing: ["flex-end", "flex-end"],
}
const V_ALIGN: Record<string, string> = { center: "center", top: "flex-start", bottom: "flex-end", firstTextBaseline: "baseline", lastTextBaseline: "last baseline" }
const GRILLE: Record<string, string> = { "flex-start": "start", "flex-end": "end", center: "center" }
const FORMES = new Set(["Rectangle", "RoundedRectangle", "PathShape", "Chart", "Circle", "Canvas"])
const TRANSPARENTS = new Set(["EnvironmentValuesReader", "ScrollViewReader", "NavigationStack"])
/** Sans pixel : contenu de menu (Picker ; ses Section ne sont jamais rendues : seule l'étiquette d'un Menu l'est), vide. */
const MUETS = new Set(["Picker", "EmptyView"])
export const POLICE_SF = `-apple-system,system-ui,"SF Pro Text","Helvetica Neue",sans-serif`

/** Couleur de Scripting → CSS : « #rrggbb », nom, ou { color, opacity }. */
export function couleurCss(c: any): string | null {
  if (c === null || c === undefined) return null
  if (typeof c === "string") return c
  if (typeof c === "object" && c.color !== undefined) {
    const base = couleurCss(c.color)
    if (base === null || c.opacity === undefined || c.opacity === 1) return base
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(base)
    return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${c.opacity})` : base
  }
  return null
}
export const echapper = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const px = (v: number) => (Math.round(v * 100) / 100) + "px"
const arrondi = (v: number, n: number) => { const k = Math.pow(10, n); return Math.round(v * k) / k }

function nombre(v: number): string {
  if (v === 0) return "0"
  const s = String(v)
  return s.indexOf("e") < 0 ? s : v.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
}

/**
 * Symboles SF : cadre (largeur, hauteur) et ligne de base (au-dessus du bas du cadre) à 100 points, relevés au Mac
 * (NSImage(systemSymbolName:) à 100 points, échelle moyenne : `size` et `alignmentRect`) ; « nom|graisse » hors du regular.
 * Le cadre est celui d'un Image(systemName:) de SwiftUI, proportionnel à la taille de sa police.
 */
const CADRES_SF: Record<string, [number, number, number]> = {
  "xmark": [103, 93, 11], "checkmark": [110, 98, 15], "arrow.clockwise": [104, 119, 18.5], "gearshape": [122, 119, 24],
  "doc.text": [108, 119, 24], "square|semibold": [118, 110, 19.5], "checkmark.square.fill|semibold": [118, 110, 19.5],
  "exclamationmark.triangle.fill": [123, 107, 18], "person.fill": [108, 102, 15.5], "person.2.fill": [159, 109, 22.5],
  "person.3.fill": [210, 109, 22.5], "play.circle.fill": [117, 114, 21.5], "square.and.arrow.down": [112, 128, 22],
  "arrowtriangle.left.fill": [103, 92, 10.5], "arrowtriangle.right.fill": [103, 92, 10.5], "arrowtriangle.up.fill": [98, 94, 11.5],
  "arrowtriangle.down.fill": [98, 94, 11.5], "chevron.right": [73, 99, 14], "square": [115, 104, 16.5], "checkmark.square.fill": [115, 104, 16.5],
}

/**
 * Symboles SF dessinés en SVG (24 × 24, marge de 3 autour, comme le cadre du symbole), approchés : repli quand Scripting ne
 * donne pas le dessin du système (au Mac, au harnais, ou si UIImage échoue).
 */
const SYMBOLES: Record<string, string> = {
  xmark: '<path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  checkmark: '<path d="M4.5 12.5l5 5L19.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  "arrow.clockwise": '<path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  gearshape: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5l1.6 2.6 3-.8.8 3 2.6 1.6-1.4 2.7 1.4 2.7-2.6 1.6-.8 3-3-.8L12 21.5l-1.6-2.6-3 .8-.8-3-2.6-1.6 1.4-2.7-1.4-2.7 2.6-1.6.8-3 3 .8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  "doc.text": '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 11h6M9 14.5h6M9 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  "checkmark.square.fill": '<rect x="3" y="3" width="18" height="18" rx="4" fill="var(--s2,currentColor)"/><path d="M7.5 12.5l3 3 6-7" fill="none" stroke="var(--s1,#000)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  "exclamationmark.triangle.fill": '<path d="M12 3L22 20H2z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v5" stroke="#0b0f14" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.3" fill="#0b0f14"/>',
  "person.fill": '<circle cx="12" cy="7.5" r="4" fill="currentColor"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="currentColor"/>',
  "person.2.fill": '<circle cx="9" cy="8" r="3.4" fill="currentColor"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6z" fill="currentColor"/><circle cx="16.5" cy="8.5" r="2.8" fill="currentColor"/><path d="M15.5 14.2c3.3-.2 6 1.8 6 5.3h-4.4" fill="currentColor"/>',
  "person.3.fill": '<circle cx="12" cy="7.5" r="3.2" fill="currentColor"/><path d="M6.5 20c0-3.5 2.4-5.6 5.5-5.6s5.5 2.1 5.5 5.6z" fill="currentColor"/><circle cx="5.2" cy="9.5" r="2.4" fill="currentColor"/><circle cx="18.8" cy="9.5" r="2.4" fill="currentColor"/><path d="M1 19c0-2.6 1.7-4.2 4.2-4.2 1 0 1.8.2 2.4.7-1 1-1.6 2.3-1.7 3.5zM23 19c0-2.6-1.7-4.2-4.2-4.2-1 0-1.8.2-2.4.7 1 1 1.6 2.3 1.7 3.5z" fill="currentColor"/>',
  "play.circle.fill": '<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M10 8l6 4-6 4z" fill="#0b0f14"/>',
  "square.and.arrow.down": '<path d="M8 10h-2v11h12V10h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 3v11M8.5 10.5L12 14l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  "arrowtriangle.left.fill": '<path d="M7 12l10-7v14z" fill="currentColor"/>',
  "arrowtriangle.right.fill": '<path d="M17 12L7 5v14z" fill="currentColor"/>',
  "arrowtriangle.up.fill": '<path d="M12 6l7 11H5z" fill="currentColor"/>',
  "arrowtriangle.down.fill": '<path d="M12 18L5 7h14z" fill="currentColor"/>',
  "chevron.right": '<path d="M9 4.5l7.5 7.5L9 19.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
}
export const SYMBOLES_CONNUS: readonly string[] = Object.keys(SYMBOLES)

/**
 * Le dessin d'un symbole par le système, en PNG (base64), quand Scripting le donne : UIImage.fromSFSymbol, à la taille (en
 * points, à l'échelle de l'écran) et à la graisse de l'Image, palette cuite si elle est donnée. Gardé pour l'exécution (une
 * fois par symbole, taille, graisse et palette) ; null hors de Scripting ou en cas d'échec (le SVG approché sert alors).
 */
const IMAGES_SF = new Map<string, string | null>()
function imageSF(nom: string, graisse: string, taille: number, palette: string[] | null): string | null {
  const cle = nom + "|" + graisse + "|" + taille + "|" + (palette ? palette.join(",") : "")
  const deja = IMAGES_SF.get(cle)
  if (deja !== undefined) return deja
  let b64: string | null = null
  try {
    const g: any = globalThis
    const U = g.UIImage, C = g.UIImageSymbolConfiguration
    if (U && C && typeof U.fromSFSymbol === "function") {
      const base = U.fromSFSymbol(nom)
      const confs = [C.pointSize(taille), C.weight(graisse)]
      if (palette) confs.push(C.paletteColors(palette))
      const im = base ? base.applySymbolConfiguration(confs) : null
      const s = im ? im.toPNGBase64String() : null
      b64 = typeof s === "string" && s.length > 0 ? s : null
    }
  } catch (e) { b64 = null }
  IMAGES_SF.set(cle, b64)
  return b64
}

/** Une coordonnée affine : a + b·largeur + c·hauteur. */
type Coef = [number, number, number]
type Commande = (string | Coef)[]


function coefTexte(k: Coef): string {
  const a = arrondi(k[0], 3), b = arrondi(k[1], 6), c = arrondi(k[2], 6)
  let s = a !== 0 ? nombre(a) : ""
  const terme = (v: number, l: string) => {
    if (v === 0) return
    const signe = v < 0 ? "-" : s === "" ? "" : "+"
    const m = Math.abs(v)
    s += signe + (m === 1 ? "" : nombre(m)) + l
  }
  terme(b, "w"); terme(c, "h")
  return s === "" ? "0" : s
}

function traceTexte(cmds: Commande[]): string {
  return cmds.map((c) => String(c[0]) + c.slice(1).map((k) => coefTexte(k as Coef)).join(" ")).join("")
}
/** Un nombre en CSS : `calc(b·100 % + a px)` sur l'axe de la boîte. */
function longueurCss(a: number, b: number): string {
  a = arrondi(a, 2); b = arrondi(b, 6)
  if (b === 0) return a === 0 ? "0" : nombre(a) + "px"
  const pc = nombre(arrondi(b * 100, 4)) + "%"
  if (a === 0) return pc
  return `calc(${pc} ${a < 0 ? "-" : "+"} ${nombre(Math.abs(a))}px)`
}





function polygoneCss(cmds: Commande[]): string | null {
  const pts: [Coef, Coef][] = []
  let m = 0
  let rect: Coef[] | null = null
  for (const c of cmds) {
    const t = c[0]
    if (t === "M" || t === "L") { if (t === "M" && ++m > 1) return null; pts.push([c[1] as Coef, c[2] as Coef]) }
    else if (t === "R") {
      if (cmds.length !== 1) return null
      const [x, y, w, h] = c.slice(1) as Coef[]
      const xw: Coef = [x[0] + w[0], x[1] + w[1], x[2] + w[2]], yh: Coef = [y[0] + h[0], y[1] + h[1], y[2] + h[2]]
      pts.push([x, y], [xw, y], [xw, yh], [x, yh])
      rect = [x, y, xw, yh]
    } else if (t !== "Z") return null
  }
  if (pts.length < 3) return null
  for (const [x, y] of pts) {
    if (Math.abs(x[2]) > 1e-9 || Math.abs(y[1]) > 1e-9) return null
    for (const t of [40, 2000]) {
      const vx = x[0] + x[1] * t, vy = y[0] + y[2] * t
      if (vx < -0.01 || vx > t + 0.01 || vy < -0.01 || vy > t + 0.01) return null
    }
  }
  // Un rectangle (barre) : `inset(haut droite bas gauche)`, plus court que ses quatre coins.
  if (rect !== null) {
    const [x0, y0, x1, y1] = rect
    return `inset(${longueurCss(y0[0], y0[2])} ${longueurCss(-x1[0], 1 - x1[1])} ${longueurCss(-y1[0], 1 - y1[2])} ${longueurCss(x0[0], x0[1])})`
  }
  return "polygon(" + pts.map(([x, y]) => longueurCss(x[0], x[1]) + " " + longueurCss(y[0], y[2])).join(",") + ")"
}
/**
 * Une découpe tirée des données (barre à 56,25 %) ne resert presque jamais : écrite sur l'élément (`style`) plutôt qu'en
 * classe ; une forme (0, 100 %, points fixes) en classe partagée.
 */
const decoupeDeDonnees = (poly: string) => /(^|[ (,])(?!100%)[0-9.]+%/.test(poly)





export function dateCompacte(valeur: unknown, composants?: string[]): string {
  const d = new Date(typeof valeur === "number" || typeof valeur === "string" || valeur instanceof Date ? (valeur as any) : NaN)
  if (isNaN(d.getTime())) return ""
  const c = composants && composants.length ? composants : ["hourAndMinute", "date"]
  const jour = c.includes("date") ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""
  const heure = c.includes("hourAndMinute") ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""
  return [jour, heure].filter((x) => x).join(", ")
}

export type Traducteur = {
  /**
   * HTML d'une vue de l'arbre rendu ; `axe` : la pile qui la porte (col, row, z, cell, calque). Contrat de la page (hôte natif,
   * page-web.tsx) : chaque élément touchable porte `data-action` (l'identifiant d'une action de `actions`, stable : tiré de
   * son chemin dans l'arbre ; « menu », « date » avec `data-valeur` = l'identifiant dans `menus`, `dates` ; « lien » avec
   * l'adresse) ; chaque morceau remplaçable porte `id` (« barre », « page~<rang> », « <sous-onglet>~<rang> » pour chaque bloc,
   * « sous-onglets ») ; chaque sous-onglet monté est une `section data-sous-onglet="<clé>"`, cachée (`hidden`) sauf l'ouverte.
   */
  vue: (n: VueWeb, axe?: string) => string
  /**
   * Ticket 4.51 : une vue à part de la page (le Détail d'une partie), traduite sous le pas de chemin `cle` (ses actions ne
   * croisent jamais celles de l'onglet) ; chaque bloc de sa première pile paresseuse (PileDeBlocs) est un morceau remplaçable
   * « <cle>~<rang> » (un choix de manche ne renvoie que son bloc).
   */
  vueSeparee: (cle: string, n: VueWeb) => string
  /** La feuille des classes produites (depuis la `depuis`-ième, pour un morceau qui en ajoute). */
  css: (depuis?: number) => string
  nombreDeClasses: () => number
  actions: Map<string, Function>
  /** Les Menu (périmètre) et DatePicker (Récap) natifs, sous l'identifiant de leur `data-valeur`. */
  menus: Map<string, VueWeb>
  dates: Map<string, VueWeb>
  inconnus: Map<string, number>
  nonAffines: string[]
}

/**
 * Réglages du traducteur (harnais) : `cache` faux, chaque sous-arbre est traduit de nouveau à chaque appel (la preuve que
 * la traduction gardée d'un sous-arbre repris tel quel rend le même HTML, octet pour octet).
 */
export const OPTIONS_TRADUCTION = { cache: true }
/** Taille (nœuds) d'un sous-arbre à partir de laquelle sa traduction est gardée pour un rendu suivant qui le reprend. */
const POIDS_GARDE = 30
/** Ce qu'un sous-arbre a laissé en se traduisant (actions, menus, dates, manques) : rejoué quand sa traduction resert. */
type Traces = { actions: [string, Function][]; menus: [string, VueWeb][]; dates: [string, VueWeb][]; inconnus: string[]; nonAffines: string[] }

/** Les traits VoiceOver d'une vue, en liste. */
const traitsDe = (p: any): string[] => [].concat(p.accessibilityAddTraits || [])
/**
 * Ce que VoiceOver lit d'une vue étiquetée, valeur comprise (SwiftUI : « étiquette, valeur, bouton ») : `aria-label` porte les
 * deux, `aria-valuetext` n'étant lu que sur un rôle d'intervalle ; le Stepper (curseur natif) garde sa valeur à part.
 */
function voix(n: VueWeb): string {
  const p = n.props
  return n.type !== "Stepper" && p.accessibilityValue ? p.accessibilityLabel + ", " + p.accessibilityValue : String(p.accessibilityLabel)
}

/** Un traducteur : garde les classes (dédoublonnées), les actions, et ce qui n'a pas de traduction. `taille` : celle de iOS. */
export function creerTraducteur(taille: string = "large"): Traducteur {
  const classes = new Map<string, string>()
  const actions = new Map<string, Function>()
  const inconnus = new Map<string, number>()
  const nonAffines: string[] = []
  const memo = new WeakMap<object, { w: boolean; h: boolean }>()
  /** Le chemin de la vue en cours (rangs, ou clés `k…`) : l'identifiant stable d'une action, d'un menu, d'une date. */
  const trajet: string[] = []
  /** Les morceaux remplaçables (contrat de la page) : vue → id. */
  const ids = new WeakMap<object, string>()
  /** Ticket 4.51 : les vues d'une colonne en fond (calque), qui a une hauteur : une gourmande y prend la hauteur qui reste. */
  const hauteurARemplir = new WeakSet<object>()
  const menus = new Map<string, VueWeb>()
  const dates = new Map<string, VueWeb>()
  let tailleFixe: [number, number] | null = null
  let rangTaille = Math.max(0, ORDRE_TAILLES.indexOf(taille))
  /** Profondeur sous une vue cachée à VoiceOver (`aria-hidden` y vaut pour tout le sous-arbre : inutile de le redire). */
  let masque = 0
  /** L'`id` du plus proche morceau remplaçable au-dessus de la vue en cours (identifiants des lignes d'une liste). */
  let idParent = ""
  /**
   * Traductions gardées, par nœud : un sous-arbre repris tel quel par le moteur (même objet : composant non rendu de nouveau,
   * rendu.ts) dans le même contexte (chemin, axe, taille de texte, masque, taille fixe, identifiants) rend le même HTML ; ses
   * actions, menus et dates sont reposés sous les mêmes identifiants. Classes : celles de ce traducteur, déjà posées.
   */
  const gardees = new WeakMap<object, Traces & { cle: string; html: string }>()
  const poids = new WeakMap<object, number>()
  const enregistreurs: Traces[] = []
  const poserAction = (id: string, f: Function) => { actions.set(id, f); for (const r of enregistreurs) r.actions.push([id, f]) }
  const poserMenu = (id: string, v: VueWeb) => { menus.set(id, v); for (const r of enregistreurs) r.menus.push([id, v]) }
  const poserDate = (id: string, v: VueWeb) => { dates.set(id, v); for (const r of enregistreurs) r.dates.push([id, v]) }
  const poserNonAffine = (x: string) => { nonAffines.push(x); for (const r of enregistreurs) r.nonAffines.push(x) }

  const cls = (decl: string[]) => {
    const d = decl.join(";")
    if (!d) return ""
    let c = classes.get(d)
    if (!c) { c = "s" + classes.size.toString(36); classes.set(d, c) }
    return c
  }
  const classe = (decl: string[]) => { const c = cls(decl); return c ? ` class="${c}"` : "" }
  const noter = (quoi: string) => { inconnus.set(quoi, (inconnus.get(quoi) || 0) + 1); for (const r of enregistreurs) r.inconnus.push(quoi) }
  /** Un identifiant stable, tiré du chemin (unique dans la page : suffixe `~n` au besoin). */
  const ident = (prefixe: string, dans: Map<string, unknown>) => {
    const base = prefixe + trajet.join(".")
    let id = base, k = 1
    while (dans.has(id)) id = base + "~" + k++
    return id
  }
  const action = (f: Function) => { const id = ident("a", actions); poserAction(id, f); return id }
  /** `f` rendu sous le pas de chemin `pas`. */
  function sous(pas: string, f: () => string): string {
    trajet.push(pas)
    try { return f() } finally { trajet.pop() }
  }
  const pasDe = (c: VueWeb, i: number) => (c && c.props && c.props.key !== undefined && c.props.key !== null ? "k" + String(c.props.key) : String(i))
  /** La première vue non transparente sous `n` (un lecteur d'environnement porte la vue qu'il rend). */
  const reelle = (n: VueWeb): VueWeb => (n && TRANSPARENTS.has(n.type) && n.children.length === 1 ? reelle(n.children[0]) : n)
  /**
   * Les blocs d'un sous-onglet : les enfants de sa racine (la première vue réelle de son emplacement, une pile de blocs :
   * PileDeBlocs) ; une racine qui n'est pas une pile est un seul bloc.
   */
  function marquerBlocs(n: VueWeb, cle: string) {
    const r = reelle(n)
    if (!r) return
    if ((r.type === "VStack" || r.type === "LazyVStack") && r.children.length > 0) r.children.forEach((b, i) => { const x = reelle(b); if (x) ids.set(x, cle + "~" + pasDe(b, i)) })
    else ids.set(r, cle + "~0")
  }

  /** Axes que la vue ne demande pas dans sa case de grille (`gridCellUnsizedAxes`) : elle prend la taille de la case. */
  const nonDimensionne = (p: any) => {
    const u = p.gridCellUnsizedAxes
    return { w: u === "horizontal" || u === "all", h: u === "vertical" || u === "all" }
  }
  /** Gourmandise d'une vue (prend la place offerte) en largeur et en hauteur, comme SwiftUI. */
  function gourmand(n: VueWeb): { w: boolean; h: boolean } {
    if (!n || n.type === "#text") return { w: false, h: false }
    const deja = memo.get(n)
    if (deja) return deja
    const f = n.props.frame || {}
    let w = false, h = false
    if (FORMES.has(n.type)) { w = true; h = true }
    else if (n.type === "ScrollView") { w = true; h = n.props.axes !== "horizontal" }
    else if (n.type === "Spacer") { w = true; h = true }
    else if (n.type !== "Text" && n.type !== "Image") {
      for (const c of n.children || []) { const g = gourmand(c); w = w || g.w; h = h || g.h }
    }
    if (f.width !== undefined || (f.maxWidth !== undefined && f.maxWidth !== "infinity")) w = false
    if (f.maxWidth === "infinity") w = true
    if (f.height !== undefined || (f.maxHeight !== undefined && f.maxHeight !== "infinity")) h = false
    if (f.maxHeight === "infinity") h = true
    const fs = n.props.fixedSize
    if (fs === true || (fs && fs.horizontal)) w = false
    const u = nonDimensionne(n.props)
    if (u.w) w = false
    if (u.h) h = false
    const g = { w, h }
    memo.set(n, g)
    return g
  }
  /** Gourmandise des seuls enfants d'une pile (sans son cadre). */
  function gourmandsDedans(n: VueWeb): { w: boolean; h: boolean } {
    let w = false, h = false
    for (const c of n.children || []) { const g = gourmand(c); w = w || g.w; h = h || g.h }
    return { w, h }
  }

  function marges(p: any): string {
    if (typeof p === "number") return px(p)
    if (p === true) return "16px"
    const t = p.top ?? p.vertical ?? 0, b = p.bottom ?? p.vertical ?? 0, l = p.leading ?? p.horizontal ?? 0, r = p.trailing ?? p.horizontal ?? 0
    return [t, r, b, l].map(px).join(" ")
  }

  /** Placement dans le parent et cadre, marges, opacité, appui, position. `rowb` : rangée alignée sur la ligne de base. */
  function placement(n: VueWeb, axe: string, decl: string[]) {
    const g = gourmand(n)
    const p = n.props
    const f = p.frame || {}
    if (axe === "col") {
      if (g.w) decl.push("align-self:stretch")
      // Ticket 4.51 : dans une colonne en fond (calque, à la hauteur de sa vue), une vue gourmande prend la hauteur qui reste,
      // comme dans SwiftUI (la surface d'un Constat sous son filet, la surface d'un Encadré).
      if (g.h && hauteurARemplir.has(n)) decl.push("flex:1 1 0", "min-height:0")
    }
    else if (axe === "row" || axe === "rowb") {
      if (g.w) decl.push("flex:1 1 0", "min-width:0")
      if (g.h) decl.push("align-self:stretch")
    } else if (axe === "z") {
      decl.push("grid-area:1/1")
      if (g.w) decl.push("justify-self:stretch")
      if (g.h) decl.push("align-self:stretch")
    }
    if (f.width !== undefined) decl.push("width:" + px(f.width), "flex-shrink:0")
    if (f.height !== undefined) decl.push("height:" + px(f.height), "flex-shrink:0")
    if (f.minWidth !== undefined) decl.push("min-width:" + px(f.minWidth))
    if (f.maxWidth !== undefined && f.maxWidth !== "infinity") decl.push("max-width:" + px(f.maxWidth))
    if (f.minHeight !== undefined) decl.push("min-height:" + px(f.minHeight))
    if (f.maxHeight !== undefined && f.maxHeight !== "infinity") decl.push("max-height:" + px(f.maxHeight))
    if (p.padding !== undefined) decl.push("padding:" + marges(p.padding))
    if (p.opacity !== undefined && p.opacity !== 1) decl.push("opacity:" + p.opacity)
    if (p.allowsHitTesting === false) decl.push("pointer-events:none")
    if (p.clipped === true) decl.push("overflow:hidden")
    if (p.layoutPriority !== undefined && p.layoutPriority > 0) decl.push("flex-shrink:0")
    if (p.fixedSize === true || (p.fixedSize && p.fixedSize.horizontal)) decl.push("flex-shrink:0", "white-space:nowrap")
    if (p.position) decl.push("position:absolute", "left:" + px(p.position.x), "top:" + px(p.position.y), "transform:translate(-50%,-50%)")
  }

  /** Fond : couleur, forme arrondie, ou vues (calques sous le contenu). Rend [déclarations, calques]. */
  function fond(n: VueWeb): [string[], string] {
    const b = n.props.background
    if (b === undefined) return [[], ""]
    if (typeof b === "string" || (b && b.color !== undefined)) return [["background:" + couleurCss(b)], ""]
    if (b && b.style !== undefined && b.shape) {
      const r = b.shape.cornerRadius
      return [["background:" + couleurCss(b.style)].concat(r ? ["border-radius:" + px(r)] : []), ""]
    }
    const noeuds: VueWeb[] = Array.isArray(b) ? b : []
    const calques = sous("fond", () => noeuds.filter((x) => !MUETS.has(x.type)).map((x, i) => sous(String(i), () => vue(x, "calque"))).join(""))
    return [calques ? ["position:relative", "isolation:isolate"] : [], calques]
  }

  /**
   * Attributs ARIA (VoiceOver de WebKit), comme SwiftUI lit l'app : caché (`aria-hidden`, une fois pour le sous-arbre) ;
   * étiquette et valeur (`aria-label`) ; `accessibilityElement` : `true`/`ignore` et `combine` (un seul élément) en
   * `role="text"` (WebKit), `contain` étiqueté en groupe ; titre (`isHeader`) en `role="heading"` ; indication
   * (`accessibilityHint`) en `aria-description` ; `isSelected` en `aria-current`. `role` : celui de l'élément (bouton,
   * lien, image…), qui l'emporte ; `role: null` : aucun rôle ajouté (le titre d'un bouton est porté par son enveloppe).
   */
  function aria(n: VueWeb, role?: string | null): string {
    const p = n.props
    const a: string[] = []
    if (p.accessibilityHidden === true) { if (masque === 0) a.push('aria-hidden="true"') }
    else {
      const traits = traitsDe(p)
      const el = p.accessibilityElement
      let r: string | null = role === undefined ? null : role
      if (role === undefined) {
        if (traits.includes("isHeader") || p.accessibilityHeading !== undefined) r = "heading"
        else if (traits.includes("isButton")) r = "button"
        else if (traits.includes("isLink")) r = "link"
        else if (traits.includes("isImage")) r = "img"
        else if (el === true || el === "ignore" || el === "combine" || traits.includes("isStaticText")) r = "text"
        else if (el === "contain" && p.accessibilityLabel !== undefined) r = "group"
      }
      if (p.accessibilityLabel !== undefined) a.push(`aria-label="${echapper(voix(n))}"`)
      if (r !== null && r !== "") a.push(`role="${r}"`)
      const niveau = /^h([1-6])$/.exec(String(p.accessibilityHeading || ""))
      if (r === "heading" && niveau && niveau[1] !== "2") a.push(`aria-level="${niveau[1]}"`)
      const desc = [p.accessibilityLabel === undefined && p.accessibilityValue ? p.accessibilityValue : "", p.accessibilityHint || ""].filter((x) => x).join(". ")
      if (desc) a.push(`aria-description="${echapper(desc)}"`)
      if (traits.includes("isSelected")) a.push('aria-current="true"')
    }
    return a.length ? " " + a.join(" ") : ""
  }
  /**
   * Identité dans la page : `id` d'un morceau remplaçable ; `data-cle` d'une clé écrite sur un bouton ou une colonne, les
   * seules cibles d'un défilement (ScrollViewReader : début du contenu, constats, puce ou sous-onglet au centre).
   */
  function identite(n: VueWeb): string {
    const p = n.props
    let s = ""
    if (typeof p.key === "string" && (n.type === "Button" || n.type === "VStack" || n.type === "LazyVStack")) s += ` data-cle="${echapper(p.key)}"`
    const id = ids.get(n)
    if (id !== undefined) s += ` id="${echapper(id)}"`
    return s
  }
  const access = (n: VueWeb, role?: string | null) => aria(n, role) + identite(n)
  /** `f` rendu, le sous-arbre de `n` sous un `aria-hidden` s'il l'est. */
  function dedans(n: VueWeb, f: () => string): string {
    const m = n.props.accessibilityHidden === true
    if (m) masque++
    try { return f() } finally { if (m) masque-- }
  }

  function enfants(n: VueWeb, axe: string): string { return dedans(n, () => (n.children || []).map((c, i) => sous(pasDe(c, i), () => vue(c, axe))).join("")) }

  /** Le rang de taille de texte d'un sous-arbre plafonné (`dynamicTypeSize` : { to } ou une taille). */
  function avecPlafond(n: VueWeb, f: () => string): string {
    const d = n.props.dynamicTypeSize
    if (d === undefined) return f()
    const borne = typeof d === "string" ? d : d.to
    const k = ORDRE_TAILLES.indexOf(borne)
    const avant = rangTaille
    if (k >= 0 && typeof d !== "string") rangTaille = Math.min(rangTaille, k)
    else if (k >= 0) rangTaille = k
    if (typeof d === "object" && d.from !== undefined) rangTaille = Math.max(rangTaille, ORDRE_TAILLES.indexOf(d.from))
    try { return f() } finally { rangTaille = avant }
  }

  /** Case cachée d'un sous-onglet monté (CASE_CACHEE d'app.tsx, ticket 4.49) : sans hauteur, rognée, invisible, sans appui. */
  const estCaseCachee = (p: any) => p.opacity === 0 && p.clipped === true && p.allowsHitTesting === false && p.accessibilityHidden === true &&
    p.frame !== undefined && p.frame.height === 0

  /**
   * La pile des sous-onglets montés (app.tsx, ticket 4.49 : une case par sous-onglet déjà ouvert, la visible et les cachées) :
   * chaque case devient une `section data-sous-onglet` (contrat de la page), cachée (`hidden`) sauf la visible, et chaque bloc
   * du sous-onglet un morceau remplaçable « <clé>~<rang> ». Bascule : la page montre une autre section, sans l'app.
   */
  function sousOnglets(n: VueWeb, axe: string): string {
    const decl = ["display:flex", "flex-direction:column", "align-items:flex-start", "gap:0"]
    placement(n, axe, decl)
    const cases = (n.children || []).map((c, i) => sous(pasDe(c, i), () => {
      const cle = String(c.props.key)
      const cache = estCaseCachee(c.props)
      for (const x of c.children) marquerBlocs(x, cle)
      const d = ["display:flex", "flex-direction:column", "align-items:flex-start", "align-self:stretch"]
      // `id` stable (« sous-onglet~<clé> ») : la section se remplace seule (morceaux-web.ts).
      const avant = idParent
      idParent = "sous-onglet~" + cle
      try {
        // Ticket 4.50, phase C : le contenu de la case rendu sans `dedans(c, …)` : une case cachée (accessibilityHidden) ne
        // change rien à la traduction de son sous-onglet (`hidden` le cache déjà à VoiceOver) ; visible ou cachée, la même,
        // et un changement de sous-onglet n'envoie que la bascule.
        const cl = classe(d) // avant le contenu, comme avant : mêmes noms de classes
        const contenu = (c.children || []).map((x, i) => sous(pasDe(x, i), () => vue(x, "col"))).join("")
        return `<section${cl} id="${echapper(idParent)}" data-sous-onglet="${echapper(cle)}"${cache ? " hidden" : ""}>${contenu}</section>`
      } finally { idParent = avant }
    })).join("")
    return `<div${classe(decl)} id="sous-onglets">${cases}</div>`
  }

  function pile(n: VueWeb, axe: string): string {
    const p = n.props
    const f = p.frame || {}
    if (estCaseCachee(p)) return `<div hidden data-case="1"${access(n)}>${enfants(n, "col")}</div>`
    if (p.key === "sous-onglets") return sousOnglets(n, axe)
    // La page (contrat) : à côté de la pile des sous-onglets, chaque vue est un morceau remplaçable « page~<rang> ».
    if ((n.children || []).some((c) => c.props && c.props.key === "sous-onglets")) {
      n.children.forEach((c, i) => { const r = reelle(c); if (r && r.props.key !== "sous-onglets") ids.set(r, "page~" + pasDe(c, i)) })
    }
    // Liste paresseuse de lignes à clé (Parties : une Ligne de partie par clé, lot après lot) : chaque ligne est un morceau
    // « <liste>~k<clé> », la liste « <bloc>~liste » si elle n'est pas le bloc même ; « Voir plus » n'ajoute que des lignes.
    // Une ligne déjà marquée (reprise telle quelle d'un rendu d'avant) garde son identifiant ; un bloc (autre identifiant)
    // n'est pas une ligne : la pile des blocs d'un sous-onglet n'est pas une liste.
    if (n.type === "LazyVStack" && (ids.has(n) || idParent !== "")) {
      const liste = ids.get(n) ?? idParent + "~liste"
      const enf = n.children || []
      const lignes = enf.filter((c) => {
        if (!c || !c.props || c.props.key === undefined || c.props.key === null) return false
        const deja = ids.get(reelle(c))
        return deja === undefined || deja.startsWith(liste + "~k")
      })
      if (lignes.length > 0 && lignes.length === enf.length) {
        if (!ids.has(n)) ids.set(n, liste)
        for (const c of lignes) ids.set(reelle(c), liste + "~k" + String(c.props.key))
      }
    }
    const interne = n.type === "HStack" || n.type === "FlowLayout" ? "row" : n.type === "ZStack" ? "z" : "col"
    const base = p.alignment === "firstTextBaseline" || p.alignment === "lastTextBaseline"
    // Disposition de la pile elle-même (ses enfants), séparée de son cadre.
    const pileDecl: string[] = []
    if (interne === "col") pileDecl.push("display:flex", "flex-direction:column", "align-items:" + H_ALIGN[p.alignment || "center"], "gap:" + px(p.spacing ?? 8))
    else if (interne === "row") {
      pileDecl.push("display:flex", "flex-direction:row", "align-items:" + (V_ALIGN[p.alignment || "center"] || "center"))
      if (n.type === "FlowLayout") pileDecl.push("flex-wrap:wrap", "column-gap:" + px(p.horizontalSpacing ?? 8), "row-gap:" + px(p.verticalSpacing ?? 8))
      else pileDecl.push("gap:" + px(p.spacing ?? 8))
    } else {
      const a = ALIGN2[p.alignment || "center"]
      pileDecl.push("display:grid", "position:relative", "justify-items:" + GRILLE[a[0]], "align-items:" + GRILLE[a[1]])
    }
    // Le cadre de SwiftUI est une boîte autour de la pile, qui y est placée en bloc (alignement du cadre, centre par défaut) :
    // sur l'axe secondaire, quand le cadre peut dépasser la pile (colonne plus large, rangée plus haute, sans enfant qui
    // la remplisse) et que l'alignement du cadre n'est pas celui de la pile, une boîte de cadre l'enveloppe.
    const fa = ALIGN2[f.alignment || "center"]
    const g = gourmandsDedans(n)
    const cadreLarge = f.width !== undefined || f.minWidth !== undefined || f.maxWidth !== undefined
    const cadreHaut = f.height !== undefined || f.minHeight !== undefined || f.maxHeight !== undefined
    const enveloppe = (interne === "col" && cadreLarge && !g.w && fa[0] !== H_ALIGN[p.alignment || "center"]) ||
      (interne === "row" && n.type !== "FlowLayout" && cadreHaut && !g.h && fa[1] !== (V_ALIGN[p.alignment || "center"] || "center"))
    const decl: string[] = []
    if (enveloppe) {
      decl.push("display:flex", "flex-direction:column", "justify-content:" + fa[1], "align-items:" + (interne === "row" && g.w ? "stretch" : fa[0]))
      if (interne === "col" && g.h) pileDecl.push("flex:1 1 auto")
      pileDecl.push("max-width:100%")
    } else {
      decl.push(...pileDecl)
      if (interne === "col") {
        if (f.alignment) decl.push("justify-content:" + fa[1])
        else if (f.minHeight !== undefined || f.height !== undefined || f.maxHeight === "infinity") decl.push("justify-content:center")
      } else if (interne === "row") {
        if (f.alignment) decl.push("justify-content:" + fa[0])
        else if (f.maxWidth === "infinity" && !g.w) decl.push("justify-content:center")
      }
    }
    placement(n, axe, decl)
    // Ticket 4.51 : une pile en fond d'une vue (calque : la bordure et la surface d'une Ligne de partie, le fond de la manche
    // choisie, l'élément ajustable d'une grille) est sous le contenu, à la taille de la vue, comme les formes : avant, elle
    // tombait dans le flux, sans hauteur (fond invisible) et avec un écart de plus.
    if (axe === "calque") {
      decl.push("position:absolute", "inset:0", "z-index:-1")
      if (interne === "col") for (const c of n.children || []) hauteurARemplir.add(c)
    }
    const [dFond, calques] = fond(n)
    decl.push(...dFond)
    let attrs = access(n)
    if (p.mask) {
      const m = (Array.isArray(p.mask) ? p.mask : [p.mask]).find((x: VueWeb) => x && x.type === "PathShape")
      if (m) {
        const t = trace(m.props.draw)
        const poly = polygoneCss(t)
        if (poly && decoupeDeDonnees(poly)) attrs += ` style="clip-path:${poly}"`
        else if (poly) decl.push("clip-path:" + poly)
        else attrs += ` data-m="${traceTexte(t)}"`
      }
    }
    const avant = tailleFixe
    if (f.width !== undefined && f.height !== undefined) tailleFixe = [f.width, f.height]
    const contenu = enfants(n, interne === "row" && base ? "rowb" : interne)
    tailleFixe = avant
    if (enveloppe) {
      // Le décalage des calques et du contenu : les calques restent sur la boîte du cadre.
      return `<div${classe(decl)}${attrs}>${calques}<div${classe(pileDecl)}>${contenu}</div></div>`
    }
    return `<div${classe(decl)}${attrs}>${calques}${contenu}</div>`
  }

  /** Police d'un Text ou d'un morceau stylé, à la taille de texte en cours. */
  function police(p: any, decl: string[]) {
    const role = typeof p.font === "string" ? TAILLES[p.font] : null
    const taille = typeof p.font === "number" ? p.font : role ? role[rangTaille] : TAILLES.body[rangTaille]
    const graisse = p.fontWeight || (p.font === "headline" ? "semibold" : "regular")
    const mono = p.fontDesign === "monospaced"
    if (mono) decl.push(`font:${POIDS[graisse] || 400} ${px(taille)}/normal ui-monospace,Menlo,monospace`)
    else {
      decl.push(`font:${POIDS[graisse] || 400} ${px(taille)}/${px(taille * LIGNE_SF)} var(--sf)`)
      if (p.fontWidth === "condensed") {
        decl.push("font-stretch:condensed")
        const w = WGHT_CONDENSE[graisse]
        if (w !== undefined) decl.push(`font-variation-settings:"wght" ${w},"wdth" ${WDTH_CONDENSE}`)
      } else if (WGHT[graisse] !== undefined && WGHT[graisse] !== POIDS[graisse]) decl.push(`font-variation-settings:"wght" ${WGHT[graisse]}`)
    }
    if (p.monospacedDigit) decl.push("font-variant-numeric:tabular-nums")
    if (p.kerning) decl.push("letter-spacing:" + px(p.kerning))
    if (p.textCase === "uppercase") decl.push("text-transform:uppercase")
    if (p.textCase === "lowercase") decl.push("text-transform:lowercase")
    const c = couleurCss(p.foregroundStyle ?? p.foregroundColor)
    if (c) decl.push("color:" + c)
  }
  function morceau(m: any): string {
    if (m === null || m === undefined) return ""
    if (typeof m === "string" || typeof m === "number") return echapper(m)
    if (Array.isArray(m)) return m.map(morceau).join("")
    const decl: string[] = []
    police(m, decl)
    return `<span${classe(decl)}>${morceau(m.content)}</span>`
  }

  function texte(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = []
    police(p, decl)
    const f = p.frame
    const multi = p.multilineTextAlignment ? ({ center: "center", trailing: "right", leading: "left" } as Record<string, string>)[p.multilineTextAlignment] : null
    if (f) {
      const a = ALIGN2[f.alignment || "center"]
      decl.push("display:flex", "align-items:" + a[1], "justify-content:" + a[0])
    }
    if (multi) decl.push("text-align:" + multi)
    // Un Text de SwiftUI garde ses sauts de ligne et ses espaces, et coupe un mot trop long plutôt que de déborder.
    if (p.lineLimit === 1) decl.push("white-space:nowrap", "overflow:hidden", "text-overflow:ellipsis", "min-width:0")
    else {
      decl.push("white-space:pre-wrap", "overflow-wrap:break-word")
      if (typeof p.lineLimit === "number" && p.lineLimit > 1 && !f) decl.push("display:-webkit-box", "-webkit-box-orient:vertical", "-webkit-line-clamp:" + p.lineLimit, "overflow:hidden")
    }
    placement(n, axe, decl)
    const [dFond, calques] = fond(n)
    decl.push(...dFond)
    const contenu = dedans(n, () => (p.styledText ? morceau(p.styledText) : (n.children || []).map((c) => (c.type === "#text" ? echapper(c.value) : vue(c, "texte"))).join("")))
    const fit = p.minScaleFactor !== undefined ? ` data-fit="${p.minScaleFactor}"` : ""
    return `<div${classe(decl)}${access(n)}${fit}>${calques}${f ? `<span>${contenu}</span>` : contenu}</div>`
  }

  /**
   * Tracé d'un `draw(p, s)` : appelé à trois tailles, chaque coordonnée écrite a + b·w + c·h, vérifiée à une quatrième ; non
   * affine, à la taille fixe de sa pile s'il y en a une, sinon noté (`nonAffines`).
   */
  function trace(draw: Function): Commande[] {
    const releve = (w: number, h: number) => {
      const cmds: (string | number)[][] = []
      const p: any = {
        move(pt: any) { cmds.push(["M", pt.x, pt.y]); return p },
        addLine(pt: any) { cmds.push(["L", pt.x, pt.y]); return p },
        addLines(pts: any[]) { pts.forEach((pt, i) => cmds.push([i === 0 ? "M" : "L", pt.x, pt.y])); return p },
        closeSubpath() { cmds.push(["Z"]); return p },
        addRect(r: any) { cmds.push(["R", r.x, r.y, r.width, r.height]); return p },
        addEllipse(r: any) { cmds.push(["E", r.x, r.y, r.width, r.height]); return p },
      }
      draw(p, { width: w, height: h })
      return cmds
    }
    const affine = affiner([releve(1000, 1000), releve(2000, 1000), releve(1000, 2000), releve(1531, 1777)], [[1000, 1000], [2000, 1000], [1000, 2000], [1531, 1777]])
    if (affine !== null) return affine
    if (tailleFixe !== null) return releve(tailleFixe[0], tailleFixe[1]).map((c) => c.map((v) => (typeof v === "number" ? [v, 0, 0] as Coef : v)))
    poserNonAffine(String(draw).slice(0, 80))
    return releve(370, 100).map((c) => c.map((v) => (typeof v === "number" ? [v, 0, 0] as Coef : v)))
  }

  /** Relevés à plusieurs tailles → commandes aux arguments affines, ou null si une valeur ne l'est pas ou si la suite change. */
  function affiner(releves: (string | number)[][][], tailles: number[][]): Commande[] | null {
    const [r0, r1, r2] = releves
    const [w0, h0] = tailles[0], dw = tailles[1][0] - w0, dh = tailles[2][1] - h0
    for (const r of releves) if (r.length !== r0.length) return null
    const sortie: Commande[] = []
    for (let i = 0; i < r0.length; i++) {
      const cmd: Commande = []
      for (let k = 0; k < r0[i].length; k++) {
        const v0 = r0[i][k]
        if (typeof v0 !== "number") {
          if (releves.some((r) => JSON.stringify(r[i][k]) !== JSON.stringify(v0))) return null
          cmd.push(v0 as any)
          continue
        }
        const b = dw === 0 ? 0 : ((r1[i][k] as number) - v0) / dw, c = dh === 0 ? 0 : ((r2[i][k] as number) - v0) / dh
        const a = v0 - b * w0 - c * h0
        for (let j = 3; j < releves.length; j++) {
          const attendu = a + b * tailles[j][0] + c * tailles[j][1]
          if (Math.abs(attendu - (releves[j][i][k] as number)) > 1e-6) return null
        }
        cmd.push([arrondi(a, 3), arrondi(b, 6), arrondi(c, 6)])
      }
      sortie.push(cmd)
    }
    return sortie
  }

  /**
   * PathShape : un polygone plein (sans trait) en `clip-path` de CSS sur un fond (aucun script, classe partagée par toutes
   * les formes identiques : fonds de Bloc, barres) ; une ellipse sur toute la boîte en `border-radius` ; sinon un SVG retracé
   * par la page à la taille réelle.
   */
  function chemin(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = []
    placement(n, axe === "calque" ? "z" : axe, decl)
    if (axe === "calque") decl.push("position:absolute", "inset:0", "z-index:-1")
    else if (axe === "z") decl.push("position:absolute", "inset:0")
    const t = trace(p.draw)
    const s = p.stroke
    const plein = couleurCss(p.fill)
    if (!s && plein) {
      const poly = polygoneCss(t)
      const e = t.length === 1 && t[0][0] === "E" && coefTexte(t[0][1] as Coef) === "0" && coefTexte(t[0][2] as Coef) === "0" &&
        coefTexte(t[0][3] as Coef) === "w" && coefTexte(t[0][4] as Coef) === "h"
      if (poly && decoupeDeDonnees(poly)) return `<div class="ps ${cls([...decl, "background:" + plein])}" style="clip-path:${poly}"${access(n)}></div>`
      if (poly || e) return `<div class="ps ${cls([...decl, "background:" + plein, poly ? "clip-path:" + poly : "border-radius:50%"])}"${access(n)}></div>`
    }
    const attrs = [`fill="${plein || "none"}"`]
    if (s) {
      attrs.push(`stroke="${couleurCss(s.shapeStyle)}"`, `stroke-width="${(s.strokeStyle && s.strokeStyle.lineWidth) ?? 1}"`)
      if (s.strokeStyle && s.strokeStyle.dash) attrs.push(`stroke-dasharray="${s.strokeStyle.dash.join(" ")}"`)
      if (s.strokeStyle && s.strokeStyle.lineJoin) attrs.push(`stroke-linejoin="${s.strokeStyle.lineJoin}"`)
      if (s.strokeStyle && s.strokeStyle.lineCap) attrs.push(`stroke-linecap="${s.strokeStyle.lineCap}"`)
    }
    const voixSvg = p.accessibilityLabel !== undefined && p.accessibilityHidden !== true ? access(n, "img") : (masque > 0 ? "" : ' aria-hidden="true"')
    return `<svg class="ps ${cls(decl)}"${voixSvg} data-p="${traceTexte(t)}"><path ${attrs.join(" ")}/></svg>`
  }

  function forme(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = []
    placement(n, axe === "calque" ? "z" : axe, decl)
    if (axe === "calque") decl.push("position:absolute", "inset:0", "z-index:-1")
    if (p.fill) decl.push("background:" + couleurCss(p.fill))
    if (n.type === "Circle") decl.push("border-radius:50%")
    if (p.cornerRadius) decl.push("border-radius:" + px(p.cornerRadius))
    if (p.stroke) {
      const plein = typeof p.stroke === "string" || p.stroke.color !== undefined
      const c = plein ? couleurCss(p.stroke) : couleurCss(p.stroke.shapeStyle)
      const l = (!plein && p.stroke.strokeStyle && p.stroke.strokeStyle.lineWidth) || 1
      decl.push(`outline:${px(l)} solid ${c}`, `outline-offset:${px(-l / 2)}`)
    }
    // Une forme vide n'a rien à dire à VoiceOver : ni rôle ni texte, inutile de la cacher.
    return `<div${classe(decl)}${access(n)}></div>`
  }

  /** Grid : grille CSS ; une vue hors GridRow occupe une ligne entière ; gridColumnAlignment vaut pour toute la colonne. */
  function grille(n: VueWeb, axe: string): string {
    const p = n.props
    const aplatir = (xs: VueWeb[]): VueWeb[] => xs.flatMap((c) => (TRANSPARENTS.has(c.type) ? aplatir(c.children) : [c]))
    const lignes = aplatir(n.children || [])
    let nCol = 1
    for (const r of lignes) if (r.type === "GridRow") nCol = Math.max(nCol, aplatir(r.children).reduce((s, c) => s + (c.props.gridCellColumns || 1), 0))
    const alignCol: string[] = new Array(nCol).fill(p.alignment ? ALIGN2[p.alignment][0] : "center")
    const souple: boolean[] = new Array(nCol).fill(false)
    for (const r of lignes) if (r.type === "GridRow") {
      let k = 0
      for (const c of aplatir(r.children)) {
        if (c.props.gridColumnAlignment) alignCol[k] = H_ALIGN[c.props.gridColumnAlignment]
        if ((c.props.gridCellColumns || 1) === 1 && gourmand(c).w) souple[k] = true
        k += c.props.gridCellColumns || 1
      }
    }
    const decl = ["display:grid", "grid-template-columns:" + souple.map((s) => (s ? "minmax(0,1fr)" : "auto")).join(" "),
      "justify-content:start", "column-gap:" + px(p.horizontalSpacing ?? 8), "row-gap:" + px(p.verticalSpacing ?? 8)]
    placement(n, axe, decl)
    const html = dedans(n, () => {
      let h = ""
      for (const r of lignes) {
        const rang = String(lignes.indexOf(r))
        if (r.type !== "GridRow") { h += `<div${classe(["grid-column:1/-1", "display:flex", "flex-direction:column"])}>${sous("g" + rang, () => vue(r, "col"))}</div>`; continue }
        let k = 0
        const va = V_ALIGN[r.props.alignment || "center"] || "center"
        const base = va === "baseline" || va === "last baseline"
        for (const c of aplatir(r.children)) {
          const span = c.props.gridCellColumns || 1
          // Une vue qui ne demande pas sa taille (gridCellUnsizedAxes) prend celle de la case sans élargir la colonne.
          const u = nonDimensionne(c.props)
          const large = gourmand(c).w || u.w
          const d = ["align-self:" + (u.h ? "stretch" : va), "justify-self:" + (large ? "stretch" : GRILLE[alignCol[k]]), "display:flex", "flex-direction:column"]
          if (large) d.push("align-items:stretch")
          else d.push("align-items:" + alignCol[k])
          if (span > 1) d.push("grid-column:span " + span)
          h += `<div${classe(d)}>${sous("g" + rang + "." + k, () => vue(c, base ? "cellb" : "cell"))}</div>`
          k += span
        }
        for (; k < nCol; k++) h += "<div></div>"
      }
      return h
    })
    return `<div${classe(decl)}${access(n)}>${html}</div>`
  }

  /** Graphique : marques en tracés affines sur les échelles (dates, nombres ou catégories), dans un SVG à la taille réelle. */
  function graphique(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = []
    placement(n, axe, decl)
    decl.push("position:relative")
    const t = (v: any) => (v instanceof Date ? v.getTime() : typeof v === "string" && !Array.isArray(p.chartXScale) ? Date.parse(v) : v)
    const cat: string[] | null = Array.isArray(p.chartXScale) ? p.chartXScale.map(String) : null
    const xs = p.chartXScale, ys = p.chartYScale
    const x0 = cat ? 0 : t(xs.from), x1 = cat ? 1 : t(xs.to), y0 = ys.from, y1 = ys.to
    // Catégories : chaque bande d'égale largeur, la marque à son milieu (Swift Charts).
    const X = (v: any): Coef => (cat ? [0, (cat.indexOf(String(v)) + 0.5) / cat.length, 0] : [0, (t(v) - x0) / (x1 - x0), 0])
    const Y = (v: number): Coef => [0, 0, 1 - (v - y0) / (y1 - y0)]
    const styles = p.chartForegroundStyleScale || {}
    const traits = p.chartLineStyleScale || {}
    const path = (cmds: Commande[], attrs: string) => `<path ${attrs} data-p="${traceTexte(cmds)}"/>`
    const trait = (ls: any) => {
      if (!ls) return ""
      let s = ` stroke-width="${ls.lineWidth ?? 1}"`
      if (ls.dash) s += ` stroke-dasharray="${ls.dash.join(" ")}"`
      if (ls.lineJoin) s += ` stroke-linejoin="${ls.lineJoin}"`
      return s
    }
    let svg = ""
    for (const s of n.children || []) {
      const m: any[] = s.props.marks || []
      if (m.length === 0) continue
      if (s.type === "RangeAreaChart") {
        const c = couleurCss(styles[m[0].foregroundStyleBy] ?? m[0].foregroundStyle)
        const cmds: Commande[] = [["M", X(m[0].label), Y(m[0].end)], ...m.slice(1).map((k) => ["L", X(k.label), Y(k.end)] as Commande),
          ...[...m].reverse().map((k) => ["L", X(k.label), Y(k.start)] as Commande), ["Z"]]
        svg += path(cmds, `fill="${c}"`)
      } else if (s.type === "LineChart" || s.type === "LineCategoryChart") {
        const series = new Map<string, any[]>()
        for (const k of m) { const cle = k.category ?? ""; if (!series.has(cle)) series.set(cle, []); series.get(cle)!.push(k) }
        for (const [cle, ks] of series) {
          const k0 = ks[0]
          const c = couleurCss(k0.foregroundStyle ?? styles[k0.foregroundStyleBy ?? cle])
          const ls = k0.lineStyle ?? traits[k0.lineStyleBy ?? cle]
          const cmds: Commande[] = ks.map((k, i) => [i === 0 ? "M" : "L", X(k.label), Y(k.value)] as Commande)
          svg += path(cmds, `fill="none" stroke="${c}"${trait(ls) || ' stroke-width="2"'}`)
        }
      } else if (s.type === "RuleLineForValueChart") {
        for (const k of m) svg += path([["M", [0, 0, 0], Y(k.value)], ["L", [0, 1, 0], Y(k.value)]], `fill="none" stroke="${couleurCss(k.foregroundStyle)}"${trait(k.lineStyle) || ' stroke-width="1"'}`)
      } else if (s.type === "BarChart") {
        const bande = cat ? 1 / cat.length : 0.05
        for (const k of m) {
          const r = k.width && k.width.type === "ratio" ? k.width.value : 0.8
          const cx = X(k.label)[1], demi = (bande * r) / 2
          const haut = Y(Math.max(0, k.value))[2], bas = Y(Math.min(0, k.value))[2]
          svg += path([["M", [0, cx - demi, 0], [0, 0, haut]], ["L", [0, cx + demi, 0], [0, 0, haut]], ["L", [0, cx + demi, 0], [0, 0, bas]], ["L", [0, cx - demi, 0], [0, 0, bas]], ["Z"]], `fill="${couleurCss(k.foregroundStyle)}"`)
        }
      } else noter("Chart>" + s.type)
    }
    // Un graphique étiqueté se lit d'un bloc, comme une image (Swift Charts : son étiquette, sans ses marques).
    const el = p.accessibilityElement
    const role = p.accessibilityLabel !== undefined && (el === true || el === "ignore" || el === "combine") ? "img" : undefined
    return `<div${classe(decl)}${access(n, role)}><svg class="ps pl" aria-hidden="true">${svg}</svg></div>`
  }

  /** Canvas : les appels de `draw(ctx, taille)` relevés à plusieurs largeurs (hauteur du cadre), rejoués par la page. */
  function toile(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = ["display:block"]
    placement(n, axe, decl)
    const h = (p.frame && p.frame.height) || 100
    const releve = (w: number, hh: number) => {
      const cmds: (string | number)[][] = []
      const etat: Record<string, unknown> = {}
      const ctx = new Proxy(etat, {
        get(_c, cle: string | symbol) {
          const nom = String(cle)
          if (nom in etat) return etat[nom]
          return (...args: unknown[]) => { cmds.push(["." + nom, ...args.map((a) => (Array.isArray(a) ? JSON.stringify(a) : a)) as (string | number)[]]); return undefined }
        },
        set(_c, cle: string | symbol, v: unknown) { const nom = String(cle); etat[nom] = v; cmds.push(["=" + nom, v as string | number]); return true },
      })
      p.draw(ctx, { width: w, height: hh })
      return cmds
    }
    const tailles = [[340, h], [400, h], [340, h + 50], [371, h]]
    let cmds = affiner(tailles.map(([w, hh]) => releve(w, hh)), tailles)
    if (cmds === null) {
      poserNonAffine("Canvas " + String(p.draw).slice(0, 60))
      cmds = releve(370 - 64, h).map((c) => c.map((v) => (typeof v === "number" ? [v, 0, 0] as Coef : v)))
    }

    const court = cmds.map((c) => c.map((v) => (Array.isArray(v) ? (v[1] === 0 && v[2] === 0 ? v[0] : "~" + coefTexte(v)) : v)))
    const el = p.accessibilityElement
    const role = p.accessibilityLabel !== undefined && (el === true || el === "ignore" || el === "combine") ? "img" : undefined
    return `<canvas class="cv ${cls(decl)}"${access(n, role)} data-c="${echapper(JSON.stringify(court))}"></canvas>`
  }

  /**
   * Image d'un symbole SF : le cadre du symbole (CADRES_SF, à la taille de sa police), sa ligne de base sur celle du texte dans
   * une rangée alignée sur la ligne de base ; le dessin du système (imageSF : masque teint de la couleur, ou palette cuite)
   * quand Scripting le donne, sinon le SVG approché.
   */
  function image(n: VueWeb, axe: string): string {
    const p = n.props
    const t = typeof p.font === "number" ? p.font : typeof p.font === "string" && TAILLES[p.font] ? TAILLES[p.font][rangTaille] : TAILLES.body[rangTaille]
    const graisse = p.fontWeight || (p.font === "headline" ? "semibold" : "regular")
    const nom = String(p.systemName)
    const cadre = CADRES_SF[nom + "|" + graisse] || CADRES_SF[nom] || null
    const [W, H, B] = cadre ? cadre.map((v) => (v * t) / 100) : [t * 1.25, t * 1.25, t * 0.2]
    const fg = p.foregroundStyle
    const palette = fg && typeof fg === "object" && fg.primary !== undefined ? [couleurCss(fg.primary) || "#000", couleurCss(fg.secondary) || "#000"] : null
    const couleur = palette ? palette[1] : couleurCss(fg) || "currentColor"
    const decl = ["display:block", "width:" + px(W), "height:" + px(H), "flex-shrink:0"]
    placement(n, axe, decl)
    // Ligne de base : le bas du cadre (ligne de base synthétique d'une boîte) descend de celle du symbole.
    if ((axe === "rowb" || axe === "cellb") && B > 0) decl.push("position:relative", "top:" + px(B))
    const voixImg = p.accessibilityLabel !== undefined && p.accessibilityHidden !== true ? access(n, "img") : (masque > 0 ? "" : ' aria-hidden="true"') + identite(n)
    if (cadre === null && SYMBOLES[nom] === undefined) noter("Image:" + nom)
    const png = cadre !== null ? imageSF(nom, graisse, t, palette) : null
    if (png !== null) {
      // Le dessin dans sa propre classe (une par symbole, taille, graisse et palette), le cadre et la teinte dans une autre.
      const url = `url(data:image/png;base64,${png})`
      if (!palette) decl.push(`background-color:${couleur}`)
      const dessin = cls([palette ? `background:${url} center/100% 100% no-repeat` : `-webkit-mask:${url} center/100% 100% no-repeat`])
      return `<i class="${cls(decl)} ${dessin}"${voixImg}></i>`
    }
    if (palette) decl.push("--s1:" + palette[0], "--s2:" + palette[1], "color:" + palette[1])
    else decl.push("color:" + couleur)
    return `<svg viewBox="-3 -3 30 30"${classe(decl)}${voixImg}>${SYMBOLES[nom] || ""}</svg>`
  }

  const BOUTON = ["display:flex", "flex-direction:column", "align-items:stretch", "padding:0", "margin:0", "border:0", "background:none",
    "color:inherit", "font:inherit", "text-align:inherit", "cursor:pointer", "-webkit-tap-highlight-color:transparent"]
  /**
   * Button : `<button>` (rôle et appui natifs). Titre (`isHeader`) : VoiceOver de SwiftUI lit « titre, bouton » ; un bouton
   * HTML ne peut porter les deux rôles, ses enfants n'étant pas lus : une enveloppe `role="heading"` porte son placement et le
   * bouton la remplit (comme `<h2><button>`).
   */
  function bouton(n: VueWeb, axe: string): string {
    const p = n.props
    const titre = traitsDe(p).includes("isHeader") && p.accessibilityHidden !== true
    const decl = [...BOUTON]
    const enveloppe: string[] = ["display:flex", "flex-direction:column"]
    placement(n, axe, titre ? enveloppe : decl)
    if (titre) decl.push("flex:1 1 auto")
    const actif = typeof p.action === "function" && p.disabled !== true
    if (p.disabled === true) decl.push("pointer-events:none")
    const id = actif ? action(p.action) : null
    const corps = `<button${classe(decl)}${id ? ` data-action="${echapper(id)}"` : ""}${p.disabled ? ' aria-disabled="true"' : ""}${titre ? aria(n, null) : access(n)}>${enfants(n, "col")}</button>`
    return titre ? `<div${classe(enveloppe)} role="heading"${identite(n)}>${corps}</div>` : corps
  }
  function menu(n: VueWeb, axe: string): string {
    const p = n.props
    const decl = [...BOUTON]
    placement(n, axe, decl)
    const label = dedans(n, () => sous("label", () => (Array.isArray(p.label) ? p.label : []).map((x: VueWeb, i: number) => sous(String(i), () => vue(x, "col"))).join("")))
    // Natif (phase B) : l'app présente le choix ; `menus` garde le Menu (ses Picker) sous son identifiant. VoiceOver : « menu
    // local », comme le bouton de menu de SwiftUI.
    const id = ident("m", menus)
    poserMenu(id, n)
    return `<button${classe(decl)} data-action="menu" data-valeur="${echapper(id)}" aria-haspopup="menu"${access(n)}>${label}</button>`
  }
  function lien(n: VueWeb, axe: string): string {
    const decl = [...BOUTON]
    placement(n, axe, decl)
    return `<a${classe(decl)} data-action="lien" data-valeur="${echapper(n.props.url ?? "")}"${access(n, "link")}>${enfants(n, "col")}</a>`
  }
  /**
   * Stepper (ElementAjustable de dessin.tsx : la Barre de sous-onglets, les Puces de choix) : un seul élément ajustable pour
   * VoiceOver, invisible, sans appui. En page : un curseur natif (`input type=range`, que VoiceOver lit « nom, valeur,
   * ajustable » et règle d'un balayage), ses deux actions sur deux éléments `data-action` muets (« plus », « moins ») que le
   * script de la page touche selon le sens du réglage (le curseur revient au milieu).
   */
  function ajustable(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = ["display:block"]
    placement(n, axe === "calque" ? "z" : axe, decl)
    if (axe === "calque") decl.push("position:absolute", "inset:0", "z-index:-1")
    decl.push("pointer-events:none")
    const plus = typeof p.onIncrement === "function" ? sous("plus", () => action(p.onIncrement)) : null
    const moins = typeof p.onDecrement === "function" ? sous("moins", () => action(p.onDecrement)) : null
    const nom = p.accessibilityLabel ?? p.title ?? ""
    const cache = p.accessibilityHidden === true || masque > 0
    const champ = `<input type="range" min="0" max="2" step="1" value="1" class="aj" data-ajuste="1"${cache ? ' aria-hidden="true" tabindex="-1"' : ""}` +
      ` aria-label="${echapper(nom)}"${p.accessibilityValue ? ` aria-valuetext="${echapper(p.accessibilityValue)}"` : ""}/>`
    const sens = (id: string | null, s: string) => (id ? `<i hidden data-action="${echapper(id)}" data-sens="${s}"></i>` : "")
    // Un morceau remplaçable à lui seul (« ajustable~<chemin> ») : sa valeur change à chaque réglage sans rien changer d'autre
    // (la Barre de sous-onglets est hors des blocs).
    if (!ids.has(n)) ids.set(n, "ajustable~" + trajet.join("."))
    return `<div${classe(decl)}${identite(n)}>${champ}${sens(plus, "1")}${sens(moins, "-1")}</div>`
  }





  function choixDeDate(n: VueWeb, axe: string): string {
    const p = n.props
    const ecrite = dateCompacte(p.value, p.displayedComponents)
    const id = ident("d", dates)
    poserDate(id, n)
    const pol: string[] = []
    police({ font: "body" }, pol)
    const capsule = [...BOUTON, ...pol, "color:#ffffff", "padding:7px 11px", "border-radius:6px", "background:rgba(118,118,128,.24)", "white-space:nowrap", "align-self:center"]
    const nom = String(p.title ?? "")
    const voixDate = ` aria-label="${echapper(nom + (ecrite ? ", " + ecrite : ""))}" aria-haspopup="dialog"`
    const bouton = `<button${classe(capsule)} data-action="date" data-valeur="${echapper(id)}"${voixDate}>${echapper(ecrite)}</button>`
    // Le cadre (`frame`, une rangée de 44 au moins) enveloppe la capsule, centrée, qui garde sa hauteur.
    const rangee = ["display:flex", "flex-direction:row", "align-items:center", "gap:8px"]
    placement(n, axe, rangee)
    const cache = p.accessibilityHidden === true && masque === 0 ? ' aria-hidden="true"' : ""
    const titre = p.labelsHidden ? "" : `<div${classe([...pol, "color:#ffffff", "flex:1 1 0", "min-width:0"])} aria-hidden="true">${echapper(nom)}</div>`
    return `<div${classe(rangee)}${cache}${identite(n)}>${titre}${bouton}</div>`
  }
  function defilement(n: VueWeb, axe: string): string {
    const p = n.props
    const decl: string[] = []
    placement(n, axe, decl)
    if (p.axes === "horizontal") {
      decl.push("display:flex", "overflow-x:auto", "overflow-y:hidden", "scrollbar-width:none")
      const barre = (function cherche(x: VueWeb): boolean { return x.type === "Button" && x.props.key === "vue-ensemble" || (x.children || []).some(cherche) })(n)
      if (barre) ids.set(n, "barre")
      const pos = p.scrollPosition && p.scrollPosition.value !== undefined && p.scrollPosition.value !== null ? ` data-pos="${echapper(p.scrollPosition.value)}"` : ""
      return `<div class="${cls(decl)} hscroll"${pos}${access(n)}>${enfants(n, "row")}</div>`
    }
    decl.push("display:flex", "flex-direction:column", "align-items:center")
    return `<div${classe(decl)} data-defile="1"${access(n)}>${enfants(n, "col")}</div>`
  }
  /**
   * ProgressView circulaire : l'indicateur d'activité d'iOS (huit rayons, de plus en plus pâles, qui tournent par crans), à la
   * teinte donnée ; 20 points, 16 en petit (`controlSize`).
   */
  function progression(n: VueWeb, axe: string): string {
    const p = n.props
    const c = p.controlSize === "small" || p.controlSize === "mini" ? 16 : 20
    const decl = ["display:block", "width:" + px(c), "height:" + px(c), "flex-shrink:0", "color:" + (couleurCss(p.tint) || "#9aa7b4"), "animation:vs-tourne 1s steps(8) infinite"]
    placement(n, axe, decl)
    let rayons = ""
    for (let k = 0; k < 8; k++) rayons += `<path d="M12 2.6v5" transform="rotate(${k * 45} 12 12)" opacity="${nombre(arrondi(1 - k * 0.11, 2))}"/>`
    return `<svg viewBox="0 0 24 24"${classe(decl)} role="progressbar"${access(n)}><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round">${rayons}</g></svg>`
  }

  function vue(n: VueWeb, axe: string = "col"): string {
    if (!n) return ""
    if (n.type === "#text") return echapper(n.value)
    if (TRANSPARENTS.has(n.type)) return enfants(n, axe)
    if (MUETS.has(n.type)) return ""
    if (!OPTIONS_TRADUCTION.cache || poidsDe(n) < POIDS_GARDE) return traduire(n, axe)
    const cle = trajet.join(".") + "|" + axe + "|" + rangTaille + "|" + masque + "|" + (tailleFixe ? tailleFixe.join("x") : "") + "|" + (ids.get(n) ?? "") + "|" + idParent
    const g = gardees.get(n)
    if (g !== undefined && g.cle === cle && g.actions.every((x) => !actions.has(x[0])) && g.menus.every((x) => !menus.has(x[0])) && g.dates.every((x) => !dates.has(x[0]))) {
      for (const [id, f] of g.actions) poserAction(id, f)
      for (const [id, v] of g.menus) poserMenu(id, v)
      for (const [id, v] of g.dates) poserDate(id, v)
      for (const q of g.inconnus) noter(q)
      for (const x of g.nonAffines) poserNonAffine(x)
      return g.html
    }
    const r: Traces = { actions: [], menus: [], dates: [], inconnus: [], nonAffines: [] }
    enregistreurs.push(r)
    let html: string
    try { html = traduire(n, axe) } finally { enregistreurs.pop() }
    gardees.set(n, { ...r, cle, html })
    return html
  }
  /** Nombre de nœuds d'un sous-arbre (vues des props comprises), gardé par nœud. */
  function poidsDe(n: VueWeb): number {
    if (!n || typeof n !== "object") return 0
    const d = poids.get(n)
    if (d !== undefined) return d
    let k = 1
    for (const c of n.children || []) k += poidsDe(c)
    for (const v of Object.values(n.props || {})) if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && c.type !== undefined && c.props !== undefined) k += poidsDe(c)
    poids.set(n, k)
    return k
  }

  /** La traduction d'une vue, sans garde ; un morceau remplaçable devient le parent des identifiants de lignes dessous. */
  function traduire(n: VueWeb, axe: string): string {
    const id = ids.get(n)
    if (id === undefined) return traduireVue(n, axe)
    const avant = idParent
    idParent = id
    try { return traduireVue(n, axe) } finally { idParent = avant }
  }
  function traduireVue(n: VueWeb, axe: string): string {
    return avecPlafond(n, () => {
      switch (n.type) {
        case "VStack": case "LazyVStack": case "HStack": case "ZStack": case "FlowLayout": return pile(n, axe)
        case "Text": return texte(n, axe)
        case "PathShape": return chemin(n, axe)
        case "Rectangle": case "RoundedRectangle": case "Circle": return forme(n, axe)
        case "Grid": return grille(n, axe)
        case "Chart": return graphique(n, axe)
        case "Canvas": return toile(n, axe)
        case "Image": return image(n, axe)
        case "Button": return bouton(n, axe)
        case "Menu": return menu(n, axe)
        case "Link": return lien(n, axe)
        case "ScrollView": return defilement(n, axe)
        case "ProgressView": return progression(n, axe)
        case "Stepper": return ajustable(n, axe)
        case "DatePicker": return choixDeDate(n, axe)
        case "Section": {
          // Section d'une pile (tailles d'accessibilité : la Barre de sous-onglets, en-tête épinglé) : l'en-tête collant, puis le contenu.
          const tete = sous("header", () => (Array.isArray(n.props.header) ? n.props.header : []).map((x: VueWeb, i: number) => sous(String(i), () => vue(x, "col"))).join(""))
          const d = ["display:flex", "flex-direction:column", "align-items:stretch", "align-self:stretch"]
          return `<div${classe(d)}>${tete ? `<div${classe(["position:sticky", "top:0", "z-index:5", "display:flex", "flex-direction:column"])}>${tete}</div>` : ""}${enfants(n, "col")}</div>`
        }
        case "Spacer": return `<div${classe(axe === "row" || axe === "rowb" ? ["flex:1 1 0", "min-width:8px"] : ["flex:1 1 0", "min-height:8px"])}></div>`
        default:
          noter(n.type)
          return `<div data-inconnu="${echapper(n.type)}"></div>`
      }
    })
  }

  /** Ticket 4.51 : la première pile paresseuse sous `n` (hors des boutons), ses blocs marqués ; puis `n` traduite sous `cle`. */
  function vueSeparee(cle: string, n: VueWeb): string {
    const cherche = (x: VueWeb): VueWeb | null => {
      if (!x || x.type === "#text" || x.type === "Button") return null
      if (x.type === "LazyVStack") return x
      for (const c of x.children || []) { const r = cherche(c); if (r) return r }
      return null
    }
    const pileDeBlocs = cherche(n)
    if (pileDeBlocs !== null) marquerBlocs(pileDeBlocs, cle)
    return sous(cle, () => vue(n))
  }

  return {
    vue, vueSeparee, actions, menus, dates, inconnus, nonAffines,
    nombreDeClasses: () => classes.size,
    css: (depuis = 0) => [...classes].slice(depuis).map(([d, c]) => `.${c}{${d}}`).join("\n"),
  }
}

/** Feuille de base de la page (avant les classes du traducteur). */
export const CSS_BASE = `:root{--sf:${POLICE_SF};color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0b0f14;color:#e8edf2;-webkit-text-size-adjust:100%;font:400 17px/${px(17 * LIGNE_SF)} var(--sf);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
[hidden]{display:none!important}
.ps{display:block;width:100%;height:100%;overflow:visible}
.hscroll::-webkit-scrollbar{display:none}
.hscroll>*{flex:none;width:max-content}
button,a{appearance:none;touch-action:manipulation}
button:active{opacity:.6}
.aj{display:block;width:100%;height:100%;margin:0;opacity:0;-webkit-appearance:none;appearance:none;background:none}
@keyframes vs-tourne{to{transform:rotate(360deg)}}
`

/**
 * Le script de la page (WebKit) : tracés et toiles à la taille réelle, ajustement des textes, défilement des puces, réglage
 * des éléments ajustables (VoiceOver). Rejoué sans dommage (écoute posée une fois par page).
 */
export const SCRIPT_PAGE = String.raw`(() => {
  const val = (c, w, h) => (typeof c === "object" && c !== null ? c[0] + c[1] * w + c[2] * h : c)
  const r2 = (v) => Math.round(v * 100) / 100
  // Une coordonnée écrite court par la traduction (« -18+h », « 0.5w+3 ») : [a, b, c].
  function coef(t) {
    let a = 0, b = 0, c = 0
    for (const x of t.match(/[+-]?[0-9.]*[wh]?/g) || []) {
      if (!x) continue
      const l = x[x.length - 1]
      if (l === "w" || l === "h") { const s = x.slice(0, -1), v = s === "" || s === "+" ? 1 : s === "-" ? -1 : +s; if (l === "w") b += v; else c += v }
      else a += +x
    }
    return [a, b, c]
  }
  // Un tracé écrit court (« M0 0L1w 0Z ») : ses commandes.
  function lire(s) {
    const out = []
    for (const m of s.matchAll(/([MLZRE])([^MLZRE]*)/g)) { const t = m[2].trim(); out.push([m[1]].concat(t ? t.split(/\s+/).map(coef) : [])) }
    return out
  }
  function chemin(cmds, w, h) {
    let d = ""
    for (const c of cmds) {
      const t = c[0]
      if (t === "Z") d += "Z"
      else if (t === "M" || t === "L") d += t + r2(val(c[1], w, h)) + " " + r2(val(c[2], w, h))
      else if (t === "R") { const x = val(c[1], w, h), y = val(c[2], w, h), W = val(c[3], w, h), H = val(c[4], w, h); d += "M" + r2(x) + " " + r2(y) + "h" + r2(W) + "v" + r2(H) + "h" + r2(-W) + "Z" }
      else if (t === "E") { const x = val(c[1], w, h), y = val(c[2], w, h), W = val(c[3], w, h) / 2, H = val(c[4], w, h) / 2; d += "M" + r2(x) + " " + r2(y + H) + "a" + r2(W) + " " + r2(H) + " 0 1 0 " + r2(2 * W) + " 0a" + r2(W) + " " + r2(H) + " 0 1 0 " + r2(-2 * W) + " 0Z" }
    }
    return d
  }
  function polygone(cmds, w, h) {
    const pts = []
    for (const c of cmds) if (c[0] === "M" || c[0] === "L") pts.push(r2(val(c[1], w, h)) + "px " + r2(val(c[2], w, h)) + "px")
    return "polygon(" + pts.join(",") + ")"
  }
  const SF = getComputedStyle(document.documentElement).getPropertyValue("--sf")
  const arg = (x) => (typeof x === "string" && x[0] === "~" ? coef(x.slice(1)) : typeof x === "string" && x[0] === "[" ? JSON.parse(x) : x)
  function toile(el, w, h) {
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr)
    const ctx = el.getContext("2d")
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    el._c = el._c || JSON.parse(el.dataset.c)
    for (const c of el._c) {
      const nom = c[0].slice(1)
      if (c[0][0] === "=") { const v = val(arg(c[1]), w, h); ctx[nom] = nom === "font" && typeof v === "number" ? v + "px " + SF : v }
      else {
        const a = c.slice(1).map((x) => { const v = arg(x); return Array.isArray(v) && v.length === 3 && typeof x === "string" && x[0] === "~" ? val(v, w, h) : v })
        if (typeof ctx[nom] === "function") ctx[nom](...a)
      }
    }
  }
  function dessiner(el, w, h) {
    if (w === 0 && h === 0) return
    if (el.dataset.m) { el._m = el._m || lire(el.dataset.m); el.style.clipPath = polygone(el._m, w, h); return }
    if (el.dataset.c) { toile(el, w, h); return }
    if (el.dataset.p) { el._p = el._p || lire(el.dataset.p); el.firstChild.setAttribute("d", chemin(el._p, w, h)); return }
    for (const p of el.children) { p._p = p._p || lire(p.dataset.p); p.setAttribute("d", chemin(p._p, w, h)) }
  }
  const ro = new ResizeObserver((es) => { for (const e of es) dessiner(e.target, e.contentRect.width, e.contentRect.height) })
  // « propre » : le texte remis à sa taille, réduit tant qu'il sort lui-même de sa case ; sinon (seconde passe, sans remise)
  // réduit tant que lui ou une case qui le porte déborde.
  function ajuster(el, propre) {
    // Ticket 4.51 : un texte qui n'est pas affiché (section ou vue cachée) n'a pas de mesure : laissé tel quel, ajusté quand
    // l'hôte le montre (ajusterTextes). Avant, il était réduit au plus (bords à zéro, marge du parent : « déborde »).
    if (!el.getClientRects().length) return
    const min = +el.dataset.fit
    if (propre) el.style.fontSize = ""
    const base = parseFloat(getComputedStyle(el).fontSize) / (propre || !el.style.fontSize ? 1 : el._echelle || 1)
    let t = propre || !el.style.fontSize ? base : parseFloat(el.style.fontSize)
    const sort = () => {
      const p = el.parentElement
      if (!p || p === document.body) return false
      const bord = p.getBoundingClientRect().right - parseFloat(getComputedStyle(p).paddingRight)
      return el.getBoundingClientRect().right > bord + 0.5 || el.scrollWidth > el.clientWidth + 0.5
    }
    // Le texte, ou la rangée qui le porte (bouton servi le premier, layoutPriority), déborde : réduit jusqu'à tenir, au plus à min.
    const deborde = () => {
      for (let a = el, k = 0; a.parentElement && a.parentElement !== document.body && k < 14; k++, a = a.parentElement) {
        const p = a.parentElement, bord = p.getBoundingClientRect().right - parseFloat(getComputedStyle(p).paddingRight)
        if (a.getBoundingClientRect().right > bord + 0.5 || a.scrollWidth > a.clientWidth + 0.5) return true
      }
      return false
    }
    const test = propre ? sort : deborde
    while (test() && t > base * min) { t -= 0.25; el.style.fontSize = t + "px" }
    el._echelle = t / base
    el._ajuste = true
  }
  // Ticket 4.51 : deux passes. D'abord chaque texte qui sort lui-même de sa case (comme un Text de SwiftUI, réduit seul) ;
  // puis ceux dont une case qui les porte déborde encore (rangée qui ne tient pas : le bouton servi le premier). Avant, une
  // seule passe dans l'ordre du document : un texte réduisait aussi ses voisins d'une même case (« 11 » réduit par « ●●● »).
  function ajusterTous(racine, neufs) {
    const els = Array.from(racine.querySelectorAll("[data-fit]")).filter((el) => !neufs || !el._ajuste)
    for (const el of els) ajuster(el, true)
    for (const el of els) ajuster(el, false)
  }
  function positionner(el) {
    const cible = el.querySelector('[data-cle="' + CSS.escape(el.dataset.pos) + '"]')
    if (cible) el.scrollLeft = cible.offsetLeft - (el.clientWidth - cible.offsetWidth) / 2
  }
  window.vs = window.vs || {}
  // Élément ajustable (VoiceOver) : un réglage du curseur touche l'action de son sens, le curseur revient au milieu ; le
  // morceau remplacé ensuite, VoiceOver est ramené sur le curseur de même nom (focus).
  if (!window.vs.ecoute) {
    window.vs.ecoute = true
    document.addEventListener("input", (e) => {
      const el = e.target
      if (!el || !el.dataset || el.dataset.ajuste !== "1") return
      const v = +el.value
      el.value = "1"
      if (v === 1) return
      const b = el.parentElement && el.parentElement.querySelector('[data-sens="' + (v > 1 ? "1" : "-1") + '"]')
      window.vs.ajuste = { nom: el.getAttribute("aria-label"), t: Date.now() }
      if (b) b.click()
    }, true)
  }
  window.vs.observer = (racine) => {
    for (const el of racine.querySelectorAll(".ps:not(div),.cv,[data-m]")) ro.observe(el)
    ajusterTous(racine)
    for (const el of racine.querySelectorAll("[data-pos]")) positionner(el)
    const a = window.vs.ajuste
    if (a && Date.now() - a.t < 3000) {
      for (const el of racine.querySelectorAll("input[data-ajuste]")) if (el.getAttribute("aria-label") === a.nom && document.activeElement !== el) { el.focus({ preventScroll: true }); break }
    }
  }
  // Ticket 4.51 : les textes ajustés d'une section ou d'une vue que l'hôte vient de montrer (basculer, montrer).
  // Relecture 7 : seulement ceux qui n'ont pas encore été ajustés (posés cachés) : rien à mesurer pour un morceau déjà vu.
  window.vs.ajusterTextes = (racine) => ajusterTous(racine, true)
  window.vs.observer(document)
})();
`

/**
 * Les textes d'un morceau de HTML produit ici, dans l'ordre : contenus et étiquettes (`aria-label`), entités rendues. Sert au
 * harnais : la suite doit être celle de l'arbre (textesDeVue).
 */
export function textesDuHtml(html: string): string[] {
  const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  const out: string[] = []
  const re = /<\/?([a-z]+)\b([^>]*)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[3] !== undefined) { out.push(dec(m[3])); continue }
    const l = /\saria-label="([^"]*)"/.exec(m[2])
    if (l) out.push("@" + dec(l[1]))
  }
  return out
}

/**
 * Les textes d'un arbre rendu, dans l'ordre de textesDuHtml : étiquettes (`@`, valeur comprise comme VoiceOver la lit : voix)
 * puis contenus ; contenus de menu et muets exclus.
 */
export function textesDeVue(n: VueWeb, out: string[] = []): string[] {
  if (!n || MUETS.has(n.type)) return out
  if (n.type === "#text") { out.push(n.value || ""); return out }
  const p = n.props
  if (n.type === "Stepper") { out.push("@" + (p.accessibilityLabel ?? p.title ?? "")); return out }
  if (!TRANSPARENTS.has(n.type) && p.accessibilityLabel !== undefined && p.accessibilityHidden !== true) out.push("@" + voix(n))
  if (n.type === "Text" && p.styledText) {
    const m = (x: any): void => { if (typeof x === "string" || typeof x === "number") out.push(String(x)); else if (Array.isArray(x)) x.forEach(m); else if (x) m(x.content) }
    m(p.styledText)
    return out
  }
  if (Array.isArray(p.background)) for (const b of p.background) textesDeVue(b, out)
  if (n.type === "Menu") { for (const l of p.label || []) textesDeVue(l, out); return out }
  if (n.type === "Section") for (const h of p.header || []) textesDeVue(h, out)
  if (n.type === "DatePicker") {
    const ecrite = dateCompacte(p.value, p.displayedComponents)
    if (!p.labelsHidden) out.push(String(p.title ?? ""))
    out.push("@" + String(p.title ?? "") + (ecrite ? ", " + ecrite : ""), ecrite)
    return out
  }
  for (const c of n.children || []) textesDeVue(c, out)
  return out
}

/** Les textes voisins réunis (un Text de plusieurs morceaux, un `styledText` : un seul texte dans les deux suites). */
function reunir(xs: string[]): string[] {
  const out: string[] = []
  for (const x of xs) {
    if (!x.startsWith("@") && out.length > 0 && !out[out.length - 1].startsWith("@")) out[out.length - 1] += x
    else out.push(x)
  }
  return out
}
/** null si le HTML porte exactement les textes de l'arbre (contenus et étiquettes, dans l'ordre) ; sinon le premier écart. */
export function ecartDeTextes(n: VueWeb, html: string): string | null {
  const a = reunir(textesDeVue(n)), b = reunir(textesDuHtml(html))
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (i === a.length && i === b.length) return null
  return `au rang ${i} : ${JSON.stringify(a.slice(i, i + 2))} ≠ ${JSON.stringify(b.slice(i, i + 2))}`
}
