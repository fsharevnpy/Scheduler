import assert from "node:assert/strict";
import test from "node:test";
import { studentNameSlots, validateAttendanceStudents } from "./attendanceStudents.js";

test("student list preserves Vietnamese names, order and children sharing a name", () => {
  const names = studentNameSlots("3", ["  Bé An ", "Bé Bình", " Bé An "]).map((name) => name.trim());
  assert.deepEqual(names, ["Bé An", "Bé Bình", "Bé An"]);
  assert.equal(validateAttendanceStudents("3", names), "");
});

test("count changes preserve drafts but only submit the selected number of fields", () => {
  const drafts = ["An", "Bình", "Chi"];
  assert.deepEqual(studentNameSlots("2", drafts), ["An", "Bình"]);
  assert.deepEqual(studentNameSlots("3", drafts), drafts);
  assert.deepEqual(studentNameSlots("4", drafts), [...drafts, ""]);
  assert.deepEqual(studentNameSlots("", drafts), []);
  assert.deepEqual(studentNameSlots("9007199254740992", drafts), []);
  assert.deepEqual(studentNameSlots("2", ["", "Bình"]), ["", "Bình"]);
  assert.notEqual(validateAttendanceStudents("2", studentNameSlots("2", ["", "Bình"])), "");
});

test("checkout requires a positive whole count and exactly that many names", () => {
  for (const count of ["", "0", "-1", "1.5", "no", "Infinity", "9007199254740992"]) {
    assert.notEqual(validateAttendanceStudents(count, ["An"]), "");
  }
  assert.notEqual(validateAttendanceStudents("2", ["An"]), "");
  assert.notEqual(validateAttendanceStudents("1", ["An", "Binh"]), "");
  assert.notEqual(validateAttendanceStudents("1", [" "]), "");
  assert.notEqual(validateAttendanceStudents("1", ["a".repeat(151)]), "");
  assert.notEqual(validateAttendanceStudents("1", ["An\nBinh"]), "");
  assert.notEqual(validateAttendanceStudents("1", ["An\0Binh"]), "");
  assert.equal(validateAttendanceStudents("1", ["a".repeat(150)]), "");
});

test("student names cannot be silently truncated by Excel's cell limit", () => {
  const names = [...Array(216).fill("a".repeat(150)), "a".repeat(149), "b"];
  assert.equal(names.join("\n").length, 32767);
  assert.equal(validateAttendanceStudents("218", names), "");
  names[217] = "bb";
  assert.notEqual(validateAttendanceStudents("218", names), "");
});
