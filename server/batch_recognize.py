"""
Batch Image Recognition Tool - Qwen VL API
Usage: python batch_recognize.py <image_folder> [--output result.xlsx] [--prompt "custom prompt"]
"""
import requests
import json
import os
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path

# ============ CONFIG ============
API_KEY = "sk-ad9a93ab29e34635a92b75fd2d751f81"
MODEL = "qwen-vl-plus"
BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
DEFAULT_PROMPT = (
    "请识别这张图片的内容，包括：\n"
    "1. 商品类型（如服装、鞋包、数码、食品等）\n"
    "2. 主要特征（颜色、材质、款式）\n"
    "3. 风格描述（简约、复古、运动、商务等）\n"
    "4. 背景情况（纯色、场景、户外等）\n"
    "5. 图片尺寸用途建议（如适合淘宝主图、详情页、朋友圈等）\n"
    "请用简洁的中文描述，每项一行。"
)
# ================================

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff"}


def get_image_info(filepath):
    """Get image dimensions without heavy dependencies."""
    w, h = "unknown", "unknown"
    try:
        # Try PIL first
        from PIL import Image
        img = Image.open(filepath)
        w, h = img.width, img.height
    except ImportError:
        pass
    return w, h


def recognize_image(filepath, prompt, retries=2):
    """Call Qwen VL API to recognize a single image."""
    fname = os.path.basename(filepath)

    # For local files, convert to base64
    with open(filepath, "rb") as f:
        import base64
        b64 = base64.b64encode(f.read()).decode("utf-8")
        # Detect mime
        ext = Path(filepath).suffix.lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "webp": "image/webp", "bmp": "image/bmp", "gif": "image/gif"}.get(ext.lstrip("."), "image/jpeg")

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": prompt}
            ]
        }]
    }

    for attempt in range(retries + 1):
        try:
            resp = requests.post(BASE_URL, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            result = resp.json()
            content = result["choices"][0]["message"]["content"]
            usage = result.get("usage", {})
            return content, usage.get("total_tokens", 0), None
        except requests.exceptions.HTTPError as e:
            error_msg = f"HTTP {e.response.status_code}"
            try:
                err = e.response.json()
                error_msg = err.get("error", {}).get("message", error_msg)
            except:
                pass
            if attempt < retries:
                time.sleep(3)
                continue
            return None, 0, error_msg
        except Exception as e:
            if attempt < retries:
                time.sleep(3)
                continue
            return None, 0, str(e)

    return None, 0, "Max retries exceeded"


def main():
    parser = argparse.ArgumentParser(description="Batch Image Recognition")
    parser.add_argument("folder", help="Image folder path")
    parser.add_argument("--output", "-o", default=None, help="Output file (xlsx or csv)")
    parser.add_argument("--prompt", "-p", default=DEFAULT_PROMPT, help="Custom recognition prompt")
    parser.add_argument("--delay", "-d", type=float, default=1.0, help="Delay between requests (seconds)")
    parser.add_argument("--max", "-m", type=int, default=0, help="Max images to process (0=all)")
    args = parser.parse_args()

    folder = Path(args.folder)
    if not folder.exists():
        print(f"Error: folder not found: {folder}")
        sys.exit(1)

    # Collect images
    images = []
    for f in sorted(folder.rglob("*")):
        if f.suffix.lower() in IMAGE_EXTS and not f.name.startswith("."):
            images.append(f)

    if not images:
        print(f"No images found in {folder}")
        sys.exit(1)

    if args.max > 0:
        images = images[:args.max]

    # Output file
    if args.output:
        outpath = args.output
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        outpath = str(folder / f"recognition_{timestamp}.csv")

    print(f"=== Batch Image Recognition ===")
    print(f"Folder:  {folder}")
    print(f"Images:  {len(images)}")
    print(f"Output:  {outpath}")
    print(f"Prompt:  {args.prompt[:50]}...")
    print()

    # Process
    results = []
    total_tokens = 0
    success = 0
    failed = 0

    for i, img_path in enumerate(images, 1):
        fname = img_path.name
        fsize = img_path.stat().st_size
        w, h = get_image_info(img_path)

        print(f"[{i}/{len(images)}] {fname} ({fsize/1024:.0f}KB {w}x{h})...", end=" ", flush=True)

        content, tokens, error = recognize_image(str(img_path), args.prompt)

        if content:
            success += 1
            total_tokens += tokens
            print(f"OK ({tokens} tokens)")
        else:
            failed += 1
            print(f"FAILED: {error}")

        results.append({
            "file_name": fname,
            "file_path": str(img_path),
            "file_size_kb": round(fsize / 1024, 1),
            "width": w,
            "height": h,
            "recognition": content or error or "Failed",
            "tokens": tokens,
            "status": "OK" if content else "FAILED"
        })

        # Rate limit
        if i < len(images):
            time.sleep(args.delay)

    # Save results
    _, ext = os.path.splitext(outpath)
    ext = ext.lower()

    if ext == ".xlsx":
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Recognition Results"
            headers = ["file_name", "file_size_kb", "width", "height", "recognition", "tokens", "status"]
            ws.append(headers)
            for r in results:
                ws.append([r[h] for h in headers])
            # Auto column width
            for col in ws.columns:
                max_len = max(len(str(c.value or "")) for c in col)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)
            wb.save(outpath)
        except ImportError:
            print("openpyxl not installed, saving as CSV instead")
            outpath = outpath.rsplit(".", 1)[0] + ".csv"
            ext = ".csv"

    if ext == ".csv" or ext == "":
        import csv
        with open(outpath, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["file_name", "file_path", "file_size_kb", "width", "height", "recognition", "tokens", "status"])
            writer.writeheader()
            writer.writerows(results)

    print()
    print(f"=== Done ===")
    print(f"Success: {success}/{len(images)}")
    print(f"Failed:  {failed}/{len(images)}")
    print(f"Tokens:  {total_tokens}")
    print(f"Cost:    ~{total_tokens * 0.000008:.4f} CNY")
    print(f"Output:  {outpath}")


if __name__ == "__main__":
    main()
