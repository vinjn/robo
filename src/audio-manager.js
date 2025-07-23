// Audio Manager for Speech Synthesis and Recognition
// Handles all audio-related functionality for the robot application

// Speech synthesis variables
let speechSynthesis = window.speechSynthesis;
let robotVoice = null;
let isSpeechEnabled = true;
let speechInitialized = false;
let availableVoices = [];

// Speech recognition variables
let speechRecognition = null;
let isListening = false;
let recognitionSupported = false;

// Callback functions for integration with main app
let onSpeechRecognized = null;
let onSystemMessage = null;

/**
 * Get all available voices
 * @returns {Array} Array of available voice objects
 */
function getAvailableVoices() {
    return availableVoices.map(voice => ({
        name: voice.name,
        lang: voice.lang,
        isDefault: voice.default,
        localService: voice.localService
    }));
}

/**
 * Set the robot voice by name
 * @param {string} voiceName - The name of the voice to use
 */
function setRobotVoice(voiceName) {
    const voice = availableVoices.find(v => v.name === voiceName);
    if (voice) {
        robotVoice = voice;
        console.log('Voice changed to:', voice.name);
        updateVoiceSelector();
    }
}

/**
 * Update the voice selector UI
 */
function updateVoiceSelector() {
    const voiceButton = document.getElementById('voiceButton');
    if (voiceButton && robotVoice) {
        // Show short name (remove vendor prefix if present)
        const shortName = robotVoice.name.replace(/^(Microsoft|Google|Apple)\s*/, '').substring(0, 20);
        voiceButton.title = `Current voice: ${robotVoice.name}`;
    }
}

/**
 * Toggle voice selector dropdown
 */
function toggleVoiceSelector() {
    const dropdown = document.getElementById('voiceDropdown');
    if (!dropdown) return;
    
    const isVisible = dropdown.style.display === 'block';
    
    if (isVisible) {
        dropdown.style.display = 'none';
    } else {
        // Populate dropdown with voices
        const voiceList = document.getElementById('voiceList');
        if (voiceList) {
            voiceList.innerHTML = '';
            
            // Group voices by language
            const voicesByLang = {};
            availableVoices.forEach(voice => {
                const langCode = voice.lang.split('-')[0];
                if (!voicesByLang[langCode]) {
                    voicesByLang[langCode] = [];
                }
                voicesByLang[langCode].push(voice);
            });
            
            // Create dropdown items
            Object.keys(voicesByLang).sort().forEach(langCode => {
                const langHeader = document.createElement('div');
                langHeader.className = 'voice-lang-header';
                langHeader.textContent = langCode.toUpperCase();
                voiceList.appendChild(langHeader);
                
                voicesByLang[langCode].forEach(voice => {
                    const voiceItem = document.createElement('div');
                    voiceItem.className = 'voice-item';
                    if (robotVoice && voice.name === robotVoice.name) {
                        voiceItem.classList.add('selected');
                    }
                    
                    voiceItem.innerHTML = `
                        <span class="voice-name">${voice.name}</span>
                        <span class="voice-lang">${voice.lang}</span>
                    `;
                    
                    voiceItem.addEventListener('click', () => {
                        setRobotVoice(voice.name);
                        toggleVoiceSelector();
                    });
                    
                    voiceList.appendChild(voiceItem);
                });
            });
        }
        
        dropdown.style.display = 'block';
    }
}

/**
 * Initialize speech synthesis
 */
function initSpeechSynthesis() {
    // Wait for voices to be loaded
    if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', selectRobotVoice);
    } else {
        selectRobotVoice();
    }
}

/**
 * Select the best available robot voice
 */
function selectRobotVoice() {
    availableVoices = speechSynthesis.getVoices();
    
    // Prefer robot-like or synthetic voices
    const preferredVoices = [
        'Microsoft David - English (United States)',
        'Google UK English Male',
        'Alex',
        'Daniel',
        'Microsoft Mark - English (United States)',
        'Google US English'
    ];
    
    // Try to find a preferred voice
    for (const preferredVoice of preferredVoices) {
        robotVoice = availableVoices.find(voice => voice.name === preferredVoice);
        if (robotVoice) break;
    }
    
    // Fallback to any English male voice
    if (!robotVoice) {
        robotVoice = availableVoices.find(voice => 
            voice.lang.startsWith('en') && 
            (voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('david') || voice.name.toLowerCase().includes('alex'))
        );
    }
    
    // Final fallback to first English voice
    if (!robotVoice) {
        robotVoice = availableVoices.find(voice => voice.lang.startsWith('en')) || availableVoices[0];
    }
    
    console.log('Selected robot voice:', robotVoice ? robotVoice.name : 'Default');
    updateVoiceSelector();
}

