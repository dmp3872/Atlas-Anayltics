/** Local browser QA with intercepted synthetic data. No real account or database mutations.
 * Start npm run dev, then node scripts/verify-admin-workspace.mjs.
 */
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
const base = process.env.ADMIN_TEST_URL || "http://127.0.0.1:5173";
const now = Date.now(),
  ago = (h) => new Date(now - h * 3600000).toISOString();
const users = [
  {
    id: "director",
    full_name: "Alex Morgan",
    email: "director@example.test",
    role: "admin",
  },
  ...["Elena Chen", "Marcus Reid", "Sofia Patel"].map((full_name, i) => ({
    id: `chemist-${i}`,
    full_name,
    role: "chemist",
  })),
  {
    id: "client",
    full_name: "Taylor Brooks",
    role: "client",
    company_name: "Helix Research",
    phone: "",
    created_at: ago(100),
  },
];
const companies = [
  "Helix Research",
  "Nova Biosciences",
  "Meridian Labs",
  "Aster Therapeutics",
  "Arcadia Research",
  "Northstar Bio",
];
const orders = Array.from({ length: 1051 }, (_, i) => ({
  id: `order-${String(i).padStart(4, "0")}`,
  user_id: "client",
  order_number: `AA-2609-${String(184 + i).padStart(4, "0")}`,
  company_name: companies[i % 6],
  status:
    i > 63
      ? "complete"
      : [
          "processing",
          "analyzing",
          "awaiting_sample",
          "in_review",
          "received",
          "complete",
        ][i % 6],
  payment_status: i % 7 === 0 ? "unpaid" : "paid",
  lab_priority: i % 9 === 0 ? "urgent" : i % 4 === 0 ? "high" : "normal",
  rush_processing: i % 8 === 0,
  total: 450 + i * 30,
  created_at: ago(i * 3 + 2),
  updated_at: ago(i),
  estimated_ready_at: ago(i % 5 === 0 ? 12 : -48),
  notes: "",
  subtotal: 450,
  discount_amount: 0,
  rush_fee: 0,
}));
const samples = orders
  .slice(0, 64)
  .flatMap((o, i) =>
    Array.from({ length: 2 }, (_, j) => ({
      id: `sample-${i}-${j}`,
      order_id: o.id,
      user_id: "client",
      sample_name: ["BPC-157", "Semaglutide", "Tirzepatide", "TB-500"][i % 4],
      display_name: [
        "BPC-157 · 10 mg",
        "Semaglutide · 5 mg",
        "Tirzepatide · 10 mg",
        "TB-500 · 5 mg",
      ][i % 4],
      status:
        o.status === "awaiting_sample"
          ? "awaiting_sample"
          : o.status === "complete"
            ? "complete"
            : "received",
      sample_type: "single",
      vial_count: 1,
      panel_ids: [],
      metadata: { test_mode: "full_qc", tests_label: "Full QC panel" },
      created_at: ago(i * 3 + 2),
      assigned_to: i % 3 === 0 ? `chemist-${Math.floor(i / 3) % 3}` : null,
    })),
  );
let failLoad = false,
  failAssignment = false,
  patchCount = 0;
const ranges = [],
  errors = [];
