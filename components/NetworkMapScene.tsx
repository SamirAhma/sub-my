"use client";

import { Billboard } from "@react-three/drei/core/Billboard";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Grid } from "@react-three/drei/core/Grid";
import { Html } from "@react-three/drei/web/Html";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { getStation, isTerminus, lines, mapLabel, stations } from "@/lib/rail-data";
import type { LabelAnchor, LineId, RouteSegment } from "@/lib/types";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

const SCALE = 0.105;
const BASE_LIFT = 8;
const LIFT_STEP = 10;
const CORE_RADIUS = 1.15;
const ACTIVE_RADIUS = 1.9;
const ACTIVE_RAISE = 2.4;
/** Degrees above the horizon. Low enough that the ground plane foreshortens. */
const ELEVATION = THREE.MathUtils.degToRad(26);
const YAW = 0.55;
const FOV = 52;
/** Steepest allowed look is still oblique, never overhead. */
const MIN_POLAR = 0.86;
/** Lowest glance, just above the ground plane. */
const MAX_POLAR = 1.42;

const ANCHOR_TRANSFORM: Record<LabelAnchor, string> = {
  n: "translate(-50%, calc(-100% - 8px))",
  ne: "translate(6px, calc(-100% - 2px))",
  e: "translate(10px, -50%)",
  se: "translate(6px, 6px)",
  s: "translate(-50%, 10px)",
  sw: "translate(calc(-100% - 6px), 6px)",
  w: "translate(calc(-100% - 10px), -50%)",
  nw: "translate(calc(-100% - 6px), calc(-100% - 2px))",
};

const LABEL_HALO =
  "0 0 2px #07090d, 0 0 3px #07090d, 1px 0 0 #07090d, -1px 0 0 #07090d, 0 1px 0 #07090d, 0 -1px 0 #07090d, 1px 1px 0 #07090d, -1px -1px 0 #07090d, 1px -1px 0 #07090d, -1px 1px 0 #07090d";

const lineLift = new Map(lines.map((line, index) => [line.id, BASE_LIFT + index * LIFT_STEP]));

