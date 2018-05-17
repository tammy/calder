import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import { BakedGeometry } from '../geometry/BakedGeometry';
import { closestPointOnLine, vec3From4 } from '../math/utils';
import { RenderObject } from '../renderer/interfaces/RenderObject';
import { NodeRenderObject } from './NodeRenderObject';
import { Transformation } from './Transformation';

/**
 * A `Node` in a scene-graph.
 */
export class Node {
    private static boneVertices: vec3[] = [
        vec3.fromValues(0, 0, 0),
        vec3.fromValues(0.5, 0.1, 0),
        vec3.fromValues(0.5, 0, -0.1),
        vec3.fromValues(0.5, -0.1, 0),
        vec3.fromValues(0.5, 0, 0.1),
        vec3.fromValues(1, 0, 0)
    ];

    private static bone: BakedGeometry = {
        vertices: Node.boneVertices,
        normals: [
            vec3.fromValues(-1, 0, 0),
            vec3.fromValues(0, 1, 0),
            vec3.fromValues(0, 0, -1),
            vec3.fromValues(0, -1, 0),
            vec3.fromValues(0, 0, 1),
            vec3.fromValues(1, 0, 0)
        ],
        indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4],

        // Map x, y, z to r, g, b to give a sense of bone orientation
        colors: Node.boneVertices.map((v: vec3) =>
            vec3.fromValues(v[0], v[1] / 0.1 + 0.1, v[2] / 0.1 + 0.1)
        )
    };

    public readonly children: Node[];
    protected parent: Node | null = null;
    protected transformation: Transformation = new Transformation();
    private points: { [key: string]: Point } = {};
    private held: vec3 | null = null;
    private grabbed: vec3 | null = null;

    /**
     * Instantiates a new `Node`.
     *
     * @param {Node[]} children
     */
    constructor(children: Node[] = []) {
        this.children = children;
    }

    public createPoint(name: string, position: vec3) {
        // tslint:disable-next-line:no-use-before-declare
        this.points[name] = new Point(this, position);
    }

    public point(name: string): Point {
        const point = this.points[name];
        if (point === undefined) {
            throw new Error(`Could not find a point named ${name}`);
        }

        return point;
    }

    /**
     * Holds the current node in place at a given point so that it can be manipulated about
     * that point.
     *
     * @param {Point | vec3} point The point to be held, either as a local coordinate, or a
     * control point on the current or any other node.
     *
     * @returns {Node} The current node, for method chaining.
     */
    public hold(point: Point | vec3): Node {
        this.held = this.localPointCoordinate(point);

        return this;
    }

    /**
     * Removes all held points so that new transformation constraints can be applied.
     *
     * @returns {Node} The current node, for method chaining.
     */
    public release(): Node {
        this.held = null;
        this.grabbed = null;

        return this;
    }

    /**
     * Marks a point as grabbed so that it can be used to push or pull the node
     *
     * @param {Point | vec3} point The point to grab.
     *
     * @returns {Node} The current node, for method chaining.
     */
    public grab(point: Point | vec3): Node {
        this.grabbed = this.localPointCoordinate(point);

        return this;
    }

    public pointAt(point: Point | vec3): Node {
        if (this.grabbed === null) {
            throw new Error('You must grab a point before pointing it at something');
        }

        const target3 = this.localPointCoordinate(point);
        const target = vec4.fromValues(target3[0], target3[1], target3[2], 1);
        const anchor3 = this.getPosition();
        const anchor = vec4.fromValues(anchor3[0], anchor3[1], anchor3[2], 1);
        const grabbed = vec4.fromValues(this.grabbed[0], this.grabbed[1], this.grabbed[2], 1);

        if (this.held !== null) {
            const axis = vec4.sub(
                vec4.create(),
                vec4.fromValues(this.held[0], this.held[1], this.held[2], 1),
                anchor
            );

            const closestOnAxisToGrab = closestPointOnLine(grabbed, anchor, axis);
            const normal = vec4.sub(vec4.create(), grabbed, closestOnAxisToGrab);
            vec4.normalize(normal, normal);

            const closestOnAxisToTarget = closestPointOnLine(target, anchor, axis);
            const targetVector = vec4.sub(vec4.create(), target, closestOnAxisToTarget);
            vec4.normalize(targetVector, targetVector);

            this.setRotation(quat.multiply(quat.create(), this.getRotation(), quat.rotationTo(quat.create(), vec3From4(normal), vec3From4(targetVector))));

            //const angleToRotate = vec3.angle(vec3From4(normal), vec3From4(targetVector));
            //const rotation = mat4.fromRotation(mat4.create(), angleToRotate, vec3From4(axis));
            //const currentRotation = this.getRotation();
            //this.setRotation(mat4.multiply(mat4.create(), currentRotation, rotation));
        }

        return this;
    }

    public addChild(child: Node) {
        this.children.push(child);
        child.parent = this;
    }

    /**
     * Gets the node's rotation.
     *
     * @returns {quat}
     */
    public getRotation(): quat {
        return this.transformation.rotation;
    }

    /**
     * Sets the rotation for the node by updating the private `transformation`
     * property.
     *
     * @param {quat} rotation
     */
    public setRotation(rotation: quat) {
        this.transformation.rotation = rotation;
    }

    /**
     * Gets the node's scale.
     *
     * @returns {vec3}
     */
    public getScale(): vec3 {
        return this.transformation.scale;
    }

    /**
     * Sets the scale for the node by updating the private `transformation` property.
     *
     * @param {vec3} scale
     */
    public setScale(scale: vec3) {
        this.transformation.scale = scale;
    }

    /**
     * Gets the node's position.
     *
     * @returns {vec3}
     */
    public getPosition(): vec3 {
        return this.transformation.position;
    }

    /**
     * Sets the position for the node by updating the private `transformation`
     * property.
     *
     * @param {vec3} position
     */
    public setPosition(position: vec3) {
        this.transformation.position = position;
    }

    /**
     * Returns an array of `RenderObject`s denoting `GeometryNode`s
     * transformations multiplied by the `coordinateSpace` parameter.
     *
     * @param {mat4} coordinateSpace The coordinate space this node resides in.
     * @param {boolean} isRoot Whether or not this node is attached to another armature node.
     * @param {boolean} makeBones Whether or not the armature heirarchy should be visualized.
     * @returns {NodeRenderObject} The geometry for this armature subtree, and possibly geometry
     * representing the armature itself.
     */
    public traverse(coordinateSpace: mat4, isRoot: boolean, makeBones: boolean): NodeRenderObject {
        return this.traverseChildren(coordinateSpace, isRoot, makeBones).objects;
    }

    /**
     * Generates `RenderObject`s for this node's children, plus a bone for this node, if specified.
     * The current node's transformation matrix is also returned so that additional `RenderObject`s
     * can be added to the result if needed without recomputing this matrix.
     */
    protected traverseChildren(
        parentMatrix: mat4,
        isRoot: boolean,
        makeBones: boolean
    ): { currentMatrix: mat4; objects: NodeRenderObject } {
        const currentMatrix = this.transformation.getTransformation();
        mat4.multiply(currentMatrix, parentMatrix, currentMatrix);

        const objects: NodeRenderObject = this.children.reduce(
            (accum: NodeRenderObject, child: Node) => {
                const childRenderObject: NodeRenderObject = child.traverse(
                    currentMatrix,
                    false,
                    makeBones
                );

                // Merge the geometry and bones from each child into one long list of geometry and
                // one long list of bones for all children
                accum.geometry.push(...childRenderObject.geometry);
                accum.bones.push(...childRenderObject.bones);

                return accum;
            },
            { geometry: [], bones: [] }
        );

        if (makeBones && !isRoot) {
            objects.bones.push(this.boneRenderObject(parentMatrix));
        }

        return { currentMatrix, objects };
    }

    /**
     * Create a RenderObject visualizing this armature node relative to its parent.
     *
     * @param {mat4} parentMatrix A matrix to translate points into the coordinate space of the
     * parent node.
     *
     * @returns {RenderObject} A RenderObject for a bone stretching from the parent node's origin
     * to the current node's origin.
     */
    protected boneRenderObject(parentMatrix: mat4): RenderObject {
        const transform: Transformation = new Transformation(
            // Since the bone will start at the parent node's origin, we do not need to translate it
            vec3.fromValues(0, 0, 0),

            // Rotate the bone so it points from the parent node's origin to the current node's
            // origin
            quat.rotationTo(quat.create(), vec3.fromValues(1, 0, 0), vec3.normalize(vec3.create(), this.transformation.position)),

            // Scale the bone so its length is equal to the length between the parent node's origin
            // and the current node's origin
            vec3.fromValues(
                Math.sqrt(
                    Math.pow(this.transformation.position[0], 2) +
                        Math.pow(this.transformation.position[1], 2) +
                        Math.pow(this.transformation.position[2], 2)
                ),
                1,
                1
            )
        );
        const transformationMatrix = mat4.create();
        mat4.multiply(transformationMatrix, parentMatrix, transform.getTransformation());

        return { ...Node.bone, transform: transformationMatrix, isShadeless: true };
    }

    private getGlobalTransform(): mat4 {
        if (this.parent === null) {
            return this.transformation.getTransformation();
        } else {
            return mat4.multiply(
                mat4.create(),
                this.parent.getGlobalTransform(),
                this.transformation.getTransformation()
            );
        }
    }

    private localPointCoordinate(point: Point | vec3): vec3 {
        if (point instanceof Point) {
            if (point.node === this) {
                return point.position;
            } else {
                const pointToGlobal = mat4.invert(mat4.create(), point.node.getGlobalTransform());
                if (pointToGlobal === null) {
                    throw new Error('Point is in a coordinate space that cannot be inverted');
                }
                const pointToLocal = mat4.multiply(
                    mat4.create(),
                    this.getGlobalTransform(),
                    pointToGlobal
                );

                const local = vec4.fromValues(point[0], point[1], point[2], 1);
                vec4.transformMat4(local, local, pointToLocal);

                return vec3.fromValues(local[0], local[1], local[2]);
            }
        } else {
            return point;
        }
    }
}

