/**
 * Access Switch (ADR 0006): fail-open, with a sticky explicit answer.
 * Only a valid "disabled" suspends and only a valid "enabled" lifts; anything else changes nothing.
 * Suspension only ever blocks starting a new Session, never an existing one.
 */
export type CheckResult = { kind: 'answer'; newSessions: 'enabled' | 'disabled'; message: string } | { kind: 'no-answer' };
/** The last explicit answer this phone received; null if it has never received one. */
export type Access = { newSessions: 'enabled' | 'disabled'; message: string } | null;

export const NO_ANSWER: CheckResult = { kind: 'no-answer' };

export function nextAccess(previous: Access, result: CheckResult): Access {
  if (result.kind === 'no-answer') return previous;
  return { newSessions: result.newSessions, message: result.message };
}

export const isSuspended = (access: Access) => access?.newSessions === 'disabled';

/** Reads the Status File. Anything that isn't exactly the expected shape is "no answer". */
export function parseStatus(text: string): CheckResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return NO_ANSWER;
  }
  if (typeof file !== 'object' || file === null || Array.isArray(file)) return NO_ANSWER;
  const { newSessions, message = '' } = file as { newSessions?: unknown; message?: unknown };
  if (newSessions !== 'enabled' && newSessions !== 'disabled') return NO_ANSWER;
  if (typeof message !== 'string') return NO_ANSWER;
  return { kind: 'answer', newSessions, message };
}

const MAX_MESSAGE = 300;
const DEFAULT_MESSAGE = 'New counts are paused by Netrisyl Insights.';

/** The reason shown to the Counter: plain text (rendered as text, never HTML), capped, never empty. */
export function displayMessage(message: string): string {
  const text = message.trim();
  if (text === '') return DEFAULT_MESSAGE;
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text;
}

/** Shown on the suspension screen and in About. Add phone, WhatsApp or hours as one more line. */
export const CONTACT_LINES: { label: string; value: string }[] = [
  { label: 'Name', value: 'Netrisyl Insights' },
  { label: 'Email', value: 'netrisyl.support@netrisyl.com' },
];

export const ABOUT_TEXT =
  'StockCheck is provided by Netrisyl Insights. Netrisyl can pause the start of new counts for non-payment, ' +
  'for breach of the agreement, or as an emergency stop if a fault is found. A count already in progress is ' +
  'never affected: it can always be finished, reported and backed up.';
