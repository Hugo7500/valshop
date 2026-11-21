import { HStack, Rectangle, Spacer, VStack, ZStack, gradient, type Color, type VirtualNode } from "scripting"
import { C, CarteCouchee, CarteSkin, Din, Entete, Etiquette, ImageFichier, MARGE, Pastille, Prix, TuileSkin, fondWidget, mille } from "./widgets-briques"
import type { Accessoire, Cadre, Donnees, SkinVu } from "./widgets-types"
import { perimee } from "./widgets-verrou"

// Vues des widgets du lot 1 (étude des widgets) : Boutique, Solde, Bundle, Accessoires, Souhaits, Night Market, dans les tailles
// petite, moyenne, grande et très grande. Vues pures : `d`, les données déjà lues ; `c`, la taille du widget. Chaque taille
// se calcule depuis `c` : rien ne dépend d'un « infini » de mise en page.

export const ECART = 6
export const TETE = 18

/** La racine d'un widget : le fond, un calque de fond éventuel (image pleine largeur), puis le contenu dans ses marges. */
export function Racine({ c, teinte, force, fond, contenu, ecart }: { c: Cadre; teinte?: string; force?: number; fond?: VirtualNode; contenu: VirtualNode[]; ecart?: number }) {
  return (
    <ZStack frame={{ width: c.l, height: c.h }} background={fondWidget(teinte, force)} widgetBackground={fondWidget(teinte, force)}>
      {fond ?? null}
      <VStack alignment="leading" spacing={ecart ?? 8} frame={{ width: c.l - 2 * MARGE, height: c.h - 2 * MARGE, alignment: "topLeading" }}>
        {contenu}
      </VStack>
    </ZStack>
  )
}

/** Combien de temps la réponse à un appui sur ↻ reste dite. */
const DUREE_REPONSE_MS = 90_000


export function heure(ms: number): string {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}


function reponse(d: Donnees): { texte: string; couleur: Color } | null {
  if (d.sessionExpiree) return { texte: "SESSION EXPIRÉE", couleur: "#ff9f43" }
  const a = d.appui
  const recent = a !== null && Date.now() - a.t <= DUREE_REPONSE_MS && a.t <= Date.now() + 5_000
  if (a && recent && a.etat === "lecture") return { texte: "LECTURE…", couleur: C.doux }
  // Le reset passé, la boutique gardée est celle de la veille : le widget le dit, comme le widget d'avant (« expirée »).
  if (perimee(d, Date.now())) return { texte: "EXPIRÉE", couleur: "#ff9f43" }
  if (!a || !recent) return null
  if (a.etat === "a-jour") return { texte: "✓ À JOUR · " + heure(d.lueA ?? a.t), couleur: C.vert }
  return { texte: "NON LUE", couleur: "#ff9f43" }
}

/** L'en-tête de la boutique : le compte à rebours du reset, ou la réponse à un appui sur ↻. */
export function Tete({ d, bouton }: { d: Donnees; bouton?: boolean }) {
  return <Entete titre="BOUTIQUE" reset={d.reset} bouton={bouton} etat={reponse(d)} />
}

export const L = (c: Cadre) => c.l - 2 * MARGE
export const H = (c: Cadre) => c.h - 2 * MARGE
export const petit = (c: Cadre) => c.famille === "systemSmall"
export const moyen = (c: Cadre) => c.famille === "systemMedium"
export const grand = (c: Cadre) => c.famille === "systemLarge"
export const tresGrand = (c: Cadre) => c.famille.startsWith("systemExtraLarge")

/** Une rangée de cartes de skin en hauteur. `solde` : les prix à portée de ce nombre de VP passent en vert. */
export function Cartes({ skins, l, h, d, solde, court }: { skins: SkinVu[]; l: number; h: number; d: Donnees; solde?: number | null; court?: boolean }) {
  const n = Math.max(1, skins.length)
  const lc = (l - (n - 1) * ECART) / n
  return (
    <HStack spacing={ECART} frame={{ width: l, height: h }}>
      {skins.map((s) => (
        <CarteSkin skin={s} l={lc} h={h} monnaie={d.monnaies.vp} court={court} assez={solde != null && s.prix != null && solde >= s.prix} />
      ))}
    </HStack>
  )
}

