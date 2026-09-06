import { useMemo, useState } from 'react'
import { BarraMacro } from '../componentes/BarraMacro'
import { SelectorAlimento } from '../componentes/SelectorAlimento'
import {
  agregarItem, alternarFavorito, cambiarGramos, cargarMenu, quitarItem,
} from '../datos/comidas'
import { usarAlimentos, usarComidasDelDia, usarMenus, usarPerfil, usarRegistro } from '../datos/hooks'
import {
  ETIQUETA_COMIDA, TIPOS_COMIDA, comidaPorHora, macrosDeComida, macrosDelDia,
} from '../dominio/comidas'
import { fechaLarga, hoyISO, sumarDias, tipoDiaPorDefecto } from '../dominio/dias'
import { minutosDeAhora } from '../dominio/horario'
import { avisoDePesaje, macrosDeItem } from '../dominio/macros'
import { metaDelDia } from '../dominio/metas'
import type { Alimento, TipoComida } from '../dominio/tipos'

export function Comer() {
  const [fecha, setFecha] = useState(hoyISO())
  const [tipo, setTipo] = useState<TipoComida>(comidaPorHora(minutosDeAhora()))
  const [abrirSelector, setAbrirSelector] = useState(false)

  const perfil = usarPerfil()
  const alimentos = usarAlimentos()
  const comidas = usarComidasDelDia(fecha)
  const menus = usarMenus()
  const registro = usarRegistro(fecha)

  const mapa = useMemo(() => new Map<number, Alimento>(alimentos.map((a) => [a.id, a])), [alimentos])
  const comidaActual = comidas.find((c) => c.tipo === tipo)
  const items = comidaActual?.items ?? []
  const tipoDia = registro?.tipoDia ?? tipoDiaPorDefecto(fecha)
  const meta = metaDelDia(perfil, tipoDia)
  const totalDia = macrosDelDia(comidas, mapa)
  const totalComida = comidaActual ? macrosDeComida(comidaActual, mapa) : null
  const menusDisponibles = menus.filter((m) => m.tipo === tipo && m.tipoDia === tipoDia)

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-center justify-between gap-2">
        <button type="button" className="boton px-3" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</button>
        <div className="text-center">
          <h1 className="font-serif text-lg leading-tight">Comer</h1>
          <p className="text-[11px] text-humo">{fechaLarga(fecha)} · día {tipoDia}</p>
        </div>
        <button
          type="button" className="boton px-3 disabled:opacity-30"
          disabled={fecha === hoyISO()} onClick={() => setFecha(sumarDias(fecha, 1))}
        >›</button>
      </header>

      <p className="rounded border border-dorado-600/50 bg-dorado-600/10 px-3 py-2 text-center text-[12px] font-semibold text-dorado-400">
        Carne y pescado CRUDOS · arroz, pasta y avena SECOS
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {TIPOS_COMIDA.map((t) => {
          const c = comidas.find((x) => x.tipo === t)
          return (
            <button
              key={t} type="button" onClick={() => setTipo(t)}
              className={`min-h-[52px] rounded border text-[12px] font-semibold transition ${
                tipo === t ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
              }`}
            >
              {ETIQUETA_COMIDA[t]}
              {c && c.items.length > 0 && (
                <span className="cifra block text-[10px]">{Math.round(macrosDeComida(c, mapa).kcal)}</span>
              )}
            </button>
          )
        })}
      </div>

      {menusDisponibles.length > 0 && (
        <section className="tarjeta">
          <span className="rotulo">Menú modelo del Excel</span>
          <div className="mt-2 space-y-1.5">
            {menusDisponibles.map((m) => (
              <button
                key={m.id} type="button" className="boton w-full py-2 text-left"
                onClick={() => cargarMenu(fecha, tipo, m.id)}
              >
                Cargar {m.nombre} · {m.items.length} alimentos
                {m.nota && <span className="block text-[11px] font-normal text-humo">{m.nota}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-humo">Reemplaza lo que tengas en esta comida.</p>
        </section>
      )}

      <section className="tarjeta">
        <div className="flex items-baseline justify-between">
          <span className="rotulo">{ETIQUETA_COMIDA[tipo]}</span>
          {totalComida && items.length > 0 && (
            <span className="cifra text-[12px] text-humo">
              {Math.round(totalComida.kcal)} kcal · {Math.round(totalComida.proteinaG)} g P
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="mt-2 text-[12px] text-humo">Nada registrado todavía.</p>
        ) : (
          <ul className="mt-2 divide-y divide-marino-800">
            {items.map((item) => {
              const a = mapa.get(item.alimentoId)
              if (!a) return null
              const m = macrosDeItem(a, item.gramos)
              return (
                <li key={item.alimentoId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-sm">{a.nombre}</span>
                    <span className="cifra shrink-0 text-[11px] text-humo">
                      {Math.round(m.kcal)} kcal · {Math.round(m.proteinaG)} P
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      className="campo py-2 text-base"
                      type="number" inputMode="decimal" min={0} step={5} value={item.gramos}
                      onChange={(e) =>
                        cambiarGramos(fecha, tipo, item.alimentoId, Math.max(0, Number(e.target.value) || 0))
                      }
                    />
                    <span className="w-6 shrink-0 text-sm text-humo">g</span>
                    <button
                      type="button" className="boton px-3 text-humo"
                      onClick={() => quitarItem(fecha, tipo, item.alimentoId)}
                    >
                      Quitar
                    </button>
                  </div>
                  {avisoDePesaje(a) && (
                    <p className="mt-1 text-[11px] text-dorado-400">{avisoDePesaje(a)}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <button type="button" className="boton-dorado mt-3 w-full" onClick={() => setAbrirSelector(true)}>
          + Agregar alimento
        </button>
      </section>

      <section className="tarjeta space-y-3">
        <span className="rotulo">Total del día contra la meta</span>
        {tipoDia === 'AYUNO' ? (
          <p className="text-[12px] text-humo">
            Viernes de ayuno. La cena de ruptura va aquí igual: registra lo que comas, aunque el puntaje
            del día lo mida contra el techo de {perfil.techoKcalAyuno} kcal.
          </p>
        ) : null}
        <BarraMacro etiqueta="Proteína" valor={totalDia.proteinaG} meta={meta.proteinaG || 189} unidad="g" />
        <BarraMacro
          etiqueta="Calorías" valor={totalDia.kcal} meta={meta.kcal || 2750} unidad="kcal"
          tolerancia={perfil.toleranciaKcal}
        />
        <BarraMacro etiqueta="Carbohidratos" valor={totalDia.carbG} meta={meta.carbsG || 341} unidad="g" />
        <BarraMacro etiqueta="Grasa" valor={totalDia.grasaG} meta={meta.grasaG || 70} unidad="g" />
        <p className="text-[11px] text-humo">
          Estos totales alimentan el puntaje de HOY. Mientras haya comidas registradas, los campos manuales
          quedan bloqueados.
        </p>
      </section>

      <SelectorAlimento
        abierto={abrirSelector}
        alimentos={alimentos}
        onCerrar={() => setAbrirSelector(false)}
        onAgregar={(id, gramos) => agregarItem(fecha, tipo, { alimentoId: id, gramos })}
        onAlternarFavorito={alternarFavorito}
      />
    </div>
  )
}
