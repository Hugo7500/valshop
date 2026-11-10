// Ressources des stats (entrée 9) : ce que les écrans des stats dessinent hors réseau, rangé dans
// catalog.json à côté de `agents` par Mettre à jour, une fois par version du jeu : le plan de chaque
// carte (`cartes` : image, coefficients d'affichage et callouts de `/v1/maps`), le nom, l'emblème et
// la couleur de chaque palier de rang (`paliers` : dernière table de
// `/v1/competitivetiers?language=fr-FR`), la catégorie et le prix de chaque arme (`armes` :
// `/v1/weapons`), et la version du jeu sous laquelle chacune a été rangée (`ressources`). Ici : les
// réponses de valorant-api mises en sections, avec les images qu'elles citent ; les sections à
// relire ; le nom de l'image d'une carte, tiré de ses coefficients (empreinteCoefficients) ; la
// lecture tolérante des trois sections, pour les écrans (lireRessources). Les images se rangent sous
// `icons/`, à leur taille d'origine, et chaque section les cite par un chemin relatif au dossier du
// groupe d'apps (`icons/<uuid>-<empreinte>.png`), ce dossier pouvant changer à une restauration.
//
// Module pur : aucun import de « scripting », aucune lecture de fichier, ni réseau, ni horloge,
// seulement des types effaçables, pour tourner tel quel sous `node --test` (spike-s0/tests/). Les
// requêtes, les images et l'écriture de catalog.json restent le travail de collecte.ts et de
// stockage.ts.

// ─────────────────────────── formes ───────────────────────────

/** Une section des ressources des stats ; ticket 4.52 : `capacites` (noms des capacités) et `saisons` (dates des actes). */
export type NomRessource = "cartes" | "paliers" | "armes" | "capacites" | "saisons"

/** Les sections des ressources des stats, dans l'ordre où la collecte les relit. */
export const SECTIONS_RESSOURCES: readonly NomRessource[] = ["cartes", "paliers", "armes", "capacites", "saisons"]

/** Un callout de carte : sa zone et sa région (« Main », « A » : « A Main »), sa position en coordonnées du jeu. */
export type Callout = { regionName: string; superRegionName: string; x: number; y: number }

/**
 * Une carte à coefficients : son image (`icons/<uuid>-<empreinte de ses coefficients>.png`, null si valorant-api n'en a
 * pas), ses coefficients d'affichage et ses callouts, noms de valorant-api gardés. Sa formule échange x et y : sur
 * l'image, à la fraction (u, v) de sa largeur et de sa hauteur, u = y × xMultiplier + xScalarToAdd et
 * v = x × yMultiplier + yScalarToAdd.
 */
export type Carte = {
  image: string | null
  xMultiplier: number
  yMultiplier: number
  xScalarToAdd: number
  yScalarToAdd: number
  callouts: Callout[]
}
/** `cartes` : UUID de la carte (`metadata.map.id` de HenrikDev, en minuscules) → sa carte ; null : carte sans coefficients, sans image. */
export type SectionCartes = Record<string, Carte | null>





export type Palier = { nom: string | null; couleur: string | null; embleme: string | null }

export type SectionPaliers = Record<string, Palier>

/** Une arme : sa catégorie (fin de `category` : « Rifle », « Sidearm »…) et son prix en crédits (null au couteau) ; null : inconnu. */
export type Arme = { categorie: string | null; prix: number | null }
/** `armes` : UUID de l'arme (`economy.weapon.id`, `kills[].weapon.id` de HenrikDev, en minuscules) → son arme. */
export type SectionArmes = Record<string, Arme>

/**
 * Ticket 4.52 : les noms fr-FR des capacités d'un agent, par touche, tirés de l'emplacement que valorant-api donne à chacune
 * (`Grenade` → C, `Ability1` → Q, `Ability2` → E, `Ultimate` → X : les noms d'emplacement des comptes de Riot, `grenade`,
 * `ability1`, `ability2`, `ultimate`) ; null : emplacement absent, sans nom ou en double.
 */
export type NomsCapacites = { c: string | null; q: string | null; e: string | null; x: string | null }
/** `capacites` : UUID de l'agent (`players[].agent.id` de HenrikDev, en minuscules) → ses noms de capacités. */
export type SectionCapacites = Record<string, NomsCapacites>

/** Ticket 4.52 : un acte de `/v1/seasons` : son début et sa fin, instants ISO de valorant-api, tels quels. */
export type DatesActe = { debut: string; fin: string }
/** `saisons` : UUID de l'acte (`season.id` de HenrikDev, en minuscules) → ses dates. */
export type SectionSaisons = Record<string, DatesActe>

