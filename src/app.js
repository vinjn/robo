import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Import WebLLM manager
import {
    initWebLLM,
    generateWebLLMResponse,
    isWebLLMInitialized,
    isWebLLMInitializing,
    getWebLLMConfig,
    setWebLLMModel,
    resetWebLLM
} from './webllm-manager.js';

// Import Audio manager
import {
    initAudioManager,
    speakText,
    toggleSpeech,
    toggleSpeechRecognition,
    getAudioState,
    setSpeechEnabled
} from './audio-manager.js';

let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face;

const api = { state: 'Idle', robotColor: '#ffffff' };

// Timer variables
let timerCallback;
let states; // Make states accessible globally
let emotes; // Make emotes accessible globally
let expressions; // Make expressions accessible globally

// Chat system variables
let chatContainer, chatMessages, messageInput, sendButton, chatToggle;
let chatHistory = [];
let conversationContext = []; // For LLM context

// LLM inference variables
let llmProvider = 'pattern'; // 'pattern', 'openai', 'ollama', 'webllm'
let llmConfig = {
    openai: {
        apiKey: '', // Set your API key here
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    ollama: {
        endpoint: 'http://localhost:11434/api/generate',
        model: 'llama2'
    }
};

async function initWebLLMWithUI() {
    // Update status
    if (window.webllmControls) {
        window.webllmControls.status = 'Checking GPU...';
    }
    
    // Add system message about initialization
    const progressMessage = addMessage('🤖 Initializing WebLLM... Checking GPU capabilities...', 'system');
    
    const progressCallback = (statusText, percentage) => {
        // Update status in GUI
        if (window.webllmControls) {
            window.webllmControls.status = statusText;
        }
        
        // Update progress message in chat
        if (progressMessage) {
            if (percentage !== undefined) {
                progressMessage.textContent = `🤖 ${statusText}`;
            } else {
                progressMessage.textContent = `🤖 ${statusText}`;
            }
        }
    };
    
    const messageCallback = (message, type) => {
        addMessage(message, type);
    };
    
    const result = await initWebLLM(progressCallback, messageCallback);
    
    if (result.success) {
        const gpuInfo = result.gpuInfo;
        
        // Update status
        if (window.webllmControls) {
            window.webllmControls.status = gpuInfo.supported ? 'Ready (GPU)' : 'Ready (CPU)';
        }
        
        // Update progress message to show completion
        if (progressMessage) {
            const gpuStatus = gpuInfo.supported ? '🚀 GPU-accelerated' : '🖥️ CPU-based';
            progressMessage.textContent = `✅ WebLLM initialized! ${gpuStatus} AI ready for chat.`;
            progressMessage.className = 'message system-message success';
        }
        
        // Show GPU info
        if (gpuInfo.supported && gpuInfo.adapter) {
            const gpuName = `${gpuInfo.adapter.vendor || 'Unknown'} ${gpuInfo.adapter.device || 'GPU'}`;
            const typeInfo = gpuInfo.selectedType ? ` (${gpuInfo.selectedType})` : '';
            const adapterInfo = gpuInfo.totalAdapters > 1 ? ` [${gpuInfo.totalAdapters} adapters found]` : '';
            
            console.log('GPU Info:', gpuName + typeInfo + adapterInfo);
            addMessage(`🎯 Using GPU: ${gpuName}${typeInfo}${adapterInfo}`, 'system');
        } else if (!gpuInfo.supported) {
            console.warn('⚠️ GPU not available:', gpuInfo.reason);
            addMessage(`⚠️ GPU unavailable: ${gpuInfo.reason}. Using CPU mode.`, 'system');
        }
    } else {
        // Update status
        if (window.webllmControls) {
            window.webllmControls.status = 'Failed to initialize';
        }
        
        // Update progress message to show error
        if (progressMessage) {
            progressMessage.textContent = '❌ Failed to initialize WebLLM. Please try again or use a different model.';
            progressMessage.className = 'message system-message error';
        }
    }
}

init();

function init() {

    container = document.createElement( 'div' );
    document.body.appendChild( container );

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 100 );
    camera.position.set( - 5, 3, 10 );
    camera.lookAt( 0, 2, 0 );

    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0xe0e0e0 );
    scene.fog = new THREE.Fog( 0xe0e0e0, 20, 100 );

    clock = new THREE.Clock();

    // lights

    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 3 );
    hemiLight.position.set( 0, 20, 0 );
    scene.add( hemiLight );

    const dirLight = new THREE.DirectionalLight( 0xffffff, 3 );
    dirLight.position.set( 0, 20, 10 );
    dirLight.castShadow = true;
    
    // Configure shadow map
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    
    scene.add( dirLight );

    // ground

    const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2000, 2000 ), new THREE.MeshPhongMaterial( { color: 0xcbcbcb, depthWrite: false } ) );
    mesh.rotation.x = - Math.PI / 2;
    mesh.receiveShadow = true; // Ground receives shadows
    scene.add( mesh );

    const grid = new THREE.GridHelper( 200, 40, 0x000000, 0x000000 );
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add( grid );

    // model

    const loader = new GLTFLoader();
    loader.load( 'models/gltf/RobotExpressive/RobotExpressive.glb', function ( gltf ) {

        model = gltf.scene;
        
        // Enable shadows for the robot model
        model.traverse( function ( child ) {
            if ( child.isMesh ) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        } );
        
        scene.add( model );

        createGUI( model, gltf.animations );

    }, undefined, function ( e ) {

        console.error( e );

    } );

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setAnimationLoop( animate );
    
    // Enable shadow maps
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
    
    container.appendChild( renderer.domElement );

    window.addEventListener( 'resize', onWindowResize );

    // stats
    stats = new Stats();
    container.appendChild( stats.dom );

    // Setup timer callback
    setupTimer();

    // Initialize chat interface
    initChat();

}