/** Une grille de tuiles, `colonnes` par rangée. */
function Tuiles({ skins, l, h, colonnes, d }: { skins: SkinVu[]; l: number; h: number; colonnes: number; d: Donnees }) {
  const rangees: SkinVu[][] = []
  for (let i = 0; i < skins.length; i += colonnes) rangees.push(skins.slice(i, i + colonnes))
  const lt = (l - (colonnes - 1) * ECART) / colonnes
  const ht = (h - (rangees.length - 1) * ECART) / Math.max(1, rangees.length)
  return (
    <VStack spacing={ECART} frame={{ width: l, height: h, alignment: "topLeading" }}>
      {rangees.map((r) => (
        <HStack spacing={ECART} frame={{ width: l, height: ht, alignment: "leading" }}>
          {r.map((s) => <TuileSkin skin={s} l={lt} h={ht} monnaie={d.monnaies.vp} />)}
        </HStack>
      ))}
    </VStack>
  )
}

/** Les trois pastilles du solde ; rien pour une monnaie sans montant. */
function Pastilles({ d }: { d: Donnees }) {
  const s = d.solde
  if (!s) return <Spacer />
  return (
    <HStack spacing={5} frame={{ height: 20 }}>
      {s.vp != null ? <Pastille icone={d.monnaies.vp} texte={mille(s.vp)} unite="VP" accent /> : null}
      {s.rp != null ? <Pastille icone={d.monnaies.rp} texte={mille(s.rp)} unite="RP" /> : null}
      {s.kc != null ? <Pastille icone={d.monnaies.kc} texte={mille(s.kc)} unite="KC" /> : null}
      <Spacer />
    </HStack>
  )
}

// ─────────────────────────── Boutique ───────────────────────────

export function Boutique({ d, c }: { d: Donnees; c: Cadre }) {
  const corps = H(c) - TETE
  if (petit(c)) {
    return <Racine c={c} ecart={ECART} contenu={[<Tete d={d} />, <Tuiles skins={d.skins} l={L(c)} h={corps - ECART} colonnes={2} d={d} />]} />
  }
  if (moyen(c)) {
    return <Racine c={c} contenu={[<Tete d={d} bouton />, <Cartes skins={d.skins} l={L(c)} h={corps - 8} d={d} />]} />
  }
  if (tresGrand(c)) return <Tout d={d} c={c} />
  const hc = (corps - 8 - 3 * ECART) / 4
  return (
    <Racine c={c} contenu={[
      <Tete d={d} bouton />,
      <VStack spacing={ECART}>{d.skins.map((s) => <CarteCouchee skin={s} l={L(c)} h={hc} monnaie={d.monnaies.vp} />)}</VStack>,
    ]} />
  )
}

// ─────────────────────────── Solde ───────────────────────────

function LigneSolde({ icone, montant, unite }: { icone: string | null; montant: number; unite: string }) {
  return (
    <HStack spacing={8}>
      {icone ? <ImageFichier chemin={icone} l={17} h={17} /> : null}
      <Din t={mille(montant)} s={33} />
      <Spacer />
      <Etiquette t={unite} />
    </HStack>
  )
}

export function Solde({ d, c }: { d: Donnees; c: Cadre }) {
  if (!petit(c)) {
    const corps = H(c) - TETE - 8
    if (moyen(c)) {
      return <Racine c={c} ecart={7} contenu={[<Tete d={d} bouton />, <Cartes skins={d.skins} l={L(c)} h={corps - 20 - 6} d={d} solde={d.solde?.vp} court />, <Pastilles d={d} />]} />
    }
    return <Racine c={c} contenu={[<Tete d={d} bouton />, <Cartes skins={d.skins} l={L(c)} h={corps - 28} d={d} solde={d.solde?.vp} />, <Pastilles d={d} />]} />
  }
  const s = d.solde
  return (
    <Racine c={c} teinte="#ff4655" force={0.1} ecart={4} contenu={[
      <Entete titre="SOLDE" droite={s?.heure ?? undefined} />,
      <VStack spacing={0} frame={{ width: L(c), height: H(c) - TETE - 4 }}>
        <Spacer />
        {s?.vp != null ? <LigneSolde icone={d.monnaies.vp} montant={s.vp} unite="VP" /> : null}
        <Spacer />
        {s?.rp != null ? <LigneSolde icone={d.monnaies.rp} montant={s.rp} unite="RP" /> : null}
        <Spacer />
        {s?.kc != null ? <LigneSolde icone={d.monnaies.kc} montant={s.kc} unite="KC" /> : null}
        <Spacer />
      </VStack>,
    ]} />
  )
}

