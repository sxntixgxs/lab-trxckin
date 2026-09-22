export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function toTimestamp(dateValue: string) {
  return new Date(`${dateValue}T23:59:59`).getTime();
}
