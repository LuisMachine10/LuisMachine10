import { useMemo, useState } from 'react'
import { AsientoNuevo } from '../componentes/AsientoNuevo'
import { TASAS_POR_DEFECTO } from '../datos/capital'
import { usarCuentas, usarMovimientos, usarPresupuesto, usarTasaUSD } from '../datos/hooks'
import { articular, cuadrarCaja } from '../dominio/capital/articulacion'
import { flujoDelMes } from '../dominio/capital/flujo'
import { monto, montoConSigno, montoRD, oRaya, pct, pctConSigno } from '../dominio/capital/formato'
import { mesAnterior, mesDe, nombreMes, sumarMeses, ultimoDia, ultimosMeses } from '../dominio/capital/meses'
import { compararPresupuesto } from '../dominio/capital/presupuesto'
import { estadoResultados, promedioMensual, serieResultados } from '../dominio/capital/resultados'
import { compararSituacion, estadoSituacion, indicadores } from '../dominio/capital/situacion'
import { NOMBRE_GRUPO } from '../dominio/capital/tipos'
import { hoyISO } from '../dominio/dias'
import { CapitalCuentas } from './CapitalCuentas'

type Vista = 'SITUACION' | 'RESULTADOS' | 'FLUJO' | 'PRESUPUESTO'

const VISTAS: { v: Vista; etiqueta: string }[] = [
  { v: 'SITUACION', etiqueta: 'Situación' },
  { v: 'RESULTADOS', etiqueta: 'Resultados' },
  { v: 'FLUJO', etiqueta: 'Flujo' },
  { v: 'PRESUPUESTO', etiqueta: 'Presupuesto' },
]

