const RECOVERABLE_POSTGRES_CONNECTION_ERROR_TOKENS = [
  "getaddrinfo enotfound",
  "connection timeout",
  "connect timeout",
  "timeout exceeded when trying to connect",
  "connection terminated due to connection timeout",
  "connection terminated unexpectedly",
  "terminating connection due to administrator command",
  "server closed the connection unexpectedly",
  "econnrefused",
  "econnreset",
  "connection reset by peer",
  "socket hang up",
  "und_err_connect_timeout",
  "fetch failed",
] as const

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function shouldFallbackToNextPostgresConnection(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return RECOVERABLE_POSTGRES_CONNECTION_ERROR_TOKENS.some((token) => message.includes(token))
}
