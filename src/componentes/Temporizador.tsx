import { useEffect, useRef, useState } from 'react'

interface Props {
  segundos: number | null
  onCerrar: () => void
}

/** Descanso automático al cerrar una serie. Se puede saltar; no se puede olvidar. */
export function Temporizador({ segundos, onCerrar }: Props) {
  const [restante, setRestante] = useState(segundos ?? 0)
  const audio = useRef(false)

  useEffect(() => {
    setRestante(segundos ?? 0)
    audio.current = false
  }, [segundos])

  useEffect(() => {
    if (segundos === null) return
    const id = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(id)
  }, [segundos])

  useEffect(() => {
    if (restante === 0 && segundos !== null && !audio.current) {
      audio.current = true
      if ('vibrate' in navigator) navigator.vibrate?.([120, 80, 120])
    }
  }, [restante, segundos])

  if (segundos === null) return null

  const mm = String(Math.floor(restante / 60)).padStart(2, '0')
  const ss = String(restante % 60).padStart(2, '0')
  const listo = restante === 0

  return (
    <div className="fixed inset-x-0 bottom-[56px] z-30 border-t border-marino-700 bg-marino-900/98 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <span>
          <span className="rotulo">{listo ? 'Descanso cumplido' : 'Descanso'}</span>
          <span className={`cifra block text-3xl font-bold ${listo ? 'text-dorado-400' : 'text-pergamino'}`}>
            {mm}:{ss}
          </span>
        </span>
        <span className="flex gap-2">
          <button type="button" className="boton px-3" onClick={() => setRestante((r) => r + 30)}>
            +30 s
          </button>
          <button type="button" className="boton-dorado px-5" onClick={onCerrar}>
            {listo ? 'Seguir' : 'Saltar'}
          </button>
        </span>
      </div>
    </div>
  )
}
