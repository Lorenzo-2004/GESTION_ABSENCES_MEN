import { useEffect, useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export interface Segment {
  libelle: string
  valeur: number
  couleur: string
}

export interface PointCourbe {
  libelle: string
  valeur: number
}

export const COULEURS = {
  bleu: '#1B1BFF',
  ciel: '#1B1BFF',
  turquoise: '#00FF9C',
  ambre: '#F59E0B',
  violet: '#7C3AED',
  ardoise: '#86868B',
  marine: '#1B1BFF',
  piste: '#E5E5EA',
}

const PALETTE = [COULEURS.bleu, COULEURS.ciel, COULEURS.turquoise, COULEURS.violet, COULEURS.ambre]

/* ------------------------------------------------------------------ */
/*  Outils d'animation                                                 */
/* ------------------------------------------------------------------ */

const reduit = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* Passe à true juste après le premier rendu pour déclencher les transitions d'entrée */
function useMontage() {
  const [pret, setPret] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPret(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  return pret || reduit()
}

const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

const EASE = 'cubic-bezier(.22,1,.36,1)'

/* ------------------------------------------------------------------ */
/*  Donut                                                              */
/* ------------------------------------------------------------------ */

export function Donut({
  segments, taille = 164, epaisseur = 16, centre,
}: {
  segments: Segment[]
  taille?: number
  epaisseur?: number
  centre?: ReactNode
}) {
  const pret = useMontage()
  const total = segments.reduce((somme, s) => somme + s.valeur, 0)
  const rayon = (taille - epaisseur) / 2
  const circonference = 2 * Math.PI * rayon
  const visibles = segments.filter((s) => s.valeur > 0)
  const espace = visibles.length > 1 ? 4 : 0
  let cumul = 0

  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <svg
        width={taille}
        height={taille}
        viewBox={`0 0 ${taille} ${taille}`}
        role="img"
        aria-label={segments.map((s) => `${s.libelle} : ${s.valeur}`).join(', ')}
      >
        <circle cx={taille / 2} cy={taille / 2} r={rayon} fill="none" stroke={COULEURS.piste} strokeWidth={epaisseur} />

        {total > 0 && visibles.map((segment, index) => {
          const longueur = (segment.valeur / total) * circonference
          const trait = Math.max(longueur - espace, 0.01)
          const element = (
            <circle
              key={segment.libelle}
              cx={taille / 2}
              cy={taille / 2}
              r={rayon}
              fill="none"
              stroke={segment.couleur}
              strokeWidth={epaisseur}
              strokeLinecap="butt"
              strokeDasharray={`${pret ? trait : 0} ${circonference}`}
              strokeDashoffset={-cumul}
              transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
              style={{
                transition: reduit() ? 'none' : `stroke-dasharray 1s ${EASE} ${index * 130}ms`,
              }}
            />
          )
          cumul += longueur
          return element
        })}
      </svg>

      {centre && <div className="absolute inset-0 grid place-items-center text-center">{centre}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Légende                                                            */
/* ------------------------------------------------------------------ */

export function Legende({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((somme, s) => somme + s.valeur, 0)

  return (
    <ul className="w-full divide-y divide-[#F5F5F7]">
      {segments.map((segment, i) => {
        const pourcentage = total ? Math.round((segment.valeur / total) * 100) : 0
        return (
          <li
            key={segment.libelle}
            className="men-rise flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
            style={d(200 + i * 70)}
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.couleur }} />
            <span className="flex-1 font-medium text-[#0A0A0A]">{segment.libelle}</span>
            <span className="font-semibold tabular-nums text-[#0A0A0A]">{segment.valeur}</span>
            <span className="w-10 text-right text-xs tabular-nums text-[#86868B]">{pourcentage}%</span>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/*  Courbe en aire                                                     */
/* ------------------------------------------------------------------ */

export function CourbeAire({ points, couleur = COULEURS.bleu, hauteur = 230 }: { points: PointCourbe[]; couleur?: string; hauteur?: number }) {
  const idDegrade = useId()
  const [actif, setActif] = useState<number | null>(null)

  const largeur = 600
  const marge = { haut: 24, droite: 16, bas: 30, gauche: 32 }
  const zoneL = largeur - marge.gauche - marge.droite
  const zoneH = hauteur - marge.haut - marge.bas

  const maximum = Math.max(4, ...points.map((p) => p.valeur))
  const graduations = [0, 1, 2, 3, 4].map((i) => Math.round((maximum / 4) * i))

  const coord = points.map((point, i) => ({
    x: marge.gauche + (points.length > 1 ? (i / (points.length - 1)) * zoneL : zoneL / 2),
    y: marge.haut + zoneH - (point.valeur / maximum) * zoneH,
  }))

  const ligne = coord.reduce((chemin, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const precedent = coord[i - 1]
    const milieu = (precedent.x + p.x) / 2
    return `${chemin} C ${milieu} ${precedent.y} ${milieu} ${p.y} ${p.x} ${p.y}`
  }, '')

  const base = marge.haut + zoneH
  const aire = coord.length ? `${ligne} L ${coord[coord.length - 1].x} ${base} L ${coord[0].x} ${base} Z` : ''

  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full" role="img" aria-label="Évolution" onMouseLeave={() => setActif(null)}>
      <defs>
        <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity="0.2" />
          <stop offset="100%" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
      </defs>

      {graduations.map((valeur) => {
        const y = marge.haut + zoneH - (valeur / maximum) * zoneH
        return (
          <g key={valeur}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y} y2={y} stroke="#E5E5EA" strokeDasharray="3 5" />
            <text x={marge.gauche - 8} y={y + 4} textAnchor="end" fill="#6E6E73" fontSize="11">{valeur}</text>
          </g>
        )
      })}

      {aire && <path d={aire} fill={`url(#${idDegrade})`} className="men-fade-d" style={d(700)} />}
      {ligne && (
        <path
          d={ligne}
          pathLength={1}
          fill="none"
          stroke={couleur}
          strokeWidth="2.75"
          strokeLinecap="round"
          className="men-draw"
          style={d(100)}
        />
      )}

      {points.map((point, i) => (
        <g key={point.libelle}>
          <text x={coord[i].x} y={hauteur - 8} textAnchor="middle" fill="#6E6E73" fontSize="11" style={{ textTransform: 'capitalize' }}>{point.libelle}</text>
          <rect
            x={coord[i].x - zoneL / points.length / 2}
            y={marge.haut}
            width={zoneL / points.length}
            height={zoneH}
            fill="transparent"
            onMouseEnter={() => setActif(i)}
          />
          <g className="men-fade-d" style={d(900 + i * 70)}>
            <circle
              cx={coord[i].x}
              cy={coord[i].y}
              r={actif === i ? 6 : 4}
              fill="#ffffff"
              stroke={couleur}
              strokeWidth="2.5"
              style={{ transition: 'r .15s ease' }}
            />
          </g>
        </g>
      ))}

      {actif !== null && coord[actif] && (
        <g pointerEvents="none">
          <line x1={coord[actif].x} x2={coord[actif].x} y1={marge.haut} y2={base} stroke={couleur} strokeOpacity="0.35" strokeDasharray="3 4" />
          <rect
            x={Math.min(Math.max(coord[actif].x - 42, 0), largeur - 84)}
            y={Math.max(coord[actif].y - 42, 0)}
            width="84"
            height="28"
            rx="7"
            fill={COULEURS.marine}
          />
          <text
            x={Math.min(Math.max(coord[actif].x, 42), largeur - 42)}
            y={Math.max(coord[actif].y - 24, 18)}
            textAnchor="middle"
            fill="#ffffff"
            fontSize="12"
            fontWeight="600"
          >
            {points[actif].valeur} décision{points[actif].valeur > 1 ? 's' : ''}
          </text>
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Barres horizontales                                                */
/* ------------------------------------------------------------------ */

export function Barres({ elements, couleurs = PALETTE }: { elements: PointCourbe[]; couleurs?: string[] }) {
  const pret = useMontage()
  const maximum = Math.max(1, ...elements.map((e) => e.valeur))

  return (
    <ul className="space-y-4">
      {elements.map((element, i) => {
        const couleur = couleurs[i % couleurs.length]
        return (
          <li key={element.libelle}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium tabular-nums text-[#0A0A0A]">{element.libelle}</span>
              <span className="font-semibold tabular-nums text-[#0A0A0A]">{element.valeur}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F5F5F7]">
              <div
                className="h-full rounded-full"
                style={{
                  width: pret ? `${(element.valeur / maximum) * 100}%` : '0%',
                  backgroundColor: couleur,
                  transition: reduit() ? 'none' : `width 1s ${EASE} ${i * 90}ms`,
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/*  Sparkline                                                          */
/* ------------------------------------------------------------------ */

export function Sparkline({ valeurs, couleur = COULEURS.bleu, largeur = 88, hauteur = 32 }: { valeurs: number[]; couleur?: string; largeur?: number; hauteur?: number }) {
  if (valeurs.length < 2) return null
  const maximum = Math.max(1, ...valeurs)
  const chemin = valeurs.map((valeur, i) => {
    const x = (i / (valeurs.length - 1)) * largeur
    const y = hauteur - 3 - (valeur / maximum) * (hauteur - 6)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg width={largeur} height={hauteur} viewBox={`0 0 ${largeur} ${hauteur}`} aria-hidden="true">
      <path
        d={chemin}
        pathLength={1}
        fill="none"
        stroke={couleur}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="men-draw"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Agrégations                                                        */
/* ------------------------------------------------------------------ */

interface DecisionMinimale {
  date_emission?: string | null
  annees_titre?: string | null
}

export function decisionsParMois(decisions: DecisionMinimale[], nombre = 6): PointCourbe[] {
  const maintenant = new Date()
  const mois: { cle: string; libelle: string; valeur: number }[] = []

  for (let i = nombre - 1; i >= 0; i--) {
    const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1)
    mois.push({
      cle: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      libelle: date.toLocaleDateString('fr-FR', { month: 'short' }),
      valeur: 0,
    })
  }

  decisions.forEach((decision) => {
    const cle = decision.date_emission?.slice(0, 7)
    const trouve = mois.find((m) => m.cle === cle)
    if (trouve) trouve.valeur += 1
  })

  return mois.map(({ libelle, valeur }) => ({ libelle, valeur }))
}

export function decisionsParAnnee(decisions: DecisionMinimale[]): PointCourbe[] {
  const compte = new Map<string, number>()
  decisions.forEach((decision) => {
    const annees = (decision.annees_titre ?? '').match(/\d{4}/g) ?? []
    annees.forEach((annee) => compte.set(annee, (compte.get(annee) ?? 0) + 1))
  })
  return [...compte.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 5)
    .map(([libelle, valeur]) => ({ libelle, valeur }))
}