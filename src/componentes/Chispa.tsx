interface Props {
  valores: (number | null)[]
  etiqueta: string
  unidad: string
  destacado?: boolean
}

const AN = 300
const AL = 40

/**
 * Small multiple: cada levantamiento tiene su propia escala. Banca en libras y
 * dominadas en series no comparten eje — meterlos en uno solo sería mentir.
 */
export function Chispa({ valores, etiqueta, unidad, destacado = false }: Props) {
  const puntos = valores
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null)

  if (puntos.length < 2) return null

  const vals = puntos.map((p) => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const x = (i: number) => 2 + (i / Math.max(1, valores.length - 1)) * (AN - 4)
  const y = (v: number) => AL - 6 - ((v - min) / (max - min || 1)) * (AL - 14)

  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  const delta = ultimo.v - primero.v

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[13px] ${destacado ? 'font-bold text-dorado-400' : ''}`}>
          {destacado && '★ '}{etiqueta}
        </span>
        <span className="cifra shrink-0 text-[11px]">
          <span className="text-pergamino">{ultimo.v}</span>
          <span className="text-humo"> {unidad}</span>
          {delta !== 0 && (
            <span className={delta > 0 ? ' text-dorado-400' : ' text-humo'}>
              {' '}({delta > 0 ? '+' : ''}{Number(delta.toFixed(1))})
            </span>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${AN} ${AL}`} width="100%" height={AL} role="img"
        aria-label={`${etiqueta}: de ${primero.v} a ${ultimo.v} ${unidad}`}>
        <polyline
          points={puntos.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
          fill="none" stroke="#B8860B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r="4" fill="#B8860B" stroke="#0C1826" strokeWidth="2" />
      </svg>
    </div>
  )
}
