# 🎮 Gesture Games Hub

A collection of gesture-controlled games using MediaPipe and Three.js.

## Games Included

- **🏎️ Hand Racing** - Race through a neon track with hand gestures
- **🗼 Tower of Hanoi** - Solve the classic puzzle in 3D with pinch gestures

## Project Structure

```
final_project/
├── index.html          # Main hub with game selection
├── css/
│   ├── main.css        # Shared base styles
│   ├── hub.css         # Hub-specific styles
│   ├── racing-game.css # Racing game styles
│   └── hanoi-game.css  # Tower of Hanoi styles
├── js/
│   ├── shared/         # Reusable utilities
│   ├── racing/         # Racing game modules
│   └── hanoi/          # Tower of Hanoi modules
└── games/
    ├── racing.html     # Hand Racing game
    └── hanoi.html      # Tower of Hanoi game
```

## How to Run

1. Open `index.html` in a browser
2. Click on a game card to play
3. Use "← Back to Hub" to return to selection

> **Note:** Both games work with `file://` protocol directly - no server required!

## Technologies

- **Three.js** - 3D graphics
- **MediaPipe** - Hand gesture recognition
- **Web Audio API** - Sound effects

## Controls

### Hand Racing
- ✋ Open palm = Accelerate
- ✊ Closed fist = Brake
- 👈👉 Tilt hands = Steer
- ⌨️ Arrow keys/WASD = Keyboard fallback

### Tower of Hanoi
- 🤏 Pinch to grab disks
- 🖱️ Mouse drag = Fallback mode
