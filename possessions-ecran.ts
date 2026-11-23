


import { COLLECTION_FILE, HISTORIQUE_BOUTIQUE_FILE } from "./valshop"
import { lireCompte } from "./stockage"
import { lireCollection, lireHistoriqueBoutique, possedes, type HistoriqueBoutique, type Possedes } from "./possessions"

export type PossessionsLues = { compte: string | null; possedes: Possedes | null; historique: HistoriqueBoutique }

/** La date et la taille d'un fichier (« absent » s'il manque) ; illisibles : null, et rien n'est gardé en mémoire. */
function empreinte(chemin: string): string | null {
  try {
    if (!FileManager.existsSync(chemin)) return "absent"
    const st = FileManager.statSync(chemin)
    return typeof st?.modificationDate === "number" && typeof st?.size === "number" ? `${st.modificationDate}:${st.size}` : null
  } catch {
    return null
  }
}
function lire(chemin: string): string | null {
  try {
    return FileManager.existsSync(chemin) ? FileManager.readAsStringSync(chemin) : null
  } catch {
    return null
  }
}

let garde: { cle: string; lues: PossessionsLues } | null = null

/** Collection et historique du compte connecté ; rien de lisible : rien de su (l'écran n'en dit rien). */
export function possessionsLues(): PossessionsLues {
  let compte: string | null = null
  try { compte = lireCompte()?.puuid ?? null } catch { /* illisible : aucun compte */ }
  const a = empreinte(COLLECTION_FILE), b = empreinte(HISTORIQUE_BOUTIQUE_FILE)
  const cle = a !== null && b !== null ? `${compte ?? ""}|${a}|${b}` : null
  if (cle !== null && garde !== null && garde.cle === cle) return garde.lues
  const lues: PossessionsLues = {
    compte,
    possedes: possedes(lireCollection(lire(COLLECTION_FILE)), compte),
    historique: lireHistoriqueBoutique(lire(HISTORIQUE_BOUTIQUE_FILE)),
  }
  garde = cle !== null ? { cle, lues } : null
  return lues
}
