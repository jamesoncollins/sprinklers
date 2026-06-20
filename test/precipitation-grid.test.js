import test from 'node:test';
import assert from 'node:assert/strict';
import { averageScopedPrecipitationRateAtSamples } from '../src/precipitation-grid.js';

test('scoped precipitation sampling averages combined sprinkler rates in a cell', () => {
  const samples = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  const rate = averageScopedPrecipitationRateAtSamples(
    samples,
    (sample) => {
      const firstSprinklerRate = sample.x;
      const secondSprinklerRate = sample.x * 2;
      return firstSprinklerRate + secondSprinklerRate;
    },
  );

  assert.equal(rate, 4.5);
});

test('scoped precipitation sampling ignores samples outside grass scope', () => {
  const rate = averageScopedPrecipitationRateAtSamples(
    [{ x: 1, y: 1 }, { x: 9, y: 9 }],
    (sample) => (sample.x === 9 ? 10 : 0.5),
    (sample) => sample.x < 5,
  );

  assert.equal(rate, 0.5);
});
