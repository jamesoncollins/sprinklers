export const precipitationColorStops = [
  { value: 0, color: [215, 48, 31] },
  { value: 0.5, color: [253, 141, 60] },
  { value: 1, color: [255, 232, 120] },
  { value: 1.5, color: [116, 196, 118] },
  { value: 2, color: [49, 163, 84] },
];

export const maxPrecipitationColorStop = precipitationColorStops[precipitationColorStops.length - 1];

function rgbaFromColorStop(color, alpha) {
  const [r, g, b] = color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function precipitationLegendGradient(alpha = 0.95) {
  const stops = precipitationColorStops.map((stop) => rgbaFromColorStop(stop.color, alpha));
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function precipitationColorScaleMax(rates, percentile = 0.9) {
  const positiveRates = rates
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .sort((a, b) => a - b);
  if (!positiveRates.length) return 0;
  const clampedPercentile = Math.min(1, Math.max(0, percentile));
  const index = Math.min(
    positiveRates.length - 1,
    Math.max(0, Math.floor((positiveRates.length - 1) * clampedPercentile)),
  );
  return positiveRates[index];
}

export function colorForPrecipitationRate(rate, maxRate) {
  if (rate <= 0 || maxRate <= 0) return 'rgba(0, 0, 0, 0)';
  const normalizedRate = Math.min(1, Math.max(0, rate / maxRate));
  const scaledRate = normalizedRate * maxPrecipitationColorStop.value;
  const upperIndex = precipitationColorStops.findIndex((stop) => scaledRate <= stop.value);
  if (upperIndex <= 0) {
    return rgbaFromColorStop(precipitationColorStops[0].color, 0.5);
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
