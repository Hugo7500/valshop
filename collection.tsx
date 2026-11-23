import { langue, traduire } from "./langue"
import {
  EmptyView, EnvironmentValuesReader, GeometryReader, HStack, NavigationLink, ScrollView, Text, VStack, useState, type VirtualNode,
} from "scripting"
import { couleurs, ESPACES, TYPO, tailleAccessibilite } from "./design"
import { CarteOffre, ECART, MARGE_PAGE, TitreSection, type OffreVue, type Teintes } from "./boutique-cartes"
import { FicheSkin } from "./fiche-skin"
import { CATALOG } from "./valshop"
import { imageAdmise } from "./securite"
import { GENRES_COLLECTION, TITRE_COLLECTION, type GenreCollection } from "./possessions"
import { possessionsLues } from "./possessions-ecran"







/** Le nom de chaque genre, au singulier et au pluriel. */
const NOMS: Record<GenreCollection, [string, string]> = {
  skins: ["skin", "skins"], variantes: ["variante", "variantes"], porteBonheur: ["porte-bonheur", "porte-bonheur"],
  tags: ["tag", "tags"], cartes: ["carte", "cartes"], titres: ["titre", "titres"],
}
export function compteGenre(g: GenreCollection, n: number): string {
  const texte = `${n.toLocaleString("fr-FR")} ${NOMS[g][n > 1 ? 1 : 0]}`
  if (langue() !== "en") return texte

  return traduire(g === "cartes" ? `${n.toLocaleString("fr-FR")} ${n > 1 ? "cartes de joueur" : "carte de joueur"}` : texte)
}
export const SANS_COLLECTION = "Ta collection apparaîtra après la prochaine lecture de la boutique, app ouverte."

type SkinPossede = { niveau: string; nom: string; arme: string; icone: string | null; couleur: string | null }
type Rangee = { arme: string; skins: SkinPossede[] }

function estObjet(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}
function lireCatalogue(): unknown {
  try {
    return FileManager.existsSync(CATALOG) ? JSON.parse(FileManager.readAsStringSync(CATALOG)) : null
  } catch {
    return null
  }
}
function couleur(x: unknown): string | null {
  const m = typeof x === "string" ? /^#?([0-9a-fA-F]{6})/.exec(x) : null
  return m ? "#" + m[1] : null
}

/** Les skins possédés, un par skin (le premier niveau possédé), rangés par arme puis par nom ; un niveau inconnu du catalogue est passé. */
export function rangerCollection(cat: unknown, niveaux: Iterable<string>): Rangee[] {
  const levels = estObjet(cat) && estObjet(cat.levels) ? cat.levels : {}
  const skins = estObjet(cat) && estObjet(cat.skins) ? cat.skins : {}
  const armes = estObjet(cat) && estObjet(cat.weapons) ? cat.weapons : {}
  const vus = new Set<string>()
  const parArme = new Map<string, SkinPossede[]>()
  for (const n of niveaux) {
    const l = levels[n]
    if (!estObjet(l) || typeof l.skin !== "string" || vus.has(l.skin)) continue
    vus.add(l.skin)
    const s = estObjet(skins[l.skin]) ? skins[l.skin] : {}
    const idArme = typeof s.weapon === "string" ? s.weapon : typeof l.weapon === "string" ? l.weapon : ""
    const arme = estObjet(armes[idArme]) && typeof armes[idArme].name === "string" ? armes[idArme].name : ""
    const nomComplet = typeof s.name === "string" ? s.name : typeof l.name === "string" ? l.name : ""
    if (nomComplet === "") continue
    // « Glitchpop Vandal » : le nom sans l'arme, quand il finit par elle ; « Vandal (Glitchpop) » (catalogue en français) : le nom
    // entre parenthèses, quand il commence par elle.
    const t = nomComplet.trim(), prefixe = arme.toLowerCase() + " ("
    const nom = arme !== "" && t.toLowerCase().startsWith(prefixe) && t.endsWith(")") && t.length > prefixe.length + 1 ? t.slice(prefixe.length, -1).trim()
      : arme !== "" && t.toLowerCase().endsWith(" " + arme.toLowerCase()) ? t.slice(0, -arme.length - 1) : t
    const liste = parArme.get(arme) ?? []
    liste.push({ niveau: n, nom, arme, icone: imageAdmise(l.icon) ? l.icon : null, couleur: couleur(l.color) })
    parArme.set(arme, liste)
  }
  return [...parArme.entries()]
    .map(([arme, l]) => ({ arme: arme || "Autre", skins: l.sort((a, b) => a.nom.localeCompare(b.nom, "fr")) }))
    .sort((a, b) => b.skins.length - a.skins.length || a.arme.localeCompare(b.arme, "fr"))
}

