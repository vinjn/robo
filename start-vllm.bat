rem uv pip install vllm --torch-backend=auto

rem https://huggingface.co/collections/Qwen/qwen25-66e81a666513e518adb90d9e

python3 -m vllm.entrypoints.openai.api_server ^
    --model Qwen/Qwen2.5-3B-Instruct ^
    --dtype auto ^
    --trust-remote-code
