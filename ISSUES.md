# Issues conocidos

## `eth_getLogs range ... exceeds limit of 10000` en despliegues reales (Sepolia/Vercel)

**Estado:** Corregido.

### Síntoma

Con el frontend desplegado en Vercel y conectado a Sepolia (en vez de la
cadena local de Anvil usada en desarrollo), la consola del navegador
mostraba un error como:

```
Error: eth_getLogs range 0-11315677 exceeds limit of 10000
```

y el dashboard quedaba sin cargar propuestas ni el log de ejecuciones.

### Causa raíz

`web/context/DaoContext.tsx` reconstruye la lista de propuestas y el log de
ejecuciones escaneando eventos pasados del contrato (`ProposalCreated` /
`ProposalExecuted`), porque `DAOVoting` no expone una función de vista
"listar todas las propuestas". Las llamadas originales eran:

```ts
const events = await dao.queryFilter(dao.filters.ProposalCreated());
```

Sin `fromBlock`/`toBlock`, ethers.js hace la consulta sobre **todo** el
historial de la cadena (`fromBlock = 0`, `toBlock = "latest"`). En Anvil
esto no es un problema porque la cadena local solo tiene un puñado de
bloques. Pero en una red real y longeva como Sepolia, "latest" ronda los
11.3 millones de bloques, y la mayoría de proveedores RPC (Infura,
Alchemy, endpoints públicos) rechazan `eth_getLogs` cuando el rango
solicitado supera un límite (~10.000 bloques en el caso de Infura).

El mismo patrón sin acotar existía también en `web/scripts/daemon.mjs`
(`checkAndExecute()`), el proceso que ejecuta automáticamente las
propuestas aprobadas — hubiera fallado igual si se apuntara a una red real.

### Dónde se origina

- [`web/context/DaoContext.tsx`](web/context/DaoContext.tsx) — `fetchProposals()` y `fetchExecutionLog()`.
- [`web/scripts/daemon.mjs`](web/scripts/daemon.mjs) — `checkAndExecute()`.

### Corrección implementada

No se disponía del número de bloque exacto en el que se desplegó el
contrato (no quedó guardado en ningún lado al hacer el deploy a Sepolia),
así que en vez de depender de un valor fijo o de una variable de entorno
nueva, la corrección lo **calcula en el momento, por búsqueda binaria**:

- [`web/lib/blockRange.ts`](web/lib/blockRange.ts) (nuevo):
  - `getDeploymentBlock(provider, address)`: encuentra el bloque de
    despliegue de un contrato mediante búsqueda binaria sobre
    `eth_getCode` (vacío antes del despliegue, con bytecode desde ese
    bloque en adelante). Son ~log2(bloque_actual) llamadas — unas 24 como
    máximo incluso en una cadena de decenas de millones de bloques — y el
    resultado se cachea en memoria por dirección para no repetir la
    búsqueda en cada refresco de la página.
  - `queryFilterPaginated(contract, filter, fromBlock, toBlock)`: parte la
    consulta en ventanas de como máximo 9.000 bloques (por debajo del
    límite típico de 10.000) y concatena los resultados.

- `DaoContext.tsx` y `daemon.mjs` ahora calculan `fromBlock` con
  `getDeploymentBlock` (en vez de 0) y `toBlock` con
  `provider.getBlockNumber()` (en vez de `"latest"` implícito), y usan
  `queryFilterPaginated` en lugar de `queryFilter` sin acotar. La lógica
  se duplicó en `daemon.mjs` en JS plano en vez de importar el módulo
  TypeScript, siguiendo el mismo patrón que ya usaba ese script para
  cargar su propia copia del ABI (es un proceso Node independiente, fuera
  del build de Next.js).

Como la búsqueda de despliegue se cachea por dirección y solo agrega una
llamada extra (`getBlockNumber`) por refresco, el costo adicional en redes
reales es mínimo, y en Anvil el comportamiento es idéntico al anterior
(el contrato está en el bloque 0 o 1, así que el rango sigue siendo
pequeño).

### Cómo verificar

1. Apuntar `web/.env.local` (o las variables de entorno del proyecto en
   Vercel) a Sepolia (`NEXT_PUBLIC_CHAIN_ID=11155111`, `SEPOLIA_RPC_URL` y
   las direcciones del contrato desplegado ahí).
2. Cargar el dashboard con una wallet conectada a Sepolia y confirmar en
   la consola del navegador que no aparece el error `eth_getLogs range ...
   exceeds limit`, y que las propuestas y el log de ejecuciones cargan
   correctamente.

## Votar falla con `execution reverted` / `missing revert data` en producción (Sepolia)

**Estado:** Corregido.

### Síntoma

