import { AnimatedFrames, Button, HStack, Script, Spacer, Text, VStack, Widget, ZStack, type VirtualNode } from "scripting"
import { CarrouselAppui, RelireWidget } from "./app_intents"
import { clePosition, compteur, indexDe, prochainPas } from "./widgets-carrousel"
import { chargerDonnees } from "./widgets-donnees"
import { lirePositionsGardees } from "./widgets-fichier"
import { CARROUSEL, type ModeCarrousel, type Taille } from "./widgets-reglage"
import type { Cadre } from "./widgets-types"
import { aBouton, vue, vueCarrousel } from "./widgets-toutes"
import { SANS_BOUTIQUE, ligne } from "./widgets-verrou"
import { vueVerrou } from "./widgets-verrou-vues"

// L'entrée des nouveaux widgets (lot 1 de l'étude des widgets) : les données gardées sur l'appareil, la vue du contenu choisi à la
// taille du widget, et par-dessus la zone d'appui de ↻. Un appui ailleurs ouvre l'app (la connexion si la session est expirée).
// Lot 3 : le carrousel, une vue de sa liste à la fois, ses bords gauche et droit pour passer à la précédente ou à la suivante.
// Lot 4 : les widgets de l'écran verrouillé, sans zone d'appui (un appui ouvre l'app).
// Rien ici ne va sur le réseau ; rien n'est écrit (l'appui sur un bord écrit la position, dans app_intents.tsx).

const SCRIPT = Script.name || "valshop-s0"
const DEMI_HEURE_MS = 30 * 60 * 1000

/** Le carrousel d'un widget : ses vues, sa façon d'avancer, et qui il est (pour garder sa position). `depart` : banc de rendu. */
export type CarrouselRegle = { vues: string[]; mode: ModeCarrousel; secondes: number; numero: number; taille: Taille; depart?: number }

/**
 * La zone d'appui de ↻ : tout le coin en haut à droite, bien plus large que le bouton dessiné, pour qu'un appui à côté compte
 * aussi. Presque invisible (2 % de blanc) : un bouton tout à fait transparent n'a pas encore été essayé sur l'iPhone.
 */
function ZoneRelire({ c }: { c: Cadre }) {
  return (
    <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
      <HStack spacing={0}>
        <Spacer />
        <Button intent={RelireWidget(undefined)} buttonStyle="plain">
          <ZStack frame={{ width: Math.min(96, c.l * 0.3), height: 44 }} background="rgba(255,255,255,0.02)" contentShape="rect">
            <Text font={1}> </Text>
          </ZStack>
        </Button>
      </HStack>
      <Spacer />
    </VStack>
  )
}

/**
 * Les bords du carrousel : à gauche la vue d'avant, à droite la vue d'après, chacun sur un peu plus d'un cinquième du widget,
 * sous la bande du haut (celle de ↻). Presque invisibles, comme la zone de ↻. Le milieu reste libre : il ouvre l'app.
 */
function ZonesBords({ c, car, affiche }: { c: Cadre; car: CarrouselRegle; affiche: number }) {
  const haut = 44
  // `affiche` : le compteur de la vue dessinée ; l'appui part d'elle, pas de l'heure (iOS peut ne pas avoir redessiné le widget).
  const bord = (sens: -1 | 1) => (
    <Button intent={CarrouselAppui({ n: car.numero, t: car.taille, sens, i: affiche })} buttonStyle="plain">
      <ZStack frame={{ width: c.l * 0.22, height: c.h - haut }} background="rgba(255,255,255,0.02)" contentShape="rect">
        <Text font={1}> </Text>
      </ZStack>
    </Button>
  )
  return (
    <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
      <Spacer />
      <HStack spacing={0} frame={{ width: c.l, height: c.h - haut }}>
        {bord(-1)}
        <Spacer />
        {bord(1)}
      </HStack>
    </VStack>
  )
}

