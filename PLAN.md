# Plan — App de registro de lotes · Invernadero Oro Verde

> Versión 1 (etapa inicial, alcance simple). Zona horaria: America/Lima.

## 1. Contexto

Invernadero Oro Verde produce hortalizas, principalmente pepino (japonés, holandés, etc.), además de tomate cherry y otras.

| Invernadero | Lotes |
|---|---|
| El Dorado | 3 |
| Bungalows | 12 |
| Carmen Alto | 9 |
| **Total** | **24** |

## 2. Objetivo

Que los ingenieros registren desde el celular **lo que se hizo hoy en cada lote**, para tener el historial completo de cada lote: cuándo empezó cada ciclo, en qué fase está, qué se hizo, quién lo hizo y cuándo terminó. El administrador consulta todo desde la web.

### Principios

- **Registrar lo del día.** Cada registro dice "hoy se hizo X". Si un lote no tiene registros nuevos, sigue en el último proceso registrado.
- **La plantilla es una guía, no un flujo obligatorio.** Las acciones se registran en cualquier orden, se repiten, se omiten o se agregan nuevas ("Otra acción"). La app no bloquea nada.
- **La fase no se elige a mano**: se calcula a partir de los registros.
- **Nada se borra.** Los errores se corrigen editando el registro, y queda guardado quién lo cambió y cuándo.
- **Fuera de alcance:** el control de producción (cosecha, bolsas o kg) lo maneja otra app.

## 3. Alcance

| Esta etapa | Etapas futuras |
|---|---|
| 3 invernaderos y 24 lotes (identificados por número) | Avisos ("falta registrar X") |
| Ciclos por lote, con historial | Recordatorios de las acciones generales |
| Registro de las acciones del día | Catálogo de productos |
| Fase actual calculada automáticamente | Ficha de evaluación de plagas |
| Campos extra en texto libre | Reportes y gráficos |
| Edición solo de los registros propios, con auditoría | |
| Una plantilla única, editable por el administrador | Cultivos y variedades por ciclo (incluidos lotes con más de una variedad a la vez) |

## 4. Usuarios y permisos

- **4 ingenieros** y **1 administrador**.
- Los ingenieros rotan dentro de cada invernadero, así que **todos ven y pueden registrar en todos los lotes**.
- Cada ingeniero **edita solo los registros que él creó**. El administrador puede editar todos.
- El responsable de un registro es siempre el ingeniero que inició sesión.
- **Autenticación:** se usa el proyecto de Supabase `invernadero-auth`, que ya comparten las demás apps. El detalle está en §11.1.
- **Roles:** vienen de `public.application_memberships` con `application_id = 'lotes'`. `employee` equivale a ingeniero y `admin` a administrador. Un usuario sin membresía en `lotes` recibe 403.
- **Independencia:** esta app es independiente de `distribution`, que ya maneja lotes y campañas para la producción. No comparten base de datos ni códigos de lote. Más adelante se podría vincular.

## 5. Ciclos

- Un **ciclo** = lote + número correlativo dentro del lote + fecha de inicio + fecha de fin + estado (activo o cerrado). Por ejemplo: "Bungalows · Lote 5 · Ciclo 3".
- Cada lote tiene **un solo ciclo activo** a la vez y guarda todos los anteriores.
- Para empezar un cultivo nuevo, el ingeniero pulsa **"Nuevo ciclo"**. El ciclo activo anterior se cierra automáticamente con la fecha de ese día.
- **Cultivos y variedades: quedan para la etapa 2.** Por ahora el ciclo no guarda qué se sembró. Un lote puede tener al mismo tiempo una parte de una variedad y otra parte de otra, y eso requiere un diseño propio (por ejemplo, varias variedades por ciclo con la proporción o las líneas de cada una).
- **Arranque desde cero:** cada lote empieza en el ciclo 1, con su primer registro con fecha de hoy. No se carga historial previo ni se importa nada de `distribution`.

## 6. Plantilla de acciones (única para todos los cultivos)

