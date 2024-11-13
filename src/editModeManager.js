import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction, Mesh, Vector3 } from "@babylonjs/core";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import BrepMesh from "mda/mda/Core/Mesh";
import VertexFaces from "mda/mda/Queries/VertexFaces";
import Tessellator from "./Tessellator";

export class EditModeManager {
    constructor(scene, cameraManager) {
        this.scene = scene;
        this.cameraManager = cameraManager;
        this.isEditMode = false;
        this.selectedMesh = null;
        this.vertexMarkers = new Map();
        this.highlightLayer = new HighlightLayer("highlightLayer", scene);
        this.tessellator = new Tessellator();
        
        this.vertexMarkerMaterial = new StandardMaterial("vertexMarkerMaterial", scene);
        this.vertexMarkerMaterial.diffuseColor = new Color3(1, 0, 0);
        this.vertexMarkerMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
        
        this.setupPointerObserver();
    }

    // Toggles between edit and view modes, synchronizing camera state
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        
        if (this.isEditMode) {
            if (!this.cameraManager.is2DMode) {
                this.cameraManager.toggle2DMode();
            }
            this.setupMeshInteraction();
        } else {
            this.clearSelection();
            if (this.cameraManager.is2DMode) {
                this.cameraManager.toggle2DMode();
            }
            this.removeAllVertexMarkers();
        }
        
