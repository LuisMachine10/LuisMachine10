// Proyecciones (Núcleo v2): cómo crece tu dinero con los aportes EXACTOS de «Lo que planeaste ahorrar este mes» y con
// las reglas de cada tipo de instrumento (lib/finanzas/catalogo.ts). La Política de inversión solo compara: no reparte.
// Cada instrumento muestra cómo rinde según su tipo, lo que eligió Mena (lo elegible) y, en un mutuo, sus renovaciones.
// Son cálculos con tus datos, no pronósticos.

import Link from "next/link";
import { guardarPlan, registrarRenovacion } from "@/app/capital/acciones";
import { CERO, n } from "@/lib/capital/decimal";
import { sumarMeses } from "@/lib/capital/fechas";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, rd } from "@/lib/capital/formato";
import { cuantoDejaAlMes, horizonteMeses, proyectarPortafolio, type Reglas, tipoDe } from "@/lib/capital/proyeccion";
import { FRECUENCIAS_PAGO, nombreClase } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { aparece, CATALOGO, retencionDe } from "@/lib/finanzas/catalogo";
import { estadoMutuo } from "@/lib/finanzas/mutuo";
import { GraficoSerie } from "./GraficoSerie";
import { Kpi, Mosaicos, Panel, SinDatos } from "./Piezas";

type Props = { datos: DatosCapital; mes: string; anios?: string | null };

const HORIZONTES = ["1", "3", "5", "10", "20"];

/** Lo que la proyección supone de un instrumento, en palabras (solo lo que no escribió Mena o lo que falta). */
function avisoReglas(r: Reglas): string | null {
  if (r.sinElegir) return "elige si capitaliza o te paga a una cuenta: mientras tanto su interés no se proyecta";
  if (r.origenReinversion === "ultima_renovacion") return "al renovar hace lo de tu última renovación";
  if (r.origenReinversion === "no_capitaliza_solo") return "no capitaliza solo: el interés se cobra (anota tus renovaciones si lo dejas adentro)";
  if (r.supuesto) return "sin frecuencia de pago escrita: se cuenta cada mes";
  if (r.comisionNoConfirmada) return "comisión de administración no confirmada: no se descuenta";
  return null;
}

