import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

    // Chat toggle functionality
    document.getElementById('chatHeader').addEventListener('click', toggleChat);
    
    // Send message functionality
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Welcome message
    addMessage('Hello! I\'m Robo. Try talking to me!', 'robot');
}

function toggleChat() {
    chatContainer.classList.toggle('minimized');
    chatToggle.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;

    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    
    // Generate robot response
    setTimeout(() => {
        const response = generateRobotResponse(message);
        addMessage(response.text, 'robot');
        
        // Trigger robot animation/expression based on response
        if (response.animation) {
            triggerRobotAction(response.animation);
        }
        if (response.expression) {
            triggerRobotExpression(response.expression);
        }
    }, 500 + Math.random() * 1000); // Random delay for more natural feel
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.textContent = text;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Store in history
    chatHistory.push({ text, sender, timestamp: Date.now() });
    
    // Limit history to last 50 messages
    if (chatHistory.length > 50) {
        chatHistory.shift();
    }
}

function generateRobotResponse(userMessage) {
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
                { text: "I'm feeling energetic today!", animation: 'Punch', expression: null }
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
