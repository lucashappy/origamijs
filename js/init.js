/**
 * This is the description for my class.
 *
 * @class InitClass
 * @constructor
 */

var camera, scene, renderer, controls, clock, trackballControls,
    hideFlatEdges = true,
    drawingMode = true,
    hideSidebar = false,
    drawExternalVertices = [],
    drawInternalVertices = [],
    drawVertices = [],
    originX = 0,
    originY = 0;
var mesh, hds, edges, mouse, raycaster, selected = [],
    meshURL = "./models/01_RoyalCrescent2b.dae",
    xmlDoc;
var constraints = [],
    relaxCount = 0;

var edgeTypeColor = {
    "Cut": 0xff00000,
    "Ridge": 0x0ffff00,
    "Valley": 0x00ffff,
    "Flat": 0x0000ff,
    "Border": 0x777777
};

var highlighted;
var highlightMaterialColor = 0x000000;
var saveMaterialColor;

//Mouse position init
var initX = -1,
    initY = -1;

//Collada loader init
var loader = new THREE.ColladaLoader();
loader.options.convertUpAxis = true;
loader.load(meshURL, function (collada) {

    dae = collada.scene;
    geoMesh = dae.children[0].children[0].geometry
    initInterface();
    init3DStage();
    update();
});

document.getElementById('files').addEventListener('change', handleFileSelect, false);

/**
 * Marks all selected edges as being of the given edge type
 *
 * @method labelEdge
 * @param {String} edgeType
 */
function labelEdge(edgeType) {
    for (var i = 0; i < selected.length; i++) {
        if (selected[i].halfedge.edgeType == "Border") continue;
        selected[i].material.color.setHex(edgeTypeColor[edgeType]);
        selected[i].halfedge.edgeType = edgeType;
    }
    deselectAll();
}


/**
 * Deselects all edges
 *
 * @method deselectAll
 */
function deselectAll() {
    for (var i = 0; i < selected.length; i++) {
        selected[i].material.gapSize = 0;
    }
    selected = [];
}

/**
 * Set all edges as flat edges
 * @method allFlat
 * @return
 */
function allFlat() {
    selected = [];
    for (var i = 0; i < edges.children.length; i++) {
        selected.push(edges.children[i]);
    }
    labelEdge("Flat");
}


/**
 * Processes edges to be cut, possibly altering hds.
 * Returns true if hds was modified.
 *
 * @method processCuts
 * @return BinaryExpression
 */
function processCuts() {
    var vtxToSnip = [];
    var cutCount = 0;
    hds.allEdges(function (he, phe) {
        var ohe = hds.halfedge[he.opp];
        var edgeType = he.edgeType || ohe.edgeType;
        if (edgeType == "Cut") {
            he.edgeType = ohe.edgeType = undefined;
            check_hds(hds);
            cutEdge(hds, he);
            cutCount++;
            if (vtxToSnip.indexOf(he.vtx) < 0) vtxToSnip.push(he.vtx);
            if (vtxToSnip.indexOf(ohe.vtx) < 0) vtxToSnip.push(ohe.vtx);
        }
    });
    var snipCount = 0;
    while (vtxToSnip.length > 0) {
        var newvtx_h;
        var i = vtxToSnip[0];
        vtxToSnip.splice(0, 1);
        while (newvtx_h = snipVertex(hds, i)) {
            snipCount++;
            if (vtxToSnip.indexOf(newvtx_h.vtx) < 0) vtxToSnip.push(newvtx_h.vtx);
        }
    }
    console.log(cutCount, snipCount);
    return cutCount + snipCount > 0;
}


/**
 * Creates constraints, i.e., a set of dihedral and linear constraints
 * from halfedge data structure hds
 *
 * @method hdsToConstraints
 */
function hdsToConstraints() {

    check_hds(hds);
    if (processCuts()) {
        check_hds(hds);
        hdsCreateVertexVectors(hds);
        objectsFromHds();
    }

    constraints = [[], []];
    var angsum = 0;
    hds.allEdges(function (he, phe) {
        var ohe = hds.halfedge[he.opp];
        var v0 = hds.vertex[he.vtx];
        var v1 = hds.vertex[phe.vtx];
        var sz = he.sz || ohe.sz || v0.sub(v1).mag();
        he.sz = ohe.sz = sz;
        var lc = new LinearConstraint(v0, v1, sz);
        constraints[0].push(lc);
        if (he.fac >= 0 && ohe.fac >= 0) {
            var v2 = hds.vertex[hds.halfedge[he.nxt].vtx];
            var v3 = hds.vertex[hds.halfedge[ohe.nxt].vtx];
            var edgeType = he.edgeType || ohe.edgeType;
            var angle = (edgeType == "Ridge") ? Math.PI / 2 :
                (edgeType == "Valley") ? -Math.PI / 2 :
                0;
            var dc = new DihedralConstraint(v0, v1, v2, v3, angle);
            constraints[1].push(dc);
            angsum += dc.discrepancy();
        }
    });
    console.log("Total discrepancy", angsum);
}


