#!/usr/bin/env python3
"""Turn the research output into the deployable seed + self-hosted images.

Reads backend/data/seed.raw.json (areas + hotels with EXTERNAL image URLs from
research), downloads each image, downscales/recompresses with `sips` (macOS),
saves them under ximg-web/dr-html/images/<kind>/<id>/<n>.jpg, and writes
backend/data/seed.json with image URLs rewritten to local /images/... paths.

No external images are ever referenced at runtime — all pulled local, per the
ximg-web stack rules. Wikimedia originals are fetched via their thumbnail
endpoint with throttling + backoff to respect their rate limits.

Usage: python3 scripts/integrate.py [--raw FILE] [--seed-out FILE] [--img-dir DIR]
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import urllib.error

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_IMG = os.path.normpath(os.path.join(REPO, "..", "ximg-web", "dr-html", "images"))
UA = "dr-ximg-app/1.0 (https://dr.ximg.app; DR hotel comparison demo) python-urllib"
MAX_BYTES = 25 * 1024 * 1024

WM_RE = re.compile(r"^(https?://upload\.wikimedia\.org/wikipedia/commons/)([0-9a-f]/[0-9a-f]{2}/)(.+)$")
_wm_lock = threading.Lock()
_wm_last = [0.0]
_permissive = ssl.create_default_context()
_permissive.check_hostname = False
_permissive.verify_mode = ssl.CERT_NONE
try:
    _permissive.minimum_version = ssl.TLSVersion.TLSv1  # allow old hotel sites
except Exception:  # noqa: BLE001
    pass


def wm_thumb(url, px=1280):
    """Rewrite a Wikimedia Commons original URL to its thumbnail endpoint."""
    if "/thumb/" in url:
        return url
    m = WM_RE.match(url)
    if not m:
        return url
    prefix, hashpath, fname = m.groups()
    if fname.lower().endswith(".svg"):
        return url
    return "%sthumb/%s%s/%dpx-%s" % (prefix, hashpath, fname, px, fname)


def wm_throttle():
    with _wm_lock:
        dt = time.time() - _wm_last[0]
        if dt < 0.4:
            time.sleep(0.4 - dt)
        _wm_last[0] = time.time()


def _open(url, ctx=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    return urllib.request.urlopen(req, timeout=25, context=ctx)


def download(url):
    is_wm = "upload.wikimedia.org" in url
    if is_wm:
        url = wm_thumb(url)
    last = None
    for attempt in range(5):
        if is_wm:
            wm_throttle()
        try:
            try:
                r = _open(url)
            except urllib.error.URLError as e:
                if isinstance(getattr(e, "reason", None), ssl.SSLError) or "SSL" in str(e):
                    r = _open(url, ctx=_permissive)  # old-TLS fallback
                else:
                    raise
            with r:
                ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
                data = r.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError("too large")
            if not ctype.startswith("image/") or len(data) < 1024:
                raise ValueError("not an image (%s, %d bytes)" % (ctype, len(data)))
            ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                   "image/gif": "gif", "image/avif": "avif"}.get(ctype, "img")
            return data, ext
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 * (attempt + 1) + (1.5 if is_wm else 0))
                continue
            raise
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last


def to_jpeg(raw_bytes, ext, out_path, maxdim=1500):
    """Recompress to a reasonably-sized JPEG via sips; fall back to raw bytes."""
    with tempfile.NamedTemporaryFile(suffix="." + ext, delete=False) as tf:
        tf.write(raw_bytes)
        tmp = tf.name
    try:
        res = subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80",
             "-Z", str(maxdim), tmp, "-o", out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 1024:
            return True
        alt = os.path.splitext(out_path)[0] + "." + ext
        shutil.copyfile(tmp, alt)
        return alt
    finally:
        os.unlink(tmp)


def task(kind, eid, idx, img, img_dir, base):
    url = (img or {}).get("url", "")
    if not url.startswith(("http://", "https://")):
        return None
    try:
        raw, ext = download(url)
    except Exception as e:  # noqa: BLE001
        print("  skip %s/%s #%d: %s" % (kind, eid, idx, str(e)[:90]), file=sys.stderr)
        return None
    dest_dir = os.path.join(img_dir, kind, eid)
    os.makedirs(dest_dir, exist_ok=True)
    out = os.path.join(dest_dir, "%d.jpg" % idx)
    ok = to_jpeg(raw, ext, out)
    final = out if ok is True else ok
    rel = os.path.relpath(final, img_dir)
    return {
        "url": base.rstrip("/") + "/" + rel.replace(os.sep, "/"),
        "source": img.get("source", ""), "credit": img.get("credit", ""),
        "license": img.get("license", ""), "alt": img.get("alt", ""),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=os.path.join(REPO, "backend", "data", "seed.raw.json"))
    ap.add_argument("--seed-out", default=os.path.join(REPO, "backend", "data", "seed.json"))
    ap.add_argument("--img-dir", default=DEFAULT_IMG)
    ap.add_argument("--base", default="/images")
    ap.add_argument("--max-per", type=int, default=4)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    with open(args.raw) as f:
        ds = json.load(f)

    jobs = []
    for kind, key in (("areas", "areas"), ("hotels", "hotels")):
        for ent in ds.get(key, []):
            for i, img in enumerate((ent.get("images") or [])[: args.max_per], 1):
                jobs.append((kind, ent["id"], i, img))

    print("Downloading up to %d images with %d workers..." % (len(jobs), args.workers))
    results = {}
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(task, k, e, i, img, args.img_dir, args.base): (k, e, i)
                for (k, e, i, img) in jobs}
        for fut in cf.as_completed(futs):
            k, e, i = futs[fut]
            r = fut.result()
            if r:
                results[(k, e, i)] = r

    def rebuild(kind, ent):
        kept = [results[(kind, ent["id"], i)]
                for i in range(1, args.max_per + 1) if (kind, ent["id"], i) in results]
        ent["images"] = kept
        return len(kept)

    a_imgs = sum(rebuild("areas", a) for a in ds.get("areas", []))
    h_imgs = sum(rebuild("hotels", h) for h in ds.get("hotels", []))

    with open(args.seed_out, "w") as f:
        json.dump(ds, f, indent=2, ensure_ascii=False)

    areas_no = [a["id"] for a in ds.get("areas", []) if not a["images"]]
    hotels_no = [h["id"] for h in ds.get("hotels", []) if not h["images"]]
    print("Done: %d area images, %d hotel images" % (a_imgs, h_imgs))
    print("Wrote %s (%d areas, %d hotels)" % (args.seed_out, len(ds["areas"]), len(ds["hotels"])))
    print("areas with no image:", areas_no or "none")
    print("hotels with no image (%d):" % len(hotels_no), hotels_no or "none")


if __name__ == "__main__":
    main()
