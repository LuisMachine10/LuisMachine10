// Agenda de bancos centrales y eventos clave, en hora de RD. Lo no confirmado se rotula.

import { PanelError } from "@/componentes/PanelError";
import { leerAgenda } from "@/lib/datos-noticias";
import { proximosEventos } from "@/lib/noticias";
import { LineaEvento } from "./agenda-comun";
import { Cabecera } from "./comun";

export async function PanelAgenda({ dias = 90, ahora = new Date() }: { dias?: number; ahora?: Date }) {
  let agenda: Awaited<ReturnType<typeof leerAgenda>>;
  try {
    agenda = await leerAgenda();
  } catch (e) {
    return <PanelError titulo="Agenda" mensaje={(e as Error).message} />;
  }
  const eventos = proximosEventos(agenda, ahora, dias);
  const sinConfirmar = eventos.filter((e) => !e.confirmado).length;

  return (
    <section className="panel" aria-labelledby="titulo-agenda">
      <Cabecera id="titulo-agenda" titulo="Agenda">
        <div className="sello">
          <span>Próximos {dias} días · hora RD</span>
          {sinConfirmar ? <span>· {sinConfirmar} sin confirmar con el calendario oficial</span> : null}
        </div>
      </Cabecera>
      {eventos.length === 0 ? (
        <div className="vacio">Sin eventos cargados para los próximos {dias} días.</div>
      ) : (
        <div className="panel-cuerpo">
          <ol className="nt-agenda">
            {eventos.map((e) => (
              <LineaEvento key={e.id} e={e} ahora={ahora} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
