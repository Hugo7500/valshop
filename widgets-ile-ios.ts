// Les appels à iOS de l'île dynamique (lot 4 de l'étude des widgets) : chargé seulement quand il y a une activité à lancer, à
// lire ou à arrêter (widgets-ile-app.ts), jamais à l'ouverture de l'app.

import { LiveActivity } from "scripting"
import { IleValShop } from "./live_activity"
import type { IleSouhait } from "./widgets-ile"

const NOM = "ValShopSouhait"

/** iOS permet-il les activités en direct de Scripting ? */
export function permises(): Promise<boolean> {
  return LiveActivity.areActivitiesEnabled()
}

/** L'activité `id` est-elle encore affichée et vivante ? */
export async function vivante(id: string): Promise<boolean> {
  const etat = await LiveActivity.getActivityState(id)
  return etat === "active" || etat === "stale"
}

/** Lance l'activité ; rend son identifiant (null si iOS ne l'a pas rendu), ou faux si elle n'a pas démarré. */
export async function lancer(e: IleSouhait): Promise<{ id: string | null } | false> {
  const activite = IleValShop()
  if (!(await activite.start(e, { staleDate: e.reset }))) return false
  return { id: activite.activityId ?? null }
}

/**
 * Arrête l'activité `id`, tout de suite, en lui redonnant son état (`etat`). Rend vrai si elle n'est plus là : arrêtée ici,
 * déjà retirée par iOS ou balayée ; faux si iOS a refusé de l'arrêter.
 */
export async function finir(id: string, etat: IleSouhait): Promise<boolean> {
  const ou = await LiveActivity.getActivityState(id)
  if (ou === null || ou === "dismissed") return true
  const a = await LiveActivity.from<IleSouhait>(id, NOM)
  if (!a) return true
  return await a.end(etat, { dismissTimeInterval: 0 })
}