export interface NetworkMapSceneProps {
  originId: string | null;
  destinationId: string | null;
  segments: RouteSegment[];
  transferIds: string[];
  hint: string;
  onSelectStation: (id: string) => void;
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

interface MapLayout {
  cx: number;
  cy: number;
  halfW: number;
  halfD: number;
  northZ: number;
}

function segmentKey(lineId: LineId, fromId: string, toId: string): string {
  return `${lineId}|${fromId}|${toId}`;
}

function shade(hex: string, factor: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(factor);
  return `#${color.getHexString()}`;
}

function project(x: number, y: number, lift: number, layout: MapLayout): Projected {
  return {
    x: (x - layout.cx) * SCALE,
    y: lift,
    z: (y - layout.cy) * SCALE,
  };
}

function useTube(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number) {
  const geometry = useMemo(() => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz));
    return new THREE.TubeGeometry(curve, 1, radius, 10, false);
  }, [ax, ay, az, bx, by, bz, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function RailSegment({
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  radius,
  color,
  glow,
}: {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  radius: number;
  color: string;
  glow: number;
}) {
  const core = useTube(ax, ay, az, bx, by, bz, radius);
  const halo = useTube(ax, ay, az, bx, by, bz, radius * 2.15);
  const streak = useTube(ax, ay, az, bx, by, bz, radius * 0.28);
  const lit = glow > 0.3;

  return (
    <group>
      <mesh geometry={halo}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={glow}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={core}>
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {lit && (
        <mesh geometry={streak}>
          <meshBasicMaterial color="#fff6ee" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function FrameCamera({
  layout,
  controlsRef,
  onPose,
}: {
  layout: MapLayout;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onPose: (position: THREE.Vector3, target: THREE.Vector3) => void;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const framed = useRef(new WeakSet<object>());

  useLayoutEffect(() => {
    if (size.width < 16 || size.height < 16) return;
    const controls = controlsRef.current;
    if (!controls || framed.current.has(controls)) return;

    const stackTop = BASE_LIFT + (lines.length - 1) * LIFT_STEP + ACTIVE_RAISE;
    const target = new THREE.Vector3(0, stackTop * 0.46, 0);
    const heading = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
    const corners: THREE.Vector3[] = [];
    for (const x of [-layout.halfW - 8, layout.halfW + 8]) {
      for (const z of [-layout.halfD - 8, layout.halfD + 8]) {
        corners.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, stackTop, z));
      }
    }
    const probe = new THREE.Vector3();

    const place = (dist: number) => {
      const horiz = Math.cos(ELEVATION) * dist;
      camera.position.set(target.x + heading.x * horiz, target.y + Math.sin(ELEVATION) * dist, target.z + heading.z * horiz);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };

    const fits = (dist: number) => {
      place(dist);
      camera.updateProjectionMatrix();
      for (const corner of corners) {
        probe.copy(corner).project(camera);
        if (probe.z < -1 || probe.z > 1) return false;
        if (Math.abs(probe.x) > 0.92 || Math.abs(probe.y) > 0.88) return false;
      }
      return true;
    };

    camera.fov = FOV;
    let lo = 30;
    let hi = 700;
    if (!fits(hi)) hi = 1400;
    for (let step = 0; step < 20; step += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    place(hi);
    camera.near = 0.35;
    camera.far = hi * 14;
    camera.updateProjectionMatrix();

    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = hi * 0.95;
      fog.far = hi * 3.1;
    }

    controls.target.copy(target);
    controls.minDistance = hi * 0.42;
    controls.maxDistance = hi * 2.6;
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.enableDamping = false;
    controls.update();
    place(hi);
    controls.enableDamping = true;
    controls.saveState();
    onPose(camera.position.clone(), target.clone());
    framed.current.add(controls);
  }, [camera, controlsRef, layout.halfD, layout.halfW, onPose, scene, size.height, size.width]);

  return null;
}

function DragGate({ dragged }: { dragged: MutableRefObject<boolean> }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const el = gl.domElement;
    const release = el.releasePointerCapture.bind(el);
    el.releasePointerCapture = (pointerId: number) => {
      if (!el.hasPointerCapture(pointerId)) return;
      release(pointerId);
    };
    let down = 0;
    let x = 0;
    let y = 0;
    const onDown = (event: PointerEvent) => {
      if (down === 0) {
        x = event.clientX;
        y = event.clientY;
        dragged.current = false;
      }
      down += 1;
    };
    const onMove = (event: PointerEvent) => {
      if (down === 0) return;
      if (Math.hypot(event.clientX - x, event.clientY - y) > 5) dragged.current = true;
    };
    const onUp = () => {
      down = Math.max(0, down - 1);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.releasePointerCapture = release;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [dragged, gl]);
  return null;
}

function CursorSync({ hovered }: { hovered: string | null }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.domElement.style.cursor = hovered ? "pointer" : "grab";
    return () => {
      gl.domElement.style.cursor = "";
    };
  }, [gl, hovered]);
  return null;
}

function MapScene({
  originId,
  destinationId,
  segments,
  transferIds,
  onSelectStation,
  controlsRef,
  onPose,
}: NetworkMapSceneProps & { controlsRef: RefObject<OrbitControlsImpl | null>; onPose: (position: THREE.Vector3, target: THREE.Vector3) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const dragged = useRef(false);

  const layout = useMemo<MapLayout>(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const station of stations) {
      minX = Math.min(minX, station.x);
      maxX = Math.max(maxX, station.x);
      minY = Math.min(minY, station.y);
      maxY = Math.max(maxY, station.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      cx,
      cy,
      halfW: ((maxX - minX) * SCALE) / 2,
      halfD: ((maxY - minY) * SCALE) / 2,
      northZ: (minY - cy) * SCALE,
    };
  }, []);

  const activeKeys = useMemo(
    () => new Set(segments.map((segment) => segmentKey(segment.lineId, segment.fromId, segment.toId))),
    [segments],
  );
  const transferSet = useMemo(() => new Set(transferIds), [transferIds]);
  const routeActive = segments.length > 0;

  const drawn = useMemo(() => {
    const tracks: {
      key: string;
      ax: number;
      ay: number;
      az: number;
      bx: number;
      by: number;
      bz: number;
      color: string;
      active: boolean;
    }[] = [];
    const joints: { key: string; x: number; y: number; z: number; color: string; active: boolean }[] = [];

    for (const line of lines) {
      const lift = lineLift.get(line.id) ?? BASE_LIFT;
      line.stations.forEach((id, index) => {
        const prev = index > 0 ? line.stations[index - 1] : null;
        const next = index < line.stations.length - 1 ? line.stations[index + 1] : null;
        const active =
          (prev !== null && (activeKeys.has(segmentKey(line.id, prev, id)) || activeKeys.has(segmentKey(line.id, id, prev)))) ||
          (next !== null && (activeKeys.has(segmentKey(line.id, id, next)) || activeKeys.has(segmentKey(line.id, next, id))));
        const point = project(getStation(id).x, getStation(id).y, lift, layout);
        joints.push({ key: `${line.id}-${id}`, ...point, color: line.color, active });
      });
      for (let index = 0; index < line.stations.length - 1; index += 1) {
        const fromId = line.stations[index];
        const toId = line.stations[index + 1];
        const from = getStation(fromId);
        const to = getStation(toId);
        const start = project(from.x, from.y, lift, layout);
        const end = project(to.x, to.y, lift, layout);
        const active = activeKeys.has(segmentKey(line.id, fromId, toId)) || activeKeys.has(segmentKey(line.id, toId, fromId));
        tracks.push({
          key: `${line.id}-${fromId}-${toId}`,
          ax: start.x,
          ay: start.y,
          az: start.z,
          bx: end.x,
          by: end.y,
          bz: end.z,
          color: line.color,
          active,
        });
      }
    }
    return { tracks, joints };
  }, [activeKeys, layout]);

  function labelVisible(id: string): boolean {
    if (id === originId || id === destinationId) return false;
    if (hovered === id || transferSet.has(id)) return true;
    const station = getStation(id);
    return station.lines.length > 1 || isTerminus(id) || Boolean(station.label);
  }

  function selectStation(event: ThreeEvent<MouseEvent>, id: string) {
    event.stopPropagation();
    if (dragged.current) return;
    onSelectStation(id);
  }

  const plateW = layout.halfW * 2 + 36;
  const plateD = layout.halfD * 2 + 36;

  return (
    <>
      <color attach="background" args={["#080b10"]} />
      <fog attach="fog" args={["#080b10", 480, 1400]} />
      <FrameCamera layout={layout} controlsRef={controlsRef} onPose={onPose} />
      <DragGate dragged={dragged} />
      <CursorSync hovered={hovered} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[plateW + 90, plateD + 90]} />
        <meshBasicMaterial color="#0c121a" />
      </mesh>
      <Grid
        position={[0, 0.12, 0]}
        args={[Math.max(plateW, plateD) + 140, Math.max(plateW, plateD) + 140]}
        cellSize={6}
        cellThickness={0.7}
        cellColor="#2c3e52"
        sectionSize={30}
        sectionThickness={1.15}
        sectionColor="#5b738c"
        fadeDistance={520}
        fadeStrength={1.15}
        side={THREE.DoubleSide}
      />

      <Html position={[0, 3.2, layout.northZ - 6]} zIndexRange={[4, 0]} wrapperClass="rail-label" style={{ pointerEvents: "none" }}>
        <span
          style={{
            transform: "translate(-50%, -50%)",
            display: "block",
            color: "rgba(255,255,255,0.38)",
            fontSize: 12,
            letterSpacing: "0.24em",
            fontFamily: "var(--font-sans), sans-serif",
            textShadow: LABEL_HALO,
          }}
        >
          N
        </span>
      </Html>

      {drawn.tracks
        .filter((track) => !track.active)
        .map((track) => (
          <RailSegment
            key={track.key}
            ax={track.ax}
            ay={track.ay}
            az={track.az}
            bx={track.bx}
            by={track.by}
            bz={track.bz}
            radius={CORE_RADIUS}
            color={routeActive ? shade(track.color, 0.4) : track.color}
            glow={routeActive ? 0.07 : 0.2}
          />
        ))}

      {drawn.joints
        .filter((joint) => !joint.active)
        .map((joint) => (
          <mesh key={joint.key} position={[joint.x, joint.y, joint.z]}>
            <sphereGeometry args={[CORE_RADIUS * 1.15, 12, 12]} />
            <meshBasicMaterial color={routeActive ? shade(joint.color, 0.4) : joint.color} toneMapped={false} />
          </mesh>
        ))}

      {drawn.tracks
        .filter((track) => track.active)
        .map((track) => (
          <RailSegment
            key={`${track.key}-live`}
            ax={track.ax}
            ay={track.ay + ACTIVE_RAISE}
            az={track.az}
            bx={track.bx}
            by={track.by + ACTIVE_RAISE}
            bz={track.bz}
            radius={ACTIVE_RADIUS}
            color={track.color}
            glow={0.5}
          />
        ))}

      {drawn.joints
        .filter((joint) => joint.active)
        .map((joint) => (
          <mesh key={`${joint.key}-live`} position={[joint.x, joint.y + ACTIVE_RAISE, joint.z]}>
            <sphereGeometry args={[ACTIVE_RADIUS * 1.12, 14, 14]} />
            <meshBasicMaterial color={joint.color} toneMapped={false} />
          </mesh>
        ))}

      {stations.map((station) => {
        const y = Math.max(...station.lines.map((id) => lineLift.get(id) ?? BASE_LIFT));
        const point = project(station.x, station.y, y, layout);
        const interchange = station.lines.length > 1;
        const emphasized = station.id === originId || station.id === destinationId || transferSet.has(station.id);
        const radius = (interchange ? 1.85 : 1.25) + (hovered === station.id ? 0.28 : 0);
        const fill = interchange ? "#f5f5f4" : (lines.find((line) => line.id === station.lines[0])?.color ?? "#fafafa");
        return (
          <group key={station.id} position={[point.x, point.y, point.z]}>
            {emphasized && (
              <Billboard>
                <mesh>
                  <ringGeometry args={[radius + 0.7, radius + 1.15, 28]} />
                  <meshBasicMaterial color={fill} transparent opacity={0.9} side={THREE.DoubleSide} toneMapped={false} />
                </mesh>
              </Billboard>
            )}
            <mesh>
              <sphereGeometry args={[radius + 0.2, 18, 18]} />
              <meshBasicMaterial color="#07090d" />
            </mesh>
            <mesh>
              <sphereGeometry args={[radius, 18, 18]} />
              <meshBasicMaterial color={fill} toneMapped={false} />
            </mesh>
            <mesh
              name={station.id}
              onClick={(event) => selectStation(event, station.id)}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(station.id);
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                setHovered((current) => (current === station.id ? null : current));
              }}
            >
              <sphereGeometry args={[3.1, 10, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {labelVisible(station.id) && (
              <Html position={[0, 0.4, 0]} zIndexRange={[8, 0]} wrapperClass="rail-label" style={{ pointerEvents: "none" }}>
                <span
                  style={{
                    transform: ANCHOR_TRANSFORM[station.anchor ?? "n"],
                    display: "block",
                    color: interchange || transferSet.has(station.id) ? "#fafafa" : "#e4e4e7",
                    fontSize: interchange ? 12 : 11,
                    fontWeight: interchange || hovered === station.id ? 600 : 500,
                    fontFamily: "var(--font-sans), sans-serif",
                    whiteSpace: "nowrap",
                    textShadow: LABEL_HALO,
                    lineHeight: 1.15,
                  }}
                >
                  {hovered === station.id ? station.name : mapLabel(station)}
                </span>
              </Html>
            )}
          </group>
        );
      })}

      <EndpointMarker id={originId} letter="A" fill="#ffffff" color="#111111" hovered={hovered} layout={layout} />
      <EndpointMarker id={destinationId} letter="B" fill="#E5007D" color="#ffffff" hovered={hovered} layout={layout} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.85}
        zoomSpeed={0.75}
        panSpeed={0.75}
        enablePan
        minPolarAngle={MIN_POLAR}
        maxPolarAngle={MAX_POLAR}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
    </>
  );
}

