// La position des carrousels (lot 3 de l'étude des widgets) : quelle vue chaque carrousel montre. Part pure : elle tourne sous
// `node --test`. widget-carrousel.json (contrat-donnees.md) : `{ "v": 1, "positions": { "1m": { "i": 4, "t": 1795000000000 } } }`,
// une entrée par carrousel (numéro du widget et taille), écrite par l'appui sur un bord du widget seulement. `i` : un compteur
// de vues, jamais ramené au nombre de vues (le widget le fait, lui qui connaît la liste) ; `t` : l'heure de l'appui.
// Au rythme d'iOS, le carrousel avance d'une vue par quart d'heure depuis le dernier appui (sans appui : depuis une origine
// fixe) ; iOS ne redessine un widget que quelques fois par heure : la vue montrée est celle de l'heure du dessin.

/** Le temps passé sur une vue, au rythme d'iOS. */
export const PAS_MS = 15 * 60_000

export type Position = { i: number; t: number }
export type Positions = Record<string, Position>


export function clePosition(numero: number, taille: string): string {
  return `${numero}${taille}`
}

/** Les positions d'après le texte de widget-carrousel.json, lues strictement. */
export function lirePositions(texte: string | null | undefined): Positions {
  const lues: Positions = {}
  if (!texte) return lues
  let lu: unknown
  try {
    lu = JSON.parse(texte)
  } catch {
    return lues
  }
  const p = typeof lu === "object" && lu !== null && (lu as { v?: unknown }).v === 1 ? (lu as { positions?: unknown }).positions : null
  if (typeof p !== "object" || p === null || Array.isArray(p)) return lues
  for (const [cle, x] of Object.entries(p as Record<string, unknown>)) {
    if (!/^[1-9][smlx]$/.test(cle) || typeof x !== "object" || x === null) continue
    const { i, t } = x as { i?: unknown; t?: unknown }
    if (typeof i === "number" && Number.isSafeInteger(i) && typeof t === "number" && Number.isFinite(t) && t >= 0) lues[cle] = { i, t }
  }
  return lues
}

/** Contenu de widget-carrousel.json. */
export function contenuPositions(p: Positions): string {
  return JSON.stringify({ v: 1, positions: p })
}

/**
 * Le compteur de vues à cet instant : celui du dernier appui, plus un par quart d'heure écoulé si le carrousel avance seul.
 * Le widget le donne au bouton de ses bords : l'appui part ainsi de la vue affichée, même si iOS n'a pas redessiné le widget
 * depuis longtemps.
 */
export function compteur(p: Position | undefined, maintenant: number, seul: boolean): number {
  const depuis = p && p.t <= maintenant ? p.t : 0
  return (p?.i ?? 0) + (seul ? Math.floor((maintenant - depuis) / PAS_MS) : 0)
}

/** L'index, de 0 à `nombre` - 1, de la vue d'un compteur. */
export function indexDe(compte: number, nombre: number): number {
  if (nombre <= 0) return 0
  return ((compte % nombre) + nombre) % nombre
}

/** L'index de la vue montrée, de 0 à `nombre` - 1. `seul` : le carrousel avance au rythme d'iOS. */
export function indexMontre(p: Position | undefined, nombre: number, maintenant: number, seul: boolean): number {
  return indexDe(compteur(p, maintenant, seul), nombre)
}

/**
 * La position après un appui sur un bord : la vue d'après (`sens` 1) ou d'avant (-1) celle que le widget affichait (`affiche`,
 * le compteur de son dernier dessin), tenue un quart d'heure.
 */
export function apresAppui(affiche: number, sens: -1 | 1, maintenant: number): Position {
  return { i: affiche + sens, t: maintenant }
}

/** L'instant du prochain changement de vue d'un carrousel qui avance seul. */
export function prochainPas(p: Position | undefined, maintenant: number): number {
  const depuis = p && p.t <= maintenant ? p.t : 0
  return depuis + (Math.floor((maintenant - depuis) / PAS_MS) + 1) * PAS_MS
}
