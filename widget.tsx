import {
  VStack, HStack, ZStack, Text, Image, Button, Spacer, Widget, Script, gradient, type Color,
} from "scripting"
import { RefreshShop } from "./app_intents"
import { deciderLecture, sessionExpiree } from "./garde-fou"
import { ETAT_FILE, SHOP_FILE } from "./valshop"
import { iconeLisible } from "./securite"
import { lireReglageGarde } from "./widgets-fichier"
import { CARROUSEL, CLASSIQUE, carrouselDe, contenuDe, numeroDe, periodeDe, tailleDe } from "./widgets-reglage"
import type { CarrouselRegle } from "./widgets-entree"

// Le widget ne va JAMAIS sur le réseau de lui-même et n'écrit rien : il lit shop.json,
// etat.json et les icônes que la dernière mise à jour a mises en cache, et offre un
// bouton pour en demander une. Seule exception : une icône restée en adresse web, que
// le moteur n'écrit plus, se chargerait depuis le réseau. Du moteur (valshop.ts, déjà
// chargé pour RefreshShop), il ne prend que les chemins de ces fichiers.

const TILE: Color = "#161c23"
const GAP = 6










const SCRIPT = Script.name || "valshop-s0"
const OUVRIR_VUE = Script.createRunSingleURLScheme(SCRIPT, { ouvrir: "vue" })
const OUVRIR_CONNEXION = Script.createRunSingleURLScheme(SCRIPT, { ouvrir: "connexion" })

type Item = { name: string; cost: number | null; icon: string | null; color: string | null }
type Shop = {
  updatedAt: string
  daily: { items: Item[]; resetAt: string | null }
  nightMarket?: { active: boolean }
}

function load(): Shop | null {
  try {
    if (!FileManager.existsSync(SHOP_FILE)) return null
    return JSON.parse(FileManager.readAsStringSync(SHOP_FILE)) as Shop
  } catch {
    return null
  }
}

/** La session Riot est-elle morte, d'après etat.json ? Non si le fichier est absent ou illisible. */
function sessionMorte(): boolean {
  try {
    return FileManager.existsSync(ETAT_FILE) && sessionExpiree(FileManager.readAsStringSync(ETAT_FILE))
  } catch {
    return false
  }
}

/** Mélange la couleur de rareté au fond sombre : la lueur du bas de la tuile. */
function mix(hex: string | null, k: number): Color {
  if (!hex || hex.length < 7) return TILE
  const part = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16)
  const c = (a: number, b: number) =>
    Math.round(a * k + b * (1 - k)).toString(16).padStart(2, "0")
  return ("#" +
    c(part(hex, 1), part(TILE, 1)) +
    c(part(hex, 3), part(TILE, 3)) +
    c(part(hex, 5), part(TILE, 5))) as Color
}

/** « Vandal (Glitchpop) » → skin « Glitchpop », arme « VANDAL ». */
function split(n: string): { skin: string; weapon: string } {
  const m = n.match(/^(.*?)\s*\((.*)\)$/)
  return m ? { skin: m[2], weapon: m[1].toUpperCase() } : { skin: n, weapon: "" }
}

