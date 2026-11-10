// La nouvelle version de ValShop (epic-installation-ami, entrée 4) : au plus une fois par jour, à l'ouverture de l'app
// (presenterApp, jamais au rendu), un GET public du fichier version.json du dépôt (raw.githubusercontent.com), sans aucun
// en-tête ni corps, sans redirection suivie : ni clé, ni session, ni identifiant n'en sortent. Si la version publiée est plus
// récente que celle du script installé (Script.metadata.version, le `version` de script.json), la feuille Réglages des stats
// montre la section « Nouvelle version », ses notes et le bouton « Mettre à jour ValShop », qui ouvre le lien d'import du dépôt
// (Script.createImportScriptsURLScheme) : Scripting importe alors le même dépôt. Rien ne s'installe sans ce geste.
//
// Le dernier contrôle et sa réponse sont gardés dans le `Storage` du script (ticket 7.8 : propre à ValShop, ni dans le dossier du
// groupe d'apps que tout script partage, ni dans le dossier du script, que l'import remplace) : moins d'un jour après lui, aucune
// requête, la réponse gardée sert. Un échec (réseau,
// statut, réponse inattendue) reste silencieux à l'écran : une ligne au journal, sans identifiant, et le contrôle suivant
// attend le lendemain. Module pur : fichier, réseau, journal et heure sont passés par l'appelant (app.tsx) ; rien de
// `scripting` ici. Le reste de l'app ne lit que nouvelleVersionConnue et ecouterNouvelleVersion.

import { BRANCHE_DEPOT, COMPTE_GITHUB, NOM_DEPOT } from "./partage"

/** Le fichier de version du dépôt, servi tel quel par GitHub (adresse brute d'un fichier de la branche). */
export const ADRESSE_VERSION = `https://raw.githubusercontent.com/${COMPTE_GITHUB}/${NOM_DEPOT}/${BRANCHE_DEPOT}/version.json`
/** Délai de la requête, en secondes : elle ne retient rien, l'app s'ouvre sans l'attendre. */
export const DELAI_VERSION = 10
/** Un contrôle par jour au plus. */
export const UN_JOUR_MS = 24 * 3_600_000
/** Le nom de l'ancien fichier du dernier contrôle, dans le dossier du groupe d'apps (avant le ticket 7.8) : retiré par app.tsx. */
export const FICHIER_VERSION = "version-en-ligne.json"
/** Ticket 7.8 (M1) : la clé du dernier contrôle dans le `Storage` du script (propre à ValShop, jamais dans le dossier partagé). */
export const CLE_VERSION = "valshop.version-en-ligne"

/** Une version publiée : son numéro et ses notes courtes, en français. */
export type VersionPubliee = { version: string; notes: string[] }
/** Une version plus récente que celle installée : la publiée, et celle installée. */
export type NouvelleVersion = VersionPubliee & { installee: string }
/** Ce que garde version-en-ligne.json : l'heure du dernier contrôle (ms) et la dernière version publiée lue (null : aucune). */
export type CacheVersion = { verifie: number; publiee: VersionPubliee | null }

/** Les morceaux d'un numéro de version (`1.2.10` donne [1, 2, 10]) ; null s'il n'en a pas la forme (1 à 4 nombres de 1 à 6 chiffres). */
function morceaux(v: unknown): number[] | null {
  if (typeof v !== "string" || !/^\d{1,6}(\.\d{1,6}){0,3}$/.test(v.trim())) return null
  return v.trim().split(".").map(Number)
}