"Cierre del ciclo" es la **última** fase: lo que se hace al retirar las plantas pertenece al ciclo de ese cultivo.

| # | Fase | Acciones |
|---|---|---|
| 1 | Limpieza del campo | Recoger el plástico mulch · Recoger las cintas de riego por goteo |
| 2 | Preparación del suelo | Poner guano en líneas y camellones · Remover la tierra y mezclar el guano (pala, trinche, pico) · Hacer huecos en la línea e incorporar la broza · Tapar los huecos con 15 cm de tierra |
| 3 | Instalación | Instalar la cinta de riego con goteros · Colocar el plástico mulch · Aplicar nematicida por riego |
| 4 | Descomposición | Regar con agua interdiario (10 a 15 días) |
| 5 | Plantines | Recibir los plantines · Trasplantar (en la primera hoja) · Aplicar fungicida y enraizante (3 a 4 días después del trasplante) · Aplicar la segunda fertilización (con las hojas verdaderas, 2 veces por semana) |
| 6 | Crecimiento | Iniciar el tutorado (con la 5.ª hoja, unos 20 días después) · Limpiar la planta (diario o interdiario) |
| 7 | Producción | Aplicar fertilizante de producción (3 veces por semana) · Evaluar fertilizantes (a los 35 días) · Iniciar la cosecha · Controlar desperfectos con los controles de seguridad |
| 8 | Cierre del ciclo | Aplicar nematicida por riego (una sola inyección) · Arrancar la planta de raíz · Cortar la raíz y botarla · Dejar secar la planta (3 a 5 días) · Bajar la planta al suelo y retirar pepinillos amarillos |

### Acciones generales (sin fase)

Se registran el día en que se hacen. **No cambian la fase** y en esta etapa no generan recordatorios.

- Revisión de plagas y enfermedades
- Aplicar químico (si la revisión lo indica)
- Fungicida y enraizante (habitualmente los martes)
- Foliares (habitualmente los viernes)
- Riego y registro de humedad (interdiario)
- Control de calidad

## 7. Cálculo de la fase actual

**Regla: la fase más avanzada que tenga al menos un registro en el ciclo activo.**

```
fase_actual(ciclo):
  si ciclo.estado = cerrado     → "Ciclo cerrado"
  registros = registros del ciclo con fase_id no vacía
              (excluye acciones generales y "Otra acción" sin fase)
  si no hay registros           → "Sin registros"
  devolver la fase con mayor `orden` entre esos registros
```

- Se calcula al consultar y no se guarda. Con 24 lotes es instantáneo y nunca se desincroniza.
- Un registro tardío de una fase anterior no hace retroceder la fase.
- **Días del ciclo** = hoy − `ciclo.fecha_inicio`.

## 8. Formulario "Registrar acción"

Se abre desde la vista del lote, con el lote y su ciclo activo ya seleccionados.

1. **Acción:** lista agrupada por fase, más las acciones generales y **"Otra acción"** (texto libre y fase opcional).
2. **Fecha:** hoy por defecto, editable.
3. **Campos extra según la acción.** Son **todos opcionales**: la API solo valida su tipo de dato (texto, sí/no o una de las opciones), nunca exige que se llenen.

   | Tipo de detalle | Campos |
   |---|---|
   | `aplicacion` (nematicida, fungicida, enraizante, foliares, fertilizantes, químico) | Producto (texto) · Dosis (texto) |
   | `riego` | Humedad (texto libre) |
   | `plagas` | Resultado (texto) · ¿Se aplicó químico? (sí/no) |
   | `eval_fertilizante` | Resultado: funcionó bien / hay que cambiarlo |
   | `ninguno` | — |

4. **Notas:** texto libre.
5. **Responsable:** el usuario que inició sesión (automático).

## 9. Modelo de datos

Los nombres de modelos y campos van **en inglés**, según la convención de §11.2. Entre paréntesis está el concepto en español.

```
Greenhouse ──< Lot ──< Cycle ──< ActionLog ──< ActionLogChange
                                     │
                                     ├── Action ──> Phase (opcional)
                                     └── User
```

