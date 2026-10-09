"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature, mesh } from "topojson-client";
import isoCountries from "i18n-iso-countries";
import worldTopology from "world-atlas/countries-110m.json";
import type { JobMarketSummary } from "@/lib/jobs/types";

const topology = worldTopology as unknown as {
  objects: { land: unknown; countries: unknown };
};

type GeoFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    id?: string | number;
    geometry: { type: string; coordinates: unknown };
  }>;
};

function createEarthTexture(highlightedCountries: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  // Deep cyber ocean
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#04121f");
  ocean.addColorStop(0.45, "#061a2e");
  ocean.addColorStop(1, "#020b14");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const land = feature(
    worldTopology as never,
    topology.objects.land as never,
  ) as unknown as GeoFeatureCollection;

  ctx.fillStyle = "#0f2a28";
  ctx.strokeStyle = "#1e4a45";
  ctx.lineWidth = 1.2;

  function drawPolygon(rings: unknown[]) {
    ctx.beginPath();
    for (const ringValue of rings) {
      if (!Array.isArray(ringValue)) continue;
      let previousLongitude: number | null = null;
      ringValue.forEach((pointValue, index) => {
        if (
          !Array.isArray(pointValue) ||
          typeof pointValue[0] !== "number" ||
          typeof pointValue[1] !== "number"
        )
          return;
        const longitude = pointValue[0];
        const latitude = pointValue[1];
        const x = ((longitude + 180) / 360) * canvas.width;
        const y = ((90 - latitude) / 180) * canvas.height;
        if (
          index === 0 ||
          (previousLongitude !== null &&
            Math.abs(longitude - previousLongitude) > 180)
        ) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        previousLongitude = longitude;
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.stroke();
  }

  for (const item of land.features) {
    if (
      item.geometry.type === "Polygon" &&
      Array.isArray(item.geometry.coordinates)
    ) {
      drawPolygon(item.geometry.coordinates as unknown[]);
    } else if (
      item.geometry.type === "MultiPolygon" &&
      Array.isArray(item.geometry.coordinates)
    ) {
      for (const polygon of item.geometry.coordinates as unknown[][]) {
        drawPolygon(polygon);
      }
    }
  }

  // Country borders
  const countryBorders = mesh(
    worldTopology as never,
    topology.objects.countries as never,
    (a, b) => a !== b,
  ) as unknown as { coordinates: unknown[][][] };

  ctx.beginPath();
  for (const line of countryBorders.coordinates) {
    let previousLongitude: number | null = null;
    line.forEach((point, index) => {
      const longitude = point[0] as number;
      const latitude = point[1] as number;
      if (typeof longitude !== "number" || typeof latitude !== "number") return;
      const x = ((longitude + 180) / 360) * canvas.width;
      const y = ((90 - latitude) / 180) * canvas.height;
      if (
        index === 0 ||
        (previousLongitude !== null &&
          Math.abs(longitude - previousLongitude) > 180)
      ) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      previousLongitude = longitude;
    });
  }
  ctx.strokeStyle = "#2a6b6a";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Highlighted countries
  const highlightedSet = new Set(highlightedCountries);
  if (highlightedSet.size > 0) {
    const countries = feature(
      worldTopology as never,
      topology.objects.countries as never,
    ) as unknown as GeoFeatureCollection;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#d4e65c";
    for (const country of countries.features) {
      const code = isoCountries.numericToAlpha2(
        String(country.id ?? "").padStart(3, "0"),
      );
      if (!highlightedSet.has(code ?? "")) continue;

      if (
        country.geometry.type === "Polygon" &&
        Array.isArray(country.geometry.coordinates)
      ) {
        drawPolygon(country.geometry.coordinates as unknown[]);
      } else if (
        country.geometry.type === "MultiPolygon" &&
        Array.isArray(country.geometry.coordinates)
      ) {
        for (const polygon of country.geometry.coordinates as unknown[][]) {
          drawPolygon(polygon);
        }
      }
    }
    ctx.restore();
  }

  // Digital grid
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#4ecdc4";
  ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 20) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * canvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Face a lat/lon in WORLD space (accounts for root rotation)
 * and shift the target toward the RIGHT of the view.
 *
 * rightBiasDeg > 0 → selected area moves further right on screen.
 * Increase (e.g. 35–45) if you still want it more to the right.
 */
function cameraFacingPosition(
  lat: number,
  lon: number,
  root: THREE.Group,
  radius = 5.1,
  rightBiasDeg = 22,
) {
  const local = latLonToVector3(lat, lon, 1);
  const worldDir = local.clone().applyQuaternion(root.quaternion).normalize();

  const bias = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(rightBiasDeg),
  );
  worldDir.applyQuaternion(bias);

  return worldDir.multiplyScalar(radius);
}

function animateCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  end: THREE.Vector3,
  duration = 950,
) {
  const start = camera.position.clone();
  const startTime = performance.now();

  const tick = (now: number) => {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(start, end, ease);
    controls.target.set(0, 0, 0);
    controls.update();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function createCountSprite(count: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "rgba(8, 28, 32, 0.92)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 88, 40, 14);
  ctx.fill();
  ctx.strokeStyle = "#4ecdc4";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e8fff9";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count.toLocaleString(), 48, 24, 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(0.15, 0.085, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export default function EarthGlobe({
  markets,
  selectedCountry,
  highlightedCountries,
  onSelectCountry,
}: {
  markets: JobMarketSummary[];
  selectedCountry: string | null;
  highlightedCountries: string[];
  onSelectCountry: (countryCode: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelectCountry);
  const marketRef = useRef(markets);
  const selectedRef = useRef(selectedCountry);
  const highlightedRef = useRef(highlightedCountries);
  const hoveredRef = useRef<string | null>(null);

  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    root: THREE.Group;
    sphere: THREE.Mesh;
    pinLayer: THREE.Group;
    labelLayer: THREE.Group;
    ring: THREE.Mesh;
    pinMap: Map<
      string,
      {
        group: THREE.Group;
        dot: THREE.Mesh;
        halo: THREE.Mesh;
        label?: THREE.Sprite;
      }
    >;
    animationId: number;
    interactionTimeout: ReturnType<typeof setTimeout> | null;
    updatePinVisuals: () => void;
  } | null>(null);

  useEffect(() => {
    selectRef.current = onSelectCountry;
  }, [onSelectCountry]);
  useEffect(() => {
    marketRef.current = markets;
  }, [markets]);
  useEffect(() => {
    selectedRef.current = selectedCountry;
  }, [selectedCountry]);
  useEffect(() => {
    highlightedRef.current = highlightedCountries;
  }, [highlightedCountries]);

  // ---------- Mount scene once ----------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    camera.position.set(0, 0.15, 5.1);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 3.4;
    controls.maxDistance = 8.5;
    controls.minPolarAngle = 0.4;
    controls.maxPolarAngle = Math.PI - 0.4;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.42;
    controls.rotateSpeed = 0.5;

    const root = new THREE.Group();
    root.rotation.set(-0.06, -Math.PI / 2, 0);
    scene.add(root);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 96, 72),
      new THREE.MeshStandardMaterial({
        map: createEarthTexture([]),
        roughness: 0.88,
        metalness: 0.08,
      }),
    );
    root.add(sphere);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.58, 64, 48),
      new THREE.MeshBasicMaterial({
        color: "#3d9ea8",
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
      }),
    );
    root.add(atmosphere);

    const outerHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, 48, 32),
      new THREE.MeshBasicMaterial({
        color: "#1a6b72",
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
      }),
    );
    root.add(outerHalo);

    // Digital orbital ring
    const ringGeo = new THREE.RingGeometry(2.05, 2.12, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: "#4ecdc4",
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4;
    root.add(ring);

    scene.add(new THREE.AmbientLight("#8ec9d0", 1.6));
    const key = new THREE.DirectionalLight("#fff8e7", 2.4);
    key.position.set(-3.2, 2.8, 4.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#2a9dad", 1.1);
    fill.position.set(3.5, -1.8, -2.5);
    scene.add(fill);

    const pinLayer = new THREE.Group();
    root.add(pinLayer);
    const labelLayer = new THREE.Group();
    root.add(labelLayer);

    const pinMap = new Map<
      string,
      {
        group: THREE.Group;
        dot: THREE.Mesh;
        halo: THREE.Mesh;
        label?: THREE.Sprite;
      }
    >();

    const updatePinVisuals = () => {
      pinMap.forEach((entry, code) => {
        const isSelected = code === selectedRef.current;
        const isHovered = code === hoveredRef.current;
        const color = isSelected
          ? "#d4e65c"
          : isHovered
            ? "#f0b070"
            : "#d77946";
        (entry.dot.material as THREE.MeshBasicMaterial).color.set(color);
        (entry.halo.material as THREE.MeshBasicMaterial).color.set(color);
        (entry.halo.material as THREE.MeshBasicMaterial).opacity = isSelected
          ? 0.55
          : isHovered
            ? 0.42
            : 0.28;
        entry.group.userData.baseScale = isSelected
          ? 1.4
          : isHovered
            ? 1.22
            : 1;
      });
    };

    threeRef.current = {
      scene,
      camera,
      renderer,
      controls,
      root,
      sphere,
      pinLayer,
      labelLayer,
      ring,
      pinMap,
      animationId: 0,
      interactionTimeout: null,
      updatePinVisuals,
    };

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const pauseAutoRotate = () => {
      controls.autoRotate = false;
      if (threeRef.current?.interactionTimeout) {
        clearTimeout(threeRef.current.interactionTimeout);
      }
      threeRef.current!.interactionTimeout = setTimeout(() => {
        if (!selectedRef.current && highlightedRef.current.length === 0) {
          controls.autoRotate = true;
        }
      }, 2400);
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([pinLayer, labelLayer], true);
      const hit = hits.find((h) => h.object.userData.countryCode);
      const code = hit?.object.userData.countryCode as string | undefined;

      if (code !== hoveredRef.current) {
        hoveredRef.current = code ?? null;
        updatePinVisuals();
        renderer.domElement.style.cursor = code ? "pointer" : "grab";
      }
    };

    const onClick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects([pinLayer, labelLayer], true)
        .find((h) => h.object.userData.countryCode);
      const code = hit?.object.userData.countryCode;
      if (typeof code === "string") {
        selectRef.current(code);
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", pauseAutoRotate);
    renderer.domElement.addEventListener("wheel", pauseAutoRotate, {
      passive: true,
    });
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive digital globe. Drag to rotate, scroll to zoom, click a pin to filter by country.",
    );

    const animate = (time: number) => {
      const id = requestAnimationFrame(animate);
      if (threeRef.current) threeRef.current.animationId = id;

      const t = time * 0.001;
      ring.rotation.z = t * 0.12;
      (ring.material as THREE.MeshBasicMaterial).opacity =
        0.28 + Math.sin(t * 1.4) * 0.08;

      pinMap.forEach((entry) => {
        const base = entry.group.userData.baseScale ?? 1;
        const pulse =
          1 + Math.sin(t * 2.2 + entry.group.position.x * 4) * 0.06;
        entry.group.scale.setScalar(base * pulse);
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      cancelAnimationFrame(threeRef.current?.animationId ?? 0);
      if (threeRef.current?.interactionTimeout) {
        clearTimeout(threeRef.current.interactionTimeout);
      }
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", pauseAutoRotate);
      renderer.domElement.removeEventListener("wheel", pauseAutoRotate);
      renderer.domElement.removeEventListener("click", onClick);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => {
            if ("map" in m && m.map) (m.map as THREE.Texture).dispose();
            m.dispose();
          });
        } else if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, []);

  // ---------- Texture when highlights change ----------
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;

    const oldMap = (three.sphere.material as THREE.MeshStandardMaterial).map;
    const newTexture = createEarthTexture(highlightedCountries);
    (three.sphere.material as THREE.MeshStandardMaterial).map = newTexture;
    (three.sphere.material as THREE.MeshStandardMaterial).needsUpdate = true;
    oldMap?.dispose();
  }, [highlightedCountries]);

  // ---------- Rebuild pins when markets change ----------
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;

    const { pinLayer, labelLayer, pinMap } = three;

    while (pinLayer.children.length) {
      const child = pinLayer.children[0];
      pinLayer.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    while (labelLayer.children.length) {
      const child = labelLayer.children[0];
      labelLayer.remove(child);
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
    pinMap.clear();

    markets
      .filter((m) => m.count > 0)
      .forEach((market) => {
        const group = new THREE.Group();
        const pos = latLonToVector3(market.latitude, market.longitude, 1.62);
        group.position.copy(pos);
        group.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          pos.clone().normalize(),
        );
        group.userData.countryCode = market.code;
        group.userData.baseScale = 1;

        const sizeFactor = Math.min(
          1.05,
          0.48 + Math.log2(market.count + 1) * 0.12,
        );
        const isSelected = market.code === selectedRef.current;

        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.018 * sizeFactor, 12, 8),
          new THREE.MeshBasicMaterial({
            color: isSelected ? "#d4e65c" : "#d77946",
          }),
        );
        dot.userData.countryCode = market.code;
        group.add(dot);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.032 * sizeFactor, 10, 8),
          new THREE.MeshBasicMaterial({
            color: "#d77946",
            transparent: true,
            opacity: isSelected ? 0.5 : 0.25,
          }),
        );
        group.add(halo);
        pinLayer.add(group);

        let label: THREE.Sprite | undefined;
        if (market.count >= 3) {
          label = createCountSprite(market.count) ?? undefined;
          if (label) {
            label.position.copy(
              latLonToVector3(market.latitude, market.longitude, 1.88),
            );
            label.userData.countryCode = market.code;
            labelLayer.add(label);
          }
        }

        pinMap.set(market.code, { group, dot, halo, label });
      });

    three.updatePinVisuals();
  }, [markets]);

  // ---------- Selection pin colors ----------
  useEffect(() => {
    threeRef.current?.updatePinVisuals();
  }, [selectedCountry]);

  // ---------- Auto-rotate on/off ----------
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;
    const shouldStop =
      selectedCountry !== null || highlightedCountries.length > 0;
    three.controls.autoRotate = !shouldStop;
  }, [selectedCountry, highlightedCountries]);

  // ---------- Face selected country (world space + right bias) ----------
  useEffect(() => {
    const three = threeRef.current;
    if (!three || !selectedCountry) return;

    const market = marketRef.current.find((m) => m.code === selectedCountry);
    if (!market) return;

    const end = cameraFacingPosition(
      market.latitude,
      market.longitude,
      three.root,
      5.1,
      15, // increase to 40–45 if still too far left
    );
    animateCameraTo(three.camera, three.controls, end, 950);
  }, [selectedCountry]);

  // ---------- Face region (or reset) ----------
  useEffect(() => {
    const three = threeRef.current;
    if (!three) return;

    if (selectedCountry) return;

    if (highlightedCountries.length === 0) {
      animateCameraTo(
        three.camera,
        three.controls,
        new THREE.Vector3(0, 0.15, 5.1),
        800,
      );
      three.controls.target.set(0, 0, 0);
      return;
    }

    const regionMarkets = marketRef.current.filter((m) =>
      highlightedCountries.includes(m.code),
    );
    if (regionMarkets.length === 0) return;

    const avgLon =
      regionMarkets.reduce((s, m) => s + m.longitude, 0) /
      regionMarkets.length;
    const avgLat =
      regionMarkets.reduce((s, m) => s + m.latitude, 0) /
      regionMarkets.length;

    const end = cameraFacingPosition(
      avgLat,
      avgLon,
      three.root,
      5.1,
      15,
    );
    animateCameraTo(three.camera, three.controls, end, 950);
  }, [highlightedCountries, selectedCountry]);

  return <div className="earth-globe-host" ref={hostRef} />;
}