export function MaCollection() {
  const [lu] = useState(() => {
    const p = possessionsLues()
    const cat = lireCatalogue()
    const skins = p.possedes?.genres.skins
    return {
      cat,
      rangees: skins ? rangerCollection(cat, skins) : [],
      // Les autres genres lus, par leur nombre d'objets ; les skins se comptent par skin (rangées), pas par niveau.
      comptes: p.possedes ? GENRES_COLLECTION.filter((g) => g !== "skins" && g !== "variantes" && p.possedes!.genres[g] !== undefined).map((g) => compteGenre(g, p.possedes!.genres[g]!.size)) : [],
      connue: p.possedes !== null,
    }
  })
  // La fiche poussée par une carte (comme l'onglet Boutique : une carte est déjà un bouton, jamais dans un NavigationLink).
  const [pile, setPile] = useState<{ s: SkinPossede | null; poussee: boolean }>({ s: null, poussee: false })
  const destination = {
    isPresented: pile.poussee,
    onChanged: (poussee: boolean) => setPile((p) => ({ s: p.s, poussee })),
    content: pile.s ? <FicheSkin key={pile.s.niveau} id={pile.s.niveau} prix={null} offre={{ name: `${pile.s.nom} ${pile.s.arme}`, icon: pile.s.icone, color: pile.s.couleur }} catalogue={lu.cat} /> : <EmptyView />,
  }
  const vue = (s: SkinPossede): OffreVue => ({
    cle: s.niveau, nom: s.nom, arme: s.arme, prix: null, icone: s.icone, couleur: s.couleur, sansPrix: true,
    voix: [s.nom, s.arme].join(", "), onAppui: () => setPile({ s, poussee: true }),
  })
  const fiche = (s: SkinPossede): VirtualNode => (
    <FicheSkin id={s.niveau} prix={null} offre={{ name: `${s.nom} ${s.arme}`, icon: s.icone, color: s.couleur }} catalogue={lu.cat} />
  )
  return (
    <EnvironmentValuesReader keys={["colorSchemeContrast", "dynamicTypeSize"]}>
      {(env) => {
        const c = couleurs(env.colorSchemeContrast)
        const t: Teintes = c
        const total = lu.rangees.reduce((n, r) => n + r.skins.length, 0)
        const resume = [compteGenre("skins", total), ...lu.comptes].join(" · ")
        if (tailleAccessibilite(env.dynamicTypeSize)) {
          return (
            <ScrollView navigationTitle={TITRE_COLLECTION} background={c.fond}>
              <VStack alignment="leading" spacing={ESPACES.bloc} padding={{ horizontal: MARGE_PAGE, vertical: ESPACES.entete }}>
                <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>{lu.connue ? resume : SANS_COLLECTION}</Text>
                {lu.rangees.map((r) => (
                  <VStack key={r.arme} alignment="leading" spacing={ESPACES.dansBloc}>
                    <Text {...TYPO.corps} foregroundStyle={c.texte} accessibilityAddTraits="isHeader">{`${traduire(r.arme)} (${r.skins.length})`}</Text>
                    {r.skins.map((s) => (
                      <NavigationLink key={s.niveau} destination={fiche(s)}>
                        <Text {...TYPO.corps} foregroundStyle={c.texteDoux}>{s.nom}</Text>
                      </NavigationLink>
                    ))}
                  </VStack>
                ))}
              </VStack>
            </ScrollView>
          )
        }
        return (
          <GeometryReader>
            {(g) => {
              const l = g.size.width - 2 * MARGE_PAGE
              const lc = Math.floor((l - ECART) / 2), hc = Math.round(lc * 0.84)
              return (
                <ScrollView navigationTitle={TITRE_COLLECTION} background={c.fond} navigationDestination={destination}>
                  <VStack alignment="leading" spacing={ESPACES.entreBlocs} padding={{ horizontal: MARGE_PAGE, top: ESPACES.entete, bottom: ESPACES.basPage }} frame={{ width: g.size.width, alignment: "leading" }}>
                    <VStack alignment="leading" spacing={4} accessibilityElement accessibilityLabel={lu.connue ? `${TITRE_COLLECTION}, ${resume}` : SANS_COLLECTION}>
                      <Text font={{ name: "DINCondensed-Bold", size: 54 }} foregroundStyle={c.texte} lineLimit={1}>{lu.connue ? total.toLocaleString("fr-FR") : "—"}</Text>
                      <Text font="caption" fontWeight="bold" kerning={1.2} textCase="uppercase" foregroundStyle={c.texteDiscret}>{total > 1 ? "skins à toi" : "skin à toi"}</Text>
                      <Text {...TYPO.corps} foregroundStyle={c.texteDoux} padding={{ top: 6 }}>{lu.connue ? resume : SANS_COLLECTION}</Text>
                    </VStack>
                    {lu.rangees.map((r) => (
                      <VStack key={r.arme} alignment="leading" spacing={ECART}>
                        <TitreSection t={t} titre={traduire(r.arme)} droite={`${r.skins.length}`} />
                        {paires(r.skins).map((p) => (
                          <HStack key={p[0].niveau} spacing={ECART}>
                            {p.map((s) => <CarteOffre key={s.niveau} o={vue(s)} l={lc} h={hc} monnaie={null} />)}
                          </HStack>
                        ))}
                      </VStack>
                    ))}
                  </VStack>
                </ScrollView>
              )
            }}
          </GeometryReader>
        )
      }}
    </EnvironmentValuesReader>
  )
}

function paires<T>(l: T[]): T[][] {
  const r: T[][] = []
  for (let i = 0; i < l.length; i += 2) r.push(l.slice(i, i + 2))
  return r
}
