function formatValidationDetail(detail) {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const field = Array.isArray(item?.loc)
          ? item.loc
              .filter((part) => part !== "body")
              .join(".")
          : "";
        const message = typeof item?.msg === "string" ? item.msg : "Invalid input";

        return field ? `${field}: ${message}` : message;
      })
      .join(" | ");
  }

  return "Request failed";
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = formatValidationDetail(data.detail);
    throw new Error(detail);
  }

  return data;
}