// ─────────────────────────── Bundle ───────────────────────────

export function Marque({ t, fond, couleur }: { t: string; fond?: Color; couleur?: Color }) {
  return (
    <ZStack padding={{ horizontal: 6, top: 4, bottom: 1 }} background={{ style: fond ?? C.rouge, shape: { type: "rect", cornerRadius: 3 } }}>
      <Din t={t} s={11} k={1.3} c={couleur} />
    </ZStack>
  )
}

/** L'image du bundle en haut du widget, sur toute la largeur, fondue vers le bas (`haut`) ou vers la gauche. */
function Affiche({ image, c, h, versGauche }: { image: string | null; c: Cadre; h: number; versGauche?: boolean }) {
  const sombre = "rgba(11,14,20,0.96)", clair = "rgba(11,14,20,0)"
  return (
    <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
      <ZStack frame={{ width: c.l, height: h }}>
        {image ? <ImageFichier chemin={image} l={c.l} h={h} remplir /> : null}
        <Rectangle fill={gradient("linear", { colors: ["rgba(11,14,20,0.7)", clair], startPoint: "top", endPoint: "center" })} frame={{ width: c.l, height: h }} />
        {versGauche
          ? <Rectangle fill={gradient("linear", { colors: [sombre, "rgba(11,14,20,0.55)", clair], startPoint: "leading", endPoint: "trailing" })} frame={{ width: c.l, height: h }} />
          : <Rectangle fill={gradient("linear", { colors: [clair, "rgba(11,14,20,0.25)", "rgba(11,14,20,0.82)", "#0b0e14"], startPoint: "top", endPoint: "bottom" })} frame={{ width: c.l, height: h }} />}
      </ZStack>
      <Spacer />
    </VStack>
  )
}

export function Bundle({ d, c }: { d: Donnees; c: Cadre }) {
  const b = d.bundle
  if (!b) return <Boutique d={d} c={c} />
  if (petit(c)) {
    return (
      <Racine c={c} fond={<Affiche image={b.image} c={c} h={c.h} />} contenu={[
        <Entete titre="BUNDLE" droite={b.fin.replace("jusqu'au ", "")} />,
        <Spacer />,
        <Din t={b.nom.toUpperCase()} s={31} />,
        <Pastille icone={d.monnaies.vp} texte={b.prix == null ? "—" : mille(b.prix)} accent />,
      ]} ecart={4} />
    )
  }
  if (moyen(c)) {
    return (
      <Racine c={c} fond={<Affiche image={b.image} c={c} h={c.h} versGauche />} contenu={[
        <Entete titre="BUNDLE" droite={b.fin.toUpperCase()} />,
        <Spacer />,
        <Marque t="EN VEDETTE" />,
        <Din t={b.nom.toUpperCase()} s={46} />,
        <Pastille icone={d.monnaies.vp} texte={b.prix == null ? "—" : mille(b.prix)} unite="VP" accent />,
      ]} ecart={4} />
    )
  }
  const hCartes = Math.min(150, H(c) * 0.42)
  const hAffiche = c.h - hCartes - MARGE - 2
  return (
    <Racine c={c} fond={<Affiche image={b.image} c={c} h={hAffiche} />} contenu={[
      <Tete d={d} bouton />,
      <Spacer />,
      <Marque t="BUNDLE EN VEDETTE" />,
      <HStack alignment="bottom" spacing={8} frame={{ width: L(c) }}>
        <Din t={b.nom.toUpperCase()} s={40} />
        <Spacer />
        <Pastille icone={d.monnaies.vp} texte={b.prix == null ? "—" : mille(b.prix)} accent />
      </HStack>,
      <Etiquette t={b.objets == null ? b.fin : `${b.fin} · ${b.objets} objets`} />,
      <Cartes skins={d.skins} l={L(c)} h={hCartes} d={d} />,
    ]} ecart={5} />
  )
}

