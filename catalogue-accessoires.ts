// Catalogue de tous les accessoires (ticket 8.10 de epic-boutique-visuels) : la part pure.
//   - Lecture : les listes publiques de valorant-api en fr-FR (porte-bonheur `/v1/buddies`, tags `/v1/sprays`, cartes
//     `/v1/playercards`, titres `/v1/playertitles`, flex `/v1/flex`) mises à plat en éléments (lireAccessoires), gardés dans
//     accessoires.json (cache disque, au numéro de version du jeu de la boutique lue) ; chaque élément par l'uuid que vend la
//     boutique (un porte-bonheur : son premier niveau), son nom, son image, et pour un tag animé l'adresse de son animation.
//   - Prix (prixDeLAccessoire), mêmes règles et même ordre que les skins (ticket 8.9) : boutique d'accessoires du jour, puis
//     objet d'un bundle en vedette (prix vus à la lecture même de cette boutique, prix-vus.json, devise exacte), puis le dernier
//     prix retenu, puis la table de référence du paquet, sinon « Prix non communiqué par Riot ». Jamais un prix déduit.
//   - Page : le HTML de l'écran (accessoires-web.tsx), rendu par WebKit : la liste entière, recherche et filtre par type dans
//     la page, et la fiche de chaque élément dans la page même (grande image, animation d'un tag animé, prix, source, boutique
//     d'accessoires du jour) : un seul élément natif de poids.
//   - Origine (ticket 8.11, origines.ts) : un accessoire sans prix dit son origine exacte (passe de combat, contrat d'agent,
//     événement) à la place du prix, et sa sortie dans la fiche si une source exacte la donne ; filtre « Obtention ».
// Module pur : aucun import de « scripting », aucune lecture de fichier ; il tourne sous `node --test`.

import { PRIX_NON_COMMUNIQUE } from "./catalogue-skins"
import { normaliser } from "./souhaits"
import { CSP_CATALOGUE, imageAdmise, metaCsp } from "./securite"
import {
  DEVISE_KC, DEVISE_VP, complementDe, dateEnClair, prixReference, prixRetenu, sigleDevise, type PrixVus, type Reference,
} from "./prix-retenus"
import { choixObtention, codesObtention, origineDe, type Provenance, type TableOrigines } from "./origines"

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
function propre(x: unknown, nom: string): unknown {
  return estObjet(x) && Object.prototype.hasOwnProperty.call(x, nom) ? x[nom] : undefined
}
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 ? x.trim() : null
}
function elements(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuid(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x) ? x.toLowerCase() : null
}
/** Une adresse d'image admise (media.valorant-api.com, securite.ts), sinon null. */
function image(x: unknown): string | null {
  return imageAdmise(x) ? x : null
}

// ─────────────────────────── types ───────────────────────────

/** Les types d'accessoires, dans l'ordre de la page. */
export const TYPES_ACCESSOIRES = ["buddy", "spray", "card", "title", "flex"] as const
export type TypeAccessoire = (typeof TYPES_ACCESSOIRES)[number]

/** Libellé d'un élément de chaque type, et titre de sa section (puce du filtre). */
export const LIBELLES: Record<TypeAccessoire, { un: string; section: string }> = {
  buddy: { un: "Porte-bonheur", section: "Porte-bonheur" },
  spray: { un: "Tag", section: "Tags" },
  card: { un: "Carte de joueur", section: "Cartes de joueur" },
  title: { un: "Titre", section: "Titres" },
  flex: { un: "Flex (signe de soutien)", section: "Flex" },
}

/** Les adresses publiques de valorant-api lues pour le cache, par type (fr-FR). */
export const SOURCES_ACCESSOIRES: Record<TypeAccessoire, string> = {
  buddy: "https://valorant-api.com/v1/buddies?language=fr-FR",
  spray: "https://valorant-api.com/v1/sprays?language=fr-FR",
  card: "https://valorant-api.com/v1/playercards?language=fr-FR",
  title: "https://valorant-api.com/v1/playertitles?language=fr-FR",
  flex: "https://valorant-api.com/v1/flex?language=fr-FR",
}

/**
 * Un accessoire du catalogue : `id`, l'uuid que vend la boutique ; `type` ; `nom` (fr-FR, tel quel) ; `titre`, le nom sans le
 * mot de son type devant (« Carte Duo fluo » → « Duo fluo ») ; `icone` (petite image de la liste), `image` (grande image de la
 * fiche), `animation` (GIF d'un tag animé), `texte` (le texte d'un titre) : null s'ils manquent.
 */
