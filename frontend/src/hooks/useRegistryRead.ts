import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { isRegistryConfigured, LOCAL_CHAIN_ID, registryAbi, registryAddress } from "../config/blockchain";
import { parseCertificateId } from "../utils/certificates";

const registry = { address: registryAddress, abi: registryAbi } as const;
const params = { ...registry, chainId: LOCAL_CHAIN_ID } as const;

export function useAdminStatus(address?: Address) {
  return useReadContract({ ...params, functionName: "isAdmin", args: address ? [address] : undefined,
    query: { enabled: isRegistryConfigured && Boolean(address), retry: false, refetchInterval: 10_000 } });
}

export function useRegistryOwner() {
  return useReadContract({ ...params, functionName: "owner", query: { enabled: isRegistryConfigured, retry: false } });
}

export function useCertificateCount() {
  return useReadContract({ ...params, functionName: "totalCertificates",
    query: { enabled: isRegistryConfigured, retry: false, refetchInterval: 15_000 } });
}

export function useCertificate(certificateId?: bigint) {
  const query = useReadContract({ ...params, functionName: "getCertificate",
    args: certificateId ? [certificateId] : undefined,
    query: { enabled: isRegistryConfigured && Boolean(certificateId), retry: false } });
  return {
    ...query,
    refetchIfCurrent(input: string) {
      if (certificateId && parseCertificateId(input) === certificateId) return query.refetch();
    },
  };
}

export function useAdminList(enabled: boolean) {
  return useReadContract({ ...params, functionName: "getAdmins", query: { enabled: isRegistryConfigured && enabled, retry: false } });
}

export function useCertificatePage(total: bigint, page: number, size: number) {
  const client = usePublicClient({ chainId: LOCAL_CHAIN_ID });
  return useQuery({
    queryKey: ["registry", "page", registryAddress, total.toString(), page, size],
    enabled: isRegistryConfigured && Boolean(client) && total > 0n,
    retry: false,
    queryFn: async () => {
      const newest = total - BigInt(page * size);
      const length = newest > BigInt(size) ? size : Math.max(0, Number(newest));
      return Promise.all(Array.from({ length }, async (_, index) => {
        const id = newest - BigInt(index);
        return { id, certificate: await client!.readContract({ ...registry, functionName: "getCertificate", args: [id] }) };
      }));
    },
  });
}

export function useCertificateActivity() {
  const client = usePublicClient({ chainId: LOCAL_CHAIN_ID });
  return useQuery({
    queryKey: ["registry", "activity", registryAddress],
    enabled: isRegistryConfigured && Boolean(client),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const latest = await client!.getBlockNumber();
      const fromBlock = latest > 5000n ? latest - 5000n : 0n;
      const [minted, revoked] = await Promise.all([
        client!.getContractEvents({ ...registry, eventName: "CertificateMinted", fromBlock, strict: true }),
        client!.getContractEvents({ ...registry, eventName: "CertificateRevoked", fromBlock, strict: true }),
      ]);
      return [
        ...minted.map(log => ({ kind: "issued", studentId: log.args.studentId, log })),
        ...revoked.map(log => ({ kind: "revoked", studentId: undefined, log })),
      ].sort((a, b) => Number(b.log.blockNumber - a.log.blockNumber) || b.log.logIndex - a.log.logIndex)
        .slice(0, 6).map(({ kind, studentId, log }) => ({
          kind, studentId, certificateId: log.args.certId, blockNumber: log.blockNumber,
          key: `${log.transactionHash}:${log.logIndex}`,
        }));
    },
  });
}

