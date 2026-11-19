# Verity Academic Registry

Verity is a local university certificate registry. Authorized administrators issue and revoke academic records through MetaMask. Anyone with a record ID can look up the certificate and its current status without connecting a wallet.

## Run locally

Use Node.js 22.13 or higher on a supported even-numbered release. Development was verified with Node.js 24.14 and npm 11.9. Each project has its own dependency lockfile.

```powershell
npm --prefix contracts ci
npm --prefix frontend ci
```

In three terminals rooted at this repository, start the RPC node, deploy the contract, then start the web app.

```powershell
npm --prefix contracts run node
```

```powershell
npm --prefix contracts run deploy:local
```

```powershell
npm --prefix frontend run dev
```

Open [http://localhost:5173](http://localhost:5173). The deployment script deploys a fresh registry and exports its address and compiled ABI into `frontend/src/config/`. The first deployment to a fresh default Hardhat node is at `0x5fbdb2315678afecb367f032d93f642f64180aa3`. Use the address printed by your deployment command if it differs. A node restart clears its state. Redeploy after restarting. A second deployment on a running node creates a separate registry with its own records.

The frontend defaults to RPC `http://127.0.0.1:8545` and chain ID `31337`. Copy `frontend/.env.example` to `frontend/.env.local` to change the frontend RPC endpoint or batch size, then restart Vite. The deployment command targets the default local Hardhat endpoint.

## Connect MetaMask

1. Open MetaMask in the same desktop browser as the app. Use a separate wallet or browser profile for local development.
2. Add a network named **Hardhat Local** with RPC `http://127.0.0.1:8545`, chain ID **31337**, and currency symbol **ETH**. Leave the block explorer field blank. The portal can request the network switch or addition from MetaMask.
3. In MetaMask, import the private key for **account #0** from your running Hardhat node terminal. This is the account that deploys the registry and becomes its owner. Hardhat development keys are publicly known. Use them only for the local demo and keep keys out of source files.
4. Open **Administrator portal**, select **Connect MetaMask**, approve the connection, and select account #0 on Hardhat Local.
5. To demonstrate administrator access, use an unused Hardhat account. It initially gets **Access denied**. From the owner wallet, open **Administration** and grant that wallet access. It can then issue and revoke certificates. Only the owner can change administrator access.

If MetaMask reports a stale nonce after a node restart, use its account activity and nonce reset option for the local development wallet, or use a clean local profile.

## Demonstrate the application

- **Issue certificate** accepts the student's name and ID, diploma title, issue date, grade from 0 to 20, and an optional Ethereum recipient address. Review the details before approving the transaction. The app displays the confirmed transaction hash and registry ID.
- **Bulk import** accepts `.xlsx`, `.xls`, and `.csv`. Choose or drop the [sample workbook](frontend/public/sample-certificates.xlsx), review the records, adjust the selection, and approve each batch. The sample contains fictional names and a Hardhat development address. Download a CSV report for row errors and issued IDs.
- **Public verification** reads the ID from the certificate confirmation. It shows the recorded details and a **Valid**, **Revoked**, or **Certificate not found** result. RPC failures have their own message.
- **Manage certificates** lists the newest issued records first, supports lookup by ID, and asks for confirmation before revoking. The revoked certificate remains readable by its original ID.
- **Administration** lists authorized wallets and supports confirmed grants and removals. It is available to the contract owner.

### Spreadsheet format

Put the headings in the first row of the first worksheet. Column order can vary.

| Column | Example | Interpretation |
| --- | --- | --- |
| `studentName` | Maya El Idrissi | Full name |
| `studentId` | DEMO-001 | University identifier, preferably stored as text to preserve leading zeroes |
| `diplomaTitle` | Bachelor of Computer Science | Academic award |
| `issueDate` | 2026-06-15 | ISO text or an Excel date cell |
| `grade` | 16.50 | Numeric grade with up to two decimals |
| `recipientAddress` | 0x… | Optional Ethereum address |

SheetJS parses the first worksheet in the browser. The importer validates headers, dates, grades, addresses and text lengths, and checks duplicate student and diploma pairs in the file and on-chain. All rows in an in-file duplicate group are flagged so the operator can resolve the ambiguity in the source. Files are limited to 500 data rows and 2 MB. The selected rows are sent in batches of 10 by default, with a configurable range of 1 to 50. A failed or unconfirmed batch stops the queue. Previously confirmed batches and their IDs remain visible, and later batches stay pending for operator review.

## Architecture and data model

```text
contracts/
  contracts/CertificateRegistry.sol        registry contract
  ignition/modules/CertificateRegistry.ts  declarative deployment module
  scripts/                                 local deployment and frontend export
  test/                                    Hardhat + Viem contract tests
  hardhat.config.ts                        local V3 network and compiler
frontend/
  public/                                  sample workbook and app icon
  src/components/                          shared display and confirmation UI
  src/config/                              chain, ABI and deployment address
  src/hooks/                               registry read hooks
  src/layouts/                             wallet and administrator gate
  src/pages/                               public and administrator screens
  src/services/                            transaction simulation and receipts
  src/utils/                               validation and SheetJS import
docs/                                      local issuance evidence
```

React uses wagmi and TanStack Query for wallet state and reads. Viem reads from the local RPC directly and decodes confirmed receipt events. MetaMask handles signing. The contract is the source of truth for roles and records. The frontend uses wallet addresses as identities and checks the allowlist on the configured chain. Solidity checks permissions again on every write.

Each certificate is stored under a sequential numeric ID starting at 1. It contains the student name and university ID, diploma title, Unix issue time in seconds, grade in hundredths, recipient address, and revocation flag. For example, 16.50 is stored as 1650. Blank recipient fields use the zero address. The issuer's wallet signs the transaction separately.

| Contract operation | Behavior |
| --- | --- |
| `mintCertificate` | Checks admin permission and validates and issues one certificate. Returns the ID and emits `CertificateMinted`. |
| `batchMint` | Validates matching arrays, rejects empty and oversized batches, and issues an atomic batch with one event per ID. |
| `getCertificate` / `certificates` | Public reads. The explicit getter rejects IDs that do not exist. |
| `isCertificateIssued` | Checks whether a student and diploma pair has an active certificate. |
| `nextCertId` / `totalCertificates` | Report the next ID and the total issued, including revoked records. |
| `revokeCertificate` | Changes the status once and emits `CertificateRevoked`. |
| `isAdmin` / `admins` / `getAdmins` | Read the active administrator list. |
| `owner` / `addAdmin` / `removeAdmin` | The deployer is the permanent owner and initial administrator. Only the owner can grant or remove access, and the owner cannot be removed. Role changes emit events. |

The duplicate key hashes the exact student ID and diploma title together. The browser trims surrounding whitespace and comparisons are case-sensitive. A student can earn different diplomas. Revocation makes the exact pair eligible for corrected reissue with a new ID. Each old record retains its data and revoked status.

## Checks

```powershell
npm --prefix contracts test
npm --prefix contracts run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Hardhat runs the Node test suite with the Viem toolbox. Tests cover owner and administrator issuance, transaction events, input constraints, duplicate handling, batch rollback, public lookup, revocation, and administrator changes.

With the local node, deployment, and web app running, install Playwright's browser and run the browser checks. They use an injected test wallet and real local transactions. The run creates fictional records and makes temporary changes to the local administrator list.

```powershell
cd frontend
npx playwright install chromium
npm run test:browser
```

Use the default batch size of 10 for this test. Set `VERITY_TEST_URL` to target a different local Vite port. The [confirmed mint screenshot](docs/successful-mint.png) shows an issuance captured from the running browser.

The delivered build passed the contract suite, TypeScript checks, frontend lint, and the browser test against the production Vite preview. The browser test covered owner access, denied access, network switching, single issuance, public lookup, revocation, administrator changes, XLSX and XLS parsing, CSV validation, and a partial batch failure. It used an injected wallet backed by Hardhat's local development accounts. Signing through the MetaMask browser extension remains a manual check.

### Installed dependencies

| Project | Direct dependencies in the lockfiles |
| --- | --- |
| Contract development | Hardhat 3.22.0, Hardhat Viem Toolbox 5.0.7, Hardhat Ignition 3.1.10, Viem 2.58.1, TypeScript 6.0.3, Node types 22.20.5 |
| Frontend application | React and React DOM 19.3.1, React Router DOM 7.18.6, wagmi 3.7.11, Viem 2.58.1, TanStack React Query 5.108.1, SheetJS 0.20.3, Lucide React 1.76.0 |
| Frontend development | Vite 8.3.8, Vite React plugin 6.3.0, TypeScript 7.0.2, Playwright 1.65.1, Oxlint 1.94.0, Node types 24.19.2, React and React DOM types 19.3.0 |

Run `npm --prefix contracts ls --depth=0` and `npm --prefix frontend ls --depth=0` to list the installed versions.

## Local scope and limitations

This is an educational local-chain deployment. Use fictional student data because stored fields are publicly readable and revocation leaves the data intact. Outside the local environment, a future design could store a commitment rather than personal fields, use a governed owner account, and support an indexed history service and persistent network. The local node has no bundled block explorer, so the UI displays transaction hashes. Recent activity scans the most recent 5,000 blocks. Public lookups require access to the configured RPC endpoint from the verifier's browser.

The contract development tooling currently resolves Zod 3 through Hardhat 3 and several plugins. npm audit reports a Zod advisory in that toolchain. The browser uses a separate dependency tree.

