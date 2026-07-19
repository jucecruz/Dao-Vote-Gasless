# DAO Gasless — Frontend

Next.js 15 + ethers v6. Conecta con MetaMask, financia el DAO, crea propuestas y vota sin gas vía meta-transacciones EIP-2771 reenviadas por `/api/relay`. Las propuestas aprobadas se ejecutan automáticamente con `npm run daemon`, o manualmente desde la UI.

## Funcionalidad

- **Conexión con MetaMask**, con detección de red incorrecta y actualización automática al cambiar de cuenta.
- **Financiación**: depositar ETH, ver tu saldo personal y el disponible del DAO.
- **Crear propuestas**: beneficiario, monto, deadline y descripción (validado en el contrato: ≥10% del balance del DAO para poder proponer).
- **Votación gasless**: A favor / En contra / Abstención, sin pagar gas ni confirmar una transacción — solo firmas, un relayer envía la meta-transacción por ti.
- **Ejecución**: automática (daemon) o manual desde el panel de "Ejecución de propuestas", con un log de qué se ejecutó, cuándo y por quién (automático vs. manual).
- **Guía integrada** ("¿Cómo funciona este DAO?") con los pasos y restricciones reales del contrato desplegado.

## Estructura

```
web/
  app/
    page.tsx                    (dashboard)
    providers.tsx                (Wallet + DAO context providers)
    api/relay/route.ts           (relayer: reenvía votos gasless)
    api/dev/advance-time/route.ts (solo demo: adelanta el reloj de Anvil)
  components/                    (UI: ConnectWallet, FundingPanel, CreateProposal,
                                   ProposalList/Card, VoteButtons, ExecutionPanel, HowItWorks, icons)
  context/
    WalletContext.tsx             (conexión MetaMask)
    DaoContext.tsx                 (lecturas/escrituras del contrato, estado global)
  hooks/
    useMetaMask.ts / useTxStatus.ts
  lib/
    config.ts, format.ts, metaTx.ts, errors.ts, abi/*.json
  scripts/
    daemon.mjs                     (ejecución automática, proceso aparte)
```

## Setup

1. Compila y despliega los contratos (desde `../sc`, ver [`../sc/README.md`](../sc/README.md)):

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

   Rellena `NEXT_PUBLIC_DAO_ADDRESS` y `NEXT_PUBLIC_FORWARDER_ADDRESS` con las direcciones del paso 1. `RELAYER_PRIVATE_KEY`/`RELAYER_ADDRESS`/`NEXT_PUBLIC_RELAYER_ADDRESS` pueden ser cualquier cuenta de Anvil (por ejemplo la cuenta #1) — es la que paga el gas de los votos gasless y de la ejecución automática de propuestas (las dos primeras variables no deben ir en el navegador; `NEXT_PUBLIC_RELAYER_ADDRESS` es la misma dirección, solo que pública, usada para etiquetar el log de ejecuciones como "automática" o "manual").

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
- `/api/dev/advance-time` es **solo para desarrollo/demo local**: adelanta el reloj de Anvil para no tener que esperar en tiempo real el deadline + período de seguridad de una propuesta. No funciona (ni tiene sentido usarlo) contra una red real.
- Cada vez que se reinicia Anvil (nueva cadena), MetaMask suele quedar con caché vieja de esa red — si algo empieza a fallar con errores raros de RPC tras un redeploy, elimina y vuelve a agregar la red en MetaMask.
