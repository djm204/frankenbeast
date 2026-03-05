#!/usr/bin/env bash
set -euo pipefail
echo "=== Pulling models for Local Model Gallery ==="
models=("llama3.2" "mistral" "qwen2.5" "codellama")
for model in "${models[@]}"; do
  echo "Pulling $model..."
  ollama pull "$model"
done
echo "All models pulled. Run: npx tsx src/main.ts"
