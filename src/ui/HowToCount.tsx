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