function EndpointMarker({
  id,
  letter,
  fill,
  color,
  hovered,
  layout,
}: {
  id: string | null;
  letter: string;
  fill: string;
  color: string;
  hovered: string | null;
  layout: MapLayout;
}) {
  if (!id) return null;
  const station = getStation(id);
  const lift = Math.max(...station.lines.map((lineId) => lineLift.get(lineId) ?? BASE_LIFT));
  const point = project(station.x, station.y, lift + 1.4, layout);
  const label = hovered === id ? station.name : mapLabel(station);
  return (
    <Html position={[point.x, point.y, point.z]} zIndexRange={[10, 0]} wrapperClass="rail-label" style={{ pointerEvents: "none" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, transform: "translate(-4px, calc(-100% - 12px))" }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: fill,
            color,
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 0 0 2px #07090d",
            fontFamily: "var(--font-sans), sans-serif",
            flex: "0 0 auto",
          }}
        >
          {letter}
        </span>
        <span
          style={{
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-sans), sans-serif",
            textShadow: LABEL_HALO,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </span>
    </Html>
  );
}

function zoomBy(controls: OrbitControlsImpl | null, factor: number) {
  if (!controls) return;
  const offset = new THREE.Vector3().copy(controls.object.position).sub(controls.target);
  const next = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance || 1, controls.maxDistance || 4000);
  offset.setLength(next);
  controls.object.position.copy(controls.target).add(offset);
  controls.update();
}

