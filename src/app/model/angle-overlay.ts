export function angleOverlayArc(
  points: { x1: number; y1: number; x2: number; y2: number },
  objectScale: number
) {
  //This function returns the SVG path of the angle overlay
  //Is has one line that goes along the primary axis of the link starting at the first joint
  //The 2nd line starts at the first joint and is parallel to the x axis
  //The third arc connects the endpoint of the first line to the endpoint of the second line
  const lengthOfIndicator = objectScale * 1.8;
  let { x1, y1, x2, y2 } = points;

  //Find the slope and the angle of the original line
  let angle = Math.atan2(y2 - y1, x2 - x1);

  //Find the coordinates of the endpoints of the two lines that form the angle with the original line
  let x3 = x1 + lengthOfIndicator * Math.cos(angle);
  let y3 = y1 + lengthOfIndicator * Math.sin(angle);
  let x4 = x1 + lengthOfIndicator;
  let y4 = y1;

  //Find the direction and flags for drawing the arc
  //Assume that we want to draw a quarter circle with radius equal to lengthOfIndicator
  let sweepFlag = angle > 0 ? 1 : 0;

  //Return the SVG paths of the angle overlay without the arrow
  let arc =
    ' M' +
    x4 +
    ' ' +
    y4 +
    ' A' +
    lengthOfIndicator +
    ' ' +
    lengthOfIndicator +
    ' ' +
    '90' +
    ' ' +
    0 +
    ' ' +
    sweepFlag +
    ' ' +
    x3 +
    ' ' +
    y3;

  //Return the SVG path of the angle overlay with the arrow
  return arc;
}
