// Le partage de ValShop (epic-installation-ami, entrée 3) : l'adresse publique du dépôt qui sert le paquet (entrée 2) et le
// lien d'installation que « Partager ValShop », dans la feuille Réglages des stats, passe seul à la feuille de partage d'iOS.
// Module pur, sans import de `scripting` : ni requête, ni fichier, ni trousseau ; le lien ne porte que l'adresse du dépôt,
// jamais une clé, une session, un identifiant ni une stat.
//
// Le lien envoyé est celui, en https, de la page officielle d'import de Scripting, toujours touchable dans Messages : la page
// ouvre Scripting et lance l'import (bouton « Try Again » sinon). Sa forme est celle du code de la page :
// `https://www.scripting.fun/import_scripts/?urls=` suivi de `encodeURIComponent(JSON.stringify(urls))`. Il est fait au moment
// de l'appui, jamais écrit en clair : sa forme encodée ressemble à un cookie pour le contrôle du paquet (outils/paquet.ts).


export const COMPTE_GITHUB = "Hugo7500"
export const NOM_DEPOT = "valshop"
export const BRANCHE_DEPOT = "main"

/** L'adresse publique du dépôt, à la forme qu'attend l'import de Scripting (« GitHub repository, default branch »). */
export const DEPOT_VALSHOP = `https://github.com/${COMPTE_GITHUB}/${NOM_DEPOT}`

/** La page officielle d'import de Scripting, qui ouvre l'app et lance l'import des adresses passées dans `urls`. */
export const PAGE_IMPORT = "https://www.scripting.fun/import_scripts/"

/** Le lien d'installation : la page d'import, avec la seule adresse du dépôt (forme du code de la page). */
export function lienInstallation(depot: string = DEPOT_VALSHOP): string {
  return `${PAGE_IMPORT}?urls=${encodeURIComponent(JSON.stringify([depot]))}`
}

/** Textes de la section « Partager ValShop » (maquette Reglages-stats). */
export const TITRE_PARTAGE = "Partager ValShop"
export const BOUTON_PARTAGE = "Envoyer le lien d'installation"
export const NOTE_PARTAGE =
  "Ton ami installe Scripting, touche le lien, puis connecte son propre compte Riot et colle sa propre clé. Rien de toi ne lui est envoyé : ni tes stats, ni ta clé, ni ta session."
/** La feuille de partage refusée par iOS : rien n'est parti, un nouvel appui la rouvre. */
export const REFUS_PARTAGE = "Feuille de partage pas ouverte, réessaie."

/**
 * Epic-installation-ami, entrée 7 : section « À propos » de la feuille Réglages des stats : la version installée, puis la mention
 * que demande Riot Games aux projets de fans qu'on partage (règle 6 de sa politique « Legal Jibber Jabber » : « [The title of
 * your Project] was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does
 * not endorse or sponsor this project. »), adaptée en français, puis une phrase sur les marques.
 */
export const TITRE_A_PROPOS = "À propos"
export const MENTION_RIOT =
  "ValShop a été créé dans le cadre de la politique « Legal Jibber Jabber » de Riot Games, avec des contenus appartenant à Riot Games. ValShop n'est ni approuvé ni soutenu par Riot Games. Valorant et les contenus associés sont des marques et contenus de Riot Games."
/** La ligne de la version installée (le `version` de script.json) ; null si elle est illisible. */
export function ligneVersion(version: unknown): string | null {
  return typeof version === "string" && version.trim() !== "" ? `ValShop ${version.trim()}, usage personnel gratuit.` : null
}
