import { useMemo, useState } from "react";

function resolveImageUrl(imageUrl, apiBase) {
  if (!imageUrl) {
    return "";
  }

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  if (apiBase && (imageUrl === apiBase || imageUrl.startsWith(`${apiBase}/`))) {
    return imageUrl;
  }

  if (imageUrl.startsWith("/")) {
    return `${apiBase}${imageUrl}`;
  }

  return imageUrl;
}

function buildInitials(name, fallbackCode) {
  const source = (name || fallbackCode || "").trim();
  if (!source) {
    return "?";
  }

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

export default function UserAvatar({
  imageUrl,
  name,
  fallbackCode,
  apiBase,
  size = "medium",
  className = "",
}) {
  const [hasError, setHasError] = useState(false);
  const src = useMemo(() => resolveImageUrl(imageUrl, apiBase), [apiBase, imageUrl]);
  const initials = useMemo(() => buildInitials(name, fallbackCode), [fallbackCode, name]);
  const mergedClassName = `user-avatar user-avatar-${size} ${className}`.trim();

  if (!src || hasError) {
    return (
      <span className={`${mergedClassName} user-avatar-fallback`} aria-hidden="true">
        {initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={`${name || fallbackCode || "User"} avatar`}
      className={mergedClassName}
      onError={() => setHasError(true)}
    />
  );
}
