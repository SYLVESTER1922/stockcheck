import { SHORTAGE_NOTE } from './report';

/** The Counter instructions (spec §4.11). One source for the How to count screen. */
export type Instruction = { text: string; required?: boolean; forManager?: boolean };

export const INSTRUCTIONS: Instruction[] = [
  {
    required: true,
    text: 'Count only while the branch is closed. Load the Export right before you start counting. If you count on paper, type it in the same day.',
  },
  { text: 'Count what you see, in the unit on the label. Never convert between variants (for example, a bale and 2kg packs).' },
  { text: 'An item in several places: type each place’s number and tap Another place, then tap Done after the last one.' },
  {
    text: 'When the app says “Look again”, go and look: every place the item could be stored for a shortage, or for an unbooked delivery for a surplus.',
  },
  { text: 'Always open the app from the home-screen icon, never from a link in WhatsApp. A link opens an empty copy.' },
  {
    text: 'Download the report before loading a new Export. If you correct anything, download again: the newest report is the true one.',
  },
  { text: 'A backup file contains the shop’s cost prices and stock values. Send it only to the manager.' },
  { text: 'Stock that isn’t in Zobaze goes on a separate paper list for the manager.' },
  { text: SHORTAGE_NOTE },
  { forManager: true, text: 'If an item appears as counted in more than one report, use the latest.' },
];
