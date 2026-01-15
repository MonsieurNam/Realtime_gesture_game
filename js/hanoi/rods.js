/**
 * Tower of Hanoi - Rods and Base Module
 */

import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Create the game base platform
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh}
 */
export function createBase(scene) {
    // Create wooden-looking base platform
    const baseGeometry = new THREE.BoxGeometry(12, 0.4, 4);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.1
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.2;
    base.receiveShadow = true;
    scene.add(base);

    // Add decorative edge
    const edgeGeometry = new THREE.BoxGeometry(12.2, 0.1, 4.2);
    const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x654321,
        roughness: 0.7,
        metalness: 0.2
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.position.y = 0.05;
    scene.add(edge);

    // Floor for shadows
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    floor.receiveShadow = true;
    scene.add(floor);

    return base;
}

/**
 * Create all rods
 * @param {THREE.Scene} scene
 * @returns {THREE.Mesh[]}
 */
export function createRods(scene) {
    const rods = [];

    CONFIG.rodPositions.forEach((xPos, index) => {
        // Rod cylinder
        const rodGeometry = new THREE.CylinderGeometry(
            CONFIG.rodRadius,
            CONFIG.rodRadius,
            CONFIG.rodHeight,
            16
        );
        const rodMaterial = new THREE.MeshStandardMaterial({
            color: 0xC0C0C0,
            roughness: 0.3,
            metalness: 0.8
        });
        const rod = new THREE.Mesh(rodGeometry, rodMaterial);
        rod.position.set(xPos, CONFIG.rodHeight / 2, 0);
        rod.castShadow = true;
        rod.userData.rodIndex = index;
        scene.add(rod);
        rods.push(rod);

        // Rod base (decorative)
        const baseGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.1, 16);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0xA0A0A0,
            roughness: 0.4,
            metalness: 0.7
        });
        const rodBase = new THREE.Mesh(baseGeometry, baseMaterial);
        rodBase.position.set(xPos, 0.05, 0);
        scene.add(rodBase);

        // Rod top (decorative ball)
        const topGeometry = new THREE.SphereGeometry(0.12, 8, 8);
        const top = new THREE.Mesh(topGeometry, rodMaterial);
        top.position.set(xPos, CONFIG.rodHeight, 0);
        top.castShadow = true;
        scene.add(top);
    });

    return rods;
}
