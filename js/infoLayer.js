/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SK, fabric */

var infoLayer;

(function () {
    "use strict";

    // create a wrapper around native canvas element (with id="c")
    var canvas = new fabric.StaticCanvas("infoLayerCanvas");
    canvas.setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
    });
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;


    infoLayer = canvas;
    var vertices = [],
        faces = [],
        halfedges = [],
        components = [];


    infoLayer.drawVertices = function () {

        vertices.forEach(function (elem) {
            canvas.remove(elem);
        });
        vertices.length = 0;

        paper.vecVertex.forEach(function (v, index) {

            var zoomFactor = 1000 / camera.position.z;

            var point = screenCoordFrom3DPoint(v);

            var circle = new fabric.Circle({
                radius: 12,
                fill: '#fff',
                originX: 'center',
                originY: 'center'
            });

            var text = new fabric.Text(index + "", {
                fontSize: 12,
                fill: "#5a5757",
                fontFamily: "Arial, Helvetica Neue, Helvetica, sans-serif",
                originX: 'center',
                originY: 'center'
            });

            var group = new fabric.Group([circle, text], {
                left: point.x,
                top: point.y,
                originX: "center",
                originY: "center"
            });

            group.scale(0);
            canvas.add(group);
            vertices.push(group);
            group.animate({
                scaleX: zoomFactor > 1 ? zoomFactor : 1,
                scaleY: zoomFactor > 1 ? zoomFactor : 1
            }, {
                onChange: canvas.renderAll.bind(canvas),
                easing: fabric.util.ease.easeOutBounce
            });
        });
    };

    infoLayer.drawFaces = function () {

        console.log("Draw faces");
        var zoomFactor = 1000 / camera.position.z;

        faces.forEach(function (elem) {
            canvas.remove(elem);
        });
        faces.length = 0;

        //if(paper.centroids === undefined)
        paper.computeCentroids();

        paper.centroids.forEach(function (v, index) {

            var point = screenCoordFrom3DPoint(v);

            /*var circle = new fabric.Circle({
                radius: 12,
                fill: '#fff',
                originX: 'center',
                originY: 'center'
            });*/

            var text = new fabric.Text(index + "", {
                fontSize: 12,
                fill: "#fff",
                fontFamily: "Arial, Helvetica Neue, Helvetica, sans-serif",
                originX: 'center',
                originY: 'center'
            });

            var group = new fabric.Group([text], {
                left: point.x,
                top: point.y,
                originX: "center",
                originY: "center"
            });

            group.scale(0);
            canvas.add(group);
            faces.push(group);
            group.animate({
                scaleX: zoomFactor > 1 ? zoomFactor : 1,
                scaleY: zoomFactor > 1 ? zoomFactor : 1
            }, {
                onChange: canvas.renderAll.bind(canvas),
                easing: fabric.util.ease.easeOutBounce
            });
        });
    };

    infoLayer.drawHalfedges = function () {
        console.log("draw halfedges");

        var zoomFactor = 1000 / camera.position.z;
        zoomFactor = zoomFactor > 1 ? zoomFactor : 1;

        var heScale = 0.8;

        halfedges.forEach(function (elem) {
            canvas.remove(elem);
        });
        halfedges.length = 0;

        paper.computeCentroids();

        paper.hds.halfedge.forEach(function (he, index) {

            //Halfedge line
            var begin = paper.hds.vertex[he.vtx],
                end = paper.hds.vertex[paper.hds.halfedge[he.opp].vtx];


            if (he.fac !== -1)
                var centroid = paper.centroids[he.fac];
            else {
                var centroid = new PVector(0, 0, 0);
                heScale = 1.1;
            }

            begin = centroid.clone()
                .add(begin.clone().sub(centroid.clone()).mult(heScale));
            end = centroid.clone()
                .add(end.clone().sub(centroid.clone()).mult(heScale));

            begin = screenCoordFrom3DPoint(begin),
                end = screenCoordFrom3DPoint(end);



            var line = new fabric.Line([begin.x, begin.y, end.x, end.y], {
                strokeWidth: 2,
                opacity: 0.5,
                stroke: 'red',
                originX: 'center',
                originY: 'center',
            });

            //Halfedge arrow
            var headLength = 5 * zoomFactor;

            var angle = Math.atan2(end.y - begin.y, end.x - begin.x);
            angle *= 180 / Math.PI;
            angle += 90;

            var scaledLine = line.getBoundingRect();

            var triangle = new fabric.Triangle({
                angle: angle + 180,
                fill: '#f00',
                top: begin.y,
                left: begin.x,
                height: headLength,
                width: headLength,
                originX: 'center',
                originY: 'center',
                selectable: false
            });


            var point = line.getCenterPoint(),
                radius = 6 * zoomFactor;
            var circle = new fabric.Circle({
                radius: radius,
                fill: '#f00',
                left: point.x - radius,
                top: point.y - radius
            });

            var text = new fabric.Text(index + "", {
                fontSize: 8 * zoomFactor,
                fill: "#fff",
                fontFamily: "Arial, Helvetica Neue, Helvetica, sans-serif"
            });

            text.set("top", point.y - 4 * zoomFactor);
            text.set("left", point.x - text.width / 2);

            var lineGroup = new fabric.Group([line, triangle], {
                originX: "center",
                originY: "center"
            });

            lineGroup.scale(0.8);

            var group = new fabric.Group([lineGroup, circle, text], {
                originX: "center",
                originY: "center"
            });


            //group.scale(0);
            canvas.add(group);
            halfedges.push(group);



            /* group.animate({
                  scaleX: zoomFactor > 1 ? zoomFactor : 1,
                  scaleY: zoomFactor > 1 ? zoomFactor : 1
              }, {
                  onChange: canvas.renderAll.bind(canvas),
                  easing: fabric.util.ease.easeOutBounce,
                 duration:1000
              });*/

        });
        //toSave SVG
        //window.open('data:image/svg+xml;utf8,' + encodeURIComponent(canvas.toSVG()));

    };

    infoLayer.drawComponents = function () {

        console.log("Draw Components");
        var zoomFactor = 1000 / camera.position.z;

        components.forEach(function (elem) {
            canvas.remove(elem);
        });
        components.length = 0;

        //if(paper.centroids === undefined)
        paper.computeCentroids();

        paper.components.forEach(function (c, index) {

            var point = screenCoordFrom3DPoint(paper.centroids[c.faces[0]]);

            var circle = new fabric.Circle({
                radius: 18,
                fill: '#000',
                originX: 'center',
                originY: 'center'
            });

            var text = new fabric.Text(index + "", {
                fontSize: 12,
                fill: "#fff",
                fontFamily: "Arial, Helvetica Neue, Helvetica, sans-serif",
                originX: 'center',
                originY: 'center'
            });

            var group = new fabric.Group([circle,text], {
                left: point.x,
                top: point.y,
                originX: "center",
                originY: "center"
            });

            group.scale(0);
            canvas.add(group);
            components.push(group);
            group.animate({
                scaleX: zoomFactor > 1 ? zoomFactor : 1,
                scaleY: zoomFactor > 1 ? zoomFactor : 1
            }, {
                onChange: canvas.renderAll.bind(canvas),
                easing: fabric.util.ease.easeOutBounce
            });
        });
    };

}());
