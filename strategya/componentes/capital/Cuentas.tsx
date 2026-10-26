// «Mis cuentas, activos y deudas»: el registro único. Se anota UNA vez aquí y el Presupuesto lo usa.
// Balance personal (lo que tienes − lo que debes = patrimonio), «Unir cuentas repetidas» (una sola vez,
// con confirmación de Mena) y el alta/edición de cada fila. Funciona sin JavaScript (formularios y :has).

import Link from "next/link";
import { decidirUnion, eliminarRegistro, guardarRegistro, unirCuentas } from "@/app/capital/acciones";
import { n } from "@/lib/capital/decimal";
import { diaDelSaldo, TIPOS_ALTA, tipoAltaDe } from "@/lib/capital/formulario-registro";
import { cuantoDejaAlMes } from "@/lib/capital/proyeccion";
import { CATALOGO, GRUPOS_ALTA, puedeRecibirCobros, retencionDe } from "@/lib/finanzas/catalogo";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, rd } from "@/lib/capital/formato";
import type { PrefRegistro } from "@/lib/capital/preferencias";
import { aActivo, balance, clavePar, esDeuda, esDobleMoneda, type ItemRegistro, type ParUnion, sugerirUniones, usoTarjeta, valorRegistro } from "@/lib/capital/registro";
import { cicloDe, cicloVigente, lineaCiclo, notaCiclo } from "@/lib/caja/ciclo";
import type { Contexto } from "@/lib/capital/posicion";
import { MONEDAS } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { BotonEnviar } from "./BotonEnviar";
import { Icono } from "./Iconos";
import { Panel } from "./Piezas";
import { SelloFx } from "./Sellos";

type Props = { datos: DatosCapital; mes: string; pref: PrefRegistro; revisar: boolean };

const GRUPOS_TIENES = [
  { id: "efectivo", nom: "Efectivo", de: (i: ItemRegistro) => i.tipo === "efectivo" },
  { id: "cuentas", nom: "Cuentas de banco", de: (i: ItemRegistro) => CATALOGO[i.tipo].grupo === "cuenta" && i.tipo !== "efectivo" },
  { id: "inversiones", nom: "Inversiones", de: (i: ItemRegistro) => CATALOGO[i.tipo].grupo === "inversion" },
  { id: "otros", nom: "Bienes", de: (i: ItemRegistro) => i.tipo === "bien" },
];
const GRUPOS_DEBES = [
  { id: "tarjetas", nom: "Tarjetas de crédito", de: (i: ItemRegistro) => i.tipo === "tarjeta" },
  { id: "prestamos", nom: "Préstamos y otras deudas", de: (i: ItemRegistro) => i.tipo === "prestamo" || i.tipo === "otra_deuda" },
];

const BIEN: Record<string, string> = { vehiculo: "Vehículo", inmueble: "Casa, apartamento o terreno", otro: "Otro bien" };

function nombreTipo(i: ItemRegistro): string {
  if (i.tipo === "bien") return BIEN[i.subtipo ?? "otro"] ?? "Bien";
  return CATALOGO[i.tipo].nom;
}

/** De dónde sale el saldo de una fila (discreto: texto chico y tenue; «sin dato» punteado). */
function SelloSaldo({ i }: { i: ItemRegistro }) {
  if (esDeuda(i) && i.saldoFecha === null && i.vigente.fuente === "escrito") {
    return <span className="cap-sin-dato">sin dato: escribe cuánto debes</span>;
  }
  const escrito = i.saldoFecha ? `escrito el ${fechaCorta(diaDelSaldo(i.saldoFecha))}` : "escrito por ti";
  return (
    <span className="sello">
      Tus registros · {escrito}
      {i.vigente.fuente === "presupuesto" ? ` · + lo anotado en el Presupuesto (${i.vigente.movimientos} mov.)` : ""}
    </span>
  );
}

/** Lo que debes en US$ como se muestra en el formulario: a centavos (un pago desde pesos deja más decimales). */
const usdMostrado = (i?: ItemRegistro) => (i?.saldoUsd ? n(i.saldoUsd).round(2).toFixed() : "");