/**
 * Performs one step of the relaxation process
 *
 * @method relaxOneStep
 */
function relaxOneStep() {
    var n = 10;
    var lc = constraints[0],
        dc = constraints[1];
    for (var k = 0; k < n; k++) {
        var f = (k + 1 + n) / (n + n);
        for (var i = 0; i < dc.length; i++) {
            var c = dc[i];
            c.relax(f);
        }
        for (var i = 0; i < lc.length; i++) {
            var c = lc[i];
            c.relax(f);
        }
    }
    hdsUpdateVertexVectors(hds);
    mesh.geometry.verticesNeedUpdate = true;
    mesh.geometry.computeFaceNormals();
    mesh.geometry.normalsNeedUpdate = true;
    var e = edges.children;
    for (var i = 0; i < e.length; i++) {
        e[i].geometry.verticesNeedUpdate = true;
    }
}



/**
 * Reset an object to its original state
 * @method loadMesh
 * @param {} newMesh Mesh to be loaded
 * @param {Boolean} fromDraw true if mesh was originated from a canvas draw
 */
function loadMesh(newMesh, fromDraw) {

    $(".gui input[value='edge']").click();
    $('.states-list').empty()
    if (fromDraw)
        hds = halfedgeFromDraw(newMesh);
    else
        hds = halfedgeFromMesh(newMesh);
    objectsFromHds();
}


/**
 * Function that returns the active interaction mode
 * @method getActiveMode
 * @return activeGui
 */
function getActiveMode() {
    var activeGui;
    var gui = d3.select("div.gui");
    gui.selectAll("input.modeSelect").each(function () {
        var sel = d3.select(this);
        var value = sel.attr("value");
        var checked = sel.property("checked");
        if (checked) activeGui = value;
        /*  gui.select("div." + value + "Gui").style("visibility", function () {
              //if (checked) return "visible";
              //return "hidden";
              return "visible";
          })*/
    })
    return activeGui;
}

/**
 * Initialize the Graphic User Interface
 * @method initInterface
 * @return
 */
function initInterface() {
    var gui = d3.select("body").append("div").classed("gui", true);
    gui.append("input")
        .attr("class", "modeSelect")
        .attr("type", "radio")
        .attr("name", "guibox")
        .attr("value", "edge")
        .property("checked", true);
    gui.append("span").text(" Edge Editing");

    var edgeGui = gui.append("div").classed("edgeGui", true);
    var edgeButtonLabel = ["Cut", "Ridge", "Valley", "Flat", "All Flat", "Reset"];
    var edgeButtons = edgeGui.selectAll("button.guiButton")
        .data(edgeButtonLabel)
        .enter()
        .append("button")
        .attr("class", "btn btn-default guiButton")
        .text(function (d) {
            return d
        })
        .attr("id", function (d) {
            return d
        })
        .on("click", function (d, i) {
            if (i < 4) labelEdge(d);
            else if (i == 4) allFlat();
            else loadMesh();
        });

    gui.append("input")
        .attr("class", "modeSelect")
        .attr("type", "radio")
        .attr("name", "guibox")
        .attr("value", "anim");
    gui.append("span").text(" Animation");
    var animGui = gui.append("div"); //.classed("animGui", true);//.style("visibility", "hidden");
    var animButtonLabel = ["Relax", "Auto-Relax"];
    var animButtons = animGui.selectAll("button.guiButton")
        .data(animButtonLabel)
        .enter()
        .append("button")
        .attr("class", "btn btn-default guiButton")
        .text(function (d) {
            return d
        })
        .on("click", function (d, i) {
            if (i == 0) relaxOneStep();
            if (i == 1) relaxCount = 400;
        });

    gui.selectAll("input.modeSelect").on("click", function () {
        var activeGui = getActiveMode();
        if (activeGui == "edge") {
            objectsFromHds();
            scene.add(edges);
        }
        if (activeGui == "anim") {
            hdsToConstraints();
            scene.remove(edges);
        }
    })


    //Mode select
    $('#optionDraw').on('change', function () {
        console.log("change");
        drawingMode = true;
        $('#stageDraw').fadeIn();
        update();

    })

    $('#option3D').on('change', function () {
        console.log("change2D");
        drawingMode = false
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        $('#stageDraw').fadeOut();
        update();

    })
    $('#triangulateBtn').on('click', function () {
        triangulate();
        update();

    })



}

