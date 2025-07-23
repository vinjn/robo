// WebLLM Manager - Handles all WebLLM related functionality
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// WebLLM specific variables
let webLLMEngine = null;
let webLLMInitialized = false;
let webLLMInitializing = false;

// WebLLM configuration
const webLLMConfig = {
    model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    availableModels: [
        'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        'Llama-3.2-3B-Instruct-q4f16_1-MLC',
        'Phi-3.5-mini-instruct-q4f16_1-MLC',
        'gemma-2-2b-it-q4f16_1-MLC',
        'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
    ]
};

// Check GPU capabilities
async function checkGPUCapabilities() {
    console.log('Checking GPU capabilities...');
    
    if (!navigator.gpu) {
        console.log('WebGPU not supported');
        return { supported: false, reason: 'WebGPU not available' };
    }
    
    try {
        // Request all available adapters
        const adapters = [];
        
        // Try to get multiple adapters with different power preferences
        const highPerformanceAdapter = await navigator.gpu.requestAdapter({ 
            powerPreference: 'high-performance' 
        });
        const lowPowerAdapter = await navigator.gpu.requestAdapter({ 
            powerPreference: 'low-power' 
        });
        const defaultAdapter = await navigator.gpu.requestAdapter();
        
        // Collect unique adapters
        if (highPerformanceAdapter) adapters.push({ adapter: highPerformanceAdapter, type: 'high-performance' });
        if (lowPowerAdapter && lowPowerAdapter !== highPerformanceAdapter) {
            adapters.push({ adapter: lowPowerAdapter, type: 'low-power' });
        }
        if (defaultAdapter && !adapters.find(a => a.adapter === defaultAdapter)) {
            adapters.push({ adapter: defaultAdapter, type: 'default' });
        }
        
        if (adapters.length === 0) {
            console.log('No WebGPU adapters available');
            return { supported: false, reason: 'No WebGPU adapter' };
        }
        
        console.log(`Found ${adapters.length} GPU adapter(s)`);
        
        // Prefer adapters in this order: NVIDIA > AMD > Intel > Others
        let selectedAdapter = null;
        let selectedType = '';
        
        for (const { adapter, type } of adapters) {
            const vendor = adapter.info?.vendor?.toLowerCase() || '';
            const device = adapter.info?.device || 'Unknown';
            
            console.log(`Adapter (${type}): ${vendor} ${device}`);
            
            if (vendor.includes('nvidia')) {
                selectedAdapter = adapter;
                selectedType = `NVIDIA (${type})`;
                console.log('🚀 Selected NVIDIA GPU for optimal performance');
                break; // NVIDIA is highest priority
            } else if (vendor.includes('amd') && !selectedAdapter) {
                selectedAdapter = adapter;
                selectedType = `AMD (${type})`;
                console.log('🎯 Selected AMD GPU');
            } else if (vendor.includes('intel') && !selectedAdapter) {
                selectedAdapter = adapter;
                selectedType = `Intel (${type})`;
                console.log('⚡ Selected Intel GPU');
            } else if (!selectedAdapter) {
                selectedAdapter = adapter;
                selectedType = `${vendor || 'Unknown'} (${type})`;
                console.log(`📱 Selected ${vendor || 'Unknown'} GPU`);
            }
        }
        
        // Use the selected adapter or fall back to the first one
        const finalAdapter = selectedAdapter || adapters[0].adapter;
        const finalType = selectedType || adapters[0].type;
        
        const device = await finalAdapter.requestDevice();
        console.log('WebGPU device obtained:', device);
        console.log('Selected adapter info:', {
            vendor: finalAdapter.info?.vendor || 'Unknown',
            architecture: finalAdapter.info?.architecture || 'Unknown',
            device: finalAdapter.info?.device || 'Unknown',
            type: finalType
        });
        
        return { 
            supported: true, 
            adapter: finalAdapter.info,
            limits: device.limits,
            selectedType: finalType,
            totalAdapters: adapters.length
        };
    } catch (error) {
        console.error('Failed to get WebGPU device:', error);
        return { supported: false, reason: error.message };
    }
}

