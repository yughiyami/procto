# Izumi · Pedido Compartido

Scaffold de backend para convertir una solicitud que una mype no puede atender sola en una oferta coordinada con su red. **No es todavía una aplicación lista para producción ni incluye interfaz web.**

## Alcance

- Núcleo propio: solicitud → aportes de proveedores → oferta versionada → aceptación → cumplimiento → movimientos económicos.
- API TypeScript/Fastify y PostgreSQL; una organización por credencial de API.
- Integraciones aisladas para Wapi, extracción asistida con DeepSeek y preparación/consulta de operaciones compatibles con Minkaly en Sepolia.
- Sin custodia de fondos, firma privada del servidor ni transacciones blockchain emitidas automáticamente.
- No se copió código de Wapi, wspbot o Minkaly. Publicación de un repositorio no sustituye una licencia de reutilización.

Los adaptadores necesitan credenciales e infraestructura externa reales. Su presencia **no significa que esas integraciones estén conectadas o probadas en vivo**. El modelo de negocio y todas sus condiciones están en [requisitos](docs/requirements.md); la configuración humana, en [configuración manual](docs/manual-setup.md).

## Estructura

Monorepo pnpm. Cada paquete se construye y verifica por separado.

```
apps/api        @izumi/api        Backend Fastify + PostgreSQL
apps/web        @izumi/web        Interfaz web responsive (Vite + React, instalable como PWA)
packages/contracts   @izumi/contracts    Esquemas zod, tipos y máquina de estados compartidos
packages/api-client  @izumi/api-client   Cliente HTTP tipado
packages/ui          @izumi/ui           Componentes y tokens de diseño
```

El contrato que une backend e interfaz está en [contrato de frontend](docs/frontend-contract.md).

## Inicio local

Requisitos: Node.js 22+, pnpm 11+ y Docker con Compose.

```powershell
pnpm install
Copy-Item .env.example .env
# Edita .env: sustituye replace_me en POSTGRES_PASSWORD y DATABASE_URL.
docker compose up -d
pnpm db:migrate
pnpm admin:create -- "Taller Demo"
pnpm dev
```

`pnpm dev` levanta API e interfaz a la vez. La interfaz usa el puerto `5173`; la API toma `PORT` de `.env` (`3001` si no se define) y PostgreSQL local se publica en `54329`.

Si la API no corre en `3001`, crea `apps/web/.env` con la dirección real; sin esto la interfaz no encontrará el backend:

```
VITE_API_URL=http://localhost:3001
```

La API solo acepta peticiones del navegador desde los orígenes de `WEB_ORIGIN` (por defecto `http://localhost:5173`). Si cambias el puerto de la interfaz, actualiza esa variable o el navegador bloqueará las respuestas.

Guarda la credencial generada por `admin:create` en un gestor de secretos y envíala como `Authorization: Bearer <token>`. No la pegues en conversaciones, issues o commits. El backend guarda su hash, no el token recuperable. La interfaz la conserva solo en el `sessionStorage` de esa pestaña.

```powershell
pnpm typecheck
pnpm build
pnpm test
```

Que estos comandos existan no acredita que se hayan ejecutado en tu máquina. Revisa el resultado real de cada uno.

Que estas instrucciones existan no acredita que Docker, las migraciones o los proveedores externos hayan sido ejecutados en tu máquina. Revisa el resultado real de cada comando.

## Límites del scaffold

- Credenciales administrativas por organización e invitaciones temporales de un solo envío; faltan portales de clientes/proveedores y recuperación de cuentas para producto final. El token del enlace demuestra posesión del enlace, no identidad verificada de la persona.
- Los compromisos describen capacidad declarada; no garantizan stock físico de terceros.
- Los movimientos financieros son un registro operativo, no conciliación bancaria ni contabilidad tributaria.
- La extracción IA propone información; requiere revisión antes de cualquier compromiso comercial.
- El contrato escrow de Minkaly no es un mecanismo de anclaje documental. Preparar una transacción no implica ejecutarla ni verificar la verdad comercial.
- Una reserva o aceptación en API no demuestra que el comprador real fue autenticado por un canal externo.

## Seguridad antes de exponerlo

No publiques PostgreSQL en Internet. Usa secretos distintos por entorno, TLS, rotación de credenciales, backups probados y restricciones de acceso. Configura los webhooks con HMAC sobre el cuerpo original y vincula explícitamente la sesión Wapi con la organización. No uses el número principal de un comercio en pruebas con un cliente no oficial.

## Agentes, chat y cola de trabajos

La regla que gobierna la capa agéntica: **un agente nunca modifica un pedido.** DeepSeek propone; una persona confirma. Su única escritura hacia el negocio es la tabla `agent_proposals`, y la aprobación humana es lo que llama a las funciones de dominio, bajo clave de idempotencia. Las cinco herramientas del agente son de solo lectura. El detalle está en [arquitectura de agentes](docs/agent-architecture.md).

