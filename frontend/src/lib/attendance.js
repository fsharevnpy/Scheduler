import { requestJson } from "./http.js";

export async function loadAttendanceRecords(apiBase, options) {
  const records = [];
  const seenCursors = new Set();
  const query = new URLSearchParams({ limit: "500" });
  while (true) {
    const page = await requestJson(`${apiBase}/attendance-records?${query}`, options);
    if (!Array.isArray(page)) throw new Error("Invalid attendance response.");
    records.push(...page);
    if (page.length < 500) return records;
    const last = page[page.length - 1];
    const cursor = `${last.checked_at}:${last.record_id}`;
    if (!last.checked_at || !last.record_id || seenCursors.has(cursor)) {
      throw new Error("Attendance pagination did not advance.");
    }
    seenCursors.add(cursor);
    query.set("before_checked_at", last.checked_at);
    query.set("before_record_id", last.record_id);
  }
}
