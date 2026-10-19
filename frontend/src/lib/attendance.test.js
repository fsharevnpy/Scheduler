import assert from "node:assert/strict";
import test from "node:test";
import { loadAttendanceRecords } from "./attendance.js";

test("loads beyond 200 and 500 events using the server's timestamp and ID cursor", async (t) => {
  const first = Array.from({ length: 500 }, (_, index) => ({
    record_id: `record-${index}`, checked_at: "2026-10-19T02:00:00.123456+00:00",
  }));
  const last = { record_id: "older", checked_at: "2026-10-18T02:00:00+00:00" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json(calls.length === 1 ? first : [last]);
  });
  const signal = new AbortController().signal;
  const records = await loadAttendanceRecords("/api", { headers: { Authorization: "test" }, signal });
  assert.equal(records.length, 501);
  const cursor = new URL(calls[1].url, "http://localhost").searchParams;
  assert.equal(cursor.get("before_record_id"), "record-499");
  assert.equal(cursor.get("before_checked_at"), first[499].checked_at);
  assert.equal(calls[1].options.signal, signal);
});

test("errors loading older pages propagate instead of displaying incomplete history", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return count === 1
      ? Response.json(Array.from({ length: 500 }, (_, index) => ({ record_id: `${index}`, checked_at: "2026-10-19T02:00:00Z" })))
      : Response.json({ detail: "History unavailable" }, { status: 503 });
  });
  await assert.rejects(loadAttendanceRecords("/api"), /History unavailable/);
});

test("repeated cursors fail explicitly rather than looping forever", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(Array.from({ length: 500 }, (_, index) => ({ record_id: `${index}`, checked_at: "2026-10-19T02:00:00Z" }))));
  await assert.rejects(loadAttendanceRecords("/api"), /did not advance/);
});
