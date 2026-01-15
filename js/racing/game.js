/**
 * Racing Game - Main Game Logic
 */

import * as THREE from 'three';
import { CONFIG, createGameState, createGestureData } from './config.js';
import { createTrack, createStarfield, updateRoadLines } from './track.js';
import { createCar, updateCar } from './car.js';
import { createObstacle, updateObstacles, checkCollision, removeObstacle, clearObstacles } from './obstacles.js';

// ==================== GAME STATE ====================
let gameState = createGameState();
let gestureData = createGestureData();

// ==================== THREE.JS OBJECTS ====================
let scene, camera, renderer;
let car, trackElements;
let obstacles = [];
let clock = new THREE.Clock();

// ==================== MEDIAPIPE ====================
let hands, processFrameId;
let lastProcessTime = 0;

// ==================== AUDIO ====================
let audioContext, engineOscillator, engineGain, bgmOscillator, bgmGain;

// ==================== DOM ELEMENTS ====================
const DOM = {};

function cacheDOMElements() {
    DOM.loadingScreen = document.getElementById('loading-screen');
    DOM.loadingBar = document.getElementById('loading-bar');
    DOM.loadingText = document.getElementById('loading-text');
    DOM.startMenu = document.getElementById('start-menu');
    DOM.gameContainer = document.getElementById('game-container');
    DOM.hud = document.getElementById('hud');
    DOM.webcamContainer = document.getElementById('webcam-container');
    DOM.webcam = document.getElementById('webcam');
    DOM.gestureIndicator = document.getElementById('gesture-indicator');
    DOM.gameOverScreen = document.getElementById('game-over');
    DOM.audioToggle = document.getElementById('audio-toggle');
    DOM.scoreValue = document.getElementById('score-value');
    DOM.speedValue = document.getElementById('speed-value');
    DOM.finalScore = document.getElementById('final-score');
    DOM.newHighScore = document.getElementById('new-high-score');
    DOM.highScoreDisplay = document.getElementById('high-score-display');
}

// ==================== INITIALIZATION ====================
async function init() {
    cacheDOMElements();

    try {
        updateLoading(10, 'Loading Three.js...');
        initThreeJS();

        updateLoading(40, 'Loading MediaPipe...');
        await initMediaPipe();

        updateLoading(70, 'Setting up audio...');
        initAudio();

        updateLoading(90, 'Preparing game...');
        setupEventListeners();

        updateLoading(100, 'Ready!');

        setTimeout(() => {
            DOM.loadingScreen.classList.add('hidden');
            DOM.startMenu.style.display = 'flex';
            DOM.highScoreDisplay.textContent = `🏆 High Score: ${gameState.highScore}`;
        }, 500);

    } catch (error) {
        console.error('Initialization error:', error);
        DOM.loadingText.textContent = 'Error loading game. Please refresh.';
    }
}

function updateLoading(percent, text) {
    DOM.loadingBar.style.width = percent + '%';
    DOM.loadingText.textContent = text;
}

// ==================== THREE.JS SETUP ====================
function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 30, 100);

    // Camera
    camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        0.1,
        200
    );
    camera.position.set(
        CONFIG.camera.position.x,
        CONFIG.camera.position.y,
        CONFIG.camera.position.z
    );
    camera.lookAt(
        CONFIG.camera.lookAt.x,
        CONFIG.camera.lookAt.y,
        CONFIG.camera.lookAt.z
    );

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    DOM.gameContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404080, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Neon lights
    const neonLight1 = new THREE.PointLight(0xff6b6b, 1, 50);
    neonLight1.position.set(-10, 5, -20);
    scene.add(neonLight1);

    const neonLight2 = new THREE.PointLight(0x48dbfb, 1, 50);
    neonLight2.position.set(10, 5, -20);
    scene.add(neonLight2);

    // Create Track
    trackElements = createTrack(scene);

    // Create Car
    car = createCar(scene);

    // Create Stars
    createStarfield(scene);

    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== MEDIAPIPE ====================
async function initMediaPipe() {
    return new Promise((resolve, reject) => {
        try {
            hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5
            });

            hands.onResults(onHandResults);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }
        });
        DOM.webcam.srcObject = stream;

        await new Promise(resolve => {
            DOM.webcam.onloadedmetadata = resolve;
        });

        processFrame();
    } catch (error) {
        console.error('Camera error:', error);
        DOM.gestureIndicator.textContent = 'Camera Error';
    }
}

