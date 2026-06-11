import { radialPrecipitationRateInHr } from './precipitation-model.js';
const zoneColors = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#00a3a3', '#6f4e37'];
const defaultFeetPerPixel = 0.25;
const earthRadiusFeet = 20925524.9;
const mapViewMinScale = 0.5;
const mapViewMaxScale = 4;
const defaultPrecipitationGridCellFeet = 1;
const minPrecipitationGridCellFeet = 0.5;
const maxPrecipitationGridCellFeet = 5;
const precipitationGridCellFeetStep = 0.5;
const minPrecipitationGridCellPx = 1;
const precipitationColorStops = [
  { value: 0, color: [215, 48, 31] },
  { value: 0.5, color: [253, 141, 60] },
  { value: 1, color: [255, 232, 120] },
  { value: 1.5, color: [116, 196, 118] },
  { value: 2, color: [49, 163, 84] },
];
const maxPrecipitationColorStop = precipitationColorStops[precipitationColorStops.length - 1];
const minRadialSpreadRadiusRatio = 0.08;
const rectangleSpreadNormalizationSampleCount = 32;
const rectangleSpreadNormalizationCache = new Map();
const minPrecipitationContourInterval = 0.05;
const maxPrecipitationContourInterval = 1;
const precipitationContourIntervalStep = 0.05;
const defaultPrecipitationContourInterval = 0.25;
const defaultZoneWaterShare = 1;
const arcPatternType = 'arc';
const rectanglePatternType = 'rectangle';

