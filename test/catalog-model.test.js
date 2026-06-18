import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedCatalogPressurePsi } from '../src/catalog-model.js';

test('catalog pressure defaults prefer 45 psi, then 30 psi, then highest available', () => {
  assert.equal(selectedCatalogPressurePsi({ points: [{ pressurePsi: 30 }, { pressurePsi: 45 }, { pressurePsi: 55 }] }), 45);
  assert.equal(selectedCatalogPressurePsi({ points: [{ pressurePsi: 15 }, { pressurePsi: 20 }, { pressurePsi: 25 }, { pressurePsi: 30 }] }), 30);
  assert.equal(selectedCatalogPressurePsi({ points: [{ pressurePsi: 15 }, { pressurePsi: 20 }, { pressurePsi: 25 }] }), 25);
  assert.equal(selectedCatalogPressurePsi({ points: [] }), null);
});
