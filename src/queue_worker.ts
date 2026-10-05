import { infrai, InfraiError } from './infrai_client.js';
import { decide, jobSchema, type Job } from './job_types.js';

const RATE_LIMIT_WINDOW_MS = 5000;

export async function runWorkerOnce(queue: string) {
  const batch = await infrai.queue.consume({ queue, max_messages: 5, visibility_timeout: 60 });
  const messages = Array.isArray(batch) ? batch : (batch as { items?: Array<{ message_id: string; payload: unknown }> }).items ?? [];
  const outcomes: Array<{ message_id: string; decision: string; summary: string }> = [];

  for (const message of messages) {
    const parsed = jobSchema.safeParse(message.payload);
    if (!parsed.success) {
      outcomes.push({ message_id: message.message_id, decision: 'hold', summary: 'invalid job body' });
      continue;
    }

    const decision = decide(parsed.data as Job, RATE_LIMIT_WINDOW_MS);
    outcomes.push({ message_id: message.message_id, decision: decision.state, summary: decision.summary });

    if (decision.state === 'ack') {
      await infrai.queue.ack({ queue, message_id: message.message_id });
    }
  }

  return outcomes;
}

export async function enqueueCutoverChecklist(queueName: string) {
  const queue = await infrai.queue.create({ name: queueName });
  return {
    queue,
    checklist: [
      'publish build_event jobs first',
      'run one consumer with max_messages=5',
      'watch hold and retry decisions in the logs',
      'switch producers after the first clean batch'
    ]
  };
}

export async function publishSampleJobs(queue: string) {
  await infrai.queue.publish({
    queue,
    payload: {
      kind: 'build_event',
      buildId: 'build-1042',
      sha: 'a1b2c3d',
      branch: 'main',
      status: 'passed'
    }
  });
  await infrai.queue.publish({
    queue,
    payload: {
      kind: 'release_operation',
      releaseId: 'rel-77',
      version: '2.4.1',
      approved: true
    }
  });
  await infrai.queue.publish({
    queue,
    payload: {
      kind: 'developer_diagnostics',
      workerId: 'worker-a',
      observedLagMs: 120,
      queueDepth: 8
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queueName = `developer-tools-jobs-${Date.now()}-${process.pid}`;
  let queueCreated = false;

  try {
    const setup = await enqueueCutoverChecklist(queueName);
    queueCreated = true;
    await publishSampleJobs(queueName);
    const outcomes = await runWorkerOnce(queueName);
    console.log(JSON.stringify({ queue: setup.queue, checklist: setup.checklist, outcomes }, null, 2));
  } catch (error) {
    const err = error as InfraiError;
    console.error(JSON.stringify({ error: err.message, code: err.code }, null, 2));
    process.exitCode = 1;
  } finally {
    if (queueCreated) {
      try {
        await infrai.queue.delete(queueName);
      } catch (error) {
        const err = error as InfraiError;
        console.error(JSON.stringify({ error: `failed to delete queue ${queueName}: ${err.message}`, code: err.code }, null, 2));
        process.exitCode = 1;
      }
    }
  }
}
