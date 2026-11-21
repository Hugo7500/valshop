import { HStack, PathShape, Rectangle, Spacer, Text, VStack, ZStack, gradient, type Color, type VirtualNode } from "scripting"
import { C, Din, Entete, Etiquette, ImageFichier, MARGE, Pastille, fondWidget, mix } from "./widgets-briques"
import type { Cadre, Chiffre, Constat, Donnees, Issue, PartieVue, Stats } from "./widgets-types"
import { Boutique, Cartes, H, L, Marque, Racine, TETE, Tete, grand, moyen, petit } from "./widgets-vues"

// Vues des widgets de stats (lots 2 et 3 de l'étude des widgets) : Stats, Boutique + Stats, Dernière partie, Le chiffre du jour.
// Vues pures, comme celles du lot 1 : `d.stats` et `d.jour` sont des résumés déjà calculés par l'app ; sans eux, la boutique.
// Exact ou absent : un rang, un chiffre ou une courbe qui manque n'est pas dessiné.

const DORE = "#eccf56" as Color
const ORANGE = "#ff9f43" as Color
const ROUGE = "#ff7783" as Color

/** La couleur d'une issue : vert pour une victoire, rouge pour une défaite, gris pour un nul. */
const couleurIssue = (i: Issue): Color => (i === "V" ? C.vert : i === "D" ? ROUGE : C.doux)

/** Sans résumé des stats (onglet Stats jamais ouvert, ou autre compte) : le widget dit quoi faire, il ne montre aucun chiffre. */
function Invite({ c, titre, lignes }: { c: Cadre; titre: string; lignes?: [string, string, string] }) {
  const l = lignes ?? ["OUVRE L'ONGLET", "STATS", petit(c) ? "dans ValShop" : "dans ValShop, pour remplir ce widget"]
  return (
    <Racine c={c} teinte={DORE} force={0.1} ecart={3} contenu={[
      <Entete titre={titre} accent={DORE} />,
      <Spacer />,
      <Din t={l[0]} s={petit(c) ? 22 : 28} />,
      <Din t={l[1]} s={petit(c) ? 22 : 28} c={DORE} />,
      <Etiquette t={l[2]} s={7.5} />,
    ]} />
  )
}

/** Le rang : son emblème, son nom, la barre des RR (sur 100) et la variation de la dernière partie. */
function BlocRang({ s, t, l }: { s: Stats; t: number; l: number }) {
  const r = s.rang
  if (!r) return <Spacer />
  const barre = l - t - 8
  const part = r.rr == null ? 0 : Math.max(0, Math.min(1, r.rr / 100))
  return (
    <HStack spacing={8} frame={{ width: l, height: t, alignment: "leading" }}>
      {r.icone ? <ImageFichier chemin={r.icone} l={t} h={t} /> : null}
      <VStack alignment="leading" spacing={2} frame={{ width: barre, alignment: "leading" }}>
        <Din t={r.nom.toUpperCase()} s={26} />
        {r.rr != null ? (
          <ZStack alignment="leading" frame={{ width: barre, height: 5 }}>
            <Rectangle fill="rgba(255,255,255,0.14)" frame={{ width: barre, height: 5 }} clipShape="capsule" />
            <Rectangle fill={gradient("linear", { colors: [DORE, "#fff3b8"], startPoint: "leading", endPoint: "trailing" })} frame={{ width: Math.max(5, barre * part), height: 5 }} clipShape="capsule" />
          </ZStack>
        ) : null}
        <HStack spacing={0} frame={{ width: barre }}>
          {r.rr != null ? <Din t={`${r.rr} RR`} s={12} c={C.doux} k={0.8} /> : null}
          <Spacer />
          {r.variation != null ? <Din t={(r.variation >= 0 ? "+" : "−") + Math.abs(r.variation)} s={12} c={r.variation >= 0 ? C.vert : "#ff7783"} k={0.8} /> : null}
        </HStack>
      </VStack>
    </HStack>
  )
}

