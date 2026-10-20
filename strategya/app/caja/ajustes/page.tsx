import type { Metadata } from "next";
import {
  eliminarCategoria,
  eliminarCuenta,
  eliminarRecurrente,
  guardarCategoria,
  guardarConfig,
  guardarCuenta,
  guardarRecurrente,
} from "@/app/caja/acciones";
import Link from "next/link";
import { CamposRecurrente } from "@/componentes/caja/CamposRecurrente";
import { BotonEliminar, FormAccion } from "@/componentes/caja/FormAccion";
import { Ayuda, Icono } from "@/componentes/caja/Iconos";
import { ImportarCaja } from "@/componentes/caja/ImportarCaja";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { fechaBreve } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import {
  type Categoria,
  type Cuenta,
  GRUPOS,
  NOMBRE_FRECUENCIA,
  NOMBRE_GRUPO,
  NOMBRE_TIPO,
  NOMBRE_TIPO_CUENTA,
  type Recurrente,
  TIPOS_CUENTA,
} from "@/lib/caja/tipos";
import { catalogos } from "@/lib/caja/vista";

export const metadata: Metadata = { title: "Ajustes · Caja · Strategya" };
export const dynamic = "force-dynamic";

const TITULO = "Ajustes de la caja";
const SUB = "Aquí cambias tus cuentas, tus pagos fijos, tus categorías y tu colchón.";