function remaining(iso: string | null): string {
  if (!iso) return ""
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "expirée"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`
}

function Visuel({ item, dense }: { item: Item; dense: boolean }) {
  // Ticket 7.8 (F3) : une adresse web seulement de media.valorant-api.com ; entrée 16 de epic-boutique-visuels : un chemin
  // local, par son seul nom de fichier, dans `icons/` du dossier partagé d'aujourd'hui (securite.ts, iconeLisible) ; sinon rien.
  const icone = iconeLisible(item.icon, FileManager.appGroupDocumentsDirectory)
  if (icone === null) return null
  // Largeur FIXE, et surtout jamais "infinity" : une image redimensionnable
  // sans borne réclame toute la place disponible et fait déborder la rangée.
  const cadre = dense ? { width: 52, height: 22 } : { width: 68, height: 30 }
  // Le moteur n'écrit que le chemin de l'icône en cache, ou null ; une adresse web,
  // que le contrat permet encore, s'afficherait quand même, depuis le réseau.
  return icone.startsWith("http") ? (
    <Image imageUrl={icone} resizable scaleToFit frame={cadre} />
  ) : (
    <Image filePath={icone} resizable scaleToFit frame={cadre} />
  )
}

function Tuile({ item, dense }: { item: Item; dense: boolean }) {
  const { skin, weapon } = split(item.name)
  return (
    <ZStack
      alignment="bottom"
      // Les deux tuiles se partagent la largeur restante. Cela ne fonctionne
      // que parce que leur contenu, image comprise, a une largeur bornée.
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      padding={{ horizontal: 6, bottom: 4, top: 2 }}
      background={{
        style: gradient("linear", {
          colors: [mix(item.color, 0.55), TILE],
          startPoint: "bottom",
          endPoint: "top",
        }),
        shape: { type: "rect", cornerRadius: 10 },
      }}
    >
      <VStack spacing={0}>
        <Visuel item={item} dense={dense} />
        <Spacer />
      </VStack>

      <HStack alignment="bottom" spacing={4}>
        <VStack alignment="leading" spacing={0}>
          <Text font="caption2" fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>
            {skin}
          </Text>
          {weapon && !dense ? (
            <Text
              font="caption2"
              foregroundStyle="secondaryLabel"
              lineLimit={1}
              minScaleFactor={0.6}
            >
              {weapon}
            </Text>
          ) : null}
        </VStack>
        <Spacer />
        <Text font="caption2" fontWeight="bold" monospacedDigit lineLimit={1} minScaleFactor={0.7}>
          {item.cost ?? "—"}
        </Text>
      </HStack>
    </ZStack>
  )
}

function Entete({ shop, expiree }: { shop: Shop; expiree: boolean }) {
  // « ↻ ! » quand l'appui suivant lirait Riot (reset passé sans nouvelle lecture) :
  // la règle même du garde-fou, pas une seconde formule.
  const lecture = deciderLecture(Date.now(), shop) === "lecture"
  return (
    <HStack spacing={5}>
      <Text font="caption2" fontWeight="black" foregroundStyle="secondaryLabel" lineLimit={1}>
        BOUTIQUE
      </Text>
      <Text
        font="caption2"
        foregroundStyle={expiree ? "orange" : "tertiaryLabel"}
        monospacedDigit
        lineLimit={1}
        minScaleFactor={0.6}
      >
        {expiree ? "session expirée" : remaining(shop.daily.resetAt)}
      </Text>
      <Spacer />
      {shop.nightMarket?.active ? (
        <Text font="caption2" fontWeight="bold" foregroundStyle="orange">
          NM
        </Text>
      ) : null}
      <Button
        title={lecture ? "↻ !" : "↻"}
        intent={RefreshShop(undefined)}
        buttonStyle="plain"
        font="caption"
        foregroundStyle={lecture ? "orange" : "secondaryLabel"}
      />
    </HStack>
  )
}

function Vide() {
  // Sans boutique, la vue n'aurait rien à montrer : l'appui mène à la connexion.
  return (
    <VStack spacing={6} widgetURL={OUVRIR_CONNEXION}>
      <Text font="headline">ValShop</Text>
      <Text font="caption" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        Ouvre l'app une fois pour te connecter.
      </Text>
      <Button title="Actualiser" intent={RefreshShop(undefined)} />
    </VStack>
  )
}

function Boutique({ shop, expiree }: { shop: Shop; expiree: boolean }) {
  const dense = Widget.family === "systemSmall"
  const it = shop.daily.items
  const paires = [it.slice(0, 2), it.slice(2, 4)].filter((p) => p.length > 0)

  return (
    <VStack
      alignment="leading"
      spacing={GAP}
      padding={12}
      widgetURL={expiree ? OUVRIR_CONNEXION : OUVRIR_VUE}
    >
      <Entete shop={shop} expiree={expiree} />
      {paires.map((paire) => (
        <HStack spacing={GAP} frame={{ maxHeight: "infinity" }}>
          {paire.map((item) => (
            <Tuile item={item} dense={dense} />
          ))}
        </HStack>
      ))}
    </VStack>
  )
}

/** Le widget ordinaire : la boutique gardée, ou l'invitation à ouvrir l'app. */
function presenter() {
  const shop = load()
  const expiree = sessionMorte()
  Widget.present(shop ? <Boutique shop={shop} expiree={expiree} /> : <Vide />, {
    policy: "after",
    date: new Date(Date.now() + 30 * 60 * 1000),
  })
}

// Lot 1 de l'étude des widgets : l'écran « Mes widgets » (widgets.json) dit quel contenu montre chaque widget, par taille ; un widget
// se désigne par le nombre écrit dans sa case « Paramètre » (rien : le 1). Sans réglage, ou si le nouveau widget ne se charge pas
// ou n'a pas de boutique à montrer : le widget ordinaire ci-dessus, inchangé. Les nouveaux widgets sont chargés ici seulement
// (widgets-entree.tsx), pour que rien d'eux ne pèse sur le widget ordinaire.
let mot = ""
try {
  mot = String(Widget.parameter ?? "").trim().toLowerCase()
} catch { /* sans paramètre lisible : le widget 1 */ }
let contenu = CLASSIQUE
let periode: string | undefined
// Lot 3 : le carrousel de ce widget, si c'est ce qu'il montre. Lot 4 : sur l'écran verrouillé, où le widget ordinaire ne
// tient pas, un widget sans réglage montre le premier contenu de sa forme (contenuDe), jamais « classique ».
let car: CarrouselRegle | undefined
try {
  const reglage = lireReglageGarde()
  const numero = numeroDe(mot)
  const taille = tailleDe(Widget.family)
  contenu = contenuDe(reglage, numero, taille)
  periode = periodeDe(reglage, numero)
  if (contenu === CARROUSEL && taille !== null) car = { ...carrouselDe(reglage, numero, taille), numero, taille }
} catch { /* réglage illisible : le widget ordinaire */ }
if (contenu !== CLASSIQUE) {
  import("./widgets-entree").then((m) => {
    if (!m.presenterWidget(contenu, periode, car)) presenter()
  }).catch(() => {
    // Sur l'écran verrouillé, le widget ordinaire ne tient pas : un mot suffit.
    if (String(Widget.family).startsWith("accessory")) Widget.present(<Text>ValShop</Text>)
    else presenter()
  })
} else {
  presenter()
}
