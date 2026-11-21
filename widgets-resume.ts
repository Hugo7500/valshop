// Le résumé des stats pour les widgets (lot 2 de l'étude des widgets) : ce que l'app écrit dans widget-stats.json à chaque
// lecture de l'onglet Stats. Part pure : aucun import de « scripting », aucun fichier ; elle tourne sous `node --test`.
//
// Règle : les widgets montrent les chiffres de l'app, jamais un calcul à eux. Tout vient donc des fonctions des écrans
// (metriques.ts) : la sélection d'un périmètre (selectionner), la valeur écrite d'une tuile de la Vue d'ensemble (tuile), le
// sens de sa variation (sensVariation), Ton niveau réel (niveauReel), les Barres de RR (barresRr), les chiffres d'une partie
// (chiffresPartie). Le widget, lui, ne charge pas ces modules (trop lourds pour lui) : il lit le résumé (widgets-lecture.ts).
//
// Le résumé ne porte aucun identifiant de partie ni de joueur : le compte par son empreinte, les agents et les cartes par leur
// uuid public du jeu (pour leurs images).

import type { LigneRr, Rang } from "./historique"
import {
  CHIFFRES_CLES, MIN_PARTIES_GROUPE, agentsJoues, barresRr, chiffresPartie, ficheAgent, niveauReel, pourcentageEnClair, selectionner,
  sensVariation, toutesTesCartes, tuile, type Periode, type Selection,
} from "./metriques"
import type { Partie } from "./reduction"
import type { Ressources } from "./ressources"
import {
  NOMS_FILES, empreinteCompte, uuidJeu, type ChiffreGarde, type ConstatGarde, type PartieGardee, type ResumeStats,
} from "./widgets-lecture"
import type { Issue } from "./widgets-types"

/** Les périodes écrites : celles de l'onglet Stats. Le mode est toujours « Compétition » (rang et RR). */
export const PERIODES_RESUME: readonly Periode[] = ["7j", "30j", "acte", "tout"]
/** Les trois chiffres des widgets, parmi les douze tuiles de la Vue d'ensemble. */
export const CLES_RESUME: readonly ChiffreGarde["cle"][] = ["kd", "tete", "victoires"]
/** Les derniers résultats montrés, et les dernières parties listées. */
export const DERNIERS_RESUME = 5
export const PARTIES_RESUME = 3

export type EntreeResume = {
  /** L'historique tenu par l'onglet Stats, ses lignes de RR, son rang gardé et ses ressources (emblèmes). */
  parties: readonly Partie[]; rr: readonly LigneRr[]; rang: Rang | null; ressources: Pick<Ressources, "paliers">
  puuid: string
  /** L'heure du calcul (ms) et la dernière mise à jour réussie des stats (ISO, `meta.derniereReussite`). */
  maintenant: number; derniereReussite: string | null
}

const ISSUES: Readonly<Record<string, Issue>> = { victoire: "V", defaite: "D", nul: "N" }

/** Les RR de chaque partie classée d'après rr.json (`last_change` chiffré), par matchId en minuscules : la règle des Barres de RR. */
function rrParPartie(rr: readonly LigneRr[]): Map<string, number> {
  const table = new Map<string, number>()
  for (const l of rr) {
    if (typeof l !== "object" || l === null || typeof l.matchId !== "string") continue
    const cle = l.matchId.toLowerCase()
    if (!table.has(cle) && typeof l.last_change === "number" && Number.isSafeInteger(l.last_change)) table.set(cle, l.last_change)
  }
  return table
}

function entier(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0
}

/** Une partie à manches, telle que le résumé la garde ; null hors des quatre files à manches, ou sans résultat ni manches. */
export function partieGardee(p: Partie, rr: ReadonlyMap<string, number>): PartieGardee | null {
  const issue = p.resultat === null ? undefined : ISSUES[p.resultat]
  if (issue === undefined || NOMS_FILES[p.file] === undefined || !entier(p.manchesGagnees) || !entier(p.manchesPerdues)) return null
  const t = p.totaux
  const tete = chiffresPartie(p).tete?.valeur ?? null
  const nom = typeof p.carte?.name === "string" && p.carte.name.trim() !== "" ? p.carte.name : null
  return {
    issue, carte: nom, carteId: uuidJeu(p.carte?.id), agent: uuidJeu(p.agent?.id), file: p.file,
    pour: p.manchesGagnees, contre: p.manchesPerdues,
    kda: entier(t.kills) && entier(t.morts) && entier(t.assists) ? [t.kills, t.morts, t.assists] : null,
    rr: p.file === "competitive" ? rr.get(p.matchId.toLowerCase()) ?? null : null,
    tete: tete === null ? null : pourcentageEnClair(tete),
  }
}

// ─────────────────────────── les constats (lot 3, le chiffre du jour) ───────────────────────────

const nomme = (nom: string): boolean => nom.trim() !== "" && nom !== "?"











