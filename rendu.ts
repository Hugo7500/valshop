import {
  BarChart, Button, Canvas, Chart, Circle, DatePicker, EmptyView, EnvironmentValuesReader, FlowLayout, Grid, GridRow, HStack, Image, LazyVStack,
  LineCategoryChart, LineChart, Link, List, Menu, NavigationStack, PathShape, Picker, ProgressView, RangeAreaChart, Rectangle, RoundedRectangle,
  RuleLineForValueChart, ScrollView, ScrollViewReader, Section, SecureField, Spacer, Stepper, Text, VStack, ZStack,
  useEffect as useEffectScripting, useRef as useRefScripting, useState as useStateScripting,
} from "scripting"

// Ticket 4.50 de epic-stats-tableau-de-bord (Stats dessiné par une vue web), phase A : le module intermédiaire des éléments
// et des crochets. Chaque écran de Stats importe d'ici `createElement` et `Fragment` (le JSX y renvoie, lexicalement : la
// fabrique `createElement` de tsconfig, liaison du module plutôt que le global) et ses crochets (`useState`, `useRef`,
// `useEffect`) ; les éléments (VStack, Text…) restent ceux de `scripting`. Deux modes :
//   natif (toujours, hors d'un rendu web) : tout est passé tel quel à Scripting (`createElement` global, crochets de
//     `scripting`) ; l'app s'affiche exactement comme avant ;
//   web (le temps de `rendreWeb`, synchrone) : `createElement` rend un nœud JS `{ type, props }` (props.children compris,
//     comme le faux hôte), et le moteur ci-dessous rend l'arbre en pur JavaScript, sans pont natif : composants appelés,
//     état par position (chemin des composants, clés), effets après le rendu, composants absents démontés. Sortie : l'arbre
//     `{ type, props, children }` (types nommés), celui que traduction-web.ts traduit en HTML. Aucun comportement de Scripting n'est
//     supposé : ni la forme de ses nœuds, ni ses crochets hors de son rendu.
// Les éléments sont reconnus à leur identité (ELEMENTS : chaque élément de `scripting` que ces écrans importent ; un écran qui
// en importe un nouveau doit l'y ajouter, ce que vérifie le harnais) ; au faux hôte, ce sont leurs noms.

/** Les éléments de Scripting que rendent les écrans de Stats, et leur nom dans l'arbre. */
const ELEMENTS: [unknown, string][] = [
  [BarChart, "BarChart"], [Button, "Button"], [Canvas, "Canvas"], [Chart, "Chart"], [Circle, "Circle"], [DatePicker, "DatePicker"],
  [EmptyView, "EmptyView"], [EnvironmentValuesReader, "EnvironmentValuesReader"], [FlowLayout, "FlowLayout"], [Grid, "Grid"],
  [GridRow, "GridRow"], [HStack, "HStack"], [Image, "Image"], [LazyVStack, "LazyVStack"], [LineCategoryChart, "LineCategoryChart"], [List, "List"],
  [LineChart, "LineChart"], [Link, "Link"], [Menu, "Menu"], [NavigationStack, "NavigationStack"], [PathShape, "PathShape"],
  [Picker, "Picker"], [ProgressView, "ProgressView"], [RangeAreaChart, "RangeAreaChart"], [Rectangle, "Rectangle"],
  [RoundedRectangle, "RoundedRectangle"], [RuleLineForValueChart, "RuleLineForValueChart"], [ScrollView, "ScrollView"],
  [ScrollViewReader, "ScrollViewReader"], [Section, "Section"], [SecureField, "SecureField"], [Spacer, "Spacer"], [Stepper, "Stepper"],
  [Text, "Text"], [VStack, "VStack"], [ZStack, "ZStack"],
]
const NOMS = new Map<unknown, string>(ELEMENTS)
/** Les noms des éléments reconnus (le harnais vérifie que chaque élément importé par un écran de Stats y est). */
export const NOMS_ELEMENTS: readonly string[] = ELEMENTS.map((e) => e[1])

/** Le Fragment de Scripting (global), le même en natif et en web. */
const FRAGMENT: unknown = Fragment

