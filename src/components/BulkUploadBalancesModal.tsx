import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { buildBalanceTemplateCsv, parseBalanceCsv } from '../utils/csv';
import type { ParsedBulkUpload } from '../utils/csv';
import type { AssetAccount } from '../domain/types';
import styles from './BulkUploadBalancesModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  assets: AssetAccount[];
  currency: string;
  onApply: (result: ParsedBulkUpload) => void;
}

export function BulkUploadBalancesModal({ open, onClose, assets, currency, onApply }: Props) {
  const [parsed, setParsed] = useState<ParsedBulkUpload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const csv = buildBalanceTemplateCsv(assets, currency);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'balance-update-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsed(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') return;
      try {
        const result = parseBalanceCsv(text, assets, currency);
        setParsed(result);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not parse file.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleApply() {
    if (!parsed) return;
    onApply(parsed);
    setParsed(null);
    setParseError(null);
    onClose();
  }

  function handleClose() {
    setParsed(null);
    setParseError(null);
    onClose();
  }

  const totalRows = (parsed?.matched.length ?? 0) + (parsed?.newDrafts.length ?? 0);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk upload balances"
      footer={
        parsed && totalRows > 0 ? (
          <>
            <button type="button" className="btn btn-sm" onClick={handleClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>
              Apply {totalRows} {totalRows === 1 ? 'row' : 'rows'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className={styles.body}>
        <p className={styles.hint}>
          Download the template, fill in updated balances in any spreadsheet app, then upload to
          populate the form. Add new asset rows at the bottom — leave the <code>asset_id</code>{' '}
          column blank for new entries.
        </p>

        <div className={styles.actions}>
          <button type="button" className="btn btn-sm" onClick={downloadTemplate}>
            Download template
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file&hellip;
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className={styles.hiddenInput}
            onChange={handleFileChange}
          />
        </div>

        {parseError ? <p className={styles.error}>{parseError}</p> : null}

        {parsed ? (
          <div className={styles.preview}>
            {parsed.matched.length > 0 ? (
              <p className={styles.summary}>
                {parsed.matched.length} existing asset balance
                {parsed.matched.length !== 1 ? 's' : ''} will be updated.
              </p>
            ) : null}
            {parsed.newDrafts.length > 0 ? (
              <p className={styles.summary}>
                {parsed.newDrafts.length} new asset row
                {parsed.newDrafts.length !== 1 ? 's' : ''} will be added.
              </p>
            ) : null}
            {totalRows === 0 ? (
              <p className={styles.summary}>
                No rows matched or added — check the file and try again.
              </p>
            ) : null}
            {parsed.warnings.length > 0 ? (
              <ul className={styles.warnings}>
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