/**
 * Initialize speech recognition
 */
function initSpeechRecognition() {
    // Check if speech recognition is supported
    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
        recognitionSupported = true;
    } else if ('SpeechRecognition' in window) {
        speechRecognition = new SpeechRecognition();
        recognitionSupported = true;
    } else {
        console.warn('Speech recognition not supported in this browser');
        recognitionSupported = false;
        const micButton = document.getElementById('micButton');
        if (micButton) {
            micButton.disabled = true;
            micButton.title = 'Speech recognition not supported';
            micButton.textContent = '🚫';
        }
        return;
    }
    
    // Configure speech recognition
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'en-US';
    speechRecognition.maxAlternatives = 1;
    
    // Event handlers
    speechRecognition.onstart = function() {
        console.log('Speech recognition started');
        isListening = true;
        updateMicButton();
    };
    
    speechRecognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        console.log('Speech recognized:', transcript);
        
        // Notify the main app about the recognized speech
        if (onSpeechRecognized) {
            onSpeechRecognized(transcript);
        }
    };
    
    speechRecognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        isListening = false;
        updateMicButton();
        
        // Show user-friendly error messages
        let errorMessage = 'Speech recognition error: ';
        switch(event.error) {
            case 'no-speech':
                errorMessage += 'No speech detected. Please try again.';
                break;
            case 'audio-capture':
                errorMessage += 'Microphone not accessible.';
                break;
            case 'not-allowed':
                errorMessage += 'Microphone permission denied.';
                break;
            case 'network':
                errorMessage += 'Network error occurred.';
                break;
            default:
                errorMessage += event.error;
        }
        
        if (onSystemMessage) {
            onSystemMessage(errorMessage, 'system');
        }
    };
    
    speechRecognition.onend = function() {
        console.log('Speech recognition ended');
        isListening = false;
        updateMicButton();
    };
    
    console.log('Speech recognition initialized');
}

/**
 * Toggle speech recognition on/off
 */
function toggleSpeechRecognition() {
    if (!recognitionSupported) {
        if (onSystemMessage) {
            onSystemMessage('Speech recognition is not supported in this browser.', 'system');
        }
        return;
    }
    
    if (isListening) {
        // Stop listening
        speechRecognition.stop();
        console.log('Stopping speech recognition');
    } else {
        // Start listening
        try {
            speechRecognition.start();
            console.log('Starting speech recognition');
            if (onSystemMessage) {
                onSystemMessage('🎤 Listening... Speak now!', 'system');
            }
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            if (onSystemMessage) {
                onSystemMessage('Failed to start speech recognition. Please try again.', 'system');
            }
        }
    }
}

/**
 * Update microphone button appearance
 */
function updateMicButton() {
    const micButton = document.getElementById('micButton');
    if (!micButton) return;
    
    if (isListening) {
        micButton.classList.add('listening');
        micButton.title = 'Stop listening';
        micButton.textContent = '🔴';
    } else {
        micButton.classList.remove('listening');
        micButton.title = 'Start voice input';
        micButton.textContent = '🎤';
    }
}

/**
 * Speak text using speech synthesis
 * @param {string} text - The text to speak
 */
function speakText(text) {
    if (!isSpeechEnabled || !text) return;
    
    // Initialize speech on first use (requires user interaction)
    if (!speechInitialized) {
        try {
            // Test if speech synthesis is available and allowed
            const testUtterance = new SpeechSynthesisUtterance('');
            speechSynthesis.speak(testUtterance);
            speechSynthesis.cancel(); // Cancel the empty utterance
            speechInitialized = true;
        } catch (error) {
            console.warn('Speech synthesis not available:', error);
            return;
        }
    }
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice properties
    if (robotVoice) {
        utterance.voice = robotVoice;
    }
    
    utterance.rate = 0.9; // Slightly slower for robot effect
    utterance.pitch = 0.8; // Lower pitch for robot voice
    utterance.volume = 0.8;
    
    // Add some robot-like pauses for longer texts
    if (text.length > 50) {
        utterance.rate = 0.8;
    }
    
    // Error handling
    utterance.onerror = function(event) {
        console.error('Speech synthesis error:', event.error);
        if (event.error === 'not-allowed') {
            console.warn('Speech synthesis blocked. User interaction required first.');
            isSpeechEnabled = false;
            // Update UI to show speech is disabled
            const speechToggle = document.getElementById('speechToggle');
            if (speechToggle) {
                speechToggle.textContent = '🔇';
                speechToggle.title = 'Speech blocked - click to enable';
                speechToggle.classList.add('disabled');
            }
        }
    };
    
    utterance.onstart = function() {
        console.log('Robot started speaking:', text);
        speechInitialized = true;
    };
    
    utterance.onend = function() {
        console.log('Robot finished speaking');
    };
    
    try {
        speechSynthesis.speak(utterance);
    } catch (error) {
        console.error('Failed to speak:', error);
    }
}

