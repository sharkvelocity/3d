
## 2025-11-30 (Hotfix 48) - "Phonograph Restoration"

### Fixed
- **Phonograph**: Resolved an issue where the phonograph was difficult to interact with and would not stop playing music when toggled off.
    - **Audio**: Updated `OneShotAudioManager` to correctly track the active phonograph sound instance and stop it when requested.
    - **Interaction**: Added a dedicated invisible hitbox to the phonograph model in `HouseBuilder` to ensure reliable clicking, bypassing complex mesh geometry issues.

### Fixed
- **Summoning Circle**: Resolved an issue where the ghost would appear near the player instead of inside the circle during the summoning sequence.
- **Summoning Circle**: Fixed the Cursed Hunt logic. The Summoning Circle (and other cursed items) now correctly bypass the setup phase and hunt cooldown timers when triggering a hunt. This prevents the ghost from getting "stuck" in a manifest state if invoked early in the game.
- **GameCanvas**: Implemented a dedicated `summoning_circle_manifest` event to handle the specific visual requirements of the summoning ritual (forcing location retention).

### Changed
- **Store**: Updated `startHunt` action to accept and respect the `isCursed` flag, allowing specific events to override safety timers.

## 2025-11-30 (Hotfix 49) - "Weather Proofing"

### Fixed
- **Weather System**: Implemented instant removal (stop & reset) of weather particle systems when the player enters the house, and re-application when they exit. This prevents rain/snow from appearing indoors while maintaining the effect outside.

## 2025-11-30 (Feature) - "Auto-Save System"

### Added
- **Progression Saving**: Implemented `persist` middleware in the Zustand store.
    - Player Money (Secret Points), Kills, and Upgrades now automatically save to the browser's LocalStorage.
    - Game Settings (Volume, Sensitivity, Keybinds) are also persisted automatically.
    - Custom Loadouts are saved between sessions.

## 2025-11-30 (Hotfix 50) - "Front Door Logic Repair"

### Fixed
- **Front Door**: Fixed an issue where the front door initialized in an open state and could not be interacted with.
    - **Initialization**: Removed the legacy `isDoubleDoor` flag which was triggering broken manual rotation logic. The door now correctly uses the model's baked `AnimationGroups` via the `isPreAnimated` path.
    - **Interaction**: Forced the door animations to snap to Frame 0 (Closed) immediately upon spawning to correct the initial visual state.
    - **Logic**: Updated `InteractionHandler` and `GameCanvas` to remove deprecated double-door logic, ensuring consistent behavior for all animated doors.

## 2025-11-30 (Hotfix 51) - "Phonograph & Prop Repair"

### Fixed
- **Phonograph**: Resolved issues where the phonograph was hard to interact with or triggered from adjacent rooms.
    - **Interaction**: Decoupled the interaction hitbox from the visual mesh hierarchy. It is now placed precisely in world space based on the map layout, ensuring it remains accessible and correctly sized (1.0x1.5m).
- **Physics**: Fixed issues where plates would spawn inside the dining table or fall through it.
    - **Collision**: Explicitly assigned `COLLISION_GROUPS.FURNITURE` to static props to ensure proper physics interactions.
    - **Spawning**: Increased plate spawn height to `1.2` units to clear the table collider.
- **Rendering**: Fixed an issue where items could be seen through walls (X-Ray effect).
    - **Depth Test**: Forced `disableDepthTest = false` on all spawned item materials to ensure proper occlusion by walls.

## 2025-11-30 (Hotfix 52) - "Front Door Interaction & Gap Fix"

### Fixed
- **Front Door**: Fixed issue where the front door appeared slightly open and was impossible to interact with from outside.
    - **Initialization**: Updated `HouseBuilder` to use `goToFrame(0)` for a robust reset of the door animations on load, ensuring it is fully closed.
    - **Interaction**: Attached dedicated invisible Hitbox meshes (1.1m x 2.2m) to the animated door panels. These hitboxes move with the door animation and provide a reliable, pickable surface that bridges any visual gaps in the geometry.
    - **Occlusion**: Tweaked `InteractionHandler` to slightly increase reach distance (4.0m) and ensured the new hitboxes are correctly prioritized over wall collisions.

## 2025-11-30 (Hotfix 53) - "Singleton Model Optimization"

### Fixed
- **Front Door & Phonograph**: Prevented unnecessary cloning of singleton objects.
    - **Loading**: Updated `HouseBuilder` to use the original cached mesh instances for the Front Door and Phonograph instead of creating duplicate clones. This reduces memory overhead and simplifies object management.
    - **Logic**: Removed double-instantiation logic for the Front Door.
