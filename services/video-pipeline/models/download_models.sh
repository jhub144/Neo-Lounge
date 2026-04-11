#!/bin/bash
set -euo pipefail
MODEL_DIR="$(dirname "$0")"

# YAMNet: Audio event detection (quantized TFLite)
YAMNET_URL="https://storage.googleapis.com/tfhub-lite-models/google/lite-model/yamnet/tflite/1.tflite"

# YuNet: Fast face detection (ONNX)
YUNET_URL="https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

# FER: Emotion classification (ONNX)
FER_URL="https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx"

download() {
  local url="$1" out="$2"
  if [[ ! -f "$out" ]]; then
    echo "Downloading $(basename "$out")..."
    curl -fL --retry 3 "$url" -o "$out"
  else
    echo "$(basename "$out") already exists, skipping."
  fi
}

mkdir -p "$MODEL_DIR"

download "$YAMNET_URL" "$MODEL_DIR/yamnet.tflite"
download "$YUNET_URL"  "$MODEL_DIR/face_detection_yunet_2023mar.onnx"
download "$FER_URL"    "$MODEL_DIR/fer_mobilenet.onnx"

echo "Calculating SHA256 hashes..."
cd "$MODEL_DIR"
sha256sum yamnet.tflite face_detection_yunet_2023mar.onnx fer_mobilenet.onnx > SHA256SUMS.txt

echo "Models downloaded successfully:"
ls -lh *.tflite *.onnx
