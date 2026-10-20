import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAttendanceHistoryRows, buildCurrentAttendanceRows, getAttendanceDateKey,
  getAttendanceDateKeys, getAttendanceDayCode, formatAttendanceDate, formatAttendanceTime,
  formatAttendanceWeekday, formatAttendanceDayCode, getTeacherAttendanceAvailability,
} from "./attendanceUtils.js";

const checkIn = {
  record_id: "in", teacher_id: "T1", user_code: "TC00001", class_id: "C1",
  checked_at: "2026-10-19T02:00:00Z", event_type: "CHECK_IN",
  attendance_status: "ON_TIME", status: "VALID", display_name: "Teacher One",
};
const checkOut = {
  ...checkIn, record_id: "out", event_type: "CHECK_OUT",
  checked_at: "2026-10-19T03:00:00Z", attendance_status: "COMPLETED",
};
const scheduledClass = {
  class_id: "C1", day_of_week: "T2", center_id: "CS1",
  start_time: "09:00:00", end_time: "10:00:00", teacher_ids: ["T1"],
};

test("teacher check-in availability follows Vietnam date and the exact session end", () => {
  const availability = (now, classes = [scheduledClass]) => getTeacherAttendanceAvailability({
    records: [], classes, teacherId: "T1", now: new Date(now),
  });
  assert.equal(availability("2026-10-19T01:00:00Z").availableClasses.length, 1);
  assert.equal(availability("2026-10-19T03:00:00Z").availableClasses.length, 1);
  assert.equal(availability("2026-10-19T03:00:01Z").availableClasses.length, 0);
  assert.equal(availability("2026-10-19T18:00:00Z").todayClasses.length, 0);
  assert.equal(availability("2026-10-19T01:00:00Z", []).availableClasses.length, 0);
});

test("teacher can still finish a saved visit after reassignment without a current class", () => {
  const saved = { ...checkIn, session_block: [{ ...scheduledClass }, { ...scheduledClass, class_id: "C2", start_time: "10:00:00", end_time: "11:00:00" }] };
  const result = getTeacherAttendanceAvailability({
    records: [saved], classes: [], teacherId: "T1", now: new Date("2026-10-19T05:00:00Z"),
  });
  assert.equal(result.openCheckIn, saved);
  assert.equal(result.availableClasses.length, 0);
  assert.equal(result.openCheckIn.session_block.length, 2);
});

test("featured scheduled block joins adjacent sessions only at the same center", () => {
  const next = { ...scheduledClass, class_id: "C2", start_time: "10:00:00", end_time: "11:00:00" };
  const block = (classes) => getTeacherAttendanceAvailability({
    records: [], classes, teacherId: "T1", now: new Date("2026-10-19T01:00:00Z"),
  }).nextSessionBlock.map((item) => item.class_id);
  assert.deepEqual(block([next, scheduledClass]), ["C1", "C2"]);
  assert.deepEqual(block([{ ...next, center_id: "CS2" }, scheduledClass]), ["C1"]);
  assert.deepEqual(block([{ ...next, start_time: "10:30:00" }, scheduledClass]), ["C1"]);
  assert.deepEqual(block([scheduledClass]), ["C1"]);
  assert.deepEqual(block([]), []);
});

test("teacher open-visit state respects linked and legacy checkouts, identity and date", () => {
  const availability = (records) => getTeacherAttendanceAvailability({
    records, classes: [], teacherId: "T1", now: new Date("2026-10-19T04:00:00Z"),
  });
  assert.equal(availability([checkIn, checkOut]).openCheckIn, null);
  assert.equal(availability([checkIn, { ...checkOut, check_in_record_id: checkIn.record_id }]).openCheckIn, null);
  assert.equal(availability([checkIn, { ...checkOut, check_in_record_id: "another-in" }]).openCheckIn, checkIn);
  assert.equal(availability([checkIn, { ...checkOut, teacher_id: "T2" }]).openCheckIn, checkIn);
  assert.equal(availability([{ ...checkIn, teacher_id: "T2" }]).openCheckIn, null);
  assert.equal(availability([{ ...checkIn, checked_at: "2026-10-18T02:00:00Z" }]).openCheckIn, null);
  assert.equal(availability([{ ...checkIn, checked_at: "2026-10-19T05:00:00Z" }]).openCheckIn, null);
  assert.equal(availability([checkIn, { ...checkOut, checked_at: "2026-10-19T05:00:00Z" }]).openCheckIn, checkIn);
});

test("check-in and checkout form one stable row regardless of event order", () => {
  const rows = buildAttendanceHistoryRows([checkOut, checkIn, checkIn]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].checked_at, checkIn.checked_at);
  assert.equal(rows[0].check_out_at, checkOut.checked_at);
  assert.equal(rows[0].checkout_status, "COMPLETED");
  assert.deepEqual(rows, buildAttendanceHistoryRows([checkIn, checkOut]));
  assert.equal(rows[0].id, buildAttendanceHistoryRows([checkIn])[0].id);
});

