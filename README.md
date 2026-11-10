# ValShop

ValShop est une app gratuite pour iPhone qui tourne dans l'app **Scripting** : ta boutique Valorant du jour (avec un widget), ta liste de souhaits et les statistiques de tes parties. Tout reste sur ton iPhone.

> **À lire avant d'installer.** Pour lire ta boutique, ValShop se connecte à ton compte Riot par une méthode **non officielle** : la page de connexion de Riot s'ouvre dans l'app, comme sur le site de Riot, puis ValShop lit ta boutique avec ta session. Riot ne le prévoit pas et pourrait un jour le bloquer. **Chacun l'utilise sous sa responsabilité.** Ton identifiant et ton mot de passe Riot ne sont tapés que sur la page de Riot ; ta session et ta clé restent dans le trousseau de **ton** iPhone. Rien n'est envoyé à la personne qui t'a donné le lien, ni à personne d'autre.

## Installer, pas à pas

Compte cinq minutes. Il te faut un iPhone, ton compte Riot (Valorant) et un compte Discord pour la clé gratuite des statistiques.

### 1. Installer Scripting

Dans l'App Store, cherche **Scripting** et installe-la. Elle est gratuite ; la version gratuite suffit pour ValShop (l'abonnement Pro n'est pas nécessaire).

### 2. Toucher le lien d'installation

