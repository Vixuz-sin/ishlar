"""Fayllarni saqlash: Vercel Blob yoki lokal MEDIA_ROOT.

`BLOB_READ_WRITE_TOKEN` mavjud bo'lsa fayl Vercel Blob'ga yuklanadi
(production). Aks holda lokal `uploads/` papkasiga saqlanadi (development).
"""

import hashlib
import json
import os
import urllib.parse
import urllib.request

from decouple import config
from django.conf import settings
from django.utils import timezone

BLOB_API_URL = "https://blob.vercel-storage.com/"


def _blob_token():
    return config("BLOB_READ_WRITE_TOKEN", default="").strip()


def make_filename(original_name):
    """Unikal fayl nomi yaratadi."""
    ext = os.path.splitext(original_name)[1].lower()
    raw = hashlib.sha256(f"{timezone.now()}{original_name}{os.urandom(8)}".encode()).hexdigest()
    return f"{raw[:32]}{ext}"


def _upload_to_blob(pathname, uploaded_file, token):
    data = uploaded_file.read()
    content_type = getattr(uploaded_file, "content_type", None) or "application/octet-stream"
    query = urllib.parse.urlencode({"pathname": pathname})
    request = urllib.request.Request(
        f"{BLOB_API_URL}?{query}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": "12",
            "x-content-type": content_type,
            "x-add-random-suffix": "0",
            "x-vercel-blob-access": "public",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload["url"]


def _upload_to_local(pathname, uploaded_file):
    target = os.path.join(settings.MEDIA_ROOT, pathname)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb+") as dest:
        for chunk in uploaded_file.chunks():
            dest.write(chunk)
    return f"{settings.MEDIA_URL}{pathname}"


def save_upload(uploaded_file, folder):
    """Faylni saqlaydi va to'liq URL qaytaradi.

    `folder` — "images", "audio", "avatars" kabi papka nomi.
    """
    filename = make_filename(uploaded_file.name)
    pathname = f"{folder}/{filename}"

    token = _blob_token()
    if token:
        return _upload_to_blob(pathname, uploaded_file, token)
    return _upload_to_local(pathname, uploaded_file)
