import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inchesPerHourPerGpmPerSqft,
  radialPrecipitationNormalizationConstant,
  radialPrecipitationRateInHr,
  radialShape,
  radialShapeNormalizationIntegral,
} from '../src/precipitation-model.js';

test('default radial shape decreases from head to throw edge', () => {
  assert.equal(radialShape(-0.1), 0);
  assert.equal(radialShape(1.1), 0);
  assert.ok(radialShape(0) > radialShape(0.5));
  assert.ok(radialShape(0.5) > radialShape(1));
});

test('radial normalization integral is computed numerically from the selected shape', () => {
  const integral = radialShapeNormalizationIntegral((rho) => 1, 256);
  assert.ok(Math.abs(integral - 0.5) < 1e-10);

  const constant = radialPrecipitationNormalizationConstant({
    flowGpm: 2,
    radiusFt: 10,
    sectorAngleRadians: Math.PI,
    model: (rho) => 1,
  });
  assert.ok(Math.abs(constant - (2 / (Math.PI * 10 * 10 * 0.5))) < 1e-10);
});

test('integrating normalized radial precipitation over a sector recovers sprinkler flow within 1%', () => {
  const flowGpm = 2.4;
  const radiusFt = 18;
  const sectorAngleRadians = (135 * Math.PI) / 180;
  const radialSamples = 600;
  const angularSamples = 240;
  const dr = radiusFt / radialSamples;
  const dTheta = sectorAngleRadians / angularSamples;
  let recoveredFlowGpm = 0;

  for (let radialIndex = 0; radialIndex < radialSamples; radialIndex += 1) {
    const r = (radialIndex + 0.5) * dr;
    for (let angleIndex = 0; angleIndex < angularSamples; angleIndex += 1) {
      const rateInHr = radialPrecipitationRateInHr({
        flowGpm,
        radiusFt,
        sectorAngleRadians,
        distanceFt: r,
      });
      const cellAreaSqft = r * dr * dTheta;
      recoveredFlowGpm += (rateInHr * cellAreaSqft) / inchesPerHourPerGpmPerSqft;
    }
  }

  const relativeError = Math.abs(recoveredFlowGpm - flowGpm) / flowGpm;
  assert.ok(relativeError < 0.01, `expected <1% error, got ${(relativeError * 100).toFixed(3)}%`);
});