/**
 * Toggle speech synthesis on/off
 */
function toggleSpeech() {
    isSpeechEnabled = !isSpeechEnabled;
    
    if (!isSpeechEnabled) {
        speechSynthesis.cancel();
    } else {
        // Initialize speech synthesis when enabled
        if (!speechInitialized) {
            try {
                // Test speech synthesis with user interaction
                const testUtterance = new SpeechSynthesisUtterance('Speech enabled');
                testUtterance.volume = 0.1; // Very quiet test
                testUtterance.rate = 2; // Very fast
                speechSynthesis.speak(testUtterance);
                speechInitialized = true;
                console.log('Speech synthesis initialized');
            } catch (error) {
                console.warn('Could not initialize speech synthesis:', error);
                isSpeechEnabled = false;
            }
        }
    }
    
    // Update UI
    const speechToggle = document.getElementById('speechToggle');
    if (speechToggle) {
        speechToggle.textContent = isSpeechEnabled ? '🔊' : '🔇';
        speechToggle.title = isSpeechEnabled ? 'Disable Speech' : 'Enable Speech';
        speechToggle.classList.toggle('disabled', !isSpeechEnabled);
    }
    
    return isSpeechEnabled;
}

/**
 * Initialize audio manager and set up event listeners
 * @param {Object} callbacks - Callback functions for integration
 * @param {Function} callbacks.onSpeechRecognized - Called when speech is recognized
 * @param {Function} callbacks.onSystemMessage - Called to display system messages
 */
function initAudioManager(callbacks = {}) {
    // Store callbacks
    onSpeechRecognized = callbacks.onSpeechRecognized;
    onSystemMessage = callbacks.onSystemMessage;
    
    // Initialize speech features
    initSpeechSynthesis();
    initSpeechRecognition();
    
    // Set up event listeners
    setupAudioEventListeners();
    
    console.log('Audio manager initialized');
}

/**
 * Set up event listeners for audio controls
 */
function setupAudioEventListeners() {
    const speechToggle = document.getElementById('speechToggle');
    const micButton = document.getElementById('micButton');
    const voiceButton = document.getElementById('voiceButton');
    
    // Speech toggle event listener
    if (speechToggle) {
        speechToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const enabled = toggleSpeech();
            console.log('Speech toggled:', enabled ? 'enabled' : 'disabled');
        });
    } else {
        console.error('speechToggle not found');
    }
    
    // Microphone button event listener
    if (micButton) {
        micButton.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSpeechRecognition();
        });
    } else {
        console.error('micButton not found');
    }
    
    // Voice selector button event listener
    if (voiceButton) {
        voiceButton.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleVoiceSelector();
        });
    } else {
        console.error('voiceButton not found');
    }
    
    // Close voice dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('voiceDropdown');
        const voiceButton = document.getElementById('voiceButton');
        
        if (dropdown && voiceButton && 
            !dropdown.contains(e.target) && 
            !voiceButton.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

/**
 * Get current speech state
 * @returns {Object} Current audio state
 */
function getAudioState() {
    return {
        isSpeechEnabled,
        speechInitialized,
        isListening,
        recognitionSupported,
        hasRobotVoice: !!robotVoice
    };
}

/**
 * Set speech enabled state
 * @param {boolean} enabled - Whether speech should be enabled
 */
function setSpeechEnabled(enabled) {
    if (enabled !== isSpeechEnabled) {
        toggleSpeech();
    }
}

// Export functions for use in main application
export {
    initAudioManager,
    speakText,
    toggleSpeech,
    toggleSpeechRecognition,
    getAudioState,
    setSpeechEnabled,
    updateMicButton,
    getAvailableVoices,
    setRobotVoice,
    toggleVoiceSelector
};
