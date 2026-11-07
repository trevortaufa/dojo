"use client";

import { Line, QuadraticBezierLine, Text } from "@react-three/drei";
import { Canvas, type CanvasProps, events as createEvents, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildHall, clampToHall, EYE, HALL, START, type Plaque, type Wing } from "@/lib/hall";
import { MAX_MASTERY, type Skill, type Status } from "@/lib/types";

const FONT = "/fonts/Geist-Regular.ttf";
const SPEED = 3.2;
/** How close (metres) you need to stand to a scroll's reading spot for it to unroll. */
const NEAR = 2.2;

/* Paper and ink. */
const PAPER = "#f2e8d2";
const INK = "#2a1f16";
const INK_STATUS: Record<Status, string> = {
  locked: "#a39a88",
  open: "#c0392b",
  learning: "#2c4f8a",
  mastered: "#b8860b",
};

/** Shared between the player, the floor and the scrolls. */
interface Nav {
  /** Floor point to walk to. */
  target: { x: number; z: number } | null;
  /** Point to turn and look at. */
  face: THREE.Vector3 | null;
  /** True once the current press has moved enough to count as a look-drag, so it isn't also a click. */
  dragged: boolean;
}

export interface HallProps {
  skills: Skill[];
  belt: { name: string; color: string };
  selected: string | null;
  onSelect: (id: string) => void;
  /** Bump `n` to walk to an area's scroll. */
  goTo: { area: string; n: number } | null;
  onNear: (area: string | null) => void;
}

/** Clicks and hovers aim from the cursor, or from the middle of the screen while the mouse is captured for looking. */
const aimEvents: CanvasProps["events"] = (store) => ({
  ...createEvents(store),
  compute(event, state) {
    if (document.pointerLockElement === state.gl.domElement) state.pointer.set(0, 0);
    else state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
    state.raycaster.setFromCamera(state.pointer, state.camera);
  },
});

export default function HallScene(props: HallProps) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement instanceof HTMLCanvasElement);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);
  // Picking a skill opens a panel, and you need the cursor back to use it.
  useEffect(() => {
    if (props.selected) document.exitPointerLock();
  }, [props.selected]);

  return (
    <>
      <Canvas
        camera={{ fov: 70, near: 0.05, far: 60, position: [START.x, EYE, START.z] }}
        dpr={[1, 2]}
        events={aimEvents}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#1a120c"]} />
        <fog attach="fog" args={["#1a120c", 14, 32]} />
        <Hall {...props} />
      </Canvas>
      {locked && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 ring-1 ring-black/40" />
      )}
    </>
  );
}