/**
 * Triangulate a draw and generate the corresponding mesh
 * @method triangulate
 */
function triangulate() {
    console.log("Triangulate!");
    var swctx = new poly2tri.SweepContext(drawExternalVertices);
    swctx.addPoints(drawInternalVertices);
    swctx.triangulate();
    loadMesh(swctx, true)
    allFlat()
    $("#option3D").click();
    generateXMLFromMesh()
}


/**
 * From hds, a halfedge data structure, creates a mesh and line objects
 * for the edges. Scene is cleared and the objects are added to the scene
 * @method objectsFromHds
 */
function objectsFromHds() {
    if (mesh != undefined) scene.remove(mesh);
    if (edges != undefined) scene.remove(edges);

    // Add the surface
    var geometry = halfedgeGeometry(hds);
    var material = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        shading: THREE.FlatShading,
        side: THREE.DoubleSide
    });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    /* Add cylinders for the edges of mesh */
    edges = new THREE.Object3D();
    addHdsEdgeLines(hds, edges);
    scene.add(edges);
}


/**
 * Initialize the 3D stage
 * @method init
 */
function init3DStage() {

    renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xc3c3c3);
    document.getElementById("stage3D").appendChild(renderer.domElement);

    setSelectionCanvas();

    // Define Camera
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = -1000;

    // Define scene
    scene = new THREE.Scene();

    // Define lights
    var ambientLight = new THREE.AmbientLight(0x707070);
    scene.add(ambientLight);

    var lights = [];
    lights[0] = new THREE.PointLight(0xaaffff, 0.5, 0);
    lights[1] = new THREE.PointLight(0xffcccc, 0.5, 0);

    lights[0].position.set(0, 200, 80);
    lights[1].position.set(-100, -200, -100);

    scene.add(lights[0]);
    scene.add(lights[1]);

    /* Define the object to be viewed */
    hds = halfedgeFromMesh(geoMesh)
    objectsFromHds();
    getColladaFileFromURL();


    /* Add a raycaster for picking objects */
    raycaster = new THREE.Raycaster();

    /* The clock and trackball */
    clock = new THREE.Clock();
    trackballControls = new THREE.TrackballControls(camera, renderer.domElement);

    // Callbacks
    window.addEventListener('resize', onWindowResize, false);
    mouse = new THREE.Vector2();
    window.addEventListener('click', onWindowClick, false);
    window.addEventListener('mousemove', onWindowMouseMove, true);
    window.addEventListener('mousedown', onWindowMouseDown, true);
    window.addEventListener('mouseup', onWindowMouseUp, true);
}

/**
 * Initialize canvas to display the selection box
 * @method setSelectionCanvas
 */
function setSelectionCanvas() {
    //Selection anvas
    var c = document.getElementById("myCanvas");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    c.style.pointerEvents = 'none';
    ctx = c.getContext("2d");
    ctx.setLineDash([15, 5]);
    ctx.strokeStyle = "rgba(214, 115, 0, 0.74)";
    ctx.lineWidth = 2.0;
    drawingModeCanvas()
}

/**
 * Window resize callback
 * @method onWindowResize
 */
function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    setSelectionCanvas();

}


/**
 * Shortcuts
 */
document.addEventListener('keydown', function (event) {
    if (event.keyCode == 96) {
        trackballControls.reset();

    }

    if (event.keyCode == 72) {
        console.log("toggle flat edges");
        toggleFlatEdges();

    }

    if (event.keyCode == 75) {
        console.log("toggle sidebar");
        hideSidebar = !hideSidebar;
        if (hideSidebar) {
            document.getElementsByClassName("bg")[0].style.visibility = "hidden";
            document.getElementsByClassName("gui")[0].style.visibility = "hidden";
            document.getElementsByClassName("form")[0].style.visibility = "hidden";
            document.getElementsByClassName("states")[0].style.visibility = "hidden";
            document.getElementsByClassName("edgeGui")[0].style.visibility = "hidden";
        } else {
            document.getElementsByClassName("bg")[0].style.visibility = "visible";
            document.getElementsByClassName("gui")[0].style.visibility = "visible";
            document.getElementsByClassName("states")[0].style.visibility = "visible";
            document.getElementsByClassName("form")[0].style.visibility = "visible";
            document.getElementsByClassName("edgeGui")[0].style.visibility = "visible";

        }
    }

});

/**
 * Hide/show flat edges of the mesh
 * @method toggleFlatEdges
 */