async function processFrame() {
    if (!gameState.isPlaying) return;

    const now = performance.now();
    if (now - lastProcessTime >= CONFIG.processInterval) {
        lastProcessTime = now;
        try {
            await hands.send({ image: DOM.webcam });
        } catch (error) {
            console.error('Hand detection error:', error);
        }
    }

    processFrameId = requestAnimationFrame(processFrame);
}

function onHandResults(results) {
    try {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            gestureData.handsDetected = true;

            let totalSteering = 0;
            let isOpen = false;
            let isClosed = false;

            results.multiHandLandmarks.forEach((landmarks) => {
                const wrist = landmarks[0];
                const middleBase = landmarks[9];

                const handCenter = (wrist.x + middleBase.x) / 2;
                const tilt = middleBase.x - wrist.x;
                totalSteering -= (handCenter - 0.5) * 2 + tilt * 3;

                const fingerTips = [8, 12, 16, 20];
                const fingerBases = [5, 9, 13, 17];

                let openFingers = 0;
                fingerTips.forEach((tipIdx, i) => {
                    if (landmarks[tipIdx].y < landmarks[fingerBases[i]].y) {
                        openFingers++;
                    }
                });

                if (openFingers >= 3) isOpen = true;
                if (openFingers <= 1) isClosed = true;
            });

            gestureData.steering = Math.max(-1, Math.min(1, totalSteering / results.multiHandLandmarks.length));
            gestureData.isAccelerating = isOpen && !isClosed;
            gestureData.isBraking = isClosed;

            if (gestureData.isBraking) {
                DOM.gestureIndicator.textContent = '✊ Braking';
            } else if (gestureData.isAccelerating) {
                DOM.gestureIndicator.textContent = '✋ Accelerating';
            } else {
                DOM.gestureIndicator.textContent = '🖐️ Coasting';
            }
        } else {
            gestureData.handsDetected = false;
            DOM.gestureIndicator.textContent = '❓ No hands';
        }
    } catch (error) {
        console.error('Gesture processing error:', error);
    }
}

// ==================== AUDIO ====================
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
        console.error('Audio context error:', error);
    }
}

function startEngineSound() {
    if (!audioContext || !gameState.audioEnabled) return;

    try {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain();
        engineOscillator.type = 'sawtooth';
        engineOscillator.frequency.setValueAtTime(80, audioContext.currentTime);
        engineGain.gain.setValueAtTime(0.05, audioContext.currentTime);
        engineOscillator.connect(engineGain);
        engineGain.connect(audioContext.destination);
        engineOscillator.start();

        bgmOscillator = audioContext.createOscillator();
        bgmGain = audioContext.createGain();
        bgmOscillator.type = 'sine';
        bgmOscillator.frequency.setValueAtTime(220, audioContext.currentTime);
        bgmGain.gain.setValueAtTime(0.02, audioContext.currentTime);
        bgmOscillator.connect(bgmGain);
        bgmGain.connect(audioContext.destination);
        bgmOscillator.start();
    } catch (error) {
        console.error('Engine sound error:', error);
    }
}

function updateEngineSound() {
    if (!engineOscillator || !gameState.audioEnabled) return;
    try {
        const frequency = 80 + gameState.speed * 150;
        engineOscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    } catch (error) { }
}

function stopEngineSound() {
    try {
        if (engineOscillator) {
            engineOscillator.stop();
            engineOscillator = null;
        }
        if (bgmOscillator) {
            bgmOscillator.stop();
            bgmOscillator = null;
        }
    } catch (error) { }
}

function playCollisionSound() {
    if (!audioContext || !gameState.audioEnabled) return;

    try {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 0.3);
    } catch (error) { }
}

// ==================== GAME LOGIC ====================
function startGame() {
    gameState.isPlaying = true;
    gameState.score = 0;
    gameState.speed = 0;
    gameState.carPosition = 0;

    DOM.startMenu.style.display = 'none';
    DOM.hud.style.display = 'flex';
    DOM.webcamContainer.style.display = 'block';
    DOM.audioToggle.style.display = 'block';
    DOM.gameOverScreen.style.display = 'none';

    clearObstacles(scene, obstacles);
    obstacles = [];
    car.position.x = 0;

    startCamera();
    startEngineSound();
    animate();
}

