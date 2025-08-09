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

// Import Storage manager
import {
    loadRobotColor,
    saveRobotColor
} from './storage-manager.js';

// Import Chat manager
import {
    initChat,
    addMessage,
    handleSpeechInput,
    setLLMProvider,
    getLLMConfig,
    updateLLMConfig
} from './chat-manager.js';

let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face;

// FPS limiting variables
let lastFrameTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS; // ~16.67ms for 60 FPS

const api = { state: 'Idle', robotColor: '#f5a824' };

// Timer variables
let timerCallback;
let states; // Make states accessible globally
let emotes; // Make emotes accessible globally
let expressions; // Make expressions accessible globally

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
    // Load saved robot color
    const savedColor = loadRobotColor();
    api.robotColor = savedColor || '#ffffff'; // default white if no saved color

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
    // setupTimer();

    // Initialize audio manager
    initAudioManager({
        onSpeechRecognized: handleSpeechInput,
        onSystemMessage: addMessage
    });

    // Initialize chat interface with robot action callbacks
    initChat({
        onRobotAction: triggerRobotAction,
        onRobotExpression: triggerRobotExpression
    });

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

    states = [ 'Idle', 'Walking', 'Running', 'Dance', 'Death', 'Sitting', 'Standing' ];
    emotes = [ 'Jump', 'Yes', 'No', 'Wave', 'Punch', 'ThumbsUp' ];

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
        saveRobotColor( value ); // Save the color preference
        
    } );
    
    // Apply saved color to the model when it's loaded
    if (model) {
        changeRobotColor(api.robotColor);
    }
    
    colorFolder.open();

    // LLM settings
    const llmFolder = gui.addFolder( 'LLM Settings' );
    
    // Get current LLM configuration from chat manager
    const currentLLMConfig = getLLMConfig();
    
    const llmProviderCtrl = llmFolder.add( { provider: currentLLMConfig.provider }, 'pattern', ['pattern', 'webllm', 'openai', 'ollama' ] );
    llmProviderCtrl.onChange( function ( value ) {
        setLLMProvider(value);
        
        // Initialize WebLLM when selected
        if (value === 'webllm' && !isWebLLMInitialized() && !isWebLLMInitializing()) {
            initWebLLMWithUI();
        }
    } );
    
    llmFolder.add( currentLLMConfig.config.openai, 'apiKey' ).name( 'OpenAI API Key' );
    llmFolder.add( currentLLMConfig.config.openai, 'model' ).name( 'OpenAI Model' );
    llmFolder.add( currentLLMConfig.config.ollama, 'endpoint' ).name( 'Ollama Endpoint' );
    
    // Ollama model dropdown with available models
    const ollamaModelCtrl = llmFolder.add( currentLLMConfig.config.ollama, 'model', currentLLMConfig.config.ollama.availableModels ).name( 'Ollama Model' );
    ollamaModelCtrl.onChange( function ( value ) {
        currentLLMConfig.config.ollama.model = value;
        console.log('Ollama model changed to:', value);
    } );

    // WebLLM controls
    const webLLMConfig = getWebLLMConfig();
    const webllmModelCtrl = llmFolder.add( webLLMConfig, 'model', webLLMConfig.availableModels ).name( 'WebLLM Model' );
    webllmModelCtrl.onChange( function ( value ) {
        setWebLLMModel(value);
        console.log('WebLLM model changed to:', value);
        // Reinitialize if already initialized
        if (isWebLLMInitialized()) {
            resetWebLLM();
            const currentConfig = getLLMConfig();
            if (currentConfig.provider === 'webllm') {
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

function animate(currentTime) {

    // FPS limiting: only render if enough time has passed
    if (currentTime - lastFrameTime < frameInterval) {
        return;
    }

    const dt = clock.getDelta();

    if ( mixer ) mixer.update( dt );

    renderer.render( scene, camera );

    stats.update();

    // Update last frame time
    lastFrameTime = currentTime;

}