/** `ressources` : la version du jeu (`riotClientVersion`) sous laquelle chaque section a été rangée ; null : version inconnue. */
export type VersionsRessources = Partial<Record<NomRessource, string | null>>

/** Les sections, telles que les écrans les lisent (lireRessources) ; `capacites` et `saisons` (4.52) : absentes d'un appelant d'avant. */
export type Ressources = { cartes: SectionCartes; paliers: SectionPaliers; armes: SectionArmes; capacites?: SectionCapacites; saisons?: SectionSaisons }

/** Une image qu'une section cite : son chemin relatif (`icons/…png`) et son adresse chez valorant-api ; présente, gardée, jamais retéléchargée. */
export type ImageRessource = { chemin: string; adresse: string }

/** Une section tirée d'une réponse de valorant-api, et les images qu'elle cite, sans doublon. */
export type SectionLue<S> = { section: S; images: ImageRessource[] }

// ─────────────────────────── aides de lecture ───────────────────────────

/** Un objet JSON (ni null, ni tableau) ? */
function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLE_PALIER = /^(0|[1-9][0-9]?)$/
/** Le chemin d'une image rangée : `icons/<nom>.png`, un seul segment fait de chiffres, de lettres et de tirets. */
const CHEMIN_IMAGE = /^icons\/[0-9a-z][0-9a-z-]*\.png$/i
const COULEUR = /^#[0-9a-f]{6}$/i

/** Une chaîne non vide, ou null. */
function texte(x: unknown): string | null {
  return typeof x === "string" && x !== "" ? x : null
}

/** Un nombre fini, ou null. */
function nombre(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null
}

/**
 * Ticket 7.8 (F3) : une image distante admise, https sur media.valorant-api.com seulement : la règle d'imageAdmise de
 * securite.ts, recopiée (ce module n'importe rien, pour tourner tel quel sous node ; un test vérifie l'égalité).
 */
export function imageRessourceAdmise(x: unknown): x is string {
  return typeof x === "string" && /^https:\/\/media\.valorant-api\.com\/[A-Za-z0-9._~%\/-]+$/.test(x) && !/\.\.|%2e/i.test(x)
}

/** L'adresse d'une image : une chaîne `https://` sans blanc, sur media.valorant-api.com (imageRessourceAdmise) ; sinon null, « pas d'adresse ». */
function adresseImage(x: unknown): string | null {
  return typeof x === "string" && /^https:\/\/\S+$/.test(x) && imageRessourceAdmise(x) ? x : null
}

/** `#rrggbb` : les six premiers caractères d'une couleur RRGGBBAA de valorant-api ; null s'ils ne sont pas hexadécimaux. */
function couleurDe(x: unknown): string | null {
  return typeof x === "string" && /^[0-9a-f]{6}/i.test(x) ? "#" + x.slice(0, 6) : null
}

/** La fin d'une catégorie d'arme (`EEquippableCategory::Rifle` → « Rifle ») ; null si elle ne se lit pas. */
function categorieDe(x: unknown): string | null {
  if (typeof x !== "string") return null
  const i = x.lastIndexOf("::")
  return texte(i >= 0 ? x.slice(i + 2) : x)
}

/** Un prix en crédits : un nombre fini, positif ou nul (le Classic est gratuit) ; null sinon. */
function prixDe(x: unknown): number | null {
  const n = nombre(x)
  return n !== null && n >= 0 ? n : null
}

/** Les coefficients d'affichage d'une carte : quatre nombres finis, multiplicateurs non nuls ; null : carte sans coefficients (valorant-api les met à 0). */
function coefficientsDe(m: Record<string, any>): Omit<Carte, "image" | "callouts"> | null {
  const xMultiplier = nombre(m.xMultiplier), yMultiplier = nombre(m.yMultiplier)
  const xScalarToAdd = nombre(m.xScalarToAdd), yScalarToAdd = nombre(m.yScalarToAdd)
  if (xMultiplier === null || yMultiplier === null || xScalarToAdd === null || yScalarToAdd === null) return null
  if (xMultiplier === 0 || yMultiplier === 0) return null
  return { xMultiplier, yMultiplier, xScalarToAdd, yScalarToAdd }
}

