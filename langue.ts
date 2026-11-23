







// Le dictionnaire (anglais.ts, gros) n'est chargé qu'en anglais, au lancement (installerTraduction) : en français, rien.
type Source = typeof import("./anglais")
import { preferencesGardees } from "./preferences"

export type Langue = "fr" | "en"

/** La langue d'après le réglage et la langue d'iOS (`Device.systemLanguageCode`, « fr », « en »…) ; inconnue : le français. */
export function langueDe(choix: unknown, codeSysteme: unknown): Langue {
  if (choix === "fr" || choix === "en") return choix
  if (typeof codeSysteme !== "string" || codeSysteme === "") return "fr"
  return codeSysteme.toLowerCase().startsWith("fr") ? "fr" : "en"
}

let courante: Langue = "fr"
/** La langue de cette exécution, fixée au lancement (fixerLangue). */
export function langue(): Langue {
  return courante
}
/** La locale des dates et des nombres (Intl). */
export function locale(): "fr-FR" | "en-US" {
  return courante === "en" ? "en-US" : "fr-FR"
}
/**
 * La langue de l'appareil : le réglage gardé (preferences.json), sinon celle d'iOS (`Device.systemLanguageCode`) ; illisible :
 * le français. Lue à chaque appel, la même dans l'app, le widget, Raccourcis et l'île (`langue()`, elle, n'est fixée que là où
 * `installerTraduction` a tourné : en arrière-plan, elle vaut « fr »).
 */
export function langueAppareil(): Langue {
  try {
    return langueDe(preferencesGardees().langue, Device.systemLanguageCode)
  } catch {
    return "fr"
  }
}

/** La langue d'un nom de valorant-api.com (`?language=`), et celle que porte chaque cache qui en est tiré. */
export type LangueNoms = "fr-FR" | "en-US"







export function langueDesNoms(): LangueNoms {
  return langueAppareil() === "en" ? "en-US" : "fr-FR"
}

/** Le nom que cite anglais.ts (généré par fusion.ts, hors du dépôt) : langueDesNoms elle-même. */
export const langueApi = langueDesNoms


export function langueDuCache(champ: unknown): string {
  return typeof champ === "string" && champ !== "" ? champ : "fr-FR"
}

/** Un gabarit compilé : l'expression du texte français, l'ordre de ses valeurs, le texte anglais, sa part fixe (pour choisir). */
export type Gabarit = { re: RegExp; ordre: number[]; en: string; fixe: number }
export type Dictionnaire = {
  mots: Readonly<Record<string, string>>
  motifs: readonly (readonly [RegExp, (...m: string[]) => string])[]
  /** Les gabarits par le premier mot de leur part fixe ; `libres` : ceux qui commencent par une valeur. */
  gabarits: Map<string, Gabarit[]>
  libres: Gabarit[]
  cache: Map<string, string>
}

