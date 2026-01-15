/**
 * Track Module
 * Handles road, lanes, and starfield creation
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Create the race track
 * @param {THREE.Scene} scene - Scene to add track to
 * @returns {Object} Track elements { road, roadLines, leftEdge, rightEdge }
 */
export function createTrack(scene) {
    const roadLines = [];

    // Road surface
    const roadGeometry = new THREE.PlaneGeometry(CONFIG.track.width, CONFIG.track.length);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d2d2d,
        roughness: 0.8,
        metalness: 0.2
    });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -CONFIG.track.length / 2;
    road.receiveShadow = true;
    scene.add(road);

    // Lane markings
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lineGeometry = new THREE.PlaneGeometry(0.2, 4);

    for (let z = 0; z > -CONFIG.track.length; z -= 8) {
        // Left lane line
        const leftLine = new THREE.Mesh(lineGeometry, lineMaterial);
        leftLine.rotation.x = -Math.PI / 2;
        leftLine.position.set(-2, 0.01, z);
        scene.add(leftLine);
        roadLines.push(leftLine);

        // Right lane line
        const rightLine = new THREE.Mesh(lineGeometry, lineMaterial);
        rightLine.rotation.x = -Math.PI / 2;
        rightLine.position.set(2, 0.01, z);
        scene.add(rightLine);
        roadLines.push(rightLine);
    }

    // Road edges (neon strips)
    const edgeMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6b6b,
        emissive: 0xff6b6b,
        emissiveIntensity: 0.5
    });
    const edgeGeometry = new THREE.BoxGeometry(0.3, 0.3, CONFIG.track.length);

    const leftEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    leftEdge.position.set(-CONFIG.track.width / 2, 0.15, -CONFIG.track.length / 2);
    scene.add(leftEdge);

    const rightEdge = leftEdge.clone();
    rightEdge.position.x = CONFIG.track.width / 2;
    scene.add(rightEdge);

    return { road, roadLines, leftEdge, rightEdge };
}

/**
 * Create starfield background
 * @param {THREE.Scene} scene - Scene to add stars to
 * @returns {THREE.Points} Starfield object
 */
export function createStarfield(scene) {
    const starCount = 300;
    const starGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 50 + 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200 - 50;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.5,
        transparent: true,
        opacity: 0.8
    });

    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    return starField;
}

/**
 * Update road lines position (scrolling effect)
 * @param {Array} roadLines - Array of line meshes
 * @param {number} speed - Current game speed
 */
export function updateRoadLines(roadLines, speed) {
    roadLines.forEach(line => {
        line.position.z += speed;
        if (line.position.z > 10) {
            line.position.z -= CONFIG.track.length;
        }
    });
}
