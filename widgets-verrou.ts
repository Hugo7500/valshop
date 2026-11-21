






import type { Chiffre, Donnees, Issue, SkinVu } from "./widgets-types"

/**
 * Un rectangle : un titre, un compte à rebours à sa droite (`compte`, ms, ou null), puis des lignes ; une paire : gauche et droite.
 * `forme` : « liste », les lignes seules, en gros, sans titre (la boutique) ; « vedette », la première ligne en très gros (le
 * souhait, le solde). `droite` : un texte court à droite du titre. `image` : à côté du titre, la silhouette d'une arme ou
 * l'icône du rang. `jauge` : de 0 à 1, sous le titre (les RR sur 100). `derniers` : les derniers résultats, que la vue écrit en
 * lettres plus ou moins appuyées à la place de la ligne qui les dit.
 */
export type RectVu = {
  titre: string; compte: number | null; lignes: (string | [string, string])[]
  forme?: "liste" | "vedette"; droite?: string; image?: { chemin: string; silhouette: boolean }; jauge?: number; derniers?: Issue[]
}
/** Un rond : l'anneau (`part` de 0 à 1, null sans anneau), au centre un compte à rebours (`compte`) ou un texte (`grand`), un mot dessous. */
export type RondVu = { part: number | null; grand: string | null; compte: number | null; sous: string }

const JOUR_MS = 24 * 3_600_000


function mille(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}


function heure(ms: number): string {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}

/** « Oni Vandal » : le nom du skin, puis son arme en minuscules avec sa capitale. */
export function nomComplet(s: SkinVu): string {
  const a = s.arme.trim()
  return a === "" ? s.nom : `${s.nom} ${a.charAt(0).toUpperCase()}${a.slice(1).toLowerCase()}`
}

/**
 * La boutique gardée n'est plus celle du jour : son reset est passé. Sans reset lisible : elle a été lue il y a plus d'un
 * jour, ou on ne sait pas quand.
 */
export function perimee(d: Donnees, maintenant: number): boolean {
  if (d.reset !== null) return d.reset <= maintenant
  return d.lueA === null || maintenant - d.lueA >= JOUR_MS
}

const A_LIRE: (string | [string, string])[] = ["Nouvelle boutique", "Touche pour la lire"]

const chiffre = (d: Donnees, libelle: string): Chiffre | null => d.stats?.chiffres.find((x) => x.libelle === libelle) ?? null
const ecrit = (x: Chiffre): string => (x.unite ? `${x.valeur} ${x.unite}` : x.valeur)

