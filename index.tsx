import { Script } from "scripting"
import { changerDeCompte, finirLectures, nettoyerCookiesPersistants, refresh, tailJournal } from "./valshop"
import { INTERRUPTEURS, presenterApp } from "./app"
import { aUneCle } from "./cle"
import type { ChoixVue } from "./vue"

// Point d'entrée au premier plan. Sans paramètre (lancement depuis l'app Scripting,
// ou appui sur une notification), avec une clé HenrikDev au trousseau : la fin du journal,
// puis la mise à jour, fenêtre de connexion possible ; sans clé : l'app, comme `ouvrir=vue`,
// son onglet Stats sur le Premier lancement. Depuis le widget (lien
// `Script.createRunSingleURLScheme`) : `ouvrir=vue` (l'app à deux onglets, sur Stats ;
// Boutique en cache, d'où l'on peut changer de compte ; l'Écran de connexion tant que la
// session est expirée) ou `ouvrir=connexion` (session expirée : mise à jour, donc login
// Riot, puis l'app).

async function run() {
  // Aiguillage : `ouvrir` est le seul paramètre lu ici. `vue` (appui sur le widget)
  // présente l'app en plein écran, sans mise à jour ni requête : sur Stats, ou sur
  // l'Écran de connexion si etat.json dit la session expirée. `connexion` (appui sur le
  // widget en session expirée) fait d'abord la mise à jour au premier plan, donc la page
  // de login Riot si la reconnexion silencieuse échoue, sans contourner garde-fou ni
  // verrou, puis présente l'app : Stats si la session est rétablie, l'Écran de connexion
  // sinon. L'app se ferme par le Bouton Fermer (fin), par « Changer de compte » (Boutique :
  // le changement se fait, l'app fermée, puis la lecture du nouveau compte, et fin), ou par
  // « Me connecter » (Écran de connexion, ou étape 1 du Premier lancement) : une seule mise
  // à jour, donc une seule tentative de login, puis l'app de nouveau ; jamais de nouvel essai
  // sans un nouvel appui. Sans paramètre, ou inconnu : le lancement par défaut, sauf tant que
  // la clé HenrikDev manque (trousseau lu sur place, sans requête) : l'app, comme `vue`, pour
  // le Premier lancement, dont l'étape 1 fait cette même mise à jour, avec login, sur appui.
  // Entrée 10 : après chaque fermeture de l'app, la lecture que « Lire la boutique » y a lancée
  // finit (30 s au plus, finirLectures) avant la suite : ni verrou orphelin à la sortie, ni lecture
  // de l'ancien compte pendant un changement de compte.
  // Ticket 7.8 (E1-a) : les cookies Riot qu'une ancienne connexion a laissés dans le magasin persistant des vues web, que tout
  // script de Scripting partage, retirés à chaque lancement, sans retenir l'app ; la session reste dans le trousseau.
  if (INTERRUPTEURS.nettoyageCookies) nettoyerCookiesPersistants().catch(() => {})
  const ouvrir = Script.queryParameters?.ouvrir
  if (ouvrir === "vue" || ouvrir === "connexion" || !aUneCle()) {
    const app = async (): Promise<ChoixVue> => {
      const c = await presenterApp()
      await finirLectures()
      return c
    }
    let choix: ChoixVue = ouvrir === "connexion" ? "connexion" : await app()
    while (choix === "connexion") {
      await refresh(true)
      choix = await app()
    }
    if (choix === "changer-de-compte") await changerDeCompte()
    Script.exit()
    return
  }

  await tailJournal(40)
  await refresh(true)
  Script.exit()
}

run().catch((err) => {
  console.log("💥 " + err)
  Script.exit()
})