const imagerySources = {
  'esri-world': {
    label: 'Esri World Imagery',
    url: ({ zoom, y, x }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`,
    detail: 'Best global no-key default.',
    maxNativeZoom: 19,
  },
  'esri-clarity': {
    label: 'Esri World Imagery Clarity',
    url: ({ zoom, y, x }) => `https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`,
    detail: 'Archive-style Esri imagery that can be clearer or leaf-off in some areas.',
    maxNativeZoom: 19,
  },
  'usgs-imagery': {
    label: 'USGS Imagery Only',
    url: ({ zoom, y, x }) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${zoom}/${y}/${x}`,
    detail: 'U.S.-only public imagery; useful as an alternate source.',
    maxNativeZoom: 19,
  },
};

const defaultCatalog = { label: 'Built-in sprinkler catalog', path: 'data/default-catalogs/default_sprinkler_catalog.csv' };

const emptyProject = {
  version: 1,
  site: {
    name: 'New Site',
    address: '',
    imageSource: 'yard',
    satellite: { latitude: null, longitude: null, zoom: 19, source: 'esri-world' },
    backgroundImage: { dataUrl: '', name: '', scale: 1, rotationDegrees: 0 },
    distanceScale: { feetPerPixel: defaultFeetPerPixel, points: [], measuredFeet: null },
    mapView: { scale: 1, panX: 0, panY: 0, rotationDegrees: 0 },
    canvasLayers: {},
    precipitationContourInterval: defaultPrecipitationContourInterval,
    precipitationGridCellFeet: defaultPrecipitationGridCellFeet,
    grassAreas: [],
  },
  zones: [],
  sprinklers: [],
};

let project = structuredClone(emptyProject);
let catalogState = null;
let selectedSprinklerId = null;
let inspectedZoneId = null;
let dragState = null;
let panState = null;
let calibrationState = null;
let suppressNextCanvasClick = false;
let contextMenuSprinklerId = null;
let backgroundImageNaturalSize = null;
let backgroundImageBaseSize = null;
let backgroundImageNaturalDataUrl = '';
let suppressEmptyCanvasHint = false;
let showPrecipitationMap = false;
let precipitationContourInterval = defaultPrecipitationContourInterval;
let precipitationGridCellFeet = defaultPrecipitationGridCellFeet;
let grassDrawingState = null;

const newBtn = document.getElementById('new-project');
const saveBtn = document.getElementById('save-project');
const loadInput = document.getElementById('load-project');
const catalogInput = document.getElementById('load-catalog');
const catalogStatus = document.getElementById('catalog-status');
const manufacturerSelect = document.getElementById('manufacturer-select');
const headSelect = document.getElementById('head-select');
const nozzleSelect = document.getElementById('nozzle-select');
const pressureInput = document.getElementById('pressure-input');
const lookupResult = document.getElementById('lookup-result');
const siteNameInput = document.getElementById('site-name');
const siteAddressInput = document.getElementById('site-address');
const canvasBackgroundSelect = document.getElementById('canvas-background');
const satelliteControls = document.getElementById('satellite-controls');
const imageControls = document.getElementById('image-controls');
const backgroundImageInput = document.getElementById('load-background-image');
const imageScaleInput = document.getElementById('image-scale');
const imageScaleValue = document.getElementById('image-scale-value');
const imageRotationInput = document.getElementById('image-rotation');
const imageRotationValue = document.getElementById('image-rotation-value');
const imageStatus = document.getElementById('image-status');
const startScaleCalibrationBtn = document.getElementById('start-scale-calibration');
const clearScaleCalibrationBtn = document.getElementById('clear-scale-calibration');
const scaleCalibrationStatus = document.getElementById('scale-calibration-status');
const satelliteLatitudeInput = document.getElementById('satellite-latitude');
const satelliteLongitudeInput = document.getElementById('satellite-longitude');
const satelliteSourceSelect = document.getElementById('satellite-source');
const satelliteZoomInput = document.getElementById('satellite-zoom');
const satelliteZoomValue = document.getElementById('satellite-zoom-value');
const backgroundRotationInput = document.getElementById('background-rotation');
const backgroundRotationValue = document.getElementById('background-rotation-value');
const addressLookupBtn = document.getElementById('lookup-address');
const addressLookupStatus = document.getElementById('address-lookup-status');
const satelliteStatus = document.getElementById('satellite-status');
const resetMapViewBtn = document.getElementById('reset-map-view');
const zonesList = document.getElementById('zones-list');
const zoneInspectorSelect = document.getElementById('zone-inspector-select');
const canvasZoneControls = document.querySelector('.canvas-zone-controls');
const zoneSprinklerSelect = document.getElementById('zone-sprinkler-select');
const addZoneBtn = document.getElementById('add-zone');
const mapCanvas = document.getElementById('map-canvas');
const mapWorld = document.getElementById('map-world');
const satelliteLayer = document.getElementById('satellite-layer');
const imageLayer = document.getElementById('image-layer');
const grassLayer = document.getElementById('grass-layer');
const coverageLayer = document.getElementById('coverage-layer');
const calibrationLayer = document.getElementById('calibration-layer');
const sprinklerLayer = document.getElementById('sprinkler-layer');
const emptyCanvasHint = document.getElementById('empty-canvas-hint');
const layerSelectorList = document.getElementById('layer-selector-list');
const sprinklerCount = document.getElementById('sprinkler-count');
const analysisSummary = document.getElementById('analysis-summary');
const noSelection = document.getElementById('no-selection');
const sprinklerPanel = document.getElementById('sprinklers-panel');
const sprinklerForm = document.getElementById('sprinkler-form');
const selectedSprinklerFields = document.getElementById('selected-sprinkler-fields');
const selectedZone = document.getElementById('selected-zone');
const selectedHead = document.getElementById('selected-head');
const selectedNozzle = document.getElementById('selected-nozzle');
const selectedPressure = document.getElementById('selected-pressure');
const selectedFlow = document.getElementById('selected-flow');
const selectedRadius = document.getElementById('selected-radius');
const selectedArc = document.getElementById('selected-arc');
const selectedOrientation = document.getElementById('selected-orientation');
const selectedPressureRegulating = document.getElementById('selected-pressure-regulating');
const applyCatalogToSelectedBtn = document.getElementById('apply-catalog-to-selected');
const deleteSelectedBtn = document.getElementById('delete-selected');
const sprinklerContextMenu = document.getElementById('sprinkler-context-menu');
const contextDeleteSprinklerBtn = document.getElementById('context-delete-sprinkler');
const contextZoneSelect = document.getElementById('context-zone-select');
const precipitationUi = createPrecipitationUi();
const precipitationLayer = precipitationUi.layer;
const showPrecipitationMapInput = precipitationUi.input;
const precipitationLegend = precipitationUi.legend;
const precipitationLegendRange = precipitationUi.legendRange;
const precipitationContourSummary = precipitationUi.contourSummary;
const precipitationContourIntervalSelect = precipitationUi.contourIntervalSelect;
const precipitationGridCellInput = precipitationUi.gridCellInput;
const precipitationGridCellValue = precipitationUi.gridCellValue;
const startGrassAreaBtn = document.getElementById('start-grass-area');
const finishGrassAreaBtn = document.getElementById('finish-grass-area');
const cancelGrassAreaBtn = document.getElementById('cancel-grass-area');
const clearGrassAreasBtn = document.getElementById('clear-grass-areas');
const grassAreaCount = document.getElementById('grass-area-count');
const precipitationContourIntervalInput = precipitationUi.contourIntervalInput;
const precipitationContourIntervalValue = precipitationUi.contourIntervalValue;
const precipitationTooltip = precipitationUi.tooltip;


function createPrecipitationUi() {
  let layer = document.getElementById('precipitation-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'precipitation-layer';
    layer.className = 'precipitation-layer';
    layer.setAttribute('aria-hidden', 'true');
    mapWorld.insertBefore(layer, calibrationLayer);
  }
  layer.dataset.canvasLayer = '';
  layer.dataset.layerLabel = 'Combined precipitation rate';
  layer.dataset.layerDescription = 'Heat map showing stacked precipitation where sprinkler throws overlap inside marked grass areas.';
  layer.dataset.layerDefaultVisible = 'true';

  let input = document.getElementById('show-precipitation-map');
  if (!input) {
    const label = document.createElement('label');
    label.className = 'overlay-toggle';
    label.htmlFor = 'show-precipitation-map';
    label.title = 'Show a combined precipitation-rate heat map across all sprinkler throw overlaps.';

    input = document.createElement('input');
    input.id = 'show-precipitation-map';
    input.type = 'checkbox';

    label.append(input, document.createTextNode(' Combined precipitation rate'));
    sprinklerCount.parentElement.insertBefore(label, sprinklerCount);
  }

  let contourIntervalInput = document.getElementById('precipitation-contour-interval');
  let contourIntervalValue = document.getElementById('precipitation-contour-interval-value');
  if (!contourIntervalInput) {
    const label = document.createElement('label');
    label.className = 'overlay-toggle precipitation-contour-control';
    label.htmlFor = 'precipitation-contour-interval';
    label.title = 'Choose the precipitation-rate interval between contour lines.';

    const labelText = document.createElement('span');
    labelText.textContent = 'Contours';

    contourIntervalInput = document.createElement('input');
    contourIntervalInput.id = 'precipitation-contour-interval';
    contourIntervalInput.type = 'range';
    contourIntervalInput.setAttribute('aria-label', 'Precipitation contour interval');

    contourIntervalValue = document.createElement('span');
    contourIntervalValue.id = 'precipitation-contour-interval-value';
    contourIntervalValue.className = 'precipitation-contour-value';

    label.append(labelText, contourIntervalInput, contourIntervalValue);
    sprinklerCount.parentElement.insertBefore(label, sprinklerCount);
  } else if (contourIntervalInput.tagName === 'SELECT') {
    const rangeInput = document.createElement('input');
    rangeInput.id = contourIntervalInput.id;
    rangeInput.type = 'range';
    rangeInput.setAttribute('aria-label', contourIntervalInput.getAttribute('aria-label') || 'Precipitation contour interval');
    contourIntervalInput.replaceWith(rangeInput);
    contourIntervalInput = rangeInput;
  }
  contourIntervalInput.type = 'range';
  contourIntervalInput.min = String(minPrecipitationContourInterval);
  contourIntervalInput.max = String(maxPrecipitationContourInterval);
  contourIntervalInput.step = String(precipitationContourIntervalStep);
  if (!contourIntervalValue) {
    contourIntervalValue = document.createElement('span');
    contourIntervalValue.id = 'precipitation-contour-interval-value';
    contourIntervalValue.className = 'precipitation-contour-value';
    contourIntervalInput.insertAdjacentElement('afterend', contourIntervalValue);
  }

  let gridCellInput = document.getElementById('precipitation-grid-cell-feet');
  let gridCellValue = document.getElementById('precipitation-grid-cell-feet-value');
  if (!gridCellInput) {
    const label = document.createElement('label');
    label.className = 'overlay-toggle precipitation-grid-control';
    label.htmlFor = 'precipitation-grid-cell-feet';
    label.title = 'Choose the precipitation overlay sampling grid size. Larger cells render faster with less contour detail.';

    const labelText = document.createElement('span');
    labelText.textContent = 'Grid';

    gridCellInput = document.createElement('input');
    gridCellInput.id = 'precipitation-grid-cell-feet';
    gridCellInput.type = 'range';
    gridCellInput.setAttribute('aria-label', 'Precipitation grid cell size in feet');

    gridCellValue = document.createElement('span');
    gridCellValue.id = 'precipitation-grid-cell-feet-value';
    gridCellValue.className = 'precipitation-contour-value';

    label.append(labelText, gridCellInput, gridCellValue);
    sprinklerCount.parentElement.insertBefore(label, sprinklerCount);
  }
  gridCellInput.type = 'range';
  gridCellInput.min = String(minPrecipitationGridCellFeet);
  gridCellInput.max = String(maxPrecipitationGridCellFeet);
  gridCellInput.step = String(precipitationGridCellFeetStep);
  if (!gridCellValue) {
    gridCellValue = document.createElement('span');
    gridCellValue.id = 'precipitation-grid-cell-feet-value';
    gridCellValue.className = 'precipitation-contour-value';
    gridCellInput.insertAdjacentElement('afterend', gridCellValue);
  }

  let legend = document.getElementById('precipitation-legend');
  let legendRange = document.getElementById('precipitation-legend-range');
  if (!legend || !legendRange) {
    legend = document.createElement('div');
    legend.id = 'precipitation-legend';
    legend.className = 'precipitation-legend hidden';
    legend.innerHTML = `
      <div class="precipitation-legend-title">Combined precipitation rate</div>
      <div class="precipitation-legend-gradient"></div>
      <div class="precipitation-legend-labels"><span>Low</span><span>High</span></div>
      <div id="precipitation-legend-range" class="precipitation-legend-range">0 in/hr</div>
      <div id="precipitation-contour-summary" class="precipitation-legend-range"></div>
    `;
    mapCanvas.insertBefore(legend, sprinklerContextMenu);
    legendRange = legend.querySelector('#precipitation-legend-range');
  }

  let contourSummary = legend.querySelector('#precipitation-contour-summary');
  if (!contourSummary) {
    contourSummary = document.createElement('div');
    contourSummary.id = 'precipitation-contour-summary';
    contourSummary.className = 'precipitation-legend-range';
    legend.appendChild(contourSummary);
  }

  let tooltip = document.getElementById('precipitation-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'precipitation-tooltip';
    tooltip.className = 'precipitation-tooltip hidden';
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');
    mapCanvas.insertBefore(tooltip, sprinklerContextMenu);
  }

  return { layer, input, legend, legendRange, contourSummary, contourIntervalInput, contourIntervalValue, gridCellInput, gridCellValue, tooltip };
}

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
  syncCatalogPressureInput(null);
  updateLookupResult();

  const warningText = warnings.length ? ` Warnings: ${warnings.length}.` : '';
  setCatalogStatus(`Loaded ${sourceLabel}: ${models.length} model/nozzle combinations.${warningText}`);
  return true;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['true', 'yes', 'y', '1'].includes(String(value).trim().toLowerCase());
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePrecipitationContourInterval(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return defaultPrecipitationContourInterval;
  const snapped = Math.round(parsed / precipitationContourIntervalStep) * precipitationContourIntervalStep;
  return Number(Math.min(maxPrecipitationContourInterval, Math.max(minPrecipitationContourInterval, snapped)).toFixed(2));
}

function normalizePrecipitationGridCellFeet(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return defaultPrecipitationGridCellFeet;
  const snapped = Math.round(parsed / precipitationGridCellFeetStep) * precipitationGridCellFeetStep;
  return Number(Math.min(maxPrecipitationGridCellFeet, Math.max(minPrecipitationGridCellFeet, snapped)).toFixed(1));
}

function formatFeetSetting(feet) {
  return feet === 1 ? '1 ft' : `${formatNumber(feet, 1)} ft`;
}

function updatePrecipitationContourControl() {
  precipitationContourIntervalInput.value = String(precipitationContourInterval);
  precipitationContourIntervalInput.setAttribute('aria-valuetext', `${formatNumber(precipitationContourInterval, 2)} inches per hour`);
  precipitationContourIntervalValue.textContent = `${formatNumber(precipitationContourInterval, 2)} in/hr`;
  precipitationGridCellInput.value = String(precipitationGridCellFeet);
  precipitationGridCellInput.setAttribute('aria-valuetext', `${formatFeetSetting(precipitationGridCellFeet)} grid cells`);
  precipitationGridCellValue.textContent = formatFeetSetting(precipitationGridCellFeet);
}

function updatePrecipitationSettingsFromControl(control) {
  if (control === precipitationContourIntervalInput) {
    precipitationContourInterval = normalizePrecipitationContourInterval(control.value);
    project.site.precipitationContourInterval = precipitationContourInterval;
  } else if (control === precipitationGridCellInput) {
    precipitationGridCellFeet = normalizePrecipitationGridCellFeet(control.value);
    project.site.precipitationGridCellFeet = precipitationGridCellFeet;
  } else {
    return;
  }

  updatePrecipitationContourControl();
  renderCanvas();
}

function nominalPrecipitationFromRow(row) {
  return {
    catalog: parseOptionalNumber(row.precip_in_hr ?? row.precipitation_in_hr ?? row.precip_default_in_hr),
    square: parseOptionalNumber(row.precip_square_in_hr ?? row.precip_square ?? row.square_spacing_pr_in_hr),
    triangular: parseOptionalNumber(row.precip_triangle_in_hr ?? row.precip_triangular_in_hr ?? row.triangular_spacing_pr_in_hr),
  };
}

function hasNominalPrecipitation(precipitation) {
  return Object.values(precipitation).some((value) => value !== null);
}

function interpolateNullableNumber(lowValue, highValue, ratio) {
  if (lowValue === null || highValue === null) return null;
  return lowValue + (highValue - lowValue) * ratio;
}

function normalizePatternType(value) {
  const patternType = String(value || '').trim().toLowerCase();
  if (patternType === rectanglePatternType) return rectanglePatternType;
  return arcPatternType;
}

function isRectanglePattern(sprinklerOrModel) {
  return normalizePatternType(sprinklerOrModel?.patternType) === rectanglePatternType;
}

function normalizeRectangleHeadOffset(value, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function patternTypeLabel(patternType) {
  return isRectanglePattern({ patternType }) ? 'rectangular throw' : 'arc/sector';
}

function interpolateNominalPrecipitation(lowPoint, highPoint, ratio) {
  const low = lowPoint.nominalPrecipitationInHr || {};
  const high = highPoint.nominalPrecipitationInHr || {};
  const precipitation = {
    catalog: interpolateNullableNumber(low.catalog ?? null, high.catalog ?? null, ratio),
    square: interpolateNullableNumber(low.square ?? null, high.square ?? null, ratio),
    triangular: interpolateNullableNumber(low.triangular ?? null, high.triangular ?? null, ratio),
  };
  return hasNominalPrecipitation(precipitation) ? precipitation : null;
}

function formatNominalPrecipitation(precipitation) {
  if (!precipitation || !hasNominalPrecipitation(precipitation)) return '';
  const parts = [];
  if (precipitation.catalog !== null && precipitation.catalog !== undefined) parts.push(`${formatNumber(precipitation.catalog)} catalog`);
  if (precipitation.square !== null && precipitation.square !== undefined) parts.push(`${formatNumber(precipitation.square)} square`);
  if (precipitation.triangular !== null && precipitation.triangular !== undefined) parts.push(`${formatNumber(precipitation.triangular)} triangular`);
  return parts.length ? ` Manufacturer nominal PR: ${parts.join(' / ')} in/hr; calculated PR uses effective flow, actual coverage area, and the normalized radial distribution model.` : '';
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
    const patternType = normalizePatternType(row.pattern_type);
    const widthFt = parseOptionalNumber(row.width_ft);
    const headOffsetX = parseOptionalNumber(row.head_offset_x);
    const headOffsetY = parseOptionalNumber(row.head_offset_y);

    if ([pressurePsi, flowGpm, radiusFt, arcDegrees].some((v) => Number.isNaN(v))) {
      warnings.push(`Row ${line}: pressure_psi, flow_gpm, radius_ft, and arc_degrees must be numeric`);
      return;
    }

    if (patternType === rectanglePatternType && (!Number.isFinite(widthFt) || widthFt <= 0)) {
      warnings.push(`Row ${line}: rectangle pattern rows must include a positive width_ft`);
      return;
    }

    if (patternType === rectanglePatternType) {
      const resolvedHeadOffsetX = headOffsetX;
      const resolvedHeadOffsetY = headOffsetY;
      if (![resolvedHeadOffsetX, resolvedHeadOffsetY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
        warnings.push(`Row ${line}: rectangle pattern rows must include head_offset_x and head_offset_y values from 0 to 1`);
        return;
      }
    }

    const manufacturer = row.manufacturer;
    const headModel = row.head_model;
    const nozzleModel = row.nozzle_model;
    const pressureRegulating = parseBoolean(row.pressure_regulating, false);
    const key = `${manufacturer}|${headModel}|${nozzleModel}`;

    if (!groups.has(key)) {
      groups.set(key, {
        manufacturer,
        headModel,
        nozzleModel,
        defaultArcDegrees: arcDegrees,
        patternType,
        headOffsetX: patternType === rectanglePatternType ? normalizeRectangleHeadOffset(headOffsetX, 0.5) : 0.5,
        headOffsetY: patternType === rectanglePatternType ? normalizeRectangleHeadOffset(headOffsetY, 0.5) : 0.5,
        pressureRegulating,
        points: [],
      });
    }

    const nominalPrecipitationInHr = nominalPrecipitationFromRow(row);
    const point = { pressurePsi, flowGpm, radiusFt };
    if (widthFt !== null) point.widthFt = widthFt;
    if (hasNominalPrecipitation(nominalPrecipitationInHr)) {
      point.nominalPrecipitationInHr = nominalPrecipitationInHr;
    }
    if (row.notes) point.notes = row.notes;

    groups.get(key).points.push(point);
  });

  const models = Array.from(groups.values()).map((model) => {
    model.points.sort((a, b) => a.pressurePsi - b.pressurePsi);
    return model;
  });

  return { models, warnings };
}


function selectedCatalogPressurePsi(model) {
  if (!model?.points?.length) return null;
  const preferredPoint = model.points.find((point) => point.pressurePsi === 45);
  return (preferredPoint || model.points[0]).pressurePsi;
}

function syncCatalogPressureInput(model = findSelectedModel()) {
  const pressurePsi = selectedCatalogPressurePsi(model);
  pressureInput.value = pressurePsi === null ? '' : formatNumber(pressurePsi, 1);
  return pressurePsi;
}

function lookupPerformance(model, pressurePsi) {
  const points = model.points;
  if (points.length === 0) {
    return { warning: 'No pressure points available for selected model.' };
  }

  const exact = points.find((point) => point.pressurePsi === pressurePsi);
  if (exact) {
    return {
      flowGpm: exact.flowGpm,
      radiusFt: exact.radiusFt,
      widthFt: exact.widthFt ?? null,
      nominalPrecipitationInHr: exact.nominalPrecipitationInHr || null,
      warning: null,
      mode: 'exact',
    };
  }

  if (pressurePsi < points[0].pressurePsi) {
    return {
      flowGpm: points[0].flowGpm,
      radiusFt: points[0].radiusFt,
      widthFt: points[0].widthFt ?? null,
      nominalPrecipitationInHr: points[0].nominalPrecipitationInHr || null,
      warning: `Pressure ${pressurePsi} PSI is below supported range; clamped to ${points[0].pressurePsi} PSI.`,
      mode: 'clamp-low',
    };
  }

  if (pressurePsi > points[points.length - 1].pressurePsi) {
    const maxPoint = points[points.length - 1];
    return {
      flowGpm: maxPoint.flowGpm,
      radiusFt: maxPoint.radiusFt,
      widthFt: maxPoint.widthFt ?? null,
      nominalPrecipitationInHr: maxPoint.nominalPrecipitationInHr || null,
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
        widthFt: interpolateNullableNumber(low.widthFt ?? null, high.widthFt ?? null, ratio),
        nominalPrecipitationInHr: interpolateNominalPrecipitation(low, high, ratio),
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

function normalizeZone(zone = {}, index = 0) {
  const pressurePsi = optionalNumber(zone.pressurePsi);
  const measuredFlowGpm = optionalNumber(zone.measuredFlowGpm);
  const waterShare = optionalNumber(zone.waterShare);
  return {
    id: zone.id || crypto.randomUUID(),
    name: zone.name || `Zone ${index + 1}`,
    pressurePsi: pressurePsi && pressurePsi > 0 ? pressurePsi : 45,
    measuredFlowGpm: measuredFlowGpm && measuredFlowGpm > 0 ? measuredFlowGpm : null,
    waterShare: waterShare && waterShare > 0 ? waterShare : defaultZoneWaterShare,
  };
}

function ensureDefaultZone() {
  if (project.zones.length > 0) return;
  project.zones.push(normalizeZone({ name: 'Zone 1' }));
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeSatelliteSettings(settings = {}) {
  const latitude = optionalNumber(settings.latitude);
  const longitude = optionalNumber(settings.longitude);
  const zoom = Number(settings.zoom);
  const source = imagerySources[settings.source] ? settings.source : 'esri-world';

  return {
    latitude: latitude === null ? null : Math.min(85, Math.max(-85, latitude)),
    longitude: longitude === null ? null : Math.min(180, Math.max(-180, longitude)),
    zoom: Number.isFinite(zoom) ? Math.min(21, Math.max(16, Math.round(zoom))) : 19,
    source,
  };
}

function normalizeMapViewSettings(settings = {}) {
  const scale = Number(settings.scale);
  const panX = Number(settings.panX);
  const panY = Number(settings.panY);
  const rotationDegrees = Number(settings.rotationDegrees);

  return {
    scale: Number.isFinite(scale) ? Math.min(mapViewMaxScale, Math.max(mapViewMinScale, scale)) : 1,
    panX: Number.isFinite(panX) ? panX : 0,
    panY: Number.isFinite(panY) ? panY : 0,
    rotationDegrees: Number.isFinite(rotationDegrees) ? Math.min(180, Math.max(-180, rotationDegrees)) : 0,
  };
}

function normalizeBackgroundImageSettings(settings = {}) {
  const scale = Number(settings.scale);
  const rotationDegrees = Number(settings.rotationDegrees);
  return {
    dataUrl: typeof settings.dataUrl === 'string' ? settings.dataUrl : '',
    name: typeof settings.name === 'string' ? settings.name : '',
    scale: Number.isFinite(scale) ? Math.min(4, Math.max(0.25, scale)) : 1,
    rotationDegrees: Number.isFinite(rotationDegrees) ? Math.min(180, Math.max(-180, rotationDegrees)) : 0,
  };
}

function normalizeDistanceScaleSettings(settings = {}) {
  const feetPerPixel = Number(settings.feetPerPixel);
  const measuredFeet = Number(settings.measuredFeet);
  const points = Array.isArray(settings.points)
    ? settings.points
        .map((point) => ({ xPercent: Number(point.xPercent), yPercent: Number(point.yPercent) }))
        .filter((point) => Number.isFinite(point.xPercent) && Number.isFinite(point.yPercent))
        .slice(0, 2)
    : [];

  return {
    feetPerPixel: Number.isFinite(feetPerPixel) && feetPerPixel > 0 ? feetPerPixel : defaultFeetPerPixel,
    points,
    measuredFeet: Number.isFinite(measuredFeet) && measuredFeet > 0 ? measuredFeet : null,
  };
}


function normalizeGrassArea(area = {}, index = 0) {
  const points = Array.isArray(area.points)
    ? area.points
        .map((point) => ({ xPercent: Number(point.xPercent), yPercent: Number(point.yPercent) }))
        .filter((point) => Number.isFinite(point.xPercent) && Number.isFinite(point.yPercent))
        .map((point) => ({
          xPercent: Math.min(100, Math.max(0, point.xPercent)),
          yPercent: Math.min(100, Math.max(0, point.yPercent)),
        }))
    : [];

  return {
    id: area.id || crypto.randomUUID(),
    name: area.name || `Grass Area ${index + 1}`,
    points,
  };
}

function normalizeGrassAreas(areas = []) {
  return Array.isArray(areas)
    ? areas.map((area, index) => normalizeGrassArea(area, index)).filter((area) => area.points.length >= 3)
    : [];
}

function hasGrassAreas() {
  return normalizeGrassAreas(project.site?.grassAreas).length > 0;
}

function canvasLayerDefinitions() {
  return Array.from(mapWorld.querySelectorAll('[data-canvas-layer]')).map((element) => ({
    id: element.dataset.layerId || element.id,
    label: element.dataset.layerLabel || element.id || 'Canvas layer',
    description: element.dataset.layerDescription || '',
    defaultVisible: element.dataset.layerDefaultVisible !== 'false',
    element,
  })).filter((layer) => Boolean(layer.id));
}

function normalizeCanvasLayerSettings(settings = {}) {
  return canvasLayerDefinitions().reduce((layers, definition) => {
    layers[definition.id] = typeof settings[definition.id] === 'boolean'
      ? settings[definition.id]
      : definition.defaultVisible;
    return layers;
  }, {});
}

function isCanvasLayerVisible(layerId) {
  const definition = canvasLayerDefinitions().find((layer) => layer.id === layerId);
  return project.site?.canvasLayers?.[layerId] ?? definition?.defaultVisible ?? true;
}

function applyCanvasLayerVisibility() {
  project.site.canvasLayers = normalizeCanvasLayerSettings(project.site?.canvasLayers);
  canvasLayerDefinitions().forEach(({ id, element }) => {
    const visible = isCanvasLayerVisible(id);
    element.classList.toggle('canvas-layer-hidden', !visible);
    element.setAttribute('aria-hidden', String(!visible || element.getAttribute('aria-hidden') === 'true'));
  });
}

function renderLayerSelectorMenu() {
  layerSelectorList.replaceChildren();
  project.site.canvasLayers = normalizeCanvasLayerSettings(project.site?.canvasLayers);

  canvasLayerDefinitions().forEach(({ id, label, description }) => {
    const row = document.createElement('label');
    row.className = 'layer-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isCanvasLayerVisible(id);
    checkbox.addEventListener('change', () => {
      project.site.canvasLayers = normalizeCanvasLayerSettings(project.site?.canvasLayers);
      project.site.canvasLayers[id] = checkbox.checked;
      applyCanvasLayerVisibility();
    });

    const copy = document.createElement('span');
    copy.className = 'layer-toggle-copy';
    const title = document.createElement('strong');
    title.textContent = label;
    copy.appendChild(title);
    if (description) {
      const detail = document.createElement('span');
      detail.textContent = description;
      copy.appendChild(detail);
    }

    row.append(checkbox, copy);
    layerSelectorList.appendChild(row);
  });

  applyCanvasLayerVisibility();
}

function mapViewTransform() {
  const { scale, panX, panY, rotationDegrees } = normalizeMapViewSettings(project.site?.mapView);
  return `translate(${panX}px, ${panY}px) rotate(${rotationDegrees}deg) scale(${scale})`;
}

function applyMapViewTransform() {
  mapWorld.style.transform = mapViewTransform();
  const { scale } = normalizeMapViewSettings(project.site?.mapView);
  sprinklerLayer.querySelectorAll('.sprinkler-marker').forEach((marker) => {
    marker.style.setProperty('--marker-scale', `${1 / scale}`);
  });
}

function hasSatelliteCenter() {
  const { latitude, longitude } = project.site.satellite || {};
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function setAddressLookupStatus(message) {
  addressLookupStatus.textContent = message;
}

function setSatelliteStatus(message) {
  satelliteStatus.textContent = message;
}

function hasUploadedBackgroundImage() {
  return Boolean(normalizeBackgroundImageSettings(project.site?.backgroundImage).dataUrl);
}

function promptForBackgroundImage() {
  imageStatus.textContent = 'Choose an image file to use as the planning background.';
  backgroundImageInput.click();
}

function updateProjectInputs() {
  siteNameInput.value = project.site?.name || '';
  siteAddressInput.value = project.site?.address || '';
  const imageSource = ['yard', 'satellite', 'image'].includes(project.site?.imageSource) ? project.site.imageSource : 'yard';
  canvasBackgroundSelect.value = imageSource;
  satelliteControls.classList.toggle('hidden', imageSource !== 'satellite');
  imageControls.classList.toggle('hidden', imageSource !== 'image');

  const mapView = normalizeMapViewSettings(project.site?.mapView);
  backgroundRotationInput.value = mapView.rotationDegrees;
  backgroundRotationValue.textContent = `${Math.round(mapView.rotationDegrees)}°`;

  const backgroundImage = normalizeBackgroundImageSettings(project.site?.backgroundImage);
  imageScaleInput.value = backgroundImage.scale;
  imageScaleValue.textContent = `${backgroundImage.scale.toFixed(2)}×`;
  imageRotationInput.value = backgroundImage.rotationDegrees;
  imageRotationValue.textContent = `${Math.round(backgroundImage.rotationDegrees)}°`;

  showPrecipitationMapInput.checked = showPrecipitationMap;
  updatePrecipitationContourControl();

  const satellite = normalizeSatelliteSettings(project.site?.satellite);
  satelliteLatitudeInput.value = Number.isFinite(satellite.latitude) ? satellite.latitude : '';
  satelliteLongitudeInput.value = Number.isFinite(satellite.longitude) ? satellite.longitude : '';
  satelliteSourceSelect.value = satellite.source;
  satelliteZoomInput.value = satellite.zoom;
  satelliteZoomValue.textContent = satellite.zoom;
}

function lonLatToTilePoint(longitude, latitude, zoom) {
  const latRad = (latitude * Math.PI) / 180;
  const scale = 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  };
}

function renderSatelliteLayer() {
  satelliteLayer.replaceChildren();
  applyMapViewTransform();
  const wantsSatellite = project.site?.imageSource === 'satellite';
  const showSatellite = wantsSatellite && hasSatelliteCenter();
  mapCanvas.classList.toggle('satellite-enabled', wantsSatellite);

  if (!wantsSatellite) {
    setSatelliteStatus('Select Satellite imagery and look up an address or enter coordinates to show aerial imagery.');
    return;
  }

  if (!showSatellite) {
    setSatelliteStatus('Look up an address or enter latitude/longitude to load satellite imagery.');
    return;
  }

  const { latitude, longitude, zoom, source } = normalizeSatelliteSettings(project.site.satellite);
  const imagerySource = imagerySources[source] || imagerySources['esri-world'];
  const rect = mapCanvas.getBoundingClientRect();
  const width = rect.width || mapCanvas.clientWidth;
  const height = rect.height || mapCanvas.clientHeight;
  if (!width || !height) {
    setSatelliteStatus('Satellite imagery will load once the canvas has a visible size.');
    return;
  }

  const nativeTileSize = 256;
  const sourceZoom = Math.min(zoom, imagerySource.maxNativeZoom || zoom);
  const tileScale = 2 ** (zoom - sourceZoom);
  const displayTileSize = nativeTileSize * tileScale;
  const tilePoint = lonLatToTilePoint(longitude, latitude, zoom);
  const centerWorldX = tilePoint.x * nativeTileSize;
  const centerWorldY = tilePoint.y * nativeTileSize;
  const sourceScale = 2 ** sourceZoom;
  const maxTileIndex = sourceScale - 1;
  const { scale: viewScale, rotationDegrees } = normalizeMapViewSettings(project.site.mapView);
  const localCorners = [
    screenPointToLocalPoint(0, 0),
    screenPointToLocalPoint(width, 0),
    screenPointToLocalPoint(0, height),
    screenPointToLocalPoint(width, height),
  ];
  const xValues = localCorners.map((point) => point.x);
  const yValues = localCorners.map((point) => point.y);
  const padding = Math.max(width, height) * 0.15;
  const minLocalX = Math.min(...xValues) - padding;
  const maxLocalX = Math.max(...xValues) + padding;
  const minLocalY = Math.min(...yValues) - padding;
  const maxLocalY = Math.max(...yValues) + padding;
  const startX = Math.floor((centerWorldX + minLocalX - width / 2) / displayTileSize);
  const endX = Math.floor((centerWorldX + maxLocalX - width / 2) / displayTileSize);
  const startY = Math.floor((centerWorldY + minLocalY - height / 2) / displayTileSize);
  const endY = Math.floor((centerWorldY + maxLocalY - height / 2) / displayTileSize);

  let tilesRequested = 0;
  let tilesLoaded = 0;
  let tilesFailed = 0;
  const updateTileStatus = () => {
    if (tilesRequested === 0) {
      setSatelliteStatus('No satellite tiles are available for this canvas view.');
      return;
    }
    if (tilesFailed === tilesRequested) {
      setSatelliteStatus('Satellite tiles failed to load. Check your network connection or try a different zoom level.');
      return;
    }
    if (tilesLoaded > 0) {
      const zoomDetail = sourceZoom === zoom ? `tile zoom ${zoom}` : `tile zoom ${zoom} using zoom ${sourceZoom} imagery`;
      setSatelliteStatus(`Showing ${imagerySource.label} at ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${zoomDetail}, view ${viewScale.toFixed(2)}×, rotation ${Math.round(rotationDegrees)}°). ${imagerySource.detail}`);
      return;
    }
    setSatelliteStatus(`Loading ${tilesRequested} satellite tile${tilesRequested === 1 ? '' : 's'}...`);
  };

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y > maxTileIndex) continue;
      const wrappedX = ((x % sourceScale) + sourceScale) % sourceScale;
      const tile = document.createElement('img');
      tile.className = 'satellite-tile';
      tile.alt = '';
      tile.draggable = false;
      tile.style.width = `${displayTileSize}px`;
      tile.style.height = `${displayTileSize}px`;
      tile.addEventListener('load', () => {
        tilesLoaded += 1;
        updateTileStatus();
      });
      tile.addEventListener('error', () => {
        tilesFailed += 1;
        updateTileStatus();
      });
      tilesRequested += 1;
      tile.src = imagerySource.url({ zoom: sourceZoom, y, x: wrappedX });
      tile.style.left = `${width / 2 + x * displayTileSize - centerWorldX}px`;
      tile.style.top = `${height / 2 + y * displayTileSize - centerWorldY}px`;
      satelliteLayer.appendChild(tile);
    }
  }
  updateTileStatus();
}


function renderImageLayer() {
  imageLayer.replaceChildren();
  const wantsImage = project.site?.imageSource === 'image';
  mapCanvas.classList.toggle('image-enabled', wantsImage);
  if (!wantsImage) {
    return;
  }

  const settings = normalizeBackgroundImageSettings(project.site.backgroundImage);
  if (settings.dataUrl !== backgroundImageNaturalDataUrl) {
    backgroundImageNaturalSize = null;
    backgroundImageBaseSize = null;
    backgroundImageNaturalDataUrl = settings.dataUrl;
  }
  if (!settings.dataUrl) {
    imageStatus.textContent = 'Upload an image to use it as the planning background.';
    return;
  }

  const image = document.createElement('img');
  image.className = 'background-image';
  image.src = settings.dataUrl;
  image.alt = '';
  image.draggable = false;
  image.style.transform = `translate(-50%, -50%) rotate(${settings.rotationDegrees}deg) scale(${settings.scale})`;
  image.addEventListener('load', () => {
    backgroundImageNaturalSize = {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
    sizeBackgroundImage(image);
    renderCanvas();
    renderAnalysis();
    updateScaleCalibrationStatus();
  }, { once: true });
  sizeBackgroundImage(image);
  imageLayer.appendChild(image);
  imageStatus.textContent = `Showing ${settings.name || 'uploaded image'} at ${settings.scale.toFixed(2)}× and ${Math.round(settings.rotationDegrees)}°.`;
}

async function geocodeAddress(address) {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Enter an address first.');
  }

  const censusUrl = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  censusUrl.search = new URLSearchParams({
    address: trimmedAddress,
    benchmark: 'Public_AR_Current',
    format: 'json',
  }).toString();

  try {
    const response = await fetch(censusUrl);
    if (response.ok) {
      const data = await response.json();
      const match = data?.result?.addressMatches?.[0];
      const coordinates = match?.coordinates;
      const latitude = Number(coordinates?.y);
      const longitude = Number(coordinates?.x);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
          latitude,
          longitude,
          label: match.matchedAddress || trimmedAddress,
          source: 'U.S. Census Geocoder',
        };
      }
    }
  } catch (error) {
    // Fall back to OpenStreetMap Nominatim below.
  }

  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.search = new URLSearchParams({
    q: trimmedAddress,
    format: 'jsonv2',
    limit: '1',
  }).toString();
  const nominatimResponse = await fetch(nominatimUrl, { headers: { Accept: 'application/json' } });
  if (!nominatimResponse.ok) {
    throw new Error(`Address lookup failed with HTTP ${nominatimResponse.status}.`);
  }
  const matches = await nominatimResponse.json();
  const match = matches?.[0];
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('No matching address found. Try a more specific address.');
  }
  return { latitude, longitude, label: match.display_name || trimmedAddress, source: 'OpenStreetMap Nominatim' };
}

