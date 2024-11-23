import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction, Mesh, Vector3 } from "@babylonjs/core";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import Tessellator from "./Tessellator";
import Face from "mda/mda/Core/Face";
import HalfEdge from "mda/mda/Core/HalfEdge";
import Edge from "mda/mda/Core/Edge";
import VertexHalfEdges from "mda/mda/Queries/VertexHalfEdges";
import VertexFaces from "mda/mda/Queries/VertexFaces";
import VertexNeighbors from "mda/mda/Queries/VertexNeighbors";
import VertexEdges from "mda/mda/Queries/VertexEdges";
import HalfEdgePrev from "mda/mda/Queries/HalfEdgePrev";

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

    /**
     * Calculates the normal vector of a plane defined by given positions.
     * @param {Array<Array<number>>} positions - Array of [x, y, z] coordinates.
     * @returns {Vector3} The normalized normal vector of the plane.
     */
    calculatePlaneNormal(positions) {
        // Ensure there are enough points
        if (positions.length < 3) {
            console.error("Insufficient points to define a plane");
            return new Vector3(0, 1, 0); // Default up vector
        }

        const point1 = Vector3.FromArray(positions[0]);
        let point2 = null;
        let point3 = null;

        // Find second point not too close to the first
        for (let i = 1; i < positions.length; i++) {
            const testPoint = Vector3.FromArray(positions[i]);
            if (Vector3.Distance(point1, testPoint) > 0.001) {
                point2 = testPoint;
                break;
            }
        }

        // Find third point not collinear with the first two
        for (let i = 1; i < positions.length; i++) {
            const testPoint = Vector3.FromArray(positions[i]);
            if (!point2) break;
            
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
            return new Vector3(0, 1, 0); // Fallback to up vector
        }

        // Calculate normal using cross product
        const v1 = point2.subtract(point1);
        const v2 = point3.subtract(point1);
        const normal = Vector3.Cross(v1, v2).normalize();
        
        return normal;
    }

    /**
     * Orders vertices based on their angle around the centroid in the plane.
     * @param {Array<number>} vertexIndices - Indices of the vertices to order.
     * @param {Array<Array<number>>} positions - Array of [x, y, z] coordinates.
     * @returns {Array<number>} Ordered array of vertex indices.
     */
    orderVerticesByAngle(vertexIndices, positions) {
        if (vertexIndices.length < 3) return vertexIndices;

        // Convert vertex indices to Vector3 positions
        const vertexPositions = vertexIndices.map(idx => Vector3.FromArray(positions[idx]));
        
        // Calculate plane normal
        const normal = this.calculatePlaneNormal(vertexPositions.map(v => [v.x, v.y, v.z]));
        
        // Calculate centroid
        const centroid = vertexPositions.reduce((acc, pos) => acc.add(pos), new Vector3(0, 0, 0))
            .scale(1 / vertexPositions.length);

        // Create orthonormal basis for the plane
        let basisX = vertexPositions[0].subtract(centroid).normalize();
        const basisY = Vector3.Cross(normal, basisX).normalize();

        // Calculate angles for each vertex relative to the centroid and basis vectors
        const verticesWithAngles = vertexIndices.map((vertexIndex, i) => {
            const pos = vertexPositions[i];
            const relativePos = pos.subtract(centroid);
            
            const x = Vector3.Dot(relativePos, basisX);
            const y = Vector3.Dot(relativePos, basisY);
            
            const angle = Math.atan2(y, x);
            
            return { index: vertexIndex, angle };
        });

        // Sort vertices by angle
        verticesWithAngles.sort((a, b) => a.angle - b.angle);
        
        return verticesWithAngles.map(v => v.index);
    }
    
    /**
     * Handles the selection of a vertex, performing necessary mesh updates.
     * @param {Vertex} selectedVertex - The selected vertex.
     */
    handleVertexSelection(selectedVertex) {
        if (!this.selectedMesh?.brepData) return;
        
        const brep = this.selectedMesh.brepData;
        const positions = brep.getPositions();
        
        const vertexBelow = this.findVertexBelow(selectedVertex, brep);
        if (!vertexBelow) {
            console.error('Could not find corresponding vertex below');
            return;
        }

        try {
            this.deleteVertexPairAndUpdateBREP(brep, selectedVertex, vertexBelow);
            const newMesh = this.createUpdatedMesh(brep);
            this.replaceOldMesh(newMesh);
        } catch (error) {
            console.error('Error modifying mesh:', error);
        }
    }

    /**
     * Finds a neighboring vertex below the selected vertex based on Y position.
     * @param {Vertex} selectedVertex - The vertex that was selected.
     * @param {BREP} brep - The BREP data of the selected mesh.
     * @returns {Vertex|null} The neighboring vertex below, or null if none found.
     */
    findVertexBelow(selectedVertex, brep) {
        const neighbors = VertexNeighbors(selectedVertex);
        const positions = brep.getPositions();

        const belowVertices = neighbors.filter(v => 
            positions[v.getIndex()][1] < positions[selectedVertex.getIndex()][1]
        );

        if (belowVertices.length === 0) {
            return null;
        }

        // Find the closest vertex below
        belowVertices.sort((a, b) => {
            const yA = positions[a.getIndex()][1];
            const yB = positions[b.getIndex()][1];
            return yA - yB;
        });

        return belowVertices[0];
    }

    /**
     * Creates a new mesh based on the updated BREP data.
     * @param {BREP} brep - The updated BREP data.
     * @returns {Mesh} The newly created mesh.
     * @throws Will throw an error if geometry creation fails.
     */
    createUpdatedMesh(brep) {
        const newMesh = new Mesh("modified_mesh", this.scene);
        const tessellationResult = this.tessellator.tessellate(brep, this.scene);
        
        if (!tessellationResult?.geometry) {
            throw new Error("Failed to create new geometry");
        }
        
        tessellationResult.geometry.applyToMesh(newMesh);
        newMesh.brepData = brep;
        
        // Clone material from original mesh or create a default one
        newMesh.material = this.cloneOrCreateMaterial();

        // Copy mesh properties
        this.copyMeshProperties(this.selectedMesh, newMesh);
        
        return newMesh;
    }

    /**
     * Clones the material from the selected mesh or creates a default material.
     * @returns {StandardMaterial} The material for the new mesh.
     */
    cloneOrCreateMaterial() {
        if (this.selectedMesh.material) {
            return this.selectedMesh.material.clone("modified_material");
        } else {
            const material = new StandardMaterial("modified_material", this.scene);
            material.diffuseColor = new Color3(0.8, 0.8, 0.8);
            material.backFaceCulling = false;
            return material;
        }
    }

    /**
     * Copies transformation properties from the source mesh to the target mesh.
     * @param {Mesh} sourceMesh - The mesh to copy properties from.
     * @param {Mesh} targetMesh - The mesh to copy properties to.
     */
    copyMeshProperties(sourceMesh, targetMesh) {
        targetMesh.enableEdgesRendering();
        targetMesh.edgesColor = new Color4(0, 0, 0, 1);
        targetMesh.position = sourceMesh.position.clone();
        targetMesh.rotation = sourceMesh.rotation.clone();
        targetMesh.scaling = sourceMesh.scaling.clone();
    }

    /**
     * Replaces the old mesh with the new mesh in the scene and updates selection.
     * @param {Mesh} newMesh - The newly created mesh.
     */
    replaceOldMesh(newMesh) {
        const oldMesh = this.selectedMesh;
        this.selectedMesh = null;
        this.removeAllVertexMarkers();
        oldMesh.dispose();
        
        if (!newMesh.actionManager) {
            newMesh.actionManager = new ActionManager(this.scene);
        }
        
        this.selectMesh(newMesh);
        this.highlightLayer.addMesh(newMesh, Color3.Green());
    }

    /**
     * Retrieves all faces associated with a vertex.
     * @param {Vertex} vertex - The vertex to retrieve faces for.
     * @returns {Array<Face>} Array of faces connected to the vertex.
     */
    vertexFaces(vertex) {
        const faces = [];
        const startHalfEdge = vertex.getHalfEdge();
        
        if (!startHalfEdge) {
            console.warn('Vertex has no associated half-edges.');
            return faces;
        }
    
        let currentHalfEdge = startHalfEdge;
        do {
            const face = currentHalfEdge.getFace();
            if (face && !faces.includes(face)) {
                faces.push(face);
            }
            currentHalfEdge = currentHalfEdge.getFlipHalfEdge();
            if (!currentHalfEdge) {
                console.warn('Encountered a boundary edge during traversal.');
                break;
            }
            currentHalfEdge = currentHalfEdge.getNextHalfEdge();
        } while (currentHalfEdge && currentHalfEdge !== startHalfEdge);
    
        return faces;
    }

    /**
     * Deletes a pair of vertices and updates the BREP accordingly.
     * @param {BREP} brep - The BREP data.
     * @param {Vertex} vertex1 - The first vertex to delete.
     * @param {Vertex} vertex2 - The second vertex to delete.
     */
    deleteVertexPairAndUpdateBREP(brep, vertex1, vertex2) {
        // Gather faces connected to each vertex
        const vertex1Faces = new Set(VertexFaces(vertex1));
        const vertex2Faces = new Set(VertexFaces(vertex2));

        // Gather edges connected to each vertex
        // Directly initialize allVertexEdges as a Set without spreading into an array
        const allVertexEdges = new Set([...VertexEdges(vertex1), ...VertexEdges(vertex2)]);

        
        // Determine top and bottom Y positions
        const positions = brep.getPositions();
        const vertex1Y = positions[vertex1.getIndex()][1];
        const vertex2Y = positions[vertex2.getIndex()][1];
        
        // Identify top face (all vertices at higher Y)
        const topFace = Array.from(vertex1Faces).find(face => {
            const faceVertices = this.getFaceVertices(face);
            return faceVertices.every(v => 
                Math.abs(positions[v.getIndex()][1] - Math.max(vertex1Y, vertex2Y)) < 0.001
            );
        });
        
        // Identify bottom face (all vertices at lower Y)
        const bottomFace = Array.from(vertex2Faces).find(face => {
            const faceVertices = this.getFaceVertices(face);
            return faceVertices.every(v => 
                Math.abs(positions[v.getIndex()][1] - Math.min(vertex1Y, vertex2Y)) < 0.001
            );
        });

        // Determine which faces to delete (non-top/bottom)
        const facesToDelete = new Set([...vertex1Faces, ...vertex2Faces]);
        facesToDelete.delete(topFace);
        facesToDelete.delete(bottomFace);

        // Collect half-edges connected to both vertices
        const vertex1HalfEdges = VertexHalfEdges(vertex1);
        const vertex2HalfEdges = VertexHalfEdges(vertex2);

        const disjointHalfEdges = new Set();
        
        // Update top face without vertex1
        if (topFace) {
            const updatedHE = this.updateFaceWithoutVertex(topFace, vertex1, brep);
            if (updatedHE) disjointHalfEdges.add(updatedHE);
        }

        // Update bottom face without vertex2
        if (bottomFace) {
            const updatedHE = this.updateFaceWithoutVertex(bottomFace, vertex2, brep);
            if (updatedHE) disjointHalfEdges.add(updatedHE);
        }

        // Collect edges and half-edges to delete
        const edgesToDelete = new Set();
        const halfEdgesToDelete = new Set();

        allVertexEdges.forEach(edge => {
            const halfEdge = edge.getHalfEdge();
            const flipHalfEdge = halfEdge.getFlipHalfEdge();
            edgesToDelete.add(edge);
            halfEdgesToDelete.add(halfEdge);
            halfEdgesToDelete.add(flipHalfEdge);
        });

        // Process each half-edge connected to the vertices
        [...vertex1HalfEdges, ...vertex2HalfEdges].forEach(he => {
            const face = he.getFace();
            halfEdgesToDelete.add(he);
            edgesToDelete.add(he.getEdge());
            if (he.getFlipHalfEdge()) {
                halfEdgesToDelete.add(he.getFlipHalfEdge());
            }

            if (face !== topFace && face !== bottomFace) {
                // Collect all half-edges of the face
                let currentHE = he;
                do {
                    currentHE = currentHE.getNextHalfEdge();
                    halfEdgesToDelete.add(currentHE);
                } while (currentHE !== he);

                // Handle orphan half-edge
                const orphanHalfEdge = he.getNextHalfEdge().getNextHalfEdge().getFlipHalfEdge();
                if (orphanHalfEdge && orphanHalfEdge.getVertex() !== vertex1 && orphanHalfEdge.getVertex() !== vertex2) {
                    disjointHalfEdges.add(orphanHalfEdge);
                }
            }
        });

        // Create a cycle from the new half-edges' vertices
        const newVertices = Array.from(disjointHalfEdges).map(he => he.getVertex());
        const orderedVertexIndices = this.orderVerticesByAngle(newVertices.map(v => v.getIndex()), positions);

        // Create a new face
        const newFace = new Face();
        newFace.setIndex(brep.faces.length);
        brep.faces.push(newFace);

        // Define a helper to retrieve half-edges by vertex indices
        brep.getHalfEdge = function(vStart, vEnd) {
            return this.halfEdges.find(he => 
                he.getVertex().getIndex() === vStart && he.getNextHalfEdge().getVertex().getIndex() === vEnd
            ) || null;
        };

        let previousHE = null;
        orderedVertexIndices.forEach((vIndex, i) => {
            const nextVIndex = orderedVertexIndices[(i + 1) % orderedVertexIndices.length];
            let edge = brep.getEdge(vIndex, nextVIndex);
            if (!edge) {
                edge = new Edge();
                edge.setIndex(brep.edges.length);
                brep.edges.push(edge);
            }

            const newHalfEdge = new HalfEdge();
            newHalfEdge.setVertex(brep.vertices[vIndex]);
            newHalfEdge.setEdge(edge);
            newHalfEdge.setFace(newFace);
            edge.setHalfEdge(newHalfEdge);
            brep.halfEdges.push(newHalfEdge);
            
            if (previousHE) {
                previousHE.setNextHalfEdge(newHalfEdge);
            }

            // Assign flip half-edges
            const existingFlipHE = brep.getHalfEdge(nextVIndex, vIndex);
            if (existingFlipHE) {
                newHalfEdge.setFlipHalfEdge(existingFlipHE);
                existingFlipHE.setFlipHalfEdge(newHalfEdge);
            } else {
                const flipHE = new HalfEdge();
                flipHE.setVertex(brep.vertices[nextVIndex]);
                flipHE.setEdge(edge);
                flipHE.setFace(null); // Assign the correct face if known
                flipHE.setFlipHalfEdge(newHalfEdge);
                newHalfEdge.setFlipHalfEdge(flipHE);
                brep.halfEdges.push(flipHE);
            }

            previousHE = newHalfEdge;
        });

        // Close the loop for next pointers
        if (orderedVertexIndices.length > 0) {
            const firstHE = brep.halfEdges[brep.halfEdges.length - orderedVertexIndices.length];
            const lastHE = brep.halfEdges[brep.halfEdges.length - 1];
            lastHE.setNextHalfEdge(firstHE);
        }

        // Assign half-edge to the new face
        newFace.setHalfEdge(brep.halfEdges[brep.halfEdges.length - 1]);

        // Remove unwanted edges and half-edges
        brep.edges = brep.edges.filter(e => !edgesToDelete.has(e));
        brep.halfEdges = brep.halfEdges.filter(he => !halfEdgesToDelete.has(he));

        // Remove deleted vertices from BREP
        const verticesToDelete = new Set([vertex1, vertex2]);
        brep.vertices = brep.vertices.filter(v => !verticesToDelete.has(v));

        // Remove corresponding positions
        const indicesToDelete = new Set([vertex1.getIndex(), vertex2.getIndex()]);
        brep.positions = brep.positions.filter((_, index) => !indicesToDelete.has(index));

        // Delete side faces
        brep.faces = brep.faces.filter(face => !facesToDelete.has(face));

        // Update indices for vertices, edges, and faces
        brep.vertices.forEach((v, i) => v.setIndex(i));
        brep.edges.forEach((e, i) => e.setIndex(i));
        brep.faces.forEach((f, i) => f.setIndex(i));

        // Rebuild cells and edge map
        brep.cells = brep.getCells();
        brep.buildEdgeMap();
    }

    /**
     * Retrieves all vertices of a face.
     * @param {Face} face - The face to retrieve vertices from.
     * @returns {Array<Vertex>} Array of vertices in the face.
     */
    getFaceVertices(face) {
        const vertices = [];
        let startHalfEdge = face.getHalfEdge();
        let currentHalfEdge = startHalfEdge;
        
        do {
            vertices.push(currentHalfEdge.getVertex());
            currentHalfEdge = currentHalfEdge.getNextHalfEdge();
        } while (currentHalfEdge !== startHalfEdge);
        
        return vertices;
    }

    /**
     * Updates a face by removing a specified vertex.
     * @param {Face} face - The face to update.
     * @param {Vertex} vertexToRemove - The vertex to remove from the face.
     * @param {BREP} brep - The BREP data.
     * @returns {HalfEdge|null} The newly created half-edge or null on failure.
     */
    updateFaceWithoutVertex(face, vertexToRemove, brep) {
        // Find the half-edge of the face that has the vertex to remove
        const halfEdgeToRemove = VertexHalfEdges(vertexToRemove).find(he => he.getFace() === face);
        if (!halfEdgeToRemove) {
            console.error('Could not find half-edge to remove');
            return null;
        }

        // Get previous and next half-edges
        const previousHalfEdge = HalfEdgePrev(halfEdgeToRemove);
        const nextHalfEdge = halfEdgeToRemove.getNextHalfEdge();

        // Get the vertex before the one to remove
        const previousVertex = previousHalfEdge.getVertex();

        // Create a new edge and half-edge
        const newEdge = new Edge();
        newEdge.setIndex(brep.edges.length);
        brep.edges.push(newEdge);

        const newHalfEdge = new HalfEdge();
        newHalfEdge.setVertex(previousVertex);
        newHalfEdge.setEdge(newEdge);
        newHalfEdge.setFace(face);
        newEdge.setHalfEdge(newHalfEdge);
        brep.halfEdges.push(newHalfEdge);

        // Re-link the half-edges
        HalfEdgePrev(previousHalfEdge).setNextHalfEdge(newHalfEdge);
        newHalfEdge.setNextHalfEdge(nextHalfEdge);

        // Update the face's half-edge reference
        face.setHalfEdge(newHalfEdge);

        // Update the vertex's half-edge reference
        previousVertex.setHalfEdge(newHalfEdge);

        return newHalfEdge;
    }
}