const echapper = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** Le premier mot d'un texte (minuscules), clé de l'index des gabarits. */
function premierMot(x: string): string {
  const m = /^[^\s,.;:!?()«»"']+/.exec(x)
  return m ? m[0].toLowerCase() : ""
}






export function compilerDictionnaire(mots: Readonly<Record<string, string>>, motifs: Dictionnaire["motifs"], gabarits: readonly (readonly [string, string])[]): Dictionnaire {
  const index = new Map<string, Gabarit[]>()
  const libres: Gabarit[] = []
  for (const [fr, en] of gabarits) {
    const morceaux = fr.split(/\$\{(\d+)\}/)
    const ordre: number[] = []
    let source = "^", fixe = 0
    for (let i = 0; i < morceaux.length; i++) {
      if (i % 2 === 0) {
        source += echapper(morceaux[i])
        fixe += morceaux[i].trim().length
      } else {
        ordre.push(Number(morceaux[i]))
        source += "(.+?)"
      }
    }
    source += "$"
    const cites = [...en.matchAll(/\$\{(\d+)\}/g)].map((m) => Number(m[1]))
    if (fixe === 0 || cites.some((c) => !ordre.includes(c))) continue
    const g: Gabarit = { re: new RegExp(source, "s"), ordre, en, fixe }
    const cle = morceaux[0] === "" ? "" : premierMot(morceaux[0])
    if (cle === "") libres.push(g)
    else {
      const l = index.get(cle) ?? []
      l.push(g)
      index.set(cle, l)
    }
  }
  const parFixe = (a: Gabarit, b: Gabarit) => b.fixe - a.fixe
  for (const l of index.values()) l.sort(parFixe)
  libres.sort(parFixe)
  return { mots, motifs, gabarits: index, libres, cache: new Map() }
}

/** Au plus tant de textes gardés traduits en mémoire. */
const CACHE_MAX = 4000

/** Un texte traduit par `d` : la phrase exacte, puis un motif, puis un gabarit (ses valeurs traduites à leur tour) ; inconnu : tel quel. */
export function traduireAvec(texte: string, d: Dictionnaire, profondeur = 0): string {
  if (texte === "" || profondeur > 8) return texte
  const garde = d.cache.get(texte)
  if (garde !== undefined) return garde
  const r = traduireNeuf(texte, d, profondeur)
  if (d.cache.size >= CACHE_MAX) d.cache.clear()
  d.cache.set(texte, r)
  return r
}
function traduireNeuf(texte: string, d: Dictionnaire, profondeur: number): string {
  const exact = d.mots[texte]
  if (exact !== undefined) return exact
  // Les espaces autour (une ligne de texte collée à une autre) gardés, le cœur traduit.
  const t = texte.trim()
  if (t !== texte) return t === "" ? texte : texte.replace(t, traduireAvec(t, d, profondeur))
  for (const [re, f] of d.motifs) {
    const m = re.exec(texte)
    if (m !== null && m[0] === texte) return f(...(m as unknown as string[]))
  }
  const candidats = [...(d.gabarits.get(premierMot(texte)) ?? []), ...d.libres]
  for (const g of candidats) {
    const m = g.re.exec(texte)
    if (m === null) continue
    const valeurs = new Map<number, string>()
    g.ordre.forEach((n, i) => valeurs.set(n, traduireAvec(m[i + 1], d, profondeur + 1)))
    return g.en.replace(/\$\{(\d+)\}/g, (_, n) => valeurs.get(Number(n)) ?? "")
  }
  return texte
}

let dico: Dictionnaire | null = null
/** Le dictionnaire chargé ; pas encore (français, ou avant installerTraduction) : vide, tout reste tel quel. */
const VIDE: Dictionnaire = compilerDictionnaire({}, [], [])
function dictionnaire(): Dictionnaire {
  return dico ?? VIDE
}

/** Un texte dans la langue de l'app. */
export function traduire(texte: string): string {
  return courante === "en" ? traduireAvec(texte, dictionnaire()) : texte
}
/** Raccourci : `t("Boutique du jour")`. */
export const t = traduire

/** Les propriétés jamais traduites : des noms d'image, de police, des chemins, des clés. */
const JAMAIS = new Set(["key", "systemName", "imageUrl", "filePath", "chemin", "source", "icone", "icon", "url", "id", "cle", "font", "name", "html", "monnaie", "image"])

/**
 * Un texte riche (`styledText` d'un `Text`) : chaque morceau de texte traduit seul, ses styles gardés (une copie dès qu'un
 * morceau change, jamais l'objet reçu). Ses morceaux ne passent pas par la fabrique : c'est ici qu'ils sont traduits.
 */
function texteRiche(v: unknown): unknown {
  if (typeof v === "string") return traduireAvec(v, dictionnaire())
  if (Array.isArray(v)) {
    const l = v.map(texteRiche)
    return l.some((x, i) => x !== v[i]) ? l : v
  }
  if (v !== null && typeof v === "object" && "content" in v) {
    const o = v as { content: unknown }
    const c = texteRiche(o.content)
    return c === o.content ? v : { ...o, content: c }
  }
  return v
}

/** Les propriétés d'un élément, chaque texte traduit (une copie : jamais l'objet reçu). */
function proprietes(props: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!props) return props
  let copie: Record<string, unknown> | null = null
  for (const k of Object.keys(props)) {
    const v = props[k]
    if (k === "styledText") {
      const tr = texteRiche(v)
      if (tr !== v) {
        if (copie === null) copie = { ...props }
        copie[k] = tr
      }
      continue
    }
    if (typeof v !== "string" || JAMAIS.has(k)) continue
    const tr = traduireAvec(v, dictionnaire())
    if (tr !== v) {
      if (copie === null) copie = { ...props }
      copie[k] = tr
    }
  }
  return copie ?? props
}
function enfant(e: unknown): unknown {
  if (typeof e === "string") return traduireAvec(e, dictionnaire())
  if (Array.isArray(e)) return e.map(enfant)
  return e
}
/**
 * Un texte hors d'une vue (le corps d'une notification), dans la langue de l'appareil : la langue lue (réglage, iOS) même si
 * rien n'a été installé (lecture en arrière-plan), le dictionnaire chargé au besoin. En français, ou en cas d'échec : tel quel.
 */
let langueLue: Langue | null = null
export async function traduireHorsVue(texte: string): Promise<string> {
  try {
    if (langueLue === null) langueLue = langueAppareil()
    if (langueLue !== "en") return texte
    if (dico === null) {
      const m: Source = await import("./anglais")
      dico = compilerDictionnaire(m.MOTS, m.MOTIFS, m.GABARITS)
    }
    return traduireAvec(texte, dico)
  } catch {
    return texte
  }
}

/** Vrai en anglais, dictionnaire chargé : le rendu web (rendu.ts) traduit alors ses éléments. */
export function traductionActive(): boolean {
  return courante === "en" && dico !== null
}

/** Un élément (type, propriétés, enfants) traduit : ce que la fabrique enveloppée et le rendu web (rendu.ts) passent ici. */
export function traduireElement(props: Record<string, unknown> | null | undefined, enfants: unknown[]): { props: Record<string, unknown> | null | undefined; enfants: unknown[] } {
  return { props: proprietes(props), enfants: enfants.map(enfant) }
}

let installee = false





export async function installerTraduction(l: Langue): Promise<void> {
  courante = l
  if (l !== "en" || installee) return
  try {
    const m: Source = await import("./anglais")
    dico = compilerDictionnaire(m.MOTS, m.MOTIFS, m.GABARITS)
  } catch {
    courante = "fr"
    return
  }
  const g = globalThis as unknown as { createElement?: (...a: any[]) => unknown }
  const avant = g.createElement
  if (typeof avant !== "function") {
    courante = "fr"
    return
  }
  try {
    g.createElement = (type: unknown, props: Record<string, unknown> | null, ...enfants: unknown[]) => {
      const tr = traduireElement(props, enfants)
      return avant(type, tr.props, ...tr.enfants)
    }
    installee = g.createElement !== avant
  } catch { /* refus : traité juste après */ }
  // Fabrique non enveloppée : tout reste en français, dates comprises (jamais un mélange).
  if (!installee) courante = "fr"
}
