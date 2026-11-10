














import { dateEnClair } from "./prix-retenus"

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
function propre(x: unknown, nom: string): unknown {
  return estObjet(x) && Object.prototype.hasOwnProperty.call(x, nom) ? x[nom] : undefined
}
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.replace(/\s+/g, " ").trim() : null
}
function elements(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuid(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x) ? x.toLowerCase() : null
}
/** Une date ISO lisible, rendue telle quelle ; sinon null. */
function dateIso(x: unknown): string | null {
  const s = chaine(x)
  return s !== null && Number.isFinite(Date.parse(s)) ? s : null
}

/** Thème « Standard » de valorant-api : exactement les skins par défaut des armes (relevé 13.09 : 21 skins, aucun autre). */
export const THEME_STANDARD = "5a629df4-4765-0214-bd40-fbb96542941f"

/**
 * Le genre d'une origine : passe de combat, contrat d'agent, passe d'événement, skin de base, autre contrat ; ticket 8.13 :
 * vendu dans un bundle, nature d'un objet jamais vendu (de la table de référence, jamais d'origines.json).
 */
export type GenreOrigine = "passe" | "contrat" | "evenement" | "base" | "autre" | "bundle" | "nature"

/** L'origine dite d'un objet : `texte` (ligne, fiche, VoiceOver), `sortie` (fiche ; null sans date sûre). */
export type Provenance = { genre: GenreOrigine; texte: string; sortie: string | null }

/** L'origine d'un skin Standard. */
export const BASE: Provenance = { genre: "base", texte: "Skin de base", sortie: null }

/** De quoi la date d'une source est le début. */
type DebutDe = "acte" | "evenement"

/** Une source (un contrat) de la table : genre, libellé, date de début (ISO) et de quoi. */
export type SourceOrigine = { g: GenreOrigine; l: string; d: string | null; k: DebutDe | null }





export type TableOrigines = {
  version: string | null; lueA: string; sources: SourceOrigine[]; objets: Record<string, [number, string] | [number, string, 1]>
}

/** Les récompenses gardées : celles qui sont un objet du Catalogue (skin, porte-bonheur, carte, tag, titre, flex). */
const RECOMPENSES = new Set(["EquippableSkinLevel", "EquippableCharmLevel", "PlayerCard", "Spray", "Title", "Totem"])

/** Un nom de valorant-api qui n'a pas été traduit (clé « Event_CNLaborDay_DisplayName ») : jamais affiché. */
function estCle(s: string): boolean {
  return /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(s)
}






export function casse(s: string): string {
  if (s !== s.toUpperCase() || s === s.toLowerCase()) return s
  return s.split(" ").map((mot, i) => {
    if (/^[IVXLC]+$/.test(mot) || /\d/.test(mot)) return mot
    const bas = mot.toLocaleLowerCase("fr")
    return i === 0 ? bas.charAt(0).toLocaleUpperCase("fr") + bas.slice(1) : bas
  }).join(" ")
}

/** Les réponses de valorant-api lues pour la table (`{ data: [...] }` ou la liste). */
export type ReponsesOrigines = { contracts: unknown; seasons: unknown; events: unknown; agents: unknown }

function donnees(r: unknown): unknown[] {
  return elements(estObjet(r) ? propre(r, "data") : r)
}

/**
 * La table des origines (ticket 8.11), tirée des réponses de valorant-api : chaque contrat devient une source (passe de combat :
 * acte d'une saison qui a un épisode parent ; contrat d'agent : agent connu, sinon son nom ; passe d'événement : son nom, ou
 * celui de l'événement, jamais une clé ; autre : son nom en casse de phrase), chaque récompense gardée un objet : « niveau N »
 * (compté sur les chapitres hors épilogue), « épilogue, niveau k », « chapitre N, gratuit ». Un objet déjà rangé par un autre
 * contrat garde le premier et prend la marque « et autres » ; par le même contrat, le premier rang seul. Entrée abîmée passée,
 * jamais d'erreur.
 */
