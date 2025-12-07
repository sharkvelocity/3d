
declare const BABYLON: any;

export class PowerIndicator {
    private mesh: any;
    private activeColor: any;
    private inactiveColor: any;

    constructor(rootMesh: any, scene: any) {
        if (!rootMesh) return;
        
        // [CONFIG] SEARCH: Robustly find the power mesh
        const allMeshes = rootMesh.getDescendants ? rootMesh.getDescendants(false) : [];
        if (rootMesh.name && typeof rootMesh.name === 'string') allMeshes.push(rootMesh);

        // Find mesh named 'power' (case-insensitive)
        this.mesh = allMeshes.find((m: any) => m.name && m.name.toLowerCase().includes('power'));

        if (this.mesh) {
            // Create a unique material for this instance to allow independent toggling
            const material = new BABYLON.StandardMaterial("powerIndicatorMat", scene);
            material.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            material.disableLighting = true; // Optimization: Emissive doesn't need lighting calculation
            this.mesh.material = material;
            
            // [CONFIG] COLORS
            this.activeColor = new BABYLON.Color3(0, 1, 0); // Green
            this.inactiveColor = new BABYLON.Color3(0, 0, 0); // Black/Off
        }
    }

    public update(isOn: boolean) {
        if (this.mesh && this.mesh.material) {
            this.mesh.material.emissiveColor = isOn ? this.activeColor : this.inactiveColor;
        }
    }
    
    public dispose() {
        if (this.mesh && this.mesh.material) {
            this.mesh.material.dispose();
        }
    }
}
