const zoneColors = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#00a3a3', '#6f4e37'];
const radiusScalePxPerFt = 4;

const defaultCatalogs = [
  {
    label: 'Hunter PGP-ADJ all',
    path: 'data/default-catalogs/hunter_pgp_adj_all.csv',
    fileName: 'hunter_pgp_adj_all.csv',
  },
  {
    label: 'Blue nozzles',
    path: 'data/default-catalogs/hunter_pgp_adj_blue.csv',
    fileName: 'hunter_pgp_adj_blue.csv',
  },
  {
    label: 'Red nozzles',
    path: 'data/default-catalogs/hunter_pgp_adj_red.csv',
    fileName: 'hunter_pgp_adj_red.csv',
  },
  {
    label: 'Grey low angle',
    path: 'data/default-catalogs/hunter_pgp_adj_grey_low_angle.csv',
    fileName: 'hunter_pgp_adj_grey_low_angle.csv',
  },
];

const emptyProject = {
  version: 1,
  site: { name: 'New Site', address: '', imageSource: 'satellite' },
  zones: [],
  sprinklers: [],
};

let project = structuredClone(emptyProject);
let catalogState = null;
let selectedSprinklerId = null;
let dragState = null;

const newBtn = document.getElementById('new-project');
const saveBtn = document.getElementById('save-project');
const loadInput = document.getElementById('load-project');
const catalogInput = document.getElementById('load-catalog');
const catalogStatus = document.getElementById('catalog-status');
const defaultCatalogList = document.getElementById('default-catalog-list');
const manufacturerSelect = document.getElementById('manufacturer-select');
const headSelect = document.getElementById('head-select');
const nozzleSelect = document.getElementById('nozzle-select');
const pressureInput = document.getElementById('pressure-input');
const lookupBtn = document.getElementById('lookup-performance');
const lookupResult = document.getElementById('lookup-result');
const siteNameInput = document.getElementById('site-name');
const siteAddressInput = document.getElementById('site-address');
const zonesList = document.getElementById('zones-list');
const addZoneBtn = document.getElementById('add-zone');
const mapCanvas = document.getElementById('map-canvas');
const coverageLayer = document.getElementById('coverage-layer');
const sprinklerLayer = document.getElementById('sprinkler-layer');
const emptyCanvasHint = document.getElementById('empty-canvas-hint');
const sprinklerCount = document.getElementById('sprinkler-count');
const analysisSummary = document.getElementById('analysis-summary');
const noSelection = document.getElementById('no-selection');
const sprinklerForm = document.getElementById('sprinkler-form');
const selectedZone = document.getElementById('selected-zone');
const selectedHead = document.getElementById('selected-head');
const selectedNozzle = document.getElementById('selected-nozzle');
const selectedPressure = document.getElementById('selected-pressure');
const selectedFlow = document.getElementById('selected-flow');
const selectedRadius = document.getElementById('selected-radius');
const selectedArc = document.getElementById('selected-arc');
const selectedOrientation = document.getElementById('selected-orientation');
const applyCatalogToSelectedBtn = document.getElementById('apply-catalog-to-selected');
const deleteSelectedBtn = document.getElementById('delete-selected');

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

