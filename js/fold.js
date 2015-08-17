/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SK */
(function () {
        "use strict";

        ///// Folding

        PaperModel.prototype.fold = function fold(degrees) {

            console.log("Folding " + degrees + "º");
            //Compute coponents and its boundaries
            if (paper.components === undefined)
                paper.computeComponentsBoundaries();

           /* paper.boundaries.forEach(function (elem) {
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
                }*/
           // });
             var self = this;
            var boundary = self.components[0].boundaries.pop();
            var component = self.components[0];

             if (boundary.vertices.length > 1) {
                    var axis = paper.hds.vertex[boundary.vertices[0]].sub(paper.hds.vertex[boundary.vertices[1]]);
                    console.log(axis);
                    axis.normalize();
                    console.log(axis);

                    var quaternion = new THREE.Quaternion();
                    quaternion.setFromAxisAngle(new THREE.Vector3(axis.x, axis.y, axis.z), degrees * Math.PI / 180);

                    component.vertices.forEach(function (elem) {

                        var v = paper.hds.vertex[elem];
                        var vector = new THREE.Vector3(v.x, v.y, v.z);
                        vector.applyQuaternion(quaternion);
                        paper.hds.vertex[elem] = new PVector(vector.x, vector.y, vector.z);
                        paper.updateVectors();

                    });


                    resetScene();
                }

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

            //Identify papermodel components
            self.computeComponents();

            self.components = [];
            self.boundaries = [];

            //For each component
            for (var i = 0; i < self.groupCount; i++) {


                if (self.components[i] === undefined)
                    self.components[i] = new SK.Component(i);
                var component = self.components[i];

                //For all faces which belongs to this component
                for (var j = 0; j < self.faceGroup.length; j++) {
                    if (self.faceGroup[j] === i) {
                        var face = self.hds.halfedge[self.hds.faceh[j]];
                        var tempBoundaries = [[], [], []];

                        self.hds.faceCirculator(function (he) {
                            console.log(he.type);
                            switch (he.type) {
                                /* case "Cut":
                                     tempBoundaries[0].push(he);
                                     break;*/
                            case "Ridge":
                                tempBoundaries[1].push(he);
                                break;
                            case "Valley":
                                tempBoundaries[2].push(he);
                                break;
                            default:
                                //add vertices to the component
                                if (component.vertices.indexOf(he.vtx) === -1)
                                    component.vertices.push(he.vtx);
                                break;
                            }

                        }, face);

                        tempBoundaries.forEach(function (elem) {

                                elem.forEach(function (he) {

                                    //get other side component
                                    var side2Index = self.faceGroup[self.hds.halfedge[he.opp].fac];

                                    if (side2Index !== undefined) {

                                        var boundary = component.boundaries[side2Index] || new SK.Boundary();

                                        boundary.addHalfedge(he, self.hds.halfedge[he.opp]);
                                        boundary.side1 = component;

                                        if (self.components[side2Index] === undefined)
                                            self.components[side2Index] = new SK.Component(side2Index);
                                        boundary.side2 = self.components[side2Index];
                                        component.boundaries[side2Index] = boundary;
                                    }

                                });
                        });
                }
            }

            //For each discovered boundary
            component.boundaries.forEach(function (boundary) {

                //Remove the boundaries vertices from the component
                boundary.vertices.forEach(function (vtx) {
                    var vindex = component.vertices.indexOf(vtx);
                    if (vindex !== -1)
                        component.vertices.splice(vindex, 1);
                });

                //Maybe add the boundary to the opposite component? (to avoid recalculate)
            });
        }
    };

     PaperModel.prototype.computeCentroids = function () {

         var self = this;
         self.centroids = [];
         self.hds.face.forEach(function (face, index) {

             var sum =  self.hds.vertex[face[0]]
                            .add(self.hds.vertex[face[1]])
                            .add(self.hds.vertex[face[2]]);

             self.centroids[index] = sum.mult(1/3.0);

         });
     };

}());
