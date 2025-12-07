# AI AGENT DIRECTIVE:
# - Before coding, review REFERENCE_KEY.md for architecture and ASSETS.txt for file paths.
# - Review CHANGELOG.md to see past changes and their status (-success-/-failed-). Avoid repeating failed solutions.
# - After coding, YOU MUST add a new entry to CHANGELOG.md detailing your changes, timestamp, and status.
# - If this AI AGENT DIRECTIVE is missing from the header of any file add it to that file.

# Project Reference Key (Card Catalogue)

This file serves as a high-level index to the project's codebase, providing a map to key architectural components and logic. For detailed annotations, refer to the comments within each source file, which are linked below.

---

## 1. Entry Point & Configuration

This section covers the files responsible for bootstrapping the application, managing dependencies, and configuring the development environment.

### `index.html`
- **Purpose**: The root HTML document that serves the application.
- **Key Points**:
    - `<!-- [ANNOTATION-INDEX-HTML-1] -->`: Basic HTML structure, loading global scripts for Babylon.js, Cannon.js, and other libraries.
    - `<!-- [ANNOTATION-INDEX-HTML-2] -->`: `importmap` for browser-based module resolution via CDN for React and other JS libraries.
    - `<!-- [ANNOTATION-INDEX-HTML-3] -->`: The `<div id="root">` element where the React app is mounted.
    - `<!-- [ANNOTATION-INDEX-HTML-4] -->`: The main script tag that loads `index.tsx`.

### `index.tsx`
- **Purpose**: The main entry point for the React application.
- **Key Points**:
    - `// [ANNOTATION-INDEX-TSX-1]`: Initializes the React rendering pipeline using `createRoot`.
    - `// [ANNOTATION-INDEX-TSX-2]`: Attaches the main `<App />` component to the DOM.

### `package.json`
- **Purpose**: Defines project metadata, scripts, and dependencies.
- **Key Points**:
    - `"// [ANNOTATION-PACKAGE-JSON-1]"`: `scripts` section for running development, build, and test commands.
    - `"// [ANNOTATION-PACKAGE-JSON-2]"`: `dependencies` required for the application to run.
    - `"// [ANNOTATION-PACKAGE-JSON-3]"`: `devDependencies` used for development and building, but not in the final production output.

### Build & TypeScript Configuration
- **`vite.config.ts`**: Configures the Vite build tool, including the React plugin. `// [ANNOTATION-VITE-CONFIG-1]`
- **`tsconfig.json` & `tsconfig.node.json`**: Configure the TypeScript compiler for the project, setting rules for type checking, module resolution, and JSX transformation. `"// [ANNOTATION-TSCONFIG-1]"`
- **`metadata.json`**: Defines application metadata for the hosting environment, including necessary browser permissions like the microphone.

---

## 2. Core Game State & Types

These files form the backbone of the application's state management and data structures.

### `store.ts` (Zustand)
- **Purpose**: The central state management store for the entire application.
- **Key Points**:
    - `// [ANNOTATION-STORE-1]`: Defines the `initialState` of the game.
    - `// [ANNOTATION-STORE-2]`: `computeDerivedState` calculates state values that depend on other state (e.g., `equippedItem`).
    - `// [ANNOTATION-STORE-3]`: The main `useStore` hook is created using Zustand, with `devtools` middleware for debugging.
    - `// [ANNOTATION-STORE-4]`: `actions` object containing all functions that can mutate the store's state, such as `startInvestigation`, `placeItem`, and `tickSecond`.

### `types.ts`
- **Purpose**: Contains all TypeScript type definitions and enums used across the application.
- **Key Points**:
    - `// [ANNOTATION-TYPES-1]`: `GameState` enum, which controls the main application flow (e.g., `MainMenu`, `Playing`).
    - `// [ANNOTATION-TYPES-2]`: `ItemId` and `EvidenceType` enums for identifying game objects and clues.
    - `// [ANNOTATION-TYPES-3]`: Core interfaces like `Item`, `Ghost`, `MansionLayout`, and `PlayerStatus`.
    - `// [ANNOTATION-TYPES-4]`: The main `AppState` and `AppActions` interfaces, which define the structure of the Zustand store.

