// Sécurité avant publication (epic-installation-ami, entrée 8) : les listes blanches et les bornes que partagent le moteur
// (valshop.ts), la collecte (collecte.ts), l'app (app.tsx) et ses pages web (page-web.tsx, catalogue-skins.ts,
// catalogue-web.tsx), en un seul endroit, pour qu'un script douteux, une réponse inattendue ou une donnée abîmée du dossier
// partagé ne mènent jamais ailleurs que là où ValShop doit aller.
//   - Liens : la page de Stats n'ouvre dans Safari qu'une adresse de LIENS_ADMIS (le tableau de bord de HenrikDev).
//   - Pages web : une politique de contenu (CSP) stricte par page ; aucune navigation hors des chargements de l'hôte.
//   - Riot : la région de riot-geo et son shard sur liste blanche, le PUUID et la version du client à leur forme, avant de
//     les mettre dans une adresse ou un en-tête.
//   - Images : https://media.valorant-api.com seulement, un id de fichier UUID, une taille bornée.
//   - Corps lus : bornés (taille annoncée, puis taille lue) ; journal.log tourné au-delà de sa borne.
// Module pur : ni fichier, ni réseau, ni `scripting` (une réponse est passée par l'appelant).

import { LIEN_CLE } from "./cle"

// ─────────────────────────── liens ───────────────────────────

/** Les seules adresses que l'action « lien » d'une page web ouvre dans Safari : celles que l'app affiche vraiment. */
export const LIENS_ADMIS: readonly string[] = [LIEN_CLE]

/** Vrai pour une adresse de LIENS_ADMIS, telle quelle. */
export function lienAdmis(adresse: unknown): adresse is string {
  return typeof adresse === "string" && LIENS_ADMIS.includes(adresse)
}

// ─────────────────────────── pages web ───────────────────────────

/** Ce que toute page refuse : connexions, formulaires, cadres, objets, travailleurs, polices et médias, base d'adresse. */
const CSP_COMMUNE = "default-src 'none'; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; "
  + "child-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'"

/** Stats : scripts et styles en ligne (le dessin de la page), images en `data:` seulement (symboles SF rendus par l'hôte). */
export const CSP_STATS = `${CSP_COMMUNE}; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:`

/** Catalogue : scripts et styles en ligne, images de https://media.valorant-api.com/ seulement (tout chemin sous la racine). */
export const CSP_CATALOGUE = `${CSP_COMMUNE}; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://media.valorant-api.com/`

/** La méta de la politique, à poser en tête de `<head>`, avant tout script. */
export function metaCsp(politique: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${politique}">`
}

/**
 * Une navigation de la vue web est-elle admise ? Seuls les chargements de l'hôte (`loadHTML`, adresse `about:blank`, ou sans
 * adresse) et les ancres de la page (`about:blank#…`) ; toute autre adresse (http, https, data, file, javascript, un schéma
 * d'app) est refusée : une page ne mène jamais ailleurs.
 */
