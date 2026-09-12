"""
tests/test_vision.py
Verifies in-memory multimodal frame grabs and graceful headless degradation.
"""

import io
from unittest.mock import MagicMock, patch
import numpy as np
import pytest
from PIL import Image

from core.tools.vision import (
    capture_active_display,
    capture_webcam_frame,
    VisualFrame,
    _optimize_and_compress,
    create_fallback_payload,
    VisionCaptureMetadata,
)


# ---------------------------------------------------------------------------
# Core User-Facing Multimodal Telemetry Tests
# ---------------------------------------------------------------------------

def test_screen_capture_structure():
    result = capture_active_display(max_dimension=640)
    assert isinstance(result, VisualFrame)
    assert result.source == "screen"
    
    if result.success:
        assert result.image_bytes is not None
        # Check standard JPEG magic bytes: 0xFF, 0xD8, 0xFF
        assert result.image_bytes.startswith(b"\xff\xd8\xff")
        assert result.width <= 640
        assert result.height <= 640
        assert result.duration_ms > 0.0
    else:
        # Headless server or lack of GUI environment must return a descriptive error
        assert result.error_message is not None


def test_webcam_capture_graceful_failure_or_success():
    # Attempt capture on index 0; gracefully handles machines without physical cameras
    result = capture_webcam_frame(device_index=0, max_dimension=640)
    assert isinstance(result, VisualFrame)
    assert result.source == "webcam"

    if result.success:
        assert result.image_bytes is not None
        assert result.image_bytes.startswith(b"\xff\xd8\xff")
        assert result.width <= 640
        assert result.height <= 640
    else:
        assert "DEVICE_UNAVAILABLE" in result.error_message or "CAMERA_SUBSYSTEM_EXCEPTION" in result.error_message


# ---------------------------------------------------------------------------
# Extended Unit Validation: Downsampling, Compression, & Hardware Release
# ---------------------------------------------------------------------------

def test_visual_frame_schema():
    """Verify VisualFrame data model fields and defaults."""
    frame = VisualFrame(
        success=True,
        source="screen",
        image_bytes=b"\xff\xd8\xff\xd9",
        width=1280,
        height=720,
        duration_ms=25.4,
    )
    assert frame.success is True
    assert frame.source == "screen"
    assert frame.mime_type == "image/jpeg"
    assert frame.width == 1280
    assert frame.height == 720
    assert frame.duration_ms == 25.4
    assert frame.error_message is None


def test_optimize_and_compress_downsampling():
    """Verify _optimize_and_compress downsamples high-res images preserving aspect ratio."""
    # 4K image (3840 x 2160) - 16:9
    img = Image.new("RGB", (3840, 2160), color=(50, 100, 150))
    jpeg_bytes, w, h = _optimize_and_compress(img, max_dimension=1280, quality=80)

    assert isinstance(jpeg_bytes, bytes)
    assert jpeg_bytes.startswith(b"\xff\xd8\xff")
    assert max(w, h) == 1280
    assert w == 1280
    assert h == 720

    # Verify PIL can read the buffer
    parsed = Image.open(io.BytesIO(jpeg_bytes))
    assert parsed.format == "JPEG"
    assert parsed.size == (1280, 720)


def test_optimize_and_compress_rgba_conversion():
    """Verify RGBA images are converted to RGB for JPEG compatibility."""
    img = Image.new("RGBA", (800, 600), color=(255, 0, 0, 128))
    jpeg_bytes, w, h = _optimize_and_compress(img, max_dimension=1000, quality=85)

    assert isinstance(jpeg_bytes, bytes)
    parsed = Image.open(io.BytesIO(jpeg_bytes))
    assert parsed.format == "JPEG"
    assert parsed.mode == "RGB"
    assert parsed.size == (800, 600)


