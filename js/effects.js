import { THREE, scene } from "./scene.js";
import { getBlockMaterial } from "./textures.js";

const particleGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
const particleMaterials = new Map();
const particles = [];

const crackPlane = new THREE.PlaneGeometry(1.02, 1.02);
const crackMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
const crackMesh = new THREE.Mesh(crackPlane, crackMaterial);
crackMesh.visible = false;
scene.add(crackMesh);

const crackTextures = [];
let lastCrackStage = -1;
const crackNormal = new THREE.Vector3(0, 0, 1);
const tempNormal = new THREE.Vector3();

const buildCrackTexture = (stage) => {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 32, 32);
  const lines = 6 + stage * 5;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < lines; i += 1) {
    const x1 = Math.random() * 32;
    const y1 = Math.random() * 32;
    const x2 = x1 + (Math.random() * 18 - 9);
    const y2 = y1 + (Math.random() * 18 - 9);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false;
  return texture;
};

for (let i = 0; i < 6; i += 1) {
  crackTextures.push(buildCrackTexture(i));
}

const getParticleMaterial = (blockType, x, y, z) => {
  if (particleMaterials.has(blockType)) return particleMaterials.get(blockType);
  const base = getBlockMaterial(blockType, x, y, z);
  let mat = null;
  if (Array.isArray(base)) {
    mat = base[0];
  } else {
    mat = base;
  }
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  } else if (!mat.isMeshLambertMaterial) {
    mat = new THREE.MeshLambertMaterial({
      map: mat.map || null,
      color: mat.color || new THREE.Color(0xffffff),
      transparent: mat.transparent || false,
      opacity: mat.opacity ?? 1,
    });
  }
  particleMaterials.set(blockType, mat);
  return mat;
};

export const spawnBlockParticles = (blockType, x, y, z, count = 12) => {
  if (!blockType || blockType === 8) return;
  const material = getParticleMaterial(blockType, x, y, z);
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(particleGeometry, material);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.position.x += (Math.random() - 0.5) * 0.6;
    mesh.position.y += (Math.random() - 0.5) * 0.6;
    mesh.position.z += (Math.random() - 0.5) * 0.6;
    scene.add(mesh);
    particles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        Math.random() * 1.6,
        (Math.random() - 0.5) * 1.8
      ),
      life: 0.6 + Math.random() * 0.4,
    });
  }
};

export const updateParticles = (dt) => {
  if (!particles.length) return;
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particle.mesh.geometry = particleGeometry;
      particles.splice(i, 1);
      continue;
    }
    particle.velocity.y -= 5 * dt;
    particle.mesh.position.addScaledVector(particle.velocity, dt);
  }
};

export const showCrackOverlay = (blockPos, faceNormal, progress) => {
  if (!blockPos || !faceNormal) {
    crackMesh.visible = false;
    lastCrackStage = -1;
    return;
  }
  const clamped = Math.max(0, Math.min(1, progress));
  const stage = Math.min(crackTextures.length - 1, Math.floor(clamped * (crackTextures.length - 1)));
  if (stage !== lastCrackStage) {
    crackMaterial.map = crackTextures[stage];
    crackMaterial.needsUpdate = true;
    lastCrackStage = stage;
  }
  tempNormal.set(faceNormal.x, faceNormal.y, faceNormal.z).normalize();
  crackMesh.position.set(blockPos.x + 0.5, blockPos.y + 0.5, blockPos.z + 0.5);
  crackMesh.position.addScaledVector(tempNormal, 0.51);
  crackMesh.quaternion.setFromUnitVectors(crackNormal, tempNormal);
  crackMesh.visible = clamped > 0.02;
};

export const hideCrackOverlay = () => {
  crackMesh.visible = false;
  lastCrackStage = -1;
};
