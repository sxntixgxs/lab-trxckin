export function intersectSelectedWithAvailable(
  selected: string[],
  availableIds: string[],
) {
  const available = new Set(availableIds);
  return selected.filter((id) => available.has(id));
}