test("history contains yesterday's newest checkout, not today's events or invented absences", () => {
  const rows = buildAttendanceHistoryRows([checkOut, checkIn,
    { ...checkIn, record_id: "today", checked_at: "2026-10-20T02:00:00Z" }]);
  const dates = getAttendanceDateKeys(rows, "history", "2026-10-20");
  assert.deepEqual(dates, ["2026-10-19"]);
  assert.equal(rows.filter((row) => dates.includes(row.attendance_date))[0].check_out_at, checkOut.checked_at);
  assert.deepEqual(getAttendanceDateKeys([], "history", "2026-10-20"), []);
});

test("reassigned teachers have no duplicate rows; history does not use the new assignment", () => {
  const records = [checkOut, checkIn];
  const current = buildCurrentAttendanceRows({
    records, classes: [{ ...scheduledClass, teacher_ids: ["T2"] }],
    now: new Date("2026-10-19T05:00:00Z"),
  });
  assert.equal(current.filter((row) => row.teacher_id === "T1").length, 1);
  assert.equal(new Set(current.map((row) => row.id)).size, current.length);
  const history = buildAttendanceHistoryRows(records);
  assert.equal(history.length, 1);
  assert.equal(history[0].teacher_id, "T1");
  assert.equal(history[0].start_time, null);
});

test("unmatched and checkout-only events are kept with the correct columns and statuses", () => {
  const rows = buildAttendanceHistoryRows([
    { ...checkIn, class_id: null },
    { ...checkOut, class_id: null, status: "INVALID" },
    { ...checkOut, record_id: "standalone", class_id: "C2" },
  ]);
  assert.equal(rows.length, 3);
  const checkout = rows.find((row) => row.id === "event:out");
  assert.equal(checkout.checked_at, null);
  assert.equal(checkout.check_out_at, checkOut.checked_at);
  assert.equal(checkout.checkout_location_status, "INVALID");
  assert.equal(checkout.attendance_status, "-");
  assert.equal(buildCurrentAttendanceRows({ records: [checkOut], classes: [], now: new Date(checkOut.checked_at) }).length, 1);
});

test("different teachers, dates, and unmatched users cannot share a row key", () => {
  const rows = buildAttendanceHistoryRows([
    checkIn, { ...checkIn, record_id: "teacher2", teacher_id: "T2" },
    { ...checkIn, record_id: "date2", checked_at: "2026-10-20T02:00:00Z" },
    { ...checkIn, record_id: "user1", teacher_id: null, user_code: "M1" },
    { ...checkIn, record_id: "user2", teacher_id: null, user_code: "M2" },
  ]);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((row) => row.id)).size, 5);
});

test("saved class details survive a class deletion; old data has no guessed shift", () => {
  const [row] = buildAttendanceHistoryRows([{
    ...checkIn, class_id: null, session_class_id: "C1", session_center_id: "CS1",
    session_start_time: "09:00:00", session_end_time: "10:00:00",
  }]);
  assert.equal(row.class_id, "C1");
  assert.equal(row.start_time, "09:00:00");
  assert.equal(row.end_time, "10:00:00");
  assert.equal(buildAttendanceHistoryRows([checkIn])[0].end_time, null);
});

test("a checkout before the latest check-in is not paired backwards", () => {
  const rows = buildAttendanceHistoryRows([
    checkOut, { ...checkIn, checked_at: "2026-10-19T04:00:00Z" },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => !row.checked_at || !row.check_out_at));
});

test("consecutive current classes retain coverage without duplicate identities", () => {
  const records = [checkIn, { ...checkOut, class_id: "C2", checked_at: "2026-10-19T04:00:00Z" }];
  const classes = [scheduledClass, { ...scheduledClass, class_id: "C2", start_time: "10:00:00", end_time: "11:00:00" }];
  const rows = buildCurrentAttendanceRows({ records, classes, now: new Date("2026-10-19T05:00:00Z") });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].checkout_status, "CONTINUED");
  assert.equal(rows[1].attendance_status, "COVERED");
  assert.equal(rows[1].checkout_status, "COMPLETED");
  assert.notEqual(rows[0].id, rows[1].id);
  assert.deepEqual(rows, buildCurrentAttendanceRows({ records, classes, now: new Date("2026-10-19T05:00:00Z"), teacherId: "T1" }));
});

test("all attendance dates and clocks use Vietnam time, including midnight", () => {
  assert.equal(getAttendanceDateKey("2026-10-19T17:00:00Z"), "2026-10-20");
  assert.equal(getAttendanceDateKey("2026-10-19T16:59:59Z"), "2026-10-19");
  assert.equal(formatAttendanceTime("2026-10-19T17:00:00Z"), "00:00");
  assert.equal(getAttendanceDayCode("2026-10-20"), "T3");
  assert.equal(formatAttendanceDate("2026-10-20"), "20/10/2026");
});

test("current pending status advances after class end without reloading", () => {
  assert.equal(buildCurrentAttendanceRows({ records: [], classes: [scheduledClass], now: new Date("2026-10-19T02:00:00Z") })[0].attendance_status, "PENDING");
  assert.equal(buildCurrentAttendanceRows({ records: [], classes: [scheduledClass], now: new Date("2026-10-19T04:00:00Z") })[0].attendance_status, "MISSED");
});

