import type { ReactNode } from 'react'
import { Icon, type IconName } from './ui'
import { delai, useCompteur } from './ui-outils'

/* ------------------------------------------------------------------ */
/*  Styles partagés                                                    */
/*  (les noms d'export sont conservés pour ne rien casser ailleurs)    */
/* ------------------------------------------------------------------ */

export const cartePage =
  'rounded-[20px] border border-[#E5E5EA] bg-white shadow-[0_1px_2px_rgba(15,36,55,0.04),0_10px_28px_-18px_rgba(15,36,55,0.14)] transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(15,36,55,0.05),0_16px_36px_-18px_rgba(15,36,55,0.22)]'

export const btnPrimaire =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1B1BFF] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(27,27,255,0.3),0_8px_16px_-8px_rgba(27,27,255,0.55)] transition duration-200 hover:bg-[#1B1BFF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:pointer-events-none disabled:opacity-60'

export const btnContour =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E5EA] bg-white px-4 text-sm font-semibold text-[#0A0A0A] transition duration-200 hover:border-[#E5E5EA] hover:bg-[#F0F0FF] active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/15 disabled:pointer-events-none disabled:opacity-60'

export const btnIcone =
  'grid h-8 w-8 place-items-center rounded-lg text-[#86868B] transition-colors duration-200 hover:bg-[#F5F5F7] hover:text-[#0A0A0A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/40 disabled:opacity-50'

export const etiquette = 'mb-1.5 block text-xs font-semibold text-[#0A0A0A]'

export const champ =
  'h-11 w-full rounded-xl border border-[#E5E5EA] bg-white px-3.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15 disabled:bg-[#FAFAF8] disabled:text-[#86868B]'

export const zoneTexte =
  'min-h-[92px] w-full resize-y rounded-xl border border-[#E5E5EA] bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] outline-none transition duration-200 placeholder:text-[#86868B] hover:border-[#E5E5EA] focus:border-[#1B1BFF]/25 focus:ring-4 focus:ring-[#1B1BFF]/15'

/* ------------------------------------------------------------------ */
/*  Fonds par ton : teintes très légères, bordure assortie             */
/* ------------------------------------------------------------------ */

export const FONDS_FROSTED = {
  bleu: 'border border-[#E5E5EA] bg-[#F0F0FF]',
  vert: 'border border-[#00FF9C]/35 bg-[#00FF9C]',
  ambre: 'border border-[#F3E4BF] bg-[#FAFAF8]',
  violet: 'border border-[#E3D9F5] bg-[#F8F5FD]',
  ardoise: 'border border-[#E5E5EA] bg-white',
} as const

export type TonKpi = keyof typeof FONDS_FROSTED

export const CHIPS_FROSTED = {
  bleu: 'bg-[#1B1BFF]/10 text-[#1B1BFF]',
  vert: 'bg-[#00FF9C]/10 text-[#0A0A0A]',
  ambre: 'bg-amber-500/10 text-amber-700',
  violet: 'bg-violet-600/10 text-violet-700',
  ardoise: 'bg-slate-500/10 text-[#86868B]',
} as const

const ACCENTS: Record<TonKpi, string> = {
  bleu: '#1B1BFF',
  vert: '#00FF9C',
  ambre: '#D98A0B',
  violet: '#7C3AED',
  ardoise: '#64748B',
}

/* ------------------------------------------------------------------ */
/*  Éléments                                                           */
/* ------------------------------------------------------------------ */

export function Initiales({
  nom, className = 'h-9 w-9 text-xs', ton = 'bleu',
}: {
  nom: string
  className?: string
  ton?: 'bleu' | 'ambre' | 'violet'
}) {
  const lettres =
    nom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0]?.toUpperCase()).join('') || '?'

  const couleurs = {
    bleu: 'bg-[#1B1BFF]/10 text-[#1B1BFF] ring-[#1B1BFF]/15',
    ambre: 'bg-amber-500/10 text-amber-800 ring-amber-500/20',
    violet: 'bg-violet-600/10 text-violet-800 ring-violet-600/20',
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-inset ${couleurs[ton]} ${className}`}
    >
      {lettres}
    </span>
  )
}

export function TuileKpi({
  libelle, valeur, note, icone, ton, retard,
}: {
  libelle: string
  valeur: number
  note: string
  icone: IconName
  ton: TonKpi
  retard: number
}) {
  const affiche = useCompteur(valeur)

  return (
    <div
      className={`men-rise relative overflow-hidden rounded-[20px] p-6 transition-shadow duration-300 hover:shadow-[0_16px_32px_-20px_rgba(15,36,55,0.3)] ${FONDS_FROSTED[ton]}`}
      style={delai(retard)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#86868B]">{libelle}</p>
          <p className="men-serif mt-2.5 text-4xl leading-none tabular-nums text-[#0A0A0A]">{affiche}</p>
        </div>

        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${CHIPS_FROSTED[ton]}`}>
          <Icon name={icone} className="h-5 w-5" />
        </span>
      </div>

      <p className="mt-4 text-xs text-[#86868B]">{note}</p>

      {/* Filet d'accent : se déploie une fois à l'arrivée */}
      <span
        aria-hidden="true"
        className="men-bar absolute inset-x-0 bottom-0 h-[3px]"
        style={{ ...delai(retard + 350), backgroundColor: ACCENTS[ton] }}
      />
    </div>
  )
}

export function Panneau({
  titre, sousTitre, action, retard = 0, className = '', children,
}: {
  titre: string
  sousTitre?: string
  action?: ReactNode
  retard?: number
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`men-rise flex flex-col rounded-[20px] border border-[#E5E5EA] bg-white p-6 shadow-[0_1px_2px_rgba(15,36,55,0.04),0_10px_28px_-18px_rgba(15,36,55,0.14)] ${className}`}
      style={delai(retard)}
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#0A0A0A]">{titre}</h2>
          {sousTitre && <p className="mt-1 text-xs text-[#86868B]">{sousTitre}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </section>
  )
}

export function Interrupteur({
  libelle, coche, onChange, desactive,
}: {
  libelle: string
  coche: boolean
  onChange: (valeur: boolean) => void
  desactive?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#E5E5EA] bg-white px-4 py-3 transition-colors duration-200 hover:border-[#E5E5EA]">
      <span className="text-sm font-semibold text-[#0A0A0A]">{libelle}</span>
      <button
        type="button"
        role="switch"
        aria-checked={coche}
        aria-label={libelle}
        disabled={desactive}
        onClick={() => onChange(!coche)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B1BFF]/25 disabled:opacity-50 ${
          coche ? 'bg-[#00FF9C]' : 'bg-[#F5F5F7]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,36,55,0.3)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
            coche ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}