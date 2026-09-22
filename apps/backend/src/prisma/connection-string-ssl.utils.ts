export function applySslMode(connectionString: string): string {
  if (!connectionString.includes("sslmode=")) {
    const separator = connectionString.includes("?") ? "&" : "?";
    return `${connectionString}${separator}sslmode=require`;
  }
  return connectionString;
}
