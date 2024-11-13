import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction, Mesh } from "@babylonjs/core";
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

    handleVertexSelection(selectedVertex) {
        if (!this.selectedMesh?.brepData) return;
    
        const brep = this.selectedMesh.brepData;
        const selectedVertexIndex = selectedVertex.getIndex();
        const selectedPos = brep.positions[selectedVertexIndex];
        
        const neighbors = new Set();
        const neighborPositions = new Map();
        const neighborHalfEdges = new Map();
        
        const connectedFaces = VertexFaces(selectedVertex);
        
        const uniqueFaces = Array.from(
            new Set(connectedFaces.map(face => face.index))
        ).map(index => 
            connectedFaces.find(face => face.index === index)
        ).filter(face => {
            let startHE = face.halfEdge;
            let currentHE = startHE;
            
            do {
                if (currentHE.vertex.index === selectedVertexIndex) {
                    return true;
                }
                currentHE = currentHE.nextHalfEdge;
            } while (currentHE !== startHE);
            
            return false;
        });
    
        uniqueFaces.forEach(face => {
            let startHE = face.halfEdge;
            let currentHE = startHE;
            
            do {
                if (currentHE.vertex.index === selectedVertexIndex) {
                    let prevHE = startHE;
                    while (prevHE.nextHalfEdge !== currentHE) {
                        prevHE = prevHE.nextHalfEdge;
                    }
                    
                    let nextHE = currentHE.nextHalfEdge;
                    
                    neighbors.add(prevHE.vertex.index);
                    neighbors.add(nextHE.vertex.index);
                    neighborPositions.set(prevHE.vertex.index, brep.positions[prevHE.vertex.index]);
                    neighborPositions.set(nextHE.vertex.index, brep.positions[nextHE.vertex.index]);
                    neighborHalfEdges.set(prevHE.vertex.index, prevHE);
                    neighborHalfEdges.set(nextHE.vertex.index, nextHE);
                    break;
                }
                currentHE = currentHE.nextHalfEdge;
            } while (currentHE !== startHE);
        });
    
        const bottomNeighborIndex = Array.from(neighbors).reduce((bottomIdx, currentIdx) => {
            const currentPos = neighborPositions.get(currentIdx);
            const bottomPos = bottomIdx === null ? null : neighborPositions.get(bottomIdx);
            
            if (bottomPos === null || currentPos[1] < bottomPos[1]) {
                return currentIdx;
            }
            return bottomIdx;
        }, null);
    
        const bottomNeighborFaces = bottomNeighborIndex !== null ? 
            VertexFaces(neighborHalfEdges.get(bottomNeighborIndex).vertex)
                .filter((face, index, self) => 
                    index === self.findIndex(f => f.index === face.index)
                ) : [];
    
        const allAffectedFaces = new Set([...uniqueFaces, ...bottomNeighborFaces]);
    
        allAffectedFaces.forEach(face => {
            let startHE = face.halfEdge;
            let currentHE = startHE;
            let firstPass = true;
            
            do {
                const currentPos = brep.positions[currentHE.vertex.index];
                
                const isSelectedVertex = Math.abs(currentPos[0] - selectedPos[0]) < 0.001 && 
                                       Math.abs(currentPos[1] - selectedPos[1]) < 0.001 && 
                                       Math.abs(currentPos[2] - selectedPos[2]) < 0.001;
                                       
                const isBottomVertex = bottomNeighborIndex !== null && 
                                     currentHE.vertex.index === bottomNeighborIndex;
    
                if (isSelectedVertex || isBottomVertex) {
                    let prevHE = startHE;
                    while (prevHE.nextHalfEdge !== currentHE) {
                        prevHE = prevHE.nextHalfEdge;
                    }
                    let nextHE = currentHE.nextHalfEdge;
    
                    prevHE.nextHalfEdge = nextHE;
    
                    if (face.halfEdge === currentHE) {
                        face.halfEdge = nextHE;
                        startHE = nextHE;
                    }
                    
                    currentHE = nextHE;
                } else {
                    currentHE = currentHE.nextHalfEdge;
                }
    
                if (currentHE === startHE) {
                    if (firstPass) {
                        firstPass = false;
                    } else {
                        break;
                    }
                }
            } while (true);
        });

        const gapBoundaryVertices = new Set();
        const vertexPositions = new Map();

        allAffectedFaces.forEach(face => {
            let startHE = face.halfEdge;
            let currentHE = startHE;
            
            do {
                const currentPos = brep.positions[currentHE.vertex.index];
                vertexPositions.set(currentHE.vertex.index, currentPos);

                const wasConnectedToRemoved = Array.from(neighbors).some(neighborIdx => {
                    const neighborPos = neighborPositions.get(neighborIdx);
                    return Math.abs(currentPos[0] - neighborPos[0]) < 0.001 &&
                           Math.abs(currentPos[2] - neighborPos[2]) < 0.001;
                });

                if (wasConnectedToRemoved) {
                    gapBoundaryVertices.add(currentHE.vertex.index);
                }

                currentHE = currentHE.nextHalfEdge;
            } while (currentHE !== startHE);
        });

        let boundaryArray = Array.from(gapBoundaryVertices);

        let leftmost = boundaryArray[0];
        let rightmost = boundaryArray[0];
        let leftmostPos = vertexPositions.get(leftmost);
        let rightmostPos = vertexPositions.get(rightmost);

        boundaryArray.forEach(vertexIndex => {
            const pos = vertexPositions.get(vertexIndex);
            if (pos[0] < leftmostPos[0]) {
                leftmost = vertexIndex;
                leftmostPos = pos;
            }
            if (pos[0] > rightmostPos[0]) {
                rightmost = vertexIndex;
                rightmostPos = pos;
            }
        });

        const primaryDir = [
            rightmostPos[0] - leftmostPos[0],
            rightmostPos[1] - leftmostPos[1],
            rightmostPos[2] - leftmostPos[2]
        ];

        const primaryLength = Math.sqrt(
            primaryDir[0] * primaryDir[0] + 
            primaryDir[1] * primaryDir[1] + 
            primaryDir[2] * primaryDir[2]
        );
        primaryDir[0] /= primaryLength;
        primaryDir[1] /= primaryLength;
        primaryDir[2] /= primaryLength;

        const upVector = [0, 1, 0];

        const planeNormal = [
            primaryDir[1] * upVector[2] - primaryDir[2] * upVector[1],
            primaryDir[2] * upVector[0] - primaryDir[0] * upVector[2],
            primaryDir[0] * upVector[1] - primaryDir[1] * upVector[0]
        ];

        const calculateAngle = (pos) => {
            const vec = [
                pos[0] - leftmostPos[0],
                pos[1] - leftmostPos[1],
                pos[2] - leftmostPos[2]
            ];

            const dot = vec[0] * planeNormal[0] + vec[1] * planeNormal[1] + vec[2] * planeNormal[2];
            const projVec = [
                vec[0] - dot * planeNormal[0],
                vec[1] - dot * planeNormal[1],
                vec[2] - dot * planeNormal[2]
            ];

            const cosAngle = (projVec[0] * primaryDir[0] + projVec[1] * primaryDir[1] + projVec[2] * primaryDir[2]) /
                Math.sqrt(projVec[0] * projVec[0] + projVec[1] * projVec[1] + projVec[2] * projVec[2]);
            
            const cross = [
                primaryDir[1] * projVec[2] - primaryDir[2] * projVec[1],
                primaryDir[2] * projVec[0] - primaryDir[0] * projVec[2],
                primaryDir[0] * projVec[1] - primaryDir[1] * projVec[0]
            ];
            
            const sign = Math.sign(cross[0] * planeNormal[0] + cross[1] * planeNormal[1] + cross[2] * planeNormal[2]);
            const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
            
            return sign * angle;
        };

        boundaryArray.sort((a, b) => {
            const angleA = calculateAngle(vertexPositions.get(a));
            const angleB = calculateAngle(vertexPositions.get(b));
            return angleA - angleB;
        });

        const currentPositions = this.selectedMesh.brepData.getPositions();
        
        const verticesToRemove = new Set([selectedVertex.getIndex()]);
        if (bottomNeighborIndex !== null) {
            verticesToRemove.add(bottomNeighborIndex);
        }

        const newPositions = [];
        const indexMap = new Map();
        
        currentPositions.forEach((pos, oldIndex) => {
            if (!verticesToRemove.has(oldIndex)) {
                indexMap.set(oldIndex, newPositions.length);
                newPositions.push(pos);
            }
        });
        
        const newCells = [];
        const processedFaces = new Set();
        
        this.selectedMesh.brepData.faces.forEach(face => {
            const faceVertices = [];
            let startHE = face.halfEdge;
            let currentHE = startHE;
            let validFace = true;
            
            do {
                const oldIndex = currentHE.vertex.index;
                if (verticesToRemove.has(oldIndex)) {
                    validFace = false;
                    break;
                }
                const newIndex = indexMap.get(oldIndex);
                faceVertices.push(newIndex);
                currentHE = currentHE.nextHalfEdge;
            } while (currentHE !== startHE);

            if (validFace && faceVertices.length >= 3) {
                const faceKey = faceVertices.join(',');
                if (!processedFaces.has(faceKey)) {
                    processedFaces.add(faceKey);
                    newCells.push(faceVertices);
                }
            }
        });

        const remappedBoundary = boundaryArray.map(oldIndex => indexMap.get(oldIndex));
        newCells.push(remappedBoundary);

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
    
            this.selectedMesh.dispose();
            this.selectedMesh = newMesh;
            this.createVertexMarkers();
        } catch (error) {
            console.error('Error creating new mesh:', error);
        }
    }
}