// CameraManager.js
import { ArcRotateCamera, Camera, Vector3 } from "@babylonjs/core";

export class CameraManager {
    constructor(scene, canvas) {
        this.scene = scene;
        this.canvas = canvas;
        this.is2DMode = false;
        
        // Store default values for reset
        this.defaultRadius = 50;
        this.defaultAlpha = -Math.PI/2;
        this.defaultBeta = Math.PI/4;
        this.defaultTarget = new Vector3(0, 0, 0);
        
        // Store orthographic defaults
        this.defaultOrthoLeft = -30;
        this.defaultOrthoRight = 30;
        
        this.setupCamera();
    }

    setupCamera() {
        // Create camera with initial 3D perspective settings
        this.camera = new ArcRotateCamera(
            "camera1",
            this.defaultAlpha,
            this.defaultBeta,
            this.defaultRadius,
            this.defaultTarget,
            this.scene
        );

        // Basic camera setup
        this.camera.attachControl(this.canvas, true);
        this.camera.minZ = 0.01;
        this.camera.maxZ = 1000;
        this.camera.wheelDeltaPercentage = 0.01;

        // Store initial radius for ratio calculations
        this.oldRadius = this.camera.radius;

        // Add observer for radius changes in orthographic mode
        this.scene.onBeforeRenderObservable.add(() => {
            if (this.is2DMode && this.oldRadius !== this.camera.radius) {
                const radiusChangeRatio = this.camera.radius / this.oldRadius;
                this.camera.orthoLeft *= radiusChangeRatio;
                this.camera.orthoRight *= radiusChangeRatio;
                this.oldRadius = this.camera.radius;
                this.setOrthoCameraTopBottom();
            }

            // Prevent any rotation in ortho mode
            if (this.is2DMode) {
                this.camera.beta = 0;
                this.camera.alpha = -Math.PI/2;
            }
        });
    }

    setOrthoCameraTopBottom() {
        const ratio = this.canvas.height / this.canvas.width;
        this.camera.orthoTop = this.camera.orthoRight * ratio;
        this.camera.orthoBottom = this.camera.orthoLeft * ratio;
    }

    toggle2DMode() {
        this.is2DMode = !this.is2DMode;
    
        if (this.is2DMode) {
            // Switch to 2D (orthographic) mode
            this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
            
            // Lock rotation
            this.camera.upperBetaLimit = 0;
            this.camera.lowerBetaLimit = 0;
            this.camera.upperAlphaLimit = -Math.PI/2;
            this.camera.lowerAlphaLimit = -Math.PI/2;
            this.camera.beta = 0;
            this.camera.alpha = -Math.PI/2;
            
            // Set orthographic camera bounds
            this.camera.orthoLeft = this.defaultOrthoLeft;
            this.camera.orthoRight = this.defaultOrthoRight;
            this.setOrthoCameraTopBottom();
        } else {
            // Switch back to 3D (perspective) mode
            this.camera.mode = Camera.PERSPECTIVE_CAMERA;
            
            // Unlock rotation
            this.camera.upperBetaLimit = Math.PI;
            this.camera.lowerBetaLimit = 0;
            this.camera.upperAlphaLimit = null;
            this.camera.lowerAlphaLimit = null;
            
            // Restore default perspective view
            this.camera.beta = this.defaultBeta;
            this.camera.alpha = this.defaultAlpha;
            
            // Reset orthographic bounds
            this.camera.orthoLeft = null;
            this.camera.orthoRight = null;
            this.camera.orthoTop = null;
            this.camera.orthoBottom = null;
        }
    }

    resetCamera() {
        // Reset position and zoom
        this.camera.radius = this.defaultRadius;
        this.camera.target = this.defaultTarget;
        
        if (this.is2DMode) {
            // Reset orthographic bounds
            this.camera.orthoLeft = this.defaultOrthoLeft;
            this.camera.orthoRight = this.defaultOrthoRight;
            this.setOrthoCameraTopBottom();
            
            // Ensure top-down view
            this.camera.beta = 0;
            this.camera.alpha = -Math.PI/2;
        } else {
            // Reset to default 3D view
            this.camera.beta = this.defaultBeta;
            this.camera.alpha = this.defaultAlpha;
        }
    }

    getCamera() {
        return this.camera;
    }
}