/** Un nœud web brut, tel que le rend `createElement` en mode web. */
type Brut = { type: unknown; props: Record<string, any> }
/** Un élément de l'arbre rendu : type nommé, props (vues des props rendues), enfants ; `#text` porte sa valeur. */
export type VueWeb = { type: string; props: Record<string, any>; children: VueWeb[]; value?: string }

/** Le moteur en cours de rendu web (null : mode natif). */
let actif: MoteurWeb | null = null
/** Le composant en cours de rendu web : son chemin et le rang du prochain crochet. */
let ctx: { chemin: string; index: number } | null = null

let appelsNatifs = 0

/** `createElement` des écrans : Scripting en natif, un nœud JS en web. */
function creer(type: unknown, props: Record<string, any> | null, ...enfants: unknown[]): any {
  if (actif === null) {
    appelsNatifs++
    return (createElement as any)(type, props, ...enfants)
  }
  const p: Record<string, any> = { ...(props || {}) }
  p.children = enfants.length === 0 ? undefined : enfants.length === 1 ? enfants[0] : enfants
  return { type, props: p }
}
export { creer as createElement, FRAGMENT as Fragment }

type Etat = { valeur: unknown; poser: (v: unknown) => void }
type Effet = { effet: true; deps: unknown[] | null; nettoyage: (() => void) | null; mort?: boolean }

/** useState : celui de Scripting en natif ; en web, l'état gardé par le moteur à la position du composant. */
export function useState<S>(initial: S | (() => S)): [S, (v: S | ((avant: S) => S)) => void] {
  if (actif === null) return (useStateScripting as any)(initial)
  const m = actif
  const slots = emplacements(m)
  const i = ctx!.index++
  if (!(i in slots)) {
    const chemin = ctx!.chemin
    const e: Etat = { valeur: typeof initial === "function" ? (initial as () => S)() : initial, poser: () => {} }
    e.poser = (v: unknown) => {
      const avant = e.valeur
      e.valeur = typeof v === "function" ? (v as (a: unknown) => unknown)(e.valeur) : v
      if (!Object.is(avant, e.valeur)) { m.sales.add(chemin); m.surChangement() }
    }
    slots[i] = e
  }
  const e = slots[i] as Etat
  return [e.valeur as S, e.poser as (v: S | ((avant: S) => S)) => void]
}

/** useRef : celui de Scripting en natif ; en web, le même objet `{ current }` d'un rendu à l'autre. */
export function useRef<T>(initial: T): { current: T } {
  if (actif === null) return (useRefScripting as any)(initial)
  const [ref] = useState(() => ({ current: initial }))
  return ref
}

/** useEffect : celui de Scripting en natif ; en web, mis en place après le rendu, au premier et quand une dépendance change. */
export function useEffect(setup: () => void | (() => void), deps: unknown[]): void {
  if (actif === null) { (useEffectScripting as any)(setup, deps); return }
  const m = actif
  const slots = emplacements(m)
  const i = ctx!.index++
  if (!(i in slots)) slots[i] = { effet: true, deps: null, nettoyage: null } as Effet
  const e = slots[i] as Effet
  if (!e || e.effet !== true) throw new Error("useEffect : ordre des crochets changé")
  const change = e.deps === null || deps.length !== e.deps.length || deps.some((d, k) => !Object.is(d, e.deps![k]))
  // Un effet déjà en attente (deux rendus avant le lancement, phase C) : la mise en place la plus récente seule ; et plus
  // aucune si les dépendances sont revenues à celles de la dernière mise en place (relecture C10 : jamais une ancienne fermeture).
  const k = m.effets.findIndex((x) => x.e === e)
  if (change) {
    if (k >= 0) m.effets[k] = { e, setup, deps: [...deps] }
    else m.effets.push({ e, setup, deps: [...deps] })
  } else if (k >= 0) m.effets.splice(k, 1)
}

function emplacements(m: MoteurWeb): unknown[] {
  if (ctx === null) throw new Error("crochet hors d'un composant")
  let s = m.crochets.get(ctx.chemin)
  if (!s) { s = []; m.crochets.set(ctx.chemin, s) }
  return s
}
function nettoyer(e: Effet) {
  const n = e.nettoyage
  e.nettoyage = null
  if (typeof n === "function") n()
}
function demonter(slots: unknown[]) {
  // Relecture C10 : un effet d'un composant démonté ne part plus, même s'il attendait son lancement.
  for (const s of slots) if (s && (s as Effet).effet === true) { (s as Effet).mort = true; nettoyer(s as Effet) }
}