| Modelo (concepto) | Campos |
|---|---|
| `Greenhouse` (invernadero) | id, name |
| `Lot` (lote) | id, greenhouseId, number, active |
| `Phase` (fase) | id, order, name |
| `Action` (acción de la plantilla) | id, phaseId (vacío = acción general), name, code (clave única y opcional para la vista 3D), order, detailType, active |
| `Cycle` (ciclo) | id, lotId, number (correlativo por lote), startDate, endDate, status (ACTIVE/CLOSED), createdById, createdAt |
| `ActionLog` (registro) | id, cycleId, actionId (vacío = "Otra acción"), name (copia), phaseId (copia), date, details (JSONB), notes, userId, createdAt, updatedAt |
| `ActionLogChange` (cambio de registro) | id, actionLogId, userId, changedAt, before (JSONB), after (JSONB) |
| `User` (usuario local) | id, authId (`auth.users.id`, único), displayName, email, createdAt |

### Reglas

- Todas las llaves primarias son `String @id @default(uuid())`.
- Índice único parcial: un solo `Cycle` con estado `ACTIVE` por `lotId`.
- Unicidad de `(greenhouseId, number)` en `Lot` y de `(lotId, number)` en `Cycle`.
- El `name` y el `phaseId` se **copian** al crear el registro, para que editar la plantilla no altere el historial.
- Las acciones se **desactivan**; nunca se borran.
- Cada edición de un registro crea un `ActionLogChange` con los valores anteriores y nuevos, dentro de la misma transacción.
- `details` se valida en la API según el `detailType` de la acción.
- **`User` no guarda el rol.** El rol se obtiene siempre de `application_memberships` (§11.1). La fila local se crea automáticamente la primera vez que el usuario entra y sirve para la autoría y para mostrar su nombre.

## 10. Pantallas

| Pantalla | Dispositivo | Contenido |
|---|---|---|
| Vista general | Celular y web | Lotes agrupados por invernadero, con número de ciclo, fase actual, días del ciclo y último registro |
| Vista del lote | Celular y web | Ciclo activo, fase actual, línea de tiempo de registros, botones "Registrar acción" y "Nuevo ciclo" |
| Registrar / editar acción | Celular | Formulario de §8 |
| Historial de ciclos | Celular y web | Ciclos del lote: número, inicio, fin y duración |
| Detalle del registro | Celular y web | Datos e historial de cambios |
| Administración | Web (solo admin) | Fases y acciones de la plantilla, lotes |

### Administración (etapa 1)

- **Fases:** solo se renombran. Siguen siendo 8, con orden fijo; no se agregan, quitan ni reordenan. Más adelante se podría permitir, pero la barra de fases (8 segmentos) y la regla de §7 tendrían que adaptarse a un número variable.
- **Acciones:** se crean, se renombran, se cambian de fase o de tipo de detalle, se ordenan dentro de su grupo y se desactivan o reactivan. Los registros ya hechos no cambian (§9: el nombre y la fase se copian).
- **Lotes:** se agregan a un invernadero y se desactivan o reactivan. Un lote desactivado no aparece en la vista general, pero conserva sus ciclos.

### Vista 3D de los lotes (administración)

Página `/admin/map` (pestaña "Vista 3D"), solo para el admin, hecha con three.js. El código está en `web/src/app/modules/admin/features/farm-map/`.

