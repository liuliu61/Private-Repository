import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="Personal Channel Accounting Invoice OCR")
ocr_engine = None
MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "application/pdf"}


def engine():
    global ocr_engine
    if ocr_engine is None:
        from paddleocr import PaddleOCR

        ocr_engine = PaddleOCR(lang=os.getenv("PADDLEOCR_LANG", "ch"))
    return ocr_engine


def serializable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    for method in ("to_dict", "to_json"):
        candidate = getattr(value, method, None)
        if callable(candidate):
            try:
                result = candidate()
                if isinstance(result, str):
                    return json.loads(result)
                return serializable(result)
            except Exception:
                pass
    raw_json = getattr(value, "json", None)
    if raw_json:
        try:
            return json.loads(raw_json if isinstance(raw_json, str) else raw_json())
        except Exception:
            pass
    return str(value)


def text_values(value: Any) -> list[str]:
    values: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {"rec_texts", "text", "texts", "rec_text"}:
                if isinstance(item, list):
                    values.extend(str(entry) for entry in item)
                elif isinstance(item, str):
                    values.append(item)
            else:
                values.extend(text_values(item))
    elif isinstance(value, list):
        for item in value:
            values.extend(text_values(item))
    return values


def first(pattern: str, text: str) -> str:
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def parse_invoice(text: str) -> dict[str, Any]:
    total = first(r"价税合计[^0-9]*(?:¥|￥)?\s*([0-9,]+(?:\.\d{1,2})?)", text)
    tax = first(r"税额[^0-9]*(?:¥|￥)?\s*([0-9,]+(?:\.\d{1,2})?)", text)
    excluding = first(r"(?:金额|不含税金额)[^0-9]*(?:¥|￥)?\s*([0-9,]+(?:\.\d{1,2})?)", text)
    date = first(r"(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)", text)
    return {
        "invoiceNo": first(r"发票号码[^0-9A-Z]*([0-9A-Z]{8,20})", text),
        "invoiceDate": date.replace("年", "-").replace("月", "-").replace("日", "").replace("/", "-").replace(".", "-") if date else "",
        "invoiceCode": first(r"发票代码[^0-9A-Z]*([0-9A-Z]{10,20})", text),
        "checkCode": first(r"校验码[^0-9A-Z]*([0-9A-Z]{6,30})", text),
        "buyerName": first(r"购买方.*?名称[^：:]*[：:]\s*([^\n]{2,80})", text),
        "buyerTaxNo": first(r"购买方.*?(?:统一社会信用代码|纳税人识别号)[^0-9A-Z]*([0-9A-Z]{10,20})", text),
        "sellerName": first(r"销售方.*?名称[^：:]*[：:]\s*([^\n]{2,80})", text),
        "sellerTaxNo": first(r"销售方.*?(?:统一社会信用代码|纳税人识别号)[^0-9A-Z]*([0-9A-Z]{10,20})", text),
        "amountExcludingTax": excluding.replace(",", "") if excluding else "",
        "taxAmount": tax.replace(",", "") if tax else "",
        "totalAmount": total.replace(",", "") if total else "",
        "currency": "CNY" if "¥" in text or "￥" in text or "人民币" in text else "",
        "invoiceType": first(r"(增值税专用发票|增值税普通发票|电子普通发票)", text),
        "remark": first(r"备注[^：:]*[：:]\s*([^\n]{0,255})", text),
        "items": [],
        "rawText": text,
    }


def recognize_pages(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    pages: list[dict[str, Any]] = []
    errors: list[str] = []
    input_paths = [path]
    temporary_paths: list[Path] = []
    if path.suffix.lower() == ".pdf":
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(path))
        for index in range(len(pdf)):
            rendered = pdf[index].render(scale=2)
            image = rendered.to_pil()
            page_path = path.with_name(f"{path.stem}-page-{index + 1}.png")
            image.save(page_path)
            input_paths.append(page_path)
            temporary_paths.append(page_path)
        input_paths = input_paths[1:]
    try:
        for index, input_path in enumerate(input_paths, start=1):
            try:
                raw = [serializable(item) for item in engine().predict(str(input_path))]
                text = "\n".join(text_values(raw))
                pages.append({"page": index, "rawResult": raw, "rawText": text, "parsedResult": parse_invoice(text)})
            except Exception as error:
                errors.append(f"第{index}页识别失败: {error}")
    finally:
        for temporary_path in temporary_paths:
            temporary_path.unlink(missing_ok=True)
    return pages, errors


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "provider": "PaddleOCR", "model": os.getenv("PADDLEOCR_MODEL", "PP-StructureV3")}


@app.post("/ocr/invoice")
async def invoice_ocr(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="仅支持 JPG、JPEG、PNG 或 PDF 发票文件")
    payload = await file.read()
    if len(payload) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="发票文件不能超过20MB")
    suffix = Path(file.filename or "invoice").suffix.lower()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / f"invoice{suffix}"
        path.write_bytes(payload)
        pages, errors = recognize_pages(path)
    if not pages:
        raise HTTPException(status_code=422, detail="OCR未识别到有效内容")
    merged = parse_invoice("\n".join(page["rawText"] for page in pages))
    merged["items"] = [item for page in pages for item in page["parsedResult"].get("items", [])]
    return {"success": True, "status": "SUCCESS", "provider": "PaddleOCR", "model": os.getenv("PADDLEOCR_MODEL", "PP-StructureV3"), "data": merged, "rawResult": {"pages": pages, "pageErrors": errors}, "fieldConfidence": {}, "partial": bool(errors)}
