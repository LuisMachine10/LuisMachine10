import { useMemo, useState } from 'react'
import { registrarMovimiento } from '../datos/capital'
import { hoyISO } from '../dominio/dias'
import type { Cuenta, OrigenMovimiento } from '../dominio/capital/tipos'

/**
 * Registrar un movimiento sin saber contabilidad.
 *
 * Tú dices "gasté" o "me entró"; la partida doble ocurre debajo. Nunca se te
 * pide elegir un debe y un haber — eso es trabajo de la app, no tuyo.
 */
type Tipo = 'GASTE' | 'ENTRO' | 'TRASPASE' | 'PAGUE_DEUDA'

const TIPOS: { tipo: Tipo; etiqueta: string; desde: string; hacia: string }[] = [
  { tipo: 'GASTE', etiqueta: 'Gasté', desde: 'Pagué con', hacia: 'En qué' },
  { tipo: 'ENTRO', etiqueta: 'Me entró', desde: 'De dónde', hacia: 'Entró a' },
  { tipo: 'TRASPASE', etiqueta: 'Moví', desde: 'De', hacia: 'A' },
  { tipo: 'PAGUE_DEUDA', etiqueta: 'Pagué deuda', desde: 'Pagué con', hacia: 'Qué deuda' },
]

/** Qué cuentas ofrecer en cada lado, según lo que el usuario dijo que pasó. */
function opciones(tipo: Tipo, cuentas: Cuenta[]) {
  const activas = cuentas.filter((c) => c.activa)
  const activos = activas.filter((c) => c.clase === 'ACTIVO')
  const pasivos = activas.filter((c) => c.clase === 'PASIVO')
  switch (tipo) {
    case 'GASTE':
      return { origen: [...activos, ...pasivos], destino: activas.filter((c) => c.clase === 'GASTO') }
    case 'ENTRO':
      return { origen: activas.filter((c) => c.clase === 'INGRESO'), destino: activos }
    case 'TRASPASE':
      return { origen: activos, destino: activos }
    case 'PAGUE_DEUDA':
      return { origen: activos, destino: pasivos }
  }
}

export function AsientoNuevo({
  cuentas,
  onListo,
  onCancelar,
}: {
  cuentas: Cuenta[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [tipo, setTipo] = useState<Tipo>('GASTE')
  const [fecha, setFecha] = useState(hoyISO())
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [montoHaber, setMontoHaber] = useState('')
  const [origen, setOrigen] = useState<number | ''>('')
  const [destino, setDestino] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const listas = useMemo(() => opciones(tipo, cuentas), [tipo, cuentas])
  const etiquetas = TIPOS.find((t) => t.tipo === tipo)!
  const cDestino = cuentas.find((c) => c.id === destino)
  const cOrigen = cuentas.find((c) => c.id === origen)
  const cruzaMonedas = !!cOrigen && !!cDestino && cOrigen.moneda !== cDestino.moneda

  async function guardar() {
    setError(null)
    const n = Number(monto.replace(/,/g, ''))
    if (!(n > 0)) return setError('El monto tiene que ser mayor que cero.')
    if (origen === '' || destino === '') return setError('Falta elegir las dos cuentas.')

    const nHaber = Number(montoHaber.replace(/,/g, ''))
    if (cruzaMonedas && !(nHaber > 0)) {
      return setError(`Como ${cOrigen!.nombre} está en ${cOrigen!.moneda} y ${cDestino!.nombre} en ${cDestino!.moneda}, hace falta el monto de los dos lados.`)
    }

    setGuardando(true)
    try {
      // El debe siempre es lo que aumenta: el gasto, la cuenta que recibe, el
      // pasivo que baja. El haber es de dónde salió.
      await registrarMovimiento({
        fecha,
        descripcion: descripcion.trim() || etiquetas.etiqueta,
        monto: n,
        debe: Number(destino),
        haber: Number(origen),
        ...(cruzaMonedas ? { montoHaber: nHaber } : {}),
        origen: 'manual' as OrigenMovimiento,
        conciliado: false,
      })
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const selector = (
    valor: number | '',
    cambiar: (v: number | '') => void,
    lista: Cuenta[],
    etiqueta: string,
  ) => (
    <label className="block">
      <span className="rotulo">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => cambiar(e.target.value === '' ? '' : Number(e.target.value))}
        className="campo mt-1 font-sans text-base"
      >
        <option value="">Elegir…</option>
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}{c.moneda === 'USD' ? ' (US$)' : ''}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-4 pb-32">
      <header className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl">Registrar movimiento</h2>
        <button type="button" onClick={onCancelar} className="rotulo text-humo">
          Cancelar
        </button>
      </header>

      <div className="grid grid-cols-4 gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.tipo}
            type="button"
            onClick={() => { setTipo(t.tipo); setOrigen(''); setDestino('') }}
            className={`min-h-[48px] rounded-md border px-1 text-[11px] font-semibold transition ${
              tipo === t.tipo
                ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400'
                : 'border-marino-700 text-humo'
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="rotulo">Monto {cOrigen?.moneda === 'USD' && tipo !== 'GASTE' ? '(US$)' : '(RD$)'}</span>
        <input
          inputMode="decimal"
          placeholder="0"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          className="campo mt-1 text-2xl"
        />
      </label>

      {selector(destino, setDestino, listas.destino, etiquetas.hacia)}
      {selector(origen, setOrigen, listas.origen, etiquetas.desde)}

      {cruzaMonedas && (
        <label className="block">
          <span className="rotulo">
            Monto que salió de {cOrigen!.nombre} ({cOrigen!.moneda})
          </span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={montoHaber}
            onChange={(e) => setMontoHaber(e.target.value)}
            className="campo mt-1"
          />
          <span className="mt-1 block text-xs text-humo">
            Los dos montos, porque la tasa a la que ocurrió es un dato, no una suposición.
          </span>
        </label>
      )}

      <label className="block">
        <span className="rotulo">Fecha</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo mt-1" />
      </label>

      <label className="block">
        <span className="rotulo">Descripción</span>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Opcional"
          className="campo mt-1 font-sans"
        />
      </label>

      {error && (
        <p className="rounded-md border border-rojo/60 bg-rojo/10 p-3 text-sm text-pergamino">{error}</p>
      )}

      <button type="button" onClick={guardar} disabled={guardando} className="boton-dorado w-full">
        {guardando ? 'Guardando…' : 'Registrar'}
      </button>
    </div>
  )
}
