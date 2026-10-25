// 3D hero: iridescent soap bubbles, a glowing sparkle star and drifting particles.
// Loads Three.js from jsDelivr; if WebGL or the CDN is unavailable the CSS hero remains.
const canvas = document.getElementById('hero3d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function init() {
  if (!canvas) return;
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) return;
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js');

  const mobile = innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // --- procedural environment map (sky gradient + soft light panels) for glossy reflections
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float t = p.y*.5+.5; vec3 c = mix(vec3(.55,.75,1.), vec3(1.), smoothstep(.2,.9,t)); c = mix(c, vec3(.75,.65,1.), smoothstep(.0,.6,-p.x)*.5); c = mix(c, vec3(.5,1.,.9), smoothstep(.2,.9,p.z)*.35); gl_FragColor = vec4(c,1.); }',
  }));
  envScene.add(sky);
  const panel = (w, h, pos, intensity) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) })); m.position.copy(pos); m.lookAt(0, 0, 0); envScene.add(m); };
  panel(10, 6, new THREE.Vector3(-8, 8, 6), 6); panel(6, 6, new THREE.Vector3(9, 3, 8), 3); panel(12, 2, new THREE.Vector3(0, -9, 4), 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.PointLight(0x22c3e6, 40, 30); rim.position.set(6, -2, 4); scene.add(rim);
  const rim2 = new THREE.PointLight(0x6c5ce7, 30, 30); rim2.position.set(-6, 3, 2); scene.add(rim2);

  const group = new THREE.Group(); scene.add(group);

  // --- bubbles
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.4, ior: 1.2,
    iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 620],
    clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 1, envMapIntensity: 1.6,
  });
  const sphere = new THREE.SphereGeometry(1, mobile ? 32 : 64, mobile ? 24 : 48);
  const bubbles = [];
  const count = mobile ? 9 : 16;
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(sphere, bubbleMat);
    const s = 0.35 + Math.random() * (i < 3 ? 1.3 : 0.75);
    m.scale.setScalar(s);
    const side = mobile ? (Math.random() - 0.5) * 8 : 1.5 + Math.random() * 7.5; // keep the copy area clear on desktop
    m.position.set(side, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 5);
    m.userData = { speed: 0.25 + Math.random() * 0.45, phase: Math.random() * Math.PI * 2, wobble: 0.3 + Math.random() * 0.6, s };
    group.add(m); bubbles.push(m);
  }

  // --- sparkle star (4-point) with glow
  const starShape = new THREE.Shape();
  const P = 8;
  for (let i = 0; i <= P; i++) {
    const a = (i / P) * Math.PI * 2 + Math.PI / 2; const r = i % 2 === 0 ? 1.3 : 0.32;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? starShape.moveTo(x, y) : starShape.lineTo(x, y);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.12, bevelSegments: 4 });
  starGeo.center();
  const star = new THREE.Mesh(starGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x22c3e6, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.12, clearcoat: 1, iridescence: 0.6 }));
  star.position.set(mobile ? 1.5 : 4.6, mobile ? 3.2 : 1.2, 1.5);
  star.scale.setScalar(mobile ? 0.7 : 1.05);
  group.add(star);
  const small = star.clone(); small.scale.setScalar(0.4); small.position.set(mobile ? -2 : 7.2, mobile ? -3 : 3.6, 0.5); group.add(small);

  // --- glowing particles
  const pc = mobile ? 220 : 520;
  const pos = new Float32Array(pc * 3); const seeds = new Float32Array(pc);
  for (let i = 0; i < pc; i++) { pos[i * 3] = (Math.random() - 0.5) * 26; pos[i * 3 + 1] = (Math.random() - 0.5) * 16; pos[i * 3 + 2] = (Math.random() - 0.5) * 10; seeds[i] = Math.random(); }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uPx; varying float vA;
      void main(){ vec3 p = position; p.y = mod(position.y + 8. + uTime*.25*(.4+seed), 16.) - 8.;
      p.x += sin(uTime*.5 + seed*20.)*.3; vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
      vA = .35 + .65*abs(sin(uTime*2.*seed + seed*30.)); gl_PointSize = (4. + seed*10.) * uPx * (10. / -mv.z); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-.5; float d = length(c); float a = smoothstep(.5,.0,d);
      float cross = max(smoothstep(.06,.0,abs(c.x))*smoothstep(.5,.0,abs(c.y)), smoothstep(.06,.0,abs(c.y))*smoothstep(.5,.0,abs(c.x)));
      vec3 col = mix(vec3(.45,.85,1.), vec3(.75,.7,1.), gl_PointCoord.y); gl_FragColor = vec4(col, (a*.6 + cross*.8)*vA); }`,
  });
  const particles = new THREE.Points(pGeo, pMat); scene.add(particles);

  // --- interaction & loop
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let visible = true; let raf;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) loop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) loop(); });
  const clock = new THREE.Clock();
  function loop() {
    raf = null;
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    camera.position.x = mouse.x * 1.2; camera.position.y = -mouse.y * 0.8 - scrollY * 0.002; camera.lookAt(0, -scrollY * 0.002, 0);
    for (const b of bubbles) {
      const u = b.userData;
      b.position.y += u.speed * 0.012;
      if (b.position.y > 7) { b.position.y = -7; }
      b.position.x += Math.sin(t * u.wobble + u.phase) * 0.004;
      const sq = 1 + Math.sin(t * 2 + u.phase) * 0.03;
      b.scale.set(u.s * sq, u.s / sq, u.s * sq);
    }
    star.rotation.y = t * 0.8; star.rotation.z = Math.sin(t * 0.6) * 0.2; star.position.y += Math.sin(t * 1.2) * 0.003;
    small.rotation.y = -t * 1.2;
    pMat.uniforms.uTime.value = t;
    renderer.render(scene, camera);
    if (!reduced) raf = requestAnimationFrame(loop);
  }
  document.documentElement.classList.add('has3d');
  loop();
}

init().catch((e) => console.info('3D hero disabled:', e.message));
