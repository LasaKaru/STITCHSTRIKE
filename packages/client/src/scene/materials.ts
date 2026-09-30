import * as THREE from 'three';

/** Hard, shiny, factory-made: the Mass-Made faction and toy props (plan §13.4). */
export function plastic(color: THREE.ColorRepresentation, roughness = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 });
}

/** Glass/plastic bead eyes. */
export function bead(color: THREE.ColorRepresentation = 0x0b0b0e): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
}

export function metal(color: THREE.ColorRepresentation = 0xc9ccd2, roughness = 0.3): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 1 });
}

let woodTex: THREE.CanvasTexture | null = null;

function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b98a55';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = `rgba(${90 + Math.random() * 40}, ${55 + Math.random() * 25}, 25, ${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 0.5 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.stroke();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}

export function wood(tint: THREE.ColorRepresentation = 0xffffff): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: woodTexture(), color: tint, roughness: 0.55 });
}

export function matte(color: THREE.ColorRepresentation, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
