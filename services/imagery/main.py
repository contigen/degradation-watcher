"""
Degradation Watcher — Imagery Microservice
==========================================
Fetches Sentinel-2 satellite imagery for registered assets,
computes NDVI for agricultural assets, exports tiles to GCS,
and publishes imagery_ready events to Pub/Sub.

Triggered by Cloud Scheduler every 5 days.
~150 lines. Intentionally simple — one job, done well.
"""

import os
import json
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from google.cloud import storage, pubsub_v1, firestore

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("imagery-service")

app = FastAPI(title="Degradation Watcher — Imagery Service")

GCS_BUCKET = os.environ["GCS_BUCKET"]
PUBSUB_TOPIC = os.environ["PUBSUB_TOPIC"]
GCP_PROJECT = os.environ["GCP_PROJECT"]
STAC_API = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"

gcs = storage.Client()
bucket = gcs.bucket(GCS_BUCKET)
publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(GCP_PROJECT, PUBSUB_TOPIC)
db = firestore.Client(project=GCP_PROJECT)


# ── Data models ──────────────────────────────────────────────

class AssetConfig(BaseModel):
    asset_id: str
    asset_type: str  # "bridge" | "farmland" | "road"
    lat: float
    lng: float
    bbox_buffer_deg: float = 0.005  # ~500m buffer around point


class ImageryReadyEvent(BaseModel):
    assetId: str
    assetType: str
    timestamp: str
    imageUrls: list[str]
    ndviMean: Optional[float] = None
    ndviDelta: Optional[float] = None
    cloudCoverPct: float
    bandsCaptured: list[str]
    captureDate: str


# ── STAC search ───────────────────────────────────────────────

