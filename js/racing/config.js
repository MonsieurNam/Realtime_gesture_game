/**
 * Racing Game Configuration
 */

export const CONFIG = {
    difficulty: {
        easy: {
            baseSpeed: 0.3,
            maxSpeed: 0.8,
            obstacleFrequency: 0.005,
            scoreMultiplier: 1,
            maxObstacles: 3
        },
        medium: {
            baseSpeed: 0.5,
            maxSpeed: 1.2,
            obstacleFrequency: 0.008,
            scoreMultiplier: 1.5,
            maxObstacles: 4
        },
        hard: {
            baseSpeed: 0.7,
            maxSpeed: 1.5,
            obstacleFrequency: 0.012,
            scoreMultiplier: 2,
            maxObstacles: 5
        }
    },
    track: {
        width: 12,
        length: 200,
        laneCount: 3,
        lanePositions: [-3, 0, 3]
    },
    car: {
        width: 1.5,
        height: 0.8,
        length: 2.5
    },
    obstacle: {
        size: 1.2,
        minSpawnDistance: 25,
        spawnZ: -80
    },
    camera: {
        fov: 75,
        position: { x: 0, y: 3, z: 8 },
        lookAt: { x: 0, y: 0, z: -20 }
    },
    processInterval: 100 // MediaPipe frame processing interval (ms)
};

/**
 * Create initial game state
 */
export function createGameState() {
    return {
        isPlaying: false,
        score: 0,
        speed: 0,
        targetSpeed: 0,
        carPosition: 0,
        targetCarPosition: 0,
        difficulty: 'easy',
        highScore: parseInt(localStorage.getItem('handRacingHighScore') || '0'),
        audioEnabled: true
    };
}

/**
 * Create gesture data state
 */
export function createGestureData() {
    return {
        steering: 0,
        isAccelerating: false,
        isBraking: false,
        handsDetected: false
    };
}