Tres agentes con un trabajo cada uno: extraer datos de un mensaje, revisar un aporte propuesto y redactar la próxima consulta. Cada ejecución tiene techo de pasos, de tokens y de tiempo, y cada paso se persiste antes de la siguiente llamada al modelo, así que una caída deja un rastro auditable.

WhatsApp entra por el webhook firmado de Wapi y sale por una cola durable con reintentos y backoff. Un envío con resultado ambiguo (`unknown`) **no se reintenta**: reenviar podría entregar un segundo mensaje a una persona real, así que queda como tarea de reconciliación humana.

El agente es opt-in por conversación (`agent_paused` arranca en `true`) y ese interruptor frena que el agente actúe, no que una persona escriba.

```powershell
pnpm --filter @izumi/api worker
```

Sin `WAPI_API_KEY` la integración corre en **modo simulador**: `POST /chat/simulate/inbound` inyecta un mensaje entrante falso por el mismo camino de código que el webhook real, y los envíos se marcan `sim-` sin salir de la máquina. Sirve para probar el flujo completo sin vincular un número.

### Variables de entorno adicionales

`.env.example` todavía no las incluye; agrégalas a mano a tu `.env`.

```
WEB_ORIGIN=http://localhost:5173   # orígenes del navegador permitidos, separados por coma
WAPI_ORG_ID=                       # organización ligada al webhook firmado
WAPI_MODE=simulator                # simulator (por defecto sin WAPI_API_KEY) mantiene todo local
WAPI_OUTGOING_ENABLED=false        # debe ser true explícitamente para que salga un mensaje
AGENT_MAX_STEPS=8                  # techos del agente, aplicados en código
AGENT_MAX_TOKENS=20000
AGENT_TIMEOUT_MS=60000
WORKER_POLL_MS=2000
WORKER_BATCH=5
```

## Interfaz

Diecisiete vistas sobre el mismo núcleo, en español y soles: pedidos, alta de pedido, detalle/coordinación, finanzas por pedido, evidencia, dashboard financiero, conversaciones, hilo de conversación, propuestas de agente, auditoría de ejecución, blockchain, proveedores, bandeja, integraciones, invitación pública (proveedor y cliente), acceso y 404. Responsive desde 320 px e instalable como PWA; no hay aplicaciones nativas separadas.

Los iconos y la marca se generan desde `packages/ui/src/brand/izumi-mark.svg` con `pnpm --filter @izumi/web icons`.

La interfaz no afirma más de lo que el backend prueba: un compromiso es capacidad declarada y no stock reservado, la diferencia de caja no es utilidad, la exportación de evidencia se muestra como `not_anchored`, una integración configurada aparece como no verificada y un enlace de invitación acredita posesión del enlace, no identidad.

## Siguiente entrega

Comprobar un pedido real con dos proveedores y una entrega parcial antes de ampliar automatización. Pendientes conocidos: cola durable de envío, reservas globales de capacidad, exportación PDF/CSV y seguimiento de entregas por proveedor.

## Superficie de API del scaffold

Excepto salud, invitaciones públicas y webhook firmado, enviar `Authorization: Bearer <token>`. Las mutaciones de pedidos e invitaciones administrativas requieren además `Idempotency-Key` de 8–128 caracteres; reutilizar una clave con contenido distinto se rechaza.

| Método / ruta | Operación |
|---|---|
| `GET /health` | Salud del proceso; no acredita conexión con proveedores externos. |
| `GET /suppliers`, `POST /suppliers` | Lista/alta de proveedores de la organización. |
| `GET /orders`, `POST /orders` | Lista/alta de pedidos. |
| `GET /orders/:id` | Detalle privado del pedido. |
| `GET /orders/:id/feasibility` | Validación inicial de viabilidad. |
| `GET /orders/:id/finance` | Resumen económico operativo. |
| `GET /orders/:id/evidence` | Exportación JSON del historial privado; devuelve `not_anchored`. |
| `POST /orders/:id/contributions` | Registrar aporte de proveedor. |
| `POST /orders/:id/quote` | Preparar oferta versionada. |
| `POST /orders/:id/accept` | Aceptación administrativa de versión; no suplantar consentimiento externo. |
| `POST /orders/:id/deliveries` | Registrar entrega; seguimiento individual por proveedor pendiente. |
| `POST /orders/:id/movements` | Registrar movimiento económico manual. |
| `POST /orders/:id/cancel` | Cancelar conforme al estado permitido. |
| `POST /orders/:id/invitations` | Enlace de proveedor/cliente, caducidad máxima siete días. |
| `GET /public/invitations/:token` | Datos mínimos de la solicitud u oferta, sin costos de otros proveedores. |
| `POST /public/invitations/:token` | Un aporte o aceptación, de un solo envío y ligado a su versión. |

Integraciones añadidas por el módulo de conexión: `/integrations/status`, `/webhooks/wapi`, `/inbox`, `/inbox/:id/extract`, `/drafts` y `/blockchain/prepare`. El estado configurado no equivale a prueba externa exitosa. La bandeja y los borradores no aprueban pedidos por sí solos; la preparación blockchain no firma ni emite la transacción.
