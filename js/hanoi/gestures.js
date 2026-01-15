/**
 * Tower of Hanoi - Gesture Control Module
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getDiskRod, getNearestRod, getStackYPosition, isValidMove, moveDisk, animateDiskTo } from './disks.js';

/**
 * Initialize MediaPipe
 */
export async function initializeMediaPipe(videoElement, onResults, updateLoadingText) {
    const canvasElement = document.getElementById('webcam-canvas');
    const canvasCtx = canvasElement.getContext('2d');
    canvasElement.width = 320;
    canvasElement.height = 240;

    let hands, camera2D;
    let mediaPipeReady = false;

    try {
        if (updateLoadingText) updateLoadingText('Requesting camera access...');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }
        });

        videoElement.srcObject = stream;

        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        if (updateLoadingText) updateLoadingText('Initializing hand tracking...');

        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5
        });

        hands.onResults((results) => onResults(results, canvasCtx, canvasElement));

        camera2D = new Camera(videoElement, {
            onFrame: async () => {
                if (hands) {
                    await hands.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });

        mediaPipeReady = true;
        if (updateLoadingText) updateLoadingText('Ready! ✓');

        return { hands, camera2D, mediaPipeReady, canvasCtx };

    } catch (error) {
        console.error('MediaPipe initialization error:', error);

        if (error.name === 'NotAllowedError') {
            if (updateLoadingText) updateLoadingText('Camera access denied. Using mouse mode.');
        } else if (error.name === 'NotFoundError') {
            if (updateLoadingText) updateLoadingText('No camera found. Using mouse mode.');
        } else {
            if (updateLoadingText) updateLoadingText('Camera error. Using mouse mode.');
        }

        return { hands: null, camera2D: null, mediaPipeReady: false, canvasCtx };
    }
}

/**
 * Draw hand landmarks on canvas
 */
export function drawHandLandmarks(landmarks, canvas, ctx) {
    const width = canvas.width;
    const height = canvas.height;

    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
    ];

    ctx.strokeStyle = 'rgba(0, 217, 255, 0.6)';
    ctx.lineWidth = 2;

    connections.forEach(([i, j]) => {
        const p1 = landmarks[i];
        const p2 = landmarks[j];
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
    });

    landmarks.forEach((landmark, index) => {
        const x = landmark.x * width;
        const y = landmark.y * height;

        ctx.beginPath();
        ctx.arc(x, y, index === 4 || index === 8 ? 6 : 3, 0, Math.PI * 2);
        ctx.fillStyle = (index === 4 || index === 8) ? '#ff6b6b' : '#00d9ff';
        ctx.fill();
    });
}

/**
 * Update 3D cursor position
 */
export function updateCursor3D(gameState, mouse, camera, raycaster, cursor3D, pinchDistance) {
    const smoothX = gameState.smoothedHandPosition.x;
    const smoothY = gameState.smoothedHandPosition.y;

    mouse.x = smoothX * 2 - 1;
    mouse.y = -(smoothY * 2 - 1);

    const cursorIndicator = document.getElementById('cursor-indicator');
    cursorIndicator.style.display = 'block';
    cursorIndicator.style.left = `${smoothX * window.innerWidth}px`;
    cursorIndicator.style.top = `${smoothY * window.innerHeight}px`;

    const pinchProgress = Math.max(0, 1 - (pinchDistance / CONFIG.PINCH_THRESHOLD));
    const cursorScale = 1 - (pinchProgress * 0.3);
    cursorIndicator.style.transform = `translate(-50%, -50%) scale(${cursorScale})`;

    if (pinchProgress > 0.5) {
        cursorIndicator.style.borderColor = '#ffa502';
        cursorIndicator.style.boxShadow = `0 0 ${10 + pinchProgress * 20}px rgba(255, 165, 2, 0.5)`;
    } else {
        cursorIndicator.style.borderColor = '#00d9ff';
        cursorIndicator.style.boxShadow = '';
    }

    raycaster.setFromCamera(mouse, camera);
    const planeY = gameState.isDragging ? CONFIG.liftHeight : 0;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersection)) {
        cursor3D.position.lerp(intersection, 0.3);
        cursor3D.position.y = planeY + 0.2;
        cursor3D.visible = true;

        gameState.targetDiskPosition.x = intersection.x;
        gameState.targetDiskPosition.z = intersection.z;
    }
}

