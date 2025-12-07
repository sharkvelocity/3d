
import { WORLD_SCALE, VIEWMODEL_LAYER_MASK, COLLISION_GROUPS } from '../constants';

declare const BABYLON: any;

export class ItemPlacementService {
    /**
     * Calculates the position and rotation for a "ghost" item during placement preview.
     * Ensures the ghost sticks to surfaces or floats at a fixed distance if in mid-air.
     */
    public static getPlacementGhostPosition(scene: any, camera: any, playerRoot: any, distance: number, currentRotationY: number) {
        if (!scene || !camera) return null;

        // Force world matrix updates to ensure ray is accurate
        if (playerRoot) playerRoot.computeWorldMatrix(true);
        camera.computeWorldMatrix(true);

        const ray = camera.getForwardRay(distance);
        
        // Raycast to find walls/floors/obstacles
        const pickInfo = scene.pickWithRay(ray, (mesh: any) => {
            // Filter Logic:
            
            // 1. Basic Eligibility
            if (!mesh.checkCollisions && !mesh.physicsImpostor) return false;
            if (!mesh.isVisible) return false;

            // 2. Ignore Player (Root and Children)
            // This is critical to prevent the item from sticking to the player's own collider
            if (playerRoot) {
                if (mesh === playerRoot) return false;
                if (mesh.isDescendantOf(playerRoot)) return false;
            }
            if (mesh.name.toLowerCase().includes("player")) return false;
            if (mesh.name === "playerRoot") return false;

            // 3. Ignore ViewModels (held items)
            if (mesh.layerMask === VIEWMODEL_LAYER_MASK) return false;
            
            // 4. Ignore Ghosts and Triggers
            if (mesh.name.toLowerCase().includes("ghost")) return false;
            if (mesh.metadata && mesh.metadata.type === 'sensor_trigger') return false;

            // 5. CRITICAL: Ignore Placement Ghost itself (metadata check)
            if (mesh.metadata && mesh.metadata.isPlacementGhost) return false;
            
            return true;
        });

        const position = new BABYLON.Vector3();
        
        if (pickInfo && pickInfo.hit) {
            // Safe Offset logic: Push item AWAY from the wall/floor
            const normal = pickInfo.getNormal(true, true);
            if (normal) {
                normal.normalize();
                // [CONFIG] SAFETY OFFSET: Offset 10cm away from surface to prevent clipping
                const safeOffset = normal.scale(0.1); 
                position.copyFrom(pickInfo.pickedPoint.add(safeOffset));
            } else {
                // Fallback upward offset if normal is missing
                position.copyFrom(pickInfo.pickedPoint.add(new BABYLON.Vector3(0, 0.05, 0)));
            }
        } else {
            // No hit, float in air at max distance
            position.copyFrom(ray.origin.add(ray.direction.scale(distance)));
        }

        return { position, rotationY: currentRotationY };
    }

    /**
     * Calculates the position and rotation for dropping an item ('G' key).
     * Simplified and robust logic to ensure items land ON the floor.
     */
    public static getDropPosition(scene: any, camera: any, playerRoot: any) {
        if (!scene || !camera || !playerRoot) return null;

        playerRoot.computeWorldMatrix(true);
        camera.computeWorldMatrix(true);

        // Use globalPosition because Camera does not have getAbsolutePosition
        const cameraPos = camera.globalPosition.clone();
        const playerPos = playerRoot.getAbsolutePosition();
        const forward = camera.getDirection(BABYLON.Vector3.Forward());
        
        // 1. Target X/Z: 0.8 meters in front of camera
        const dropDist = 0.8 * WORLD_SCALE; 
        let targetPos = cameraPos.add(forward.scale(dropDist));

        // 2. Wall Check: Raycast horizontally to prevent dropping inside a wall
        const wallRay = new BABYLON.Ray(cameraPos, forward, dropDist);
        const wallPick = scene.pickWithRay(wallRay, (mesh: any) => {
            return mesh.checkCollisions && 
                   mesh !== playerRoot && 
                   !mesh.isDescendantOf(playerRoot) &&
                   !mesh.name.includes("player") &&
                   mesh.layerMask !== VIEWMODEL_LAYER_MASK;
        });

        if (wallPick && wallPick.hit) {
            // [CONFIG] BUFFER: Hit a wall, pull back significantly (0.3m buffer)
            const pullBack = forward.scale(-0.3);
            targetPos = wallPick.pickedPoint.add(pullBack);
        }

        // 3. Floor Finding: Raycast DOWN from above the target position
        const rayOriginY = playerPos.y + 2.0; // Start high
        const floorRayOrigin = new BABYLON.Vector3(targetPos.x, rayOriginY, targetPos.z);
        
        // [CONFIG] DROP RAY LENGTH: 10m down
        const floorRay = new BABYLON.Ray(floorRayOrigin, new BABYLON.Vector3(0, -1, 0), 10.0); 
        
        const floorPick = scene.pickWithRay(floorRay, (mesh: any) => {
            return mesh.checkCollisions && (
                mesh.collisionGroup === COLLISION_GROUPS.WALLS || 
                mesh.name.includes("ground") || 
                mesh.name.includes("foundation") ||
                mesh.name.includes("floor")
            );
        });
        
        let finalY;

        if (floorPick && floorPick.hit) {
            // [CONFIG] HOVER: Found floor: Drop 0.2m above it to prevent clipping
            finalY = floorPick.pickedPoint.y + 0.2;
        } else {
            // Missed floor (void): Default to waist height (safe)
            finalY = playerPos.y + 0.8;
        }

        // 4. Safety Clamp: NEVER spawn below player's feet
        // This prevents items falling into the basement/void if raycast misses or clips edge.
        if (finalY < playerPos.y) {
            finalY = playerPos.y + 0.5;
        }

        // 5. Orientation: Face player
        const yaw = Math.atan2(forward.x, forward.z) + Math.PI;

        return {
            position: { x: targetPos.x, y: finalY, z: targetPos.z },
            rotation: { x: 0, y: yaw, z: 0 }
        };
    }
}
