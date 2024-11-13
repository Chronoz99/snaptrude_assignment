import { Geometry, VertexBuffer, VertexData, Vector3 } from "@babylonjs/core";
import earcut from "earcut";
import FaceVertices from "mda/mda/Queries/FaceVertices";
class Tessellator {

  verData = [];
  indices = [];
  uvData = [];
  faceFacetMapping = {};
  facetID = -1;
  nBabylonVertices = 0;

  tessellate(brep, scene) {

    const tessellationData = {
      geometry: null,
      faceFacetMapping: null
    };

    if (!brep) {
      console.log("No BRep present");
      return tessellationData;
    }

    this.flush();

    brep.getPositions().forEach((position, index) => {
      if (Object.prototype.toString.call(position).includes("Float32Array")) {
        brep.positions[index] = Array.prototype.slice.call(position);
      }
    });

    brep.getFaces().forEach((face, i) => this._tessellateFace.call(this, brep, face));

    const geometry = new Geometry("tessellatedGeometry", scene);

    geometry.setVerticesData(
      VertexBuffer.PositionKind,
      this.verData,
      true
    );

    geometry.setVerticesData(VertexBuffer.UVKind, this.uvData, true);
    geometry.setIndices(this.indices, null, true);

    let normals = [];
    VertexData.ComputeNormals(this.verData, this.indices, normals);

    geometry.setVerticesData(VertexBuffer.NormalKind, normals, true);

    tessellationData.geometry = geometry;
    tessellationData.faceFacetMapping = this.faceFacetMapping;

    return tessellationData;
  }


  _tessellateFace(brep, face) {

    const index = face.getIndex();
    this.faceFacetMapping[index] = [];

    const positions = brep.getPositions();
    const faceVertices = FaceVertices(face);
    const facePositions = faceVertices.map((vertex) => positions[vertex.getIndex()]);

    let flattenedPositions = [...facePositions];
   
    this._populatePositions(facePositions);
    this._populateIndices.call(
      this,
      flattenedPositions
    );

    this.nBabylonVertices = this.verData.length / 3;

  }

  _populatePositions(facePositions) {
    facePositions.forEach((position) => {
      this.verData.push(...position);
    });
  };

  _populateIndices(facePositions) {
    // Compute face normal and choose best projection plane
    const getFaceNormalAndProjection = (positions) => {
      if (positions.length < 3) {
        return {
          projectionIndices: [0, 2], // Default to XZ projection
          normal: new Vector3(0, 1, 0)  // Y-up
        };
      }

      const p0 = Vector3.FromArray(positions[0]);
      const p1 = Vector3.FromArray(positions[1]);
      const p2 = Vector3.FromArray(positions[2]);

      const v1 = p1.subtract(p0);
      const v2 = p2.subtract(p0);

      const normal = Vector3.Cross(v1, v2);
      
      const length = normal.length();
      if (length < 1e-10) {
        return {
          projectionIndices: [0, 2], // Default to XZ projection for Y-up
          normal: new Vector3(0, 1, 0)
        };
      }
      normal.scaleInPlace(1 / length);

      const nx = Math.abs(normal.x);
      const ny = Math.abs(normal.y);
      const nz = Math.abs(normal.z);


      let projectionIndices;
      if (ny >= nx && ny >= nz) {
        projectionIndices = [0, 2]; // XZ projection (for faces perpendicular to Y)
      } else if (nz >= nx) {
        projectionIndices = [0, 1]; // XY projection
      } else {
        projectionIndices = [1, 2]; // YZ projection
      }

      return { projectionIndices, normal };
    };

    // Get projection info
    const { projectionIndices } = getFaceNormalAndProjection(facePositions);

    // Project vertices onto the chosen plane
    let earcutPath = [];
    try {
      facePositions.forEach((vertex) => {
        if (!Array.isArray(vertex) || vertex.length < 3) {
          throw new Error('Invalid vertex data');
        }
        earcutPath.push(
          vertex[projectionIndices[0]],
          vertex[projectionIndices[1]]
        );
      });

      // Perform triangulation on the 2D projected points
      let triangles = earcut(earcutPath, [], 2);

      // Validate triangulation result
      if (!triangles || triangles.length === 0) {
        console.warn('Earcut triangulation produced no triangles');
        return;
      }

      // Add the triangulated indices
      for (let point of triangles) {
        if (point + this.nBabylonVertices >= this.verData.length / 3) {
          console.warn('Invalid triangle index generated');
          continue;
        }
        this.indices.push(point + this.nBabylonVertices);
      }
    } catch (error) {
      console.error('Error during face triangulation:', error);
      // Fallback to simple triangulation for robustness
      if (facePositions.length >= 3) {
        // Create a simple fan triangulation
        for (let i = 1; i < facePositions.length - 1; i++) {
          this.indices.push(
            this.nBabylonVertices,
            this.nBabylonVertices + i,
            this.nBabylonVertices + i + 1
          );
        }
      }
    }
  }

  flush() {
    this.verData = [];
    this.indices = [];
    this.uvData = [];
    this.faceFacetMapping = {};
    this.facetID = -1;
    this.nBabylonVertices = 0;
  }

}

export default Tessellator;