/** Un callout lu : de valorant-api (`location.x`, `.y`) ou de catalog.json (`x`, `y` à plat) ; null s'il lui manque un nom ou une coordonnée. */
function calloutLu(c: unknown, aPlat: boolean): Callout | null {
  if (!estObjet(c)) return null
  const lieu = aPlat ? c : c.location
  if (!estObjet(lieu)) return null
  const regionName = texte(c.regionName), superRegionName = texte(c.superRegionName)
  const x = nombre(lieu.x), y = nombre(lieu.y)
  return regionName !== null && superRegionName !== null && x !== null && y !== null ? { regionName, superRegionName, x, y } : null
}

/** Les callouts lus d'un tableau, chacun abîmé passé ; une autre valeur : aucun. */
function calloutsLus(x: unknown, aPlat: boolean): Callout[] {
  if (!Array.isArray(x)) return []
  const r: Callout[] = []
  for (const c of x) {
    const lu = calloutLu(c, aPlat)
    if (lu) r.push(lu)
  }
  return r
}

/**
 * L'empreinte des coefficients d'une carte, dans le nom de son image : huit chiffres hexadécimaux, le FNV-1a 32 bits du
 * texte de ses quatre coefficients (`String`, séparés par « | »). Une carte retravaillée (autres coefficients) a donc une
 * autre image, sous un autre nom : téléchargée à côté de l'ancienne, que la section gardée cite, avec ses coefficients,
 * jusqu'à ce que la nouvelle section soit rangée ; jamais une image remplacée sous une section qui la cite.
 */
export function empreinteCoefficients(c: Omit<Carte, "image" | "callouts">): string {
  const texte = [c.xMultiplier, c.yMultiplier, c.xScalarToAdd, c.yScalarToAdd].map(String).join("|")
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, "0")
}

// ─────────────────────────── réponses de valorant-api ───────────────────────────

/**
 * La section `cartes` tirée de `/v1/maps` (`{ data: [{ uuid, displayIcon, xMultiplier, yMultiplier, xScalarToAdd,
 * yScalarToAdd, callouts: [{ regionName, superRegionName, location: { x, y } }] }] }`) : chaque carte à coefficients,
 * son image citée sous `icons/<uuid>-<empreinte de ses coefficients>.png` si elle a une adresse (`displayIcon`, l'image
 * du plan, que la formule des coefficients vise), ses callouts sans un abîmé ; chaque carte sans coefficients (Range,
 * deathmatch, escarmouche : valorant-api les met à 0) à null, sans image. Une carte sans UUID est passée. null si la
 * réponse n'a pas cette forme ou ne donne aucune carte à coefficients : réponse inattendue, rien à ranger.
 */
export function cartesDeValorantApi(reponse: unknown): SectionLue<SectionCartes> | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data)) return null
  const section: SectionCartes = {}
  const adresses = new Map<string, string>()
  for (const m of reponse.data) {
    if (!estObjet(m) || typeof m.uuid !== "string" || !UUID.test(m.uuid)) continue
    const uuid = m.uuid.toLowerCase()
    const coefficients = coefficientsDe(m)
    adresses.delete(uuid)
    if (!coefficients) {
      section[uuid] = null
      continue
    }
    const adresse = adresseImage(m.displayIcon)
    section[uuid] = { image: adresse ? `icons/${uuid}-${empreinteCoefficients(coefficients)}.png` : null, ...coefficients, callouts: calloutsLus(m.callouts, false) }
    if (adresse) adresses.set(uuid, adresse)
  }
  const images: ImageRessource[] = []
  for (const [uuid, carte] of Object.entries(section)) {
    const adresse = adresses.get(uuid)
    if (carte && carte.image && adresse) images.push({ chemin: carte.image, adresse })
  }
  return Object.values(section).some((c) => c !== null) ? { section, images } : null
}

/**
 * La section `paliers` tirée de la dernière table de `/v1/competitivetiers?language=fr-FR` (`{ data: [{ uuid, tiers:
 * [{ tier, tierName, color, largeIcon, smallIcon }] }] }`, la table de l'épisode en cours, celle des `tier.id` de
 * HenrikDev) : chaque palier par son numéro, son nom fr-FR, sa couleur, son emblème cité sous
 * `icons/<uuid de table>-<palier>.png` s'il a une adresse (`largeIcon`, sinon `smallIcon`). Un palier sans numéro
 * entier de 0 à 99 est passé. null si la réponse n'a pas cette forme (dernière table sans UUID ni paliers) ou ne donne
 * aucun palier : réponse inattendue. Jamais une table plus ancienne, dont les numéros diffèrent.
 */