/** Les derniers résultats : une case par partie, « V » en vert, « D » en rouge, « N » (nul) en gris. */
function Derniers({ s, l }: { s: Stats; l: number }) {
  const n = Math.max(1, s.derniers.length)
  const lc = Math.min(20, (l - (n - 1) * 3) / n)
  return (
    <HStack spacing={3} frame={{ width: l, alignment: "leading" }}>
      {s.derniers.map((v) => (
        <ZStack frame={{ width: lc, height: 17 }} background={{ style: v === "V" ? "rgba(74,222,128,0.2)" : v === "D" ? "rgba(255,70,85,0.22)" : "rgba(255,255,255,0.12)", shape: { type: "rect", cornerRadius: 4 } }}>
          <Din t={v} s={12} c={couleurIssue(v)} k={0} />
        </ZStack>
      ))}
    </HStack>
  )
}

/** Un chiffre : sa valeur en grand, son unité, son libellé et sa tendance. */
function UnChiffre({ x, s, court, l }: { x: Chiffre; s: number; court?: boolean; l: number }) {
  return (
    <VStack alignment="leading" spacing={0} frame={{ width: l, alignment: "leading" }}>
      <HStack alignment="lastTextBaseline" spacing={2}>
        <Din t={x.valeur} s={s} />
        {x.unite ? <Din t={x.unite} s={s * 0.55} /> : null}
        {x.hausse === null ? null : <Text font={8} foregroundStyle={x.hausse ? C.vert : "#ff7783"}>{x.hausse ? "▲" : "▼"}</Text>}
      </HStack>
      <Etiquette t={court ? x.court : x.libelle} s={7.5} />
    </VStack>
  )
}

function Chiffres({ s, l, taille, court }: { s: Stats; l: number; taille: number; court?: boolean }) {
  const n = Math.max(1, s.chiffres.length)
  return <HStack spacing={0} frame={{ width: l, alignment: "leading" }}>{s.chiffres.map((x) => <UnChiffre x={x} s={taille} court={court} l={l / n} />)}</HStack>
}

/** La courbe des RR : le trait vert sur son dégradé ; rien pour moins de deux points. */
function Courbe({ points, l, h }: { points: number[]; l: number; h: number }) {
  if (points.length < 2) return <Spacer />
  const min = Math.min(...points), max = Math.max(...points)
  const pt = (i: number) => ({ x: (i / (points.length - 1)) * l, y: 3 + (1 - (max === min ? 0.5 : (points[i] - min) / (max - min))) * (h - 6) })
  return (
    <ZStack frame={{ width: l, height: h }}>
      <PathShape frame={{ width: l, height: h }} fill={gradient("linear", { colors: ["rgba(74,222,128,0.42)", "rgba(74,222,128,0)"], startPoint: "top", endPoint: "bottom" })}
        draw={(p) => { p.move({ x: 0, y: h }); for (let i = 0; i < points.length; i++) p.addLine(pt(i)); p.addLine({ x: l, y: h }); p.closeSubpath() }} />
      <PathShape frame={{ width: l, height: h }} stroke={{ shapeStyle: C.vert, strokeStyle: { lineWidth: 2.5, lineCap: "round", lineJoin: "round" } }}
        draw={(p) => { p.move(pt(0)); for (let i = 1; i < points.length; i++) p.addLine(pt(i)) }} />
    </ZStack>
  )
}

/** Une partie, sur une ligne : agent, carte, score, K/D/A, RR. */
function LignePartie({ p, l }: { p: PartieVue; l: number }) {
  const couleur = couleurIssue(p.issue)
  return (
    <HStack spacing={8} padding={{ leading: 6, trailing: 9 }} frame={{ width: l, height: 27 }} background={{ style: "rgba(255,255,255,0.055)", shape: { type: "rect", cornerRadius: 8 } }}>
      <Rectangle fill={couleur} frame={{ width: 3, height: 17 }} clipShape="capsule" />
      {p.icone ? <ImageFichier chemin={p.icone} l={20} h={20} /> : null}
      <Din t={(p.carte ?? "—").toUpperCase()} s={14} />
      <Spacer />
      <Din t={`${p.pour}–${p.contre}`} s={14} c={couleur} />
      {p.kda != null ? <Din t={p.kda.replace(/ /g, "")} s={14} c={C.doux} /> : null}
      {p.rr != null ? <Din t={(p.rr >= 0 ? "+" : "−") + Math.abs(p.rr)} s={14} c={couleur} /> : null}
    </HStack>
  )
}

