import { vec3 } from 'gl-matrix';
import { range } from 'lodash';

import { ScalarField } from './ScalarField';

/**
 * This file contains an implementation of the marching cubes algorithm to
 * generate a surface from a scalar field. See
 * https://en.wikipedia.org/wiki/Marching_cubes for an explanation of the
 * algorithm, or see the paper "Marching Cubes: A high resolution
 * 3D surface construction algorithm" by Lorenson and Cline.
 */

// triTable maps an encoding of a voxel with points above and below the surface,
// to the points along edges that will be used to surface the voxel. If point i
// on the voxel is below the surface, the i-th bit of the index is 1, and if the
// point is above the surface, the i-th bit is 0.
//
// This array was generated by genTriTable.py. See the comment at the top of the
// file for the cube edge and vertex numbering scheme.
const triTable: number[][] = [
    [],
    [0, 2, 4],
    [0, 1, 5],
    [2, 4, 1, 1, 5, 4],
    [2, 3, 6],
    [0, 4, 3, 3, 6, 4],
    [0, 1, 5, 2, 3, 6],
    [4, 5, 6, 5, 6, 1, 6, 1, 3],
    [1, 3, 7],
    [0, 2, 4, 1, 3, 7],
    [0, 5, 3, 3, 7, 5],
    [5, 4, 7, 4, 7, 2, 7, 2, 3],
    [2, 6, 1, 1, 7, 6],
    [6, 4, 7, 4, 7, 0, 7, 0, 1],
    [7, 5, 6, 5, 6, 0, 6, 0, 2],
    [4, 5, 6, 5, 6, 7],
    [8, 10, 4],
    [0, 2, 8, 8, 10, 2],
    [0, 1, 5, 8, 10, 4],
    [2, 1, 10, 1, 10, 5, 10, 5, 8],
    [2, 3, 6, 8, 10, 4],
    [0, 3, 8, 3, 8, 6, 8, 6, 10],
    [0, 1, 5, 2, 3, 6, 8, 10, 4],
    [6, 10, 8, 6, 8, 5, 6, 5, 3, 3, 1, 5],
    [1, 3, 7, 8, 10, 4],
    [0, 2, 8, 8, 10, 2, 1, 3, 7],
    [0, 5, 3, 3, 7, 5, 8, 10, 4],
    [7, 5, 8, 7, 8, 2, 3, 7, 2, 10, 8, 2],
    [2, 6, 1, 1, 7, 6, 8, 10, 4],
    [7, 6, 10, 7, 10, 0, 1, 7, 0, 8, 10, 0],
    [7, 5, 6, 5, 6, 0, 6, 0, 2, 8, 10, 4],
    [7, 5, 6, 5, 6, 8, 6, 8, 10],
    [8, 9, 5],
    [0, 2, 4, 8, 9, 5],
    [0, 1, 8, 8, 9, 1],
    [1, 2, 9, 2, 9, 4, 9, 4, 8],
    [2, 3, 6, 8, 9, 5],
    [0, 4, 3, 3, 6, 4, 8, 9, 5],
    [0, 1, 8, 8, 9, 1, 2, 3, 6],
    [6, 4, 8, 6, 8, 1, 3, 6, 1, 9, 8, 1],
    [1, 3, 7, 8, 9, 5],
    [0, 2, 4, 1, 3, 7, 8, 9, 5],
    [0, 3, 8, 3, 8, 7, 8, 7, 9],
    [7, 9, 8, 7, 8, 4, 7, 4, 3, 3, 2, 4],
    [2, 6, 1, 1, 7, 6, 8, 9, 5],
    [6, 4, 7, 4, 7, 0, 7, 0, 1, 8, 9, 5],
    [6, 7, 9, 6, 9, 0, 2, 6, 0, 8, 9, 0],
    [6, 4, 7, 4, 7, 8, 7, 8, 9],
    [10, 4, 9, 9, 5, 4],
    [10, 2, 9, 2, 9, 0, 9, 0, 5],
    [9, 1, 10, 1, 10, 0, 10, 0, 4],
    [2, 1, 10, 1, 10, 9],
    [2, 3, 6, 10, 4, 9, 9, 5, 4],
    [3, 0, 5, 3, 5, 10, 6, 3, 10, 9, 5, 10],
    [9, 1, 10, 1, 10, 0, 10, 0, 4, 2, 3, 6],
    [9, 1, 10, 1, 10, 3, 10, 3, 6],
    [1, 3, 7, 10, 4, 9, 9, 5, 4],
    [10, 2, 9, 2, 9, 0, 9, 0, 5, 1, 3, 7],
    [3, 0, 4, 3, 4, 9, 7, 3, 9, 10, 4, 9],
    [10, 2, 9, 2, 9, 3, 9, 3, 7],
    [2, 6, 1, 1, 7, 6, 10, 4, 9, 9, 5, 4],
    [0, 1, 5, 10, 6, 9, 9, 7, 6],
    [0, 2, 4, 10, 6, 9, 9, 7, 6],
    [10, 6, 9, 9, 7, 6],
    [10, 11, 6],
    [0, 2, 4, 10, 11, 6],
    [0, 1, 5, 10, 11, 6],
    [2, 4, 1, 1, 5, 4, 10, 11, 6],
    [2, 3, 10, 10, 11, 3],
    [3, 0, 11, 0, 11, 4, 11, 4, 10],
    [0, 1, 5, 2, 3, 10, 10, 11, 3],
    [5, 4, 10, 5, 10, 3, 1, 5, 3, 11, 10, 3],
    [1, 3, 7, 10, 11, 6],
    [0, 2, 4, 1, 3, 7, 10, 11, 6],
    [0, 5, 3, 3, 7, 5, 10, 11, 6],
    [5, 4, 7, 4, 7, 2, 7, 2, 3, 10, 11, 6],
    [2, 1, 10, 1, 10, 7, 10, 7, 11],
    [7, 11, 10, 7, 10, 4, 7, 4, 1, 1, 0, 4],
    [5, 7, 11, 5, 11, 2, 0, 5, 2, 10, 11, 2],
    [5, 4, 7, 4, 7, 10, 7, 10, 11],
    [8, 4, 11, 11, 6, 4],
    [8, 0, 11, 0, 11, 2, 11, 2, 6],
    [0, 1, 5, 8, 4, 11, 11, 6, 4],
    [1, 2, 6, 1, 6, 8, 5, 1, 8, 11, 6, 8],
    [11, 3, 8, 3, 8, 2, 8, 2, 4],
    [0, 3, 8, 3, 8, 11],
    [0, 1, 5, 11, 3, 8, 3, 8, 2, 8, 2, 4],
    [11, 3, 8, 3, 8, 1, 8, 1, 5],
    [1, 3, 7, 8, 4, 11, 11, 6, 4],
    [8, 0, 11, 0, 11, 2, 11, 2, 6, 1, 3, 7],
    [0, 5, 3, 3, 7, 5, 8, 4, 11, 11, 6, 4],
    [2, 3, 6, 8, 5, 11, 11, 7, 5],
    [1, 2, 4, 1, 4, 11, 7, 1, 11, 8, 4, 11],
    [8, 0, 11, 0, 11, 1, 11, 1, 7],
    [0, 2, 4, 8, 5, 11, 11, 7, 5],
    [8, 5, 11, 11, 7, 5],
    [8, 9, 5, 10, 11, 6],
    [0, 2, 4, 8, 9, 5, 10, 11, 6],
    [0, 1, 8, 8, 9, 1, 10, 11, 6],
    [1, 2, 9, 2, 9, 4, 9, 4, 8, 10, 11, 6],
    [2, 3, 10, 10, 11, 3, 8, 9, 5],
    [3, 0, 11, 0, 11, 4, 11, 4, 10, 8, 9, 5],
    [0, 1, 8, 8, 9, 1, 2, 3, 10, 10, 11, 3],
    [1, 3, 9, 9, 11, 3, 8, 10, 4],
    [1, 3, 7, 8, 9, 5, 10, 11, 6],
    [0, 2, 4, 1, 3, 7, 8, 9, 5, 10, 11, 6],
    [0, 3, 8, 3, 8, 7, 8, 7, 9, 10, 11, 6],
    [2, 3, 6, 8, 10, 4, 9, 11, 7],
    [2, 1, 10, 1, 10, 7, 10, 7, 11, 8, 9, 5],
    [0, 1, 5, 8, 10, 4, 9, 11, 7],
    [0, 2, 8, 8, 10, 2, 9, 11, 7],
    [8, 10, 4, 9, 11, 7],
    [4, 5, 6, 5, 6, 9, 6, 9, 11],
    [9, 11, 6, 9, 6, 2, 9, 2, 5, 5, 0, 2],
    [1, 9, 11, 1, 11, 4, 0, 1, 4, 6, 11, 4],
    [1, 2, 9, 2, 9, 6, 9, 6, 11],
    [3, 11, 9, 3, 9, 4, 2, 3, 4, 5, 9, 4],
    [3, 0, 11, 0, 11, 5, 11, 5, 9],
    [0, 2, 4, 1, 3, 9, 9, 11, 3],
    [1, 3, 9, 9, 11, 3],
    [1, 3, 7, 4, 5, 6, 5, 6, 9, 6, 9, 11],
    [0, 1, 5, 2, 3, 6, 9, 11, 7],
    [0, 4, 3, 3, 6, 4, 9, 11, 7],
    [2, 3, 6, 9, 11, 7],
    [2, 4, 1, 1, 5, 4, 9, 11, 7],
    [0, 1, 5, 9, 11, 7],
    [0, 2, 4, 9, 11, 7],
    [9, 11, 7],
    [9, 11, 7],
    [0, 2, 4, 9, 11, 7],
    [0, 1, 5, 9, 11, 7],
    [2, 4, 1, 1, 5, 4, 9, 11, 7],
    [2, 3, 6, 9, 11, 7],
    [0, 4, 3, 3, 6, 4, 9, 11, 7],
    [0, 1, 5, 2, 3, 6, 9, 11, 7],
    [4, 5, 6, 5, 6, 1, 6, 1, 3, 9, 11, 7],
    [1, 3, 9, 9, 11, 3],
    [0, 2, 4, 1, 3, 9, 9, 11, 3],
    [3, 0, 11, 0, 11, 5, 11, 5, 9],
    [4, 5, 9, 4, 9, 3, 2, 4, 3, 11, 9, 3],
    [1, 2, 9, 2, 9, 6, 9, 6, 11],
    [4, 6, 11, 4, 11, 1, 0, 4, 1, 9, 11, 1],
    [6, 11, 9, 6, 9, 5, 6, 5, 2, 2, 0, 5],
    [4, 5, 6, 5, 6, 9, 6, 9, 11],
    [8, 10, 4, 9, 11, 7],
    [0, 2, 8, 8, 10, 2, 9, 11, 7],
    [0, 1, 5, 8, 10, 4, 9, 11, 7],
    [2, 1, 10, 1, 10, 5, 10, 5, 8, 9, 11, 7],
    [2, 3, 6, 8, 10, 4, 9, 11, 7],
    [0, 3, 8, 3, 8, 6, 8, 6, 10, 9, 11, 7],
    [0, 1, 5, 2, 3, 6, 8, 10, 4, 9, 11, 7],
    [1, 3, 7, 8, 9, 5, 10, 11, 6],
    [1, 3, 9, 9, 11, 3, 8, 10, 4],
    [0, 2, 8, 8, 10, 2, 1, 3, 9, 9, 11, 3],
    [3, 0, 11, 0, 11, 5, 11, 5, 9, 8, 10, 4],
    [2, 3, 10, 10, 11, 3, 8, 9, 5],
    [1, 2, 9, 2, 9, 6, 9, 6, 11, 8, 10, 4],
    [0, 1, 8, 8, 9, 1, 10, 11, 6],
    [0, 2, 4, 8, 9, 5, 10, 11, 6],
    [8, 9, 5, 10, 11, 6],
    [8, 5, 11, 11, 7, 5],
    [0, 2, 4, 8, 5, 11, 11, 7, 5],
    [8, 0, 11, 0, 11, 1, 11, 1, 7],
    [2, 1, 7, 2, 7, 8, 4, 2, 8, 11, 7, 8],
    [2, 3, 6, 8, 5, 11, 11, 7, 5],
    [0, 4, 3, 3, 6, 4, 8, 5, 11, 11, 7, 5],
    [8, 0, 11, 0, 11, 1, 11, 1, 7, 2, 3, 6],
    [1, 3, 7, 8, 4, 11, 11, 6, 4],
    [11, 3, 8, 3, 8, 1, 8, 1, 5],
    [0, 2, 4, 11, 3, 8, 3, 8, 1, 8, 1, 5],
    [0, 3, 8, 3, 8, 11],
    [11, 3, 8, 3, 8, 2, 8, 2, 4],
    [2, 1, 5, 2, 5, 11, 6, 2, 11, 8, 5, 11],
    [0, 1, 5, 8, 4, 11, 11, 6, 4],
    [8, 0, 11, 0, 11, 2, 11, 2, 6],
    [8, 4, 11, 11, 6, 4],
    [5, 4, 7, 4, 7, 10, 7, 10, 11],
    [2, 10, 11, 2, 11, 5, 0, 2, 5, 7, 11, 5],
    [10, 11, 7, 10, 7, 1, 10, 1, 4, 4, 0, 1],
    [2, 1, 10, 1, 10, 7, 10, 7, 11],
    [2, 3, 6, 5, 4, 7, 4, 7, 10, 7, 10, 11],
    [0, 5, 3, 3, 7, 5, 10, 11, 6],
    [0, 2, 4, 1, 3, 7, 10, 11, 6],
    [1, 3, 7, 10, 11, 6],
    [3, 11, 10, 3, 10, 5, 1, 3, 5, 4, 10, 5],
    [0, 1, 5, 2, 3, 10, 10, 11, 3],
    [3, 0, 11, 0, 11, 4, 11, 4, 10],
    [2, 3, 10, 10, 11, 3],
    [2, 4, 1, 1, 5, 4, 10, 11, 6],
    [0, 1, 5, 10, 11, 6],
    [0, 2, 4, 10, 11, 6],
    [10, 11, 6],
    [10, 6, 9, 9, 7, 6],
    [0, 2, 4, 10, 6, 9, 9, 7, 6],
    [0, 1, 5, 10, 6, 9, 9, 7, 6],
    [2, 4, 1, 1, 5, 4, 10, 6, 9, 9, 7, 6],
    [10, 2, 9, 2, 9, 3, 9, 3, 7],
    [0, 3, 7, 0, 7, 10, 4, 0, 10, 9, 7, 10],
    [0, 1, 5, 10, 2, 9, 2, 9, 3, 9, 3, 7],
    [1, 3, 7, 10, 4, 9, 9, 5, 4],
    [9, 1, 10, 1, 10, 3, 10, 3, 6],
    [0, 2, 4, 9, 1, 10, 1, 10, 3, 10, 3, 6],
    [0, 3, 6, 0, 6, 9, 5, 0, 9, 10, 6, 9],
    [2, 3, 6, 10, 4, 9, 9, 5, 4],
    [2, 1, 10, 1, 10, 9],
    [9, 1, 10, 1, 10, 0, 10, 0, 4],
    [10, 2, 9, 2, 9, 0, 9, 0, 5],
    [10, 4, 9, 9, 5, 4],
    [6, 4, 7, 4, 7, 8, 7, 8, 9],
    [0, 8, 9, 0, 9, 6, 2, 0, 6, 7, 9, 6],
    [0, 1, 5, 6, 4, 7, 4, 7, 8, 7, 8, 9],
    [2, 6, 1, 1, 7, 6, 8, 9, 5],
    [8, 9, 7, 8, 7, 3, 8, 3, 4, 4, 2, 3],
    [0, 3, 8, 3, 8, 7, 8, 7, 9],
    [0, 2, 4, 1, 3, 7, 8, 9, 5],
    [1, 3, 7, 8, 9, 5],
    [1, 9, 8, 1, 8, 6, 3, 1, 6, 4, 8, 6],
    [0, 1, 8, 8, 9, 1, 2, 3, 6],
    [0, 4, 3, 3, 6, 4, 8, 9, 5],
    [2, 3, 6, 8, 9, 5],
    [1, 2, 9, 2, 9, 4, 9, 4, 8],
    [0, 1, 8, 8, 9, 1],
    [0, 2, 4, 8, 9, 5],
    [8, 9, 5],
    [7, 5, 6, 5, 6, 8, 6, 8, 10],
    [0, 2, 4, 7, 5, 6, 5, 6, 8, 6, 8, 10],
    [0, 8, 10, 0, 10, 7, 1, 0, 7, 6, 10, 7],
    [2, 6, 1, 1, 7, 6, 8, 10, 4],
    [2, 10, 8, 2, 8, 7, 3, 2, 7, 5, 8, 7],
    [0, 5, 3, 3, 7, 5, 8, 10, 4],
    [0, 2, 8, 8, 10, 2, 1, 3, 7],
    [1, 3, 7, 8, 10, 4],
    [8, 10, 6, 8, 6, 3, 8, 3, 5, 5, 1, 3],
    [0, 1, 5, 2, 3, 6, 8, 10, 4],
    [0, 3, 8, 3, 8, 6, 8, 6, 10],
    [2, 3, 6, 8, 10, 4],
    [2, 1, 10, 1, 10, 5, 10, 5, 8],
    [0, 1, 5, 8, 10, 4],
    [0, 2, 8, 8, 10, 2],
    [8, 10, 4],
    [4, 5, 6, 5, 6, 7],
    [7, 5, 6, 5, 6, 0, 6, 0, 2],
    [6, 4, 7, 4, 7, 0, 7, 0, 1],
    [2, 6, 1, 1, 7, 6],
    [5, 4, 7, 4, 7, 2, 7, 2, 3],
    [0, 5, 3, 3, 7, 5],
    [0, 2, 4, 1, 3, 7],
    [1, 3, 7],
    [4, 5, 6, 5, 6, 1, 6, 1, 3],
    [0, 1, 5, 2, 3, 6],
    [0, 4, 3, 3, 6, 4],
    [2, 3, 6],
    [2, 4, 1, 1, 5, 4],
    [0, 1, 5],
    [0, 2, 4],
    []
];

