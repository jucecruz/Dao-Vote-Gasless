# DAO Gasless

DAO completo con votación sin gas: los miembros depositan ETH, ganan poder de voto proporcional a lo depositado, crean y votan propuestas, y las propuestas aprobadas se transfieren automáticamente al beneficiario. Votar no cuesta gas — se firma off-chain y un relayer envía la transacción por el usuario, vía meta-transacciones EIP-2771.

El proyecto tiene dos partes independientes:

```
dao/
  sc/    Contratos Solidity (Foundry) — ver sc/README.md
  web/   Frontend Next.js + relayer + daemon — ver web/README.md
```

- [`ARQUITECTURA.md`](ARQUITECTURA.md) — flujo de meta-transacciones, arquitectura de contratos, flujo de usuario en frontend y stack tecnológico detallado, con diagramas.
- [`sc/README.md`](sc/README.md) — contratos, tests, deploy (local y testnet).
- [`web/README.md`](web/README.md) — frontend, relayer, daemon, estructura de carpetas.

---

## Instalación

### Requisitos previos

| Herramienta | Usado en este proyecto | Instalación |
|---|---|---|
| [Foundry](https://book.getfoundry.sh/) (forge, cast, anvil) | forge 1.7.1 | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| [Node.js](https://nodejs.org/) | v22 | — |
| [MetaMask](https://metamask.io/) (extensión de navegador) | — | — |

### 1. Contratos (`sc/`)

```bash
cd sc
forge install          # dependencias (forge-std, OpenZeppelin)
forge build             # compila
forge test               # corre los 28 tests
```

### 2. Frontend (`web/`)

```bash
cd web
npm install
cp .env.local.example .env.local   # se completa en el paso de Deployment
```

Ver [`sc/README.md`](sc/README.md) y [`web/README.md`](web/README.md) para el detalle de cada dependencia.

---

## Deployment

### Red local (Anvil) — para desarrollar/probar

```bash
# Terminal 1: nodo local
anvil

# Terminal 2: desplegar los contratos
cd sc
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Sin configurar nada más, usa la cuenta #0 de Anvil como deployer y valores por defecto (`minVoteBalance = 0.01 ETH`, `executionDelay = 1 hora`). El comando imprime las direcciones de `MinimalForwarder` y `DAOVoting` — se necesitan en el siguiente paso.

```bash
# Terminal 3: configurar y levantar el frontend
cd web
# completar en .env.local: NEXT_PUBLIC_DAO_ADDRESS, NEXT_PUBLIC_FORWARDER_ADDRESS
# con las direcciones anteriores, y RELAYER_PRIVATE_KEY/RELAYER_ADDRESS/
# NEXT_PUBLIC_RELAYER_ADDRESS con alguna cuenta de Anvil (ej. la #1)
npm run dev                # http://localhost:3000

# Terminal 4: daemon de ejecución automática
npm run daemon
```

En MetaMask: agregar red con RPC `http://127.0.0.1:8545`, chain ID `31337`, e importar alguna de las cuentas (con su private key) que `anvil` imprime al arrancar.

> Cada vez que se reinicia Anvil, la cadena es nueva — hay que volver a desplegar y, si MetaMask empieza a fallar con errores de RPC raros, eliminar y volver a agregar la red en MetaMask (queda con caché de la cadena anterior).

### Testnet — para una red real

```bash
cd sc
PRIVATE_KEY=0x... RPC_URL=https://... \
  forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --verify
```

`PRIVATE_KEY` es obligatoria (sin fallback a una clave de prueba, a propósito). Mismas variables opcionales que en local (`MIN_VOTE_BALANCE`, `EXECUTION_DELAY`, este último por defecto 1 día en vez de 1 hora). Luego se configura `web/.env.local` igual que arriba pero con `NEXT_PUBLIC_CHAIN_ID`/`RPC_URL` de esa red y una cuenta real como relayer (con fondos para pagar el gas de los votos que reenvíe).

Detalle completo de variables de entorno de cada script en [`sc/README.md`](sc/README.md).

---

## Guía de uso de la aplicación

1. **Conectar wallet** — botón "Conectar MetaMask" arriba a la derecha. Muestra la dirección conectada y tu saldo depositado en el DAO.
2. **Financiar el DAO** — en "Financiación de las Propuestas", ingresar una cantidad de ETH y "Depositar". Ese depósito es acumulativo: define tu poder de voto y si puedes crear propuestas.
3. **Crear una propuesta** — solo habilitado si tu saldo depositado es ≥10% del total disponible del DAO. Completar beneficiario, monto, fecha límite y una descripción, y confirmar la transacción en MetaMask (esta sí paga gas).
4. **Votar sin gas** — en cualquier propuesta "Activa", elegir A favor / En contra / Abstención. MetaMask pide solo una *firma* (no una transacción ni gas) — el voto queda registrado on-chain igual, pagado por el relayer. Se puede cambiar el voto las veces que se quiera antes del deadline.
5. **Seguir el estado** — cada card muestra el estado en vivo: Activa → Aprobada/Rechazada (al pasar el deadline, según el conteo de votos) → Ejecutada.
6. **Ejecución** — pasado el deadline más un período de seguridad, una propuesta "Aprobada" se puede ejecutar: automáticamente por el daemon (`npm run daemon`), o manualmente abriendo el panel "Ejecución de propuestas" y usando "Ejecutar ahora". Ese mismo panel tiene un log expandible de qué se ejecutó, cuándo, y si fue automático o manual.
7. **Guía integrada** — el card "¿Cómo funciona este DAO?" (contraído por defecto) repite estos pasos y muestra las restricciones reales (mínimo para votar, período de seguridad) leídas en vivo del contrato desplegado.

---

## Arquitectura

### Componentes

| Parte | Qué es |
|---|---|
| `sc/src/DAOVoting.sol` | El DAO: fondos, propuestas, votos, ejecución. |
| `sc/src/MinimalForwarder.sol` | Forwarder EIP-2771 — hace posible votar sin gas. |
| `web/` (Next.js 15 + ethers v6 + Tailwind) | Interfaz web. |
| `web/app/api/relay` | El relayer: recibe firmas y las manda on-chain pagando el gas. |
| `web/scripts/daemon.mjs` | Proceso Node aparte que ejecuta propuestas aprobadas automáticamente. |

### Flujo de un voto gasless

```
1. Usuario elige "A favor" en la UI
2. MetaMask firma un ForwardRequest (EIP-712) — NO envía transacción, no hay gas
3. El navegador manda {request, signature} a POST /api/relay
4. /api/relay valida (firma, que apunte al DAO, que sea vote()) y llama
   MinimalForwarder.execute(request, signature) firmando con la wallet
   del relayer — el relayer paga el gas de ESTA transacción
5. MinimalForwarder verifica la firma on-chain y llama a DAOVoting.vote(),
   anexando la dirección original del firmante al calldata
6. DAOVoting (ERC2771Context) reconoce esa dirección anexada como el
   verdadero remitente (_msgSender()) — el voto queda a nombre del
   usuario, no del relayer ni del forwarder
```

### Flujo de ejecución

`DAOVoting.executeProposal()` no tiene restricción de quién la llama — la puede invocar cualquiera una vez se cumplen las condiciones (deadline + período de seguridad pasados, más votos a favor que en contra). Dos caminos posibles, mismo resultado:

- **Automático**: `web/scripts/daemon.mjs` sondea el contrato cada `DAEMON_INTERVAL_SECONDS` y ejecuta lo que encuentra elegible, pagando el gas desde la wallet del relayer.
- **Manual**: cualquier miembro conectado hace clic en "Ejecutar ahora" en la UI — transacción normal, paga su propio gas.

El evento `ProposalExecuted` registra quién ejecutó cada propuesta, lo que le permite al frontend distinguir "automática" (dirección del relayer) de "manual" (cualquier otra) en el log de ejecuciones.

### Stack

- **Contratos**: Solidity 0.8.24, Foundry, OpenZeppelin Contracts (`ERC2771Context`, `EIP712`, `ECDSA`).
- **Frontend**: Next.js 15 (App Router), React, TypeScript, ethers.js v6, Tailwind CSS v4.
- **Backend del frontend**: dos API routes de Next.js (`/api/relay`, `/api/dev/advance-time`) corriendo en runtime Node.
- **Daemon**: script Node.js standalone, fuera del proceso de Next.js.