/** Compare deux numéros : > 0 si `a` est plus récent, 0 égaux (`1.0` vaut `1.0.0`), < 0 plus ancien ; null si l'un est illisible. */
export function comparerVersions(a: unknown, b: unknown): number | null {
  const x = morceaux(a), y = morceaux(b)
  if (x === null || y === null) return null
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** Au plus 5 notes de 1 à 200 caractères chacune. */
const NOTES_MAX = 5
const NOTE_MAX = 200

/**
 * Le contenu de version.json lu et vérifié : un objet, `version` lisible (comparerVersions), `notes` une liste de 1 à 5 textes
 * non vides d'au plus 200 caractères ; null sinon. Les notes sont gardées sans leurs blancs de bord.
 */
export function lireVersionPubliee(texte: string): VersionPubliee | null {
  let j: unknown
  try {
    j = JSON.parse(texte)
  } catch {
    return null
  }
  if (typeof j !== "object" || j === null || Array.isArray(j)) return null
  const { version, notes } = j as Record<string, unknown>
  if (morceaux(version) === null || !Array.isArray(notes) || notes.length === 0 || notes.length > NOTES_MAX) return null
  const propres = notes.map((n) => (typeof n === "string" ? n.trim() : ""))
  if (propres.some((n) => n === "" || n.length > NOTE_MAX)) return null
  return { version: (version as string).trim(), notes: propres }
}

/** version-en-ligne.json lu ; null s'il manque ou ne se lit pas (le contrôle se fait alors). */
export function lireCache(texte: string | null): CacheVersion | null {
  if (texte === null) return null
  try {
    const j = JSON.parse(texte)
    if (typeof j !== "object" || j === null || typeof j.verifie !== "number" || !Number.isFinite(j.verifie)) return null
    const publiee = j.publiee === null ? null : lireVersionPubliee(JSON.stringify(j.publiee))
    if (j.publiee !== null && publiee === null) return null
    return { verifie: j.verifie, publiee }
  } catch {
    return null
  }
}

/** Faut-il contrôler ? Sans contrôle gardé, un jour ou plus après lui, ou si l'heure est revenue avant lui (horloge changée). */
export function doitVerifier(cache: CacheVersion | null, maintenant: number): boolean {
  return cache === null || maintenant < cache.verifie || maintenant - cache.verifie >= UN_JOUR_MS
}

/** La version publiée, si elle est plus récente que celle installée (lisible) ; null sinon. */
export function plusRecente(installee: unknown, publiee: VersionPubliee | null): NouvelleVersion | null {
  if (publiee === null || typeof installee !== "string") return null
  const d = comparerVersions(publiee.version, installee)
  return d !== null && d > 0 ? { ...publiee, installee: installee.trim() } : null
}

/** Ce que l'appelant fournit : la version installée, l'heure, le fichier gardé, la requête, le journal. */
export type Outils = {
  installee: string | null
  maintenant: number
  lireCache: () => string | null
  ecrireCache: (texte: string) => void
  /** Le GET de ADRESSE_VERSION : le statut, et le corps si la réponse est 2xx ; lève hors réseau. */
  telecharger: () => Promise<{ statut: number; corps: string | null }>
  noter: (ligne: string) => Promise<void> | void
}

/**
 * Le contrôle de la nouvelle version : la réponse gardée moins d'un jour avant, sinon le GET, puis le contrôle gardé (son heure,
 * et la version lue, ou celle d'avant sur un échec : le bouton déjà su reste). Un échec : une ligne au journal, sans identifiant,
 * des comptes seulement. Rend la version plus récente que l'installée, ou null. Ne lève jamais.
 */
export async function chercherNouvelleVersion(o: Outils): Promise<NouvelleVersion | null> {
  try {
    const cache = lireCache(o.lireCache())
    if (!doitVerifier(cache, o.maintenant)) return plusRecente(o.installee, cache!.publiee)
    let publiee: VersionPubliee | null = null
    let echec: string | null = null
    try {
      const r = await o.telecharger()
      if (r.statut < 200 || r.statut > 299 || r.corps === null) echec = `HTTP ${r.statut}`
      else if ((publiee = lireVersionPubliee(r.corps)) === null) echec = "réponse inattendue"
    } catch {
      echec = "sans réponse"
    }
    const garde = echec === null ? publiee : cache?.publiee ?? null
    try { o.ecrireCache(JSON.stringify({ verifie: o.maintenant, publiee: garde })) } catch { /* contrôle refait à la prochaine ouverture */ }
    if (echec !== null) {
      try { await o.noter(`version en ligne : non lue (${echec}).`) } catch { /* journal indisponible */ }
    }
    return plusRecente(o.installee, garde)
  } catch {
    return null
  }
}

// La version plus récente sue de cette exécution, que la feuille Réglages lit et suit.
let connue: NouvelleVersion | null = null
const ecoutes = new Set<() => void>()

/** La version plus récente sue (null : aucune, ou pas encore). */
export function nouvelleVersionConnue(): NouvelleVersion | null {
  return connue
}

/** Fait savoir la version plus récente (null : aucune) ; chaque écoute est prévenue. */
export function annoncerNouvelleVersion(v: NouvelleVersion | null): void {
  connue = v
  for (const f of [...ecoutes]) {
    try { f() } catch { /* une écoute en panne n'arrête pas les autres */ }
  }
}

/** Écoute les annonces ; rend de quoi arrêter d'écouter. */
export function ecouterNouvelleVersion(f: () => void): () => void {
  ecoutes.add(f)
  return () => { ecoutes.delete(f) }
}

/** Textes de la section « Nouvelle version » de la feuille Réglages des stats. */
export const TITRE_MISE_A_JOUR = "Nouvelle version"
export const BOUTON_MISE_A_JOUR = "Mettre à jour ValShop"
export const NOTE_MISE_A_JOUR = "Scripting importe la nouvelle version depuis le même lien. Ne supprime pas l'ancien ValShop avant : ta clé et ta session Riot sont rangées avec lui."
export const REFUS_MISE_A_JOUR = "Import pas lancé : réessaie, ou touche de nouveau ton lien d'installation."

/** La phrase de la section : la version publiée et celle installée. */
export function phraseMiseAJour(v: NouvelleVersion): string {
  return `ValShop ${v.version} est disponible (tu as la ${v.installee}).`
}
