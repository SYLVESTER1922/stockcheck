import { useMemo, useState } from 'react';
import { formatQuantity, formatUsd } from '../domain/format';
import { buildReport, reportFileName } from '../domain/report';
import type { Session } from '../domain/session';
import { download } from './download';
import { loadNames, rememberNames } from './storage';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function ReportScreen({ session }: { session: Session }) {
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
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-lg bg-white p-3 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Net Variance Value (at cost)</p>
        <p data-testid="net-value" className="text-3xl font-bold tabular-nums">
          {formatUsd(preview.netValue)}
        </p>
        <p className="mt-1 text-sm text-slate-600 tabular-nums">
          {formatUsd(preview.shortageValue)} short · {formatUsd(preview.surplusValue)} over ·{' '}
          {formatQuantity(preview.unitsShort)} units short
        </p>
        <ul className="mt-2 text-sm text-slate-600">
          <li>
            {preview.finished} of {preview.items} items counted · {preview.uncounted} not counted
          </li>
          <li>{preview.recountItems} on the Recount List</li>
        </ul>
        {preview.inProgress > 0 && (
          <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
            {preview.inProgress} {preview.inProgress === 1 ? 'item is' : 'items are'} in progress: tap Done on{' '}
            {preview.inProgress === 1 ? 'it' : 'them'}, or the report shows no Variance for{' '}
            {preview.inProgress === 1 ? 'it' : 'them'}.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{preview.note}</p>
      </div>

      <form
        className="space-y-3 rounded-lg bg-white p-3 shadow-sm"
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
            className="mt-1 w-full rounded-lg border border-slate-300 p-2"
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
            className="mt-1 w-full rounded-lg border border-slate-300 p-2"
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
          className="w-full rounded-lg bg-slate-900 py-3 font-semibold text-white disabled:bg-slate-300"
        >
          Download report
        </button>
      </form>
    </section>
  );
}
