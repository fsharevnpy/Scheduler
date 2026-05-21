export function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 10);
  }

  return String(value);
}

export function formatTimeValue(value) {
  if (!value) {
    return "-";
  }

  const stringValue = String(value);
  return /^\d{2}:\d{2}:\d{2}$/.test(stringValue) ? stringValue.slice(0, 5) : stringValue;
}

export function formatDateTimeValue(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatValue(value);
  }

  return date.toLocaleString();
}