function Hall({ skills, belt, selected, onSelect, goTo, onNear }: HallProps) {
  const navRef = useRef<Nav>({ target: null, face: null, dragged: false });
  const { wings, cords } = useMemo(() => buildHall(skills), [skills]);
  // Which scroll you're standing at. The player checks every frame, so only pass on changes.
  const [near, setNearState] = useState<string | null>(null);
  const nearRef = useRef<string | null>(null);
  const setNear = useCallback(
    (area: string | null) => {
      if (nearRef.current === area) return;
      nearRef.current = area;
      setNearState(area);
      onNear(area);
    },
    [onNear],
  );

  const walkTo = (wing: Wing) => {
    navRef.current.target = wing.front;
    navRef.current.face = new THREE.Vector3(...wing.position);
  };

  useEffect(() => {
    const wing = goTo && wings.find((w) => w.area === goTo.area);
    if (wing) walkTo(wing);
    // Only when a new walk is asked for, not when the tree refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo]);

  return (
    <>
      <ambientLight intensity={0.55} color="#fff1dc" />
      <hemisphereLight args={["#ffe9c4", "#3a2412", 0.6]} />
      <Room />
      <Lanterns />
      <Floor navRef={navRef} />
      <BeltDisplay belt={belt} />
      <Weapons />
      <Gis />
      {wings.map((w) => (
        <Scroll key={w.area} wing={w} active={near === w.area} selected={selected} onSelect={onSelect} onWalk={() => walkTo(w)} navRef={navRef} />
      ))}
      {cords.map(({ from, to }) => (
        <QuadraticBezierLine
          key={`${from.area}-${to.area}`}
          start={cordEnd(from)}
          end={cordEnd(to)}
          mid={cordEnd(from).lerp(cordEnd(to), 0.5).add(new THREE.Vector3(0, -0.9, 0))}
          color="#b3261e"
          lineWidth={2}
        />
      ))}
      <Player navRef={navRef} wings={wings} onNear={setNear} />
    </>
  );
}

/** The top corner of a scroll's rod, nudged off the wall, where a cord is tied. */
function cordEnd(w: Wing) {
  const out = new THREE.Vector3(0, 0, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), w.rotY);
  return new THREE.Vector3(...w.position).add(new THREE.Vector3(0, 1.5, 0)).add(out);
}

/* ───────────── Walking ───────────── */

/** W A S D walk and strafe; the arrow keys turn and tilt the view. */
const KEYS: Record<string, "f" | "b" | "l" | "r" | "turnL" | "turnR" | "up" | "down"> = {
  KeyW: "f",
  KeyS: "b",
  KeyA: "l",
  KeyD: "r",
  ArrowLeft: "turnL",
  ArrowRight: "turnR",
  ArrowUp: "up",
  ArrowDown: "down",
};
/** Radians per second the arrow keys turn the view. */
const TURN_SPEED = 1.8;
/** Radians the view turns per pixel of mouse movement. */
const MOUSE_SENS = 0.0025;

function Player({ navRef, wings, onNear }: { navRef: RefObject<Nav>; wings: Wing[]; onNear: (a: string | null) => void }) {
  const gl = useThree((s) => s.gl);
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const pos = useRef({ x: START.x, z: START.z });

  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    let travelled = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        // The first click only captures the mouse for looking; it shouldn't also walk or pick a skill.
        const captured = document.pointerLockElement === el;
        navRef.current.dragged = !captured;
        if (!captured) Promise.resolve(el.requestPointerLock()).catch(() => {});
        return;
      }
      last = { x: e.clientX, y: e.clientY };
      travelled = 0;
      navRef.current.dragged = false;
    };
    const onMove = (e: PointerEvent) => {
      if (document.pointerLockElement === el) {
        if (!e.movementX && !e.movementY) return;
        navRef.current.face = null;
        // Mouse-look: move right to turn right, up to look up.
        look.current.yaw -= e.movementX * MOUSE_SENS;
        look.current.pitch = Math.max(-0.7, Math.min(0.7, look.current.pitch - e.movementY * MOUSE_SENS));
        return;
      }
      // Touch screens have no mouse to capture, so they still drag to look.
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled < 6) return;
      navRef.current.dragged = true;
      navRef.current.face = null;
      // Grab-and-drag: pulling the view right turns you left, like dragging a photo sphere.
      look.current.yaw += dx * 0.004;
      look.current.pitch = Math.max(-0.7, Math.min(0.7, look.current.pitch + dy * 0.004));
    };
    const onUp = () => (last = null);

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.type === "keydown") keys.current.add(k);
      else keys.current.delete(k);
    };
    const onBlur = () => keys.current.clear();

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [gl, navRef]);

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    const p = pos.current;
    const l = look.current;
    const forward = (k.has("f") ? 1 : 0) - (k.has("b") ? 1 : 0);
    const right = (k.has("r") ? 1 : 0) - (k.has("l") ? 1 : 0);
    const turn = (k.has("turnL") ? 1 : 0) - (k.has("turnR") ? 1 : 0);
    const tilt = (k.has("up") ? 1 : 0) - (k.has("down") ? 1 : 0);

    if (turn || tilt) {
      navRef.current.face = null;
      l.yaw += turn * TURN_SPEED * dt;
      l.pitch = Math.max(-0.7, Math.min(0.7, l.pitch + tilt * TURN_SPEED * 0.6 * dt));
    }

    if (forward || right) {
      // Keys take over from any click-to-walk in progress.
      navRef.current.target = null;
      navRef.current.face = null;
      const sin = Math.sin(l.yaw);
      const cos = Math.cos(l.yaw);
      let dx = -sin * forward + cos * right;
      let dz = -cos * forward - sin * right;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      p.x += dx * SPEED * dt;
      p.z += dz * SPEED * dt;
    } else if (navRef.current.target) {
      const t = navRef.current.target;
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const dist = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (dist <= step) {
        p.x = t.x;
        p.z = t.z;
        navRef.current.target = null;
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
      }
    }

    const face = navRef.current.face;
    if (face) {
      const yaw = Math.atan2(-(face.x - p.x), -(face.z - p.z));
      const pitch = Math.atan2(face.y - EYE, Math.hypot(face.x - p.x, face.z - p.z));
      let diff = yaw - l.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // turn the short way round
      const ease = 1 - Math.exp(-6 * dt);
      l.yaw += diff * ease;
      l.pitch += (pitch - l.pitch) * ease;
      if (!navRef.current.target && Math.abs(diff) < 0.005) navRef.current.face = null;
    }

    const c = clampToHall(p.x, p.z);
    p.x = c.x;
    p.z = c.z;
    camera.position.set(p.x, EYE, p.z);
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");

    let nearest: string | null = null;
    let best = NEAR;
    for (const w of wings) {
      const d = Math.hypot(w.front.x - p.x, w.front.z - p.z);
      if (d < best) {
        best = d;
        nearest = w.area;
      }
    }
    onNear(nearest);
  });

  return null;
}