/** Le rectangle d'un contenu (boutique, stats, souhaits, solde) ; un contenu inconnu : la boutique. */
export function rectangle(contenu: string, d: Donnees, maintenant: number): RectVu {
  const vieille = perimee(d, maintenant)
  if (contenu === "stats") {
    const s = d.stats
    if (s === null) return { titre: "STATS", compte: null, lignes: ["Ouvre l'onglet Stats", "dans ValShop"] }
    const kd = chiffre(d, "K/D"), victoires = chiffre(d, "Victoires")
    // Une paire dont un côté manque devient une ligne simple ; une ligne vide disparaît. L'heure de la mise à jour n'y tient pas.
    const lignes = ([
      [s.derniers.join(" "), kd ? `K/D ${ecrit(kd)}` : ""],
      [victoires ? `${ecrit(victoires)} de victoires` : "", s.periode.replace(" jours", " j")],
    ] as [string, string][]).filter((l) => l[0] !== "" || l[1] !== "").map((l) => (l[0] === "" ? l[1] : l[1] === "" ? l[0] : l))
    const rang = s.rang
    return {
      titre: rang ? rang.nom.toUpperCase() : "COMPÉTITION", compte: null, lignes,
      ...(rang && rang.rr !== null ? { droite: `${rang.rr} RR`, jauge: Math.max(0, Math.min(1, rang.rr / 100)) } : {}),
      ...(rang?.icone ? { image: { chemin: rang.icone, silhouette: false } } : {}),
      ...(s.derniers.length > 0 ? { derniers: s.derniers } : {}),
    }
  }
  if (contenu === "souhaits") {
    if (vieille) return { titre: "★ SOUHAITS", compte: null, lignes: A_LIRE }
    const suivis = d.souhaitsSuivis
    if (suivis === null) return { titre: "★ SOUHAITS", compte: null, lignes: ["Relis ta boutique", "dans ValShop"] }
    const s = d.souhait
    const nombre = `${suivis} ${suivis > 1 ? "skins suivis" : "skin suivi"}`
    if (s === null) return { titre: "★ SOUHAITS", compte: d.reset, lignes: ["Aucun aujourd'hui", nombre] }
    const trouves = d.souhaitsTrouves ?? 1
    return {
      titre: trouves > 1 ? `★ ${trouves} EN BOUTIQUE` : "★ EN BOUTIQUE", compte: null, forme: "vedette",
      ...(s.icone ? { image: { chemin: s.icone, silhouette: true } } : {}),
      lignes: [
        nomComplet(s),
        [s.prix !== null ? `${mille(s.prix)} VP` : "", d.reset !== null ? `jusqu'à ${heure(d.reset)}` : ""].filter((x) => x !== "").join(" · "),
      ].filter((l) => l !== ""),
    }
  }
  if (contenu === "solde") {
    const s = d.solde
    if (s === null) return { titre: "SOLDE", compte: null, lignes: ["Lis ta boutique", "dans ValShop"] }
    const reste = [s.rp !== null ? `${mille(s.rp)} RP` : "", s.kc !== null ? `${mille(s.kc)} KC` : ""].filter((x) => x !== "").join(" · ")
    const lu = s.heure ? { droite: `lu à ${s.heure}` } : {}
    if (s.vp === null) return { titre: "SOLDE", compte: null, ...lu, lignes: [reste].filter((l) => l !== "") }
    return { titre: "SOLDE", compte: null, forme: "vedette", ...lu, lignes: [`${mille(s.vp)} VP`, reste].filter((l) => l !== "") }
  }
  if (vieille) return { titre: "BOUTIQUE", compte: null, lignes: A_LIRE }
  return {
    titre: d.sessionExpiree ? "SESSION EXPIRÉE" : "BOUTIQUE", compte: d.reset,
    lignes: d.skins.length > 0 ? d.skins.slice(0, 4).map((s): [string, string] => [nomComplet(s), s.prix !== null ? mille(s.prix) : ""]) : ["Aucune offre lue"],
    // La boutique du jour, session en règle : les quatre skins seuls, en gros. Session expirée : le titre le dit, au-dessus.
    ...(d.skins.length > 0 && !d.sessionExpiree ? { forme: "liste" as const } : {}),
  }
}

/** Le rond d'un contenu (reset, rr, souhaits) ; un contenu inconnu : le reset. */
export function rond(contenu: string, d: Donnees, maintenant: number): RondVu {
  const vieille = perimee(d, maintenant)
  if (contenu === "rr") {
    const rang = d.stats?.rang ?? null
    if (rang === null) return { part: null, grand: "RR", compte: null, sous: "À LIRE" }
    if (rang.rr === null) return { part: null, grand: rang.nom.toUpperCase(), compte: null, sous: "RANG" }
    return { part: Math.max(0, Math.min(1, rang.rr / 100)), grand: String(rang.rr), compte: null, sous: rang.nom.toUpperCase() }
  }
  if (contenu === "souhaits") {
    const n = d.souhaitsTrouves
    if (vieille || n === null) return { part: null, grand: "★", compte: null, sous: "À LIRE" }
    return { part: n > 0 ? 1 : 0, grand: `★ ${n}`, compte: null, sous: n > 1 ? "SOUHAITS" : "SOUHAIT" }
  }
  if (vieille || d.reset === null) return { part: null, grand: "↻", compte: null, sous: "À LIRE" }
  return { part: Math.max(0, Math.min(1, (d.reset - maintenant) / JOUR_MS)), grand: null, compte: d.reset, sous: "RESET" }
}

/** La ligne au-dessus de l'heure : le souhait en boutique, sinon les skins du jour. */
export function ligne(d: Donnees, maintenant: number): string {
  if (perimee(d, maintenant)) return "ValShop · nouvelle boutique à lire"
  if (d.souhait !== null) return `★ ${nomComplet(d.souhait)} en boutique`
  return d.skins.length > 0 ? d.skins.map((s) => s.nom).join(" · ") : "ValShop"
}

/** Sans boutique gardée : le widget invite à ouvrir l'app. */
export const SANS_BOUTIQUE: { rect: RectVu; rond: RondVu; ligne: string } = {
  rect: { titre: "VALSHOP", compte: null, lignes: ["Ouvre l'app", "pour lire ta boutique"] },
  rond: { part: null, grand: "↻", compte: null, sous: "À LIRE" },
  ligne: "ValShop · ouvre l'app",
}
