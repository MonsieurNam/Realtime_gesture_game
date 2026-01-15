/**
 * Tower of Hanoi - Disks Module
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Create all disks on the first rod
 * @param {THREE.Scene} scene
 * @param {Object} gameState
 * @param {Object} DOM - DOM element cache
 */
export function createDisks(scene, gameState, DOM) {
    // Remove existing disks
    gameState.disks.forEach(disk => scene.remove(disk));
    gameState.disks = [];
    gameState.rods = [[], [], []];

    const numDisks = gameState.numDisks;
    const radiusStep = (CONFIG.diskMaxRadius - CONFIG.diskMinRadius) / (numDisks - 1 || 1);

    for (let i = 0; i < numDisks; i++) {
        const radius = CONFIG.diskMaxRadius - i * radiusStep;

        const diskGeometry = new THREE.CylinderGeometry(
            radius,
            radius,
            CONFIG.diskHeight,
            16
        );

        const diskMaterial = new THREE.MeshStandardMaterial({
            color: CONFIG.diskColors[i % CONFIG.diskColors.length],
            roughness: 0.4,
            metalness: 0.3,
            emissive: CONFIG.diskColors[i % CONFIG.diskColors.length],
            emissiveIntensity: 0.1
        });

        const disk = new THREE.Mesh(diskGeometry, diskMaterial);
        disk.castShadow = true;
        disk.receiveShadow = true;

        disk.userData = {
            diskIndex: i,
            size: numDisks - i,
            radius: radius,
            originalColor: CONFIG.diskColors[i % CONFIG.diskColors.length]
        };

        const yPos = i * (CONFIG.diskHeight + CONFIG.diskGap) + CONFIG.diskHeight / 2;
        disk.position.set(CONFIG.rodPositions[0], yPos, 0);

        scene.add(disk);
        gameState.disks.push(disk);
        gameState.rods[0].push(i);
    }

    // Update minimum moves display
    if (DOM.minMoves) {
        DOM.minMoves.textContent = Math.pow(2, numDisks) - 1;
    }
}

/**
 * Get the rod index that a disk is currently on
 */
export function getDiskRod(gameState, diskIndex) {
    for (let rodIndex = 0; rodIndex < 3; rodIndex++) {
        if (gameState.rods[rodIndex].includes(diskIndex)) {
            return rodIndex;
        }
    }
    return -1;
}

/**
 * Find the nearest rod to a given x position
 */
export function getNearestRod(xPos) {
    let nearestRod = 0;
    let minDist = Infinity;

    CONFIG.rodPositions.forEach((rodX, index) => {
        const dist = Math.abs(xPos - rodX);
        if (dist < minDist) {
            minDist = dist;
            nearestRod = index;
        }
    });

    return nearestRod;
}

/**
 * Get the Y position for stacking a disk on a rod
 */
export function getStackYPosition(gameState, rodIndex) {
    const stackHeight = gameState.rods[rodIndex].length;
    return stackHeight * (CONFIG.diskHeight + CONFIG.diskGap) + CONFIG.diskHeight / 2;
}

/**
 * Check if a move is valid
 */
export function isValidMove(gameState, diskSize, targetRod) {
    const targetStack = gameState.rods[targetRod];

    if (targetStack.length === 0) {
        return true;
    }

    const topDiskIndex = targetStack[targetStack.length - 1];
    const topDiskSize = gameState.disks[topDiskIndex].userData.size;

    return diskSize < topDiskSize;
}

/**
 * Animate a disk to a target position
 */
export function animateDiskTo(gameState, disk, targetX, targetY) {
    const animation = {
        disk: disk,
        startPos: disk.position.clone(),
        targetPos: new THREE.Vector3(targetX, targetY, 0),
        progress: 0,
        phase: 'lift'
    };
    gameState.animations.push(animation);
}

/**
 * Move a disk to a new rod
 */
export function moveDisk(gameState, diskIndex, targetRod, isValid, DOM, showMessage) {
    const disk = gameState.disks[diskIndex];
    const currentRod = getDiskRod(gameState, diskIndex);

    if (isValid) {
        const targetStackHeight = gameState.rods[targetRod].length;
        const targetY = targetStackHeight * (CONFIG.diskHeight + CONFIG.diskGap) + CONFIG.diskHeight / 2;
        const targetX = CONFIG.rodPositions[targetRod];

        // Remove from current rod
        const currentStack = gameState.rods[currentRod];
        currentStack.splice(currentStack.indexOf(diskIndex), 1);

        // Add to target rod
        gameState.rods[targetRod].push(diskIndex);

        // Increment move count
        gameState.moveCount++;
        if (DOM.moveCount) {
            DOM.moveCount.textContent = gameState.moveCount;
        }

        // Animate
        animateDiskTo(gameState, disk, targetX, targetY);
    } else {
        if (showMessage) showMessage('Invalid Move!', 'error');

        const stackIndex = gameState.rods[currentRod].indexOf(diskIndex);
        const originalY = stackIndex * (CONFIG.diskHeight + CONFIG.diskGap) + CONFIG.diskHeight / 2;
        const originalX = CONFIG.rodPositions[currentRod];

        animateDiskTo(gameState, disk, originalX, originalY);
    }
}

/**
 * Process disk animations
 */
export function processAnimations(gameState) {
    const completedAnimations = [];

    gameState.animations.forEach((anim, index) => {
        const disk = anim.disk;
        const speed = CONFIG.animationSpeed;

        switch (anim.phase) {
            case 'lift':
                disk.position.y += (CONFIG.liftHeight - disk.position.y) * speed * 2;
                if (Math.abs(disk.position.y - CONFIG.liftHeight) < 0.05) {
                    disk.position.y = CONFIG.liftHeight;
                    anim.phase = 'move';
                }
                break;

            case 'move':
                disk.position.x += (anim.targetPos.x - disk.position.x) * speed;
                disk.position.z += (anim.targetPos.z - disk.position.z) * speed;

                if (Math.abs(disk.position.x - anim.targetPos.x) < 0.05 &&
                    Math.abs(disk.position.z - anim.targetPos.z) < 0.05) {
                    disk.position.x = anim.targetPos.x;
                    disk.position.z = anim.targetPos.z;
                    anim.phase = 'drop';
                }
                break;

            case 'drop':
                disk.position.y += (anim.targetPos.y - disk.position.y) * speed * 2;
                if (Math.abs(disk.position.y - anim.targetPos.y) < 0.05) {
                    disk.position.y = anim.targetPos.y;
                    completedAnimations.push(index);
                }
                break;
        }
    });

    completedAnimations.reverse().forEach(index => {
        gameState.animations.splice(index, 1);
    });
}

/**
 * Check if the game is won
 */
export function checkWinCondition(gameState, DOM) {
    if (gameState.rods[2].length === gameState.numDisks) {
        gameState.isPlaying = false;
        clearInterval(gameState.timerInterval);

        setTimeout(() => {
            if (DOM.winStats) {
                DOM.winStats.textContent = `Moves: ${gameState.moveCount} | Time: ${DOM.timer.textContent}`;
            }
            if (DOM.winOverlay) {
                DOM.winOverlay.classList.add('show');
            }
        }, 500);

        return true;
    }
    return false;
}
