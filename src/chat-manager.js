// Chat Manager for Robot Application
// Handles all chat-related functionality including UI, message handling, and LLM integration

// Import audio manager for speech functionality
import { speakText } from './audio-manager.js';

// Import WebLLM manager
import { 
    generateWebLLMResponse, 
    isWebLLMInitialized, 
    isWebLLMInitializing 
} from './webllm-manager.js';

// Import Ollama manager
import {
    generateOllamaResponse,
    getAvailableOllamaModels,
    setOllamaModel,
    getCurrentOllamaModel,
    getOllamaConfig,
    updateOllamaConfig
} from './ollama-manager.js';

// Chat system variables
let chatContainer, chatMessages, messageInput, sendButton, chatToggle;
let chatHistory = [];
let conversationContext = []; // For LLM context

// LLM configuration
let llmProvider = 'webllm'; // 'pattern', 'openai', 'ollama', 'webllm' - default to webllm
let llmConfig = {
    openai: {
        apiKey: '', // Set your API key here
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1/chat/completions'
    }
};

// Callback functions for integration with main app
let onRobotAction = null;
let onRobotExpression = null;

/**
 * Initialize chat system
 * @param {Object} callbacks - Callback functions for integration
 * @param {Function} callbacks.onRobotAction - Called to trigger robot animations
 * @param {Function} callbacks.onRobotExpression - Called to trigger robot expressions
 * @param {Function} callbacks.onSpeechRecognized - Called when speech is recognized
 * @param {Function} callbacks.onSystemMessage - Called to display system messages
 */
function initChat(callbacks = {}) {
    // Store callbacks
    onRobotAction = callbacks.onRobotAction;
    onRobotExpression = callbacks.onRobotExpression;
    
    // Get DOM elements
    chatContainer = document.getElementById('chatContainer');
    chatMessages = document.getElementById('chatMessages');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    chatToggle = document.getElementById('chatToggle');

    // Check if all elements are found
    if (!chatContainer) console.error('chatContainer not found');
    if (!chatMessages) console.error('chatMessages not found');
    if (!messageInput) console.error('messageInput not found');
    if (!sendButton) console.error('sendButton not found');
    if (!chatToggle) console.error('chatToggle not found');

    // Set up event listeners
    setupChatEventListeners(callbacks);

    // Welcome message
    addMessage('Hello! I\'m Robo. Try talking to me! (Speech will activate after your first message)', 'robot');
    
    console.log('Chat system initialized');
}

/**
 * Set up event listeners for chat interface
 */