/**
 * A derived `Node` with an additional `geometry` property.
 */
export class GeometryNode extends Node {
    public readonly geometry: BakedGeometry;

    /**
     * Instantiates a new `GeometryNode`.
     *
     * @param {BakedGeometry} geometry
     * @param {Node[]} children
     */
    constructor(geometry: BakedGeometry, children: Node[] = []) {
        super(children);
        this.geometry = geometry;
    }

    /**
     * Returns an array of `RenderObject`s denoting `GeometryNode`s
     * transformations multiplied by the `coordinateSpace` parameter.
     *
     * @param {mat4} coordinateSpace The coordinate space this node resides in.
     * @param {boolean} isRoot Whether or not this node is attached to another armature node.
     * @param {boolean} makeBones Whether or not the armature heirarchy should be visualized.
     * @returns {NodeRenderObject} The geometry for this armature subtree, and possibly geometry
     * representing the armature itself.
     */
    public traverse(coordinateSpace: mat4, isRoot: boolean, makeBones: boolean): NodeRenderObject {
        const { currentMatrix, objects } = this.traverseChildren(
            coordinateSpace,
            isRoot,
            makeBones
        );
        objects.geometry.push({ ...this.geometry, transform: currentMatrix });

        return objects;
    }
}

/**
 * A point on an armature that other armature nodes can attach to.
 */
class Point {
    public readonly node: Node;
    public readonly position: vec3;

    /**
     * @param {Node} node The node that this point is in the coordinate space of.
     * @param {vec3} position The position of this point relative to its node's origin.
     */
    constructor(node: Node, position: vec3) {
        this.node = node;
        this.position = position;
    }

    /**
     * Attaches the current node to the specified target node at the given point.
     *
     * @param {Point} target The point on another node that the current one should be attached to.
     */
    public stickTo(target: Point) {
        if (target.node === this.node) {
            throw new Error('Cannot attach a point to another point on the same node');
        }
        target.node.addChild(this.node);
        this.node.setPosition(vec3.subtract(vec3.create(), target.position, this.position));
    }

    /**
     * Attaches the specified geometry to the current point on a node.
     *
     * @param {BakedGeometry} geometry The geometry to attach to the current point.
     */
    public attach(geometry: BakedGeometry) {
        const geometryNode = new GeometryNode(geometry);
        geometryNode.setPosition(this.position);
        this.node.addChild(geometryNode);
    }
}