/**
 * Update gesture indicator UI
 */
export function updateGestureIndicator(isPinching, isDragging, pinchDistance) {
    const gestureIcon = document.getElementById('gesture-icon');
    const gestureText = document.getElementById('gesture-text');
    const cursorIndicator = document.getElementById('cursor-indicator');

    if (isPinching) {
        cursorIndicator.classList.add('grabbing');

        if (isDragging) {
            gestureIcon.className = 'gesture-icon grabbing';
            gestureIcon.textContent = '🤏';
            gestureText.textContent = 'Holding Disk';
        } else {
            gestureIcon.className = 'gesture-icon grabbing';
            gestureIcon.textContent = '🤏';
            gestureText.textContent = 'Pinching';
        }
    } else {
        cursorIndicator.classList.remove('grabbing');

        const pinchProgress = Math.max(0, 1 - (pinchDistance / CONFIG.PINCH_THRESHOLD));

        if (pinchProgress > 0.7) {
            gestureIcon.className = 'gesture-icon ready';
            gestureIcon.textContent = '👌';
            gestureText.textContent = 'Almost...';
        } else {
            gestureIcon.className = 'gesture-icon open';
            gestureIcon.textContent = '✋';
            gestureText.textContent = 'Open Hand';
        }
    }
}

/**
 * Handle gesture state changes
 */
export function handleGestureState(gameState, isPinching, raycaster, camera, mouse, DOM, showMessage, showDiskSelectionIndicator, hideDiskSelectionIndicator, startTimer) {
    if (gameState.animations.length > 0) return;

    // Pinch start
    if (isPinching && !gameState.lastPinchState) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(gameState.disks);

        if (intersects.length > 0 && !gameState.isDragging) {
            const disk = intersects[0].object;
            const diskIndex = disk.userData.diskIndex;
            const rodIndex = getDiskRod(gameState, diskIndex);
            const topDiskIndex = gameState.rods[rodIndex][gameState.rods[rodIndex].length - 1];

            if (diskIndex === topDiskIndex) {
                gameState.selectedDisk = disk;
                gameState.selectedDiskOriginalRod = rodIndex;
                gameState.isDragging = true;

                disk.material.emissiveIntensity = 0.8;
                disk.scale.set(1.05, 1.1, 1.05);
                disk.position.y = CONFIG.liftHeight;

                showDiskSelectionIndicator(disk);
                startTimer();
            }
        }
    }

    // Pinch release
    if (!isPinching && gameState.lastPinchState) {
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
            } else if (targetRod !== originalRod) {
                moveDisk(gameState, diskIndex, originalRod, false, DOM, showMessage);
            } else {
                const yPos = getStackYPosition(gameState, originalRod);
                animateDiskTo(gameState, disk, CONFIG.rodPositions[originalRod], yPos);
            }

            gameState.selectedDisk = null;
            gameState.isDragging = false;
        }
    }

    // While pinching - move disk
    if (isPinching && gameState.isDragging && gameState.selectedDisk) {
        const disk = gameState.selectedDisk;
        const followSpeed = gameState.DISK_FOLLOW_SPEED;
        const targetX = gameState.targetDiskPosition.x;
        const targetZ = gameState.targetDiskPosition.z;

        disk.position.x += (targetX - disk.position.x) * followSpeed;
        disk.position.z += (targetZ - disk.position.z) * followSpeed;
        disk.position.y = CONFIG.liftHeight;

        const speed = Math.sqrt(
            Math.pow(targetX - disk.position.x, 2) +
            Math.pow(targetZ - disk.position.z, 2)
        );
        disk.material.emissiveIntensity = 0.5 + Math.min(speed * 0.5, 0.3);
    }
}
