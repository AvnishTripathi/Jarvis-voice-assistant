"""
core/tools/vision.py
Production-grade Multimodal Ingestion Layer for JARVIS.
Handles low-latency display buffer grabs and webcam frame ingestion.
"""

from __future__ import annotations

import io
import sys
import time
from typing import Optional, Tuple
import cv2
import mss
import numpy as np
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Data Schemas
# ---------------------------------------------------------------------------

class VisualFrame(BaseModel):
    success: bool
    source: str = Field(description="'screen' or 'webcam'")
    image_bytes: Optional[bytes] = Field(default=None, repr=False)
    mime_type: str = "image/jpeg"
    width: int = 0
    height: int = 0
    duration_ms: float = 0.0
    error_message: Optional[str] = None

    def to_genai_part(self) -> Optional[Any]:
        """Convert frame into a Google GenAI SDK types.Part for multimodal ingestion."""
        if not self.success or not self.image_bytes:
            return None
        try:
            from google.genai import types
            return types.Part.from_bytes(
                data=self.image_bytes,
                mime_type=self.mime_type
            )
        except Exception:
            return None


class VisionCaptureMetadata(BaseModel):
    """Compatibility model for visual capture metadata."""
    source: str
    width: int
    height: int
    size_bytes: int
    duration_ms: float
    is_fallback: bool
    error_detail: Optional[str] = None


# ---------------------------------------------------------------------------
# Image Optimization Helpers
# ---------------------------------------------------------------------------

def _optimize_and_compress(
    img: Image.Image,
    max_dimension: int = 1280,
    quality: int = 80
) -> Tuple[bytes, int, int]:
    """
    Downsamples the PIL image preserving aspect ratio and compresses to JPEG bytes.
    Avoids multi-megabyte payloads to maximize token throughput and minimize latency.
    """
    orig_w, orig_h = img.size

    # Downscale if larger than max_dimension
    if max(orig_w, orig_h) > max_dimension:
        scale = max_dimension / float(max(orig_w, orig_h))
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Compress in-memory
    buffer = io.BytesIO()
    # Convert RGBA to RGB for JPEG compatibility
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(buffer, format="JPEG", quality=quality, optimize=True)
    
    w, h = img.size
    return buffer.getvalue(), w, h


def create_fallback_payload(
    title: str,
    reason: str,
    source: str = "display",
    width: int = 1280,
    height: int = 720
) -> bytes:
    """Generate a structured diagnostic JPEG frame when hardware capture is unavailable."""
    img = Image.new("RGB", (width, height), color=(8, 14, 24))
    draw = ImageDraw.Draw(img)
    border_color = (0, 229, 255) if source in ("display", "screen") else (255, 61, 0)
    draw.rectangle([(16, 16), (width - 16, height - 16)], outline=border_color, width=2)
    draw.text((45, 45), f"J.A.R.V.I.S VISUAL TELEMETRY: {title.upper()}", fill=border_color)
    draw.text((45, 85), f"REASON: {reason}", fill=(220, 235, 245))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Multimodal Capture Tools
# ---------------------------------------------------------------------------

def capture_active_display(
    monitor_index: int = 1,
    max_dimension: int = 1280,
    jpeg_quality: int = 80,
    quality: Optional[int] = None,
) -> VisualFrame:
    """
    Captures primary or specified display directly from the frame buffer in-memory.
    
    Args:
        monitor_index: 0 for all monitors combined, 1 for primary monitor.
        max_dimension: Longest edge boundary for model ingestion.
        jpeg_quality: Compression quality (1-100).
        quality: Compatibility alias for jpeg_quality.
    """
    start_time = time.perf_counter()
    if quality is not None:
        jpeg_quality = quality

    try:
        with mss.mss() as sct:
            if monitor_index >= len(sct.monitors):
                monitor = sct.monitors[0]  # Fallback to virtual display
            else:
                monitor = sct.monitors[monitor_index]

            sct_img = sct.grab(monitor)
            # mss outputs BGRA; convert directly to PIL RGB Image
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            
            raw_bytes, width, height = _optimize_and_compress(
                img, max_dimension=max_dimension, quality=jpeg_quality
            )

            duration = (time.perf_counter() - start_time) * 1000
            return VisualFrame(
                success=True,
                source="screen",
                image_bytes=raw_bytes,
                width=width,
                height=height,
                duration_ms=round(duration, 2)
            )

    except Exception as e:
        duration = (time.perf_counter() - start_time) * 1000
        return VisualFrame(
            success=False,
            source="screen",
            duration_ms=round(duration, 2),
            error_message=f"DISPLAY_CAPTURE_ERROR: {str(e)} (Headless environment or permission denied)"
        )


def capture_webcam_frame(
    device_index: int = 0,
    max_dimension: int = 1280,
    jpeg_quality: int = 80,
    quality: Optional[int] = None,
) -> VisualFrame:
    """
    Initializes camera device, flushes obsolete buffer frames, captures a clear frame,
    releases the hardware lock, and encodes to JPEG in-memory.
    
    Args:
        device_index: Hardware interface index (default: 0).
        max_dimension: Maximum edge dimension for downsampling.
        jpeg_quality: Quality parameter for JPEG compression.
        quality: Compatibility alias for jpeg_quality.
    """
    start_time = time.perf_counter()
    if quality is not None:
        jpeg_quality = quality

    cap = None

    try:
        # On Windows, DirectShow opens faster without stalls; fallback to default on other OS
        if sys.platform == "win32":
            cap = cv2.VideoCapture(device_index, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(device_index)
        
        if not cap.isOpened():
            duration = (time.perf_counter() - start_time) * 1000
            return VisualFrame(
                success=False,
                source="webcam",
                duration_ms=round(duration, 2),
                error_message=f"DEVICE_UNAVAILABLE: Camera index {device_index} cannot be opened or is busy."
            )

        # Drop 3 initial frames to allow camera sensor auto-exposure and auto-white-balance to settle
        for _ in range(3):
            cap.grab()

        ret, frame = cap.read()
        if not ret or frame is None:
            duration = (time.perf_counter() - start_time) * 1000
            return VisualFrame(
                success=False,
                source="webcam",
                duration_ms=round(duration, 2),
                error_message="DEVICE_UNAVAILABLE: EMPTY_FRAME: Failed to retrieve frame data from camera sensor."
            )

        # Downsample preserving aspect ratio if exceeding max_dimension
        h, w = frame.shape[:2]
        if max(h, w) > max_dimension:
            scale = max_dimension / float(max(h, w))
            new_w, new_h = int(w * scale), int(h * scale)
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
            w, h = new_w, new_h

        # In-memory JPEG encoding using OpenCV (zero disk writes)
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality]
        success, encoded_img = cv2.imencode(".jpg", frame, encode_param)

        if not success:
            raise RuntimeError("Failed to encode frame buffer to JPEG.")

        duration = (time.perf_counter() - start_time) * 1000
        return VisualFrame(
            success=True,
            source="webcam",
            image_bytes=encoded_img.tobytes(),
            width=w,
            height=h,
            duration_ms=round(duration, 2)
        )

    except Exception as e:
        duration = (time.perf_counter() - start_time) * 1000
        return VisualFrame(
            success=False,
            source="webcam",
            duration_ms=round(duration, 2),
            error_message=f"CAMERA_SUBSYSTEM_EXCEPTION: {str(e)}"
        )

    finally:
        # Guarantee hardware lock release
        if cap is not None and cap.isOpened():
            cap.release()
