// Liste de souhaits : le catalogue au format du contrat (chaque niveau de skin relié
// à son skin et à son arme ; niveaux, variantes et vidéos de chaque skin pour sa fiche,
// lue par fiches.ts), la recherche par nom dans ce catalogue, et le contenu de
// wishlist.json ; les alertes de la liste (alertes.ts) en reprennent les types.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, seulement
// des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/).
// Interroger valorant-api, tenir catalog.json à jour et lire wishlist.json pour les
// alertes reste le travail de valshop.ts ; lire catalog.json, lire et écrire
// wishlist.json, celui de l'écran de liste (vue.tsx).

/** Nombre de résultats d'une recherche, au plus, armes et skins ensemble. */
export const LIMITE_RECHERCHE = 50

/**
 * Niveau de skin : nom, image et couleur de rareté pour le widget, uuid de son skin et de son
 * arme ; adresse de sa vidéo pour la fiche du skin (CAP-25), null s'il n'en a pas.
 */
export type Niveau = {
  name: string; icon: string | null; color: string | null; skin: string; weapon: string; streamedVideo: string | null
}
/**
 * Variante d'un skin (une « chroma » de valorant-api), pour sa fiche (CAP-25) : libellé fr-FR
 * tel quel (parfois sur deux lignes), grande image, pastille et vidéo, adresses telles que
 * reçues, null si absentes.
 */
export type Variante = {
  id: string; name: string; fullRender: string | null; swatch: string | null; streamedVideo: string | null
}
/**
 * Skin : libellé fr-FR et uuid de son arme ; pour sa fiche (CAP-25), ses niveaux (uuid) et ses
 * variantes dans l'ordre de valorant-api, la première de base ; pour le Catalogue (ticket 8.4), son
 * palier (`tier`, uuid de `contentTierUuid`, l'édition) et son thème (`theme`, uuid de `themeUuid`, la
 * collection), null s'ils manquent.
 */
export type Skin = {
  name: string; weapon: string; levels: string[]; chromas: Variante[]; tier: string | null; theme: string | null
}
/** Arme : libellé fr-FR. */
export type Arme = { name: string }
/** Palier de contenu (édition, ticket 8.4) : libellé fr-FR (« Édition Premium »), rang (0 à 4), couleur « #rrggbb ». */
export type Palier = { name: string; rank: number | null; color: string | null }
/** Thème (collection, ticket 8.4) : libellé fr-FR ; plusieurs thèmes portent parfois le même nom. */
export type Theme = { name: string }
/**
 * Sections `levels`, `skins` et `weapons` de catalog.json (contrat-donnees.md), tirées de `/v1/weapons`, et
 * `tiers` et `themes` (ticket 8.4), tirées de `/v1/contenttiers` et `/v1/themes`.
 */
export type SectionsArmes = {
  levels: Record<string, Niveau>
  skins: Record<string, Skin>
  weapons: Record<string, Arme>
  tiers: Record<string, Palier>
  themes: Record<string, Theme>
}

/** Entrée de wishlist.json : un skin précis ou une arme entière, par uuid, avec son libellé fr-FR. */
export type Souhait = { kind: "skin" | "weapon"; id: string; name: string }

// ─────────────────────────── lecture défensive ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

/** Propriété d'une valeur inconnue ; undefined si ce n'est pas un objet. */
function champ(x: unknown, nom: string): unknown {
  return estObjet(x) ? x[nom] : undefined
}

/** Une chaîne non vide, ou null. */
function chaine(x: unknown): string | null {
  return typeof x === "string" && x.length > 0 ? x : null
}

/** Un tableau tel quel ; toute autre valeur donne un tableau vide. */
function tableau(x: unknown): unknown[] {
  return Array.isArray(x) ? x : []
}

/**
 * Forme comparable d'un texte, sans casse ni accents : « Vandál » → « vandal ». Toutes
 * les apostrophes deviennent « ' » (l'iPhone tape « ’ » par défaut) ; ligatures et
 * lettres barrées sont épelées : « œ » → « oe », « æ » → « ae », « ø » → « o », « ß » → « ss ».
 */
export function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'") // ‘ ’ ʼ `
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/ß/g, "ss")
}

// ─────────────────────────── catalogue ───────────────────────────

