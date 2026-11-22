import * as THREE from "three";
import { Cartographic, Matrix4, Transforms, Cartesian3 } from "cesium";

const ENU = new Matrix4();
const INVERSE_ENU = new Matrix4();
const SCRATCH_POSITION = new Cartesian3();
const SCRATCH_DIRECTION = new Cartesian3();
const SCRATCH_UP = new Cartesian3();

function makeFireMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform float uTime;
      uniform float uOpacity;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      void main() {
        vec2 p=vUv*5.0+vec2(0.,-uTime*1.7);
        float n=noise(p)+.48*noise(p*2.1+uTime*.4)+.22*noise(p*4.0-uTime);
        float edge=1.0-smoothstep(.18,.92,length(vUv-.5)*1.55);
        float flame=smoothstep(.28,.92,n)*edge;
        float core=1.0-smoothstep(.02,.38,length(vUv-.5));
        vec3 color=mix(vec3(0.75,.045,.006),vec3(1.,.28,.018),flame);
        color=mix(color,vec3(1.,.88,.48),core*.92);
        color+=vec3(1.,.19,.015)*pow(max(0.,1.-length(vUv-.5)*1.8),5.);
        float alpha=clamp((flame*.9+core*.8)*edge,0.,1.)*uOpacity;
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function makeSmokeMaterial(seed) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uSeed: { value: seed } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      float fbm(vec2 p){
        float v=0.,a=.5;
        for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}
        return v;
      }
      void main(){
        vec2 p=(vUv-.5)*2.;
        float radius=length(p);
        float n=fbm(p*3.2+vec2(uSeed,uTime*.10));
        n+=.35*fbm(p*6.0-vec2(uTime*.08,uSeed));
        float ragged=1.-smoothstep(.48+n*.28,.98,radius);
        float center=smoothstep(.02,.34,n)*.45+.45;
        float alpha=ragged*center*uOpacity;
        vec3 smoke=mix(vec3(.055,.065,.075),vec3(.34,.35,.36),clamp(n*.9,0.,1.));
        smoke=mix(smoke,vec3(.12,.13,.14),smoothstep(.3,.95,radius));
        gl_FragColor=vec4(smoke,alpha*.78);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function playImpactAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.setValueAtTime(.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(.55, context.currentTime + .035);
    master.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 2.8);
    master.connect(context.destination);

    const low = context.createOscillator();
    const lowGain = context.createGain();
    low.type = "sawtooth";
    low.frequency.setValueAtTime(78, context.currentTime);
    low.frequency.exponentialRampToValueAtTime(27, context.currentTime + 1.7);
    lowGain.gain.value = .32;
    low.connect(lowGain);
    lowGain.connect(master);
    low.start();
    low.stop(context.currentTime + 2.85);

    const length = Math.floor(context.sampleRate * 1.8);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const fade = Math.pow(1 - i / length, 2.4);
      channel[i] = (Math.random() * 2 - 1) * fade;
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(180, context.currentTime + 1.5);
    noiseGain.gain.value = .65;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    noise.onended = () => context.close();
  } catch (error) {
    console.warn("Explosion audio unavailable:", error);
  }
}