/**
 * Le moteur d'un arbre rendu en web : l'état de ses composants, l'environnement lu par `EnvironmentValuesReader`, ce qu'il
 * faut appeler quand un état change (`surChangement` : l'hôte décide quand rendre de nouveau) et quand un `ScrollViewReader`
 * demande un défilement (`surDefilement`).
 */
export type MoteurWeb = {
  crochets: Map<string, unknown[]>
  env: Record<string, unknown>
  surChangement: () => void
  surDefilement: (id: string | number, ancre: unknown, chemin: string) => void
  sales: Set<string>
  effets: { e: Effet; setup: () => void | (() => void); deps: unknown[] }[]
  rendus: Set<string>
  ferme: boolean
  /**
   * Ticket 4.50, phase B : la sortie de chaque composant au rendu d'avant (ses props, ses vues, les composants dessous). Comme
   * Scripting (dts, `useCallback` : un composant aux props inchangées n'est pas rendu de nouveau), un composant aux mêmes props
   * (mêmes clés, chacune Object.is), sans état changé en lui ni dessous, l'environnement inchangé, reprend sa sortie d'avant :
   * un appui ne rend que ce qu'il touche (Parties : les lots déjà montrés ne sont pas rendus de nouveau). `memoire` faux : tout.
   */
  sorties: Map<string, { props: Record<string, any>; vues: VueWeb[]; dessous: string[] }>
  memoire: boolean
  envVu: string
  collecte: string[][]
}

export function creerMoteurWeb(env: Record<string, unknown>, surChangement: () => void, surDefilement?: (id: string | number, ancre: unknown, chemin: string) => void): MoteurWeb {
  return {
    crochets: new Map(), env, surChangement, surDefilement: surDefilement || (() => {}), sales: new Set(), effets: [], rendus: new Set(), ferme: false,
    sorties: new Map(), memoire: true, envVu: "", collecte: [],
  }
}

/** Mêmes props : mêmes clés, chacune Object.is (la comparaison de Scripting avant de rendre un composant). */
function memesProps(a: Record<string, any>, b: Record<string, any>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]))
}
/** Un état a changé dans ce composant ou dessous depuis le rendu d'avant. */
function salePour(m: MoteurWeb, chemin: string): boolean {
  for (const s of m.sales) if (s === chemin || s.startsWith(chemin + "/") || s.startsWith(chemin + "[")) return true
  return false
}
const estBrut = (v: unknown): v is Brut => v !== null && typeof v === "object" && !Array.isArray(v) && "type" in (v as object) && "props" in (v as object)
/** Props natives jamais rendues en web : leur contenu est une présentation de Scripting (feuille, Détail), pilotée par message. */
const PROPS_NATIVES = new Set(["sheet", "navigationDestination", "destination"])

