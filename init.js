var camera, scene, renderer, controls, clock, trackballControls, hideFlatEdges = false;
var mesh, hds, edges, mouse, raycaster, selected = [],
    // meshURL = "./downloads/06.states.dae",
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

var loader = new THREE.ColladaLoader();
loader.options.convertUpAxis = true;
loader.load(meshURL, function (collada) {
    // loader.load('./models/06_TokyoIT', function (collada) {


    dae = collada.scene;
    geoMesh = dae.children[0].children[0].geometry

    /* dae.traverse(function (child) {

         if (child instanceof THREE.SkinnedMesh) {

             var animation = new THREE.Animation(child, child.geometry.animation);
             animation.play();

         }

     });*/

    //dae.scale.x = dae.scale.y = dae.scale.z = 100;
    //dae.updateMatrix();

    initInterface();
    init();
    animate();
});


//
// Marks all selected edges as being of the given edge type
//
function labelEdge(edgeType) {
    for (var i = 0; i < selected.length; i++) {
        if (selected[i].halfedge.edgeType == "Border") continue;
        selected[i].material.color.setHex(edgeTypeColor[edgeType]);
        selected[i].halfedge.edgeType = edgeType;
    }
    deselectAll();
}



// 
// Deselects all edges 
//
function deselectAll() {
    for (var i = 0; i < selected.length; i++) {
        selected[i].material.gapSize = 0;
    }
    selected = [];
}

//
// Processes edges to be cut, possibly altering hds. Return true
// Returns true if hds was modified.
//
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

//
// Creates constraints, i.e., a set of dihedral and linear constraints
// from halfedge data structure hds
//
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

//
// Performs one step of the relaxation process
//
function relaxOneStep() {
    var n = 10;
    var lc = constraints[0],
        dc = constraints[1];
    for (var k = 0; k < n; k++) {
        var f = (k + 1 + n) / (n + n);
        for (var i = 0; i < dc.length; i++) {
            var c = dc[i];
            c.relax();
        }
        for (var i = 0; i < lc.length; i++) {
            var c = lc[i];
            c.relax();
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

//
// Set all edges as flat edges
//
function allFlat() {
    selected = [];
    for (var i = 0; i < edges.children.length; i++) {
        selected.push(edges.children[i]);
    }
    labelEdge("Flat");
}

// 
// Rebuilds all objects
// 
function resetObjects() {
    //hds = paperHalfedge(5, 5, 100);
    //objectsFromHds();

    $('.state-item').removeClass('active')
    hds = halfedgeFromMesh(geoMesh)
    objectsFromHds();
}

//
// Function that returns the active interaction mode
//
function getActiveMode() {
    var activeGui;
    var gui = d3.select("div.gui");
    gui.selectAll("input.modeSelect").each(function () {
        var sel = d3.select(this);
        var value = sel.attr("value");
        var checked = sel.property("checked");
        if (checked) activeGui = value;
        gui.select("div." + value + "Gui").style("visibility", function () {
            //if (checked) return "visible";
            //return "hidden";
            return "visible";
        })
    })
    return activeGui;
}

//
// Initialize the Graphic User Interface
//
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
            else resetObjects();
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
}

// 
// From hds, a halfedge data structure, creates a mesh and line objects 
// for the edges. Scene is cleared and the objects are added to the scene
// 
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





function init() {

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


    //scene.add(geoMesh);


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


  /*  var geometry = new THREE.SphereGeometry(300, 10, 10);
    var material = new THREE.MeshLambertMaterial({
        color: 0xffff00,
        wireframe: false
    });

    //scene.add
    /* sphere = new THREE.Mesh(geometry, material);
     scene.add(sphere);

     var bbox = new THREE.BoundingBoxHelper(sphere, 0xff0000);
     bbox.update();
     scene.add(bbox);*/

    /* Define the object to be viewed */
    hds = halfedgeFromMesh(geoMesh)
    objectsFromHds();
    // resetObjects();
    getEdgeTypesData();


    /* Add a raycaster for picking objects */
    raycaster = new THREE.Raycaster();

    /* The clock and trackball */
    clock = new THREE.Clock();
    trackballControls = new THREE.TrackballControls(camera, renderer.domElement);
    // trackballControls.enabled = false
    // Callbacks
    window.addEventListener('resize', onWindowResize, false);
    mouse = new THREE.Vector2();
    window.addEventListener('click', onWindowClick, false);
    window.addEventListener('mousemove', onWindowMouseMove, true);
    window.addEventListener('mousedown', onWindowMouseDown, true);
    window.addEventListener('mouseup', onWindowMouseUp, true);

}

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
}

// Window resize callback
function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    setSelectionCanvas();

}


document.addEventListener('keydown', function (event) {
    if (event.keyCode == 96) {
        trackballControls.reset();
    }

    if (event.keyCode == 72) {

        console.log("toggle flat edges");
        toggleFlatEdges();

    }

});

function toggleFlatEdges() {

    hideFlatEdges = !hideFlatEdges;

    edges.children.forEach(function (edge) {
        if (edge.halfedge.edgeType == "Flat") {
            edge.visible = hideFlatEdges
        }
    });
}




var initX = -1,
    initY = -1;

function onWindowMouseDown(event) {
    if (event.shiftKey) {
        trackballControls.enabled = false
        document.body.style.cursor = 'crosshair';
        initX = event.clientX
        initY = event.clientY
    }

}

function onWindowMouseUp(event) {
    if (!trackballControls.enabled) {
        boxSelectObjects(initX, initY, event.clientX, event.clientY)
        trackballControls.enabled = true
        initX = -1
        initY = -1
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        document.body.style.cursor = 'pointer';

    }
}