function endGame() {
    gameState.isPlaying = false;
    stopEngineSound();

    const isNewHighScore = gameState.score > gameState.highScore;
    if (isNewHighScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('handRacingHighScore', gameState.score.toString());
    }

    DOM.finalScore.textContent = Math.floor(gameState.score);
    DOM.newHighScore.style.display = isNewHighScore ? 'block' : 'none';
    DOM.gameOverScreen.style.display = 'flex';

    if (DOM.webcam.srcObject) {
        DOM.webcam.srcObject.getTracks().forEach(track => track.stop());
    }
}

function animate() {
    if (!gameState.isPlaying) return;

    requestAnimationFrame(animate);

    const diffSettings = CONFIG.difficulty[gameState.difficulty];

    // Update speed
    if (gestureData.isAccelerating) {
        gameState.targetSpeed = diffSettings.maxSpeed;
    } else if (gestureData.isBraking) {
        gameState.targetSpeed = diffSettings.baseSpeed * 0.3;
    } else {
        gameState.targetSpeed = diffSettings.baseSpeed;
    }
    gameState.speed += (gameState.targetSpeed - gameState.speed) * 0.05;

    // Update car
    updateCar(car, gameState, gestureData);

    // Update road lines
    updateRoadLines(trackElements.roadLines, gameState.speed);

    // Spawn obstacles
    const maxObs = diffSettings.maxObstacles || 4;
    if (obstacles.length < maxObs && Math.random() < diffSettings.obstacleFrequency) {
        const newObstacle = createObstacle(scene, obstacles);
        if (newObstacle) obstacles.push(newObstacle);
    }

    // Update obstacles
    obstacles = updateObstacles(scene, obstacles, gameState.speed);

    // Check collision
    const collision = checkCollision(car, obstacles);
    if (collision) {
        playCollisionSound();
        obstacles = removeObstacle(scene, obstacles, collision);
        endGame();
        return;
    }

    // Update score
    gameState.score += gameState.speed * diffSettings.scoreMultiplier * 0.5;

    // Update HUD
    DOM.scoreValue.textContent = Math.floor(gameState.score);
    DOM.speedValue.textContent = Math.floor(gameState.speed * 100) + ' km/h';

    // Update engine sound
    updateEngineSound();

    // Camera shake
    camera.position.x = Math.sin(Date.now() * 0.01) * gameState.speed * 0.1;

    renderer.render(scene, camera);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Difficulty buttons
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            gameState.difficulty = btn.dataset.difficulty;
        });
    });

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('retry-btn').addEventListener('click', startGame);

    document.getElementById('menu-btn').addEventListener('click', () => {
        DOM.gameOverScreen.style.display = 'none';
        DOM.startMenu.style.display = 'flex';
        DOM.hud.style.display = 'none';
        DOM.webcamContainer.style.display = 'none';
        DOM.audioToggle.style.display = 'none';
        DOM.highScoreDisplay.textContent = `🏆 High Score: ${gameState.highScore}`;
    });

    DOM.audioToggle.addEventListener('click', () => {
        gameState.audioEnabled = !gameState.audioEnabled;
        DOM.audioToggle.textContent = gameState.audioEnabled ? '🔊' : '🔇';
        if (!gameState.audioEnabled) {
            stopEngineSound();
        } else if (gameState.isPlaying) {
            startEngineSound();
        }
    });

    // Keyboard fallback
    document.addEventListener('keydown', (e) => {
        if (!gameState.isPlaying) return;
        switch (e.key) {
            case 'ArrowLeft': case 'a': gestureData.steering = -1; break;
            case 'ArrowRight': case 'd': gestureData.steering = 1; break;
            case 'ArrowUp': case 'w':
                gestureData.isAccelerating = true;
                gestureData.isBraking = false;
                break;
            case 'ArrowDown': case 's':
                gestureData.isBraking = true;
                gestureData.isAccelerating = false;
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (!gameState.isPlaying) return;
        switch (e.key) {
            case 'ArrowLeft': case 'a':
            case 'ArrowRight': case 'd':
                gestureData.steering = 0;
                break;
            case 'ArrowUp': case 'w': gestureData.isAccelerating = false; break;
            case 'ArrowDown': case 's': gestureData.isBraking = false; break;
        }
    });
}

// ==================== START ====================
init();