export type Accessoire = {
  id: string; type: TypeAccessoire; nom: string; titre: string
  icone: string | null; image: string | null; animation: string | null; texte: string | null
}

/** Le mot de type que valorant-api met devant le nom en fr-FR, par type. */
const PREFIXES: Record<TypeAccessoire, RegExp> = {
  buddy: /^porte-bonheur\s+/i, spray: /^graffiti\s+/i, card: /^carte\s+/i, title: /^titre\s+/i, flex: /^flex\s+/i,
}

// ─────────────────────────── lecture de valorant-api ───────────────────────────

/** Un élément de chaque type, d'une entrée de valorant-api ; entrée abîmée, sans uuid ni nom : null. */
function lireUn(type: TypeAccessoire, x: unknown): Accessoire | null {
  const nom = chaine(propre(x, "displayName"))
  let id = uuid(propre(x, "uuid"))
  if (type === "buddy") id = uuid(propre(elements(propre(x, "levels"))[0], "uuid"))
  if (id === null || nom === null) return null
  if (type === "spray" && propre(x, "isNullSpray") === true) return null
  const sansPrefixe = nom.replace(PREFIXES[type], "").trim()
  const base = { id, type, nom, titre: sansPrefixe.length > 0 ? sansPrefixe : nom, icone: null, image: null, animation: null, texte: null }
  switch (type) {
    case "buddy": {
      const icone = image(propre(x, "displayIcon")) ?? image(propre(elements(propre(x, "levels"))[0], "displayIcon"))
      return { ...base, icone, image: icone }
    }
    case "spray": {
      const icone = image(propre(x, "displayIcon"))
      const grande = image(propre(x, "fullTransparentIcon")) ?? image(propre(x, "fullIcon")) ?? icone
      return { ...base, icone: icone ?? grande, image: grande, animation: image(propre(x, "animationGif")) }
    }
    case "card": {
      const icone = image(propre(x, "displayIcon")) ?? image(propre(x, "smallArt"))
      return { ...base, icone, image: image(propre(x, "largeArt")) ?? image(propre(x, "wideArt")) ?? icone }
    }
    case "title": {
      const texte = chaine(propre(x, "titleText"))
      return { ...base, texte }
    }
    case "flex": {
      const icone = image(propre(x, "displayIcon"))
      return { ...base, icone, image: icone }
    }
  }
}

/**
 * Les accessoires des réponses de valorant-api (`{ data: [...] }` ou la liste), par type : chacun lu par lireUn, un uuid en
 * double passé (le premier gardé), tag nul (`isNullSpray`) passé ; rangés par type (ordre de TYPES_ACCESSOIRES) puis par titre.
 * Jamais d'erreur.
 */
export function lireAccessoires(reponses: Partial<Record<TypeAccessoire, unknown>>): Accessoire[] {
  const vus = new Set<string>()
  const out: Accessoire[] = []
  for (const type of TYPES_ACCESSOIRES) {
    const r = reponses[type]
    for (const x of elements(estObjet(r) ? propre(r, "data") : r)) {
      const a = lireUn(type, x)
      if (a === null || vus.has(a.id)) continue
      vus.add(a.id)
      out.push(a)
    }
  }
  const rang = new Map(TYPES_ACCESSOIRES.map((t, i) => [t, i]))
  return out.sort((a, b) => rang.get(a.type)! - rang.get(b.type)! || a.titre.localeCompare(b.titre, "fr") || a.id.localeCompare(b.id))
}

// ─────────────────────────── accessoires.json ───────────────────────────

/** accessoires.json : la version du jeu de la boutique qui l'a fait (ou null), quand, les éléments. */
export type CacheAccessoires = { version: string | null; lueA: string; elements: Accessoire[] }

/** Le contenu de accessoires.json. */
export function contenuCache(version: string | null, lueA: string, liste: Accessoire[]): string {
  return JSON.stringify({ version, lueA, elements: liste })
}

const TYPES = new Set<string>(TYPES_ACCESSOIRES)