/**
 * Construit `levels`, `skins` et `weapons` à partir du `data` de
 * `/v1/weapons?language=fr-FR` (armes → `skins[]` → `levels[]`) et de celui de
 * `/v1/contenttiers` (`uuid` → `highlightColor` en RRGGBBAA, six premiers
 * caractères gardés). Un niveau prend le nom et l'image de son skin quand il n'en
 * a pas, et la couleur de rareté de son skin (null si inconnue). Pour la fiche d'un
 * skin (CAP-25), de la même réponse : la vidéo de chaque niveau, et pour chaque skin
 * ses niveaux et ses variantes (`chromas[]` : grande image, pastille, vidéo) dans
 * l'ordre de valorant-api ; une variante sans nom prend celui du skin. `levels` et
 * `chromas` d'un skin sont toujours des tableaux, même vides : un skin sans eux est
 * celui d'un catalogue d'avant CAP-25 (catalogueAReconstruire). Pour le Catalogue
 * (ticket 8.4) : `tier` et `theme` de chaque skin (toujours écrits, null s'ils
 * manquent), `tiers` (libellé, rang et couleur de chaque palier, de `paliers`) et
 * `themes` (libellé de chaque thème, du `data` de `/v1/themes?language=fr-FR`,
 * vide sans lui). Un objet sans uuid est ignoré ; une entrée absente ou inattendue
 * donne des sections vides, jamais une erreur.
 */
export function construireCatalogue(armesApi: unknown, paliers: unknown, themesApi?: unknown): SectionsArmes {
  const couleurs = new Map<string, string>()
  const tiers: Record<string, Palier> = {}
  for (const p of tableau(paliers)) {
    const id = chaine(champ(p, "uuid"))
    if (!id) continue
    const couleur = chaine(champ(p, "highlightColor"))
    if (couleur) couleurs.set(id, "#" + couleur.slice(0, 6))
    const rang = champ(p, "rank")
    tiers[id] = {
      name: chaine(champ(p, "displayName")) ?? chaine(champ(p, "devName")) ?? id,
      rank: typeof rang === "number" && Number.isFinite(rang) ? rang : null,
      color: couleur ? "#" + couleur.slice(0, 6) : null,
    }
  }
  const themes: Record<string, Theme> = {}
  for (const t of tableau(themesApi)) {
    const id = chaine(champ(t, "uuid"))
    if (!id) continue
    themes[id] = { name: (chaine(champ(t, "displayName")) ?? id).trim() || id }
  }

  const levels: Record<string, Niveau> = {}
  const skins: Record<string, Skin> = {}
  const weapons: Record<string, Arme> = {}
  for (const a of tableau(armesApi)) {
    const arme = chaine(champ(a, "uuid"))
    if (!arme) continue
    weapons[arme] = { name: chaine(champ(a, "displayName")) ?? arme }
    for (const s of tableau(champ(a, "skins"))) {
      const skin = chaine(champ(s, "uuid"))
      if (!skin) continue
      const nom = chaine(champ(s, "displayName")) ?? skin
      const niveaux: string[] = []
      const chromas: Variante[] = []
      const palier = chaine(champ(s, "contentTierUuid"))
      skins[skin] = { name: nom, weapon: arme, levels: niveaux, chromas, tier: palier, theme: chaine(champ(s, "themeUuid")) }
      const color = palier ? couleurs.get(palier) ?? null : null
      for (const n of tableau(champ(s, "levels"))) {
        const id = chaine(champ(n, "uuid"))
        if (!id) continue
        niveaux.push(id)
        levels[id] = {
          name: chaine(champ(n, "displayName")) ?? nom,
          icon: chaine(champ(n, "displayIcon")) ?? chaine(champ(s, "displayIcon")),
          color,
          skin,
          weapon: arme,
          streamedVideo: chaine(champ(n, "streamedVideo")),
        }
      }
      for (const c of tableau(champ(s, "chromas"))) {
        const id = chaine(champ(c, "uuid"))
        if (!id) continue
        chromas.push({
          id,
          name: chaine(champ(c, "displayName")) ?? nom,
          fullRender: chaine(champ(c, "fullRender")),
          swatch: chaine(champ(c, "swatch")),
          streamedVideo: chaine(champ(c, "streamedVideo")),
        })
      }
    }
  }
  return { levels, skins, weapons, tiers, themes }
}

/**
 * Catalogue d'un format antérieur, ou absent ? Vrai si ce n'est pas un objet, ou
 * si `levels`, `skins` ou `weapons` manque ou n'est pas un objet : le moteur le
 * reconstruit à la lecture suivante, et d'ici là l'écran de liste ne cherche pas.
 */
export function catalogueAncien(cat: unknown): boolean {
  return !estObjet(cat) || !estObjet(cat.levels) || !estObjet(cat.skins) || !estObjet(cat.weapons)
}

/**
 * Catalogue à reconstruire à la lecture de boutique suivante, même sous la même version :
 * ancien ou absent (catalogueAncien), d'avant CAP-25, dont un skin au moins n'a pas le
 * champ `chromas` (contrat-donnees.md), ou d'avant le Catalogue (ticket 8.4) : sections
 * `tiers` ou `themes` absentes, ou un skin sans le champ `tier` ou `theme` (null compris).
 * La liste de souhaits, elle, ne regarde que catalogueAncien : elle cherche dans un
 * catalogue d'un format antérieur en attendant sa reconstruction.
 */
