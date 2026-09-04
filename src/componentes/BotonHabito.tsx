interface Props {
  etiqueta: string
  puntos: number
  activo: boolean
  aplica: boolean
  onToggle: () => void
}

/** Un toque. Nada más. */
export function BotonHabito({ etiqueta, puntos, activo, aplica, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={activo}
      className={[
        'flex min-h-[76px] flex-col justify-between rounded-lg border p-3 text-left transition active:scale-[0.98]',
        activo
          ? 'border-dorado-600 bg-dorado-600/15'
          : 'border-marino-800 bg-marino-900/60',
        !aplica && !activo ? 'opacity-55' : '',
      ].join(' ')}
    >
      <span className="text-[13px] font-semibold leading-tight">{etiqueta}</span>
      <span className="flex items-center justify-between">
        <span className={`cifra text-xs ${activo ? 'text-dorado-400' : 'text-humo'}`}>{puntos} pts</span>
        {!aplica && <span className="text-[10px] text-humo">no lo pide hoy</span>}
      </span>
    </button>
  )
}
