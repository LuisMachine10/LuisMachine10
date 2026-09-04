import { useMemo, useState } from 'react'
import { AnilloPuntaje } from '../componentes/AnilloPuntaje'
import { BarraMacro } from '../componentes/BarraMacro'
import { BotonHabito } from '../componentes/BotonHabito'
import { CampoNumero } from '../componentes/CampoNumero'
import { ContadorAgua } from '../componentes/ContadorAgua'
import { Hoja } from '../componentes/Hoja'
import { usarHorarioDelDia, usarPerfil, usarRegistro, usarUltimosDias } from '../datos/hooks'
import {
  alternarToggle, cambiarTipoDia, fijarVasos, guardarRegistro, vasosDesdeLitros,
} from '../datos/registros'
import { diaSemana, fechaLarga, hoyISO, sumarDias, tipoDiaPorDefecto, tituloDelDia } from '../dominio/dias'
import { minutosDeAhora, siguienteBloque } from '../dominio/horario'
import { metaDelDia, trazabilidadMetas } from '../dominio/metas'
import { resumirPeriodo } from '../dominio/promedios'
import { RENGLONES, calcularPuntaje, registroVacio } from '../dominio/puntaje'
import type { ClaveToggle } from '../dominio/puntaje'
import type { TipoDia } from '../dominio/tipos'

const TIPOS: TipoDia[] = ['ENTRENO', 'LIGERO', 'AYUNO']