export function paliersDeValorantApi(reponse: unknown): SectionLue<SectionPaliers> | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data) || reponse.data.length === 0) return null
  const table = reponse.data[reponse.data.length - 1]
  if (!estObjet(table) || typeof table.uuid !== "string" || !UUID.test(table.uuid) || !Array.isArray(table.tiers)) return null
  const t = table.uuid.toLowerCase()
  const section: SectionPaliers = {}
  const adresses = new Map<string, string>()
  for (const p of table.tiers) {
    if (!estObjet(p) || typeof p.tier !== "number" || !Number.isInteger(p.tier) || p.tier < 0 || p.tier > 99) continue
    const cle = String(p.tier)
    const adresse = adresseImage(p.largeIcon) ?? adresseImage(p.smallIcon)
    section[cle] = { nom: texte(p.tierName), couleur: couleurDe(p.color), embleme: adresse ? `icons/${t}-${cle}.png` : null }
    if (adresse) adresses.set(cle, adresse)
    else adresses.delete(cle)
  }
  const images: ImageRessource[] = []
  for (const [cle, palier] of Object.entries(section)) {
    const adresse = adresses.get(cle)
    if (palier.embleme && adresse) images.push({ chemin: palier.embleme, adresse })
  }
  return Object.keys(section).length > 0 ? { section, images } : null
}

/**
 * La section `armes` tirée de `/v1/weapons` (`{ data: [{ uuid, category, shopData: { cost } }] }`, libellés anglais
 * de valorant-api, sa langue par défaut) : chaque arme, sa catégorie (fin de `category`) et son prix (`shopData.cost`,
 * null au couteau, sans `shopData`). Une arme sans UUID est passée ; aucune image. null si la réponse n'a pas cette
 * forme ou ne donne aucune arme : réponse inattendue.
 */
export function armesDeValorantApi(reponse: unknown): SectionLue<SectionArmes> | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data)) return null
  const section: SectionArmes = {}
  for (const a of reponse.data) {
    if (!estObjet(a) || typeof a.uuid !== "string" || !UUID.test(a.uuid)) continue
    section[a.uuid.toLowerCase()] = { categorie: categorieDe(a.category), prix: estObjet(a.shopData) ? prixDe(a.shopData.cost) : null }
  }
  return Object.keys(section).length > 0 ? { section, images: [] } : null
}

/** Touche de chaque emplacement de valorant-api (ticket 4.52). */
const TOUCHE_D_EMPLACEMENT: Readonly<Record<string, keyof NomsCapacites>> = { Grenade: "c", Ability1: "q", Ability2: "e", Ultimate: "x" }

/**
 * Ticket 4.52 : la section `capacites` tirée de `/v1/agents?isPlayableCharacter=true&language=fr-FR` (`{ data: [{ uuid,
 * isPlayableCharacter, abilities: [{ slot, displayName }] }] }`) : chaque agent jouable, le nom de chaque capacité par sa touche
 * (TOUCHE_D_EMPLACEMENT ; `Passive` et tout autre emplacement passés ; un emplacement en double : null, on ne sait lequel).
 * Un agent sans UUID, non jouable ou sans aucun nom est passé ; aucune image. null si la réponse n'a pas cette forme ou ne donne
 * aucun agent : réponse inattendue.
 */
export function capacitesDeValorantApi(reponse: unknown): SectionLue<SectionCapacites> | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data)) return null
  const section: SectionCapacites = {}
  for (const a of reponse.data) {
    if (!estObjet(a) || a.isPlayableCharacter === false || typeof a.uuid !== "string" || !UUID.test(a.uuid) || !Array.isArray(a.abilities)) continue
    const noms: NomsCapacites = { c: null, q: null, e: null, x: null }
    const vus = new Map<keyof NomsCapacites, number>()
    for (const b of a.abilities) {
      const touche = estObjet(b) && typeof b.slot === "string" ? TOUCHE_D_EMPLACEMENT[b.slot] : undefined
      if (touche === undefined) continue
      vus.set(touche, (vus.get(touche) ?? 0) + 1)
      noms[touche] = texte(b.displayName)
    }
    for (const [touche, n] of vus) if (n > 1) noms[touche] = null
    if (Object.values(noms).some((x) => x !== null)) section[a.uuid.toLowerCase()] = noms
  }
  return Object.keys(section).length > 0 ? { section, images: [] } : null
}

/** Un instant ISO 8601 qui se lit, tel quel ; null sinon. */
function instantIso(x: unknown): string | null {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x) && !Number.isNaN(Date.parse(x)) ? x : null
}