// ─────────────────────────── Accessoires ───────────────────────────

function CarteAccessoire({ a, l, h, d, petite }: { a: Accessoire; l: number; h: number; d: Donnees; petite?: boolean }) {
  const cote = petite ? Math.min(36, h - 26) : Math.min(58, h - 46)
  return (
    <VStack spacing={2} padding={{ top: petite ? 5 : 8, bottom: petite ? 4 : 7, horizontal: 5 }} frame={{ width: l, height: h }}
      background={{ style: gradient("radial", { colors: ["#28405c", "#11151b"], center: "top", startRadius: 0, endRadius: h * 0.8 }), shape: { type: "rect", cornerRadius: petite ? 10 : 12 } }}>
      {a.icone
        ? <ImageFichier chemin={a.icone} l={cote} h={cote} ombre />
        : <ZStack frame={{ width: l - 8, height: cote }}><Din t={a.nom.toUpperCase()} s={petite ? 15 : 19} k={1} /></ZStack>}
      <Spacer />
      {petite ? null : <Etiquette t={a.type} s={7.5} />}
      <Prix montant={a.prix} icone={d.monnaies.kc} s={14} />
    </VStack>
  )
}

function RangeeAccessoires({ d, l, h, petite }: { d: Donnees; l: number; h: number; petite?: boolean }) {
  const n = Math.max(1, d.accessoires.length)
  const la = (l - (n - 1) * ECART) / n
  return <HStack spacing={ECART} frame={{ width: l, height: h }}>{d.accessoires.map((a) => <CarteAccessoire a={a} l={la} h={h} d={d} petite={petite} />)}</HStack>
}

function EnteteAccessoires({ d, court }: { d: Donnees; court?: boolean }) {
  const fin = d.finAccessoires ?? ""
  return (
    <Entete titre="ACCESSOIRES" accent={C.bleu} droite={court ? fin.replace("jusqu'au ", "") : fin.toUpperCase()}
      suite={!court && d.solde?.kc != null ? <Pastille icone={d.monnaies.kc} texte={mille(d.solde.kc)} h={18} /> : undefined} />
  )
}

export function Accessoires({ d, c }: { d: Donnees; c: Cadre }) {
  if (petit(c)) {
    const l = (L(c) - ECART) / 2, h = (H(c) - TETE - 2 * ECART) / 2
    const [a, b, e, f] = d.accessoires
    return (
      <Racine c={c} ecart={ECART} contenu={[
        <EnteteAccessoires d={d} court />,
        <HStack spacing={ECART}>{[a, b].filter(Boolean).map((x) => <CarteAccessoire a={x} l={l} h={h} d={d} petite />)}</HStack>,
        <HStack spacing={ECART}>{[e, f].filter(Boolean).map((x) => <CarteAccessoire a={x} l={l} h={h} d={d} petite />)}</HStack>,
      ]} />
    )
  }
  if (moyen(c)) return <Racine c={c} contenu={[<EnteteAccessoires d={d} />, <RangeeAccessoires d={d} l={L(c)} h={H(c) - TETE - 8} />]} />
  const reste = H(c) - 2 * TETE - 3 * 8
  const hCartes = Math.min(158, reste * 0.52)
  return (
    <Racine c={c} contenu={[
      <Tete d={d} bouton />,
      <Cartes skins={d.skins} l={L(c)} h={hCartes} d={d} />,
      <EnteteAccessoires d={d} />,
      <RangeeAccessoires d={d} l={L(c)} h={reste - hCartes} />,
    ]} />
  )
}

