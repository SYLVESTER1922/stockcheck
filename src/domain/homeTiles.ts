import { adjustView, statusCounts } from './adjustView';
import { countProgress } from './countView';
import { signedUsd } from './format';
import { buildReport } from './report';
import type { Session } from './session';

const HINT = 'Load your Export to start';

/** The live line under each Home tile (T29), from the same functions the screens use. */
export function homeTileInfo(session: Session | null) {
  if (!session) return { count: HINT, adjust: HINT, variance: HINT, varianceSign: 0 };
  const { counted, total } = countProgress(session);
  const net = buildReport(session, { branch: '', counter: '', generatedAt: '' }).summary.netValue;
  return {
    count: `${counted} of ${total} counted`,
    adjust: `${statusCounts(adjustView(session).list).Pending} waiting`,
    variance: signedUsd(net),
    /** For colouring the net figure: −1 short, 1 over. */
    varianceSign: Math.sign(net),
  };
}
