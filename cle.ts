










/** Entrée du trousseau qui porte la clé HenrikDev. */
export const CLE_HENRIKDEV = "valshop.henrikdev"

/** Tableau de bord HenrikDev, où se crée une clé gratuite : lien de la feuille et de l'étape 2 du Premier lancement. */
export const LIEN_CLE = "https://api.henrikdev.xyz/dashboard/"

/** La clé telle qu'elle est rangée : sans aucun espace (espace, tabulation, retour à la ligne). */
export function normaliserCle(texte: string): string {
  return texte.replace(/\s+/g, "")
}

/** La clé rangée, ou null s'il n'y en a pas. */
export function lireCle(): string | null {
  return Keychain.get(CLE_HENRIKDEV) || null
}

/** Vrai si une clé est rangée. */
export function aUneCle(): boolean {
  return lireCle() !== null
}

/**
 * Range la clé, espaces retirés, à la place de la précédente. Faux sans rien écrire si
 * elle n'est faite que d'espaces ; faux aussi si le trousseau refuse l'écriture ou si,
 * relu, il ne porte pas cette clé.
 */
export function rangerCle(texte: string): boolean {
  const cle = normaliserCle(texte)
  if (!cle) return false
  // Comme les cookies (valshop.ts, saveCookies) : lisible sans interface, ce téléphone seul.
  const ecrite = Keychain.set(CLE_HENRIKDEV, cle, {
    accessibility: "first_unlock_this_device",
    synchronizable: false,
  })
  return ecrite && lireCle() === cle
}

/**
 * Issue de « Coller » : `rangee`, la clé du presse-papiers rangée (`cle`, telle que rangée :
 * sans espaces) ; `vide`, presse-papiers vide, blanc ou illisible, rien d'écrit ; `refusee`,
 * écriture refusée par le trousseau ou absente à la relecture, la clé d'avant restant.
 */
export type Collage = { issue: "rangee"; cle: string } | { issue: "vide" } | { issue: "refusee" }

/** Le compteur de changements du presse-papiers (Pasteboard.changeCount), ou null s'il ne se lit pas. */
async function compteurPressePapiers(): Promise<number | null> {
  try {
    const n = await (Pasteboard as any).changeCount
    return typeof n === "number" && Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Ticket 7.8 (F5) : vide le presse-papiers après « Coller », la clé rangée, seulement s'il porte encore cette clé : son compteur
 * de changements est le même qu'à la lecture (rien n'y a été copié depuis), sans le relire (iOS redemanderait l'accord de
 * collage) ; sans compteur lisible, relu et comparé. Ne lève jamais ; un vidage refusé laisse le presse-papiers tel quel.
 */
async function viderPressePapiers(avant: number | null, cle: string): Promise<void> {
  try {
    if (avant !== null) {
      if ((await compteurPressePapiers()) !== avant) return
    } else {
      const encore = await Pasteboard.getString()
      if (!encore || normaliserCle(encore) !== cle) return
    }
    const p: any = Pasteboard
    if (typeof p.setItems === "function") await p.setItems([])
    else await Pasteboard.setString(null)
  } catch { /* vidage refusé : rien de plus, la clé est rangée */ }
}

/**
 * « Coller » (Feuille « Réglages des stats », étape 2 du Premier lancement) : range, comme
 * `rangerCle`, la clé que porte le presse-papiers, lu à cet appui seulement ; rangée, le
 * presse-papiers est vidé s'il la porte encore (ticket 7.8, viderPressePapiers).
 */
export async function collerCle(): Promise<Collage> {
  let texte: string | null = null
  const avant = await compteurPressePapiers()
  try {
    texte = await Pasteboard.getString()
  } catch {
    // Presse-papiers illisible : traité comme vide, sans trace (il pourrait porter la clé).
  }
  if (!texte || !normaliserCle(texte)) return { issue: "vide" }
  if (!rangerCle(texte)) return { issue: "refusee" }
  const cle = normaliserCle(texte)
  await viderPressePapiers(avant, cle)
  return { issue: "rangee", cle }
}

/** Retire la clé. Faux si, relu, le trousseau la porte encore. */
export function retirerCle(): boolean {
  Keychain.remove(CLE_HENRIKDEV)
  return !Keychain.contains(CLE_HENRIKDEV)
}