function CamposCuenta({ c }: { c?: Cuenta }) {
  return (
    <div className="caja-campos">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" placeholder="Ej.: Banco Popular" aria-describedby="ayuda-nombre-cuenta" />
        <span id="ayuda-nombre-cuenta" className="caja-campo-ayuda">
          Basta un nombre que reconozcas: nunca pongas números de cuenta ni de tarjeta.
        </span>
      </label>
      <label>
        Tipo
        <select name="tipo" defaultValue={c?.tipo ?? "banco"}>
          {TIPOS_CUENTA.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO_CUENTA[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Saldo el día de inicio (RD$; en tarjeta, lo que debías)
        <input name="saldoInicial" inputMode="decimal" defaultValue={c?.saldoInicial ?? ""} placeholder="Ej.: 25,000" autoComplete="off" />
      </label>
      <label>
        Límite de la tarjeta (RD$, opcional)
        <input name="limite" inputMode="decimal" defaultValue={c?.limite ?? ""} placeholder="Ej.: 80,000" autoComplete="off" />
      </label>
      <label>
        Posición en la lista
        <input name="orden" inputMode="numeric" defaultValue={c ? String(c.orden) : ""} placeholder="Ej.: 1" autoComplete="off" />
      </label>
    </div>
  );
}

function CamposCategoria({ c }: { c?: Categoria }) {
  return (
    <div className="caja-campos">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" placeholder="Ej.: Comida" />
      </label>
      <label>
        Grupo
        <select name="grupo" defaultValue={c?.grupo ?? "variable"}>
          {GRUPOS.map((g) => (
            <option key={g} value={g}>
              {NOMBRE_GRUPO[g]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Límite al mes (RD$, opcional)
        <input name="presupuesto" inputMode="decimal" defaultValue={c?.presupuesto ?? ""} autoComplete="off" placeholder="Ej.: 12,000" />
      </label>
    </div>
  );
}

function describirRecurrente(r: Recurrente): string {
  const cuando =
    r.frecuencia === "mensual"
      ? `${/[,\s]/.test(r.dias.trim()) ? "los días" : "el día"} ${r.dias}`
      : r.frecuencia === "cada_n"
        ? `cada ${r.cadaN ?? 1} días`
        : r.fecha
          ? `el ${fechaBreve(r.fecha)} de ${r.fecha.slice(0, 4)}`
          : "sin fecha";
  const rango = [r.desde ? `desde ${r.desde}` : null, r.hasta ? `hasta ${r.hasta}` : null].filter(Boolean).join(" ");
  const base = r.frecuencia === "mensual" ? `Cada mes, ${cuando}` : `${NOMBRE_FRECUENCIA[r.frecuencia]}: ${cuando}`;
  return `${base}${rango ? ` · ${rango}` : ""}`;
}

export default async function PaginaAjustes() {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="ajustes" editadoEn={null} titulo={TITULO} sub={SUB}>
        <PanelError titulo="Ajustes de caja" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  const cfg = datos.config;
  const { cuentas, categorias } = catalogos(datos);
  const hayDatos = !!datos.config || datos.cuentas.length > 0 || datos.movimientos.length > 0;
  const nombreCuenta = (id: string | null) => (id ? (datos.cuentas.find((c) => c.id === id)?.nombre ?? `«${id}»`) : "—");

  return (
    <MarcoCaja actual="ajustes" editadoEn={editadoEn} titulo={TITULO} sub={SUB}>
      {!cfg ? (
        <section className="panel panel-ancho caja-aviso-panel">
          <div>
            <h2 className="panel-titulo">¿Primera vez?</h2>
            <p className="chico tenue">El asistente te pide lo necesario en 4 pasos cortos y deja el calendario listo.</p>
          </div>
          <Link href="/caja" className="boton caja-boton-grande">
            Usar el asistente
            <Icono n="derecha" tam={18} />
          </Link>
        </section>
      ) : null}
      <section className="panel" aria-labelledby="t-general">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-general">
            General
          </h2>
          <span className="chico tenue">Tu mínimo y desde cuándo cuenta el calendario</span>
        </div>
        <div className="panel-cuerpo">
          <FormAccion accion={guardarConfig} boton="Guardar" etiqueta="Ajustes generales">
            <div className="caja-campos">
              <label>
                Día en que empieza tu calendario
                <input type="date" name="inicio" required defaultValue={cfg?.inicio ?? ""} />
              </label>
              <label>
                <span>
                  Colchón mínimo (RD$){" "}
                  <Ayuda que="el colchón">El dinero de reserva que no quieres tocar. Los días en que quedarías por debajo se pintan de rojo.</Ayuda>
                </span>
                <input name="colchon" inputMode="decimal" required defaultValue={cfg?.colchon ?? ""} autoComplete="off" placeholder="Ej.: 10,000" />
              </label>
              <label>
                <span>
                  Aviso antes del colchón (RD$){" "}
                  <Ayuda que="el aviso antes del colchón">
                    Un margen extra: si quedas a menos de esta cifra por encima del colchón, el día se marca en ámbar («cerca del mínimo»).
                  </Ayuda>
                </span>
                <input name="margen" inputMode="decimal" required defaultValue={cfg?.margen ?? "3000"} autoComplete="off" placeholder="Ej.: 3,000" />
              </label>
              <label>
                <span>
                  Tasa del dólar (RD$ por US$, opcional){" "}
                  <Ayuda que="la tasa del dólar">
                    La que tú uses para pasar a pesos los montos en dólares que no traen su propia tasa. Sin tasa, esos montos no se suman.
                  </Ayuda>
                </span>
                <input name="tasaUSD" inputMode="decimal" defaultValue={cfg?.tasaUSD ?? ""} placeholder="Ej.: 60.25" autoComplete="off" />
              </label>
            </div>
          </FormAccion>
        </div>
      </section>

      <section className="panel" aria-labelledby="t-cuentas">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-cuentas">
            Tus cuentas ({datos.cuentas.length})
          </h2>
          <span className="chico tenue">Banco, efectivo, ahorro y tarjetas</span>
        </div>
        <div className="panel-cuerpo">
          <ul className="caja-lista">
            {[...datos.cuentas]
              .sort((a, b) => a.orden - b.orden)
              .map((c) => (
                <li key={c.id} className="caja-item">
                  <div className="caja-item-fila">
                    <span className="caja-item-nombre">{c.nombre}</span>
                    <span className="caja-item-monto">{rd(c.saldoInicial)}</span>
                  </div>
                  <span className="caja-item-detalle" title={`Identificador interno: ${c.id}`}>
                    {NOMBRE_TIPO_CUENTA[c.tipo]}
                    {c.limite ? ` · límite ${rd(c.limite)}` : ""} · {c.tipo === "tarjeta" ? "deuda" : "saldo"} el día de inicio
                  </span>
                  <details className="caja-desplegable">
                    <summary>Editar</summary>
                    <FormAccion accion={guardarCuenta} boton="Guardar cuenta" etiqueta={`Editar ${c.nombre}`}>
                      <CamposCuenta c={c} />
                    </FormAccion>
                  </details>
                  <div className="caja-acciones">
                    <BotonEliminar accion={eliminarCuenta} id={c.id} que={`la cuenta ${c.nombre}`} />
                  </div>
                </li>
              ))}
          </ul>
          <details className="caja-desplegable" style={{ marginTop: 8 }} open={datos.cuentas.length === 0}>
            <summary>Agregar una cuenta</summary>
            <FormAccion accion={guardarCuenta} boton="Crear cuenta" reiniciar etiqueta="Nueva cuenta">
              <CamposCuenta />
            </FormAccion>
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-recurrentes">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-recurrentes">
            Pagos y cobros fijos ({datos.recurrentes.length})
          </h2>
          <span className="chico tenue">Lo que se repite cada mes: sueldo, alquiler, luz… El calendario los pone solo.</span>
        </div>
        <div className="panel-cuerpo">
          <ul className="caja-lista">
            {datos.recurrentes.map((r) => (
              <li key={r.id} className={`caja-item ${r.activo ? "" : "omitido"}`}>
                <div className="caja-item-fila">
                  <span className="caja-item-nombre">
                    {r.nombre}
                    {r.activo ? "" : " (en pausa)"}
                  </span>
                  <span className={`caja-item-monto ${r.tipo === "ingreso" ? "sube" : ""}`}>
                    {r.pagoTotal ? "todo lo que debas" : enMoneda(r.monto, r.moneda)}
                  </span>
                </div>
                <span className="caja-item-detalle">
                  {NOMBRE_TIPO[r.tipo]} · {nombreCuenta(r.cuenta)}
                  {r.destino ? ` → ${nombreCuenta(r.destino)}` : ""} · {describirRecurrente(r)}
                </span>
                <details className="caja-desplegable">
                  <summary>Editar</summary>
                  <FormAccion accion={guardarRecurrente} boton="Guardar recurrente" etiqueta={`Editar ${r.nombre}`}>
                    <input type="hidden" name="id" value={r.id} />
                    <CamposRecurrente r={r} cuentas={cuentas} categorias={categorias} />
                  </FormAccion>
                </details>
                <div className="caja-acciones">
                  <BotonEliminar accion={eliminarRecurrente} id={r.id} que={`el recurrente ${r.nombre}`} />
                </div>
              </li>
            ))}
          </ul>
          <details className="caja-desplegable" style={{ marginTop: 8 }}>
            <summary>Agregar un pago o cobro fijo</summary>
            {cuentas.length ? (
              <FormAccion accion={guardarRecurrente} boton="Crear recurrente" reiniciar etiqueta="Nuevo recurrente">
                <CamposRecurrente cuentas={cuentas} categorias={categorias} />
              </FormAccion>
            ) : (
              <p className="caja-form chico">Primero agrega una cuenta.</p>
            )}
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-categorias">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-categorias">
            Categorías ({datos.categorias.length})
          </h2>
          <span className="chico tenue">Para agrupar tus gastos y ponerles un límite al mes</span>
        </div>
        <div className="panel-cuerpo">
          {GRUPOS.filter((g) => datos.categorias.some((c) => c.grupo === g)).map((g) => (
            <div key={g}>
              <h3 className="caja-subtitulo">
                {NOMBRE_GRUPO[g]}
              </h3>
              <ul className="caja-lista">
                {datos.categorias
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <li key={c.id} className="caja-item">
                      <div className="caja-item-fila">
                        <span className="caja-item-nombre">{c.nombre}</span>
                        <span className="caja-item-monto">{c.presupuesto ? `${rd(c.presupuesto)} al mes` : <span className="tenue">sin límite</span>}</span>
                      </div>
                      <details className="caja-desplegable">
                        <summary>Editar</summary>
                        <FormAccion accion={guardarCategoria} boton="Guardar categoría" etiqueta={`Editar ${c.nombre}`}>
                          <CamposCategoria c={c} />
                        </FormAccion>
                      </details>
                      <div className="caja-acciones">
                        <BotonEliminar accion={eliminarCategoria} id={c.id} que={`la categoría ${c.nombre}`} />
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <details className="caja-desplegable" style={{ marginTop: 8 }}>
            <summary>Agregar una categoría</summary>
            <FormAccion accion={guardarCategoria} boton="Crear categoría" reiniciar etiqueta="Nueva categoría">
              <CamposCategoria />
            </FormAccion>
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="importar" id="avanzado">
        <details className="caja-avanzado">
          <summary>
            <h2 className="panel-titulo" id="importar">
              Avanzado: importar desde el artefacto anterior
            </h2>
            <span className="chico tenue">Solo si usabas el artefacto «Calendario de Caja» y tienes su archivo JSON</span>
          </summary>
          <div className="panel-cuerpo">
            <p className="chico">
              Primero se revisa el archivo y se muestra un resumen; nada se guarda hasta que confirmes. Al confirmar se reemplaza todo lo de
              la caja de una sola vez: si algo falla, no cambia nada.
            </p>
            {hayDatos ? (
              <p className="caja-aviso">
                Ya tienes datos ({datos.cuentas.length} cuentas, {datos.movimientos.length} movimientos). Importar los reemplaza todos.
              </p>
            ) : null}
            <ImportarCaja hayDatos={hayDatos} />
          </div>
        </details>
      </section>
    </MarcoCaja>
  );
}
