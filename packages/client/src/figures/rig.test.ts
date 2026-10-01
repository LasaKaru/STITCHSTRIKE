import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { humanoidDef, poseHumanoid } from './humanoid.ts';
import { buildFigure, instantiate } from './rig.ts';

const opts = {
  name: 'test-hero', headwear: 'beanie' as const, beard: 'mustache' as const, gloves: true, jacketButtons: false,
  colors: { skin: 0xd9b89a, jacket: 0xe8742a, trim: 0xa85020, pants: 0x3b5a8a, boots: 0x5a3a26 }, cell: 0.02,
};

describe('rigged knitted figures', () => {
  const tpl = buildFigure(humanoidDef(opts));
  const mesh = tpl.root.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
  const geo = mesh.geometry;

  it('is a 1.5-unit tall figure with normalised skin weights', () => {
    geo.computeBoundingBox();
    const h = geo.boundingBox!.max.y - geo.boundingBox!.min.y;
    expect(h).toBeGreaterThan(1.45);
    expect(h).toBeLessThan(1.62);
    const w = geo.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i += 97) {
      expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 4);
    }
  });

  it('dresses the figure in separate knitted regions', () => {
    const regions = Object.keys(humanoidDef(opts).regions);
    const used = geo.groups.map((g) => regions[g.materialIndex!]);
    for (const r of ['skin', 'jacket', 'trim', 'pants', 'boots', 'gloves', 'hat', 'mustache']) expect(used).toContain(r);
  });

  it('knit UVs wrap around limbs without smearing across the seam', () => {
    const uv = geo.getAttribute('uv');
    let smeared = 0;
    for (let t = 0; t < uv.count; t += 3) {
      const us = [uv.getX(t), uv.getX(t + 1), uv.getX(t + 2)];
      if (Math.max(...us) - Math.min(...us) > 6) smeared++;
    }
    expect(smeared / (uv.count / 3)).toBeLessThan(0.002);
  });

  it('two-bone IK puts the hands on the blaster', () => {
    const f = instantiate(tpl);
    const gun = new THREE.Object3D();
    f.root.add(gun);
    poseHumanoid(f, { t: 0, speed: 0, phase: 0, pitch: 0.3, crouch: 0, airborne: false, aiming: true }, 1, gun);
    f.root.updateMatrixWorld(true);
    const hand = f.bones.get('handR')!.getWorldPosition(new THREE.Vector3());
    expect(hand.distanceTo(gun.position)).toBeLessThan(0.01);
    // Aiming up raises the grip above the chest joint.
    const chest = f.poser.worldPos('chest');
    expect(gun.position.y).toBeGreaterThan(chest.y);
  });

  it('merged regions collapse draw calls to one per stitch pattern', () => {
    const merged = buildFigure({ ...humanoidDef({ ...opts, name: 'test-merged', merged: true }) });
    const m = merged.root.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
    expect(m.geometry.groups.length).toBeLessThanOrEqual(5);
    expect(m.geometry.getAttribute('color')).toBeDefined();
  });
});
