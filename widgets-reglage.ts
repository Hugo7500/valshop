









/** Les tailles : petit, moyen, grand, très grand ; puis l'écran verrouillé : rectangle, rond, ligne au-dessus de l'heure. */
export type Taille = "s" | "m" | "l" | "x" | "r" | "c" | "i"
export const TAILLES: readonly Taille[] = ["s", "m", "l", "x", "r", "c", "i"]

/** Les formes de l'écran verrouillé. */
export const VERROU: readonly Taille[] = ["r", "c", "i"]
export const estVerrou = (t: Taille): boolean => VERROU.includes(t)

/** Le contenu par défaut : le widget d'avant. */
export const CLASSIQUE = "classique"
/** Le carrousel : un seul widget, plusieurs vues de sa taille. */
export const CARROUSEL = "carrousel"

/** Les contenus qu'on peut choisir pour chaque taille, dans l'ordre de l'écran ; le premier après « classique » est le nouveau dessin. */
export const CONTENUS: Readonly<Record<Taille, readonly string[]>> = {
  s: [CLASSIQUE, "boutique", "solde", "souhaits", "bundle", "accessoires", "stats", "partie", "jour", CARROUSEL],
  m: [CLASSIQUE, "boutique", "solde", "souhaits", "bundle", "accessoires", "nuit", "stats", "partie", "jour", CARROUSEL],
  l: [CLASSIQUE, "boutique", "boutique+stats", "solde", "souhaits", "bundle", "accessoires", "nuit", "stats", "partie", "jour", CARROUSEL],
  // Très grand : « Tout ValShop », puis des paires (une vue à la forme du moyen au-dessus d'une vue à la forme du grand).
  x: [CLASSIQUE, "tout", "boutique+stats", "boutique+jour", "boutique+partie", "solde+souhaits", "stats+partie", CARROUSEL],
  r: ["boutique", "stats", "souhaits", "solde"],
  c: ["reset", "rr", "souhaits"],
  i: ["ligne"],
}

/** Les périodes des stats, celles de l'onglet Stats, dans son ordre ; leurs noms ; celle d'un widget sans réglage. */
export const PERIODES: readonly string[] = ["7j", "30j", "acte", "tout"]
export const NOMS_PERIODE: Readonly<Record<string, string>> = { "7j": "7 jours", "30j": "30 jours", acte: "Acte", tout: "Tout" }
export const PERIODE_DEFAUT = "30j"

/** Les contenus dont les chiffres dépendent de la période (la dernière partie et le rang n'en dépendent pas). */
export const AVEC_PERIODE: readonly string[] = ["stats", "boutique+stats", "jour", "boutique+jour", "stats+partie"]

/** Les contenus qui montrent des stats : l'app n'écrit leur résumé que si l'un d'eux est réglé. */
export const CONTENUS_STATS: readonly string[] = ["stats", "partie", "boutique+stats", "jour", "rr", "boutique+jour", "boutique+partie", "stats+partie"]

/** Le nom d'un contenu, tel que l'écran le dit. */
export const NOMS: Readonly<Record<string, string>> = {
  classique: "Boutique classique", boutique: "Boutique", solde: "Solde", bundle: "Bundle", accessoires: "Accessoires",
  nuit: "Night Market", tout: "Tout ValShop", souhaits: "Souhaits", stats: "Stats", partie: "Dernière partie", "boutique+stats": "Boutique + Stats",
  jour: "Chiffre du jour", carrousel: "Carrousel", reset: "Reset", rr: "RR", ligne: "Ligne",
  "boutique+jour": "Boutique + Chiffre du jour", "boutique+partie": "Boutique + Dernière partie", "solde+souhaits": "Solde + Souhaits", "stats+partie": "Dernière partie + Stats",
}

/** Le plus grand numéro de widget admis. */
export const NUMERO_MAX = 9

/** La façon d'avancer d'un carrousel : au rythme d'iOS (et au doigt), au doigt seulement, ou en continu. */
export type ModeCarrousel = "ios" | "doigt" | "continu"
export const MODES_CARROUSEL: readonly ModeCarrousel[] = ["ios", "doigt", "continu"]
export const NOMS_MODE: Readonly<Record<ModeCarrousel, string>> = { ios: "Au rythme d'iOS", doigt: "Au doigt", continu: "En continu" }
/** En continu : les secondes passées sur chaque vue. */
export const SECONDES_CARROUSEL: readonly number[] = [5, 10, 20]
export const SECONDES_DEFAUT = 10

