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

Dos problemas distintos que se combinaban para producir este cuadro:

1. **Falso positivo del contrato/red.** El primer sospechoso natural —
   direcciones de contrato mal configuradas — se descartó verificando
   directamente contra Sepolia (`eth_getCode` y `cast call` sobre
   `DAOVoting` y `MinimalForwarder`): ambos contratos están bien
   desplegados, con el `trustedForwarder` correcto grabado como
   `immutable`, y `getNonce(address)` responde sin problema por RPC
   directo. El error real no estaba en el contrato ni en las direcciones.

2. **Causa real: fuga de listeners en `useMetaMask`, que termina saturando
   el RPC compartido de MetaMask.** [`web/hooks/useMetaMask.ts`](web/hooks/useMetaMask.ts)
   creaba una **`BrowserProvider` nueva** cada vez que MetaMask disparaba
   `accountsChanged` o `chainChanged` (es decir, cada vez que se cambiaba
   de cuenta o de red):
   ```ts
   const handleChange = () => {
     const p = new BrowserProvider(ethereum); // nueva instancia cada vez
     setProvider(p);
     refresh(p);
   };
   ```
   Cada `BrowserProvider` envuelve el mismo `window.ethereum` (el
   `EventEmitter` interno de la extensión) y engancha sus propios
   listeners para detectar cambios de red. Como las instancias viejas se
   descartaban sin ninguna limpieza, cada cambio de cuenta dejaba un set
   de listeners huérfano enganchado permanentemente a `window.ethereum` —
   de ahí el aviso de la propia extensión, `MaxListenersExceededWarning:
   11 close listeners added` (uno por cada cambio de cuenta/red probado
   en la sesión). Esos listeners huérfanos añaden polling de fondo extra
   sobre la conexión de MetaMask con su RPC, y sumado al polling propio
   de la app (`DaoContext` refrescaba cada 8s, más el polling interno de
   ethers para cada `dao.on(...)`), terminaba saturando el endpoint RPC
   compartido que trae MetaMask por defecto para Sepolia — que entonces
   entra en modo backoff (`RPC endpoint returned too many errors,
   retrying...`) y devuelve respuestas corruptas/vacías a llamadas
   normales como `getNonce`, viéndose como un revert del contrato aunque
   no lo era.

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