/** Le fond d'un bloc de chiffres. */
function Panneau({ l, contenu, marge }: { l: number; contenu: VirtualNode[]; marge?: number }) {
  return (
    <VStack alignment="leading" spacing={9} padding={{ horizontal: 12, vertical: marge ?? 10 }} frame={{ width: l, alignment: "leading" }}
      background={{ style: "rgba(255,255,255,0.045)", shape: { type: "rect", cornerRadius: 14 } }}>
      {contenu}
    </VStack>
  )
}

const teteStats = (s: Stats, long: boolean) => <Entete titre="COMPÉTITION" accent={DORE} droite={long ? `${s.periode}${s.majA ? " · màj " + s.majA : ""}`.toUpperCase() : undefined} />

// ─────────────────────────── Stats ───────────────────────────

export function StatsVue({ d, c }: { d: Donnees; c: Cadre }) {
  const s = d.stats
  if (!s) return <Invite c={c} titre="COMPÉTITION" />
  if (petit(c)) {
    return (
      <Racine c={c} teinte={DORE} force={0.1} ecart={7} contenu={[
        teteStats(s, false),
        <BlocRang s={s} t={Math.min(54, c.l * 0.33)} l={L(c)} />,
        <Spacer />,
        ...(s.derniers.length > 0 ? [<Etiquette t={s.derniers.length > 1 ? `${s.derniers.length} dernières parties` : "Dernière partie"} s={7.5} />] : []),
        <Derniers s={s} l={L(c)} />,
      ]} />
    )
  }
  if (moyen(c)) {
    const gauche = 132, droite = L(c) - gauche - 14, corps = H(c) - TETE - 8
    return (
      <Racine c={c} teinte={DORE} force={0.1} contenu={[
        teteStats(s, true),
        <HStack alignment="top" spacing={14} frame={{ width: L(c), height: corps }}>
          <VStack alignment="leading" spacing={0} frame={{ width: gauche, height: corps }}>
            <BlocRang s={s} t={50} l={gauche} />
            <Spacer />
            <Derniers s={s} l={gauche} />
          </VStack>
          <VStack alignment="leading" spacing={6} frame={{ width: droite, height: corps }}>
            <Chiffres s={s} l={droite} taille={30} court />
            <Courbe points={s.courbe} l={droite} h={corps - 54} />
          </VStack>
        </HStack>,
      ]} />
    )
  }
  const parties = s.parties.slice(0, 3)
  const hCourbe = H(c) - TETE - 58 - 64 - parties.length * 31 - 5 * 8
  return (
    <Racine c={c} teinte={DORE} force={0.1} contenu={[
      teteStats(s, true),
      <HStack spacing={14} frame={{ width: L(c), height: 58 }}>
        <BlocRang s={s} t={58} l={L(c) - 112 - 14} />
        <Derniers s={s} l={112} />
      </HStack>,
      <Panneau l={L(c)} marge={8} contenu={[<Chiffres s={s} l={L(c) - 24} taille={34} />]} />,
      <VStack alignment="leading" spacing={2}>
        {s.courbe.length > 1 ? <Etiquette t={s.courbe.length > 2 ? `RR · ${s.courbe.length - 1} dernières parties classées` : "RR · dernière partie classée"} s={7.5} /> : null}
        <Courbe points={s.courbe} l={L(c)} h={Math.max(40, hCourbe + 22)} />
      </VStack>,
      <VStack spacing={4}>{parties.map((p) => <LignePartie p={p} l={L(c)} />)}</VStack>,
    ]} />
  )
}

