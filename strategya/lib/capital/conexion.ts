// «Revisar conexión con el Presupuesto» (Portafolio → Ajustes, Fase F). Solo lee y compara: no cambia nada.
// Puro, con big.js.
//
// Por cada cuenta enlazada (caja_cuentas.registro_id):
//   · Saldo en el Portafolio (Mis cuentas): lo escrito + lo anotado en el Presupuesto, sin los fijos de hoy
//     que todavía no se confirman (lib/capital/registro.ts · conSaldosVigentes).
//   · Saldo en el Presupuesto: el del calendario al final de hoy, con lo programado para hoy.
//   · ✓ si son iguales; si no, la diferencia y por qué (fijos de hoy sin confirmar, u otra causa).
//   · Además revisa que nombre, tipo, límite y moneda sean los mismos en los dos lados, y que el último
//     saldo escrito en el Portafolio haya llegado al Presupuesto (como saldo inicial o como cuadre).

import Big from "big.js";
import { enMoneda } from "../caja/formato";
import { simular } from "../caja/motor";
import { type DatosCaja, esDeuda as esDeudaCaja, monedaDe, type Moneda } from "../caja/tipos";
import { esDeuda, type ItemRegistro, tipoCajaDe } from "./registro";

export interface RevisionCuenta {
  registroId: string;
  cajaId: string;
  nombre: string;
  moneda: Moneda;
  deuda: boolean;
  /** Saldo en Mis cuentas (en una deuda, lo que se debe). */
  portafolio: string;
  /** Saldo en el calendario del Presupuesto al final de hoy (con lo programado de hoy). null = no se pudo calcular. */
  presupuesto: string | null;
  /** portafolio − presupuesto (0 = cuadran). */
  diferencia: string | null;
  cuadra: boolean;
  /** Por qué no cuadra o qué más no coincide (vacío = todo bien). */
  motivos: string[];
}

export interface RevisionConexion {
  cuentas: RevisionCuenta[];
  /** Cuentas del Presupuesto que no están enlazadas a Mis cuentas (no debería pasar). */
  sueltas: { cajaId: string; nombre: string }[];
  /** No hay Presupuesto configurado o no se pudo leer. */
  sinPresupuesto: boolean;
}

const fmt = (b: Big) => b.toFixed(2);

export function revisarConexion(registro: ItemRegistro[], caja: DatosCaja | null, hoy: string): RevisionConexion {
  if (!caja?.config) return { cuentas: [], sueltas: [], sinPresupuesto: true };
  const sim = simular(caja, { hoy, hasta: hoy });
  const d = sim.porFecha.get(hoy);
  const porCaja = new Map(registro.filter((i) => i.cajaId && !i.unidoA).map((i) => [i.cajaId!, i]));
  const cuentas: RevisionCuenta[] = [];
  const sueltas: RevisionConexion["sueltas"] = [];
  for (const c of [...caja.cuentas].sort((a, b) => a.orden - b.orden)) {
    const i = porCaja.get(c.id);
    if (!i) {
      sueltas.push({ cajaId: c.id, nombre: c.nombre });
      continue;
    }
    const deuda = esDeudaCaja(c.tipo);
    const pos = d?.posiciones[c.id];
    const presupuesto = pos == null ? null : deuda ? new Big(pos).times(-1) : new Big(pos);
    const portafolio = new Big(i.cantidad);
    const diferencia = presupuesto ? portafolio.minus(presupuesto) : null;
    const motivos: string[] = [];
    const moneda = monedaDe(c);
    const m = (b: Big) => enMoneda(fmt(b.abs()), moneda);

    if (diferencia && !diferencia.eq(0)) {
      // ¿Lo explica lo programado para hoy que todavía no se confirma?
      const hoyProg = d?.planificados.filter((o) => o.cuenta === c.id || o.destino === c.id) ?? [];
      if (hoyProg.length) {
        const nombres = hoyProg.map((o) => `«${o.nombre}»`).join(", ");
        motivos.push(
          `El calendario ya cuenta lo programado para hoy (${nombres}); Mis cuentas lo suma cuando digas «Sí, ya se hizo». Diferencia: ${m(diferencia)}.`,
        );
      } else {
        motivos.push(`Diferencia de ${m(diferencia)} sin causa conocida: avísanos para revisarla.`);
      }
    } else if (!presupuesto) {
      motivos.push("El calendario no tiene el saldo de hoy (¿la fecha de inicio es posterior a hoy?).");
    }
    // Lo demás debe ser idéntico en los dos lados.
    if (c.nombre !== i.nombre.slice(0, 120)) motivos.push(`El nombre no coincide: «${c.nombre}» en el Presupuesto y «${i.nombre}» en Mis cuentas.`);
    if (c.tipo !== tipoCajaDe(i)) motivos.push("El tipo de cuenta no coincide entre los dos lados.");
    if ((c.limite ?? null) !== (i.limite ?? null) && !(c.limite && i.limite && new Big(c.limite).eq(i.limite))) motivos.push("El límite de la tarjeta no coincide.");
    if (moneda !== i.moneda) motivos.push(`La moneda no coincide: ${moneda} en el Presupuesto y ${i.moneda} en Mis cuentas.`);
    // El último saldo escrito en Mis cuentas debe estar en la línea de tiempo del Presupuesto.
    if (i.saldoFecha) {
      const escrito = new Big(i.cantidadEscrita);
      if (i.saldoFecha > caja.config.inicio) {
        const dia = new Date(`${i.saldoFecha}T12:00:00Z`);
        dia.setUTCDate(dia.getUTCDate() - 1);
        const f = dia.toISOString().slice(0, 10);
        const cuadre = caja.saldos.find((s) => s.cuentaId === c.id && s.fecha === f);
        // Si se movió la fecha de inicio del Presupuesto hacia atrás, el saldo escrito quedó como saldo inicial: también vale.
        const comoInicial = !cuadre && new Big(c.saldoInicial || "0").eq(escrito);
        if (!comoInicial && (!cuadre || !new Big(cuadre.saldo).eq(escrito))) motivos.push(`El saldo que escribiste en Mis cuentas (${m(escrito)}) no está como cuadre del ${f} en el Presupuesto.`);
      } else if (!new Big(c.saldoInicial || "0").eq(escrito)) {
        motivos.push(`El saldo inicial del Presupuesto (${m(new Big(c.saldoInicial || "0"))}) no es el que escribiste en Mis cuentas (${m(escrito)}).`);
      }
    }
    cuentas.push({
      registroId: i.id,
      cajaId: c.id,
      nombre: i.nombre,
      moneda,
      deuda: deuda || esDeuda(i),
      portafolio: fmt(portafolio),
      presupuesto: presupuesto ? fmt(presupuesto) : null,
      diferencia: diferencia ? fmt(diferencia) : null,
      cuadra: motivos.length === 0,
      motivos,
    });
  }
  return { cuentas, sueltas, sinPresupuesto: false };
}
