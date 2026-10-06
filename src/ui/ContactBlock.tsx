import { CONTACT_LINES } from '../domain/access';

/** Netrisyl contact details as plain, selectable text (not links). */
export function ContactBlock() {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm select-text">
      {CONTACT_LINES.map((line) => (
        <div key={line.label} className="contents">
          <dt className="text-slate-600">{line.label}</dt>
          <dd className="font-medium break-all">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}
