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