- **Phonograph**: Removed the "radio" static sound from the player's interaction playlist to prevent confusion with ghost events.

## 2025-11-30 (Hotfix 54) - "Interaction & Audio Tuning"

### Fixed
- **Front Door**: Fixed an issue where the front door would animate on an infinite loop.
    - **Animation**: Updated `InteractionHandler` to control animation direction using `speedRatio` (-1.0 for closing, 1.0 for opening) instead of swapping frame indices. Explicitly prevented looping behavior in the `start` call.
- **Phonograph**: Fixed issue where music was inaudible or didn't play.
    - **Audio Range**: Increased the spatial audio `maxDistance` for the phonograph from 6m to 15m to ensure it can be heard clearly within the room.

## 2025-11-30 (Hotfix 55) - "Sanity & Sound Restore"

### Fixed
- **Sanity System**: Fixed an issue where player sanity remained at 100% indefinitely.
    - **Logic**: Implemented the missing `isInDark` and `isNearGhost` calculation logic within `useGameLoop.ts`. The player status is now correctly updated in the global store, enabling the sanity drain simulation in `useGameLogic.ts`.
- **Audio System**: Fixed an issue where game sounds would fail to play.
    - **Initialization**: Updated `SoundManager.ts` to forcibly unlock the `BABYLON.Engine.audioEngine` upon initialization and before starting ambient loops. This prevents browser autoplay policies from silencing the game.

## 2025-11-30 (Hotfix 56) - "Ghost Event Loop & Music Fix"

### Fixed
- **Ghost Events**: Resolved a critical issue where "Fake Hunt" events would loop indefinitely (heartbeat and visual distortion).
    - **Logic**: Added a failsafe `setTimeout` (5 seconds) to the `fake_hunt` case in `GameCanvas.tsx` to explicitly end the event and cleanup effects.
- **Ghost AI**: Fixed an issue where the ghost would rapidly open/close the same door, appearing as a "loop".
    - **AI**: Implemented a cooldown (5 seconds) for `door_interaction` targets in `useGameLogic.ts`, forcing the ghost to interact with other objects or wander instead of spamming.
- **Music Box**: Resolved issue where the Music Box (Cursed Item) was inaudible or very quiet.
    - **Audio**: Increased the base volume of the `music_box` looping sound from 0.8 to 1.0 in `LoopingAudioManager.ts`.

## 2025-11-30 (Hotfix 57) - "Phonograph Audio Crash Fix"

### Fixed
- **Phonograph**: Fixed a console error (`Cannot read properties of undefined (reading 'dispose')`) causing the phonograph logic to crash when stopping playback.
    - **Audio**: Updated `OneShotAudioManager.stopPhonograph` to capture a local reference of the active sound before stopping it. This prevents a crash if the sound's `onended` callback clears the class property before `dispose` is called.

## 2025-11-30 (Hotfix 58) - "GLB Export Repair"

### Fixed
- **Map Export**: Fixed a crash (`BufferView undefined`) when attempting to download the map as a .glb file.
    - **Exporter**: Updated `ExportService.ts` to strictly exclude invisible meshes, transparent colliders (visibility <= 0), and logic hitboxes from the export list. This prevents the Babylon.js exporter from choking on malformed or empty geometry associated with physics objects.

## 2025-11-30 (Hotfix 59) - "Phonograph Streaming Fix"

### Fixed
- **Phonograph Audio**: Fixed an issue where phonograph songs failed to load due to global timeout limits, resulting in silence when activated.
    - **Timeout**: Increased the global audio loading timeout in `SoundManager` from 2 seconds to 10 seconds to allow for slower network conditions.
    - **Streaming**: Enabled `streaming: true` for phonograph music tracks in `OneShotAudioManager`. This prevents the game from waiting for the full file download before becoming "ready", significantly reducing load times and memory usage for music.

## 2025-11-30 (Hotfix 60) - "GLB Export Mesh Fix"

### Fixed
- **Map Export**: Fixed an issue where only light switches and fixtures were exported, but walls, floors, and roof were missing.
    - **HouseBuilder**: Explicitly named all generated wall segments, lintels, sills, and merged floors to ensure they are correctly identified by the exporter.
    - **ExportService**: Relaxed the strict visibility filter. Removed the `visibility <= 0` scalar check which may have been falsely flagging visible meshes. Now relies solely on `isVisible` property and explicit exclusion of "collider/hitbox/trigger" named meshes.

