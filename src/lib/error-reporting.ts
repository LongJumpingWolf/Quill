type RuntimeErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type ErrorReporter = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: RuntimeErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    /**
     * Optional hook for an external monitoring client (Sentry, a host page, a
     * self-hosted collector…). Assign it before the app boots and every error
     * caught by a React boundary is forwarded here.
     */
    __errorReporter?: ErrorReporter;
  }
}

/** Errors thrown from loaders and server fns are often a raw Response. */
function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Response) {
    return { message: `Response ${error.status}${error.url ? ` at ${error.url}` : ""}` };
  }
  if (error instanceof Error) {
    return error.stack === undefined
      ? { message: error.message }
      : { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

/**
 * Report an error caught by a React error boundary. Production React does not
 * rethrow boundary-caught errors to `window.onerror`, so nothing else sees
 * them unless we forward them explicitly.
 */
export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const details = { source: "react_error_boundary", route: window.location.pathname, ...context };

  window.__errorReporter?.captureException?.(error, details, {
    mechanism: "react_error_boundary",
    handled: false,
    severity: "error",
  });

  const { message, stack } = describe(error);
  window.dispatchEvent(
    new CustomEvent("app:runtime-error", {
      detail: { message, ...(stack !== undefined && { stack }), ...details },
    }),
  );
}