function selectedSprinkler() {
  return project.sprinklers.find((sprinkler) => sprinkler.id === selectedSprinklerId) || null;
}

function sprinklersForCurrentZone() {
  const zoneId = currentInspectorZoneId();
  return project.sprinklers.filter((sprinkler) => sprinkler.zoneId === zoneId);
}

function selectedSprinklerInCurrentZone() {
  const sprinkler = selectedSprinkler();
  return sprinkler?.zoneId === currentInspectorZoneId() ? sprinkler : null;
}

function selectFirstSprinklerInCurrentZone() {
  selectedSprinklerId = sprinklersForCurrentZone()[0]?.id || null;
}

function sprinklerLabel(sprinkler) {
  const number = project.sprinklers.findIndex((candidate) => candidate.id === sprinkler.id) + 1;
  const head = sprinkler.headModel || 'Unspecified head';
  const nozzle = sprinkler.nozzleModel || 'Unspecified nozzle';
  return `#${number} · ${head} / ${nozzle}`;
}

function currentInspectorZoneId() {
  if (inspectedZoneId && project.zones.some((zone) => zone.id === inspectedZoneId)) return inspectedZoneId;
  const selected = selectedSprinkler();
  if (selected?.zoneId && project.zones.some((zone) => zone.id === selected.zoneId)) return selected.zoneId;
  if (zoneInspectorSelect.value && project.zones.some((zone) => zone.id === zoneInspectorSelect.value)) return zoneInspectorSelect.value;
  return project.zones[0]?.id || '';
}

function normalizeSprinklerPosition(sprinkler, index) {
  const normalized = {
    ...sprinkler,
    ratedPressurePsi: optionalNumber(sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi) || 45,
    pressureRegulating: Boolean(sprinkler.pressureRegulating),
    baseFlowGpm: optionalNumber(sprinkler.baseFlowGpm ?? sprinkler.flowGpm) || 0,
    baseRadiusFt: optionalNumber(sprinkler.baseRadiusFt ?? sprinkler.radiusFt) || 0,
    baseWidthFt: optionalNumber(sprinkler.baseWidthFt ?? sprinkler.widthFt) || 0,
    patternType: normalizePatternType(sprinkler.patternType),
    headOffsetX: normalizeRectangleHeadOffset(sprinkler.headOffsetX, 0.5),
    headOffsetY: normalizeRectangleHeadOffset(sprinkler.headOffsetY, 0.5),
  };
  normalized.pressurePsi = normalized.ratedPressurePsi;
  normalized.flowGpm = normalized.baseFlowGpm;
  normalized.radiusFt = normalized.baseRadiusFt;
  normalized.widthFt = normalized.baseWidthFt;
  if (Number.isFinite(normalized.xPercent) && Number.isFinite(normalized.yPercent)) return normalized;

  return {
    ...normalized,
    xPercent: Math.min(90, 35 + index * 12),
    yPercent: Math.min(85, 40 + index * 10),
  };
}