En el dashboard desplegado en Vercel, conectado a Sepolia por MetaMask, al
votar ("A favor" / "En contra" / "Abstención") nunca aparecía el popup de
firma de MetaMask. En su lugar, la consola mostraba varios errores
encadenados:

```
MetaMask - RPC Error: execution reverted {code: 3, data: {cause: null}, ...}
MetaMask - RPC Error: RPC endpoint returned too many errors, retrying in 0,43 minutes.
Uncaught (in promise) Error: could not coalesce error ...
MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 close listeners added.
ObjectMultiplex - orphaned data for stream "app-init-liveness" / "background-liveness"
```

### Causa raíz

Dos problemas distintos que se combinaban para producir este cuadro — y uno
más que parecía relacionado pero no lo estaba (ver nota al final):

1. **Falso positivo del contrato/red.** El primer sospechoso natural —
   direcciones de contrato mal configuradas — se descartó verificando
   directamente contra Sepolia (`eth_getCode` y `cast call` sobre
   `DAOVoting` y `MinimalForwarder`): ambos contratos están bien
   desplegados, con el `trustedForwarder` correcto grabado como
   `immutable`, y `getNonce(address)` responde sin problema por RPC
   directo. El error real no estaba en el contrato ni en las direcciones.

2. **Causa real: demasiado polling de fondo saturaba el RPC compartido de
   MetaMask.** `DaoContext` refrescaba cada 8s, más el polling interno
   que ethers arma automáticamente para cada `dao.on(...)` — ese volumen
   de tráfico, sumado al de cualquier otra pestaña abierta, termina
   saturando el endpoint RPC compartido/gratuito que trae MetaMask por
   defecto para Sepolia. Al saturarse entra en modo backoff (`RPC
   endpoint returned too many errors, retrying...`) y empieza a devolver
   respuestas corruptas/vacías a llamadas normales como `getNonce`,
   viéndose como un revert del contrato aunque no lo era.

   De paso se corrigió también [`web/hooks/useMetaMask.ts`](web/hooks/useMetaMask.ts),
   que creaba una **`BrowserProvider` nueva** cada vez que MetaMask
   disparaba `accountsChanged`/`chainChanged` en vez de reutilizar una
   sola instancia — esto sumaba tráfico y objetos de más en cada cambio
   de cuenta, aunque **no** es la causa del warning de `contentscript.js`
   descrito abajo (esa parte quedó aclarada tras el fix).

> **Nota — el `MaxListenersExceededWarning: 11 close/end listeners`
> visto en consola es un artefacto propio de la extensión de MetaMask**
> (`contentscript.js`/`inpage.js`/`ObjectMultiplex`, todo código interno
> de la extensión, no del bundle de la app), no algo que el código de
> este proyecto cause o pueda arreglar. Se confirmó porque el conteo
> (11) se mantuvo **idéntico antes y después** del fix de
> `useMetaMask.ts` — si la fuga viniera de la app, el número debería
> haber crecido con cada acción nueva. Es un mensaje cosmético,
> ampliamente reportado en otros dApps, y no indica que el problema de
> saturación de RPC siga sin resolver — para eso hay que mirar si
> reaparecen `RPC endpoint returned too many errors` o `execution
> reverted` al votar, no este warning puntual.

### Dónde se origina

- [`web/hooks/useMetaMask.ts`](web/hooks/useMetaMask.ts) — `connect()` y el `handleChange` del efecto de `accountsChanged`/`chainChanged`.
- [`web/context/DaoContext.tsx`](web/context/DaoContext.tsx) — intervalo de refresco (contribuía al volumen de tráfico, no a la fuga en sí).

### Corrección implementada

- `useMetaMask.ts`: se crea **una sola `BrowserProvider` por sesión de
  página**, en el efecto de montaje, y se reutiliza tanto en `connect()`
  como en cada `accountsChanged`/`chainChanged` — en vez de instanciar una
  nueva cada vez.
- `DaoContext.tsx`: el intervalo de refresco de respaldo se subió de 8s a
  20s — los listeners de eventos del contrato ya mantienen la UI casi en
  tiempo real, así que el intervalo solo hace falta como red de
  seguridad ante un evento perdido, no necesita ser agresivo. Cada
  pestaña abierta corre este ciclo de forma independiente, así que un
  intervalo más corto multiplica la carga de RPC con cada usuario
  concurrente.

### Cómo verificar

1. Con el fix desplegado, conectar MetaMask a Sepolia y cambiar de cuenta
   varias veces seguidas (`accountsChanged`) — la consola no debería
   acumular `MaxListenersExceededWarning` con un conteo creciente.
2. Votar en una propuesta activa desde una cuenta con saldo depositado
   ≥ `minVoteBalance`: debería aparecer el popup de firma de MetaMask sin
   errores previos de `execution reverted`/`missing revert data`.

## `historical state ... is not available` al crear/refrescar propuestas con un RPC público no-archive

