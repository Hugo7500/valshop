












import { jusquAu, libelleType, separerNom } from "./fiches"
import { sessionExpiree } from "./garde-fou"
import { iconeLisible } from "./securite"
import { lireSolde } from "./solde"
import { lireListe } from "./souhaits"
import type { Accessoire, Appui, Chiffre, Constat, Donnees, Issue, PartieVue, SkinVu, Stats } from "./widgets-types"

/** Ce que la lecture reçoit : shop.json déjà lu en JSON, le texte de solde.json, l'heure, le dossier partagé, et de quoi savoir si un fichier existe. */
export type Sources = {
  shop: unknown; solde: string | null; maintenant: number; groupe: string; existe: (chemin: string) => boolean
  /** Le texte de widget-appui.json (dernier appui sur ↻ depuis un widget) et celui de etat.json ; absents : null. */
  appui?: string | null; etat?: string | null

  offres?: string | null; liste?: string | null; stats?: string | null; compte?: string | null
  /** La période des stats de ce widget (widgets-reglage.ts) ; sans elle, 30 jours. */
  periode?: string
}

/** Au-delà de cet âge, un appui sur ↻ n'est plus dit par le widget. */
export const DUREE_APPUI_MS = 90_000

/** Contenu de widget-appui.json : `{ "etat", "t" }`. */
export function contenuAppui(etat: Appui["etat"], t: number): string {
  return JSON.stringify({ etat, t })
}

/**
 * Le dernier appui sur ↻, lu strictement : un état connu et une heure entière, vieille de DUREE_APPUI_MS au plus et pas dans
 * l'avenir (à cinq secondes près) ; sinon null.
 */
export function lireAppui(texte: string | null | undefined, maintenant: number): Appui | null {
  if (!texte) return null
  let lu: unknown
  try {
    lu = JSON.parse(texte)
  } catch {
    return null
  }
  const o = objet(lu)
  const etat = o?.etat, t = o?.t
  if ((etat !== "lecture" && etat !== "a-jour" && etat !== "echec") || typeof t !== "number" || !Number.isSafeInteger(t)) return null
  return maintenant - t > DUREE_APPUI_MS || t > maintenant + 5_000 ? null : { etat, t }
}