export function PanelProyeccion({ datos, mes, anios, compacto = false }: Props & { compacto?: boolean }) {
  const { ctx } = datos;
  const meses = horizonteMeses(ctx, anios);
  const pr = proyectarPortafolio(ctx, meses, datos.aportes);
  const ahorro = pr.ahorroMensual;
  const hoy = pr.puntos[0];
  const fin = pr.puntos[meses];
  const anos = meses / 12;
  if (!ctx.activos.length) {
    return (
      <Panel titulo="Cómo crecería tu dinero" id="cap-t-proy" ancho>
        <SinDatos centro icono="calendario" accion={{ href: "/capital/cuentas", texto: "Agregar mis cuentas e inversiones" }}>
          Aquí verás tu dinero crecer mes a mes con lo que ahorras y el interés compuesto. Primero anota tus cuentas e inversiones.
        </SinDatos>
      </Panel>
    );
  }
  const puntos = pr.puntos.filter((p) => p.mes % (meses > 60 ? 3 : 1) === 0 || p.mes === meses);
  const fecha = (m: number) => sumarMeses(ctx.hoy, m);
  const avisos = pr.porInstrumento.map((x) => ({ x, aviso: avisoReglas(x.reglas) })).filter((a) => a.aviso);
  return (
    <>
      {compacto ? null : (
        <Mosaicos etiqueta="Proyección del portafolio" columnas={4}>
          <Kpi rotulo="Hoy" valor={num(hoy.total)} unidad="RD$" meta="lo que tienes invertido" tono="neutra" />
          <Kpi rotulo={`En ${num(anos, 0)} ${anos === 1 ? "año" : "años"}`} valor={num(fin.total)} unidad="RD$" meta="proyección con tus datos" tono="neutra" />
          <Kpi rotulo="Lo que aportarías" valor={num(fin.aportado.minus(hoy.aportado))} unidad="RD$" meta={ahorro ? `${rd(ahorro)} al mes según tu plan` : "sin líneas de ahorro en tu plan"} tono="neutra" />
          <Kpi rotulo="Lo que ganarían tus intereses" valor={num(fin.interes)} unidad="RD$" meta={fin.total.gt(0) ? `${pct(fin.interes.div(fin.total), 0)} del total` : "—"} tono="neutra" />
        </Mosaicos>
      )}
      <Panel
        titulo="Cómo crecería tu dinero"
        id="cap-t-proy"
        ancho
        extra={
          <nav className="cap-horizontes" aria-label="Años de la proyección">
            {HORIZONTES.map((h) => (
              <Link key={h} href={`/capital/futuro?mes=${mes}&anios=${h}`} aria-current={Number(h) * 12 === meses ? "true" : undefined}>
                {h} {h === "1" ? "año" : "años"}
              </Link>
            ))}
          </nav>
        }
      >
        <p className="cap-nota" style={{ marginTop: 0 }}>
          {ahorro ? (
            <>
              Cada mes entran <strong>{rd(ahorro)}</strong>: tus líneas del <Link href="/caja/plan">Plan del mes</Link>, cada una a su instrumento.
            </>
          ) : (
            <>
              Sin líneas de ahorro: solo crece lo que ya tienes. <Link href="/caja/plan#t-plan-lineas">Escribir mi plan</Link>.
            </>
          )}
        </p>
        <ul className="leyenda">
          <li>
            <span className="clave-linea" style={{ background: "var(--serie-1)", height: 3, borderRadius: 2 }} />
            Total (lo que aportaste + intereses)
          </li>
          <li>
            <span className="clave-linea" style={{ background: "var(--serie-2)", height: 3, borderRadius: 2 }} />
            Lo que aportaste
          </li>
        </ul>
        <GraficoSerie
          series={[
            { nombre: "Total", color: "var(--serie-1)", area: true, puntos: puntos.map((p) => ({ t: fecha(p.mes), v: p.total.toFixed(2) })) },
            { nombre: "Lo que aportaste", color: "var(--serie-2)", area: true, puntos: puntos.map((p) => ({ t: fecha(p.mes), v: p.aportado.toFixed(2) })) },
          ]}
          etiqueta={`Proyección a ${num(anos, 0)} años: total y lo que aportaste. La tabla por categoría tiene las cifras.`}
          alto={compacto ? 200 : 280}
        />
        <div className="desplazable">
          <table className="tabla" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col" className="num">
                  Hoy
                </th>
                <th scope="col" className="num">
                  En {num(anos, 0)} {anos === 1 ? "año" : "años"}
                </th>
                <th scope="col" className="num">
                  Tus intereses
                </th>
              </tr>
            </thead>
            <tbody>
              {pr.porClase
                .filter((c) => c.hoy.gt(0) || c.final.gt(0))
                .map((c) => (
                  <tr key={c.clase}>
                    <th scope="row">
                      <span className={`cap-muestra ${c.clase}`} aria-hidden="true" /> {nombreClase(c.clase)}
                    </th>
                    <td className="num">{num(c.hoy)}</td>
                    <td className="num">{num(c.final)}</td>
                    <td className="num">{num(c.interes)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="cap-pie-proy">
          <span className="sello">Tus tasas ÷ 12 cada mes, según el tipo de cada instrumento, en pesos de hoy. No es un pronóstico.</span>
          {avisos.length && !compacto ? (
            <ul className="chico tenue" style={{ margin: 0, paddingLeft: 18 }}>
              {avisos.map(({ x, aviso }) => (
                <li key={x.activo.id}>
                  {x.activo.nombre}: {aviso}.
                </li>
              ))}
            </ul>
          ) : null}
          {pr.aportesSinDestino.length ? <span className="sello">{pr.aportesSinDestino.length} línea(s) del plan van a algo que no tiene valor en RD$ hoy (sin tipo de cambio): no se proyectan.</span> : null}
        </div>
      </Panel>
    </>
  );
}

export { PanelPlanAhorro } from "./Aportes";

/** Cómo rinde cada instrumento según su tipo y lo que Mena eligió (lo elegible), más las renovaciones de un mutuo. */
export function PanelPlan({ datos, mes }: Props) {
  const { ctx } = datos;
  const cuentas = (datos.caja.datos?.cuentas ?? []).filter((c) => c.tipoFin && aparece({ tipo: c.tipoFin, debito: c.debito }, "ingreso", "cuenta"));
  return (
    <Panel titulo="Cómo rinde cada instrumento" id="cap-t-plan" ancho>
      <details className="cap-mas">
        <summary>¿Qué es capitalizar?</summary>
        <p className="cap-nota">
          <strong>Capitaliza</strong> cuando el interés se queda dentro del instrumento y al mes siguiente gana interés también (interés compuesto). Si <strong>no capitaliza</strong>,
          te paga los intereses a una cuenta. Un mutuo no capitaliza solo: si al renovarlo dejas el interés adentro, tú mismo haces el interés compuesto.
        </p>
      </details>
      <ul className="cap-instrumentos plan-lista">
        {ctx.activos.map((a) => {
          const tipo = tipoDe(a);
          const regla = CATALOGO[tipo];
          const pl = a.plan;
          const cap = pl?.capitaliza === true ? "si" : pl?.capitaliza === false ? "no" : "";
          const aporte = datos.aportes.get(a.id);
          // Lo que no rinde (efectivo, cuenta corriente, cuenta de ahorro con tasa 0) y no recibe ahorro no tiene nada que mostrar aquí.
          if ((regla.capitaliza === "no_rinde" || tipo === "ahorro") && !aporte) return null;
          const deja = cuantoDejaAlMes(a);
          const mutuo = tipo === "mutuo" ? estadoMutuo(a.cantidad, a.renovaciones ?? []) : null;
          return (
            <li key={a.id}>
              <details className="cap-instrumento" key={JSON.stringify(pl) + (a.renovaciones?.length ?? 0)}>
                <summary>
                  <span className="nombre">
                    {a.nombre}
                    <span className="detalle">
                      {regla.nom} · {regla.rinde}
                      {n(a.tasa).gt(0) && tipo !== "ahorro" ? ` · ${pct(a.tasa, 2)} al año` : ""}
                      {regla.capitaliza === "elegible" ? (pl?.capitaliza === true ? " · capitaliza" : pl?.capitaliza === false ? " · te paga a una cuenta" : " · elige cómo paga") : ""}
                    </span>
                    {deja ? <span className="detalle">Te deja {rd(deja)} al mes</span> : null}
                  </span>
                  {aporte ? (
                    <span className="monto">
                      {aporte.moneda === "DOP" ? rd(aporte.monto) : `${aporte.moneda} ${num(aporte.monto, 2)}`}
                      <span className="detalle">al mes (plan)</span>
                    </span>
                  ) : null}
                </summary>
                <div className="cuerpo">
                  <form action={guardarPlan} className="cap-form plan-form">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="mes" value={mes} />
                    <div className="reg-campos">
                      {regla.capitaliza !== "no_rinde" && tipo !== "ahorro" ? (
                        <label className="cap-campo">
                          Tasa al año %
                          <input name="tasa" inputMode="decimal" defaultValue={n(a.tasa).gt(0) ? aPct(a.tasa) : ""} placeholder="Ej.: 9.5" />
                        </label>
                      ) : null}
                      {regla.capitaliza === "elegible" ? (
                        <label className="cap-campo">
                          ¿Capitaliza o te paga a una cuenta?
                          <select name="capitaliza" defaultValue={cap}>
                            <option value="">Todavía no lo sé</option>
                            <option value="si">Capitaliza: el interés se queda adentro</option>
                            <option value="no">Me paga los intereses a una cuenta</option>
                          </select>
                        </label>
                      ) : (
                        <input type="hidden" name="capitaliza" value={regla.capitaliza === "si" || regla.capitaliza === "implicito" ? "si" : regla.capitaliza === "no_rinde" ? "" : "no"} />
                      )}
                      {regla.capitaliza === "elegible" || regla.capitaliza === "no" ? (
                        <label className={`cap-campo${regla.capitaliza === "elegible" ? " p-nocap" : ""}`}>
                          ¿Cada cuánto te paga?
                          <select name="frecuenciaPago" defaultValue={pl?.frecuenciaPago ?? "mensual"}>
                            {FRECUENCIAS_PAGO.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.nom}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {tipo === "mutuo" ? (
                        <label className="cap-campo">
                          Al renovar, ¿dejas el interés adentro?
                          <select name="reinvierte" defaultValue={pl?.reinvierte === true ? "si" : pl?.reinvierte === false ? "no" : ""}>
                            <option value="">Como en mi última renovación</option>
                            <option value="si">Sí, lo dejo (interés compuesto)</option>
                            <option value="no">No, lo retiro a una cuenta</option>
                          </select>
                        </label>
                      ) : null}
                      {tipo !== "mutuo" && regla.grupo === "inversion" ? (
                        <label className="cap-campo">
                          Vence el <span className="ayuda">(opcional)</span>
                          <input type="date" name="venc" defaultValue={a.venc ?? ""} />
                        </label>
                      ) : null}
                    </div>
                    <p className="tenue chico" style={{ margin: 0 }}>
                      {regla.grupo === "inversion" ? `Retención del interés: ${pct(retencionDe(tipo, a.retencion ?? null), 0)}${a.retencion ? " (la tuya)" : " (la del tipo)"}. ` : ""}
                      {regla.comisionPuesto ? (a.comisionAdmin ? `Comisión de administración: ${pct(a.comisionAdmin, 2)} al año. ` : "Comisión de administración: no confirmada (escríbela en Mis cuentas si la sabes). ") : ""}
                      Se cambian en Mis cuentas.
                    </p>
                    <div className="cap-botones">
                      <button type="submit" className="boton">
                        Guardar
                      </button>
                    </div>
                  </form>
                  {mutuo ? <Renovacion datos={datos} mes={mes} id={a.id} moneda={a.moneda} tasa={a.tasa} plazo={a.plazoDias ?? 30} mutuo={mutuo} cuentas={cuentas} /> : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Renovacion({
  datos,
  mes,
  id,
  moneda,
  tasa,
  plazo,
  mutuo,
  cuentas,
}: {
  datos: DatosCapital;
  mes: string;
  id: string;
  moneda: string;
  tasa: string;
  plazo: number;
  mutuo: ReturnType<typeof estadoMutuo>;
  cuentas: NonNullable<DatosCapital["caja"]["datos"]>["cuentas"];
}) {
  const mias = cuentas.filter((c) => (c.moneda ?? "DOP") === moneda);
  const sim = moneda === "DOP" ? "RD$" : moneda === "USD" ? "US$" : "€";
  return (
    <div className="plan-renovar">
      <h4 className="cap-rotulo" style={{ marginTop: 14 }}>
        Renovaciones
      </h4>
      <p className="chico" style={{ margin: "0 0 8px" }}>
        {mutuo.renovaciones
          ? `${mutuo.renovaciones} renovación(es) anotada(s): interés dejado ${sim} ${num(mutuo.interesDejado, 2)}, retirado ${sim} ${num(mutuo.interesRetirado, 2)}, aportes ${sim} ${num(mutuo.aportes, 2)}${mutuo.vence ? ` · el plazo vigente vence el ${mutuo.vence}` : ""}.`
          : "Todavía no anotas renovaciones. Cuando venza el plazo, anota aquí lo que hiciste."}
      </p>
      <details className="ap-confirmar">
        <summary className="boton chico">Anotar una renovación</summary>
        <form action={registrarRenovacion} className="cap-form">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="mes" value={mes} />
          <div className="reg-campos">
            <label className="cap-campo">
              Fecha en que renovaste
              <input type="date" name="fecha" defaultValue={datos.ctx.hoy} required />
            </label>
            <label className="cap-campo">
              Interés que ganó el plazo que venció ({sim})
              <input name="interes" inputMode="decimal" required placeholder="El que dice tu estado del puesto de bolsa" autoComplete="off" />
            </label>
            <label className="cap-campo">
              ¿Qué hiciste con el interés?
              <select name="deja" defaultValue={mutuo.dejaInteres === false ? "no" : "si"}>
                <option value="si">Lo dejé adentro (se suma al capital)</option>
                <option value="no">Lo retiré a una cuenta</option>
              </select>
            </label>
            <label className="cap-campo">
              Cuenta donde cayó el interés <span className="ayuda">(si lo retiraste)</span>
              <select name="cuentaInteres" defaultValue="">
                <option value="">—</option>
                {mias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="cap-campo">
              Aporte adicional ({sim}) <span className="ayuda">(opcional)</span>
              <input name="aporte" inputMode="decimal" placeholder="Ej.: 5,000" autoComplete="off" />
            </label>
            <label className="cap-campo">
              ¿De qué cuenta salió el aporte?
              <select name="cuentaAporte" defaultValue="">
                <option value="">—</option>
                {mias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="cap-campo">
              Tasa nueva % al año
              <input name="tasa" inputMode="decimal" required defaultValue={n(tasa).gt(0) ? aPct(tasa) : ""} placeholder="Ej.: 8.75" autoComplete="off" />
            </label>
            <label className="cap-campo">
              Días del nuevo plazo
              <input name="plazoDias" inputMode="numeric" required defaultValue={String(plazo)} autoComplete="off" />
            </label>
          </div>
          <p className="tenue chico" style={{ margin: 0 }}>
            Capital nuevo = el de ahora ({sim} {num(mutuo.capital, 2)}) + el interés si lo dejas + el aporte. El interés retirado entra a tu Presupuesto como «Otros ingresos».
          </p>
          <div className="cap-botones">
            <button type="submit" className="boton">
              Guardar la renovación
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