/** Lit accessoires.json : absent, illisible ou d'une autre forme : null ; un élément abîmé est passé (images revues). */
export function lireCache(contenu: string | null | undefined): CacheAccessoires | null {
  if (!contenu) return null
  let brut: unknown
  try { brut = JSON.parse(contenu) } catch { return null }
  const lueA = chaine(propre(brut, "lueA"))
  const liste = propre(brut, "elements")
  if (lueA === null || !Array.isArray(liste)) return null
  const version = chaine(propre(brut, "version"))
  const vus = new Set<string>()
  const out: Accessoire[] = []
  for (const x of liste) {
    const id = uuid(propre(x, "id")), type = chaine(propre(x, "type")), nom = chaine(propre(x, "nom"))
    if (id === null || type === null || !TYPES.has(type) || nom === null || vus.has(id)) continue
    vus.add(id)
    out.push({
      id, type: type as TypeAccessoire, nom, titre: chaine(propre(x, "titre")) ?? nom,
      icone: image(propre(x, "icone")), image: image(propre(x, "image")), animation: image(propre(x, "animation")), texte: chaine(propre(x, "texte")),
    })
  }
  return { version, lueA, elements: out }
}

/** Le cache est-il à refaire : absent, vide, ou d'une autre version que celle de la boutique lue (connue). */
export function cacheARefaire(cache: CacheAccessoires | null, version: unknown): boolean {
  if (cache === null || cache.elements.length === 0) return true
  return typeof version === "string" && version.length > 0 && cache.version !== version
}

// ─────────────────────────── prix et boutique d'accessoires ───────────────────────────

/** Une fin (ISO) passée : vrai ; absente ou illisible : faux. */
function finie(x: unknown, now: number): boolean {
  const s = chaine(x)
  const t = s !== null ? Date.parse(s) : NaN
  return Number.isFinite(t) && now >= t
}

/**
 * La boutique d'accessoires en cache court-elle encore (`accessories.endsAt` à venir ; inconnue : la boutique du jour,
 * `daily.resetAt` à venir) : sinon on ne sait pas ce qu'elle propose (la fiche le dit, jamais « Non »).
 */
export function boutiqueAccessoiresConnue(shop: unknown, now: number): boolean {
  const fin = chaine(propre(propre(shop, "accessories"), "endsAt"))
  const reset = chaine(propre(propre(shop, "daily"), "resetAt"))
  return fin !== null ? !finie(fin, now) : reset !== null && !finie(reset, now)
}

/**
 * Les ids de la boutique d'accessoires en cache, si elle court encore (`accessories.endsAt` à venir ; inconnue : la boutique
 * du jour, `daily.resetAt` à venir) ; sinon un ensemble vide.
 */
export function idsBoutiqueAccessoires(shop: unknown, now: number): Set<string> {
  if (!boutiqueAccessoiresConnue(shop, now)) return new Set()
  const acc = propre(shop, "accessories")
  return new Set(elements(propre(acc, "items")).map((i) => uuid(propre(i, "id"))).filter((x): x is string => x !== null))
}

/** Les ids des objets des bundles en vedette pas finis de la boutique en cache (du jour). */
function idsBundles(shop: unknown, now: number): Set<string> {
  const reset = chaine(propre(propre(shop, "daily"), "resetAt"))
  if (reset === null || finie(reset, now)) return new Set()
  const ids = new Set<string>()
  for (const b of elements(propre(shop, "bundles"))) {
    if (finie(propre(b, "endsAt"), now)) continue
    for (const o of elements(propre(b, "items"))) { const id = uuid(propre(o, "id")); if (id !== null) ids.add(id) }
  }
  return ids
}

/** D'où vient le prix d'un accessoire. */
export type OriginePrixAccessoire = "accessoires" | "bundle" | "retenu" | "reference" | "confirme"


export type PrixAccessoire = { montant: number | null; texte: string; voix: string; origine: OriginePrixAccessoire | null; source: string | null }

/** Le nom d'une devise lu par VoiceOver. */
function voixDevise(devise: string): string {
  return devise === DEVISE_KC ? "Crédits Kingdom" : devise === DEVISE_VP ? "VP" : ""
}

/**
 * Le prix d'un accessoire (ticket 8.10), dans l'ordre : boutique d'accessoires du jour (l'objet y est, et son prix vu à la
 * lecture même de cette boutique : prix-vus.json, `ou` « accessoires », `vuLe` = `shop.updatedAt`, devise exacte) ; objet d'un
 * bundle en vedette (de même, `ou` « bundle ») ; dernier prix retenu (le plus récent, KC à égalité) ; table de référence (VP) ;
 * sinon « Prix non communiqué par Riot ». Seules les devises connues (VP, KC) se disent.
 */