/**
 * Présente le widget du contenu choisi ; rend faux s'il n'y a pas de boutique gardée (l'appelant montre alors l'invitation à
 * ouvrir l'app). `periode` : celle des stats de ce widget (widgets-reglage.ts). `car` : son carrousel, si c'est ce qu'il montre.
 */
export function presenterWidget(contenu: string, periode?: string, car?: CarrouselRegle): boolean {
  const d = chargerDonnees(periode)
  const c: Cadre = { famille: String(Widget.family), l: Widget.displaySize.width, h: Widget.displaySize.height }
  const maintenant = Date.now()
  // Sans boutique gardée (écran verrouillé seulement), comme le widget d'avant : la connexion, qui lit la boutique.
  const ouvrir = Script.createRunSingleURLScheme(SCRIPT, { ouvrir: d === null || d.sessionExpiree ? "connexion" : "vue" })

  // L'écran verrouillé : le widget d'avant n'y tient pas, donc jamais de repli sur lui ; sans boutique, une invitation.
  // Le widget est redessiné au reset, pour ne pas montrer la boutique de la veille.
  if (c.famille.startsWith("accessory")) {
    const reset = d?.reset != null && d.reset > maintenant ? d.reset + 2_000 : Infinity
    // Une fois par heure suffit (le compte à rebours vit seul) : le budget de rechargements d'iOS est gardé pour le reset.
    const policy = { policy: "after" as const, date: new Date(Math.min(maintenant + 2 * DEMI_HEURE_MS, reset)) }
    // La ligne au-dessus de l'heure n'accepte qu'un texte : pas de cadre autour.
    if (c.famille === "accessoryInline") Widget.present(<Text widgetURL={ouvrir}>{d === null ? SANS_BOUTIQUE.ligne : ligne(d, maintenant)}</Text>, policy)
    else Widget.present(<ZStack frame={{ width: c.l, height: c.h }} widgetURL={ouvrir}>{vueVerrou(contenu, d, c)}</ZStack>, policy)
    return true
  }
  if (d === null) return false

  let corps: (VirtualNode | null)[]
  // Le prochain dessin : dans une demi-heure, et de toute façon au reset, pour que la boutique de la veille soit dite « expirée ».
  let prochain = Math.min(maintenant + DEMI_HEURE_MS, d.reset !== null && d.reset > maintenant ? d.reset + 2_000 : Infinity)
  if (contenu === CARROUSEL && car && car.vues.length > 0) {
    if (car.mode === "continu" && car.vues.length > 1) {
      // En continu : toutes les vues défilent seules, chacune `secondes` secondes ; les bords ne servent plus.
      corps = [
        <AnimatedFrames duration={car.vues.length * car.secondes}>
          {car.vues.map((_, k) => vueCarrousel(car.vues, k, d, c))}
        </AnimatedFrames>,
        car.vues.some((v) => aBouton(v, c)) ? <ZoneRelire c={c} /> : null,
      ]
    } else {
      const seul = car.mode === "ios"
      const position = car.depart !== undefined ? { i: car.depart, t: maintenant } : lirePositionsGardees()[clePosition(car.numero, car.taille)]
      const affiche = compteur(position, maintenant, seul)
      const i = indexDe(affiche, car.vues.length)
      if (seul && car.vues.length > 1) prochain = Math.min(prochain, prochainPas(position, maintenant) + 1_000)
      corps = [
        vueCarrousel(car.vues, i, d, c),
        aBouton(car.vues[i], c) ? <ZoneRelire c={c} /> : null,
        car.vues.length > 1 ? <ZonesBords c={c} car={car} affiche={affiche} /> : null,
      ]
    }
  } else {
    corps = [vue(contenu, d, c), aBouton(contenu, c) ? <ZoneRelire c={c} /> : null]
  }
  Widget.present(
    <ZStack frame={{ width: c.l, height: c.h }} widgetURL={ouvrir}>
      {corps}
    </ZStack>,
    { policy: "after", date: new Date(prochain) },
  )
  return true
}