function rendreNoeud(m: MoteurWeb, n: unknown, chemin: string): VueWeb[] {
  if (n === null || n === undefined || n === false || n === true) return []
  if (typeof n === "string" || typeof n === "number") return [{ type: "#text", value: String(n), props: {}, children: [] }]
  if (Array.isArray(n)) {
    return n.flatMap((x, i) => rendreNoeud(m, x, chemin + "[" + (x && x.props && x.props.key != null ? "k:" + x.props.key : i) + "]"))
  }
  if (typeof n === "function") throw new Error("fonction rendue comme un nœud : " + chemin)
  if (!estBrut(n)) throw new Error("nœud inconnu (JSX hors de rendu.ts ?) : " + chemin)
  const { type, props } = n
  if (type === FRAGMENT) return rendreNoeud(m, props.children, chemin)
  const nom = NOMS.get(type) ?? (typeof type === "string" ? type : null)
  if (nom === null) {
    if (typeof type !== "function") throw new Error("type d'élément inconnu : " + chemin)
    const mien = chemin + "/" + ((type as { name?: string }).name || "Composant")
    m.rendus.add(mien)
    const parent = m.collecte.length > 0 ? m.collecte[m.collecte.length - 1] : null
    const prec = m.memoire ? m.sorties.get(mien) : undefined
    if (prec !== undefined && memesProps(prec.props, props) && !salePour(m, mien)) {
      for (const c of prec.dessous) m.rendus.add(c)
      if (parent) parent.push(mien, ...prec.dessous)
      return prec.vues
    }
    const dessous: string[] = []
    m.collecte.push(dessous)
    const avant = ctx
    let vues: VueWeb[]
    try {
      ctx = { chemin: mien, index: 0 }
      let sortie: unknown
      try { sortie = (type as (p: unknown) => unknown)(props) } finally { ctx = avant }
      vues = rendreNoeud(m, sortie, mien)
    } finally { m.collecte.pop() }
    if (m.memoire) m.sorties.set(mien, { props, vues, dessous })
    if (parent) parent.push(mien, ...dessous)
    return vues
  }
  if (nom === "EnvironmentValuesReader") {
    const cles: string[] = props.keys
    const valeurs: Record<string, unknown> = {}
    for (const k of cles) valeurs[k] = m.env[k]
    return [{ type: nom, props: { keys: [...cles] }, children: rendreNoeud(m, props.children(valeurs), chemin + "/" + nom) }]
  }
  if (nom === "ScrollViewReader") {
    const lecteur = chemin + "/" + nom
    const proxy = { scrollTo: (id: string | number, ancre?: unknown) => m.surDefilement(id, ancre, lecteur) }
    return [{ type: nom, props: {}, children: rendreNoeud(m, props.children(proxy), chemin + "/" + nom) }]
  }
  const { children, ...reste } = props
  const el: VueWeb = { type: nom, props: { ...reste }, children: [] }
  for (const [k, v] of Object.entries(reste)) {
    if (!PROPS_NATIVES.has(k) && estBrut(v)) el.props[k] = rendreNoeud(m, v, chemin + "/" + nom + "." + k)
  }
  el.children = rendreNoeud(m, children, chemin + "/" + nom)
  return [el]
}

/**
 * Rend `racine` (un nœud fait en mode web, voir `elementWeb`) avec le moteur `m` : l'arbre de vues, une racine. Les composants
 * absents de ce rendu sont démontés (état perdu, effets nettoyés) ; les effets partent à la fin, hors du mode web (ce qu'ils
 * créent est natif, comme avant).
 */
export function rendreWeb(m: MoteurWeb, racine: () => unknown, { effetsApres = false }: { effetsApres?: boolean } = {}): VueWeb {
  if (actif !== null) throw new Error("rendu web dans un rendu web")
  actif = m
  m.rendus = new Set()
  m.collecte = []
  // Un environnement changé (taille de texte, contraste) : tout est rendu de nouveau, comme dans Scripting.
  const env = JSON.stringify(m.env)
  if (env !== m.envVu) { m.envVu = env; m.sorties.clear() }
  let arbre: VueWeb[]
  try {
    arbre = rendreNoeud(m, racine(), "")
  } finally {
    actif = null
    ctx = null
  }
  for (const chemin of [...m.crochets.keys()]) {
    if (!m.rendus.has(chemin)) { demonter(m.crochets.get(chemin)!); m.crochets.delete(chemin) }
  }
  for (const chemin of [...m.sorties.keys()]) if (!m.rendus.has(chemin)) m.sorties.delete(chemin)
  m.sales.clear()
  // Ticket 4.50, phase C : `effetsApres` (StatsWeb) : les effets attendent lancerEffetsWeb, appelé par l'effet natif de l'hôte
  // du rendu, après son affichage, comme ceux de Scripting ; sinon ils partent ici.
  if (!effetsApres) lancerEffetsWeb(m)
  if (arbre.length !== 1) throw new Error("rendu web : racine multiple")
  return arbre[0]
}

/** Les effets notés par les rendus web depuis le dernier lancement : nettoyage d'abord, puis mise en place ; aucun moteur fermé. */
export function lancerEffetsWeb(m: MoteurWeb) {
  const file = m.effets
  m.effets = []
  if (m.ferme) return
  for (const { e, setup, deps } of file) {
    if (e.mort) continue
    nettoyer(e)
    const n = setup()
    e.nettoyage = typeof n === "function" ? n : null
    e.deps = deps
  }
}