- **Carga bajo demanda:** al entrar no se carga nada en 3D. Primero se elige un invernadero, en tarjetas con su número de lotes, cuántos tienen registros hoy y cuántos llevan 3 días o más sin registros. Recién entonces se descarga three.js y se construye solo ese invernadero. "Todos" (o "Ver todos juntos") construye los tres, pero solo si se elige.
- **Distribución (`layout.ts`):**
  - Sin techos, arcos, paredes ni malla, porque tapaban los lotes. Cada invernadero es solo su piso claro con los lotes encima.
  - **Bungalows y Carmen Alto:** esquemáticos, con lotes del mismo tamaño ordenados por número, hasta 6 por fila.
  - **El Dorado** sigue el croquis de la granja: tres lotes separados en una columna, con el 3 al fondo y el 1 adelante, cada uno con su propio piso. Entre el 2 y el 3 está la choza del guardián. Entre el 1 y el 2 están la piscina, pegada al 2, y un cuadrado de plantas, pegado al 1.
  - **No se copian las medidas reales:** los lotes de El Dorado son del mismo orden de tamaño que los demás, para que en "Todos" se vean a una escala parecida.
  - **Otro invernadero con distribución real:** se agrega en `SHAPES` (`layout.ts`) por nombre de invernadero, a partir de su croquis.
- **Cada lote muestra su fase**, con geometría simple generada por código (sin modelos externos):

  | Fase | Cómo se ve |
  |---|---|
  | Sin ciclo o sin registros de fase | Tierra lisa |
  | 1. Limpieza del campo | Tierra con restos de plástico y cintas |
  | 2. Preparación del suelo | Camellones con montículos de guano |
  | 3. Instalación | Camellones cubiertos con mulch y cinta de riego |
  | 4. Descomposición | Mulch con tierra húmeda y oscura alrededor |
  | 5. Plantines | Plantas pequeñas en línea |
  | 6. Crecimiento | Plantas altas con hilos de tutorado |
  | 7. Producción | Plantas altas con pepinos |
  | 8. Cierre del ciclo | Plantas secas y caídas |

- **Actividad reciente:**
  - Un lote con registros hoy lleva un marco dorado y su número en dorado.
  - Un lote con 3 días o más sin registros no se tapa (la capa blanca confundía). Solo cambia su etiqueta: gris con borde punteado, un reloj y los días ("7 d").
  - La tarjeta y la lista dicen los días exactos ("7 días sin registros").
- **Trabajador animado** en cada lote con un registro de hoy, haciendo la acción de su último registro:
  - **Relación acción → animación:** cada acción tiene un código estable, la columna `Action.code`. Es texto único y opcional, y no cambia aunque la acción se renombre. El id no sirve porque es distinto en cada base de datos. El nombre tampoco, porque se renombra y hay nombres repetidos ("Aplicar nematicida por riego" está en las fases 3 y 8). El seed asigna los códigos de las acciones actuales (`recoger-mulch`, `hacer-huecos`, `nematicida-cierre`, …), y `GET /lots` devuelve el código del último registro.
  - **Catálogo (`worker-actions.ts`):** cada código apunta a un movimiento base más una variante (los objetos que lleva, el estilo y el color del producto), así que cada acción se ve distinta. Hay 11 movimientos base:
    - recoger
    - lampa: dar vuelta la tierra, cavar con la broza al lado, o empujar tierra
    - echar guano
    - tender: deja la cinta o el plástico en el lote
    - fumigar: la mochila tiene el color del producto
    - regar: con manguera; con bidón rojo en el nematicida por riego
    - trasplantar
    - cargar
    - tutorar o limpiar
    - cosechar
    - revisar
  - **Trabajador (`scene/worker.ts`):** low-poly, hecho con formas simples, con sombrero y camisas de colores variados. Camina por el surco entre las dos primeras líneas. En las fases 6 a 8 trabaja desde el pasillo junto al lote, porque las plantas altas lo taparían.
  - **Acción nueva o editada:** el admin la crea o renombra en la plantilla. Luego, con Claude Code, se le asigna un código en la base y se agrega su entrada en el catálogo. Sin código (o con un código que no está en el catálogo) la acción no tiene trabajador.
- **Interacción** (controles tipo mapa):
  - Arrastrar (o un dedo) desplaza la vista.
  - La rueda o pellizcar acerca hacia el cursor.
  - El botón derecho (o dos dedos) gira la vista.
  - El desplazamiento se detiene en el borde de los lotes.
  - Hay botones para cambiar de invernadero.
  - Un invernadero claramente alargado (como El Dorado) se mira de costado para que ocupe la pantalla.
  - Al pasar o tocar un lote aparece una tarjeta con su fase, el día del ciclo y el último registro. Al hacer clic, la tarjeta queda fija con "Abrir lote".
