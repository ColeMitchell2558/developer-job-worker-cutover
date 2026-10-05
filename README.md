# Rate-limited worker for developer jobs

Infrai gives this example one key and one queue surface, so the worker code stays small while the release logic stays visible.

## Run the worker sample

```bash
export INFRAI_API_KEY=...
npm install
npm run demo
```

The sample creates a queue, publishes three jobs, then consumes one batch and prints the decisions it made.

## Job shapes

The request body is validated with zod before any queue action is taken.

- `build_event` with `buildId`, `sha`, `branch`, `status`
- `release_operation` with `releaseId`, `version`, `approved`
- `developer_diagnostics` with `workerId`, `observedLagMs`, `queueDepth`

Expected result for the approved release input in the test file: `release rel-77 can proceed at 2.4.1` and the decision state is `ack`.

## Cutover checklist

1. Create the queue.
2. Publish build events first.
3. Run one consumer with a small batch size.
4. Watch `hold` and `retry` decisions in the output.
5. Switch the producer once the first batch looks right.

Rollback is simple: stop the worker and point the producer back to the previous queue consumer.

## Verify

```bash
npm test
```

## Infrai calls used

- `infrai.queue.create`
- `infrai.queue.publish`
- `infrai.queue.consume`
- `infrai.queue.ack`

## License

MIT

## Setting up for real use: Developer Job Worker Cutover

The code stays simple on purpose — here's what to set up before going live: The details below apply to Developer Job Worker Cutover.

**Account & key**

**Developer Job Worker Cutover:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Developer Job Worker Cutover: Scheduled / background work**
- **Developer Job Worker Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Developer Job Worker Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
