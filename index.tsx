import { Script } from "scripting"
import { changerDeCompte, finirLectures, nettoyerCookiesPersistants, refresh, seDeconnecter, tailJournal } from "./valshop"
import { INTERRUPTEURS, lireOuverture, presenterApp, type LectureOuverture } from "./app"
import { aUneCle } from "./cle"
import type { ChoixVue } from "./vue"

// Point d'entrée au premier plan. Tout lancement présente l'app à deux onglets, sur Stats
// (Boutique en cache, d'où l'on peut changer de compte ; l'Écran de connexion tant que la
// session est expirée) : depuis le widget (lien `Script.createRunSingleURLScheme`,
// `ouvrir=vue`), ou sans paramètre (lancement depuis l'app Scripting, ou appui sur une
// notification) ; sans clé HenrikDev au trousseau, son onglet Stats est sur le Premier
// lancement. Seul `ouvrir=connexion` (le widget, session expirée) fait d'abord la mise à
// jour, donc le login Riot, puis l'app ; de même le lancement sans paramètre, une clé rangée,
// quand aucune boutique n'est gardée et que la session n'est pas dite expirée. Sans paramètre,
// une clé rangée : la fin du journal va aussi à la console, l'app fermée.

async function run() {
  // Aiguillage : `ouvrir` est le seul paramètre lu ici. `vue` (appui sur le widget)
  // présente l'app en plein écran, sans mise à jour au premier plan : sur Stats, ou sur
  // l'Écran de connexion si etat.json dit la session expirée. `connexion` (appui sur le
  // widget en session expirée) fait d'abord la mise à jour au premier plan, donc la page
  // de login Riot si la reconnexion silencieuse échoue, sans contourner garde-fou ni
  // verrou, puis présente l'app : Stats si la session est rétablie, l'Écran de connexion
  // sinon. L'app se ferme par le Bouton Fermer (fin), par « Changer de compte » (Boutique :
  // le changement se fait, l'app fermée, puis la lecture du nouveau compte, et fin), ou par
  // « Me connecter » (Écran de connexion, ou étape 1 du Premier lancement) : une seule mise
  // à jour, donc une seule tentative de login, puis l'app de nouveau ; jamais de nouvel essai
  // sans un nouvel appui ; ou par « Se déconnecter » (Boutique, après confirmation) : la session
  // Riot est retirée, l'app fermée, puis l'app de nouveau, qui invite à se connecter. Sans paramètre, ou inconnu : l'app, comme `vue` (entrée 21 de
  // epic-stats-collecte : ce lancement ne fait plus la mise à jour au premier plan pour finir
  // sans rien montrer ; sauf sans boutique gardée, une clé rangée : la mise à jour d'abord,
  // entrée 22, plus bas) ; session expirée, l'Écran de connexion et son « Me connecter », jamais
  // de fenêtre de login sans cet appui ; la boutique expirée et les stats se mettent à jour
  // dans l'app, d'elles-mêmes (app.tsx, `majAuto`). Sans clé HenrikDev (trousseau lu sur place,
  // sans requête), c'est le Premier lancement, dont l'étape 1 fait la mise à jour, avec login,
  // sur appui.
  // Entrée 10 : après chaque fermeture de l'app, la lecture que « Lire la boutique » y a lancée
  // finit (30 s au plus, finirLectures) avant la suite : ni verrou orphelin à la sortie, ni lecture
  // de l'ancien compte pendant un changement de compte.
  // Ticket 7.8 (E1-a) : les cookies Riot qu'une ancienne connexion a laissés dans le magasin persistant des vues web, que tout
  // script de Scripting partage, retirés à chaque lancement, sans retenir l'app ; la session reste dans le trousseau.
  if (INTERRUPTEURS.nettoyageCookies) nettoyerCookiesPersistants().catch(() => {})
  const ouvrir = Script.queryParameters?.ouvrir
  // Entrée 21 : le lancement sans paramètre (ou inconnu), une clé rangée ; lu ici, une fois : une clé collée pendant le
  // Premier lancement ne change pas la suite de ce lancement.
  const liste = ouvrir !== "vue" && ouvrir !== "connexion" && aUneCle()
  // Entrée 22 : ce lancement lit lui-même, une seule fois, ce que l'app lit à son ouverture (shop.json, etat.json), et le lui
  // donne. Aucune boutique gardée (fichier absent ou illisible) et la session pas dite expirée : la mise à jour d'abord, une
  // fois, comme l'appui sur le widget dans cet état (`connexion`), donc le login Riot si la reconnexion silencieuse échoue ; un
  // échec de Riot se dit par sa notification, hors réseau rien n'est dit (la session n'est pas morte), une erreur levée va à la
  // console ; puis l'app, dans tous les cas. L'onglet Boutique n'aurait sinon que « Aucune boutique en cache », sans bouton
  // pour la lire. Session dite expirée : l'Écran de connexion, comme avec une boutique. Sans clé : rien de tout cela (Premier
  // lancement).
  const lue = liste ? lireOuverture() : undefined
  // Epic-installation-ami, entrée 11 : sans session au trousseau non plus (jamais connecté, ou déconnecté), pas de mise à
  // jour d'abord : elle ouvrirait la fenêtre de login d'office ; l'onglet Boutique de l'app invite à se connecter.
  const sansBoutique = lue !== undefined && lue.shop === null && !lue.expiree && !lue.deconnecte
  const app = async (deja?: LectureOuverture): Promise<ChoixVue> => {
    const c = await presenterApp(deja)
    await finirLectures()
    return c
  }
  let choix: ChoixVue = "connexion"
  if (ouvrir !== "connexion") {
    if (sansBoutique) {
      try { await refresh(true) } catch (e) { console.log("💥 " + e) }
    }
    choix = await app(sansBoutique ? undefined : lue)
  }
  // « Me connecter » : la mise à jour, donc le login, puis l'app ; « Se déconnecter » (epic-installation-ami, entrée 11) :
  // la déconnexion, puis l'app, qui invite à se connecter.
  while (choix === "connexion" || choix === "deconnexion") {
    if (choix === "connexion") await refresh(true)
    else await seDeconnecter()
    choix = await app()
  }
  if (choix === "changer-de-compte") await changerDeCompte()
  // La fin du journal à la console, comme avant l'entrée 21 (de quoi relire une collecte entière des stats), mais l'app
  // fermée, juste avant la fin : sa lecture ne prend rien à l'ouverture.
  if (liste) await tailJournal(40)
  Script.exit()
}

run().catch((err) => {
  console.log("💥 " + err)
  Script.exit()
})