/** Grand : la boutique du jour en haut, la forme en bas. */
export function BoutiqueStats({ d, c }: { d: Donnees; c: Cadre }) {
  const s = d.stats
  if (!s || petit(c) || moyen(c)) return <Boutique d={d} c={c} />
  const hCartes = Math.min(158, H(c) * 0.44)
  return (
    <Racine c={c} contenu={[
      <Tete d={d} bouton />,
      <Cartes skins={d.skins} l={L(c)} h={hCartes} d={d} />,
      <VStack alignment="leading" spacing={0} padding={{ horizontal: 12, vertical: 10 }} frame={{ width: L(c), height: H(c) - TETE - hCartes - 16, alignment: "topLeading" }}
        background={{ style: "rgba(255,255,255,0.045)", shape: { type: "rect", cornerRadius: 14 } }}>
        <HStack spacing={0} frame={{ width: L(c) - 24 }}>
          <Etiquette t={`Compétition · ${s.periode}`} s={7.5} />
          <Spacer />
          {s.majA ? <Etiquette t={`màj ${s.majA}`} s={7.5} /> : null}
        </HStack>
        <Spacer />
        <HStack spacing={12} frame={{ width: L(c) - 24 }}>
          <BlocRang s={s} t={50} l={L(c) - 24 - 112 - 12} />
          <Derniers s={s} l={112} />
        </HStack>
        <Spacer />
        <Chiffres s={s} l={L(c) - 24} taille={34} />
      </VStack>,
    ]} />
  )
}

// ─────────────────────────── Dernière partie ───────────────────────────

function Score({ p, s }: { p: PartieVue; s: number }) {
  return (
    <HStack alignment="lastTextBaseline" spacing={4}>
      <Din t={String(p.pour)} s={s} />
      <Din t={`– ${p.contre}`} s={s * 0.5} c="rgba(255,255,255,0.5)" />
    </HStack>
  )
}

/** L'image de la carte sur tout le widget, voilée pour le texte ; puis le portrait de l'agent, à droite. */
function FondPartie({ p, c }: { p: PartieVue; c: Cadre }) {
  const large = !petit(c)
  return (
    <ZStack frame={{ width: c.l, height: c.h }}>
      {p.fond ? <ImageFichier chemin={p.fond} l={c.l} h={c.h} remplir /> : null}
      <Rectangle frame={{ width: c.l, height: c.h }} fill={large
        ? gradient("linear", { colors: ["rgba(9,11,16,0.97)", "rgba(9,11,16,0.72)", "rgba(9,11,16,0.2)"], startPoint: "leading", endPoint: "trailing" })
        : gradient("linear", { colors: ["rgba(9,11,16,0.6)", "rgba(9,11,16,0.35)", "rgba(9,11,16,0.96)"], startPoint: "top", endPoint: "bottom" })} />
      {large && p.portrait ? (
        <HStack spacing={0} frame={{ width: c.l, height: c.h }}>
          <Spacer />
          <ZStack frame={{ width: c.l * 0.42, height: c.h }} clipped>
            <ImageFichier chemin={p.portrait} l={c.h * 2.2} h={c.h * 2} dy={c.h * 0.5} />
          </ZStack>
        </HStack>
      ) : null}
    </ZStack>
  )
}

