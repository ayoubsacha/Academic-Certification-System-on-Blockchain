import { defineChain } from "viem";
import { createConfig, http, injected } from "wagmi";
export { registryAbi } from "./certificateAbi";
import deployment from "./deployment.json";

export const LOCAL_CHAIN_ID = deployment.chainId;
export const LOCAL_RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const requestedBatchSize = Number(import.meta.env.VITE_BATCH_SIZE ?? 10);
export const BATCH_SIZE = Number.isInteger(requestedBatchSize) && requestedBatchSize >= 1 && requestedBatchSize <= 50
  ? requestedBatchSize
  : 10;
export const LOCAL_CHAIN = defineChain({
  id: LOCAL_CHAIN_ID,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [LOCAL_RPC_URL] } },
  testnet: true,
});

export const registryAddress = deployment.address as `0x${string}`;
export const isRegistryConfigured =
  registryAddress !== "0x0000000000000000000000000000000000000000";

export const wagmiConfig = createConfig({
  chains: [LOCAL_CHAIN],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false,
  transports: { [LOCAL_CHAIN_ID]: http(LOCAL_RPC_URL) },
});
