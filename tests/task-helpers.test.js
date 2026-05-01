import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db.js';
import { parseAcceptanceCriteria, getTaskDependencies } from '../src/task-helpers.js';
import { getRequirementsService } from '../src/requirements.js';
import { getTasksService } from '../src/tasks.js';

/** @returns {import('node:sqlite').DatabaseSync} */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  initDb(db);
  return db;
}

// ---------------------------------------------------------------------------
// parseAcceptanceCriteria
// ---------------------------------------------------------------------------

describe('parseAcceptanceCriteria', () => {
  it('parses a valid JSON array of strings', () => {
    const result = parseAcceptanceCriteria({ acceptance_criteria: '["AC1","AC2"]' });
    expect(result).toEqual(['AC1', 'AC2']);
  });

  it('returns empty array when raw is not a string', () => {
    expect(parseAcceptanceCriteria({ acceptance_criteria: null })).toEqual([]);
    expect(parseAcceptanceCriteria({ acceptance_criteria: 42 })).toEqual([]);
    // @ts-expect-error testing undefined input
    expect(parseAcceptanceCriteria({ acceptance_criteria: undefined })).toEqual([]);
  });

  it('returns empty array for invalid JSON (covers catch branch)', () => {
    expect(parseAcceptanceCriteria({ acceptance_criteria: 'not-json{{{' })).toEqual([]);
    expect(parseAcceptanceCriteria({ acceptance_criteria: '{bad}' })).toEqual([]);
  });

  it('returns empty array for valid JSON that is not an array', () => {
    expect(parseAcceptanceCriteria({ acceptance_criteria: '"just a string"' })).toEqual([]);
    expect(parseAcceptanceCriteria({ acceptance_criteria: '{"key":"val"}' })).toEqual([]);
    expect(parseAcceptanceCriteria({ acceptance_criteria: '42' })).toEqual([]);
  });

  it('filters out non-string elements from the array', () => {
    const result = parseAcceptanceCriteria({
      acceptance_criteria: '["valid",42,null,"also valid"]',
    });
    expect(result).toEqual(['valid', 'also valid']);
  });

  it('returns empty array for an empty JSON array', () => {
    expect(parseAcceptanceCriteria({ acceptance_criteria: '[]' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTaskDependencies
// ---------------------------------------------------------------------------

describe('getTaskDependencies', () => {
  /** @type {import('node:sqlite').DatabaseSync} */
  let db;
  /** @type {string} */
  let reqId;
  /** @type {string} */
  let t1Id;
  /** @type {string} */
  let t2Id;

  beforeEach(() => {
    db = makeDb();
    const reqSvc = getRequirementsService(db);
    const taskSvc = getTasksService(db);

    const req = reqSvc.createRequirement({
      title: 'R',
      description: '',
      priority: 1,
      acceptanceCriteria: [],
      dependencies: [],
    });
    reqId = req.id;
    void reqId;

    const t1 = taskSvc.createTask({
      parentReqId: req.id,
      title: 'T1',
      description: '',
      acceptanceCriteria: [],
      dependencies: [],
    });
    t1Id = t1.id;

    const t2 = taskSvc.createTask({
      parentReqId: req.id,
      title: 'T2',
      description: '',
      acceptanceCriteria: [],
      dependencies: [t1Id],
    });
    t2Id = t2.id;
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array for a task with no dependencies', () => {
    expect(getTaskDependencies(db, t1Id)).toEqual([]);
  });

  it('returns dependency IDs for a task with dependencies', () => {
    expect(getTaskDependencies(db, t2Id)).toEqual([t1Id]);
  });

  it('returns empty array for a non-existent task ID', () => {
    expect(getTaskDependencies(db, 'tsk-99999')).toEqual([]);
  });
});
