# Arquitectura — DAO Gasless

Este documento detalla cómo está construido el sistema: el flujo completo de una meta-transacción (voto sin gas), la arquitectura de los contratos, el flujo de uso en el frontend, y el stack tecnológico usado en cada capa. Para instalación y comandos, ver [`README.md`](README.md).

## 1. Flujo de meta-transacciones

Votar no cuesta gas para el usuario porque no envía ninguna transacción: firma un mensaje off-chain (EIP-712) y un **relayer** (la API `/api/relay`, corriendo en el backend de Next.js) es quien efectivamente manda la transacción on-chain y paga el gas, a través del contrato `MinimalForwarder` (EIP-2771).

```mermaid
sequenceDiagram
    actor U as Usuario
    participant MM as MetaMask
    participant FE as Frontend (React)
    participant API as /api/relay (servidor)
    participant FWD as MinimalForwarder
    participant DAO as DAOVoting

    U->>FE: Click "A favor"
    FE->>FE: signVoteRequest() construye ForwardRequest<br/>{from, to, value, gas, nonce, data}
    FE->>FWD: getNonce(from)  [lectura, gratis]
    FWD-->>FE: nonce actual
    FE->>MM: eth_signTypedData_v4(domain, ForwardRequest)
    Note over MM,U: MetaMask pide FIRMAR, no una transacción.<br/>No se paga gas en este paso.
    U->>MM: Aprueba la firma
    MM-->>FE: signature

    FE->>API: POST /api/relay { request, signature }

    Note over API: Validaciones antes de gastar gas:<br/>1) forma del body<br/>2) request.to === DAO_ADDRESS<br/>3) selector de data === vote()
    API->>FWD: verify(request, signature)  [lectura, gratis]
    FWD-->>API: true / false

    alt firma inválida o reenvío repetido
        API-->>FE: 400 { success:false, error }
    else válida
        API->>FWD: execute(request, signature)  [TRANSACCIÓN — paga el relayer]
        FWD->>FWD: verify() de nuevo on-chain + nonces[from]++
        FWD->>DAO: call(data ++ from)  — calldata original<br/>con la dirección del firmante anexada al final
        DAO->>DAO: _msgSender() (ERC2771Context) lee<br/>los últimos 20 bytes del calldata → devuelve "from"
        DAO->>DAO: vote() registra el voto A NOMBRE de "from",<br/>no del relayer ni del forwarder
        DAO-->>FWD: emit VoteCast(proposalId, from, voteType)
        FWD-->>API: receipt (tx minada)
        API-->>FE: 200 { success:true, txHash }
    end

    FE-->>U: "Voto registrado sin gas (tx 0x...)"
```

**Puntos clave:**

- `MinimalForwarder.execute()` no restringe quién lo llama — cualquiera con un `(request, signature)` válido puede enviarlo. En este proyecto ese "cualquiera" es siempre `/api/relay`, pero el mismo mecanismo permitiría que el propio firmante enviara su request y pagara su gas, sin cambiar nada del contrato.
- El relayer (`/api/relay`) es deliberadamente **restringido**: solo reenvía llamadas dirigidas al contrato del DAO y cuyo selector sea `vote(uint256,uint8)` — no es un relayer abierto a cualquier llamada arbitraria.
- El `nonce` por firmante evita reenvíos (replay): una vez usado un `(request, signature)`, `MinimalForwarder` lo rechaza si se intenta de nuevo.

## 2. Arquitectura de contratos

```mermaid
classDiagram
    class ERC2771Context {
        <<OpenZeppelin>>
        -address _trustedForwarder
        +_msgSender() address
        +isTrustedForwarder(address) bool
    }
    class EIP712 {
        <<OpenZeppelin>>
        +_hashTypedDataV4(bytes32) bytes32
    }
    class ECDSA {
        <<OpenZeppelin (library)>>
        +recover(bytes32, bytes) address
    }

    class MinimalForwarder {
        -_nonces : mapping(address=>uint256)
        +getNonce(address) uint256
        +verify(ForwardRequest, bytes) bool
        +execute(ForwardRequest, bytes) (bool, bytes)
    }
    class DAOVoting {
        +uint256 minVoteBalance
        +uint256 executionDelay
        -_proposals : mapping(uint256=>Proposal)
        -_balances : mapping(address=>uint256)
        -_votes : mapping(uint256=>mapping)
        +fundDAO() payable
        +createProposal(recipient, amount, deadline, description)
        +vote(proposalId, voteType)
        +executeProposal(proposalId)
        +getProposal(proposalId) Proposal
        +getUserBalance(address) uint256
        +getUserVote(proposalId, address) VoteType
        +getTotalBalance() uint256
    }

    MinimalForwarder --|> EIP712 : hereda
    MinimalForwarder ..> ECDSA : usa (recover firma)
    DAOVoting --|> ERC2771Context : hereda
    DAOVoting ..> MinimalForwarder : confía en (dirección fija en el constructor)
```

`DAOVoting` no importa ni llama directamente a `MinimalForwarder` — la relación es de **confianza configurada**: al desplegar, se le pasa la dirección del forwarder al constructor (`ERC2771Context(trustedForwarder)`), y desde ese momento `DAOVoting` trata cualquier llamada que venga de esa dirección como un "reenvío", extrayendo el firmante real del calldata en vez de usar `msg.sender` directamente.

### Estados de una propuesta

El contrato no guarda un campo "estado" — se deriva de `deadline`, `executionDelay`, los contadores de voto y el flag `executed`:

```mermaid
stateDiagram-v2
    [*] --> Activa: createProposal()
    Activa --> Aprobada: pasó el deadline, votesFor > votesAgainst
    Activa --> Rechazada: pasó el deadline, votesFor <= votesAgainst
    Aprobada --> Ejecutada: executeProposal() (tras deadline + executionDelay)
    Rechazada --> [*]
    Ejecutada --> [*]
```