/**
 * Ticket 4.52 : la section `saisons` tirée de `/v1/seasons` (`{ data: [{ uuid, type, startTime, endTime }] }`) : chaque acte
 * (`type` « EAresSeasonType::Act » ; les épisodes, sans type, passés), son début et sa fin tels quels, la fin après le début.
 * null si la réponse n'a pas cette forme ou ne donne aucun acte : réponse inattendue.
 */
export function saisonsDeValorantApi(reponse: unknown): SectionLue<SectionSaisons> | null {
  if (!estObjet(reponse) || !Array.isArray(reponse.data)) return null
  const section: SectionSaisons = {}
  for (const x of reponse.data) {
    if (!estObjet(x) || typeof x.uuid !== "string" || !UUID.test(x.uuid) || x.type !== "EAresSeasonType::Act") continue
    const debut = instantIso(x.startTime), fin = instantIso(x.endTime)
    if (debut !== null && fin !== null && Date.parse(fin) > Date.parse(debut)) section[x.uuid.toLowerCase()] = { debut, fin }
  }
  return Object.keys(section).length > 0 ? { section, images: [] } : null
}

/** La section `nom` tirée de la réponse de valorant-api qui la donne. */
export function sectionDeValorantApi(
  nom: NomRessource, reponse: unknown,
): SectionLue<SectionCartes | SectionPaliers | SectionArmes | SectionCapacites | SectionSaisons> | null {
  if (nom === "cartes") return cartesDeValorantApi(reponse)
  if (nom === "capacites") return capacitesDeValorantApi(reponse)
  if (nom === "saisons") return saisonsDeValorantApi(reponse)
  return nom === "paliers" ? paliersDeValorantApi(reponse) : armesDeValorantApi(reponse)
}

/** La section avec null pour chaque image que valorant-api n'a pas donnée (statut hors 2xx) : `image` d'une carte, `embleme` d'un palier. */
export function sansImages<S extends Record<string, unknown>>(section: S, absentes: ReadonlySet<string>): S {
  if (absentes.size === 0) return section
  const r: Record<string, unknown> = {}
  for (const [cle, v] of Object.entries(section)) {
    if (estObjet(v) && typeof v.image === "string" && absentes.has(v.image)) r[cle] = { ...v, image: null }
    else if (estObjet(v) && typeof v.embleme === "string" && absentes.has(v.embleme)) r[cle] = { ...v, embleme: null }
    else r[cle] = v
  }
  return r as S
}

// ─────────────────────────── version et sections à relire ───────────────────────────

/** La version du jeu lue sur place : `version` de shop.json, sinon de catalog.json (contenus déjà lus) ; null : inconnue. */
export function versionDuJeu(boutique: unknown, catalogue: unknown): string | null {
  for (const x of [boutique, catalogue]) {
    if (estObjet(x) && typeof x.version === "string" && x.version !== "") return x.version
  }
  return null
}

/**
 * Les sections à relire sur valorant-api, d'après catalog.json (son contenu déjà lu, un objet ; absent : `{}`) : une
 * section absente ou illisible (pas un objet) ; et, la version du jeu connue, une section rangée sous une autre version
 * (autre version, null, ou `ressources` illisible). Version inconnue : les sections absentes ou illisibles seulement.
 * Vide : tout est à jour, aucune requête.
 */
export function sectionsARelire(catalogue: unknown, version: string | null): NomRessource[] {
  const c = estObjet(catalogue) ? catalogue : {}
  const versions = estObjet(c.ressources) ? c.ressources : {}
  return SECTIONS_RESSOURCES.filter((nom) => !estObjet(c[nom]) || (version !== null && versions[nom] !== version))
}

// ─────────────────────────── lecture pour les écrans ───────────────────────────

/** Le chemin d'une image rangée, ou null ; undefined si la valeur n'est ni l'un ni l'autre (entrée abîmée). */
function cheminLu(x: unknown): string | null | undefined {
  if (x === null) return null
  return typeof x === "string" && CHEMIN_IMAGE.test(x) ? x : undefined
}

/** Une carte de catalog.json : image (chemin sûr ou null), quatre coefficients finis aux multiplicateurs non nuls, callouts (un abîmé passé) ; null si elle n'a pas cette forme. */
function carteLue(v: unknown): Carte | null {
  if (!estObjet(v) || !Array.isArray(v.callouts)) return null
  const image = cheminLu(v.image)
  const coefficients = coefficientsDe(v)
  if (image === undefined || !coefficients) return null
  return { image, ...coefficients, callouts: calloutsLus(v.callouts, true) }
}