export function prixDeLAccessoire(id: string, shop: unknown, now: number, retenus: PrixVus | null, reference: Reference | null,
  ensembles: { boutique: Set<string>; bundles: Set<string> } = { boutique: idsBoutiqueAccessoires(shop, now), bundles: idsBundles(shop, now) }): PrixAccessoire {
  const rien: PrixAccessoire = { montant: null, texte: PRIX_NON_COMMUNIQUE, voix: PRIX_NON_COMMUNIQUE, origine: null, source: null }
  const dit = (montant: number, devise: string, origine: OriginePrixAccessoire, source: string): PrixAccessoire =>
    ({ montant, texte: `${montant} ${sigleDevise(devise)}`, voix: `${montant} ${voixDevise(devise)}`, origine, source })
  const lue = chaine(propre(shop, "updatedAt"))
  const vuIci = (ou: "accessoires" | "bundle") => {
    if (retenus === null || lue === null || !Object.prototype.hasOwnProperty.call(retenus, id)) return null
    for (const [devise, p] of Object.entries(retenus[id])) if (p.ou === ou && p.vuLe === lue && sigleDevise(devise) !== null) return { ...p, devise }
    return null
  }
  if (ensembles.boutique.has(id)) {
    const p = vuIci("accessoires")
    if (p !== null) return dit(p.montant, p.devise, "accessoires", "Boutique d'accessoires du jour")
  }
  if (ensembles.bundles.has(id)) {
    const p = vuIci("bundle")
    if (p !== null) return dit(p.montant, p.devise, "bundle", "Bundle en vedette")
  }
  const r = prixRetenu(retenus, id, null)
  if (r !== null && sigleDevise(r.devise) !== null) return dit(r.montant, r.devise, "retenu", `Vu dans ta boutique le ${dateEnClair(r.vuLe) ?? "?"}`)
  const ref = prixReference(reference, id)
  if (ref !== null && reference !== null) {
    const hote = reference.adresse.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    return dit(ref, DEVISE_VP, "reference", `Table de référence (${hote}, ${dateEnClair(reference.date) ?? reference.date})`)
  }
  return rien
}

/**
 * Les lignes de la page : chaque accessoire avec son prix (prixDeLAccessoire, boutique et bundles lus une fois) et sa marque
 * de la boutique d'accessoires du jour.
 */
export function lignesAccessoires(liste: readonly Accessoire[], shop: unknown, now: number, retenus: PrixVus | null, reference: Reference | null,
  origines: TableOrigines | null = null): LigneAccessoire[] {
  const ensembles = { boutique: idsBoutiqueAccessoires(shop, now), bundles: idsBundles(shop, now) }
  return liste.map((a) => {
    const prix = prixDeLAccessoire(a.id, shop, now, retenus, reference, ensembles)
    const origine = origineDe(origines, a.id)
    const ligne: LigneAccessoire = { a, prix, enBoutique: ensembles.boutique.has(a.id), origine }
    // Ticket 8.13 : sans prix ni origine, le complément de la table (après elles) : un prix confirmé (en VP, dit comme un
    // prix), le bundle qui le vendait ou sa nature (dits comme une origine).
    if (prix.montant !== null || origine !== null) return ligne
    const k = complementDe(reference, a.id)
    if (k === null) return ligne
    if (k.genre === "prix") return { ...ligne, prix: { montant: k.vp, texte: `${k.vp} VP`, voix: `${k.vp} VP`, origine: "confirme", source: k.source } }
    return { ...ligne, origine: { genre: k.genre, texte: k.texte, sortie: null } }
  })
}

// ─────────────────────────── page ───────────────────────────

/** Couleurs de la page (design.tsx, thème sombre), comme celle des skins. */
export type CouleursPage = { fond: string; surface: string; bordure: string; texte: string; texteDoux: string; texteDiscret: string; orange: string; or: string }

/** Nom de l'écouteur de la page dans l'app. */
export const PONT_ACCESSOIRES = "valshopAccessoires"

const echapper = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * Le script de la page : recherche (normalisée comme `normaliser`), type, compte ; la fiche d'un élément ouverte dans la page
 * (grande image ou animation, nom, type, prix, source, boutique d'accessoires du jour ; « Retour » ou Échap la referme et rend
 * la place dans la liste) ; signal « prête » après deux images ou 150 ms, une fois (ticket 8.8) ; mesure d'un filtre. Pas de
 * `${` : chaîne brute.
 */
