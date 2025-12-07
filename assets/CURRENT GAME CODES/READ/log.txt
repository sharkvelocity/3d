# AI AGENT IMPORTANT NOTE: Always update these logs and read the context before deciding what the issue might be, so that way you wont do the same thing twice.
# =================================================================================================================
# AI AGENT DIRECTIVES & CONTEXT LOG
#
# FOR THE AI AGENT:
# 1. This document is your primary source of architectural and historical context for the PhasmaPhoney project.
# 2. Before making any changes, review this document and the `source_of_truth.txt` file to understand the current implementation and intended mechanics.
# 3. When you make a significant change to the application's architecture, logic, or add a new feature, you MUST update this log.
# 4. Do NOT remove information. If a feature or issue is no longer relevant, comment it out using `#` at the beginning of each line and add a brief note explaining the resolution.
# 5. The goal is to maintain a living document that accurately reflects the project's evolution, helping you make informed decisions in future interactions. `source_of_truth.txt` is for game rules, this file is for code architecture.
# 6. For a detailed history of specific bugs, performance bottlenecks, and their resolutions, refer to READ/discrepancy_log.txt.

# README.ai: PhasmaPhoney Application Deep Dive

## 1. High-Level Overview

PhasmaPhoney is an immersive 3D ghost-hunting investigation game built for the web. Players take on the role of a paranormal investigator tasked with entering a haunted location, gathering evidence using specialized equipment, and correctly identifying the type of entity they are dealing with.

The game is designed to be highly replayable, featuring procedurally generated house layouts, randomized ghost types, and varying weather conditions that impact gameplay. It leverages a modern web technology stack to deliver a rich, interactive experience directly in the browser.

**Core Technologies:**
- **UI Framework:** React
- **3D Rendering:** Babylon.js
- **State Management:** Zustand
- **Physics:** Cannon.js

---

## 2. Project Architecture & File Structure

The application is structured around a React component architecture to separate UI, 3D rendering, and game logic concerns.

```
.
├── App.tsx
├── components/
│   ├── GameCanvas.tsx
│   ├── HUD.tsx
│   ├── Journal.tsx
│   ├── LoadingScreen.tsx
│   ├── MainMenu.tsx
│   └── hooks/
│       ├── useGameLogic.ts
│       └── usePlayerInput.ts
├── data/
│   ├── ... (ghosts, items, maps)
├── services/
│   ├── HouseBuilder.ts
│   ├── SoundManager.ts
│   └── layouts.ts
├── index.html
├── index.tsx
├── store.ts
└── types.ts
```

### Core Components & Hooks
- **`App.tsx`**: The top-level React component that acts as a router, controlling which primary UI view is visible based on the current `gameState` from the Zustand store (e.g., `MainMenu`, `LoadingScreen`, `GameCanvas`).
- **`components/GameCanvas.tsx`**: The most critical component, responsible for the entire 3D world. It initializes and manages the Babylon.js engine, scene, and cameras. It handles all player input, manages the dynamic loading of 3D assets, contains the main render loop, and controls visual effects.
- **`components/MainMenu.tsx`**: Renders the multi-step main menu, including map selection and the equipment loadout screen. The loadout screen features a two-column, text-based layout where players select their three items for an investigation. It includes hover-activated tooltips for item descriptions.
- **`components/HUD.tsx`**: The main Heads-Up Display for the `Playing` state.
- **`components/Journal.tsx`**: The in-game journal for tracking evidence and making a final ghost guess.
- **`components/LoadingScreen.tsx`**: Displays while game assets are being loaded. It features a dynamic loading bar where a randomly chosen, floating ghost icon "chases" a randomly chosen, running player icon across the screen to indicate progress.
- **`components/hooks/useGameLogic.ts`**: A custom React hook that contains the core, non-rendering game logic. Its primary responsibility is managing the Ghost AI decision-making loop, player sanity drain, and the dynamic temperature simulation. It replaces the previous `GameLogic.ts` class.
- **`components/hooks/usePlayerInput.ts`**: A custom hook for centralizing all keyboard and mouse input, updating the Zustand store with player actions. It replaces the previous `InputManager.ts` class.

### `services/` - Core Logic & External APIs
- **`HouseBuilder.ts`**: This service consumes layout data to construct the 3D house mesh using Babylon.js's `MeshBuilder` and `Mesh.MergeMeshes` for performance.
- **`SoundManager.ts`**: A dedicated class for managing all audio in the game using Babylon.js's audio engine.
- **`layouts.ts`**: Generates a data structure defining rooms and their connections for procedural generation.

---

## 3. Core Gameplay Systems

### State Management & Game Flow
The game's flow is dictated by the `gameState` enum in the Zustand store.
1.  **`MainMenu`**: Initial state, driven by `MainMenu.tsx`.
2.  **`Loading`**: Triggered by `startInvestigation`. `GameCanvas.tsx` loads assets while `LoadingScreen.tsx` is displayed.
3.  **`Playing`**: Once loaded, `GameCanvas.tsx` and `HUD.tsx` are active. The core game loops in `useGameLogic.ts` (AI, sanity) begin.
4.  **`Journal`**: A temporary state toggled during `Playing`.
5.  **`GameOver`**: Triggered by player death or a submitted guess. An end game screen is shown before resetting to the `MainMenu`.

### Ghost AI and Hunt Mechanics
- The ghost's "brain" resides in `useGameLogic.ts`. It's a probabilistic AI that runs on `setInterval` loops managed by the hook's lifecycle.
- During a hunt, the ghost becomes visible and actively chases the player. Its movement logic is handled in the `GameCanvas.tsx` render loop.

---

## 4. Architectural History & Known Issues

# [ARCHITECTURAL NOTE] This project has been refactored back to a React and Babylon.js architecture at the user's request. The previous vanilla TypeScript/Three.js implementation, which was created to solve stability issues with the original React/Babylon stack, has been completely replaced. This new architecture aims to provide better component-based separation of concerns while leveraging the powerful features of the Babylon.js engine. All code should now follow React principles.

1.  **Performance Consideration:** The procedural house generation, while now using performant mesh merging instead of CSG, can still be a computationally intensive step during loading.
2.  **CDN Dependencies:** The project relies on an `importmap` and CDNs (`esm.sh`) for its dependencies. This is suitable for rapid development but is not ideal for a production environment due to potential external points of failure.
3.  **State Management Pattern:** The use of `useStore.getState()` inside callbacks and effects is a recurring pattern. While a valid way to access the latest state, it must be used carefully to avoid bugs related to stale state. Reactive selectors (`useStore(state => state.someValue)`) are preferred inside component render bodies.