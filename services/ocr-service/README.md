# 本地发票 OCR 服务

该服务使用开源 PaddleOCR 3.x，在本机或自托管环境运行，不调用商业 OCR API。

## 安装与启动

建议使用 Python 3.10+ 虚拟环境：

```text
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

首次识别时 PaddleOCR / PaddlePaddle 可能下载模型到 Python 用户缓存目录，不将模型权重提交到 Git。服务提供 `GET /health` 和 `POST /ocr/invoice`。

支持 JPG、JPEG、PNG、PDF，单次文件上限 20MB。多页 PDF 按页识别并保留页级原始结果；个别页面失败时返回可用页面结果。

PaddleOCR 与 PaddlePaddle 依赖其各自开源许可证，版本范围记录在 `requirements.txt`。使用前请按发布版本核对许可证和 CPU/GPU 安装说明。