/** Le carrousel d'une taille : `v`, ses vues dans l'ordre ; `a`, sa façon d'avancer ; `s`, les secondes par vue en continu. */
export type Carrousel = { v: string[]; a?: ModeCarrousel; s?: number }
export type ReglageWidget = Partial<Record<Taille, string>> & { p?: string; car?: Partial<Record<Taille, Carrousel>> }
export type Reglage = { widgets: Record<string, ReglageWidget>; ile?: boolean }

/** La taille d'une famille de widget de Scripting ; null pour une famille inconnue. */
export function tailleDe(famille: unknown): Taille | null {
  if (famille === "systemSmall") return "s"
  if (famille === "systemMedium") return "m"
  if (famille === "systemLarge") return "l"
  if (famille === "accessoryRectangular") return "r"
  if (famille === "accessoryCircular") return "c"
  if (famille === "accessoryInline") return "i"
  return typeof famille === "string" && famille.startsWith("systemExtraLarge") ? "x" : null
}

/** Le numéro d'un widget d'après sa case « Paramètre » : 1 si elle est vide ou n'est pas un nombre de 1 à NUMERO_MAX. */
export function numeroDe(parametre: unknown): number {
  const t = typeof parametre === "string" ? parametre.trim() : ""
  if (!/^[1-9]$/.test(t)) return 1
  const n = Number(t)
  return n <= NUMERO_MAX ? n : 1
}

/** Les vues qu'un carrousel de cette taille peut montrer : ses contenus, sauf le widget d'avant et le carrousel lui-même. */
export function vuesPossibles(t: Taille): string[] {
  return CONTENUS[t].includes(CARROUSEL) ? CONTENUS[t].filter((c) => c !== CLASSIQUE && c !== CARROUSEL) : []
}

/** Les vues d'un carrousel qu'on vient de choisir, avant tout réglage. */
const VUES_DEPART: Partial<Record<Taille, readonly string[]>> = {
  s: ["boutique", "stats", "solde"], m: ["boutique", "stats", "accessoires"], l: ["boutique", "boutique+stats", "stats"],
  x: ["tout", "boutique+stats", "stats+partie"],
}

/** Un carrousel lu strictement ; null s'il n'a pas la forme attendue ou ne garde aucune vue. */
function lireCarrousel(x: unknown, t: Taille): Carrousel | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.v)) return null
  const possibles = vuesPossibles(t)
  const v: string[] = []
  for (const e of o.v) if (typeof e === "string" && possibles.includes(e) && !v.includes(e)) v.push(e)
  if (v.length === 0) return null
  const garde: Carrousel = { v }
  if (typeof o.a === "string" && (MODES_CARROUSEL as readonly string[]).includes(o.a)) garde.a = o.a as ModeCarrousel
  if (typeof o.s === "number" && SECONDES_CARROUSEL.includes(o.s)) garde.s = o.s
  return garde
}

/** Le réglage d'après le texte de widgets.json, lu strictement : tout ce qui n'a pas la forme attendue est ignoré. */
export function lireReglage(texte: string | null | undefined): Reglage {
  const vide: Reglage = { widgets: {} }
  if (!texte) return vide
  let lu: unknown
  try {
    lu = JSON.parse(texte)
  } catch {
    return vide
  }
  if (typeof lu !== "object" || lu === null) return vide
  if ((lu as { ile?: unknown }).ile === true) vide.ile = true
  const w = (lu as { widgets?: unknown }).widgets
  if (typeof w !== "object" || w === null || Array.isArray(w)) return vide
  for (const [numero, choix] of Object.entries(w as Record<string, unknown>)) {
    if (!/^[1-9]$/.test(numero) || typeof choix !== "object" || choix === null || Array.isArray(choix)) continue
    const garde: ReglageWidget = {}
    for (const t of TAILLES) {
      const c = (choix as Record<string, unknown>)[t]
      if (typeof c === "string" && CONTENUS[t].includes(c)) garde[t] = c
    }
    const p = (choix as Record<string, unknown>).p
    if (typeof p === "string" && PERIODES.includes(p)) garde.p = p
    const car = (choix as Record<string, unknown>).car
    if (typeof car === "object" && car !== null && !Array.isArray(car)) {
      const gardes: Partial<Record<Taille, Carrousel>> = {}
      for (const t of TAILLES) {
        const c = lireCarrousel((car as Record<string, unknown>)[t], t)
        if (c !== null) gardes[t] = c
      }
      if (Object.keys(gardes).length > 0) garde.car = gardes
    }
    vide.widgets[numero] = garde
  }
  return vide
}

