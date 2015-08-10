/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel */
(function () {
    "use strict";

    ///// Folding

    PaperModel.prototype.fold = function fold(degrees) {


        console.log("Folding " + degrees + "º");
        //Compute coponents and its boundaries
        paper.computeComponentsBoundaries();

        paper.boundaries.forEach(function (elem) {
            //movingVtx = All component vertices minus those who belongs to the boundary
            var compVtx = paper.getComponentVertices(elem.faceGroup, false);
            var boundaryVtx = paper.getBoundaryVertices(elem.heList);
            var movingVtx = [],
                axis_points = [];

            compVtx.forEach(function (elem, index) {
                if (!boundaryVtx[index]) {
                    movingVtx.push(index);
                }
            });

            boundaryVtx.forEach(function (elem, index) {
                axis_points.push(index);
            });


            //Rotate the moving vertices against an axis defined by the boundary
            // paper.hds.vertex[1].y = -1000
            // paper.updateVectors();

            if (axis_points.length > 1) {
                var axis = paper.hds.vertex[axis_points[0]].sub(paper.hds.vertex[axis_points[1]]);
                console.log(axis);
                axis.normalize();
                console.log(axis);

                var quaternion = new THREE.Quaternion();
                quaternion.setFromAxisAngle(new THREE.Vector3(axis.x, axis.y, axis.z), degrees * Math.PI / 180);

                movingVtx.forEach(function (elem) {

                    var v = paper.hds.vertex[elem];
                    var vector = new THREE.Vector3(v.x, v.y, v.z);
                    vector.applyQuaternion(quaternion);
                    paper.hds.vertex[elem] = new PVector(vector.x, vector.y, vector.z);
                    paper.updateVectors();

                });


                resetScene();
            }
        });

    };

    //Get all vertices of a boundary
    PaperModel.prototype.getBoundaryVertices = function (boundary) {

        var self = this;
        var hasVtx = new Array(self.hds.vertex.length);
        boundary.forEach(function (he) {
            hasVtx[he.vtx] = true;
            hasVtx[self.hds.halfedge[he.opp].vtx] = true;
        });

        console.log(hasVtx);
        return hasVtx;
    };


    //Get all vertices of a component
    PaperModel.prototype.getComponentVertices = function (component) {

        var self = this;
        var j = 0;
        var hasVtx = new Array(self.hds.vertex.length);

        while (j < self.hds.face.length) {
            while (j < self.hds.face.length && self.faceGroup[j] != component) // for each component's face
                j++;

            if (j == self.hds.face.length) {
                break;
            }

            var jhe = self.hds.halfedge[self.hds.faceh[j]];
            self.hds.faceCirculator(function (he) {
                hasVtx[he.vtx] = true;
            }, jhe);

            j++;
        }
        console.log(hasVtx);

        return hasVtx;
    };

    //
    // Compute connected components for the halfedge faces, i.e., consider
    // border,ridge and valley edges as fences between the components.
    //
    PaperModel.prototype.computeComponentsBoundaries = function () {

        var self = this;
        self.computeComponents();

        self.boundaries = [];
        var j = 0;

        for (var i = 0; i < self.groupCount; i++) {

            while (self.faceGroup[j] != i)
                j++;

            var firstFace = self.hds.halfedge[self.hds.faceh[j]];
            var tempBoundaries = [[], [], []];

            self.hds.faceCirculator(function (he) {
                switch (he.type) {
                case "Cut":
                    tempBoundaries[0].push(he);
                    break;
                case "Ridge":
                    tempBoundaries[1].push(he);
                    break;
                case "Valley":
                    tempBoundaries[2].push(he);
                    break;
                default:
                    break;
                }

            }, firstFace);

            tempBoundaries.forEach(function (elem) {

                if (elem.length > 0) {
                    self.boundaries.push({
                        faceGroup: i,
                        heList: elem
                    });
                }
            });
        }
    };

}());
