const inchesPerHourPerGpmPerSqft = 96.3;
const defaultRadialDistributionModel = 'hunter-mp2000-default';

const radialDistributionProfiles = {
  [defaultRadialDistributionModel]: {
    label: 'Hunter MP2000 measured radial profile',
    scale: 0.287,
    exponent: 2.48,
  },
};

const radialIntegralCache = new Map();

function radialModelCacheKey(model) {
  if (typeof model === 'string' || model === undefined || model === null) return model || defaultRadialDistributionModel;
  if (typeof model === 'function') return model;
  return JSON.stringify(model);
}

function resolveRadialDistributionProfile(model = defaultRadialDistributionModel) {
  if (typeof model === 'function') return model;
  if (typeof model === 'string' || model === undefined || model === null) {
    return radialDistributionProfiles[model || defaultRadialDistributionModel] || radialDistributionProfiles[defaultRadialDistributionModel];
  }
  return model;
}

export {
  defaultRadialDistributionModel,
  inchesPerHourPerGpmPerSqft,
  radialDistributionProfiles,
};

/**
 * Dimensionless radial sprinkler distribution shape.
 *
 * rho is normalized throw distance (rho = r / R). The returned value is only a
 * relative weight; it is converted into an absolute precipitation rate by
 * normalizing the profile over the sprinkler sector so total integrated water
 * volume still equals the head flow.
 */
export function radialShape(rho, model = defaultRadialDistributionModel) {
  if (!Number.isFinite(rho) || rho < 0 || rho > 1) return 0;

  const profile = resolveRadialDistributionProfile(model);
  if (typeof profile === 'function') return Math.max(0, Number(profile(rho)) || 0);

  const scale = Number(profile.scale);
  const exponent = Number(profile.exponent);
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(exponent) || exponent <= 0) return 0;

  return 1 / (1 + (rho / scale) ** exponent);
}

/**
 * Numerically integrates I = ∫[0,1] S(rho) * rho d(rho).
 *
 * The extra rho term is the polar-area Jacobian. Keeping this as a reusable
 * numerical integral means future radial distribution profiles can be swapped in
 * without changing the normalization math or hard-coding profile constants.
 */
export function radialShapeNormalizationIntegral(model = defaultRadialDistributionModel, intervals = 1024) {
  const evenIntervals = Math.max(2, Math.ceil(intervals / 2) * 2);
  const cacheKey = `${radialModelCacheKey(model)}:${evenIntervals}`;
  if (radialIntegralCache.has(cacheKey)) return radialIntegralCache.get(cacheKey);

  const step = 1 / evenIntervals;
  let weightedSum = radialShape(0, model) * 0 + radialShape(1, model) * 1;

  // Simpson's rule gives stable, high-accuracy normalization for smooth radial
  // profiles while keeping the implementation dependency-free.
  for (let index = 1; index < evenIntervals; index += 1) {
    const rho = index * step;
    weightedSum += (index % 2 === 0 ? 2 : 4) * radialShape(rho, model) * rho;
  }

  const integral = (step / 3) * weightedSum;
  radialIntegralCache.set(cacheKey, integral);
  return integral;
}

/**
 * Computes C = Q / (theta * R^2 * I), where:
 * - Q is sprinkler flow (gpm),
 * - theta is the watered sector angle (radians),
 * - R is actual pressure-scaled throw radius (ft), and
 * - I is ∫[0,1] S(rho) * rho d(rho).
 *
 * C has units of gpm / ft². Multiplying C by S(r / R) produces a flow-density
 * field whose sector-area integral recovers Q exactly up to numerical error.
 */
export function radialPrecipitationNormalizationConstant({
  flowGpm,
  radiusFt,
  sectorAngleRadians,
  model = defaultRadialDistributionModel,
} = {}) {
  const flow = Number(flowGpm);
  const radius = Number(radiusFt);
  const theta = Number(sectorAngleRadians);
  if (![flow, radius, theta].every(Number.isFinite) || flow <= 0 || radius <= 0 || theta <= 0) return 0;

  const integral = radialShapeNormalizationIntegral(model);
  if (!Number.isFinite(integral) || integral <= 0) return 0;
  return flow / (theta * radius * radius * integral);
}

/**
 * Point precipitation rate for an arc/sector sprinkler in inches/hour.
 *
 * The normalized shape is first evaluated as a flow-density field in gpm/ft²:
 *   P_flow(r) = C * S(r/R)
 * Then it is converted to the app's display/analysis unit using the standard
 * irrigation conversion 1 gpm over 1 ft² = 96.3 in/hr.
 */
export function radialPrecipitationRateInHr({
  flowGpm,
  radiusFt,
  sectorAngleRadians,
  distanceFt,
  model = defaultRadialDistributionModel,
} = {}) {
  const radius = Number(radiusFt);
  const distance = Number(distanceFt);
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(distance) || distance < 0 || distance > radius) return 0;

  const constant = radialPrecipitationNormalizationConstant({ flowGpm, radiusFt: radius, sectorAngleRadians, model });
  if (constant <= 0) return 0;
  return inchesPerHourPerGpmPerSqft * constant * radialShape(distance / radius, model);
}