function hydrateProject(loaded, options = {}) {
  project = {
    ...structuredClone(emptyProject),
    ...loaded,
    site: {
      ...emptyProject.site,
      ...(loaded.site || {}),
      satellite: normalizeSatelliteSettings({ ...emptyProject.site.satellite, ...(loaded.site?.satellite || {}) }),
      backgroundImage: normalizeBackgroundImageSettings({ ...emptyProject.site.backgroundImage, ...(loaded.site?.backgroundImage || {}) }),
      distanceScale: normalizeDistanceScaleSettings({ ...emptyProject.site.distanceScale, ...(loaded.site?.distanceScale || {}) }),
      mapView: normalizeMapViewSettings({ ...emptyProject.site.mapView, ...(loaded.site?.mapView || {}) }),
      canvasLayers: normalizeCanvasLayerSettings({ ...emptyProject.site.canvasLayers, ...(loaded.site?.canvasLayers || {}) }),
      precipitationContourInterval: normalizePrecipitationContourInterval(loaded.site?.precipitationContourInterval),
      precipitationGridCellFeet: normalizePrecipitationGridCellFeet(loaded.site?.precipitationGridCellFeet),
      grassAreas: normalizeGrassAreas(loaded.site?.grassAreas),
    },
    zones: Array.isArray(loaded.zones) ? loaded.zones.map((zone, index) => normalizeZone(zone, index)) : [],
    sprinklers: Array.isArray(loaded.sprinklers)
      ? loaded.sprinklers.map((sprinkler, index) => normalizeSprinklerPosition({ ...sprinkler }, index))
      : [],
  };
  precipitationContourInterval = project.site.precipitationContourInterval;
  precipitationGridCellFeet = project.site.precipitationGridCellFeet;
  ensureDefaultZone();
  syncSprinklersFromGps();
  selectedSprinklerId = project.sprinklers[0]?.id || null;
  inspectedZoneId = selectedSprinkler()?.zoneId || project.zones[0]?.id || null;
  grassDrawingState = null;
  suppressEmptyCanvasHint = Boolean(options.suppressEmptyCanvasHint);
  render();
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00';
}

function zoneForSprinkler(sprinkler) {
  return project.zones.find((zone) => zone.id === sprinkler.zoneId) || project.zones[0] || normalizeZone();
}

function pressureScaleFactor(sprinkler) {
  if (sprinkler.pressureRegulating) return 1;
  const ratedPressure = Number(sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi) || 0;
  const zonePressure = Number(zoneForSprinkler(sprinkler)?.pressurePsi) || ratedPressure;
  if (ratedPressure <= 0 || zonePressure <= 0) return 1;
  return Math.sqrt(zonePressure / ratedPressure);
}

function effectiveFlowGpm(sprinkler) {
  return (Number(sprinkler.baseFlowGpm ?? sprinkler.flowGpm) || 0) * pressureScaleFactor(sprinkler);
}

function effectiveRadiusFt(sprinkler) {
  return (Number(sprinkler.baseRadiusFt ?? sprinkler.radiusFt) || 0) * pressureScaleFactor(sprinkler);
}

function effectiveWidthFt(sprinkler) {
  return (Number(sprinkler.baseWidthFt ?? sprinkler.widthFt) || 0) * pressureScaleFactor(sprinkler);
}

function clampArcDegrees(value) {
  return Math.min(360, Math.max(1, Number(value) || 360));
}

function normalizeDegrees(value) {
  return ((Number(value) || 0) % 360 + 360) % 360;
}

function sprinklerAreaSqft(sprinkler) {
  const radius = effectiveRadiusFt(sprinkler);
  if (isRectanglePattern(sprinkler)) {
    const width = effectiveWidthFt(sprinkler);
    return radius > 0 && width > 0 ? radius * width : 0;
  }
  const arc = clampArcDegrees(sprinkler.arcDegrees);
  return (arc / 360) * Math.PI * radius * radius;
}

function sprinklerPr(sprinkler) {
  const flow = effectiveFlowGpm(sprinkler);
  const area = sprinklerAreaSqft(sprinkler);
  if (area <= 0) return 0;
  return (96.3 * flow) / area;
}

function radialSpreadIntensity(distance, minimumDistance) {
  return 1 / Math.max(distance, minimumDistance);
}

function rectangleSpreadMinimumDistanceFt(lengthFt, widthFt) {
  return Math.max(lengthFt, widthFt) * minRadialSpreadRadiusRatio;
}

function rectangleSpreadNormalization(lengthFt, widthFt, headOffsetX, headOffsetY) {
  if (lengthFt <= 0 || widthFt <= 0) return 1;

  const key = [lengthFt, widthFt, headOffsetX, headOffsetY]
    .map((value) => Number(value).toFixed(4))
    .join(':');
  const cached = rectangleSpreadNormalizationCache.get(key);
  if (cached) return cached;

  const sampleCount = rectangleSpreadNormalizationSampleCount;
  const headX = headOffsetX * lengthFt;
  const headY = headOffsetY * widthFt;
  const minimumDistanceFt = rectangleSpreadMinimumDistanceFt(lengthFt, widthFt);
  let total = 0;

  for (let row = 0; row < sampleCount; row += 1) {
    const sampleY = ((row + 0.5) / sampleCount) * widthFt;
    for (let column = 0; column < sampleCount; column += 1) {
      const sampleX = ((column + 0.5) / sampleCount) * lengthFt;
      total += radialSpreadIntensity(Math.hypot(sampleX - headX, sampleY - headY), minimumDistanceFt);
    }
  }

  const normalization = total > 0 ? total / (sampleCount * sampleCount) : 1;
  rectangleSpreadNormalizationCache.set(key, normalization);
  return normalization;
}

function rectangleRadialPrecipitationMultiplier(lengthFt, widthFt, headOffsetX, headOffsetY, distanceFt) {
  const minimumDistanceFt = rectangleSpreadMinimumDistanceFt(lengthFt, widthFt);
  return radialSpreadIntensity(distanceFt, minimumDistanceFt)
    / rectangleSpreadNormalization(lengthFt, widthFt, headOffsetX, headOffsetY);
}

function sprinklerPrecipitationStats(sprinklers) {
  const rates = sprinklers
    .map((sprinkler) => sprinklerPr(sprinkler))
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  if (!rates.length) return null;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  return { min, max, average, count: rates.length };
}


function zoneCalculatedStats(zone) {
  const zoneSprinklers = project.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id);
  const totalFlow = zoneSprinklers.reduce((sum, sprinkler) => sum + effectiveFlowGpm(sprinkler), 0);
  const precipitationStats = sprinklerPrecipitationStats(zoneSprinklers);
  return {
    sprinklers: zoneSprinklers,
    totalFlow,
    precipitationStats,
  };
}

function zoneStatCard(label, value) {
  const card = document.createElement('div');
  card.className = 'zone-stat';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;

  card.append(labelEl, valueEl);
  return card;
}

function renderZoneCalculatedInfo(container, zone) {
  const { sprinklers, totalFlow, precipitationStats } = zoneCalculatedStats(zone);
  container.replaceChildren(
    zoneStatCard('Min PR', precipitationStats ? `${formatNumber(precipitationStats.min)} in/hr` : '—'),
    zoneStatCard('Avg PR', precipitationStats ? `${formatNumber(precipitationStats.average)} in/hr` : '—'),
    zoneStatCard('Max PR', precipitationStats ? `${formatNumber(precipitationStats.max)} in/hr` : '—'),
    zoneStatCard('Total flow', `${formatNumber(totalFlow)} gpm`),
  );

  const note = document.createElement('div');
  note.className = 'zone-calculated-note';
  note.textContent = precipitationStats
    ? `${sprinklers.length} head${sprinklers.length === 1 ? '' : 's'} included in calculated precipitation rates.`
    : 'Add flow, radius, and arc data to this zone to calculate precipitation rates.';
  container.appendChild(note);
}

function updateZoneCalculatedInfo(zoneId) {
  const zone = project.zones.find((candidate) => candidate.id === zoneId);
  const container = zonesList.querySelector(`[data-zone-calculated-info="${CSS.escape(zoneId)}"]`);
  if (!zone || !container) return;
  renderZoneCalculatedInfo(container, zone);
}

function updateAllZoneCalculatedInfo() {
  project.zones.forEach((zone) => updateZoneCalculatedInfo(zone.id));
}

function canvasCenter() {
  const rect = mapCanvas.getBoundingClientRect();
  return { width: rect.width || mapCanvas.clientWidth, height: rect.height || mapCanvas.clientHeight };
}

function canvasCoordinateBox() {
  const { width, height } = canvasCenter();
  return { left: 0, top: 0, width, height };
}

function fittedBackgroundImageSize() {
  const canvas = canvasCoordinateBox();
  const naturalWidth = backgroundImageNaturalSize?.width;
  const naturalHeight = backgroundImageNaturalSize?.height;
  if (!naturalWidth || !naturalHeight || !canvas.width || !canvas.height) return null;

  const fitScale = Math.min(1, canvas.width / naturalWidth, canvas.height / naturalHeight);
  return {
    width: naturalWidth * fitScale,
    height: naturalHeight * fitScale,
  };
}

function imageCoordinateBox(includeImageScale = true) {
  const canvas = canvasCoordinateBox();
  const baseSize = backgroundImageBaseSize || fittedBackgroundImageSize();
  if (!baseSize) return canvas;

  const imageScale = includeImageScale ? normalizeBackgroundImageSettings(project.site?.backgroundImage).scale : 1;
  const width = baseSize.width * imageScale;
  const height = baseSize.height * imageScale;
  return {
    left: (canvas.width - width) / 2,
    top: (canvas.height - height) / 2,
    width,
    height,
  };
}

function activeCoordinateBox() {
  if (project.site?.imageSource === 'image' && hasUploadedBackgroundImage()) return imageCoordinateBox();
  return canvasCoordinateBox();
}

function localPointFromPercent(point) {
  const box = activeCoordinateBox();
  return {
    x: box.left + (point.xPercent / 100) * box.width,
    y: box.top + (point.yPercent / 100) * box.height,
  };
}

function setPositionFromPercent(element, point) {
  const local = localPointFromPercent(point);
  element.style.left = `${local.x}px`;
  element.style.top = `${local.y}px`;
}

function sizeBackgroundImage(image) {
  if (!backgroundImageBaseSize) {
    backgroundImageBaseSize = fittedBackgroundImageSize();
  }

  const box = imageCoordinateBox(false);
  image.style.width = `${box.width}px`;
  image.style.height = `${box.height}px`;
}

function localPointToScreenPoint(localX, localY) {
  const { width, height } = canvasCenter();
  const { scale, panX, panY, rotationDegrees } = normalizeMapViewSettings(project.site.mapView);
  const angle = (rotationDegrees * Math.PI) / 180;
  const dx = localX - width / 2;
  const dy = localY - height / 2;
  return {
    x: width / 2 + panX + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scale,
    y: height / 2 + panY + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scale,
  };
}

function screenPointToLocalPoint(screenX, screenY) {
  const { width, height } = canvasCenter();
  const { scale, panX, panY, rotationDegrees } = normalizeMapViewSettings(project.site.mapView);
  const angle = (-rotationDegrees * Math.PI) / 180;
  const dx = (screenX - width / 2 - panX) / scale;
  const dy = (screenY - height / 2 - panY) / scale;
  return {
    x: width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function canvasPositionToGps(position) {
  if (!hasSatelliteCenter()) return {};
  const { latitude, longitude } = normalizeSatelliteSettings(project.site.satellite);
  const { width, height } = canvasCenter();
  const x = (position.xPercent / 100) * width;
  const y = (position.yPercent / 100) * height;
  const feetPerPixel = satelliteFeetPerPixel(latitude, project.site.satellite.zoom);
  const eastFeet = (x - width / 2) * feetPerPixel;
  const northFeet = (height / 2 - y) * feetPerPixel;
  return gpsOffset(latitude, longitude, eastFeet, northFeet);
}

function gpsToCanvasPosition(latitude, longitude) {
  if (!hasSatelliteCenter() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const center = normalizeSatelliteSettings(project.site.satellite);
  const { width, height } = canvasCenter();
  if (!width || !height) return null;
  const feetPerPixel = satelliteFeetPerPixel(center.latitude, center.zoom);
  const deltaLatRad = ((latitude - center.latitude) * Math.PI) / 180;
  const deltaLonRad = ((longitude - center.longitude) * Math.PI) / 180;
  const northFeet = deltaLatRad * earthRadiusFeet;
  const eastFeet = deltaLonRad * earthRadiusFeet * Math.cos((center.latitude * Math.PI) / 180);
  return {
    xPercent: Math.min(100, Math.max(0, ((width / 2 + eastFeet / feetPerPixel) / width) * 100)),
    yPercent: Math.min(100, Math.max(0, ((height / 2 - northFeet / feetPerPixel) / height) * 100)),
  };
}

function gpsOffset(latitude, longitude, eastFeet, northFeet) {
  const latRad = (latitude * Math.PI) / 180;
  const nextLat = latitude + (northFeet / earthRadiusFeet) * (180 / Math.PI);
  const nextLon = longitude + (eastFeet / (earthRadiusFeet * Math.cos(latRad))) * (180 / Math.PI);
  return { latitude: nextLat, longitude: nextLon };
}

function satelliteFeetPerPixel(latitude, zoom) {
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return metersPerPixel * 3.28084;
}

function syncSprinklerGps(sprinkler) {
  const gps = canvasPositionToGps(sprinkler);
  if (Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
    sprinkler.latitude = gps.latitude;
    sprinkler.longitude = gps.longitude;
  }
}

function syncSprinklersFromGps() {
  if (!hasSatelliteCenter()) return;
  project.sprinklers.forEach((sprinkler) => {
    const position = gpsToCanvasPosition(Number(sprinkler.latitude), Number(sprinkler.longitude));
    if (position) Object.assign(sprinkler, position);
  });
}

function renderSprinklerSelect() {
  clearSelect(zoneSprinklerSelect);
  const zoneId = currentInspectorZoneId();
  const zone = project.zones.find((candidate) => candidate.id === zoneId);
  const zoneSprinklers = sprinklersForCurrentZone();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = zoneSprinklers.length
    ? `Select ${zone?.name || 'zone'} sprinkler to edit`
    : `No sprinklers in ${zone?.name || 'selected zone'}`;
  zoneSprinklerSelect.appendChild(placeholder);

  zoneSprinklers.forEach((sprinkler) => {
    const option = document.createElement('option');
    option.value = sprinkler.id;
    option.textContent = sprinklerLabel(sprinkler);
    zoneSprinklerSelect.appendChild(option);
  });

  zoneSprinklerSelect.value = zoneSprinklers.some((sprinkler) => sprinkler.id === selectedSprinklerId) ? selectedSprinklerId : '';
}

function renderZoneInspectorControls() {
  const zoneId = currentInspectorZoneId();
  clearSelect(zoneInspectorSelect);
  project.zones.forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zone.name;
    zoneInspectorSelect.appendChild(option);
  });
  zoneInspectorSelect.value = zoneId;
}

function renderZones() {
  renderZoneInspectorControls();
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
      renderZoneInspectorControls();
      renderCanvas();
      renderInspector();
      renderAnalysis();
    });

    const pressureField = document.createElement('div');
    const pressureLabel = document.createElement('label');
    pressureLabel.textContent = 'Zone pressure PSI';
    const pressureInputEl = document.createElement('input');
    pressureInputEl.type = 'number';
    pressureInputEl.min = '1';
    pressureInputEl.step = '0.1';
    pressureInputEl.value = zone.pressurePsi ?? 45;
    pressureInputEl.setAttribute('aria-label', `${zone.name} system pressure PSI`);
    pressureInputEl.addEventListener('input', () => {
      const pressure = Number(pressureInputEl.value);
      zone.pressurePsi = Number.isFinite(pressure) && pressure > 0 ? pressure : 45;
      renderCanvas();
      updateZoneCalculatedInfo(zone.id);
      renderAnalysis();
    });
    pressureField.append(pressureLabel, pressureInputEl);

    const flowField = document.createElement('div');
    const flowLabel = document.createElement('label');
    flowLabel.textContent = 'Measured supply GPM';
    const flowInputEl = document.createElement('input');
    flowInputEl.type = 'number';
    flowInputEl.min = '0';
    flowInputEl.step = '0.01';
    flowInputEl.value = zone.measuredFlowGpm ?? '';
    flowInputEl.placeholder = 'Unknown';
    flowInputEl.setAttribute('aria-label', `${zone.name} measured supply flow GPM`);
    flowInputEl.addEventListener('input', () => {
      const flow = Number(flowInputEl.value);
      zone.measuredFlowGpm = Number.isFinite(flow) && flow > 0 ? flow : null;
      updateZoneCalculatedInfo(zone.id);
      renderAnalysis();
    });
    flowField.append(flowLabel, flowInputEl);

    const waterShareField = document.createElement('div');
    const waterShareLabel = document.createElement('label');
    waterShareLabel.textContent = 'Water share factor';
    const waterShareInputEl = document.createElement('input');
    waterShareInputEl.type = 'number';
    waterShareInputEl.min = '0.01';
    waterShareInputEl.step = '0.01';
    waterShareInputEl.value = zone.waterShare ?? defaultZoneWaterShare;
    waterShareInputEl.setAttribute('aria-label', `${zone.name} water share factor`);
    waterShareInputEl.title = 'Relative watering share for whole-lawn precipitation totals. Use 2 when this zone intentionally runs twice as long as a 1× zone.';
    waterShareInputEl.addEventListener('input', () => {
      const waterShare = Number(waterShareInputEl.value);
      zone.waterShare = Number.isFinite(waterShare) && waterShare > 0 ? waterShare : defaultZoneWaterShare;
      updateZoneCalculatedInfo(zone.id);
      renderAnalysis();
    });
    waterShareField.append(waterShareLabel, waterShareInputEl);

    const settings = document.createElement('div');
    settings.className = 'zone-settings';
    settings.append(pressureField, flowField, waterShareField);

    const calculatedInfo = document.createElement('div');
    calculatedInfo.className = 'zone-calculated-info';
    calculatedInfo.dataset.zoneCalculatedInfo = zone.id;
    renderZoneCalculatedInfo(calculatedInfo, zone);

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

    row.append(swatch, input, deleteBtn, settings, calculatedInfo);
    zonesList.appendChild(row);
  });
}


