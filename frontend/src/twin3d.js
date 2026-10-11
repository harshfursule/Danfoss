import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* twin3d.js — Three.js 3D Digital Twin. Units: 1 unit = 100 mm. Ground y=-1, press table top y=0.1.
   Ram group is built at stroke=50 mm and shifted up by (stroke-50)/100 -> die, ram, rod, piston, sensor magnet all move together. */

export const Twin3D = (() => {
  let R, S, C, O, box, ray, last = 0, sel = null, cur = null, labels = [], pick = [], paths = {}, pipes = {}, spool = { x: 0, t: 0 }, st = { on: false, ext: true, spd: 1 };
  let isPlaying = false;
  let gaugeMax = { pbar: 350, qlpm: 120 };
  let telemetryData = [];
  const parts = {};

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const M = (c, m = .35, r = .45, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, ...o });
  
  let mat = {};

  function initMaterials() {
    mat = {
      steel: M(0x9aa1ab),
      dark: M(0x3a3f47),
      blue: M(0x1f5fd0),
      orange: M(0xe08a1e, .1, .6),
      chrome: M(0xe3e8ee, .7, .2),
      grey: M(0x70757f),
      green: M(0x3b8f5a),
      glass: M(0x9bb4d8, .3, .4, { transparent: true, opacity: .35, depthWrite: false }),
      barrel: M(0x2a62d0, .3, .3, { transparent: true, opacity: .4, side: THREE.DoubleSide, depthWrite: false })
    };
  }

  function add(g, m, x, y, z, p) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    (p || S).add(o);
    return o;
  }

  const bx = (w, h, d, m, x, y, z, p) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, p);

  function cy(r, h, m, x, y, z, p, ax) {
    const o = add(new THREE.CylinderGeometry(r, r, h, 32), m, x, y, z, p);
    if (ax === 'x') o.rotation.z = Math.PI / 2;
    if (ax === 'z') o.rotation.x = Math.PI / 2;
    return o;
  }

  /* Pipe = cylinders per segment + sphere elbows + flange rings at both ends */
  function pipe(pts, r, m, id) {
    const g = new THREE.Group();
    S.add(g);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 16), m);
      o.position.copy(a).add(b).multiplyScalar(.5);
      o.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      g.add(o);
    }
    pts.forEach((p, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
      s.position.copy(p);
      g.add(s);
      if (i === 0 || i === pts.length - 1) {
        const q = pts[i ? i - 1 : 1], f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.6, .1, 20), mat.chrome);
        f.position.copy(p);
        f.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().sub(q).normalize());
        g.add(f);
      }
    });
    pipes[id] = m;
    return g;
  }

  /* Particle path: points travel along the real pipe polyline */
  function mkPath(id, pts, color) {
    let cum = [0];
    for (let i = 0; i < pts.length - 1; i++) cum.push(cum[i] + pts[i].distanceTo(pts[i + 1]));
    const len = cum[cum.length - 1], n = Math.max(4, Math.round(len * 3)), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: .2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false;
    p.visible = false;
    S.add(p);
    paths[id] = { pts, cum, len, n, u: 0, p, sg: 0 };
  }

  function place(P) {
    const a = P.p.geometry.attributes.position;
    for (let k = 0; k < P.n; k++) {
      const s = ((((P.u + k / P.n) % 1) + 1) % 1) * P.len;
      let i = 0;
      while (i < P.cum.length - 2 && P.cum[i + 1] < s) i++;
      const f = (s - P.cum[i]) / (P.cum[i + 1] - P.cum[i] || 1), A = P.pts[i], B = P.pts[i + 1];
      a.setXYZ(k, A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f, A.z + (B.z - A.z) * f);
    }
    a.needsUpdate = true;
  }

  /* Robust, clean Component & Sensor Annotation creation */
  function label(t, x, y, z) {
    const wrap = document.createElement('div');
    wrap.className = 't3lbl-wrapper';
    
    const badge = document.createElement('div');
    badge.className = 't3lbl';
    badge.textContent = t;

    const pin = document.createElement('div');
    pin.className = 't3lbl-pin';

    wrap.appendChild(badge);
    wrap.appendChild(pin);

    if (box) box.appendChild(wrap);
    labels.push({ d: wrap, p: V(x, y, z) });
  }

  const sensor = (m, key) => {
    m.userData.sensor = key;
    pick.push(m);
  };

  /* Sheet strip lying across the V cavity */
  function sheetGeo(b) {
    const xs = [-1.1, -.85, -.4, .4, .85, 1.1], yf = x => {
      const a = Math.abs(x), f = a >= .85 ? 1.05 : a <= .4 ? .6 : .6 + (a - .4);
      return 1.05 + (f - 1.05) * b;
    };
    const sh = new THREE.Shape();
    xs.forEach((x, i) => i ? sh.lineTo(x, yf(x) + .03) : sh.moveTo(x, yf(x) + .03));
    xs.slice().reverse().forEach(x => sh.lineTo(x, yf(x) - .03));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false });
    g.translate(0, 0, -.55);
    return g;
  }

  const bOf = sk => Math.min(1, Math.max(0, (1.08 - (.66 + (sk - 50) / 100)) / .43));

  let cumB = [], cumN = 0;
  function formedMax(t) {
    if (!telemetryData || !telemetryData.length) return 0;
    if (cumN !== telemetryData.length) {
      let m = 0;
      cumB = telemetryData.map(r => (m = Math.max(m, bOf(r.stroke))));
      cumN = telemetryData.length;
    }
    let m = 0;
    for (let i = 0; i < telemetryData.length && telemetryData[i].t <= t; i++) m = cumB[i];
    return m;
  }

  function build() {
    initMaterials();
    S.add(new THREE.HemisphereLight(0xcfe0ff, 0x20242c, 1.0));
    S.add(new THREE.AmbientLight(0xffffff, .45));
    const L = new THREE.DirectionalLight(0xffffff, 1.3);
    L.position.set(10, 20, 14);
    L.castShadow = true;
    L.shadow.mapSize.set(2048, 2048);
    Object.assign(L.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    S.add(L);

    const gr = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .3 }));
    gr.rotation.x = -Math.PI / 2;
    gr.position.y = -1.001;
    gr.receiveShadow = true;
    S.add(gr);

    const grid = new THREE.GridHelper(60, 60, 0x334155, 0x1e293b);
    grid.position.y = -1;
    S.add(grid);

    // --- frame ---
    bx(6, .7, 2.4, mat.grey, 0, -.65, 0);
    bx(3.2, .4, 1.8, mat.steel, 0, -.1, 0);
    [-2.2, 2.2].forEach(x => { cy(.2, 5.3, mat.chrome, x, 2.35, 0); cy(.3, .2, mat.dark, x, 5.1, 0); });
    bx(5.6, .6, 1.8, mat.steel, 0, 5.3, 0);
    cy(.9, .1, mat.dark, 0, 5.65, 0);

    // --- lower die (fixed to bed) ---
    bx(3.2, .12, 1.7, mat.dark, 0, .16, 0);
    const dp = new THREE.Shape();
    [[-1.2, 0], [1.2, 0], [1.2, .8], [.85, .8], [.4, .35], [-.4, .35], [-.85, .8], [-1.2, .8]].forEach((p, i) => i ? dp.lineTo(...p) : dp.moveTo(...p));
    const dg = new THREE.ExtrudeGeometry(dp, { depth: 1.3, bevelEnabled: false });
    dg.translate(0, 0, -.65);
    add(dg, M(0x3b3f46, .5, .5), 0, .22, 0);
    [-1.38, 1.38].forEach(x => bx(.3, .75, 1.5, M(0x2c3036, .5, .5), x, .595, 0));
    [[-1.45, .24, -.62], [-1.45, .24, .62], [1.45, .24, -.62], [1.45, .24, .62], [-1.38, .98, -.5], [-1.38, .98, .5], [1.38, .98, -.5], [1.38, .98, .5]].forEach(p => cy(.06, .05, M(0x111111), ...p));

    // sheet workpiece
    parts.wp = new THREE.Mesh(sheetGeo(0), M(0xf0a020, .1, .5, { emissive: 0x000000 }));
    parts.wp.castShadow = parts.wp.receiveShadow = true;
    S.add(parts.wp);
    parts.b = -1;

    // --- ram mount under crosshead + blue sleeve ---
    bx(3.4, .5, 1.4, M(0x7d8590), 0, 4.75, 0);
    bx(1.4, .5, 1.5, M(0x9aa1ab), 0, 4.75, 0);
    cy(.46, .08, mat.dark, 0, 4.46, 0);
    [[-1.5, -.5], [-1.5, .5], [1.5, -.5], [1.5, .5]].forEach(p => cy(.07, .05, M(0x111111), p[0], 5.02, p[1]));
    parts.sleeve = cy(.38, 1, M(0x1f4fd8, .6, .25), 0, 4, 0);

    // --- cylinder barrel ---
    cy(.55, 3.6, mat.barrel, 0, 7.4, 0);
    cy(.62, .14, mat.dark, 0, 9.2, 0);
    cy(.62, .14, mat.dark, 0, 5.65, 0);
    [[8.95], [5.85]].forEach(([y]) => cy(.15, .3, mat.chrome, .6, y, 0, null, 'x'));

    // --- moving ram group ---
    const G = parts.ram = new THREE.Group();
    S.add(G);
    const pg = new THREE.Shape();
    [[-.7, .45], [.7, .45], [.3, 0], [-.3, 0]].forEach((p, i) => i ? pg.lineTo(...p) : pg.moveTo(...p));
    const pgg = new THREE.ExtrudeGeometry(pg, { depth: 1.1, bevelEnabled: false });
    pgg.translate(0, 0, -.55);
    add(pgg, M(0x5b6068, .5, .4), 0, .66, 0, G);
    bx(2.6, .4, 1.4, mat.grey, 0, 1.31, 0, G);
    cy(.5, .2, mat.dark, 0, 1.61, 0, G);
    cy(.25, 4.69, mat.chrome, 0, 3.855, 0, G);
    [[-1.1, -.5], [1.1, -.5], [-1.1, .5], [1.1, .5]].forEach(p => cy(.07, .05, M(0x111111), p[0], 1.53, p[1], G));
    cy(.52, .3, mat.chrome, 0, 6.2, 0, G);

    const mag = add(new THREE.TorusGeometry(.14, .05, 8, 16), M(0x68d391, .2, .3, { emissive: 0x1a6b3a }), -1.1, 1.31, .8, G);
    mag.rotation.x = Math.PI / 2;
    sensor(mag, 'Position sensor');
    bx(.3, .1, .2, mat.dark, -1.2, 1.31, .75, G);

    // position sensor rod
    cy(.04, 4, mat.chrome, -1.1, 3, .8);
    bx(.25, .25, .25, mat.dark, -1.1, 4.9, .8);

    // --- reservoir, motor, pump, filter ---
    bx(3.4, 1.8, 2.2, mat.grey, 7.2, -.1, 0);
    bx(.25, 1, .05, mat.glass, 8.6, -.2, 1.12);
    bx(.14, .6, .04, mat.orange, 8.6, -.4, 1.14);
    cy(.12, .3, mat.dark, 8.2, .95, .8);
    cy(.55, 1.5, mat.blue, 7.85, 1.35, 0, null, 'x');
    for (let i = 0; i < 6; i++) cy(.58, .05, mat.blue, 7.25 + i * .22, 1.35, 0, null, 'x');
    bx(.5, .35, .5, mat.dark, 7.85, 2.0, 0);
    cy(.5, .3, mat.dark, 8.75, 1.35, 0, null, 'x');
    bx(1.2, .1, 1, mat.dark, 7.85, .85, 0);
    cy(.4, .7, mat.green, 6.6, 1.35, 0, null, 'x');
    cy(.45, .1, mat.chrome, 6.22, 1.35, 0, null, 'x');
    cy(.45, .1, mat.chrome, 6.98, 1.35, 0, null, 'x');
    bx(.9, .3,.9, mat.dark, 6.6, .95, 0);
    cy(.14, .3, mat.chrome, 6.6, 1.8, 0);
    cy(.14, .3, mat.chrome, 6.6, 1.35, .5, null, 'z');
    parts.cpl = cy(.12, .28, mat.chrome, 7.04, 1.35, 0, null, 'x');
    bx(.05, .14, .26, mat.dark, 7.04, 1.35, 0);
    cy(.22, .8, mat.blue, 5.9, 1.2, .9);
    cy(.26, .1, mat.chrome, 5.9, 1.65, .9);

    // --- 4/3 DCV ---
    bx(1.6, .7, .7, mat.glass, 4.4, 4, 0);
    const eg = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.6, .7, .7)), new THREE.LineBasicMaterial({ color: 0x475569 }));
    eg.position.set(4.4, 4, 0);
    S.add(eg);
    cy(.12, 1.5, mat.dark, 4.4, 4, 0, null, 'x');
    cy(.12, 4.65, mat.dark, 4.4, 1.325, -.5);
    const sg = parts.spool = new THREE.Group();
    sg.position.set(4.4, 4, 0);
    S.add(sg);
    cy(.08, 1.5, mat.chrome, 0, 0, 0, sg, 'x');
    [-.4, 0, .4].forEach(x => cy(.2, .26, mat.chrome, x, 0, 0, sg, 'x'));
    parts.y1 = bx(.4, .5, .5, M(0x1f5fd0), 3.35, 4, 0);
    parts.y2 = bx(.4, .5, .5, M(0x1f5fd0), 5.45, 4, 0);
    parts.l1 = add(new THREE.SphereGeometry(.07), M(0x333333, 0, 1, { emissive: 0 }), 3.35, 4.3, 0);
    parts.l2 = add(new THREE.SphereGeometry(.07), M(0x333333, 0, 1, { emissive: 0 }), 5.45, 4.3, 0);
    [[3.9, 4.35], [4.9, 4.35], [3.9, 3.65], [4.9, 3.65]].forEach(([x, y]) => cy(.16, .14, mat.chrome, x, y, 0));

    // --- pipes ---
    const pr = M(0x2a6fe8, .5, .3, { transparent: true, opacity: .5, depthWrite: false }),
      rt = M(0x39475f, .5, .3, { transparent: true, opacity: .55, depthWrite: false }),
      sc = M(0x9aa0a8, .4, .4, { transparent: true, opacity: .5, depthWrite: false });
    pipes.A = pr.clone();
    pipes.B = rt.clone();

    const sct = [V(6.6, .55, .8), V(6.6, 1.35, .8), V(6.6, 1.35, .5)],
      pP = [V(6.6, 1.8, 0), V(6.6, 2.4, 0), V(3.9, 2.4, 0), V(3.9, 3.65, 0)],
      lA = [V(4.9, 4.35, 0), V(4.9, 8.95, 0), V(.6, 8.95, 0)],
      lB = [V(3.9, 4.35, 0), V(3.9, 5.85, 0), V(.6, 5.85, 0)],
      ret = [V(4.9, 3.65, 0), V(4.9, 3.2, 0), V(4.9, 3.2, .9), V(5.9, 3.2, .9), V(5.9, 1.7, .9)];

    pipe(sct, .13, sc, 's');
    pipe(pP, .09, pr, 'p');
    pipe(lA, .09, pipes.A, 'A');
    pipe(lB, .09, pipes.B, 'B');
    pipe(ret, .09, rt, 'r');

    const W = 0x9ff4ff, Y = 0xfff2b0;
    mkPath('sct', sct, W);
    mkPath('pP', pP, W);
    mkPath('pa', [V(3.9, 3.65, 0), V(3.9, 3.9, 0), V(4.9, 3.9, 0), V(4.9, 4.35, 0)], W);
    mkPath('pb', [V(3.9, 3.65, 0), V(3.9, 4.35, 0)], W);
    mkPath('A', lA, W);
    mkPath('B', lB, W);
    mkPath('bt', [V(3.9, 4.35, 0), V(3.9, 4.1, 0), V(4.9, 4.1, 0), V(4.9, 3.65, 0)], Y);
    mkPath('at', [V(4.9, 4.35, 0), V(4.9, 3.65, 0)], Y);
    mkPath('ret', ret, Y);

    // --- sensors ---
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const x = gc.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#000';
    x.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      x.beginPath();
      x.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
      x.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58);
      x.stroke();
    }
    const gg = new THREE.Group();
    gg.position.set(5.2, 2.85, 0);
    S.add(gg);
    cy(.26, .1, mat.chrome, 0, 0, 0, gg, 'z');
    cy(.04, .45, mat.dark, 0, -.35, 0, gg);

    const face = new THREE.Mesh(new THREE.CircleGeometry(.23, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc) }));
    face.position.z = .055;
    gg.add(face);

    parts.needle = new THREE.Group();
    parts.needle.position.z = .07;
    gg.add(parts.needle);
    add(new THREE.BoxGeometry(.015, .2, .01), new THREE.MeshBasicMaterial({ color: 0xcc2222 }), 0, .1, 0, parts.needle);
    sensor(face, 'Pressure gauge');

    cy(.12, .4, M(0x1f5fd0), 5.8, 2.6, 0);
    const ps = add(new THREE.SphereGeometry(.11), M(0xf6ad55, .2, .3, { emissive: 0x6b3a00 }), 5.8, 2.85, 0);
    sensor(ps, 'Pressure sensor');

    const fs = bx(.45, .4, .4, M(0x4fd1c5, .3, .4, { emissive: 0x0b3b36 }), 4.4, 2.4, 0);
    sensor(fs, 'Flow sensor');

    // Carefully chosen non-overlapping 3D spatial anchor points
    [
      ['CYLINDER', 0, 9.8, 0],
      ['POSITION SENSOR', -2.3, 3.2, 0.8],
      ['4/3 DCV', 4.4, 5.1, 0],
      ['FLOW SENSOR', 3.4, 2.2, 0.6],
      ['PRESSURE SENSOR', 5.8, 3.5, 0.4],
      ['RETURN FILTER', 5.2, 1.8, 1.4],
      ['PUMP', 6.6, 2.3, -0.6],
      ['MOTOR', 8.2, 2.7, 0],
      ['RESERVOIR', 8.6, 0.9, 1.4]
    ].forEach(a => label(...a));
  }

  // Camera viewpoints: Centered at true mid-point (x=4.0, y=3.5, z=0)
  const VIEWS = {
    FRONT: [4.0, 3.5, 29],
    BACK: [4.0, 3.5, -29],
    LEFT: [-26, 3.5, 0],
    RIGHT: [32, 3.5, 0],
    TOP: [4.0, 36, .01],
    BOTTOM: [4.0, -32, .01],
    ISOMETRIC: [17, 13, 23] // Balanced, unclipped perspective framing entire assembly
  };

  let goal = null;
  let showLabels = true;

  function setShowLabels(flag) {
    showLabels = flag;
    labels.forEach(l => {
      if (l.d) l.d.style.display = flag ? 'block' : 'none';
    });
  }

  function view(n) {
    if (!C || !O) return;
    goal = V(...(VIEWS[n] || VIEWS.ISOMETRIC));
    O.target.set(4.0, 3.5, 0); // Geometric center of the entire installation
  }

  function init(containerEl, data, config = {}) {
    box = containerEl || document.getElementById('view3d');
    if (!box) {
      console.error("Twin3D: container element not found");
      return;
    }

    if (data) telemetryData = data;
    if (config.gaugeMax) gaugeMax = config.gaugeMax;

    // Reset clean state if re-initted
    labels.forEach(l => { if (l.d && l.d.parentNode) l.d.parentNode.removeChild(l.d); });
    labels = [];
    pick = [];
    paths = {};
    pipes = {};

    box.innerHTML = '';

    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    R.shadowMap.enabled = true;
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    
    // Explicit sizing based on container
    const initialW = box.clientWidth || 800;
    const initialH = box.clientHeight || 550;
    R.setSize(initialW, initialH, false);
    box.appendChild(R.domElement);

    S = new THREE.Scene();
    S.background = new THREE.Color(0xf1f5f9); // Clean slate-100 backdrop
    
    // 38 deg FOV gives ideal focal compression without perspective distortion
    C = new THREE.PerspectiveCamera(38, initialW / initialH, .1, 250);
    C.position.set(...VIEWS.ISOMETRIC);

    O = new OrbitControls(C, R.domElement);
    O.target.set(4.0, 3.5, 0); // Centers entire press and power unit
    O.enableDamping = true;
    O.dampingFactor = 0.08;
    O.maxPolarAngle = Math.PI / 2 + 0.1; // Prevent going underneath floor

    ray = new THREE.Raycaster();
    build();

    let dn;
    R.domElement.onpointerdown = e => dn = [e.clientX, e.clientY];
    R.domElement.onpointerup = e => {
      if (!dn || Math.hypot(e.clientX - dn[0], e.clientY - dn[1]) > 4) return;
      const r = R.domElement.getBoundingClientRect();
      ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, C);
      const h = ray.intersectObjects(pick)[0];
      sel = h ? h.object.userData.sensor : null;
      if (config.onSensorClick) config.onSensorClick(sel, cur);
    };

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(box);

    resize();
    requestAnimationFrame(loop);
  }

  function resize() {
    if (!R || !box) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (w > 0 && h > 0) {
      R.setSize(w, h, false);
      C.aspect = w / h;
      C.updateProjectionMatrix();
    }
  }

  function setPlaying(flag) {
    isPlaying = flag;
  }

  /* Called by React state with current telemetry sample */
  function update(d) {
    cur = d;
    if (!R || !parts.ram) return;
    const sk = Math.min(300, Math.max(48, d.stroke)), up = (sk - 50) / 100;
    parts.ram.position.y = up;

    const bot = 1.71 + up, h = Math.max(.02, 4.46 - bot);
    parts.sleeve.scale.y = h;
    parts.sleeve.position.y = 4.46 - h / 2;

    const b = Math.max(bOf(sk), formedMax(d.t));
    if (Math.abs(b - parts.b) > .004) {
      parts.wp.geometry.dispose();
      parts.wp.geometry = sheetGeo(b);
      parts.b = b;
    }

    const g = Math.min(1, d.pbar / (gaugeMax.pbar || 350));
    parts.wp.material.emissive.setRGB(g * .7, g * .25, 0);

    if (parts.needle) {
      parts.needle.rotation.z = -(-135 + Math.min(1, d.pbar / (gaugeMax.pbar || 350)) * 270) * Math.PI / 180;
    }

    st.on = d.flowOn;
    st.ext = d.dir > 0;
    st.spd = 1.5 * (.3 + .7 * Math.sqrt(Math.min(1, Math.abs(d.qlpm) / ((gaugeMax.qlpm / 1.1) || 100))));
    spool.t = !d.flowOn ? 0 : (st.ext ? .3 : -.3);

    if (parts.l1) parts.l1.material.emissive.setHex(spool.t > 0 ? 0x00ff55 : 0);
    if (parts.l2) parts.l2.material.emissive.setHex(spool.t < 0 ? 0x00ff55 : 0);

    if (pipes.A) pipes.A.color.setHex(d.flowOn ? (st.ext ? 0x2a6fe8 : 0x39475f) : 0x39475f);
    if (pipes.B) pipes.B.color.setHex(d.flowOn ? (st.ext ? 0x39475f : 0x2a6fe8) : 0x39475f);

    const e = st.ext, s = { sct: 1, pP: 1, pa: e ? 1 : 0, pb: e ? 0 : 1, A: e ? 1 : -1, B: e ? -1 : 1, bt: e ? 1 : 0, at: e ? 0 : 1, ret: 1 };
    for (const k in paths) {
      paths[k].sg = d.flowOn ? s[k] : 0;
      paths[k].p.visible = !!paths[k].sg;
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!R || !box || !box.clientWidth) return;

    for (const k in paths) {
      const P = paths[k];
      if (P.sg && isPlaying) {
        P.u += P.sg * st.spd * dt / P.len * 1.2;
      }
      if (P.sg) place(P);
    }

    if (parts.spool) {
      spool.x += (spool.t - spool.x) * Math.min(1, dt * 10);
      parts.spool.position.x = 4.4 + spool.x;
    }

    if (isPlaying && st.on && parts.cpl) {
      parts.cpl.rotation.x += dt * 12;
    }

    if (goal) {
      C.position.lerp(goal, .12);
      if (C.position.distanceTo(goal) < .05) goal = null;
    }

    O.update();
    R.render(S, C);

    // Screen projection with 2D collision-avoidance & spacing relaxation
    const w = box.clientWidth, h = box.clientHeight;
    const projected = [];

    labels.forEach(l => {
      if (!showLabels) {
        l.d.style.display = 'none';
        return;
      }
      const p = l.p.clone().project(C);
      const inFront = p.z < 1;
      const rawX = (p.x + 1) / 2 * w;
      const rawY = (1 - p.y) / 2 * h;
      const inside = rawX > 20 && rawX < (w - 30) && rawY > 30 && rawY < (h - 30);

      if (inFront && inside) {
        projected.push({
          l,
          x: rawX,
          y: rawY,
          depth: p.z
        });
      } else {
        l.d.style.display = 'none';
      }
    });

    // Sort by depth (closest first)
    projected.sort((a, b) => a.depth - b.depth);

    // Iterative vertical separation relaxation to prevent overlaps
    const minSpacingY = 22; // minimum vertical pixel clearance between labels
    const minSpacingX = 85; // horizontal clearance threshold
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const dx = Math.abs(projected[i].x - projected[j].x);
        const dy = Math.abs(projected[i].y - projected[j].y);
        if (dx < minSpacingX && dy < minSpacingY) {
          const shift = (minSpacingY - dy) / 2;
          if (projected[j].y >= projected[i].y) {
            projected[j].y += shift;
            projected[i].y -= shift;
          } else {
            projected[j].y -= shift;
            projected[i].y += shift;
          }
        }
      }
    }

    // Apply positions
    projected.forEach(item => {
      item.l.d.style.display = 'block';
      item.l.d.style.left = Math.round(item.x) + 'px';
      item.l.d.style.top = Math.round(item.y) + 'px';
    });
  }

  return { init, update, resize, view, setPlaying, setShowLabels };
})();