function toggleFlatEdges() {

    hideFlatEdges = !hideFlatEdges;

    edges.children.forEach(function (edge) {
        if (edge.halfedge.edgeType == "Flat") {
            edge.visible = hideFlatEdges
        }
    });
}

/**
 * Handle mouse down events
 * @method onWindowMouseDown
 * @param {} event
 */
function onWindowMouseDown(event) {

    if (event.shiftKey) {

        if (drawingMode) {
            document.body.style.cursor = 'crosshair';
            initX = event.clientX
            initY = event.clientY
        } else {
            trackballControls.enabled = false
            document.body.style.cursor = 'crosshair';
            initX = event.clientX
            initY = event.clientY
        }
    }
}

/**
 * Handle mouse up events
 * @method onWindowMouseUp
 * @param {} event
 * @return
 */
function onWindowMouseUp(event) {

    if (drawingMode && (initX != -1 || initY != -1)) {
        var x = initX,
            y = initY,
            w = event.clientX - initX,
            h = event.clientY - initY;

        //save points
        drawInternalVertices = []
        drawInternalVertices.push(formatPoint(x, y));
        drawInternalVertices.push(formatPoint(x + w, y));
        drawInternalVertices.push(formatPoint(x + w, y + (h / 2)));
        drawInternalVertices.push(formatPoint(x + w, y + h));
        drawInternalVertices.push(formatPoint(x, y + h));
        drawInternalVertices.push(formatPoint(x, y + (h / 2)));

    } else {

        if (!trackballControls.enabled) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            boxSelectObjects(initX, initY, event.clientX, event.clientY);
            trackballControls.enabled = true;

        }
    }
    initX = -1
    initY = -1
    document.body.style.cursor = 'pointer';
}

/**
 * Box selection of edges
 * @method boxSelectObjects
 * @param {Int} x Origin x of the box selection
 * @param {Int} y Origin y of the box selection
 * @param {Int} x2 End x of the box selection
 * @param {Int} y2 End y of the box selection
 */
function boxSelectObjects(x, y, x2, y2) {

    var selectionBox = new THREE.Box2(new THREE.Vector2(x, y), new THREE.Vector2(x2, y2))
    edges.children.forEach(function (edge) {

        if (selectionContainsObject(selectionBox, edge)) {
            edge.material.gapSize = 2;
            selected.push(edge);
        }
    });
}


/**
 * Test if the passed object is within bounds of the selection
 * @method selectionContainsObject
 * @param {THREE.Box2} selectBox Selection box
 * @param {THREE.Mesh} object Object to be tested
 * @return CallExpression
 */
function selectionContainsObject(selectBox, object) {

    object.geometry.computeBoundingBox();
    var mesh3DBox = object.geometry.boundingBox;

    var min = mesh3DBox.min;
    var max = mesh3DBox.max;

    var points = []
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(max.x, min.y, min.z)));
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(min.x, max.y, min.z)));
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(min.x, min.y, max.z)));
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(min.x, max.y, max.z)));
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(max.x, min.y, max.z)));
    points.push(screenCoordFrom3DPoint(new THREE.Vector3(max.x, max.y, min.z)));
    points.push(screenCoordFrom3DPoint(mesh3DBox.min));
    points.push(screenCoordFrom3DPoint(mesh3DBox.max));

    var bbox = new THREE.Box2()
    bbox.setFromPoints(points)

    return selectBox.containsBox(bbox)
}

/**
 * Get the screen coord from a 3D point
 * @method screenCoordFrom3DPoint
 * @param {THREE.Vector3} point3D
 * @return {THREE.Vector3} vector Screen cord with z = 0
 */
function screenCoordFrom3DPoint(point3D) {

    var vector = point3D.project(camera);

    vector.x = (vector.x + 1) / 2 * window.innerWidth;
    vector.y = -((vector.y - 1) / 2 * window.innerHeight);

    return vector;
}

/**
 * Get the 3D coord (with given z coord) of a 2D point in the screen
 * @method get3dPoint
 * @param {} x
 * @param {} y
 * @param {} z Desired z position
 * @return CallExpression
 */
function get3dPoint(x, y, z) {

    x = (x / window.innerWidth) * 2 - 1;
    y = -(y / window.innerHeight) * 2 + 1;

    var vector = new THREE.Vector3(x, y, z);
    return vector.unproject(camera);
}


/**
 * Handle mouse click events
 * @method onWindowClick
 * @param {} event
 */
function onWindowClick(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Add clicked object to selection
    selectObject();
}

/**
 * Handle mousemove evens
 * @method onWindowMouseMove
 * @param {} event
 */
