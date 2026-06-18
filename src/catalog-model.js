export function selectedCatalogPressurePsi(model) {
  if (!model?.points?.length) return null;
  const preferredPressures = [45, 30];
  const preferredPoint = preferredPressures
    .map((pressurePsi) => model.points.find((point) => point.pressurePsi === pressurePsi))
    .find(Boolean);
  return (preferredPoint || model.points[model.points.length - 1]).pressurePsi;
}