function objet(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}
function liste(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}
/** Un prix : un entier positif ou nul, sinon null. */
function prix(x: unknown): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null
}
function texte(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x : null
}
function instant(x: unknown): number | null {
  const ms = typeof x === "string" ? Date.parse(x) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** Le chemin d'une icône gardée, si son fichier est là ; jamais une adresse web. */
function icone(x: unknown, s: Sources): string | null {
  const chemin = iconeLisible(x, s.groupe)
  return chemin !== null && !chemin.startsWith("http") && s.existe(chemin) ? chemin : null
}

/** Un skin d'une offre de shop.json ; null sans libellé. « Vandal (Oni) » : nom « Oni », arme « VANDAL ». */
function skin(x: unknown, s: Sources): SkinVu | null {
  const o = objet(x)
  const nom = texte(o?.name)
  if (!o || nom === null) return null
  const { skin: n, weapon } = separerNom(nom)
  return { nom: n, arme: weapon, prix: prix(o.cost), icone: icone(o.icon, s), couleur: /^#[0-9a-fA-F]{6}$/.test(String(o.color)) ? String(o.color) : null }
}


export function encore(fin: unknown, maintenant: number): string | null {
  const ms = instant(fin)
  if (ms === null || ms <= maintenant) return null
  const heures = Math.floor((ms - maintenant) / 3_600_000)
  if (heures >= 24) return `encore ${Math.floor(heures / 24)} j`
  return heures >= 1 ? `encore ${heures} h` : "moins d'une heure"
}


function heure(ms: number): string {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}

/** Le chemin de l'icône d'une monnaie (`vp`, `rp`, `kc`), gardée par l'écran « Mes widgets ». */
export function cheminMonnaie(groupe: string, cle: "vp" | "rp" | "kc"): string {
  return `${groupe}/icons/monnaie-${cle}.png`
}

// ─────────────────────────── souhaits (lot 2) ───────────────────────────

/** Le skin et l'arme (uuid) du niveau d'une offre du jour, tels que le catalogue les donne ; null : inconnus du catalogue. */
export type OffreParente = { id: string; skin: string | null; weapon: string | null }

/**
 * Contenu de widget-souhaits.json : `{ "v": 1, "boutique": <updatedAt de shop.json>, "offres": [{ id, skin, weapon }] }`, une
 * entrée par offre du jour de `shop`, dans l'ordre, avec le skin et l'arme de son niveau d'après `niveaux` (`levels` de
 * catalog.json). Écrit par la lecture de la boutique, juste après shop.json.
 */
export function contenuOffres(shop: unknown, niveaux: unknown): string {
  const offres: OffreParente[] = []
  for (const x of liste(objet(objet(shop)?.daily)?.items)) {
    const id = texte(objet(x)?.id)
    if (id === null) continue
    const n = objet(objet(niveaux)?.[id])
    offres.push({ id, skin: texte(n?.skin), weapon: texte(n?.weapon) })
  }
  return JSON.stringify({ v: 1, boutique: objet(shop)?.updatedAt ?? null, offres })
}

/**
 * Ce que la liste de souhaits attend dans la boutique du jour : le premier skin du jour qu'une entrée de la liste désigne (son
 * skin, ou son arme entière), le nombre de skins du jour ainsi attendus, et le nombre d'entrées suivies. `suivis` null : widget-souhaits.json absent, illisible, ou écrit
 * sous une autre boutique que celle-ci (alors rien n'est dit, plutôt qu'un « aucun aujourd'hui » peut-être faux).
 */
function souhaits(shop: Record<string, unknown>, items: unknown[], s: Sources): { souhait: SkinVu | null; suivis: number | null; trouves: number | null } {
  let lu: unknown = null
  try {
    lu = s.offres ? JSON.parse(s.offres) : null
  } catch { /* illisible : comme absent */ }
  const o = objet(lu)
  if (!o || o.v !== 1 || typeof o.boutique !== "string" || o.boutique !== shop.updatedAt || !Array.isArray(o.offres)) return { souhait: null, suivis: null, trouves: null }
  const parents = new Map<string, { skin: string | null; weapon: string | null }>()
  for (const x of o.offres) {
    const p = objet(x)
    const id = texte(p?.id)
    if (p && id !== null) parents.set(id, { skin: texte(p.skin), weapon: texte(p.weapon) })
  }
  const suivie = lireListe(s.liste)
  // Le premier skin attendu, et leur nombre (lot 4 : l'écran verrouillé le dit).
  let premier: SkinVu | null = null
  let trouves = 0
  for (const x of items) {
    const id = texte(objet(x)?.id)
    const p = id === null ? undefined : parents.get(id)
    if (!p || !suivie.some((e) => (e.kind === "skin" && e.id === p.skin) || (e.kind === "weapon" && e.id === p.weapon))) continue
    const vu = skin(x, s)
    if (vu === null) continue
    premier ??= vu
    trouves += 1
  }
  return { souhait: premier, suivis: suivie.length, trouves }
}

// ─────────────────────────── stats (lot 2) ───────────────────────────

/** Une partie du résumé : aucun identifiant de partie ni de joueur ; `carteId` et `agent` sont des uuid publics du jeu (images). */
export type PartieGardee = {
  issue: Issue; carte: string | null; carteId: string | null; agent: string | null
  /** La file telle que gardée : `competitive`, `unrated`, `swiftplay`, `premier`. */
  file: string
  pour: number; contre: number
  /** Kills, morts, assistances ; null si l'un manque. */
  kda: [number, number, number] | null
  rr: number | null

  tete: string | null
}
/** Un chiffre clé d'une période : sa valeur écrite comme sa tuile de la Vue d'ensemble, et le sens de sa variation sur la période. */
export type ChiffreGarde = { cle: "kd" | "tete" | "victoires"; valeur: string; hausse: boolean | null }
/**
 * widget-stats.json (contrat-donnees.md). `compte` : l'empreinte du compte (empreinteCompte), jamais son PUUID ; `ecritA` :
 * l'heure du calcul (ms) ; `majA` : la dernière mise à jour réussie des stats (ms), null si inconnue.
 */







export type ConstatGarde =
  | { type: "agent" | "carte" | "carte-faible"; nom: string; id: string | null; valeur: string; parties: number; plus: { libelle: string; valeur: string }[] }
  | { type: "hausse" | "baisse"; cle: ChiffreGarde["cle"]; valeur: string }

export type ResumeStats = {
  v: 1; compte: string; ecritA: number; majA: number | null
  rang: { nom: string; embleme: string | null; rr: number | null; variation: number | null } | null
  derniers: Issue[]
  courbe: number[]
  parties: PartieGardee[]
  derniere: PartieGardee | null
  /** `constats` : absent d'un résumé écrit avant le lot 3 (le widget invite alors à ouvrir l'onglet Stats). */
  periodes: Record<string, { parties: number; chiffres: ChiffreGarde[]; constats?: ConstatGarde[] }>
}

/** Les noms des files à manches, tels que les widgets les écrivent. */
export const NOMS_FILES: Readonly<Record<string, string>> = { competitive: "Compétition", unrated: "Non classé", swiftplay: "Vélocité", premier: "Premier" }
const NOMS_PERIODES: Readonly<Record<string, string>> = { "7j": "7 jours", "30j": "30 jours", acte: "Acte", tout: "Tout" }
const LIBELLES_CHIFFRES: Readonly<Record<ChiffreGarde["cle"], { libelle: string; court: string }>> = {
  kd: { libelle: "K/D", court: "K/D" }, tete: { libelle: "Tirs à la tête", court: "Tirs tête" }, victoires: { libelle: "Victoires", court: "Victoires" },
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Un uuid public du jeu (agent, carte), en minuscules ; null pour toute autre forme. */
export function uuidJeu(x: unknown): string | null {
  return typeof x === "string" && UUID.test(x.toLowerCase()) ? x.toLowerCase() : null
}

/** Les images réduites des widgets de stats, gardées par l'app (widgets-images.ts) : icône et portrait d'un agent, image d'une carte. */
export function cheminAgent(groupe: string, agent: string): string {
  return `${groupe}/icons/agent-${agent}.png`
}
export function cheminPortrait(groupe: string, agent: string): string {
  return `${groupe}/icons/agent-${agent}-portrait.png`
}
export function cheminFond(groupe: string, carte: string): string {
  return `${groupe}/icons/carte-${carte}-fond.jpg`
}

/**
 * L'empreinte d'un compte : 14 chiffres hexadécimaux tirés de son PUUID (cyrb53), pour reconnaître le résumé de ce compte sans
 * écrire son PUUID une fois de plus. Pas un secret : une marque d'appartenance.
 */
export function empreinteCompte(puuid: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < puuid.length; i++) {
    const c = puuid.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

/** Un entier, signé ou non ; sinon null. */
function entier(x: unknown): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) ? x : null
}
function issue(x: unknown): Issue | null {
  return x === "V" || x === "D" || x === "N" ? x : null
}
function fichier(chemin: string, s: Sources): string | null {
  return s.existe(chemin) ? chemin : null
}

/** Une partie du résumé, vérifiée ; null si son issue, sa file ou ses manches n'ont pas leur forme. */
function partieVue(x: unknown, s: Sources): PartieVue | null {
  const o = objet(x)
  const i = issue(o?.issue), pour = prix(o?.pour), contre = prix(o?.contre)
  const file = typeof o?.file === "string" ? NOMS_FILES[o.file] : undefined
  if (!o || i === null || pour === null || contre === null || file === undefined) return null
  const k = Array.isArray(o.kda) && o.kda.length === 3 ? o.kda.map(prix) : null
  const agent = uuidJeu(o.agent), carte = uuidJeu(o.carteId)
  const tete = texte(o.tete)
  return {
    issue: i, carte: texte(o.carte), file, pour, contre,
    kda: k !== null && k.every((n) => n !== null) ? k.join(" / ") : null,
    rr: o.file === "competitive" ? entier(o.rr) : null,
    tete: tete !== null && /^\d{1,3}[\u202f\u00a0 ]?%$/.test(tete) ? tete : null,
    icone: agent === null ? null : fichier(cheminAgent(s.groupe, agent), s),
    portrait: agent === null ? null : fichier(cheminPortrait(s.groupe, agent), s),
    fond: carte === null ? null : fichier(cheminFond(s.groupe, carte), s),
  }
}


function quand(ms: number, maintenant: number): string {
  const d = new Date(ms), a = new Date(maintenant)
  if (d.getFullYear() === a.getFullYear() && d.getMonth() === a.getMonth() && d.getDate() === a.getDate()) return heure(ms)
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0")
}


function resumeDuCompte(s: Sources): { o: Record<string, unknown>; p: Record<string, unknown>; periode: string } | null {
  let lu: unknown = null, compte: unknown = null
  try {
    lu = s.stats ? JSON.parse(s.stats) : null
    compte = s.compte ? JSON.parse(s.compte) : null
  } catch {
    return null
  }
  const o = objet(lu)
  const puuid = texte(objet(compte)?.puuid)
  if (!o || o.v !== 1 || puuid === null || o.compte !== empreinteCompte(puuid)) return null
  const periode = s.periode !== undefined && NOMS_PERIODES[s.periode] !== undefined ? s.periode : "30j"
  const p = objet(objet(o.periodes)?.[periode])
  return p ? { o, p, periode } : null
}

/** La dernière mise à jour des stats, telle que les widgets l'écrivent ; null si elle manque ou est dans le futur. */
function majEcrite(o: Record<string, unknown>, s: Sources): string | null {
  const maj = entier(o.majA)
  return maj !== null && maj > 0 && maj <= s.maintenant + 5_000 ? quand(maj, s.maintenant) : null
}





export function lireStats(s: Sources): Stats | null {
  const garde = resumeDuCompte(s)
  if (garde === null) return null
  const { o, p, periode } = garde

  const chiffres: Chiffre[] = []
  for (const x of liste(p.chiffres)) {
    const c = objet(x)
    const cle = c?.cle
    const valeur = texte(c?.valeur)
    if (!c || (cle !== "kd" && cle !== "tete" && cle !== "victoires") || valeur === null) continue
    const pourcent = /^(.*?)[\u202f\u00a0 ]?%$/.exec(valeur)
    chiffres.push({
      valeur: pourcent ? pourcent[1] : valeur, unite: pourcent ? "%" : "", ...LIBELLES_CHIFFRES[cle],
      hausse: typeof c.hausse === "boolean" ? c.hausse : null,
    })
  }

  const r = objet(o.rang)
  const nom = texte(r?.nom)
  const courbe = liste(o.courbe)
  return {
    periode: NOMS_PERIODES[periode],
    majA: majEcrite(o, s),
    rang: r && nom !== null ? { nom, icone: icone(r.embleme, s), rr: prix(r.rr), variation: entier(r.variation) } : null,
    derniers: liste(o.derniers).map(issue).filter((x): x is Issue => x !== null).slice(-5),
    chiffres,
    courbe: courbe.length >= 2 && courbe.every((x) => entier(x) !== null) ? (courbe as number[]) : [],
    parties: liste(o.parties).map((x) => partieVue(x, s)).filter((x): x is PartieVue => x !== null).slice(0, 3),
    derniere: partieVue(o.derniere, s),
  }
}

// ─────────────────────────── le chiffre du jour (lot 3) ───────────────────────────

const JOURS: readonly string[] = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]

function valeurEcrite(x: unknown): { valeur: string; unite: string } | null {
  const t = texte(x)
  if (t === null) return null
  const pourcent = /^(.*?)[\u202f\u00a0 ]?%$/.exec(t)
  const nombre = pourcent ? pourcent[1] : t
  return /^\d{1,3}(,\d{1,2})?$/.test(nombre) ? { valeur: nombre, unite: pourcent ? "%" : "" } : null
}

/** Le numéro du jour à l'heure de l'appareil : il change à minuit, pas à 1 h ou 2 h du matin. */
export function numeroDuJour(ms: number): number {
  const d = new Date(ms)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** Un constat gardé, vérifié et écrit pour la vue ; null s'il n'a pas sa forme (exact ou absent). */
function constatVu(x: unknown, s: Sources): Omit<Constat, "jour" | "periode" | "majA"> | null {
  const o = objet(x)
  const v = valeurEcrite(o?.valeur)
  if (!o || v === null) return null
  if (o.type === "hausse" || o.type === "baisse") {
    const cle = o.cle
    if (cle !== "kd" && cle !== "tete" && cle !== "victoires") return null
    const hausse = o.type === "hausse"
    return {
      titre: hausse ? "En progrès" : "À travailler", ...v, sujet: LIBELLES_CHIFFRES[cle].libelle,
      detail: hausse ? "en hausse sur la période" : "en baisse sur la période", genre: hausse ? "fort" : "travail",
      portrait: null, fond: null, plus: [],
    }
  }
  if (o.type !== "agent" && o.type !== "carte" && o.type !== "carte-faible") return null
  const nom = texte(o.nom), parties = prix(o.parties), id = uuidJeu(o.id)
  if (nom === null || parties === null || parties < 1 || v.unite !== "%") return null
  const plus: Constat["plus"] = []
  for (const y of liste(o.plus).slice(0, 2)) {
    const c = objet(y)
    const libelle = texte(c?.libelle), ecrit = valeurEcrite(c?.valeur)
    if (libelle !== null && ecrit !== null) plus.push({ libelle, valeur: ecrit.unite ? `${ecrit.valeur}\u202f%` : ecrit.valeur })
  }
  return {
    titre: o.type === "agent" ? "Meilleur agent" : o.type === "carte" ? "Meilleure carte" : "À travailler", ...v, sujet: nom,
    detail: `de victoires · ${parties} partie${parties > 1 ? "s" : ""}`, genre: o.type === "carte-faible" ? "travail" : "fort",
    portrait: o.type === "agent" && id !== null ? fichier(cheminPortrait(s.groupe, id), s) : null,
    fond: o.type !== "agent" && id !== null ? fichier(cheminFond(s.groupe, id), s) : null,
    plus,
  }
}

/**
 * Le constat du jour pour la période du widget : un des constats du résumé, un autre chaque jour (dans leur ordre, à tour de
 * rôle). `vide` : le résumé porte la liste de la période et aucun constat ne s'y lit (trop peu de parties). Sans résumé du
 * compte, ou pour un résumé d'avant le lot 3 : ni constat ni `vide` (le widget invite à ouvrir l'onglet Stats).
 */
export function lireJour(s: Sources): { jour: Constat | null; vide: boolean } {
  const r = resumeDuCompte(s)
  if (r === null || !Array.isArray(r.p.constats)) return { jour: null, vide: false }
  const lus = r.p.constats.map((x) => constatVu(x, s)).filter((x): x is NonNullable<typeof x> => x !== null)
  if (lus.length === 0) return { jour: null, vide: true }
  const n = numeroDuJour(s.maintenant)
  const c = lus[((n % lus.length) + lus.length) % lus.length]
  return { jour: { ...c, jour: JOURS[new Date(s.maintenant).getDay()], periode: NOMS_PERIODES[r.periode], majA: majEcrite(r.o, s) }, vide: false }
}

/** Les données des widgets ; null si shop.json n'a pas la forme d'une boutique (le widget invite alors à ouvrir l'app). */
export function lireDonnees(s: Sources): Donnees | null {
  const shop = objet(s.shop)
  const jour = objet(shop?.daily)
  if (!shop || !jour) return null
  const skins = liste(jour.items).map((x) => skin(x, s)).filter((x): x is SkinVu => x !== null)

  const monnaie = (cle: "vp" | "rp" | "kc") => (s.existe(cheminMonnaie(s.groupe, cle)) ? cheminMonnaie(s.groupe, cle) : null)

  // Le solde : seulement celui lu sous cette boutique.
  const garde = lireSolde(s.solde)
  const lu = garde !== null && garde.boutique === shop.updatedAt ? instant(garde.luA) : null
  const solde = garde !== null && lu !== null ? { ...garde.soldes, heure: heure(lu) } : null

  // Le bundle en vedette : le premier.
  const b = objet(liste(shop.bundles)[0])
  const nomBundle = texte(b?.name)
  const bundle = b && nomBundle !== null
    ? { nom: nomBundle, prix: prix(b.discounted) ?? prix(b.cost), fin: jusquAu(b.endsAt), objets: liste(b.items).length > 0 ? liste(b.items).length : null, image: icone(b.icon, s) }
    : null

  const acc = objet(shop.accessories)
  const accessoires: Accessoire[] = []
  for (const x of liste(acc?.items)) {
    const o = objet(x)
    const nom = texte(o?.name)
    if (o && nom !== null) accessoires.push({ nom, type: libelleType(o.kind), prix: prix(o.cost), icone: icone(o.icon, s) })
  }

  // Le Night Market : seulement ouvert, avec ses offres ; le prix est le prix remisé, l'origine le prix d'avant.
  const nm = objet(shop.nightMarket)
  const offres: SkinVu[] = []
  if (nm?.active === true) {
    for (const x of liste(nm.items)) {
      const o = objet(x)
      const base = skin(x, s)
      if (!o || base === null) continue
      const remise = prix(o.discountPercent)
      offres.push({ ...base, prix: prix(o.discounted), origine: base.prix, ...(remise !== null ? { remise } : {}) })
    }
  }
  const finNuit = encore(nm?.endsAt, s.maintenant)
  const attendu = souhaits(shop, liste(jour.items), s)
  const duJour = lireJour(s)

  return {
    lueA: instant(shop.updatedAt),
    appui: lireAppui(s.appui, s.maintenant),
    sessionExpiree: sessionExpiree(s.etat),
    reset: instant(jour.resetAt),
    skins,
    monnaies: { vp: monnaie("vp"), rp: monnaie("rp"), kc: monnaie("kc") },
    solde,
    bundle,
    accessoires,
    finAccessoires: accessoires.length > 0 && instant(acc?.endsAt) !== null ? jusquAu(acc?.endsAt) : null,
    souhait: attendu.souhait,
    souhaitsTrouves: attendu.trouves,
    souhaitsSuivis: attendu.suivis,
    nuit: offres.length > 0 ? { skins: offres, fin: finNuit ?? "" } : null,
    stats: lireStats(s),
    jour: duJour.jour,
    jourVide: duJour.vide,
  }
}
