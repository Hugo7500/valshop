// Prix retenus et table de référence (ticket 8.9 de epic-boutique-visuels) : la part pure.
//   - Prix retenus : chaque prix vu dans SA boutique (storefront v3 brut, à la lecture de la boutique, jamais au rendu) :
//     offres du jour, Night Market au prix de base (`Offer.Cost`, jamais `DiscountCosts` : la remise est propre au compte),
//     objets des bundles (`Items[]` : `CurrencyID`, `BasePrice` ; sinon `ItemOffers[].Offer`), boutique d'accessoires ; un
//     objet, sa devise exacte, un montant entier > 0. Gardés pour de bon dans prix-vus.json (contrat-donnees.md), par objet et
//     par devise, avec la date de la lecture : une entrée n'est jamais effacée, un nouveau prix vu la remplace.
//   - Table de référence : prix-reference.ts du paquet (module de données généré par outils/prix-reference.ts), uuid → VP,
//     avec sa source et sa date.
//   - État des prix (etat-prix.json, écrit à la lecture de la boutique) : le dernier contrôle HenrikDev (ticket 8.6) et le
//     nombre de skins à prix par source, que dit la section « Prix du catalogue » des Réglages.
// Module pur : aucun import de « scripting », aucune lecture de fichier ; il tourne sous `node --test`.

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]