/* ───────────── The room ───────────── */

const WOOD_DARK = "#3b2416";
const WALL = "#e9dfc6";

function Room() {
  const { halfW: w, halfD: d, height: h } = HALL;
  const posts = [-d + 0.1, -4, 2, 8, d - 0.1];
  return (
    <group>
      {/* Ceiling and its beams */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 2, d * 2]} />
        <meshStandardMaterial color="#2a1a10" side={THREE.DoubleSide} />
      </mesh>
      {[-7.5, -2.5, 2.5, 7.5].map((z) => (
        <mesh key={z} position={[0, h - 0.15, z]}>
          <boxGeometry args={[w * 2, 0.3, 0.3]} />
          <meshStandardMaterial color={WOOD_DARK} />
        </mesh>
      ))}

      {/* Walls: left, right, back, front */}
      {[
        { pos: [-w, h / 2, 0], rot: Math.PI / 2, len: d * 2 },
        { pos: [w, h / 2, 0], rot: -Math.PI / 2, len: d * 2 },
        { pos: [0, h / 2, -d], rot: 0, len: w * 2 },
        { pos: [0, h / 2, d], rot: Math.PI, len: w * 2 },
      ].map(({ pos, rot, len }, i) => (
        <group key={i} position={pos as [number, number, number]} rotation={[0, rot, 0]}>
          <mesh>
            <planeGeometry args={[len, h]} />
            <meshStandardMaterial color={WALL} />
          </mesh>
          {/* Dark wood below the rail, like a dojo's lower wall */}
          <mesh position={[0, -h / 2 + 0.45, 0.02]}>
            <boxGeometry args={[len, 0.9, 0.04]} />
            <meshStandardMaterial color="#5a3720" />
          </mesh>
          {[0.9 - h / 2, h / 2 - 0.8].map((y) => (
            <mesh key={y} position={[0, y, 0.05]}>
              <boxGeometry args={[len, 0.12, 0.1]} />
              <meshStandardMaterial color={WOOD_DARK} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Upright posts along both side walls */}
      {posts.flatMap((z) =>
        [-w + 0.1, w - 0.1].map((x) => (
          <mesh key={`${x},${z}`} position={[x, h / 2, z]}>
            <boxGeometry args={[0.22, h, 0.22]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
        )),
      )}

      {/* The doorway behind you */}
      <mesh position={[0, 1.2, d - 0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2.2, 2.4]} />
        <meshStandardMaterial color="#120c08" />
      </mesh>
    </group>
  );
}

/** Wooden floor with a block of tatami mats down the middle. Clicking it walks you there. */
function Floor({ navRef }: { navRef: RefObject<Nav> }) {
  const { halfW: w, halfD: d } = HALL;
  const mats = [];
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 5; row++) {
      mats.push({ x: -2.7 + col * 1.8, z: -7.2 + row * 3.6 });
    }
  }
  const walk = (e: ThreeEvent<MouseEvent>) => {
    if (navRef.current.dragged) return;
    e.stopPropagation();
    navRef.current.target = clampToHall(e.point.x, e.point.z);
    navRef.current.face = null;
  };
  return (
    <group onClick={walk}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 2, d * 2]} />
        <meshStandardMaterial color="#6b4423" roughness={0.85} />
      </mesh>
      {mats.map((m) => (
        <group key={`${m.x},${m.z}`} position={[m.x, 0, m.z]}>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[1.78, 0.04, 3.58]} />
            <meshStandardMaterial color="#2f2d1c" />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[1.64, 0.04, 3.44]} />
            <meshStandardMaterial color="#bdb57c" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Lanterns() {
  return (
    <>
      {[5, -1, -7].map((z) => (
        <group key={z} position={[0, 4.1, z]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.6]} />
            <meshBasicMaterial color="#111" />
          </mesh>
          <mesh scale={[1, 1.25, 1]}>
            <sphereGeometry args={[0.28, 24, 16]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#ffb35c" emissiveIntensity={1.4} />
          </mesh>
          <pointLight color="#ffcf8a" intensity={9} distance={10} decay={1.6} />
        </group>
      ))}
    </>
  );
}

/** Your current belt, hung on the back wall where you walk towards. */
function BeltDisplay({ belt }: { belt: { name: string; color: string } }) {
  const y = 2.4;
  const z = -HALL.halfD + 0.12;
  return (
    <group position={[0, y, z]}>
      <Text font={FONT} position={[0, 1.45, 0]} fontSize={0.42} letterSpacing={0.3} color={INK}>
        DOJO
      </Text>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[2.4, 0.08, 0.1]} />
        <meshStandardMaterial color={WOOD_DARK} />
      </mesh>
      <mesh position={[0, 0.06, 0.04]}>
        <boxGeometry args={[1.8, 0.14, 0.03]} />
        <meshStandardMaterial color={belt.color} />
      </mesh>
      <mesh position={[0, 0.06, 0.07]}>
        <boxGeometry args={[0.2, 0.2, 0.05]} />
        <meshStandardMaterial color={belt.color} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, -0.32, 0.06]} rotation={[0, 0, x * 1.2]}>
          <boxGeometry args={[0.13, 0.65, 0.03]} />
          <meshStandardMaterial color={belt.color} />
        </mesh>
      ))}
      <Text font={FONT} position={[0, -0.95, 0]} fontSize={0.18} color={INK}>
        {belt.name}
      </Text>
    </group>
  );
}

