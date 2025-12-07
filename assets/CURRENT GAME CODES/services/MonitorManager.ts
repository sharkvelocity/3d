
import { PlacedItem, GameState } from '../types';
import { VIEWMODEL_LAYER_MASK, UV_EVIDENCE_LAYER_MASK, NO_SIGNAL_GIF_URL, MODEL_ROOT } from '../constants';

declare const BABYLON: any;

interface ScreenUpdateProps {
    heldCameraState: { isOn: boolean, isIR: boolean } | null;
    placedCameras: PlacedItem[];
    activeCameraIndex: number;
    isNearGhost: boolean;
    gameState: GameState;
}

class ScreenManager {
    private scene: any;
    private playerCamera: any;

    // Van Monitor
    private vanMonitorContainer: any | null = null;
    private vanMonitorScreenMeshes: any[] = [];
    private vanMonitorCamera: any;
    private vanMonitorRTT: any;
    private vanMonitorMaterial: any;
    private staticMaterial: any;

    // Handheld Camera (Picture-in-Picture HUD)
    private pipCamera: any;
    private pipRTT: any;
    private pipSourceNode: any = null; // The root of the held camera model
    private equippedViewModelMesh: any = null; // Mesh to exclude from PIP render
    private hudPlane: any;
    private hudMaterial: any;
    private _lastPipNode: any = null; // Track changes to source node

    // Post-Processing
    private nvPostProcessPip: any;
    private glitchPostProcessPip: any;
    private nvPostProcessVan: any;
    private glitchPostProcessVan: any;
    
    private quality: 'Low' | 'Medium' | 'High' = 'Medium';

    constructor(scene: any, playerCamera: any, quality: 'Low' | 'Medium' | 'High') {
        this.scene = scene;
        this.playerCamera = playerCamera;
        this.quality = quality;
        this.registerShaders();
        this.setupCamerasAndRTTs();
        this.setupMaterials();
        this.setupPostProcessing();
    }

    public setQuality(quality: 'Low' | 'Medium' | 'High') {
        this.quality = quality;
    }

    private registerShaders() {
        if (BABYLON.Effect.ShadersStore["enhancedNightVisionFragmentShader"]) return;
        
        BABYLON.Effect.ShadersStore["enhancedNightVisionFragmentShader"] = `
            #ifdef GL_ES
            precision highp float;
            #endif
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float time;
            void main(void) {
                vec4 final_color = texture2D(textureSampler, vUV);
                float luminance = dot(final_color.rgb, vec3(0.2126, 0.7152, 0.0722));
                vec3 night_vision_color = vec3(0.1, 1.0, 0.2);
                final_color.rgb = night_vision_color * luminance * 3.5;
                float vignette = smoothstep(0.8, 0.4, length(vUV - 0.5));
                final_color.rgb *= vignette;
                float scanline = sin(vUV.y * 350.0) * 0.1;
                final_color.rgb = clamp(final_color.rgb - scanline, 0.0, 1.0);
                float noise = (fract(sin(dot(vUV, vec2(12.9898, 78.233)) * 43758.5453) * time) - 0.5) * 0.30;
                final_color.rgb += noise;
                gl_FragColor = final_color;
            }
        `;

        BABYLON.Effect.ShadersStore["glitchFragmentShader"] = `
            #ifdef GL_ES
            precision highp float;
            #endif
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float time;
            uniform float intensity;
            float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
                if (intensity == 0.0) { gl_FragColor = texture2D(textureSampler, vUV); return; }
                vec2 uv = vUV;
                float r_offset = (random(uv + time * 0.1) - 0.5) * 0.02 * intensity;
                float r = texture2D(textureSampler, uv + vec2(r_offset, 0.0)).r;
                float g = texture2D(textureSampler, uv).g;
                float b = texture2D(textureSampler, uv).b;
                if (abs(sin(uv.y * 300.0 + time * 10.0)) < 0.01 * intensity * 5.0) { uv.x += (random(uv.yy * time) - 0.5) * 0.1 * intensity; }
                if (random(floor(uv * vec2(40.0, 60.0)) + time) > 0.98 - (intensity * 0.1)) { gl_FragColor = texture2D(textureSampler, uv).gbra; }
                else { gl_FragColor = vec4(r, g, b, texture2D(textureSampler, uv).a); }
            }
        `;
    }