export function construireOrigines(r: ReponsesOrigines, version: string | null, lueA: string): TableOrigines {
  const saisons = new Map<string, { nom: string | null; parent: string | null; debut: string | null }>()
  for (const s of donnees(r.seasons)) {
    const id = uuid(propre(s, "uuid"))
    if (id !== null) saisons.set(id, { nom: chaine(propre(s, "displayName")), parent: uuid(propre(s, "parentUuid")), debut: dateIso(propre(s, "startTime")) })
  }
  const evenements = new Map<string, { nom: string | null; debut: string | null }>()
  for (const e of donnees(r.events)) {
    const id = uuid(propre(e, "uuid"))
    if (id !== null) evenements.set(id, { nom: chaine(propre(e, "displayName")), debut: dateIso(propre(e, "startTime")) })
  }
  const agents = new Map<string, string>()
  for (const a of donnees(r.agents)) {
    const id = uuid(propre(a, "uuid")), nom = chaine(propre(a, "displayName"))
    if (id !== null && nom !== null) agents.set(id, nom)
  }
  const sources: SourceOrigine[] = []
  const objets: TableOrigines["objets"] = {}
  for (const c of donnees(r.contracts)) {
    const contenu = propre(c, "content")
    const type = chaine(propre(contenu, "relationType"))
    const relation = uuid(propre(contenu, "relationUuid"))
    const brut = chaine(propre(c, "displayName"))
    const nomContrat = brut !== null && !estCle(brut) ? casse(brut) : null
    let source: SourceOrigine | null = null
    if (type === "Season") {
      const acte = relation !== null ? saisons.get(relation) : undefined
      const episode = acte?.parent ? saisons.get(acte.parent) : undefined
      if (acte?.nom && episode?.nom) source = { g: "passe", l: `Passe de combat · ${casse(episode.nom)} · ${casse(acte.nom)}`, d: acte.debut, k: acte.debut ? "acte" : null }
      else if (nomContrat !== null) source = { g: "autre", l: nomContrat, d: null, k: null }
    } else if (type === "Agent") {
      const agent = relation !== null ? agents.get(relation) : undefined
      if (agent !== undefined) source = { g: "contrat", l: `Contrat d'agent · ${agent}`, d: null, k: null }
      else if (nomContrat !== null) source = { g: "contrat", l: `Contrat d'agent · ${nomContrat}`, d: null, k: null }
    } else if (type === "Event") {
      const ev = relation !== null ? evenements.get(relation) : undefined
      const nomEv = ev?.nom && !estCle(ev.nom) ? casse(ev.nom) : null
      const nom = nomContrat ?? nomEv
      if (nom !== null) source = { g: "evenement", l: `Récompense d'événement : ${nom}`, d: ev?.debut ?? null, k: ev?.debut ? "evenement" : null }
    } else if (nomContrat !== null) {
      source = { g: "autre", l: nomContrat, d: null, k: null }
    }
    if (source === null) continue
    const rang = sources.length
    let utilisee = false
    const ranger = (recompense: unknown, detail: string) => {
      const t = chaine(propre(recompense, "type")), id = uuid(propre(recompense, "uuid"))
      if (t === null || id === null || !RECOMPENSES.has(t)) return
      const deja = objets[id]
      if (deja === undefined) { objets[id] = [rang, detail]; utilisee = true }
      else if (deja[0] !== rang) objets[id] = [deja[0], deja[1], 1]
    }
    let niveau = 0, chapitre = 0
    for (const ch of elements(propre(contenu, "chapters"))) {
      const epilogue = propre(ch, "isEpilogue") === true
      if (!epilogue) chapitre++
      let k = 0
      for (const lv of elements(propre(ch, "levels"))) {
        k++
        if (!epilogue) niveau++
        ranger(propre(lv, "reward"), epilogue ? `épilogue, niveau ${k}` : `niveau ${niveau}`)
      }
      if (!epilogue) for (const fr of elements(propre(ch, "freeRewards"))) ranger(fr, `chapitre ${chapitre}, gratuit`)
    }
    if (utilisee) sources.push(source)
  }
  return { version, lueA, sources, objets }
}

/** Le contenu de origines.json. */
export function contenuOrigines(t: TableOrigines): string {
  return JSON.stringify(t)
}

const GENRES = new Set<string>(["passe", "contrat", "evenement", "base", "autre"])

/** Lit origines.json : absent, illisible ou d'une autre forme : null ; une source ou un objet abîmé est passé. */
export function lireOrigines(contenu: string | null | undefined): TableOrigines | null {
  if (!contenu) return null
  let brut: unknown
  try { brut = JSON.parse(contenu) } catch { return null }
  const lueA = dateIso(propre(brut, "lueA"))
  const s = propre(brut, "sources"), o = propre(brut, "objets")
  if (lueA === null || !Array.isArray(s) || !estObjet(o)) return null
  const sources: SourceOrigine[] = s.map((x) => {
    const g = chaine(propre(x, "g")), l = chaine(propre(x, "l")), d = dateIso(propre(x, "d")), k = chaine(propre(x, "k"))
    return g !== null && GENRES.has(g) && l !== null
      ? { g: g as GenreOrigine, l, d: d !== null && (k === "acte" || k === "evenement") ? d : null, k: d !== null && (k === "acte" || k === "evenement") ? k : null }
      : null
  }) as SourceOrigine[]
  const objets: TableOrigines["objets"] = {}
  for (const [cle, v] of Object.entries(o)) {
    const id = uuid(cle)
    if (id === null || !Array.isArray(v)) continue
    const [rang, detail, autres] = v
    if (typeof rang !== "number" || !Number.isInteger(rang) || rang < 0 || rang >= sources.length || sources[rang] === null) continue
    const d = chaine(detail)
    if (d === null) continue
    objets[id] = autres === 1 ? [rang, d, 1] : [rang, d]
  }
  return { version: chaine(propre(brut, "version")), lueA, sources, objets }
}

