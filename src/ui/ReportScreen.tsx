import { useMemo, useState } from 'react';
import { formatQuantity, formatUsd } from '../domain/format';
import { backupFileName, toBackup } from '../domain/backup';
import { buildReport, reportFileName } from '../domain/report';
import { hasCounts, isReported, type Session } from '../domain/session';
import { download } from './download';
import { PoweredBy } from './PoweredBy';
import { RestorePicker } from './RestorePicker';
import { loadNames, rememberNames } from './storage';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Props = { session: Session; onReported: () => void; onRestore: (file: File) => void };

export function ReportScreen({ session, onReported, onRestore }: Props) {
  const names = useMemo(loadNames, []);
  const [branch, setBranch] = useState(names.branches[0] ?? '');
  const [counter, setCounter] = useState(names.counters[0] ?? '');
  const preview = buildReport(session, { branch, counter, generatedAt: new Date().toISOString() }).summary;
  const ready = branch.trim() !== '' && counter.trim() !== '';

  async function onDownload() {
    const now = new Date();
    const report = buildReport(session, { branch: branch.trim(), counter: counter.trim(), generatedAt: now.toISOString() });
    const { writeReport } = await import('../domain/workbook');
    download(reportFileName(branch.trim(), counter.trim(), now), writeReport(report), XLSX_TYPE);
    rememberNames(branch.trim(), counter.trim());
    onReported();
  }

  function onBackup() {
    const now = new Date();
    download(backupFileName(now), toBackup(session, { savedAt: now.toISOString() }), 'application/json');
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-deep to-brand-blue p-4 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">Net Variance Value (at cost)</p>
        <p data-testid="net-value" className="whitespace-nowrap text-4xl font-bold tabular-nums">
          {formatUsd(preview.netValue)}
        </p>
        <p className="mt-1 text-sm text-blue-100 tabular-nums">
          {formatUsd(preview.shortageValue)} short · {formatUsd(preview.surplusValue)} over ·{' '}
          {formatQuantity(preview.unitsShort)} units short
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <ul className="text-sm text-slate-700">
          <li>
            {preview.finished} of {preview.items} items counted · {preview.uncounted} not counted
          </li>
          <li>{preview.recountItems} on the Recount List</li>
        </ul>
        {preview.inProgress > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-900">
            {preview.inProgress} {preview.inProgress === 1 ? 'item is' : 'items are'} in progress: tap Done on{' '}
            {preview.inProgress === 1 ? 'it' : 'them'}, or the report shows no Variance for{' '}
            {preview.inProgress === 1 ? 'it' : 'them'}.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-600">{preview.note}</p>
        {hasCounts(session) && (
          <p className={`mt-2 text-sm font-medium ${isReported(session) ? 'text-emerald-700' : 'text-amber-800'}`}>
            {isReported(session)
              ? 'Reported: the latest counts are in your downloaded report.'
              : session.reportedChanges === null
                ? 'Not reported yet.'
                : 'Changed since the last report: download it again.'}
          </p>
        )}
      </div>

      <form
        className="space-y-3 rounded-2xl bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void onDownload();
        }}
      >
        <label className="block text-sm font-medium">
          Branch
          <input
            list="branches"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 px-3 text-base outline-none focus:border-brand-blue"
          />
        </label>
        <datalist id="branches">
          {names.branches.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <label className="block text-sm font-medium">
          Counter
          <input
            list="counters"
            value={counter}
            onChange={(e) => setCounter(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 px-3 text-base outline-none focus:border-brand-blue"
          />
        </label>
        <datalist id="counters">
          {names.counters.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={!ready}
          className="h-14 w-full rounded-2xl bg-brand-blue text-lg font-bold text-white shadow-sm disabled:bg-slate-300 disabled:text-slate-600"
        >
          Download report
        </button>
      </form>
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Backup</h2>
        <p className="mt-1 text-sm text-rose-800">
          This file contains cost prices and stock values. Send it only to the manager.
        </p>
        <button onClick={onBackup} className="mt-2 h-12 w-full rounded-2xl border-2 border-slate-300 text-sm font-semibold">
          Save a backup
        </button>
        <RestorePicker onFile={onRestore} />
      </div>
      <PoweredBy />
    </section>
  );
}
