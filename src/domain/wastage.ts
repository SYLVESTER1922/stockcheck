import type { Item } from './export';
import { lineFor, type Session, type WastageEntry } from './session';
import { parseTally } from './tally';

/**
 * Wastage (CONTEXT: Wastage; ADR 0007): what was thrown away and NOT already deducted in Zobaze.
 * It sits beside the Total Variance and never replaces it, so it cannot hide a shortage:
 * Count, Variance, Variance Value, Look Again and the Recount List do not read it.
 */
export const REASONS = ['Expired', 'Damaged', 'Spoilt', 'Other'] as const;
export type WastageReason = (typeof REASONS)[number];

/** What the Counter has typed into the form. */
export type WastageInput = {
  quantity: string;
  reason: WastageReason | '';
  note: string;
  register: string;
  confirmed: boolean;
};

export type WastageResult = { ok: true; entry: WastageEntry } | { ok: false; message: string };

export function parseWastage(input: WastageInput, at: string): WastageResult {
  const quantity = parseTally(input.quantity);
  if (!quantity.ok) return quantity;
  if (quantity.value === 0) return { ok: false, message: 'Type a Wastage above 0, or remove the Wastage.' };
  if (input.reason === '') return { ok: false, message: 'Choose a reason.' };
  const note = input.note.trim();
  if (input.reason === 'Other' && note === '') return { ok: false, message: 'Say what happened, for the reason Other.' };
  const register = input.register.trim();
  if (register === '') return { ok: false, message: 'Type the paper-register reference.' };
  if (!input.confirmed) {
    return { ok: false, message: 'Tick the box to confirm this is NOT already deducted in Zobaze.' };
  }
  return { ok: true, entry: { quantity: quantity.value, reason: input.reason, note, register, notDeductedConfirmed: true, at } };
}

/** Shown, never a block. Each one needs a manager's attention. */
export type WastageFlag = 'covers-shortage' | 'exceeds-shortage' | 'on-surplus' | 'on-zero-variance';

export const WASTAGE_FLAG_TEXT: Record<WastageFlag, string> = {
  'covers-shortage': 'Wastage covers the whole shortage, so nothing is left unexplained. Check the register.',
  'exceeds-shortage': 'Wastage is more than the shortage, so the gap turns into a surplus. Check the register.',
  'on-surplus': 'This Item has a surplus, and Wastage makes the gap bigger. Check the count.',
  'on-zero-variance': 'This Item matches Expected, so Wastage leaves a surplus. Check the count.',
};

/** Short wording for the Excel reports. */
export const WASTAGE_FLAG_LABEL: Record<WastageFlag, string> = {
  'covers-shortage': 'Wastage covers the whole shortage',
  'exceeds-shortage': 'Wastage is more than the shortage',
  'on-surplus': 'Wastage on an Item with a surplus',
  'on-zero-variance': 'Wastage on an Item that matches Expected',
};

export type WastageLine = {
  entry: WastageEntry;
  /** Count − Expected, as everywhere else. */
  total: number;
  wastage: number;
  /** Total Variance + Wastage. */
  unexplained: number;
  flags: WastageFlag[];
};

/** The Wastage on a Done Item with a readable Expected; null otherwise (a stray entry is ignored). */
export function wastageFor(session: Session, item: Item): WastageLine | null {
  const entry = session.wastage[item.key];
  const line = lineFor(session, item);
  if (!entry || line.status !== 'finished' || line.variance === null) return null;

  const total = line.variance;
  const flags: WastageFlag[] = [];
  if (total < 0 && entry.quantity === -total) flags.push('covers-shortage');
  if (total < 0 && entry.quantity > -total) flags.push('exceeds-shortage');
  if (total > 0) flags.push('on-surplus');
  if (total === 0) flags.push('on-zero-variance');
  return { entry, total, wastage: entry.quantity, unexplained: total + entry.quantity, flags };
}
