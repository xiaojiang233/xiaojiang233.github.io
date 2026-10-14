import * as THREE from '../lib/three.bundle.js';
import { Kit, tubeGeo, canvasTex, paint, roundRect } from './util.js';
import { Naiwa } from './naiwa.js';

// A little mint-green step-through cruiser with whitewall balloon tyres,
// cream fenders, a wicker basket (milk bottle + sunflowers) and a bell.
// Bike space: +z forward, +y up, ground at y = 0, x = rider's left.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const BIKE = {
  wheelR: 0.235, rear: V(0, 0.235, -0.47), front: V(0, 0.235, 0.43), bb: V(0, 0.26, -0.06), crank: 0.078,
  headTop: V(0, 0.62, 0.255), headBot: V(0, 0.47, 0.305), seat: V(0, 0.475, -0.18),
};
BIKE.axis = new THREE.Vector3().subVectors(BIKE.headTop, BIKE.headBot).normalize();

const MINT = 0x5fc4ac, CREAM = 0xf4e8cc, LEATHER = 0x8a5a33, CHROME = 0xd9dde2, TYRE = 0x2a2826;

function wheel(mats) {
  const R = BIKE.wheelR, g = new THREE.Group();
  // tyre with a cream whitewall on the side facing the hub
  const tg = new THREE.TorusGeometry(R - 0.03, 0.03, 14, 48);
  const p = tg.attributes.position, col = new Float32Array(p.count * 3), c1 = new THREE.Color(TYRE), c2 = new THREE.Color(0xefe4c8);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i)), side = Math.abs(p.getZ(i));
    const ww = r < R - 0.036 && side > 0.012 && r > R - 0.054;
    const c = ww ? c2 : c1; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.rotateY(Math.PI / 2);
  const tyre = new THREE.Mesh(tg, mats.tyre); g.add(tyre);
  const k = new Kit();
  const rim = new THREE.TorusGeometry(R - 0.058, 0.009, 8, 48); rim.rotateY(Math.PI / 2); k.add(rim, CHROME);
  const hub = new THREE.CylinderGeometry(0.018, 0.018, 0.09, 12); hub.rotateZ(Math.PI / 2); k.add(hub, CHROME);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, side = (i % 2 ? 1 : -1) * 0.035;
    const rr = R - 0.06;
    k.addRaw(paint(tubeGeo(V(side, Math.cos(a + 0.2) * 0.016, Math.sin(a + 0.2) * 0.016), V(0, Math.cos(a) * rr, Math.sin(a) * rr), 0.0028, 4), CHROME));
  }
  g.add(new THREE.Mesh(k.build(), mats.chrome));
  return g;
}

function fender(mats) {
  const g = new THREE.TorusGeometry(BIKE.wheelR + 0.025, 0.034, 6, 28, 2.3);
  g.scale(1, 1, 0.55);
  g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mats.cream);
}

function basketTex() {
  // chunky wicker weave: horizontal strands over vertical stakes
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9a6a36'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      const x = col * 32 + (row % 2) * 16, y = row * 16;
      const gr = g.createLinearGradient(0, y, 0, y + 14);
      gr.addColorStop(0, '#e2b77a'); gr.addColorStop(0.5, '#c9975a'); gr.addColorStop(1, '#a8743e');
      g.fillStyle = gr; roundRect(g, x + 1, y + 1, 30, 13, 6); g.fill();
    }
  });
}