export function dateEnClair(iso: string | null): string | null {
  const t = iso !== null ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  const j = d.getUTCDate()
  return `${j === 1 ? "1er" : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Devise des Valorant Points (valorant-api, /v1/currencies). */
export const DEVISE_VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"
/** Devise des Crédits Kingdom, celle de la boutique d'accessoires (valorant-api, /v1/currencies). */
export const DEVISE_KC = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d"

/** Le sigle d'une devise connue (« VP », « KC ») ; null pour toute autre : son montant n'est jamais affiché. */
export function sigleDevise(devise: string | null | undefined): string | null {
  return devise === DEVISE_VP ? "VP" : devise === DEVISE_KC ? "KC" : null
}

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
/** Une propriété propre (jamais héritée), sinon undefined. */
function propre(x: unknown, nom: string): unknown {
  return estObjet(x) && Object.prototype.hasOwnProperty.call(x, nom) ? x[nom] : undefined
}
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null
}
function montant(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null
}
function elements(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuid(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x) ? x.toLowerCase() : null
}

// ─────────────────────────── prix vus dans le storefront ───────────────────────────

/** Où un prix a été vu : offre du jour, Night Market (prix de base), objet d'un bundle, boutique d'accessoires. */
export type OuVu = "jour" | "nm" | "bundle" | "accessoires"

/** Les prix vus à une lecture : objet → devise → montant et lieu ; `douteux`, les couples objet × devise vus à deux montants. */
export type PrixVusLecture = { vus: Map<string, Map<string, { montant: number; ou: OuVu }>>; douteux: number }

/**
 * Les prix sûrs du storefront v3 brut : une offre (`Rewards` d'une seule récompense, un exemplaire, `ItemID` uuid ; `Cost` à
 * une seule devise uuid, montant entier > 0) ; un objet de bundle (`Item.ItemID`, `Item.Amount` 1 ou absent, `CurrencyID`,
 * `BasePrice`, sauf `IsPromoItem`). Un même objet vu à deux montants dans une même devise : douteux, rien de gardé pour lui.
 * Forme inattendue : sections passées. Jamais d'erreur.
 */
export function prixVusDuStorefront(brut: unknown): PrixVusLecture {
  const tous = new Map<string, Map<string, { montants: Set<number>; ou: OuVu }>>()
  const noter = (id: string | null, devise: string | null, m: number | null, ou: OuVu) => {
    if (id === null || devise === null || m === null) return
    let parDevise = tous.get(id)
    if (!parDevise) { parDevise = new Map(); tous.set(id, parDevise) }
    const v = parDevise.get(devise)
    if (v) v.montants.add(m)
    else parDevise.set(devise, { montants: new Set([m]), ou })
  }
  const offre = (o: unknown, ou: OuVu) => {
    const r = elements(propre(o, "Rewards"))
    if (r.length !== 1) return
    const q = propre(r[0], "Quantity")
    if (q !== undefined && q !== 1) return
    const cout = propre(o, "Cost")
    const devises = estObjet(cout) ? Object.keys(cout) : []
    if (devises.length !== 1) return
    noter(uuid(propre(r[0], "ItemID")), uuid(devises[0]), montant(propre(cout, devises[0])), ou)
  }
  for (const o of elements(propre(propre(brut, "SkinsPanelLayout"), "SingleItemStoreOffers"))) offre(o, "jour")
  for (const o of elements(propre(propre(brut, "BonusStore"), "BonusStoreOffers"))) offre(propre(o, "Offer"), "nm")
  const fb = propre(brut, "FeaturedBundle")
  for (const b of [propre(fb, "Bundle"), ...elements(propre(fb, "Bundles"))].filter(estObjet)) {
    const items = elements(propre(b, "Items"))
    if (items.length > 0) {
      for (const x of items) {
        if (propre(x, "IsPromoItem") === true) continue
        const item = propre(x, "Item")
        const q = propre(item, "Amount")
        if (q !== undefined && q !== 1) continue
        noter(uuid(propre(item, "ItemID")), uuid(propre(x, "CurrencyID")), montant(propre(x, "BasePrice")), "bundle")
      }
    } else {
      for (const x of elements(propre(b, "ItemOffers"))) offre(propre(x, "Offer"), "bundle")
    }
  }
  for (const o of elements(propre(propre(brut, "AccessoryStore"), "AccessoryStoreOffers"))) offre(propre(o, "Offer"), "accessoires")
  const vus = new Map<string, Map<string, { montant: number; ou: OuVu }>>()
  let douteux = 0
  for (const [id, parDevise] of tous) {
    for (const [devise, v] of parDevise) {
      if (v.montants.size !== 1) { douteux++; continue }
      let m = vus.get(id)
      if (!m) { m = new Map(); vus.set(id, m) }
      m.set(devise, { montant: [...v.montants][0], ou: v.ou })
    }
  }
  return { vus, douteux }
}

// ─────────────────────────── prix-vus.json ───────────────────────────

/** Un prix retenu : montant, date de la lecture qui l'a vu (ISO), lieu. */
export type PrixRetenu = { montant: number; vuLe: string; ou: OuVu }
/** prix-vus.json en mémoire : objet → devise → prix retenu. */
export type PrixVus = Record<string, Record<string, PrixRetenu>>

const LIEUX = new Set<string>(["jour", "nm", "bundle", "accessoires"])

/** Lit prix-vus.json : absent ou illisible : vide. Entrée abîmée passée ; clés lues en propre (jamais « __proto__ » hérité). */
export function lirePrixVus(contenu: string | null | undefined): PrixVus {
  if (!contenu) return {}
  let brut: unknown
  try { brut = JSON.parse(contenu) } catch { return {} }
  const prix = propre(brut, "prix")
  const out = new Map<string, Record<string, PrixRetenu>>()
  if (!estObjet(prix)) return {}
  for (const [id, parDevise] of Object.entries(prix)) {
    if (uuid(id) !== id || !estObjet(parDevise)) continue
    const m = new Map<string, PrixRetenu>()
    for (const [devise, p] of Object.entries(parDevise)) {
      const mt = montant(propre(p, "montant"))
      const vuLe = chaine(propre(p, "vuLe"))
      const ou = chaine(propre(p, "ou"))
      if (uuid(devise) !== devise || mt === null || vuLe === null || !Number.isFinite(Date.parse(vuLe)) || ou === null || !LIEUX.has(ou)) continue
      m.set(devise, { montant: mt, vuLe, ou: ou as OuVu })
    }
    if (m.size > 0) out.set(id, Object.fromEntries(m))
  }
  return Object.fromEntries(out)
}

/**
 * prix-vus.json se relit-il : un objet JSON qui a un objet `prix`. Un fichier présent qui ne se relit pas n'est jamais
 * réécrit (ses prix retenus seraient perdus) : rangerPrixVus le laisse tel quel.
 */
export function prixVusLisible(contenu: string): boolean {
  try {
    return estObjet(propre(JSON.parse(contenu), "prix"))
  } catch {
    return false
  }
}

/** La fusion d'une lecture dans les prix retenus : le contenu à écrire, et ce qui a changé (comptes). */
export type Fusion = { prix: PrixVus; vus: number; nouveaux: number; changes: number }

/**
 * Les prix vus à cette lecture (`lueA`, ISO) versés dans les prix retenus : une entrée neuve (nouveau), un autre montant
 * (changé), le même montant (sa date mise à jour). Rien n'est effacé. `vus` : les couples objet × devise de la lecture.
 */
export function fusionnerPrixVus(ancien: PrixVus, lecture: PrixVusLecture, lueA: string): Fusion {
  const prix = new Map<string, Map<string, PrixRetenu>>()
  for (const [id, parDevise] of Object.entries(ancien)) prix.set(id, new Map(Object.entries(parDevise)))
  let vus = 0, nouveaux = 0, changes = 0
  for (const [id, parDevise] of lecture.vus) {
    let m = prix.get(id)
    if (!m) { m = new Map(); prix.set(id, m) }
    for (const [devise, v] of parDevise) {
      vus++
      const avant = m.get(devise)
      if (!avant) nouveaux++
      else if (avant.montant !== v.montant) changes++
      m.set(devise, { montant: v.montant, vuLe: lueA, ou: v.ou })
    }
  }
  const trie = [...prix].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, m]) => [id, Object.fromEntries(m)] as const)
  return { prix: Object.fromEntries(trie), vus, nouveaux, changes }
}

/** Le contenu de prix-vus.json. */
export function contenuPrixVus(prix: PrixVus): string {
  return JSON.stringify({ prix })
}

/**
 * Le prix retenu d'un objet : en VP seulement (`devise` donnée : celle-là seulement) ; sans devise imposée, la plus récente des
 * devises connues (VP, KC), les Crédits Kingdom à égalité (la monnaie de la boutique d'accessoires). Rien : null.
 */
export function prixRetenu(prix: PrixVus | null, id: string, devise: string | null = DEVISE_VP): (PrixRetenu & { devise: string }) | null {
  if (prix === null || !Object.prototype.hasOwnProperty.call(prix, id)) return null
  const parDevise = prix[id]
  const choix = (devise !== null ? [devise] : [DEVISE_KC, DEVISE_VP]).filter((d) => Object.prototype.hasOwnProperty.call(parDevise, d))
  let mieux: (PrixRetenu & { devise: string }) | null = null
  for (const d of choix) {
    const p = parDevise[d]
    if (mieux === null || Date.parse(p.vuLe) > Date.parse(mieux.vuLe)) mieux = { ...p, devise: d }
  }
  return mieux
}

// ─────────────────────────── table de référence ───────────────────────────


/**
 * La table de référence (prix-reference.ts, `TABLE_REFERENCE`) : source, adresse, date de la source, date du relevé, prix en VP
 * par uuid ; ticket 8.13 : `complements`, ce que le Catalogue dit après la table et l'origine (prix confirmé, bundle, nature),
 * par uuid (vide pour une table d'avant 8.13).
 */
export type Reference = { source: string; adresse: string; date: string; releveLe: string; vp: Record<string, number>; complements?: Record<string, Complement> }

/** Ticket 8.13 : les natures d'un objet jamais vendu (codes du module, outils/prix-reference.ts) et leur libellé. */
export const NATURES: Record<string, string> = {
  maitrise: "Maîtrise d'agent", premier: "Récompense Premier", classement: "Récompense de classement", esport: "Récompense esport",
  prime: "Récompense Prime Gaming", code: "Code promotionnel", escarmouche: "Récompense d'Escarmouche", defaut: "Objet par défaut",
}

/**
 * Ticket 8.13 : ce que le Catalogue dit d'un objet sans prix ni origine, après la table et l'origine : un prix confirmé (`vp`,
 * la source dite dans la fiche), le bundle qui le vendait (« Vendu seulement dans le bundle <nom> (<prix> VP) », ou « Vendu
 * dans le bundle … » quand la vente à l'unité n'est pas établie), ou sa nature (« Maîtrise d'agent »…).
 */
export type Complement = { genre: "prix"; vp: number; source: string } | { genre: "bundle" | "nature"; texte: string }

/** Un texte court du module (preuve, nom de bundle) : une ligne, au plus 400 caractères ; sinon null. */
function texteCourt(x: unknown): string | null {
  return typeof x === "string" && x.trim().length > 0 && x.length <= 400 && !/[\r\n]/.test(x) ? x.trim() : null
}

/** Ticket 8.13 : les compléments du module (`preuves`, `confirmes`, `bundles`, `dansBundle`, `natures`) ; une entrée abîmée est passée. */
function lireComplements(brut: unknown): Record<string, Complement> {
  const r: Record<string, Complement> = {}
  const preuves = elements(propre(brut, "preuves")).map(texteCourt)
  const bundles = elements(propre(brut, "bundles")).map((b) => {
    const [nom, prix, seul] = elements(b)
    const n = texteCourt(nom), m = montant(prix)
    return n !== null && m !== null && (seul === 0 || seul === 1) ? `Vendu ${seul === 1 ? "seulement " : ""}dans le bundle ${n} (${m} VP)` : null
  })
  const ranger = (table: unknown, lire: (v: unknown) => Complement | null) => {
    if (!estObjet(table)) return
    for (const [id, v] of Object.entries(table)) {
      const c = uuid(id) === id ? lire(v) : null
      if (c !== null && !Object.prototype.hasOwnProperty.call(r, id)) r[id] = c
    }
  }
  ranger(propre(brut, "confirmes"), (v) => {
    const [m, k] = elements(v)
    const vp = montant(m), preuve = typeof k === "number" && Number.isInteger(k) ? preuves[k] ?? null : null
    return vp !== null && preuve !== null ? { genre: "prix", vp, source: `Prix confirmé : ${preuve}` } : null
  })
  ranger(propre(brut, "dansBundle"), (v) => {
    const texte = typeof v === "number" && Number.isInteger(v) ? bundles[v] ?? null : null
    return texte !== null ? { genre: "bundle", texte } : null
  })
  ranger(propre(brut, "natures"), (v) => {
    const texte = typeof v === "string" && Object.prototype.hasOwnProperty.call(NATURES, v) ? NATURES[v] : null
    return texte !== null ? { genre: "nature", texte } : null
  })
  return r
}

/** Ticket 8.13 : le complément d'un objet (prix confirmé, bundle, nature) dans la table de référence ; sinon null. */
export function complementDe(ref: Reference | null, id: string): Complement | null {
  const c = ref?.complements
  return c !== undefined && Object.prototype.hasOwnProperty.call(c, id) ? c[id] : null
}

/**
 * Lit la table de référence du paquet (l'objet `TABLE_REFERENCE` de prix-reference.ts, ou son texte JSON) : absente,
 * illisible ou d'une autre forme : null. Un prix douteux est passé.
 */
export function lireReference(contenu: unknown): Reference | null {
  if (contenu === null || contenu === undefined || contenu === "") return null
  let brut: unknown = contenu
  if (typeof contenu === "string") {
    try { brut = JSON.parse(contenu) } catch { return null }
  }
  const source = chaine(propre(brut, "source")), adresse = chaine(propre(brut, "adresse"))
  const date = chaine(propre(brut, "date")), releveLe = chaine(propre(brut, "releveLe"))
  const vp = propre(brut, "vp")
  if (source === null || adresse === null || date === null || releveLe === null || !estObjet(vp)) return null
  const m = new Map<string, number>()
  for (const [id, v] of Object.entries(vp)) {
    const mt = montant(v)
    if (uuid(id) === id && mt !== null) m.set(id, mt)
  }
  return { source, adresse, date, releveLe, vp: Object.fromEntries(m), complements: lireComplements(brut) }
}

/** Le prix de référence d'un objet en VP, sinon null. */
export function prixReference(ref: Reference | null, id: string): number | null {
  return ref !== null && Object.prototype.hasOwnProperty.call(ref.vp, id) ? ref.vp[id] : null
}

/** Les prix vus à cette lecture, en VP, qui contredisent la table (même objet, autre montant) : le prix vu gagne. */
export function contradictions(lecture: PrixVusLecture, ref: Reference | null): number {
  if (ref === null) return 0
  let n = 0
  for (const [id, parDevise] of lecture.vus) {
    const v = parDevise.get(DEVISE_VP)
    const r = prixReference(ref, id)
    if (v && r !== null && r !== v.montant) n++
  }
  return n
}

const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`

/**
 * La ligne du journal des prix retenus, des comptes seulement : « Prix retenus : N vus dans ta boutique (M nouveaux, K changés),
 * C contredisent la table de référence (le prix vu gagne). » ; D douteux et table non lue dits s'il y a lieu.
 */
export function ligneJournalRetenus(f: Fusion, douteux: number, c: number, refLue: boolean): string {
  const doute = douteux > 0 ? `, ${n(douteux, "douteux non gardé", "douteux non gardés")}` : ""
  const table = !refLue ? "table de référence non lue" : `${c} ${c > 1 ? "contredisent" : "contredit"} la table de référence (le prix vu gagne)`
  return `Prix retenus : ${n(f.vus, "vu", "vus")} dans ta boutique (${n(f.nouveaux, "nouveau", "nouveaux")}, ${n(f.changes, "changé", "changés")}${doute}), ${table}.`
}

// ─────────────────────────── état des prix (Réglages) ───────────────────────────

/** L'issue du dernier contrôle des prix de HenrikDev (ticket 8.6), dite sans identifiant ni valeur lue. */
export type IssueHenrik =
  | { genre: "valide"; compares: number }
  | { genre: "refuse"; ecarts: number; compares: number }
  | { genre: "aucune" }
  | { genre: "non-lu"; raison: string }
  | { genre: "non-garde"; raison: string }
  | { genre: "deja" }

/**
 * Le nombre de skins du Catalogue à prix, par source ; ticket 8.11 : `origine`, les skins sans prix dont l'origine exacte est
 * connue (absent d'un état d'avant 8.11).
 */
export type ComptesPrix = { total: number; boutique: number; retenus: number; henrikdev: number; reference: number; origine?: number }

/** etat-prix.json : la lecture qui l'a écrit, le dernier contrôle HenrikDev (avec sa date), les comptes. */
export type EtatPrix = { lueA: string; henrikdev: { issue: IssueHenrik; le: string } | null; comptes: ComptesPrix }

/** Une raison lisible et courte : texte de 1 à 120 caractères, sans saut de ligne. */
function raisonSure(x: unknown): string | null {
  const s = chaine(x)
  return s !== null && s.length <= 120 && !/[\r\n]/.test(s) ? s : null
}
function entier(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null
}

/** Une issue relue ; illisible : null. */
function lireIssue(x: unknown): IssueHenrik | null {
  const g = propre(x, "genre")
  if (g === "valide") { const c = entier(propre(x, "compares")); return c !== null ? { genre: g, compares: c } : null }
  if (g === "refuse") {
    const e = entier(propre(x, "ecarts")), c = entier(propre(x, "compares"))
    return e !== null && c !== null ? { genre: g, ecarts: e, compares: c } : null
  }
  if (g === "aucune" || g === "deja") return { genre: g }
  if (g === "non-lu" || g === "non-garde") { const r = raisonSure(propre(x, "raison")); return r !== null ? { genre: g, raison: r } : null }
  return null
}

/**
 * L'état à écrire : `issue` du contrôle de cette lecture ; « déjà contrôlé » garde l'issue précédente (le contrôle du jour fait
 * foi) ; null (aucun contrôle tenté, verrou repris) garde aussi l'ancien.
 */
export function etatPrix(ancien: EtatPrix | null, lueA: string, issue: IssueHenrik | null, comptes: ComptesPrix): EtatPrix {
  const garde = issue === null || (issue.genre === "deja" && ancien !== null && ancien.henrikdev !== null)
  return { lueA, henrikdev: garde ? ancien?.henrikdev ?? null : { issue: issue!, le: lueA }, comptes }
}

/** Le contenu de etat-prix.json. */
export function contenuEtatPrix(e: EtatPrix): string {
  return JSON.stringify(e)
}

/** Lit etat-prix.json : absent, illisible ou d'une autre forme : null. */
export function lireEtatPrix(contenu: string | null | undefined): EtatPrix | null {
  if (!contenu) return null
  let brut: unknown
  try { brut = JSON.parse(contenu) } catch { return null }
  const lueA = chaine(propre(brut, "lueA"))
  const c = propre(brut, "comptes")
  const comptes = {
    total: entier(propre(c, "total")), boutique: entier(propre(c, "boutique")), retenus: entier(propre(c, "retenus")),
    henrikdev: entier(propre(c, "henrikdev")), reference: entier(propre(c, "reference")),
  }
  if (lueA === null || !Number.isFinite(Date.parse(lueA)) || Object.values(comptes).some((v) => v === null)) return null
  // Ticket 8.11 : `origine`, absent d'un état d'avant (ou illisible) : non dit.
  const origine = entier(propre(c, "origine"))
  const h = propre(brut, "henrikdev")
  const issue = lireIssue(propre(h, "issue"))
  const le = chaine(propre(h, "le"))
  return {
    lueA, henrikdev: issue !== null && le !== null && Number.isFinite(Date.parse(le)) ? { issue, le } : null,
    comptes: { ...(comptes as ComptesPrix), ...(origine !== null ? { origine } : {}) },
  }
}


export function phraseHenrik(h: EtatPrix["henrikdev"]): string {
  if (h === null) return "HenrikDev : pas encore contrôlé."
  const i = h.issue
  const quand = dateEnClair(h.le)
  const le = quand !== null ? ` (le ${quand})` : ""
  switch (i.genre) {
    case "valide": return `HenrikDev : validé, ${n(i.compares, "prix comparé", "prix comparés")} à ta boutique, tous égaux${le}.`
    case "refuse": return `HenrikDev : refusé, ${n(i.ecarts, "écart", "écarts")} sur ${n(i.compares, "prix comparé", "prix comparés")}${le}.`
    case "aucune": return `HenrikDev : refusé, aucune comparaison possible${le}.`
    case "non-lu": return `HenrikDev : non lu : ${i.raison}${le}.`
    case "non-garde": return `HenrikDev : non gardé : ${i.raison}${le}.`
    case "deja": return `HenrikDev : déjà contrôlé ce jour-là${le}.`
  }
}

/** Entrée 15 de epic-boutique-visuels : un contrôle « non lu » qui n'appelle aucune action (tout, sauf une clé refusée). */
function controleTu(i: IssueHenrik): boolean {
  return i.genre === "non-lu" && !i.raison.startsWith("clé refusée")
}

/** Le texte d'attente des Réglages, avant le premier état écrit. */
export const PRIX_APRES_LECTURE = "Après la prochaine lecture de la boutique."

/**
 * Les lignes de la section « Prix du catalogue » : les skins à prix sur le total, puis par source, puis le contrôle HenrikDev ;
 * sans état : PRIX_APRES_LECTURE. Entrée 15 de epic-boutique-visuels : un contrôle qui n'a pas eu lieu (« non lu » : route en
 * erreur, clé absente, limite, collecte en cours) n'appelle aucune action et ressemblait à une panne : aucune ligne pour lui
 * (le journal dit toujours pourquoi : « Prix HenrikDev non lus… »). Sauf une clé refusée, qui en appelle une : elle se dit.
 */
export function lignesPrixCatalogue(e: EtatPrix | null): string[] {
  if (e === null) return [PRIX_APRES_LECTURE]
  const c = e.comptes
  const avecPrix = c.boutique + c.retenus + c.henrikdev + c.reference
  const quand = dateEnClair(e.lueA)
  // Ticket 8.11 : « avec origine », les objets sans prix dont l'origine exacte est connue.
  const origine = c.origine !== undefined ? `, ${c.origine} autres avec origine` : ""
  return [
    `${avecPrix} ${avecPrix > 1 ? "skins ont" : "skin a"} un prix sur ${c.total}${origine}${quand !== null ? ` (lecture du ${quand})` : ""}.`,
    `Boutique : ${c.boutique} · Retenus : ${c.retenus} · HenrikDev : ${c.henrikdev} · Référence : ${c.reference}`
      + (c.origine !== undefined ? ` · Avec origine : ${c.origine}` : ""),
    ...(e.henrikdev !== null && controleTu(e.henrikdev.issue) ? [] : [phraseHenrik(e.henrikdev)]),
  ]
}


export function raisonCourte(message: string): string {
  const s = message.replace(/^store-offers\s*:?\s*/i, "").replace(/\s+/g, " ").trim()
  return (s.length > 120 ? s.slice(0, 117) + "…" : s) || "erreur"
}
