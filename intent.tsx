import { Script, Intent } from "scripting"
import { refresh } from "./valshop"
import { messageHote } from "./historique"
import { lireCompte } from "./stockage"

// Point d'entrée en arrière-plan : lancé par l'action « Run Script » de Raccourcis.
// Aucune interface n'est possible ici ; si la session est morte, une notification le dit.

async function run() {
  const summary = await refresh(false)
  Script.exit(Intent.text(summary))
}

/** Ticket 7.8 (F1) : le texte d'une erreur pour la sortie de l'intent : sans chemin, UUID ni PUUID du compte (messageHote). */
function texteSur(err: unknown): string {
  let puuid: string | null = null
  try { puuid = lireCompte()?.puuid ?? null } catch { /* compte illisible : les UUID restent masqués */ }
  try { return messageHote(String(err), [puuid]) } catch { return "erreur illisible" }
}

run().catch((err) => {
  console.log("💥 " + texteSur(err))
  Script.exit(Intent.text("erreur : " + texteSur(err)))
})
