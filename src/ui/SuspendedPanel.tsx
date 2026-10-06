import { displayMessage } from '../domain/access';
import { ContactBlock } from './ContactBlock';

/** Shown instead of the Export picker while new Sessions are paused (ADR 0006). */
export function SuspendedPanel({ message }: { message: string }) {
  return (
    <section data-testid="suspended" className="mt-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">New counts are paused</h2>
      <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{displayMessage(message)}</p>
      <p className="mt-3 text-sm font-semibold">Contact Netrisyl Insights</p>
      <ContactBlock />
    </section>
  );
}