async def search_sentinel2(
    bbox: list[float],  # [west, south, east, north]
    days_back: int = 30,
    max_cloud_cover: float = 20.0,
) -> Optional[dict]:
    """
    Query Element84 STAC API for most recent Sentinel-2 scene
    with acceptable cloud cover.
    """
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)
    datetime_range = f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    payload = {
        "collections": [COLLECTION],
        "bbox": bbox,
        "datetime": datetime_range,
        "query": {
            "eo:cloud_cover": { "lt": max_cloud_cover }
        },
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{STAC_API}/search", json=payload)
        resp.raise_for_status()
        results = resp.json()

    features = results.get("features", [])
    if not features:
        log.warning("No Sentinel-2 scenes found for bbox %s", bbox)
        return None

    return features[0]


# ── Band download ─────────────────────────────────────────────

async def download_band(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def fetch_bands(item: dict, bands: list[str]) -> dict[str, bytes]:
    """Download specified bands from a STAC item's assets."""
    tasks = {}
    for band in bands:
        asset = item.get("assets", {}).get(band)
        if asset and "href" in asset:
            tasks[band] = download_band(asset["href"])
        else:
            log.warning("Band %s not found in STAC item", band)

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {
        band: data
        for band, data in zip(tasks.keys(), results)
        if isinstance(data, bytes)
    }


# ── NDVI computation ──────────────────────────────────────────

def compute_ndvi(nir_bytes: bytes, red_bytes: bytes) -> float:
    """
    Compute mean NDVI from raw GeoTIFF bytes.
    Returns float in range [-1, 1].
    """
    try:
        import rasterio
        from rasterio.io import MemoryFile

        with MemoryFile(nir_bytes) as mf:
            with mf.open() as ds:
                nir = ds.read(1).astype(np.float32)

        with MemoryFile(red_bytes) as mf:
            with mf.open() as ds:
                red = ds.read(1).astype(np.float32)

        # Normalise Sentinel-2 L2A reflectance (0-10000 scale)
        nir = nir / 10000.0
        red = red / 10000.0

        denominator = nir + red
        ndvi = np.where(denominator > 0, (nir - red) / denominator, 0)
        valid_pixels = ndvi[denominator > 0]
        return float(np.mean(valid_pixels)) if valid_pixels.size > 0 else 0.0

    except ImportError:
        # rasterio not available — return a placeholder
        log.warning("rasterio not installed, skipping NDVI computation")
        return 0.0
    except Exception as e:
        log.error("NDVI computation failed: %s", e)
        return 0.0


# ── TIF to PNG conversion ─────────────────────────────────────

def tif_to_png(tif_bytes: bytes) -> bytes:
    """Convert GeoTIFF bytes to PNG bytes for Gemini compatibility."""
    from io import BytesIO
    try:
        import rasterio
        from rasterio.io import MemoryFile
        from PIL import Image

        with MemoryFile(tif_bytes) as mf:
            with mf.open() as ds:
                # Read bands (visual TIF is typically RGB: 3 bands)
                if ds.count >= 3:
                    r, g, b = ds.read(1), ds.read(2), ds.read(3)
                    # Stack and normalize to uint8
                    rgb = np.stack([r, g, b], axis=-1)
                else:
                    # Single band — convert to grayscale
                    band = ds.read(1)
                    rgb = np.stack([band, band, band], axis=-1)

                # Normalize: Sentinel-2 visual is typically uint8 or uint16
                if rgb.dtype != np.uint8:
                    # Clip to 0-10000 range and scale to 0-255
                    rgb = np.clip(rgb, 0, 10000)
                    rgb = (rgb / 10000.0 * 255).astype(np.uint8)

                img = Image.fromarray(rgb)
                
                # Downsample large images for the frontend and Gemini
                max_size = 1024
                if img.width > max_size or img.height > max_size:
                    # Use thumbnail to resize in-place while preserving aspect ratio
                    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

                buf = BytesIO()
                img.save(buf, format="PNG")
                return buf.getvalue()
    except Exception as e:
        log.error("TIF to PNG conversion failed: %s", e)
        return tif_bytes  # Fallback: return original


# ── GCS upload ────────────────────────────────────────────────

def upload_to_gcs(
    data: bytes,
    asset_id: str,
    capture_date: str,
    band: str,
) -> str:
    """Upload band data to GCS and return the gs:// URI."""
    blob_name = f"imagery/{asset_id}/{capture_date}/{band}.tif"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(data, content_type="image/tiff")

    # Also create a PNG version of the visual band for Gemini analysis
    if band == "visual":
        png_data = tif_to_png(data)
        png_blob_name = f"imagery/{asset_id}/{capture_date}/{band}.png"
        png_blob = bucket.blob(png_blob_name)
        png_blob.upload_from_string(png_data, content_type="image/png")
        log.info("Created PNG for Gemini: %s", png_blob_name)
        # Return the PNG URI so the orchestrator sends it to Gemini
        return f"gs://{GCS_BUCKET}/{png_blob_name}"

    return f"gs://{GCS_BUCKET}/{blob_name}"


# ── Previous NDVI lookup ──────────────────────────────────────

def get_previous_ndvi(asset_id: str) -> Optional[float]:
    """Fetch the last recorded NDVI mean for this asset from Firestore."""
    try:
        snap = (
            db.collection("assets")
            .document(asset_id)
            .collection("degradation_records")
            .order_by("captureDate", direction=firestore.Query.DESCENDING)
            .limit(1)
            .get()
        )
        if snap:
            record = snap[0].to_dict()
            # Navigate through the structure to get NDVI
            return record.get("ndviMean")
        return None
    except Exception as e:
        log.warning("Could not fetch previous NDVI: %s", e)
        return None


# ── Core pipeline ─────────────────────────────────────────────

async def process_asset(asset: AssetConfig) -> Optional[ImageryReadyEvent]:
    """
    Full pipeline for one asset:
    1. STAC search → most recent Sentinel-2 scene
    2. Download required bands
    3. Compute NDVI (agriculture only)
    4. Upload to GCS
    5. Return structured event payload
    """
    log.info("Processing asset %s (%s)", asset.asset_id, asset.asset_type)

    # Build bounding box
    buf = asset.bbox_buffer_deg
    bbox = [
        asset.lng - buf,  # west
        asset.lat - buf,  # south
        asset.lng + buf,  # east
        asset.lat + buf,  # north
    ]

    item = await search_sentinel2(bbox)
    if not item:
        log.warning("No imagery found for %s", asset.asset_id)
        return None

    cloud_cover = item.get("properties", {}).get("eo:cloud_cover", 100.0)
    capture_date = item.get("properties", {}).get("datetime", "")[:10]
    log.info("Found scene for %s: %s (cloud: %.1f%%)", asset.asset_id, capture_date, cloud_cover)

    # Choose bands based on asset type
    is_agriculture = asset.asset_type == "farmland"
    bands_to_fetch = ["red", "nir", "visual"] if is_agriculture else ["visual", "red"]

    band_data = await fetch_bands(item, bands_to_fetch)
    if not band_data:
        log.error("Failed to download any bands for %s", asset.asset_id)
        return None

    # Upload to GCS
    image_urls = []
    for band, data in band_data.items():
        gcs_uri = upload_to_gcs(data, asset.asset_id, capture_date, band)
        image_urls.append(gcs_uri)
        log.info("Uploaded %s/%s → %s", asset.asset_id, band, gcs_uri)

    # Compute NDVI for agricultural assets
    ndvi_mean: Optional[float] = None
    ndvi_delta: Optional[float] = None
    if is_agriculture and "nir" in band_data and "red" in band_data:
        ndvi_mean = compute_ndvi(band_data["nir"], band_data["red"])
        prev_ndvi = get_previous_ndvi(asset.asset_id)
        if prev_ndvi is not None:
            ndvi_delta = round(ndvi_mean - prev_ndvi, 4)
        log.info("NDVI for %s: %.4f (delta: %s)", asset.asset_id, ndvi_mean, ndvi_delta)

    return ImageryReadyEvent(
        assetId=asset.asset_id,
        assetType=asset.asset_type,
        timestamp=datetime.now(timezone.utc).isoformat(),
        imageUrls=image_urls,
        ndviMean=round(ndvi_mean, 4) if ndvi_mean is not None else None,
        ndviDelta=ndvi_delta,
        cloudCoverPct=round(cloud_cover, 1),
        bandsCaptured=list(band_data.keys()),
        captureDate=capture_date,
    )


def publish_event(event: ImageryReadyEvent) -> None:
    """Publish imagery_ready event to Pub/Sub."""
    data = json.dumps(event.model_dump()).encode("utf-8")
    future = publisher.publish(topic_path, data)
    message_id = future.result(timeout=10)
    log.info("Published imagery_ready for %s — message %s", event.assetId, message_id)


async def run_batch(asset_ids: Optional[list[str]] = None) -> dict:
    """
    Process all active monitored assets (or a subset).
    Called by Cloud Scheduler or manual trigger.
    """
    # Fetch active assets from Firestore
    query = db.collection("assets").where("monitoring.active", "==", True)
    if asset_ids:
        # Filter to specific IDs
        docs = [db.collection("assets").document(aid).get() for aid in asset_ids]
        assets_raw = [d.to_dict() for d in docs if d.exists]
    else:
        assets_raw = [d.to_dict() for d in query.stream()]

    log.info("Processing %d assets", len(assets_raw))

    processed = 0
    skipped = 0
    errors = 0

    for raw in assets_raw:
        try:
            asset = AssetConfig(
                asset_id=raw["id"],
                asset_type=raw["type"],
                lat=raw["coordinates"]["lat"],
                lng=raw["coordinates"]["lng"],
            )
            event = await process_asset(asset)
            if event:
                publish_event(event)
                processed += 1
            else:
                skipped += 1
        except Exception as e:
            log.error("Failed processing asset %s: %s", raw.get("id"), e)
            errors += 1

    return {"processed": processed, "skipped": skipped, "errors": errors}


# ── HTTP endpoints ────────────────────────────────────────────

@app.post("/run")
async def trigger_batch(background_tasks: BackgroundTasks):
    """
    Called by Cloud Scheduler (HTTP target).
    Runs batch processing in background and returns immediately.
    """
    background_tasks.add_task(run_batch)
    return {"status": "batch started", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/run/{asset_id}")
async def trigger_single(asset_id: str):
    """Process a single asset on demand — useful for testing."""
    doc = db.collection("assets").document(asset_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

    raw = doc.to_dict()
    asset = AssetConfig(
        asset_id=raw["id"],
        asset_type=raw["type"],
        lat=raw["coordinates"]["lat"],
        lng=raw["coordinates"]["lng"],
    )
    event = await process_asset(asset)
    if not event:
        raise HTTPException(status_code=422, detail="No imagery available for asset")

    publish_event(event)
    return event.model_dump()


@app.get("/health")
def health():
    return {"status": "ok", "service": "imagery-microservice"}