function setupTimer() {
    // Timer callback function
    timerCallback = setInterval(() => {
        if (states && states.length > 0 && emotes && emotes.length > 0) {
            // Randomly choose between states, emotes, and expressions
            const randomChoice = Math.random();
            
            if (false && randomChoice < 0.8 && expressions && expressions.length > 0 && face) {
                // disable for the moment
                const randomIndex = Math.floor(Math.random() * expressions.length);
                const expressionName = expressions[randomIndex];
                const randomValue = Math.random(); // Random value between 0 and 1
                
                face.morphTargetInfluences[randomIndex] = randomValue;
                console.log(`Timer update at ${new Date().toLocaleTimeString()} - Robot expression changed: ${expressionName} = ${randomValue.toFixed(2)}`);
            } 
            if (randomChoice < 0.3) {
                // 20% chance for emote (0.2 to 0.4)
                const randomIndex = Math.floor(Math.random() * emotes.length);
                const newEmote = emotes[randomIndex];
                
                if (actions && actions[newEmote]) {
                    fadeToAction(newEmote, 0.);
                    console.log(`Timer update at ${new Date().toLocaleTimeString()} - Robot randomly performed emote: ${newEmote}`);
                }
            } else {
                // 60% chance for state change (0.4 to 1.0)
                const randomIndex = Math.floor(Math.random() * states.length);
                const newState = states[randomIndex];
                
                // Update the API state and trigger the animation
                api.state = newState;
                if (actions && actions[newState]) {
                    fadeToAction(newState, 0.5);
                }
                
                console.log(`Timer update at ${new Date().toLocaleTimeString()} - Robot randomly changed to state: ${newState}`);
            }
        }
    }, 2000); // 2 seconds
}