const edgeCoords: number[][] = [
    [-1, 0, 0],
    [1, 0, -1],
    [0, 0, -1],
    [-1, 0, 1],
    [0, -1, 0],
    [1, -1, 0],
    [0, -1, 1],
    [1, -1, 1],
    [-1, 1, 0],
    [1, 1, -1],
    [0, 1, -1],
    [-1, 1, 1]
];

export function genIsoSurface(scalarField: ScalarField): vec3[] {
    const vertices: vec3[] = [];
    const genIsoSurfaceVertices = (voxel: number[][][], x: number, y: number, z: number) => {
        let triTableIdx = 0;
        range(2).forEach((dx: number) => {
            range(2).forEach((dy: number) => {
                range(2).forEach((dz: number) => {
                    if (voxel[dx][dy][dz] <= 0.001) {
                        triTableIdx += Math.pow(2, dy * 4 + dz * 2 + dx);
                    }
                });
            });
        });

        const triTableEntry = triTable[triTableIdx];

        triTableEntry.forEach((edge: number) => {
            let [ex, ey, ez] = edgeCoords[edge];
            if (ex === -1) {
                const dx = voxel[1][ey][ez] - voxel[0][ey][ez];
                ex = -voxel[0][ey][ez] / dx;
            } else if (ey === -1) {
                const dy = voxel[ex][1][ez] - voxel[ex][0][ez];
                ey = -voxel[ex][0][ez] / dy;
            } else if (ez === -1) {
                const dz = voxel[ex][ey][1] - voxel[ex][ey][0];
                ez = -voxel[ex][ey][0] / dz;
            } else {
                throw new Error('Invalid edge vertex');
            }
            const vertex = scalarField.indexToModel(ex + x, ey + y, ez + z);
            vertices.push(vertex);
        });
    };

    scalarField.forEachVoxel(genIsoSurfaceVertices);

    return vertices;
}