/** La table est-elle à refaire : absente, vide, ou d'une autre version que celle de la boutique lue (connue). */
export function originesARefaire(t: TableOrigines | null, version: unknown): boolean {
  if (t === null || Object.keys(t.objets).length === 0) return true
  return typeof version === "string" && version.length > 0 && t.version !== version
}


export function texteSortie(s: SourceOrigine): string | null {
  const quand = s.d !== null ? dateEnClair(s.d) : null
  if (quand === null || s.k === null) return null
  return `${quand}, début de ${s.k === "acte" ? "l'acte" : "l'événement"}`
}

/** L'origine d'un objet (par l'uuid que montre le Catalogue) ; absent de la table, ou table absente : null. */
export function origineDe(t: TableOrigines | null, id: string): Provenance | null {
  if (t === null) return null
  const o = Object.prototype.hasOwnProperty.call(t.objets, id) ? t.objets[id] : undefined
  if (o === undefined) return null
  const s = t.sources[o[0]]
  if (!s) return null
  return { genre: s.g, texte: `${s.l}, ${o[1]}${o[2] === 1 ? " et autres" : ""}`, sortie: texteSortie(s) }
}

/** Nombre d'objets de la table par genre de source (pour le journal). */
export function comptesOrigines(t: TableOrigines): Record<GenreOrigine, number> {
  const c: Record<GenreOrigine, number> = { passe: 0, contrat: 0, evenement: 0, base: 0, autre: 0, bundle: 0, nature: 0 }
  for (const o of Object.values(t.objets)) { const s = t.sources[o[0]]; if (s) c[s.g]++ }
  return c
}

/** La ligne du journal d'une table construite : des comptes seulement. */
export function ligneJournalOrigines(t: TableOrigines): string {
  const c = comptesOrigines(t)
  const n = Object.keys(t.objets).length
  return `Origines du catalogue : ${n} objets tirés de valorant-api (passes de combat ${c.passe}, contrats d'agent ${c.contrat}, `
    + `événements ${c.evenement}, autres ${c.autre}), ${t.sources.length} contrats.`
}

// ─────────────────────────── filtre d'obtention ───────────────────────────

/** Les codes du filtre « Obtention » des deux pages, dans l'ordre du choix, et leur libellé. */
export const OBTENTIONS: { code: string; nom: string }[] = [
  { code: "a", nom: "Achetables (prix connu)" },
  // Ticket 8.13 : vendus dans un bundle (sans prix connu pour l'objet seul).
  { code: "v", nom: "Vendus en bundle" },
  { code: "p", nom: "Passe de combat" },
  { code: "c", nom: "Contrats d'agent" },
  { code: "e", nom: "Événements" },
  { code: "b", nom: "Skins de base" },
  { code: "x", nom: "Autres récompenses" },
  { code: "n", nom: "Ni prix ni origine connus" },
]

// Ticket 8.13 : une nature (maîtrise d'agent, esport, Premier…) compte parmi les « Autres récompenses ».
const CODE_GENRE: Record<GenreOrigine, string> = { passe: "p", contrat: "c", evenement: "e", base: "b", autre: "x", bundle: "v", nature: "x" }

/** Les codes d'obtention d'un objet : « a » s'il a un prix, le code de son origine ; ni l'un ni l'autre : « n ». */
export function codesObtention(aPrix: boolean, p: Provenance | null): string {
  const codes = [aPrix ? "a" : null, p !== null ? CODE_GENRE[p.genre] : null].filter((x): x is string => x !== null)
  return codes.length > 0 ? codes.join(" ") : "n"
}

/**
 * Le choix « Obtention » d'une page (HTML), avec les seules options qui ont au moins un objet (`presents`, les codes vus) ; une
 * seule option utile : rien.
 */
export function choixObtention(presents: ReadonlySet<string>): string {
  const options = OBTENTIONS.filter((o) => presents.has(o.code))
  if (options.length < 2) return ""
  return `<select id="ob" aria-label="Obtention"><option value="">Toutes les obtentions</option>`
    + options.map((o) => `<option value="${o.code}">${o.nom.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</option>`).join("") + `</select>`
}
