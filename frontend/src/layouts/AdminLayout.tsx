import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  FilePlus2,
  Files,
  LayoutDashboard,
  LogOut,
  Network,
  ShieldCheck,
  ShieldEllipsis,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useConnection, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { BrandMark } from "../components/SiteHeader";
import { isRegistryConfigured, LOCAL_CHAIN_ID } from "../config/blockchain";
import { useAdminStatus, useRegistryOwner } from "../hooks/useRegistryRead";
import { shortAddress } from "../utils/certificates";
import type { Address } from "viem";
import { describeError } from "../services/registry";

export type AdminContext = { address: Address; isOwner: boolean };

const adminNavigation = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/issue", label: "Issue certificate", icon: FilePlus2 },
  { to: "/admin/import", label: "Bulk import", icon: Files },
  { to: "/admin/manage", label: "Manage certificates", icon: BookOpenCheck },
];

export function AdminLayout() {
  const { address, chainId, isConnected, isReconnecting } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain, isPending: isSwitching } = useSwitchChain();
  const admin = useAdminStatus(chainId === LOCAL_CHAIN_ID ? address : undefined);
  const owner = useRegistryOwner();
  const [networkError, setNetworkError] = useState("");

  const isLocalNetwork = chainId === LOCAL_CHAIN_ID;
  const isAdmin = admin.data === true;
  const isOwner = Boolean(address && owner.data && String(owner.data).toLowerCase() === address.toLowerCase());

  async function handleNetworkSwitch() {
    setNetworkError("");
    try {
      await switchChain({ chainId: LOCAL_CHAIN_ID });
    } catch (error) {
      setNetworkError(describeError(error));
    }
  }

  if (!isRegistryConfigured) {
    return (
      <div className="setup-page">
        <BrandMark />
        <div className="setup-card">
          <span className="setup-card-icon"><Network size={24} /></span>
          <p className="eyebrow">LOCAL REGISTRY REQUIRED</p>
          <h1>Deploy the certificate registry</h1>
          <p>Start a local Hardhat node and deploy the contract to enable verification and administration.</p>
          <pre><code>cd contracts{`\n`}npm run node</code></pre>
          <pre><code>cd contracts{`\n`}npm run deploy:local</code></pre>
          <Link className="button button-secondary" to="/"><ArrowLeft size={16} /> Return to verification</Link>
        </div>
      </div>
    );
  }

  if (isReconnecting) return <div className="admin-loading"><span className="spinner" /> Reconnecting wallet…</div>;

  if (!isConnected || !address) {
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark /><Link to="/" className="back-link"><ArrowLeft size={15} /> Public verification</Link></div>
        <div className="connect-card">
          <span className="connect-card-symbol"><Wallet size={25} /></span>
          <p className="eyebrow">SECURE ADMIN ACCESS</p>
          <h1>Connect your university wallet</h1>
          <p>Connect an authorized MetaMask wallet to manage certificates. Wallet connection alone does not grant access.</p>
          <button
            className="button button-primary connect-wallet-button"
            type="button"
            disabled={isConnecting || connectors.length === 0}
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            <Wallet size={17} /> {isConnecting ? "Connecting wallet…" : "Connect MetaMask"}
          </button>
          {connectors.length === 0 ? <p className="field-error">Install MetaMask to continue.</p> : null}
          {connectError && <p className="field-error" role="alert">{describeError(connectError)}</p>}
          <div className="connect-note"><ShieldCheck size={15} /> Your wallet address is checked against the on-chain administrator list.</div>
        </div>
      </div>
    );
  }

  if (!isLocalNetwork) {
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark /><button className="back-link button-reset" onClick={() => disconnect()}><LogOut size={15} /> Disconnect</button></div>
        <div className="connect-card">
          <span className="connect-card-symbol warning-symbol"><Network size={25} /></span>
          <p className="eyebrow">NETWORK CHECK</p>
          <h1>Switch to Hardhat Local</h1>
          <p>This application is configured for the local development chain (chain ID {LOCAL_CHAIN_ID}). The connected account is <b>{shortAddress(address ?? "")}</b>.</p>
          {networkError ? <p className="field-error">{networkError}</p> : null}
          <button className="button button-primary connect-wallet-button" type="button" onClick={handleNetworkSwitch} disabled={isSwitching}><Network size={17} /> {isSwitching ? "Waiting for wallet…" : "Add or switch network"}</button>
        </div>
      </div>
    );
  }

  if (admin.isLoading) {
    return <div className="admin-loading"><span className="spinner" /> Checking on-chain administrator status…</div>;
  }

  if (admin.isError) {
    return <div className="connect-page"><div className="connect-top"><BrandMark /><Link to="/" className="back-link"><ArrowLeft size={15} /> Public verification</Link></div>
      <div className="connect-card"><h1>Registry unavailable</h1><p>Start the local Hardhat node and deploy the registry before connecting.</p>
        <button className="button button-primary" onClick={() => void admin.refetch()}>Try again</button></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark /><button className="back-link button-reset" onClick={() => disconnect()}><LogOut size={15} /> Disconnect</button></div>
        <div className="connect-card denied-card">
          <span className="connect-card-symbol denied-symbol"><ShieldEllipsis size={25} /></span>
          <p className="eyebrow">ACCESS DENIED</p>
          <h1>This wallet is not an administrator</h1>
          <p>Connected wallet <b>{shortAddress(address ?? "")}</b> is not authorized by the certificate registry. Ask the contract owner to grant access.</p>
          <Link to="/" className="button button-secondary"><ArrowLeft size={16} /> Return to verification</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <BrandMark />
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Administration">
          {adminNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
            </NavLink>
          ))}
          {isOwner ? (
            <NavLink to="/admin/administrators" className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}>
              <ShieldEllipsis size={18} strokeWidth={1.9} /><span>Administration</span>
            </NavLink>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-network"><span className="network-dot" /><span><strong>Hardhat Local</strong><small>Chain ID {LOCAL_CHAIN_ID}</small></span></div>
          <Link to="/" className="back-to-public"><ArrowLeft size={15} /> Public verification <ArrowUpRight size={13} /></Link>
          <div className="sidebar-privacy"><ShieldCheck size={15} /><span>Student details are public on this network. Use fictional records for demos.</span></div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-topbar-label">UNIVERSITY PORTAL</span><span className="admin-topbar-divider">/</span><span>Certificate management</span></div>
          <div className="wallet-chip">
            <span className="wallet-status-dot" />
            <span className="wallet-chip-address">{shortAddress(address ?? "")}</span>
            {isOwner ? <span className="owner-tag"><BadgeCheck size={12} /> Owner</span> : <span className="admin-tag"><ShieldCheck size={12} /> Admin</span>}
            <button type="button" className="icon-button wallet-disconnect" title="Disconnect wallet" onClick={() => disconnect()}><LogOut size={15} /></button>
          </div>
        </header>
        <main className="admin-content"><Outlet context={{ address, isOwner } satisfies AdminContext} /></main>
      </div>
    </div>
  );
}