const SCRIPT = String.raw`(() => {
  const H = window.webkit && window.webkit.messageHandlers
  const poster = (corps) => { try { const h = H && H[__PONT__]; if (h) { const p = h.postMessage(corps); if (p && p.catch) p.catch(() => {}) } } catch (e) {} }
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[‘’ʼ\x60]/g, "'").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/ß/g, "ss")
  const q = document.getElementById("q"), compte = document.getElementById("compte"), vide = document.getElementById("vide")
  const liste = document.getElementById("liste"), fiche = document.getElementById("fiche"), ob = document.getElementById("ob")
  const sections = Array.from(document.querySelectorAll("section[data-type]")).map((s) => ({
    s, type: s.getAttribute("data-type"),
    lignes: Array.from(s.querySelectorAll("li")).map((li) => { const b = li.firstElementChild; return { li, n: b.getAttribute("data-n") || "", e: b.hasAttribute("data-e"), o: " " + (b.getAttribute("data-o") || "") + " " } }),
  }))
  let type = ""
  const peinte = (fn) => requestAnimationFrame(() => setTimeout(fn, 0))
  function appliquer(t0) {
    const texte = norm(q.value.trim()), o = ob && ob.value ? " " + ob.value + " " : ""
    let total = 0
    for (const x of sections) {
      if (type && type !== "boutique" && x.type !== type) { if (!x.s.hidden) x.s.hidden = true; continue }
      let k = 0
      for (const l of x.lignes) {
        const ok = (type !== "boutique" || l.e) && (!o || l.o.includes(o)) && (!texte || l.n.includes(texte))
        if (l.li.hidden === ok) l.li.hidden = !ok
        if (ok) k++
      }
      x.s.hidden = k === 0
      total += k
    }
    compte.textContent = total + (total > 1 ? " accessoires" : " accessoire")
    vide.hidden = total > 0
    if (t0 !== undefined) peinte(() => poster({ genre: "mesure", type: "filtre", ms: Math.round(performance.now() - t0) }))
  }
  q.addEventListener("input", () => appliquer(performance.now()))
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") q.blur() })
  if (ob) ob.addEventListener("change", () => appliquer(performance.now()))
  for (const b of Array.from(document.querySelectorAll(".puce"))) {
    b.addEventListener("click", () => {
      const t0 = performance.now()
      type = b.getAttribute("data-type") || ""
      for (const o of Array.from(document.querySelectorAll(".puce"))) o.setAttribute("aria-pressed", o === b ? "true" : "false")
      appliquer(t0)
      window.scrollTo(0, 0)
    })
  }
  let ouvert = null, place = 0
  const champ = (id, v) => { const el = document.getElementById(id); el.textContent = v || ""; el.hidden = !v }
  const TYPES = __TYPES__, CONNUE = __CONNUE__
  const vignette = (b) => { const i = b.querySelector("img"); return i ? i.getAttribute("src") : null }
  // Une adresse dite par son nom de fichier : refaite dans le dossier de la vignette.
  const adresse = (b, v) => !v ? null : v.indexOf("/") >= 0 ? v : (vignette(b) || "").replace(/[^/]*$/, v)
  function ouvrir(b) {
    ouvert = b; place = window.scrollY
    const img = document.getElementById("f-img")
    const anim = adresse(b, b.getAttribute("data-a")), grande = adresse(b, b.getAttribute("data-i")) || vignette(b), texteTitre = b.getAttribute("data-t")
    const src = anim || grande
    if (src) { img.src = src; img.hidden = false } else { img.removeAttribute("src"); img.hidden = true }
    champ("f-titre", texteTitre && !src ? texteTitre : "")
    champ("f-anim", anim ? "Animation du tag" : "")
    document.getElementById("f-nom").textContent = b.querySelector(".n").textContent
    const section = b.closest("section")
    champ("f-type", section ? TYPES[section.getAttribute("data-type")] : "")
    document.getElementById("f-prix").textContent = b.getAttribute("data-prix") || __RIEN__
    document.getElementById("f-prix-v").textContent = b.getAttribute("data-v") || b.getAttribute("data-prix") || __RIEN__
    // Ticket 8.11 : l'origine (attribut si la ligne montre un prix, sinon le texte discret de la ligne, qui la dit à sa place)
    // à la place du prix s'il n'y en a pas ; la sortie si elle est connue.
    const codes = " " + (b.getAttribute("data-o") || "") + " ", aPrix = !!b.getAttribute("data-prix")
    const connue = /\s[pcebxv]\s/.test(codes)
    const discret = b.querySelector(".d .h")
    const origine = b.getAttribute("data-or") || (!aPrix && connue && discret ? discret.textContent : "")
    document.getElementById("f-prix-l").hidden = !aPrix && !!origine
    champ("f-or", origine); document.getElementById("f-or-l").hidden = !origine
    champ("f-so", b.getAttribute("data-so") || ""); document.getElementById("f-so-l").hidden = !b.getAttribute("data-so")
    document.getElementById("f-source").textContent = b.getAttribute("data-src") || ""
    document.getElementById("f-source-l").hidden = !b.getAttribute("data-src")
    document.getElementById("f-boutique").textContent = !CONNUE ? "Inconnue (boutique d'accessoires d'une semaine passée)" : b.hasAttribute("data-e") ? "Oui" : "Non"
    liste.hidden = true; fiche.hidden = false
    window.scrollTo(0, 0)
    const h = document.getElementById("f-nom"); h.focus()
    poster({ genre: "fiche" })
  }
  function fermer() {
    if (!ouvert) return
    fiche.hidden = true; liste.hidden = false
    const img = document.getElementById("f-img"); img.removeAttribute("src")
    window.scrollTo(0, place)
    const b = ouvert; ouvert = null
    // Le focus rendu à la ligne, sans défiler : la place de la liste est celle d'avant la fiche.
    b.focus({ preventScroll: true })
  }
  document.getElementById("retour").addEventListener("click", fermer)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer() })
  liste.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("button[data-action]") : null
    if (!b) return
    e.preventDefault()
    ouvrir(b)
  })
  window.accessoires = { fermer, ouvert: () => ouvert !== null }
  appliquer()
  let dite = false
  const dire = () => { if (!dite) { dite = true; poster({ genre: "prete", jeton: __JETON__ }) } }
  requestAnimationFrame(() => requestAnimationFrame(dire))
  setTimeout(dire, 150)
})()`