export function Partie({ d, c }: { d: Donnees; c: Cadre }) {
  const p = d.stats?.derniere
  if (!p) return <Invite c={c} titre="DERNIÈRE PARTIE" />
  const marque = <Marque t={p.issue === "V" ? "VICTOIRE" : p.issue === "D" ? "DÉFAITE" : "ÉGALITÉ"} fond={couleurIssue(p.issue)} couleur={"#06210f"} />
  const rr = p.rr == null ? null : (p.rr >= 0 ? "+" : "−") + Math.abs(p.rr)
  if (petit(c)) {
    return (
      <Racine c={c} ecart={2} fond={<FondPartie p={p} c={c} />} contenu={[
        marque,
        <Spacer />,
        <Score p={p} s={62} />,
        ...(p.carte != null ? [<Din t={p.carte.toUpperCase()} s={20} />] : []),
        <HStack spacing={4}>
          {p.kda != null ? <Text font={9} foregroundStyle="rgba(255,255,255,0.75)" lineLimit={1}>{p.kda}</Text> : null}
          {rr ? <Text font={9} fontWeight="bold" foregroundStyle={couleurIssue(p.issue)} lineLimit={1}>{`${p.kda != null ? "· " : ""}${rr} RR`}</Text> : null}
        </HStack>,
      ]} />
    )
  }
  const corps = (k: Cadre): VirtualNode[] => [
    <HStack spacing={7}>{marque}<Etiquette t={["Dernière partie", p.carte, p.file].filter((x) => x != null).join(" · ")} /></HStack>,
    <Spacer />,
    <Score p={p} s={Math.min(80, k.h * 0.48)} />,
    <HStack spacing={6}>
      {p.kda != null ? <Pastille icone={null} texte={p.kda} unite="K/D/A" sombre /> : null}
      {rr ? <Pastille icone={null} texte={rr} unite="RR" sombre couleur={couleurIssue(p.issue)} /> : null}
      {p.tete != null ? <Pastille icone={null} texte={p.tete} unite="Tirs tête" sombre /> : null}
      <Spacer />
    </HStack>,
  ]
  // En grand : la partie en haut, comme en moyen, puis les parties classées d'avant (la même partie n'y est pas redite).
  const avant = (d.stats?.parties ?? []).filter((x) => JSON.stringify(x) !== JSON.stringify(p))
  if (grand(c) && avant.length > 0) {
    // Le bas ne prend que la hauteur de ses lignes ; la partie du haut prend tout le reste, sans bande vide sous les lignes.
    const place = c.h - Math.round(c.h * 0.56) - 10 - MARGE - 13
    const lignes = avant.slice(0, Math.max(1, Math.floor((place + 4) / 31)))
    const hHaut = c.h - (10 + 13 + lignes.length * 31 - 4 + MARGE)
    const haut: Cadre = { ...c, h: hHaut }
    return (
      <ZStack frame={{ width: c.l, height: c.h }} background={fondWidget()} widgetBackground={fondWidget()}>
        <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
          <ZStack frame={{ width: c.l, height: hHaut }} clipped>
            <FondPartie p={p} c={haut} />
            <VStack alignment="leading" spacing={6} frame={{ width: L(c), height: hHaut - 2 * MARGE, alignment: "topLeading" }}>{corps(haut)}</VStack>
          </ZStack>
          <VStack alignment="leading" spacing={4} padding={{ top: 10, bottom: MARGE }} frame={{ width: L(c), height: c.h - hHaut, alignment: "topLeading" }}>
            <Etiquette t={lignes.length > 1 ? "Compétition · parties d'avant" : "Compétition · partie d'avant"} s={7.5} />
            {lignes.map((x) => <LignePartie p={x} l={L(c)} />)}
          </VStack>
        </VStack>
      </ZStack>
    )
  }
  return <Racine c={c} ecart={6} fond={<FondPartie p={p} c={c} />} contenu={corps(c)} />
}

// ─────────────────────────── Le chiffre du jour ───────────────────────────

