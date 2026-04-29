/**
 * @typedef {'NOT_FOUND'
 *   | 'INVALID_INPUT'
 *   | 'TASK_NOT_OPEN'
 *   | 'TASK_NOT_IN_PROGRESS'
 *   | 'NOT_OWNER'
 *   | 'DEPENDENCIES_NOT_SATISFIED'
 *   | 'CIRCULAR_DEPENDENCY'
 *   | 'INVALID_DEPENDENCY'
 *   | 'DUPLICATE_DEPENDENCY'
 *   | 'INVALID_STATUS'
 *   | 'HAS_DEPENDENTS'
 *   | 'INTERNAL_ERROR'
 * } MatrixErrorCode
 */

/**
 * @typedef {Error & { code: MatrixErrorCode }} MatrixError
 */

/**
 * Creates a structured MatrixError with an error code attached.
 *
 * @param {MatrixErrorCode} code
 * @param {string} message
 * @returns {MatrixError}
 */
export function matrixError(code, message) {
  const err = new Error(message);
  // @ts-ignore — augmenting Error with code
  err.code = code;
  return /** @type {MatrixError} */ (err);
}
