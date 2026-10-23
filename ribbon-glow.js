/**
 * Ribbon Glow 2 — Originkit
 * Vanilla WebGL2 implementation for A.T.L.A.S. LensAudit
 */

function initRibbonGlow(canvas, container = canvas.parentElement, options = {}) {
  if (!canvas) return;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) {
    console.warn("RibbonGlow: WebGL2 indisponível neste ambiente.");
    return;
  }

  const MAX_DPR = 2;
  const LAYERS = 84.0;
  const TWIST = 1.250;
  const DRAG = 0.180;

  const VERT_SRC = `#version 300 es
  const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
  `;

  const FIELD_SRC = `#version 300 es
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uSize;
  uniform float uAngle;
  uniform vec2 uMouse;
  uniform float uOn;
  uniform float uReach;
  uniform vec2 uVel;
  out vec4 o;

  const float TAU = 6.28318530718;
  const float LAYERS = ${LAYERS.toFixed(1)};
  const float TWIST = ${TWIST.toFixed(3)};
  const float DRAG = ${DRAG.toFixed(3)};
  const float GAIN = 0.62;
  const vec2 CENTRE = vec2(-0.62, 0.24);
  const float TILT = 0.6;
  const float ZOOM = 1.05;
  const float THETA = 2.13;
  const float SHEAR = 0.963;
  const float SHRINK = 0.953;
  const vec2 WARP_FREQ = vec2(0.42, 2.4);
  const vec2 WARP_AMP = vec2(0.13, 0.027);
  const vec2 ASPECT = vec2(2.1, 0.17);
  const float OFFSET = 0.36;
  const float GLOW = 0.0021;
  const float SOFT = 0.0019;
  const float FALLOFF = 0.37;
  const float PHASE = 12.0;
  const float CYCLE = 0.16;
  const float HUE_TRAVEL = 2.0;

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

  void main() {
    vec2 R = uRes;
    vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;

    vec2 d = pos - uMouse;
    float w = uOn * exp(-dot(d, d) / (uReach * uReach));
    if (w > 1e-4) pos = uMouse + rot(w * TWIST) * d * (1.0 - 0.3 * min(w, 1.0)) - uVel * min(w, 1.0) * DRAG;

    pos = rot(uAngle) * pos / uSize;
    float t = uTime * 0.49 + PHASE;
    float breath = (-sin(uTime * 0.735) + sin(uTime * 0.49 + 1.0)) * 0.25 + 0.5;
    vec2 u = rot(TILT) * ((pos - CENTRE) * (ZOOM - breath * 0.085));
    mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

    vec3 col = vec3(0.0);
    for (float i = 1.0; i <= LAYERS; i += 1.0) {
      u.x -= sin(u.y * WARP_FREQ.x + t + i * 0.007) * WARP_AMP.x;
      u.y -= sin(u.x * WARP_FREQ.y - t + i * 0.02) * WARP_AMP.y;
      u = fold * u * SHRINK;
      vec2 q = (u - vec2(OFFSET + breath * 0.1, 0.0)) * ASPECT;
      float g = GLOW / (dot(q, q) + SOFT) * (0.25 + breath * 0.4);
      float r = length(u);
      float k = sin(i * CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
      col += g * mix(uC1, uC2, k) * (0.62 + 0.5 * k) * exp2(-r * FALLOFF);
    }
    vec3 x = max(col * GAIN, 0.0);
    col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    col = pow(clamp(col, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
    col *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * 0.07;
    o = vec4(col, 1.0);
  }
  `;

  const FINISH_SRC = `#version 300 es
  precision highp float;
  uniform sampler2D uField;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uBg;
  uniform float uPaper;
  out vec4 o;

  float ign(vec2 p, float f) { p += 5.588238 * mod(f, 64.0); return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec3 L = max(texture(uField, frag / uRes).rgb, 0.0);

    vec3 dark = uBg + L * (1.0 - uBg);
    float strength = clamp(max(L.r, max(L.g, L.b)), 0.0, 1.0);
    vec3 paper = uBg * (1.0 - strength) + L * 0.96;
    vec3 col = mix(dark, paper, uPaper);
    col += (ign(frag, floor(uTime * 24.0)) - 0.5) / 255.0;
    o = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
  `;

  function parseHex(h) {
    if (!h) return [0, 0, 0];
    let s = h.replace('#', '').trim();
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [
      parseInt(s.slice(0, 2), 16) / 255,
      parseInt(s.slice(2, 4), 16) / 255,
      parseInt(s.slice(4, 6), 16) / 255
    ];
  }

  function link(frag, label) {
    const createShader = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(`RibbonGlow ${label} shader compile error:`, gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = createShader(gl.VERTEX_SHADER, VERT_SRC);
    const fs = createShader(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(`RibbonGlow ${label} link error:`, gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  const field = link(FIELD_SRC, "field");
  const finish = link(FINISH_SRC, "finish");
  if (!field || !finish) return;

  const uf = {};
  ["uRes", "uTime", "uC1", "uC2", "uSize", "uAngle", "uMouse", "uOn", "uReach", "uVel"].forEach(n => {
    uf[n] = gl.getUniformLocation(field, n);
  });
  const un = {};
  ["uField", "uRes", "uTime", "uBg", "uPaper"].forEach(n => {
    un[n] = gl.getUniformLocation(finish, n);
  });

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const fbo = gl.createFramebuffer();
  let tex = null;
  let fw = 0;
  let fh = 0;
  let half = !!gl.getExtension("EXT_color_buffer_float");

  function resizeTarget(nw, nh) {
    if (nw === fw && nh === fh && tex) return;
    if (tex) gl.deleteTexture(tex);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, nw, nh, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fw = nw;
    fh = nh;
  }

  // Pointer tracking
  const ptr = { tx: 0, ty: 0, inside: false };
  const onMove = (e) => {
    const r = container.getBoundingClientRect();
    const sx = container.offsetWidth / (r.width || 1);
    const sy = container.offsetHeight / (r.height || 1);
    ptr.tx = (e.clientX - r.left) * sx;
    ptr.ty = (e.clientY - r.top) * sy;
    ptr.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });

  const bg = parseHex(options.background || "#0B0A10");
  const c1 = parseHex(options.color1 || "#001E92");
  const c2 = parseHex(options.color2 || "#170C37");
  const speed = (options.speed !== undefined ? options.speed : 50) / 50;
  const size = (options.size !== undefined ? options.size : 100) / 100;
  const angle = ((options.angle !== undefined ? options.angle : -180) * Math.PI) / 180;
  const hover = (options.hover !== undefined ? options.hover : 100) / 100;
  const reach = options.reach !== undefined ? options.reach : 240;
  const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];

  let mx = 0, my = 0, vx = 0, vy = 0, on = 0, last = -1, clock = 0;

  function render(now) {
    requestAnimationFrame(render);
    const dt = last < 0 ? 0 : Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    clock = (clock + dt * speed) % 3600;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cw = container.clientWidth || 300;
    const ch = container.clientHeight || 500;
    const bw = Math.max(1, Math.round(cw * dpr));
    const bh = Math.max(1, Math.round(ch * dpr));

    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    resizeTarget(Math.max(1, Math.round(bw / 2)), Math.max(1, Math.round(bh / 2)));

    const present = ptr.inside ? 1 : 0;
    if (present && on < 0.02) {
      mx = ptr.tx;
      my = ptr.ty;
    }
    on += (present - on) * (1 - Math.exp(-dt * 5));
    const k = 1 - Math.exp(-dt * 16);
    const nx = mx + (ptr.tx - mx) * k;
    const ny = my + (ptr.ty - my) * k;
    if (dt > 0) {
      const kv = 1 - Math.exp(-dt * 8);
      vx += ((nx - mx) / dt - vx) * kv;
      vy += ((ny - my) / dt - vy) * kv;
    }
    mx = nx;
    my = ny;
    const vLen = Math.hypot(vx, vy) / (ch || 1);
    const vCap = vLen > 3 ? 3 / vLen : 1;

    // Pass 1: Field FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fw, fh);
    gl.useProgram(field);
    gl.uniform2f(uf.uRes, fw, fh);
    gl.uniform1f(uf.uTime, clock);
    gl.uniform3f(uf.uC1, c1[0], c1[1], c1[2]);
    gl.uniform3f(uf.uC2, c2[0], c2[1], c2[2]);
    gl.uniform1f(uf.uSize, size);
    gl.uniform1f(uf.uAngle, angle);
    gl.uniform2f(uf.uMouse, (mx - cw / 2) / (ch || 1), ((ch || 1) / 2 - my) / (ch || 1));
    gl.uniform1f(uf.uOn, on * hover);
    gl.uniform1f(uf.uReach, reach / (ch || 1));
    gl.uniform2f(uf.uVel, (vx / (ch || 1)) * vCap, (-vy / (ch || 1)) * vCap);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2: Finish Screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(finish);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(un.uField, 0);
    gl.uniform2f(un.uRes, bw, bh);
    gl.uniform1f(un.uTime, clock);
    gl.uniform3f(un.uBg, bg[0], bg[1], bg[2]);
    gl.uniform1f(un.uPaper, Math.min(Math.max((bgLum - 0.35) / 0.3, 0), 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  requestAnimationFrame(render);
}
