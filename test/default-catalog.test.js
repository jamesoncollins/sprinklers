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

test('default catalog includes Rain Bird EAGLE 900 golf rotor nozzle data', () => {
  const rows = loadDefaultCatalogRows();
  const eagle900 = rows.filter(
    (row) => row.manufacturer === 'Rain Bird' && row.head_model === 'EAGLE 900',
  );

  assert.equal(eagle900.length, 27);

  const blueAt60 = eagle900.find((row) => row.nozzle_model === '#44 Blue' && row.pressure_psi === '60');
  assert.equal(blueAt60?.flow_gpm, '21.4');
  assert.equal(blueAt60?.radius_ft, '63');
  assert.equal(blueAt60?.arc_degrees, '360');

  const redAt100 = eagle900.find((row) => row.nozzle_model === '#64 Red' && row.pressure_psi === '100');
  assert.equal(redAt100?.flow_gpm, '57.1');
  assert.equal(redAt100?.radius_ft, '97');
  assert.match(redAt100?.notes ?? '', /rb_eagle_900_950_nozzle_data_sheets\.pdf/);
});

test('TPC Sawgrass demo project uses built-in Rain Bird EAGLE 900 catalog rows', () => {
  const rows = loadDefaultCatalogRows();
  const demo = JSON.parse(readFileSync('data/example_tpc_sawgrass_project.json', 'utf8'));

  assert.equal(demo.site.name, 'TPC Sawgrass 17th Hole Demo');
  assert.equal(demo.site.imageSource, 'satellite');
  assert.equal(demo.site.satellite.source, 'esri-world');
  assert.ok(demo.site.grassAreas.length >= 2);
  assert.equal(demo.zones.length, 3);
  assert.equal(demo.sprinklers.length, 8);

  demo.sprinklers.forEach((sprinkler) => {
    const matchingCatalogRow = rows.find(
      (row) =>
        row.manufacturer === sprinkler.manufacturer &&
        row.head_model === sprinkler.headModel &&
        row.nozzle_model === sprinkler.nozzleModel &&
        row.pressure_psi === String(sprinkler.ratedPressurePsi),
    );
    assert.ok(matchingCatalogRow, `${sprinkler.id} should reference a built-in catalog row`);
    assert.equal(Number(matchingCatalogRow.flow_gpm), sprinkler.baseFlowGpm);
    assert.equal(Number(matchingCatalogRow.radius_ft), sprinkler.baseRadiusFt);
  });
});