/** Le contenu d'un widget sans réglage à cette taille : « classique », ou sur l'écran verrouillé le premier de la forme. */
export function contenuParDefaut(taille: Taille | null): string {
  return taille !== null && estVerrou(taille) ? CONTENUS[taille][0] : CLASSIQUE
}

/** Le contenu du widget `numero` à la taille `taille` : celui du réglage, sinon celui par défaut. */
export function contenuDe(r: Reglage, numero: number, taille: Taille | null): string {
  if (taille === null) return CLASSIQUE
  return r.widgets[String(numero)]?.[taille] ?? contenuParDefaut(taille)
}

/** Le réglage dont le widget `numero` est remplacé par `w`. */
function avec(r: Reglage, numero: number, w: ReglageWidget): Reglage {
  return { ...r, widgets: { ...r.widgets, [String(numero)]: w } }
}

/** Le réglage où le widget `numero` montre `contenu` à la taille `taille` ; un contenu que cette taille n'offre pas : inchangé. */
export function choisir(r: Reglage, numero: number, taille: Taille, contenu: string): Reglage {
  if (!CONTENUS[taille].includes(contenu) || numero < 1 || numero > NUMERO_MAX) return r
  return avec(r, numero, { ...(r.widgets[String(numero)] ?? {}), [taille]: contenu })
}


export function periodeDe(r: Reglage, numero: number): string {
  return r.widgets[String(numero)]?.p ?? PERIODE_DEFAUT
}

/** Le réglage où les stats du widget `numero` portent sur `periode` ; une période inconnue : inchangé. */
export function choisirPeriode(r: Reglage, numero: number, periode: string): Reglage {
  if (!PERIODES.includes(periode) || numero < 1 || numero > NUMERO_MAX || periodeDe(r, numero) === periode) return r
  return avec(r, numero, { ...(r.widgets[String(numero)] ?? {}), p: periode })
}

// ─────────────────────────── carrousel (lot 3) ───────────────────────────

/** Le carrousel du widget `numero` à cette taille : ses vues dans l'ordre (celles du départ sans réglage), sa façon d'avancer. */
export function carrouselDe(r: Reglage, numero: number, taille: Taille): { vues: string[]; mode: ModeCarrousel; secondes: number } {
  const c = r.widgets[String(numero)]?.car?.[taille]
  const possibles = vuesPossibles(taille)
  const gardees = (c?.v ?? []).filter((v) => possibles.includes(v))
  const vues = gardees.length > 0 ? gardees : (VUES_DEPART[taille] ?? []).filter((v) => possibles.includes(v))
  return { vues, mode: c?.a ?? "ios", secondes: c?.s ?? SECONDES_DEFAUT }
}

/** Le réglage où le carrousel du widget `numero` à cette taille devient `c`. */
function avecCarrousel(r: Reglage, numero: number, taille: Taille, c: Carrousel): Reglage {
  if (vuesPossibles(taille).length === 0 || numero < 1 || numero > NUMERO_MAX) return r
  const w = r.widgets[String(numero)] ?? {}
  return avec(r, numero, { ...w, car: { ...(w.car ?? {}), [taille]: c } })
}

/** Le carrousel tel qu'il s'écrit : les vues, puis la façon d'avancer et les secondes si elles ne sont pas celles par défaut. */
function ecrit(vues: string[], mode: ModeCarrousel, secondes: number): Carrousel {
  return { v: vues, ...(mode !== "ios" ? { a: mode } : {}), ...(secondes !== SECONDES_DEFAUT ? { s: secondes } : {}) }
}

