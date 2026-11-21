import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { marqueurLu, messageHote } from "./historique"
import { echeanceDe } from "./parties"
import { lireCompte, lireMarqueur } from "./stockage"
import { note, refresh } from "./valshop"
import { apresAppui, clePosition } from "./widgets-carrousel"
import { ecrireAppui, issueAppui } from "./widgets-donnees"
import { ecrirePositions, lirePositionsGardees, lireReglageGarde } from "./widgets-fichier"
import { CARROUSEL, contenuDe, numeroDe, type Taille } from "./widgets-reglage"

// Action déclenchée par le bouton ↻ du widget. Elle tourne en arrière-plan, sans ouvrir l'app,
// une trentaine de secondes au plus (iOS) ; le téléphone est déverrouillé par construction : on
// appuie dessus. Un autre ↻ qui collecte encore (marqueur `rafraichir` de moins de 2 min, lu sur
// place) : ni boutique ni collecte, le widget rechargé seulement, une ligne au journal. Sinon, dans
// l'ordre : la boutique de la v1, `refresh(false)` telle quelle (garde-fou, verrou, alertes,
// notifications, etat.json) ; le rechargement du widget ; puis, quelle que soit l'issue de la
// boutique (lue, cache, échec, session expirée, erreur) sauf « déjà en cours » (une autre lecture la
// tient : pas de collecte de plus), la collecte des stats de Mettre à jour (collecte.ts, entrée 6),
// une fois la première collecte lancée depuis l'onglet Stats, sous son marqueur, avant une échéance
// tirée du budget d'arrière-plan (25 s après le début de l'appui, parties.ts) : arrêtée à temps,
// elle laisse le repère de reprise. Aucune exception n'arrête la suite ni ne sort d'ici. Le widget
// importe ce fichier pour son bouton : la collecte n'est chargée qu'à l'appui, par import
// dynamique, jamais au rendu du widget, pour qu'une erreur de la collecte ne casse jamais le
// widget ; un chargement raté se dit au journal, comme la durée de l'appui. historique.ts,
// parties.ts et stockage.ts sont déjà chargés par valshop.ts.

/** Une ligne au journal, sans jamais faire échouer ↻. */
async function journal(ligne: string) {
  try {
    await note(ligne)
  } catch { /* journal indisponible : rien de plus */ }
}

/**
 * Une erreur au journal, entre `avant` et `apres` : son texte sans chemin, sans UUID ni le PUUID du compte des stats (ticket
 * 7.8), coupé (messageHote) ; un texte fixe si l'erreur ne se lit même pas (`String` qui lève). Jamais d'exception.
 */
async function journalErreur(avant: string, e: unknown, apres: string) {
  let texte = "erreur illisible"
  let puuid: string | null = null
  try {
    puuid = lireCompte()?.puuid ?? null
  } catch { /* compte illisible : les UUID restent masqués */ }
  try {
    texte = messageHote(String(e), [puuid])
  } catch { /* texte fixe */ }
  await journal(`${avant} (${texte})${apres}`)
}

/**
 * Le travail de ↻, partagé par le widget d'avant (RefreshShop) et les nouveaux (RelireWidget) : la boutique, le widget rechargé,
 * puis la collecte des stats (voir l'en-tête de ce fichier). `avantRechargement`, s'il est donné, est appelé juste avant chaque
 * rechargement du widget (les nouveaux widgets y notent leur réponse à l'appui) ; ce qu'il lève est ignoré.
 */
async function rafraichir(avantRechargement?: () => void): Promise<void> {
  // Échéance et durée prises au début de chaque appui, jamais au chargement du module :
  // l'extension peut survivre d'un appui à l'autre.
  const debut = Date.now()
  const echeance = echeanceDe(debut)
  // Un autre ↻ collecte encore : sa boutique est faite (ou servie), sa collecte en cours ; rien de plus ici.
  const autre = marqueurLu(lireMarqueur(), debut)
  if (autre && autre.par === "rafraichir") {
    try { avantRechargement?.() } catch { /* sans réponse à l'appui */ }
    try { Widget.reloadAll() } catch { /* le widget se rechargera seul */ }
    await journal(`↻ : un autre ↻ collecte encore (activité il y a ${Math.round(autre.age / 1000)} s) : ni boutique ni collecte, widget rechargé.`)
    return
  }
  let boutique: string | null = null
  try {
    boutique = await refresh(false)
  } catch (e) {
    await journalErreur("↻ : boutique en erreur", e, ", la suite continue.")
  }
  try { avantRechargement?.() } catch { /* sans réponse à l'appui */ }
  try {
    Widget.reloadAll()
  } catch (e) {
    await journalErreur("↻ : widget non rechargé", e, ".")
  }
  if (boutique === "déjà en cours") {
    // Une autre lecture tient le verrou de la boutique (un autre ↻, le plus souvent, dont la collecte suit).
    await journal("↻ : une autre lecture de la boutique est en cours : pas de collecte cette fois.")
  } else {
    try {
      const { collecteRafraichir } = await import("./collecte")
      await collecteRafraichir({ debut, echeance })
    } catch (e) {
      // collecteRafraichir ne lève jamais : seul le chargement de la collecte a pu échouer.
      await journalErreur("↻ : collecte non chargée", e, ".")
    }
  }
  await journal(`— ↻ terminé en ${Date.now() - debut} ms —`)
}

export const RefreshShop = AppIntentManager.register({
  name: "RefreshShop",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await rafraichir()
  },
})

/**
 * ↻ des nouveaux widgets (lot 1 de l'étude des widgets) : le même travail, avec une réponse visible à l'appui. « lecture » est noté
 * et le widget rechargé tout de suite ; la boutique lue (ou servie par le garde-fou), « à jour » ou « échec » est noté d'après
 * la boutique gardée (widgets-donnees.ts), avant le rechargement qui suit. N'écrit, en plus, que widget-appui.json.
 */
export const RelireWidget = AppIntentManager.register({
  name: "RelireWidget",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    ecrireAppui("lecture")
    try { Widget.reloadAll() } catch { /* le widget se rechargera seul */ }
    await rafraichir(() => ecrireAppui(issueAppui()))
  },
})

/**
 * L'appui sur un bord d'un carrousel (lot 3 de l'étude des widgets) : la vue d'après (`sens` 1) ou d'avant (-1), pour le
 * carrousel du widget `n` à la taille `t`. `i` : le compteur de la vue que le widget affichait (widgets-carrousel.ts) ; l'appui
 * part d'elle, et non de l'heure, car iOS peut ne pas avoir redessiné le widget depuis longtemps. Sans réseau : n'écrit que
 * widget-carrousel.json, puis recharge les widgets. Des paramètres d'une autre forme, ou un widget qui ne montre plus de
 * carrousel : rien. Aucune exception ne sort d'ici.
 */
export const CarrouselAppui = AppIntentManager.register({
  name: "CarrouselAppui",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (p: { n: number; t: string; sens: -1 | 1; i: number }) => {
    try {
      const numero = numeroDe(String(p?.n))
      const taille = (["s", "m", "l", "x"] as const).find((x) => x === p?.t) as Taille | undefined
      if (taille === undefined || numero !== p?.n || (p?.sens !== 1 && p?.sens !== -1) || !Number.isSafeInteger(p?.i)) return
      if (contenuDe(lireReglageGarde(), numero, taille) !== CARROUSEL) return
      const positions = lirePositionsGardees()
      positions[clePosition(numero, taille)] = apresAppui(p.i, p.sens, Date.now())
      ecrirePositions(positions)
      Widget.reloadAll()
    } catch { /* le carrousel reste sur sa vue */ }
  },
})
