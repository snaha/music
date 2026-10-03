// Weathered wet concrete. Physical lights and roughness supply the highlights.
export fn wetStreet(position: vec3f, clock: f32, accent: vec3f) -> vec3f {
  let worn = sin(position.x * 0.19) * cos(position.z * 0.14) * 0.5 + 0.5;
  return vec3f(0.038, 0.043, 0.043) + vec3f(0.027, 0.024, 0.019) * worn;
}