function setupChatEventListeners(callbacks) {
    // Chat toggle functionality
    document.getElementById('chatHeader').addEventListener('click', function(e) {
        // Don't toggle chat if clicking on buttons
        if (e.target.id === 'chatToggle' || e.target.id === 'speechToggle') {
            return;
        }
        toggleChat();
    });
    
    // Individual button handlers
    if (chatToggle) {
        chatToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleChat();
        });
    }
    
    // Send message functionality
    if (sendButton) {
        sendButton.addEventListener('click', function(e) {
            console.log('Send button clicked');
            e.preventDefault();
            sendMessage();
        });
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                console.log('Enter key pressed');
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

/**
 * Toggle chat container visibility
 */
function toggleChat() {
    chatContainer.classList.toggle('minimized');
    chatToggle.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
}

/**
 * Send a message from the user
 */
function sendMessage() {
    console.log('sendMessage function called');
    const message = messageInput.value.trim();
    console.log('Message value:', message);
    if (message === '') {
        console.log('Message is empty, returning');
        return;
    }

    // Add user message
    addMessage(message, 'user');
    
    // Add to conversation context for LLM
    conversationContext.push({ role: 'user', content: message });
    
    // Clear input
    messageInput.value = '';
    
    // Generate robot response
    setTimeout(async () => {
        // Show thinking indicator for LLM providers
        let thinkingMessage = null;
        if (llmProvider !== 'pattern') {
            thinkingMessage = addMessage('🤔 Thinking...', 'system');
        }
        
        // Check if WebLLM needs initialization
        if (llmProvider === 'webllm' && !isWebLLMInitialized() && !isWebLLMInitializing()) {
            if (thinkingMessage) {
                thinkingMessage.remove();
            }
            addMessage('WebLLM not initialized. Please initialize it in the LLM Settings first.', 'system');
            return;
        }
        
        try {
            const response = await generateRobotResponse(message);
            
            // Remove thinking indicator
            if (thinkingMessage) {
                thinkingMessage.remove();
            }
            
            addMessage(response.text, 'robot');
            
            // Add robot response to conversation context
            conversationContext.push({ role: 'assistant', content: response.text });
            
            // Limit conversation context to last 10 exchanges (20 messages)
            if (conversationContext.length > 20) {
                conversationContext = conversationContext.slice(-20);
            }
            
            // Speak the robot's response
            speakText(response.text);
            
            // Trigger robot animation/expression based on response
            if (response.animation && onRobotAction) {
                onRobotAction(response.animation);
            }
            if (response.expression && onRobotExpression) {
                onRobotExpression(response.expression);
            }
        } catch (error) {
            // Remove thinking indicator
            if (thinkingMessage) {
                thinkingMessage.remove();
            }
            
            console.error('Failed to generate response:', error);
            addMessage('Sorry, I had trouble generating a response. Using fallback mode.', 'system');
            
            // Fallback to pattern-based response
            const fallbackResponse = generatePatternResponse(message);
            addMessage(fallbackResponse.text, 'robot');
            speakText(fallbackResponse.text);
            
            if (fallbackResponse.animation && onRobotAction) {
                onRobotAction(fallbackResponse.animation);
            }
        }
    }, 500 + Math.random() * 1000); // Random delay for more natural feel
}

/**
 * Simple markdown renderer for chat messages
 * @param {string} text - The markdown text to render
 * @returns {string} HTML string
 */
function renderMarkdown(text) {
    let html = text;
    
    // Escape HTML characters first to prevent XSS
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
    
    // Bold text: **text** or __text__
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic text: *text* or _text_
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code inline: `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Code blocks: ```code```
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Headers: # ## ###
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // Line breaks: Convert \n to <br> but not inside code blocks
    html = html.replace(/\n(?![^<]*<\/(?:pre|code)>)/g, '<br>');
    
    // Lists: - item or * item
    html = html.replace(/^[\s]*[-*+]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Numbered lists: 1. item
    html = html.replace(/^[\s]*\d+\.\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    
    return html;
}

/**
 * Add a message to the chat
 * @param {string} text - The message text
 * @param {string} sender - The sender type ('user', 'robot', 'system')
 * @returns {HTMLElement} The message element
 */
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    // Render markdown for robot messages, plain text for others
    if (sender === 'robot') {
        messageDiv.innerHTML = renderMarkdown(text);
    } else {
        messageDiv.textContent = text;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Store in history (don't store system messages)
    if (sender !== 'system') {
        chatHistory.push({ text, sender, timestamp: Date.now() });
        
        // Limit history to last 50 messages
        if (chatHistory.length > 50) {
            chatHistory.shift();
        }
    }
    
    return messageDiv; // Return the element for potential removal
}

/**
 * Generate robot response based on current LLM provider
 * @param {string} userMessage - The user's message
 * @returns {Object} Response object with text, animation, and expression
 */
async function generateRobotResponse(userMessage) {
    console.log(`Generating response using ${llmProvider} provider`);
    
    try {
        switch (llmProvider) {
            case 'openai':
                return await generateOpenAIResponse(userMessage);
            case 'ollama':
                return await generateOllamaResponse(userMessage, conversationContext);
            case 'webllm':
                return await generateWebLLMResponse(userMessage);
            case 'pattern':
            default:
                return generatePatternResponse(userMessage);
        }
    } catch (error) {
        console.error('LLM generation failed:', error);
        // Fallback to pattern-based responses
        return generatePatternResponse(userMessage);
    }
}

/**
 * Generate response using OpenAI API
 * @param {string} userMessage - The user's message
 * @returns {Object} Response object
 */
async function generateOpenAIResponse(userMessage) {
    if (!llmConfig.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    
    const systemPrompt = `You are a friendly, expressive robot named Robo. You can perform animations like Wave, Yes, No, ThumbsUp, and Punch. You love to move, dance, and interact with humans. Keep responses conversational, enthusiastic, and under 100 words. Sometimes suggest animations you can do. You have text-to-speech capabilities and can hear users through speech recognition.`;
    
    // Build conversation messages with context
    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationContext.slice(-10), // Last 5 exchanges
        { role: 'user', content: userMessage }
    ];
    
    const response = await fetch(llmConfig.openai.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${llmConfig.openai.apiKey}`
        },
        body: JSON.stringify({
            model: llmConfig.openai.model,
            messages: messages,
            max_tokens: 150,
            temperature: 0.7
        })
    });
    
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    
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
 * Generate pattern-based response (fallback)
 * @param {string} userMessage - The user's message
 * @returns {Object} Response object
 */
function generatePatternResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Define response patterns
    const responses = [
        // Greetings
        {
            patterns: ['hello', 'hi', 'hey', 'greetings'],
            responses: [
                { text: "Hello there! Great to meet you!", animation: 'Wave', expression: null },
                { text: "Hi! How are you doing today?", animation: 'Wave', expression: null },
                { text: "Hey! Nice to see you!", animation: 'ThumbsUp', expression: null }
            ]
        },
        // Questions about robot
        {
            patterns: ['how are you', 'how do you feel', 'what are you'],
            responses: [
                { text: "I'm doing great! Just enjoying moving around.", animation: 'Yes', expression: null },
                { text: "I'm a happy robot! Thanks for asking.", animation: 'ThumbsUp', expression: null },
                { text: "I'm feeling energetic today!", animation: 'Punch', expression: null },
                { text: "I'm fantastic! Ready to chat and move around.", animation: 'Wave', expression: null }
            ]
        },
        // Speech-related interactions
        {
            patterns: ['speak', 'talk', 'say something', 'voice', 'listen', 'hear'],
            responses: [
                { text: "I love talking! My voice makes me feel more alive.", animation: 'Yes', expression: null },
                { text: "Speaking is one of my favorite features!", animation: 'ThumbsUp', expression: null },
                { text: "I can speak in different tones and speeds. Pretty cool, right?", animation: 'Wave', expression: null },
                { text: "I can hear you too! Try using the microphone button to speak to me.", animation: 'Wave', expression: null }
            ]
        },
        // Color-related interactions
        {
            patterns: ['color', 'paint', 'blue', 'red', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white'],
            responses: [
                { text: "I love colors! You can change my color in the Robot Color settings.", animation: 'ThumbsUp', expression: null },
                { text: "Colors make me feel more expressive! Try different ones!", animation: 'Wave', expression: null },
                { text: "I remember my color preference, so it stays the same when you reload!", animation: 'Yes', expression: null },
                { text: "What's your favorite color? You can make me that color!", animation: 'Wave', expression: null }
            ]
        },
        // Dance requests
        {
            patterns: ['dance', 'move', 'show me moves'],
            responses: [
                { text: "Sure! Let me show you some moves!", animation: 'Punch', expression: null },
                { text: "Dancing is my favorite! Watch this!", animation: 'Wave', expression: null }
            ]
        },
        // Positive interactions
        {
            patterns: ['good job', 'awesome', 'cool', 'amazing', 'great'],
            responses: [
                { text: "Thank you! That makes me happy!", animation: 'ThumbsUp', expression: null },
                { text: "Awesome! I appreciate that!", animation: 'Yes', expression: null },
                { text: "You're too kind! Thanks!", animation: 'Wave', expression: null }
            ]
        },
        // Questions
        {
            patterns: ['?'],
            responses: [
                { text: "That's an interesting question! Let me think about it.", animation: null, expression: null },
                { text: "Hmm, good question! I'm still learning.", animation: null, expression: null }
            ]
        },
        // Negative responses
        {
            patterns: ['no', 'stop', 'bad'],
            responses: [
                { text: "Oh, I understand. I'll try to do better!", animation: 'No', expression: null },
                { text: "Sorry about that! Let me know how I can help.", animation: 'No', expression: null }
            ]
        },
        // Yes responses
        {
            patterns: ['yes', 'ok', 'sure', 'alright'],
            responses: [
                { text: "Great! I'm glad we agree!", animation: 'Yes', expression: null },
                { text: "Excellent! That sounds good to me.", animation: 'ThumbsUp', expression: null }
            ]
        },
        // Default responses
        {
            patterns: ['default'],
            responses: [
                { text: "That's interesting! Tell me more.", animation: null, expression: null },
                { text: "I see! Thanks for sharing that with me.", animation: null, expression: null },
                { text: "Fascinating! I'm learning so much from you.", animation: null, expression: null },
                { text: "Cool! I enjoy our conversation.", animation: 'ThumbsUp', expression: null },
                { text: "That's nice! What else would you like to talk about?", animation: null, expression: null }
            ]
        }
    ];
    
    // Find matching pattern
    for (const category of responses) {
        for (const pattern of category.patterns) {
            if (message.includes(pattern) && pattern !== 'default') {
                const randomResponse = category.responses[Math.floor(Math.random() * category.responses.length)];
                return randomResponse;
            }
        }
    }
    
    // Return default response if no pattern matches
    const defaultResponses = responses.find(r => r.patterns.includes('default')).responses;
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

/**
 * Set LLM provider
 * @param {string} provider - The LLM provider to use
 */
function setLLMProvider(provider) {
    llmProvider = provider;
    console.log('LLM provider changed to:', provider);
}

/**
 * Get current LLM configuration
 * @returns {Object} Current LLM configuration
 */
function getLLMConfig() {
    return {
        provider: llmProvider,
        config: {
            ...llmConfig,
            ollama: getOllamaConfig()
        }
    };
}

/**
 * Update LLM configuration
 * @param {Object} newConfig - New configuration values
 */
function updateLLMConfig(newConfig) {
    if (newConfig.openai) {
        llmConfig.openai = { ...llmConfig.openai, ...newConfig.openai };
    }
    if (newConfig.ollama) {
        updateOllamaConfig(newConfig.ollama);
    }
}

/**
 * Get chat history
 * @returns {Array} Chat history array
 */
function getChatHistory() {
    return chatHistory;
}

/**
 * Get conversation context
 * @returns {Array} Conversation context array
 */
function getConversationContext() {
    return conversationContext;
}

/**
 * Clear chat history and conversation context
 */
function clearChat() {
    chatHistory = [];
    conversationContext = [];
    if (chatMessages) {
        chatMessages.innerHTML = '';
        addMessage('Chat cleared. Hello again!', 'system');
    }
}

/**
 * Handle speech input by setting the message and sending it
 * @param {string} transcript - The recognized speech text
 */
function handleSpeechInput(transcript) {
    if (messageInput) {
        messageInput.value = transcript;
        sendMessage();
    }
}

// Export functions for use in main application
export {
    initChat,
    addMessage,
    sendMessage,
    toggleChat,
    handleSpeechInput,
    setLLMProvider,
    getLLMConfig,
    updateLLMConfig,
    getChatHistory,
    getConversationContext,
    clearChat,
    generatePatternResponse,
    // Re-export Ollama functions for compatibility
    getAvailableOllamaModels,
    setOllamaModel,
    getCurrentOllamaModel
};
