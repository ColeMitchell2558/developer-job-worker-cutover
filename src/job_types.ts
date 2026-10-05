import { z } from 'zod';

export const buildEventSchema = z.object({
  kind: z.literal('build_event'),
  buildId: z.string().min(1),
  sha: z.string().min(7),
  branch: z.string().min(1),
  status: z.enum(['passed', 'failed'])
});

export const releaseOperationSchema = z.object({
  kind: z.literal('release_operation'),
  releaseId: z.string().min(1),
  version: z.string().min(1),
  approved: z.boolean(),
  notes: z.string().optional()
});

export const diagnosticsSchema = z.object({
  kind: z.literal('developer_diagnostics'),
  workerId: z.string().min(1),
  observedLagMs: z.number().int().nonnegative(),
  queueDepth: z.number().int().nonnegative()
});

export const jobSchema = z.discriminatedUnion('kind', [buildEventSchema, releaseOperationSchema, diagnosticsSchema]);

export type BuildEvent = z.infer<typeof buildEventSchema>;
export type ReleaseOperation = z.infer<typeof releaseOperationSchema>;
export type DeveloperDiagnostics = z.infer<typeof diagnosticsSchema>;
export type Job = z.infer<typeof jobSchema>;

export type WorkerDecision =
  | { state: 'ack'; summary: string }
  | { state: 'retry'; summary: string; delayMs: number }
  | { state: 'hold'; summary: string };

export function decide(job: Job, rateLimitWindowMs: number): WorkerDecision {
  if (job.kind === 'build_event') {
    if (job.status === 'passed') {
      return { state: 'ack', summary: `build ${job.buildId} is ready for release` };
    }
    return { state: 'hold', summary: `build ${job.buildId} stays queued until it passes` };
  }

  if (job.kind === 'release_operation') {
    if (job.approved) {
      return { state: 'ack', summary: `release ${job.releaseId} can proceed at ${job.version}` };
    }
    return { state: 'retry', summary: `release ${job.releaseId} waits for approval`, delayMs: rateLimitWindowMs };
  }

  const lagTooHigh = job.observedLagMs > rateLimitWindowMs;
  if (lagTooHigh || job.queueDepth > 100) {
    return { state: 'retry', summary: `worker ${job.workerId} should slow intake`, delayMs: rateLimitWindowMs };
  }

  return { state: 'ack', summary: `worker ${job.workerId} is within operating range` };
}
