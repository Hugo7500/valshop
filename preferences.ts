





export type Ouverture = "boutique" | "stats"
export type PerimetreGarde = { mode: "competition" | "non-classe" | "tout"; periode: "7j" | "30j" | "acte" | "tout" }

export type LangueChoisie = "auto" | "fr" | "en"
export type Preferences = { ouverture: Ouverture; perimetre: PerimetreGarde | null; langue: LangueChoisie }

export const PREFERENCES_DEFAUT: Preferences = { ouverture: "stats", perimetre: null, langue: "auto" }
const MODES = ["competition", "non-classe", "tout"], PERIODES = ["7j", "30j", "acte", "tout"]

/** Les préférences d'après le texte de preferences.json, lues strictement : toute valeur inconnue prend sa valeur par défaut. */
export function lirePreferences(texte: string | null | undefined): Preferences {
  if (!texte) return PREFERENCES_DEFAUT
  let lu: unknown
  try {
    lu = JSON.parse(texte)
  } catch {
    return PREFERENCES_DEFAUT
  }
  if (typeof lu !== "object" || lu === null || Array.isArray(lu) || (lu as { v?: unknown }).v !== 1) return PREFERENCES_DEFAUT
  const o = lu as { ouverture?: unknown; perimetre?: unknown; langue?: unknown }
  const p = typeof o.perimetre === "object" && o.perimetre !== null ? o.perimetre as { mode?: unknown; periode?: unknown } : null
  return {
    ouverture: o.ouverture === "boutique" ? "boutique" : "stats",
    perimetre: p && typeof p.mode === "string" && MODES.includes(p.mode) && typeof p.periode === "string" && PERIODES.includes(p.periode)
      ? { mode: p.mode as PerimetreGarde["mode"], periode: p.periode as PerimetreGarde["periode"] }
      : null,
    langue: o.langue === "fr" || o.langue === "en" ? o.langue : "auto",
  }
}

/** Contenu de preferences.json. */
export function contenuPreferences(p: Preferences): string {
  return JSON.stringify({ v: 1, ouverture: p.ouverture, ...(p.perimetre ? { perimetre: p.perimetre } : {}), ...(p.langue !== "auto" ? { langue: p.langue } : {}) })
}

const fichier = () => FileManager.appGroupDocumentsDirectory + "/preferences.json"

/** Les préférences gardées sur l'appareil ; fichier absent ou illisible : celles par défaut. */
export function preferencesGardees(): Preferences {
  try {
    return FileManager.existsSync(fichier()) ? lirePreferences(FileManager.readAsStringSync(fichier())) : PREFERENCES_DEFAUT
  } catch {
    return PREFERENCES_DEFAUT
  }
}

/** Garde un changement de préférences ; vrai si le fichier est écrit. Les autres préférences sont relues, jamais écrasées. */
export function garderPreferences(changement: Partial<Preferences>): boolean {
  try {
    FileManager.writeAsStringSync(fichier(), contenuPreferences({ ...preferencesGardees(), ...changement }))
    return true
  } catch {
    return false
  }
}
