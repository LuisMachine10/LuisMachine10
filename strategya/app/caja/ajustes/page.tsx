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
import { CamposRecurrente } from "@/componentes/caja/CamposRecurrente";
import { BotonEliminar, FormAccion } from "@/componentes/caja/FormAccion";
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

function CamposCuenta({ c }: { c?: Cuenta }) {
  return (
    <div className="caja-campos">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" />
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
        Saldo inicial (en tarjeta, la deuda)
        <input name="saldoInicial" inputMode="decimal" defaultValue={c?.saldoInicial ?? ""} placeholder="0.00" autoComplete="off" />
      </label>
      <label>
        Límite (tarjeta)
        <input name="limite" inputMode="decimal" defaultValue={c?.limite ?? ""} autoComplete="off" />
      </label>
      <label>
        Orden
        <input name="orden" inputMode="numeric" defaultValue={c ? String(c.orden) : ""} placeholder="0" autoComplete="off" />
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
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" />
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
        Presupuesto mensual (RD$)
        <input name="presupuesto" inputMode="decimal" defaultValue={c?.presupuesto ?? ""} autoComplete="off" />
      </label>
    </div>
  );
}

function describirRecurrente(r: Recurrente): string {
  const cuando =
    r.frecuencia === "mensual"
      ? `días ${r.dias}`
      : r.frecuencia === "cada_n"
        ? `cada ${r.cadaN ?? 1} días`
        : r.fecha
          ? `el ${fechaBreve(r.fecha)} de ${r.fecha.slice(0, 4)}`
          : "sin fecha";
  const rango = [r.desde ? `desde ${r.desde}` : null, r.hasta ? `hasta ${r.hasta}` : null].filter(Boolean).join(" ");
  return `${NOMBRE_FRECUENCIA[r.frecuencia]}: ${cuando}${rango ? ` · ${rango}` : ""}`;
}

export default async function PaginaAjustes() {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="ajustes" editadoEn={null}>
        <PanelError titulo="Ajustes de caja" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  const cfg = datos.config;
  const { cuentas, categorias } = catalogos(datos);
  const nombreCuenta = (id: string | null) => (id ? (datos.cuentas.find((c) => c.id === id)?.nombre ?? `«${id}»`) : "—");

  return (
    <MarcoCaja actual="ajustes" editadoEn={editadoEn}>
      <section className="panel" aria-labelledby="t-general">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-general">
            General
          </h2>
        </div>
        <div className="panel-cuerpo">
          <FormAccion accion={guardarConfig} boton="Guardar" etiqueta="Ajustes generales">
            <div className="caja-campos">
              <label>
                Fecha de inicio
                <input type="date" name="inicio" required defaultValue={cfg?.inicio ?? ""} />
              </label>
              <label>
                Colchón (RD$)
                <input name="colchon" inputMode="decimal" required defaultValue={cfg?.colchon ?? ""} autoComplete="off" />
              </label>
              <label>
                Margen sobre el colchón (RD$)
                <input name="margen" inputMode="decimal" required defaultValue={cfg?.margen ?? "3000"} autoComplete="off" />
              </label>
              <label>
                Tasa general RD$ por US$
                <input name="tasaUSD" inputMode="decimal" defaultValue={cfg?.tasaUSD ?? ""} placeholder="sin tasa" autoComplete="off" />
              </label>
            </div>
            <p className="chico tenue" style={{ margin: 0 }}>
              La simulación arranca en la fecha de inicio con los saldos iniciales. Bajo el colchón = rojo; entre el colchón y
              colchón + margen = cerca. La tasa US$ es la tuya: se usa para los montos en US$ sin tasa propia (sin tasa, no se
              aplican).
            </p>
          </FormAccion>
        </div>
      </section>

      <section className="panel" aria-labelledby="t-cuentas">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-cuentas">
            Cuentas ({datos.cuentas.length})
          </h2>
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
                  <span className="caja-item-detalle">
                    {NOMBRE_TIPO_CUENTA[c.tipo]}
                    {c.limite ? ` · límite ${rd(c.limite)}` : ""} · id {c.id}
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
            <summary>Nueva cuenta</summary>
            <FormAccion accion={guardarCuenta} boton="Crear cuenta" reiniciar etiqueta="Nueva cuenta">
              <CamposCuenta />
            </FormAccion>
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-recurrentes">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-recurrentes">
            Recurrentes ({datos.recurrentes.length})
          </h2>
        </div>
        <div className="panel-cuerpo">
          <ul className="caja-lista">
            {datos.recurrentes.map((r) => (
              <li key={r.id} className={`caja-item ${r.activo ? "" : "omitido"}`}>
                <div className="caja-item-fila">
                  <span className="caja-item-nombre">
                    {r.nombre}
                    {r.activo ? "" : " (inactivo)"}
                  </span>
                  <span className={`caja-item-monto ${r.tipo === "ingreso" ? "sube" : ""}`}>
                    {r.pagoTotal ? "pago total" : enMoneda(r.monto, r.moneda)}
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
            <summary>Nuevo recurrente</summary>
            {cuentas.length ? (
              <FormAccion accion={guardarRecurrente} boton="Crear recurrente" reiniciar etiqueta="Nuevo recurrente">
                <CamposRecurrente cuentas={cuentas} categorias={categorias} />
              </FormAccion>
            ) : (
              <p className="caja-form chico">Primero crea una cuenta.</p>
            )}
          </details>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="t-categorias">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-categorias">
            Categorías ({datos.categorias.length})
          </h2>
        </div>
        <div className="panel-cuerpo">
          {GRUPOS.filter((g) => datos.categorias.some((c) => c.grupo === g)).map((g) => (
            <div key={g}>
              <h3 className="caja-tile-titulo" style={{ margin: "10px 0 6px" }}>
                {NOMBRE_GRUPO[g]}
              </h3>
              <ul className="caja-lista">
                {datos.categorias
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <li key={c.id} className="caja-item">
                      <div className="caja-item-fila">
                        <span className="caja-item-nombre">{c.nombre}</span>
                        <span className="caja-item-monto">{c.presupuesto ? `${rd(c.presupuesto)}/mes` : <span className="tenue">sin presupuesto</span>}</span>
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
            <summary>Nueva categoría</summary>
            <FormAccion accion={guardarCategoria} boton="Crear categoría" reiniciar etiqueta="Nueva categoría">
              <CamposCategoria />
            </FormAccion>
          </details>
        </div>
      </section>
    </MarcoCaja>
  );
}
