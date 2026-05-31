const zoneColors = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#00a3a3', '#6f4e37'];
const defaultFeetPerPixel = 0.25;
const earthRadiusFeet = 20925524.9;
const mapViewMinScale = 0.5;
const mapViewMaxScale = 4;

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
  },
  zones: [],
  sprinklers: [],
};

let project = structuredClone(emptyProject);
let catalogState = null;
let selectedSprinklerId = null;
let dragState = null;
let panState = null;
let calibrationState = null;
let suppressNextCanvasClick = false;

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
const addZoneBtn = document.getElementById('add-zone');
const mapCanvas = document.getElementById('map-canvas');
const satelliteLayer = document.getElementById('satellite-layer');
const imageLayer = document.getElementById('image-layer');
const coverageLayer = document.getElementById('coverage-layer');
const calibrationLayer = document.getElementById('calibration-layer');
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
const selectedPressureRegulating = document.getElementById('selected-pressure-regulating');
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
  setCatalogStatus(`Loaded ${sourceLabel}: ${models.length} model/nozzle combinations.${warningText}`);
  return true;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['true', 'yes', 'y', '1'].includes(String(value).trim().toLowerCase());
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
    const pressureRegulating = parseBoolean(row.pressure_regulating, false);
    const key = `${manufacturer}|${headModel}|${nozzleModel}`;

    if (!groups.has(key)) {
      groups.set(key, {
        manufacturer,
        headModel,
        nozzleModel,
        defaultArcDegrees: arcDegrees,
        pressureRegulating,
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

function normalizeZone(zone = {}, index = 0) {
  const pressurePsi = optionalNumber(zone.pressurePsi);
  const measuredFlowGpm = optionalNumber(zone.measuredFlowGpm);
  return {
    id: zone.id || crypto.randomUUID(),
    name: zone.name || `Zone ${index + 1}`,
    pressurePsi: pressurePsi && pressurePsi > 0 ? pressurePsi : 45,
    measuredFlowGpm: measuredFlowGpm && measuredFlowGpm > 0 ? measuredFlowGpm : null,
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

function mapViewTransform() {
  const { scale, panX, panY, rotationDegrees } = normalizeMapViewSettings(project.site?.mapView);
  return `translate(${panX}px, ${panY}px) rotate(${rotationDegrees}deg) scale(${scale})`;
}

function applyMapViewTransform() {
  const transform = mapViewTransform();
  [satelliteLayer, imageLayer, coverageLayer, calibrationLayer, sprinklerLayer, mapCanvas.querySelector('.canvas-grid')].forEach((layer) => {
    if (layer) layer.style.transform = transform;
  });
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

function normalizeSprinklerPosition(sprinkler, index) {
  const normalized = {
    ...sprinkler,
    ratedPressurePsi: optionalNumber(sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi) || 45,
    pressureRegulating: Boolean(sprinkler.pressureRegulating),
    baseFlowGpm: optionalNumber(sprinkler.baseFlowGpm ?? sprinkler.flowGpm) || 0,
    baseRadiusFt: optionalNumber(sprinkler.baseRadiusFt ?? sprinkler.radiusFt) || 0,
  };
  normalized.pressurePsi = normalized.ratedPressurePsi;
  normalized.flowGpm = normalized.baseFlowGpm;
  normalized.radiusFt = normalized.baseRadiusFt;
  if (Number.isFinite(normalized.xPercent) && Number.isFinite(normalized.yPercent)) return normalized;

  return {
    ...normalized,
    xPercent: Math.min(90, 35 + index * 12),
    yPercent: Math.min(85, 40 + index * 10),
  };
}

function hydrateProject(loaded) {
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
    },
    zones: Array.isArray(loaded.zones) ? loaded.zones.map((zone, index) => normalizeZone(zone, index)) : [],
    sprinklers: Array.isArray(loaded.sprinklers)
      ? loaded.sprinklers.map((sprinkler, index) => normalizeSprinklerPosition({ ...sprinkler }, index))
      : [],
  };
  ensureDefaultZone();
  syncSprinklersFromGps();
  selectedSprinklerId = project.sprinklers[0]?.id || null;
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

function sprinklerAreaSqft(sprinkler) {
  const radius = effectiveRadiusFt(sprinkler);
  const arc = Math.min(360, Math.max(1, Number(sprinkler.arcDegrees) || 360));
  return (arc / 360) * Math.PI * radius * radius;
}

function sprinklerPr(sprinkler) {
  const flow = effectiveFlowGpm(sprinkler);
  const area = sprinklerAreaSqft(sprinkler);
  if (area <= 0) return 0;
  return (96.3 * flow) / area;
}


function canvasCenter() {
  const rect = mapCanvas.getBoundingClientRect();
  return { width: rect.width || mapCanvas.clientWidth, height: rect.height || mapCanvas.clientHeight };
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
      renderAnalysis();
    });
    flowField.append(flowLabel, flowInputEl);

    const settings = document.createElement('div');
    settings.className = 'zone-settings';
    settings.append(pressureField, flowField);

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

    row.append(swatch, input, deleteBtn, settings);
    zonesList.appendChild(row);
  });
}


function localPointFromPercent(point) {
  const { width, height } = canvasCenter();
  return {
    x: (point.xPercent / 100) * width,
    y: (point.yPercent / 100) * height,
  };
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
  return normalizeDistanceScaleSettings(project.site?.distanceScale).feetPerPixel;
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
    scaleCalibrationStatus.textContent = `Manual scale: ${scale.measuredFeet.toFixed(2)} ft over ${pixels.toFixed(1)} px (${scale.feetPerPixel.toFixed(3)} ft/px).`;
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
    marker.style.left = `${point.xPercent}%`;
    marker.style.top = `${point.yPercent}%`;
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
  line.style.left = `${points[0].xPercent}%`;
  line.style.top = `${points[0].yPercent}%`;
  line.style.width = `${length}px`;
  line.style.transform = `rotate(${angle}deg)`;
  calibrationLayer.appendChild(line);

  const lineLabel = document.createElement('div');
  lineLabel.className = 'calibration-label';
  lineLabel.style.left = `${(points[0].xPercent + points[1].xPercent) / 2}%`;
  lineLabel.style.top = `${(points[0].yPercent + points[1].yPercent) / 2}%`;
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

function renderCanvas() {
  applyMapViewTransform();
  coverageLayer.replaceChildren();
  sprinklerLayer.replaceChildren();
  renderCalibrationLayer();
  emptyCanvasHint.classList.toggle('hidden', project.sprinklers.length > 0 || Boolean(calibrationState));
  sprinklerCount.textContent = `${project.sprinklers.length} sprinkler${project.sprinklers.length === 1 ? '' : 's'}`;

  project.sprinklers.forEach((sprinkler) => {
    const color = getZoneColor(sprinkler.zoneId);
    const radiusPx = Math.max(10, effectiveRadiusFt(sprinkler) / currentFeetPerPixel());
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
    marker.style.setProperty('--marker-scale', `${1 / normalizeMapViewSettings(project.site.mapView).scale}`);
    marker.title = `${sprinkler.headModel || 'Sprinkler'} (${formatNumber(sprinklerPr(sprinkler), 2)} in/hr, ${formatNumber(effectiveFlowGpm(sprinkler))} gpm effective)`;
    marker.setAttribute('aria-label', `Select sprinkler ${sprinkler.headModel || sprinkler.id}`);
    marker.addEventListener('pointerdown', (event) => {
      if (event.ctrlKey) return;
      event.stopPropagation();
      selectedSprinklerId = sprinkler.id;
      dragState = { id: sprinkler.id, pointerId: event.pointerId, marker, coverage };
      marker.setPointerCapture(event.pointerId);
      sprinklerLayer.querySelectorAll('.sprinkler-marker.selected').forEach((element) => element.classList.remove('selected'));
      marker.classList.add('selected');
      renderInspector();
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
  selectedPressure.value = sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi ?? 45;
  selectedFlow.value = sprinkler.baseFlowGpm ?? sprinkler.flowGpm ?? 0;
  selectedRadius.value = sprinkler.baseRadiusFt ?? sprinkler.radiusFt ?? 0;
  selectedArc.value = sprinkler.arcDegrees ?? 360;
  selectedOrientation.value = sprinkler.orientationDegrees ?? 0;
  selectedPressureRegulating.checked = Boolean(sprinkler.pressureRegulating);
}

function renderAnalysis() {
  analysisSummary.replaceChildren();

  const totalFlow = project.sprinklers.reduce((sum, sprinkler) => sum + effectiveFlowGpm(sprinkler), 0);
  const totalArea = project.sprinklers.reduce((sum, sprinkler) => sum + sprinklerAreaSqft(sprinkler), 0);
  const overallPr = totalArea > 0 ? (96.3 * totalFlow) / totalArea : 0;
  const missingData = project.sprinklers.filter((sprinkler) => !effectiveFlowGpm(sprinkler) || !effectiveRadiusFt(sprinkler)).length;

  addAnalysisCard('Total flow', `${formatNumber(totalFlow)} gpm`, `${project.sprinklers.length} sprinklers`);
  addAnalysisCard('Throw area', `${formatNumber(totalArea, 0)} sq ft`, 'Sector-adjusted estimate');
  addAnalysisCard('Overall PR', `${formatNumber(overallPr)} in/hr`, 'Based on total flow / throw area');

  project.zones.forEach((zone) => {
    const zoneSprinklers = project.sprinklers.filter((sprinkler) => sprinkler.zoneId === zone.id);
    const zoneFlow = zoneSprinklers.reduce((sum, sprinkler) => sum + effectiveFlowGpm(sprinkler), 0);
    const zoneArea = zoneSprinklers.reduce((sum, sprinkler) => sum + sprinklerAreaSqft(sprinkler), 0);
    const zonePr = zoneArea > 0 ? (96.3 * zoneFlow) / zoneArea : 0;
    const supply = Number(zone.measuredFlowGpm) || 0;
    const warning = supply > 0 && zoneFlow > supply;
    const nearLimit = supply > 0 && zoneFlow <= supply && zoneFlow >= supply * 0.9;
    const supplyDetail = supply > 0 ? ` of ${formatNumber(supply)} gpm measured` : ' measured supply unknown';
    addAnalysisCard(
      zone.name,
      `${formatNumber(zonePr)} in/hr`,
      `${formatNumber(zoneFlow)} gpm${supplyDetail} · ${zoneSprinklers.length} heads · ${formatNumber(zone.pressurePsi ?? 45, 1)} PSI`,
      warning || nearLimit,
    );
    if (warning) {
      addAnalysisCard('Supply warning', `${zone.name} overrun`, `Estimated head demand exceeds measured supply by ${formatNumber(zoneFlow - supply)} gpm. Actual pressure may drop as flow rises.`, true);
    } else if (nearLimit) {
      addAnalysisCard('Supply caution', `${zone.name} near limit`, 'Estimated demand is within 10% of measured supply; field pressure may sag under load.', true);
    }
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
  updateScaleCalibrationStatus();
  renderZones();
  applyMapViewTransform();
  renderSatelliteLayer();
  renderImageLayer();
  renderCanvas();
  renderInspector();
  renderAnalysis();
}

function canvasPositionFromEvent(event) {
  const rect = mapCanvas.getBoundingClientRect();
  const { width, height } = canvasCenter();
  const local = screenPointToLocalPoint(event.clientX - rect.left, event.clientY - rect.top);
  return {
    xPercent: Math.min(100, Math.max(0, (local.x / width) * 100)),
    yPercent: Math.min(100, Math.max(0, (local.y / height) * 100)),
  };
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
  const pressurePsi = Number(pressureInput.value) || 45;
  const performance = model ? lookupPerformance(model, pressurePsi) : null;
  const sprinkler = {
    id: crypto.randomUUID(),
    zoneId: project.zones[0].id,
    ...position,
    headModel: model?.headModel || 'Unspecified head',
    nozzleModel: model?.nozzleModel || 'Unspecified nozzle',
    pressurePsi,
    ratedPressurePsi: pressurePsi,
    pressureRegulating: Boolean(model?.pressureRegulating),
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
  render();
}

function updateSelectedSprinklerFromForm() {
  const sprinkler = selectedSprinkler();
  if (!sprinkler) return;
  sprinkler.zoneId = selectedZone.value;
  sprinkler.headModel = selectedHead.value;
  sprinkler.nozzleModel = selectedNozzle.value;
  sprinkler.ratedPressurePsi = Number(selectedPressure.value) || 0;
  sprinkler.pressurePsi = sprinkler.ratedPressurePsi;
  sprinkler.baseFlowGpm = Number(selectedFlow.value) || 0;
  sprinkler.flowGpm = sprinkler.baseFlowGpm;
  sprinkler.baseRadiusFt = Number(selectedRadius.value) || 0;
  sprinkler.radiusFt = sprinkler.baseRadiusFt;
  sprinkler.pressureRegulating = selectedPressureRegulating.checked;
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
  const regulationText = model.pressureRegulating ? 'pressure regulating' : 'not pressure regulating; zone pressure will scale placed heads';
  lookupResult.textContent = `Rated flow: ${result.flowGpm.toFixed(2)} gpm | Rated radius: ${result.radiusFt.toFixed(2)} ft (${result.mode}, ${regulationText}).${warningText}`;
});

newBtn.addEventListener('click', () => {
  hydrateProject(structuredClone(emptyProject));
});

saveBtn.addEventListener('click', () => {
  project.sprinklers.forEach(syncSprinklerGps);
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

addZoneBtn.addEventListener('click', () => {
  project.zones.push(normalizeZone({ name: `Zone ${project.zones.length + 1}` }, project.zones.length));
  render();
});

mapCanvas.addEventListener('pointerdown', startMapPan);
mapCanvas.addEventListener('pointermove', updateMapPan);
mapCanvas.addEventListener('pointerup', endMapPan);
mapCanvas.addEventListener('pointercancel', endMapPan);
mapCanvas.addEventListener('wheel', zoomMapView, { passive: false });
mapCanvas.addEventListener('contextmenu', (event) => {
  if (event.ctrlKey || panState) event.preventDefault();
});
mapCanvas.addEventListener('click', (event) => {
  if (suppressNextCanvasClick || event.ctrlKey) {
    suppressNextCanvasClick = false;
    return;
  }
  if (calibrationState) {
    addCalibrationPoint(canvasPositionFromEvent(event));
    return;
  }
  if (event.target.closest('.sprinkler-marker')) return;
  addSprinklerAt(canvasPositionFromEvent(event));
});

sprinklerLayer.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const sprinkler = project.sprinklers.find((candidate) => candidate.id === dragState.id);
  if (!sprinkler) return;
  Object.assign(sprinkler, canvasPositionFromEvent(event));
  syncSprinklerGps(sprinkler);
  dragState.marker.style.left = `${sprinkler.xPercent}%`;
  dragState.marker.style.top = `${sprinkler.yPercent}%`;
  dragState.coverage.style.left = `${sprinkler.xPercent}%`;
  dragState.coverage.style.top = `${sprinkler.yPercent}%`;
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

window.addEventListener('resize', renderSatelliteLayer);

[selectedZone, selectedHead, selectedNozzle, selectedPressure, selectedFlow, selectedRadius, selectedArc, selectedOrientation, selectedPressureRegulating].forEach(
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
    ratedPressurePsi: pressurePsi,
    pressureRegulating: Boolean(model.pressureRegulating),
    flowGpm: result.flowGpm,
    radiusFt: result.radiusFt,
    baseFlowGpm: result.flowGpm,
    baseRadiusFt: result.radiusFt,
    arcDegrees: model.defaultArcDegrees || sprinkler.arcDegrees,
  });
  lookupResult.textContent = `Applied ${model.headModel} / ${model.nozzleModel} to selected sprinkler (${model.pressureRegulating ? 'pressure regulating' : 'not pressure regulating'}).`;
  render();
});

deleteSelectedBtn.addEventListener('click', () => {
  if (!selectedSprinklerId) return;
  project.sprinklers = project.sprinklers.filter((sprinkler) => sprinkler.id !== selectedSprinklerId);
  selectedSprinklerId = project.sprinklers[0]?.id || null;
  render();
});

hydrateProject(emptyProject);
loadDefaultCatalog();
setOptions(manufacturerSelect, [], 'Select manufacturer');
setOptions(headSelect, [], 'Select head model');
setOptions(nozzleSelect, [], 'Select nozzle model');