/** Le moteur fermé : chaque composant démonté, ses effets nettoyés ; son état reste lisible (comme Scripting), plus aucun effet. */
export function fermerMoteurWeb(m: MoteurWeb) {
  if (m.ferme) return
  m.ferme = true
  for (const slots of m.crochets.values()) demonter(slots)
  m.effets = []
}






export function sondeRendu(): string {
  const morceaux: string[] = [`JSX par rendu.ts : ${appelsNatifs > 0 ? "oui" : "non"} (${appelsNatifs} appels)`]
  try {
    const n = (createElement as any)(Text, null, "")
    morceaux.push("nœud de Scripting : " + (n && typeof n === "object" ? Object.keys(n).map((k) => k + ":" + typeof n[k]).join(",") : typeof n))
  } catch (e) {
    morceaux.push("nœud de Scripting : illisible")
  }
  try { morceaux.push("iOS " + String((Device as any).systemVersion)) } catch { morceaux.push("iOS ?") }
  try {
    const W = (globalThis as any).WebViewController
    const p = W && W.prototype
    const noms = ["loadHTML", "evaluateJavaScript", "addScriptMessageHandler", "setSettings", "getSettings", "callAsyncJavaScript", "addUserScript", "getState", "addEventListener"]
    morceaux.push("WebViewController : " + (p ? noms.map((x) => x + (typeof p[x] === "function" ? "+" : "-")).join(" ") : "absent"))
  } catch { morceaux.push("WebViewController : illisible") }
  return "[sonde] rendu web : " + morceaux.join(" ; ")
}

/**
 * Ticket 4.50, phase B : un nœud web fait hors d'un rendu web (l'En-tête passé à Stats aux tailles d'accessibilité, que
 * l'onglet web crée) : `{ type, props }`, comme `createElement` en mode web.
 */
export function elementWeb(type: unknown, props: Record<string, any>): any {
  return { type, props: { ...props } }
}

/**
 * Ticket 4.50, phase B : un nœud fait pendant un rendu web (contenu d'une feuille, Détail d'une partie, contenu d'un Menu)
 * refait pour Scripting : chaque nœud brut repassé par le `createElement` global, ses vues en props comprises (types gardés :
 * les éléments de Scripting et les composants de l'app). Le reste (textes, nombres, fonctions) tel quel.
 */
export function versNatif(n: unknown): any {
  if (Array.isArray(n)) return n.map(versNatif)
  if (!estBrut(n)) return n
  const { children, ...reste } = n.props
  const props: Record<string, any> = {}
  for (const [k, v] of Object.entries(reste)) props[k] = estBrut(v) || (Array.isArray(v) && v.some(estBrut)) ? versNatif(v) : v
  if (n.type === FRAGMENT) return (createElement as any)(FRAGMENT, null, ...[].concat(versNatif(children === undefined ? [] : children)))
  const enfants = children === undefined ? [] : Array.isArray(children) ? versNatif(children) : [versNatif(children)]
  return (createElement as any)(n.type, props, ...enfants)
}

/** Ticket 4.50, phase B : l'élément de Scripting d'un nom de l'arbre web (null : inconnu). */
const PAR_NOM = new Map<string, unknown>(ELEMENTS.map((e) => [e[1], e[0]] as [string, unknown]))
/**
 * Ticket 4.50, phase B : une vue de l'arbre web rendu (contenu d'un Menu gardé par la traduction) refaite pour Scripting :
 * chaque élément recréé par le `createElement` global sous son élément de Scripting, ses vues en props comprises.
 */
export function vueVersNatif(v: VueWeb | VueWeb[]): any {
  if (Array.isArray(v)) return v.map(vueVersNatif)
  if (v.type === "#text") return v.value
  const el = PAR_NOM.get(v.type)
  if (el === undefined) throw new Error("élément inconnu : " + v.type)
  const props: Record<string, any> = {}
  for (const [k, x] of Object.entries(v.props)) props[k] = Array.isArray(x) && x.length > 0 && x[0] && typeof x[0] === "object" && "children" in x[0] ? vueVersNatif(x) : x
  return (createElement as any)(el, props, ...v.children.map(vueVersNatif))
}