function onWindowMouseMove(event) {

    if (initX > -1 || initY > -1) {
        drawSelectionBox(event.clientX, event.clientY)
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects(edges.children);


    if (highlighted != undefined) {
        highlighted.material.color = saveMaterialColor;
    }

    if (intersects.length > 0) {
        var edge = intersects[0].object;
        if (edge.halfedge.edgeType != "Border") {
            highlighted = edge;
            saveMaterialColor = highlighted.material.color;
            highlighted.material.color = highlightMaterialColor;
        }
    }
}

/**
 * Draw the selection box
 * @method addSelection
 * @param {} moveX
 * @param {} moveY
 */
function drawSelectionBox(moveX, moveY) {

    if (drawingMode) {
        draw.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        draw.beginPath();
        draw.rect(initX, initY, moveX - initX, moveY - initY);
        draw.stroke();

    } else {
        if (!trackballControls.enabled) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.beginPath();
            ctx.rect(initX, initY, moveX - initX, moveY - initY);
            ctx.stroke();
            window.getSelection().removeAllRanges();
        }
    }
}


/**
 * Selects/deselects objects of the scene
 * @method selectObject
 * @return
 */
function selectObject() {

    // find intersections
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObjects(edges.children);
    if (intersects.length > 0) {
        var obj = intersects[0].object;
        var sel = selected.indexOf(obj);
        if (sel >= 0) {
            obj.material.gapSize = 0;
            selected.splice(sel, 1);
        } else {
            obj.material.gapSize = 2;
            selected.push(obj);
        }
    }

}


/**
 * Update 3D scene
 * @method update
 * @return
 */
function update() {

    if (!drawingMode) {
        var delta = clock.getDelta();
        trackballControls.update(delta);
        if (getActiveMode() == "anim" && relaxCount > 0) {
            relaxOneStep();
            relaxCount--;
        }

        renderer.render(scene, camera);
        requestAnimationFrame(update);
    }

}

/**
 * Returns a THREE.Geometry object from a halfedge data structure
 * @method halfedgeGeometry
 * @param {} hds halfedge object
 * @return {THREE.Geometry} g corresponding geometry
 */
function halfedgeGeometry(hds) {
    /**
     * Description
     * @method iv
     * @param {} i
     * @param {} j
     * @return BinaryExpression
     */
    function iv(i, j) {
        return i * m + j
    };
    var g = new THREE.Geometry();
    g.vertices = hds.vecVertex;
    hds.allFaces(function (he) {
        var v0 = he.vtx;
        he = hds.halfedge[he.nxt];
        var v1 = he.vtx;
        he = hds.halfedge[he.nxt];
        var v2 = he.vtx;
        g.faces.push(new THREE.Face3(v0, v1, v2));
    });
    g.computeFaceNormals();
    return g;
}

/**
 * Adds an array of cylinders with radius r, one for each edge of
 * halfedge data structure hds, to the given scene
 * @method addHdsEdgeCylinders
 * @param {} hds
 * @param {} scene
 * @param {} r
 * @return
 */
function addHdsEdgeCylinders(hds, scene, r) {
    hds.allEdges(function (he, phe) {
        var v0 = toVec3(hds.vertex[he.vtx]);
        var v1 = toVec3(hds.vertex[phe.vtx]);
        var g = cylinder(v0, v1, r);
        var m = new THREE.MeshLambertMaterial({
            color: 0x0000ff
        });
        if (he.edgeType != undefined)
            m.color.setHex(edgeTypeColor[he.edgeType]);
        mesh = new THREE.Mesh(g, m);
        mesh.halfedge = he;
        scene.add(mesh);
    });
}

/**
 * Adds an array of lines, one for each edge of
 * halfedge data structure hds, to the given scene
 * @method addHdsEdgeLines
 * @param {} hds
 * @param {} scene
 * @return
 */
function addHdsEdgeLines(hds, scene) {
    hds.allEdges(function (he, phe) {
        // var v0 = toVec3(hds.vertex[he.vtx]);
        // var v1 = toVec3(hds.vertex[phe.vtx]);
        var v0 = hds.vecVertex[he.vtx];
        var v1 = hds.vecVertex[phe.vtx];
        var g = new THREE.Geometry();
        g.vertices.push(v0, v1);
        g.computeLineDistances();
        var m = new THREE.LineDashedMaterial({
            color: 0x0000ff,
            scale: 0.5,
            linewidth: 2,
            dashSize: 2,
            gapSize: 0
        });
        if (he.fac < 0 || hds.halfedge[he.opp].fac < 0) {
            he.edgeType = "Border";
        }
        if (he.edgeType != undefined)
            m.color.setHex(edgeTypeColor[he.edgeType]);

        var line = new THREE.Line(g, m);
        line.halfedge = he;
        scene.add(line);
    });
}