function CamposRegistro({ i, hoy, cobros }: { i?: ItemRegistro; hoy: string; cobros: { id: string; nombre: string }[] }) {
  const tipo = i ? tipoAltaDe(i.clase, i.subtipo, i.tipo) : "corriente";
  const id = i?.id ?? "nuevo";
  const saldo = i ? i.cantidad : "";
  const porUnidades = !!i && !n(i.precio).eq(1);
  const pct100 = (x: string | null) => (x ? aPct(x) : "");
  return (
    <>
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      {i && !porUnidades ? <input type="hidden" name="saldoMostrado" value={saldo} /> : null}
      <div className="reg-campos">
        <label className="cap-campo">
          ¿Qué es?
          <select name="tipo" defaultValue={tipo} required>
            {GRUPOS_ALTA.map((g) => (
              <optgroup key={g.nom} label={g.nom}>
                {TIPOS_ALTA.filter((t) => t.seccion === g.nom).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="cap-campo">
          Nombre
          <input name="nombre" required maxLength={200} defaultValue={i?.nombre ?? ""} placeholder="Ej.: Popular nómina" autoComplete="off" />
        </label>
        <label className="cap-campo">
          Banco o institución <span className="ayuda">(opcional)</span>
          <input name="inst" maxLength={200} defaultValue={i?.inst ?? ""} placeholder="Ej.: Banco Popular" autoComplete="off" />
        </label>
        <label className="cap-campo s-no-tarjeta">
          Moneda
          <select name="moneda" defaultValue={i?.moneda ?? "DOP"}>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m === "DOP" ? "RD$ (pesos)" : m === "USD" ? "US$ (dólares)" : "€ (euros)"}
              </option>
            ))}
          </select>
        </label>
        <label className="cap-campo s-saldo">
          <span className="reg-et-tiene">¿Cuánto tiene hoy?</span>
          <span className="reg-et-debe">¿Cuánto debes hoy?</span>
          <span className="reg-et-vale">¿Cuánto vale hoy?</span>
          <span className="cap-con-moneda">
            <span aria-hidden="true" className="reg-moneda"><span className="m-DOP">RD$</span><span className="m-USD">US$</span><span className="m-EUR">€</span></span>
            <input name="saldo" inputMode="decimal" defaultValue={i && !porUnidades ? saldo : ""} placeholder="Ej.: 25,000" autoComplete="off" id={`reg-${id}-saldo`} />
          </span>
        </label>
        <label className="cap-campo s-unidades">
          Cantidad de acciones, cuotas o unidades <span className="ayuda">(en un fondo, vacío = lo anotas como saldo)</span>
          <input name="cantidad" inputMode="decimal" defaultValue={porUnidades ? i!.cantidad : ""} placeholder="Ej.: 10" autoComplete="off" />
        </label>
        <label className="cap-campo s-unidades">
          Precio o valor cuota de cada una <span className="ayuda">(si hay precio de mercado, se usa ese)</span>
          <input name="precio" inputMode="decimal" defaultValue={porUnidades ? i!.precio : ""} placeholder="Ej.: 101.25" autoComplete="off" />
        </label>
        <label className="cap-campo s-unidades">
          Símbolo <span className="ayuda">(opcional)</span>
          <input name="simbolo" maxLength={15} autoCapitalize="characters" defaultValue={i?.simbolo ?? ""} placeholder="Ej.: VOO" autoComplete="off" />
        </label>
        <label className="cap-campo s-tasa">
          Tasa al año % <span className="ayuda">(opcional)</span>
          <input name="tasa" inputMode="decimal" defaultValue={i && n(i.tasa).gt(0) ? aPct(i.tasa) : ""} placeholder="Ej.: 8.5" autoComplete="off" />
        </label>
        <label className="cap-campo s-venc">
          Vence el <span className="ayuda">(opcional)</span>
          <input type="date" name="venc" defaultValue={i?.venc ?? ""} />
        </label>
        <label className="cap-campo s-claserv">
          ¿De renta fija o variable? <span className="ayuda">(según su reglamento)</span>
          <select name="claseRV" defaultValue={i?.clase === "rentavariable" ? "rentavariable" : "rentafija"}>
            <option value="rentafija">Renta fija</option>
            <option value="rentavariable">Renta variable</option>
          </select>
        </label>
        <label className="cap-campo s-debito">
          ¿Tiene tarjeta de débito? <span className="ayuda">(si sí, sirve para pagar)</span>
          <select name="debito" defaultValue={i?.tieneDebito ? "si" : "no"}>
            <option value="no">No</option>
            <option value="si">Sí, pago con ella</option>
          </select>
        </label>
        <label className="cap-campo s-capitaliza">
          ¿Capitaliza o te paga a una cuenta?
          <select name="capitaliza" defaultValue={i?.plan.capitaliza === true ? "si" : i?.plan.capitaliza === false ? "no" : ""}>
            <option value="">Todavía no lo sé</option>
            <option value="si">Capitaliza: el interés se queda adentro</option>
            <option value="no">Me paga los intereses a una cuenta</option>
          </select>
        </label>
        <label className="cap-campo s-pagaa">
          ¿A qué cuenta te paga? <span className="ayuda">(intereses, cupones o dividendos)</span>
          <select name="pagaA" defaultValue={i?.pagaA ?? ""}>
            <option value="">Todavía no lo sé</option>
            {cobros
              .filter((c) => c.id !== i?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="cap-campo s-plazo">
          Plazo en días <span className="ayuda">(mutuo típico: 30)</span>
          <input name="plazoDias" inputMode="numeric" maxLength={4} defaultValue={i?.plazoDias ? String(i.plazoDias) : ""} placeholder="Ej.: 30" autoComplete="off" />
        </label>
        <label className="cap-campo s-retencion">
          Retención del interés % <span className="ayuda">(vacío = la del tipo{i ? `: ${aPct(retencionDe(i.tipo, null)) || "0"} %` : ""})</span>
          <input name="retencion" inputMode="decimal" defaultValue={pct100(i?.retencion ?? null)} placeholder="Certificados bancarios: 10" autoComplete="off" />
        </label>
        <label className="cap-campo s-comision">
          Comisión de administración % al año <span className="ayuda">(opcional: si no la sabes, queda «no confirmado»)</span>
          <input name="comision" inputMode="decimal" defaultValue={pct100(i?.comisionAdmin ?? null)} placeholder="Ej.: 1.25" autoComplete="off" />
        </label>
        <label className="cap-campo s-tarjeta">
          ¿Y cuánto debes hoy en US$? <span className="ayuda">(si tu tarjeta tiene parte en dólares)</span>
          <span className="cap-con-moneda">
            <span aria-hidden="true">US$</span>
            <input name="saldoUsd" inputMode="decimal" defaultValue={usdMostrado(i)} placeholder="Ej.: 350" autoComplete="off" />
          </span>
        </label>
        {i && i.clase === "tarjeta" ? <input type="hidden" name="saldoUsdMostrado" value={usdMostrado(i)} /> : null}
        <label className="cap-campo s-tarjeta">
          Límite en RD$ <span className="ayuda">(opcional)</span>
          <span className="cap-con-moneda">
            <span aria-hidden="true">RD$</span>
            <input name="limite" inputMode="decimal" defaultValue={i?.limite ?? ""} placeholder="Ej.: 80,000" autoComplete="off" />
          </span>
        </label>
        <label className="cap-campo s-tarjeta">
          Límite en US$ <span className="ayuda">(opcional)</span>
          <span className="cap-con-moneda">
            <span aria-hidden="true">US$</span>
            <input name="limiteUsd" inputMode="decimal" defaultValue={i?.limiteUsd ?? ""} placeholder="Ej.: 2,000" autoComplete="off" />
          </span>
        </label>
        <label className="cap-campo s-tarjeta">
          Día de corte <span className="ayuda">(1 al 31)</span>
          <input name="diaCorte" inputMode="numeric" maxLength={2} defaultValue={i?.diaCorte ? String(i.diaCorte) : ""} placeholder="Ej.: 15" autoComplete="off" />
        </label>
        <label className="cap-campo s-tarjeta">
          Días para pagar después del corte
          <input name="diasParaPagar" inputMode="numeric" maxLength={2} defaultValue={i?.diasParaPagar ? String(i.diasParaPagar) : ""} placeholder="Ej.: 28" autoComplete="off" />
        </label>
        <label className="cap-campo s-tarjeta">
          Día en que quieres pagar <span className="ayuda">(opcional)</span>
          <input name="diaPagoTarjeta" inputMode="numeric" maxLength={2} defaultValue={i?.clase === "tarjeta" && i.diaPago ? String(i.diaPago) : ""} placeholder="Ej.: 30" autoComplete="off" />
        </label>
        <label className="cap-campo s-deuda">
          Día del mes en que pagas <span className="ayuda">(opcional)</span>
          <input name="diaPago" inputMode="numeric" maxLength={2} defaultValue={i && i.clase !== "tarjeta" && i.diaPago ? String(i.diaPago) : ""} placeholder="Ej.: 28" autoComplete="off" />
        </label>
        <label className="cap-campo s-prestamo">
          Cuota mensual <span className="ayuda">(opcional)</span>
          <input name="cuota" inputMode="decimal" defaultValue={i?.cuota ?? ""} placeholder="Ej.: 9,500" autoComplete="off" />
        </label>
        <label className="cap-campo s-cargos">
          Cargos dentro de la cuota: seguro y otros <span className="ayuda">(gasto aparte: no bajan la deuda)</span>
          <input name="cargosCuota" inputMode="decimal" defaultValue={i?.cargosCuota ?? ""} placeholder="Ej.: 1,200" autoComplete="off" />
        </label>
      </div>
      <p className="tenue chico reg-nota s-tarjeta-nota">
        Tarjeta: con el día de corte y los días para pagar calculamos tu fecha límite. Ej.: corta el 15 y tienes 28 días → la fecha límite es 28 días después del
        corte; si quieres pagar el 30, te avisamos si ese día cae después de la fecha límite. Si tu tarjeta tiene límite en pesos y en dólares, escribe las dos partes.
      </p>
      <p className="tenue chico reg-nota">
        Basta un nombre que reconozcas: nunca pongas números de cuenta, de tarjeta ni cédula. El saldo que escribes es el de hoy; lo que anotes desde mañana en el
        Presupuesto lo mueve solo. Si es efectivo, una cuenta, una tarjeta o un préstamo, aparece sola en el Presupuesto. Hoy es {fechaCorta(hoy)}.
      </p>
    </>
  );
}

/** «Corte 15 nov · pagas el 30 nov · fecha límite 13 dic» de una tarjeta con ciclo (o null). */
export function lineaTarjeta(i: ItemRegistro, hoy: string): { linea: string; nota: string | null } | null {
  const c = i.clase === "tarjeta" ? cicloDe(i) : null;
  if (!c) return null;
  const f = cicloVigente(hoy, c);
  return { linea: lineaCiclo(f, hoy), nota: notaCiclo(f, c) };
}

const usd = (x: Parameters<typeof num>[0]) => `US$ ${num(x, 2)}`;

/** Uso del límite por moneda y total en RD$ (con el dólar del BCRD, o «no confirmado»). */
function UsoDeTarjeta({ i, ctx }: { i: ItemRegistro; ctx: Contexto }) {
  const u = usoTarjeta(ctx, i);
  const partes: string[] = [];
  if (u.principal.limite) partes.push(`En RD$ usas ${pct(u.principal.uso, 0)} de tu límite (${rd(u.principal.saldo)} de ${rd(u.principal.limite)}).`);
  if (u.usd) {
    partes.push(
      u.usd.limite
        ? `En US$ usas ${pct(u.usd.uso, 0)} de tu límite (${usd(u.usd.saldo)} de ${usd(u.usd.limite)}).`
        : `En US$ debes ${usd(u.usd.saldo)} (sin límite en US$ escrito).`,
    );
  }
  if (!partes.length) return null;
  return (
    <div className="reg-uso-tc">
      {partes.map((x) => (
        <p key={x} className="chico">
          {x}
        </p>
      ))}
      {u.usd ? (
        u.usdNoConfirmado ? (
          <p className="chico cap-sin-dato">Total en RD$: la parte en US$ no se suma (no confirmado: falta el dólar del BCRD de hoy).</p>
        ) : u.totalDOP ? (
          <p className="chico">
            Total en RD$: <span className="mono">{rd(u.totalDOP)}</span>
            {u.tasa?.valor ? (
              <span className="sello">
                {" "}
                · US$ a {num(u.tasa.valor, 2)} (dólar de venta del BCRD del {fechaCorta(u.tasa.fecha!)}
                {u.tasa.url ? (
                  <>
                    ,{" "}
                    <a href={u.tasa.url} target="_blank" rel="noreferrer">
                      fuente
                    </a>
                  </>
                ) : null}
                )
              </span>
            ) : null}
          </p>
        ) : null
      ) : null}
    </div>
  );
}

/** Lo elegible que Mena cambió del comportamiento del tipo (queda anotado con su fecha). */
function CambiosAnotados({ i }: { i: ItemRegistro }) {
  const nombres: Record<string, (v: unknown) => string> = {
    capitaliza: (v) => (v === true ? "capitaliza" : v === false ? "te paga a una cuenta" : "sin elegir"),
    tiene_debito: (v) => (v ? "con tarjeta de débito" : "sin tarjeta de débito"),
    tipo: (v) => `ahora es ${CATALOGO[v as keyof typeof CATALOGO]?.nom.toLowerCase() ?? String(v)}`,
  };
  const lista = Object.entries(i.cambiosTipo).filter(([k]) => nombres[k]);
  if (!lista.length) return null;
  return (
    <p className="chico tenue" style={{ margin: "0 0 8px" }}>
      Cambiaste: {lista.map(([k, x]) => `${nombres[k](x.valor)} (${fechaCorta(x.fecha)})`).join(" · ")}.
    </p>
  );
}

function Fila({ i, datos, mes }: { i: ItemRegistro; datos: DatosCapital; mes: string }) {
  const v = valorRegistro(datos.ctx, i);
  const cobros = datos.registroCompleto.filter((x) => !x.unidoA && puedeRecibirCobros(x.tipo)).map((x) => ({ id: x.id, nombre: x.nombre }));
  const deja = i.tipo === "alto_rendimiento" ? cuantoDejaAlMes(aActivo(i)) : null;
  const pareceEuro = i.moneda === "DOP" && /\beuros?\b/i.test(i.nombre);
  const tc = i.clase === "tarjeta";
  const limites = tc ? [i.limite ? `límite ${rd(i.limite)}` : null, i.limiteUsd ? `${i.limite ? "" : "límite "}${usd(i.limiteUsd)}` : null].filter(Boolean).join(" · ") : null;
  const ciclo = lineaTarjeta(i, datos.ctx.hoy);
  const detalle = [
    nombreTipo(i),
    i.inst || null,
    n(i.tasa).gt(0) ? `${pct(i.tasa, 2)} al año` : null,
    tc ? limites || null : i.limite ? `límite ${rd(i.limite)}` : null,
    i.diaPago && !ciclo ? (tc ? `quieres pagar el ${i.diaPago}` : `paga el ${i.diaPago}`) : null,
    i.venc ? `vence ${fechaCorta(i.venc)}` : null,
  ].filter(Boolean);
  const doble = esDobleMoneda(i);
  const noConf = doble && usoTarjeta(datos.ctx, i).usdNoConfirmado;
  return (
    <li>
      <details className="cap-instrumento" key={`${i.id}-${i.cantidad}-${i.nombre}`}>
        <summary>
          <span className="nombre">
            {i.nombre}
            {i.cajaId ? <span className="etiqueta reg-en-presupuesto">En el Presupuesto</span> : null}
            {i.tipoConfirmado ? null : <span className="etiqueta alerta">tipo por confirmar</span>}
            <span className="detalle">{detalle.join(" · ")}</span>
            {ciclo ? <span className="detalle reg-ciclo">{ciclo.linea}</span> : null}
            {deja ? <span className="detalle">Te deja {rd(deja)} al mes</span> : null}
            <SelloSaldo i={i} />
          </span>
          <span className="monto">
            {v === null ? <span className="cap-estado error">sin tipo de cambio</span> : num(v)}
            {i.moneda !== "DOP" ? (
              <span className="detalle">
                {i.moneda} {num(n(i.cantidad).times(n(i.precio)), 2)}
              </span>
            ) : null}
            {doble ? (
              <span className="detalle">
                {rd(i.cantidad)} + {usd(i.saldoUsd ?? "0")}
                {noConf ? <span className="cap-sin-dato"> · US$ no confirmado</span> : null}
              </span>
            ) : null}
          </span>
        </summary>
        <div className="cuerpo">
          {i.tipoConfirmado ? null : (
            <p className="cap-nota" style={{ marginTop: 0 }}>
              Al pasar al catálogo de tipos dedujimos que es «{CATALOGO[i.tipo].nom}» (por su clase y su nombre). Revísalo en «¿Qué es?» y pulsa Guardar: así queda confirmado.
            </p>
          )}
          {pareceEuro ? (
            <p className="cap-nota baja" style={{ marginTop: 0 }}>
              «{i.nombre}» está anotado en RD$. Si son euros, cambia la moneda a € (se convierte con el cruce oficial BCE × BCRD de la fecha).
            </p>
          ) : null}
          <CambiosAnotados i={i} />
          {tc ? (
            <div className="reg-ficha-tc">
              {ciclo ? (
                <p className="reg-ciclo-ficha">
                  <strong>{ciclo.linea}</strong>
                  {ciclo.nota ? <span className="chico tenue"> {ciclo.nota}</span> : null}
                </p>
              ) : (
                <p className="chico tenue">Escribe el día de corte y los días para pagar para ver tu fecha límite.</p>
              )}
              <UsoDeTarjeta i={i} ctx={datos.ctx} />
            </div>
          ) : null}
          <form action={guardarRegistro} className="cap-form reg-form">
            <input type="hidden" name="mes" value={mes} />
            <CamposRegistro i={i} hoy={datos.ctx.hoy} cobros={cobros} />
            <div className="cap-botones">
              <BotonEnviar className="boton" aviso="Guardando los cambios de «{nombre}»…">
                Guardar cambios
              </BotonEnviar>
            </div>
          </form>
          {(
            <details className="cap-borrar" style={{ marginTop: 10 }}>
              <summary className="boton secundario chico peligro">
                <Icono nombre="basura" />
                Borrar {i.nombre}
              </summary>
              <form action={eliminarRegistro} className="cap-botones">
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="mes" value={mes} />
                <span className="chico">
                  ¿Seguro? «{i.nombre}» sale de Mis cuentas{i.cajaId ? " y del Presupuesto (solo si allá no tiene movimientos ni pagos fijos)" : ""} (sus transacciones se conservan). No se puede deshacer.
                </span>
                <BotonEnviar className="boton chico peligro" enviando="Borrando…">
                  Sí, borrar
                </BotonEnviar>
              </form>
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

function Grupo({ titulo, items, datos, mes, id }: { titulo: string; items: ItemRegistro[]; datos: DatosCapital; mes: string; id: string }) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s.plus(valorRegistro(datos.ctx, i) ?? 0), n("0"));
  return (
    <section className="reg-grupo" aria-labelledby={`reg-g-${id}`}>
      <div className="reg-grupo-cabeza">
        <h3 id={`reg-g-${id}`}>{titulo}</h3>
        <span className="mono">{rd(total)}</span>
      </div>
      <ul className="cap-instrumentos">
        {items.map((i) => (
          <Fila key={i.id} i={i} datos={datos} mes={mes} />
        ))}
      </ul>
    </section>
  );
}

/** Una tarjeta por par: las dos filas lado a lado, el saldo que queda y «Sí, unir» / «No, son distintas». */
function TarjetaPar({ p, datos, mes }: { p: ParUnion; datos: DatosCapital; mes: string }) {
  const { presupuesto: a, portafolio: b } = p;
  const deuda = esDeuda(a);
  const verbo = deuda ? "debes" : "tiene";
  const saldoB = b.saldoFecha === null && deuda ? null : b.cantidad;
  return (
    <li className="reg-par">
      <p className="reg-par-motivo">
        <Icono nombre="info" /> {p.motivo}
      </p>
      <div className="reg-par-lados">
        <div>
          <span className="tenue chico">En el Presupuesto</span>
          <strong>{a.nombre}</strong>
          <span className="chico">
            {verbo} hoy <span className="mono">{rd(a.cantidad)}</span>
          </span>
        </div>
        <div>
          <span className="tenue chico">En el Portafolio</span>
          <strong>{b.nombre}</strong>
          <span className="chico">{saldoB === null ? <span className="cap-sin-dato">sin saldo</span> : <>{verbo} <span className="mono">{rd(saldoB)}</span></>}</span>
        </div>
      </div>
      <form action={unirCuentas} className="reg-par-form">
        <input type="hidden" name="queda" value={b.id} />
        <input type="hidden" name="seVa" value={a.id} />
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="saldoPortafolio" value={b.cantidad} />
        <fieldset className="reg-par-saldo">
          <legend>¿Cuál saldo es el de hoy?</legend>
          <label>
            <input type="radio" name="saldoModo" value="presupuesto" defaultChecked /> El del Presupuesto ({rd(a.cantidad)})
          </label>
          {saldoB !== null ? (
            <label>
              <input type="radio" name="saldoModo" value="portafolio" /> El del Portafolio ({rd(saldoB)})
            </label>
          ) : null}
          <label className="reg-par-otro">
            <input type="radio" name="saldoModo" value="otro" /> Otro:
            <input name="saldoOtro" inputMode="decimal" placeholder="Ej.: 25,000" aria-label="Saldo de hoy" autoComplete="off" />
          </label>
        </fieldset>
        <div className="cap-botones">
          <BotonEnviar className="boton" enviando="Uniendo…" aviso="Uniendo las dos cuentas en una sola…">
            Sí, es la misma: unir
          </BotonEnviar>
        </div>
      </form>
      <form action={decidirUnion} className="reg-par-no">
        <input type="hidden" name="par" value={clavePar(p)} />
        <input type="hidden" name="mes" value={mes} />
        <button type="submit" className="boton secundario">
          No, son distintas
        </button>
      </form>
      <p className="tenue chico reg-par-pie">Al unir, queda «{b.nombre}» con todo su historial; la otra se guarda archivada (no se borra) y los movimientos del Presupuesto siguen en su lugar.</p>
    </li>
  );
}

export function PanelUnir({ datos, mes, pref, compacto = false }: { datos: DatosCapital; mes: string; pref: PrefRegistro; compacto?: boolean }) {
  const pares = sugerirUniones(datos.registroCompleto, new Set(pref.separadas));
  if (!pares.length) return null;
  if (compacto) {
    return (
      <p className="cap-aviso cap-ancho reg-aviso-unir" role="status">
        <Icono nombre="info" />
        <span>
          Encontramos {pares.length} {pares.length === 1 ? "cuenta que parece anotada" : "cuentas que parecen anotadas"} dos veces (en el Portafolio y en el Presupuesto).{" "}
          <Link href={`/capital/cuentas?mes=${mes}`}>Revisar y unir</Link>
        </span>
      </p>
    );
  }
  return (
    <Panel titulo="Unir cuentas repetidas" id="cap-t-unir" ancho extra={<span className="tenue chico">{pares.length} por revisar · solo una vez</span>}>
      <p className="cap-nota" style={{ marginTop: 0 }}>
        Antes anotabas tus cuentas en dos lugares. Estas parecen la misma: confirma cada una y quedará una sola, que usan el Portafolio y el Presupuesto. Nada se une ni se borra
        sin que digas que sí.
      </p>
      <ul className="reg-pares">
        {pares.map((p) => (
          <TarjetaPar key={clavePar(p)} p={p} datos={datos} mes={mes} />
        ))}
      </ul>
      <form action={decidirUnion} className="cap-botones" style={{ marginTop: 12 }}>
        <input type="hidden" name="revisado" value="si" />
        <input type="hidden" name="mes" value={mes} />
        <button type="submit" className="boton secundario">
          Ya revisé: dejar las demás separadas
        </button>
      </form>
    </Panel>
  );
}

export function PanelBalance({ datos }: { datos: DatosCapital }) {
  const b = balance(datos.ctx, datos.ctx.registro ?? []);
  return (
    <section className="panel cap-ancho" aria-labelledby="cap-t-balance">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="cap-t-balance">
          Tu balance de hoy
        </h2>
        <span className="tenue chico">lo que tienes − lo que debes</span>
      </div>
      <div className="panel-cuerpo reg-balance">
        <div className="cap-kpi">
          <div className="rotulo">Lo que tienes</div>
          <div className="valor">
            <small className="antes">RD$</small>
            {num(b.activos)}
          </div>
          <div className="meta">inversiones {rd(b.inversiones)}{b.otros.gt(0) ? ` · bienes ${rd(b.otros)}` : ""}</div>
        </div>
        <div className="cap-kpi">
          <div className="rotulo">Lo que debes</div>
          <div className="valor">
            <small className="antes">RD$</small>
            {num(b.deudas)}
          </div>
          <div className="meta">{b.deudasSinDato.length ? <span className="cap-sin-dato">{b.deudasSinDato.length} sin saldo escrito</span> : "tarjetas, préstamos y otras deudas"}</div>
        </div>
        <div className="cap-kpi reg-patrimonio">
          <div className="rotulo">Patrimonio</div>
          <div className="valor">
            <small className="antes">RD$</small>
            {num(b.patrimonio)}
          </div>
          <div className="meta">lo que te quedaría si pagaras todo hoy</div>
        </div>
      </div>
      <div className="panel-cuerpo" style={{ paddingTop: 0 }}>
        <span className="sello">Tus registros · saldos de hoy, con lo anotado en el Presupuesto</span>
        <SelloFx fx={datos.ctx.mercado.fx.USD} moneda="USD" ahora={datos.ahora} hoy={datos.ctx.hoy} />
        {b.sinValorar.length ? <p className="cap-nota baja">{b.sinValorar.length} sin tipo de cambio quedan fuera: {b.sinValorar.map((x) => x.nombre).join(", ")}.</p> : null}
        {b.usdNoConfirmado.length ? (
          <p className="cap-nota baja">
            Lo que debes en US$ en {b.usdNoConfirmado.map((x) => x.nombre).join(", ")} no se suma (no confirmado): falta el dólar de venta del BCRD de hoy.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function VistaCuentas({ datos, mes, pref, revisar }: Props) {
  const items = datos.ctx.registro ?? [];
  const vacio = items.length === 0;
  return (
    <>
      {vacio ? null : <PanelBalance datos={datos} />}
      {!pref.revisado || revisar ? <PanelUnir datos={datos} mes={mes} pref={pref} /> : null}
      <details className="cap-agregar cap-ancho" open={vacio}>
        <summary>
          <span className="boton">
            <Icono nombre="mas" />
            Agregar cuenta, bien o deuda
          </span>
          <span className="tenue chico">Se anota una vez: según su tipo, aparece sola en el Presupuesto donde sirve.</span>
        </summary>
        <div className="cuerpo">
          {vacio ? (
            <div className="reg-guia">
              <p>
                <strong>Aquí anotas todo lo que tienes y lo que debes.</strong> Con eso Strategya calcula tu patrimonio, y el Presupuesto usa estas mismas cuentas para
                saber de dónde sale y a dónde entra cada peso.
              </p>
              <p className="tenue chico">Ejemplos: «Popular nómina» (cuenta corriente), «Efectivo», «Certificado APAP», «Carro», «Visa BHD» (tarjeta), «Préstamo del carro».</p>
            </div>
          ) : null}
          <form action={guardarRegistro} className="cap-form reg-form">
            <input type="hidden" name="mes" value={mes} />
            <CamposRegistro hoy={datos.ctx.hoy} cobros={datos.registroCompleto.filter((x) => !x.unidoA && puedeRecibirCobros(x.tipo)).map((x) => ({ id: x.id, nombre: x.nombre }))} />
            <div className="cap-botones">
              <BotonEnviar className="boton boton-grande" aviso="Guardando «{nombre}»… aparece en tu lista en un momento.">
                Guardar
              </BotonEnviar>
            </div>
          </form>
        </div>
      </details>
      {vacio ? null : (
        <div className="reg-columnas cap-ancho">
          <section className="panel" aria-labelledby="cap-t-tienes">
            <div className="panel-cabecera">
              <h2 className="panel-titulo" id="cap-t-tienes">
                Lo que tienes
              </h2>
            </div>
            {GRUPOS_TIENES.map((g) => (
              <Grupo key={g.id} id={g.id} titulo={g.nom} items={items.filter(g.de)} datos={datos} mes={mes} />
            ))}
          </section>
          <section className="panel" aria-labelledby="cap-t-debes">
            <div className="panel-cabecera">
              <h2 className="panel-titulo" id="cap-t-debes">
                Lo que debes
              </h2>
            </div>
            {GRUPOS_DEBES.map((g) => (
              <Grupo key={g.id} id={g.id} titulo={g.nom} items={items.filter(g.de)} datos={datos} mes={mes} />
            ))}
            {!items.some(esDeuda) ? <p className="cap-vacio-chico">Sin deudas anotadas. Si tienes tarjeta o préstamo, agrégalo arriba en «Lo que debes».</p> : null}
          </section>
        </div>
      )}
    </>
  );
}
