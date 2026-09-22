const TECHNICAL_ERROR_PATTERN =
  /\b(?:ReturnsValidationError|ArgumentValidationError|ValidationError|TypeError|ReferenceError|SyntaxError|RangeError|NetworkError)\b|\b(?:Request ID|Server Error|Called by client|Failed to fetch|fetch failed|ECONN\w*|function not found|internal server error|Unauthorized|Unauthenticated|Forbidden)\b|Object contains extra field|Value does not match validator|\bPath:\s|\bValidator:\s|\[CONVEX\b|(?:^|\s)at \S+\s*\(/i;

function getRawErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    data?: unknown;
    message?: unknown;
  };

  if (typeof candidate.data === "string") return candidate.data;
  if (
    candidate.data &&
    typeof candidate.data === "object" &&
    "message" in candidate.data &&
    typeof candidate.data.message === "string"
  ) {
    return candidate.data.message;
  }
  return typeof candidate.message === "string" ? candidate.message : null;
}

function extractBusinessMessage(rawMessage: string): string {
  const normalized = rawMessage.replace(/\r\n?/g, "\n").trim();
  const uncaughtBusinessMessage = normalized.match(
    /(?:^|\n)Uncaught\s+(?:Error|ConvexError):\s*([^\n]+)/i
  )?.[1];
  const candidate = uncaughtBusinessMessage ?? normalized;

  return candidate
    .replace(/^\s*(?:Error|ConvexError):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keeps actionable domain errors while hiding Convex envelopes, request IDs,
 * validators and stack traces from users of the invoicing workflow.
 */
export function getFacturacionErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = getRawErrorMessage(error);
  if (!rawMessage) return fallback;

  const businessMessage = extractBusinessMessage(rawMessage);
  if (!businessMessage || TECHNICAL_ERROR_PATTERN.test(businessMessage)) {
    return fallback;
  }

  return businessMessage;
}