/**
 * Converts a PVector to a THREE.Vector3
 * @method toVec3
 * @param {} pvector
 * @return NewExpression
 */
function toVec3(pvector) {
    return new THREE.Vector3(pvector.x, pvector.y, pvector.z);
}

/**
 * Returns a cylinder geometry where the bottom is at vstart,
 * the top is at vend (both are THREE.Vector3 objects,
 * and the radius is r
 * @method cylinder
 * @param {} vstart
 * @param {} vend
 * @param {} r
 * @return cylinder
 */
function cylinder(vstart, vend, r) {
    var distance = vstart.distanceTo(vend);
    var position = vend.clone().add(vstart).divideScalar(2);
    var cylinder = new THREE.CylinderGeometry(r, r, distance, 10, 10, true);
    var orientation = new THREE.Matrix4(); //a new orientation matrix to offset pivot
    orientation.lookAt(vstart, vend, new THREE.Vector3(0, 1, 0)); //look at destination
    var offsetRotation = new THREE.Matrix4(); //a matrix to fix pivot rotation
    offsetRotation.makeRotationX(Math.PI / 2); //rotate 90 degs on X
    orientation.multiply(offsetRotation); //combine orientation with rotation transformations
    cylinder.applyMatrix(orientation);
    var offsetPosition = new THREE.Matrix4(); //a matrix to fix pivot position
    offsetPosition.makeTranslation(position.x, position.y, position.z);
    cylinder.applyMatrix(offsetPosition);
    return cylinder;
}

/**
 * Adds table vecVertex to the given halfedge data structure
 * that contains all vertices as THREE.Vector3 objects rather than PVector objects
 * @method hdsCreateVertexVectors
 * @param {} hds
 * @return
 */
function hdsCreateVertexVectors(hds) {
    hds.vecVertex = [];
    hds.allVertices(function (he, v) {
        hds.vecVertex[he.vtx] = new THREE.Vector3(v.x, v.y, v.z);
    });
}

/**
 * Updates table vecVertex from the parallel vertex table objects
 * @method hdsUpdateVertexVectors
 * @param {} hds
 * @return
 */
function hdsUpdateVertexVectors(hds) {
    hds.allVertices(function (he, v) {
        hds.vecVertex[he.vtx].set(v.x, v.y, v.z);
    });
}

/**
 * Returns a halfedge data structure for a gridded paper with
 * n times m cells, each of size s
 * @method paperHalfedge
 * @param {} n
 * @param {} m
 * @param {} s
 * @return hds
 */
function paperHalfedge(n, m, s) {

    function iv(i, j) {
        return i * m + j
    };
    var fac = [],
        vtx = [];
    var x0 = -(n - 1) * s / 2;
    var y0 = -(m - 1) * s / 2
    for (var i = 0; i < n; i++) {
        for (var j = 0; j < m; j++) {
            vtx.push(new PVector(x0 + i * s, y0 + j * s, 0));
            if (i > 0 && j > 0) {
                fac.push([iv(i - 1, j - 1), iv(i - 1, j), iv(i, j)]);
                fac.push([iv(i - 1, j - 1), iv(i, j), iv(i, j - 1)]);
            }
        }
    }
    var hds = new HalfedgeDS(fac, vtx);
    hdsCreateVertexVectors(hds);
    return hds;
}

/**
 * Generate a halfedge from a mesh structure
 * @method halfedgeFromMesh
 * @param {} mesh
 * @return hds
 */
function halfedgeFromMesh(mesh) {

    var fac = [],
        vtx = [];

    mesh.faces.forEach(function (face) {
        fac.push([face.a, face.b, face.c])
    });

    mesh.vertices.forEach(function (vertex) {
        vtx.push(new PVector(vertex.x, vertex.y, vertex.z));
    });

    var hds = new HalfedgeDS(fac, vtx);
    hdsCreateVertexVectors(hds);
    return hds;
}

/**
 * Generate a halfedge from a triangulated draw
 * @method halfedgeFromDraw
 * @param {} swctx
 * @return hds
 */
function halfedgeFromDraw(swctx) {

    var fac = [],
        vtx = [];

    swctx.triangles_.forEach(function (face) {
        fac.push([face.points_[0].id, face.points_[1].id, face.points_[2].id])
    });

    vtx.length = swctx.points_.length
    swctx.points_.forEach(function (vertex) {
        vtx[vertex.id] = new PVector(vertex.x, vertex.y, 0);
    });

    var hds = new HalfedgeDS(fac, vtx);
    hdsCreateVertexVectors(hds);
    return hds;
}

