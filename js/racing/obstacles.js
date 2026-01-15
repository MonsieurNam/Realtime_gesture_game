/**
 * Obstacles Module
 * Handles obstacle creation, movement, and collision detection
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { getCarBounds } from './car.js';

/**
 * Create a new obstacle
 * @param {THREE.Scene} scene - Scene to add obstacle to
 * @param {Array} obstacles - Existing obstacles array
 * @returns {THREE.Mesh|null} New obstacle or null if too close to existing
 */
export function createObstacle(scene, obstacles) {
    const { minSpawnDistance, spawnZ, size } = CONFIG.obstacle;

    // Check minimum distance from other obstacles
    for (const obs of obstacles) {
        if (Math.abs(obs.position.z - spawnZ) < minSpawnDistance) {
            return null; // Don't spawn if too close
        }
    }

    const lane = CONFIG.track.lanePositions[
        Math.floor(Math.random() * CONFIG.track.lanePositions.length)
    ];

    const obstacleGeometry = new THREE.BoxGeometry(size, size, size);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0xff0000,
        emissiveIntensity: 0.3,
        metalness: 0.5,
        roughness: 0.5
    });

    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    obstacle.position.set(lane, 0.6, spawnZ);
    obstacle.userData = { lane: lane };

    scene.add(obstacle);

    return obstacle;
}

/**
 * Update obstacles positions and check for removal
 * @param {THREE.Scene} scene - Scene containing obstacles
 * @param {Array} obstacles - Array of obstacle meshes
 * @param {number} speed - Current game speed
 * @returns {Array} Updated obstacles array
 */
export function updateObstacles(scene, obstacles, speed) {
    const updatedObstacles = [];

    for (const obstacle of obstacles) {
        obstacle.position.z += speed;
        obstacle.rotation.y += 0.02;

        // Remove obstacles that passed
        if (obstacle.position.z > 15) {
            scene.remove(obstacle);
        } else {
            updatedObstacles.push(obstacle);
        }
    }

    return updatedObstacles;
}

/**
 * Check collision between car and obstacles
 * @param {THREE.Group} car - Car object
 * @param {Array} obstacles - Array of obstacle meshes
 * @returns {Object|null} Collided obstacle or null
 */
export function checkCollision(car, obstacles) {
    const carBounds = getCarBounds(car);
    const halfSize = CONFIG.obstacle.size / 2;

    for (const obstacle of obstacles) {
        const obsBounds = {
            left: obstacle.position.x - halfSize,
            right: obstacle.position.x + halfSize,
            front: obstacle.position.z - halfSize,
            back: obstacle.position.z + halfSize
        };

        if (carBounds.right > obsBounds.left &&
            carBounds.left < obsBounds.right &&
            carBounds.back > obsBounds.front &&
            carBounds.front < obsBounds.back) {
            return obstacle;
        }
    }

    return null;
}

/**
 * Remove obstacle from scene and array
 * @param {THREE.Scene} scene - Scene containing obstacle
 * @param {Array} obstacles - Array of obstacles
 * @param {THREE.Mesh} obstacle - Obstacle to remove
 * @returns {Array} Updated obstacles array
 */
export function removeObstacle(scene, obstacles, obstacle) {
    scene.remove(obstacle);
    return obstacles.filter(obs => obs !== obstacle);
}

/**
 * Clear all obstacles from scene
 * @param {THREE.Scene} scene - Scene containing obstacles
 * @param {Array} obstacles - Array of obstacles
 */
export function clearObstacles(scene, obstacles) {
    obstacles.forEach(obs => scene.remove(obs));
}
