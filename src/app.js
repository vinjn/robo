import * as THREE from 'three';

import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let container, stats, clock, gui, mixer, actions, activeAction, previousAction;
let camera, scene, renderer, model, face;

const api = { state: 'Idle' };

// Timer variables
let timerCallback;
let states; // Make states accessible globally
let emotes; // Make emotes accessible globally
let expressions; // Make expressions accessible globally

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

        expressionFolder.add( face.morphTargetInfluences, i, 0, 1, 0.01 ).name( expressions[ i ] );

    }

    activeAction = actions[ 'Idle' ];
    activeAction.play();

    expressionFolder.open();

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
