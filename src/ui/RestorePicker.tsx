import { FileButton } from './FileButton';

/** The backup picker, on Home and the Report screen. */
export function RestorePicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <FileButton label="Restore a backup" text="Restore a backup" accept=".json,application/json" onFile={onFile} variant="secondary" />
  );
}
