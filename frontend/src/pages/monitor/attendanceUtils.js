const TIME_ZONE = "Asia/Ho_Chi_Minh";
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DAY_CODES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function getAttendanceDateKey(value = new Date()) {
  const parts = dateFormatter.formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getAttendanceDayCode(dateKey) {
  return DAY_CODES[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

export function formatAttendanceDate(dateKey) {
  return dateKey ? dateKey.split("-").reverse().join("/") : "-";
}

export function formatAttendanceTime(value) {
  return value ? clockFormatter.format(new Date(value)) : "-";
}

function identity(record) {
  return record.teacher_id || record.user_code;
}

function rowKey(dateKey, person, classId) {
  return JSON.stringify([dateKey, person, classId]);
}

function latest(records) {
  return records.reduce((selected, record) => {
    if (!selected) return record;
    const delta = new Date(record.checked_at) - new Date(selected.checked_at);
    return delta > 0 || (delta === 0 && String(record.record_id) > String(selected.record_id)) ? record : selected;
  }, null);
}

function eventRow(key, checkIn, checkOut) {
  const record = checkIn || checkOut;
  return {
    id: key,
    attendance_date: getAttendanceDateKey(record.checked_at),
    teacher_id: record.teacher_id,
    user_code: record.user_code,
    display_name: record.display_name || record.teacher_id || record.user_code,
    class_id: record.session_class_id || record.class_id,
    center_id: record.session_center_id,
    checked_at: checkIn?.checked_at || null,
    check_out_at: checkOut?.checked_at || null,
    nearest_center_name: record.nearest_center_name,
    status: checkIn?.status || checkOut?.status || "-",
    checkout_location_status: checkOut?.status || "-",
    attendance_status: checkIn?.attendance_status || "-",
    checkout_status: checkOut?.attendance_status || "-",
    start_time: record.session_start_time || null,
    end_time: record.session_end_time || null,
  };
}

export function buildAttendanceHistoryRows(records) {
  const groups = new Map();
  const seen = new Set();
  const rows = [];
  for (const record of records) {
    if (seen.has(record.record_id)) continue;
    seen.add(record.record_id);
    const dateKey = getAttendanceDateKey(record.checked_at);
    const classId = record.session_class_id || record.class_id;
    if (!classId || !identity(record)) {
      rows.push(eventRow(`event:${record.record_id}`, record.event_type === "CHECK_OUT" ? null : record,
        record.event_type === "CHECK_OUT" ? record : null));
      continue;
    }
    const key = rowKey(dateKey, identity(record), classId);
    if (!groups.has(key)) groups.set(key, { checkIns: [], checkOuts: [] });
    groups.get(key)[record.event_type === "CHECK_OUT" ? "checkOuts" : "checkIns"].push(record);
  }
  for (const [key, group] of groups) {
    const checkIn = latest(group.checkIns);
    const checkOut = latest(group.checkOuts);
    if (checkIn && checkOut && new Date(checkOut.checked_at) < new Date(checkIn.checked_at)) {
      rows.push(eventRow(`${key}:checkout`, null, checkOut));
      rows.push(eventRow(key, checkIn, null));
    } else {
      rows.push(eventRow(key, checkIn, checkOut));
    }
  }
  return rows.sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)
    || String(a.checked_at || a.check_out_at).localeCompare(String(b.checked_at || b.check_out_at))
    || a.id.localeCompare(b.id));
}

export function getAttendanceDateKeys(rows, view, todayKey) {
  const dates = new Set(rows.map((row) => row.attendance_date));
  if (view === "history") return [...dates].filter((date) => date < todayKey).sort().reverse();
  dates.add(todayKey);
  return [...dates].sort().reverse();
}

export function buildCurrentAttendanceRows({ records, classes, teachers = [], now = new Date(), teacherId }) {
  const today = getAttendanceDateKey(now);
  const day = getAttendanceDayCode(today);
  const history = buildAttendanceHistoryRows(records).filter((row) => row.attendance_date === today);
  const byKey = new Map(history.map((row) => [row.id, row]));
  const teachersById = new Map(teachers.map((teacher) => [teacher.teacher_id, teacher]));
  const scheduled = [];
  const consumed = new Set();
  const teacherIds = (item) => teacherId ? [teacherId] : item.teacher_ids || (item.teacher_id ? [item.teacher_id] : []);
  const todayClasses = classes.filter((item) => item.day_of_week === day);
  const clock = formatAttendanceTime(now);
  for (const item of todayClasses) {
    for (const person of teacherIds(item)) {
      const key = rowKey(today, person, item.class_id);
      let start = item;
      let end = item;
      const visited = new Set([item.class_id]);
      const adjacent = (current, direction) => todayClasses.find((other) =>
        !visited.has(other.class_id) && other.center_id === item.center_id && teacherIds(other).includes(person)
        && (direction === "previous" ? other.end_time === current.start_time : other.start_time === current.end_time));
      let next;
      while ((next = adjacent(start, "previous"))) { start = next; visited.add(next.class_id); }
      while ((next = adjacent(end, "next"))) { end = next; visited.add(next.class_id); }
      const direct = byKey.get(key);
      const first = byKey.get(rowKey(today, person, start.class_id));
      const last = byKey.get(rowKey(today, person, end.class_id));
      const checkIn = direct?.checked_at ? direct : first?.checked_at ? first : null;
      const checkOut = direct?.check_out_at ? direct : last?.check_out_at ? last : null;
      const teacher = teachersById.get(person);
      consumed.add(key);
      scheduled.push({
        ...direct,
        id: key,
        attendance_date: today,
        class_id: item.class_id,
        teacher_id: person,
        user_code: direct?.user_code || teacher?.user_code || "-",
        display_name: direct?.display_name || teacher?.name || person,
        center_id: item.center_id,
        nearest_center_name: checkIn?.nearest_center_name || checkOut?.nearest_center_name || item.center_label || item.center_id,
        checked_at: checkIn?.checked_at || null,
        check_out_at: checkOut?.check_out_at || null,
        status: checkIn?.status || checkOut?.status || "-",
        checkout_location_status: checkOut?.checkout_location_status || "-",
        attendance_status: checkIn
          ? checkIn === direct ? checkIn.attendance_status : "COVERED"
          : clock > String(item.end_time).slice(0, 5) ? "MISSED" : "PENDING",
        checkout_status: item.class_id !== end.class_id && checkIn ? "CONTINUED" : checkOut?.checkout_status || (checkIn ? "PENDING" : "-"),
        start_time: item.start_time,
        end_time: item.end_time,
      });
    }
  }
  return [...scheduled, ...history.filter((row) => !consumed.has(row.id))]
    .sort((a, b) => String(a.center_id || a.nearest_center_name || "").localeCompare(String(b.center_id || b.nearest_center_name || ""), undefined, { numeric: true })
      || String(a.start_time || "").localeCompare(String(b.start_time || ""))
      || a.id.localeCompare(b.id));
}
