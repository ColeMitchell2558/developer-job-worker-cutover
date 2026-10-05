import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, jobSchema } from '../src/job_types.js';

test('approved release operation is acknowledged', () => {
  const job = jobSchema.parse({
    kind: 'release_operation',
    releaseId: 'rel-77',
    version: '2.4.1',
    approved: true
  });

  assert.deepEqual(decide(job, 5000), {
    state: 'ack',
    summary: 'release rel-77 can proceed at 2.4.1'
  });
});

test('laggy diagnostics are retried with the rate window', () => {
  const job = jobSchema.parse({
    kind: 'developer_diagnostics',
    workerId: 'worker-a',
    observedLagMs: 9000,
    queueDepth: 4
  });

  assert.deepEqual(decide(job, 5000), {
    state: 'retry',
    summary: 'worker worker-a should slow intake',
    delayMs: 5000
  });
});