function createGUI( model, animations ) {

    states = [ 'Idle', 'Walking', ]; // 'Death', 'Sitting', 'Standing', 'Running', 'Dance', 
    emotes = [ 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp' ]; // 'Jump'

    gui = new GUI();

    mixer = new THREE.AnimationMixer( model );

    actions = {};

    for ( let i = 0; i < animations.length; i ++ ) {

        const clip = animations[ i ];
        console.log(`Processing animation clip: ${clip.name}`);
        const action = mixer.clipAction( clip );
        actions[ clip.name ] = action;

        if ( emotes.indexOf( clip.name ) >= 0 || states.indexOf( clip.name ) >= 4 ) {

            action.clampWhenFinished = true;
            action.loop = THREE.LoopOnce;

        }

    }

    // states

    const statesFolder = gui.addFolder( 'States' );

    const clipCtrl = statesFolder.add( api, 'state' ).options( states );

    clipCtrl.onChange( function () {

        fadeToAction( api.state, 0.5 );

    } );

    statesFolder.open();

    // emotes

    const emoteFolder = gui.addFolder( 'Emotes' );

    function createEmoteCallback( name ) {

        api[ name ] = function () {

            fadeToAction( name, 0.2 );

            mixer.addEventListener( 'finished', restoreState );

        };

        emoteFolder.add( api, name );

    }

    function restoreState() {

        mixer.removeEventListener( 'finished', restoreState );

        fadeToAction( api.state, 0.2 );

    }

    for ( let i = 0; i < emotes.length; i ++ ) {

        createEmoteCallback( emotes[ i ] );

    }

    emoteFolder.open();

    // expressions

    face = model.getObjectByName( 'Head_4' );

    expressions = Object.keys( face.morphTargetDictionary );
    console.log('Available expressions:', expressions);
    const expressionFolder = gui.addFolder( 'Expressions' );

    for ( let i = 0; i < expressions.length; i ++ ) {

        expressionFolder.add( face.morphTargetInfluences, i, -0.5, 1, 0.01 ).name( expressions[ i ] );

    }

    activeAction = actions[ 'Idle' ];
    activeAction.play();

    expressionFolder.open();

    // robot color control
    const colorFolder = gui.addFolder( 'Robot Color' );
    
    colorFolder.addColor( api, 'robotColor' ).name( 'Color' ).onChange( function ( value ) {
        
        changeRobotColor( value );
        
    } );
    
    colorFolder.open();

    // LLM settings
    const llmFolder = gui.addFolder( 'LLM Settings' );
    
    const llmProviderCtrl = llmFolder.add( { provider: llmProvider }, 'provider', ['pattern', 'webllm', 'openai', 'ollama' ] );
    llmProviderCtrl.onChange( function ( value ) {
        llmProvider = value;
        console.log('LLM provider changed to:', value);
        
        // Initialize WebLLM when selected
        if (value === 'webllm' && !isWebLLMInitialized() && !isWebLLMInitializing()) {
            initWebLLMWithUI();
        }
    } );
    
    llmFolder.add( llmConfig.openai, 'apiKey' ).name( 'OpenAI API Key' );
    llmFolder.add( llmConfig.openai, 'model' ).name( 'OpenAI Model' );
    llmFolder.add( llmConfig.ollama, 'endpoint' ).name( 'Ollama Endpoint' );
    llmFolder.add( llmConfig.ollama, 'model' ).name( 'Ollama Model' );
    
    // WebLLM controls
    const webLLMConfig = getWebLLMConfig();
    const webllmModelCtrl = llmFolder.add( webLLMConfig, 'model', webLLMConfig.availableModels ).name( 'WebLLM Model' );
    webllmModelCtrl.onChange( function ( value ) {
        setWebLLMModel(value);
        console.log('WebLLM model changed to:', value);
        // Reinitialize if already initialized
        if (isWebLLMInitialized()) {
            resetWebLLM();
            if (llmProvider === 'webllm') {
                initWebLLMWithUI();
            }
        }
    } );
    
    // Add WebLLM initialization button
    const webllmControls = {
        initWebLLM: function() {
            if (!isWebLLMInitialized() && !isWebLLMInitializing()) {
                initWebLLMWithUI();
            }
        },
        status: 'Not initialized'
    };
    
    llmFolder.add( webllmControls, 'initWebLLM' ).name( 'Initialize WebLLM' );
    const statusController = llmFolder.add( webllmControls, 'status' ).name( 'WebLLM Status' );
    statusController.listen(); // Make it update automatically
    
    // Store reference for updates
    window.webllmStatusController = statusController;
    window.webllmControls = webllmControls;
    
    // llmFolder.open();

}

function changeRobotColor( color ) {
    
    if ( model ) {
        
        model.traverse( function ( child ) {
            
            if ( child.isMesh && child.material ) {
                if ( child.material.name !== 'Main' ) 
                    return; // Skip materials that are not the main one
                
                // Clone material to avoid affecting other objects
                // console.log(child.material);
                if ( child.material.color ) {
                    child.material = child.material.clone();
                    child.material.color.setHex( color.replace('#', '0x') );
                }
                
            }
            
        } );
        
    }
    
}

function fadeToAction( name, duration ) {

    previousAction = activeAction;
    activeAction = actions[ name ];

    if ( previousAction !== activeAction ) {

        previousAction.fadeOut( duration );

    }

    activeAction
        .reset()
        .setEffectiveTimeScale( 1 )
        .setEffectiveWeight( 1 )
        .fadeIn( duration )
        .play();

}

function initChat() {
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

    // Initialize audio manager with callbacks
    initAudioManager({
        onSpeechRecognized: (transcript) => {
            // Add the recognized text to the input field and send
            messageInput.value = transcript;
            sendMessage();
        },
        onSystemMessage: (message, type) => {
            addMessage(message, type || 'system');
        }
    });

    // Chat toggle functionality
    document.getElementById('chatHeader').addEventListener('click', function(e) {
        // Don't toggle chat if clicking on buttons
        if (e.target.id === 'chatToggle' || e.target.id === 'speechToggle') {
            return;
        }
        toggleChat();
    });
    
    // Individual button handlers
    chatToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleChat();
    });
    
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

    // Welcome message
    addMessage('Hello! I\'m Robo. Try talking to me! (Speech will activate after your first message)', 'robot');
    // Don't speak automatically - wait for user interaction
}

