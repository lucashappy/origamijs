/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SK, fabric */

(function () {
    "use strict";

    // create a wrapper around native canvas element (with id="c")
    var canvas = new fabric.StaticCanvas("infoLayerCanvas");
    canvas.setDimensions({width: window.innerWidth, height:window.innerHeight});
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // create a rectangle object
    var rect = new fabric.Rect({
        left: 500,
        top: 500,
        fill: 'red',
        width: 200,
        height: 200
    });

    // "add" rectangle onto canvas
    canvas.add(rect);

}());
