/**
 * Prints a structured error message and exits the process with a non-zero code.
 *
 * @param {unknown} error
 * @returns {never}
 */
export function handleError(error) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code ?? 'UNKNOWN')
      : 'UNKNOWN';
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error [${code}]: ${message}`);
  process.exit(1);
}
