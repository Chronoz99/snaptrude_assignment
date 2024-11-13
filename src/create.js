import { Color3, Color4, CreateBox, Mesh, StandardMaterial } from "@babylonjs/core";
import BrepMesh from "mda/mda/Core/Mesh";  // Renamed to avoid conflict
import Tessellator from "./Tessellator";

export const addMesh = (scene) => {
  let brep = new BrepMesh();
  
  const positions = [
    [5, 0, 5],
    [10, 0, 5],
    [9, 0, 10],
    [4, 0, 10],
    [5, 5, 5],
    [10, 5, 5],
    [9, 5, 10],
    [4, 5, 10],
  ];

  const cells = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];

  brep.setPositions(positions);
  brep.setCells(cells);
  brep.process();

  const tessellator = new Tessellator();
  const mesh = new Mesh("box", scene);

  const { geometry } = tessellator.tessellate(brep, scene);
  if (!geometry) return;

  const material = new StandardMaterial("material", scene);
  material.diffuseColor = new Color3(0.8, 0.8, 0.8);
  material.backFaceCulling = false;

  geometry.applyToMesh(mesh);
  mesh.enableEdgesRendering();
  mesh.edgesColor = new Color4(0, 0, 0, 1);
  mesh.material = material;
  
  // Store BRep data with the mesh
  mesh.brepData = brep;
  
  return mesh;
};


export const addCustomMesh = (scene, basePolygon, height = 5) => {
  let brep = new BrepMesh();

  // Create positions array by combining base polygon points with their elevated counterparts
  const positions = [];
  
  // Add base polygon points (y = 0)
  basePolygon.forEach(([x, z]) => {
    positions.push([x, 0, z]);
  });
  
  // Add elevated polygon points (y = height)
  basePolygon.forEach(([x, z]) => {
    positions.push([x, height, z]);
  });

  // Create cells array
  const cells = [];
  const numPoints = basePolygon.length;
  
  // Bottom face (counter-clockwise)
  const bottomFace = Array.from({ length: numPoints }, (_, i) => i);
  cells.push(bottomFace);
  
  // Top face (clockwise to maintain correct normals)
  const topFace = Array.from({ length: numPoints }, (_, i) => numPoints + i);
  cells.push(topFace.reverse());
  
  // Side faces
  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;
    cells.push([
      i,                    // current bottom point
      nextI,                // next bottom point
      nextI + numPoints,    // next top point
      i + numPoints         // current top point
    ]);
  }

  brep.setPositions(positions);
  brep.setCells(cells);
  brep.process();

  const tessellator = new Tessellator();
  const mesh = new Mesh("custom_polygon", scene);
  
  const { geometry } = tessellator.tessellate(brep, scene);
  if (!geometry) return;

  const material = new StandardMaterial("material", scene);
  material.diffuseColor = new Color3(0.8, 0.8, 0.8);
  material.backFaceCulling = false;

  geometry.applyToMesh(mesh);
  mesh.enableEdgesRendering();
  mesh.edgesColor = new Color4(0, 0, 0, 1);
  mesh.material = material;

  // Store BRep data with the mesh
  mesh.brepData = brep;
  
  return mesh;
};


export const addExampleMeshes = (scene) => {
  // Square base (original example)
  const squareBase = [
    [5, -5],
    [10, -5],
    [9, -10],
    [4, -10]
  ];
  const squareMesh = addCustomMesh(scene, squareBase, 5);

  // Pentagon base
  const pentagonBase = [
    [-3, 8],
    [2, 5],
    [1, 11],
    [-3, 10],
    [-7, 8]
  ];
  const pentagonMesh = addCustomMesh(scene, pentagonBase, 5);

  // Hexagon base
  const hexagonBase = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / 6;
    const radius = 5;
    return [
      radius * Math.cos(angle),
      radius * Math.sin(angle)
    ];
  });
  const hexagonMesh = addCustomMesh(scene, hexagonBase, 5);

  // Octagon base
  const octagonBase = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / 8;
    const radius = 5;
    return [
      radius * Math.cos(angle) + 15, // Offset to the right to avoid overlap
      radius * Math.sin(angle)
    ];
  });
  const octagonMesh = addCustomMesh(scene, octagonBase, 5);

  return [squareMesh, pentagonMesh, hexagonMesh, octagonMesh];
};