export function NetworkMapScene({ originId, destinationId, segments, transferIds, hint, onSelectStation }: NetworkMapSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const poseRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const showRotateHint = !hint.toLowerCase().includes("rotate");

  const rememberPose = useMemo(
    () => (position: THREE.Vector3, target: THREE.Vector3) => {
      poseRef.current = { position: position.clone(), target: target.clone() };
    },
    [],
  );

  function resetView() {
    const controls = controlsRef.current;
    const pose = poseRef.current;
    if (!controls || !pose) {
      controls?.reset();
      return;
    }
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(pose.target);
    controls.object.position.copy(pose.position);
    controls.object.zoom = 1;
    controls.object.updateProjectionMatrix();
    controls.update();
    controls.saveState();
    controls.enableDamping = true;
  }

  return (
    <div
      role="group"
      aria-label="Kuala Lumpur rail map"
      className="relative h-full w-full overflow-hidden bg-[#080b10] touch-none"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        camera={{ fov: FOV, near: 0.35, far: 5000, position: [78, 62, 168] }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
      >
        <MapScene
          originId={originId}
          destinationId={destinationId}
          segments={segments}
          transferIds={transferIds}
          hint={hint}
          onSelectStation={onSelectStation}
          controlsRef={controlsRef}
          onPose={rememberPose}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.38)_100%)]" />

      <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[18rem] rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-xs text-zinc-200 backdrop-blur-md">
        <p>{hint}</p>
        {showRotateHint && <p className="mt-1 text-[11px] text-zinc-400">Drag to rotate the map</p>}
      </div>

      <ul className="pointer-events-none absolute bottom-3 left-3 z-20 hidden flex-col gap-1 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 text-[11px] text-zinc-200 backdrop-blur-md lg:flex">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-2">
            <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: line.color, boxShadow: `0 0 8px ${line.color}` }} />
            <span>
              {line.code} · {line.name}
            </span>
          </li>
        ))}
      </ul>

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomBy(controlsRef.current, 0.8)}>
          <Plus className="h-4 w-4" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(controlsRef.current, 1.25)}>
          <Minus className="h-4 w-4" />
        </MapButton>
        <MapButton label="Reset map view" onClick={resetView}>
          <LocateFixed className="h-4 w-4" />
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-black/60 p-2 text-zinc-100 backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
    </button>
  );
}
