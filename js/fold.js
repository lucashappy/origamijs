/* jshint loopfunc: true*/
/* globals THREE, PVector, paper, console, resetScene, PaperModel, SK */
(function () {
    "use strict";

    ///// Folding
    var foldTimes = 2;

    PaperModel.prototype.fold = function fold(degrees) {

        console.log("Folding " + degrees + "º");

        //process cuts
        paper.processCuts();

        //Compute coponents and its boundaries
        if (paper.components === undefined) {
            paper.computeComponentsBoundaries();
        }

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
        // self.boundaries.forEach(function (boundary) {

        //Rotation in local space

        if (foldTimes < paper.boundaries.length) {

            //  console.log(foldTimes);
            var boundary = paper.boundaries[foldTimes];

            var component = boundary.side1;

            /* var axis = paper.hds.vertex[boundary.vertices[0]].sub(paper.hds.vertex[boundary.vertices[1]]);
             axis.normalize(0);

             var quaternion = new THREE.Quaternion();
             quaternion.setFromAxisAngle(new THREE.Vector3(axis.x, axis.y, axis.z), degrees * Math.PI / 180);

             component.vertices.forEach(function (elem) {

                 if (boundary.vertices.indexOf(elem) === -1) { //Don't move the boundary vertices
                     console.log("Move vertex ", elem);
                     var v = paper.hds.vertex[elem];
                     var vector = new THREE.Vector3(v.x, v.y, v.z);
                     vector.applyQuaternion(quaternion);
                     paper.hds.vertex[elem] = new PVector(vector.x, vector.y, vector.z);
                     paper.updateVectors();
                 }

             });*/


            var bOrigin = paper.hds.vertex[boundary.vertices[0]].add(paper.hds.vertex[boundary.vertices[1]]).mult(0.5);


            var obj = new THREE.Object3D();
            obj.position.set(bOrigin.x, bOrigin.y, bOrigin.z);
            obj.updateMatrix();
            var axis = new THREE.Vector3(1, 0, 0);
            var radians = boundary.direction * degrees * Math.PI / 180;

            var rotObjectMatrix = new THREE.Matrix4();
            rotObjectMatrix.makeRotationAxis(axis, radians);
            obj.matrix.multiply(rotObjectMatrix);

            var quaternion = new THREE.Quaternion();
            quaternion.setFromRotationMatrix(obj.matrix);

            component.vertices.forEach(function (elem) {

                if (boundary.vertices.indexOf(elem) === -1) { //Don't move the boundary vertices
                    if (paper.hds.vertex[elem].wasMoved !== true) {

                        console.log("Move vertex ", elem);

                        if (paper.hds.vertex[elem].isRidge)
                            paper.hds.vertex[elem].wasMoved = true;

                        var v = paper.hds.vertex[elem];

                        var vector = new THREE.Vector3(v.x, v.y, v.z);
                        vector = vector.sub(bOrigin);
                        vector.applyQuaternion(quaternion);
                        vector = vector.add(bOrigin);
                        v.x = vector.x;
                        v.y = vector.y;
                        v.z = vector.z;
                        paper.hds.vertex[elem] = v;
                        paper.updateVectors();
                    }
                }

            });





            foldTimes--;
        }

        //  });


        resetScene();
    };

    //Get all vertices of a boundary
    PaperModel.prototype.getBoundaryVertices = function (boundary) {

        var self = this;
        var hasVtx = new Array(self.hds.vertex.length);
        boundary.forEach(function (he) {
            hasVtx[he.vtx] = true;
            hasVtx[self.hds.halfedge[he.opp].vtx] = true;
        });

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
        // console.log(hasVtx);

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
            var ridges = [];

            //For all faces which belongs to this component
            for (var j = 0; j < self.faceGroup.length; j++) {
                if (self.faceGroup[j] === i) {

                    component.faces.push(j);
                    var face = self.hds.halfedge[self.hds.faceh[j]];
                    var valleys = [];

                    self.hds.faceCirculator(function (he) {
                        // console.log(he.type);
                        switch (he.type) {
                            /* case "Cut":
                                 tempBoundaries[0].push(he);
                                 break;*/
                        case "Ridge":
                           // component.hasRidge = true;
                           // self.hds.vertex[he.vtx].isRidge = true;
                            //ridges.push(he);
                            valleys.push(he);
                            break;
                        case "Valley":
                            valleys.push(he);
                            break;
                        }

                        if (component.vertices.indexOf(he.vtx) === -1)
                            component.vertices.push(he.vtx);

                    }, face);



                    valleys.forEach(function (he) {
                        //get other side component
                        var side2Index = self.faceGroup[self.hds.halfedge[he.opp].fac];

                        if (side2Index !== undefined) {

                            var boundary = paper.boundaries[component.boundaries[side2Index]] || new SK.Boundary();
                            var isNew = boundary.side1 === null;

                            boundary.addHalfedge(he, self.hds.halfedge[he.opp]);
                            boundary.side1 = component;

                            if (self.components[side2Index] === undefined)
                                self.components[side2Index] = new SK.Component(side2Index);
                            boundary.side2 = self.components[side2Index];

                            if (isNew) {
                                boundary.id = paper.boundaries.length;
                                var index = paper.boundaries.push(boundary) - 1;
                                component.boundaries[side2Index] = index;
                                boundary.side2.boundaries[component.id] = index;

                            }

                        }
                    });
                }

            }

            if (component.hasRidge) {
                var ridgeVtx = paper.hds.vertex[ridges[0].vtx];

                component.boundaries.forEach(function (elem) {
                    var boundary = paper.boundaries[elem];
                    var boundaryVtx = paper.hds.vertex[boundary.vertices.pop()];
                    if (boundaryVtx.y < ridgeVtx.y) {
                        paper.boundaries[elem].direction = 1;
                    }
                    else{
                        paper.boundaries[elem].direction = -1;
                    }
                });
            }
        }



        //Treat fold order.
        paper.boundaries.forEach(function (boundary, index) {

            if (boundary.side1.hasRidge) {
                var component = boundary.side1;
                var side2 = boundary.getOtherSide(component);
                boundary.side2 = side2;
                boundary.side1 = component;
                paper.boundaries[index] = boundary;

            } else if (boundary.side2.hasRidge) {

                var component = boundary.side2;
                var side2 = boundary.getOtherSide(component);
                boundary.side2 = side2;
                boundary.side1 = component;
                paper.boundaries[index] = boundary;
            } else {

                var component = boundary.side1;
                var side2 = boundary.getOtherSide(component);


                var l1 = getLowestVertice(component),
                    l2 = getLowestVertice(side2);

                if (l1 < l2) {

                    boundary.side2 = component;
                    boundary.side1 = side2;
                    paper.boundaries[index] = boundary;
                } else {

                    boundary.side2 = side2;
                    boundary.side1 = component;
                    paper.boundaries[index] = boundary;
                }

            }

        });


    };

    PaperModel.prototype.computeCentroids = function () {

        var self = this;
        self.centroids = [];
        self.hds.face.forEach(function (face, index) {

            var sum = self.hds.vertex[face[0]]
                .add(self.hds.vertex[face[1]])
                .add(self.hds.vertex[face[2]]);

            self.centroids[index] = sum.mult(1 / 3.0);

        });
    };

    function getLowestVertice(component) {

        var lowest = paper.hds.vertex[component.vertices[0]];

        component.vertices.forEach(function (i) {
            var v = paper.hds.vertex[i];
            if (v.y < lowest.y)
                lowest = v;

        });

        return lowest;
    }



}());
