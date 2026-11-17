#!/usr/bin/env bash
# PaddleOCR 모델을 브라우저용(ONNX)으로 바꿔 public/models/paddle/ 에 둡니다.
# 결과 파일(약 75MB)은 git에 올리지 않으므로, 처음 한 번 각자 실행해야 합니다.
#
#   사용법: bash scripts/paddle-models.sh
#   필요: Python 3.9~3.12 (python3.11 권장)
#
# 만들어지는 파일
#   det.onnx          글자 영역 찾기 (PP-OCRv6_medium_det)
#   rec.onnx          한국어 글자 인식 (korean_PP-OCRv5_mobile_rec)
#   korean_dict.json  인식 결과 번호 → 글자 목록
set -euo pipefail

DET=PP-OCRv6_medium_det
REC=korean_PP-OCRv5_mobile_rec
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/models/paddle"
WORK="${TMPDIR:-/tmp}/checkit-paddle"
PY="${PYTHON:-python3.11}"

mkdir -p "$OUT" "$WORK"
if [ ! -x "$WORK/venv/bin/python" ]; then
  "$PY" -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install -q --upgrade pip
  "$WORK/venv/bin/pip" install -q paddlepaddle paddleocr paddle2onnx pyyaml
fi

# 모델 내려받기 (~/.paddlex/official_models 에 저장됩니다)
"$WORK/venv/bin/python" -I - <<PY
from paddleocr import PaddleOCR
PaddleOCR(text_detection_model_name="$DET", text_recognition_model_name="$REC",
          use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
PY

MODELS="$HOME/.paddlex/official_models"
"$WORK/venv/bin/paddle2onnx" --model_dir "$MODELS/$DET" --model_filename inference.json \
  --params_filename inference.pdiparams --save_file "$OUT/det.onnx" --opset_version 14
"$WORK/venv/bin/paddle2onnx" --model_dir "$MODELS/$REC" --model_filename inference.json \
  --params_filename inference.pdiparams --save_file "$OUT/rec.onnx" --opset_version 14

# 글자 목록: 0번은 CTC blank, 마지막은 띄어쓰기 (PaddleX CTCLabelDecode와 같은 순서)
"$WORK/venv/bin/python" -I - <<PY
import json, yaml
chars = yaml.safe_load(open("$MODELS/$REC/inference.yml", encoding="utf-8"))["PostProcess"]["character_dict"]
json.dump(["", *chars, " "], open("$OUT/korean_dict.json", "w", encoding="utf-8"), ensure_ascii=False)
print("글자 수:", len(chars) + 2)
PY

ls -lh "$OUT"
