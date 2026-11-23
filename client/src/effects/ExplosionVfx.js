import * as THREE from "three";
import { VFXRenderer, createExplosion } from "three-realistic-vfx";
import { Matrix4, Transforms, Cartesian3 } from "cesium";

const INVERSE_ENU = new Matrix4();
const SCRATCH_POSITION = new Cartesian3();
const SCRATCH_DIRECTION = new Cartesian3();
const SCRATCH_UP = new Cartesian3();

function playImpactAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.setValueAtTime(.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(.55, context.currentTime + .035);
    master.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 3.2);
    master.connect(context.destination);

    const low = context.createOscillator();
    const lowGain = context.createGain();
    low.type = "sawtooth";
    low.frequency.setValueAtTime(78, context.currentTime);
    low.frequency.exponentialRampToValueAtTime(25, context.currentTime + 2);
    lowGain.gain.value = .32;
    low.connect(lowGain);
    lowGain.connect(master);
    low.start();
    low.stop(context.currentTime + 3.25);

    const length = Math.floor(context.sampleRate * 2.2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2100, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(130, context.currentTime + 1.9);
    noiseGain.gain.value = .62;
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
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2"
  });
  host.appendChild(canvas);

  const mobile = window.matchMedia("(max-width: 760px)").matches ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.1 : 1.6));
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 200000);
  const vfxRenderer = new VFXRenderer();
  scene.add(vfxRenderer);

  // Cesium ENU uses Z-up; the particle library uses Y-up.
  // Rotate the effect's local frame so smoke rises away from the terrain.
  const explosion = createExplosion(vfxRenderer, {
    scale: mobile ? 1.35 : 1.8,
    intensity: mobile ? .58 : 1.25,
    radius: mobile ? 2.8 : 3.8,
    duration: 7,
    gravity: 1,
    worldSpace: false,
    includeShockwave: true,
    includeDebris: true,
    includeSmoke: true
  });
  explosion.position.set(0, 0, 0);
  explosion.rotation.x = Math.PI / 2;
  vfxRenderer.addEffect(explosion);
  explosion.play();

  const enu = Transforms.eastNorthUpToFixedFrame(worldPosition);
  Matrix4.inverse(enu, INVERSE_ENU);
  const startedAt = performance.now();
  let previousFrame = startedAt;
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
    vfxRenderer.removeEffect(explosion);
    explosion.dispose();
    vfxRenderer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };

  function render() {
    if (disposed || viewer.isDestroyed()) {
      cleanup();
      return;
    }

    const now = performance.now();
    const elapsed = (now - startedAt) / 1000;
    if (elapsed >= 8.5) {
      cleanup();
      return;
    }

    const delta = Math.min(.05, Math.max(0, (now - previousFrame) / 1000));
    previousFrame = now;

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

    vfxRenderer.update(delta);
    renderer.render(scene, camera);
  }

  viewer.scene.postRender.addEventListener(render);
  playImpactAudio();
  viewer.scene.requestRender();
  return cleanup;
}