export function spawnExplosionVfx(viewer, worldPosition) {
  if (!viewer || viewer.isDestroyed() || !worldPosition) return () => {};

  const host = viewer.container;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.className = "game3-explosion-canvas";
  Object.assign(canvas.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    pointerEvents: "none", zIndex: "2"
  });
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: false, powerPreference: "high-performance"
  });
  const mobile = window.matchMedia("(max-width: 760px)").matches ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 200000);
  const root = new THREE.Group();
  scene.add(root);

  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    makeFireMaterial()
  );
  fire.position.set(0, 0, 2.2);
  root.add(fire);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff7a19, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.copy(fire.position);
  root.add(glow);

  const shockwave = new THREE.Mesh(
    new THREE.TorusGeometry(1, .055, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffc47a, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  shockwave.position.z = .35;
  root.add(shockwave);

  const smokeItems = [];
  const smokeCount = mobile ? 6 : 11;
  for (let i = 0; i < smokeCount; i++) {
    const material = makeSmokeMaterial(i * 17.31 + Math.random() * 10);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set((Math.random() - .5) * 3, (Math.random() - .5) * 3, 2.5 + i * .55);
    mesh.scale.set(2.5 + Math.random() * 2.5, 2.8 + Math.random() * 2.8, 1);
    root.add(mesh);
    smokeItems.push({ mesh, material, start: i * .11, drift: (Math.random() - .5) * 1.4 });
  }

  const sparkCount = mobile ? 65 : 150;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVelocities = [];
  for (let i = 0; i < sparkCount; i++) {
    const direction = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() * .95 + .12).normalize();
    const speed = 9 + Math.random() * 34;
    sparkVelocities.push(direction.multiplyScalar(speed));
    sparkPositions[i * 3] = 0;
    sparkPositions[i * 3 + 1] = 0;
    sparkPositions[i * 3 + 2] = 1.5;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    color: 0xffb34d, size: mobile ? 2.8 : 3.6, sizeAttenuation: true,
    transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  root.add(sparks);

  const debrisItems = [];
  const debrisCount = mobile ? 5 : 9;
  for (let i = 0; i < debrisCount; i++) {
    const geometry = new THREE.IcosahedronGeometry(.18 + Math.random() * .24, 0);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(.52 + Math.random() * .08, .12, .18 + Math.random() * .2),
      metalness: .72, roughness: .48
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, 1.3);
    root.add(mesh);
    const velocity = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() * .8 + .2)
      .normalize().multiplyScalar(7 + Math.random() * 18);
    debrisItems.push({
      mesh, velocity,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      scale: mesh.scale.clone()
    });
  }

  const light = new THREE.PointLight(0xff7626, 95, 90, 2);
  light.position.set(0, 0, 2);
  root.add(light);
  scene.add(new THREE.HemisphereLight(0xb7d7ff, 0x302018, 1.15));

  const enu = Transforms.eastNorthUpToFixedFrame(worldPosition);
  Matrix4.inverse(enu, INVERSE_ENU);
  const origin = Cartographic.fromCartesian(worldPosition);
  const start = performance.now();
  const duration = 9.5;
  let disposed = false;
  let resizeObserver;

  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    viewer.scene.postRender.removeEventListener(render);
    if (resizeObserver) resizeObserver.disconnect();
    else window.removeEventListener("resize", resize);
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };

  function render() {
    if (disposed || viewer.isDestroyed()) { cleanup(); return; }
    const elapsed = (performance.now() - start) / 1000;
    if (elapsed >= duration) { cleanup(); return; }

    const cesiumCamera = viewer.camera;
    Matrix4.multiplyByPoint(INVERSE_ENU, cesiumCamera.positionWC, SCRATCH_POSITION);
    Matrix4.multiplyByPointAsVector(INVERSE_ENU, cesiumCamera.directionWC, SCRATCH_DIRECTION);
    Matrix4.multiplyByPointAsVector(INVERSE_ENU, cesiumCamera.upWC, SCRATCH_UP);
    camera.position.set(SCRATCH_POSITION.x, SCRATCH_POSITION.y, SCRATCH_POSITION.z);
    camera.up.set(SCRATCH_UP.x, SCRATCH_UP.y, SCRATCH_UP.z).normalize();
    camera.lookAt(
      SCRATCH_POSITION.x + SCRATCH_DIRECTION.x,
      SCRATCH_POSITION.y + SCRATCH_DIRECTION.y,
      SCRATCH_POSITION.z + SCRATCH_DIRECTION.z
    );

    const projection = cesiumCamera.frustum.projectionMatrix;
    camera.projectionMatrix.fromArray(Array.from({ length: 16 }, (_, index) => projection[index]));
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    const fireProgress = Math.min(1, elapsed / 1.15);
    const fireScale = .35 + fireProgress * 8.5;
    fire.scale.setScalar(fireScale);
    fire.material.uniforms.uTime.value = elapsed * 3.4;
    fire.material.uniforms.uOpacity.value = Math.max(0, 1 - Math.max(0, elapsed - .35) / .95);
    glow.scale.setScalar(fireScale * 1.35);
    glow.material.opacity = Math.max(0, .24 * (1 - elapsed / 1.4));
    shockwave.scale.setScalar(.3 + elapsed * 8.5);
    shockwave.material.opacity = Math.max(0, .9 - elapsed / 1.7);
    shockwave.visible = elapsed < 1.7;
    light.intensity = Math.max(0, 115 * (1 - elapsed / 1.25));

    smokeItems.forEach(({ mesh, material, start: delay, drift }, index) => {
      const age = Math.max(0, elapsed - delay - .25);
      const progress = Math.min(1, age / 7.5);
      mesh.position.z = 2.4 + index * .45 + progress * (8 + index * .18);
      mesh.position.x += drift * .002;
      mesh.scale.setScalar((2.2 + progress * 7.5) * (1 + index * .025));
      mesh.quaternion.copy(camera.quaternion);
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uOpacity.value = Math.min(1, age * 2.4) * Math.max(0, 1 - Math.max(0, age - 4.2) / 3.2) * .78;
      mesh.visible = age > 0;
    });

    const positions = sparkGeometry.attributes.position.array;
    for (let i = 0; i < sparkCount; i++) {
      const velocity = sparkVelocities[i];
      const age = elapsed;
      positions[i * 3] = velocity.x * age;
      positions[i * 3 + 1] = velocity.y * age;
      positions[i * 3 + 2] = 1.5 + velocity.z * age - 9.8 * age * age * .5;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparks.material.opacity = Math.max(0, 1 - elapsed / 2.8);

    debrisItems.forEach(({ mesh, velocity, spin }) => {
      mesh.position.set(
        velocity.x * elapsed,
        velocity.y * elapsed,
        Math.max(.18, 1.3 + velocity.z * elapsed - 4.9 * elapsed * elapsed)
      );
      mesh.rotation.x = spin.x * elapsed;
      mesh.rotation.y = spin.y * elapsed;
      mesh.rotation.z = spin.z * elapsed;
      if (mesh.position.z <= .19) {
        mesh.position.z = .19;
        velocity.multiplyScalar(.42);
      }
    });

    renderer.render(scene, camera);
  }

  viewer.scene.postRender.addEventListener(render);
  playImpactAudio();
  viewer.scene.requestRender();
  return cleanup;
}
