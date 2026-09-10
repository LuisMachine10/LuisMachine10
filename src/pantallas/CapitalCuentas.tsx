import { useMemo, useState } from 'react'
import { crearCuenta } from '../datos/capital'
import { usarCuentas } from '../datos/hooks'
import { hoyISO } from '../dominio/dias'
import { montoRD } from '../dominio/capital/formato'
import { PLAN_SUGERIDO, type CuentaPropuesta } from '../dominio/capital/plan-cuentas'
import { NOMBRE_GRUPO, type ClaseCuenta } from '../dominio/capital/tipos'

const ORDEN: { clase: ClaseCuenta; titulo: string; ayuda: string }[] = [
  { clase: 'ACTIVO', titulo: 'Lo que tienes', ayuda: 'Pon el saldo con el que entra al sistema. Ese número sale de tu libreta.' },
  { clase: 'PASIVO', titulo: 'Lo que debes', ayuda: 'El capital que debes, positivo. Los intereses son gasto, no pasivo.' },
  { clase: 'INGRESO', titulo: 'Lo que entra', ayuda: 'No llevan saldo inicial: se miden mes por mes.' },
  { clase: 'GASTO', titulo: 'Lo que sale', ayuda: 'Igual: cada mes empieza en cero.' },
]

/**
 * El plan de cuentas. La app propone, tú confirmas — nada entra sin que lo
 * adoptes, y cada sugerencia dice por qué está ahí.
 */
export function CapitalCuentas({ onVolver }: { onVolver: () => void }) {
  const cuentas = usarCuentas()
  const [saldos, setSaldos] = useState<Record<string, string>>({})
  const [fecha, setFecha] = useState(hoyISO())
  const [guardando, setGuardando] = useState(false)

  const yaExiste = useMemo(() => new Set(cuentas.map((c) => c.nombre)), [cuentas])
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())

  const alternar = (nombre: string) =>
    setElegidas((prev) => {
      const s = new Set(prev)
      s.has(nombre) ? s.delete(nombre) : s.add(nombre)
      return s
    })

  async function adoptar() {
    setGuardando(true)
    try {
      for (const p of PLAN_SUGERIDO) {
        if (!elegidas.has(p.nombre) || yaExiste.has(p.nombre)) continue
        const bruto = Number((saldos[p.nombre] ?? '').replace(/,/g, ''))
        const saldo = p.clase === 'ACTIVO' || p.clase === 'PASIVO' ? (Number.isFinite(bruto) ? bruto : 0) : 0
        await crearCuenta(p, saldo, fecha)
      }
      setElegidas(new Set())
      setSaldos({})
    } finally {
      setGuardando(false)
    }
  }

  const llevaSaldo = (p: CuentaPropuesta) => p.clase === 'ACTIVO' || p.clase === 'PASIVO'

  return (
    <div className="space-y-5 pb-32">
      <header className="space-y-1">
        <button type="button" onClick={onVolver} className="rotulo text-dorado-400">
          ← Volver
        </button>
        <h1 className="font-serif text-2xl">Plan de cuentas</h1>
        <p className="text-sm text-humo">
          Marca las que uses. Los saldos iniciales son el punto donde tu libreta entra al
          sistema: a partir de ahí, todo se calcula solo.
        </p>
      </header>

      <div className="tarjeta space-y-2">
        <div className="rotulo">Fecha de apertura</div>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="campo"
        />
        <p className="text-xs text-humo">
          El día al que corresponden esos saldos. Normalmente el cierre del mes pasado.
        </p>
      </div>

      {ORDEN.map(({ clase, titulo, ayuda }) => (
        <section key={clase} className="space-y-2">
          <div>
            <h2 className="rotulo">{titulo}</h2>
            <p className="text-xs text-humo">{ayuda}</p>
          </div>
          {PLAN_SUGERIDO.filter((p) => p.clase === clase).map((p) => {
            const puesta = yaExiste.has(p.nombre)
            const marcada = elegidas.has(p.nombre)
            return (
              <div
                key={p.nombre}
                className={`tarjeta ${marcada ? 'border-dorado-600' : ''} ${puesta ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  disabled={puesta}
                  onClick={() => alternar(p.nombre)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className={`mt-0.5 h-5 w-5 shrink-0 rounded border ${
                      marcada || puesta ? 'border-dorado-600 bg-dorado-600' : 'border-marino-700'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{p.nombre}</span>
                    <span className="block text-xs text-humo">
                      {NOMBRE_GRUPO[p.grupo]}
                      {p.moneda === 'USD' && ' · US$'}
                    </span>
                    <span className="mt-1 block text-xs italic text-humo">{p.porQue}</span>
                  </span>
                </button>

                {marcada && llevaSaldo(p) && (
                  <label className="mt-3 block">
                    <span className="rotulo">
                      Saldo al {fecha} {p.moneda === 'USD' ? '(US$)' : '(RD$)'}
                    </span>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={saldos[p.nombre] ?? ''}
                      onChange={(e) => setSaldos((s) => ({ ...s, [p.nombre]: e.target.value }))}
                      className="campo mt-1"
                    />
                  </label>
                )}
                {puesta && <p className="mt-2 text-xs text-verde">Ya está en tu plan.</p>}
              </div>
            )
          })}
        </section>
      ))}

      {cuentas.length > 0 && (
        <section className="space-y-2">
          <h2 className="rotulo">Tus cuentas ({cuentas.length})</h2>
          {cuentas.map((c) => (
            <div key={c.id} className="tarjeta flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm">{c.nombre}</span>
                <span className="rotulo">{NOMBRE_GRUPO[c.grupo]}</span>
              </span>
              {c.saldoInicial !== 0 && (
                <span className="cifra shrink-0 text-sm text-humo">
                  {c.moneda === 'USD' ? `US$ ${c.saldoInicial}` : montoRD(c.saldoInicial)}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {elegidas.size > 0 && (
        <div className="fixed inset-x-0 bottom-[56px] z-20 border-t border-marino-800 bg-marino-950/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={adoptar}
              disabled={guardando}
              className="boton-dorado w-full"
            >
              {guardando ? 'Guardando…' : `Adoptar ${elegidas.size} ${elegidas.size === 1 ? 'cuenta' : 'cuentas'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