/* ───────────── Weapons ───────────── */

/** A horizontal cylinder of the given length, lying along x and starting at x. */
function Bar({ length, radius, color, x = 0 }: { length: number; radius: number; color: string; x?: number }) {
  return (
    <mesh position={[x + length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[radius, radius, length, 12]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

/** A sheathed katana lying along x: wrapped handle, gold guard, black scabbard. */
function Katana() {
  return (
    <group position={[-0.62, 0, 0]}>
      <Bar length={0.3} radius={0.022} color="#1d1612" />
      {[0.05, 0.12, 0.19, 0.26].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.023, 0.006, 6, 12]} />
          <meshStandardMaterial color="#c9b98a" />
        </mesh>
      ))}
      <mesh position={[0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.012, 20]} />
        <meshStandardMaterial color="#b8892e" metalness={0.7} roughness={0.35} />
      </mesh>
      <Bar x={0.32} length={0.92} radius={0.024} color="#0f0b0a" />
    </group>
  );
}

/** A wooden practice sword. */
function Bokken() {
  return (
    <group position={[-0.55, 0, 0]}>
      <Bar length={0.26} radius={0.02} color="#8a6a3f" />
      <mesh position={[0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.015, 16]} />
        <meshStandardMaterial color="#1d1612" />
      </mesh>
      <Bar x={0.28} length={0.82} radius={0.018} color="#c49a62" />
    </group>
  );
}

/** A long staff. */
function Bo() {
  return <Bar x={-0.9} length={1.8} radius={0.022} color="#7a5230" />;
}