**Estado:** Corregido.

### Síntoma

Tras cambiar el RPC de Sepolia en MetaMask a un endpoint público
(`ethereum-sepolia-rpc.publicnode.com`, para evitar la saturación del
endpoint compartido de MetaMask — ver issue anterior), dejó de funcionar
"Crear propuesta": el formulario mostraba `could not coalesce error` en
rojo y la lista de propuestas quedaba vacía ("Todavía no hay
propuestas"), aunque antes (con el RPC de Infura propio del proyecto) sí
funcionaba. En la consola:

```
MetaMask - RPC Error: Internal JSON-RPC error.
{code: -32603, message: 'Internal JSON-RPC error.', data: {
  code: -32000,
  message: "historical state ... is not available",
  ...
}}
payload: { method: "eth_getCode", params: ["0x474eB90F...", "0x0"] }
Uncaught (in promise) Error: could not coalesce error ...
```

### Causa raíz

Bug introducido por el propio fix del primer issue de este documento
(`eth_getLogs range ... exceeds limit`). `getDeploymentBlock()` (en
[`web/lib/blockRange.ts`](web/lib/blockRange.ts)) busca el bloque de
despliegue del contrato con una búsqueda binaria sobre `eth_getCode` en
bloques arbitrarios, incluyendo el bloque `0`. Eso asume que el nodo RPC
puede responder `eth_getCode` para **cualquier** bloque del historial —
válido para Infura/Alchemy (que sirven estado histórico completo por
defecto), pero **no** para muchos RPCs públicos gratuitos como
`publicnode.com`, que solo son nodos "full" (guardan estado reciente, no
archive) y devuelven un error en vez de una respuesta para bloques viejos.

`getDeploymentBlock()` no capturaba ese error, así que la búsqueda binaria
completa (y con ella `fetchProposals()`/`fetchExecutionLog()`) fallaba en
cuanto tocaba un bloque fuera del rango que ese nodo podía servir. Y como
`createProposal()`/`fundDAO()`/`executeProposalManually()` hacen
`await refresh()` inmediatamente después de `tx.wait()` sin capturar
errores, ese fallo del refresco de fondo se propagaba hacia arriba y
hacía que la acción completa se reportara como fallida en la UI —
aunque la transacción en sí ya se hubiera confirmado on-chain.

### Dónde se origina

- [`web/lib/blockRange.ts`](web/lib/blockRange.ts) — `getDeploymentBlock()`.
- [`web/scripts/daemon.mjs`](web/scripts/daemon.mjs) — copia duplicada de la misma búsqueda.
- [`web/context/DaoContext.tsx`](web/context/DaoContext.tsx) — `refresh()`, y las acciones de escritura (`fundDAO`, `createProposal`, `executeProposalManually`) que dependen de que no lance.

### Corrección implementada

- `getDeploymentBlock()` (en ambos archivos) ahora envuelve cada
  `eth_getCode` en un try/catch: si el nodo no puede responder para un
  bloque (nodo no-archive), se trata como "no lo sé" y la búsqueda binaria
  converge hacia el bloque más antiguo que el nodo sí pueda servir, en vez
  de reventar. En el peor caso (RPC con muy poca ventana de historial)
  esto puede hacer que `fromBlock` quede un poco más reciente de lo ideal
  — pero eventos anteriores a esa ventana son, de todas formas,
  irrecuperables a través de ese nodo por más que se busque.
- `DaoContext.tsx`: `refresh()` ahora atrapa sus propios errores
  (`console.warn` en vez de dejarlos propagar). Un refresco de fondo
  fallido ya no hace que una transacción real y exitosa (depositar, crear
  propuesta, votar, ejecutar) se reporte como error en la UI.

### Cómo verificar

1. Configurar MetaMask con un RPC de Sepolia público y no-archive (por
   ejemplo `https://ethereum-sepolia-rpc.publicnode.com`).
2. Crear una propuesta: debe confirmar y aparecer en la lista sin mostrar
   `could not coalesce error`, incluso si en la consola aparece algún
   `console.warn` de refresco (no bloqueante).

## `Request is being rate limited` (429) de forma continua, incluso con RPC propio de Infura

**Estado:** Corregido.

### Síntoma

Tras cambiar a un RPC dedicado (el Infura del propio proyecto), la app
seguía recibiendo `MetaMask - RPC Error: Request is being rate limited.`
(`code: -32005`, `httpStatus: 429`) de forma **continua y repetida** —no
un error aislado, sino un flujo constante de rechazos— para varios
métodos distintos (`eth_getCode`, `eth_getLogs`, `eth_newFilter`,
`eth_blockNumber`). Una propuesta ("Proyecto de Marketing") se había
creado correctamente on-chain (confirmado con `cast call
getProposal(...)` contra un RPC aparte), pero no aparecía en la UI porque
`fetchProposals()` nunca lograba completarse.

### Causa raíz

`web/context/DaoContext.tsx` mantenía **dos mecanismos de actualización
en paralelo**:

1. Un `setInterval(refresh, 20000)` explícito.
2. Suscripciones `dao.on("Funded", ...)`, `dao.on("ProposalCreated", ...)`,
   `dao.on("VoteCast", ...)`, `dao.on("ProposalExecuted", ...)`.

El problema está en (2): MetaMask/Infura exponen un provider **HTTP**
JSON-RPC, no WebSocket, así que no hay forma de que el nodo *empuje*
eventos hacia el navegador. Cuando `Contract.on()` de ethers v6 se usa
sobre un provider HTTP, cae automáticamente a su propio polling interno
por evento (`eth_newFilter` una vez + `eth_getFilterChanges` cada ~4s,
indefinidamente). Con 4 eventos suscritos, eso son **4 ciclos de polling
corriendo en paralelo**, además del `setInterval` de 20s — suficiente
para agotar el límite de peticiones por segundo incluso de una API key
de Infura en su plan gratuito, no solo del RPC público compartido de
MetaMask (ver el issue anterior).

### Dónde se origina

- [`web/context/DaoContext.tsx`](web/context/DaoContext.tsx) — el `useEffect` con `dao.on(...)`/`dao.off(...)`.

### Corrección implementada

Se eliminaron las 4 suscripciones `dao.on(...)` (y su limpieza
`dao.off(...)` correspondiente). La actualización de la UI depende
ahora **únicamente** del `setInterval(refresh, 20000)` — sin polling
adicional oculto. Se pierde algo de "tiempo real" (hasta 20s de
desfase en vez de ~4s), pero es la única versión que no multiplica la
carga de RPC por cada pestaña abierta y cada evento suscrito.

### Cómo verificar

1. Con el fix desplegado, dejar la pestaña abierta varios minutos con
   DevTools → Network filtrando por el endpoint RPC: no debería verse
   una llamada `eth_getFilterChanges`/`eth_newFilter` repitiéndose cada
   pocos segundos, solo el patrón de `refresh()` cada 20s.
2. Crear una propuesta y confirmar que aparece en la lista dentro de los
   20s siguientes, sin errores `Request is being rate limited` en
   consola bajo uso normal (una pestaña, un usuario).

## `Request is being rate limited` persiste tras quitar `dao.on(...)` — polling interno de `BrowserProvider`

**Estado:** Corregido.

### Síntoma

Incluso después del fix anterior (quitar las suscripciones `dao.on(...)`)
y con un RPC dedicado (Infura propio, no el público), seguía apareciendo
`Request is being rate limited` (`code: -32005`) de forma continua,
incluyendo en llamadas normales como `getUserVote` (que fallaba con
`missing revert data` como efecto colateral de la saturación, no porque
el voto en sí fuera inválido). En el stack de la consola se veía
`eth_blockNumber` disparándose dentro de un `setInterval` — un patrón
que no correspondía a ningún `setInterval` del código de la app (el
único que queda es el `refresh()` cada 20s, que no llama
`getBlockNumber()` de forma aislada).

### Causa raíz

Los providers de ethers v6 (`BrowserProvider` incluido) hacen **polling
de bloques nuevos en segundo plano por cuenta propia**, con un
`pollingInterval` por defecto de **4000ms** — independiente de cualquier
`.on(...)` explícito del código de la app. Ethers usa este poller
internamente para cosas como `tx.wait()` y la resolución de "block tags",
y arranca solo, sin que el desarrollador tenga que suscribirse a nada.
Ese poller de fondo, sumado al `setInterval(refresh, 20000)` propio de
`DaoContext`, era una segunda fuente de tráfico constante hacia el RPC
que el fix anterior no cubría — y por sí sola bastaba para seguir
agotando el límite de peticiones por segundo.

### Dónde se origina

- [`web/hooks/useMetaMask.ts`](web/hooks/useMetaMask.ts) — creación del `BrowserProvider` (`pollingInterval` nunca configurado, quedaba en el default de la librería).

### Corrección implementada

Se fija `browserProvider.pollingInterval = 20000` justo después de crear
la instancia única de `BrowserProvider` (ver el issue anterior sobre por
qué solo hay una instancia por sesión) — alineando el polling interno de
ethers con la misma cadencia de 20s que ya usa el resto de la app, en vez
de dejarlo en su default de 4s.

### Cómo verificar

1. Con el fix desplegado, dejar la pestaña abierta un par de minutos con
   DevTools → Network filtrando por `eth_blockNumber`: las llamadas
   deberían espaciarse ~20s, no ~4s.
2. Votar en una propuesta y confirmar que no aparece `missing revert
   data`/`Request is being rate limited` en consola bajo uso normal.
