/* olpest — поверхность / этюд 03 */
(function () {
  'use strict';
  const stage = document.getElementById('stage');
  if (!window.THREE) { document.getElementById('nogl').hidden = false; return; }
  const V3 = THREE.Vector3, Q = THREE.Quaternion, C3 = THREE.Color;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NICK = 'olpest';
  const K = reduce ? 0.5 : 1; // global tempo for choreography

  // ================= renderer / scene =================
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { document.getElementById('nogl').hidden = false; return; }
  const SMALL = Math.min(window.innerWidth, window.innerHeight) < 700;
  const PR = Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2);
  renderer.setPixelRatio(PR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xF3F3F0, 1);
  stage.appendChild(renderer.domElement);

  const PAPER = new C3(0xF3F3F0);
  const ACCENT = new C3(0x2338E0);
  const GLOW = new C3(0x3F57FF);
  const LETTER = new C3(0x2C2F36);        // flat letter tone, drawn by the surface shader and by flat blocks alike
  const GRAPHITE = new C3(0x24272E);
  const PORCELAIN = new C3(0xF2F2EF), BONE = new C3(0xD6D7D2), STEEL = new C3(0x8A909A);

  const scene = new THREE.Scene();
  const D = 40, FOV = 30, PLANE_K = 2.0;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 200);
  camera.position.set(0, 0, D);
  let W = 1, H = 1, halfW = 1, halfH = 1, planeW = 1, planeH = 1;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a909a, 0.42);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.72);
  sun.position.set(-6, 9, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
  scene.add(sun); scene.add(sun.target);
  const Ldir = sun.position.clone().normalize();

  // studio environment for crisp highlights on the chamfers
  (function makeEnv() {
    const es = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).z; gl_FragColor = vec4(mix(vec3(0.42,0.43,0.46), vec3(1.0), smoothstep(-0.4, 0.9, h)), 1.0); }'
    }));
    es.add(dome);
    const panel = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new C3(k, k, k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    };
    panel(9, 5, -7, 8, 11, 3.2);
    panel(16, 1.2, 9, -4, 7, 2.4);
    panel(5, 5, 2, 12, -2, 1.4);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    pm.dispose();
  })();

  // ================= water simulation =================
  const simScene = new THREE.Scene();
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  simScene.add(quad);
  const fsVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const updateMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, delta: { value: new THREE.Vector2() }, damp: { value: 0.993 } },
    vertexShader: fsVert,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 delta; uniform float damp; varying vec2 vUv;
      void main(){
        vec4 info = texture2D(tex, vUv);
        float avg = ( texture2D(tex, vUv - vec2(delta.x, 0.0)).r + texture2D(tex, vUv + vec2(delta.x, 0.0)).r
                    + texture2D(tex, vUv - vec2(0.0, delta.y)).r + texture2D(tex, vUv + vec2(0.0, delta.y)).r ) * 0.25;
        info.g += (avg - info.r) * 2.0;
        info.g *= damp;
        info.r += info.g;
        info.r *= 0.9992;
        gl_FragColor = info;
      }`
  });
  const dropMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, a: { value: new THREE.Vector2() }, b: { value: new THREE.Vector2() }, radius: { value: 0.01 }, strength: { value: 0 }, aspect: { value: 1 } },
    vertexShader: fsVert,
    fragmentShader: `
      uniform sampler2D tex; uniform vec2 a; uniform vec2 b; uniform float radius; uniform float strength; uniform float aspect;
      varying vec2 vUv;
      void main(){
        vec4 info = texture2D(tex, vUv);
        vec2 p = vec2(vUv.x * aspect, vUv.y);
        vec2 A = vec2(a.x * aspect, a.y), B = vec2(b.x * aspect, b.y);
        vec2 pa = p - A, ba = B - A;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
        float d = length(pa - ba * h);
        float k = max(0.0, 1.0 - d / radius);
        k = 0.5 - cos(k * 3.14159265) * 0.5;
        info.r += k * strength;
        gl_FragColor = info;
      }`
  });
  let rtA = null, rtB = null, simW = 2, simH = 2;
  const makeSimRT = () => new THREE.WebGLRenderTarget(simW, simH, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
  function makeSim() {
    if (rtA) { rtA.dispose(); rtB.dispose(); }
    const aspect = planeW / planeH, base = 500;
    if (aspect >= 1) { simH = base; simW = Math.min(1500, Math.round(base * aspect)); }
    else { simW = base; simH = Math.min(1500, Math.round(base / aspect)); }
    rtA = makeSimRT(); rtB = makeSimRT();
    renderer.setClearColor(0x000000, 0);
    for (const rt of [rtA, rtB]) { renderer.setRenderTarget(rt); renderer.clear(); }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xF3F3F0, 1);
    updateMat.uniforms.delta.value.set(1 / simW, 1 / simH);
    dropMat.uniforms.aspect.value = aspect;
    waterMat.uniforms.delta.value.set(1 / simW, 1 / simH);
  }
  function simPass(mat) { quad.material = mat; renderer.setRenderTarget(rtB); renderer.render(simScene, simCam); const t = rtA; rtA = rtB; rtB = t; }
  function dropUV(ax, ay, bx, by, radius, strength) {
    const u = dropMat.uniforms;
    u.tex.value = rtA.texture; u.a.value.set(ax, ay); u.b.value.set(bx, by); u.radius.value = radius; u.strength.value = strength;
    simPass(dropMat);
  }
  const toUV = (x, y) => [x / planeW + 0.5, y / planeH + 0.5];
  function dropWorld(x, y, r, s) { const [u, v] = toUV(x, y); dropUV(u, v, u, v, r / planeH, s * (reduce ? 0.4 : 1)); }
  function dropSeg(x0, y0, x1, y1, r, s) { const [u0, v0] = toUV(x0, y0), [u1, v1] = toUV(x1, y1); dropUV(u0, v0, u1, v1, r / planeH, s * (reduce ? 0.4 : 1)); }
  const simStep = () => { updateMat.uniforms.tex.value = rtA.texture; simPass(updateMat); };

  // ================= render targets: reflection + main (for the film pass) =================
  let reflRT = null, mainRT = null;
  function makeTargets() {
    const w = Math.max(2, Math.round(W * PR)), h = Math.max(2, Math.round(H * PR));
    if (reflRT) { reflRT.dispose(); mainRT.dispose(); }
    reflRT = new THREE.WebGLRenderTarget(Math.round(w / 2), Math.round(h / 2), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    mainRT = new THREE.WebGLRenderTarget(w, h, { samples: 4, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    waterMat.uniforms.reflTex.value = reflRT.texture;
    waterMat.uniforms.viewSize.value.set(w, h);
    postMat.uniforms.tDiffuse.value = mainRT.texture;
    postMat.uniforms.res.value.set(w, h);
  }

  // ================= surface shader =================
  let cellData = null, cellTex = null, zoneData = null, zoneTex = null, GW = 1, GH = 1;
  const BIG = 1e9;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      heightTex: { value: null }, delta: { value: new THREE.Vector2() }, L: { value: Ldir },
      paper: { value: PAPER }, letterCol: { value: LETTER }, ink: { value: new C3(0x1C1E23) }, accent: { value: ACCENT },
      planeSize: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      cellTex: { value: null }, zoneTex: { value: null }, gridO: { value: new THREE.Vector2() }, gridN: { value: new THREE.Vector2(1, 1) }, cellSize: { value: 0.3 }, ready: { value: 0 },
      hoverId: { value: -1 }, hoverA: { value: 0 }, hoverBounds: { value: new THREE.Vector2(-1e4, 1e4) }, pxW: { value: 0.03 },
      reflTex: { value: null }, viewSize: { value: new THREE.Vector2(1, 1) }, reflK: { value: 0.4 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D heightTex; uniform vec2 delta; uniform vec3 L; uniform vec3 paper; uniform vec3 letterCol; uniform vec3 ink; uniform vec3 accent;
      uniform vec2 planeSize; uniform float uTime;
      uniform sampler2D cellTex; uniform sampler2D zoneTex; uniform vec2 gridO; uniform vec2 gridN; uniform float cellSize; uniform float ready;
      uniform float hoverId; uniform float hoverA; uniform vec2 hoverBounds; uniform float pxW;
      uniform sampler2D reflTex; uniform vec2 viewSize; uniform float reflK;
      varying vec2 vUv;
      void main(){
        float h  = texture2D(heightTex, vUv).r;
        float hL = texture2D(heightTex, vUv - vec2(delta.x, 0.0)).r;
        float hR = texture2D(heightTex, vUv + vec2(delta.x, 0.0)).r;
        float hD = texture2D(heightTex, vUv - vec2(0.0, delta.y)).r;
        float hU = texture2D(heightTex, vUv + vec2(0.0, delta.y)).r;
        vec3 n = normalize(vec3((hL - hR) * 6.0, (hD - hU) * 6.0, 1.0));

        vec2 wp = (vUv - 0.5) * planeSize;
        vec2 rp = wp + n.xy * cellSize * 0.9;
        float c = cellSize;
        vec3 col = paper;

        // drafting dots on every second cell corner
        vec2 g = (rp - gridO) / (2.0 * c);
        vec2 fd = (g - floor(g + 0.5)) * 2.0 * c;
        col = mix(col, ink, (1.0 - smoothstep(c * 0.05, c * 0.08, length(fd))) * 0.18);

        if (ready > 0.5) {
          vec2 cf = (rp - gridO) / c;
          vec2 ci = floor(cf);
          if (ci.x >= 0.0 && ci.y >= 0.0 && ci.x < gridN.x && ci.y < gridN.y) {
            vec2 tuv = (ci + 0.5) / gridN;
            vec4 d = texture2D(cellTex, tuv);
            float owner = texture2D(zoneTex, tuv).r;
            vec2 cl = fract(cf) - 0.5;
            bool isL = d.x > -0.5;
            bool hidden = uTime >= d.x && uTime < d.y;
            if (isL && !hidden) col = letterCol;
            float sa = smoothstep(d.z, d.z + 0.3, uTime) * (1.0 - smoothstep(d.w, d.w + 0.3, uTime));
            float glow = uTime > d.z ? exp(-(uTime - d.z) * 4.0) : 0.0;
            if (hoverId > -0.5 && abs(owner - (hoverId + 1.0)) < 0.5) sa = max(sa, hoverA * 0.5);
            if (sa > 0.001) {
              float m = max(abs(cl.x), abs(cl.y));
              float line = smoothstep(0.41, 0.48, m);
              float lightEdge = smoothstep(0.32, 0.45, max(-cl.x, cl.y)) * (1.0 - line);
              float darkEdge = smoothstep(0.32, 0.45, max(cl.x, -cl.y)) * (1.0 - line);
              vec3 seamCol = mix(col * 0.74, accent, glow * 0.9);
              col = mix(col, seamCol, sa * line);
              col *= 1.0 - sa * 0.07 * darkEdge;
              col += sa * 0.035 * lightEdge;
            }
          }
          // hovered zone: dashed column bounds
          float onB = min(abs(wp.x - hoverBounds.x), abs(wp.x - hoverBounds.y));
          float dash = step(0.5, fract(wp.y / (c * 0.9)));
          col = mix(col, accent, hoverA * 0.55 * dash * (1.0 - smoothstep(pxW * 0.6, pxW * 1.4, onB)));
        }

        // glossy reflection of what floats above, bent by the ripples
        vec2 suv = gl_FragCoord.xy / viewSize + n.xy * 0.04;
        vec4 rf = texture2D(reflTex, suv);
        col = mix(col, rf.rgb, rf.a * reflK);

        float shade = dot(n, L) - L.z;
        col += shade * 1.1;
        vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
        float spec = pow(max(dot(n, Hh), 0.0), 80.0) - pow(Hh.z, 80.0);
        col += max(spec, 0.0) * 0.45;
        col = mix(col, col * vec3(0.92, 0.94, 1.0), clamp(-h * 4.0, 0.0, 1.0) * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMat);
  scene.add(water);
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.17, depthWrite: false }));
  shadowPlane.position.z = 0.001; shadowPlane.receiveShadow = true; shadowPlane.renderOrder = 1;
  scene.add(shadowPlane);

  // film pass: hairline chromatic fringe at the edges, faint vignette, fine grain
  const postScene = new THREE.Scene();
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: fsVert,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 res; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 cc = vUv - 0.5; float r2 = dot(cc, cc);
        vec2 off = cc * r2 * 0.005;
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        col *= 1.0 - smoothstep(0.12, 0.6, r2) * 0.07;
        col += (hash(floor(vUv * res) + fract(uTime) * 97.0) - 0.5) * 0.024;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  // ================= blocks: chamfered box, flat/glow instance attributes =================
  function chamferBox(r) {
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
    const pos = g.attributes.position, nor = g.attributes.normal, p = new V3(), n = new V3(), half = 1 / 6, inner = 0.5 - r;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const sx = Math.sign(p.x), sy = Math.sign(p.y), sz = Math.sign(p.z);
      n.set(Math.abs(p.x) > 0.3 ? sx / 3 : 0, Math.abs(p.y) > 0.3 ? sy / 3 : 0, Math.abs(p.z) > 0.3 ? sz / 3 : 0).normalize();
      pos.setXYZ(i, inner * sx + n.x * r, inner * sy + n.y * r, inner * sz + n.z * r);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    g.deleteAttribute('uv');
    return g;
  }
  const blockGeoBase = chamferBox(0.13);
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.62 });
  blockMat.onBeforeCompile = (sh) => {
    sh.uniforms.glowCol = { value: GLOW };
    sh.vertexShader = 'attribute vec2 aFx;\nvarying vec2 vFx;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFx = aFx;');
    sh.fragmentShader = 'uniform vec3 glowCol;\nvarying vec2 vFx;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vColor, vFx.x);\n  gl_FragColor.rgb += glowCol * vFx.y;\n#include <dithering_fragment>');
  };
  const blockGroup = new THREE.Group();
  scene.add(blockGroup);
  const ghostGroup = new THREE.Group();
  scene.add(ghostGroup);

  // dust
  const DUSTN = 700;
  const dustPos = new Float32Array(DUSTN * 3), dustA = new Float32Array(DUSTN), dustS = new Float32Array(DUSTN);
  const dustV = new Float32Array(DUSTN * 3), dustLife = new Float32Array(DUSTN), dustMax = new Float32Array(DUSTN);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('aA', new THREE.BufferAttribute(dustA, 1).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('aS', new THREE.BufferAttribute(dustS, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 300 }, col: { value: new C3(0x3A3D44) } },
    vertexShader: 'attribute float aA; attribute float aS; uniform float scale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 col; varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; gl_FragColor = vec4(col, vA * smoothstep(0.5, 0.15, d)); }',
    transparent: true, depthWrite: false
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustHead = 0;
  function emitDust(x, y, z, n, spread, up) {
    for (let k = 0; k < n; k++) {
      const i = dustHead; dustHead = (dustHead + 1) % DUSTN;
      dustPos[i * 3] = x + (Math.random() - 0.5) * spread; dustPos[i * 3 + 1] = y + (Math.random() - 0.5) * spread; dustPos[i * 3 + 2] = z + Math.random() * 0.05;
      const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.8;
      dustV[i * 3] = Math.cos(a) * sp; dustV[i * 3 + 1] = Math.sin(a) * sp; dustV[i * 3 + 2] = up * (0.4 + Math.random());
      dustMax[i] = 0.8 + Math.random() * 1.1; dustLife[i] = dustMax[i];
      dustS[i] = 0.03 + Math.random() * 0.07;
    }
    dustGeo.attributes.aS.needsUpdate = true;
  }

  // ================= sound (synthesised, starts on first gesture) =================
  const Sound = (function () {
    let ctx = null, master = null, noise = null, wGain = null, wFilt = null, wPan = null, lastTick = 0;
    let on = true;
    try { const s = localStorage.getItem('olpest-sound'); if (s === '0') on = false; } catch (e) {}
    function init() {
      if (ctx || !on) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
      master = ctx.createGain(); master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      wFilt = ctx.createBiquadFilter(); wFilt.type = 'bandpass'; wFilt.Q.value = 0.7; wFilt.frequency.value = 500;
      wGain = ctx.createGain(); wGain.gain.value = 0;
      src.connect(wFilt); wFilt.connect(wGain);
      if (ctx.createStereoPanner) { wPan = ctx.createStereoPanner(); wGain.connect(wPan); wPan.connect(master); } else wGain.connect(master);
      src.start();
    }
    const ok = () => ctx && on && ctx.state === 'running';
    function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
    function out(node, pan) { if (ctx.createStereoPanner && pan !== undefined) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); p.connect(master); } else node.connect(master); }
    function noiseBurst(t, dur, type, freq, q, peak, pan) {
      const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
      s.connect(f); f.connect(g); out(g, pan); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    function tone(t, type, f0, f1, dur, peak, pan, att) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); env(g, t, att || 0.005, peak, dur);
      o.connect(g); out(g, pan); o.start(t); o.stop(t + dur + 0.1);
    }
    return {
      init,
      get on() { return on; },
      toggle() {
        on = !on;
        try { localStorage.setItem('olpest-sound', on ? '1' : '0'); } catch (e) {}
        if (on) { init(); if (master) master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.05); }
        else if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        return on;
      },
      wind(speed, pan) {
        if (!ok()) return;
        const t = ctx.currentTime, g = Math.min(0.2, speed * 0.00011);
        wGain.gain.setTargetAtTime(g, t, g > wGain.gain.value ? 0.04 : 0.25);
        wFilt.frequency.setTargetAtTime(320 + Math.min(speed, 4000) * 0.45, t, 0.1);
        if (wPan) wPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
      },
      tick(pan, hi) {
        if (!ok()) return;
        const t = ctx.currentTime; if (t - lastTick < 0.022) return; lastTick = t;
        tone(t, 'sine', hi ? 2100 + Math.random() * 700 : 900 + Math.random() * 300, hi ? 1500 : 600, 0.05, 0.05, pan);
        noiseBurst(t, 0.02, 'highpass', 4000, 0.7, 0.04, pan);
      },
      crackle(n, spread) { if (!ok()) return; const t = ctx.currentTime; for (let i = 0; i < n; i++) noiseBurst(t + Math.random() * spread, 0.015 + Math.random() * 0.02, 'highpass', 2500 + Math.random() * 3000, 1, 0.035, Math.random() * 1.4 - 0.7); },
      hum(dur) { if (!ok()) return; const t = ctx.currentTime; tone(t, 'sine', 55, 110, dur, 0.22, 0, 0.12); tone(t, 'triangle', 110, 220, dur, 0.04, 0, 0.15); noiseBurst(t, dur * 0.8, 'lowpass', 500, 0.5, 0.05, 0); },
      servo(dur) { if (!ok()) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(260, t + dur * 0.5); o.frequency.linearRampToValueAtTime(170, t + dur); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.08); g.gain.setValueAtTime(0.03, t + dur - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); },
      chord() { if (!ok()) return; const t = ctx.currentTime; [196, 293.66, 440, 587.33, 880].forEach((f, i) => tone(t + i * 0.035, 'sine', f, f, 2.6 - i * 0.3, 0.05 - i * 0.006, (i - 2) * 0.25, 0.01)); tone(t, 'sine', 70, 42, 0.35, 0.3, 0); },
      slap(pan) { if (!ok()) return; const t = ctx.currentTime; noiseBurst(t, 0.22, 'lowpass', 420, 0.7, 0.16, pan); tone(t, 'sine', 90, 45, 0.25, 0.22, pan); },
      whoosh(dur) { if (!ok()) return; const t = ctx.currentTime; const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(350, t + dur); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05); }
    };
  })();

  // ================= nick rasterised into cells =================
  let glyphs = null, WC = 0, HC = 0;
  function rasterise() {
    const F = 220, CELL = 10, GAP = 3;
    const fam = document.fonts && document.fonts.check("800 220px 'Unbounded'") ? "'Unbounded'" : "'Arial Black', Arial, sans-serif";
    const cw = Math.ceil(F * 1.3), chh = Math.ceil(F * 1.5), base = Math.round(F * 1.1);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const cols = Math.floor(cw / CELL), rows = Math.floor(chh / CELL), raw = [];
    for (const letter of NICK) {
      g.clearRect(0, 0, cw, chh);
      g.font = '800 ' + F + 'px ' + fam; g.fillStyle = '#000'; g.textBaseline = 'alphabetic';
      g.fillText(letter, F * 0.1, base);
      const img = g.getImageData(0, 0, cw, chh).data, set = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let cov = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) cov += img[((r * CELL + 2 + sy * 3) * cw + c * CELL + 2 + sx * 3) * 4 + 3] / 255;
        if (cov / 9 > 0.5) set.push([c, r]);
      }
      raw.push(set);
    }
    let rMin = Infinity, rMax = -Infinity;
    for (const set of raw) for (const [, r] of set) { rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
    HC = rMax - rMin + 1;
    glyphs = []; let x = 0;
    raw.forEach((set, k) => {
      let cMin = Infinity, cMax = -Infinity;
      for (const [c] of set) { cMin = Math.min(cMin, c); cMax = Math.max(cMax, c); }
      const cells = set.map(([c, r]) => [c - cMin + x, rMax - r]);
      let y0 = Infinity, y1 = -Infinity;
      for (const [, j] of cells) { y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
      glyphs.push({ ch: NICK[k], cells, x0: x, x1: x + (cMax - cMin), y0, y1 });
      x += (cMax - cMin + 1) + GAP;
    });
    WC = x - GAP;
  }

  // ================= layout =================
  let cs = 0.3, wx0 = 0, wy0 = 0, kx = 0, ky = 0;
  const GO = new THREE.Vector2();
  let letters = [], blocks = [], mesh = null, fxAttr = null;
  const cellX = (gi) => GO.x + (gi + 0.5) * cs;
  const cellY = (gj) => GO.y + (gj + 0.5) * cs;
  const cIdx = (gi, gj) => gj * GW + gi;
  function setCell(gi, gj, ch, v) { if (gi >= 0 && gj >= 0 && gi < GW && gj < GH) cellData[cIdx(gi, gj) * 4 + ch] = v; }
  let cellDirty = false;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function buildGhost(L) {
    const set = new Set(L.cells.map(([i, j]) => i + ',' + j));
    const zF = L.zF + cs * 0.5, zB = L.zF - (L.depth - 1) * cs - cs * 0.5;
    const X = (vx) => (vx - L.lcx - 0.5) * cs, Y = (vy) => (vy - L.lcy - 0.5) * cs;
    const pos = [], seq = [], corners = new Map();
    const ang = (x, y) => (Math.atan2(y, x) / (Math.PI * 2) + 0.75) % 1;
    const addEdge = (ax, ay, bx, by, horiz) => {
      const s = ang((X(ax) + X(bx)) / 2, (Y(ay) + Y(by)) / 2) * 0.85;
      for (const z of [zF, zB]) { pos.push(X(ax), Y(ay), z, X(bx), Y(by), z); seq.push(s, s); }
      for (const [vx, vy] of [[ax, ay], [bx, by]]) { const key = vx + ',' + vy; const e = corners.get(key) || { h: 0, v: 0, vx, vy }; if (horiz) e.h++; else e.v++; corners.set(key, e); }
    };
    for (const [i, j] of L.cells) {
      if (!set.has((i - 1) + ',' + j)) addEdge(i, j, i, j + 1, false);
      if (!set.has((i + 1) + ',' + j)) addEdge(i + 1, j, i + 1, j + 1, false);
      if (!set.has(i + ',' + (j - 1))) addEdge(i, j, i + 1, j, true);
      if (!set.has(i + ',' + (j + 1))) addEdge(i, j + 1, i + 1, j + 1, true);
    }
    for (const e of corners.values()) if (e.h > 0 && e.v > 0) { const s = 0.85 + ang(X(e.vx), Y(e.vy)) * 0.15; pos.push(X(e.vx), Y(e.vy), zF, X(e.vx), Y(e.vy), zB); seq.push(s, s); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('seq', new THREE.Float32BufferAttribute(seq, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { reveal: { value: 0 }, opacity: { value: 0 }, color: { value: ACCENT } },
      vertexShader: 'attribute float seq; varying float vSeq; void main(){ vSeq = seq; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float reveal; uniform float opacity; uniform vec3 color; varying float vSeq; void main(){ if (vSeq > reveal) discard; float hot = smoothstep(reveal - 0.06, reveal, vSeq); gl_FragColor = vec4(mix(color, vec3(0.55, 0.65, 1.0), hot), opacity); }',
      transparent: true, depthWrite: false
    });
    const ls = new THREE.LineSegments(geo, mat);
    ls.visible = false; ls.frustumCulled = false;
    ghostGroup.add(ls);
    L.ghost = ls;
  }

  function layout() {
    if (!glyphs) return;
    cs = Math.min((2 * halfW * (W < H ? 0.9 : 0.8)) / WC, (2 * halfH * 0.4) / HC);
    wx0 = -WC * cs / 2; wy0 = -HC * cs / 2 + cs * 1.5;
    kx = Math.ceil((wx0 + planeW / 2) / cs); ky = Math.ceil((wy0 + planeH / 2) / cs);
    GO.set(wx0 - kx * cs, wy0 - ky * cs);
    GW = Math.ceil(planeW / cs) + 2; GH = Math.ceil(planeH / cs) + 2;

    cellData = new Float32Array(GW * GH * 4);
    for (let i = 0; i < GW * GH; i++) { cellData[i * 4] = -1; cellData[i * 4 + 1] = 0; cellData[i * 4 + 2] = BIG; cellData[i * 4 + 3] = BIG; }
    zoneData = new Float32Array(GW * GH);
    if (cellTex) { cellTex.dispose(); zoneTex.dispose(); }
    cellTex = new THREE.DataTexture(cellData, GW, GH, THREE.RGBAFormat, THREE.FloatType);
    cellTex.minFilter = cellTex.magFilter = THREE.NearestFilter;
    zoneTex = new THREE.DataTexture(zoneData, GW, GH, THREE.RedFormat, THREE.FloatType);
    zoneTex.minFilter = zoneTex.magFilter = THREE.NearestFilter;
    const u = waterMat.uniforms;
    u.cellTex.value = cellTex; u.zoneTex.value = zoneTex; u.gridO.value.copy(GO); u.gridN.value.set(GW, GH); u.cellSize.value = cs; u.ready.value = 1;
    u.pxW.value = (2 * halfW) / W;

    const bounds = [];
    for (let k = 0; k < glyphs.length - 1; k++) bounds.push((glyphs[k].x1 + glyphs[k + 1].x0) / 2);
    const portrait = W < H, vx = halfW * 0.95, vyTop = halfH * (portrait ? 0.72 : 0.86), vyBot = halfH * (portrait ? 0.4 : 0.8);
    const rnd = mulberry32(20261009);
    for (const L of letters) if (L.ghost) { ghostGroup.remove(L.ghost); L.ghost.geometry.dispose(); L.ghost.material.dispose(); }
    letters = []; blocks = [];

    glyphs.forEach((gph, k) => {
      const lcx = (gph.x0 + gph.x1) / 2, lcy = (gph.y0 + gph.y1) / 2;
      const left = k === 0 ? -Infinity : bounds[k - 1], right = k === glyphs.length - 1 ? Infinity : bounds[k];
      for (const [i, j] of gph.cells) { setCell(i + kx, j + ky, 0, BIG); zoneData[cIdx(i + kx, j + ky)] = k + 1; }
      const zone = [];
      for (let gi = 0; gi < GW; gi++) {
        const i = gi - kx, x = cellX(gi);
        if (Math.abs(x) > vx) continue;
        const inCol = i >= left + 0.5 && i <= right - 0.5;
        for (let gj = 0; gj < GH; gj++) {
          const j = gj - ky, y = cellY(gj);
          if (y > vyTop || y < -vyBot) continue;
          const above = j > HC, below = j < -1, inBand = !above && !below;
          let ok = inCol && (above || below);
          if (k === 0 && i < gph.x0 - 1.5 && inBand) ok = true;
          if (k === glyphs.length - 1 && i > gph.x1 + 1.5 && inBand) ok = true;
          if (ok) zone.push({ gi, gj, d: Math.hypot(i - lcx, (j - lcy) * 1.15) });
        }
      }
      zone.sort((a, b) => a.d - b.d);
      const A = gph.cells.length;
      const depth = Math.max(1, Math.min(3, 1 + Math.floor(zone.length / A)));
      const taken = zone.slice(0, A * (depth - 1));
      for (const t of taken) zoneData[cIdx(t.gi, t.gj)] = k + 1;

      const hL = (gph.y1 - gph.y0 + 1) * cs;
      const L = {
        k, ch: gph.ch, cells: gph.cells, lcx, lcy, x0: gph.x0, x1: gph.x1, y0: gph.y0, y1: gph.y1, depth,
        own: A, borrowed: taken.length, state: 'flat', blocks: [],
        zF: (depth - 1) / 2 * cs,
        flatX: wx0 + (lcx + 0.5) * cs, flatY: wy0 + (lcy + 0.5) * cs,
        left, right,
        C: new V3(), flatPivot: new V3(),
        pos: new V3(), rot: new Q(), qMouse: new Q(), pulse: 1, thick: 0, shade: 0, sheetVis: false,
        sP0: new V3(), sQ0: new Q(), sFromFlat: true, t0: 0, sLift0: 0, sLiftDur: 1, tTurn0: BIG, tTurnDur: 0.8, tBack0: BIG, tBackDur: 1, Tdone: BIG,
        rP0: new V3(), rQ0: new Q(), rStart: 0, rDur: 1, landT: 0, retEnd: 0,
        spin: 0, dragAngle: 0, dragVel: 0, nextDraft: 0, done: false,
        boundsX: [left === -Infinity ? -1e4 : wx0 + (left + 0.5) * cs, right === Infinity ? 1e4 : wx0 + (right + 0.5) * cs]
      };
      L.C.set(L.flatX, L.flatY, hL * 0.66 + depth * cs * 0.5);
      L.flatPivot.set(L.flatX, L.flatY, 0.004 - cs * 0.15 - L.zF);
      letters.push(L);

      const mk = (face, sgi, sgj, vi, vj, vk) => {
        const r = rnd();
        const fin = face ? GRAPHITE : (r < 0.05 ? ACCENT : r < 0.12 ? STEEL : r < 0.32 ? BONE : PORCELAIN);
        const dx = L.flatX - cellX(sgi), dy = L.flatY - cellY(sgj), dl = Math.hypot(dx, dy) || 1;
        const b = {
          L, face, id: blocks.length, sgi, sgj, vi, vj, vk,
          r1: rnd(), r2: rnd(), r3: rnd(), axis: new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
          dir: new THREE.Vector2(dx / dl, dy / dl), sweep: 0,
          mode: 'flat', fromFlat: true, start: 0, dur: 1, locked: false, landed: true,
          lift: 0, approach: 0, spin: 0, aOut: new V3(), mag: new V3(), hov: 0,
          cur: { p: new V3(), q: new Q(), s: new V3(), col: new C3() },
          flatCol: face ? LETTER : PAPER, finalCol: fin
        };
        blocks.push(b); L.blocks.push(b);
        return b;
      };
      for (const [i, j] of gph.cells) mk(true, i + kx, j + ky, i, j, 0);
      const vox = [];
      for (let vk = 1; vk < depth; vk++) for (const [i, j] of gph.cells) vox.push([i, j, vk, Math.atan2(j - lcy, i - lcx)]);
      vox.sort((a, b) => a[3] - b[3]);
      const src = taken.map((t) => ({ ...t, a: Math.atan2(t.gj - ky - lcy, t.gi - kx - lcx) })).sort((a, b) => a.a - b.a);
      for (let m = 0; m < vox.length; m++) mk(false, src[m].gi, src[m].gj, vox[m][0], vox[m][1], vox[m][2]);
      // printing order within each layer: top row first
      const body = L.blocks.filter((b) => !b.face);
      const hSpan = Math.max(1, gph.y1 - gph.y0), wSpan = Math.max(1, gph.x1 - gph.x0);
      for (const b of body) b.sweep = ((gph.y1 - b.vj) / hSpan) * 0.85 + ((b.vi - gph.x0) / wSpan) * 0.15;
      buildGhost(L);
    });

    if (mesh) { blockGroup.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }
    const geo = blockGeoBase.clone();
    fxAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, blocks.length) * 2), 2);
    fxAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFx', fxAttr);
    mesh = new THREE.InstancedMesh(geo, blockMat, Math.max(1, blocks.length));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const b of blocks) mesh.setColorAt(b.id, b.flatCol);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    blockGroup.add(mesh);
    cellTex.needsUpdate = true; zoneTex.needsUpdate = true;
    active = null;
    buildRail();
    hud.reset();
  }

  // ================= motion maths =================
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeIO = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeIOBack = (t) => { const c2 = 1.2 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; };
  const IDQ = new Q(), YAX = new V3(0, 1, 0), XAX = new V3(1, 0, 0);
  const _P0 = new V3(), _P1 = new V3(), _P2 = new V3(), _P3 = new V3(), _v = new V3(), _w = new V3(), _s = new V3(), _s2 = new V3();
  const _qa = new Q(), _qb = new Q(), _qc = new Q(), _e = new THREE.Euler();
  function bez(o, a, b, c, d, t) {
    const u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    o.set(a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3, a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3, a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3);
  }
  const flatTh = () => cs * 0.3;
  const flatPos = (b, o) => o.set(cellX(b.sgi), cellY(b.sgj), 0.004 - flatTh() / 2);
  const flatScale = (o) => o.set(cs * 0.95, cs * 0.95, flatTh());
  const voxScale = (o) => o.set(cs * 0.93, cs * 0.93, cs * 0.93);
  const local = (b, o) => o.set((b.vi - b.L.lcx) * cs, (b.vj - b.L.lcy) * cs, b.L.zF - b.vk * cs);
  function attachedPos(b, o) { return local(b, o).multiplyScalar(b.L.pulse).applyQuaternion(b.L.rot).add(b.L.pos); }

  // a body tile lifting on its far edge like a hatch, opening toward its letter
  const _pv = new V3(), _ax = new V3();
  function peelPose(b, phi, lift, op, oq) {
    flatPos(b, _w);
    const dx = b.dir.x, dy = b.dir.y, hw = cs * 0.475;
    _pv.set(_w.x - dx * hw, _w.y - dy * hw, 0.004);
    _ax.set(dy, -dx, 0);
    oq.setFromAxisAngle(_ax, phi);
    _v.set(dx * hw, dy * hw, -flatTh() / 2).applyQuaternion(oq);
    op.copy(_pv).add(_v); op.z += lift;
  }

  // sheet = the letter's own face layer moving as one rigid piece
  function computeSheet(L, now) {
    if (L.state === 'rise') {
      L.sheetVis = !(L.sFromFlat && now < L.sLift0);
      const u = clamp01((now - L.sLift0) / L.sLiftDur), e = easeIO(u);
      _P0.copy(L.sP0); _P3.copy(L.C);
      _P1.copy(_P0); _P1.z += (L.C.z - _P0.z) * 0.7;
      _P2.copy(_P3); _P2.z -= 0.6;
      bez(L.pos, _P0, _P1, _P2, _P3, e);
      _qa.slerpQuaternions(L.sQ0, IDQ, smooth(0, 0.75, u));
      const wob = Math.sin(Math.PI * u) * (reduce ? 0 : 1);
      _e.set(wob * 0.32, wob * Math.sin(u * 5) * 0.12, 0);
      _qb.setFromEuler(_e);
      _qa.premultiply(_qb);
      const turn = Math.PI * easeIO(clamp01((now - L.tTurn0) / L.tTurnDur)) + Math.PI * easeIOBack(clamp01((now - L.tBack0) / L.tBackDur));
      const w = smooth(L.Tdone, L.Tdone + 1.4, now);
      const theta = turn + L.spin + L.dragAngle;
      _qc.setFromAxisAngle(YAX, theta);
      L.rot.copy(L.qMouse).multiply(_qc).multiply(_qa);
      const kk = now - L.Tdone;
      L.pulse = kk > 0 && !reduce ? 1 + 0.03 * Math.exp(-kk * 5) * Math.sin(kk * 18) : 1;
      L.pos.z += reduce ? 0 : Math.sin(now * 1.1) * 0.09 * w;
      L.thick = smooth(0, 0.55, u); L.shade = smooth(0, 0.25, u);
    } else if (L.state === 'ret') {
      L.sheetVis = now < L.landT;
      const u = clamp01((now - L.rStart) / L.rDur), e = easeIO(u);
      _P0.copy(L.rP0); _P3.copy(L.flatPivot);
      _P1.copy(_P0); _P1.z += 0.5;
      _P2.copy(_P3); _P2.z += 1.6;
      bez(L.pos, _P0, _P1, _P2, _P3, e);
      L.rot.slerpQuaternions(L.rQ0, IDQ, smooth(0.0, 0.8, u));
      L.pulse = 1;
      L.thick = 1 - smooth(0.7, 1, u); L.shade = 1 - smooth(0.82, 1, u);
    } else { L.sheetVis = false; }
  }

  // ================= block pose =================
  const out = { p: new V3(), q: new Q(), s: new V3(), col: new C3(), flat: 0, glow: 0, vis: true };
  function hide(o) { o.vis = false; o.s.set(0, 0, 0); return o; }
  function pose(b, now, o) {
    const L = b.L;
    o.flat = 0; o.glow = 0; o.vis = true;
    if (b.face) {
      if (b.mode === 'intro') {
        if (now < b.start) return hide(o);
        const u = clamp01((now - b.start) / b.dur);
        flatPos(b, o.p); o.p.z += Math.sin(Math.PI * u) * cs * 1.3;
        o.q.setFromAxisAngle(b.axis, Math.PI * easeIO(u));
        flatScale(o.s);
        o.col.copy(u < 0.5 ? PAPER : LETTER);
        o.flat = 1 - Math.sin(Math.PI * u) * 0.9;
        return o;
      }
      if (L.state === 'flat' || !L.sheetVis) {
        if (b.hov > 0.004) {
          flatPos(b, o.p); o.p.z += b.hov; o.q.identity(); flatScale(o.s);
          o.col.copy(LETTER); o.flat = 1 - Math.min(1, b.hov / (cs * 0.4)) * 0.85;
          return o;
        }
        return hide(o);
      }
      attachedPos(b, o.p).add(b.mag);
      o.q.copy(L.rot);
      o.s.lerpVectors(flatScale(_s), voxScale(_s2), L.thick);
      o.col.copy(LETTER).lerp(b.finalCol, L.thick);
      o.flat = 1 - L.shade;
      if (L.state === 'rise' && now > L.Tdone) {
        const sw = (now - L.Tdone) / 0.9, yn = (b.vj - L.y0) / Math.max(1, L.y1 - L.y0);
        o.glow = Math.exp(-Math.pow((1.15 - sw * 1.3) - yn, 2) * 60) * 0.7 * (sw < 1.4 ? 1 : 0);
      }
      return o;
    }
    // body block
    if (b.mode === 'flat') return hide(o);
    if (b.mode === 'rise') {
      if (now < b.start) {
        if (b.fromFlat) return hide(o);
        o.p.copy(b.cur.p); o.q.copy(b.cur.q); o.s.copy(b.cur.s); o.col.copy(b.cur.col); return o;
      }
      const u = (now - b.start) / b.dur;
      if (u >= 1) {
        attachedPos(b, o.p).add(b.mag); o.q.copy(L.rot); voxScale(o.s); o.col.copy(b.finalCol);
        o.glow = Math.exp(-(now - b.start - b.dur) * 7) * 0.85;
        return o;
      }
      const pf = b.fromFlat ? 0.24 : 0, df = 0.2;
      if (u < pf) {
        const v = u / pf;
        peelPose(b, 1.65 * easeOut(v), Math.pow(v, 2) * cs * 0.9, o.p, o.q);
        o.s.lerpVectors(flatScale(_s), voxScale(_s2), v * 0.5);
        o.col.copy(PAPER).lerp(b.finalCol, v * 0.4);
        o.flat = 1 - smooth(0, 0.5, v);
        return o;
      }
      // dock start: behind the letter (local -z), in the letter's current frame
      local(b, _w); _w.z -= b.approach;
      _P3.copy(_w).multiplyScalar(L.pulse).applyQuaternion(L.rot).add(L.pos);
      if (u < 1 - df) {
        const v = (u - pf) / (1 - pf - df), e = easeIO(v);
        if (b.fromFlat) peelPose(b, 1.65, cs * 0.9, _P0, _qa); else { _P0.copy(b.cur.p); _qa.copy(b.cur.q); }
        _P1.copy(_P0); _P1.z += b.lift; _P1.x += b.dir.x * 0.6; _P1.y += b.dir.y * 0.6;
        _v.set(0, 0, -b.approach * 1.2).applyQuaternion(L.rot);
        _P2.copy(_P3).add(_v);
        bez(o.p, _P0, _P1, _P2, _P3, e);
        _qb.slerpQuaternions(_qa, L.rot, smooth(0.1, 0.9, v));
        _qc.setFromAxisAngle(b.axis, Math.sin(Math.PI * v) * b.spin);
        o.q.multiplyQuaternions(_qc, _qb);
        if (b.fromFlat) o.s.lerpVectors(flatScale(_s), voxScale(_s2), 0.5 + 0.5 * smooth(0, 0.5, v)); else o.s.lerpVectors(b.cur.s, voxScale(_s2), smooth(0, 0.5, v));
        o.col.copy(b.fromFlat ? PAPER : b.cur.col).lerp(b.finalCol, b.fromFlat ? 0.4 + 0.6 * smooth(0, 0.5, v) : smooth(0, 0.5, v));
        return o;
      }
      const v = (u - (1 - df)) / df;
      attachedPos(b, _P0);
      o.p.lerpVectors(_P3, _P0, easeOutBack(v));
      o.q.copy(L.rot); voxScale(o.s); o.col.copy(b.finalCol);
      return o;
    }
    // 'ret' — back to its own cell
    if (now < b.start) { o.p.copy(b.cur.p); o.q.copy(b.cur.q); o.s.copy(b.cur.s); o.col.copy(b.cur.col); return o; }
    const u = (now - b.start) / b.dur;
    if (u >= 1) return hide(o);
    const e = easeIO(u);
    _P0.copy(b.cur.p); _P1.copy(b.cur.p).add(b.aOut);
    flatPos(b, _P3); _P2.copy(_P3); _P2.z += 1.2 + b.r3 * 1.4;
    bez(o.p, _P0, _P1, _P2, _P3, e);
    _qb.slerpQuaternions(b.cur.q, IDQ, smooth(0.1, 0.92, u));
    _qc.setFromAxisAngle(b.axis, Math.sin(Math.PI * u) * (reduce ? 0 : 1.4));
    o.q.multiplyQuaternions(_qc, _qb);
    o.s.lerpVectors(b.cur.s, flatScale(_s), smooth(0.3, 1, u));
    o.col.copy(b.cur.col).lerp(PAPER, smooth(0.5, 0.95, u));
    o.flat = smooth(0.8, 1, u);
    return o;
  }

  // ================= choreography =================
  let active = null, introDone = false, introT0 = 0, introEnd = 0;
  const events = [];
  const schedule = (t, fn) => events.push({ t, fn });

  function intro(now) {
    introT0 = now + 0.4;
    const sweep = 2.6 * K;
    const xs = -halfW * 1.1, xe = halfW * 1.1;
    let end = 0;
    for (const L of letters) for (const b of L.blocks) {
      if (!b.face) continue;
      const x = cellX(b.sgi), y = cellY(b.sgj);
      b.mode = 'intro';
      b.start = introT0 + ((x - xs) / (xe - xs)) * sweep + Math.abs(y - introPathY(x)) / cs * 0.012 + b.r1 * 0.08;
      b.dur = 0.6 * K;
      b.axis.set(0.15 * (b.r2 - 0.5), 1, 0).normalize();
      setCell(b.sgi, b.sgj, 0, 0); setCell(b.sgi, b.sgj, 1, b.start + b.dur);
      end = Math.max(end, b.start + b.dur);
    }
    cellDirty = true;
    introEnd = end;
    craft.on = true; craft.t0 = introT0 - 0.25; craft.dur = sweep + 0.5; craft.xs = xs - 2; craft.xe = xe + 2; craft.last = null;
  }
  const introPathY = (x) => letters.length ? (wy0 + HC * cs * 0.5) + Math.sin(x * 0.18) * cs * 4 : 0;
  const craft = { on: false, t0: 0, dur: 1, xs: 0, xe: 0, last: null };

  function rise(L, now, delay, clickX, clickY) {
    const t0 = now + delay;
    // sheet start: the floor, or wherever it was caught mid-return
    if (L.state === 'ret' && now < L.landT) { computeSheet(L, now); L.sP0.copy(L.pos); L.sQ0.copy(L.rot); L.sFromFlat = false; }
    else { L.sP0.copy(L.flatPivot); L.sQ0.identity(); L.sFromFlat = true; }
    L.state = 'rise'; L.done = false; L.t0 = t0; L.spin = 0; L.dragAngle = 0; L.dragVel = 0; L.qMouse.identity();
    const span = Math.max(L.x1 - L.x0, L.y1 - L.y0) + 1;
    L.sLift0 = t0 + (L.sFromFlat ? 0.45 : 0.1) * K;
    L.sLiftDur = 1.05 * K;
    L.tTurn0 = L.sLift0 + 0.8 * K; L.tTurnDur = 0.85 * K;
    const bodyBase = L.sLift0 + 0.55 * K;
    let lastDock = L.tTurn0 + L.tTurnDur;
    for (const b of L.blocks) {
      if (b.face) {
        const dClick = Math.hypot(cellX(b.sgi) - clickX, cellY(b.sgj) - clickY) / cs;
        if (L.sFromFlat) {
          setCell(b.sgi, b.sgj, 0, L.sLift0); setCell(b.sgi, b.sgj, 1, BIG);
          setCell(b.sgi, b.sgj, 2, t0 + Math.min(dClick, 80) * 0.006 * K); setCell(b.sgi, b.sgj, 3, L.sLift0);
        } else { setCell(b.sgi, b.sgj, 0, 0); setCell(b.sgi, b.sgj, 1, BIG); setCell(b.sgi, b.sgj, 2, BIG); }
        b.mag.set(0, 0, 0);
        continue;
      }
      const landedHome = b.mode === 'flat' || (b.mode === 'ret' && now >= b.start + b.dur);
      if (!landedHome) {
        pose(b, now, out); b.cur.p.copy(out.p); b.cur.q.copy(out.q); b.cur.s.copy(out.s); b.cur.col.copy(out.col);
      }
      b.fromFlat = landedHome;
      b.mode = 'rise'; b.locked = false; b.mag.set(0, 0, 0);
      b.start = landedHome ? bodyBase + (b.vk - 1) * 0.38 * K + b.sweep * 0.95 * K + b.r1 * 0.12 * K : t0 + 0.3 * K + b.r1 * 0.35 * K;
      b.dur = (1.3 + b.r2 * 0.25) * K;
      b.lift = 0.9 + b.r3 * 1.6;
      b.approach = cs * (3 + b.r1 * 5);
      b.spin = reduce ? 0 : 1.0 + b.r2 * 2.2;
      if (landedHome) {
        const dClick = Math.hypot(cellX(b.sgi) - clickX, cellY(b.sgj) - clickY) / cs;
        setCell(b.sgi, b.sgj, 2, t0 + Math.min(dClick, 80) * 0.006 * K); setCell(b.sgi, b.sgj, 3, b.start);
      } else { setCell(b.sgi, b.sgj, 2, BIG); setCell(b.sgi, b.sgj, 3, BIG); }
      lastDock = Math.max(lastDock, b.start + b.dur);
    }
    cellDirty = true;
    L.tBack0 = lastDock + 0.15 * K; L.tBackDur = 1.05 * K;
    L.Tdone = L.tBack0 + L.tBackDur;
    if (!L.sFromFlat) { /* keep it simple: the full turn sequence still plays */ }

    // sounds, ripples, dust along the timeline
    Sound.crackle(14, 0.5 * K);
    schedule(L.sLift0, () => {
      Sound.hum(1.1 * K);
      if (L.sFromFlat) {
        dropWorld(L.flatX, L.flatY, (L.y1 - L.y0) * cs * 0.55, -0.06);
        for (const [i, j] of L.cells) if (Math.random() < 0.45) emitDust(cellX(i + kx), cellY(j + ky), 0.02, 1, cs, 1);
      }
    });
    schedule(L.tTurn0, () => Sound.servo(L.tTurnDur));
    schedule(L.tBack0, () => Sound.servo(L.tBackDur));
    schedule(L.Tdone, () => { Sound.chord(); dropWorld(L.C.x, L.C.y, (L.y1 - L.y0) * cs * 0.5, -0.04); L.done = true; L.nextDraft = L.Tdone + 1.2; waves.push({ x: L.flatX, y: L.flatY, t0: clock() }); });
    active = L;
  }

  function sendHome(L, now) {
    computeSheet(L, now);
    const sheetLifted = !(L.sFromFlat && now < L.sLift0) || L.state === 'ret';
    let end = now, bodyOut = false;
    for (const b of L.blocks) {
      if (b.face) continue;
      if (b.mode === 'flat') continue;
      if (b.mode === 'ret' && now >= b.start + b.dur) { b.mode = 'flat'; continue; }
      if (b.mode === 'rise' && b.fromFlat && now < b.start) { b.mode = 'flat'; setCell(b.sgi, b.sgj, 3, now); continue; }
      pose(b, now, out); b.cur.p.copy(out.p); b.cur.q.copy(out.q); b.cur.s.copy(out.s); b.cur.col.copy(out.col);
      b.mode = 'ret'; b.landed = false; b.mag.set(0, 0, 0);
      b.start = now + ((L.depth - 1 - b.vk) * 0.22 + (1 - b.sweep) * 0.45 + b.r2 * 0.12) * K;
      b.dur = (0.95 + b.r3 * 0.3) * K;
      _v.set(0, 0, -1).applyQuaternion(L.rot).multiplyScalar(0.8 + b.r1 * 0.9);
      b.aOut.copy(_v);
      const land = b.start + b.dur;
      setCell(b.sgi, b.sgj, 2, land - 0.3); setCell(b.sgi, b.sgj, 3, land + 0.2);
      end = Math.max(end, land); bodyOut = true;
    }
    if (sheetLifted) {
      L.rP0.copy(L.pos); L.rQ0.copy(L.rot);
      L.rStart = now + (bodyOut ? 0.6 : 0.05) * K; L.rDur = 1.15 * K; L.landT = L.rStart + L.rDur;
      for (const b of L.blocks) if (b.face) { setCell(b.sgi, b.sgj, 1, L.landT); setCell(b.sgi, b.sgj, 2, L.landT - 0.3); setCell(b.sgi, b.sgj, 3, L.landT + 0.2); b.mag.set(0, 0, 0); }
      end = Math.max(end, L.landT);
      schedule(L.landT - 0.02, () => { Sound.slap(L.flatX / halfW); waves.push({ x: L.flatX, y: L.flatY, t0: clock() + 0.05 }); dropWorld(L.flatX, L.flatY, (L.y1 - L.y0) * cs * 0.6, 0.07); for (const [i, j] of L.cells) if (Math.random() < 0.3) emitDust(cellX(i + kx), cellY(j + ky), 0.02, 1, cs, 0.6); });
    } else {
      for (const b of L.blocks) if (b.face) { setCell(b.sgi, b.sgj, 0, BIG); setCell(b.sgi, b.sgj, 3, now); }
      L.landT = now;
    }
    cellDirty = true;
    L.state = 'ret'; L.retEnd = end; L.done = false;
    Sound.whoosh(0.9 * K);
    if (active === L) active = null;
  }

  function activate(k, wx, wy) {
    if (!letters.length || !introDone) { dropWorld(wx, wy, 0.8, -0.03); return; }
    const L = letters[k], now = clock();
    if (active === L) { dropWorld(wx, wy, 0.8, -0.03); return; }
    let delay = 0;
    if (active) { sendHome(active, now); delay = 0.35 * K; }
    dropWorld(wx, wy, 1.2, -0.05);
    rise(L, now, delay, wx, wy);
    hint.classList.add('dim');
    collapseBtn.disabled = false;
  }
  function returnActive() { if (active) { sendHome(active, clock()); collapseBtn.disabled = true; } }

  function columnAt(wx) {
    if (!glyphs) return -1;
    const i = (wx - wx0) / cs - 0.5;
    for (let k = 0; k < glyphs.length - 1; k++) if (i < (glyphs[k].x1 + glyphs[k + 1].x0) / 2) return k;
    return glyphs.length - 1;
  }

  // ================= HUD =================
  const $ = (id) => document.getElementById(id);
  const coordsEl = $('coords'), statusEl = $('status'), hint = $('hint'), collapseBtn = $('collapseBtn');
  const sItem = $('sItem'), sBlocks = $('sBlocks'), sDepth = $('sDepth'), sFlying = $('sFlying'), sTime = $('sTime'), sProg = $('sProg');
  const retTag = $('retTag'), reticle = $('reticle'), rail = $('rail'), soundBtn = $('soundBtn');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
  const pad = (v) => (v < 0 ? '−' : '+') + Math.abs(v * 10).toFixed(1).padStart(5, '0');
  const cache = {};
  const put = (el, key, v) => { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } };
  const hud = {
    reset() {
      const total = letters.reduce((s, L) => s + L.own, 0);
      put(sItem, 'item', '—');
      put(sBlocks, 'blocks', total + ' в нике');
      put(sDepth, 'depth', '—'); put(sTime, 'time', '—');
    },
    letter(L) {
      put(sItem, 'item', '«' + L.ch + '»');
      put(sBlocks, 'blocks', (L.own + L.borrowed) + ' = ' + L.own + ' + ' + L.borrowed);
      put(sDepth, 'depth', L.depth + ' ' + plural(L.depth, 'слой', 'слоя', 'слоёв'));
    }
  };
  function buildRail() {
    rail.innerHTML = '';
    letters.forEach((L, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = L.ch; b.setAttribute('aria-label', 'Поднять букву ' + L.ch);
      b.addEventListener('click', (e) => { e.stopPropagation(); Sound.init(); activate(k, L.flatX, L.flatY); });
      b.addEventListener('pointerenter', () => { railHover = k; });
      b.addEventListener('pointerleave', () => { railHover = -1; });
      rail.appendChild(b);
    });
  }
  let railHover = -1;
  collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); Sound.init(); returnActive(); });
  soundBtn.setAttribute('aria-pressed', String(Sound.on));
  soundBtn.addEventListener('click', (e) => { e.stopPropagation(); const on = Sound.toggle(); soundBtn.setAttribute('aria-pressed', String(on)); });

  // CAD dimensions for the raised letter
  const SVGNS = 'http://www.w3.org/2000/svg';
  const dims = $('dims');
  const mkEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); dims.appendChild(e); return e; };
  const dimEls = {
    h: mkEl('line', {}), hT1: mkEl('line', {}), hT2: mkEl('line', {}), hTxt: mkEl('text', { 'text-anchor': 'end' }),
    w: mkEl('line', {}), wT1: mkEl('line', {}), wT2: mkEl('line', {}), wTxt: mkEl('text', { 'text-anchor': 'middle' }),
    d: mkEl('line', {}), dTxt: mkEl('text', {}),
    lead: mkEl('line', {}), lead2: mkEl('line', {}), leadTxt: mkEl('text', { class: 'lbl' }), leadTxt2: mkEl('text', {})
  };
  let dimsOpacity = 0;
  const _pr = new V3();
  function scr(L, lx, ly, lz) {
    _pr.set(lx, ly, lz).multiplyScalar(L.pulse).applyQuaternion(L.rot).add(L.pos).project(camera);
    return [(_pr.x + 1) / 2 * W, (1 - _pr.y) / 2 * H];
  }
  const setLine = (el, a, b) => { el.setAttribute('x1', a[0].toFixed(1)); el.setAttribute('y1', a[1].toFixed(1)); el.setAttribute('x2', b[0].toFixed(1)); el.setAttribute('y2', b[1].toFixed(1)); };
  const setText = (el, p, s, dx, dy) => { el.setAttribute('x', (p[0] + (dx || 0)).toFixed(1)); el.setAttribute('y', (p[1] + (dy || 0)).toFixed(1)); if (el.textContent !== s) el.textContent = s; };
  function updateDims(now, dt) {
    const L = active;
    const target = L && L.state === 'rise' && now > L.sLift0 + 0.5 * K ? (L.done ? 0.6 : 1) : 0;
    dimsOpacity += (target - dimsOpacity) * (1 - Math.exp(-dt * 5));
    dims.style.opacity = dimsOpacity.toFixed(3);
    if (dimsOpacity < 0.01 || !L) return;
    const minX = (L.x0 - L.lcx - 0.5) * cs, maxX = (L.x1 - L.lcx + 0.5) * cs, minY = (L.y0 - L.lcy - 0.5) * cs, maxY = (L.y1 - L.lcy + 0.5) * cs;
    const zf = L.zF + cs * 0.5, zb = L.zF - (L.depth - 1) * cs - cs * 0.5, off = cs * 1.6;
    const h1 = scr(L, minX - off, minY, zf), h2 = scr(L, minX - off, maxY, zf);
    setLine(dimEls.h, h1, h2); setLine(dimEls.hT1, scr(L, minX - off * 1.3, minY, zf), scr(L, minX - cs * 0.3, minY, zf)); setLine(dimEls.hT2, scr(L, minX - off * 1.3, maxY, zf), scr(L, minX - cs * 0.3, maxY, zf));
    setText(dimEls.hTxt, [(h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2], 'h ' + (L.y1 - L.y0 + 1), -8, 3);
    const w1 = scr(L, minX, minY - off, zf), w2 = scr(L, maxX, minY - off, zf);
    setLine(dimEls.w, w1, w2); setLine(dimEls.wT1, scr(L, minX, minY - off * 1.3, zf), scr(L, minX, minY - cs * 0.3, zf)); setLine(dimEls.wT2, scr(L, maxX, minY - off * 1.3, zf), scr(L, maxX, minY - cs * 0.3, zf));
    setText(dimEls.wTxt, [(w1[0] + w2[0]) / 2, (w1[1] + w2[1]) / 2], 'w ' + (L.x1 - L.x0 + 1), 0, 14);
    const d1 = scr(L, maxX + off * 0.6, maxY, zf), d2 = scr(L, maxX + off * 0.6, maxY, zb);
    setLine(dimEls.d, d1, d2); setText(dimEls.dTxt, d1, 'd ' + L.depth, 6, -4);
    const narrow = W < 600;
    for (const el of [dimEls.lead, dimEls.lead2, dimEls.leadTxt, dimEls.leadTxt2]) el.style.display = narrow ? 'none' : '';
    const flip = scr(L, maxX, maxY, zf)[0] + 230 > W;
    const a = flip ? scr(L, minX, maxY, zf) : scr(L, maxX, maxY, zf), sg = flip ? -1 : 1;
    const b = [a[0] + 46 * sg, Math.max(40, a[1] - 46)], c = [b[0] + 150 * sg, b[1]];
    setLine(dimEls.lead, a, b); setLine(dimEls.lead2, b, c);
    for (const el of [dimEls.leadTxt, dimEls.leadTxt2]) el.setAttribute('text-anchor', flip ? 'end' : 'start');
    setText(dimEls.leadTxt, b, '«' + L.ch + '» · ' + (L.own + L.borrowed) + ' ' + plural(L.own + L.borrowed, 'блок', 'блока', 'блоков'), 4 * sg, -6);
    setText(dimEls.leadTxt2, b, L.own + ' из буквы + ' + L.borrowed + ' из зоны', 4 * sg, 12);
  }

  // ================= input =================
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  const mouse = { x: 0, y: 0, u: 0.5, v: 0.5, lu: null, lv: null, inside: false, moved: false, px: 0, py: 0, speed: 0 };
  const drag = { down: false, dragging: false, sx: 0, sy: 0, lx: 0, id: -1 };
  function pointerNDC(e) {
    const r = stage.getBoundingClientRect();
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top;
    ndc.set((mouse.px / r.width) * 2 - 1, -(mouse.py / r.height) * 2 + 1);
    reticle.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
  }
  function pointerWorld() {
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction, t = d.z !== 0 ? -o.z / d.z : 0;
    mouse.x = o.x + d.x * t; mouse.y = o.y + d.y * t;
    [mouse.u, mouse.v] = toUV(mouse.x, mouse.y);
  }
  stage.addEventListener('pointerenter', (e) => { pointerNDC(e); pointerWorld(); mouse.lu = mouse.u; mouse.lv = mouse.v; mouse.inside = true; reticle.classList.add('show'); });
  stage.addEventListener('pointermove', (e) => {
    pointerNDC(e); mouse.moved = true; lastInput = clock();
    if (!mouse.inside) { pointerWorld(); mouse.lu = mouse.u; mouse.lv = mouse.v; mouse.inside = true; reticle.classList.add('show'); }
    if (drag.down) {
      const dx = e.clientX - drag.lx; drag.lx = e.clientX;
      if (!drag.dragging && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.dragging = true;
      if (drag.dragging && active && active.done) { active.dragAngle += dx * 0.009; active.dragVel = dx * 0.009; }
    }
  });
  stage.addEventListener('pointerleave', () => { mouse.inside = false; mouse.lu = null; reticle.classList.remove('show'); });
  stage.addEventListener('pointerdown', (e) => {
    Sound.init();
    drag.down = true; drag.dragging = false; drag.sx = drag.lx = e.clientX; drag.sy = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    reticle.classList.add('down');
  });
  stage.addEventListener('pointerup', (e) => {
    reticle.classList.remove('down');
    if (!drag.down) return;
    drag.down = false;
    if (!drag.dragging) {
      pointerNDC(e); pointerWorld();
      const k = columnAt(mouse.x);
      if (k >= 0) activate(k, mouse.x, mouse.y);
    }
    drag.dragging = false;
    stage.focus({ preventScroll: true });
  });
  stage.addEventListener('pointercancel', () => { drag.down = false; drag.dragging = false; reticle.classList.remove('down'); });
  stage.addEventListener('keydown', (e) => {
    Sound.init(); lastInput = clock();
    const key = e.key.toLowerCase();
    const k = NICK.indexOf(key), dk = '123456'.indexOf(key), pick = k >= 0 ? k : dk;
    if (pick >= 0 && letters[pick]) { e.preventDefault(); activate(pick, letters[pick].flatX, letters[pick].flatY); }
    if (e.key === 'Escape') returnActive();
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && active && active.done) { e.preventDefault(); active.dragVel += e.key === 'ArrowLeft' ? -0.06 : 0.06; }
  });

  // ================= resize =================
  function resize() {
    W = stage.clientWidth || window.innerWidth; H = stage.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    halfH = D * Math.tan(THREE.MathUtils.degToRad(FOV / 2)); halfW = halfH * camera.aspect;
    planeW = 2 * halfW * PLANE_K; planeH = 2 * halfH * PLANE_K;
    water.scale.set(planeW, planeH, 1); shadowPlane.scale.set(planeW, planeH, 1);
    waterMat.uniforms.planeSize.value.set(planeW, planeH);
    const ext = Math.max(halfW, halfH) * 1.5, sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
    dims.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    dustMat.uniforms.scale.value = H * PR * 0.9;
    makeSim(); makeTargets();
    events.length = 0;
    if (glyphs) { layout(); for (const L of letters) for (const b of L.blocks) if (b.face) { /* stay flat after a resize */ } introDone = true; }
  }
  let rzT = 0, firstSize = true;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 150); });

  // ================= loop =================
  let simTime = 0, lastReal = performance.now(), frame = 0;
  const clock = () => simTime;
  resize();
  const fontReady = (document.fonts && document.fonts.load)
    ? Promise.race([document.fonts.load("800 220px 'Unbounded'"), new Promise((r) => setTimeout(r, 3000))])
    : Promise.resolve();
  fontReady.catch(() => {}).then(() => { rasterise(); layout(); intro(clock()); });

  const M = new THREE.Matrix4();
  let tilt = 0, parX = 0, parY = 0, hoverA = 0, hoverId = -1, lastHoverBounds = [-1e4, 1e4];
  const focus = { x: 0, y: 0, z: 0, d: 1 };
  let lastInput = 0;
  const waves = []; // tile waves rolling across the flat word: { x, y, t0 }
  let lockCount = 0, landCount = 0;

  function tick() {
    const realNow = performance.now();
    const dt = Math.min(0.05, (realNow - lastReal) / 1000);
    lastReal = realNow; simTime += dt; frame++;
    const now = simTime;

    // camera: flat sheet → perspective while a letter is up or travelling
    const anyMoving = letters.some((L) => L.state !== 'flat');
    tilt += ((anyMoving ? 1 : 0) - tilt) * (1 - Math.exp(-dt * (reduce ? 6 : 2.0)));
    const te = tilt * tilt * (3 - 2 * tilt), a = te * (reduce ? 0.2 : 0.42);
    // focus: dolly in on the raised letter so it becomes the hero of the frame
    const kf = 1 - Math.exp(-dt * 1.6);
    focus.x += ((active ? active.flatX * 0.95 : 0) - focus.x) * kf;
    focus.y += ((active ? active.flatY * 0.95 : 0) - focus.y) * kf;
    focus.z += ((active ? active.C.z * 0.45 : 0) - focus.z) * kf;
    const wantD = active ? Math.max(0.28, Math.min(0.8, ((active.y1 - active.y0 + 1) * cs) / (0.46 * 2 * Math.tan(FOV * Math.PI / 360)) / D)) : 1;
    focus.d += ((reduce && active ? Math.max(wantD, 0.8) : wantD) - focus.d) * kf;
    const Dz = D * focus.d;
    const ptx = mouse.inside && !reduce ? ndc.x * 0.9 * te : 0, pty = mouse.inside && !reduce ? ndc.y * 0.6 * te : 0;
    parX += (ptx - parX) * (1 - Math.exp(-dt * 3)); parY += (pty - parY) * (1 - Math.exp(-dt * 3));
    camera.position.set(focus.x + parX, focus.y - Dz * Math.sin(a) + parY, focus.z + Dz * Math.cos(a));
    camera.lookAt(focus.x, focus.y, focus.z);
    camera.updateMatrixWorld();

    // cursor wake
    if (mouse.inside) {
      pointerWorld();
      if (mouse.moved && mouse.lu !== null) {
        const dx = (mouse.u - mouse.lu) * (planeW / planeH), dy = mouse.v - mouse.lv, dist = Math.hypot(dx, dy);
        if (dist > 0.0003 && dist < 0.15) dropUV(mouse.lu, mouse.lv, mouse.u, mouse.v, 0.3 / planeH, -Math.min(dist * 3.4, 0.03) * (reduce ? 0.35 : 1));
        mouse.speed = dist * planeH / Math.max(dt, 1e-3) * (H / (2 * halfH));
      } else mouse.speed *= 0.8;
      mouse.lu = mouse.u; mouse.lv = mouse.v; mouse.moved = false;
      const kz = columnAt(mouse.x), z = kz >= 0 ? NICK[kz] : '—';
      const s = 'зона <i>' + z + '</i>   x <i>' + pad(mouse.x) + '</i>   y <i>' + pad(mouse.y) + '</i>';
      if (cache.coords !== s) { cache.coords = s; coordsEl.innerHTML = s; }
      put(retTag, 'tag', kz >= 0 ? z : '');
    } else mouse.speed *= 0.8;
    Sound.wind(mouse.speed, ndc.x);

    // intro craft: an unseen plane skimming the surface
    if (craft.on) {
      const u = (now - craft.t0) / craft.dur;
      if (u >= 0 && u <= 1) {
        const x = craft.xs + (craft.xe - craft.xs) * u, y = introPathY(x);
        if (craft.last) dropSeg(craft.last[0], craft.last[1], x, y, 0.45, -0.032);
        craft.last = [x, y];
      }
      if (u > 1) craft.on = false;
    }
    if (introDone && !craft.on && !active && !letters.some((L) => L.state !== 'flat') && now - lastInput > 22 && !reduce) {
      lastInput = now;
      const dirR = Math.random() < 0.5;
      craft.on = true; craft.t0 = now; craft.dur = 3.2; craft.xs = (dirR ? -1 : 1) * halfW * 1.3; craft.xe = -craft.xs; craft.last = null;
    }
    if (!introDone && letters.length && now > introEnd) {
      introDone = true;
      for (const L of letters) for (const b of L.blocks) if (b.face && b.mode === 'intro') b.mode = 'flat';
    }

    for (let i = events.length - 1; i >= 0; i--) if (now >= events[i].t) { const ev = events[i]; events.splice(i, 1); ev.fn(); }
    simStep(); simStep();

    // letters
    for (const L of letters) {
      if (L.state === 'rise' && L.done) {
        if (!drag.dragging) { L.dragAngle += L.dragVel; L.dragVel *= Math.pow(0.93, dt * 60); }
        const w = smooth(L.Tdone, L.Tdone + 1.4, now);
        L.spin += dt * (reduce ? 0.05 : 0.24) * w * (drag.dragging ? 0 : 1);
        const mx = mouse.inside ? Math.max(-1, Math.min(1, (mouse.x - L.C.x) / halfW)) : 0;
        const my = mouse.inside ? Math.max(-1, Math.min(1, (mouse.y - L.C.y) / halfH)) : 0;
        _e.set(-my * 0.3 * w, mx * 0.3 * w, 0); _qb.setFromEuler(_e);
        L.qMouse.slerp(_qb, 1 - Math.pow(0.03, dt));
        if (now > L.nextDraft) { L.nextDraft = now + 1.5; dropWorld(L.C.x, L.C.y, (L.y1 - L.y0) * cs * 0.32, -0.018); }
      }
      if (L.state === 'ret' && now > L.retEnd + 0.05) {
        L.state = 'flat';
        for (const b of L.blocks) if (!b.face) b.mode = 'flat';
      }
      computeSheet(L, now);
    }

    // hover: zone preview + letter tiles lifting like keys
    let hk = railHover;
    if (hk < 0 && mouse.inside && introDone && !drag.dragging) hk = columnAt(mouse.x);
    if (hk >= 0 && letters[hk] && letters[hk].state !== 'flat') hk = -1;
    if (hk !== hoverId && hk >= 0) { hoverId = hk; lastHoverBounds = letters[hk].boundsX; }
    hoverA += ((hk >= 0 ? 1 : 0) - hoverA) * (1 - Math.exp(-dt * 8));
    if (hoverA < 0.01 && hk < 0) hoverId = -1;
    const wu = waterMat.uniforms;
    wu.hoverId.value = hoverId; wu.hoverA.value = hoverA; wu.hoverBounds.value.set(lastHoverBounds[0], lastHoverBounds[1]);
    Array.prototype.forEach.call(rail.children, (el, k) => {
      const L = letters[k]; if (!L) return;
      el.classList.toggle('on', L === active);
      el.classList.toggle('hover', k === hoverId && hoverA > 0.5);
    });

    // blocks
    const ro = ray.ray.origin, rd = ray.ray.direction;
    const magOn = mouse.inside && active && active.done && !drag.dragging && !reduce;
    const magR = cs * 5;
    let flying = 0, locksNow = 0, landsNow = 0;
    const kd = 1 - Math.exp(-dt * 10);
    if (mesh) {
      const fx = fxAttr.array;
      for (const b of blocks) {
        const L = b.L;
        // key-lift of flat letter tiles under the cursor
        if (b.face) {
          let tgt = 0;
          if (introDone && L.state === 'flat' && !reduce) {
            const bx = cellX(b.sgi), by = cellY(b.sgj);
            if (mouse.inside) {
              const d = Math.hypot(bx - mouse.x, by - mouse.y), R = cs * 3.4;
              if (d < R) tgt = Math.pow(1 - d / R, 2) * cs * 0.55;
            }
            for (const wv of waves) {
              const age = now - wv.t0; if (age < 0) continue;
              const d = Math.hypot(bx - wv.x, by - wv.y), front = age * cs * 34;
              tgt = Math.max(tgt, Math.exp(-Math.pow((d - front) / (cs * 2.2), 2)) * cs * 0.7 * Math.exp(-age * 0.9));
            }
          }
          b.hov += (tgt - b.hov) * (1 - Math.exp(-dt * 16));
        }
        pose(b, now, out);
        // magnetic give under the cursor once the letter is assembled
        if (b.L === active && magOn && out.vis) {
          _v.copy(out.p).sub(ro); const t = _v.dot(rd); _w.copy(rd).multiplyScalar(t).add(ro);
          _v.copy(out.p).sub(_w); const dd = _v.length();
          if (dd < magR && dd > 1e-5) _v.multiplyScalar(Math.pow(1 - dd / magR, 2) * cs * 1.3 / dd); else _v.set(0, 0, 0);
          b.mag.lerp(_v, kd);
        } else if (b.mag.lengthSq() > 1e-8) b.mag.multiplyScalar(1 - kd);
        M.compose(out.p, out.q, out.s);
        mesh.setMatrixAt(b.id, M);
        mesh.setColorAt(b.id, out.col);
        fx[b.id * 2] = out.flat; fx[b.id * 2 + 1] = out.glow;
        if (!b.face) {
          if (b.mode === 'rise' && now >= b.start && now < b.start + b.dur) flying++;
          if (b.mode === 'ret' && now >= b.start && now < b.start + b.dur) flying++;
          if (b.mode === 'rise' && !b.locked && now >= b.start + b.dur) { b.locked = true; locksNow++; if (locksNow < 3) Sound.tick(out.p.x / halfW, true); }
          if (b.mode === 'rise' && b.fromFlat && now >= b.start && !b.peeled) { b.peeled = true; if (Math.random() < 0.35) emitDust(cellX(b.sgi), cellY(b.sgj), 0.02, 1, cs * 0.6, 1); }
          if (b.mode !== 'rise') b.peeled = false;
          if (b.mode === 'ret' && !b.landed && now >= b.start + b.dur) {
            b.landed = true; landsNow++;
            if (landsNow < 3) Sound.tick(cellX(b.sgi) / halfW, false);
            if (landsNow === 1) dropWorld(cellX(b.sgi), cellY(b.sgj), cs * 1.2, 0.02);
          }
        } else if (L.sheetVis) flying += 0;
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; fxAttr.needsUpdate = true;
    }
    lockCount += locksNow; landCount += landsNow;
    for (let i = waves.length - 1; i >= 0; i--) if (now - waves[i].t0 > 3.5) waves.splice(i, 1);

    // ghost blueprint
    for (const L of letters) {
      const g = L.ghost; if (!g) continue;
      if (L.state === 'rise' && L.sheetVis) {
        const rev = clamp01((now - L.sLift0 - 0.25 * K) / (0.9 * K));
        const fade = L.done ? 1 - smooth(L.Tdone + 0.2, L.Tdone + 1.2, now) : 1;
        g.material.uniforms.reveal.value = rev;
        g.material.uniforms.opacity.value = 0.85 * fade * smooth(0, 0.1, rev);
        g.visible = g.material.uniforms.opacity.value > 0.005;
        g.position.copy(L.pos); g.quaternion.copy(L.rot); g.scale.setScalar(L.pulse);
      } else g.visible = false;
    }

    // dust
    let anyDust = false;
    for (let i = 0; i < DUSTN; i++) {
      if (dustLife[i] <= 0) { dustA[i] = 0; continue; }
      anyDust = true;
      dustLife[i] -= dt;
      dustV[i * 3] *= 0.97; dustV[i * 3 + 1] *= 0.97; dustV[i * 3 + 2] = dustV[i * 3 + 2] * 0.96 - dt * 0.6;
      dustPos[i * 3] += dustV[i * 3] * dt; dustPos[i * 3 + 1] += dustV[i * 3 + 1] * dt; dustPos[i * 3 + 2] = Math.max(0.01, dustPos[i * 3 + 2] + dustV[i * 3 + 2] * dt);
      const l = dustLife[i] / dustMax[i];
      dustA[i] = Math.sin(Math.PI * l) * 0.5;
    }
    if (anyDust) { dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.aA.needsUpdate = true; }
    dust.visible = anyDust;

    if (cellDirty && cellTex) { cellTex.needsUpdate = true; cellDirty = false; }

    // HUD
    if (!glyphs) put(statusEl, 'status', 'загружаю шрифт');
    else if (!introDone) put(statusEl, 'status', 'поверхность просыпается');
    else if (active) {
      const A = active;
      hud.letter(A);
      const p = clamp01((now - A.t0) / Math.max(0.01, A.Tdone - A.t0));
      sProg.style.width = (p * 100).toFixed(1) + '%';
      put(sFlying, 'fly', String(flying));
      if (now < A.Tdone) put(sTime, 'time', (now - A.t0 > 0 ? (now - A.t0).toFixed(1).replace('.', ',') : '0,0') + ' с…');
      if (now < A.sLift0) put(statusEl, 'status', 'швы расходятся');
      else if (now < A.tTurn0) put(statusEl, 'status', 'лицо буквы отрывается от пола');
      else if (now < A.tBack0) put(statusEl, 'status', 'блоки зоны стыкуются с тыла');
      else if (now < A.Tdone) put(statusEl, 'status', 'разворот, фиксация');
      else { put(statusEl, 'status', 'собрано · тяните мышью, чтобы вращать'); put(sTime, 'time', (A.Tdone - A.t0).toFixed(2).replace('.', ',') + ' с'); }
    } else if (letters.some((L) => L.state === 'ret')) {
      put(statusEl, 'status', 'буква возвращается в пол'); put(sFlying, 'fly', String(flying)); sProg.style.width = '0%';
    } else {
      put(statusEl, 'status', 'поверхность ровная · выберите зону'); put(sFlying, 'fly', '0'); sProg.style.width = '0%'; hud.reset();
    }
    updateDims(now, dt);

    // render: glossy reflection pass, then the scene, then the film pass
    waterMat.uniforms.heightTex.value = rtA.texture;
    waterMat.uniforms.uTime.value = now;
    postMat.uniforms.uTime.value = now;
    const anyBlocks = active || letters.some((L) => L.state !== 'flat');
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    if (anyBlocks) {
      water.visible = false; shadowPlane.visible = false; dust.visible = false; ghostGroup.visible = false;
      blockGroup.scale.z = -1;
      renderer.render(scene, camera);
      blockGroup.scale.z = 1;
      water.visible = true; shadowPlane.visible = true; dust.visible = anyDust; ghostGroup.visible = true;
    }
    renderer.setClearColor(0xF3F3F0, 1);
    renderer.shadowMap.autoUpdate = true;
    renderer.setRenderTarget(mainRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, simCam);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