/** A wall rack holding a katana, a bokken and a bo, one above the other. */
function WeaponRack({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  const rows = [
    { y: 0.5, item: <Katana /> },
    { y: 0.15, item: <Bokken /> },
    { y: -0.2, item: <Bo /> },
  ];
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {[-0.45, 0.45].map((x) => (
        <group key={x} position={[x, 0, 0.04]}>
          <mesh>
            <boxGeometry args={[0.08, 1.2, 0.06]} />
            <meshStandardMaterial color={WOOD_DARK} />
          </mesh>
          {rows.map(({ y }) => (
            <mesh key={y} position={[0, y - 0.04, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
              <meshStandardMaterial color="#8b6b3a" />
            </mesh>
          ))}
        </group>
      ))}
      {rows.map(({ y, item }) => (
        <group key={y} position={[0, y, 0.12]}>
          {item}
        </group>
      ))}
    </group>
  );
}

/** Racks either side of the entrance and at the back of each side wall; crossed katanas flank the belt. */
function Weapons() {
  const { halfW: w, halfD: d } = HALL;
  return (
    <>
      {[-4.5, 4.5].map((x) => (
        <WeaponRack key={x} position={[x, 2.2, d - 0.06]} rotY={Math.PI} />
      ))}
      <WeaponRack position={[-w + 0.08, 2.2, -9]} rotY={Math.PI / 2} />
      <WeaponRack position={[w - 0.08, 2.2, -9]} rotY={-Math.PI / 2} />
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 2.45, -d + 0.15]}>
          {[0.6, -0.6].map((tilt, i) => (
            <group key={tilt} rotation={[0, 0, tilt]} position={[0, 0, i * 0.05]}>
              <Katana />
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

/* ───────────── Gis ───────────── */

/** A gi jacket hanging from a wooden hanger, tied with a belt. */
function Gi({ position, rotY, color, beltColor }: { position: [number, number, number]; rotY: number; color: string; beltColor: string }) {
  const trim = color === "#f4f1ea" ? "#d9d3c4" : "#16233f";
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Peg and hanger */}
      <mesh position={[0, 0.5, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.08, 8]} />
        <meshStandardMaterial color={WOOD_DARK} />
      </mesh>
      <mesh position={[0, 0.42, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.7, 10]} />
        <meshStandardMaterial color="#8b6b3a" />
      </mesh>
      {/* Body */}
      <mesh position={[0, 0.02, 0.09]}>
        <boxGeometry args={[0.62, 0.8, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* Sleeves hang down and out from the shoulders */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.42, 0.18, 0.09]} rotation={[0, 0, s * 0.5]}>
          <boxGeometry args={[0.2, 0.5, 0.055]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      {/* Crossed lapels */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, 0.2, 0.125]} rotation={[0, 0, s * 0.45]}>
          <boxGeometry args={[0.06, 0.5, 0.01]} />
          <meshStandardMaterial color={trim} />
        </mesh>
      ))}
      {/* Belt with a knot and tails */}
      <mesh position={[0, -0.12, 0.13]}>
        <boxGeometry args={[0.64, 0.06, 0.02]} />
        <meshStandardMaterial color={beltColor} />
      </mesh>
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} position={[x, -0.25, 0.14]} rotation={[0, 0, x * 3]}>
          <boxGeometry args={[0.05, 0.24, 0.015]} />
          <meshStandardMaterial color={beltColor} />
        </mesh>
      ))}
    </group>
  );
}

/** Gis hung near the entrance, where you'd change before training. */
function Gis() {
  const { halfW: w, halfD: d } = HALL;
  return (
    <>
      <Gi position={[-2.3, 2.0, d - 0.06]} rotY={Math.PI} color="#f4f1ea" beltColor="#111827" />
      <Gi position={[2.3, 2.0, d - 0.06]} rotY={Math.PI} color="#26407a" beltColor="#92400e" />
      <Gi position={[-w + 0.08, 2.0, 9.0]} rotY={Math.PI / 2} color="#f4f1ea" beltColor="#22c55e" />
      <Gi position={[w - 0.08, 2.0, 9.0]} rotY={-Math.PI / 2} color="#f4f1ea" beltColor="#3b82f6" />
    </>
  );
}

/* ───────────── Scrolls ───────────── */

const SCROLL_W = 3.2;
const ROD_TOP = 1.45;
const ROLLED = 0.95;
const OPEN = 2.9;