function loadCatalogFromText(text, sourceLabel) {
  const rows = parseCsv(text);
  const { models, warnings } = buildCatalog(rows);
  if (models.length === 0) {
    setCatalogStatus(`Catalog import failed. ${warnings.slice(0, 3).join(' | ') || 'No valid rows found.'}`);
    return false;
  }

  catalogState = { version: 1, models };
  setOptions(manufacturerSelect, getManufacturers(), 'Select manufacturer');
  setOptions(headSelect, [], 'Select head model');
  setOptions(nozzleSelect, [], 'Select nozzle model');

  const warningText = warnings.length ? ` Warnings: ${warnings.length}.` : '';
  setCatalogStatus(`Imported ${sourceLabel}: ${models.length} model/nozzle combinations.${warningText}`);
  return true;
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
    const arcDegrees = Number(row.arc_degrees || 360);

    if ([pressurePsi, flowGpm, radiusFt, arcDegrees].some((v) => Number.isNaN(v))) {
      warnings.push(`Row ${line}: pressure_psi, flow_gpm, radius_ft, and arc_degrees must be numeric`);
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
        defaultArcDegrees: arcDegrees,
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

function getZoneColor(zoneId) {
  const zoneIndex = Math.max(0, project.zones.findIndex((zone) => zone.id === zoneId));
  return zoneColors[zoneIndex % zoneColors.length];
}

function ensureDefaultZone() {
  if (project.zones.length > 0) return;
  project.zones.push({ id: crypto.randomUUID(), name: 'Zone 1' });
}

function updateProjectInputs() {
  siteNameInput.value = project.site?.name || '';
  siteAddressInput.value = project.site?.address || '';
}

function selectedSprinkler() {
  return project.sprinklers.find((sprinkler) => sprinkler.id === selectedSprinklerId) || null;
}

function normalizeSprinklerPosition(sprinkler, index) {
  if (Number.isFinite(sprinkler.xPercent) && Number.isFinite(sprinkler.yPercent)) return sprinkler;

  return {
    ...sprinkler,
    xPercent: Math.min(90, 35 + index * 12),
    yPercent: Math.min(85, 40 + index * 10),
  };
}

function hydrateProject(loaded) {
  project = {
    ...structuredClone(emptyProject),
    ...loaded,
    site: { ...emptyProject.site, ...(loaded.site || {}) },
    zones: Array.isArray(loaded.zones) ? loaded.zones.map((zone) => ({ ...zone })) : [],
    sprinklers: Array.isArray(loaded.sprinklers)
      ? loaded.sprinklers.map((sprinkler, index) => normalizeSprinklerPosition({ ...sprinkler }, index))
      : [],
  };
  ensureDefaultZone();
  selectedSprinklerId = project.sprinklers[0]?.id || null;
  render();
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00';
}

function sprinklerAreaSqft(sprinkler) {
  const radius = Number(sprinkler.radiusFt) || 0;
  const arc = Math.min(360, Math.max(1, Number(sprinkler.arcDegrees) || 360));
  return (arc / 360) * Math.PI * radius * radius;
}

function sprinklerPr(sprinkler) {
  const flow = Number(sprinkler.flowGpm) || 0;
  const area = sprinklerAreaSqft(sprinkler);
  if (area <= 0) return 0;
  return (96.3 * flow) / area;
}

function renderZones() {
  zonesList.replaceChildren();
  project.zones.forEach((zone, index) => {
    const row = document.createElement('div');
    row.className = 'zone-row';

    const swatch = document.createElement('span');
    swatch.className = 'zone-swatch';
    swatch.style.backgroundColor = zoneColors[index % zoneColors.length];

    const input = document.createElement('input');
    input.value = zone.name;
    input.setAttribute('aria-label', `Zone ${index + 1} name`);
    input.addEventListener('input', () => {
      zone.name = input.value || `Zone ${index + 1}`;
      renderInspector();
      renderAnalysis();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete zone';
    deleteBtn.addEventListener('click', () => {
      if (project.zones.length === 1) return;
      const fallbackZoneId = project.zones.find((candidate) => candidate.id !== zone.id)?.id;
      project.sprinklers.forEach((sprinkler) => {
        if (sprinkler.zoneId === zone.id) sprinkler.zoneId = fallbackZoneId;
      });
      project.zones = project.zones.filter((candidate) => candidate.id !== zone.id);
      render();
    });

    row.append(swatch, input, deleteBtn);
    zonesList.appendChild(row);
  });
}

function renderCanvas() {
  coverageLayer.replaceChildren();
  sprinklerLayer.replaceChildren();
  emptyCanvasHint.classList.toggle('hidden', project.sprinklers.length > 0);
  sprinklerCount.textContent = `${project.sprinklers.length} sprinkler${project.sprinklers.length === 1 ? '' : 's'}`;

  project.sprinklers.forEach((sprinkler) => {
    const color = getZoneColor(sprinkler.zoneId);
    const radiusPx = Math.max(10, (Number(sprinkler.radiusFt) || 0) * radiusScalePxPerFt);
    const arc = Math.min(360, Math.max(1, Number(sprinkler.arcDegrees) || 360));
    const orientation = Number(sprinkler.orientationDegrees) || 0;

    const coverage = document.createElement('div');
    coverage.className = `coverage ${arc >= 360 ? 'full' : 'sector'}`;
    coverage.style.left = `${sprinkler.xPercent}%`;
    coverage.style.top = `${sprinkler.yPercent}%`;
    coverage.style.width = `${radiusPx * 2}px`;
    coverage.style.height = `${radiusPx * 2}px`;
    coverage.style.color = color;
    coverage.style.setProperty('--arc-angle', `${arc}deg`);
    coverage.style.setProperty('--start-angle', `${orientation - arc / 2}deg`);
    coverageLayer.appendChild(coverage);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `sprinkler-marker ${sprinkler.id === selectedSprinklerId ? 'selected' : ''}`;
    marker.style.left = `${sprinkler.xPercent}%`;
    marker.style.top = `${sprinkler.yPercent}%`;
    marker.style.backgroundColor = color;
    marker.title = `${sprinkler.headModel || 'Sprinkler'} (${formatNumber(sprinklerPr(sprinkler), 2)} in/hr)`;
    marker.setAttribute('aria-label', `Select sprinkler ${sprinkler.headModel || sprinkler.id}`);
    marker.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      selectedSprinklerId = sprinkler.id;
      dragState = { id: sprinkler.id, pointerId: event.pointerId };
      marker.setPointerCapture(event.pointerId);
      renderInspector();
      renderCanvas();
    });
    sprinklerLayer.appendChild(marker);
  });
}

function renderInspector() {
  clearSelect(selectedZone);
  project.zones.forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zone.name;
    selectedZone.appendChild(option);
  });

  const sprinkler = selectedSprinkler();
  noSelection.classList.toggle('hidden', Boolean(sprinkler));
  sprinklerForm.classList.toggle('hidden', !sprinkler);
  if (!sprinkler) return;

  selectedZone.value = sprinkler.zoneId;
  selectedHead.value = sprinkler.headModel || '';
  selectedNozzle.value = sprinkler.nozzleModel || '';
  selectedPressure.value = sprinkler.pressurePsi ?? 45;
  selectedFlow.value = sprinkler.flowGpm ?? 0;
  selectedRadius.value = sprinkler.radiusFt ?? 0;
  selectedArc.value = sprinkler.arcDegrees ?? 360;
  selectedOrientation.value = sprinkler.orientationDegrees ?? 0;
}

