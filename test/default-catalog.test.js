import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function loadDefaultCatalogRows() {
  const [headerLine, ...lines] = readFileSync('data/default-catalogs/default_sprinkler_catalog.csv', 'utf8').trim().split('\n');
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [headers[index], value])));
}

test('default catalog includes Rain Bird 5000 standard and low-angle nozzle chart rows', () => {
  const rows = loadDefaultCatalogRows();
  const rainBird5000 = rows.filter(
    (row) => row.manufacturer === 'Rain Bird' && row.head_model === '5000/5000 Plus Series Rotor',
  );

  const standardThreeAt45 = rainBird5000.find(
    (row) => row.nozzle_model === '3.0' && row.pressure_psi === '45',
  );
  assert.equal(standardThreeAt45?.flow_gpm, '3.09');
  assert.equal(standardThreeAt45?.radius_ft, '40');
  assert.equal(standardThreeAt45?.pressure_regulating, 'false');

  const lowAngleThreeAt45 = rainBird5000.find(
    (row) => row.nozzle_model === '3.0-LowAngle' && row.pressure_psi === '45',
  );
  assert.equal(lowAngleThreeAt45?.flow_gpm, '3.07');
  assert.equal(lowAngleThreeAt45?.radius_ft, '35');
  assert.equal(lowAngleThreeAt45?.pressure_regulating, 'false');
});
