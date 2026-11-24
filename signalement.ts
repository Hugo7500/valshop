





import { traduire } from "./langue"





export const ADRESSE_SIGNALEMENT: string = "rubicon-safari-9g@icloud.com"

/** Textes de la section. */
export const TITRE_SIGNALEMENT = "Signaler un bug"
export const BOUTON_SIGNALEMENT = "Écrire un e-mail"
export const NOTE_SIGNALEMENT =
  "Le message s'ouvre dans Mail. ValShop y ajoute sa version, celle de Scripting et d'iOS, rien de ton compte ni de tes stats. Tu le relis avant de l'envoyer."
/** Mail pas ouvert (aucun compte de messagerie, ou refus d'iOS) : l'adresse est dite pour écrire depuis une autre app. */
export function refusSignalement(adresse: string = ADRESSE_SIGNALEMENT): string {
  return `Mail ne s'est pas ouvert. Écris à ${adresse} depuis ton app de messagerie.`
}

/** Ce que le message dit de l'appareil ; chaque champ illisible est simplement omis. */
export type InfosAppareil = {
  valshop?: unknown
  scripting?: unknown
  appareil?: unknown
  ios?: unknown
  langue?: unknown
}

/** Une valeur courte et sans caractère de contrôle, ou null. */
function propre(x: unknown, max = 40): string | null {
  if (typeof x !== "string") return null
  const t = x.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
  return t === "" ? null : t.slice(0, max)
}

/** Les lignes techniques du message, dans l'ordre ; rien de lisible : aucune. */
export function lignesTechniques(i: InfosAppareil): string[] {
  const l: string[] = []
  const v = propre(i.valshop), s = propre(i.scripting), a = propre(i.appareil), o = propre(i.ios), g = propre(i.langue, 12)
  if (v) l.push(`ValShop ${v}`)
  if (s) l.push(`Scripting ${s}`)
  if (a || o) l.push([a, o ? `iOS ${o}` : null].filter((x) => x !== null).join(", "))
  if (g) l.push(traduire(`Langue : ${g}`))
  return l
}

export const SUJET_SIGNALEMENT = "ValShop : un bug"

/** Le corps du message : la place pour écrire, puis les lignes techniques sous un filet. */
export function corpsSignalement(i: InfosAppareil): string {
  const tech = lignesTechniques(i)
  // Le brouillon de Mail ne passe pas par la fabrique JSX : ses lignes traduites ici (en français, telles quelles).
  return [
    traduire("Ce qui s'est passé :"),
    "",
    "",
    traduire("Ce que tu faisais juste avant :"),
    "",
    "",
    ...(tech.length > 0 ? ["—", ...tech] : []),
  ].join("\n")
}

/** Une adresse e-mail plausible (une seule, sans espace ni caractère d'en-tête). */
export function adresseValide(a: string): boolean {
  return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(a)
}

/** Le lien mailto: du message ; null sans adresse valide. */
export function lienSignalement(i: InfosAppareil, adresse: string = ADRESSE_SIGNALEMENT): string | null {
  if (!adresseValide(adresse)) return null
  return `mailto:${adresse}?subject=${encodeURIComponent(traduire(SUJET_SIGNALEMENT))}&body=${encodeURIComponent(corpsSignalement(i))}`
}
