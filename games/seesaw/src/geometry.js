// Physics position stays normalized. Rendering uses scene pixels and the board normal.
export function sceneGeometry(width, height, position, angle, objectSize, fall = 0) {
  const length = width * .7, thickness = 18, support = Math.min(58, height * .2);
  const ground = height * .8, pivotY = ground - support;
  const radians = angle * Math.PI / 180, tangent = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: Math.sin(radians), y: -Math.cos(radians) };
  const distance = position * length / 2, radius = objectSize / 2;
  const contact = { x: width / 2 + tangent.x * distance + normal.x * thickness / 2, y: pivotY + tangent.y * distance + normal.y * thickness / 2 };
  return { length, thickness, support, ground, pivotY, contact,
    center: { x: contact.x + normal.x * radius, y: contact.y + normal.y * radius + fall * height * .65 } };
}
export function rollingAngle(travel, length, diameter) { return travel * length / diameter * 180 / Math.PI; }
