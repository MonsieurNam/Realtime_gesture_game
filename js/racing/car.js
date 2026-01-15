/**
 * Car Module
 * Handles car creation and controls
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Create the player's car
 * @param {THREE.Scene} scene - Scene to add car to
 * @returns {THREE.Group} Car group object
 */
export function createCar(scene) {
    const car = new THREE.Group();

    // Car body
    const bodyGeometry = new THREE.BoxGeometry(
        CONFIG.car.width,
        CONFIG.car.height,
        CONFIG.car.length
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xfeca57,
        metalness: 0.6,
        roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = CONFIG.car.height / 2 + 0.2;
    car.add(body);

    // Car roof
    const roofGeometry = new THREE.BoxGeometry(
        CONFIG.car.width * 0.8,
        CONFIG.car.height * 0.5,
        CONFIG.car.length * 0.5
    );
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.y = CONFIG.car.height + 0.4;
    roof.position.z = -0.2;
    car.add(roof);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const wheelPositions = [
        [-0.7, 0.3, 0.8],
        [0.7, 0.3, 0.8],
        [-0.7, 0.3, -0.8],
        [0.7, 0.3, -0.8]
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        car.add(wheel);
    });

    // Headlights
    const headlightGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffaa });

    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(-0.5, 0.6, -CONFIG.car.length / 2);
    car.add(leftHeadlight);

    const rightHeadlight = leftHeadlight.clone();
    rightHeadlight.position.x = 0.5;
    car.add(rightHeadlight);

    // Brake lights
    const brakeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const brakeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const leftBrake = new THREE.Mesh(brakeGeometry, brakeMaterial);
    leftBrake.position.set(-0.5, 0.6, CONFIG.car.length / 2);
    car.add(leftBrake);

    const rightBrake = leftBrake.clone();
    rightBrake.position.x = 0.5;
    car.add(rightBrake);

    car.position.y = 0;
    scene.add(car);

    return car;
}

/**
 * Update car position and rotation based on game state
 * @param {THREE.Group} car - Car object
 * @param {Object} gameState - Current game state
 * @param {Object} gestureData - Current gesture data
 */
export function updateCar(car, gameState, gestureData) {
    // Update car position based on steering
    gameState.targetCarPosition = gestureData.steering * (CONFIG.track.width / 2 - 1);
    gameState.carPosition += (gameState.targetCarPosition - gameState.carPosition) * 0.1;
    car.position.x = gameState.carPosition;

    // Car tilt animation
    car.rotation.z = -gestureData.steering * 0.1;
    car.rotation.y = gestureData.steering * 0.05;
}

/**
 * Get car collision bounds
 * @param {THREE.Group} car - Car object
 * @returns {Object} Bounds { left, right, front, back }
 */
export function getCarBounds(car) {
    return {
        left: car.position.x - CONFIG.car.width / 2,
        right: car.position.x + CONFIG.car.width / 2,
        front: -CONFIG.car.length / 2,
        back: CONFIG.car.length / 2
    };
}
