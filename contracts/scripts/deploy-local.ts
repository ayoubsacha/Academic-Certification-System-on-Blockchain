import { network } from "hardhat";
import { writeFrontendConfig } from "./write-frontend-config.mjs";

const { viem } = await network.create({ network: "localhost" });
const client = await viem.getPublicClient();
if (await client.getChainId() !== 31337) throw new Error("Expected local Hardhat chain 31337.");
const registry = await viem.deployContract("CertificateRegistry");
await writeFrontendConfig(registry.address);
console.log("Registry owner:", await registry.read.owner());

