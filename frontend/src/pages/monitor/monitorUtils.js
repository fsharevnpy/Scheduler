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

export function formatTimeDraft(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 4);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length === 1) {
    return digits;
  }

  if (digits.length === 2) {
    const hour = Number.parseInt(digits, 10);
    if (hour <= 23) {
      return `${digits}:`;
    }

    return `0${digits[0]}:${digits[1]}`;
  }

  if (digits.length === 3) {
    if (digits[0] === "0") {
      return `${digits.slice(0, 2)}:${digits[2]}`;
    }

    const hour = Number.parseInt(digits.slice(0, 2), 10);
    if (hour <= 23) {
      return `${digits.slice(0, 2)}:${digits[2]}`;
    }

    return `0${digits[0]}:${digits.slice(1)}`;
  }

  if (digits[0] === "0") {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  const hour = Number.parseInt(digits.slice(0, 2), 10);
  if (hour <= 23) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  return `0${digits[0]}:${digits.slice(1, 3)}`;
}

export function formatDateTimeValue(value, language) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatValue(value);
  }

  return date.toLocaleString(language === "vi" ? "vi-VN" : language === "en" ? "en-GB" : undefined);
}

export function formatClockTimeValue(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatTimeValue(value);
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
