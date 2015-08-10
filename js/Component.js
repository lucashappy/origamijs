/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SHAKIRIGAMI */

(function () {
    "use strict";
    var SK = SHAKIRIGAMI;

    /**
     * A Component is a region of a PaperModel between boundaries
     */
    SK.Component = function () {

        this.id = SK.Component.count++;
        this.boundaries = []; //refered nodes in graph
        this.vertices = []; //vertices of the component that don't belongs to a border
    };


    SK.Component.count = 0;

    /**
     * A Boundary is a set of vertices of a PaperModel between two components.
     * The edges between these vertices are necessarily of a type differente from "Flat"
     */
    SK.Boundary = function(){
        this.id = SK.Boundary.count++;
        this.side1 = new SK.Component();
        this.side2 = new SK.Component();
        this.vertices = [];
    };

    SK.Boundary.count = 0;



}());