/** La feuille de la page (celle des skins, et la fiche). */
function css(c: CouleursPage): string {
  return `:root{color-scheme:dark}
*{box-sizing:border-box}
html{font:-apple-system-body;-webkit-text-size-adjust:100%}
html,body{margin:0;background:${c.fond};color:${c.texte}}
body{line-height:1.3;padding:0 0 calc(24px + env(safe-area-inset-bottom))}
.tete{position:sticky;top:0;z-index:5;background:${c.fond};padding:8px 16px 10px}
#q{width:100%;font:inherit;color:${c.texte};background:${c.surface};border:1px solid ${c.bordure};border-radius:14px;padding:11px 14px;-webkit-appearance:none;appearance:none}
#q::placeholder{color:${c.texteDiscret}}
.puces{display:flex;gap:6px;overflow-x:auto;padding:8px 0 2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.puces::-webkit-scrollbar{display:none}
.puce{flex:0 0 auto;font:inherit;font-size:.88em;color:${c.texteDoux};background:${c.surface};border:0;border-radius:999px;padding:6px 14px;min-height:36px;font-weight:600;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.puce[aria-pressed="true"]{color:${c.fond};background:${c.texte};border-color:${c.texte}}
#compte{margin:6px 0 0;font-size:.76em;color:${c.texteDiscret}}
.choix{display:flex;gap:8px;padding-top:6px}
select{flex:1 1 0;min-width:0;font:inherit;font-size:.88em;color:${c.texte};background:${c.surface};border:0;border-radius:12px;padding:7px 10px;min-height:36px}
h2{margin:0;padding:20px 16px 8px;font-size:1em;font-weight:800;font-stretch:condensed;letter-spacing:.06em;text-transform:uppercase;color:${c.texte}}
ul{list-style:none;margin:0 16px;padding:0;background:${c.surface};border-radius:16px;overflow:hidden}
li+li{border-top:1px solid ${c.bordure}}
li{content-visibility:auto;contain-intrinsic-size:auto 61px}
li[hidden],section[hidden],[hidden]{display:none!important}
.l{display:flex;align-items:center;gap:10px;width:100%;min-height:60px;padding:8px 12px;font:inherit;color:inherit;text-align:left;background:none;border:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.l:active{background:${c.bordure}}
.l img,.l .sans{flex:0 0 44px;width:44px;height:44px;object-fit:contain}
.l .sans{display:flex;align-items:center;justify-content:center;font-size:.6em;font-weight:700;color:${c.texteDiscret};border:1px solid ${c.bordure};border-radius:8px}
.t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s{font-size:.76em;color:${c.texteDiscret};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{color:${c.orange}}
.d{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:2px;max-width:42%}
.d b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.d b.h{font-weight:400;font-size:.76em;color:${c.texteDiscret};white-space:normal;text-align:right}
#vide{margin:24px 16px;color:${c.texteDiscret}}
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
#fiche{padding:8px 16px 24px}
#retour{font:inherit;color:${c.texte};background:none;border:0;padding:10px 0;min-height:44px;touch-action:manipulation}
.visuel{display:flex;align-items:center;justify-content:center;min-height:200px;margin:8px 0 12px;background:${c.surface};border-radius:20px}
#f-img{max-width:100%;max-height:320px;object-fit:contain}
#f-titre{font-size:1.6em;font-weight:800;text-align:center;padding:24px}
#f-nom{margin:0;font-size:1.25em;font-weight:700;outline:none}
.p{color:${c.texteDiscret};margin:2px 0 0;font-size:.88em}
dl{margin:16px 0 0;background:${c.surface};border-radius:16px;overflow:hidden}
dl div{display:flex;justify-content:space-between;gap:12px;padding:12px}
dl div+div{border-top:1px solid ${c.bordure}}
dt{color:${c.texteDoux}}
dd{margin:0;text-align:right;font-weight:600}`
}