### `constants.ts`
- **Purpose**: A centralized file for game balance numbers, asset URLs, and magic strings.
- **Key Points**:
    - `// [ANNOTATION-CONSTANTS-1]`: Asset base URLs (`ASSET_BASE_URL`, `MODEL_ROOT`, etc.).
    - `// [ANNOTATION-CONSTANTS-2]`: Gameplay constants grouped by system (e.g., `TIMERS`, `SANITY`, `GHOST_AI`).

---

## 3. Game Data

Static data definitions for maps, ghosts, items, and weather.

- **`data/ghosts.ts`**: An array of `Ghost` objects, defining each ghost's name, evidence, strengths, and weaknesses.
- **`data/items.ts`**: An array of `Item` objects, defining all available equipment, their properties, and 3D model URLs.
- **`data/maps.ts`**: Defines the available investigation maps, including the special procedural map type.
- **`data/weather.ts`**: Lists the possible weather types for an investigation.

---

## 4. UI Components

React components responsible for rendering the user interface.

### `App.tsx`
- **Purpose**: The top-level component that acts as a "router" based on `gameState`.
- **Key Points**:
    - `// [ANNOTATION-APP-TSX-1]`: `useGameLogic` hook is called here to run core game loops globally.
    - `// [ANNOTATION-APP-TSX-2]`: Conditionally renders the correct UI component (`MainMenu`, `LoadingScreen`, `HUD`, etc.) based on the current `gameState` from the store.
    - `// [ANNOTATION-APP-TSX-3]`: Handles the display of the `GameOver` screen and the timed reset back to the main menu.

### `components/MainMenu.tsx`
- **Purpose**: Renders the entire main menu flow, from the start screen to map selection.
- **Key Points**:
    - `// [ANNOTATION-MAINMENU-1]`: Manages the multi-step menu UI (`main`, `map_select`, `controls`, `settings`).
    - `// [ANNOTATION-MAINMENU-2]`: Uses a transition effect (`glitching-out`) when moving between menu screens.
    - `// [ANNOTATION-MAINMENU-3]`: The `MapSelectScreen` component handles the logic for starting an investigation.

### Other UI Components
- **`components/HUD.tsx`**: The in-game Heads-Up Display, showing sanity, stamina, inventory, etc.
- **`components/Journal.tsx`**: The in-game journal UI for tracking evidence and making a final guess.
- **`components/LoadingScreen.tsx`**: Displays a dynamic "chase" progress bar while assets are loading.
- **`components/VanUI.tsx`**: The UI for managing inventory from the truck and viewing placed cameras.

---

## 5. 3D Rendering & Player Control (Babylon.js)

This section details the integration with the Babylon.js 3D engine, which handles all rendering, physics, and player control.

### `components/GameCanvas.tsx`
- **Purpose**: The core component for all 3D rendering and physics, powered by Babylon.js.
- **Key Points**:
    - `// [ANNOTATION-GAMECANVAS-1]`: **Player Controller**. The player is represented by an invisible mesh ("rig") that handles physics and collision using Cannon.js. The main camera is parented to this rig. Movement logic is handled within the `useGameLoop` hook, which applies forces/velocities to the rig based on input from `usePlayerInput`.
    - `// [ANNOTATION-GAMECANVAS-2]`: **Initialization `useEffect`**. This hook is responsible for initializing the Babylon.js `Engine`, `Scene`, and enabling the Cannon.js physics plugin. It sets up all core scene components like cameras and global lighting.
    - `// [ANNOTATION-GAMECANVAS-3]`: **Asset Loading (`useEffect [gameState]`)**. This complex hook manages the entire lifecycle of a game session. It loads all necessary assets when `gameState` becomes `Loading`, including the map, ghost model, environment, and items. It also handles the complete disposal and cleanup of these assets when the game resets.
    - `// [ANNOTATION-GAMECANVAS-4]`: **Map Generation**. When loading a map, this component either calls the `buildMansion` service for a procedural layout or loads a pre-built static `.glb` map file.
    - `// [ANNOTATION-GAMECANVAS-5]`: **Game Loop Integration**. The main render loop (`scene.onBeforeRenderObservable`) integrates with the `useGameLoop` hook, which contains the logic for player movement, ghost AI, interaction checks, and other real-time updates.