// ─────────────────────────── Souhaits ───────────────────────────

export function Souhaits({ d, c }: { d: Donnees; c: Cadre }) {
  const s = d.souhait
  const suivis = d.souhaitsSuivis
  // Souhaits pas encore sus, ou boutique de la veille (reset passé) : la boutique, dont l'en-tête dit alors « EXPIRÉE ».
  if (suivis == null || perimee(d, Date.now())) return <Boutique d={d} c={c} />
  if (!s) {
    // En grand : sous le compte des skins suivis, la boutique du jour, pour que le widget ne reste pas vide.
    if (grand(c) && d.skins.length > 0) {
      const hCartes = Math.min(168, H(c) * 0.5)
      return (
        <Racine c={c} ecart={2} contenu={[
          <Entete titre="SOUHAITS" accent={C.or} reset={d.reset} />,
          <Spacer />,
          <HStack alignment="lastTextBaseline" spacing={8}>
            <Din t={String(suivis)} s={58} />
            <VStack alignment="leading" spacing={0}>
              <Din t={suivis > 1 ? "SKINS SUIVIS" : "SKIN SUIVI"} s={20} />
              <Etiquette t="Aucun aujourd'hui" />
            </VStack>
          </HStack>,
          <Spacer />,
          <Etiquette t="Ta boutique du jour" s={7.5} />,
          <ZStack frame={{ width: L(c), height: 4 }} />,
          <Cartes skins={d.skins} l={L(c)} h={hCartes} d={d} />,
        ]} />
      )
    }
    return (
      <Racine c={c} ecart={2} contenu={[
        <Entete titre="SOUHAITS" accent={C.or} reset={d.reset} />,
        <Spacer />,
        <Din t={String(suivis)} s={58} />,
        <Din t={suivis > 1 ? "SKINS SUIVIS" : "SKIN SUIVI"} s={20} />,
        <Etiquette t="Aucun aujourd'hui" />,
      ]} />
    )
  }
  // En grand : l'arme en haut sur toute la largeur, son nom et son prix dessous, puis les autres skins du jour.
  if (grand(c)) {
    const autres = d.skins.filter((x) => !(x.nom === s.nom && x.arme === s.arme && x.prix === s.prix))
    const li = c.l * 0.9
    const hCartes = 92
    return (
      <Racine c={c} teinte="#ffd166" ecart={6}
        fond={s.icone ? (
          <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
            <ZStack frame={{ width: c.l, height: c.h * 0.52 }}><ImageFichier chemin={s.icone} l={li} h={li / 2.8} rotation={-18} ombre dy={10} /></ZStack>
            <Spacer />
          </VStack>
        ) : undefined}
        contenu={[
          <Entete titre="★ DANS TA BOUTIQUE" accent={null} couleurTitre={C.or} reset={d.reset} />,
          <Spacer />,
          <HStack alignment="bottom" spacing={8}>
            <VStack alignment="leading" spacing={0}>
              <Etiquette t={s.arme} />
              <Din t={s.nom.toUpperCase()} s={50} />
            </VStack>
            <Spacer />
            <VStack alignment="trailing" spacing={5}>
              <Pastille icone={d.monnaies.vp} texte={s.prix == null ? "—" : mille(s.prix)} unite="VP" accent />
              <Etiquette t={suivis > 1 ? `${suivis - 1} autres skins suivis` : "seul skin suivi"} />
            </VStack>
          </HStack>,
          ...(autres.length > 0 ? [
            <Etiquette t="Aussi dans ta boutique" s={7.5} />,
            <Cartes skins={autres} l={L(c)} h={hCartes} d={d} court />,
          ] : []),
        ]} />
    )
  }
  if (petit(c)) {
    const li = c.l * 1.16
    return (
      <Racine c={c} teinte="#ffd166" ecart={2}
        fond={s.icone ? <ZStack frame={{ width: c.l, height: c.h }}><ImageFichier chemin={s.icone} l={li} h={li / 2.8} rotation={-24} ombre dy={c.h * 0.01} /></ZStack> : undefined}
        contenu={[
          <Entete titre="★ DANS TA BOUTIQUE" accent={null} couleurTitre={C.or} />,
          <Spacer />,
          <Etiquette t={s.arme} />,
          <HStack alignment="bottom" spacing={6}><Din t={s.nom.toUpperCase()} s={24} /><Spacer /><Prix montant={s.prix} icone={d.monnaies.vp} /></HStack>,
        ]} />
    )
  }
  const moitie = c.l * 0.52
  const li = moitie * 1.08
  return (
    <Racine c={c} teinte="#ffd166" ecart={4}
      fond={s.icone ? (
        <HStack spacing={0} frame={{ width: c.l, height: c.h }}>
          <ZStack frame={{ width: moitie, height: c.h }}><ImageFichier chemin={s.icone} l={li} h={li / 2.8} rotation={-24} ombre /></ZStack>
          <Spacer />
        </HStack>
      ) : undefined}
      contenu={[
        <HStack spacing={0} frame={{ width: L(c), height: H(c) }}>
          <Spacer />
          <VStack alignment="leading" spacing={4} frame={{ width: L(c) - moitie + MARGE, height: H(c), alignment: "topLeading" }}>
            <Entete titre="★ DANS TA BOUTIQUE" accent={null} couleurTitre={C.or} />
            <Spacer />
            <Etiquette t={s.arme} />
            <Din t={s.nom.toUpperCase()} s={46} />
            <HStack spacing={7}>
              <Pastille icone={d.monnaies.vp} texte={s.prix == null ? "—" : mille(s.prix)} unite="VP" accent />
              <Spacer />
            </HStack>
            <Etiquette t={suivis > 1 ? `${suivis - 1} autres skins suivis` : "seul skin suivi"} />
          </VStack>
        </HStack>,
      ]} />
  )
}

