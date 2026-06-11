import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveZoneHydraulics,
  sprinklerFlowAtPressureGpm,
  sprinklerPressureScaleFactorAtPressure,
  supplyFlowAtPressureGpm,
} from '../src/hydraulic-model.js';

test('supply flow follows the static-pressure and open-flow curve', () => {
  const zone = { pressurePsi: 60, measuredFlowGpm: 10 };
  assert.equal(supplyFlowAtPressureGpm(zone, 60), 0);
  assert.equal(supplyFlowAtPressureGpm(zone, 0), 10);
  assert.ok(Math.abs(supplyFlowAtPressureGpm(zone, 30) - (10 * Math.sqrt(0.5))) < 1e-12);
});

test('sprinkler flow at pressure handles unregulated and pressure-regulated heads', () => {
  const unregulated = { baseFlowGpm: 3, ratedPressurePsi: 30, pressureRegulating: false };
  const regulated = { baseFlowGpm: 1.5, ratedPressurePsi: 30, pressureRegulating: true };

  assert.ok(Math.abs(sprinklerFlowAtPressureGpm(unregulated, 32.7) - (3 * Math.sqrt(32.7 / 30))) < 1e-12);
  assert.equal(sprinklerPressureScaleFactorAtPressure(regulated, 40), 1);
  assert.equal(sprinklerFlowAtPressureGpm(regulated, 40), 1.5);
  assert.ok(Math.abs(sprinklerFlowAtPressureGpm(regulated, 20) - (1.5 * Math.sqrt(20 / 30))) < 1e-12);
});

test('zone hydraulics solve operating pressure and actual flows simultaneously', () => {
  const zone = { pressurePsi: 60, measuredFlowGpm: 10 };
  const sprinklers = [
    { baseFlowGpm: 3.0, ratedPressurePsi: 30, pressureRegulating: false },
    { baseFlowGpm: 2.0, ratedPressurePsi: 30, pressureRegulating: false },
    { baseFlowGpm: 1.5, ratedPressurePsi: 30, pressureRegulating: true },
  ];

  const solution = solveZoneHydraulics(zone, sprinklers);

  assert.ok(Math.abs(solution.operatingPressurePsi - 32.7) < 0.2, `pressure ${solution.operatingPressurePsi}`);
  assert.ok(Math.abs(solution.actualFlows[0] - 3.13) < 0.01, `A ${solution.actualFlows[0]}`);
  assert.ok(Math.abs(solution.actualFlows[1] - 2.09) < 0.01, `B ${solution.actualFlows[1]}`);
  assert.ok(Math.abs(solution.actualFlows[2] - 1.50) < 0.01, `C ${solution.actualFlows[2]}`);
  assert.ok(Math.abs(solution.totalFlowGpm - 6.72) < 0.02, `total ${solution.totalFlowGpm}`);
});
