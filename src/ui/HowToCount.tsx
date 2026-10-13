import { ABOUT_TEXT } from '../domain/access';
import { INSTRUCTIONS } from '../domain/instructions';
import { ContactBlock } from './ContactBlock';

export function HowToCount({ onBack }: { onBack: () => void }) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">How to count</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-snug">
        {INSTRUCTIONS.map((instruction) => (
          <li key={instruction.text}>
            {instruction.required && <b className="text-rose-700">Required: </b>}
            {instruction.forManager && <b>For the manager: </b>}
            {instruction.text}
          </li>
        ))}
      </ol>
      <div data-testid="about-adjustments" className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <h3 className="font-semibold">Wastage and Adjustments</h3>
        <p className="mt-1" data-testid="about-wastage">
          Wastage is optional. After an Item is Done, you can record what was thrown away and not yet deducted in Zobaze, with a reason and the
          paper-register number. It never changes the Variance: the Unexplained Variance is shown beside it.
        </p>
        <p className="mt-2">
          The Adjust tab lists what to correct in Zobaze. StockCheck never changes Zobaze: staff make each change by hand, then
          mark the Adjustment Applied.
        </p>
        <p className="mt-2">
          Approved by and Applied by are a record, not security. They keep the name someone typed and the time on this phone, so
          the manager can see who agreed and who applied each Adjustment. Anyone using this phone can type any name, and a backup
          file can be edited.
        </p>
      </div>
      <div data-testid="about" className="mt-6 border-t border-slate-200 pt-4 text-sm">
        <h3 className="font-semibold">About StockCheck</h3>
        <p className="mt-1">{ABOUT_TEXT}</p>
        <p className="mt-3 font-semibold">Contact Netrisyl Insights</p>
        <ContactBlock />
      </div>
      <button onClick={onBack} className="mt-4 h-12 w-full rounded-2xl bg-brand-blue font-semibold text-white">
        Back
      </button>
    </section>
  );
}
