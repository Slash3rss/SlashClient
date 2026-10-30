import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { halloweenSeason, seasonOf } from '../src/renderer/season';

describe('seasonal look', () => {
  it('is Halloween from 25 October to 2 November', () => {
    assert.equal(halloweenSeason(new Date(2026, 9, 24, 23, 59)), false);
    assert.equal(halloweenSeason(new Date(2026, 9, 25, 0, 0)), true);
    assert.equal(halloweenSeason(new Date(2026, 9, 31)), true);
    assert.equal(halloweenSeason(new Date(2026, 10, 2, 23, 59)), true);
    assert.equal(halloweenSeason(new Date(2026, 10, 3)), false);
    assert.equal(halloweenSeason(new Date(2026, 5, 1)), false);
  });

  it('is white and red for Independence Day from 8 to 12 November, nothing between and after', () => {
    assert.equal(seasonOf(new Date(2026, 10, 7, 23, 59)), null);
    assert.equal(seasonOf(new Date(2026, 10, 8)), 'independence');
    assert.equal(seasonOf(new Date(2026, 10, 11, 12)), 'independence');
    assert.equal(seasonOf(new Date(2026, 10, 12, 23, 59)), 'independence');
    assert.equal(seasonOf(new Date(2026, 10, 13)), null);
    assert.equal(seasonOf(new Date(2026, 9, 31)), 'halloween');
  });
});
