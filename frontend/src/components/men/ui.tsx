import { useRef, type KeyboardEvent, type ReactNode } from 'react'

/* ================================================================== */
/*  Jeu de couleurs MEN (institutionnel)                               */
/*   marine   #1B1BFF   sidebar, tooltips, titres forts                */
/*   bleu     #1B1BFF   couleur de marque, actions                     */
/*   ciel     #1B1BFF   survols, dégradés                              */
/*   vert     #00FF9C   validation, statuts positifs                   */
/*   encre    #0A0A0A   texte principal                                */
/*   ardoise  #6E6E73   texte secondaire                               */
/*   filet    #E5E5EA   bordures                                       */
/*   fond     #FAFAF8   arrière-plan                                   */
/* ================================================================== */

/* ================================================================== */
/*  Animations globales                                                */
/*  Les noms de classes existants sont conservés (compatibilité).      */
/* ================================================================== */

const STYLES = `
.men-serif{font-family:'Space Grotesk Variable','Space Grotesk','Inter Variable','Inter',sans-serif;font-weight:500;letter-spacing:-0.01em}

@keyframes men-rise{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes men-fade{from{opacity:0}to{opacity:1}}
@keyframes men-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes men-modal{from{opacity:0;transform:translate3d(0,16px,0) scale(.97)}to{opacity:1;transform:none}}
@keyframes men-shake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
@keyframes men-ring{from{stroke-dashoffset:var(--c)}to{stroke-dashoffset:var(--t)}}
@keyframes men-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-14px,0)}}
@keyframes men-indet{from{transform:translateX(-100%)}to{transform:translateX(260%)}}
@keyframes men-nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(7px)}}
@keyframes men-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes men-pulse-slow{0%,100%{opacity:.4}50%{opacity:.8}}
@keyframes men-slide{from{transform:translate3d(-100%,0,0)}to{transform:none}}
@keyframes men-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.men-rise{animation:men-rise .65s cubic-bezier(.22,1,.36,1) var(--d,0ms) both}
.men-fade{animation:men-fade .25s ease-out both}
.men-fade-d{animation:men-fade .7s ease-out var(--d,0ms) both}
.men-draw{stroke-dasharray:1;animation:men-draw 1.6s cubic-bezier(.4,0,.2,1) var(--d,0ms) both}
.men-modal{animation:men-modal .35s cubic-bezier(.22,1,.36,1) both}
.men-shake{animation:men-shake .45s cubic-bezier(.36,.07,.19,.97) both}
.men-ring{animation:men-ring 1.4s cubic-bezier(.65,0,.2,1) var(--d,0ms) both}
.men-float{animation:men-float var(--f,9s) ease-in-out var(--fd,0s) infinite}
.men-indet{animation:men-indet 1.3s cubic-bezier(.4,0,.2,1) infinite}
.men-nudge{animation:men-nudge 2.2s ease-in-out infinite}
.men-bob{animation:men-bob 2.6s ease-in-out infinite}
.men-pulse-slow{animation:men-pulse-slow 4s ease-in-out infinite}
.men-slide{animation:men-slide .35s cubic-bezier(.22,1,.36,1) both}
.men-bar{transform-origin:left center;animation:men-bar 1s cubic-bezier(.22,1,.36,1) var(--d,0ms) both}

@media (prefers-reduced-motion:reduce){
  .men-rise,.men-fade,.men-fade-d,.men-draw,.men-modal,.men-shake,.men-ring,
  .men-float,.men-indet,.men-nudge,.men-bob,.men-pulse-slow,.men-slide,.men-bar{animation:none !important}
}
`

export function StylesMEN() {
  return <style>{STYLES}</style>
}

/* ================================================================== */
/*  Icônes                                                             */
/* ================================================================== */