// ─────────────────────────── Night Market ───────────────────────────

export function Nuit({ d, c }: { d: Donnees; c: Cadre }) {
  const n = d.nuit
  if (!n || petit(c)) return <Boutique d={d} c={c} />
  const tete = <Entete titre="NIGHT MARKET" accent={C.violet} droite={n.fin.toUpperCase()} />
  const corps = H(c) - TETE
  if (moyen(c)) return <Racine c={c} teinte="#b56cff" ecart={ECART} contenu={[tete, <Tuiles skins={n.skins} l={L(c)} h={corps - ECART} colonnes={3} d={d} />]} />
  const h = (corps - 8 - ECART) / 2
  return (
    <Racine c={c} teinte="#b56cff" contenu={[
      tete,
      <VStack spacing={ECART}>
        <Cartes skins={n.skins.slice(0, 3)} l={L(c)} h={h} d={d} />
        <Cartes skins={n.skins.slice(3, 6)} l={L(c)} h={h} d={d} />
      </VStack>,
    ]} />
  )
}

// ─────────────────────────── Très grand : tout ce que le lot 1 sait montrer ───────────────────────────

export function Tout({ d, c }: { d: Donnees; c: Cadre }) {
  const b = d.bundle
  const hCartes = 150, hAcc = 112
  const hAffiche = c.h - hCartes - hAcc - TETE - 20 - 4 * 8 - MARGE
  return (
    <Racine c={c} fond={b ? <Affiche image={b.image} c={c} h={hAffiche} /> : undefined} contenu={[
      <Tete d={d} bouton />,
      <Spacer />,
      ...(b ? [
        <Marque t="BUNDLE EN VEDETTE" />,
        <HStack alignment="bottom" spacing={8} frame={{ width: L(c) }}>
          <Din t={b.nom.toUpperCase()} s={40} />
          <Spacer />
          <Pastille icone={d.monnaies.vp} texte={b.prix == null ? "—" : mille(b.prix)} accent />
        </HStack>,
      ] : []),
      <Cartes skins={d.skins} l={L(c)} h={hCartes} d={d} solde={d.solde?.vp} />,
      <EnteteAccessoires d={d} />,
      <RangeeAccessoires d={d} l={L(c)} h={hAcc} />,
      <Pastilles d={d} />,
    ]} ecart={8} />
  )
}
