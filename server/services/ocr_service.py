# -*- coding: utf-8 -*-
"""
PaddleOCR 文字检测微服务 - 跨境TEMU无中文图方案
端口: 3001
端点:
  POST /detect          - 检测图片中所有文字区域
  POST /detect-chinese  - 只检测中文文字区域
  POST /health          - 健康检查
"""

import os
os.environ['FLAGS_use_mkldnn'] = '0'

import argparse
import base64
import io
import time
import logging
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[OCR] %(asctime)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="PaddleOCR Text Detection Service")

_ocr_engine = None
_ocr_init_lock = False


def get_ocr_engine():
    """延迟初始化 PaddleOCR（首次调用约 3-5 秒加载模型）"""
    global _ocr_engine, _ocr_init_lock
    if _ocr_engine is not None:
        return _ocr_engine
    if _ocr_init_lock:
        while _ocr_init_lock:
            time.sleep(0.1)
        return _ocr_engine

    _ocr_init_lock = True
    try:
        from paddleocr import PaddleOCR
        logger.info("Loading PaddleOCR model (first time ~3-5s)...")
        # 旧版参数名(det_db_thresh等)适用于 PaddleOCR<=2.9.x
        # 新版参数名(text_det_thresh等)适用于 PaddleOCR 3.x+
        # 新版参数名在旧版中会被 **kwargs 静默忽略，导致用默认值(det_db_box_thresh=0.6)
        # 所以必须先试旧版，再试新版
        try:
            _ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang="ch",
                use_gpu=False,
                det_db_thresh=0.2,
                det_db_box_thresh=0.3,
                det_db_unclip_ratio=2.0,
            )
        except TypeError:
            _ocr_engine = PaddleOCR(
                use_textline_orientation=True,
                lang="ch",
                text_det_thresh=0.2,
                text_det_box_thresh=0.3,
                text_det_unclip_ratio=2.0,
            )
        logger.info("PaddleOCR model loaded")
        return _ocr_engine
    except Exception as e:
        logger.error("PaddleOCR init failed: %s", e)
        raise
    finally:
        _ocr_init_lock = False


def is_chinese_char(c):
    """判断单个字符是否为中文"""
    cp = ord(c)
    return (
        (0x4E00 <= cp <= 0x9FFF)
        or (0x3400 <= cp <= 0x4DBF)
        or (0x20000 <= cp <= 0x2A6DF)
        or (0x2A700 <= cp <= 0x2B73F)
        or (0x2B740 <= cp <= 0x2B81F)
        or (0x2B820 <= cp <= 0x2CEAF)
        or (0xF900 <= cp <= 0xFAFF)
        or (0x2F800 <= cp <= 0x2FA1F)
        or (0x3000 <= cp <= 0x303F)
        or (0xFF00 <= cp <= 0xFFEF)
    )


def has_chinese(text):
    """判断文本是否包含中文字符"""
    return any(is_chinese_char(c) for c in text)


def chinese_ratio(text):
    """计算中文字符占比"""
    if not text:
        return 0
    return sum(1 for c in text if is_chinese_char(c)) / len(text)


class DetectRequest(BaseModel):
    image_base64: str
    chinese_only: bool = False
    min_confidence: float = 0.5
    expand_px: int = 5


class TextRegion(BaseModel):
    x: int
    y: int
    width: int
    height: int
    text: str
    confidence: float
    is_chinese: bool
    chinese_ratio: float
    polygon: List[List[int]]


class DetectResponse(BaseModel):
    ok: bool
    regions: List[TextRegion]
    image_width: int
    image_height: int
    elapsed_ms: int


@app.post("/detect", response_model=DetectResponse)
async def detect_text(req: DetectRequest):
    """检测图片中所有文字区域"""
    t0 = time.time()
    try:
        img_data = base64.b64decode(req.image_base64)
        from PIL import Image
        import numpy as np
        img = Image.open(io.BytesIO(img_data))
        img_w, img_h = img.size
        img_array = np.array(img)

        ocr = get_ocr_engine()
        # 先试 ocr() (PaddleOCR<=2.9.x)，再试 predict() (3.x+)
        if hasattr(ocr, 'ocr'):
            result = ocr.ocr(img_array, cls=True)
        else:
            result = ocr.predict(img_array)

        if not result or not result[0]:
            elapsed = int((time.time() - t0) * 1000)
            return DetectResponse(
                ok=True, regions=[], image_width=img_w,
                image_height=img_h, elapsed_ms=elapsed
            )

        regions = []
        for line in result[0]:
            box_points = line[0]
            text = line[1][0]
            confidence = line[1][1]

            if confidence < req.min_confidence:
                continue

            xs = [int(p[0]) for p in box_points]
            ys = [int(p[1]) for p in box_points]
            # expand_px 在 mask 生成端统一处理，这里不膨胀 polygon
            # 保留原始 polygon 坐标以获得更精确的 mask
            is_cn = has_chinese(text)
            cn_ratio = chinese_ratio(text)

            if req.chinese_only and not is_cn:
                continue

            regions.append(TextRegion(
                x=min(xs), y=min(ys),
                width=max(xs) - min(xs), height=max(ys) - min(ys),
                text=text, confidence=round(confidence, 3),
                is_chinese=is_cn, chinese_ratio=round(cn_ratio, 2),
                polygon=[[int(p[0]), int(p[1])] for p in box_points]
            ))

        elapsed = int((time.time() - t0) * 1000)
        logger.info("Detected %d regions in %dms", len(regions), elapsed)
        return DetectResponse(
            ok=True, regions=regions, image_width=img_w,
            image_height=img_h, elapsed_ms=elapsed
        )
    except Exception as e:
        logger.error("Detection failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect-chinese", response_model=DetectResponse)
async def detect_chinese(req: DetectRequest):
    """便捷端点：只检测中文文字区域"""
    req.chinese_only = True
    return await detect_text(req)


@app.get("/health")
async def health():
    """健康检查 + 模型状态"""
    try:
        ocr = get_ocr_engine()
        return {"status": "ok", "model": "PaddleOCR", "loaded": ocr is not None}
    except Exception as e:
        return {"status": "error", "model": "PaddleOCR", "error": str(e)}


@app.on_event("startup")
async def preload_model():
    """服务启动时静默加载模型，避免首次请求等待"""
    import threading
    def _load():
        try:
            get_ocr_engine()
            logger.info("PaddleOCR model preloaded on startup")
        except Exception as e:
            logger.error("PaddleOCR preload failed: %s", e)
    threading.Thread(target=_load, daemon=True).start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PaddleOCR Text Detection Service")
    parser.add_argument("--port", type=int, default=3001)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()
    logger.info("Starting PaddleOCR service @ http://%s:%d", args.host, args.port)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
