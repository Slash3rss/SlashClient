import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { halloweenSeason } from '../src/renderer/season';

describe('seasonal look', () => {
  it('is Halloween from 25 October to 2 November', () => {
    assert.equal(halloweenSeason(new Date(2026, 9, 24, 23, 59)), false);
    assert.equal(halloweenSeason(new Date(2026, 9, 25, 0, 0)), true);
    assert.equal(halloweenSeason(new Date(2026, 9, 31)), true);
    assert.equal(halloweenSeason(new Date(2026, 10, 2, 23, 59)), true);
    assert.equal(halloweenSeason(new Date(2026, 10, 3)), false);
    assert.equal(halloweenSeason(new Date(2026, 5, 1)), false);
  });
});
