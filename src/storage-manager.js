// Storage Manager for Local Storage Operations
// Handles all localStorage functionality for the robot application

/**
 * Storage keys used by the application
 */
const STORAGE_KEYS = {
    VOICE_PREFERENCE: 'robotVoicePreference',
    ROBOT_COLOR: 'robotColor',
    SPEECH_ENABLED: 'speechEnabled'
};

/**
 * Generic function to save a value to localStorage
 * @param {string} key - The storage key
 * @param {any} value - The value to save
 * @param {string} description - Description for logging
 */
function saveToStorage(key, value, description) {
    try {
        localStorage.setItem(key, value);
        console.log(`${description} saved:`, value);
    } catch (error) {
        console.warn(`Failed to save ${description.toLowerCase()}:`, error);
    }
}

/**
 * Generic function to load a value from localStorage
 * @param {string} key - The storage key
 * @param {string} description - Description for logging
 * @returns {string|null} The saved value or null if not found
 */
function loadFromStorage(key, description) {
    try {
        const savedValue = localStorage.getItem(key);
        if (savedValue) {
            console.log(`Loaded ${description.toLowerCase()}:`, savedValue);
            return savedValue;
        }
    } catch (error) {
        console.warn(`Failed to load ${description.toLowerCase()}:`, error);
    }
    return null;
}

/**
 * Save voice preference to localStorage
 * @param {string} voiceName - The name of the voice to save
 */
function saveVoicePreference(voiceName) {
    saveToStorage(STORAGE_KEYS.VOICE_PREFERENCE, voiceName, 'Voice preference');
}

/**
 * Load voice preference from localStorage
 * @returns {string|null} The saved voice name or null if not found
 */
function loadVoicePreference() {
    return loadFromStorage(STORAGE_KEYS.VOICE_PREFERENCE, 'Voice preference');
}

/**
 * Save robot color preference to localStorage
 * @param {string} color - The color hex code to save
 */
function saveRobotColor(color) {
    saveToStorage(STORAGE_KEYS.ROBOT_COLOR, color, 'Robot color');
}

/**
 * Load robot color preference from localStorage
 * @returns {string|null} The saved color or null if not found
 */
function loadRobotColor() {
    return loadFromStorage(STORAGE_KEYS.ROBOT_COLOR, 'Robot color');
}

/**
 * Save speech enabled state to localStorage
 * @param {boolean} enabled - Whether speech is enabled
 */
function saveSpeechEnabled(enabled) {
    saveToStorage(STORAGE_KEYS.SPEECH_ENABLED, enabled.toString(), 'Speech enabled state');
}

/**
 * Load speech enabled state from localStorage
 * @returns {boolean|null} The saved state or null if not found
 */
function loadSpeechEnabled() {
    const savedState = loadFromStorage(STORAGE_KEYS.SPEECH_ENABLED, 'Speech enabled state');
    if (savedState !== null) {
        return savedState === 'true';
    }
    return null;
}

/**
 * Clear a specific preference from localStorage
 * @param {string} key - The storage key to clear
 */
function clearPreference(key) {
    try {
        localStorage.removeItem(key);
        console.log('Cleared preference:', key);
    } catch (error) {
        console.warn('Failed to clear preference:', key, error);
    }
}

/**
 * Clear all application preferences from localStorage
 */
function clearAllPreferences() {
    try {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        console.log('All preferences cleared');
    } catch (error) {
        console.warn('Failed to clear all preferences:', error);
    }
}

/**
 * Get all stored preferences
 * @returns {Object} Object containing all stored preferences
 */
function getAllPreferences() {
    const preferences = {};
    
    try {
        Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
            const value = localStorage.getItem(key);
            if (value !== null) {
                preferences[name.toLowerCase()] = value;
            }
        });
        console.log('Retrieved all preferences:', preferences);
    } catch (error) {
        console.warn('Failed to retrieve preferences:', error);
    }
    
    return preferences;
}

/**
 * Check if localStorage is available
 * @returns {boolean} True if localStorage is available
 */
function isStorageAvailable() {
    try {
        const test = '__storage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (error) {
        console.warn('localStorage not available:', error);
        return false;
    }
}

// Export functions for use in other modules
export {
    STORAGE_KEYS,
    saveVoicePreference,
    loadVoicePreference,
    saveRobotColor,
    loadRobotColor,
    saveSpeechEnabled,
    loadSpeechEnabled,
    clearPreference,
    clearAllPreferences,
    getAllPreferences,
    isStorageAvailable
};
