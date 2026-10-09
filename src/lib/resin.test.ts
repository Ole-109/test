import { describe, expect, it } from 'vitest';
import { RESIN_INTERVAL, resinAt, resinReachAt, setResin } from './resin';

const base = { value: 100, at: 0, condensed: 0, fragile: 0 };

describe('resin', () => {
  it('regenerates one point every 8 minutes', () => {
    expect(resinAt(base, 200, RESIN_INTERVAL * 3 + 1000).current).toBe(103);
  });

  it('caps and reports the full time', () => {
    const s = resinAt(base, 200, RESIN_INTERVAL * 500);
    expect(s.current).toBe(200);
    expect(s.capped).toBe(true);
    expect(s.fullAt).toBe(RESIN_INTERVAL * 100);
  });

  it('does not regenerate above the cap', () => {
    expect(resinAt({ ...base, value: 260 }, 200, RESIN_INTERVAL * 10).current).toBe(260);
  });

  it('keeps partial progress when spending', () => {
    const now = RESIN_INTERVAL * 2 + 60_000; // 102 resin, 1 minute into the next point
    const next = setResin(base, 200, 62, now);
    const snap = resinAt(next, 200, now);
    expect(snap.current).toBe(62);
    expect(snap.nextIn).toBe(RESIN_INTERVAL - 60_000);
  });

  it('predicts when a target is reached', () => {
    expect(resinReachAt(base, 200, 160, 0)).toBe(RESIN_INTERVAL * 60);
    expect(resinReachAt(base, 200, 50, 0)).toBe(0);
  });
});
