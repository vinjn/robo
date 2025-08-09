// Ollama Manager - Handles all Ollama related functionality
// Manages Ollama configuration, model selection, and API communication

// Ollama configuration
let ollamaConfig = {
    endpoint: 'http://localhost:11434/api/generate',
    model: 'gemma3:4b',
    availableModels: [
        'gpt-oss:120b',
        'gpt-oss:20b', 
        'gemma3:4b',
        'gemma2:1b',
        'gemma2:12b',
        'gemma2:27b',
        'deepseek-r1:8b',
    ]
};

/**
 * Generate response using Ollama API
 * @param {string} userMessage - The user's message
 * @param {Array} conversationContext - Previous conversation context
 * @returns {Object} Response object
 */
async function generateOllamaResponse(userMessage, conversationContext = []) {
    const systemPrompt = `You are Robo, a friendly robot assistant. You can perform animations: Wave, Yes, No, ThumbsUp, Punch. Be enthusiastic and conversational. Keep responses under 100 words.`;
    
    // Build context from conversation history
    let contextPrompt = systemPrompt;
    if (conversationContext.length > 0) {
        const lastExchanges = conversationContext.slice(-6); // Last 3 exchanges
        for (const exchange of lastExchanges) {
            if (exchange.role === 'user') {
                contextPrompt += `\n\nHuman: ${exchange.content}`;
            } else if (exchange.role === 'assistant') {
                contextPrompt += `\nRobo: ${exchange.content}`;
            }
        }
    }
    
    const response = await fetch(ollamaConfig.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: ollamaConfig.model,
            prompt: `${contextPrompt}\n\nHuman: ${userMessage}\n\nRobo:`,
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 150
            }
        })
    });
    
    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    const text = data.response.trim();
    
    return {
        text: text,
        animation: extractAnimationFromText(text),
        expression: null
    };
}

/**
 * Extract animation keywords from text
 * @param {string} text - The text to analyze
 * @returns {string|null} Animation name or null
 */
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

/**
 * Get available Ollama models
 * @returns {Array} Array of available Ollama models
 */
function getAvailableOllamaModels() {
    return ollamaConfig.availableModels;
}

/**
 * Set Ollama model
 * @param {string} model - The model name to set
 * @returns {boolean} Success status
 */
function setOllamaModel(model) {
    if (ollamaConfig.availableModels.includes(model)) {
        ollamaConfig.model = model;
        console.log('Ollama model changed to:', model);
        return true;
    } else {
        console.error('Invalid Ollama model:', model);
        return false;
    }
}

/**
 * Get current Ollama model
 * @returns {string} Current Ollama model
 */
function getCurrentOllamaModel() {
    return ollamaConfig.model;
}

/**
 * Set Ollama endpoint
 * @param {string} endpoint - The endpoint URL
 */
function setOllamaEndpoint(endpoint) {
    ollamaConfig.endpoint = endpoint;
    console.log('Ollama endpoint changed to:', endpoint);
}

/**
 * Get current Ollama endpoint
 * @returns {string} Current Ollama endpoint
 */
function getOllamaEndpoint() {
    return ollamaConfig.endpoint;
}

/**
 * Get Ollama configuration
 * @returns {Object} Current Ollama configuration
 */
function getOllamaConfig() {
    return { ...ollamaConfig };
}

/**
 * Update Ollama configuration
 * @param {Object} newConfig - New configuration values
 */
function updateOllamaConfig(newConfig) {
    ollamaConfig = { ...ollamaConfig, ...newConfig };
    console.log('Ollama configuration updated:', ollamaConfig);
}

/**
 * Test Ollama connection
 * @returns {Promise<Object>} Connection test result
 */
async function testOllamaConnection() {
    try {
        const response = await fetch(ollamaConfig.endpoint.replace('/api/generate', '/api/tags'), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                models: data.models || [],
                message: 'Connected to Ollama successfully'
            };
        } else {
            return {
                success: false,
                message: `Failed to connect: ${response.status} ${response.statusText}`
            };
        }
    } catch (error) {
        return {
            success: false,
            message: `Connection error: ${error.message}`
        };
    }
}

/**
 * Create a dropdown menu for Ollama models
 * @param {HTMLElement} container - The container element to append the dropdown to
 * @param {string} id - The ID for the dropdown element
 * @returns {HTMLSelectElement} The created dropdown element
 */
function createOllamaModelDropdown(container, id = 'ollamaModelSelect') {
    // Create dropdown container
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'model-dropdown-container';
    
    // Create label
    const label = document.createElement('label');
    label.textContent = 'Ollama Model:';
    label.htmlFor = id;
    label.className = 'model-dropdown-label';
    
    // Create select element
    const select = document.createElement('select');
    select.id = id;
    select.className = 'model-dropdown-select';
    
    // Populate with available models
    const availableModels = getAvailableOllamaModels();
    const currentModel = getCurrentOllamaModel();
    
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        
        // Set selected if this is the current model
        if (model === currentModel) {
            option.selected = true;
        }
        
        select.appendChild(option);
    });
    
    // Add change event listener
    select.addEventListener('change', (e) => {
        const selectedModel = e.target.value;
        const success = setOllamaModel(selectedModel);
        
        if (success) {
            // Optional: Show confirmation message
            console.log(`Ollama model changed to: ${selectedModel}`);
            
            // Visual feedback
            select.style.borderColor = '#4CAF50';
            setTimeout(() => {
                select.style.borderColor = '';
            }, 1000);
        } else {
            // Revert selection if model change failed
            select.value = getCurrentOllamaModel();
        }
    });
    
    // Append elements to container
    dropdownContainer.appendChild(label);
    dropdownContainer.appendChild(select);
    container.appendChild(dropdownContainer);
    
    return select;
}

/**
 * Update Ollama model dropdown selection
 * @param {string} dropdownId - The ID of the dropdown element
 * @param {string} model - The model to select
 */
function updateOllamaModelDropdown(dropdownId = 'ollamaModelSelect', model = null) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        const modelToSelect = model || getCurrentOllamaModel();
        dropdown.value = modelToSelect;
    }
}

// Export functions
export {
    generateOllamaResponse,
    getAvailableOllamaModels,
    setOllamaModel,
    getCurrentOllamaModel,
    setOllamaEndpoint,
    getOllamaEndpoint,
    getOllamaConfig,
    updateOllamaConfig,
    testOllamaConnection,
    createOllamaModelDropdown,
    updateOllamaModelDropdown
};