function Scroll({
  wing,
  active,
  selected,
  onSelect,
  onWalk,
  navRef,
}: {
  wing: Wing;
  active: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onWalk: () => void;
  navRef: RefObject<Nav>;
}) {
  const paper = useRef<THREE.Mesh>(null);
  const rod = useRef<THREE.Group>(null);
  const content = useRef<THREE.Group>(null);
  const unrolled = useRef(0);

  // Unroll when you walk up, roll back up when you leave.
  useFrame((_, dt) => {
    const goal = active ? 1 : 0;
    unrolled.current += (goal - unrolled.current) * (1 - Math.exp(-5 * Math.min(dt, 0.05)));
    const h = ROLLED + (OPEN - ROLLED) * unrolled.current;
    if (paper.current) {
      paper.current.scale.y = h;
      paper.current.position.y = ROD_TOP - h / 2;
    }
    if (rod.current) rod.current.position.y = ROD_TOP - h;
    if (content.current) content.current.visible = unrolled.current > 0.92;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (navRef.current.dragged) return;
    e.stopPropagation();
    if (!active) onWalk();
  };
  const total = wing.plaques.length;

  return (
    <group position={wing.position} rotation={[0, wing.rotY, 0]}>
      <group
        onClick={click}
        onPointerOver={() => !active && (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <mesh ref={paper} position={[0, ROD_TOP - ROLLED / 2, 0]}>
          <planeGeometry args={[SCROLL_W, 1]} />
          <meshStandardMaterial color={PAPER} roughness={1} />
        </mesh>
        <Rod y={ROD_TOP} />
        <group ref={rod}>
          <Rod y={0} />
        </group>
        <Text font={FONT} position={[0, 1.13, 0.01]} fontSize={0.3} color={INK} anchorY="middle">
          {wing.area}
        </Text>
        <Text font={FONT} position={[0, 0.8, 0.01]} fontSize={0.13} color="#7a6a55" anchorY="middle">
          {`${wing.mastered} of ${total} mastered`}
        </Text>
      </group>

      <group ref={content} visible={false}>
        <ScrollLines plaques={wing.plaques} />
        {wing.plaques.map((p) => (
          <SkillMark key={p.skill.id} plaque={p} selected={p.skill.id === selected} onSelect={onSelect} navRef={navRef} />
        ))}
      </group>
    </group>
  );
}

function Rod({ y }: { y: number }) {
  return (
    <group position={[0, y, 0.03]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, SCROLL_W + 0.3, 16]} />
        <meshStandardMaterial color={WOOD_DARK} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (SCROLL_W / 2 + 0.17), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
          <meshStandardMaterial color="#8b6b3a" />
        </mesh>
      ))}
    </group>
  );
}

/** Ink lines from each skill to the ones it builds on, within this scroll. */
function ScrollLines({ plaques }: { plaques: Plaque[] }) {
  const at = new Map(plaques.map((p) => [p.skill.id, p]));
  return (
    <>
      {plaques.flatMap((p) =>
        p.skill.requires
          .map((r) => at.get(r))
          .filter((from): from is Plaque => !!from)
          .map((from) => (
            <Line
              key={`${from.skill.id}-${p.skill.id}`}
              points={[
                [from.x, from.y, 0.005],
                [p.x, p.y, 0.005],
              ]}
              color={from.status === "mastered" ? INK_STATUS.mastered : "#8c7d68"}
              lineWidth={1.5}
            />
          )),
      )}
    </>
  );
}

function SkillMark({
  plaque: { skill, status, x, y },
  selected,
  onSelect,
  navRef,
}: {
  plaque: Plaque;
  selected: boolean;
  onSelect: (id: string) => void;
  navRef: RefObject<Nav>;
}) {
  const color = INK_STATUS[status];
  const ring = (skill.mastery / MAX_MASTERY) * Math.PI * 2;
  return (
    <group
      position={[x, y, 0.01]}
      onClick={(e) => {
        if (navRef.current.dragged) return;
        e.stopPropagation();
        onSelect(skill.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* Bigger invisible target, so small marks are easy to hit. */}
      <mesh>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {status === "locked" ? (
        <mesh>
          <ringGeometry args={[0.06, 0.08, 32]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : (
        <mesh>
          <circleGeometry args={[0.085, 32]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {ring > 0 && (
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.115, 0.14, 48, 1, Math.PI / 2, -ring]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[0.17, 0.185, 48]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
      <Text
        font={FONT}
        position={[0, -0.2, 0.002]}
        fontSize={0.075}
        maxWidth={0.8}
        textAlign="center"
        anchorY="top"
        color={status === "locked" ? "#8c7d68" : INK}
      >
        {skill.title}
      </Text>
    </group>
  );
}
