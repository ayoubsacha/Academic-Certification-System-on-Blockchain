import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, parseEventLogs, UserRejectedRequestError } from "viem";
import type { Abi, Address, Hex } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { isRegistryConfigured, LOCAL_CHAIN_ID, registryAbi, registryAddress } from "../config/blockchain";
import type { CertificateInput } from "../types/certificate";

const registry: { address: Address; abi: Abi } = { address: registryAddress, abi: registryAbi };
type Operation =
  | { functionName: "mintCertificate"; args: readonly [string, string, string, bigint, bigint, Address] }
  | { functionName: "batchMint"; args: readonly [string[], string[], string[], bigint[], bigint[], Address[]] }
  | { functionName: "revokeCertificate"; args: readonly [bigint] }
  | { functionName: "addAdmin" | "removeAdmin"; args: readonly [Address] };

function revertReason(error: unknown) {
  if (error instanceof BaseError) {
    const revert = error.walk(cause => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.reason;
  }
}

export function isMissingCertificate(error: unknown) {
  return revertReason(error) === "Certificate not found";
}

export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk(cause => cause instanceof UserRejectedRequestError) instanceof UserRejectedRequestError) {
      return "The wallet request was rejected.";
    }
    return revertReason(error) || error.shortMessage;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function useRegistryActions() {
  const client = usePublicClient({ chainId: LOCAL_CHAIN_ID });
  const { address, connector, chainId } = useConnection();
  const { mutateAsync } = useWriteContract();
  const queryClient = useQueryClient();

  async function execute(operation: Operation) {
    if (!client || !isRegistryConfigured) throw new Error("The local registry is unavailable.");
    if (!address || !connector || chainId !== LOCAL_CHAIN_ID) throw new Error("Connect an authorized wallet on Hardhat Local.");
    await client.simulateContract({ ...registry, ...operation, account: address });
    const hash = await mutateAsync({ ...registry, ...operation, chainId: LOCAL_CHAIN_ID, account: address, connector });
    let replacementReason: string | undefined;
    let replacementHash: Hex | undefined;
    const receipt = await client.waitForTransactionReceipt({
      hash, timeout: 90_000,
      onReplaced: replacement => { replacementReason = replacement.reason; replacementHash = replacement.transaction.hash; },
    }).catch(() => {
      throw new Error(`Confirmation is unknown for transaction ${replacementHash ?? hash}. Check the wallet before retrying.`);
    });
    if (replacementReason && replacementReason !== "repriced") {
      throw new Error(`Transaction ${hash} was replaced in the wallet. Replacement: ${receipt.transactionHash}.`);
    }
    if (receipt.status !== "success") throw new Error(`Transaction ${receipt.transactionHash} reverted.`);
    const ids = parseEventLogs({
      abi: registryAbi, eventName: "CertificateMinted", strict: true,
      logs: receipt.logs.filter(log => log.address.toLowerCase() === registryAddress.toLowerCase()),
    }).map(log => log.args.certId);

    void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === "readContract" || query.queryKey[0] === "registry" });
    return { hash: receipt.transactionHash, ids };
  }

  return {
    mintCertificate: (certificate: CertificateInput) => execute({ functionName: "mintCertificate", args: [
      certificate.studentName, certificate.studentId, certificate.diplomaTitle, certificate.issueDate, certificate.grade, certificate.recipient,
    ] }),
    batchMint: (records: CertificateInput[]) => execute({ functionName: "batchMint", args: [
      records.map(record => record.studentName), records.map(record => record.studentId), records.map(record => record.diplomaTitle),
      records.map(record => record.issueDate), records.map(record => record.grade), records.map(record => record.recipient),
    ] }),
    revokeCertificate: (id: bigint) => execute({ functionName: "revokeCertificate", args: [id] }),
    addAdmin: (account: Address) => execute({ functionName: "addAdmin", args: [account] }),
    removeAdmin: (account: Address) => execute({ functionName: "removeAdmin", args: [account] }),
  };
}

