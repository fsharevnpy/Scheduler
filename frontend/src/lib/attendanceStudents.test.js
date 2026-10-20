import assert from "node:assert/strict";
import test from "node:test";
import { studentNameSlots, validateAttendanceStudents, prepareCheckoutStudents } from "./attendanceStudents.js";

test("double shifts require independent counts and names for every saved class", () => {
  const block = [{ class_id: "C1" }, { class_id: "C2" }];
  const drafts = { C1: { count: "2", names: [" An ", "Bình"] }, C2: { count: "1", names: ["Chi", "Not submitted"] } };
  const result = prepareCheckoutStudents(block, drafts, "3", ["Ignored", "Shared", "List"]);
  assert.equal(result.error, "");
  assert.deepEqual(result.payload, { sessionStudents: [
    { class_id: "C1", student_count: 2, student_names: ["An", "Bình"] },
    { class_id: "C2", student_count: 1, student_names: ["Chi"] },
  ] });
  assert.notEqual(prepareCheckoutStudents(block, { C1: drafts.C1 }, "", []).error, "");
  assert.deepEqual(prepareCheckoutStudents([block[0]], {}, "1", [" An "]).payload, { studentCount: 1, studentNames: ["An"] });
});

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