- **Datos:** `GET /lots` (fase, días y último registro con su código), sin endpoints nuevos.
- **Rendimiento:**
  - three.js se carga solo al elegir un invernadero.
  - Se dibuja solo cuando algo cambia, salvo mientras hay trabajadores: entonces se anima en cada cuadro, con pausa automática al cambiar de pestaña.
  - Se liberan los recursos al salir de la página.
- **Accesibilidad:** la misma información como lista ("Ver como lista"), también cuando el navegador no soporta WebGL. Con "reducir movimiento" la cámara salta en vez de deslizarse y los trabajadores quedan quietos en su pose.
- **Después (v2):**
  - Línea de tiempo para reproducir el avance día a día (necesita un endpoint con la fase por día).
  - Distribución real de Bungalows y Carmen Alto cuando haya croquis.
  - Que el código de la acción también cambie el dibujo del lote, por ejemplo que se vean las cintas después de "Instalar la cinta de riego" aunque la fase sea la misma.

## 11. Tecnología e infraestructura

Se replica el stack y las convenciones del proyecto `distribution` (`~/dev/distribution/stack-context.md`).

| Capa | Elección |
|---|---|
| Estructura | Monorepo con `/front` y `/back`, y `docker-compose.yml` para el PostgreSQL local |
| Frontend | Angular 22 como PWA, con spartan-ng (HLM), Tailwind CSS v4, `@ng-icons/lucide`, signals, ReactiveForms y toasts (sonner) |
| Backend | NestJS 11 (API REST), `class-validator` y `ValidationPipe` global. Sin Swagger |
| Base de datos | PostgreSQL propio. Supabase se usa **solo para la autenticación** |
| ORM y migraciones | Prisma 7 |
| Autenticación | Supabase `invernadero-auth` (§11.1) |
| Despliegue | Dokploy con 3 servicios: front (Caddy), back (Node 24) y PostgreSQL con respaldos diarios |
| Conectividad | Hay señal en los invernaderos, así que no se requiere modo sin conexión |

### 11.1 Autenticación (mismo patrón que `distribution`)

**Frontend**
- Inicia sesión con `@supabase/supabase-js` usando solo la **publishable key**. La sesión la maneja el SDK.
- Un interceptor funcional agrega `Authorization: Bearer <token>` **solo** a las peticiones a `environment.apiUrl`.
- Al arrancar, la app hace **una sola** llamada a `GET /me`, que devuelve el usuario y su rol. El resultado queda en un signal del `AuthService` y lo reutilizan los guards y las pantallas. **No se vuelve a pedir en cada página.**

**Backend**
- `SupabaseAuthGuard` global (`APP_GUARD`) valida el JWT con `verifyCredentials` contra el JWKS público (`SUPABASE_URL` y `SUPABASE_JWKS_URL`). `@Public()` excluye rutas.
- `ApplicationAccessService` consulta `application_memberships` (`select=role`, `application_id=eq.lotes`) por REST, con la publishable key y el JWT del usuario. Las reglas de seguridad (RLS) de Supabase solo le permiten leer su propia fila.
- El rol queda en `request.user` y se lee con `@CurrentUser()`. Un decorador `@Roles('admin')` protege las rutas de administración.
- **El backend no guarda ninguna clave secreta de Supabase.**

**Cómo se evitan las peticiones duplicadas a Supabase: una consulta por token**

Es el mismo criterio que usa el frontend de `distribution`, aplicado también en el backend. El rol se consulta **una sola vez por token**: la primera petición con un token nuevo (al iniciar sesión o después de que Supabase lo renueve, aproximadamente cada hora) hace la consulta, y las demás peticiones con ese token usan el resultado guardado. **No hay ningún temporizador.**