function renderAnalysis() {
  analysisSummary.replaceChildren();

  const totalFlow = project.sprinklers.reduce((sum, sprinkler) => sum + (Number(sprinkler.flowGpm) || 0), 0);
  const totalArea = project.sprinklers.reduce((sum, sprinkler) => sum + sprinklerAreaSqft(sprinkler), 0);
  const overallPr = totalArea > 0 ? (96.3 * totalFlow) / totalArea : 0;
  const missingData = project.sprinklers.filter((sprinkler) => !sprinkler.flowGpm || !sprinkler.radiusFt).length;

  addAnalysisCard('Total flow', `${formatNumber(totalFlow)} gpm`, `${project.sprinklers.length} sprinklers`);
  addAnalysisCard('Throw area', `${formatNumber(totalArea, 0)} sq ft`, 'Sector-adjusted estimate');
  addAnalysisCard('Overall PR', `${formatNumber(overallPr)} in/hr`, 'Based on total flow / throw area');

  project.zones.forEach((zone) => {
    const zoneSprinklers = project.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id);
    const zoneFlow = zoneSprinklers.reduce((sum, sprinkler) => sum + (Number(sprinkler.flowGpm) || 0), 0);
    const zoneArea = zoneSprinklers.reduce((sum, sprinkler) => sum + sprinklerAreaSqft(sprinkler), 0);
    const zonePr = zoneArea > 0 ? (96.3 * zoneFlow) / zoneArea : 0;
    addAnalysisCard(zone.name, `${formatNumber(zonePr)} in/hr`, `${formatNumber(zoneFlow)} gpm · ${zoneSprinklers.length} heads`);
  });

  if (missingData > 0) {
    addAnalysisCard('Warning', `${missingData} incomplete`, 'Add flow and radius data before trusting PR.', true);
  }
}

function addAnalysisCard(label, value, detail, warning = false) {
  const card = document.createElement('div');
  card.className = `analysis-card ${warning ? 'warning-card' : ''}`;
  card.innerHTML = `<span>${label}</span><strong>${value}</strong><span>${detail}</span>`;
  analysisSummary.appendChild(card);
}

function render() {
  updateProjectInputs();
  renderZones();
  renderCanvas();
  renderInspector();
  renderAnalysis();
}

function canvasPositionFromEvent(event) {
  const rect = mapCanvas.getBoundingClientRect();
  return {
    xPercent: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
    yPercent: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
  };
}

function addSprinklerAt(position) {
  ensureDefaultZone();
  const model = findSelectedModel();
  const pressurePsi = Number(pressureInput.value) || 45;
  const performance = model ? lookupPerformance(model, pressurePsi) : null;
  const sprinkler = {
    id: crypto.randomUUID(),
    zoneId: project.zones[0].id,
    ...position,
    headModel: model?.headModel || 'Unspecified head',
    nozzleModel: model?.nozzleModel || 'Unspecified nozzle',
    pressurePsi,
    arcDegrees: model?.defaultArcDegrees || 360,
    orientationDegrees: 0,
    radiusFt: performance?.radiusFt ?? 12,
    flowGpm: performance?.flowGpm ?? 1,
  };
  project.sprinklers.push(sprinkler);
  selectedSprinklerId = sprinkler.id;
  render();
}

