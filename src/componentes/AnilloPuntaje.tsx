interface Props {
  puntaje: number | null
  pctAplicable: number | null
  tamano?: number
}

/** Anillo de puntaje. Sin drama: un día malo se lee igual de claro que uno bueno. */
export function AnilloPuntaje({ puntaje, pctAplicable, tamano = 124 }: Props) {
  const r = 56
  const circunferencia = 2 * Math.PI * r
  const fraccion = puntaje === null ? 0 : Math.max(0, Math.min(1, puntaje / 100))
  const color = puntaje === null ? '#2B4E7C' : puntaje >= 75 ? '#B8860B' : '#9AA7B8'

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative" style={{ width: tamano, height: tamano }}>
        <svg viewBox="0 0 132 132" width={tamano} height={tamano} className="-rotate-90">
          <circle cx="66" cy="66" r={r} fill="none" stroke="#1F3A5F" strokeWidth="9" />
          <circle
            cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={circunferencia}
            strokeDashoffset={circunferencia * (1 - fraccion)}
            style={{ transition: 'stroke-dashoffset 320ms ease, stroke 320ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {puntaje === null ? (
            <span className="text-[11px] leading-tight text-humo">sin<br />registrar</span>
          ) : (
            <>
              <span className="cifra text-[34px] font-bold leading-none text-pergamino">{puntaje}</span>
              <span className="mt-1 text-[9px] uppercase tracking-[0.18em] text-humo">de 100</span>
            </>
          )}
        </div>
      </div>
      {pctAplicable !== null && (
        <span className="cifra text-[11px] text-dorado-400">
          {Math.round(pctAplicable * 100)}% del plan de hoy
        </span>
      )}
    </div>
  )
}
