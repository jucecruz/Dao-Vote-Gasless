# DAO Gasless — Contratos

Contratos Solidity (Foundry) del DAO: financiación, creación de propuestas, votación (normal y gasless vía meta-transacciones EIP-2771) y ejecución.

## Contratos

- **`src/DAOVoting.sol`** — el DAO en sí. Los miembros depositan ETH (`fundDAO`), lo que define su poder de voto; con ≥10% del balance total pueden crear propuestas (`createProposal`, con descripción); cualquier miembro con el balance mínimo puede votar (`vote`, cambiable antes del deadline); cualquiera puede ejecutar una propuesta aprobada (`executeProposal`) una vez pasado el deadline + un período de seguridad adicional.
- **`src/MinimalForwarder.sol`** — forwarder EIP-2771 genérico que hace posible votar sin pagar gas: valida una firma EIP-712 off-chain y ejecuta la llamada en nombre del firmante, sin importar quién pague el gas de esa transacción.

Ambos están comentados en detalle (NatSpec) explicando el diseño — balance histórico vs. pool disponible, el flujo completo de meta-transacciones, checks-effects-interactions, etc.

## Estructura

```
sc/
  src/
    DAOVoting.sol
    MinimalForwarder.sol
  test/
    DAOVoting.t.sol          (20 tests)
    MinimalForwarder.t.sol   (8 tests)
  script/
    DeployLocal.s.sol        (para Anvil)
    DeployTestnet.s.sol      (para una red real)
  foundry.toml
```

## Uso

### Instalar dependencias

```shell
forge install
```

### Compilar

```shell
forge build
```

### Tests

```shell
forge test
forge test --gas-report   # con costos de gas por función
```

### Desplegar en local (Anvil)

```shell
anvil                     # en otra terminal, déjalo corriendo
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Sin configurar nada más, usa la cuenta #0 de Anvil como deployer y valores por defecto (`minVoteBalance = 0.01 ether`, `executionDelay = 1 hour`). Se pueden sobreescribir con variables de entorno:

```shell
PRIVATE_KEY=0x...          # deployer (opcional; default = cuenta #0 de Anvil)
MIN_VOTE_BALANCE=...       # en wei (opcional; default 0.01 ether)
EXECUTION_DELAY=...        # en segundos (opcional; default 3600)
```

### Desplegar en testnet

```shell
PRIVATE_KEY=0x... RPC_URL=https://... forge script script/DeployTestnet.s.sol --rpc-url $RPC_URL --broadcast --verify
```

`PRIVATE_KEY` es obligatoria aquí (a propósito, sin fallback a una clave conocida). `MIN_VOTE_BALANCE`/`EXECUTION_DELAY` son opcionales (mismo default que local, salvo `EXECUTION_DELAY` que por defecto es 1 día).

### Formato / gas snapshots

```shell
forge fmt
forge snapshot
```

## Siguiente paso

Las direcciones que imprime el deploy (`MinimalForwarder`, `DAOVoting`) son las que necesita el frontend — ver [`../web/README.md`](../web/README.md).