    private setupCamerasAndRTTs() {
        const pipRttSize = this.quality === 'Low' ? 256 : 512;
        const vanMonitorRttSize = this.quality === 'Low' ? 512 : 1024;
        
        // PIP Camera (Handheld)
        this.pipCamera = new BABYLON.FreeCamera("pipCamera", BABYLON.Vector3.Zero(), this.scene);
        this.pipCamera.rotationQuaternion = new BABYLON.Quaternion(); 
        this.pipCamera.layerMask = ~(VIEWMODEL_LAYER_MASK | UV_EVIDENCE_LAYER_MASK);
        this.pipCamera.minZ = 0.1;
        this.pipCamera.maxZ = 100;
        
        this.pipRTT = new BABYLON.RenderTargetTexture("pipRtt", pipRttSize, this.scene);
        this.pipRTT.clearColor = new BABYLON.Color4(0.1, 0.1, 0.1, 1.0); // Dark grey when active
        this.pipRTT.activeCamera = this.pipCamera;
        this.pipRTT.refreshRate = 1; // Explicitly set refresh rate
        this.scene.customRenderTargets.push(this.pipRTT);

        // Van Monitor Camera (Placed)
        this.vanMonitorCamera = new BABYLON.FreeCamera("vanMonitorCamera", BABYLON.Vector3.Zero(), this.scene);
        this.vanMonitorCamera.rotationQuaternion = new BABYLON.Quaternion();
        this.vanMonitorCamera.layerMask = ~(VIEWMODEL_LAYER_MASK | UV_EVIDENCE_LAYER_MASK);
        this.vanMonitorCamera.minZ = 0.1;
        this.vanMonitorCamera.maxZ = 100;

        this.vanMonitorRTT = new BABYLON.RenderTargetTexture("vanMonitorRtt", vanMonitorRttSize, this.scene);
        this.vanMonitorRTT.clearColor = new BABYLON.Color4(0.1, 0.1, 0.1, 1.0);
        this.vanMonitorRTT.activeCamera = this.vanMonitorCamera;
        this.scene.customRenderTargets.push(this.vanMonitorRTT);
    }

    private setupMaterials() {
        this.staticMaterial = new BABYLON.StandardMaterial("staticMat", this.scene);
        this.staticMaterial.emissiveTexture = new BABYLON.Texture(NO_SIGNAL_GIF_URL, this.scene);
        if (this.staticMaterial.emissiveTexture) {
            this.staticMaterial.emissiveTexture.uScale = -1; // Flip horizontal to fix mirrored text
            this.staticMaterial.emissiveTexture.uOffset = 1; // Wrap correctly
        }
        this.staticMaterial.disableLighting = true;

        this.vanMonitorMaterial = new BABYLON.StandardMaterial("vanMonitorMat", this.scene);
        this.vanMonitorMaterial.emissiveTexture = this.vanMonitorRTT;
        
        // [FIX] Invert Texture V to correct upside-down rendering on GLB screens
        if (this.vanMonitorMaterial.emissiveTexture) {
            this.vanMonitorMaterial.emissiveTexture.vScale = -1;
            this.vanMonitorMaterial.emissiveTexture.vOffset = 1;
        }
        
        this.vanMonitorMaterial.disableLighting = true;
        this.vanMonitorMaterial.diffuseColor = BABYLON.Color3.Black();
        this.vanMonitorMaterial.specularColor = BABYLON.Color3.Black();

        // --- HUD MONITOR SETUP ---
        this.hudMaterial = new BABYLON.StandardMaterial("hudMat", this.scene);
        this.hudMaterial.emissiveColor = BABYLON.Color3.White();
        this.hudMaterial.disableLighting = true;
        this.hudMaterial.diffuseColor = BABYLON.Color3.Black();
        this.hudMaterial.specularColor = BABYLON.Color3.Black();
        this.hudMaterial.emissiveTexture = this.pipRTT;

        // Scale down to match physical screen size on camera model (approx)
        this.hudPlane = BABYLON.MeshBuilder.CreatePlane("hudMonitorPlane", { width: 0.08, height: 0.055 }, this.scene);
        this.hudPlane.parent = this.playerCamera; 
        
        // Initial Position (hidden)
        this.hudPlane.position = new BABYLON.Vector3(0, -0.5, 1.0);
        
        this.hudPlane.scaling.x = -1; // Flip X for correct mirror

        // Ensure it renders with ViewModels (always on top of world geometry)
        this.hudPlane.layerMask = VIEWMODEL_LAYER_MASK;
        this.hudPlane.material = this.hudMaterial;
        this.hudPlane.setEnabled(false);
    }

