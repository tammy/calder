import {
    Armature,
    Light,
    Material,
    Matrix,
    Node,
    Point,
    Quaternion,
    Renderer,
    RGBColor,
    Shape
} from '../calder';

// Create the renderer
const renderer: Renderer = new Renderer({
    width: 800,
    height: 600,
    maxLights: 2,
    ambientLightColor: RGBColor.fromRGB(90, 90, 90),
    backgroundColor: RGBColor.fromHex('#FF00FF')
});

// Create light sources for the renderer
const light1: Light = Light.create({
    position: { x: 10, y: 10, z: 10 },
    color: RGBColor.fromHex('#FFFFFF'),
    strength: 200
});

// Add lights to the renderer
renderer.addLight(light1);

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 1: create geometry
///////////////////////////////////////////////////////////////////////////////////////////////////

// Setup leaf
const leafColor = RGBColor.fromRGB(204, 255, 204);
const leafSphere = Shape.sphere(Material.create({ color: leafColor, shininess: 100 }));

// Setup branch
const branchColor = RGBColor.fromRGB(102, 76.5, 76.5);
const branchShape = Shape.cylinder(Material.create({ color: branchColor, shininess: 1 }));

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 2: create armature
///////////////////////////////////////////////////////////////////////////////////////////////////

const bone = Armature.define((root: Node) => {
    root.createPoint('base', { x: 0, y: 0, z: 0 });
    root.createPoint('mid', { x: 0, y: 0.5, z: 0 });
    root.createPoint('tip', { x: 0, y: 1, z: 0 });
    root.createPoint('handle', { x: 1, y: 0, z: 0 });
});

const treeGen = Armature.generator();
treeGen
    .define('branch', (root: Point) => {
        const node = bone();
        node.point('base').stickTo(root);
        node
            .hold(node.point('tip'))
            .rotate(Math.random() * 360)
            .release();
        node
            .hold(node.point('handle'))
            .rotate(Math.random() * 45)
            .release();
        node.scale(0.8); // Shrink a bit

        const trunk = node.point('mid').attach(branchShape);
        trunk.scale({ x: 0.2, y: 1, z: 0.2 });

        treeGen.addDetail({ component: 'branchOrLeaf', at: node.point('tip') });
    })
    .defineWeighted('branchOrLeaf', 1, (root: Point) => {
        treeGen.addDetail({ component: 'leaf', at: root });
    })
    .defineWeighted('branchOrLeaf', 4, (root: Point) => {
        treeGen.addDetail({ component: 'branch', at: root });
        treeGen.addDetail({ component: 'maybeBranch', at: root });
        treeGen.addDetail({ component: 'maybeBranch', at: root });
    })
    .define('leaf', (root: Point) => {
        const leaf = root.attach(leafSphere);
        leaf.scale(Math.random() * 0.5 + 0.5);
    })
    .maybe('maybeBranch', (root: Point) => {
        treeGen.addDetail({ component: 'branch', at: root });
    });
const tree = treeGen.generate({ start: 'branch', depth: 25 });

///////////////////////////////////////////////////////////////////////////////////////////////////
// Step 3: set up renderer
///////////////////////////////////////////////////////////////////////////////////////////////////

document.body.appendChild(renderer.stage);

renderer.camera.moveTo({ x: 0, y: 0, z: 8 });
renderer.camera.lookAt({ x: 2, y: 2, z: -4 });

// Draw the armature
let angle = 0;
const draw = () => {
    angle += 0.5;
    tree.setRotation(Matrix.fromQuat4(Quaternion.fromEuler(0, angle, 0)));

    return {
        objects: [tree],
        debugParams: { drawAxes: true, drawArmatureBones: false }
    };
};

// Apply the constraints each frame.
renderer.eachFrame(draw);