export function Capital() {
  const cuentas = usarCuentas()
  const movimientos = usarMovimientos()
  const presupuesto = usarPresupuesto()
  const usd = usarTasaUSD(TASAS_POR_DEFECTO.usd)

  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [vista, setVista] = useState<Vista>('SITUACION')
  const [modo, setModo] = useState<'panel' | 'cuentas' | 'asiento'>('panel')

  const tasas = useMemo(() => ({ usd }), [usd])

  const calculo = useMemo(() => {
    if (cuentas.length === 0) return null
    const cierre = estadoSituacion(cuentas, movimientos, ultimoDia(mes), tasas)
    const antes = estadoSituacion(cuentas, movimientos, ultimoDia(mesAnterior(mes)), tasas)
    const resultados = estadoResultados(cuentas, movimientos, mes, tasas)
    const serie = serieResultados(cuentas, movimientos, ultimosMeses(mes, 12), tasas)
    const prom = promedioMensual(serie)
    return {
      cierre,
      antes,
      resultados,
      prom,
      variaciones: compararSituacion(antes, cierre),
      ind: indicadores(cierre, prom.gastos),
      flujo: flujoDelMes(cuentas, movimientos, mes, tasas),
      ppto: compararPresupuesto(cuentas, movimientos, presupuesto, mes, tasas),
      art: articular(cuentas, movimientos, mes, tasas),
      caja: cuadrarCaja(cuentas, movimientos, mes, tasas),
    }
  }, [cuentas, movimientos, presupuesto, mes, tasas])

  if (modo === 'cuentas') return <CapitalCuentas onVolver={() => setModo('panel')} />

  if (modo === 'asiento') {
    return (
      <AsientoNuevo
        cuentas={cuentas}
        onListo={() => setModo('panel')}
        onCancelar={() => setModo('panel')}
      />
    )
  }

  if (!calculo) {
    return (
      <div className="space-y-4 pb-24">
        <h1 className="font-serif text-2xl">Mena Capital</h1>
        <div className="tarjeta space-y-3">
          <p className="text-sm text-humo">
            Todavía no hay plan de cuentas. Sin saber qué tienes y qué debes, no hay nada
            que calcular — la app pide, no supone.
          </p>
          <p className="text-sm text-humo">
            El presupuesto, el estado de situación y el flujo salen todos del mismo libro,
            así que empiezan en el mismo lugar: tus cuentas y los saldos con que entran.
          </p>
          <button type="button" onClick={() => setModo('cuentas')} className="boton-dorado w-full">
            Armar el plan de cuentas
          </button>
        </div>
      </div>
    )
  }

  const { cierre, resultados, prom, variaciones, ind, flujo, ppto, art, caja } = calculo
  const patrimonio = variaciones.find((v) => v.nombre === 'Patrimonio')!

  return (
    <div className="space-y-4 pb-32">
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Mena Capital</h1>
        <button type="button" onClick={() => setModo('cuentas')} className="rotulo text-dorado-400">
          Cuentas
        </button>
      </header>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMes(sumarMeses(mes, -1))} className="boton px-4">
          ←
        </button>
        <span className="text-sm font-semibold capitalize">{nombreMes(mes)}</span>
        <button type="button" onClick={() => setMes(sumarMeses(mes, 1))} className="boton px-4">
          →
        </button>
      </div>

      {/* El número que manda. Un solo acento dorado por pantalla. */}
      <div className="tarjeta">
        <div className="rotulo">Patrimonio neto</div>
        <div className="cifra mt-1 text-3xl font-bold text-dorado-400">{montoRD(cierre.patrimonio)}</div>
        <div className="mt-1 text-sm text-humo">
          <span className={patrimonio.cambio >= 0 ? 'text-verde' : 'text-rojo'}>
            {montoConSigno(patrimonio.cambio)}
          </span>{' '}
          contra {nombreMes(mesAnterior(mes))} · {pctConSigno(patrimonio.cambioPct)}
        </div>
      </div>

      {/* La confianza no se pide, se demuestra. */}
      <div
        className={`rounded-lg border p-3 text-xs ${
          art.cuadra && caja.cuadra
            ? 'border-verde/50 bg-verde/10 text-humo'
            : 'border-dorado-600/60 bg-dorado-600/10'
        }`}
      >
        {art.cuadra && caja.cuadra ? (
          <>
            <span className="font-semibold text-pergamino">Los tres estados cuadran.</span>{' '}
            Patrimonio inicial {monto(art.patrimonioInicial)} + resultado {montoConSigno(art.resultado)}
            {art.aperturas !== 0 && ` + apertura ${montoConSigno(art.aperturas)}`}
            {art.aportes !== 0 && ` + aportes ${montoConSigno(art.aportes)}`}
            {art.retiros !== 0 && ` − retiros ${monto(art.retiros)}`} = {monto(art.patrimonioFinal)}.
          </>
        ) : (
          <>
            <span className="font-semibold text-dorado-400">Hay {montoRD(Math.abs(art.diferencia))} sin explicar.</span>{' '}
            Casi siempre es el efecto de convertir a una sola tasa movimientos que ocurrieron a otra.
            No es un error, pero no pasa en silencio.
          </>
        )}
      </div>

      <nav className="grid grid-cols-4 gap-1">
        {VISTAS.map(({ v, etiqueta }) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className={`min-h-[44px] rounded-md text-[11px] font-semibold transition ${
              vista === v ? 'bg-marino-800 text-dorado-400' : 'text-humo'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </nav>

      {vista === 'SITUACION' && (
        <section className="space-y-3">
          {[...cierre.activos, ...cierre.pasivos].map((b) => (
            <div key={b.grupo} className="tarjeta">
              <div className="flex items-baseline justify-between">
                <span className="rotulo">{b.nombre}</span>
                <span className="cifra text-sm font-semibold">{monto(b.totalDOP)}</span>
              </div>
              <div className="mt-2 space-y-1">
                {b.renglones.map((r) => (
                  <div key={r.cuentaId} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-humo">{r.nombre}</span>
                    <span className="cifra shrink-0">
                      {r.moneda === 'USD' ? `US$ ${monto(r.saldo)} · ` : ''}
                      {monto(r.saldoDOP)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="tarjeta space-y-1 text-sm">
            <Linea etiqueta="Activos" valor={monto(cierre.totalActivos)} />
            <Linea etiqueta="Pasivos" valor={monto(cierre.totalPasivos)} />
            <Linea etiqueta="Patrimonio" valor={monto(cierre.patrimonio)} fuerte />
          </div>

          <div className="tarjeta space-y-2">
            <div className="rotulo">Lo que estos números significan</div>
            <Linea etiqueta="Endeudamiento" valor={oRaya(ind.endeudamiento, (x) => pct(x * 100))} />
            <Linea etiqueta="Caja / deuda exigible" valor={oRaya(ind.liquidez, (x) => `${x.toFixed(2)}×`)} />
            <Linea
              etiqueta="Meses de colchón"
              valor={oRaya(ind.mesesDeColchon, (x) => `${x.toFixed(1)} meses`)}
            />
            <p className="text-xs text-humo">
              El colchón usa tu gasto promedio de {prom.meses}{' '}
              {prom.meses === 1 ? 'mes' : 'meses'} con movimiento: {montoRD(prom.gastos)}.
              Es cuánto aguantas sin que entre un peso.
            </p>
          </div>
        </section>
      )}

      {vista === 'RESULTADOS' && (
        <section className="space-y-3">
          <div className="tarjeta space-y-1 text-sm">
            <Linea etiqueta="Ingresos" valor={monto(resultados.totalIngresos)} />
            <Linea etiqueta="Gastos" valor={monto(resultados.totalGastos)} />
            <Linea etiqueta="Resultado" valor={monto(resultados.resultado)} fuerte />
            {resultados.noRealizado !== 0 && (
              <>
                <Linea etiqueta="Del cual, no realizado" valor={monto(resultados.noRealizado)} />
                <p className="pt-1 text-xs text-humo">
                  Esa parte subió en papel y no pagó nada. Por eso la tasa de ahorro se
                  calcula sobre lo realizado: {montoRD(resultados.resultadoRealizado)}.
                </p>
              </>
            )}
            <Linea etiqueta="Tasa de ahorro" valor={pct(resultados.tasaAhorro)} />
          </div>

          <Bloque titulo="Entró" renglones={resultados.ingresos} />
          <Bloque titulo="Salió" renglones={resultados.gastos} />

          <div className="tarjeta space-y-1 text-sm">
            <div className="rotulo">Promedio de {prom.meses} {prom.meses === 1 ? 'mes' : 'meses'}</div>
            <Linea etiqueta="Ingresos" valor={monto(prom.ingresos)} />
            <Linea etiqueta="Gasto fijo" valor={monto(prom.gastoFijo)} />
            <Linea etiqueta="Gasto variable" valor={monto(prom.gastoVariable)} />
            <p className="pt-1 text-xs text-humo">
              Los meses sin registrar no entran al promedio: un mes sin datos no es un mes en cero.
            </p>
          </div>
        </section>
      )}

      {vista === 'FLUJO' && (
        <section className="space-y-3">
          <div className="tarjeta space-y-1 text-sm">
            <Linea etiqueta="Caja al inicio" valor={monto(flujo.saldoInicial)} />
            {flujo.aperturas !== 0 && <Linea etiqueta="Saldos de apertura" valor={monto(flujo.aperturas)} />}
            <Linea etiqueta="Entró" valor={monto(flujo.entradas)} />
            <Linea etiqueta="Salió" valor={monto(flujo.salidas)} />
            <Linea etiqueta="Caja al cierre" valor={monto(flujo.saldoFinal)} fuerte />
          </div>

          <div className="tarjeta space-y-1 text-sm">
            <div className="rotulo">De dónde vino el movimiento</div>
            <Linea etiqueta="Operación" valor={montoConSigno(flujo.operacion)} />
            <Linea etiqueta="Inversión" valor={montoConSigno(flujo.inversion)} />
            <Linea etiqueta="Financiamiento" valor={montoConSigno(flujo.financiamiento)} />
          </div>

          <div className="tarjeta">
            <div className="rotulo">Resultado contra caja</div>
            <div className="mt-2 space-y-1 text-sm">
              <Linea etiqueta="Resultado del mes" valor={monto(resultados.resultado)} />
              <Linea etiqueta="Flujo de caja" valor={monto(flujo.flujoNeto)} />
              <Linea
                etiqueta="Diferencia"
                valor={montoConSigno(resultados.resultado - flujo.flujoNeto)}
                fuerte
              />
            </div>
            <p className="mt-2 text-xs text-humo">
              Si hubo resultado y la caja no lo refleja, los pesos están en algún lado:
              inventario de tu vida — certificados, inversiones, deuda que bajó, o ganancia
              que solo existe en papel. Sigue el dinero.
            </p>
          </div>
        </section>
      )}

      {vista === 'PRESUPUESTO' && (
        <section className="space-y-3">
          {ppto.ingresos.length === 0 && ppto.gastos.length === 0 ? (
            <div className="tarjeta text-sm text-humo">
              Todavía no hay presupuesto para {nombreMes(mes)} ni movimientos que comparar.
            </div>
          ) : (
            <>
              <div className="tarjeta space-y-1 text-sm">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3">
                  <span className="rotulo">Resultado</span>
                  <span className="rotulo text-right">Ppto.</span>
                  <span className="rotulo text-right">Real</span>
                </div>
                <Fila etiqueta="Ingresos" a={ppto.ingresosPpto} b={ppto.ingresosReal} />
                <Fila etiqueta="Gastos" a={ppto.gastosPpto} b={ppto.gastosReal} />
                <Fila etiqueta="Neto" a={ppto.resultadoPpto} b={ppto.resultadoReal} fuerte />
                <p className="pt-1 text-xs text-humo">
                  Te fue {montoConSigno(ppto.varianzaResultado)} contra lo planificado.
                </p>
              </div>

              {ppto.mayoresDesviaciones.length > 0 && (
                <div className="tarjeta">
                  <div className="rotulo">Lo que más se desvió</div>
                  <div className="mt-2 space-y-2">
                    {ppto.mayoresDesviaciones.map((v) => (
                      <div key={v.cuentaId} className="text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate">{v.nombre}</span>
                          <span className={`cifra shrink-0 ${v.favorable ? 'text-verde' : 'text-rojo'}`}>
                            {montoConSigno(v.varianza)}
                          </span>
                        </div>
                        <div className="rotulo">
                          {v.noPresupuestado
                            ? 'No estaba presupuestado'
                            : `${monto(v.presupuestado)} → ${monto(v.real)} · ${pctConSigno(v.varianzaPct)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {[
                { titulo: 'Ingresos', lista: ppto.ingresos },
                { titulo: 'Gastos', lista: ppto.gastos },
              ].map(({ titulo, lista }) => (
                <div key={titulo} className="tarjeta">
                  <div className="rotulo">{titulo}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {lista.map((v) => (
                      <div key={v.cuentaId} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3">
                        <span className="min-w-0 truncate text-humo">{v.nombre}</span>
                        <span className="cifra text-right text-humo">{monto(v.presupuestado)}</span>
                        <span className={`cifra text-right ${v.favorable ? '' : 'text-rojo'}`}>
                          {monto(v.real)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-[56px] z-20 border-t border-marino-800 bg-marino-950/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md px-1">
          <button type="button" onClick={() => setModo('asiento')} className="boton-dorado w-full">
            Registrar movimiento
          </button>
        </div>
      </div>
    </div>
  )
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t border-marino-800 pt-1 font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-humo'}>{etiqueta}</span>
      <span className="cifra shrink-0">{valor}</span>
    </div>
  )
}

function Fila({ etiqueta, a, b, fuerte }: { etiqueta: string; a: number; b: number; fuerte?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-3 ${fuerte ? 'border-t border-marino-800 pt-1 font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-humo'}>{etiqueta}</span>
      <span className="cifra text-right text-humo">{monto(a)}</span>
      <span className="cifra text-right">{monto(b)}</span>
    </div>
  )
}

function Bloque({ titulo, renglones }: { titulo: string; renglones: { cuentaId: number; nombre: string; monto: number; pesoPct: number; grupo: string }[] }) {
  if (renglones.length === 0) return null
  return (
    <div className="tarjeta">
      <div className="rotulo">{titulo}</div>
      <div className="mt-2 space-y-2 text-sm">
        {renglones.map((r) => (
          <div key={r.cuentaId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{r.nombre}</span>
              <span className="cifra shrink-0">{monto(r.monto)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-marino-800">
                <div className="h-full bg-dorado-600/70" style={{ width: `${Math.min(r.pesoPct, 100)}%` }} />
              </div>
              <span className="rotulo shrink-0">{NOMBRE_GRUPO[r.grupo as keyof typeof NOMBRE_GRUPO]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
