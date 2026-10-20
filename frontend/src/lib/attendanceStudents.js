// One-character names plus separators must still fit a 32,767-character Excel cell.
export const MAX_STUDENT_COUNT = 16384;

export function studentNameSlots(count, draftNames) {
  const size = Number(count);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_STUDENT_COUNT) return [];
  return Array.from({ length: size }, (_, index) => draftNames[index] ?? "");
}

export function validateAttendanceStudents(count, names) {
  if (!Number.isSafeInteger(Number(count)) || Number(count) < 1) {
    return "Enter a whole number of students greater than zero.";
  }
  if (Number(count) > MAX_STUDENT_COUNT) {
    return "The student list exceeds the report cell text limit.";
  }
  if (names.length !== Number(count)) {
    return "Enter exactly one name for each student counted.";
  }
  if (names.some((name) => !name.trim() || [...name].length > 150 || /[\x00-\x1f\x7f]/.test(name))) {
    return "Each student name must contain 1 to 150 characters on one line.";
  }
  if ([...names.join("\n")].length > 32767) {
    return "The student list exceeds the report cell text limit.";
  }
  return "";
}