var saveData = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    return function (data, fileName) {
        var blob = new Blob([data], {
                type: "application/xml"
            }),
            url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
    };
}());

/**
 * Download a mesh
 * @method downloadMesh
 */
function downloadMesh() {
    saveData(new XMLSerializer().serializeToString(xmlDoc), "teste.dae");
}


/**
 * Read the collada file of a mesh from an url
 * @method getColladaFileFromURL
 * @return
 */
function getColladaFileFromURL() {

    xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", meshURL, true);
    xmlhttp.send();

    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log(xmlhttp.responseXML)
            xmlDoc = xmlhttp.responseXML;
            loadEdgeTypes();
        }
    }
}

/**
 * Read edge type information from the collada file of the mesh
 * @method loadEdgeTypes
 */
function loadEdgeTypes() {

    var edgeTypeTags = xmlDoc.getElementsByTagName("edge_type")

    for (var i = 0; i < edgeTypeTags.length; i++) {
        addState(i);
    }

    $('.state-item').last().trigger("click");
    parseEdgeTypeByIndex(edgeTypeTags.length - 1)
}

/**
 * Parse all edge type collections from the xml file
 * @method parseEdgeTypeByIndex
 * @param {} index
 */
function parseEdgeTypeByIndex(index) {
    console.log("index " + index);
    allFlat();
    var edgeTypeNode = xmlDoc.getElementsByTagName("edge_type")[index]
    parseEdgeType(edgeTypeNode, "cuts", "Cut");
    parseEdgeType(edgeTypeNode, "ridges", "Ridge");
    parseEdgeType(edgeTypeNode, "valleys", "Valley");
}


/**
 * Parse a edge type collection from the xml file
 * @method parseEdgeType
 * @param {} edgeTypeNode
 * @param {} tag
 * @param {} label
 */
function parseEdgeType(edgeTypeNode, tag, label) {
    var ridges = edgeTypeNode.getElementsByTagName(tag)[0].innerHTML.split(" ");
    for (var i = 0; i < ridges.length; i++) {
        var index = parseInt(ridges[i])
        if (!isNaN(index)) {
            selected.push(edges.children[index])
            labelEdge(label)
        }
    }
}

/**
 * Add new state (a scheme of cuts,ridges and valleys on the mesh)
 * @method addNewState
 * @return
 */
function addNewState() {

    var cuts = [],
        ridges = [],
        valleys = [];

    edges.children.forEach(function (elem, index) {
        switch (elem.halfedge.edgeType) {
        case "Cut":
            cuts.push(index)
            break;
        case "Ridge":
            ridges.push(index)
            break;
        case "Valley":
            valleys.push(index)
            break;
        default:
            break;
        }

    });

    if (!xmlDoc.getElementsByTagName("extra")[0]) {
        var geometryTag = xmlDoc.getElementsByTagName("geometry")[0]
        geometryTag.appendChild(xmlDoc.createElement("extra"))
    }

    var edgeTypeNode = xmlDoc.createElement("edge_type");

    xmlDoc
        .getElementsByTagName("extra")[0]
        .appendChild(edgeTypeNode)

    //Save the edge type collection to the XML representation of the mesh
    function addEdgeTypesToXML(tag, data) {
        if (edgeTypeNode.getElementsByTagName(tag)[0]) {
            edgeTypeNode.getElementsByTagName(tag)[0].innerHTML = data
        } else {
            edgeTypeNode.appendChild(xmlDoc.createElement(tag))
                .innerHTML = data
        }
    }

    addEdgeTypesToXML("cuts", cuts.join(" "))
    addEdgeTypesToXML("ridges", ridges.join(" "))
    addEdgeTypesToXML("valleys", valleys.join(" "))

    var stateIndex = $('.state-item').length
    addState(stateIndex)
    $('.state-item').last().trigger("click");

}

/**
 * Add a state to the list of states in the gui
 * @method addState
 * @param {} stateIndex
 * @return
 */
function addState(stateIndex) {
    $('.states-list')
        .append('<li class="list-group-item state-item" onclick="parseEdgeTypeByIndex(' + stateIndex + ')">State ' + stateIndex +
            '<span class="glyphicon glyphicon-remove" onclick="removeState(event)"></li>')
        .on('click', '.state-item', function (event) {
            $('.state-item').removeClass('active')
            $(event.target).addClass('active')
        });

}

/**
 * Remove a state from the XML
 * @method removeState
 * @param {} event
 * @return
 */
function removeState(event) {
    var index = $(event.target.parentElement).index()
    var node = xmlDoc.getElementsByTagName("edge_type")[index]
    node.parentElement.removeChild(node)
    $(event.target.parentElement).remove();


}

