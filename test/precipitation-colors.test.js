import assert from 'node:assert/strict';
import test from 'node:test';

import { colorForPrecipitationRate, precipitationColorScaleMax, precipitationLegendGradient } from '../src/precipitation-colors.js';

test('precipitation color scale maps dry rates to red and wet rates to green', () => {
  assert.equal(colorForPrecipitationRate(0, 2), 'rgba(0, 0, 0, 0)');
  assert.equal(colorForPrecipitationRate(0.000000001, 2), 'rgba(215, 48, 31, 0.68)');
  assert.equal(colorForPrecipitationRate(2, 2), 'rgba(49, 163, 84, 0.68)');
});

test('precipitation legend gradient documents the dry-to-wet direction', () => {
  assert.equal(
    precipitationLegendGradient(),
    'linear-gradient(90deg, rgba(215, 48, 31, 0.95), rgba(253, 141, 60, 0.95), rgba(255, 232, 120, 0.95), rgba(116, 196, 118, 0.95), rgba(49, 163, 84, 0.95))',
  );
});

test('precipitation color scale ignores isolated wet spikes when choosing the visible max', () => {
  const rates = [0, 0.2, 0.4, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 50];

  assert.equal(precipitationColorScaleMax(rates), 1.8);
  assert.equal(colorForPrecipitationRate(1.8, precipitationColorScaleMax(rates)), 'rgba(49, 163, 84, 0.68)');
});
