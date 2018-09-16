import { coord } from '../calder';
import { vec3From4, vec3ToVector } from '../math/utils';
import { Mapper } from '../utils/mapper';
import { Cost, CostFn, GeneratorInstance } from './Generator';
import { Node } from './Node';

import 'bezier-js';
import { vec3, vec4 } from 'gl-matrix';
import { minBy, range } from 'lodash';

type Closest = {
    curve: GuidingCurve;
    point: BezierJs.Projection;
};

/**
 * A DistanceMultiplier adds cost for added bones that are farther away from a guiding curve. For
 * a multiplier m, the distance cost is the sum of m[i] * distance^i, for i in [0, 2]. That is to
 * say, m[0] adds a constant offset, m[1] is a linear multiplier, and m[2] is quadratic.
 */
export type DistanceMultiplier = [number, number, number];

/**
 * A representation of a guiding curve, which is a Bezier path, and multipliers affecting the cost
 * around the curve.
 *
 * Alignment is used to incentivize adding placing structure pointing in the same direction as
 * guiding curves, whereas distance is used to penalize structure that veers too far from the
 * curves. Multipliers and offsets should be chosen to achieve a balance of allowing shapes to
 * still be placed, but with high enough costs that shapes are only placed if they are "good".
 */
export type GuidingCurve = {
    /**
     * The guiding curve.
     */
    bezier: BezierJs.Bezier;

    /**
     * A multiplier that adds cost the father from the curve you go.
     */
    distanceMultiplier: DistanceMultiplier;

    /**
     * A multiplier that scales the cost associated with the alignment of placed structure relative
     * to the guiding vector field.
     */
    alignmentMultiplier: number;

    /**
     * A number in [-1, 1] representing how aligned added structure needs to be with the vector field
     * for it to receive a negative cost (that is to say, there is incentive to add it.)
     *
     * Structure perfectly aligned with the vector field has a raw alignment cost of -1. If it is
     * perpendicular, the cost is 0. If it is exactly the opposite direction, it has a cost of 1.
     *
     * A positive offset therefore means structure needs to be **more aligned** in order to be
     * incentivized (the higher the offset, the closer it has to be to perfect alignment).
     *
     * A negative negative offset means that alignment is more lenient and is incentivized even if
     * structure is facing away from the vector field. This can be useful if adding *any* new
     * structure should be incentivized over only adding well-aligned structure.
     */
    alignmentOffset: number;
};

/**
 * A cost function that doesn't look at the geometry of a model, only the shape, by comparing
 * the angles in the skeleton to guiding vectors.
 */
export class GuidingVectors implements CostFn {
    public static NONE: DistanceMultiplier = [0, 0, 0];
    public static LINEAR: DistanceMultiplier = [0, 100, 0];
    public static QUADRATIC: DistanceMultiplier = [0, 0, 100];

    private vectors: GuidingCurve[];
    private nodeLocations: Map<Node, vec4> = new Map<Node, vec4>();

    /**
     * @param {BezierJs.Bezier[]} guidingVectors The Bezier paths that will be used to guide the
     * growth of the procedural shape.
     */
    constructor(guidingVectors: GuidingCurve[]) {
        this.vectors = guidingVectors;
    }

    /**
     * For debugging/visualization purposes, generates a buffer that is used to render lines in
     * the vector field.
     *
     * @param {number} radius To what distance from the origin field lines should be generated for
     * @param {number} step The space between field lines
     * @returns {Float32Array} A buffer of vertices for the vector field lines.
     */
    public generateVectorField(radius: number = 3, step: number = 0.5): Float32Array {
        const field: number[] = [];

        range(-radius, radius, step).forEach((x: number) => {
            range(-radius, radius, step).forEach((y: number) => {
                range(-radius, radius, step).forEach((z: number) => {
                    // Add first point
                    field.push(x, y, z);

                    const closest = this.closest(vec4.fromValues(x, y, z, 1));
                    const vector = <coord>closest.curve.bezier.derivative(<number>closest.point.t);

                    // Make the vector as long as step/2
                    const length = Math.sqrt(
                        vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
                    );
                    vector.x *= step / 2 / length;
                    vector.y *= step / 2 / length;
                    vector.z *= step / 2 / length;

                    // Add second point: original point plus vector
                    field.push(x + vector.x, y + vector.y, z + vector.z);
                });
            });
        });

        return Float32Array.from(field);
    }