Mientras está "Activa", cada llamada a `vote()` puede cambiar el voto de un miembro (se descuenta el voto anterior y se aplica el nuevo). Una vez pasado el deadline, `vote()` deja de aceptar nuevos votos — el resultado (Aprobada/Rechazada) queda fijo, y solo falta que se cumpla `executionDelay` para poder ejecutar.

## 3. Flujo de usuario en frontend

```mermaid
flowchart TD
    A([Abrir la app]) --> B{Wallet conectada?}
    B -- No --> C["ConnectWallet:<br/>Conectar MetaMask"]
    C --> B
    B -- Sí --> D["Ver Saldo Personal DAO<br/>y Disponible DAO"]

    D --> E["FundingPanel:<br/>depositar ETH"]
    E -->|fundDAO tx| D

    D --> F{"Balance ≥ 10%<br/>del total?"}
    F -- Sí --> G["CreateProposal:<br/>crear propuesta"]
    F -- No --> H["Botón deshabilitado<br/>+ aviso"]
    G -->|createProposal tx| J

    J["ProposalList:<br/>ver todas las propuestas"]

    J --> K{"Propuesta Activa<br/>y balance ≥ mínimo?"}
    K -- Sí --> L["VoteButtons:<br/>firmar voto EIP-712"]
    K -- No --> M["Botones deshabilitados<br/>+ aviso"]
    L -->|"POST /api/relay, sin gas"| N["DaoContext.refresh<br/>actualiza toda la UI"]
    N --> J

    J --> O{"Propuesta Aprobada<br/>y ejecutable ya?"}
    O -- Sí --> P["ExecutionPanel:<br/>Ejecutar ahora"]
    O -- "Aprobada, aún en<br/>período de seguridad" --> Q["Countdown:<br/>'Disponible en Xs'"]
    P -->|executeProposal tx| N

    N -.->|"o automáticamente,<br/>en paralelo"| R[["daemon.mjs<br/>sondea cada N seg"]]
    R -->|"executeProposal tx<br/>si es elegible"| N
```

### Cómo se comparte el estado (contexts)

```mermaid
flowchart TB
    subgraph Providers["app/providers.tsx"]
        WP["WalletProvider<br/>(useMetaMask)"] --> DP["DaoProvider<br/>(contratos + estado del DAO)"]
    end

    DP --> UI["ConnectWallet · FundingPanel · CreateProposal<br/>ProposalList → ProposalCard → VoteButtons<br/>ExecutionPanel · HowItWorks"]

    DP -- "ethers.Contract<br/>(lecturas + fundDAO/createProposal/<br/>executeProposal directos)" --> DAOc[("DAOVoting.sol")]
    DP -- "fetch POST" --> RELAY["/api/relay"]
    RELAY -- "execute() tx" --> FWDc[("MinimalForwarder.sol")]
    FWDc -.-> DAOc
```

`WalletContext` expone la conexión MetaMask (dirección, signer, red). `DaoContext`, anidado dentro, arma las instancias de `Contract` (ethers) con ese signer, expone balances/propuestas/log de ejecución, y las acciones (`fundDAO`, `createProposal`, `voteGasless`, `executeProposalManually`). Todos los componentes leen y escriben a través de `useDao()`/`useWallet()` — ninguno llama a los contratos directamente.

## 4. Stack Tecnológico Detallado

### Contratos (`sc/`)

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| Lenguaje | Solidity | `^0.8.24` | Contratos `DAOVoting` y `MinimalForwarder` |
| Toolkit | [Foundry](https://book.getfoundry.sh/) (forge / cast / anvil) | forge 1.7.1 | Compilar, testear, desplegar, nodo local |
| Librerías | [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/) | 5.6.1 | `ERC2771Context`, `EIP712`, `ECDSA` |
| Testing | `forge-std` (`Test.sol`) | — | 28 tests (`DAOVoting.t.sol`, `MinimalForwarder.t.sol`) |
| Optimizador | solc optimizer | 200 runs | Configurado en `foundry.toml` |

### Frontend (`web/`)

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| Framework | [Next.js](https://nextjs.org/) (App Router) | 15.5.20 | Páginas, layout, API routes, build (Turbopack) |
| UI | React | 19.1.0 | Componentes de la interfaz |
| Lenguaje | TypeScript | `^5` | Tipado de contratos, props, estado |
| Web3 | [ethers.js](https://docs.ethers.org/v6/) | `^6.17.0` | `BrowserProvider`, firma EIP-712, llamadas a contratos |
| Estilos | Tailwind CSS | `^4` | Paleta, layout responsivo, componentes |
| Linting | ESLint + `eslint-config-next` | `^9` / 15.5.20 | Calidad de código |

### Backend del frontend / infraestructura

| Pieza | Tecnología | Propósito |
|---|---|---|
| Relayer | API Route de Next.js (`app/api/relay`), runtime `nodejs` | Valida y reenvía meta-transacciones, paga el gas con la wallet del relayer |
| Herramienta de demo | API Route (`app/api/dev/advance-time`) | Adelanta el reloj de Anvil (`evm_setNextBlockTimestamp`) — solo funciona en local |
| Daemon | Script Node.js standalone (`scripts/daemon.mjs`) | Sondea y ejecuta propuestas aprobadas automáticamente, fuera del proceso de Next.js |
| Nodo de desarrollo | Anvil (Foundry) | Blockchain local para desarrollo y pruebas (chain id `31337`) |
| Wallet | MetaMask (extensión) | Firma de meta-transacciones y transacciones normales |
