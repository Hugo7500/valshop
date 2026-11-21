// Catalogue de tous les skins (ticket 8.4 de epic-boutique-visuels) : la part pure.
//   - Prix (ticket 8.6) : la liste des offres de HenrikDev (`GET https://api.henrikdev.xyz/valorant/v1/store-offers`, même
//     forme que l'ancienne `store/v1/offers` de Riot, retirée : ticket 8.5), lue par valshop.ts au plus une fois par journée
//     Valorant (garde-fou.ts `deciderPrix`), mise à plat en prix exacts (lireOffres) et contrôlée contre les prix de Riot de
//     la boutique du jour (prixDeLaBoutique, controlerPrix) : rangée dans prix.json seulement si chaque skin du storefront
//     y a exactement le prix de Riot. Un skin sans prix validé dit « Prix non communiqué par Riot » ; jamais un prix déduit.
//   - Prix de sa boutique (ticket 8.7) : un skin de la boutique en cache encore du jour (shop.json, prixEnBoutique) prend le
//     prix de son storefront avant celui de HenrikDev : offre du jour, puis Night Market (prix remisé, base barrée, remise),
//     puis objet d'un bundle en vedette (prix seul) ; puis prix.json validé ; sinon « Prix non communiqué par Riot ».
//   - Prix retenus et table de référence (ticket 8.9, prix-retenus.ts) : après sa boutique, le dernier prix vu dans sa boutique
//     (prix-vus.json), puis prix.json validé, puis la table de référence du paquet (prix-reference.json) ; la fiche dit la source.
//   - Index : les skins de catalog.json, chacun avec son arme, son édition (palier), sa collection (thème), l'image et l'uuid
//     de son premier niveau (celui qu'ouvre sa fiche et que vend une offre).
//   - Page : le HTML de l'écran Catalogue (catalogue-web.tsx), rendu par WebKit : un seul élément natif pour la liste entière
//     (Scripting coûte ≈ 2,3 ms par élément natif rendu, ticket 4.49) ; recherche et filtres dans la page, sans aller-retour.
//   - Origine (ticket 8.11, origines.ts) : un skin sans prix dit son origine exacte (passe de combat, contrat d'agent,
//     événement, « Skin de base »), dans le style discret du « non communiqué » ; filtre « Obtention ».
// Module pur : aucun import de « scripting », aucune lecture de fichier ; il tourne sous `node --test` (tests/resoudre-ts.ts).

import { separerNom } from "./fiches"
import { catalogueAncien, normaliser } from "./souhaits"
import { CSP_CATALOGUE, imageAdmise as imageDistanteAdmise, metaCsp } from "./securite"
import { complementDe, dateEnClair, prixReference, prixRetenu, type PrixVus, type Reference } from "./prix-retenus"
import { BASE, THEME_STANDARD, choixObtention, codesObtention, origineDe, type Provenance, type TableOrigines } from "./origines"

// Ticket 8.9 : dateEnClair vit dans prix-retenus.ts (module sans import du Catalogue) ; réexportée ici pour ses appelants.
export { dateEnClair }

/** Thème « Random » de valorant-api : le « skin favori aléatoire » de chaque arme, un réglage du jeu, pas un skin. */
export const THEME_ALEATOIRE = "0d7a5bfb-4850-098e-1821-d989bbfd58a8"

/** Devise des Valorant Points dans `Cost` (valorant-api, /v1/currencies). */
export const DEVISE_VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741"
/** Type d'objet « niveau de skin » d'une récompense (`ItemTypeID`). */
export const TYPE_NIVEAU_SKIN = "e7c63390-eda7-46e0-bb7a-a6abdacd2433"

/**
 * Ce que dit le prix d'un skin sans prix validé (ticket 8.6) : skin absent du dernier prix.json validé, ou aucune lecture
 * validée encore. Rien ne prouve plus « pas en vente directe » : la liste de HenrikDev peut manquer un skin vendu.
 */
export const PRIX_NON_COMMUNIQUE = "Prix non communiqué par Riot"

// ─────────────────────────── lecture défensive ───────────────────────────

function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
/** Une propriété propre d'un objet (jamais héritée : « __proto__ », « constructor »), sinon undefined. */
function propre(x: unknown, nom: string): unknown {
  return estObjet(x) && Object.prototype.hasOwnProperty.call(x, nom) ? x[nom] : undefined
}
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null
}
/** Un montant exact : entier strictement positif. */
function montant(x: unknown): number | null {
  return typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null
}

// ─────────────────────────── offres de HenrikDev (ticket 8.6) ───────────────────────────

/**
 * Les offres lues : `vp`, le prix en VP de chaque niveau de skin vendu seul ; `offres`, le nombre d'offres de la réponse ;
 * `ecartees`, les offres d'un niveau de skin passées faute de prix sûr ; `plusRecente`, la `StartDate` la plus récente des
 * offres (ISO, null si aucune ne se lit) : ce qu'on sait de la fraîcheur de la liste.
 */
export type OffresLues = { vp: Record<string, number>; offres: number; ecartees: number; plusRecente: string | null }

/** Une offre (`{ OfferID, IsDirectPurchase, StartDate, Cost, Rewards }`) lue seule : son niveau de skin, et son prix s'il est sûr. */
type OffreLue = { skin: false } | { skin: true; id: string | null; prix: number | null }

/**
 * Une offre au format de Riot (store/v1/offers, storefront v3 `Offer`, store-offers de HenrikDev) : `skin` faux si aucune
 * récompense n'est un niveau de skin (`ItemTypeID` donné et autre) ; sinon l'`ItemID` de la première récompense, et son prix
 * s'il est sûr : une seule récompense, en un exemplaire, `IsDirectPurchase` qui n'est pas faux, coût en VP seulement (une
 * seule devise, la clé exacte, montant entier positif). Jamais d'erreur.
 */
function lireOffre(o: unknown): OffreLue {
  const recompenses = propre(o, "Rewards")
  if (!Array.isArray(recompenses) || recompenses.length === 0) return { skin: false }
  const types = recompenses.map((r) => propre(r, "ItemTypeID"))
  if (types.every((t) => typeof t === "string" && t !== TYPE_NIVEAU_SKIN)) return { skin: false }
  const r = recompenses[0]
  const id = chaine(propre(r, "ItemID"))
  const quantite = propre(r, "Quantity")
  const cout = propre(o, "Cost")
  const devises = estObjet(cout) ? Object.keys(cout) : []
  const prix = devises.length === 1 && devises[0] === DEVISE_VP ? montant(propre(cout, DEVISE_VP)) : null
  const sure = recompenses.length === 1 && (quantite === undefined || quantite === 1) && propre(o, "IsDirectPurchase") !== false
  return { skin: true, id, prix: sure ? prix : null }
}

