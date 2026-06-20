export function averageScopedPrecipitationRateAtSamples(samples, rateAtPoint, isInsideScope = () => true) {
  if (!Array.isArray(samples) || typeof rateAtPoint !== 'function') return 0;

  let totalRate = 0;
  let scopedSampleCount = 0;

  samples.forEach((sample) => {
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !isInsideScope(sample)) return;
    const rate = Number(rateAtPoint(sample));
    if (!Number.isFinite(rate) || rate <= 0) {
      scopedSampleCount += 1;
      return;
    }
    totalRate += rate;
    scopedSampleCount += 1;
  });

  return scopedSampleCount > 0 ? totalRate / scopedSampleCount : 0;
}