/** Coche ou décoche une vue du carrousel : cochée, elle se range à la fin ; la dernière vue ne se décoche pas. */
export function cocherVue(r: Reglage, numero: number, taille: Taille, vue: string): Reglage {
  if (!vuesPossibles(taille).includes(vue)) return r
  const { vues, mode, secondes } = carrouselDe(r, numero, taille)
  if (vues.includes(vue) && vues.length === 1) return r
  return avecCarrousel(r, numero, taille, ecrit(vues.includes(vue) ? vues.filter((v) => v !== vue) : [...vues, vue], mode, secondes))
}

/** Avance (`sens` -1) ou recule (+1) une vue cochée dans l'ordre du carrousel ; au bout de la liste : inchangé. */
export function deplacerVue(r: Reglage, numero: number, taille: Taille, vue: string, sens: -1 | 1): Reglage {
  const { vues, mode, secondes } = carrouselDe(r, numero, taille)
  const i = vues.indexOf(vue)
  const j = i + sens
  if (i < 0 || j < 0 || j >= vues.length) return r
  const neuves = [...vues]
  neuves[i] = vues[j]
  neuves[j] = vues[i]
  return avecCarrousel(r, numero, taille, ecrit(neuves, mode, secondes))
}

/** Change la façon d'avancer du carrousel. */
export function choisirMode(r: Reglage, numero: number, taille: Taille, mode: ModeCarrousel): Reglage {
  const c = carrouselDe(r, numero, taille)
  if (!MODES_CARROUSEL.includes(mode) || c.mode === mode) return r
  return avecCarrousel(r, numero, taille, ecrit(c.vues, mode, c.secondes))
}

/** Change les secondes passées sur chaque vue, en continu. */
export function choisirSecondes(r: Reglage, numero: number, taille: Taille, secondes: number): Reglage {
  const c = carrouselDe(r, numero, taille)
  if (!SECONDES_CARROUSEL.includes(secondes) || c.secondes === secondes) return r
  return avecCarrousel(r, numero, taille, ecrit(c.vues, c.mode, secondes))
}

/** Ce que le widget `numero` montre à cette taille : son contenu, ou les vues de son carrousel. */
function montres(r: Reglage, numero: number, taille: Taille): string[] {
  const c = contenuDe(r, numero, taille)
  return c === CARROUSEL ? carrouselDe(r, numero, taille).vues : [c]
}

/** Ce que le widget `numero` montre à cette taille dépend-il de la période des stats ? */
export function avecPeriode(r: Reglage, numero: number, taille: Taille): boolean {
  return montres(r, numero, taille).some((c) => AVEC_PERIODE.includes(c))
}

/** Un widget réglé montre-t-il des stats ? (Un widget sans réglage n'en montre pas.) */
export function montreDesStats(r: Reglage): boolean {
  return Object.entries(r.widgets).some(([numero, w]) =>
    TAILLES.some((t) => w[t] !== undefined && montres(r, Number(numero), t).some((c) => CONTENUS_STATS.includes(c))))
}

// ─────────────────────────── île dynamique (lot 4) ───────────────────────────

/** Le réglage où l'île dynamique se lance (ou non) quand un souhait est en boutique. */
export function choisirIle(r: Reglage, oui: boolean): Reglage {
  if ((r.ile === true) === oui) return r
  const { ile: _, ...reste } = r
  return oui ? { ...reste, ile: true } : reste
}

/** Les numéros des widgets réglés, croissants ; toujours au moins le 1. */
export function numeros(r: Reglage): number[] {
  const n = new Set([1, ...Object.keys(r.widgets).map(Number)])
  return [...n].filter((x) => Number.isInteger(x) && x >= 1 && x <= NUMERO_MAX).sort((a, b) => a - b)
}

/** Le prochain numéro libre, ou null s'il n'en reste pas. */
export function numeroLibre(r: Reglage): number | null {
  const pris = new Set(numeros(r))
  for (let n = 2; n <= NUMERO_MAX; n++) if (!pris.has(n)) return n
  return null
}

/** Le réglage sans le widget `numero` (le 1 ne s'enlève pas : il revient à « classique »). */
export function retirer(r: Reglage, numero: number): Reglage {
  const widgets = { ...r.widgets }
  delete widgets[String(numero)]
  return { ...r, widgets }
}

/** Contenu de widgets.json. */
export function contenuReglage(r: Reglage): string {
  return JSON.stringify({ v: 1, widgets: r.widgets, ...(r.ile === true ? { ile: true } : {}) }, null, 2)
}