/** Une date ISO lisible, sinon null. */
function dateIso(x: unknown): string | null {
  const t = typeof x === "string" ? Date.parse(x) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * Met à plat la réponse de store-offers de HenrikDev (`{ status, data: { Offers: [...] } }` ; `{ Offers }` seul admis, la
 * forme de Riot). Ne garde que l'exact (lireOffre) ; un niveau qui a une offre douteuse ou deux offres à deux montants
 * différents n'a aucun prix : chacune de ses offres est écartée et comptée. Une offre d'un autre type (porte-bonheur,
 * carte…) est passée sans être comptée. Forme inattendue (pas de tableau `Offers`) : null. Jamais d'erreur.
 */
export function lireOffres(brut: unknown): OffresLues | null {
  const data = propre(brut, "data")
  const offres = propre(estObjet(data) ? data : brut, "Offers")
  if (!Array.isArray(offres)) return null
  const montants = new Map<string, number[]>()
  const douteux = new Set<string>()
  let ecartees = 0
  let plusRecente: number | null = null
  for (const o of offres) {
    const debut = dateIso(propre(o, "StartDate"))
    if (debut !== null && (plusRecente === null || Date.parse(debut) > plusRecente)) plusRecente = Date.parse(debut)
    const lue = lireOffre(o)
    if (!lue.skin) continue
    if (lue.id === null || lue.prix === null) {
      ecartees++
      if (lue.id !== null) douteux.add(lue.id)
      continue
    }
    const l = montants.get(lue.id)
    if (l) l.push(lue.prix)
    else montants.set(lue.id, [lue.prix])
  }
  const vp = new Map<string, number>()
  for (const [id, l] of montants) {
    if (douteux.has(id) || l.some((m) => m !== l[0])) ecartees += l.length
    else vp.set(id, l[0])
  }
  return { vp: Object.fromEntries(vp), offres: offres.length, ecartees, plusRecente: plusRecente === null ? null : new Date(plusRecente).toISOString() }
}

// ─────────────────────────── prix de Riot dans la boutique du jour (ticket 8.6) ───────────────────────────

/**
 * Les prix de base en VP que donne le storefront v3 de Riot pour ses niveaux de skin : `vp`, le prix sûr de chaque niveau ;
 * `douteux`, les niveaux vus sans prix sûr, ou à deux prix de base différents ; `illisibles`, les entrées qui peuvent être un
 * niveau de skin sans qu'on le lise (offre de skin sans `ItemID`, objet de bundle sans `Item.ItemTypeID` ou sans `ItemID`).
 * Chaque douteux et chaque illisible compte comme un écart au contrôle : aucun niveau du storefront n'en sort en silence.
 */
export type PrixBoutique = { vp: Map<string, number>; douteux: Set<string>; illisibles: number }

/**
 * Les niveaux de skin de la réponse brute du storefront v3 et leur prix de base : offres du jour
 * (`SkinsPanelLayout.SingleItemStoreOffers[]`), Night Market (`BonusStore.BonusStoreOffers[].Offer`, `Cost` : le prix de base,
 * jamais `DiscountCosts`), objets des bundles (`FeaturedBundle.Bundle` et `Bundles[]` : `Items[]` d'un `Item.ItemTypeID` de
 * niveau de skin, `CurrencyID` VP, `BasePrice`, un exemplaire, sauf objet offert `IsPromoItem` ; sinon `ItemOffers[].Offer`),
 * accessoires (`AccessoryStore.AccessoryStoreOffers[].Offer`, s'il s'y trouve un niveau de skin). Une offre lue par
 * lireOffre ; un objet de bundle d'un autre type est passé. Forme inattendue : sections passées. Jamais d'erreur.
 */
export function prixDeLaBoutique(brut: unknown): PrixBoutique {
  const vus = new Map<string, Set<number>>()
  const douteux = new Set<string>()
  let illisibles = 0
  const noter = (id: string | null, prix: number | null) => {
    if (id === null) { illisibles++; return }
    if (prix === null) { douteux.add(id); return }
    const s = vus.get(id)
    if (s) s.add(prix)
    else vus.set(id, new Set([prix]))
  }
  const offre = (o: unknown) => {
    const lue = lireOffre(o)
    if (lue.skin) noter(lue.id, lue.prix)
  }
  const liste = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
  for (const o of liste(propre(propre(brut, "SkinsPanelLayout"), "SingleItemStoreOffers"))) offre(o)
  for (const o of liste(propre(propre(brut, "BonusStore"), "BonusStoreOffers"))) offre(propre(o, "Offer"))
  const fb = propre(brut, "FeaturedBundle")
  const bundles = [propre(fb, "Bundle"), ...liste(propre(fb, "Bundles"))].filter(estObjet)
  for (const b of bundles) {
    const items = liste(propre(b, "Items"))
    if (items.length > 0) {
      for (const x of items) {
        const item = propre(x, "Item")
        const type = propre(item, "ItemTypeID")
        // Sans type lisible, l'objet peut être un niveau de skin : illisible (un écart), jamais passé en silence.
        if (typeof type !== "string") { illisibles++; continue }
        if (type !== TYPE_NIVEAU_SKIN || propre(x, "IsPromoItem") === true) continue
        const quantite = propre(item, "Amount")
        const sur = propre(x, "CurrencyID") === DEVISE_VP && (quantite === undefined || quantite === 1)
        noter(chaine(propre(item, "ItemID")), sur ? montant(propre(x, "BasePrice")) : null)
      }
    } else {
      for (const x of liste(propre(b, "ItemOffers"))) offre(propre(x, "Offer"))
    }
  }
  for (const o of liste(propre(propre(brut, "AccessoryStore"), "AccessoryStoreOffers"))) offre(propre(o, "Offer"))
  const vp = new Map<string, number>()
  for (const [id, s] of vus) {
    if (douteux.has(id) || s.size !== 1) douteux.add(id)
    else vp.set(id, [...s][0])
  }
  for (const id of douteux) vp.delete(id)
  return { vp, douteux, illisibles }
}

/** Le contrôle : `compares`, les niveaux de skin du storefront ; `ecarts`, ceux dont HenrikDev n'a pas exactement le prix de Riot. */
export type ControlePrix = { compares: number; ecarts: number }

/**
 * Compare chaque niveau de skin du storefront (prixDeLaBoutique) aux prix de HenrikDev (lireOffres) : un écart pour un prix
 * différent, un niveau absent chez HenrikDev (liste non prouvée à jour), un niveau sans prix sûr chez Riot ou une entrée
 * illisible du storefront.
 */
export function controlerPrix(henrik: OffresLues, riot: PrixBoutique): ControlePrix {
  let compares = 0
  let ecarts = 0
  const a = (id: string) => (Object.prototype.hasOwnProperty.call(henrik.vp, id) ? henrik.vp[id] : undefined)
  for (const [id, prix] of riot.vp) {
    compares++
    if (a(id) !== prix) ecarts++
  }
  for (const _ of riot.douteux) {
    compares++
    ecarts++
  }
  compares += riot.illisibles
  ecarts += riot.illisibles
  return { compares, ecarts }
}

/** Les prix de HenrikDev sont-ils prouvés exacts ce jour-là : au moins une comparaison, aucun écart. */
export function prixValides(c: ControlePrix): boolean {
  return c.compares > 0 && c.ecarts === 0
}

/**
 * La ligne du journal d'une lecture contrôlée, des comptes seulement (aucun identifiant) : « Prix HenrikDev : N offres,
 * M skins à prix exact, K comparés à la boutique de Riot (tous égaux | X écarts : prix non affichés), offre la plus récente
 * du <date> ».
 */
export function ligneJournalPrix(lues: OffresLues, c: ControlePrix): string {
  const n = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`
  const m = Object.keys(lues.vp).length
  const issue = c.compares === 0 ? "aucune comparaison possible : prix non affichés"
    : c.ecarts === 0 ? "tous égaux" : `${n(c.ecarts, "écart", "écarts")} : prix non affichés`
  const date = dateEnClair(lues.plusRecente)
  return `Prix HenrikDev : ${n(lues.offres, "offre", "offres")}, ${n(m, "skin à prix exact", "skins à prix exact")}, `
    + `${n(c.compares, "comparé", "comparés")} à la boutique de Riot (${issue}), `
    + (date !== null ? `offre la plus récente du ${date}.` : "date des offres inconnue.")
}

// ─────────────────────────── prix.json ───────────────────────────

/**
 * Le contenu de prix.json (contrat-donnees.md) : quand la liste a été lue et validée, le reset de la boutique qui l'a validée
 * (une seule lecture par journée Valorant), les prix en VP. Ticket 8.6 : écrit seulement après un contrôle sans écart.
 */
export type PrixLus = { source: string | null; lueA: string | null; resetAt: string | null; vp: Record<string, number> }

/**
 * prix.json à écrire (ticket 8.6) : `source`, `lueA` (ISO), `resetAt` (reset suivant de la boutique, ISO ou null), le nombre
 * d'offres et de niveaux comparés, la date de l'offre la plus récente, les prix lus.
 */
export function contenuPrix(lues: OffresLues, c: ControlePrix, lueA: string, resetAt: string | null): string {
  return JSON.stringify({ source: "henrikdev", lueA, resetAt, offres: lues.offres, compares: c.compares, plusRecente: lues.plusRecente, vp: lues.vp })
}

/**
 * Lit prix.json : absent, illisible ou d'une autre forme : null (aucune liste lue). Un prix qui n'est pas un entier positif
 * est passé ; les clés lues en propre.
 */
export function lirePrix(contenu: string | null | undefined): PrixLus | null {
  if (!contenu) return null
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch {
    return null
  }
  const vp = propre(brut, "vp")
  if (!estObjet(vp)) return null
  const propres = new Map<string, number>()
  for (const [id, v] of Object.entries(vp)) {
    const m = montant(v)
    if (m !== null) propres.set(id, m)
  }
  // Object.fromEntries : chaque clé en propre, « __proto__ » compris (jamais le prototype).
  return { source: chaine(propre(brut, "source")), lueA: chaine(propre(brut, "lueA")), resetAt: chaine(propre(brut, "resetAt")), vp: Object.fromEntries(propres) }
}

// ─────────────────────────── prix de sa boutique (ticket 8.7) ───────────────────────────

/**
 * D'où vient le prix dit : offre du jour, Night Market, objet d'un bundle en vedette (shop.json), prix retenu (prix-vus.json,
 * ticket 8.9), prix.json validé (HenrikDev), table de référence du paquet (ticket 8.9).
 */
export type OriginePrix = "jour" | "nm" | "bundle" | "retenu" | "henrikdev" | "reference" | "confirme"

/**
 * Le prix d'un skin vu dans sa boutique en cache : `vp`, ce qu'il y paie ; au Night Market seulement, `base` (prix de base,
 * barré ; null s'il ne dépasse pas le prix remisé) et `remise` (pour cent, entier de 1 à 99 ; null sinon).
 */
export type PrixVu = { origine: "jour" | "nm" | "bundle"; vp: number; base: number | null; remise: number | null }

/**
 * Les prix de sa boutique, par premier niveau de skin : un prix vu, ou « douteux » (deux montants pour un même skin à une même
 * étape, ou un skin du Night Market sans prix remisé lisible) : aucun prix, pas de repli (un prix plus haut que le sien serait
 * faux pour lui).
 */
export type PrixEnBoutique = Map<string, PrixVu | "douteux">

/** Une fin (ISO) passée : vrai ; absente ou illisible : faux (fin inconnue : la boutique du jour fait foi). */
function finie(x: unknown, now: number): boolean {
  const s = chaine(x)
  const t = s !== null ? Date.parse(s) : NaN
  return Number.isFinite(t) && now >= t
}

/** La boutique en cache encore celle du jour (`daily.resetAt` à venir), la règle de « Boutique du jour ». */
function duJour(shop: unknown, now: number): boolean {
  const resetAt = chaine(propre(propre(shop, "daily"), "resetAt"))
  const fin = resetAt !== null ? Date.parse(resetAt) : NaN
  return Number.isFinite(fin) && now < fin
}

/** Les éléments d'un tableau, sinon rien. */
function elements(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

/** Le Night Market de la boutique en cache, s'il est actif et pas fini (`endsAt` passé) ; sinon null. */
function nightMarketOuvert(shop: unknown, now: number): unknown {
  const nm = propre(shop, "nightMarket")
  return propre(nm, "active") === true && !finie(propre(nm, "endsAt"), now) ? nm : null
}

/**
 * Les prix de sa boutique en cache (shop.json, contrat-donnees.md), si elle est encore celle du jour ; null sinon (boutique
 * absente, illisible, d'un jour passé). Par étape, dans l'ordre : offre du jour (`daily.items[].cost`), Night Market actif
 * et pas fini (`discounted`, `cost`, `discountPercent`), objet `skin` d'un bundle en vedette pas fini (`items[].cost`, son
 * prix seul) ; la première étape où le skin a un prix (ou un doute) l'emporte. Montant : entier > 0 ; une offre du jour ou
 * un objet sans montant passe à l'étape suivante. Rien n'est lu ni demandé : la boutique déjà lue en mémoire.
 */
export function prixEnBoutique(shop: unknown, now: number): PrixEnBoutique | null {
  if (!duJour(shop, now)) return null
  const etapes: PrixEnBoutique[] = [new Map(), new Map(), new Map()]
  const noter = (m: PrixEnBoutique, id: string | null, p: PrixVu | "douteux") => {
    if (id === null) return
    const avant = m.get(id)
    if (avant === undefined) m.set(id, p)
    else if (avant === "douteux" || p === "douteux" || avant.vp !== p.vp || avant.base !== p.base || avant.remise !== p.remise) m.set(id, "douteux")
  }
  for (const i of elements(propre(propre(shop, "daily"), "items"))) {
    const vp = montant(propre(i, "cost"))
    if (vp !== null) noter(etapes[0], chaine(propre(i, "id")), { origine: "jour", vp, base: null, remise: null })
  }
  for (const i of elements(propre(nightMarketOuvert(shop, now), "items"))) {
    const vp = montant(propre(i, "discounted"))
    if (vp === null) { noter(etapes[1], chaine(propre(i, "id")), "douteux"); continue }
    const base = montant(propre(i, "cost"))
    const r = propre(i, "discountPercent")
    const remise = typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= 99 ? r : null
    noter(etapes[1], chaine(propre(i, "id")), { origine: "nm", vp, base: base !== null && base > vp ? base : null, remise })
  }
  for (const b of elements(propre(shop, "bundles"))) {
    if (finie(propre(b, "endsAt"), now)) continue
    for (const o of elements(propre(b, "items"))) {
      if (propre(o, "kind") !== "skin") continue
      const vp = montant(propre(o, "cost"))
      if (vp !== null) noter(etapes[2], chaine(propre(o, "id")), { origine: "bundle", vp, base: null, remise: null })
    }
  }
  const prix: PrixEnBoutique = new Map()
  for (const m of etapes) for (const [id, p] of m) if (!prix.has(id)) prix.set(id, p)
  return prix
}






export type PrixDit = {
  vp: number | null; texte: string; voix: string; base: number | null; remise: number | null; origine: OriginePrix | null; source: string | null
}

/** L'hôte d'une adresse (« vinfo-api.com »), pour dire la source de la table. */
function hote(adresse: string): string {
  return adresse.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
}

/** Ce que dit la fiche de la source d'un prix (ticket 8.9). */
const SOURCES: Record<"jour" | "nm" | "bundle" | "henrikdev", string> = {
  jour: "Boutique du jour", nm: "Night Market (ton prix remisé)", bundle: "Bundle en vedette", henrikdev: "Liste HenrikDev contrôlée contre ta boutique",
}

/**
 * Le prix d'un skin (tickets 8.6, 8.7, 8.9), dans l'ordre : celui de sa boutique en cache (`boutique`, prixEnBoutique : offre
 * du jour, Night Market remisé, objet d'un bundle) ; son dernier prix retenu en VP (`retenus`, prix-vus.json) ; son montant
 * dans le dernier prix.json validé (HenrikDev) ; la table de référence du paquet (`reference`) ; sinon, ou si sa boutique en
 * doute (pas de repli : un prix plus haut que le sien serait faux pour lui), « Prix non communiqué par Riot ».
 */
export function prixDuSkin(niveau: string, prix: PrixLus | null, boutique: PrixEnBoutique | null = null,
  retenus: PrixVus | null = null, reference: Reference | null = null): PrixDit {
  const rien: PrixDit = { vp: null, texte: PRIX_NON_COMMUNIQUE, voix: PRIX_NON_COMMUNIQUE, base: null, remise: null, origine: null, source: null }
  const simple = (vp: number, origine: OriginePrix, source: string): PrixDit =>
    ({ vp, texte: `${vp} VP`, voix: `${vp} VP`, base: null, remise: null, origine, source })
  const vu = boutique !== null ? boutique.get(niveau) : undefined
  if (vu === "douteux") return rien
  if (vu !== undefined) {
    const texte = `${vu.vp} VP`
    const voix = [vu.base !== null ? `${texte} au lieu de ${vu.base} VP` : texte, vu.remise !== null ? `−${vu.remise} %` : null]
      .filter((x): x is string => x !== null).join(", ")
    return { vp: vu.vp, texte, voix, base: vu.base, remise: vu.remise, origine: vu.origine, source: SOURCES[vu.origine] }
  }
  const r = prixRetenu(retenus, niveau)
  if (r !== null) return simple(r.montant, "retenu", `Vu dans ta boutique le ${dateEnClair(r.vuLe) ?? "?"}`)
  const vp = prix !== null && Object.prototype.hasOwnProperty.call(prix.vp, niveau) ? prix.vp[niveau] : undefined
  if (vp !== undefined) return simple(vp, "henrikdev", SOURCES.henrikdev)
  const ref = prixReference(reference, niveau)
  if (ref !== null && reference !== null) return simple(ref, "reference", `Table de référence (${hote(reference.adresse)}, ${dateEnClair(reference.date) ?? reference.date})`)
  return rien
}

/**
 * Ticket 8.9 : le nombre de skins (par premier niveau) à prix, par source, comme les dit le Catalogue : boutique (jour, Night
 * Market, bundle), retenus, HenrikDev, référence ; `total`, tous les skins donnés.
 */
export function comptesPrix(niveaux: readonly string[], prix: PrixLus | null, boutique: PrixEnBoutique | null,
  retenus: PrixVus | null, reference: Reference | null, provenance: ((niveau: string) => Provenance | null) | null = null,
): { total: number; boutique: number; retenus: number; henrikdev: number; reference: number; origine?: number } {
  const c: { total: number; boutique: number; retenus: number; henrikdev: number; reference: number; origine?: number } =
    { total: niveaux.length, boutique: 0, retenus: 0, henrikdev: 0, reference: 0 }
  // Ticket 8.11 : `origine`, les skins sans prix dont l'origine est connue (compté seulement si `provenance` est donnée).
  if (provenance !== null) c.origine = 0
  for (const n of niveaux) {
    const o = prixDuSkin(n, prix, boutique, retenus, reference).origine
    if (o === "jour" || o === "nm" || o === "bundle") c.boutique++
    else if (o === "retenu") c.retenus++
    else if (o === "henrikdev") c.henrikdev++
    else if (o === "reference") c.reference++
    else if (provenance !== null && provenance(n) !== null) c.origine!++
    else {
      // Ticket 8.13 : après la table et l'origine, un prix confirmé du module compte avec la table de référence (il y est
      // rangé) ; un bundle ou une nature, avec les origines.
      const k = complementDe(reference, n)
      if (k !== null && k.genre === "prix") { if (boutique?.get(n) !== "douteux") c.reference++ }
      else if (k !== null && provenance !== null) c.origine!++
    }
  }
  return c
}

/**
 * Ticket 8.13 : le prix et l'origine dits d'un skin, dans l'ordre : son prix (prixDuSkin : boutique, Night Market, bundle en
 * vedette, prix retenu, HenrikDev, table de référence) ; sinon son origine (provenanceDuSkin) ; sinon, et seulement alors, le
 * complément de la table (prix confirmé, dit comme un prix ; bundle ou nature, dits comme une origine).
 */
export function prixEtProvenance(s: Pick<SkinDuCatalogue, "niveau" | "standard">, prix: PrixLus | null, boutique: PrixEnBoutique | null,
  retenus: PrixVus | null, reference: Reference | null, origines: TableOrigines | null): { p: PrixDit; origine: Provenance | null } {
  const p = prixDuSkin(s.niveau, prix, boutique, retenus, reference)
  const origine = provenanceDuSkin(s, origines)
  if (p.vp !== null || origine !== null) return { p, origine }
  // Une boutique qui doute du prix de ce skin ne laisse dire aucun prix (prixDuSkin) : pas de complément à prix non plus.
  const vu = boutique !== null ? boutique.get(s.niveau) : undefined
  const k = complementDe(reference, s.niveau)
  if (k === null) return { p, origine }
  if (k.genre === "prix") {
    if (vu === "douteux") return { p, origine }
    return { p: { vp: k.vp, texte: `${k.vp} VP`, voix: `${k.vp} VP`, base: null, remise: null, origine: "confirme", source: k.source }, origine }
  }
  return { p, origine: { genre: k.genre, texte: k.texte, sortie: null } }
}

/**
 * Ticket 8.11 : l'origine d'un skin du Catalogue : « Skin de base » pour un skin Standard (thème Standard de valorant-api),
 * sinon celle de son premier niveau dans la table des origines (origines.ts) ; inconnue : null.
 */
export function provenanceDuSkin(s: Pick<SkinDuCatalogue, "niveau" | "standard">, origines: TableOrigines | null): Provenance | null {
  return s.standard ? BASE : origineDe(origines, s.niveau)
}

// ─────────────────────────── index ───────────────────────────

/** Un skin du Catalogue. `niveau` : l'uuid de son premier niveau (sa fiche, son offre). */
export type SkinDuCatalogue = {
  skin: string; niveau: string; nom: string; titre: string; arme: string; armeNom: string
  edition: string | null; collection: string | null; icone: string | null
  /** Ticket 8.11 : skin Standard (thème Standard), dit « Skin de base ». */
  standard: boolean
}
/** Une édition (palier) : libellé, rang, couleur. */
export type Edition = { id: string; nom: string; rang: number | null; couleur: string | null }
/** L'index : skins rangés par arme puis par titre, armes dans l'ordre de la page, éditions par rang, collections par nom. */
export type IndexCatalogue = {
  skins: SkinDuCatalogue[]
  armes: { id: string; nom: string }[]
  editions: Edition[]
  collections: { cle: string; nom: string }[]
  /** Éditions et collections connues du catalogue (faux pour un catalogue d'avant le ticket 8.4). */
  complet: boolean
}

/** Clé d'une collection : son nom normalisé (les thèmes homonymes de valorant-api réunis). */
export function cleCollection(nom: string): string {
  return normaliser(nom.replace(/\s+/g, " ").trim())
}

/** L'arme de corps à corps : rangée en dernier, comme dans l'arsenal du jeu. */
function estMelee(nom: string): boolean {
  return normaliser(nom) === "melee"
}

/**
 * L'index du Catalogue tiré de catalog.json : chaque skin qui a au moins un niveau, sauf le « skin favori aléatoire »
 * (THEME_ALEATOIRE) ; titre tiré du nom (« Vandal (Glitchpop) » → « Glitchpop », separerNom), arme, édition et collection
 * par leurs uuid (null si inconnus), image du premier niveau. Clés lues en propre, entrée abîmée passée. Catalogue absent
 * ou d'un format antérieur (catalogueAncien) : null.
 */
export function indexCatalogue(cat: unknown): IndexCatalogue | null {
  if (catalogueAncien(cat)) return null
  const levels = propre(cat, "levels")
  const skins = propre(cat, "skins")
  const weapons = propre(cat, "weapons")
  const tiers = propre(cat, "tiers")
  const themes = propre(cat, "themes")
  const complet = estObjet(tiers) && estObjet(themes)
  const out: SkinDuCatalogue[] = []
  const armes = new Map<string, string>()
  const editions = new Map<string, Edition>()
  const collections = new Map<string, string>()
  for (const [skin, s] of Object.entries(skins as Record<string, unknown>)) {
    if (!estObjet(s)) continue
    const theme = chaine(propre(s, "theme"))
    if (theme === THEME_ALEATOIRE) continue
    const ids = propre(s, "levels")
    const niveau = Array.isArray(ids) ? chaine(ids[0]) : null
    const n = niveau !== null ? propre(levels, niveau) : undefined
    if (niveau === null || !estObjet(n)) continue
    const arme = chaine(propre(s, "weapon")) ?? chaine(propre(n, "weapon"))
    if (arme === null) continue
    const armeNom = chaine(propre(propre(weapons, arme), "name")) ?? arme
    armes.set(arme, armeNom)
    const nom = (chaine(propre(s, "name")) ?? chaine(propre(n, "name")) ?? skin).replace(/\s+/g, " ").trim()
    const tier = chaine(propre(s, "tier"))
    const t = tier !== null ? propre(tiers, tier) : undefined
    let edition: string | null = null
    if (tier !== null && estObjet(t)) {
      edition = tier
      if (!editions.has(tier)) {
        const rang = propre(t, "rank")
        editions.set(tier, {
          id: tier, nom: chaine(propre(t, "name")) ?? tier,
          rang: typeof rang === "number" && Number.isFinite(rang) ? rang : null, couleur: chaine(propre(t, "color")),
        })
      }
    }
    const nomTheme = theme !== null ? chaine(propre(propre(themes, theme), "name")) : null
    let collection: string | null = null
    if (nomTheme !== null) {
      collection = cleCollection(nomTheme)
      if (!collections.has(collection)) collections.set(collection, nomTheme.replace(/\s+/g, " ").trim())
    }
    // « Vandal (Glitchpop) » → « Glitchpop » (l'arme est dite à côté) ; « Hache (Glitchpop) » (Mêlée) : le nom entier, qui dit l'arme.
    const parts = separerNom(nom)
    const titre = parts.skin && normaliser(parts.weapon) === normaliser(armeNom) ? parts.skin : nom
    out.push({
      skin, niveau, nom, titre, arme, armeNom, edition, collection,
      icone: chaine(propre(n, "icon")),
      standard: theme === THEME_STANDARD,
    })
  }
  const ordreArmes = [...armes].map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => (estMelee(a.nom) === estMelee(b.nom) ? a.nom.localeCompare(b.nom, "fr") : estMelee(a.nom) ? 1 : -1))
  const rangArme = new Map(ordreArmes.map((a, i) => [a.id, i]))
  out.sort((a, b) => (rangArme.get(a.arme)! - rangArme.get(b.arme)!) || a.titre.localeCompare(b.titre, "fr") || a.skin.localeCompare(b.skin))
  return {
    skins: out,
    armes: ordreArmes,
    editions: [...editions.values()].sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99) || a.nom.localeCompare(b.nom, "fr")),
    collections: [...collections].map(([cle, nom]) => ({ cle, nom })).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
    complet,
  }
}

// ─────────────────────────── boutique du jour, souhaits ───────────────────────────

/** Où se trouve un skin dans la boutique en cache : « jour », « nm » (Night Market) ; null nulle part ou boutique périmée. */
export type DansBoutique = "jour" | "nm" | null

/**
 * Les niveaux de la boutique en cache, si elle est encore celle du jour (`daily.resetAt` à venir) : offres du jour, Night
 * Market actif (ticket 8.7 : et pas fini, `endsAt` passé). Boutique absente, illisible ou d'un jour passé : null (rien n'est
 * dit « dans la boutique du jour »).
 */
export function niveauxEnBoutique(shop: unknown, now: number): { jour: Set<string>; nm: Set<string> } | null {
  if (!duJour(shop, now)) return null
  const ids = (items: unknown) => new Set(elements(items).map((i) => chaine(propre(i, "id"))).filter((x): x is string => x !== null))
  return { jour: ids(propre(propre(shop, "daily"), "items")), nm: ids(propre(nightMarketOuvert(shop, now), "items")) }
}

/** Le skin (par son premier niveau) dans la boutique du jour, au Night Market, ou nulle part. */
export function dansBoutique(niveau: string, enBoutique: { jour: Set<string>; nm: Set<string> } | null): DansBoutique {
  if (enBoutique === null) return null
  return enBoutique.jour.has(niveau) ? "jour" : enBoutique.nm.has(niveau) ? "nm" : null
}

/** Les souhaits sous la forme que lit la page : uuid des skins, uuid des armes entières. */
export type SouhaitsDeLaPage = { skins: string[]; armes: string[] }

/** Les premiers niveaux des skins de l'index couverts par un souhait : le skin lui-même, ou son arme entière. */
export function niveauxSouhaites(index: IndexCatalogue, souhaits: SouhaitsDeLaPage): string[] {
  const skins = new Set(souhaits.skins)
  const armes = new Set(souhaits.armes)
  return index.skins.filter((s) => skins.has(s.skin) || armes.has(s.arme)).map((s) => s.niveau)
}

// ─────────────────────────── page ───────────────────────────

/** Couleurs de la page (design.tsx, thème sombre). */
export type CouleursPage = { fond: string; surface: string; bordure: string; texte: string; texteDoux: string; texteDiscret: string; orange: string; or: string }

const echapper = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Une adresse d'image admise dans la page : https sur media.valorant-api.com seulement (ticket 7.8 : la règle de securite.ts). */
export function imageAdmise(adresse: string | null): adresse is string {
  return imageDistanteAdmise(adresse)
}

/** Nom de l'écouteur de la page dans l'app (window.webkit.messageHandlers). */
export const PONT_CATALOGUE = "valshopCatalogue"

/**
 * Le script de la page : recherche (normalisée comme `normaliser` de souhaits.ts), arme, édition, collection, compte ;
 * appui sur un skin posté à l'app ; `window.catalogue.souhaits(niveaux)` pour les étoiles (premiers niveaux des skins souhaités) ; signal « prête » (après la première image peinte, ticket 8.8) et mesure
 * d'un filtre (de l'appui à l'image peinte). Pas de `${` : chaîne brute.
 */
const SCRIPT = String.raw`(() => {
  const H = window.webkit && window.webkit.messageHandlers
  const poster = (corps) => { try { const h = H && H[__PONT__]; if (h) { const p = h.postMessage(corps); if (p && p.catch) p.catch(() => {}) } } catch (e) {} }
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[‘’ʼ\x60]/g, "'").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/ß/g, "ss")
  const q = document.getElementById("q"), compte = document.getElementById("compte"), vide = document.getElementById("vide")
  const ed = document.getElementById("ed"), col = document.getElementById("col"), ob = document.getElementById("ob")
  const sections = Array.from(document.querySelectorAll("section[data-arme]")).map((s) => ({
    s, arme: s.getAttribute("data-arme"),
    lignes: Array.from(s.querySelectorAll("li")).map((li) => { const b = li.firstElementChild; return { li, p: b.getAttribute("data-p") || "", c: b.getAttribute("data-c") || "", n: b.getAttribute("data-n") || "", o: " " + (b.getAttribute("data-o") || "") + " " } }),
  }))
  let arme = ""
  const peinte = (fn) => requestAnimationFrame(() => setTimeout(fn, 0))
  function appliquer(t0) {
    const texte = norm(q.value.trim()), e = ed ? ed.value : "", c = col ? col.value : "", o = ob && ob.value ? " " + ob.value + " " : ""
    let total = 0
    for (const x of sections) {
      if (arme && x.arme !== arme) { if (!x.s.hidden) x.s.hidden = true; continue }
      let k = 0
      for (const l of x.lignes) {
        const ok = (!e || l.p === e) && (!c || l.c === c) && (!o || l.o.includes(o)) && (!texte || l.n.includes(texte))
        if (l.li.hidden === ok) l.li.hidden = !ok
        if (ok) k++
      }
      x.s.hidden = k === 0
      total += k
    }
    compte.textContent = total + (total > 1 ? " skins" : " skin")
    vide.hidden = total > 0
    if (t0 !== undefined) peinte(() => poster({ genre: "mesure", type: "filtre", ms: Math.round(performance.now() - t0) }))
  }
  q.addEventListener("input", () => appliquer(performance.now()))
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") q.blur() })
  if (ed) ed.addEventListener("change", () => appliquer(performance.now()))
  if (col) col.addEventListener("change", () => appliquer(performance.now()))
  if (ob) ob.addEventListener("change", () => appliquer(performance.now()))
  for (const b of Array.from(document.querySelectorAll(".puce"))) {
    b.addEventListener("click", () => {
      const t0 = performance.now()
      arme = b.getAttribute("data-arme") || ""
      for (const o of Array.from(document.querySelectorAll(".puce"))) o.setAttribute("aria-pressed", o === b ? "true" : "false")
      appliquer(t0)
      window.scrollTo(0, 0)
    })
  }
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-action]") : null
    if (!b) return
    e.preventDefault()
    poster({ genre: "skin", valeur: b.getAttribute("data-valeur") })
  })
  const boutons = Array.from(document.querySelectorAll("button[data-valeur]"))
  window.catalogue = {
    souhaits(niveaux) {
      const s = new Set(niveaux)
      for (const b of boutons) {
        const oui = s.has(b.getAttribute("data-valeur"))
        if (oui === b.hasAttribute("data-souhait")) continue
        b.toggleAttribute("data-souhait", oui)
        const lu = b.getAttribute("aria-label").replace(/, dans tes souhaits$/, "")
        b.setAttribute("aria-label", oui ? lu + ", dans tes souhaits" : lu)
      }
      return true
    },
  }
  appliquer()
  // Ticket 8.8 : prête après la première image peinte (deux images), ou au plus tard 150 ms après, une fois, comme Stats
  // (page-web.tsx, SCRIPT_HOTE) : dite pendant la lecture du document, l'app retirait son cache avant toute image, et le
  // processus WebKit à froid (premier appui de l'exécution) laissait voir son blanc.
  let dite = false
  const dire = () => { if (!dite) { dite = true; poster({ genre: "prete", jeton: __JETON__ }) } }
  requestAnimationFrame(() => requestAnimationFrame(dire))
  setTimeout(dire, 150)
})()`

/** La feuille de la page. */
function css(c: CouleursPage): string {
  // Corps d'iOS (`-apple-system-body`) : la page suit la taille du texte réglée dans iOS ; tailles relatives (em).
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
.choix{display:flex;gap:8px;padding-top:6px}
select{flex:1 1 0;min-width:0;font:inherit;font-size:.88em;color:${c.texte};background:${c.surface};border:0;border-radius:12px;padding:7px 10px;min-height:36px}
#compte,.note{margin:6px 0 0;font-size:.76em;color:${c.texteDiscret}}
h2{margin:0;padding:20px 16px 8px;font-size:1em;font-weight:800;font-stretch:condensed;letter-spacing:.06em;text-transform:uppercase;color:${c.texte}}
ul{list-style:none;margin:0 16px;padding:0;background:${c.surface};border-radius:16px;overflow:hidden}
li+li{border-top:1px solid ${c.bordure}}
li[hidden],section[hidden],[hidden]{display:none!important}
.l{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 12px;font:inherit;color:inherit;text-align:left;background:none;border:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.l:active{background:${c.bordure}}
.l img,.l .sans{flex:0 0 68px;width:68px;height:30px;object-fit:contain}
.t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s{font-size:.76em;color:${c.texteDiscret};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s i{display:inline-block;width:8px;height:8px;margin-right:6px;vertical-align:1px}
.m{color:${c.orange}}
.d{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:2px;max-width:42%}
.d b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.d b.h{font-weight:400;font-size:.76em;color:${c.texteDiscret};white-space:normal;text-align:right}
.d .pn{white-space:nowrap}
.d s{font-size:.76em;color:${c.texteDiscret};font-variant-numeric:tabular-nums;margin-right:6px}
.d .r{font-size:.7em;font-weight:700;color:${c.orange}}
.e{display:none;color:${c.or};font-size:.88em}
[data-souhait] .e{display:inline}
#vide{margin:24px 16px;color:${c.texteDiscret}}`
}

