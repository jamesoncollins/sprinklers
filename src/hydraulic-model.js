const defaultBisectionIterations = 60;

function positiveNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

export function sprinklerRegulatorPressurePsi(sprinkler = {}) {
  return positiveNumber(sprinkler.regulatorPressurePsi)
    ?? positiveNumber(sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi)
    ?? 0;
}

export function sprinklerRatedPressurePsi(sprinkler = {}) {
  return positiveNumber(sprinkler.ratedPressurePsi ?? sprinkler.pressurePsi)
    ?? sprinklerRegulatorPressurePsi(sprinkler)
    ?? 0;
}

export function sprinklerCatalogFlowGpm(sprinkler = {}) {
  return positiveNumber(sprinkler.baseFlowGpm ?? sprinkler.flowGpm) ?? 0;
}

export function sprinklerPressureScaleFactorAtPressure(sprinkler = {}, pressurePsi = 0) {
  const operatingPressure = Math.max(0, Number(pressurePsi) || 0);
  if (operatingPressure <= 0) return 0;

  if (sprinkler.pressureRegulating) {
    const regulatorPressure = sprinklerRegulatorPressurePsi(sprinkler);
    if (regulatorPressure <= 0) return 1;
    return Math.sqrt(Math.min(operatingPressure, regulatorPressure) / regulatorPressure);
  }

  const ratedPressure = sprinklerRatedPressurePsi(sprinkler);
  if (ratedPressure <= 0) return 1;
  return Math.sqrt(operatingPressure / ratedPressure);
}

export function sprinklerFlowAtPressureGpm(sprinkler = {}, pressurePsi = 0) {
  return sprinklerCatalogFlowGpm(sprinkler) * sprinklerPressureScaleFactorAtPressure(sprinkler, pressurePsi);
}

export function supplyFlowAtPressureGpm(zone = {}, pressurePsi = 0) {
  const staticPressure = positiveNumber(zone.pressurePsi) ?? 0;
  const openFlow = positiveNumber(zone.measuredFlowGpm) ?? 0;
  if (staticPressure <= 0 || openFlow <= 0) return 0;

  const pressureRatio = Math.min(1, Math.max(0, (Number(pressurePsi) || 0) / staticPressure));
  return openFlow * Math.sqrt(1 - pressureRatio);
}

export function solveZoneHydraulics(zone = {}, sprinklers = [], options = {}) {
  const staticPressure = positiveNumber(zone.pressurePsi) ?? 0;
  const openFlow = positiveNumber(zone.measuredFlowGpm) ?? 0;
  const activeSprinklers = Array.isArray(sprinklers) ? sprinklers : [];

  const demandAt = (pressurePsi) => activeSprinklers.reduce(
    (sum, sprinkler) => sum + sprinklerFlowAtPressureGpm(sprinkler, pressurePsi),
    0,
  );

  if (staticPressure <= 0) {
    const actualFlows = activeSprinklers.map(() => 0);
    return { staticPressurePsi: 0, operatingPressurePsi: 0, totalFlowGpm: 0, actualFlows };
  }

  if (openFlow <= 0 || activeSprinklers.length === 0 || demandAt(staticPressure) <= 0) {
    const actualFlows = activeSprinklers.map((sprinkler) => sprinklerFlowAtPressureGpm(sprinkler, staticPressure));
    return {
      staticPressurePsi: staticPressure,
      operatingPressurePsi: staticPressure,
      totalFlowGpm: actualFlows.reduce((sum, flow) => sum + flow, 0),
      actualFlows,
    };
  }

  let low = 0;
  let high = staticPressure;
  const iterations = Math.max(1, Number(options.iterations) || defaultBisectionIterations);

  for (let index = 0; index < iterations; index += 1) {
    const midpoint = (low + high) / 2;
    const supply = supplyFlowAtPressureGpm(zone, midpoint);
    const demand = demandAt(midpoint);
    if (supply >= demand) low = midpoint;
    else high = midpoint;
  }

  const operatingPressurePsi = (low + high) / 2;
  const actualFlows = activeSprinklers.map((sprinkler) => sprinklerFlowAtPressureGpm(sprinkler, operatingPressurePsi));
  return {
    staticPressurePsi: staticPressure,
    operatingPressurePsi,
    totalFlowGpm: actualFlows.reduce((sum, flow) => sum + flow, 0),
    actualFlows,
  };
}
