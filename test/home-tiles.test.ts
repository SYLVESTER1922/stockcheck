import { describe, expect, it } from 'vitest';
import { homeTileInfo } from '../src/domain/homeTiles';
import { newSession } from '../src/domain/session';
import { ITEMS, reportSession } from './helpers/reportSession';

const AT = '2026-10-06T06:45:00.000Z';

describe('homeTileInfo', () => {
  it('has hints and no figures without a Session', () => {
    expect(homeTileInfo(null)).toEqual({ count: 'Load your Export to start', adjust: 'Load your Export to start', variance: 'Load your Export to start', varianceSign: 0 });
  });

  it('shows live figures with a Session', () => {
    const info = homeTileInfo(reportSession());
    expect(info.count).toBe('7 of 9 counted');
    expect(info.variance).toMatch(/^[+−]\$/);
    expect(info.adjust).toMatch(/^\d+ waiting$/);
  });

  it('says nothing to adjust yet when no Item has a Variance', () => {
    expect(homeTileInfo(newSession('x.xlsx', AT, Object.values(ITEMS))).adjust).toBe('0 waiting');
    expect(homeTileInfo(newSession('x.xlsx', AT, Object.values(ITEMS))).variance).toBe('$0.00');
  });
});