function updateSelectedSprinklerFromForm() {
  const sprinkler = selectedSprinkler();
  if (!sprinkler) return;
  sprinkler.zoneId = selectedZone.value;
  sprinkler.headModel = selectedHead.value;
  sprinkler.nozzleModel = selectedNozzle.value;
  sprinkler.pressurePsi = Number(selectedPressure.value) || 0;
  sprinkler.flowGpm = Number(selectedFlow.value) || 0;
  sprinkler.radiusFt = Number(selectedRadius.value) || 0;
  sprinkler.arcDegrees = Math.min(360, Math.max(1, Number(selectedArc.value) || 360));
  sprinkler.orientationDegrees = ((Number(selectedOrientation.value) || 0) % 360 + 360) % 360;
  renderCanvas();
  renderAnalysis();
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
    loadCatalogFromText(await file.text(), file.name);
  } catch (error) {
    setCatalogStatus(`Failed to parse CSV: ${error.message}`);
  } finally {
    catalogInput.value = '';
  }
});

defaultCatalogs.forEach((catalog) => {
  const row = document.createElement('div');
  row.className = 'default-catalog-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `Import ${catalog.label}`;
  button.addEventListener('click', async () => {
    try {
      setCatalogStatus(`Importing ${catalog.label}...`);
      const response = await fetch(catalog.path);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      loadCatalogFromText(await response.text(), catalog.fileName);
    } catch (error) {
      setCatalogStatus(`Failed to import ${catalog.label}: ${error.message}`);
    }
  });

  const downloadLink = document.createElement('a');
  downloadLink.href = catalog.path;
  downloadLink.download = catalog.fileName;
  downloadLink.textContent = 'Download CSV';
  downloadLink.setAttribute('aria-label', `Download ${catalog.label} CSV for manual import`);

  row.append(button, downloadLink);
  defaultCatalogList.appendChild(row);
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
  hydrateProject(structuredClone(emptyProject));
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
    hydrateProject(loaded);
  } catch (error) {
    alert(`Failed to load project: ${error.message}`);
  } finally {
    loadInput.value = '';
  }
});

siteNameInput.addEventListener('input', () => {
  project.site.name = siteNameInput.value;
});

siteAddressInput.addEventListener('input', () => {
  project.site.address = siteAddressInput.value;
});

addZoneBtn.addEventListener('click', () => {
  project.zones.push({ id: crypto.randomUUID(), name: `Zone ${project.zones.length + 1}` });
  render();
});

mapCanvas.addEventListener('click', (event) => {
  if (event.target.closest('.sprinkler-marker')) return;
  addSprinklerAt(canvasPositionFromEvent(event));
});

sprinklerLayer.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const sprinkler = project.sprinklers.find((candidate) => candidate.id === dragState.id);
  if (!sprinkler) return;
  Object.assign(sprinkler, canvasPositionFromEvent(event));
  renderCanvas();
});

sprinklerLayer.addEventListener('pointerup', () => {
  dragState = null;
});

sprinklerLayer.addEventListener('pointercancel', () => {
  dragState = null;
});

[selectedZone, selectedHead, selectedNozzle, selectedPressure, selectedFlow, selectedRadius, selectedArc, selectedOrientation].forEach(
  (input) => input.addEventListener('input', updateSelectedSprinklerFromForm),
);

applyCatalogToSelectedBtn.addEventListener('click', () => {
  const sprinkler = selectedSprinkler();
  const model = findSelectedModel();
  const pressurePsi = Number(pressureInput.value);
  if (!sprinkler || !model || Number.isNaN(pressurePsi) || pressurePsi <= 0) return;
  const result = lookupPerformance(model, pressurePsi);
  if (result.flowGpm == null || result.radiusFt == null) return;
  Object.assign(sprinkler, {
    headModel: model.headModel,
    nozzleModel: model.nozzleModel,
    pressurePsi,
    flowGpm: result.flowGpm,
    radiusFt: result.radiusFt,
    arcDegrees: model.defaultArcDegrees || sprinkler.arcDegrees,
  });
  lookupResult.textContent = `Applied ${model.headModel} / ${model.nozzleModel} to selected sprinkler.`;
  render();
});

deleteSelectedBtn.addEventListener('click', () => {
  if (!selectedSprinklerId) return;
  project.sprinklers = project.sprinklers.filter((sprinkler) => sprinkler.id !== selectedSprinklerId);
  selectedSprinklerId = project.sprinklers[0]?.id || null;
  render();
});

hydrateProject(emptyProject);
setOptions(manufacturerSelect, [], 'Select manufacturer');
setOptions(headSelect, [], 'Select head model');
setOptions(nozzleSelect, [], 'Select nozzle model');