export function Jour({ d, c }: { d: Donnees; c: Cadre }) {
  const j = d.jour
  // Sans résumé : la même invitation que les widgets de stats. Avec un résumé mais sans constat : trop peu de parties, dit tel quel.
  if (!j) {
    return d.jourVide
      ? <Invite c={c} titre="CHIFFRE DU JOUR" lignes={["PAS ASSEZ", "DE PARTIES", `en compétition${d.stats ? " · " + d.stats.periode : ""}`]} />
      : <Invite c={c} titre="CHIFFRE DU JOUR" />
  }
  const court = j.periode.replace(" jours", " j")
  const accent = j.genre === "travail" ? ORANGE : ("#2b7a99" as Color)
  const large = !petit(c)
  // Le fond, à la taille du cadre `k` (le widget, ou sa partie haute en grand).
  const fondDe = (k: Cadre) => (
    <ZStack frame={{ width: k.l, height: k.h }}>
      {j.fond ? <ImageFichier chemin={j.fond} l={k.l} h={k.h} remplir /> : null}
      {j.fond ? <Rectangle frame={{ width: k.l, height: k.h }} fill={gradient("linear", { colors: ["rgba(9,11,16,0.5)", "rgba(9,11,16,0.25)", "rgba(9,11,16,0.95)"], startPoint: "top", endPoint: "bottom" })} /> : null}
      {j.fond ? <Rectangle frame={{ width: k.l, height: k.h }} fill={gradient("linear", { colors: ["rgba(9,11,16,0.8)", "rgba(9,11,16,0.4)", "rgba(9,11,16,0)"], startPoint: "leading", endPoint: "trailing" })} /> : null}
      {j.portrait ? (
        <HStack spacing={0} frame={{ width: k.l, height: k.h }}>
          <Spacer />
          <ZStack frame={{ width: k.l * (large ? 0.46 : 0.62), height: k.h }} clipped>
            <ImageFichier chemin={j.portrait} l={k.h * 2.2} h={k.h * 2} dy={k.h * 0.5} />
          </ZStack>
        </HStack>
      ) : null}
      {j.portrait ? <Rectangle frame={{ width: k.l, height: k.h }} fill={gradient("linear", { colors: ["rgba(11,17,25,0.94)", "rgba(11,17,25,0.4)", "rgba(11,17,25,0)"], startPoint: "leading", endPoint: "trailing" })} /> : null}
    </ZStack>
  )
  const fond = fondDe(c)
  const titre = (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={4}><Etiquette t={j.jour} c={j.genre === "travail" ? ORANGE : C.blanc} /><Etiquette t={`· ${court}`} /></HStack>
      <Etiquette t={j.titre} />
    </VStack>
  )
  const valeur = (s: number) => (
    <HStack alignment="lastTextBaseline" spacing={2}>
      <Din t={j.valeur} s={s} />
      {j.unite ? <Din t={j.unite} s={s * 0.5} /> : null}
    </HStack>
  )
  if (!large) {
    return (
      <Racine c={c} teinte={mix(accent, 1)} force={j.genre === "travail" ? 0.28 : 0.5} ecart={1} fond={fond} contenu={[
        titre,
        <Spacer />,
        valeur(58),
        <Din t={j.sujet.toUpperCase()} s={20} />,
        <Text font={9} foregroundStyle="rgba(255,255,255,0.75)" lineLimit={1} minScaleFactor={0.7}>{j.detail}</Text>,
      ]} />
    )
  }
  const corps = (k: Cadre): VirtualNode[] => [
    <HStack spacing={6}>
      <Etiquette t={j.jour} c={j.genre === "travail" ? ORANGE : C.blanc} /><Etiquette t={`· ${j.titre}`} />
      <Spacer />
      <Etiquette t={`${j.periode}${j.majA ? " · màj " + j.majA : ""}`} s={7.5} />
    </HStack>,
    <Spacer />,
    <HStack alignment="lastTextBaseline" spacing={12}>
      {valeur(Math.min(86, k.h * 0.52))}
      <VStack alignment="leading" spacing={0}>
        <Din t={j.sujet.toUpperCase()} s={32} />
        <Text font={9} foregroundStyle="rgba(255,255,255,0.75)" lineLimit={1}>{j.detail}</Text>
      </VStack>
    </HStack>,
    <HStack spacing={6}>
      {j.plus.map((x) => <Pastille icone={null} texte={x.valeur} unite={x.libelle} sombre />)}
      <Spacer />
    </HStack>,
  ]
  // En grand : le constat en haut, comme en moyen, puis le rang et les chiffres de la période (ceux du widget Stats).
  const st = d.stats
  if (grand(c) && st) {
    const hHaut = Math.round(c.h * 0.54)
    const haut: Cadre = { ...c, h: hHaut }
    const teinte = fondWidget(mix(accent, 1), 0.5)
    return (
      <ZStack frame={{ width: c.l, height: c.h }} background={fondWidget()} widgetBackground={fondWidget()}>
        <VStack spacing={0} frame={{ width: c.l, height: c.h }}>
          <ZStack frame={{ width: c.l, height: hHaut }} background={teinte} clipped>
            {fondDe(haut)}
            <VStack alignment="leading" spacing={6} frame={{ width: L(c), height: hHaut - 2 * MARGE, alignment: "topLeading" }}>{corps(haut)}</VStack>
          </ZStack>
          <VStack alignment="leading" spacing={0} padding={{ top: 10, bottom: MARGE }} frame={{ width: L(c), height: c.h - hHaut, alignment: "topLeading" }}>
            <Etiquette t={`Compétition · ${st.periode}`} s={7.5} />
            <Spacer />
            <HStack spacing={12} frame={{ width: L(c) }}>
              <BlocRang s={st} t={46} l={L(c) - 112 - 12} />
              <Derniers s={st} l={112} />
            </HStack>
            <Spacer />
            <Chiffres s={st} l={L(c)} taille={32} />
          </VStack>
        </VStack>
      </ZStack>
    )
  }
  return <Racine c={c} teinte={mix(accent, 1)} force={0.5} ecart={6} fond={fond} contenu={corps(c)} />
}
