import { requestJson } from "./http.js";

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export async function getPushSubscription() {
  if (!isPushSupported()) {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function savePushSubscription(apiBase, token, subscription) {
  return requestJson(`${apiBase}/push/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription),
  });
}

export async function ensurePushSubscription(apiBase, token) {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return null;
  }

  let subscription = await getPushSubscription();
  if (!subscription) {
    const keyData = await requestJson(`${apiBase}/push/vapid-public-key`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!keyData.enabled || !keyData.public_key) {
      throw new Error("Web push is not configured.");
    }

    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.public_key),
    });
  }

  await savePushSubscription(apiBase, token, subscription);
  return subscription;
}

export async function subscribeToPush(apiBase, token) {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const keyData = await requestJson(`${apiBase}/push/vapid-public-key`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!keyData.enabled || !keyData.public_key) {
    throw new Error("Web push is not configured.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyData.public_key),
  });

  await savePushSubscription(apiBase, token, subscription);

  return subscription;
}
