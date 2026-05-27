const emptyProject = {
  version: 1,
  site: { name: 'New Site', address: '', imageSource: 'satellite' },
  zones: [],
  sprinklers: [],
};

let project = structuredClone(emptyProject);
let catalogState = null;

const newBtn = document.getElementById('new-project');
const saveBtn = document.getElementById('save-project');
const loadInput = document.getElementById('load-project');
const catalogInput = document.getElementById('load-catalog');
const catalogStatus = document.getElementById('catalog-status');
const manufacturerSelect = document.getElementById('manufacturer-select');
const headSelect = document.getElementById('head-select');
const nozzleSelect = document.getElementById('nozzle-select');
const pressureInput = document.getElementById('pressure-input');
const lookupBtn = document.getElementById('lookup-performance');
const lookupResult = document.getElementById('lookup-result');

function setCatalogStatus(message) {
  catalogStatus.textContent = message;
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) return [];
  const headers = headerLine.split(',').map((h) => h.trim());

  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? '').trim();
      });
      return row;
    });
}

function buildCatalog(rows) {
  const required = ['manufacturer', 'head_model', 'nozzle_model', 'pressure_psi', 'flow_gpm', 'radius_ft'];
  const warnings = [];
  const groups = new Map();

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const missing = required.filter((field) => !row[field]);
    if (missing.length > 0) {
      warnings.push(`Row ${line}: missing ${missing.join(', ')}`);
      return;
    }

    const pressurePsi = Number(row.pressure_psi);
    const flowGpm = Number(row.flow_gpm);
    const radiusFt = Number(row.radius_ft);

    if ([pressurePsi, flowGpm, radiusFt].some((v) => Number.isNaN(v))) {
      warnings.push(`Row ${line}: pressure_psi, flow_gpm, and radius_ft must be numeric`);
      return;
    }

    const manufacturer = row.manufacturer;
    const headModel = row.head_model;
    const nozzleModel = row.nozzle_model;
    const key = `${manufacturer}|${headModel}|${nozzleModel}`;

    if (!groups.has(key)) {
      groups.set(key, {
        manufacturer,
        headModel,
        nozzleModel,
        points: [],
      });
    }

    groups.get(key).points.push({ pressurePsi, flowGpm, radiusFt });
  });

  const models = Array.from(groups.values()).map((model) => {
    model.points.sort((a, b) => a.pressurePsi - b.pressurePsi);
    return model;
  });

  return { models, warnings };
}

function lookupPerformance(model, pressurePsi) {
  const points = model.points;
  if (points.length === 0) {
    return { warning: 'No pressure points available for selected model.' };
  }

  const exact = points.find((point) => point.pressurePsi === pressurePsi);
  if (exact) {
    return { flowGpm: exact.flowGpm, radiusFt: exact.radiusFt, warning: null, mode: 'exact' };
  }

  if (pressurePsi < points[0].pressurePsi) {
    return {
      flowGpm: points[0].flowGpm,
      radiusFt: points[0].radiusFt,
      warning: `Pressure ${pressurePsi} PSI is below supported range; clamped to ${points[0].pressurePsi} PSI.`,
      mode: 'clamp-low',
    };
  }

  if (pressurePsi > points[points.length - 1].pressurePsi) {
    const maxPoint = points[points.length - 1];
    return {
      flowGpm: maxPoint.flowGpm,
      radiusFt: maxPoint.radiusFt,
      warning: `Pressure ${pressurePsi} PSI is above supported range; clamped to ${maxPoint.pressurePsi} PSI.`,
      mode: 'clamp-high',
    };
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const low = points[i];
    const high = points[i + 1];
    if (pressurePsi > low.pressurePsi && pressurePsi < high.pressurePsi) {
      const ratio = (pressurePsi - low.pressurePsi) / (high.pressurePsi - low.pressurePsi);
      return {
        flowGpm: low.flowGpm + (high.flowGpm - low.flowGpm) * ratio,
        radiusFt: low.radiusFt + (high.radiusFt - low.radiusFt) * ratio,
        warning: null,
        mode: 'interpolated',
      };
    }
  }

  return { warning: 'Unable to resolve pressure lookup.' };
}