/**
 * Handle local file selection (of a mesh object)
 * @method handleFileSelect
 * @param {} evt
 * @return
 */
function handleFileSelect(evt) {

    var file = evt.target.files[0]; // FileList object

    var reader = new FileReader();

    // Closure to capture the file information.
    reader.onload = (function (theFile) {
        return function (e) {

            meshURL = e.target.result
            loader.load(meshURL, function (collada) {
                dae = collada.scene;
                var geoMesh = dae.children[0].children[0].geometry
                loadMesh(geoMesh)
                getColladaFileFromURL();

            });
        };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsDataURL(file);
};


/**
 * Drawing canvas background
 * @method drawingModeCanvas
 * @return
 */
function drawingModeCanvas() {

    var c = document.getElementById("bgCanvas");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    c.style.pointerEvents = 'none';
    var bgctx = c.getContext("2d");

    bgctx.fillStyle = "white"
    bgctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

    //papersheet
    bgctx.setLineDash([])
    bgctx.strokeStyle = "gray"
    bgctx.lineWidth = 1.0

    var h = window.innerHeight - 60,
        w = (2 / 3.0) * h,
        x = (window.innerWidth - w) / 2.0,
        y = 20;

    originX = x + (w / 2);
    originY = y + (h / 2);


    bgctx.rect(x, y, w, h)
    bgctx.fill()
    bgctx.stroke()


    //middle fold
    bgctx.strokeStyle = "aqua"
    bgctx.beginPath()
    bgctx.moveTo(x, (h / 2.0) + y)
    bgctx.lineTo(x + w, (h / 2.0) + y)
    bgctx.stroke()
    bgctx.closePath()


    //Add page vertices to triangulation
    drawExternalVertices = []
    drawExternalVertices.push(formatPoint(x, y));
    drawExternalVertices.push(formatPoint(x + w, y));
    drawExternalVertices.push(formatPoint(x + w, y + (h / 2)));
    drawExternalVertices.push(formatPoint(x + w, y + h));
    drawExternalVertices.push(formatPoint(x, y + h));
    drawExternalVertices.push(formatPoint(x, y + (h / 2)));


    //Draw Layer
    var c = document.getElementById("drawCanvas");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    c.style.pointerEvents = 'none';
    draw = c.getContext("2d");

}


/**
 * Normalize a canvas point to the triangulation
 * @method formatPoint
 * @param {} px
 * @param {} py
 * @return ObjectExpression
 */
function formatPoint(px, py) {
    var nx = -(px - originX), //why?
        ny = -(py - originY);

    return {
        x: nx,
        y: ny,
        id: drawExternalVertices.length + drawInternalVertices.length
    }
}

/**
 * Load model from server
 * @method loadModel
 * @param {} fileName filename of the file in the models folder
 * @return
 */
function loadModel(fileName) {

    meshURL = "./models/" + fileName
    var loader = new THREE.ColladaLoader();
    loader.options.convertUpAxis = true;
    loader.load(meshURL, function (collada) {

        dae = collada.scene;
        geoMesh = dae.children[0].children[0].geometry
        loadMesh(geoMesh);
        getColladaFileFromURL();

    });
}

/**
 * Generate a XML representation of the mesh in the collada format
 * @method generateXMLFromMesh
 * @return
 */
function generateXMLFromMesh() {

    xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", "./models/default.dae", true);
    xmlhttp.send();

    /**
     * Description
     * @method onreadystatechange
     * @return
     */
    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            console.log(xmlhttp.responseXML)
            xmlDoc = xmlhttp.responseXML;

            //Vertices
            var vtx = ""
            hds.vecVertex.forEach(function (vertex) {
                vtx += vertex.x + " " + vertex.y + " " + vertex.z + " "
            })

            //Faces
            var fac = "",
                facV = "";

            hds.face.forEach(function (face) {
                console.log('face');
                fac += face[0] + " " + face[1] + " " + face[2] + " "
                facV += "3 "
            })


            var meshTag = xmlDoc.getElementById("Kirigami-mesh");

            if (meshTag) {
                meshTag.getElementsByTagName("float_array")[0].innerHTML = vtx;
                meshTag.getElementsByTagName("float_array")[0].setAttribute("count", hds.vecVertex.length * 3);
                meshTag.getElementsByTagName("accessor")[0].setAttribute("count", hds.vecVertex.length);
                meshTag.getElementsByTagName("polylist")[0].setAttribute("count", hds.face.length);
                meshTag.getElementsByTagName("vcount")[0].innerHTML = facV;
                meshTag.getElementsByTagName("p")[0].innerHTML = fac;

            }
        }
    }
}
