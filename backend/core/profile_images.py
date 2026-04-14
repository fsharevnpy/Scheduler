import os


PROFILE_IMAGE_BASE_URL = os.getenv("PROFILE_IMAGE_BASE_URL", "").rstrip("/")


def build_profile_image_url(path: str | None) -> str | None:
    if not path:
        return None

    if path.startswith("http://") or path.startswith("https://"):
        return path

    if PROFILE_IMAGE_BASE_URL:
        if path.startswith("/"):
            return f"{PROFILE_IMAGE_BASE_URL}{path}"
        return f"{PROFILE_IMAGE_BASE_URL}/{path}"

    return path
