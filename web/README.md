# DAO Gasless — Frontend

Next.js 15 + ethers v6. Conecta con MetaMask, financia el DAO, crea propuestas y vota sin gas vía meta-transacciones EIP-2771 reenviadas por `/api/relay`. Las propuestas aprobadas se ejecutan automáticamente con `npm run daemon`.

## Setup

1. Compila y despliega los contratos (desde `../sc`):

   ```bash
   cd ../sc
   anvil                     # en una terminal aparte, déjalo corriendo
   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   ```

   Copia las direcciones de `MinimalForwarder` y `DAOVoting` que imprime el script.

2. Configura el entorno:

   ```bash
   cp .env.local.example .env.local
   ```

   Rellena `NEXT_PUBLIC_DAO_ADDRESS` y `NEXT_PUBLIC_FORWARDER_ADDRESS` con las direcciones del paso 1. `RELAYER_PRIVATE_KEY`/`RELAYER_ADDRESS` pueden ser cualquier cuenta de Anvil (por ejemplo la cuenta #1) — es la que paga el gas de los votos gasless y de la ejecución automática de propuestas.

3. Instala dependencias (si no lo hiciste ya) y arranca la app:

   ```bash
   npm install
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000), conecta MetaMask a la red de Anvil (chainId `31337`, RPC `http://127.0.0.1:8545`) usando una cuenta importada desde las private keys que imprime `anvil`.

4. En otra terminal, arranca el daemon que ejecuta automáticamente las propuestas aprobadas:

   ```bash
   npm run daemon
   ```

## Notas

- Los ABIs en `lib/abi/*.json` se extraen de `../sc/out/*.sol/*.json` tras `forge build`; si cambias los contratos, regenera esos JSON.
- `/api/relay` solo reenvía meta-transacciones dirigidas al DAO cuyo selector sea `vote(uint256,uint8)` — no es un relayer abierto.
