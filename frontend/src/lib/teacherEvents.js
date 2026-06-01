export function buildTeacherEventsWebSocketUrl(apiBase, token) {
  return buildEventsWebSocketUrl(apiBase, token, "teacher-events/ws");
}

export function buildManagerEventsWebSocketUrl(apiBase, token) {
  return buildEventsWebSocketUrl(apiBase, token, "manager-events/ws");
}

function buildEventsWebSocketUrl(apiBase, token, path) {
  const encodedToken = encodeURIComponent(token);
  if (/^https?:\/\//i.test(apiBase)) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${path}`;
    url.search = `token=${encodedToken}`;
    return url.toString();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const basePath = apiBase.startsWith("/") ? apiBase : `/${apiBase}`;
  return `${protocol}//${window.location.host}${basePath.replace(/\/$/, "")}/${path}?token=${encodedToken}`;
}