    private setupPostProcessing() {
        const createEffects = (camera: any) => {
            const nv = new BABYLON.PostProcess("NightVision", "enhancedNightVision", ["time"], null, 1.0, camera);
            nv.onApply = (effect: any) => effect.setFloat('time', performance.now() / 1000);
            nv.enabled = false;

            const glitch = new BABYLON.PostProcess("Glitch", "glitch", ["time", "intensity"], null, 1.0, camera);
            glitch.onApply = (effect: any) => {
                effect.setFloat('time', performance.now() / 1000);
                effect.setFloat('intensity', 0.0);
            };
            return { nv, glitch };
        };

        const pipEffects = createEffects(this.pipCamera);
        this.nvPostProcessPip = pipEffects.nv;
        this.glitchPostProcessPip = pipEffects.glitch;
        
        const vanEffects = createEffects(this.vanMonitorCamera);
        this.nvPostProcessVan = vanEffects.nv;
        this.glitchPostProcessVan = vanEffects.glitch;
    }
    
    public async initializeModels(truckMesh: any, onLoadingUpdate: (p: number, m: string) => void) {
        this.clearModels();
        onLoadingUpdate(50, "Calibrating monitoring station...");
        const rootNode = truckMesh;
        if (!rootNode) {
            console.error("[MonitorManager] Truck mesh not provided. Van monitor will be blank.");
            onLoadingUpdate(100, "Monitor station offline.");
            return;
        }
    
        const allDescendants = rootNode.getDescendants(false);
        const targetNames = ["screen01", "screen02", "screen03", "screen04"];
        
        // Find all matching screen meshes
        for (const mesh of allDescendants) {
            if (mesh instanceof BABYLON.AbstractMesh) {
                if (targetNames.some(name => mesh.name === name || mesh.name.endsWith(name))) {
                    this.vanMonitorScreenMeshes.push(mesh);
                    mesh.material = this.vanMonitorMaterial;
                }
            }
        }
    
        if (this.vanMonitorScreenMeshes.length === 0) {
            // Fallback
            const genericNames = ["screen", "display", "panel", "monitor"];
            const fallbackMesh = allDescendants.find((m: any) => m instanceof BABYLON.AbstractMesh && genericNames.some(n => m.name.toLowerCase().includes(n)));
            
            if (fallbackMesh) {
                this.vanMonitorScreenMeshes.push(fallbackMesh);
                fallbackMesh.material = this.vanMonitorMaterial;
            }
        }
    
        onLoadingUpdate(100, "Monitoring station online.");
    }
    
    public clearModels() {
        this.vanMonitorScreenMeshes = [];
        this.vanMonitorContainer?.dispose(false, true);
        this.vanMonitorContainer = null;
    }
    
