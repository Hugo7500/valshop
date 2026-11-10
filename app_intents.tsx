import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { marqueurLu, messageHote } from "./historique"
import { echeanceDe } from "./parties"
import { lireCompte, lireMarqueur } from "./stockage"
import { note, refresh } from "./valshop"

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

export const RefreshShop = AppIntentManager.register({
  name: "RefreshShop",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    // Échéance et durée prises au début de chaque appui, jamais au chargement du module :
    // l'extension peut survivre d'un appui à l'autre.
    const debut = Date.now()
    const echeance = echeanceDe(debut)
    // Un autre ↻ collecte encore : sa boutique est faite (ou servie), sa collecte en cours ; rien de plus ici.
    const autre = marqueurLu(lireMarqueur(), debut)
    if (autre && autre.par === "rafraichir") {
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
  },
})