function distanceBetweenScalePoints(points) {
  if (points.length < 2) return 0;
  const first = localPointFromPercent(points[0]);
  const second = localPointFromPercent(points[1]);
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function currentFeetPerPixel() {
  if (project.site?.imageSource === 'satellite' && hasSatelliteCenter()) {
    const satellite = normalizeSatelliteSettings(project.site.satellite);
    return satelliteFeetPerPixel(satellite.latitude, satellite.zoom);
  }
  const scale = normalizeDistanceScaleSettings(project.site?.distanceScale);
  const calibratedPixels = distanceBetweenScalePoints(scale.points);
  if (scale.measuredFeet && calibratedPixels > 0) return scale.measuredFeet / calibratedPixels;
  return scale.feetPerPixel;
}

function updateScaleCalibrationStatus(message) {
  if (message) {
    scaleCalibrationStatus.textContent = message;
    return;
  }

  if (calibrationState) {
    const clicksRemaining = 2 - calibrationState.points.length;
    scaleCalibrationStatus.textContent = clicksRemaining === 2
      ? 'Calibration active: click the first endpoint of a known distance on the canvas.'
      : 'Calibration active: click the second endpoint of the known distance.';
    return;
  }

  if (project.site?.imageSource === 'satellite' && hasSatelliteCenter()) {
    const satellite = normalizeSatelliteSettings(project.site.satellite);
    const feetPerPixel = satelliteFeetPerPixel(satellite.latitude, satellite.zoom);
    scaleCalibrationStatus.textContent = `Using satellite scale: ${feetPerPixel.toFixed(3)} ft per canvas pixel at zoom ${satellite.zoom}.`;
    return;
  }

  const scale = normalizeDistanceScaleSettings(project.site?.distanceScale);
  if (scale.points.length === 2 && scale.measuredFeet) {
    const pixels = distanceBetweenScalePoints(scale.points);
    scaleCalibrationStatus.textContent = `Manual scale: ${scale.measuredFeet.toFixed(2)} ft over ${pixels.toFixed(1)} px (${currentFeetPerPixel().toFixed(3)} ft/px).`;
    return;
  }

  scaleCalibrationStatus.textContent = `Using default sketch scale: ${(1 / scale.feetPerPixel).toFixed(2)} px per ft. Calibrate two points for uploaded images.`;
}

function renderCalibrationLayer() {
  calibrationLayer.replaceChildren();
  const savedScale = normalizeDistanceScaleSettings(project.site?.distanceScale);
  const points = calibrationState?.points || savedScale.points;
  if (points.length === 0) return;

  points.forEach((point, index) => {
    const marker = document.createElement('div');
    marker.className = 'calibration-point';
    setPositionFromPercent(marker, point);
    marker.textContent = `${index + 1}`;
    calibrationLayer.appendChild(marker);
  });

  if (points.length < 2) return;
  const first = localPointFromPercent(points[0]);
  const second = localPointFromPercent(points[1]);
  const length = Math.hypot(second.x - first.x, second.y - first.y);
  const angle = (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
  const label = savedScale.measuredFeet ? `${savedScale.measuredFeet.toFixed(2)} ft` : 'Known distance';

  const line = document.createElement('div');
  line.className = 'calibration-line';
  setPositionFromPercent(line, points[0]);
  line.style.width = `${length}px`;
  line.style.transform = `rotate(${angle}deg)`;
  calibrationLayer.appendChild(line);

  const lineLabel = document.createElement('div');
  lineLabel.className = 'calibration-label';
  setPositionFromPercent(lineLabel, {
    xPercent: (points[0].xPercent + points[1].xPercent) / 2,
    yPercent: (points[0].yPercent + points[1].yPercent) / 2,
  });
  lineLabel.textContent = label;
  calibrationLayer.appendChild(lineLabel);
}

function startScaleCalibration() {
  calibrationState = { points: [] };
  mapCanvas.classList.add('calibrating');
  emptyCanvasHint.classList.add('hidden');
  renderCalibrationLayer();
  updateScaleCalibrationStatus();
}

function finishScaleCalibration(points) {
  const pixelDistance = distanceBetweenScalePoints(points);
  if (pixelDistance <= 0) {
    calibrationState = null;
    mapCanvas.classList.remove('calibrating');
    renderCalibrationLayer();
    updateScaleCalibrationStatus('Calibration failed: the two points must be different.');
    return;
  }

  const distanceText = window.prompt('How many feet apart are these two points?');
  const measuredFeet = Number(distanceText);
  if (!Number.isFinite(measuredFeet) || measuredFeet <= 0) {
    calibrationState = null;
    mapCanvas.classList.remove('calibrating');
    renderCalibrationLayer();
    updateScaleCalibrationStatus('Calibration canceled. Enter a positive distance in feet after selecting two points.');
    return;
  }

  project.site.distanceScale = normalizeDistanceScaleSettings({
    feetPerPixel: measuredFeet / pixelDistance,
    measuredFeet,
    points,
  });
  calibrationState = null;
  mapCanvas.classList.remove('calibrating');
  renderCanvas();
  renderAnalysis();
  updateScaleCalibrationStatus();
}

function addCalibrationPoint(position) {
  if (!calibrationState) return;
  calibrationState.points.push(position);
  renderCalibrationLayer();
  updateScaleCalibrationStatus();
  if (calibrationState.points.length >= 2) {
    finishScaleCalibration(calibrationState.points.slice(0, 2));
  }
}

function clearScaleCalibration() {
  project.site.distanceScale = normalizeDistanceScaleSettings();
  calibrationState = null;
  mapCanvas.classList.remove('calibrating');
  renderCanvas();
  updateScaleCalibrationStatus();
}



function grassSvgPoint(areaPoint, box) {
  return `${(areaPoint.xPercent / 100) * box.width},${(areaPoint.yPercent / 100) * box.height}`;
}

function renderGrassLayer() {
  grassLayer.replaceChildren();
  const box = activeCoordinateBox();
  const areas = normalizeGrassAreas(project.site?.grassAreas);
  project.site.grassAreas = areas;
  const draftPoints = grassDrawingState?.points || [];

  grassLayer.style.left = `${box.left}px`;
  grassLayer.style.top = `${box.top}px`;
  grassLayer.style.width = `${box.width}px`;
  grassLayer.style.height = `${box.height}px`;

  if (!box.width || !box.height || (!areas.length && !draftPoints.length)) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'grass-svg');
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  areas.forEach((area) => {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('class', 'grass-area-shape');
    polygon.setAttribute('points', area.points.map((point) => grassSvgPoint(point, box)).join(' '));
    svg.appendChild(polygon);
  });

  if (draftPoints.length) {
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('class', 'grass-area-draft-line');
    polyline.setAttribute('points', draftPoints.map((point) => grassSvgPoint(point, box)).join(' '));
    svg.appendChild(polyline);

    draftPoints.forEach((point, index) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', `grass-area-vertex${index === 0 ? ' first' : ''}`);
      circle.setAttribute('cx', (point.xPercent / 100) * box.width);
      circle.setAttribute('cy', (point.yPercent / 100) * box.height);
      circle.setAttribute('r', index === 0 ? 6 : 4.5);
      svg.appendChild(circle);
    });
  }

  grassLayer.appendChild(svg);
}

