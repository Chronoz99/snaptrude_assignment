import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Scene } from "@babylonjs/core/scene";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";
import { CameraManager } from "./CameraManager";  // Updated import
import { addExampleMeshes } from "./create";
import { EditModeManager } from "./editModeManager";

// Get the canvas element from the DOM.
const canvas = document.getElementById("renderCanvas");

// Associate a Babylon Engine to it.
const engine = new Engine(canvas);

// Create our first scene.
var scene = new Scene(engine);

// Initialize camera manager
const cameraManager = new CameraManager(scene, canvas);

// This creates a light, aiming 0,1,0 - to the sky (non-mesh)
var light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);

// Default intensity is 1. Let's dim the light a small amount
light.intensity = 0.7;

// Create a grid material
var material = new GridMaterial("grid", scene);

// Our built-in 'ground' shape.
var ground = CreateGround("ground1", { width: 60, height: 60, subdivisions: 2 }, scene);

// Affect a material
ground.material = material;

const meshes = addExampleMeshes(scene);

// Initialize edit mode manager
const editModeManager = new EditModeManager(scene, cameraManager);

// Update the setupControls function to add edit mode toggle:
function setupControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.top = '20px';
    controlsContainer.style.right = '20px';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.gap = '10px';
    controlsContainer.style.zIndex = '1000';

    // Create toggle button for 2D/3D
    const toggleButton = document.createElement('button');
    toggleButton.textContent = '2D/3D Toggle';
    toggleButton.addEventListener('click', () => {
        if (!editModeManager.isEditMode) {
            cameraManager.toggle2DMode();
        }
    });

    // Create reset button
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset View';
    resetButton.addEventListener('click', () => {
        cameraManager.resetCamera();
    });

    // Create edit mode toggle button
    const editModeButton = document.createElement('button');
    editModeButton.textContent = 'Toggle Edit Mode';
    editModeButton.addEventListener('click', () => {
        const isEditMode = editModeManager.toggleEditMode();
        editModeButton.textContent = isEditMode ? 'Exit Edit Mode' : 'Toggle Edit Mode';
        toggleButton.disabled = isEditMode; // Disable 2D/3D toggle during edit mode
    });

    // Add buttons to container
    controlsContainer.appendChild(toggleButton);
    controlsContainer.appendChild(resetButton);
    controlsContainer.appendChild(editModeButton);
    document.body.appendChild(controlsContainer);
}
// Setup controls
setupControls();

window.scene = scene;

// Render every frame
engine.runRenderLoop(() => {
    scene.render();
});