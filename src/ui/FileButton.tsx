import { useState } from 'react';

type Props = {
  /** Accessible name. Must include the visible text (WCAG 2.5.3). */
  label: string;
  text: string;
  accept: string;
  onFile: (file: File) => void;
  variant?: 'primary' | 'secondary';
  /** A smaller button for a secondary action (still 44 px tall). */
  compact?: boolean;
};

/**
 * A styled file picker (T18): an invisible native input stretched over a button-like label, so it
 * keeps the browser's file dialog and accessibility while showing our text and the chosen file name.
 */
export function FileButton({ label, text, accept, onFile, variant = 'primary', compact = false }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const look =
    variant === 'primary'
      ? 'bg-brand-blue text-white shadow-sm active:bg-brand-deep'
      : 'border-2 border-slate-300 bg-white text-slate-800';
  return (
    <label
      className={`relative flex ${compact ? 'min-h-12 rounded-xl' : 'min-h-14 rounded-2xl'} w-full cursor-pointer flex-col items-center justify-center px-4 py-2 text-center focus-within:ring-4 focus-within:ring-blue-300 ${look}`}
    >
      <span className={compact ? 'text-sm font-semibold' : 'text-base font-semibold'}>{text}</span>
      {chosen && (
        <span className={`max-w-full truncate text-xs ${variant === 'primary' ? 'text-blue-100' : 'text-slate-600'}`}>
          Chosen: {chosen}
        </span>
      )}
      <input
        type="file"
        accept={accept}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ''; // allow choosing the same file again
          if (!file) return;
          setChosen(file.name);
          onFile(file);
        }}
      />
    </label>
  );
}