def test_capture_active_display_mocked_success():
    """Verify capture_active_display succeeds when mss returns a valid screen buffer."""
    mock_sct = MagicMock()
    mock_monitor = {"left": 0, "top": 0, "width": 1920, "height": 1080}
    mock_sct.monitors = [mock_monitor, mock_monitor]

    # Mock MSS screenshot buffer (BGRA format)
    raw_bgra = np.zeros((1080, 1920, 4), dtype=np.uint8)
    raw_bgra[:, :] = (100, 150, 200, 255)
    mock_img = MagicMock()
    mock_img.size = (1920, 1080)
    mock_img.bgra = raw_bgra.tobytes()
    mock_sct.grab.return_value = mock_img
    mock_sct.__enter__.return_value = mock_sct

    with patch("mss.mss", return_value=mock_sct):
        frame = capture_active_display(monitor_index=1, max_dimension=1280)

        assert frame.success is True
        assert frame.source == "screen"
        assert frame.image_bytes is not None
        assert frame.image_bytes.startswith(b"\xff\xd8\xff")
        assert max(frame.width, frame.height) == 1280
        assert frame.width == 1280
        assert frame.height == 720


def test_capture_active_display_exception_handling():
    """Verify capture_active_display catches exceptions and returns structured failure frame."""
    with patch("mss.mss", side_effect=RuntimeError("GDI BitBlt failed")):
        frame = capture_active_display(monitor_index=1)

        assert frame.success is False
        assert frame.source == "screen"
        assert frame.image_bytes is None
        assert "DISPLAY_CAPTURE_ERROR" in frame.error_message
        assert "GDI BitBlt failed" in frame.error_message


def test_capture_webcam_invalid_device():
    """Verify querying an invalid camera device returns structured failure frame."""
    frame = capture_webcam_frame(device_index=9999)

    assert frame.success is False
    assert frame.source == "webcam"
    assert frame.image_bytes is None
    assert "DEVICE_UNAVAILABLE" in frame.error_message or "CAMERA_SUBSYSTEM_EXCEPTION" in frame.error_message


def test_capture_webcam_frame_downsampling_and_lock_release():
    """Verify frame downsampling, sensor flushing, and hardware lock release with mocked camera."""
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True

    # 1080p frame (1080, 1920, 3)
    dummy_frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
    dummy_frame[:, :] = (120, 100, 80)
    mock_cap.read.return_value = (True, dummy_frame)

    with patch("cv2.VideoCapture", return_value=mock_cap):
        frame = capture_webcam_frame(device_index=0, max_dimension=640, jpeg_quality=75)

        # Ensure cap.release() was called
        mock_cap.release.assert_called_once()
        # Ensure 3 frames were flushed for sensor settling
        assert mock_cap.grab.call_count == 3

        assert frame.success is True
        assert frame.source == "webcam"
        assert frame.image_bytes is not None
        assert max(frame.width, frame.height) == 640
        assert frame.width == 640
        assert frame.height == 360


def test_capture_webcam_empty_frame_releases_lock():
    """Verify empty frame buffer returns failure and guarantees hardware lock release."""
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.return_value = (False, None)

    with patch("cv2.VideoCapture", return_value=mock_cap):
        frame = capture_webcam_frame(device_index=0)

        mock_cap.release.assert_called_once()
        assert frame.success is False
        assert "DEVICE_UNAVAILABLE" in frame.error_message or "EMPTY_FRAME" in frame.error_message


def test_capture_webcam_exception_releases_lock():
    """Verify unexpected exceptions return failure frame and release hardware locks."""
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.side_effect = RuntimeError("Hardware I/O bus failure")

    with patch("cv2.VideoCapture", return_value=mock_cap):
        frame = capture_webcam_frame(device_index=0)

        mock_cap.release.assert_called_once()
        assert frame.success is False
        assert "CAMERA_SUBSYSTEM_EXCEPTION" in frame.error_message


def test_fallback_payload_generator():
    """Verify create_fallback_payload produces valid diagnostic JPEG bytes."""
    data = create_fallback_payload(
        title="Diagnostic Alert",
        reason="Display lockout",
        source="display"
    )
    assert isinstance(data, bytes)
    assert data[:2] == b"\xff\xd8"
    assert data[-2:] == b"\xff\xd9"
    img = Image.open(io.BytesIO(data))
    assert img.format == "JPEG"


def test_vision_capture_metadata_model():
    """Verify VisionCaptureMetadata model fields."""
    meta = VisionCaptureMetadata(
        source="webcam",
        width=1280,
        height=720,
        size_bytes=45200,
        duration_ms=42.5,
        is_fallback=False,
    )
    assert meta.source == "webcam"
    assert meta.width == 1280