    /**
     * For each target curve, creates a vertex buffer of points along the curve.
     *
     * @returns {Float32Array[]} A vertex buffer for each curve.
     */
    public generateGuidingCurve(): [number, number, number][][] {
        return this.vectors.map((c: GuidingCurve) => {
            const curve: [number, number, number][] = [];

            c.bezier.getLUT().forEach((p: BezierJs.Point) => {
                curve.push([p.x, p.y, (<coord>p).z]);
            });

            return curve;
        });
    }

    public getCost(instance: GeneratorInstance, added: Node[]): Cost {
        // Out of the added nodes, just get the structure nodes
        const addedStructure: Node[] = [];
        added.forEach((n: Node) =>
            n.structureCallback((node: Node) => {
                addedStructure.push(node);
            })
        );

        let totalCost = instance.getCost().realCost;

        // For each added shape and each influence point, add the resulting cost to the
        // instance's existing cost.
        addedStructure.forEach((node: Node) => {
            const localToGlobalTransform = node.localToGlobalTransform();

            // Get the location for the current node
            const globalPosition = vec4.transformMat4(
                vec4.create(),
                vec4.fromValues(0, 0, 0, 1),
                localToGlobalTransform
            );
            this.nodeLocations.set(node, globalPosition);

            // If the node has a parent that isn't yet in the cache, add it
            if (node.parent !== null && !this.nodeLocations.has(node.parent)) {
                const parentLocalToGlobalTransform = node.parent.localToGlobalTransform();
                const parentGlobalPosition = vec4.transformMat4(
                    vec4.create(),
                    vec4.fromValues(0, 0, 0, 1),
                    parentLocalToGlobalTransform
                );
                this.nodeLocations.set(node.parent, parentGlobalPosition);
            }

            const parentPosition =
                node.parent === null
                    ? vec4.fromValues(0, 0, 0, 1)
                    : <vec4>this.nodeLocations.get(node.parent);

            // Get the vector between the parent position and the current position
            const vector = vec4.sub(vec4.create(), globalPosition, parentPosition);
            vec4.normalize(vector, vector);

            // Find the closest point on a guiding curve
            const closest = this.closest(parentPosition);

            // Compare the new structure's vector with the direction vector for the curve point
            const guidingVector = Mapper.coordToVector(<coord>closest.curve.bezier.derivative(
                <number>closest.point.t
            ));
            vec3.normalize(guidingVector, guidingVector);

            const alignmentCost =
                (-vec3.dot(guidingVector, vec3From4(vector)) + closest.curve.alignmentOffset) *
                closest.curve.alignmentMultiplier;

            // Add cost for the distance away from the curve
            const closestPoint = vec3ToVector(Mapper.coordToVector(<coord>closest.point));
            const distance = vec4.distance(closestPoint, parentPosition);

            // Evaluate distance cost polynomial using Horner's method
            let distanceCost = 0;
            for (let power = 2; power >= 0; power -= 1) {
                distanceCost = closest.curve.distanceMultiplier[power] + distanceCost * distance;
            }

            totalCost += alignmentCost + distanceCost;
        });

        return { realCost: totalCost, heuristicCost: 0 };
    }

    /**
     * Returns the closest point on any of the target curves to an input point.
     */
    private closest(point: vec4): Closest {
        return <Closest>minBy(
            this.vectors.map((c: GuidingCurve) => {
                return {
                    curve: c,
                    point: c.bezier.project(Mapper.vectorToCoord(vec3From4(point)))
                };
            }),
            (c: Closest) => c.point.d
        );
    }
}