const blockIn = {
  ...checkIn, checked_at: "2026-10-19T07:00:00+07:00",
  session_block: [
    { class_id: "C1", center_id: "CS1", start_time: "07:00:00", end_time: "08:30:00" },
    { class_id: "C2", center_id: "CS1", start_time: "08:30:00", end_time: "11:00:00" },
  ],
};
const blockOut = { ...checkOut, class_id: "C2", check_in_record_id: "in", checked_at: "2026-10-19T11:00:00+07:00" };

test("saved double shift shares one in/out pair across two historical rows", () => {
  const rows = buildAttendanceHistoryRows([blockOut, blockIn, blockIn]);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  assert.ok(rows.every((row) => row.checked_at === blockIn.checked_at && row.check_out_at === blockOut.checked_at));
  assert.equal(rows[0].checkout_status, "CONTINUED");
  assert.equal(rows[1].attendance_status, "COVERED");
  assert.equal(rows[1].end_time, "11:00:00");
  assert.deepEqual(rows, buildAttendanceHistoryRows([blockIn, blockOut]));
});

test("late arrival and early departure affect only the relevant saved shift", () => {
  const rows = buildAttendanceHistoryRows([
    { ...blockIn, checked_at: "2026-10-19T07:05:00+07:00" },
    { ...blockOut, checked_at: "2026-10-19T10:30:00+07:00" },
  ]);
  assert.equal(rows[0].attendance_status, "LATE");
  assert.equal(rows[0].checkout_status, "CONTINUED");
  assert.equal(rows[1].attendance_status, "COVERED");
  assert.equal(rows[1].checkout_status, "LEFT_EARLY");
});

test("linked history rejects cross-teacher, cross-day and backwards checkouts without hiding them", () => {
  for (const extra of [
    { teacher_id: "T2" },
    { checked_at: "2026-10-20T11:00:00+07:00" },
    { checked_at: "2026-10-19T06:00:00+07:00" },
  ]) {
    const rows = buildAttendanceHistoryRows([blockIn, { ...blockOut, ...extra }]);
    assert.equal(rows.length, 3);
    assert.ok(rows.filter((row) => row.checked_at).every((row) => !row.check_out_at));
    assert.ok(rows.some((row) => row.id === "event:out" && row.check_out_at));
  }
  const rows = buildAttendanceHistoryRows([blockIn, blockOut,
    { ...blockOut, record_id: "wrong", teacher_id: "T2", checked_at: "2026-10-19T12:00:00+07:00" }]);
  assert.ok(rows.filter((row) => row.teacher_id === "T1").every((row) => row.check_out_at === blockOut.checked_at));
});

test("weekday labels use the selected language, not the device locale", () => {
  assert.equal(formatAttendanceWeekday("2026-10-19", "en"), "Monday");
  assert.match(formatAttendanceWeekday("2026-10-19", "vi"), /Thứ Hai/i);
  assert.equal(formatAttendanceDayCode("CN", "en"), "Sunday");
  assert.equal(formatAttendanceDayCode("T2", "vi"), "Thứ Hai");
});

test("an explicit checkout link also works with an older individual snapshot", () => {
  const rows = buildAttendanceHistoryRows([
    { ...checkIn, session_start_time: "09:00:00", session_end_time: "10:00:00" },
    { ...checkOut, check_in_record_id: "in" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].check_out_at, checkOut.checked_at);
});

test("student names follow the linked checkout across a saved double shift", () => {
  const names = ["Bé An", "Bé Bình"];
  const records = [blockIn, { ...blockOut, student_names: names }];
  for (const rows of [
    buildAttendanceHistoryRows(records),
    buildCurrentAttendanceRows({ records, classes: [], now: new Date(blockOut.checked_at) }),
  ]) {
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.student_count === 2));
    assert.ok(rows.every((row) => row.student_names === names));
  }
});

test("students are never copied from another teacher or an earlier unpaired checkout", () => {
  const rows = buildAttendanceHistoryRows([blockIn, { ...blockOut, teacher_id: "T2", student_names: ["Other"] }]);
  assert.ok(rows.filter((row) => row.teacher_id === "T1").every((row) => row.student_names === null));
  const backwards = buildAttendanceHistoryRows([checkOut, { ...checkIn, checked_at: "2026-10-19T04:00:00Z" }]);
  assert.ok(backwards.every((row) => row.student_count === null));
  assert.equal(buildAttendanceHistoryRows([checkIn, checkOut])[0].student_names, null);
});

test("current consecutive classes share the checkout list without replacing it with checkin data", () => {
  const names = ["An", "Binh"];
  const rows = buildCurrentAttendanceRows({
    records: [{ ...checkIn, student_names: ["Ignored"] }, { ...checkOut, class_id: "C2", checked_at: "2026-10-19T04:00:00Z", student_names: names }],
    classes: [scheduledClass, { ...scheduledClass, class_id: "C2", start_time: "10:00:00", end_time: "11:00:00" }],
    now: new Date("2026-10-19T05:00:00Z"),
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.student_count === 2 && row.student_names === names));
});
