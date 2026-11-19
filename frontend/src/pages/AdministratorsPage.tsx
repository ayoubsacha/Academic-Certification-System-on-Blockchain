import { useState } from "react";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { Address } from "viem";
import { ShieldPlus, UserMinus } from "lucide-react";
import { Navigate, useOutletContext } from "react-router-dom";
import type { AdminContext } from "../layouts/AdminLayout";
import { useAdminList } from "../hooks/useRegistryRead";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Feedback, PageHeading } from "../components/AdminUi";
import { describeError, useRegistryActions } from "../services/registry";

export function AdministratorsPage() {
  const { address, isOwner } = useOutletContext<AdminContext>();
  const admins = useAdminList(isOwner);
  const [wallet, setWallet] = useState("");
  const [review, setReview] = useState<{ kind: "add" | "remove"; account: Address }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState("");
  const actions = useRegistryActions();

  if (!isOwner) return <Navigate to="/admin" replace />;

  async function changeAccess() {
    if (!review || busy) return;
    setBusy(true); setFailure(""); setResult("");
    try {
      const response = review.kind === "add" ? await actions.addAdmin(review.account) : await actions.removeAdmin(review.account);
      setResult(`Administrator access ${review.kind === "add" ? "granted" : "removed"}. Transaction ${response.hash}`);
      if (review.kind === "add") setWallet("");
    } catch (error) { setFailure(describeError(error)); }
    finally { setReview(undefined); setBusy(false); }
  }

  return <>
    <PageHeading label="OWNER SETTINGS" title="Administration" description="Manage the wallets allowed to issue and revoke university certificates." />
    {result && <Feedback><span className="break-text">{result}</span></Feedback>}
    {failure && <Feedback error>{failure}</Feedback>}
    <form className="panel" onSubmit={event => {
      event.preventDefault();
      const account = wallet.trim();
      if (!isAddress(account) || account.toLowerCase() === zeroAddress) { setFailure("Enter a valid wallet address."); return; }
      setFailure(""); setReview({ kind: "add", account: getAddress(account) });
    }}>
      <div className="panel-heading"><h2>Grant access</h2></div>
      <div className="manage-search"><div className="field"><label htmlFor="new-admin">Wallet address</label><input id="new-admin" placeholder="0x…" value={wallet} onChange={event => setWallet(event.target.value)} /></div>
        <button className="button button-primary" type="submit"><ShieldPlus size={16} /> Add administrator</button></div>
    </form>
    <section className="panel"><div className="panel-heading"><h2>Authorized wallets</h2></div>
      {admins.isPending && <p className="panel-state">Loading wallets…</p>}
      {admins.isError && <Feedback error>{describeError(admins.error)}</Feedback>}
      {admins.data && <ul className="record-list admin-wallet-list">{admins.data.map(account => {
        const owner = account.toLowerCase() === address.toLowerCase();
        return <li key={account}><div><strong className="mono break-text">{account}</strong><small>{owner ? "Contract owner" : "Administrator"}</small></div>
          {!owner && <button className="button button-secondary" type="button" onClick={() => setReview({ kind: "remove", account })}><UserMinus size={16} /> Remove</button>}</li>;
      })}</ul>}
    </section>
    {review && <ConfirmDialog title={review.kind === "add" ? "Grant administrator access?" : "Remove administrator access?"} confirmLabel={review.kind === "add" ? "Grant access" : "Remove access"}
      tone={review.kind === "remove" ? "danger" : "primary"} busy={busy} onCancel={() => setReview(undefined)} onConfirm={() => void changeAccess()}>
      <p className="mono break-text">{review.account}</p><p>{review.kind === "add" ? "This wallet will be able to issue and revoke certificates." : "This wallet will lose permission to issue and revoke certificates."}</p>
    </ConfirmDialog>}
  </>;
}

