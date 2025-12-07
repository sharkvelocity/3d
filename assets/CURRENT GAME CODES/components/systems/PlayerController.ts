
import React from 'react';
import { WORLD_SCALE } from '../../constants';

declare const BABYLON: any;

interface PlayerControllerProps {
    rig: any;
    camera: any;
    scene: any;
    inputMap: Map<string, boolean>;
    isCrouching: boolean;
    isSprintingState: boolean;
    stamina: number;
    touchControlsEnabled: boolean;
    touchState: { joystick: { x: number, y: number }, look: { x: number, y: number } };
    touchSensitivity: number;
    deltaTime: number;
    isFlying: boolean;
}

export class PlayerController {
    private verticalVelocity = 0;
    private lastFootstepTime = 0;
    private footstepInterval = 400;
    private runningFootstepInterval = 300;

    public update(props: PlayerControllerProps): { isSprinting: boolean, shouldPlayFootstep: boolean } {
        const { 
            rig, camera, scene, inputMap, isCrouching, isSprintingState, 
            stamina, touchControlsEnabled, touchState, touchSensitivity, deltaTime, isFlying
        } = props;

        let moveInput = new BABYLON.Vector2(0, 0);
        let isSprintingInput = (inputMap.get("shift") ?? false);

        if (inputMap.get("w")) moveInput.y += 1;
        if (inputMap.get("s")) moveInput.y -= 1;
        if (inputMap.get("a")) moveInput.x -= 1;
        if (inputMap.get("d")) moveInput.x += 1;
        
        if (touchControlsEnabled) {
            moveInput.x += touchState.joystick.x;
            moveInput.y += touchState.joystick.y;
            const joystickMagnitude = Math.sqrt(touchState.joystick.x ** 2 + touchState.joystick.y ** 2);
            if (joystickMagnitude > 0.9) {
                isSprintingInput = true;
            }
        }

        const isMoving = moveInput.length() > 0.01;
        let isSprinting = false;
        
        // --- 1. CALCULATE HORIZONTAL MOVEMENT ---
        let horizontalDisplacement = new BABYLON.Vector3(0, 0, 0);

        if (isMoving || isFlying) {
            const canSprint = moveInput.y > 0.5 && !isCrouching;
            isSprinting = isSprintingInput && canSprint && stamina > 0;
            
            const baseSpeed = isFlying ? (isSprinting ? 20.0 : 8.0) : (isCrouching ? 1.5 : (isSprinting ? 5.6 : 3.5));
            
            const transform = camera.getWorldMatrix();
            const forward = new BABYLON.Vector3(transform.m[8], transform.m[9], transform.m[10]);
            const right = new BABYLON.Vector3(transform.m[0], transform.m[1], transform.m[2]);

            if (isFlying) {
                forward.normalize();
                right.normalize();
                const moveDirection = right.scale(moveInput.x).add(forward.scale(moveInput.y));
                if (moveDirection.lengthSquared() > 0) moveDirection.normalize();
                horizontalDisplacement = moveDirection.scale(baseSpeed * deltaTime);
            } else {
                forward.y = 0; right.y = 0;
                forward.normalize(); right.normalize();

                const moveDirection = right.scale(moveInput.x).add(forward.scale(moveInput.y));
                if (moveDirection.lengthSquared() > 0) {
                    moveDirection.normalize();
                }

                // Standard movement calculation - rely on moveWithCollisions for wall sliding
                horizontalDisplacement = moveDirection.scale(baseSpeed * deltaTime);
            }
        }

        // --- 2. CALCULATE VERTICAL MOVEMENT (GRAVITY) ---
        let verticalDisplacement = new BABYLON.Vector3(0, 0, 0);

        if (isFlying) {
            this.verticalVelocity = 0;
        } else {
            const gravity = scene.gravity.y; 
            // Ground Detection
            // Ray starts at waist (0.5 up) and goes down 1.1m.
            // If feet are at 0 relative to center, this checks 0.6m below feet.
            const rayStart = rig.position.add(new BABYLON.Vector3(0, 0.5, 0));
            const groundRay = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), 1.1);
            
            const pickInfo = scene.pickWithRay(groundRay, (mesh: any) => mesh.checkCollisions && mesh !== rig);
            const isGrounded = pickInfo && pickInfo.hit;

            if (isGrounded) {
                this.verticalVelocity = -2.0; // Stick to floor
            } else {
                this.verticalVelocity += gravity * deltaTime;
            }
            this.verticalVelocity = Math.max(-20, this.verticalVelocity);
            verticalDisplacement = new BABYLON.Vector3(0, this.verticalVelocity * deltaTime, 0);
        }

        // --- 3. APPLY MOVEMENT ---
        if (isFlying) {
             rig.position.addInPlace(horizontalDisplacement);
        } else {
            // Combine horizontal + vertical
            const finalDisplacement = horizontalDisplacement.add(verticalDisplacement);
            rig.moveWithCollisions(finalDisplacement);
        }
        
        // Touch Look Logic
        if (touchControlsEnabled && (touchState.look.x !== 0 || touchState.look.y !== 0)) {
            const lookFactor = 2.5 * touchSensitivity * deltaTime;
            camera.cameraRotation.y += touchState.look.x * lookFactor;
            camera.cameraRotation.x -= touchState.look.y * lookFactor;
        }

        // Crouch Logic
        const PLAYER_STANDING_HEIGHT = 1.7; 
        const PLAYER_CROUCHING_HEIGHT = 1.1;
        const PLAYER_EYE_LEVEL_STANDING = 1.6;
        const PLAYER_EYE_LEVEL_CROUCHING = 1.0;

        const wasCrouching = rig.ellipsoid.y === PLAYER_CROUCHING_HEIGHT / 2;

        if (isCrouching) {
            rig.ellipsoid.y = PLAYER_CROUCHING_HEIGHT / 2;
            rig.ellipsoidOffset.y = PLAYER_CROUCHING_HEIGHT / 2;
            camera.position.y = PLAYER_EYE_LEVEL_CROUCHING;
        } else {
            if (wasCrouching) {
                const headPos = rig.position.clone();
                headPos.y += PLAYER_CROUCHING_HEIGHT;
                const headRay = new BABYLON.Ray(headPos, new BABYLON.Vector3(0, 1, 0), PLAYER_STANDING_HEIGHT - PLAYER_CROUCHING_HEIGHT + 0.1);
                const headPick = scene.pickWithRay(headRay, (mesh: any) => mesh.checkCollisions);

                if (!headPick || !headPick.hit) {
                    rig.ellipsoid.y = PLAYER_STANDING_HEIGHT / 2;
                    rig.ellipsoidOffset.y = PLAYER_STANDING_HEIGHT / 2;
                    camera.position.y = PLAYER_EYE_LEVEL_STANDING;
                }
            } else {
                rig.ellipsoid.y = PLAYER_STANDING_HEIGHT / 2;
                rig.ellipsoidOffset.y = PLAYER_STANDING_HEIGHT / 2;
                camera.position.y = PLAYER_EYE_LEVEL_STANDING;
            }
        }

        let shouldPlayFootstep = false;
        if (isMoving && !isFlying) {
            const now = Date.now();
            const currentFootstepInterval = isSprintingState ? this.runningFootstepInterval : this.footstepInterval;
            
            if (currentFootstepInterval > 0 && now - this.lastFootstepTime >= currentFootstepInterval) {
                shouldPlayFootstep = true;
                this.lastFootstepTime = now;
            }
        }

        return { isSprinting, shouldPlayFootstep };
    }
}