export type IconName =
  | 'users' | 'user' | 'search' | 'plus' | 'minus' | 'logout' | 'edit' | 'close' | 'mail' | 'key'
  | 'shield' | 'check' | 'alert' | 'left' | 'right' | 'refresh' | 'loader' | 'eye' | 'eyeoff' | 'upload'
  | 'file' | 'scan' | 'calendar' | 'building' | 'arrow' | 'bolt' | 'clock' | 'info' | 'list' | 'wallet' | 'trash'

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {name === 'users' && (<><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>)}
      {name === 'user' && (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>)}
      {name === 'search' && (<><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>)}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'minus' && <path d="M5 12h14" />}
      {name === 'logout' && (<><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="m14 8 4 4-4 4M8 12h10" /></>)}
      {name === 'edit' && <path d="m15 5 4 4M4 20l4-.8L19.2 8a2.1 2.1 0 0 0-3-3L5 16.2 4 20Z" />}
      {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
      {name === 'mail' && (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>)}
      {name === 'key' && (<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l2 2M13 10l2 2" /></>)}
      {name === 'shield' && (<><path d="m12 3 7 3v5c0 4.4-2.8 7.5-7 9.5C7.8 18.5 5 15.4 5 11V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>)}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
      {name === 'alert' && (<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>)}
      {name === 'left' && <path d="m15 18-6-6 6-6" />}
      {name === 'right' && <path d="m9 18 6-6-6-6" />}
      {name === 'refresh' && (<><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3" /></>)}
      {name === 'loader' && <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9" />}
      {name === 'eye' && (<><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" /><circle cx="12" cy="12" r="3" /></>)}
      {name === 'eyeoff' && (<><path d="M3 3l18 18" /><path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 8.5 4 9.5 6a12.6 12.6 0 0 1-2.6 3.4M6.5 7.6A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>)}
      {name === 'upload' && <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />}
      {name === 'file' && (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>)}
      {name === 'scan' && <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />}
      {name === 'calendar' && (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>)}
      {name === 'building' && <path d="M4 20V8l8-5 8 5v12M2 20h20M9 20v-6h6v6M8 9h.01M12 9h.01M16 9h.01" />}
      {name === 'arrow' && <path d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'bolt' && <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />}
      {name === 'clock' && (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)}
      {name === 'info' && (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>)}
      {name === 'list' && <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />}
      {name === 'wallet' && (<><path d="M4 7a2 2 0 0 1 2-2h11v4" /><path d="M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2Z" /><path d="M16 14h.01" /></>)}
      {name === 'trash' && <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />}
    </svg>
  )
}

/* ================================================================== */
/*  Avatar à initiales                                                 */
/* ================================================================== */

export function Avatar({ nom, className = 'h-10 w-10 text-lg' }: { nom: string; className?: string }) {
  const initiales = nom.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('')
  return (
    <span
      className={`men-serif grid shrink-0 place-items-center rounded-full bg-[#1B1BFF]/10 text-[#1B1BFF] ring-1 ring-inset ring-[#1B1BFF]/15 ${className}`}
    >
      {initiales || 'U'}
    </span>
  )
}

/* ================================================================== */
/*  Messages                                                           */
/* ================================================================== */

export function Message({ type, onClose, children }: { type: 'erreur' | 'succes'; onClose?: () => void; children: ReactNode }) {
  const erreur = type === 'erreur'
  return (
    <div
      role={erreur ? 'alert' : 'status'}
      className={`men-fade flex items-start gap-3 rounded-xl border border-l-[3px] px-4 py-3 text-sm leading-6 ${
        erreur
          ? 'border-[#F3CBD1] border-l-[#E11D48] bg-[#FDF4F5] text-[#9F1239]'
          : 'border-[#00FF9C]/35 border-l-[#00FF9C] bg-[#E8FFF6] text-[#0A0A0A]'
      }`}
    >
      <Icon name={erreur ? 'alert' : 'check'} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="-mr-1 mt-0.5 rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Petits éléments                                                   */
/* ================================================================== */

export function PastilleIcone({ icone, className = 'h-14 w-14' }: { icone: IconName; className?: string }) {
  return (
    <span className={`grid place-items-center rounded-full bg-[#1B1BFF]/10 text-[#1B1BFF] ring-8 ring-[#1B1BFF]/5 ${className}`}>
      <Icon name={icone} className="h-6 w-6" />
    </span>
  )
}

export function TitreSection({ icone, titre, droite }: { icone: IconName; titre: string; droite?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1B1BFF]/10 text-[#1B1BFF]">
          <Icon name={icone} className="h-5 w-5" />
        </span>
        <h2 className="men-serif text-2xl font-normal tracking-tight text-[#0A0A0A]">{titre}</h2>
      </div>
      {droite}
    </div>
  )
}

/* ================================================================== */
/*  Sélecteur segmenté animé (navigation clavier : flèches)            */
/* ================================================================== */

export function Segments<T extends string>({ options, valeur, onChange, etiquette }: {
  options: ReadonlyArray<{ valeur: T; libelle: string }>
  valeur: T
  onChange: (valeur: T) => void
  etiquette: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.valeur === valeur))
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const surTouche = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = options.length
    let cible = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') cible = (index + 1) % n
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') cible = (index - 1 + n) % n
    if (e.key === 'Home') cible = 0
    if (e.key === 'End') cible = n - 1
    if (cible >= 0) {
      e.preventDefault()
      onChange(options[cible].valeur)
      refs.current[cible]?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={etiquette}
      className="relative grid rounded-xl bg-[#F5F5F7] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-lg bg-white shadow-[0_1px_2px_rgba(15,36,55,0.1),0_2px_6px_-2px_rgba(15,36,55,0.12)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option, i) => {
        const actif = option.valeur === valeur
        return (
          <button
            key={option.valeur}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={actif}
            tabIndex={actif ? 0 : -1}
            onClick={() => onChange(option.valeur)}
            onKeyDown={surTouche}
            className={`relative z-10 h-9 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1BFF]/25 ${
              actif ? 'text-[#1B1BFF]' : 'text-[#86868B] hover:text-[#0A0A0A]'
            }`}
          >
            {option.libelle}
          </button>
        )
      })}
    </div>
  )
}