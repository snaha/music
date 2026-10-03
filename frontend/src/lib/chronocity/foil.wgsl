// Inspired by vgpu's holographic-card: surface-locked engravings, pearl and glint.
// The sleeve's real artwork remains the base; camera direction supplies the light sweep.
export fn recordFoil(art: vec3f, uv: vec2f, view: vec3f, normal: vec3f, strength: f32) -> vec3f {
  let facing = abs(dot(normalize(view), normalize(normal)));
  let phase = uv.x * 0.65 + uv.y * 0.38 + view.x * 0.7 + view.y * 0.4;
  let pearl = vec3f(0.55, 0.52, 0.64) + vec3f(0.43, 0.40, 0.34) * cos(6.2831853 * (phase + vec3f(0.05, 0.38, 0.63)));
  let contour = uv.x * 85.0 + sin(uv.y * 18.0) * 4.0;
  let engraving = pow(0.5 + 0.5 * sin(contour), 18.0);
  let sweep = uv.x * 0.72 + uv.y * 0.52 - 0.6 + view.x * 0.65 + view.y * 0.35;
  let band = exp(-sweep * sweep * 12.0);
  let glint = exp(-sweep * sweep * 210.0);
  let rim = pow(1.0 - facing, 3.0);
  return art * (1.0 - strength * band * 0.12) + strength * (pearl * (band * 0.16 + engraving * band * 0.10 + rim * 0.2) + vec3f(glint * 0.15));
}
