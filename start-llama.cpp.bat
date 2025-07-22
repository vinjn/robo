rem winget install llama.cpp

rem SET MODEL=Qwen/Qwen3-4B-GGUF
SET MODEL=ggml-org/gemma-3-1b-it-GGUF
rem llama-cli -hf %MODEL%
llama-server -hf %MODEL% --port 8080

rem http://localhost:8080