function pointInPolygon(point, polygonPoints) {
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i, i += 1) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;
    const intersects = yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.000001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function applyGrassClip(context, box) {
  const areas = normalizeGrassAreas(project.site?.grassAreas);
  if (!areas.length) return false;
  context.beginPath();
  areas.forEach((area) => {
    area.points.forEach((point, index) => {
      const x = (point.xPercent / 100) * box.width;
      const y = (point.yPercent / 100) * box.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  });
  context.clip();
  return true;
}

function localPointIsInsideGrass(point) {
  const areas = normalizeGrassAreas(project.site?.grassAreas);
  if (!areas.length) return true;
  const box = activeCoordinateBox();
  const relativePoint = { x: point.x - box.left, y: point.y - box.top };
  return areas.some((area) => {
    const polygonPoints = area.points.map((areaPoint) => ({
      x: (areaPoint.xPercent / 100) * box.width,
      y: (areaPoint.yPercent / 100) * box.height,
    }));
    return pointInPolygon(relativePoint, polygonPoints);
  });
}

function updateGrassDrawingControls() {
  const drawing = Boolean(grassDrawingState);
  startGrassAreaBtn.classList.toggle('hidden', drawing);
  finishGrassAreaBtn.classList.toggle('hidden', !drawing);
  cancelGrassAreaBtn.classList.toggle('hidden', !drawing);
  finishGrassAreaBtn.disabled = !drawing || grassDrawingState.points.length < 3;
  mapCanvas.classList.toggle('drawing-grass', drawing);

  const areaCount = normalizeGrassAreas(project.site?.grassAreas).length;
  grassAreaCount.textContent = `${areaCount} grass area${areaCount === 1 ? '' : 's'}`;
  clearGrassAreasBtn.disabled = areaCount === 0 && !drawing;
}

function startGrassAreaDrawing() {
  closeSprinklerContextMenu();
  calibrationState = null;
  mapCanvas.classList.remove('calibrating');
  grassDrawingState = { points: [] };
  suppressEmptyCanvasHint = true;
  renderCanvas();
  updateScaleCalibrationStatus();
}

function finishGrassAreaDrawing() {
  if (!grassDrawingState || grassDrawingState.points.length < 3) return;
  project.site.grassAreas = normalizeGrassAreas([
    ...(project.site.grassAreas || []),
    { id: crypto.randomUUID(), points: grassDrawingState.points },
  ]);
  grassDrawingState = null;
  renderCanvas();
}

function cancelGrassAreaDrawing() {
  grassDrawingState = null;
  renderCanvas();
}

function clearGrassAreas() {
  grassDrawingState = null;
  project.site.grassAreas = [];
  renderCanvas();
}

function addGrassAreaPoint(position) {
  if (!grassDrawingState) return;
  grassDrawingState.points.push(position);
  renderCanvas();
}

function colorForPrecipitationRate(rate, maxRate) {
  if (rate <= 0 || maxRate <= 0) return 'rgba(0, 0, 0, 0)';
  const normalizedRate = Math.min(1, Math.max(0, rate / maxRate));
  const scaledRate = normalizedRate * maxPrecipitationColorStop.value;
  const upperIndex = precipitationColorStops.findIndex((stop) => scaledRate <= stop.value);
  if (upperIndex <= 0) {
    const [r, g, b] = precipitationColorStops[0].color;
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
  }
  const upper = precipitationColorStops[upperIndex] || maxPrecipitationColorStop;
  const lower = precipitationColorStops[upperIndex - 1] || precipitationColorStops[0];
  const span = Math.max(0.001, upper.value - lower.value);
  const t = Math.min(1, Math.max(0, (scaledRate - lower.value) / span));
  const [r1, g1, b1] = lower.color;
  const [r2, g2, b2] = upper.color;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgba(${r}, ${g}, ${b}, 0.68)`;
}

function rectanglePatternCoverageAtPoint(sprinkler, point, feetPerPixel) {
  const lengthFt = effectiveRadiusFt(sprinkler);
  const widthFt = effectiveWidthFt(sprinkler);
  if (lengthFt <= 0 || widthFt <= 0) return null;

  const center = localPointFromPercent(sprinkler);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const angle = (normalizeDegrees(sprinkler.orientationDegrees) * Math.PI) / 180;
  const alongLengthFt = (dx * Math.cos(angle) + dy * Math.sin(angle)) * feetPerPixel;
  const alongWidthFt = (-dx * Math.sin(angle) + dy * Math.cos(angle)) * feetPerPixel;
  const headOffsetX = normalizeRectangleHeadOffset(sprinkler.headOffsetX, 0.5);
  const headOffsetY = normalizeRectangleHeadOffset(sprinkler.headOffsetY, 0.5);
  const rectangleX = headOffsetX * lengthFt + alongLengthFt;
  const rectangleY = headOffsetY * widthFt + alongWidthFt;

  if (rectangleX < 0 || rectangleX > lengthFt || rectangleY < 0 || rectangleY > widthFt) return null;

  return {
    distanceFt: Math.hypot(alongLengthFt, alongWidthFt),
    headOffsetX,
    headOffsetY,
    lengthFt,
    widthFt,
  };
}

function pointInRectanglePattern(sprinkler, point, feetPerPixel) {
  return Boolean(rectanglePatternCoverageAtPoint(sprinkler, point, feetPerPixel));
}

function sprinklerCoversLocalPoint(sprinkler, point, feetPerPixel) {
  if (isRectanglePattern(sprinkler)) return pointInRectanglePattern(sprinkler, point, feetPerPixel);

  return Boolean(arcSprinklerCoverageAtPoint(sprinkler, point, feetPerPixel));
}

function arcSprinklerCoverageAtPoint(sprinkler, point, feetPerPixel) {
  const radiusFt = effectiveRadiusFt(sprinkler);
  if (radiusFt <= 0) return null;

  const center = localPointFromPercent(sprinkler);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distanceFt = Math.hypot(dx, dy) * feetPerPixel;
  if (distanceFt > radiusFt) return null;

  const arc = clampArcDegrees(sprinkler.arcDegrees);
  if (arc < 360) {
    const pointAngle = normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI);
    const leftHandLock = normalizeDegrees(sprinkler.orientationDegrees);
    const clockwiseSweep = normalizeDegrees(pointAngle - leftHandLock);
    if (clockwiseSweep > arc) return null;
  }

  return { distanceFt, radiusRatio: distanceFt / radiusFt };
}

function sprinklerPrecipitationAtPoint(sprinkler, point, feetPerPixel) {
  if (isRectanglePattern(sprinkler)) {
    const averagePr = sprinklerPr(sprinkler);
    if (averagePr <= 0) return 0;

    const coverage = rectanglePatternCoverageAtPoint(sprinkler, point, feetPerPixel);
    return coverage
      ? averagePr * rectangleRadialPrecipitationMultiplier(
        coverage.lengthFt,
        coverage.widthFt,
        coverage.headOffsetX,
        coverage.headOffsetY,
        coverage.distanceFt,
      )
      : 0;
  }

  const coverage = arcSprinklerCoverageAtPoint(sprinkler, point, feetPerPixel);
  if (!coverage) return 0;

  // Arc/sector heads use a normalized radial distribution. The shape function
  // S(r/R) controls relative intensity, while the normalization constant is
  // computed from ∫ S(rho) * rho d(rho) so integrating the point field over the
  // watered sector recovers the pressure-scaled sprinkler flow exactly. This
  // keeps overlap rendering additive without creating or losing water.
  return radialPrecipitationRateInHr({
    flowGpm: effectiveFlowGpm(sprinkler),
    radiusFt: effectiveRadiusFt(sprinkler),
    sectorAngleRadians: (clampArcDegrees(sprinkler.arcDegrees) * Math.PI) / 180,
    distanceFt: coverage.distanceFt,
    model: sprinkler.radialDistributionModel,
  });
}

function combinedPrecipitationAtPoint(point, feetPerPixel) {
  return project.sprinklers.reduce((total, sprinkler) => {
    if (!effectiveFlowGpm(sprinkler) || !effectiveRadiusFt(sprinkler)) return total;
    return total + sprinklerPrecipitationAtPoint(sprinkler, point, feetPerPixel);
  }, 0);
}

function precipitationGridCellPx(feetPerPixel) {
  if (!Number.isFinite(feetPerPixel) || feetPerPixel <= 0) return minPrecipitationGridCellPx;
  return Math.max(minPrecipitationGridCellPx, normalizePrecipitationGridCellFeet(precipitationGridCellFeet) / feetPerPixel);
}

function createPrecipitationCanvas(box, className) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = Math.ceil(box.width);
  canvas.height = Math.ceil(box.height);
  canvas.style.left = `${box.left}px`;
  canvas.style.top = `${box.top}px`;
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  return canvas;
}

function contourIntersectionsForCell(values, threshold, x, y, cellSize) {
  const [topLeft, topRight, bottomRight, bottomLeft] = values;
  const points = [];
  const addIntersection = (first, second, start, end) => {
    if ((first < threshold && second < threshold) || (first >= threshold && second >= threshold)) return;
    const span = second - first;
    const t = Math.abs(span) < 0.000001 ? 0.5 : Math.min(1, Math.max(0, (threshold - first) / span));
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    });
  };

  addIntersection(topLeft, topRight, { x, y }, { x: x + cellSize, y });
  addIntersection(topRight, bottomRight, { x: x + cellSize, y }, { x: x + cellSize, y: y + cellSize });
  addIntersection(bottomRight, bottomLeft, { x: x + cellSize, y: y + cellSize }, { x, y: y + cellSize });
  addIntersection(bottomLeft, topLeft, { x, y: y + cellSize }, { x, y });
  return points;
}

function contourThresholdsForMaxRate(maxRate) {
  if (maxRate <= 0) return [];
  const thresholdCount = Math.floor(maxRate / precipitationContourInterval);
  return Array.from({ length: thresholdCount }, (_, index) => (index + 1) * precipitationContourInterval);
}

function drawPrecipitationContours(context, rates, rows, columns, cellSize, maxRate) {
  if (rows < 2 || columns < 2 || maxRate <= 0) return 0;

  const contourThresholds = contourThresholdsForMaxRate(maxRate);
  if (!contourThresholds.length) return 0;
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.78)';
  context.lineWidth = 1.25;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 1.5;

  contourThresholds.forEach((threshold) => {
    context.beginPath();
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const x = column * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        const points = contourIntersectionsForCell([
          rates[row][column],
          rates[row][column + 1],
          rates[row + 1][column + 1],
          rates[row + 1][column],
        ], threshold, x, y, cellSize);

        if (points.length === 2) {
          context.moveTo(points[0].x, points[0].y);
          context.lineTo(points[1].x, points[1].y);
        } else if (points.length === 4) {
          context.moveTo(points[0].x, points[0].y);
          context.lineTo(points[1].x, points[1].y);
          context.moveTo(points[2].x, points[2].y);
          context.lineTo(points[3].x, points[3].y);
        }
      }
    }
    context.stroke();
  });
  context.restore();
  return contourThresholds.length;
}

function renderPrecipitationLayer() {
  precipitationLayer.replaceChildren();
  const enabled = showPrecipitationMap;
  mapCanvas.classList.toggle('precipitation-enabled', enabled);
  precipitationLegend.classList.toggle('hidden', !enabled);
  if (!enabled) {
    hidePrecipitationTooltip();
    return;
  }

  const box = activeCoordinateBox();
  const feetPerPixel = currentFeetPerPixel();
  const completeSprinklers = project.sprinklers.filter((sprinkler) => effectiveFlowGpm(sprinkler) > 0 && effectiveRadiusFt(sprinkler) > 0 && (!isRectanglePattern(sprinkler) || effectiveWidthFt(sprinkler) > 0));
  if (!box.width || !box.height || !completeSprinklers.length) {
    precipitationLegendRange.textContent = 'Add sprinkler flow and radius data to calculate combined PR.';
    precipitationContourSummary.textContent = '';
    hidePrecipitationTooltip();
    return;
  }

  const canvas = createPrecipitationCanvas(box, 'precipitation-map');
  const contourCanvas = createPrecipitationCanvas(box, 'precipitation-contours');

  const context = canvas.getContext('2d');
  const contourContext = contourCanvas.getContext('2d');
  const cellSize = precipitationGridCellPx(feetPerPixel);
  const columns = Math.ceil(box.width / cellSize);
  const rows = Math.ceil(box.height / cellSize);
  const rates = Array.from({ length: rows }, () => Array(columns).fill(0));
  let maxRate = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * cellSize;
      const y = row * cellSize;
      const sample = {
        x: box.left + Math.min(box.width - 1, x + cellSize / 2),
        y: box.top + Math.min(box.height - 1, y + cellSize / 2),
      };
      const rate = localPointIsInsideGrass(sample) ? combinedPrecipitationAtPoint(sample, feetPerPixel) : 0;
      maxRate = Math.max(maxRate, rate);
      rates[row][column] = rate;
    }
  }

  context.save();
  applyGrassClip(context, box);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rate = rates[row][column];
      if (rate <= 0) continue;
      const x = column * cellSize;
      const y = row * cellSize;
      context.fillStyle = colorForPrecipitationRate(rate, maxRate);
      context.fillRect(x, y, Math.min(cellSize, box.width - x), Math.min(cellSize, box.height - y));
    }
  }
  context.restore();

  contourContext.save();
  applyGrassClip(contourContext, box);
  const contourCount = drawPrecipitationContours(contourContext, rates, rows, columns, cellSize, maxRate);
  contourContext.restore();

  precipitationLayer.append(canvas, contourCanvas);
  const grassScopeText = hasGrassAreas() ? ` inside ${normalizeGrassAreas(project.site.grassAreas).length} grass area${normalizeGrassAreas(project.site.grassAreas).length === 1 ? '' : 's'}` : '';
  precipitationLegendRange.textContent = maxRate > 0
    ? `0–${formatNumber(maxRate, 2)} in/hr combined${grassScopeText} across ${completeSprinklers.length} sprinkler${completeSprinklers.length === 1 ? '' : 's'}`
    : hasGrassAreas()
      ? 'No irrigated grass cells found in the current canvas view.'
      : 'No irrigated cells found in the current canvas view; draw grass areas to limit the overlay.';
  precipitationContourSummary.textContent = maxRate > 0
    ? `Contours every ${formatNumber(precipitationContourInterval, 2)} in/hr on a ${formatFeetSetting(precipitationGridCellFeet)} grid (${contourCount} line${contourCount === 1 ? '' : 's'}).`
    : '';
}

function rectangleCoverageClass(patternType) {
  return `coverage ${normalizePatternType(patternType)}`;
}

function renderRectangleCoverage(sprinkler, color) {
  const lengthPx = Math.max(10, effectiveRadiusFt(sprinkler) / currentFeetPerPixel());
  const widthPx = Math.max(4, effectiveWidthFt(sprinkler) / currentFeetPerPixel());
  const headOffsetX = normalizeRectangleHeadOffset(sprinkler.headOffsetX, 0.5);
  const headOffsetY = normalizeRectangleHeadOffset(sprinkler.headOffsetY, 0.5);
  const coverage = document.createElement('div');
  coverage.className = rectangleCoverageClass(sprinkler.patternType);
  setPositionFromPercent(coverage, sprinkler);
  coverage.style.width = `${lengthPx}px`;
  coverage.style.height = `${widthPx}px`;
  coverage.style.color = color;
  coverage.style.transform = `translate(${-headOffsetX * 100}%, ${-headOffsetY * 100}%) rotate(${normalizeDegrees(sprinkler.orientationDegrees)}deg)`;
  coverage.style.transformOrigin = `${headOffsetX * 100}% ${headOffsetY * 100}%`;
  coverageLayer.appendChild(coverage);
  return coverage;
}

function renderArcCoverage(sprinkler, color) {
  const radiusPx = Math.max(10, effectiveRadiusFt(sprinkler) / currentFeetPerPixel());
  const arc = clampArcDegrees(sprinkler.arcDegrees);
  const leftHandLock = normalizeDegrees(sprinkler.orientationDegrees);
  const coverage = document.createElement('div');
  coverage.className = `coverage ${arc >= 360 ? 'full' : 'sector'}`;
  setPositionFromPercent(coverage, sprinkler);
  coverage.style.width = `${radiusPx * 2}px`;
  coverage.style.height = `${radiusPx * 2}px`;
  coverage.style.color = color;
  // Keep the left-hand lock fixed; arc changes should only sweep the right edge.
  coverage.style.setProperty('--arc-angle', `${arc}deg`);
  coverage.style.setProperty('--start-angle', `${leftHandLock}deg`);
  coverageLayer.appendChild(coverage);
  return coverage;
}

function renderEmptyCanvasHint() {
  const title = document.createElement('strong');
  title.textContent = 'Click anywhere to place your first sprinkler.';
  const details = document.createElement('span');
  details.textContent = 'Drag points to reposition. Right-click a sprinkler to change its zone or delete it. Ctrl+drag to pan, and use the scroll wheel to zoom.';
  emptyCanvasHint.replaceChildren(title, details);
}

function renderCanvas() {
  applyMapViewTransform();
  grassLayer.replaceChildren();
  coverageLayer.replaceChildren();
  sprinklerLayer.replaceChildren();
  renderGrassLayer();
  renderPrecipitationLayer();
  renderCalibrationLayer();
  updateGrassDrawingControls();
  applyCanvasLayerVisibility();
  const zoneId = currentInspectorZoneId();
  const zone = project.zones.find((candidate) => candidate.id === zoneId);
  const visibleSprinklers = sprinklersForCurrentZone();
  const drawingGrass = Boolean(grassDrawingState);
  emptyCanvasHint.classList.toggle('hidden', suppressEmptyCanvasHint || visibleSprinklers.length > 0 || Boolean(calibrationState) || drawingGrass);
  if (drawingGrass) {
    emptyCanvasHint.textContent = grassDrawingState.points.length < 3
      ? 'Click around the lawn edge to add at least 3 grass-area points.'
      : 'Click more points or choose Finish grass to close this grass area.';
    emptyCanvasHint.classList.remove('hidden');
  } else {
    renderEmptyCanvasHint();
  }
  sprinklerCount.textContent = `${visibleSprinklers.length} sprinkler${visibleSprinklers.length === 1 ? '' : 's'}${zone ? ` in ${zone.name}` : ''}`;

  visibleSprinklers.forEach((sprinkler) => {
    const color = getZoneColor(sprinkler.zoneId);
    const coverage = isRectanglePattern(sprinkler)
      ? renderRectangleCoverage(sprinkler, color)
      : renderArcCoverage(sprinkler, color);

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `sprinkler-marker ${sprinkler.id === selectedSprinklerId ? 'selected' : ''}`;
    setPositionFromPercent(marker, sprinkler);
    marker.style.backgroundColor = color;
    marker.style.setProperty('--marker-scale', `${1 / normalizeMapViewSettings(project.site.mapView).scale}`);
    marker.title = `${sprinkler.headModel || 'Sprinkler'} (${formatNumber(sprinklerPr(sprinkler), 2)} in/hr, ${formatNumber(effectiveFlowGpm(sprinkler))} gpm effective${isRectanglePattern(sprinkler) ? `, ${formatNumber(effectiveWidthFt(sprinkler), 1)} x ${formatNumber(effectiveRadiusFt(sprinkler), 1)} ft rectangle` : ''})`;
    marker.setAttribute('aria-label', `Select sprinkler ${sprinkler.headModel || sprinkler.id}`);
    marker.addEventListener('pointerdown', (event) => {
      if (event.ctrlKey || event.button !== 0) return;
      closeSprinklerContextMenu();
      event.stopPropagation();
      selectedSprinklerId = sprinkler.id;
      inspectedZoneId = sprinkler.zoneId;
      dragState = { id: sprinkler.id, pointerId: event.pointerId, marker, coverage };
      marker.setPointerCapture(event.pointerId);
      sprinklerLayer.querySelectorAll('.sprinkler-marker.selected').forEach((element) => element.classList.remove('selected'));
      marker.classList.add('selected');
      renderInspector();
      renderZoneInspectorControls();
    });
    marker.addEventListener('contextmenu', (event) => openSprinklerContextMenu(event, sprinkler));
    sprinklerLayer.appendChild(marker);
  });
}

function renderInspector() {
  renderSprinklerSelect();
  clearSelect(selectedZone);
  project.zones.forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zone.name;
    selectedZone.appendChild(option);
  });

  const sprinkler = selectedSprinklerInCurrentZone();
  noSelection.classList.toggle('hidden', Boolean(sprinkler));
  selectedSprinklerFields.classList.toggle('hidden', !sprinkler);
  if (!sprinkler) return;

  sprinklerPanel.open = true;

  selectedZone.value = sprinkler.zoneId;
  selectedHead.value = sprinkler.headModel || '';
  selectedNozzle.value = sprinkler.nozzleModel || '';
  selectedPressure.value = sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi ?? 45;
  selectedFlow.value = sprinkler.baseFlowGpm ?? sprinkler.flowGpm ?? 0;
  selectedRadius.value = sprinkler.baseRadiusFt ?? sprinkler.radiusFt ?? 0;
  selectedArc.value = sprinkler.arcDegrees ?? 360;
  selectedOrientation.value = sprinkler.orientationDegrees ?? 0;
  selectedPressureRegulating.checked = Boolean(sprinkler.pressureRegulating);
  selectedArc.disabled = isRectanglePattern(sprinkler);
  selectedArc.title = isRectanglePattern(sprinkler) ? 'Rectangle-pattern nozzles use width x length geometry instead of arc degrees.' : '';
  selectedRadius.labels?.[0]?.replaceChildren(document.createTextNode(isRectanglePattern(sprinkler) ? 'Length (ft)' : 'Radius (ft)'));
}

function renderAnalysis() {
  analysisSummary.replaceChildren();
  updateAllZoneCalculatedInfo();

  const totalFlow = project.sprinklers.reduce((sum, sprinkler) => sum + effectiveFlowGpm(sprinkler), 0);
  const totalArea = project.sprinklers.reduce((sum, sprinkler) => sum + sprinklerAreaSqft(sprinkler), 0);
  const weightedTotalFlow = project.sprinklers.reduce((sum, sprinkler) => {
    const zone = zoneForSprinkler(sprinkler);
    return sum + effectiveFlowGpm(sprinkler) * (zone?.waterShare ?? defaultZoneWaterShare);
  }, 0);
  const overallPr = totalArea > 0 ? (96.3 * weightedTotalFlow) / totalArea : 0;
  const missingData = project.sprinklers.filter((sprinkler) => !effectiveFlowGpm(sprinkler) || !effectiveRadiusFt(sprinkler) || (isRectanglePattern(sprinkler) && !effectiveWidthFt(sprinkler))).length;

  addAnalysisCard('Total flow', `${formatNumber(totalFlow)} gpm`, `${project.sprinklers.length} sprinklers`);
  addAnalysisCard('Throw area', `${formatNumber(totalArea, 0)} sq ft`, 'Sector-adjusted estimate');
  addAnalysisCard('Overall PR', `${formatNumber(overallPr)} in/hr`, 'Water-share adjusted across all zones');

  project.zones.forEach((zone) => {
    const zoneSprinklers = project.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id);
    const zoneFlow = zoneSprinklers.reduce((sum, sprinkler) => sum + effectiveFlowGpm(sprinkler), 0);
    const supply = Number(zone.measuredFlowGpm) || 0;
    const warning = supply > 0 && zoneFlow > supply;
    const nearLimit = supply > 0 && zoneFlow <= supply && zoneFlow >= supply * 0.9;
    if (warning) {
      addAnalysisCard('Supply warning', `${zone.name} overrun`, `Estimated head demand exceeds measured supply by ${formatNumber(zoneFlow - supply)} gpm. Actual pressure may drop as flow rises.`, true);
    } else if (nearLimit) {
      addAnalysisCard('Supply caution', `${zone.name} near limit`, 'Estimated demand is within 10% of measured supply; field pressure may sag under load.', true);
    }
  });

  if (missingData > 0) {
    addAnalysisCard('Warning', `${missingData} incomplete`, 'Add flow and throw geometry data before trusting PR.', true);
  }
}

function addAnalysisCard(label, value, detail, warning = false) {
  const card = document.createElement('div');
  card.className = `analysis-card ${warning ? 'warning-card' : ''}`;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  const detailEl = document.createElement('span');
  detailEl.textContent = detail;

  card.append(labelEl, valueEl, detailEl);
  analysisSummary.appendChild(card);
}

function render() {
  updateProjectInputs();
  updateScaleCalibrationStatus();
  renderZones();
  renderLayerSelectorMenu();
  applyMapViewTransform();
  renderSatelliteLayer();
  renderImageLayer();
  renderCanvas();
  renderInspector();
  renderAnalysis();
}

function canvasPositionFromEvent(event) {
  const rect = mapCanvas.getBoundingClientRect();
  const box = activeCoordinateBox();
  const local = screenPointToLocalPoint(event.clientX - rect.left, event.clientY - rect.top);
  return {
    xPercent: Math.min(100, Math.max(0, ((local.x - box.left) / box.width) * 100)),
    yPercent: Math.min(100, Math.max(0, ((local.y - box.top) / box.height) * 100)),
  };
}

function hidePrecipitationTooltip() {
  precipitationTooltip.classList.add('hidden');
}

function precipitationLocalPointFromEvent(event) {
  const rect = mapCanvas.getBoundingClientRect();
  const local = screenPointToLocalPoint(event.clientX - rect.left, event.clientY - rect.top);
  const box = activeCoordinateBox();
  if (local.x < box.left || local.x > box.left + box.width || local.y < box.top || local.y > box.top + box.height) return null;
  return local;
}

function updatePrecipitationTooltip(event) {
  if (!showPrecipitationMap || !isCanvasLayerVisible(precipitationLayer.id) || panState || dragState || event.target.closest('.precipitation-legend') || event.target.closest('.context-menu')) {
    hidePrecipitationTooltip();
    return;
  }

  const point = precipitationLocalPointFromEvent(event);
  if (!point) {
    hidePrecipitationTooltip();
    return;
  }

  const rate = combinedPrecipitationAtPoint(point, currentFeetPerPixel());
  const rect = mapCanvas.getBoundingClientRect();
  const left = Math.min(rect.width - 16, Math.max(8, event.clientX - rect.left));
  const top = Math.min(rect.height - 8, Math.max(28, event.clientY - rect.top));
  precipitationTooltip.style.left = `${left}px`;
  precipitationTooltip.style.top = `${top}px`;
  precipitationTooltip.innerHTML = `<strong>${formatNumber(rate, 2)} in/hr</strong><span>Combined precipitation rate here</span>`;
  precipitationTooltip.classList.remove('hidden');
}

function startMapPan(event) {
  if (!event.ctrlKey) return false;
  event.preventDefault();
  panState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPanX: project.site.mapView.panX,
    startPanY: project.site.mapView.panY,
    moved: false,
  };
  mapCanvas.classList.add('panning');
  mapCanvas.setPointerCapture(event.pointerId);
  suppressNextCanvasClick = true;
  return true;
}

function updateMapPan(event) {
  if (!panState || event.pointerId !== panState.pointerId) return;
  const deltaX = event.clientX - panState.startClientX;
  const deltaY = event.clientY - panState.startClientY;
  panState.moved ||= Math.hypot(deltaX, deltaY) > 2;
  project.site.mapView = normalizeMapViewSettings({
    ...project.site.mapView,
    panX: panState.startPanX + deltaX,
    panY: panState.startPanY + deltaY,
  });
  applyMapViewTransform();
}

function endMapPan(event) {
  if (!panState || event.pointerId !== panState.pointerId) return;
  mapCanvas.classList.remove('panning');
  if (panState.moved) renderSatelliteLayer();
  panState = null;
}

function zoomMapView(event) {
  event.preventDefault();
  const rect = mapCanvas.getBoundingClientRect();
  const view = normalizeMapViewSettings(project.site.mapView);
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const local = screenPointToLocalPoint(pointerX, pointerY);
  const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextScale = Math.min(mapViewMaxScale, Math.max(mapViewMinScale, view.scale * zoomFactor));
  const { width, height } = canvasCenter();
  const angle = (view.rotationDegrees * Math.PI) / 180;
  const dx = local.x - width / 2;
  const dy = local.y - height / 2;

  project.site.mapView = normalizeMapViewSettings({
    ...view,
    scale: nextScale,
    panX: pointerX - width / 2 - (dx * Math.cos(angle) - dy * Math.sin(angle)) * nextScale,
    panY: pointerY - height / 2 - (dx * Math.sin(angle) + dy * Math.cos(angle)) * nextScale,
  });
  applyMapViewTransform();
  renderSatelliteLayer();
}

function addSprinklerAt(position) {
  ensureDefaultZone();
  const model = findSelectedModel();
  const pressurePsi = selectedCatalogPressurePsi(model) || 45;
  const performance = model ? lookupPerformance(model, pressurePsi) : null;
  const sprinkler = {
    id: crypto.randomUUID(),
    zoneId: currentInspectorZoneId() || project.zones[0].id,
    ...position,
    headModel: model?.headModel || 'Unspecified head',
    nozzleModel: model?.nozzleModel || 'Unspecified nozzle',
    pressurePsi,
    ratedPressurePsi: pressurePsi,
    pressureRegulating: Boolean(model?.pressureRegulating),
    patternType: normalizePatternType(model?.patternType),
    headOffsetX: normalizeRectangleHeadOffset(model?.headOffsetX, 0.5),
    headOffsetY: normalizeRectangleHeadOffset(model?.headOffsetY, 0.5),
    widthFt: performance?.widthFt ?? 0,
    baseWidthFt: performance?.widthFt ?? 0,
    arcDegrees: model?.defaultArcDegrees || 360,
    orientationDegrees: 0,
    radiusFt: performance?.radiusFt ?? 12,
    flowGpm: performance?.flowGpm ?? 1,
    baseRadiusFt: performance?.radiusFt ?? 12,
    baseFlowGpm: performance?.flowGpm ?? 1,
  };
  syncSprinklerGps(sprinkler);
  project.sprinklers.push(sprinkler);
  selectedSprinklerId = sprinkler.id;
  inspectedZoneId = sprinkler.zoneId;
  render();
}

function closeSprinklerContextMenu() {
  contextMenuSprinklerId = null;
  sprinklerContextMenu.classList.add('hidden');
}

function renderSprinklerContextMenuZones(sprinkler) {
  clearSelect(contextZoneSelect);
  ensureDefaultZone();

  project.zones.forEach((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zone.name;
    contextZoneSelect.appendChild(option);
  });

  contextZoneSelect.disabled = project.zones.length === 0;
  contextZoneSelect.value = sprinkler?.zoneId || project.zones[0]?.id || '';
}

function openSprinklerContextMenu(event, sprinkler) {
  event.preventDefault();
  event.stopPropagation();
  const activeZoneId = currentInspectorZoneId();
  selectedSprinklerId = sprinkler.id;
  inspectedZoneId = activeZoneId;
  contextMenuSprinklerId = sprinkler.id;
  renderCanvas();
  renderInspector();
  renderZoneInspectorControls();

  const currentSprinkler = selectedSprinkler() || sprinkler;
  renderSprinklerContextMenuZones(currentSprinkler);

  const canvasRect = mapCanvas.getBoundingClientRect();
  sprinklerContextMenu.classList.remove('hidden');
  const menuRect = sprinklerContextMenu.getBoundingClientRect();
  const maxLeft = Math.max(0, canvasRect.width - menuRect.width - 6);
  const maxTop = Math.max(0, canvasRect.height - menuRect.height - 6);
  const left = Math.min(Math.max(6, event.clientX - canvasRect.left), maxLeft);
  const top = Math.min(Math.max(6, event.clientY - canvasRect.top), maxTop);

  sprinklerContextMenu.style.left = `${left}px`;
  sprinklerContextMenu.style.top = `${top}px`;
}

function deleteSprinklerById(sprinklerId) {
  if (!sprinklerId) return;
  project.sprinklers = project.sprinklers.filter((sprinkler) => sprinkler.id !== sprinklerId);
  closeSprinklerContextMenu();
  selectFirstSprinklerInCurrentZone();
  inspectedZoneId = currentInspectorZoneId();
  render();
}

function updateSelectedSprinklerFromForm() {
  const sprinkler = selectedSprinkler();
  if (!sprinkler) return;
  const zoneChanged = sprinkler.zoneId !== selectedZone.value;
  sprinkler.zoneId = selectedZone.value;
  if (zoneChanged) inspectedZoneId = sprinkler.zoneId;
  sprinkler.headModel = selectedHead.value;
  sprinkler.nozzleModel = selectedNozzle.value;
  sprinkler.ratedPressurePsi = Number(selectedPressure.value) || 0;
  sprinkler.pressurePsi = sprinkler.ratedPressurePsi;
  sprinkler.baseFlowGpm = Number(selectedFlow.value) || 0;
  sprinkler.flowGpm = sprinkler.baseFlowGpm;
  sprinkler.baseRadiusFt = Number(selectedRadius.value) || 0;
  sprinkler.radiusFt = sprinkler.baseRadiusFt;
  sprinkler.pressureRegulating = selectedPressureRegulating.checked;
  if (!isRectanglePattern(sprinkler)) sprinkler.baseWidthFt = 0;
  sprinkler.widthFt = sprinkler.baseWidthFt || 0;
  sprinkler.arcDegrees = clampArcDegrees(selectedArc.value);
  sprinkler.orientationDegrees = normalizeDegrees(selectedOrientation.value);
  renderCanvas();
  if (zoneChanged) renderZoneInspectorControls();
  renderSprinklerSelect();
  renderAnalysis();
}

function updateLookupResult() {
  const model = findSelectedModel();
  const pressurePsi = syncCatalogPressureInput(model);

  if (!model) {
    lookupResult.textContent = 'Please select manufacturer, head model, and nozzle model first.';
    return;
  }

  if (pressurePsi === null) {
    lookupResult.textContent = 'Selected model has no catalog pressure points.';
    return;
  }

  const result = lookupPerformance(model, pressurePsi);
  if (result.flowGpm == null || result.radiusFt == null) {
    lookupResult.textContent = result.warning || 'Lookup failed.';
    return;
  }

  const warningText = result.warning ? ` Warning: ${result.warning}` : '';
  const regulationText = model.pressureRegulating ? 'pressure regulating' : 'not pressure regulating; zone pressure will scale placed heads';
  const nominalPrecipitationText = formatNominalPrecipitation(result.nominalPrecipitationInHr);
  const patternText = isRectanglePattern(model)
    ? `Rectangular throw: ${formatNumber(result.widthFt, 1)} x ${formatNumber(result.radiusFt, 1)} ft; head offset ${formatNumber(model.headOffsetX * 100, 0)}%, ${formatNumber(model.headOffsetY * 100, 0)}%`
    : `Rated radius: ${result.radiusFt.toFixed(2)} ft`;
  lookupResult.textContent = `Catalog pressure: ${formatNumber(pressurePsi, 1)} PSI | Rated flow: ${result.flowGpm.toFixed(2)} gpm | ${patternText} (${result.mode}, ${regulationText}).${nominalPrecipitationText}${warningText}`;
}

manufacturerSelect.addEventListener('change', () => {
  setOptions(headSelect, getHeads(manufacturerSelect.value), 'Select head model');
  setOptions(nozzleSelect, [], 'Select nozzle model');
  updateLookupResult();
});

headSelect.addEventListener('change', () => {
  setOptions(nozzleSelect, getNozzles(manufacturerSelect.value, headSelect.value), 'Select nozzle model');
  updateLookupResult();
});

nozzleSelect.addEventListener('change', updateLookupResult);

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

async function loadDefaultCatalog() {
  try {
    setCatalogStatus(`Loading ${defaultCatalog.label}...`);
    const response = await fetch(defaultCatalog.path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    loadCatalogFromText(await response.text(), defaultCatalog.label);
  } catch (error) {
    setCatalogStatus(`Failed to load ${defaultCatalog.label}: ${error.message}. You can still import a CSV catalog.`);
  }
}


newBtn.addEventListener('click', () => {
  hydrateProject(structuredClone(emptyProject), { suppressEmptyCanvasHint: false });
});

saveBtn.addEventListener('click', async () => {
  project.sprinklers.forEach(syncSprinklerGps);

  const suggestedName = 'sprinklers-project.json';
  const jsonText = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });

  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Project files',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      alert(`Failed to save project: ${error.message}`);
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
});

loadInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const loaded = JSON.parse(await file.text());
    if (typeof loaded !== 'object' || loaded === null || !('version' in loaded)) {
      throw new Error('Invalid project file');
    }
    hydrateProject(loaded, { suppressEmptyCanvasHint: true });
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

addressLookupBtn.addEventListener('click', async () => {
  const address = siteAddressInput.value;
  addressLookupBtn.disabled = true;
  setAddressLookupStatus('Looking up address...');
  try {
    const result = await geocodeAddress(address);
    project.site.address = result.label;
    project.site.imageSource = 'satellite';
    project.site.satellite = normalizeSatelliteSettings({
      ...project.site.satellite,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    syncSprinklersFromGps();
    setAddressLookupStatus(`Found via ${result.source}. Centered map at ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}.`);
    render();
  } catch (error) {
    setAddressLookupStatus(error.message);
  } finally {
    addressLookupBtn.disabled = false;
  }
});

canvasBackgroundSelect.addEventListener('change', () => {
  project.site.imageSource = canvasBackgroundSelect.value;
  updateProjectInputs();
  renderSatelliteLayer();
  renderImageLayer();
  renderCanvas();
  renderAnalysis();
  updateScaleCalibrationStatus();
  if (project.site.imageSource === 'image' && !hasUploadedBackgroundImage()) {
    promptForBackgroundImage();
  }
});

function updateSatelliteSettingsFromInputs() {
  project.site.satellite = normalizeSatelliteSettings({
    latitude: satelliteLatitudeInput.value === '' ? null : Number(satelliteLatitudeInput.value),
    longitude: satelliteLongitudeInput.value === '' ? null : Number(satelliteLongitudeInput.value),
    source: satelliteSourceSelect.value,
    zoom: Number(satelliteZoomInput.value),
  });
  satelliteZoomValue.textContent = project.site.satellite.zoom;
  syncSprinklersFromGps();
  renderSatelliteLayer();
  renderCanvas();
  updateScaleCalibrationStatus();
}

[satelliteLatitudeInput, satelliteLongitudeInput, satelliteSourceSelect, satelliteZoomInput].forEach((input) => {
  input.addEventListener('input', updateSatelliteSettingsFromInputs);
});


backgroundRotationInput.addEventListener('input', () => {
  project.site.mapView = normalizeMapViewSettings({
    ...project.site.mapView,
    rotationDegrees: Number(backgroundRotationInput.value),
  });
  backgroundRotationValue.textContent = `${Math.round(project.site.mapView.rotationDegrees)}°`;
  applyMapViewTransform();
  renderSatelliteLayer();
});

backgroundImageInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    project.site.backgroundImage = normalizeBackgroundImageSettings({
      ...project.site.backgroundImage,
      name: file.name,
      dataUrl: await readFileAsDataUrl(file),
    });
    project.site.imageSource = 'image';
    render();
  } catch (error) {
    imageStatus.textContent = `Failed to load image: ${error.message}`;
  } finally {
    backgroundImageInput.value = '';
  }
});

function updateBackgroundImageSettingsFromInputs() {
  project.site.backgroundImage = normalizeBackgroundImageSettings({
    ...project.site.backgroundImage,
    scale: Number(imageScaleInput.value),
    rotationDegrees: Number(imageRotationInput.value),
  });
  imageScaleValue.textContent = `${project.site.backgroundImage.scale.toFixed(2)}×`;
  imageRotationValue.textContent = `${Math.round(project.site.backgroundImage.rotationDegrees)}°`;
  renderImageLayer();
  renderCanvas();
  renderAnalysis();
  updateScaleCalibrationStatus();
}

[imageScaleInput, imageRotationInput].forEach((input) => {
  input.addEventListener('input', updateBackgroundImageSettingsFromInputs);
});

startScaleCalibrationBtn.addEventListener('click', startScaleCalibration);
clearScaleCalibrationBtn.addEventListener('click', clearScaleCalibration);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error || new Error('Unable to read image file.')));
    reader.readAsDataURL(file);
  });
}

sprinklerForm.addEventListener('submit', (event) => {
  event.preventDefault();
});

zoneInspectorSelect.addEventListener('change', () => {
  inspectedZoneId = zoneInspectorSelect.value;
  if (selectedSprinkler()?.zoneId !== inspectedZoneId) selectFirstSprinklerInCurrentZone();
  closeSprinklerContextMenu();
  renderCanvas();
  renderInspector();
  renderAnalysis();
});

zoneSprinklerSelect.addEventListener('change', () => {
  if (!zoneSprinklerSelect.value) return;
  selectedSprinklerId = zoneSprinklerSelect.value;
  inspectedZoneId = selectedSprinkler()?.zoneId || inspectedZoneId;
  renderCanvas();
  renderInspector();
  renderZoneInspectorControls();
});

[precipitationContourIntervalInput, precipitationGridCellInput].forEach((control) => {
  control.addEventListener('input', () => updatePrecipitationSettingsFromControl(control));
  control.addEventListener('change', () => updatePrecipitationSettingsFromControl(control));
});

startGrassAreaBtn.addEventListener('click', startGrassAreaDrawing);
finishGrassAreaBtn.addEventListener('click', finishGrassAreaDrawing);
cancelGrassAreaBtn.addEventListener('click', cancelGrassAreaDrawing);
clearGrassAreasBtn.addEventListener('click', clearGrassAreas);

showPrecipitationMapInput.addEventListener('change', () => {
  showPrecipitationMap = showPrecipitationMapInput.checked;
  if (showPrecipitationMap) {
    project.site.canvasLayers = normalizeCanvasLayerSettings(project.site?.canvasLayers);
    project.site.canvasLayers[precipitationLayer.id] = true;
    renderLayerSelectorMenu();
  }
  renderCanvas();
});

addZoneBtn.addEventListener('click', () => {
  project.zones.push(normalizeZone({ name: `Zone ${project.zones.length + 1}` }, project.zones.length));
  render();
});

mapCanvas.addEventListener('pointerdown', startMapPan);
mapCanvas.addEventListener('pointermove', updateMapPan);
mapCanvas.addEventListener('pointermove', updatePrecipitationTooltip);
mapCanvas.addEventListener('pointerleave', hidePrecipitationTooltip);
mapCanvas.addEventListener('pointerup', endMapPan);
mapCanvas.addEventListener('pointercancel', endMapPan);
mapCanvas.addEventListener('wheel', zoomMapView, { passive: false });
mapCanvas.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.sprinkler-marker') || event.ctrlKey || panState) event.preventDefault();
});
mapCanvas.addEventListener('click', (event) => {
  if (event.target.closest('.context-menu') || event.target.closest('.precipitation-legend') || event.target.closest('.canvas-zone-controls')) return;
  if (contextMenuSprinklerId) {
    closeSprinklerContextMenu();
    return;
  }
  if (suppressNextCanvasClick || event.ctrlKey) {
    suppressNextCanvasClick = false;
    return;
  }
  if (calibrationState) {
    addCalibrationPoint(canvasPositionFromEvent(event));
    return;
  }
  if (grassDrawingState) {
    addGrassAreaPoint(canvasPositionFromEvent(event));
    return;
  }
  if (event.target.closest('.sprinkler-marker')) return;
  addSprinklerAt(canvasPositionFromEvent(event));
});
if (canvasZoneControls) {
  ['click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'wheel'].forEach((eventName) => {
    canvasZoneControls.addEventListener(eventName, (event) => event.stopPropagation());
  });
}
sprinklerContextMenu.addEventListener('click', (event) => event.stopPropagation());
contextZoneSelect.addEventListener('change', () => {
  const sprinkler = project.sprinklers.find((candidate) => candidate.id === contextMenuSprinklerId);
  if (!sprinkler || !contextZoneSelect.value) return;
  const activeZoneId = currentInspectorZoneId();
  const movedOutOfActiveZone = sprinkler.zoneId === activeZoneId && contextZoneSelect.value !== activeZoneId;
  sprinkler.zoneId = contextZoneSelect.value;
  inspectedZoneId = activeZoneId;
  if (movedOutOfActiveZone) selectFirstSprinklerInCurrentZone();
  else selectedSprinklerId = sprinkler.id;
  closeSprinklerContextMenu();
  render();
});
contextDeleteSprinklerBtn.addEventListener('click', () => deleteSprinklerById(contextMenuSprinklerId));

sprinklerLayer.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const sprinkler = project.sprinklers.find((candidate) => candidate.id === dragState.id);
  if (!sprinkler) return;
  Object.assign(sprinkler, canvasPositionFromEvent(event));
  syncSprinklerGps(sprinkler);
  setPositionFromPercent(dragState.marker, sprinkler);
  setPositionFromPercent(dragState.coverage, sprinkler);
});

sprinklerLayer.addEventListener('pointerup', () => {
  dragState = null;
  renderCanvas();
});

sprinklerLayer.addEventListener('pointercancel', () => {
  dragState = null;
  renderCanvas();
});

resetMapViewBtn.addEventListener('click', () => {
  project.site.mapView = normalizeMapViewSettings();
  updateProjectInputs();
  applyMapViewTransform();
  renderSatelliteLayer();
  renderCanvas();
});

let canvasResizeFrame = null;
let lastCanvasSize = canvasCenter();

function handleCanvasResize() {
  const nextSize = canvasCenter();
  if (nextSize.width === lastCanvasSize.width && nextSize.height === lastCanvasSize.height) return;
  lastCanvasSize = nextSize;

  syncSprinklersFromGps();
  renderSatelliteLayer();
  renderImageLayer();
  renderCanvas();
  renderAnalysis();
  updateScaleCalibrationStatus();
}

function scheduleCanvasResize() {
  if (canvasResizeFrame) return;
  canvasResizeFrame = window.requestAnimationFrame(() => {
    canvasResizeFrame = null;
    handleCanvasResize();
  });
}

window.addEventListener('resize', () => {
  closeSprinklerContextMenu();
  scheduleCanvasResize();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (grassDrawingState) cancelGrassAreaDrawing();
    closeSprinklerContextMenu();
  }
});
if ('ResizeObserver' in window) {
  new ResizeObserver(scheduleCanvasResize).observe(mapCanvas);
}

[selectedZone, selectedHead, selectedNozzle, selectedPressure, selectedFlow, selectedRadius, selectedArc, selectedOrientation, selectedPressureRegulating].forEach(
  (input) => input.addEventListener('input', updateSelectedSprinklerFromForm),
);

applyCatalogToSelectedBtn.addEventListener('click', () => {
  const sprinkler = selectedSprinkler();
  const model = findSelectedModel();
  const pressurePsi = selectedCatalogPressurePsi(model);
  if (!sprinkler || !model || pressurePsi === null) return;
  const result = lookupPerformance(model, pressurePsi);
  if (result.flowGpm == null || result.radiusFt == null) return;
  Object.assign(sprinkler, {
    headModel: model.headModel,
    nozzleModel: model.nozzleModel,
    pressurePsi,
    ratedPressurePsi: pressurePsi,
    pressureRegulating: Boolean(model.pressureRegulating),
    patternType: normalizePatternType(model.patternType),
    headOffsetX: normalizeRectangleHeadOffset(model.headOffsetX, 0.5),
    headOffsetY: normalizeRectangleHeadOffset(model.headOffsetY, 0.5),
    widthFt: result.widthFt ?? 0,
    baseWidthFt: result.widthFt ?? 0,
    flowGpm: result.flowGpm,
    radiusFt: result.radiusFt,
    baseFlowGpm: result.flowGpm,
    baseRadiusFt: result.radiusFt,
    arcDegrees: model.defaultArcDegrees || sprinkler.arcDegrees,
  });
  lookupResult.textContent = `Applied ${model.headModel} / ${model.nozzleModel} to selected sprinkler (${model.pressureRegulating ? 'pressure regulating' : 'not pressure regulating'}).`;
  render();
});


deleteSelectedBtn.addEventListener('click', () => deleteSprinklerById(selectedSprinklerId));

hydrateProject(emptyProject);
loadDefaultCatalog();
setOptions(manufacturerSelect, [], 'Select manufacturer');
setOptions(headSelect, [], 'Select head model');
setOptions(nozzleSelect, [], 'Select nozzle model');
