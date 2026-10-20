import { useId, useState, type CSSProperties } from 'react'

export interface SerieCourbe {
  nom: string
  valeurs: number[]
  couleur: string
}

const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

export function CourbeMulti({
  labels,
  series,
  hauteur = 260,
}: {
  labels: string[]
  series: SerieCourbe[]
  hauteur?: number
}) {
  const id = useId().replace(/:/g, '')
  const [actif, setActif] = useState<number | null>(null)

  const L = 640
  const marge = { haut: 20, droite: 18, bas: 30, gauche: 34 }
  const zoneL = L - marge.gauche - marge.droite
  const zoneH = hauteur - marge.haut - marge.bas

  const n = labels.length
  const maximum = Math.max(4, ...series.flatMap((serie) => serie.valeurs))
  const plafond = Math.ceil(maximum / 4) * 4
  const graduations = [0, 1, 2, 3, 4].map((i) => (plafond / 4) * i)

  const x = (i: number) =>
    marge.gauche + (n > 1 ? (i / (n - 1)) * zoneL : zoneL / 2)
  const y = (valeur: number) =>
    marge.haut + zoneH - (valeur / plafond) * zoneH

  function chemin(valeurs: number[]): string {
    return valeurs.reduce((c, valeur, i) => {
      if (i === 0) return `M ${x(0)} ${y(valeur)}`
      const px = x(i - 1)
      const py = y(valeurs[i - 1])
      const milieu = (px + x(i)) / 2
      return `${c} C ${milieu} ${py} ${milieu} ${y(valeur)} ${x(i)} ${y(valeur)}`
    }, '')
  }

  const base = marge.haut + zoneH
  const largeurInfo = 132
  const hauteurInfo = 30 + series.length * 18
  const xInfo = (i: number) => Math.min(Math.max(x(i) - largeurInfo / 2, 0), L - largeurInfo)

  return (
    <div>
      <ul className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1">
        {series.map((serie, index) => (
          <li
            key={serie.nom}
            className="men-rise flex items-center gap-1.5 text-xs font-medium text-[#86868B]"
            style={d(150 + index * 80)}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: serie.couleur }}
            />
            {serie.nom}
          </li>
        ))}
      </ul>

      <svg
        viewBox={`0 0 ${L} ${hauteur}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Évolution : ${series.map((s) => s.nom).join(', ')}`}
        onMouseLeave={() => setActif(null)}
      >
        <defs>
          {series.map((serie, index) => (
            <linearGradient
              key={serie.nom}
              id={`${id}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={serie.couleur} stopOpacity="0.22" />
              <stop offset="100%" stopColor={serie.couleur} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {graduations.map((valeur) => (
          <g key={valeur}>
            <line
              x1={marge.gauche}
              x2={L - marge.droite}
              y1={y(valeur)}
              y2={y(valeur)}
              stroke="#E5E5EA"
              strokeDasharray="3 5"
            />
            <text
              x={marge.gauche - 8}
              y={y(valeur) + 4}
              textAnchor="end"
              fill="#6E6E73"
              fontSize="11"
            >
              {valeur}
            </text>
          </g>
        ))}

        {/* Repère vertical sous les courbes */}
        {actif !== null && (
          <line
            x1={x(actif)}
            x2={x(actif)}
            y1={marge.haut}
            y2={base}
            stroke="#86868B"
            strokeOpacity="0.55"
            strokeDasharray="3 4"
            pointerEvents="none"
          />
        )}

        {series.map((serie, index) => (
          <g key={serie.nom}>
            <path
              d={`${chemin(serie.valeurs)} L ${x(n - 1)} ${base} L ${x(0)} ${base} Z`}
              fill={`url(#${id}-${index})`}
              className="men-fade-d"
              style={d(700 + index * 200)}
            />
            <path
              d={chemin(serie.valeurs)}
              pathLength={1}
              fill="none"
              stroke={serie.couleur}
              strokeWidth="2.75"
              strokeLinecap="round"
              className="men-draw"
              style={d(100 + index * 200)}
            />
            {serie.valeurs.map((valeur, i) => (
              <g key={i} className="men-fade-d" style={d(900 + index * 200 + i * 50)}>
                <circle
                  cx={x(i)}
                  cy={y(valeur)}
                  r={actif === i ? 5.5 : 3.5}
                  fill="#fff"
                  stroke={serie.couleur}
                  strokeWidth="2.5"
                  style={{ transition: 'r .15s ease' }}
                />
              </g>
            ))}
          </g>
        ))}

        {labels.map((label, i) => (
          <g key={`${label}-${i}`}>
            <text
              x={x(i)}
              y={hauteur - 8}
              textAnchor="middle"
              fill={actif === i ? '#0A0A0A' : '#6E6E73'}
              fontSize="11"
              fontWeight={actif === i ? 600 : 400}
            >
              {label}
            </text>
            <rect
              x={x(i) - zoneL / n / 2}
              y={marge.haut}
              width={zoneL / n}
              height={zoneH}
              fill="transparent"
              onMouseEnter={() => setActif(i)}
            />
          </g>
        ))}

        {actif !== null && (
          <g pointerEvents="none">
            <rect
              x={xInfo(actif)}
              y={marge.haut}
              width={largeurInfo}
              height={hauteurInfo}
              rx="8"
              fill="#1B1BFF"
            />
            <text
              x={xInfo(actif) + 12}
              y={marge.haut + 18}
              fill="#ffffff"
              fontSize="11"
              fontWeight="600"
            >
              {labels[actif]}
            </text>
            {series.map((serie, index) => (
              <g key={serie.nom}>
                <circle
                  cx={xInfo(actif) + 16}
                  cy={marge.haut + 34 + index * 18}
                  r="3.5"
                  fill={serie.couleur}
                />
                <text
                  x={xInfo(actif) + 26}
                  y={marge.haut + 38 + index * 18}
                  fill="#E2E8F0"
                  fontSize="11"
                >
                  {serie.nom} : {serie.valeurs[actif]}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}