        return this.isEditMode;
    }

    // Sets up hover highlighting for meshes in edit mode
    setupMeshInteraction() {
        this.scene.meshes.forEach(mesh => {
            if (mesh.name === "ground1") return;
            
            if (!mesh.actionManager) {
                mesh.actionManager = new ActionManager(this.scene);
            }

            mesh.actionManager.registerAction(
                new ExecuteCodeAction(
                    ActionManager.OnPointerOverTrigger,
                    () => {
                        if (this.isEditMode && !this.selectedMesh) {
                            this.highlightLayer.addMesh(mesh, Color3.Green());
                        }
                    }
                )
            );

            mesh.actionManager.registerAction(
                new ExecuteCodeAction(
                    ActionManager.OnPointerOutTrigger,
                    () => {
                        if (this.isEditMode && !this.selectedMesh) {
                            this.highlightLayer.removeMesh(mesh);
                        }
                    }
                )
            );
        });
    }

    // Handles clicks on meshes and vertex markers in edit mode
    setupPointerObserver() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (!this.isEditMode) return;

            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const pickedMesh = pointerInfo.pickInfo.pickedMesh;
                if (pickedMesh && pickedMesh.name !== "ground1") {
                    if (pickedMesh.name === "vertexMarker") {
                        const brepVertex = this.vertexMarkers.get(pickedMesh);
                        if (brepVertex) {
                            this.handleVertexSelection(brepVertex);
                        }
                    } else {
                        this.selectMesh(pickedMesh);
                    }
                }
            }
        });
    }

    selectMesh(mesh) {
        this.clearSelection();
        this.selectedMesh = mesh;
        this.highlightLayer.addMesh(mesh, Color3.Green());
        this.createVertexMarkers();
    }

    clearSelection() {
        if (this.selectedMesh) {
            this.highlightLayer.removeMesh(this.selectedMesh);
            this.selectedMesh = null;
            this.removeAllVertexMarkers();
        }
    }

    createVertexMarkers() {
        this.removeAllVertexMarkers();
        
        if (!this.selectedMesh?.brepData) return;

        const brep = this.selectedMesh.brepData;
        const positions = brep.getPositions();
        const vertices = brep.getVertices();
        
        const maxY = Math.max(...positions.map(pos => pos[1]));
        
        vertices.forEach(vertex => {
            const pos = positions[vertex.getIndex()];
            if (Math.abs(pos[1] - maxY) < 0.001) {
                const marker = MeshBuilder.CreateSphere(
                    "vertexMarker",
                    { diameter: 0.3 },
                    this.scene
                );
                
                marker.position.set(pos[0], pos[1], pos[2]);
                marker.material = this.vertexMarkerMaterial;
                marker.isPickable = true;
                
                this.vertexMarkers.set(marker, vertex);
            }
        });
    }

    removeAllVertexMarkers() {
        for (const marker of this.vertexMarkers.keys()) {
            marker.dispose();
        }
        this.vertexMarkers.clear();
    }


    calculatePlaneNormal(positions) {
        // Get three non-collinear points to define the plane
        const point1 = Vector3.FromArray(positions[0]);
        let point2 = null;
        let point3 = null;

        // Find second point that's not too close to first point
        for (let i = 1; i < positions.length; i++) {
            const testPoint = Vector3.FromArray(positions[i]);
            if (Vector3.Distance(point1, testPoint) > 0.001) {
                point2 = testPoint;
                break;
            }
        }

        // Find third point that's not collinear with first two points
        for (let i = 1; i < positions.length; i++) {
            const testPoint = Vector3.FromArray(positions[i]);
            if (!point2) break;
            
            // Check if point is collinear using cross product
            const v1 = point2.subtract(point1);
            const v2 = testPoint.subtract(point1);
            const cross = Vector3.Cross(v1, v2);
            
            if (cross.length() > 0.001) {
                point3 = testPoint;
                break;
            }
        }

        if (!point2 || !point3) {
            console.error("Could not find three non-collinear points");
            return new Vector3(0, 1, 0); // fallback to up vector
        }

        // Calculate normal using cross product
        const v1 = point2.subtract(point1);
        const v2 = point3.subtract(point1);
        const normal = Vector3.Cross(v1, v2);
        normal.normalize();
        
        return normal;
    }

    orderVerticesByAngle(vertices, positions) {
        if (vertices.length < 3) return vertices;

        // Convert vertex positions to Vector3 array for easier manipulation
        const vertexPositions = vertices.map(idx => Vector3.FromArray(positions[idx]));
        
        // Calculate plane normal
        const normal = this.calculatePlaneNormal(vertexPositions.map(v => [v.x, v.y, v.z]));
        
        // Find centroid
        const centroid = vertexPositions.reduce((acc, pos) => acc.add(pos), new Vector3(0, 0, 0))
            .scale(1.0 / vertexPositions.length);

        // Create basis vectors for the plane
        let basisX = vertexPositions[0].subtract(centroid);
        basisX.normalize();
        const basisY = Vector3.Cross(normal, basisX);
        basisY.normalize();

        // Calculate angles in the plane
        const verticesWithAngles = vertices.map((vertexIndex, i) => {
            const pos = vertexPositions[i];
            const relativePos = pos.subtract(centroid);
            
            // Project onto plane basis vectors
            const x = Vector3.Dot(relativePos, basisX);
            const y = Vector3.Dot(relativePos, basisY);
            
            // Calculate angle in plane
            const angle = Math.atan2(y, x);
            
            return {
                index: vertexIndex,
                angle: angle
            };
        });

        // Sort vertices by angle
        verticesWithAngles.sort((a, b) => a.angle - b.angle);
        
        return verticesWithAngles.map(v => v.index);
    }

    handleVertexSelection(selectedVertex) {
        if (!this.selectedMesh?.brepData) return;
        
        const brep = this.selectedMesh.brepData;
        const positions = brep.getPositions();
        const cells = brep.getCells();
        
        const selectedPos = positions[selectedVertex.getIndex()];
        
        // Find vertex below
        const potentialVerticesBelow = positions
            .map((pos, index) => ({ pos, index }))
            .filter(({ pos }) => 
                Math.abs(pos[0] - selectedPos[0]) < 0.001 && 
                Math.abs(pos[2] - selectedPos[2]) < 0.001 && 
                pos[1] < selectedPos[1]
            )
            .sort((a, b) => b.pos[1] - a.pos[1]);

        if (potentialVerticesBelow.length === 0) return;
        const vertexBelow = potentialVerticesBelow[0];
        
        // Vertices to be removed
        const verticesToRemove = new Set([selectedVertex.getIndex(), vertexBelow.index]);
        
        // Find cells containing the vertices to be removed
        const affectedCells = cells.filter(cell => 
            cell.some(index => verticesToRemove.has(index))
        );
        
        // Find vertices directly connected to deleted vertices
        const connectedVertices = new Set();
        
        affectedCells.forEach(cell => {
            for (let i = 0; i < cell.length; i++) {
                const current = cell[i];
                const next = cell[(i + 1) % cell.length];
                
                if (verticesToRemove.has(current) && !verticesToRemove.has(next)) {
                    connectedVertices.add(next);
                }
                if (!verticesToRemove.has(current) && verticesToRemove.has(next)) {
                    connectedVertices.add(current);
                }
            }
        });
        
        // Create new positions array
        const newPositions = [];
        const indexMap = new Map();
        
        positions.forEach((pos, oldIndex) => {
            if (!verticesToRemove.has(oldIndex)) {
                indexMap.set(oldIndex, newPositions.length);
                newPositions.push(pos);
            }
        });
        
        // Create new cells
        const newCells = [];
        const processedCells = new Set();
        
        // Add existing valid cells
        cells.forEach(cell => {
            const newCell = cell
                .filter(oldIndex => !verticesToRemove.has(oldIndex))
                .map(oldIndex => indexMap.get(oldIndex));
            
            if (newCell.length >= 3) {
                const cellKey = [...newCell].sort().join(',');
                if (!processedCells.has(cellKey)) {
                    processedCells.add(cellKey);
                    newCells.push(newCell);
                }
            }
        });
        
        // Create the new cell from ordered connected vertices using angle-based ordering
        if (connectedVertices.size >= 3) {
            const connectedVertexIndices = Array.from(connectedVertices);
            // Get positions of connected vertices for plane calculation
            const connectedPositions = connectedVertexIndices.map(idx => positions[idx]);
            
            const orderedVertices = this.orderVerticesByAngle(
                connectedVertexIndices,
                positions
            );
            
            const newCell = orderedVertices.map(oldIndex => indexMap.get(oldIndex));
            const cellKey = [...newCell].sort().join(',');
            
            if (!processedCells.has(cellKey)) {
                processedCells.add(cellKey);
                newCells.push(newCell);
            }
        }

        try {
            const newMesh = new Mesh("modified_mesh", this.scene);
            
            const newBrep = new BrepMesh();
            newBrep.setPositions(newPositions);
            newBrep.setCells(newCells);
            newBrep.process();
            
            const result = this.tessellator.tessellate(newBrep, this.scene);
            if (!result?.geometry) {
                throw new Error("Failed to create new geometry");
            }
            
            result.geometry.applyToMesh(newMesh);
            newMesh.brepData = newBrep;
            
            if (this.selectedMesh.material) {
                newMesh.material = this.selectedMesh.material.clone("modified_material");
            } else {
                const material = new StandardMaterial("modified_material", this.scene);
                material.diffuseColor = new Color3(0.8, 0.8, 0.8);
                material.backFaceCulling = false;
                newMesh.material = material;
            }
            
            newMesh.enableEdgesRendering();
            newMesh.edgesColor = new Color4(0, 0, 0, 1);
            newMesh.position = this.selectedMesh.position.clone();
            newMesh.rotation = this.selectedMesh.rotation.clone();
            newMesh.scaling = this.selectedMesh.scaling.clone();
            
            const oldMesh = this.selectedMesh;
            this.selectedMesh = null;
            this.removeAllVertexMarkers();
            oldMesh.dispose();
            
            if (!newMesh.actionManager) {
                newMesh.actionManager = new ActionManager(this.scene);
            }
            
            this.selectMesh(newMesh);
            this.highlightLayer.addMesh(newMesh, Color3.Green());
            
        } catch (error) {
            console.error('Error creating new mesh:', error);
        }
    }
}