/** Un palier de catalog.json : nom (chaîne non vide ou null), couleur `#rrggbb` ou null, emblème (chemin sûr ou null) ; null sinon. */
function palierLu(v: unknown): Palier | null {
  if (!estObjet(v)) return null
  const embleme = cheminLu(v.embleme)
  const nom = v.nom === null ? null : texte(v.nom)
  const couleur = v.couleur === null ? null : typeof v.couleur === "string" && COULEUR.test(v.couleur) ? v.couleur : undefined
  if (embleme === undefined || couleur === undefined || (nom === null && v.nom !== null)) return null
  return { nom, couleur, embleme }
}

/** Une arme de catalog.json : catégorie (chaîne non vide ou null), prix (nombre fini positif ou nul, ou null) ; null sinon. */
function armeLue(v: unknown): Arme | null {
  if (!estObjet(v)) return null
  const categorie = v.categorie === null ? null : texte(v.categorie)
  const prix = v.prix === null ? null : prixDe(v.prix)
  if ((categorie === null && v.categorie !== null) || (prix === null && v.prix !== null)) return null
  return { categorie, prix }
}

/** Ticket 4.52 : des noms de capacités de catalog.json : quatre touches, chacune un nom non vide ou null ; null sinon. */
function nomsLus(v: unknown): NomsCapacites | null {
  if (!estObjet(v)) return null
  const r: NomsCapacites = { c: null, q: null, e: null, x: null }
  for (const k of ["c", "q", "e", "x"] as const) {
    if (v[k] === null || v[k] === undefined) continue
    const t = texte(v[k])
    if (t === null) return null
    r[k] = t
  }
  return r
}

/** Ticket 4.52 : des dates d'acte de catalog.json : deux instants ISO, la fin après le début ; null sinon. */
function datesLues(v: unknown): DatesActe | null {
  if (!estObjet(v)) return null
  const debut = instantIso(v.debut), fin = instantIso(v.fin)
  return debut !== null && fin !== null && Date.parse(fin) > Date.parse(debut) ? { debut, fin } : null
}

/**
 * Les sections des ressources des stats, lues d'un catalog.json déjà lu (`catalogue`, valeur JSON quelconque),
 * sans fichier ni réseau, pour les écrans : chaque section typée, toute entrée abîmée passée (clé qui n'est ni un UUID
 * ni un numéro de palier, valeur d'une autre forme, image hors de `icons/`), chaque callout abîmé aussi ; une section
 * absente ou illisible : vide. Clés des cartes et des armes en minuscules, comme les identifiants de HenrikDev. Rien de
 * ce qui est rendu ne partage d'objet avec `catalogue`.
 */
export function lireRessources(catalogue: unknown): Ressources {
  const c = estObjet(catalogue) ? catalogue : {}
  const cartes: SectionCartes = {}
  if (estObjet(c.cartes)) {
    for (const [id, v] of Object.entries(c.cartes)) {
      if (!UUID.test(id)) continue
      if (v === null) cartes[id.toLowerCase()] = null
      else {
        const carte = carteLue(v)
        if (carte) cartes[id.toLowerCase()] = carte
      }
    }
  }
  const paliers: SectionPaliers = {}
  if (estObjet(c.paliers)) {
    for (const [cle, v] of Object.entries(c.paliers)) {
      const palier = CLE_PALIER.test(cle) ? palierLu(v) : null
      if (palier) paliers[cle] = palier
    }
  }
  const armes: SectionArmes = {}
  if (estObjet(c.armes)) {
    for (const [id, v] of Object.entries(c.armes)) {
      const arme = UUID.test(id) ? armeLue(v) : null
      if (arme) armes[id.toLowerCase()] = arme
    }
  }
  const capacites: SectionCapacites = {}
  if (estObjet(c.capacites)) {
    for (const [id, v] of Object.entries(c.capacites)) {
      const noms = UUID.test(id) ? nomsLus(v) : null
      if (noms) capacites[id.toLowerCase()] = noms
    }
  }
  const saisons: SectionSaisons = {}
  if (estObjet(c.saisons)) {
    for (const [id, v] of Object.entries(c.saisons)) {
      const dates = UUID.test(id) ? datesLues(v) : null
      if (dates) saisons[id.toLowerCase()] = dates
    }
  }
  return { cartes, paliers, armes, capacites, saisons }
}