// Initialize WebLLM
async function initWebLLM(progressCallback, messageCallback) {
    if (webLLMInitializing || webLLMInitialized) {
        console.log('WebLLM already initializing or initialized');
        return { success: false, reason: 'Already initializing or initialized' };
    }
    
    webLLMInitializing = true;
    console.log('Initializing WebLLM...');
    
    // Check GPU capabilities first
    const gpuInfo = await checkGPUCapabilities();
    console.log('GPU capabilities:', gpuInfo);
    
    try {
        // Create WebLLM engine with GPU acceleration
        const initProgressCallback = (report) => {
            // Update progress in real-time
            if (report.progress !== undefined) {
                const percentage = Math.round(report.progress * 100);
                const statusText = `Loading model... ${percentage}%`;
                
                if (progressCallback) {
                    progressCallback(statusText, percentage);
                }
                
                console.log(`WebLLM loading progress: ${percentage}%`);
            }
            
            // Handle different report types
            if (report.text) {
                console.log('WebLLM status:', report.text);
                
                if (progressCallback) {
                    progressCallback(report.text);
                }
                
                // Check for GPU-related messages
                if (report.text.includes('gpu') || report.text.includes('GPU') || report.text.includes('webgpu')) {
                    console.log('🚀 GPU acceleration detected:', report.text);
                    if (messageCallback) {
                        messageCallback(`🚀 GPU acceleration: ${report.text}`, 'system');
                    }
                }
            }
        };

        // Create engine with explicit configuration for GPU usage
        webLLMEngine = new webllm.MLCEngine();
        
        // Initialize with progress callback and GPU optimization
        await webLLMEngine.reload(webLLMConfig.model, {
            temperature: 0.7,
            top_p: 0.9,
            // Enable GPU acceleration explicitly
            use_cache: true,
            // These settings help with GPU performance
            max_gen_len: 150,
            mean_gen_len: 100,
        }, initProgressCallback);
        
        webLLMInitialized = true;
        webLLMInitializing = false;
        
        console.log('WebLLM initialized successfully');
        
        return {
            success: true,
            gpuInfo: gpuInfo
        };
        
    } catch (error) {
        console.error('Failed to initialize WebLLM:', error);
        webLLMInitializing = false;
        webLLMInitialized = false;
        
        return {
            success: false,
            error: error.message,
            gpuInfo: gpuInfo
        };
    }
}

// Generate response using WebLLM
async function generateWebLLMResponse(userMessage, conversationContext = []) {
    if (!webLLMInitialized) {
        throw new Error('WebLLM not initialized. Please initialize WebLLM first.');
    }
    
    if (!webLLMEngine) {
        throw new Error('WebLLM engine not available');
    }
    
    const systemPrompt = `You are Robo, a friendly and expressive robot assistant. You can perform animations like Wave, Yes, No, ThumbsUp, and Punch. You love to move, dance, and interact with humans. Keep responses conversational, enthusiastic, and under 100 words. Sometimes suggest animations you can do. You have text-to-speech capabilities and can hear users through speech recognition.`;
    
    try {
        // Build conversation with context
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationContext.slice(-8), // Last 4 exchanges to keep context manageable
            { role: 'user', content: userMessage }
        ];
        
        // Generate response using WebLLM
        const response = await webLLMEngine.chat.completions.create({
            messages: messages,
            temperature: 0.7,
            max_tokens: 150,
        });
        
        const text = response.choices[0].message.content.trim();
        
        return {
            text: text,
            animation: extractAnimationFromText(text),
            expression: null
        };
        
    } catch (error) {
        console.error('WebLLM generation error:', error);
        throw new Error(`WebLLM generation failed: ${error.message}`);
    }
}

// Extract animation suggestions from text
function extractAnimationFromText(text) {
    const animations = ['Wave', 'Yes', 'No', 'ThumbsUp', 'Punch'];
    const lowerText = text.toLowerCase();
    
    // Look for animation keywords in the text
    if (lowerText.includes('wave') || lowerText.includes('hello') || lowerText.includes('hi')) {
        return 'Wave';
    }
    if (lowerText.includes('yes') || lowerText.includes('agree') || lowerText.includes('correct')) {
        return 'Yes';
    }
    if (lowerText.includes('no') || lowerText.includes('disagree') || lowerText.includes('wrong')) {
        return 'No';
    }
    if (lowerText.includes('thumbs') || lowerText.includes('good') || lowerText.includes('great') || lowerText.includes('awesome')) {
        return 'ThumbsUp';
    }
    if (lowerText.includes('punch') || lowerText.includes('power') || lowerText.includes('strong') || lowerText.includes('energy')) {
        return 'Punch';
    }
    
    // Random animation for variety
    if (Math.random() < 0.3) {
        return animations[Math.floor(Math.random() * animations.length)];
    }
    
    return null;
}

// Getters for state
function isWebLLMInitialized() {
    return webLLMInitialized;
}

function isWebLLMInitializing() {
    return webLLMInitializing;
}

function getWebLLMConfig() {
    return webLLMConfig;
}

function setWebLLMModel(model) {
    webLLMConfig.model = model;
    // Reset initialization if model changes
    if (webLLMInitialized) {
        webLLMInitialized = false;
        webLLMEngine = null;
    }
}

// Reset WebLLM state
function resetWebLLM() {
    webLLMInitialized = false;
    webLLMInitializing = false;
    webLLMEngine = null;
}

// Export functions
export {
    checkGPUCapabilities,
    initWebLLM,
    generateWebLLMResponse,
    isWebLLMInitialized,
    isWebLLMInitializing,
    getWebLLMConfig,
    setWebLLMModel,
    resetWebLLM
};
