import { ArrowRight, FileCheck2, FilePlus2, Files, ShieldCheck, Wallet } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { EmptyState, Feedback, PageHeading } from "../components/AdminUi";
import { useCertificateActivity, useCertificateCount } from "../hooks/useRegistryRead";
import { shortAddress } from "../utils/certificates";
import type { AdminContext } from "../layouts/AdminLayout";

export function DashboardPage() {
  const { address, isOwner } = useOutletContext<AdminContext>();
  const count = useCertificateCount();
  const activity = useCertificateActivity();
  return <>
    <PageHeading label="REGISTRY OVERVIEW" title="Certificate dashboard" description="Issue academic credentials and track activity in the university registry." />
    <div className="overview-stats">
      <article className="panel stat-card"><FileCheck2 /><span>Total certificates issued</span><strong>{count.data?.toString() ?? "—"}</strong></article>
      <article className="panel stat-card"><Wallet /><span>Connected wallet</span><strong className="mono" title={address}>{shortAddress(address)}</strong></article>
      <article className="panel stat-card"><ShieldCheck /><span>Administrator access</span><strong>{isOwner ? "Contract owner" : "Authorized admin"}</strong></article>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><Link to="/admin/manage">View records <ArrowRight size={15} /></Link></div>
        {activity.isPending ? <p className="panel-state">Loading activity…</p> : activity.isError ? <Feedback error>Could not read registry activity. Check the local node.</Feedback> : activity.data?.length ? (
          <ul className="record-list">{activity.data.map(event => <li key={event.key}>
            <span className={`activity-icon ${event.kind}`}><FileCheck2 size={17} /></span>
            <div><strong>Certificate #{event.certificateId.toString()} {event.kind}</strong><small>{event.studentId ?? `Block ${event.blockNumber.toString()}`}</small></div>
            <Link to={`/admin/manage?id=${event.certificateId}`} aria-label={`View certificate ${event.certificateId}`}><ArrowRight size={17} /></Link>
          </li>)}</ul>
        ) : <EmptyState title="No activity yet">Issued and revoked certificates will appear here.</EmptyState>}
      </section>
      <section className="panel"><div className="panel-heading"><h2>Quick actions</h2></div>
        <div className="quick-actions">
          <Link to="/admin/issue"><FilePlus2 size={20} /><span><strong>Issue a certificate</strong><small>Create one academic record</small></span><ArrowRight size={16} /></Link>
          <Link to="/admin/import"><Files size={20} /><span><strong>Import a spreadsheet</strong><small>Review and issue several records</small></span><ArrowRight size={16} /></Link>
        </div>
      </section>
    </div>
  </>;
}

