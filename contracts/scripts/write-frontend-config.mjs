import { mkdir, readFile, writeFile } from "node:fs/promises";

const artifactUrl = new URL("../artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json", import.meta.url);
const configUrl = new URL("../../frontend/src/config/", import.meta.url);

export async function writeFrontendConfig(address) {
  const { abi } = JSON.parse(await readFile(artifactUrl, "utf8"));
  await mkdir(configUrl, { recursive: true });
  await Promise.all([
    writeFile(new URL("deployment.json", configUrl), JSON.stringify({ chainId: 31337, address }, null, 2) + "\n"),
    writeFile(
      new URL("certificateAbi.ts", configUrl),
      "// Generated from the Solidity compiler artifact.\nexport const registryAbi = " +
        JSON.stringify(abi, null, 2) + " as const;\n",
    ),
  ]);
  console.log("Frontend contract address:", address);
}