await mkdir("tmp/admin-redesign", { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 1100, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", async (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/src/context/AuthContext.tsx")
      return req.respond({
        status: 200,
        contentType: "application/javascript",
        body: `export function AuthProvider({children}){return children} export function useAuth(){return {...${JSON.stringify({ user: { id: "director", email: "director@example.test" }, profile: users[0], loading: false })},signOut:async()=>{}}}`,
      });
    if (url.hostname.endsWith("supabase.co")) {
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
      };
      if (req.method() === "OPTIONS")
        return req.respond({ status: 204, headers });
      let rows = url.pathname.endsWith("/orders")
        ? orders
        : url.pathname.endsWith("/order_samples")
          ? samples
          : url.pathname.endsWith("/user_profiles")
            ? users
            : [];
      if (req.method() === "PATCH") {
        patchCount++;
        await new Promise((r) => setTimeout(r, 350));
        if (failAssignment && url.pathname.endsWith("/order_samples"))
          return req.respond({
            status: 500,
            headers,
            contentType: "application/json",
            body: JSON.stringify({ message: "Assignment test failure" }),
          });
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const patch = JSON.parse(req.postData() || "{}");
        rows = rows.filter((x) => x.id === id);
        rows.forEach((x) => Object.assign(x, patch));
        const single = req.headers().accept?.includes("vnd.pgrst.object");
        return req.respond({
          status: 200,
          headers,
          contentType: "application/json",
          body: JSON.stringify(single ? rows[0] : rows),
        });
      }
      if (failLoad && url.pathname.endsWith("/orders"))
        return req.respond({
          status: 500,
          headers,
          contentType: "application/json",
          body: JSON.stringify({ message: "Refresh test failure" }),
        });
      const offset = Number(url.searchParams.get("offset") || 0),
        limit = Number(url.searchParams.get("limit") || 500);
      if (url.pathname.endsWith("/orders")) ranges.push(offset);
      return req.respond({
        status: 200,
        headers,
        contentType: "application/json",
        body: JSON.stringify(rows.slice(offset, offset + limit)),
      });
    }
    // Prevent font requests from delaying fixture tests in offline environments.
    if (
      ![
        "127.0.0.1",
        "localhost",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
      ].includes(url.hostname)
    )
      return req.abort();
    req.continue();
  });
  const text = () => page.evaluate(() => document.body.innerText);
  const click = async (label) => {
    const found = await page.evaluate((label) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      );
      if (!b) return false;
      b.click();
      return true;
    }, label);
    assert.ok(found, `Button exists: ${label}`);
  };
  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".admin-order-workspace tbody tr");
  assert.ok(
    ranges.includes(1000),
    "Data loading reaches records beyond API row cap",
  );
  await page.screenshot({
    path: "tmp/admin-redesign/overview-desktop.png",
    fullPage: true,
  });
  await click("Orders");
  await page.waitForSelector(".admin-order-controls");
  assert.equal(
    await page.$$eval(".admin-table tbody tr", (r) => r.length),
    25,
    "Order list is paginated",
  );
  await click("Next");
  assert.match(await text(), /26–50 of/);
  await page.type(".admin-search input", "ZZ-NOT-FOUND");
  assert.match(await text(), /No orders found/);
  await click("View all orders");
  assert.match(await text(), /1–25 of 1051/);
  await page.select('select[aria-label^="Priority for"]', "urgent");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Priority set to urgent."),
  );
  await page.screenshot({
    path: "tmp/admin-redesign/orders-desktop.png",
    fullPage: true,
  });
  await click("Dispatch queue");
  await page.waitForSelector('select[aria-label^="Assign "]');
  assert.ok(
    (await page.$$eval(".admin-table tbody tr", (r) => r.length)) <= 20,
  );
  await page.screenshot({
    path: "tmp/admin-redesign/dispatch-desktop.png",
    fullPage: true,
  });
  const beforeRows = await page.$eval(
    ".admin-table-footer",
    (e) => e.innerText,
  );
  failAssignment = true;
  await page.select('select[aria-label^="Assign "]', "chemist-1");
  assert.ok(
    await page.$eval('select[aria-label^="Assign "]', (e) => e.disabled),
    "Assignment stays disabled during request",
  );
  await page.waitForFunction(() =>
    document.body.innerText.includes("Assignment test failure"),
  );
  assert.equal(
    await page.$eval(".admin-table-footer", (e) => e.innerText),
    beforeRows,
    "Failed assignment retains queue item",
  );
  failAssignment = false;
  const beforePatches = patchCount;
  await page.select('select[aria-label^="Assign "]', "chemist-1");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Sample assigned."),
  );
  assert.equal(
    patchCount,
    beforePatches + 1,
    "Single assignment causes one mutation",
  );
  assert.notEqual(
    await page.$eval(".admin-table-footer", (e) => e.innerText),
    beforeRows,
    "Successful assignment removes item from unassigned queue",
  );
  failLoad = true;
  await click("Refresh");
  await page.waitForFunction(() =>
    document.body.innerText.includes(
      "Refresh failed. Showing the last successful update.",
    ),
  );
  assert.ok(
    await page.$(".admin-table tbody tr"),
    "Refresh failure preserves prior data",
  );
  failLoad = false;
  await click("Try again");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Refresh failed."),
  );
  await click("Overview");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".admin-order-workspace");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({
    path: "tmp/admin-redesign/overview-mobile.png",
    fullPage: true,
  });

  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile has no page-level horizontal overflow",
  );
  await page.click('[aria-label="Open navigation"]');
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    ),
    "Open navigation",
    "Drawer restores focus",
  );
  await page.setViewport({ width: 1512, height: 1100 });
  for (const label of [
    "Chemist workload",
    "Clients",
    "Team & access",
    "Research & development",
    "Client inbox",
    "Lab analytics",
    "COA registry",
  ]) {
    await click(label);
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({
      path: `tmp/admin-redesign/${label.replace(/[^a-z]+/gi, "-").toLowerCase()}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  console.log(
    "verify-admin-workspace: pagination beyond 1,000 rows, search, priority, assignment success/failure, stale-data recovery, navigation, and mobile checks passed",
  );
} finally {
  await browser.close();
}