export class Bike {
  constructor() {
    const mats = this.mats = {
      paint: new THREE.MeshPhysicalMaterial({ color: MINT, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 }),
      cream: new THREE.MeshPhysicalMaterial({ color: CREAM, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      chrome: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.18 }),
      tyre: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      leather: new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.55 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2d2f33, roughness: 0.5, metalness: 0.6 }),
      props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      basket: new THREE.MeshStandardMaterial({ map: basketTex(), side: THREE.DoubleSide, roughness: 0.85 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe7a8, emissiveIntensity: 0.2, roughness: 0.2 }),
    };
    const root = this.root = new THREE.Group();     // follows the road
    const lean = this.lean = new THREE.Group();     // roll about the contact line
    root.add(lean);
    const B = BIKE;

    // ---- frame
    const fk = [];
    const tube = (a, b, r = 0.022, r2 = r) => fk.push(tubeGeo(a, b, r, 12, r2));
    const curveTube = (pts, r = 0.022) => fk.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 10, false));
    curveTube([V(0, 0.27, -0.05), V(0, 0.3, 0.06), V(0, 0.39, 0.2), V(0, 0.5, 0.295)], 0.025);              // low swooping down tube
    curveTube([V(0, 0.4, -0.14), V(0, 0.44, 0.0), V(0, 0.52, 0.17), V(0, 0.585, 0.268)], 0.019);            // mixte upper tube
    tube(B.bb, V(0, 0.46, -0.165), 0.022);                                                                   // seat tube
    for (const s of [-1, 1]) {
      tube(V(s * 0.012, B.bb.y, B.bb.z), V(s * 0.05, B.rear.y, B.rear.z), 0.012);                           // chain stays
      tube(V(s * 0.015, 0.43, -0.155), V(s * 0.05, B.rear.y, B.rear.z), 0.011);                             // seat stays
    }
    tube(B.headBot, B.headTop, 0.03);                                                                        // head tube
    const bbShell = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14); bbShell.rotateZ(Math.PI / 2); bbShell.translate(B.bb.x, B.bb.y, B.bb.z); fk.push(bbShell);
    const frame = new THREE.Mesh(merge(fk), mats.paint);
    lean.add(frame);

    // ---- wheels
    this.rearWheel = wheel(mats); this.rearWheel.position.copy(B.rear); lean.add(this.rearWheel);
    const rf = fender(mats); rf.position.copy(B.rear); rf.rotation.x = -0.15; lean.add(rf);

    // ---- saddle (sprung leather) + post
    const sk = new Kit();
    const sad = new THREE.SphereGeometry(0.1, 20, 12); sad.scale(0.95, 0.32, 1.25); sk.add(sad, LEATHER, [0, 0.475, -0.19]);
    sk.add(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), CHROME, [0, 0.44, -0.17]);
    for (const s of [-1, 1]) sk.add(new THREE.TorusGeometry(0.012, 0.004, 6, 12), CHROME, [s * 0.04, 0.445, -0.25], [0, Math.PI / 2, 0], [1, 1.6, 1]);
    lean.add(new THREE.Mesh(sk.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })));

    // ---- chain guard + chainring
    const cg = new THREE.Shape();
    cg.moveTo(0, 0.04); cg.lineTo(0.4, 0.024); cg.quadraticCurveTo(0.44, 0, 0.4, -0.024); cg.lineTo(0, -0.05); cg.quadraticCurveTo(-0.07, 0, 0, 0.04);
    const cgGeo = new THREE.ExtrudeGeometry(cg, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    cgGeo.rotateY(Math.PI / 2); // shape x → -z
    cgGeo.translate(-0.075, B.bb.y + 0.02, B.bb.z + 0.02);
    lean.add(new THREE.Mesh(cgGeo, mats.cream));
    const ring = new THREE.TorusGeometry(0.075, 0.008, 6, 28); ring.rotateY(Math.PI / 2); ring.translate(-0.06, B.bb.y, B.bb.z);
    lean.add(new THREE.Mesh(ring, mats.dark));

    // ---- cranks + pedals (spin)
    this.crank = new THREE.Group(); this.crank.position.copy(B.bb); lean.add(this.crank);
    this.pedals = [];
    for (const s of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, B.crank + 0.02), mats.dark);
      arm.position.set(s * 0.066, 0, 0); this.crank.add(arm);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.05), mats.dark);
      this.crank.add(pedal); this.pedals.push(pedal);
      arm.userData.s = s; pedal.userData.s = s; this['arm' + s] = arm;
    }

    // ---- steering assembly: fork, front wheel, fender, bars, basket, bell, lamp
    const steer = this.steer = new THREE.Group();
    steer.position.copy(B.headBot);
    lean.add(steer);
    const rel = v => v.clone().sub(B.headBot);
    const sf = [];
    const ax = B.axis;
    const crown = V(0, 0, 0);
    const hubRel = rel(B.front);
    for (const s of [-1, 1]) sf.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 0.03, 0.0, 0), V(s * 0.045, -0.12, 0.05), V(s * 0.05, hubRel.y, hubRel.z)]), 12, 0.013, 8));
    const crownG = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10); crownG.rotateZ(Math.PI / 2); sf.push(crownG);
    const stemTop = ax.clone().multiplyScalar(0.27).add(V(0, 0, 0));
    sf.push(tubeGeo(crown, stemTop, 0.016));
    // swept-back cruiser bars
    const st = stemTop.clone();
    for (const s of [-1, 1]) {
      sf.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        st.clone().add(V(0, 0, 0)), st.clone().add(V(s * 0.1, 0.012, -0.004)), st.clone().add(V(s * 0.2, 0.03, -0.06)), st.clone().add(V(s * 0.25, 0.035, -0.15)), st.clone().add(V(s * 0.27, 0.035, -0.2)),
      ]), 16, 0.012, 8));
    }
    steer.add(new THREE.Mesh(merge(sf), new THREE.MeshStandardMaterial({ color: CHROME, metalness: 1, roughness: 0.16 })));
    // grips
    this.grips = [];
    for (const s of [1, -1]) {
      const gp = st.clone().add(V(s * 0.262, 0.035, -0.175));
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.07, 4, 10), mats.leather);
      grip.position.copy(gp); grip.rotation.x = Math.PI / 2; grip.rotation.z = -s * 0.25;
      steer.add(grip); this.grips.push(gp);
    }
    // bell on the left bar
    const bk = new Kit();
    const dome = new THREE.SphereGeometry(0.028, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    bk.add(dome, 0xe6c35a, [0, 0, 0]);
    bk.add(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), CHROME, [0.0, -0.012, 0.0]);
    const bell = this.bell = new THREE.Mesh(bk.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.2 }));
    bell.position.copy(st.clone().add(V(0.15, 0.06, -0.035)));
    steer.add(bell);
    // front wheel + fender
    this.frontWheel = wheel(mats); this.frontWheel.position.copy(hubRel); steer.add(this.frontWheel);
    const ff = fender(mats); ff.position.copy(hubRel); ff.rotation.x = 0.55; steer.add(ff);
    // basket, mounted on the bars and the fork
    const basket = new THREE.Group();
    basket.position.copy(st.clone().add(V(0, -0.11, 0.17)));
    const bw = 0.32, bh = 0.2, bd = 0.24;
    const sideG = new THREE.PlaneGeometry(1, 1);
    const addPanel = (w, h, p, ry, rx = 0) => { const m = new THREE.Mesh(sideG, mats.basket); m.scale.set(w, h, 1); m.position.set(...p); m.rotation.set(rx, ry, 0); basket.add(m); };
    addPanel(bw, bh, [0, 0, bd / 2], 0); addPanel(bw, bh, [0, 0, -bd / 2], 0); addPanel(bd, bh, [bw / 2, 0, 0], Math.PI / 2); addPanel(bd, bh, [-bw / 2, 0, 0], Math.PI / 2); addPanel(bw, bd, [0, -bh / 2, 0], 0, Math.PI / 2);
    const rimG = new THREE.TorusGeometry(1, 0.012, 6, 4); rimG.rotateX(Math.PI / 2); rimG.rotateY(Math.PI / 4);
    const rim = new THREE.Mesh(rimG, new THREE.MeshStandardMaterial({ color: 0x9a6a36, roughness: 0.7 }));
    rim.scale.set(bw / Math.SQRT2, 1, bd / Math.SQRT2); rim.position.y = bh / 2; basket.add(rim);
    // milk bottle (奶!) + sunflowers
    const ck = new Kit();
    const bottle = new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.12], [0.03, 0.16], [0.022, 0.19], [0.022, 0.205], [0, 0.205]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
    ck.add(bottle, 0xfbfaf4, [-0.06, -0.09, -0.02]);
    ck.add(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 16), 0x4a8fd8, [-0.06, 0.125, -0.02]);
    ck.add(new THREE.CylinderGeometry(0.0435, 0.0435, 0.045, 18, 1, true), 0x4a8fd8, [-0.06, -0.02, -0.02]);
    for (let i = 0; i < 3; i++) {
      const fx = 0.05 + i * 0.035, fz = -0.04 + i * 0.04, fh = 0.2 + i * 0.04, tilt = (i - 1) * 0.25;
      ck.add(new THREE.CylinderGeometry(0.005, 0.005, fh, 5), 0x4f8a2e, [fx, -0.08 + fh / 2, fz], [0, 0, tilt]);
      const head = [fx - Math.sin(tilt) * fh, -0.08 + Math.cos(tilt) * fh, fz];
      const pet = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12); ck.add(pet, 0xffc21a, head, [Math.PI / 2 - 0.4, 0, tilt]);
      const ctr = new THREE.CylinderGeometry(0.02, 0.02, 0.016, 10); ck.add(ctr, 0x5a3a18, [head[0], head[1], head[2] + 0.004], [Math.PI / 2 - 0.4, 0, tilt]);
      ck.add(new THREE.SphereGeometry(0.02, 6, 4), 0x5b9a35, [fx + 0.02, -0.02 + i * 0.03, fz], [0, 0, 0], [1.4, 0.4, 0.8]);
    }
    basket.add(new THREE.Mesh(ck.build(), mats.props));
    // headlamp on the front of the basket
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 16), new THREE.MeshStandardMaterial({ color: CHROME, metalness: 1, roughness: 0.2 }));
    lampBody.rotation.x = Math.PI / 2; lampBody.position.set(0, -0.02, bd / 2 + 0.03); basket.add(lampBody);
    const lens = this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), mats.lamp);
    lens.position.set(0, -0.02, bd / 2 + 0.056); basket.add(lens);
    steer.add(basket);
    this.lampAnchor = new THREE.Object3D(); this.lampAnchor.position.set(0, -0.02, bd / 2 + 0.06); basket.add(this.lampAnchor);
    this.lampTarget = new THREE.Object3D(); this.lampTarget.position.set(0, -0.6, 6); basket.add(this.lampTarget);
    // basket struts down to the fork
    for (const s of [-1, 1]) steer.add(new THREE.Mesh(tubeGeo(basket.position.clone().add(V(s * 0.1, -bh / 2, 0.05)), V(s * 0.05, hubRel.y + 0.02, hubRel.z), 0.005, 6), mats.chrome));

    lean.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.basket = basket;

    // ---- rider
    const r = this.rider = new Naiwa({ variant: 'yellow' });
    lean.add(r.root);
    r.body.position.set(0, 0.49, -0.19);
    r.body.rotation.x = 0.07;
    this.handsOnBars = 1;
    this.crankAngle = 0;
    this.steerAngle = 0;
    this.update(0, 0, 0, 0);
  }

  // phase: crank angle (rad); steer: handlebar angle (rad); bob: rider bounce 0..1;
  // hug: 0 = hands on the bars, 1 = hugging the belly.
  update(phase, steer, t, hug = 0) {
    const B = BIKE;
    // simple, explicit crank geometry
    for (const s of [1, -1]) {
      const a = phase + (s > 0 ? 0 : Math.PI);
      const arm = this['arm' + s];
      arm.position.set(s * 0.066, Math.sin(a) * B.crank / 2, Math.cos(a) * B.crank / 2);
      arm.rotation.set(-a, 0, 0);
    }
    for (const p of this.pedals) {
      const s = p.userData.s, a = phase + (s > 0 ? 0 : Math.PI);
      p.position.set(s * 0.108, Math.sin(a) * B.crank, Math.cos(a) * B.crank);
      p.rotation.set(0.12 * Math.sin(a), 0, 0);
    }
    this.steerAngle = steer;
    this.steer.quaternion.setFromAxisAngle(B.axis, steer);

    // rider
    const r = this.rider;
    const bounce = Math.abs(Math.sin(phase)) * 0.006;
    r.body.position.set(Math.sin(phase) * 0.004, 0.49 + bounce, -0.19);
    r.body.rotation.set(0.07 + hug * -0.05, Math.sin(phase) * 0.025 * (1 - hug), Math.sin(phase) * 0.02 * (1 - hug));
    // feet on the pedals
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const a = phase + (s > 0 ? 0 : Math.PI);
      const pedal = new THREE.Vector3(s * 0.12, B.bb.y + Math.sin(a) * B.crank + 0.034, B.bb.z + Math.cos(a) * B.crank - 0.01);
      const fwd = new THREE.Vector3(s * 0.12, -0.22 - 0.12 * Math.sin(a), 1);
      r.leg(side, pedal, new THREE.Vector3(s * 0.75, 0.35, 0.6), fwd);
    }
    // hands: on the grips, or hugging
    const grips = this.grips.map(g => g.clone().applyQuaternion(this.steer.quaternion).add(this.steer.position));
    if (hug < 1) {
      for (const [i, side, s] of [[0, 'L', 1], [1, 'R', -1]]) {
        r.arm(side, grips[i], new THREE.Vector3(s * 0.9, -0.5, -0.2), new THREE.Vector3(0, 1, 0.3));
      }
    }
    if (hug > 0) {
      if (hug >= 1) r.hug(t);
      else {
        // blend: aim halfway between the bars and the belly
        for (const [i, side, s] of [[0, 'L', 1], [1, 'R', -1]]) {
          const belly = r.anchor(new THREE.Vector3(s * 0.17, 0.27, 0.27), new THREE.Vector3());
          const tgt = grips[i].clone().lerp(belly, hug);
          r.arm(side, tgt, new THREE.Vector3(s * 0.9, -0.5, -0.2), new THREE.Vector3(0, 1, 0.3));
        }
      }
    }
  }

  spin(rearAngle, frontAngle) {
    this.rearWheel.rotation.x = rearAngle;
    this.frontWheel.rotation.x = frontAngle;
  }

  // first-person eye point in bike space
  eye(out) { return this.rider.anchor(new THREE.Vector3(0, 0.69, 0.2), out); }
}

function merge(list) {
  const ps = list.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; });
  return THREE.mergeGeometries(ps);
}
