import numpy as np, exudyn as exu
from exudyn.itemInterface import *
sc = exu.SystemContainer(); mbs = sc.AddSystem()
g = mbs.AddObject(ObjectGround()); ng = mbs.AddNode(NodePointGround())
n = mbs.AddNode(NodeRigidBody2D(referenceCoordinates=[1.0, 0, 0]))
b = mbs.AddObject(ObjectRigidBody2D(mass=2.0, inertia=0.5, nodeNumber=n))
mg = mbs.AddMarker(MarkerBodyRigid(bodyNumber=g, localPosition=[0, 0, 0]))
mb = mbs.AddMarker(MarkerBodyRigid(bodyNumber=b, localPosition=[-1.0, 0, 0]))
j = mbs.AddObject(RevoluteJoint2D(markerNumbers=[mg, mb]))
mgc = mbs.AddMarker(MarkerNodeCoordinate(nodeNumber=ng, coordinate=0))
mrot = mbs.AddMarker(MarkerNodeCoordinate(nodeNumber=n, coordinate=2))
c = mbs.AddObject(CoordinateConstraint(markerNumbers=[mgc, mrot]))
mm = mbs.AddMarker(MarkerBodyMass(bodyNumber=b))
mbs.AddLoad(LoadMassProportional(markerNumber=mm, loadVector=[0, -9.81, 0]))
mbs.Assemble(); ss = exu.SimulationSettings(); ss.displayStatistics=False; ss.linearSolverType=exu.LinearSolverType.EXUdense
exu.SolveStatic(mbs, ss)
print("lambda", mbs.systemData.GetAECoordinates())
print("joint Force output", mbs.GetObjectOutput(j, exu.OutputVariableType.Force), "coord constraint", mbs.GetObjectOutput(c, exu.OutputVariableType.Force))