function boxSelectObjects(x, y, x2, y2){

    var selectionBox = new THREE.Box2(new THREE.Vector2(x, y), new THREE.Vector2(x2, y2))
    edges.children.forEach(function(edge){

        if(selectionContainsObject(selectionBox, edge)){
            edge.material.gapSize = 2;
            selected.push(edge);
        }
    });

}


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

function screenCoordFrom3DPoint(point3D) {

    var vector = point3D.project(camera);

    vector.x = (vector.x + 1) / 2 * window.innerWidth;
    vector.y = -((vector.y - 1) / 2 * window.innerHeight);

    return vector;
}

function get3dPoint(x, y, z) {

    x = (x / window.innerWidth) * 2 - 1;
    y = -(y / window.innerHeight) * 2 + 1;

    var vector = new THREE.Vector3(x, y, z);
    return vector.unproject(camera);
}


function onWindowClick(event) {

    //boxSelectObjects(0, 0, 0, 0);
    //event.preventDefault();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Add clicked object to selection
    selectObject();


}

var highlighted;
var highlightMaterialColor = 0x000000;
var saveMaterialColor;

function onWindowMouseMove(event) {

    if (initX > -1 || initY > -1) {
        addSelection(event.clientX, event.clientY)
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

function addSelection(moveX, moveY) {
    if (!trackballControls.enabled) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.beginPath();
        ctx.rect(initX, initY, moveX - initX, moveY - initY);
        ctx.stroke();
        window.getSelection().removeAllRanges();
    }
}


/* Selects/deselects objects of the scene */
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

function animate() {

    var delta = clock.getDelta();
    trackballControls.update(delta);
    if (getActiveMode() == "anim" && relaxCount > 0) {
        relaxOneStep();
        relaxCount--;
    }

    requestAnimationFrame(animate);
    renderer.render(scene, camera);

}


//
// Returns a THREE.Geometry object from a halfedge data structure 
//
function halfedgeGeometry(hds) {
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


// Adds an array of cylinders with radius r, one for each edge of
// halfedge data structure hds, to the given scene
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

// Adds an array of lines, one for each edge of
// halfedge data structure hds, to the given scene
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
    // converts a PVector to a THREE.Vector3 
function toVec3(pvector) {
    return new THREE.Vector3(pvector.x, pvector.y, pvector.z);
}

// Returns a cylinder geometry where the bottom is at vstart,
// the top is at vend (both are THREE.Vector3 objects, 
// and the radius is r
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


//
// Adds table vecVertex to the given halfedge data structure
// that contains all vertices as THREE.Vector3 objects rather than PVector objects
//
function hdsCreateVertexVectors(hds) {
    hds.vecVertex = [];
    hds.allVertices(function (he, v) {
        hds.vecVertex[he.vtx] = new THREE.Vector3(v.x, v.y, v.z);
    });
}

//
// Updates table vecVertex from the parallel vertex table objects
//
function hdsUpdateVertexVectors(hds) {
    hds.allVertices(function (he, v) {
        hds.vecVertex[he.vtx].set(v.x, v.y, v.z);
    });
}

// Returns a halfedge data structure for a gridded paper with
// n times m cells, each of size s
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

function downloadMesh() {

    saveData(new XMLSerializer().serializeToString(xmlDoc), "teste.dae");
}


function getEdgeTypesData() {

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

function loadEdgeTypes() {

    var edgeTypeTags = xmlDoc.getElementsByTagName("edge_type")

    for (var i = 0; i < edgeTypeTags.length; i++) {
        addState(i);
    }

    $('.state-item').last().trigger("click");

    parseEdgeTypeByIndex(edgeTypeTags.length - 1)
}

function parseEdgeTypeByIndex(index) {
    console.log("index " + index);
    allFlat();
    var edgeTypeNode = xmlDoc.getElementsByTagName("edge_type")[index]
    parseEdgeType(edgeTypeNode, "cuts", "Cut");
    parseEdgeType(edgeTypeNode, "ridges", "Ridge");
    parseEdgeType(edgeTypeNode, "valleys", "Valley");
}


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

function addState(stateIndex) {
    $('.states-list')
        .append('<li class="list-group-item state-item" onclick="parseEdgeTypeByIndex(' + stateIndex + ')">State ' + stateIndex +
            '<span class="glyphicon glyphicon-remove" onclick="removeState(event)"></li>')
        .on('click', '.state-item', function (event) {
            $('.state-item').removeClass('active')
            $(event.target).addClass('active')
        });

}

function removeState(event) {
    var index = $(event.target.parentElement).index()
    var node = xmlDoc.getElementsByTagName("edge_type")[index]
    node.parentElement.removeChild(node)
    $(event.target.parentElement).remove();


}

function handleFileSelect(evt) {

    var file = evt.target.files[0]; // FileList object

    // Loop through the FileList and render image files as thumbnails.
    /* for (var i = 0, f; f = files[i]; i++) {

         // Only process image files.
         /*if (!f.type.match('application/xml')) {
                 continue;
               }*/

    var reader = new FileReader();

    // Closure to capture the file information.
    reader.onload = (function (theFile) {
        return function (e) {

            meshURL = e.target.result
            loader.load(meshURL, function (collada) {

                $('.states-list').empty()
                dae = collada.scene;
                var geoMesh = dae.children[0].children[0].geometry
                hds = halfedgeFromMesh(geoMesh)
                objectsFromHds();
                getEdgeTypesData();



            });


        };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsDataURL(file);

};


document.getElementById('files').addEventListener('change', handleFileSelect, false);
