/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SK */

(function () {
    "use strict";

    /**
     * A Component is a region of a PaperModel between boundaries
     */
    SK.Component = function (id) {

        this.id = id;
        this.boundaries = []; //refered nodes in graph
        this.vertices = []; //vertices of the component
        this.faces = []; // faces of the component
        this.hasRidge = false;

    };


    /**
     * A Boundary is a set of vertices of a PaperModel between two components.
     * The edges between these vertices are necessarily of a type differente from "Flat"
     */
    SK.Boundary = function(){
        this.id = SK.Boundary.count++;
        this.side1 = null;
        this.side2 = null;
        this.heList = [];
        this.vertices = []; //just to easy access
        this.isRidge = false;
        this.direction = 1;
    };

    SK.Boundary.count = 0;

    SK.Boundary.prototype.addHalfedge = function(halfedge, oppHalfedge){

        //add halfedge
        this.heList.push(halfedge);

        //add vertex of halfedge to the vertices list
        if(this.vertices.indexOf(halfedge.vtx) === -1){
            this.vertices.push(halfedge.vtx);
        }

        //add vertex of opposite halfedge to the list
        if(this.vertices.indexOf(oppHalfedge.vtx) === -1){
            this.vertices.push(oppHalfedge.vtx);
        }

    };

    SK.Boundary.prototype.getOtherSide = function(component){

        if(this.side1.id === component.id)
            return this.side2;
        else
            return this.side1;
    };



}());
