import { FileButton } from './FileButton';

/** The Zobaze Export picker for "Load a new Export" (the guard has already been passed). */
export function ExportPicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div className="mt-2">
      <FileButton label="Choose a new Zobaze Export" text="Choose a new Zobaze Export" accept=".xlsx,.xls,.csv" onFile={onFile} />
    </div>
  );
}