## 2025-11-30 (Hotfix 61) - "Ghost Event Range Limiting"

### Fixed
- **Ghost Event Range**: Implemented stricter distance checks for ghost events to prevent them triggering from across the map.
    - **Range**: Ghosts now only trigger events if the player is within 15 meters.
    - **Verticality**: Implemented a "Same Floor" check (Vertical distance < 3m) to prevent events triggering from different floors (e.g., basement ghost spooking attic player).
- **Ghost Abilities**: Tuned specific ghost ranges.
    - **Phantom**: Sanity drain during events/hunts now only applies if the player is within 10 meters.
    - **Yokai**: Reduced hunt trigger sensitivity range for talking from 3m to 2.5m.

## 2025-11-30 (Hotfix 62) - "Phonograph Clone Fix"

### Fixed
- **Phonograph Audio**: Fixed "Clone Failed" errors when playing phonograph music.
    - **Audio**: Updated `OneShotAudioManager` to play the master sound instance directly for phonograph songs instead of attempting to clone them. This avoids issues with cloning streaming sounds and reduces overhead for a singleton audio source.
    - **Logic**: Updated `stopPhonograph` to ensure it stops playback without disposing of the master sound asset.

## 2025-11-30 (Hotfix 63) - "Footsteps Re-Enabled"

### Fixed
- **Audio**: Re-introduced missing ghost footsteps logic. The ghost now audibly walks during hunts and wandering phases, with dynamic intervals based on movement speed.
- **Audio**: Increased base volume of player footsteps to ensuring they are clearly audible.

## 2025-11-30 (Feature) - "Physics-Based Item Tossing"

### Changed
- **Item Mechanics**: Replaced static item dropping with a physics-based "Toss" mechanic.
    - **Behavior**: When dropping an item (`G`), it is now launched from the player's view position forward with momentum, simulating a throw.
    - **Physics**: Applied dynamic linear impulse and random angular velocity (spin) to dropped items for realism.
    - **Store**: Updated `PlacedItem` types and actions to support `throwVelocity` payloads.

## 2025-11-30 (Hotfix 64) - "Flamethrower Interaction"

### Fixed
- **Flamethrower**: Made the flamethrower in the truck much easier to interact with.
    - **Interaction**: Enabled direct picking (`isPickable = true`) on the visual mesh itself and attached interaction metadata directly to it. This ensures that clicking anywhere on the visible model triggers the secret round, removing reliance on potentially misaligned hitboxes.

## 2025-11-30 (Feature) - "Secret Round: Health Drops"

### Added
- **Secret Mode**: Added a healing mechanic to the Secret Round.
    - **Health Drops**: Enemies now have a chance to drop a Heart upon death (15% chance).
    - **Pickup**: Collecting a heart restores 2 HP to the player (up to max HP).
    - **Asset**: Preloaded the `heart.glb` model from the suits collection for instant spawning.

## 2025-11-30 (Feature) - "Secret Round: Heart Health Bar"

### Changed
- **UI**: Replaced the Secret Mode health bar with heart icons.
    - **Visuals**: Displays full, half, or empty hearts based on current health points.
    - **Scaling**: Adjusts dynamically based on Max Health upgrades.
    - **Assets**: Implemented support for `heart_full.png`, `heart_half.png`, and `heart_empty.png` (Requires upload).

## 2025-11-30 (Feature) - "Tanglewood Procedural Randomization (Default)"

### Changed
- **Maps**: Made Tanglewood (Procedural) the default map selection.
- **Procedural Generation**: Enhanced randomness in `createRandomLayout`.
    - **Props**: Randomized the number and position of plates on the dining table.
    - **Furniture**: Added randomized rotation jitter to furniture.
    - **Phonograph**: Added spawn location randomization (Dining Room vs Living Room).
    - **Summoning Circle**: Added spawn location randomization (Living Room, Garage, Bedroom).
    - **Photos**: Made wall photo spawning probabilistic (70% chance per slot).

## 2025-11-30 (Feature) - "Loading Console Logging"

### Added
- **Debugging**: Added console logging to the loading progress updates in `App.tsx`.
    - **Output**: The console now prints "[LOADER] X% - Message" events during game startup to allow better tracking of the initialization sequence.

## 2025-11-30 (Feature) - "Version Display"

### Added
- **UI**: Added a subtle version indicator (`v0.9.6 (Early Access)`) to the bottom-right corner of the Main Menu screen.