Touche le lien qu'on t'a envoyé (ou ce lien : [installer ValShop](https://www.scripting.fun/import_scripts/?urls=%5B%22https://github.com/Hugo7500/valshop%22%5D)).

- Une page de Scripting s'ouvre dans Safari, puis Scripting s'ouvre et importe ValShop.
- Si Scripting ne s'ouvre pas, touche **Try Again** sur cette page.

### 3. Premier lancement

Dans la liste des scripts de Scripting, touche **valshop-s0** : c'est ValShop. L'écran **Premier lancement** te guide en trois étapes.

### 4. Te connecter à ton propre compte Riot

Touche **Me connecter**. La page de connexion de Riot s'ouvre : entre ton identifiant et ton mot de passe Riot, comme sur le site de Riot. Ensuite ta boutique du jour s'affiche dans l'onglet **Boutique**.

Utilise **ton** compte : chaque iPhone a sa propre connexion, sa propre clé et son propre historique.

### 5. Créer ta propre clé HenrikDev (pour les statistiques)

Les statistiques viennent de HenrikDev, un service gratuit et non officiel, qui demande une clé personnelle. La boutique marche sans elle. La procédure, d'après la documentation de HenrikDev (docs.henrikdev.xyz, page « Authentication & Authorization ») et son dépôt GitHub :

1. Rejoins le serveur Discord de HenrikDev : <https://discord.gg/henrikdev-systems-704231681309278228>. C'est demandé pour pouvoir créer une clé.
2. Ouvre le tableau de bord de HenrikDev : <https://api.henrikdev.xyz/dashboard/> (dans ValShop, le lien **Obtenir une clé gratuite** y mène aussi) et connecte-toi.
3. Dans le menu, choisis **API Keys**.
4. Remplis le formulaire **Generate New Key** : choisis la clé de base (**Basic**, gratuite et donnée tout de suite) et décris ton usage en une phrase, par exemple : « Usage personnel : mes statistiques Valorant dans une app sur mon iPhone. »
5. Copie la clé obtenue : elle commence par **HDEV-**. Ne la donne à personne.
6. Reviens dans ValShop et touche **Coller ma clé**. Elle est rangée dans le trousseau de ton iPhone, jamais affichée en clair.

### 6. Récupérer tes parties

Touche **Récupérer mes parties** (troisième étape) et laisse l'app ouverte quelques minutes. Ensuite, touche **Mettre à jour** dans l'onglet **Stats** de temps en temps : les réglages des stats te disent quand en refaire une.

## Ce que ValShop fait de tes données

Tout reste sur ton iPhone. ValShop ne parle qu'à :

- **Riot** : ta connexion et ta boutique ;
- **HenrikDev** : tes parties, avec ta clé ;
- **valorant-api.com** : les noms et les images du jeu ;
- **GitHub** : une fois par jour au plus, ValShop lit le numéro de la dernière version publiée ici ; rien n'est envoyé.

Rien n'est envoyé à la personne qui t'a donné le lien. Le bouton **Envoyer le lien d'installation** (réglages des stats, **Partager ValShop**) n'envoie que l'adresse de ce dépôt : ni tes stats, ni ta clé, ni ta session.

## Sécurité

- **N'installe pas de scripts douteux dans Scripting.** Les scripts de Scripting partagent le même environnement sur ton iPhone : un script malveillant installé à côté de ValShop pourrait lire ses fichiers (tes stats, ta boutique, ton identifiant de joueur) et même, en se faisant passer pour ValShop, lire ta session Riot et ta clé. N'installe que des scripts dont tu connais l'auteur.
- **Révoquer ta clé HenrikDev.** Sur le tableau de bord de HenrikDev (<https://api.henrikdev.xyz/dashboard/>), menu **API Keys** : supprime la clé, puis crée-en une nouvelle si tu veux continuer. Dans ValShop, **Retirer la clé** (réglages des stats) l'efface de ton iPhone.
- **Te déconnecter de Riot.** Supprimer ValShop de Scripting efface sa session et ta clé, rangées avec le script. Tes stats, ta boutique et le journal restent dans le dossier commun de Scripting, où d'autres scripts peuvent les lire. Pour fermer aussi la session chez Riot, change ton mot de passe sur le site de Riot.
- **Mettre à jour, c'est faire confiance à l'auteur de ce dépôt.** Chaque nouvelle version installe le code publié ici, tel que son auteur l'a écrit. Ne mets à jour que depuis ce dépôt, par le bouton **Mettre à jour ValShop** ou ton lien d'installation.

## Mettre à jour

Quand une nouvelle version est publiée, la section **Nouvelle version** apparaît dans les réglages des stats (l'engrenage de l'onglet **Stats**), avec ce qui change. Touche **Mettre à jour ValShop** : Scripting importe la nouvelle version depuis ce dépôt. Tu peux aussi toucher de nouveau ton lien d'installation.

- **Ne supprime pas l'ancien ValShop avant** : dans Scripting, ta clé HenrikDev et ta session Riot sont rangées avec le script et partiraient avec lui.
- Si Scripting te demande quoi faire du script déjà installé, choisis de le remplacer.
- Ton historique de parties, ta liste de souhaits et ta boutique sont rangés à part du code : la mise à jour ne les touche pas.

Rien ne s'installe tout seul : une nouvelle version n'arrive que si tu touches le bouton ou le lien.

## Problèmes fréquents

- **Le lien n'ouvre pas Scripting.** Vérifie que Scripting est installée, puis touche **Try Again** sur la page du lien. Sinon, ouvre le lien dans Safari (appui long, puis **Ouvrir**).
- **Je ne trouve pas ValShop dans Scripting.** Il s'appelle **valshop-s0** dans la liste des scripts.
- **La connexion Riot échoue.** Un compte Riot qui ne se connecte qu'avec Google, Apple ou Facebook peut ne pas marcher dans la page de l'app : ajoute un mot de passe à ton compte Riot sur le site de Riot, puis réessaie avec ton identifiant et ce mot de passe.
- **La boutique ne s'affiche plus.** Ta session Riot a expiré : touche **Me connecter**.
- **Clé refusée.** Vérifie qu'elle commence par **HDEV-** et qu'elle est entière ; sinon crée-en une nouvelle sur le tableau de bord de HenrikDev, puis **Coller ma clé** dans les réglages des stats.
- **Limite atteinte.** HenrikDev limite le nombre de requêtes par clé : attends quelques minutes, puis touche de nouveau **Mettre à jour**.
- **Il manque mes vieilles parties.** HenrikDev ne garde que tes parties récentes (une centaine environ) : fais une mise à jour au moins toutes les deux semaines pour ne rien perdre.
- **Le widget.** Sur l'écran d'accueil, ajoute un widget **Scripting**, puis choisis le script **valshop-s0** dans ses réglages.
- **Sans Scripting Pro.** ValShop marche sans l'abonnement : il range alors tes parties dans des fichiers, un peu plus lentement.

<!-- Soutien : emplacement réservé pour un lien de soutien (dons libres). À remplir seulement quand ce choix sera fait ; rien pour l'instant. -->

## Mentions

ValShop was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

En français : ValShop a été créé dans le cadre de la politique « Legal Jibber Jabber » de Riot Games, avec des contenus appartenant à Riot Games. ValShop n'est ni approuvé ni soutenu par Riot Games. Valorant et les contenus associés sont des marques et contenus de Riot Games.

ValShop n'a aucun lien avec Scripting ni avec HenrikDev, qui sont des services de tiers.

## Licence

ValShop est publié sous la licence **PolyForm Strict 1.0.0** (fichier `LICENSE`) : tu peux l'installer et l'utiliser gratuitement pour un usage personnel et non commercial. Il est interdit de le vendre, de le redistribuer ou d'en diffuser une version modifiée. Pour le faire découvrir à quelqu'un, envoie-lui le lien d'installation.