export function constatsDe(sel: Selection, chiffres: readonly ChiffreGarde[]): ConstatGarde[] {
  const constats: ConstatGarde[] = []

  const agents = agentsJoues(sel).flatMap((a) => {
    const f = ficheAgent(sel, a.id, null)
    const v = f?.chiffres.find((c) => c.cle === "victoires")
    return f && v && v.valeur !== null && v.parties >= MIN_PARTIES_GROUPE ? [{ f, v, valeur: v.valeur }] : []
  }).sort((x, y) => y.valeur - x.valeur || y.v.parties - x.v.parties || x.f.nom.localeCompare(y.f.nom, "fr"))
  if (agents.length >= 2 && agents[0].v.texte !== agents[1].v.texte && nomme(agents[0].f.nom)) {
    const { f, v } = agents[0]
    const plus: { libelle: string; valeur: string }[] = []
    for (const [cle, libelle] of [["kd", "K/D"], ["tete", "Tirs tête"]] as const) {
      const c = f.chiffres.find((x) => x.cle === cle)
      if (c && c.valeur !== null) plus.push({ libelle, valeur: c.texte })
    }
    constats.push({ type: "agent", nom: f.nom, id: uuidJeu(f.id), valeur: v.texte, parties: v.parties, plus })
  }

  const cartes = toutesTesCartes(sel).filter((l) => l.victoires.valeur !== null)
  const cotes = (l: (typeof cartes)[number]) => {
    const plus: { libelle: string; valeur: string }[] = []
    if (l.attaque.valeur !== null) plus.push({ libelle: "Attaque", valeur: l.attaque.texte })
    if (l.defense.valeur !== null) plus.push({ libelle: "Défense", valeur: l.defense.texte })
    return plus
  }
  if (cartes.length >= 2 && cartes[0].victoires.texte !== cartes[1].victoires.texte && nomme(cartes[0].carte)) {
    const l = cartes[0]
    constats.push({ type: "carte", nom: l.carte, id: uuidJeu(l.id), valeur: l.victoires.texte, parties: l.victoires.parties, plus: cotes(l) })
  }

  for (const c of chiffres) if (c.hausse === true) constats.push({ type: "hausse", cle: c.cle, valeur: c.valeur })

  const derniere = cartes.length >= 2 ? cartes[cartes.length - 1] : null
  if (derniere !== null && derniere.victoires.evaluation === "faible" && nomme(derniere.carte)) {
    constats.push({ type: "carte-faible", nom: derniere.carte, id: uuidJeu(derniere.id), valeur: derniere.victoires.texte, parties: derniere.victoires.parties, plus: cotes(derniere) })
  }

  for (const c of chiffres) if (c.hausse === false) constats.push({ type: "baisse", cle: c.cle, valeur: c.valeur })
  return constats
}

/** Le résumé des stats du compte, à l'instant `maintenant`. */
export function resumeStats(e: EntreeResume): ResumeStats {
  const rr = rrParPartie(e.rr)
  // Compétition, tout l'historique, la plus récente d'abord, parties refaites écartées.
  const classees = selectionner(e.parties, { mode: "competition", periode: "tout" }, e.maintenant)
  // Seulement les premières : inutile de relire toutes les parties du compte.
  const gardees: PartieGardee[] = []
  for (const p of classees.parties) {
    if (gardees.length === Math.max(DERNIERS_RESUME, PARTIES_RESUME)) break
    const g = partieGardee(p, rr)
    if (g !== null) gardees.push(g)
  }

  // La dernière partie à manches, toutes files confondues.
  let derniere: PartieGardee | null = null
  for (const p of selectionner(e.parties, { mode: "tout", periode: "tout" }, e.maintenant).parties) {
    derniere = partieGardee(p, rr)
    if (derniere !== null) break
  }

  const niveau = niveauReel(e.rang, classees)
  const embleme = niveau.palier === null ? null : e.ressources.paliers[String(niveau.palier)]?.embleme ?? null

  // Le cumul des Barres de RR (les 20 dernières parties classées qui ont une ligne de RR), de 0 à leur total.
  const barres = barresRr(e.parties, e.rr).barres
  const courbe: number[] = barres.length === 0 ? [] : [0]
  for (const b of barres) courbe.push(courbe[courbe.length - 1] + b.rr)

  const periodes: ResumeStats["periodes"] = {}
  for (const periode of PERIODES_RESUME) {
    const sel = selectionner(e.parties, { mode: "competition", periode }, e.maintenant)
    const chiffres: ChiffreGarde[] = []
    for (const cle of CLES_RESUME) {
      const c = CHIFFRES_CLES.find((x) => x.cle === cle)
      if (c === undefined) continue
      const sens = sensVariation(sel, c.stat)
      chiffres.push({ cle, valeur: tuile(sel, c).valeur, hausse: sens === "hausse" ? true : sens === "baisse" ? false : null })
    }
    periodes[periode] = { parties: sel.parties.length, chiffres, constats: constatsDe(sel, chiffres) }
  }

  const maj = e.derniereReussite === null ? NaN : Date.parse(e.derniereReussite)
  return {
    v: 1,
    compte: empreinteCompte(e.puuid),
    ecritA: e.maintenant,
    majA: Number.isNaN(maj) ? null : maj,
    rang: niveau.classe ? { nom: niveau.rang, embleme, rr: niveau.rr, variation: niveau.derniere } : null,
    derniers: gardees.slice(0, DERNIERS_RESUME).map((p) => p.issue).reverse(),
    courbe: courbe.every((x) => Number.isSafeInteger(x)) ? courbe : [],
    parties: gardees.slice(0, PARTIES_RESUME),
    derniere,
    periodes,
  }
}

/** Le texte de widget-stats.json sans l'heure du calcul : deux résumés de même texte disent la même chose (rien à réécrire). */
export function sansHeure(r: ResumeStats): string {
  return JSON.stringify({ ...r, ecritA: 0 })
}