1. **Caché en memoria por token** en `ApplicationAccessService`: `Map<tokenKey, { userId, role, exp }>`. La clave `tokenKey` es el hash SHA-256 del JWT, para no guardar el token en texto plano. La entrada dura hasta el `exp` del propio JWT (ya verificado por el guard).
2. **Agrupación de peticiones simultáneas:** un `Map<tokenKey, Promise>` hace que, si al arrancar la app llegan varias peticiones a la vez con el mismo token nuevo, se haga **una sola** consulta y todas esperen su resultado.
3. **No se guarda en caché el "sin acceso" (403) ni los errores (503)**, para que la siguiente petición pueda reintentar.
4. **Limpieza:** las entradas con `exp` vencido se borran al leerlas, y además con un barrido ocasional al insertar una nueva.
5. **La validación del JWT no hace ninguna petición**, porque las claves públicas (JWKS) las guarda en caché la librería `jose`. La firma y la expiración se siguen validando **en cada petición**.
6. **En el frontend**, `GET /me` se llama una vez por token, con el mismo patrón que `auth.service.ts` de `distribution` (caché por token y usuario, y se borra en `onAuthStateChange`). No se consulta Supabase directamente desde Angular para los permisos.

Resultado: **una consulta a Supabase por usuario y por token**, es decir, aproximadamente una por hora por cada ingeniero activo.

> **Contrapartida:** si se quita o cambia el rol de un usuario, el cambio se aplica cuando se renueva su token, como máximo en 1 hora (el tiempo de vida del JWT en Supabase, configurable en Auth → JWT expiry). Si alguna vez hace falta revocar al instante, se puede agregar un endpoint de administrador que vacíe la caché de ese usuario.
>
> **Por qué no por sesión (`session_id`):** la sesión sobrevive a las renovaciones del token, así que un cambio de rol no se aplicaría hasta que el usuario cierre sesión. Con la caché por token, al menos se vuelve a verificar en cada renovación.
>
> **Por qué no guardar el rol en la base de datos local:** quedaría desactualizado sin un proceso que lo sincronice, y la fuente de verdad es `application_memberships`.

### 11.2 Convenciones

- **El código va en inglés** (identificadores, endpoints, rutas, DTOs, modelos de Prisma) y **todo lo que ve el usuario va en español**.
- **Solo `pnpm`** (nunca `npm` ni `npx`).
- **Hora de Perú** (UTC−5, sin horario de verano): los instantes se guardan en UTC y las fechas de día se calculan con helpers de hora de Perú (como `peru-date.ts`). Los registros usan `@db.Date`.
- **Las migraciones, el seed y las instalaciones de paquetes los ejecuta el usuario, manualmente.**
- El frontend sigue los mismos patrones que `distribution`: componentes standalone, `inject()`, `@if`/`@for`, guards e interceptores funcionales, rutas con carga diferida y módulos con `features/`, `components/`, `services/` y `models/`.

## 12. Orden de construcción

1. **Base:** esquema de Prisma, migraciones y datos iniciales (invernaderos, lotes, fases y acciones con su tipo de detalle).
2. **API:** lotes, ciclos (incluido "Nuevo ciclo"), registros, cálculo de fase y validación de `detalles`.
3. **Autenticación:** guard, `ApplicationAccessService` con caché por token, `GET /me`, `@Roles`, y permisos (editar solo lo propio; el admin edita todo).
4. **Frontend para celular:** vista general, vista del lote y formulario de registro.
5. **Historial:** historial de ciclos, edición con `registro_cambio` y detalle del registro.
6. **Administración web y despliegue** en Dokploy.
7. **Piloto** con los 4 ingenieros y ajustes.

## 13. Pendientes antes de construir

- ~~Integración de la autenticación~~: resuelta (§11.1).
- **Usuarios en `lotes`:** hoy hay 1 `admin` y 1 `employee`. Faltan las cuentas y membresías `employee` de los otros 3 ingenieros.
- ~~Nombres de las variedades~~: las variedades pasan a la etapa 2.
- ~~Lista de cultivos~~: los cultivos pasan a la etapa 2.
- ~~Tipo de detalle de cada acción~~: confirmado (§8), con todos los campos opcionales.
