# Sistema Mena — contexto para Claude

App personal de seguimiento (PWA, React + TypeScript + Dexie/IndexedDB, offline).
El usuario **no es programador**: explícale los cambios por lo que significan para él,
no por cómo se implementaron. Todo el código y la conversación van en español.

## Skills de este repositorio

| Skill | Cuándo |
|---|---|
| `programador-mena` | Antes de escribir, modificar o revisar cualquier archivo del repo |
| `disenador-mena` | Antes de diseñar una pantalla, componente o gráfica |
| `analista-financiero` | Al interpretar cifras o construir cualquier pantalla financiera |
| `briefing` | Al armar el briefing diario o su pantalla |

## Agentes (`.claude/agents/`)

`briefing` genera el briefing de las 6:00 y 17:00 y lo escribe en `public/briefing/`.
`analista-financiero` diagnostica empresas y estados. `programador-mena` implementa
funciones completas en este repositorio.

## Red: lo que sale y lo que no

El egreso del contenedor está bloqueado por política. `curl` y `WebFetch` a cnbc.com,
ft.com, wsj.com o marketwatch.com devuelven 403 / EGRESS_BLOCKED. **Solo `WebSearch`
sale**, y alcanza cnbc.com; Reuters, FT y MarketWatch bloquean el rastreador. Las
herramientas `mcp__FMP__*` están en plan gratuito y niegan cotizaciones y noticias.
Por eso el briefing lo genera un agente y la app solo lee el JSON de su propio origen.

## Lo que nunca se hace

- Editar `src/datos/seed/` a mano — se regenera con `herramientas/generar_seed.py` desde el Excel.
- Poner un cálculo dentro de un componente de React — va en `src/dominio/`, con prueba.
- Dar por terminado un cambio sin `npm test && npm run build`.
- Asumir un dato del usuario. Lo del Excel es sugerencia con procedencia, no dato guardado.
- Gamificación: insignias, rachas, notificaciones motivacionales. (Las notificaciones
  del briefing sí van: entregan información, no empujan una racha.)