function clearSelect(selectEl) {
  while (selectEl.options.length > 0) {
    selectEl.remove(0);
  }
}

function setOptions(selectEl, values, placeholder) {
  clearSelect(selectEl);
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  selectEl.appendChild(first);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
}

function getManufacturers() {
  if (!catalogState) return [];
  return [...new Set(catalogState.models.map((m) => m.manufacturer))].sort();
}

function getHeads(manufacturer) {
  if (!catalogState || !manufacturer) return [];
  return [...new Set(catalogState.models.filter((m) => m.manufacturer === manufacturer).map((m) => m.headModel))].sort();
}

function getNozzles(manufacturer, headModel) {
  if (!catalogState || !manufacturer || !headModel) return [];
  return [
    ...new Set(
      catalogState.models
        .filter((m) => m.manufacturer === manufacturer && m.headModel === headModel)
        .map((m) => m.nozzleModel),
    ),
  ].sort();
}

function findSelectedModel() {
  const manufacturer = manufacturerSelect.value;
  const headModel = headSelect.value;
  const nozzleModel = nozzleSelect.value;
  if (!catalogState || !manufacturer || !headModel || !nozzleModel) return null;
  return catalogState.models.find(
    (m) => m.manufacturer === manufacturer && m.headModel === headModel && m.nozzleModel === nozzleModel,
  );
}

manufacturerSelect.addEventListener('change', () => {
  setOptions(headSelect, getHeads(manufacturerSelect.value), 'Select head model');
  setOptions(nozzleSelect, [], 'Select nozzle model');
});

headSelect.addEventListener('change', () => {
  setOptions(nozzleSelect, getNozzles(manufacturerSelect.value, headSelect.value), 'Select nozzle model');
});

catalogInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = parseCsv(await file.text());
    const { models, warnings } = buildCatalog(rows);
    if (models.length === 0) {
      setCatalogStatus(`Catalog import failed. ${warnings.slice(0, 3).join(' | ') || 'No valid rows found.'}`);
      return;
    }

    catalogState = { version: 1, models };
    setOptions(manufacturerSelect, getManufacturers(), 'Select manufacturer');
    setOptions(headSelect, [], 'Select head model');
    setOptions(nozzleSelect, [], 'Select nozzle model');

    const warningText = warnings.length ? ` Warnings: ${warnings.length}.` : '';
    setCatalogStatus(`Imported ${models.length} model/nozzle combinations.${warningText}`);
  } catch (error) {
    setCatalogStatus(`Failed to parse CSV: ${error.message}`);
  } finally {
    catalogInput.value = '';
  }
});

lookupBtn.addEventListener('click', () => {
  const model = findSelectedModel();
  const pressurePsi = Number(pressureInput.value);

  if (!model) {
    lookupResult.textContent = 'Please select manufacturer, head model, and nozzle model first.';
    return;
  }

  if (Number.isNaN(pressurePsi) || pressurePsi <= 0) {
    lookupResult.textContent = 'Please enter a valid pressure PSI value.';
    return;
  }

  const result = lookupPerformance(model, pressurePsi);
  if (result.flowGpm == null || result.radiusFt == null) {
    lookupResult.textContent = result.warning || 'Lookup failed.';
    return;
  }

  const warningText = result.warning ? ` Warning: ${result.warning}` : '';
  lookupResult.textContent = `Flow: ${result.flowGpm.toFixed(2)} gpm | Radius: ${result.radiusFt.toFixed(2)} ft (${result.mode}).${warningText}`;
});

newBtn.addEventListener('click', () => {
  project = structuredClone(emptyProject);
  alert('New project created.');
});

saveBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sprinklers-project.json';
  a.click();
  URL.revokeObjectURL(url);
});

loadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const loaded = JSON.parse(await file.text());
    if (typeof loaded !== 'object' || loaded === null || !('version' in loaded)) {
      throw new Error('Invalid project JSON');
    }
    project = loaded;
    alert('Project loaded successfully.');
  } catch (error) {
    alert(`Failed to load project: ${error.message}`);
  } finally {
    loadInput.value = '';
  }
});