    public setPipSourceNode(node: any) { this.pipSourceNode = node; }
    public setEquippedViewModel(mesh: any) { this.equippedViewModelMesh = mesh; }
    
    public update(props: ScreenUpdateProps, placedCameraNodes: Map<number, any>, placedMeshes: Map<number, any>) {
        if (props.gameState !== GameState.Playing) return;
        
        const usePostProcessing = this.quality !== 'Low';

        // --- 1. Handheld Camera Feed (PIP - HUD) ---
        if (props.heldCameraState?.isOn && this.pipSourceNode) {
            
            // Check if we need to align (First frame of being ON or new item)
            const needsAlignment = !this.hudPlane.isEnabled() || this.pipSourceNode !== this._lastPipNode;

            // Enable HUD Plane
            if (!this.hudPlane.isEnabled()) {
                this.hudPlane.setEnabled(true);
            }
            this.hudMaterial.emissiveColor = BABYLON.Color3.White();
            this.hudMaterial.emissiveTexture = this.pipRTT;

            if (needsAlignment) {
                this._lastPipNode = this.pipSourceNode;
                
                // --- HUD ALIGNMENT LOGIC (ONE-TIME) ---
                // Try to find the actual screen mesh on the model to align with
                const descendants = this.pipSourceNode.getDescendants(false);
                const screenMesh = descendants.find((m: any) => 
                    ["screen", "display", "panel", "monitor"].some(n => m.name.toLowerCase().includes(n))
                );

                if (screenMesh) {
                    // Force computation to ensure world matrices are up to date
                    screenMesh.computeWorldMatrix(true);
                    
                    // Snap HUD plane to the physical screen mesh location
                    // Using setAbsolutePosition allows us to keep it parented to playerCamera
                    this.hudPlane.setAbsolutePosition(screenMesh.getAbsolutePosition());
                    
                    if (screenMesh.absoluteRotationQuaternion) {
                        this.hudPlane.rotationQuaternion = screenMesh.absoluteRotationQuaternion.clone();
                    } else {
                        this.hudPlane.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(screenMesh.absoluteRotation);
                    }

                    // Apply Offset: Move slightly along local Normal (Z axis for plane)
                    // The VideoCamera is rotated 180 degrees, so Local Z faces the player.
                    // We move slightly NEGATIVE Z (backwards/outwards relative to model) to sit "on top" of the screen mesh.
                    this.hudPlane.translate(BABYLON.Axis.Z, -0.005, BABYLON.Space.LOCAL); 
                } else {
                    // Fallback position if screen mesh not found
                    this.hudPlane.position = new BABYLON.Vector3(0.4, -0.35, 1.0);
                    this.hudPlane.rotationQuaternion = BABYLON.Quaternion.Identity();
                }
            }

            // Attach Camera to Held Model (Lens Tracking)
            this.pipCamera.parent = this.pipSourceNode;

            // Find Lens for accurate positioning
            const descendants = this.pipSourceNode.getDescendants(false);
            const lensNode = descendants.find((n: any) => n.name.toLowerCase().includes('lens'));
            
            if (lensNode) {
                // Calculate local position relative to the camera root
                const rootInverseMatrix = this.pipSourceNode.getWorldMatrix().clone().invert();
                const localLensPos = BABYLON.Vector3.TransformCoordinates(lensNode.getAbsolutePosition(), rootInverseMatrix);
                this.pipCamera.position.copyFrom(localLensPos);
            } else {
                this.pipCamera.position = new BABYLON.Vector3(0, 0.05, 0.1); 
            }
            
            // Orient Camera: Look Forward (Local Z) relative to parent.
            const forwardTarget = this.pipCamera.position.add(new BABYLON.Vector3(0, 0, 1));
            this.pipCamera.setTarget(forwardTarget);

            // Render List
            if (this.equippedViewModelMesh) {
                const excluded = this.equippedViewModelMesh.getDescendants(false).concat(this.equippedViewModelMesh);
                // Also exclude HUD plane to avoid recursion
                excluded.push(this.hudPlane);
                this.pipRTT.renderList = this.scene.meshes.filter((m: any) => !excluded.includes(m));
            } else {
                this.pipRTT.renderList = this.scene.meshes.filter((m: any) => m !== this.hudPlane);
            }

            // Post Processing (IR & Glitch)
            const isIR = props.heldCameraState.isIR;
            this.nvPostProcessPip.enabled = usePostProcessing && isIR;
            this.glitchPostProcessPip.onApply = (effect: any) => effect.setFloat('intensity', usePostProcessing && props.isNearGhost ? 0.7 : 0.0);

        } else {
            // OFF State
            if (this.hudPlane.isEnabled()) {
                this.hudPlane.setEnabled(false);
            }
            this.hudMaterial.emissiveTexture = null;
            this.pipRTT.renderList = [];
        }
        
        // --- 2. Van Monitor Feed ---
        if (this.vanMonitorScreenMeshes.length === 0) return;

        const activeCamData = props.placedCameras[props.activeCameraIndex];
        const sourceNode = activeCamData ? placedCameraNodes.get(activeCamData.instanceId) : null;
        const cameraModelMesh = activeCamData ? placedMeshes.get(activeCamData.instanceId) : null;

        if (activeCamData && activeCamData.isOn && sourceNode && cameraModelMesh) {
            // Position Camera at Source
            sourceNode.computeWorldMatrix(true);
            this.vanMonitorCamera.position.copyFrom(sourceNode.getAbsolutePosition());
            
            if (sourceNode.absoluteRotationQuaternion) {
                this.vanMonitorCamera.rotationQuaternion.copyFrom(sourceNode.absoluteRotationQuaternion);
            }
            
            // Exclude monitor screens and the camera itself and HUD plane
            const excludedMeshes = [...this.vanMonitorScreenMeshes];
            excludedMeshes.push(cameraModelMesh, ...cameraModelMesh.getDescendants(false));
            excludedMeshes.push(this.hudPlane);

            this.vanMonitorRTT.renderList = this.scene.meshes.filter((m: any) => !excludedMeshes.includes(m));
            
            // Apply Material
            this.vanMonitorScreenMeshes.forEach(mesh => {
                if (mesh.material !== this.vanMonitorMaterial) {
                    mesh.material = this.vanMonitorMaterial;
                }
            });
            
            this.nvPostProcessVan.enabled = usePostProcessing && activeCamData.isIR === true;
            this.glitchPostProcessVan.onApply = (effect: any) => effect.setFloat('intensity', usePostProcessing && props.isNearGhost ? 0.5 : 0.0);
        } else {
            // Static / No Signal
            this.vanMonitorRTT.renderList = [];
            this.vanMonitorScreenMeshes.forEach(mesh => {
                if (mesh.material !== this.staticMaterial) {
                    mesh.material = this.staticMaterial;
                }
            });
            this.nvPostProcessVan.enabled = false;
            this.glitchPostProcessVan.onApply = (effect: any) => effect.setFloat('intensity', 0.0);
        }
    }

    public dispose() {
        this.clearModels();
        this.pipRTT?.dispose();
        this.pipCamera?.dispose();
        this.nvPostProcessPip?.dispose();
        this.glitchPostProcessPip?.dispose();
        this.vanMonitorRTT?.dispose();
        this.vanMonitorCamera?.dispose();
        this.vanMonitorMaterial?.dispose();
        this.staticMaterial?.dispose();
        this.nvPostProcessVan?.dispose();
        this.glitchPostProcessVan?.dispose();
        this.hudPlane?.dispose();
        this.hudMaterial?.dispose();
    }
}

export default ScreenManager;
