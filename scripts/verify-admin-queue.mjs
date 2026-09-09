/** Execute the actual queue/workload modules with fixtures, without database access. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
await mkdir("tmp", { recursive: true });
const output = resolve("tmp/admin-queue-check.mjs");
await build({
  stdin: {
    contents: `export { buildQueueItems, sampleReadyForTesting } from './src/lib/labQueue'; export { chemistWorkloadStats } from './src/lib/labAnalytics';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: output,
  packages: "external",
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});
try {
  const { buildQueueItems, chemistWorkloadStats, sampleReadyForTesting } =
    await import(pathToFileURL(output));
  const now = Date.now();
  const order = {
    id: "o1",
    user_id: "u",
    status: "processing",
    payment_status: "paid",
    lab_priority: "normal",
    rush_processing: false,
    company_name: "Test lab",
    created_at: new Date(now).toISOString(),
  };
  const sample = (id, hours, extra = {}) => ({
    id,
    order_id: "o1",
    user_id: "u",
    sample_name: id,
    status: "received",
    metadata: { tests_label: "Purity" },
    created_at: new Date(now - hours * 3600000).toISOString(),
    ...extra,
  });
  const old = sample("old", 72),
    recent = sample("recent", 1);
  assert.equal(
    sampleReadyForTesting(old, { ...order, status: "cancelled" }),
    false,
    "Cancelled orders must not be dispatched",
  );
  assert.equal(
    sampleReadyForTesting(old, { ...order, status: "complete" }),
    false,
    "Closed orders must not be dispatched",
  );
  assert.equal(
    sampleReadyForTesting(old, { ...order, payment_status: "unpaid" }),
    false,
    "Payment gate must be preserved",
  );
  assert.equal(
    sampleReadyForTesting({ ...old, status: "awaiting_sample" }, order),
    false,
    "Receiving gate must be preserved",
  );
  assert.deepEqual(
    buildQueueItems([recent, old], [order], []).map((x) => x.sample.id),
    ["old", "recent"],
    "Equal priorities must favor oldest samples",
  );
  assert.deepEqual(
    buildQueueItems(
      [old, { ...recent, lab_priority: "urgent" }],
      [order],
      [],
    ).map((x) => x.sample.id),
    ["recent", "old"],
    "Urgency must take precedence over age",
  );
  assert.equal(
    buildQueueItems([old], [{ ...order, rush_processing: true }], [])[0]
      .priority,
    "high",
    "Rush orders must retain a high priority floor",
  );
  assert.equal(
    buildQueueItems([old], [order], [{ sample_id: "old" }]).length,
    0,
    "Direct certificate links must remove issued samples",
  );
  assert.equal(
    buildQueueItems(
      [old],
      [order],
      [{ sample_id: "another", sample_name: "old", user_id: "u" }],
    ).length,
    1,
    "Fuzzy certificate matches must not hide open samples",
  );
  assert.equal(
    buildQueueItems(
      [{ ...old, metadata: { pathway: "rd", test_mode: "rd" } }],
      [order],
      [],
    ).length,
    0,
    "R&D must remain separate",
  );
  const assigned = sample("shared", 2, {
    assigned_to: "chemist1",
    metadata: {
      tests_label: "Purity",
      test_assignments: { Purity: "chemist2" },
    },
  });
  const duplicate = sample("duplicate", 1, {
    assigned_to: "chemist2",
    metadata: {
      tests_label: "Purity",
      test_assignments: { Purity: "chemist2" },
    },
  });
  const stats = chemistWorkloadStats(
    [assigned, duplicate],
    [order],
    [],
    [
      { id: "chemist1", full_name: "One" },
      { id: "chemist2", full_name: "Two" },
    ],
  );
  assert.equal(stats[0].assignedCount, 1);
  assert.equal(
    stats[1].assignedCount,
    2,
    "Per-test assignees must count, without double-counting sample leads",
  );
  console.log(
    "verify-admin-queue: 11 eligibility, fairness, COA preservation, and workload assertions passed",
  );
} finally {
  await rm(output, { force: true });
}
