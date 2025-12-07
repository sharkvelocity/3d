
import { TRUCK_ROOM_ID } from '../constants';
import { Room } from '../types';

// Default bounds matching the current Z=-26 truck position
// Approx Z -32 to -20
export const DEFAULT_TRUCK_BOUNDS = {
    min: { x: -2.5, y: 0, z: -32 },
    max: { x: 2.5, y: 5, z: -20 }
};

export const checkTruckRoom = (
    worldPos: { x: number, y: number, z: number }, 
    dynamicBounds?: { min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } } | null
): Room | null => {
    const bounds = dynamicBounds || DEFAULT_TRUCK_BOUNDS;
    
    if (worldPos.x >= bounds.min.x && worldPos.x <= bounds.max.x &&
        worldPos.z >= bounds.min.z && worldPos.z <= bounds.max.z &&
        worldPos.y >= bounds.min.y - 1 && worldPos.y <= bounds.max.y + 2) {
            return { 
                id: TRUCK_ROOM_ID, 
                type: 'Truck', 
                floor: 0, 
                x: bounds.min.x, 
                z: bounds.min.z, 
                width: bounds.max.x - bounds.min.x, 
                depth: bounds.max.z - bounds.min.z 
            };
    }
    return null;
};