/**
 * La page du Catalogue : un document complet. `index` (indexCatalogue), `prix` (lirePrix ; null : aucune liste validée),
 * `boutique` (prixEnBoutique ; null : boutique d'un jour passé ou absente, ticket 8.7), `retenus` et `reference` (ticket 8.9 :
 * prix-vus.json, table du paquet), `enBoutique` (niveauxEnBoutique),
 * `souhaits`, `couleurs` ; `jeton` : renvoyé par la page en se disant prête. Chaque ligne est un bouton `data-action="skin"`
 * dont `data-valeur` est l'uuid du premier niveau ; VoiceOver lit titre, arme, édition, prix (au Night Market, prix remisé,
 * base et remise), la boutique du jour et le souhait. Rien d'externe sauf les images (media.valorant-api.com, paresseuses).
 */
export function pageCatalogue(index: IndexCatalogue, { prix, boutique = null, retenus = null, reference = null, origines = null, enBoutique, souhaits, couleurs, jeton }: {
  prix: PrixLus | null; boutique?: PrixEnBoutique | null; retenus?: PrixVus | null; reference?: Reference | null
  /** Ticket 8.11 : la table des origines (origines.json) ; null : aucune origine dite. */
  origines?: TableOrigines | null
  enBoutique: { jour: Set<string>; nm: Set<string> } | null; souhaits: SouhaitsDeLaPage
  couleurs: CouleursPage; jeton: number
}): string {

  const codeEdition = new Map(index.editions.map((e, i) => [e.id, "e" + i]))
  const codeCollection = new Map(index.collections.map((c, i) => [c.cle, "c" + i]))
  const editions = new Map(index.editions.map((e) => [e.id, e]))
  const nomsCollections = new Map(index.collections.map((c) => [c.cle, c.nom]))
  const etoilees = new Set(niveauxSouhaites(index, souhaits))
  const obtentions = new Set<string>()
  const sections: string[] = []
  let courante: string | null = null
  let lignes: string[] = []
  const fermer = () => {
    if (courante === null) return
    const nom = index.armes.find((a) => a.id === courante)?.nom ?? courante
    sections.push(`<section data-arme="${echapper(courante)}"><h2>${echapper(nom)}</h2><ul>${lignes.join("")}</ul></section>`)
  }
  for (const s of index.skins) {
    if (s.arme !== courante) { fermer(); courante = s.arme; lignes = [] }
    const e = s.edition !== null ? editions.get(s.edition) : undefined
    const ou = dansBoutique(s.niveau, enBoutique)
    // Ticket 8.11 : sans prix, l'origine exacte prend sa place (même style discret, lue par VoiceOver) ; ticket 8.13 : sans
    // l'un ni l'autre, le complément de la table (prix confirmé, bundle, nature).
    const { p, origine } = prixEtProvenance(s, prix, boutique, retenus, reference, origines)
    const codes = codesObtention(p.vp !== null, origine)
    for (const x of codes.split(" ")) obtentions.add(x)
    const ditPrix = p.vp === null && origine !== null ? origine.texte : p.texte
    const voixPrix = p.vp === null && origine !== null ? origine.texte : p.voix
    const souhaite = etoilees.has(s.niveau)
    const collection = s.collection !== null ? nomsCollections.get(s.collection) ?? null : null
    // La collection n'est redite sous le titre que si elle en diffère (« Glitchpop » sous « Glitchpop » : rien).
    const autreCollection = collection !== null && normaliser(collection) !== normaliser(s.titre) ? collection : null
    const sous = [e ? e.nom : null, autreCollection].filter((x): x is string => x !== null).join(" · ")
    const marque = ou === "jour" ? "Boutique du jour" : ou === "nm" ? "Night Market" : null
    // VoiceOver : titre, arme (le titre de section n'est pas relu ligne à ligne), édition, prix, boutique, souhait (le script
    // ajoute ou retire « , dans tes souhaits »).
    const lu = [s.titre, s.armeNom, e ? e.nom : null, voixPrix, marque ? (ou === "jour" ? "dans la boutique du jour" : "au Night Market") : null]
      .filter((x): x is string => x !== null).join(", ") + (souhaite ? ", dans tes souhaits" : "")
    const image = imageAdmise(s.icone) ? `<img loading="lazy" src="${echapper(s.icone)}" alt="" width="68" height="30">` : `<span class="sans"></span>`
    const pastille = e && e.couleur && /^#[0-9a-fA-F]{6}$/.test(e.couleur) ? `<i style="background:${e.couleur}"></i>` : ""
    // Ticket 8.6 : sans prix validé (skin absent de prix.json, ou aucun prix.json) : « Prix non communiqué par Riot », discret.
    // Ticket 8.7 : au Night Market, la forme de la Boutique (vue.tsx, PrixRemise) : base barrée, prix remisé, puis « −N % ».
    const affiche = p.vp === null ? `<b class="h">${echapper(ditPrix)}</b>`
      : p.base === null && p.remise === null ? `<b>${echapper(p.texte)}</b>`
      : `<span class="pn">${p.base !== null ? `<s>${p.base}</s>` : ""}<b>${echapper(p.texte)}</b></span>${p.remise !== null ? `<span class="r">−${p.remise} %</span>` : ""}`
    lignes.push(`<li><button class="l" data-action="skin" data-valeur="${echapper(s.niveau)}"`
      + ` data-p="${s.edition !== null ? codeEdition.get(s.edition) ?? "" : ""}" data-c="${s.collection !== null ? codeCollection.get(s.collection) ?? "" : ""}" data-o="${codes}"`
      + ` data-n="${echapper(normaliser(`${s.titre} ${s.armeNom} ${collection ?? ""}`))}"${souhaite ? " data-souhait" : ""} aria-label="${echapper(lu)}">${image}`
      + `<span class="t"><span class="n">${echapper(s.titre)}</span><span class="s">${pastille}${echapper(sous || s.armeNom)}</span></span>`
      + `<span class="d">${affiche}${marque ? `<span class="s m">${marque}</span>` : ""}<span class="e" aria-hidden="true">★</span></span></button></li>`)
  }
  fermer()
  const puces = [`<button class="puce" type="button" data-arme="" aria-pressed="true">Toutes</button>`,
    ...index.armes.map((a) => `<button class="puce" type="button" data-arme="${echapper(a.id)}" aria-pressed="false">${echapper(a.nom)}</button>`)].join("")
  const choixEditions = index.editions.length === 0 ? "" : `<select id="ed" aria-label="Édition"><option value="">Toutes les éditions</option>`
    + index.editions.map((e, i) => `<option value="e${i}">${echapper(e.nom)}</option>`).join("") + `</select>`
  const choixCollections = index.collections.length === 0 ? "" : `<select id="col" aria-label="Collection"><option value="">Toutes les collections</option>`
    + index.collections.map((c, i) => `<option value="c${i}">${echapper(c.nom)}</option>`).join("") + `</select>`
  // Ticket 8.11 : le choix « Obtention » (catalogue complet seulement, comme les éditions et collections).
  const choixOrigines = index.complet ? choixObtention(obtentions) : ""
  const notes = [
    index.complet ? null : "Éditions et collections après la prochaine lecture de la boutique.",
  ].filter((x): x is string => x !== null).map((t) => `<p class="note">${echapper(t)}</p>`).join("")
  const script = SCRIPT.replace("__PONT__", JSON.stringify(PONT_CATALOGUE)).replace("__JETON__", String(Math.trunc(jeton)))
  // Ticket 7.8 (M2) : la politique de contenu du Catalogue (securite.ts, CSP_CATALOGUE) en tête, avant le style et le script.
  // Ticket 8.8 : le fond et `color-scheme` en ligne sur <html> et <body>, dès le premier octet, avant toute feuille de style
  // (comme le document de Stats, page-web.tsx, documentHote).
  const fond = couleurs.fond
  return `<!doctype html><html lang="fr" style="background-color:${fond};color-scheme:dark"><head><meta charset="utf-8">${metaCsp(CSP_CATALOGUE)}`
    + `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark">`
    + `<style>${css(couleurs)}</style></head><body style="background-color:${fond}">`
    + `<header class="tete"><input id="q" type="search" placeholder="Rechercher un skin" aria-label="Rechercher un skin" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">`
    + `<div class="puces" role="group" aria-label="Arme">${puces}</div>`
    + (choixEditions || choixCollections ? `<div class="choix">${choixEditions}${choixCollections}</div>` : "")
    + (choixOrigines ? `<div class="choix">${choixOrigines}</div>` : "")
    + `<p id="compte" aria-live="polite">${index.skins.length} skins</p>${notes}</header>`
    + `<main>${sections.join("")}<p id="vide" hidden>Aucun skin ne correspond.</p></main>`
    + `<script>${script}</script></body></html>`
}