function toggleChat() {
    chatContainer.classList.toggle('minimized');
    chatToggle.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
}

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
            if (response.animation) {
                triggerRobotAction(response.animation);
            }
            if (response.expression) {
                triggerRobotExpression(response.expression);
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
            
            if (fallbackResponse.animation) {
                triggerRobotAction(fallbackResponse.animation);
            }
        }
    }, 500 + Math.random() * 1000); // Random delay for more natural feel
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = text;
    
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

async function generateRobotResponse(userMessage) {
    console.log(`Generating response using ${llmProvider} provider`);
    
    try {
        switch (llmProvider) {
            case 'openai':
                return await generateOpenAIResponse(userMessage);
            case 'ollama':
                return await generateOllamaResponse(userMessage);
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

async function generateOllamaResponse(userMessage) {
    const systemPrompt = `You are Robo, a friendly robot assistant. You can perform animations: Wave, Yes, No, ThumbsUp, Punch. Be enthusiastic and conversational. Keep responses under 100 words.`;
    
    const response = await fetch(llmConfig.ollama.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: llmConfig.ollama.model,
            prompt: `${systemPrompt}\n\nHuman: ${userMessage}\n\nRobo:`,
            stream: false
        })
    });
    
    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.response.trim();
    
    return {
        text: text,
        animation: extractAnimationFromText(text),
        expression: null
    };
}

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

function triggerRobotAction(actionName) {
    if (actions && actions[actionName]) {
        fadeToAction(actionName, 0.3);
        
        // If it's an emote, set up restoration to idle state
        if (emotes && emotes.includes(actionName)) {
            setTimeout(() => {
                fadeToAction(api.state, 0.3);
            }, 2000);
        }
        
        console.log(`Chat triggered robot action: ${actionName}`);
    }
}

function triggerRobotExpression(expressionData) {
    if (face && expressions && expressionData) {
        const { name, value } = expressionData;
        const expressionIndex = expressions.indexOf(name);
        
        if (expressionIndex >= 0) {
            face.morphTargetInfluences[expressionIndex] = value;
            console.log(`Chat triggered robot expression: ${name} = ${value}`);
            
            // Reset expression after a while
            setTimeout(() => {
                face.morphTargetInfluences[expressionIndex] = 0;
            }, 3000);
        }
    }
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}

//

function animate() {

    const dt = clock.getDelta();

    if ( mixer ) mixer.update( dt );

    renderer.render( scene, camera );

    stats.update();

}