export function navigationAdmise(adresse: unknown): boolean {
  if (adresse === null || adresse === undefined || adresse === "") return true
  return typeof adresse === "string" && /^about:(blank|srcdoc)(#|$)/i.test(adresse)
}

// ─────────────────────────── Riot ───────────────────────────

/** Les régions de riot-geo (`affinities.live`) et le shard de leur boutique (`pd.<shard>.a.pvp.net`). */
export const SHARDS: Readonly<Record<string, string>> = { na: "na", latam: "na", br: "na", eu: "eu", ap: "ap", kr: "kr" }

/** Le shard de la boutique d'une région de la liste blanche ; null pour toute autre valeur. */
export function shardDe(region: unknown): string | null {
  return typeof region === "string" && Object.prototype.hasOwnProperty.call(SHARDS, region) ? SHARDS[region] : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un UUID (PUUID, id d'un objet du jeu) : seule forme admise dans une adresse ou un nom de fichier. */
export function estUuid(x: unknown): x is string {
  return typeof x === "string" && UUID.test(x)
}

/** La version du client Riot (valorant-api, `riotClientVersion`), avant de la mettre dans un en-tête : lettres, chiffres, `.`, `_`, `-`. */
export function versionClient(x: unknown): string | null {
  return typeof x === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(x) ? x : null
}

// ─────────────────────────── images ───────────────────────────

/** Une image distante admise : https sur media.valorant-api.com, un chemin sans blanc, guillemet, chevron ni barre inverse. */
export function imageAdmise(adresse: unknown): adresse is string {
  return typeof adresse === "string" && /^https:\/\/media\.valorant-api\.com\/[A-Za-z0-9._~%\/-]+$/.test(adresse) && !/\.\.|%2e/i.test(adresse)
}

/** Une vidéo de skin admise (fiche du skin) : https sur valorant.dyn.riotcdn.net, le CDN de Riot que cite valorant-api, seulement. */
export function videoAdmise(adresse: unknown): adresse is string {
  return typeof adresse === "string" && /^https:\/\/valorant\.dyn\.riotcdn\.net\/[A-Za-z0-9._~%\/-]+$/.test(adresse) && !/\.\.|%2e/i.test(adresse)
}

// ─────────────────────────── corps bornés ───────────────────────────

/** version.json du dépôt : 5 notes de 200 caractères au plus. */
export const BORNE_VERSION = 16 * 1024
/** Réponses de Riot (entitlements, userinfo, riot-geo, boutique). */
export const BORNE_RIOT = 4 * 1024 * 1024

export const BORNE_JSON = 32 * 1024 * 1024
/** Une image (icône, plan de carte, emblème). */
export const BORNE_IMAGE = 8 * 1024 * 1024

/** Levée par une réponse plus grande que sa borne : traitée comme une réponse illisible. */
export class ReponseTropGrande extends Error {
  constructor() {
    super("réponse trop grande")
  }
}

/** Ce qu'il faut d'une réponse pour la lire bornée. */
type ReponseLue = { headers?: { get(nom: string): string | null } | null; text(): Promise<string> }

/** La taille annoncée d'une réponse (`Content-Length`), ou null si elle ne se lit pas. */
export function tailleAnnoncee(r: { headers?: { get(nom: string): string | null } | null }): number | null {
  try {
    const v = r.headers?.get("content-length")
    if (typeof v !== "string" || !/^\d{1,15}$/.test(v.trim())) return null
    return Number(v.trim())
  } catch {
    return null
  }
}

/** Le corps d'une réponse en texte, au plus `borne` (annoncée, puis lue) ; au-delà, ReponseTropGrande. */
export async function texteBorne(r: ReponseLue, borne: number): Promise<string> {
  const annonce = tailleAnnoncee(r)
  if (annonce !== null && annonce > borne) throw new ReponseTropGrande()
  const t = await r.text()
  if (typeof t === "string" && t.length > borne) throw new ReponseTropGrande()
  return t
}

/** Le corps JSON d'une réponse, borné comme texteBorne ; un JSON illisible lève comme `JSON.parse`. */
export async function jsonBorne(r: ReponseLue, borne: number): Promise<any> {
  return JSON.parse(await texteBorne(r, borne))
}

/** Une taille de données (`Data.size`) admise : un nombre de 1 à `borne` octets. */
export function tailleAdmise(taille: unknown, borne: number): boolean {
  return typeof taille === "number" && Number.isFinite(taille) && taille > 0 && taille <= borne
}

// ─────────────────────────── journal ───────────────────────────

/** Au-delà de cette taille (en caractères), journal.log est tourné à la première ligne d'une exécution. */
export const JOURNAL_MAX = 1_500_000
/** Les lignes gardées quand il tourne : de quoi relire plusieurs semaines de lectures et de collectes. */
export const JOURNAL_LIGNES = 5000

/** Au-delà de cette taille (octets), journal.log n'est plus relu : il est remplacé par une ligne qui le dit (un fichier anormal). */
export const JOURNAL_ENORME = 50_000_000

/** Le journal tourné : ses `garder` dernières lignes (sans ligne vide de fin), s'il dépasse `max` ; null s'il ne le dépasse pas. */
export function journalTourne(texte: string, max: number = JOURNAL_MAX, garder: number = JOURNAL_LIGNES): string | null {
  if (texte.length <= max) return null
  const lignes = texte.split("\n")
  if (lignes.length > 0 && lignes[lignes.length - 1] === "") lignes.pop()
  return lignes.slice(-garder).join("\n") + "\n"
}