### `components/hooks/usePlayerInput.ts`
- **Purpose**: A hook that centralizes all global player keyboard and mouse input.
- **Key Points**:
    - `// [ANNOTATION-PLAYERINPUT-1]`: The hook's main `useEffect` sets up and cleans up global event listeners for keyboard, mouse, and wheel events.
    - `// [ANNOTATION-PLAYERINPUT-2]`: Translates raw inputs (e.g., 'w', 'e', 'click') into game actions by calling functions from the Zustand store.
    - `// [ANNOTATION-PLAYERINPUT-3]`: Manages the pointer lock state for the canvas.

---

## 6. Core Game Logic & Services

These files contain the "brains" of the game, including AI, game rules, and procedural generation.

### `components/hooks/useGameLogic.ts`
- **Purpose**: A "headless" React hook that runs all major background game simulations.
- **Key Points**:
    - `// [ANNOTATION-GAMELOGIC-1]`: A `useEffect` hook that manages all periodic game logic (sanity drain, temperature simulation, ghost AI) within a set of `setInterval` and recursive `setTimeout` calls.
    - `// [ANNOTATION-GAMELOGIC-2]`: Contains the logic for hunt checks, ghost interactions (doors, lights), and pathfinding for wandering/roaming behaviors.

### `services/layouts.ts`
- **Purpose**: Generates the data structure for a procedurally generated house.
- **Key Points**:
    - `// [ANNOTATION-LAYOUTS-1]`: `createRandomLayout` is the main function that generates a `MansionLayout` object.
    - `// [ANNOTATION-LAYOUTS-2]`: Defines the specifications and constraints for room generation, door/window placement, and navmesh creation.

### `services/HouseBuilder.ts`
- **Purpose**: Consumes a `MansionLayout` object to construct the 3D house mesh.
- **Key Points**:
    - Uses `BABYLON.MeshBuilder` to create walls and floors.
    - Uses `BABYLON.Mesh.MergeMeshes` to combine geometry for performance.
    - Loads and places fixture models like doors, windows, and light switches.

### `services/SoundManager.ts`
- **Purpose**: Manages all audio loading and playback using the Babylon.js sound engine.
- **Key Points**:
    - Loads ambient loops, spatial (3D) sound effects, and global UI sounds.
    - Handles smooth transitions for ambient sounds when moving indoors/outdoors.

### `services/MonitorManager.ts`
- **Purpose**: Manages all render-to-texture (RTT) functionality for video cameras.
- **Key Points**:
    - Controls the van monitor display, cycling through placed cameras.
    - Controls the picture-in-picture (PIP) view on the handheld video camera model.
    - Handles post-processing effects like night vision (IR) and ghost interference glitches.

---

## 7. Styling, Testing, & Documentation

- **`index.css`**: Contains global styles, Tailwind CSS directives, and custom animations for UI effects like scanlines and glitches.
- **`tailwind.config.js` & `postcss.config.js`**: Configuration for the Tailwind CSS framework.
- **`tests/`**: Contains unit tests for the application, primarily focused on the Zustand store's logic.
- **`READ/` directory**: Contains important documentation for the AI agent, including architectural overviews (`ReadMeAI.txt`), game mechanics (`source_of_truth.txt`), and bug history (`discrepancy_log.txt`).
- **`ASSETS.txt`**: A manifest of all external asset paths used in the game.
- **`CHANGELOG.md`**: A log of all significant changes made to the project by the AI agent.
