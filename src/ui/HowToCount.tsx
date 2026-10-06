import { INSTRUCTIONS } from '../domain/instructions';

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
      <button onClick={onBack} className="mt-4 h-12 w-full rounded-2xl bg-brand-blue font-semibold text-white">
        Back
      </button>
    </section>
  );
}