/** Une adresse dite par son seul nom de fichier si elle est dans le dossier de la vignette (le script de la page la refait), sinon entière. */
function voisine(icone: string | null, adresse: string): string {
  if (icone === null) return adresse
  const dossier = icone.slice(0, icone.lastIndexOf("/") + 1)
  const reste = adresse.startsWith(dossier) ? adresse.slice(dossier.length) : null
  return reste !== null && /^[A-Za-z0-9._-]+$/.test(reste) ? reste : adresse
}

/** Une ligne de la liste : ce que montre et dit la page pour un accessoire ; ticket 8.11 : son origine (null : inconnue). */
export type LigneAccessoire = { a: Accessoire; prix: PrixAccessoire; enBoutique: boolean; origine?: Provenance | null }

/**
 * La page des accessoires : un document complet. `lignes` (dans l'ordre de lireAccessoires, avec leur prix et la marque de la
 * boutique d'accessoires du jour), `couleurs`, `jeton` (renvoyé par la page prête). Chaque ligne est un bouton qui ouvre la
 * fiche dans la page ; VoiceOver lit son texte : titre, type, prix et la boutique. Rien d'externe sauf les images (media.valorant-api.com,
 * paresseuses).
 */
export function pageAccessoires(lignes: readonly LigneAccessoire[], { couleurs, jeton, boutiqueConnue = true }: { couleurs: CouleursPage; jeton: number; boutiqueConnue?: boolean }): string {
  const parType = new Map<TypeAccessoire, string[]>()
  const obtentions = new Set<string>()
  let enBoutique = 0
  let avecOrigines = false
  for (const { a, prix, enBoutique: e, origine = null } of lignes) {
    if (origine !== null) avecOrigines = true
    const codes = codesObtention(prix.montant !== null, origine)
    for (const x of codes.split(" ")) obtentions.add(x)
    if (e) enBoutique++
    const libelle = LIBELLES[a.type].un
    const vignette = a.icone !== null ? `<img loading="lazy" src="${echapper(a.icone)}" alt="" width="44" height="44">` : `<span class="sans" aria-hidden="true">${a.type === "title" ? "Titre" : ""}</span>`


    const affiche = prix.montant === null ? `<b class="h">${echapper(origine !== null ? origine.texte : prix.texte)}</b>`
      : prix.voix !== prix.texte ? `<b><span aria-hidden="true">${echapper(prix.texte)}</span><span class="vh">${echapper(prix.voix)}</span></b>` : `<b>${echapper(prix.texte)}</b>`


    const attributs = [
      `data-action="fiche"`, `data-n="${echapper(normaliser(`${a.nom} ${a.texte ?? ""}`))}"`,
      prix.montant !== null ? `data-prix="${echapper(prix.texte)}"` : "", prix.montant !== null && prix.voix !== prix.texte ? `data-v="${echapper(prix.voix)}"` : "", prix.source !== null ? `data-src="${echapper(prix.source)}"` : "",
      a.image !== null && a.image !== a.icone ? `data-i="${echapper(voisine(a.icone, a.image))}"` : "",
      a.animation !== null ? `data-a="${echapper(voisine(a.icone, a.animation))}"` : "",
      a.texte !== null ? `data-t="${echapper(a.texte)}"` : "", e ? "data-e" : "",
      // Ticket 8.11 : codes d'obtention (filtre) ; l'origine n'est redite en attribut que si la ligne montre un prix (sinon la
      // fiche la lit dans la ligne) ; la sortie, si elle est connue.
      `data-o="${codes}"`,
      origine !== null && prix.montant !== null ? `data-or="${echapper(origine.texte)}"` : "",
      origine !== null && origine.sortie !== null ? `data-so="${echapper(origine.sortie)}"` : "",
    ].filter((x) => x !== "").join(" ")
    // Ticket 8.11 : un tag animé le dit dans la liste (son animation joue dans sa fiche : trop lourde pour la liste).
    const sous = a.type === "title" && a.texte !== null && a.texte !== a.titre ? `« ${a.texte} »` : a.animation !== null ? "Tag animé" : libelle
    const l = parType.get(a.type) ?? []
    // VoiceOver lit le bouton dans l'ordre de son texte : titre, type, prix, puis « Dans ta boutique » s'il y est.
    l.push(`<li><button class="l" ${attributs}>${vignette}<span class="t"><span class="n">${echapper(a.titre)}</span>`
      + `<span class="s">${echapper(sous)}</span></span><span class="d">${affiche}${e ? `<span class="s m">Dans ta boutique</span>` : ""}</span></button></li>`)
    parType.set(a.type, l)
  }
  const sections = TYPES_ACCESSOIRES.filter((t) => parType.has(t))
    .map((t) => `<section data-type="${t}"><h2>${echapper(LIBELLES[t].section)}</h2><ul>${parType.get(t)!.join("")}</ul></section>`).join("")
  const puces = [`<button class="puce" type="button" data-type="" aria-pressed="true">Tous</button>`,
    ...TYPES_ACCESSOIRES.filter((t) => parType.has(t)).map((t) => `<button class="puce" type="button" data-type="${t}" aria-pressed="false">${echapper(LIBELLES[t].section)}</button>`),
    ...(enBoutique > 0 ? [`<button class="puce" type="button" data-type="boutique" aria-pressed="false">Dans ta boutique</button>`] : [])].join("")
  const choixOrigines = avecOrigines ? choixObtention(obtentions) : ""
  const types = Object.fromEntries(TYPES_ACCESSOIRES.map((t) => [t, LIBELLES[t].un]))
  // Ticket 8.11 : __RIEN__ paraît deux fois dans le script ; remplacé une seule fois (8.10), la fiche d'un accessoire sans prix
  // levait « Can't find variable: __RIEN__ » et ne s'ouvrait pas (vu dans WebKit) : chaque occurrence remplacée.
  const script = SCRIPT.replace("__PONT__", JSON.stringify(PONT_ACCESSOIRES)).replace("__JETON__", String(Math.trunc(jeton)))
    .replace("__TYPES__", JSON.stringify(types).replace(/</g, "\\u003c")).replace(/__RIEN__/g, JSON.stringify(PRIX_NON_COMMUNIQUE)).replace("__CONNUE__", boutiqueConnue ? "true" : "false")
  const fond = couleurs.fond
  const n = lignes.length
  // Ticket 8.8 : le fond et `color-scheme` en ligne sur <html> et <body>, avant toute feuille de style ; ticket 7.8 : la CSP en tête.
  return `<!doctype html><html lang="fr" style="background-color:${fond};color-scheme:dark"><head><meta charset="utf-8">${metaCsp(CSP_CATALOGUE)}`
    + `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark">`
    + `<style>${css(couleurs)}</style></head><body style="background-color:${fond}">`
    + `<div id="liste"><header class="tete"><input id="q" type="search" placeholder="Rechercher un accessoire" aria-label="Rechercher un accessoire" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">`
    + `<div class="puces" role="group" aria-label="Type">${puces}</div>`
    + (choixOrigines ? `<div class="choix">${choixOrigines}</div>` : "")
    + `<p id="compte" aria-live="polite">${n} ${n > 1 ? "accessoires" : "accessoire"}</p></header>`
    + `<main>${sections}<p id="vide" hidden>Aucun accessoire ne correspond.</p></main></div>`
    + `<div id="fiche" role="dialog" aria-modal="true" aria-labelledby="f-nom" hidden><button id="retour" type="button">‹ Tous les accessoires</button>`
    + `<div class="visuel"><img id="f-img" alt="" hidden><div id="f-titre" hidden></div></div>`
    + `<h1 id="f-nom" tabindex="-1"></h1><p id="f-type" class="p"></p><p id="f-anim" class="p" hidden></p>`
    + `<dl><div id="f-prix-l"><dt>Prix</dt><dd><span id="f-prix" aria-hidden="true"></span><span id="f-prix-v" class="vh"></span></dd></div><div id="f-source-l"><dt>Source du prix</dt><dd id="f-source"></dd></div>`
    + `<div id="f-or-l" hidden><dt>Origine</dt><dd id="f-or"></dd></div><div id="f-so-l" hidden><dt>Sortie</dt><dd id="f-so"></dd></div>`
    + `<div><dt>Dans ta boutique d'accessoires</dt><dd id="f-boutique"></dd></div></dl></div>`
    + `<script>${script}</script></body></html>`
}
