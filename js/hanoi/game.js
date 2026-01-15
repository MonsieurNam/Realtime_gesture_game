/**
 * Tower of Hanoi - Main Game Logic
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, createGameState } from './config.js';
import { createBase, createRods } from './rods.js';
import { createDisks, getDiskRod, getNearestRod, getStackYPosition, isValidMove, moveDisk, animateDiskTo, processAnimations, checkWinCondition } from './disks.js';
import { initializeMediaPipe, drawHandLandmarks, updateCursor3D, updateGestureIndicator, handleGestureState } from './gestures.js';

// ==================== GAME STATE ====================
let gameState = createGameState();

// ==================== THREE.JS ====================
let scene, camera, renderer, controls;
let rods = [];
let raycaster, mouse;
let cursor3D;

// ==================== MEDIAPIPE ====================
let hands, camera2D, canvasCtx;
let mediaPipeReady = false;

// ==================== DOM CACHE ====================
const DOM = {};

function initDOMCache() {
    DOM.moveCount = document.getElementById('move-count');
    DOM.timer = document.getElementById('timer');
    DOM.minMoves = document.getElementById('min-moves');
    DOM.diskSlider = document.getElementById('disk-slider');
    DOM.diskCount = document.getElementById('disk-count');
    DOM.winOverlay = document.getElementById('win-overlay');
    DOM.winStats = document.getElementById('win-stats');
    DOM.messageToast = document.getElementById('message-toast');
    DOM.loadingOverlay = document.getElementById('loading-overlay');
    DOM.loadingText = document.getElementById('loading-text');
    DOM.diskSelectionIndicator = document.getElementById('disk-selection-indicator');
    DOM.diskPreview = document.getElementById('disk-preview');
}

// ==================== THREE.JS SETUP ====================
function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 14);
    camera.lookAt(0, 1, 0);

    const canvas = document.getElementById('three-canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'low-power'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.minDistance = 5;
    controls.maxDistance = 20;

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    setupLighting();
    createBase(scene);
    rods = createRods(scene);
    createCursor3D();

    window.addEventListener('resize', onWindowResize);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 30;
    mainLight.shadow.camera.left = -8;
    mainLight.shadow.camera.right = 8;
    mainLight.shadow.camera.top = 8;
    mainLight.shadow.camera.bottom = -8;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x00d9ff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xff6b6b, 0.2);
    backLight.position.set(0, 5, -10);
    scene.add(backLight);
}

function createCursor3D() {
    const cursorGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const cursorMaterial = new THREE.MeshStandardMaterial({
        color: 0x00d9ff,
        emissive: 0x00d9ff,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    cursor3D = new THREE.Mesh(cursorGeometry, cursorMaterial);
    cursor3D.visible = false;
    scene.add(cursor3D);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== UI HELPERS ====================
function showMessage(text, type = 'error') {
    DOM.messageToast.textContent = text;
    DOM.messageToast.className = 'show' + (type === 'success' ? ' success' : '');
    setTimeout(() => {
        DOM.messageToast.classList.remove('show', 'success');
    }, 1500);
}

function showDiskSelectionIndicator(disk) {
    const diskColor = disk.userData.originalColor;
    DOM.diskPreview.style.backgroundColor = diskColor;
    DOM.diskPreview.style.color = diskColor;
    DOM.diskSelectionIndicator.classList.add('show');
}

function hideDiskSelectionIndicator() {
    DOM.diskSelectionIndicator.classList.remove('show');
}

function startTimer() {
    if (gameState.startTime) return;
    gameState.startTime = Date.now();
    gameState.isPlaying = true;

    gameState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        DOM.timer.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function restartGame() {
    gameState.moveCount = 0;
    gameState.startTime = null;
    gameState.isPlaying = false;
    gameState.selectedDisk = null;
    gameState.isDragging = false;
    gameState.animations = [];

    DOM.moveCount.textContent = '0';
    DOM.timer.textContent = '00:00';
    DOM.winOverlay.classList.remove('show');

    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
    }

    createDisks(scene, gameState, DOM);
}

// ==================== MOUSE CONTROLS ====================
let mouseDown = false;
let hoveredDisk = null;

function setupMouseControls() {
    const canvas = renderer.domElement;
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
}

function onMouseDown(event) {
    if (gameState.gestureMode) return;
    if (gameState.animations.length > 0) return;

    updateMousePosition(event);
    const intersects = getIntersectedDisks();

    if (intersects.length > 0) {
        const clickedDisk = intersects[0].object;
        const diskIndex = clickedDisk.userData.diskIndex;
        const rodIndex = getDiskRod(gameState, diskIndex);
        const topDiskIndex = gameState.rods[rodIndex][gameState.rods[rodIndex].length - 1];

        if (diskIndex === topDiskIndex) {
            mouseDown = true;
            gameState.selectedDisk = clickedDisk;
            gameState.selectedDiskOriginalRod = rodIndex;
            gameState.isDragging = true;

            clickedDisk.material.emissiveIntensity = 0.8;
            clickedDisk.scale.set(1.05, 1.1, 1.05);
            showDiskSelectionIndicator(clickedDisk);
            clickedDisk.position.y = CONFIG.liftHeight;
            controls.enabled = false;
            startTimer();
        }
    }
}

function onMouseMove(event) {
    updateMousePosition(event);
    if (gameState.gestureMode) return;
    updateHoveredDisk();

    if (gameState.isDragging && gameState.selectedDisk) {
        const worldPos = getMouseWorldPosition();
        if (worldPos) {
            gameState.selectedDisk.position.x = worldPos.x;
            gameState.selectedDisk.position.z = worldPos.z;
        }
    }
}

function onMouseUp() {
    if (gameState.gestureMode) return;

    if (gameState.isDragging && gameState.selectedDisk) {
        const disk = gameState.selectedDisk;
        const diskIndex = disk.userData.diskIndex;
        const diskSize = disk.userData.size;
        const originalRod = gameState.selectedDiskOriginalRod;
        const targetRod = getNearestRod(disk.position.x);

        disk.material.emissiveIntensity = 0.1;
        disk.scale.set(1, 1, 1);
        hideDiskSelectionIndicator();

        if (targetRod !== originalRod && isValidMove(gameState, diskSize, targetRod)) {
            moveDisk(gameState, diskIndex, targetRod, true, DOM, showMessage);
            checkWinCondition(gameState, DOM);
        } else if (targetRod !== originalRod) {
            moveDisk(gameState, diskIndex, originalRod, false, DOM, showMessage);
        } else {
            const yPos = getStackYPosition(gameState, originalRod);
            animateDiskTo(gameState, disk, CONFIG.rodPositions[originalRod], yPos);
        }
    }

    mouseDown = false;
    gameState.selectedDisk = null;
    gameState.isDragging = false;
    controls.enabled = true;
    hideDiskSelectionIndicator();
}

function updateMousePosition(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedDisks() {
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(gameState.disks);
}

function getMouseWorldPosition() {
    raycaster.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.liftHeight);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection;
    }
    return null;
}

function updateHoveredDisk() {
    if (gameState.isDragging) return;

    const intersects = getIntersectedDisks();

    if (hoveredDisk && hoveredDisk !== gameState.selectedDisk) {
        hoveredDisk.material.emissiveIntensity = 0.1;
    }

    if (intersects.length > 0) {
        const disk = intersects[0].object;
        const diskIndex = disk.userData.diskIndex;
        const rodIndex = getDiskRod(gameState, diskIndex);
        const topDiskIndex = gameState.rods[rodIndex][gameState.rods[rodIndex].length - 1];

        if (diskIndex === topDiskIndex) {
            hoveredDisk = disk;
            disk.material.emissiveIntensity = 0.3;
            document.body.style.cursor = 'grab';
        } else {
            hoveredDisk = null;
            document.body.style.cursor = 'default';
        }
    } else {
        hoveredDisk = null;
        document.body.style.cursor = 'default';
    }
}

// ==================== MEDIAPIPE HANDLERS ====================
function onHandResults(results, ctx, canvas) {
    if (!gameState.gestureMode) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        drawHandLandmarks(landmarks, canvas, ctx);

        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        const pinchDistance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) +
            Math.pow(thumbTip.y - indexTip.y, 2) +
            Math.pow((thumbTip.z || 0) - (indexTip.z || 0), 2) * 0.5
        );

        const rawPinching = pinchDistance < CONFIG.PINCH_THRESHOLD;
        gameState.pinchBuffer.push(rawPinching);
        if (gameState.pinchBuffer.length > gameState.PINCH_BUFFER_SIZE) {
            gameState.pinchBuffer.shift();
        }

        const pinchCount = gameState.pinchBuffer.filter(Boolean).length;
        const stabilizedPinching = pinchCount >= Math.ceil(gameState.PINCH_BUFFER_SIZE * 0.6);

        const rawX = 1 - indexTip.x;
        const rawY = indexTip.y;
        const smoothing = gameState.POSITION_SMOOTHING;
        gameState.smoothedHandPosition.x += (rawX - gameState.smoothedHandPosition.x) * smoothing;
        gameState.smoothedHandPosition.y += (rawY - gameState.smoothedHandPosition.y) * smoothing;
        gameState.handPosition.x = rawX;
        gameState.handPosition.y = rawY;

        updateCursor3D(gameState, mouse, camera, raycaster, cursor3D, pinchDistance);
        updateGestureIndicator(stabilizedPinching, gameState.isDragging, pinchDistance);
        handleGestureState(gameState, stabilizedPinching, raycaster, camera, mouse, DOM, showMessage, showDiskSelectionIndicator, hideDiskSelectionIndicator, startTimer);

        gameState.lastPinchState = stabilizedPinching;

        if (checkWinCondition(gameState, DOM)) return;
    } else {
        cursor3D.visible = false;
        document.getElementById('cursor-indicator').style.display = 'none';
        gameState.pinchBuffer = [];
    }
}

// ==================== UI HANDLERS ====================
function setupUIHandlers() {
    DOM.diskSlider.addEventListener('input', (e) => {
        DOM.diskCount.textContent = e.target.value;
    });

    DOM.diskSlider.addEventListener('change', (e) => {
        gameState.numDisks = parseInt(e.target.value);
        restartGame();
    });

    const gestureToggle = document.getElementById('gesture-toggle');
    gestureToggle.addEventListener('click', async () => {
        gameState.gestureMode = !gameState.gestureMode;
        gestureToggle.classList.toggle('active');

        const webcamContainer = document.getElementById('webcam-container');
        const gestureIndicator = document.getElementById('gesture-indicator');
        const instructions = document.getElementById('instructions');
        const instructionsText = document.getElementById('instructions-text');

        if (gameState.gestureMode) {
            if (!mediaPipeReady || !camera2D) {
                showMessage('Camera not available. Please allow camera access.', 'error');
                gameState.gestureMode = false;
                gestureToggle.classList.remove('active');
                return;
            }

            webcamContainer.classList.remove('hidden');
            gestureIndicator.classList.remove('hidden');
            instructionsText.textContent = 'Pinch (thumb + index) to grab the top disk. Move your hand and release to drop!';
            instructions.classList.add('gesture-mode');
            cursor3D.visible = true;

            try {
                await camera2D.start();
            } catch (err) {
                showMessage('Failed to start camera', 'error');
                gameState.gestureMode = false;
                gestureToggle.classList.remove('active');
                webcamContainer.classList.add('hidden');
                gestureIndicator.classList.add('hidden');
                return;
            }

            controls.enabled = false;
        } else {
            webcamContainer.classList.add('hidden');
            gestureIndicator.classList.add('hidden');
            instructionsText.textContent = 'Click and drag disks to move them between rods. Only smaller disks can be placed on larger ones!';
            instructions.classList.remove('gesture-mode');
            cursor3D.visible = false;
            document.getElementById('cursor-indicator').style.display = 'none';

            if (camera2D) camera2D.stop();
            controls.enabled = true;

            if (gameState.selectedDisk) {
                gameState.selectedDisk.material.emissiveIntensity = 0.1;
                const originalRod = gameState.selectedDiskOriginalRod;
                const yPos = getStackYPosition(gameState, originalRod);
                animateDiskTo(gameState, gameState.selectedDisk, CONFIG.rodPositions[originalRod], yPos);
                gameState.selectedDisk = null;
                gameState.isDragging = false;
            }
        }
    });

    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('play-again-btn').addEventListener('click', restartGame);
}

// ==================== ANIMATION LOOP ====================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    processAnimations(gameState);
    renderer.render(scene, camera);
}

// ==================== INITIALIZATION ====================
async function init() {
    initDOMCache();
    initThreeJS();
    createDisks(scene, gameState, DOM);
    setupMouseControls();
    setupUIHandlers();

    const mpResult = await initializeMediaPipe(
        document.getElementById('webcam'),
        onHandResults,
        (text) => { DOM.loadingText.textContent = text; }
    );

    hands = mpResult.hands;
    camera2D = mpResult.camera2D;
    mediaPipeReady = mpResult.mediaPipeReady;
    canvasCtx = mpResult.canvasCtx;

    setTimeout(() => {
        DOM.loadingOverlay.classList.add('hidden');
    }, 800);

    animate();
}

init();