export function catalogueAReconstruire(cat: unknown): boolean {
  if (catalogueAncien(cat)) return true
  const c = cat as { skins: Record<string, unknown>; tiers?: unknown; themes?: unknown }
  if (!estObjet(c.tiers) || !estObjet(c.themes)) return true
  return Object.values(c.skins).some((s) => !Array.isArray(champ(s, "chromas")) || !estObjet(s) || !("tier" in s) || !("theme" in s))
}

// ─────────────────────────── recherche ───────────────────────────

/** Ordre alphabétique français des libellés : « Élite » se range avec les « E ». */
function parNom(a: Souhait, b: Souhait): number {
  return a.name.localeCompare(b.name, "fr")
}

/**
 * Cherche `texte` dans le catalogue local, sans casse ni accents : une arme
 * correspond si son nom le contient, un skin si son nom ou celui de son arme le
 * contient. Rend les armes puis les skins, chacun trié par nom, `limite` résultats
 * en tout, sous forme d'entrées prêtes pour la liste. Texte vide, ou catalogue
 * ancien ou absent : aucun résultat.
 */
export function chercher(
  cat: unknown, texte: string, limite: number = LIMITE_RECHERCHE,
): { armes: Souhait[]; skins: Souhait[] } {
  const cle = normaliser(texte.trim())
  if (!cle || catalogueAncien(cat)) return { armes: [], skins: [] }
  const { skins, weapons } = cat as { skins: Record<string, unknown>; weapons: Record<string, unknown> }

  const nomsArmes = new Map<string, string>() // uuid de l'arme → nom normalisé
  const armes: Souhait[] = []
  for (const [id, a] of Object.entries(weapons)) {
    const nom = chaine(champ(a, "name"))
    if (!nom) continue
    const n = normaliser(nom)
    nomsArmes.set(id, n)
    if (n.includes(cle)) armes.push({ kind: "weapon", id, name: nom })
  }

  const trouves: Souhait[] = []
  for (const [id, s] of Object.entries(skins)) {
    const nom = chaine(champ(s, "name"))
    if (!nom) continue
    const arme = nomsArmes.get(chaine(champ(s, "weapon")) ?? "") ?? ""
    if (normaliser(nom).includes(cle) || arme.includes(cle)) trouves.push({ kind: "skin", id, name: nom })
  }

  armes.sort(parNom)
  trouves.sort(parNom)
  const max = Math.max(0, limite)
  const debut = armes.slice(0, max)
  return { armes: debut, skins: trouves.slice(0, max - debut.length) }
}

// ─────────────────────────── wishlist.json ───────────────────────────

/** Ce type et cet uuid sont-ils dans la liste ? ★ dans l'écran de liste, ☆ sinon. */
export function contient(liste: readonly Souhait[], kind: Souhait["kind"], id: string): boolean {
  return liste.some((e) => e.kind === kind && e.id === id)
}

/**
 * Lit le contenu de wishlist.json (`[{ kind, id, name }]`, contrat-donnees.md).
 * Absent, corrompu ou autre chose qu'un tableau : liste vide. Une entrée invalide
 * (type autre que `skin` ou `weapon`, `id` ou `name` absent ou vide) est ignorée,
 * un doublon (même type, même id) aussi, et les champs en trop sont retirés : la
 * liste rendue est propre, l'écran la réécrit telle quelle au premier changement.
 */
export function lireListe(contenu: string | null | undefined): Souhait[] {
  if (!contenu) return []
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch {
    return []
  }
  const liste: Souhait[] = []
  for (const e of tableau(brut)) {
    const kind = champ(e, "kind")
    const id = chaine(champ(e, "id"))
    const name = chaine(champ(e, "name"))
    if ((kind !== "skin" && kind !== "weapon") || !id || !name || contient(liste, kind, id)) continue
    liste.push({ kind, id, name })
  }
  return liste
}

/**
 * Ajoute l'entrée à la fin de la liste si elle n'y est pas, la retire sinon. Rend
 * une nouvelle liste, l'ancienne reste intacte (l'écran la garde si l'écriture
 * échoue) ; l'entrée ajoutée est réduite à `{ kind, id, name }`, le format du contrat.
 */
export function basculer(liste: readonly Souhait[], entree: Souhait): Souhait[] {
  return contient(liste, entree.kind, entree.id)
    ? liste.filter((e) => e.kind !== entree.kind || e.id !== entree.id)
    : [...liste, { kind: entree.kind, id: entree.id, name: entree.name }]
}