export function Hoy() {
  const [fecha, setFecha] = useState(hoyISO())
  const [verDesglose, setVerDesglose] = useState(false)
  const [verProcedencia, setVerProcedencia] = useState(false)

  const perfil = usarPerfil()
  const registro = usarRegistro(fecha)
  const ultimos30 = usarUltimosDias(fecha, 30)
  const bloquesHoy = usarHorarioDelDia(diaSemana(fecha))

  const tipoDia = registro?.tipoDia ?? tipoDiaPorDefecto(fecha)
  const meta = useMemo(() => metaDelDia(perfil, tipoDia), [perfil, tipoDia])
  const registroEfectivo = useMemo(
    () => registro ?? registroVacio(fecha, tipoDia),
    [registro, fecha, tipoDia],
  )
  const resultado = useMemo(() => calcularPuntaje(registroEfectivo, perfil), [registroEfectivo, perfil])
  const resumen = useMemo(() => resumirPeriodo(ultimos30, perfil), [ultimos30, perfil])
  const proximo = useMemo(
    () => (fecha === hoyISO() ? siguienteBloque(bloquesHoy, minutosDeAhora()) : bloquesHoy[0] ?? null),
    [bloquesHoy, fecha],
  )

  const toggles = RENGLONES.filter((r) => r.esToggle)
  const esHoy = fecha === hoyISO()

  return (
    <div className="space-y-4 pb-28">
      {/* Cabecera */}
      <header className="flex items-center justify-between gap-2">
        <button type="button" className="boton px-3" onClick={() => setFecha(sumarDias(fecha, -1))}>
          ‹
        </button>
        <div className="text-center">
          <h1 className="font-serif text-lg leading-tight">{fechaLarga(fecha)}</h1>
          <p className="text-[11px] text-humo">{tituloDelDia(fecha)}</p>
        </div>
        <button
          type="button"
          className="boton px-3 disabled:opacity-30"
          disabled={esHoy}
          onClick={() => setFecha(sumarDias(fecha, 1))}
        >
          ›
        </button>
      </header>

      {/* Puntaje + tipo de día */}
      <section className="tarjeta flex items-center gap-4">
        <AnilloPuntaje puntaje={resultado.puntaje} pctAplicable={resultado.pctAplicable} tamano={112} />
        <div className="min-w-0 flex-1">
          <span className="rotulo">Tipo de día</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => cambiarTipoDia(fecha, t)}
                className={`min-h-[40px] rounded border text-[9px] font-bold tracking-tight transition ${
                  tipoDia === t
                    ? 'border-dorado-600 bg-dorado-600/20 text-dorado-400'
                    : 'border-marino-700 text-humo'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-left text-[11px] text-dorado-400 underline underline-offset-2"
            onClick={() => setVerDesglose(true)}
          >
            Ver de dónde salen estos puntos
          </button>
        </div>
      </section>

      {!resultado.registrado && (
        <div className="tarjeta border-marino-700 text-[12px] text-humo">
          Este día no está contando en los promedios. Un día sin registrar no es lo mismo que un día malo.
          <button
            type="button"
            className="boton mt-3 w-full"
            onClick={() => guardarRegistro(fecha, { tipoDia, cerradoEnCero: true })}
          >
            Cerrarlo en cero y que cuente
          </button>
        </div>
      )}

      {/* Hábitos */}
      <section>
        <span className="rotulo">Hábitos</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {toggles.map((def) => {
            const r = resultado.renglones.find((x) => x.clave === def.clave)!
            return (
              <BotonHabito
                key={def.clave}
                etiqueta={def.etiqueta}
                puntos={def.puntos}
                activo={r.cumplido}
                aplica={r.aplica}
                onToggle={() => alternarToggle(fecha, def.clave as ClaveToggle)}
              />
            )
          })}
        </div>
      </section>

      {/* Agua */}
      <ContadorAgua
        vasos={vasosDesdeLitros(registro?.aguaL ?? null)}
        metaL={meta.aguaL}
        onFijar={(v) => fijarVasos(fecha, v)}
      />

      {/* Macros */}
      <section className="tarjeta space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="rotulo">Macros del día</span>
          <button
            type="button"
            className="text-[11px] text-dorado-400 underline underline-offset-2"
            onClick={() => setVerProcedencia(true)}
          >
            ¿De dónde salen estas metas?
          </button>
        </div>
        {tipoDia === 'AYUNO' ? (
          <p className="text-[12px] text-humo">
            Día de ayuno: la meta es no comer hasta la cena de ruptura. El puntaje mira el techo de{' '}
            <span className="cifra">{perfil.techoKcalAyuno}</span> kcal.
          </p>
        ) : (
          <>
            <BarraMacro etiqueta="Proteína" valor={registro?.proteinaG ?? null} meta={meta.proteinaG} unidad="g" />
            <BarraMacro
              etiqueta="Calorías" valor={registro?.kcal ?? null} meta={meta.kcal} unidad="kcal"
              tolerancia={perfil.toleranciaKcal}
            />
            <BarraMacro etiqueta="Carbohidratos" valor={registro?.carbG ?? null} meta={meta.carbsG} unidad="g" />
            <BarraMacro etiqueta="Grasa" valor={registro?.grasaG ?? null} meta={meta.grasaG} unidad="g" />
          </>
        )}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <CampoNumero
            etiqueta="Proteína" unidad="g" valor={registro?.proteinaG ?? null}
            onCambio={(v) => guardarRegistro(fecha, { proteinaG: v })}
          />
          <CampoNumero
            etiqueta="Calorías" unidad="kcal" paso={10} valor={registro?.kcal ?? null}
            onCambio={(v) => guardarRegistro(fecha, { kcal: v })}
          />
          <CampoNumero
            etiqueta="Carbs" unidad="g" valor={registro?.carbG ?? null}
            onCambio={(v) => guardarRegistro(fecha, { carbG: v })}
          />
          <CampoNumero
            etiqueta="Grasa" unidad="g" valor={registro?.grasaG ?? null}
            onCambio={(v) => guardarRegistro(fecha, { grasaG: v })}
          />
        </div>
        <p className="text-[11px] text-humo">
          Fase 1: se escriben a mano, como en la BITÁCORA. En la Fase 2 los calcula el peso de la comida.
        </p>
      </section>

      {/* Estudio y sueño */}
      <section className="tarjeta grid grid-cols-2 gap-3">
        <CampoNumero
          etiqueta="Estudio" unidad="min" paso={15} meta={`${meta.estudioMin} min`}
          valor={registro?.estudioMin ?? null}
          onCambio={(v) => guardarRegistro(fecha, { estudioMin: v })}
        />
        <CampoNumero
          etiqueta="Sueño" unidad="h" paso={0.5} meta={`${meta.suenoH} h`}
          valor={registro?.suenoH ?? null}
          onCambio={(v) => guardarRegistro(fecha, { suenoH: v })}
        />
      </section>

      {/* Próximo bloque */}
      {proximo && (
        <section className="tarjeta">
          <span className="rotulo">{esHoy ? 'Lo próximo' : 'Primer bloque del día'}</span>
          <p className="mt-1">
            <span className="cifra text-dorado-400">{proximo.hora}</span>{' '}
            <span className="font-semibold">{proximo.actividad}</span>
          </p>
          {proximo.detalle && <p className="mt-0.5 text-[12px] text-humo">{proximo.detalle}</p>}
        </section>
      )}

      {/* Notas */}
      <section className="tarjeta">
        <span className="rotulo">Notas del día</span>
        <textarea
          className="campo mt-1.5 min-h-[72px] font-sans text-sm"
          placeholder="Qué pasó hoy. Una línea basta."
          value={registro?.notas ?? ''}
          onChange={(e) => guardarRegistro(fecha, { notas: e.target.value })}
        />
      </section>

      {/* Promedio de 30 días */}
      <section className="tarjeta">
        <span className="rotulo">Últimos 30 días</span>
        {resumen.puntajePromedio === null ? (
          <p className="mt-1 text-[12px] text-humo">Todavía no hay días registrados.</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="cifra text-2xl text-dorado-400">{Math.round(resumen.puntajePromedio)}</p>
              <p className="text-[10px] uppercase tracking-wider text-humo">promedio</p>
            </div>
            <div>
              <p className="cifra text-2xl">{Math.round((resumen.pctAplicablePromedio ?? 0) * 100)}%</p>
              <p className="text-[10px] uppercase tracking-wider text-humo">del plan</p>
            </div>
            <div>
              <p className="cifra text-2xl">{resumen.diasRegistrados}</p>
              <p className="text-[10px] uppercase tracking-wider text-humo">días</p>
            </div>
          </div>
        )}
      </section>

      {/* Fases pendientes */}
      <section className="grid grid-cols-2 gap-2">
        <button type="button" disabled className="boton-dorado opacity-40">
          Registrar comida
        </button>
        <button type="button" disabled className="boton-dorado opacity-40">
          Entrenar
        </button>
      </section>
      <p className="text-center text-[11px] text-humo">Comer llega en la Fase 2 · Entrenar en la Fase 3</p>

      <Hoja abierta={verDesglose} titulo="De dónde salen los puntos" onCerrar={() => setVerDesglose(false)}>
        <ul className="divide-y divide-marino-800">
          {resultado.renglones.map((r) => (
            <li key={r.clave} className="flex items-start justify-between gap-3 py-2.5">
              <span>
                <span className={`text-sm ${r.cumplido ? 'text-pergamino' : 'text-humo'}`}>{r.etiqueta}</span>
                {r.detalle && <span className="block text-[11px] text-humo">{r.detalle}</span>}
                {!r.aplica && <span className="block text-[11px] text-humo">El plan no lo pide hoy</span>}
                <span className="block text-[10px] uppercase tracking-wider text-marino-600">{r.categoria}</span>
              </span>
              <span className={`cifra shrink-0 text-sm ${r.cumplido ? 'text-dorado-400' : 'text-humo'}`}>
                {r.cumplido ? r.puntos : 0} / {r.puntos}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-marino-800 pt-3 text-sm">
          <p className="flex justify-between">
            <span>Puntaje del día (fórmula del Excel)</span>
            <span className="cifra text-dorado-400">{resultado.puntaje ?? '—'} / 100</span>
          </p>
          <p className="flex justify-between text-humo">
            <span>Sobre lo que el plan pedía hoy</span>
            <span className="cifra">
              {resultado.puntajeAplicable ?? '—'} / {resultado.posiblesAplicables}
            </span>
          </p>
        </div>
      </Hoja>

      <Hoja abierta={verProcedencia} titulo="Cómo se calculan tus metas" onCerrar={() => setVerProcedencia(false)}>
        <ul className="divide-y divide-marino-800">
          {trazabilidadMetas(perfil).map((t) => (
            <li key={t.paso} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{t.paso}</span>
                <span className="cifra shrink-0 text-sm text-dorado-400">{t.valor}</span>
              </div>
              <p className="cifra mt-0.5 text-[11px] text-humo">{t.formula}</p>
            </li>
          ))}
        </ul>
      </Hoja>
    </div>
  )
}
