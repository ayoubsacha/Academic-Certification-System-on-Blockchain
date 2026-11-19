import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, FilePlus2, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Feedback, PageHeading } from "../components/AdminUi";
import { describeError, useRegistryActions } from "../services/registry";
import { emptyDraft, formatGrade, formatIssueDate, validateCertificateDraft } from "../utils/certificates";
import type { CertificateDraft, CertificateInput } from "../types/certificate";

const fields: { name: keyof CertificateDraft; label: string; placeholder?: string; wide?: boolean }[] = [
  { name: "studentName", label: "Student full name", placeholder: "e.g. Amina Bennani" },
  { name: "studentId", label: "Student ID", placeholder: "e.g. UNI-2026-001" },
  { name: "diplomaTitle", label: "Diploma title", placeholder: "e.g. Bachelor of Computer Science", wide: true },
  { name: "issueDate", label: "Issue date" },
  { name: "grade", label: "Final grade / 20", placeholder: "e.g. 16.50" },
  { name: "recipientAddress", label: "Recipient wallet address (optional)", placeholder: "0x…", wide: true },
];

export function IssuePage() {
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<CertificateInput>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<{ hash: string; ids: bigint[] }>();
  const actions = useRegistryActions();

  function prepare(event: FormEvent) {
    event.preventDefault();
    setFailure("");
    setResult(undefined);
    const validation = validateCertificateDraft(draft);
    setErrors(validation.errors);
    setReview(validation.data);
  }

  async function issue() {
    if (!review || busy) return;
    setBusy(true);
    try {
      setResult(await actions.mintCertificate(review));
      setDraft(emptyDraft());
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setReview(undefined);
      setBusy(false);
    }
  }

  return <>
    <PageHeading label="CERTIFICATE ISSUANCE" title="Issue a certificate" description="Create a new academic credential in the registry." />
    <div className="form-layout">
      <form className="panel issue-panel" onSubmit={prepare} noValidate>
        <div className="panel-heading"><h2><FilePlus2 size={20} /> Certificate details</h2></div>
        {result && <Feedback><strong>Certificate {result.ids.length ? `#${result.ids[0]} ` : ""}issued</strong><p className="transaction-hash">{result.hash}</p>{result.ids.length > 0 && <Link to={`/admin/manage?id=${result.ids[0]}`}>View certificate <ArrowRight size={14} /></Link>}</Feedback>}
        {failure && <Feedback error>{failure}</Feedback>}
        <div className="form-grid">
          {fields.map(({ name, label, placeholder, wide }) => <div className={wide ? "field wide" : "field"} key={name}>
            <label htmlFor={name}>{label}</label>
            <input id={name} type={name === "issueDate" ? "date" : "text"} inputMode={name === "grade" ? "decimal" : undefined}
              placeholder={placeholder} value={draft[name]} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${name}-error` : undefined}
              onChange={event => setDraft(previous => ({ ...previous, [name]: event.target.value }))} />
            {errors[name] && <p id={`${name}-error`} className="field-error">{errors[name]}</p>}
          </div>)}
        </div>
        <div className="form-footer"><button className="button button-primary" type="submit">Review certificate <ArrowRight size={16} /></button></div>
      </form>
      <aside className="panel note-panel"><Info size={21} /><h2>Before you issue</h2><p>Use fictional student information. The name, ID, diploma and grade will be publicly readable on this chain.</p><p>To correct a record, revoke it and issue a new certificate with a new ID.</p></aside>
    </div>
    {review && <ConfirmDialog title="Issue this certificate?" confirmLabel="Confirm issuance" busy={busy} onConfirm={() => void issue()} onCancel={() => setReview(undefined)}>
      <p><strong>{review.studentName}</strong> · {review.studentId}</p><p>{review.diplomaTitle} · {formatGrade(review.grade)} / 20</p><p>{formatIssueDate(review.issueDate)}. Approve the transaction in your wallet to publish this record.</p>
    </ConfirmDialog>}
  </>;
}

