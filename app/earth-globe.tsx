"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature, mesh } from "topojson-client";
import isoCountries from "i18n-iso-countries";
import worldTopology from "world-atlas/countries-110m.json";
import type { JobMarketSummary } from "@/lib/jobs/types";

const topology = worldTopology as unknown as { objects: { land: unknown; countries: unknown } };

type GeoFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{ geometry: { type: string; coordinates: unknown } }>;
};

function createEarthTexture(highlightedCountries: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("Canvas is unavailable");
  const context = canvasContext;

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#104d68");
  ocean.addColorStop(0.5, "#0c344e");
  ocean.addColorStop(1, "#071f37");
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const land = feature(worldTopology as never, topology.objects.land as never) as unknown as GeoFeatureCollection;
  context.fillStyle = "#71877f";
  context.strokeStyle = "#a6b7aa";
  context.lineWidth = 1.1;

  function drawPolygon(rings: unknown[]) {
    context.beginPath();
    for (const ringValue of rings) {
      if (!Array.isArray(ringValue)) continue;
      let previousLongitude: number | null = null;
      ringValue.forEach((pointValue, index) => {
        if (!Array.isArray(pointValue) || typeof pointValue[0] !== "number" || typeof pointValue[1] !== "number") return;
        const longitude = pointValue[0];
        const latitude = pointValue[1];
        const x = ((longitude + 180) / 360) * canvas.width;
        const y = ((90 - latitude) / 180) * canvas.height;
        if (index === 0 || (previousLongitude !== null && Math.abs(longitude - previousLongitude) > 180)) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
        previousLongitude = longitude;
      });
      context.closePath();
    }
    context.fill("evenodd");
    context.stroke();
  }

  for (const item of land.features) {
    if (item.geometry.type === "Polygon" && Array.isArray(item.geometry.coordinates)) {
      drawPolygon(item.geometry.coordinates as unknown[]);
    } else if (item.geometry.type === "MultiPolygon" && Array.isArray(item.geometry.coordinates)) {
      for (const polygon of item.geometry.coordinates as unknown[][]) drawPolygon(polygon);
    }
  }

  const countryBorders = mesh(
    worldTopology as never,
    topology.objects.countries as never,
    (first, second) => first !== second,
  ) as unknown as { coordinates: unknown[][][] };
  context.beginPath();
  for (const line of countryBorders.coordinates) {
    let previousLongitude: number | null = null;
    line.forEach((point, index) => {
      const longitude = point[0];
      const latitude = point[1];
      if (typeof longitude !== "number" || typeof latitude !== "number") return;
      const x = ((longitude + 180) / 360) * canvas.width;
      const y = ((90 - latitude) / 180) * canvas.height;
      if (index === 0 || (previousLongitude !== null && Math.abs(longitude - previousLongitude) > 180)) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
      previousLongitude = longitude;
    });
  }
  context.strokeStyle = "#d4d9ce";
  context.lineWidth = 1.15;
  context.stroke();

  const highlightedSet = new Set(highlightedCountries);
  if (highlightedSet.size > 0) {
    const countries = feature(worldTopology as never, topology.objects.countries as never) as unknown as GeoFeatureCollection;
    context.save();
    context.globalAlpha = 0.5;
    context.fillStyle = "#d4e65c";
    for (const country of countries.features) {
      const code = isoCountries.numericToAlpha2(String(country.id ?? "").padStart(3, "0"));
      if (!highlightedSet.has(code ?? "")) continue;
      if (country.geometry.type === "Polygon" && Array.isArray(country.geometry.coordinates)) {
        drawPolygon(country.geometry.coordinates as unknown[]);
      } else if (country.geometry.type === "MultiPolygon" && Array.isArray(country.geometry.coordinates)) {
        for (const polygon of country.geometry.coordinates as unknown[][]) drawPolygon(polygon);
      }
    }
    context.restore();
  }

  context.globalAlpha = 0.12;
  context.strokeStyle = "#92d1dc";
  context.lineWidth = 1;
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const y = ((90 - latitude) / 180) * canvas.height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function coordinates(latitude: number, longitude: number, radius: number) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
}

function createCountSprite(count: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 40;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#e4e8df";
  context.beginPath();
  context.roundRect(3, 3, 58, 34, 12);
  context.fill();
  context.strokeStyle = "#f4ffd4";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#31463c";
  context.font = "700 18px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(count), 32, 20, 54);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false }),
  );
  sprite.scale.set(0.16, 0.11, 1);
  sprite.renderOrder = 5;
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
  const pinMapRef = useRef<Map<string, { dot: THREE.Mesh; halo: THREE.Mesh; group: THREE.Group }>>(new Map());
  const hoveredRef = useRef<string | null>(null);

  useEffect(() => { selectRef.current = onSelectCountry; }, [onSelectCountry]);
  useEffect(() => { marketRef.current = markets; }, [markets]);
  useEffect(() => { selectedRef.current = selectedCountry; }, [selectedCountry]);

  // Update visual selection + hover every time selectedCountry changes
  useEffect(() => {
    pinMapRef.current.forEach((entry, code) => {
      const isSelected = code === selectedCountry;
      const isHovered = code === hoveredRef.current;

      const color = isSelected ? "#d4e65c" : isHovered ? "#f1b47c" : "#d77946";
      (entry.dot.material as THREE.MeshBasicMaterial).color.set(color);

      // gentle pulse scale for selected / hover
      const scale = isSelected ? 1.35 : isHovered ? 1.2 : 1;
      entry.group.scale.setScalar(scale);

      (entry.halo.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.55 : isHovered ? 0.4 : 0.3;
    });
  }, [selectedCountry]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const pinMap = pinMapRef.current;

    const container = host;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    camera.position.set(0, 0, 5.25);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // OrbitControls – this is the biggest interactivity upgrade
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 9;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI - 0.35;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.rotateSpeed = 0.55;

    const root = new THREE.Group();
    root.rotation.set(-0.08, -Math.PI / 2, 0);
    scene.add(root);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.55, 96, 72),
      new THREE.MeshStandardMaterial({ map: createEarthTexture(highlightedCountries), roughness: 0.91, metalness: 0.02 }),
    );
    root.add(sphere);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.59, 72, 54),
      new THREE.MeshBasicMaterial({ color: "#62bbd1", transparent: true, opacity: 0.1, side: THREE.BackSide }),
    );
    root.add(atmosphere);

    scene.add(new THREE.AmbientLight("#aac9cf", 1.8));
    const keyLight = new THREE.DirectionalLight("#fff3c8", 2.7);
    keyLight.position.set(-3, 3, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#3da1cb", 1.2);
    fillLight.position.set(4, -2, -3);
    scene.add(fillLight);

    const pinLayer = new THREE.Group();
    root.add(pinLayer);
    const labelLayer = new THREE.Group();
    root.add(labelLayer);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    pinMap.clear();

    // Build pins + labels
    marketRef.current
      .filter((market) => market.count > 0)
      .forEach((market) => {
        const group = new THREE.Group();
        group.position.copy(coordinates(market.latitude, market.longitude, 1.61));
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), group.position.clone().normalize());
        group.userData.countryCode = market.code;

        const isSelected = market.code === selectedRef.current;
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 16, 12),
          new THREE.MeshBasicMaterial({ color: isSelected ? "#d4e65c" : "#d77946" }),
        );
        dot.userData.countryCode = market.code;
        group.add(dot);

        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 12, 10),
          new THREE.MeshBasicMaterial({ color: "#d77946", transparent: true, opacity: isSelected ? 0.55 : 0.3 }),
        );
        group.add(halo);

        pinMap.set(market.code, { dot, halo, group });

        const label = createCountSprite(market.count);
        if (label) {
          label.position.copy(coordinates(market.latitude, market.longitude, 1.84));
          label.userData.countryCode = market.code;
          labelLayer.add(label);
        }
        pinLayer.add(group);
      });

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Pause auto-rotate while interacting
    let interactionTimeout: ReturnType<typeof setTimeout>;
    const pauseAutoRotate = () => {
      controls.autoRotate = false;
      clearTimeout(interactionTimeout);
      interactionTimeout = setTimeout(() => {
        controls.autoRotate = true;
      }, 2200);
    };

    function onPointerMove(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([pinLayer, labelLayer], true);
      const hit = hits.find((h) => h.object.userData.countryCode);
      const code = hit?.object.userData.countryCode as string | undefined;

      if (code !== hoveredRef.current) {
        hoveredRef.current = code ?? null;
        // Force visual update
        pinMapRef.current.forEach((entry, c) => {
          const isSelected = c === selectedRef.current;
          const isHovered = c === hoveredRef.current;
          const color = isSelected ? "#d4e65c" : isHovered ? "#f1b47c" : "#d77946";
          (entry.dot.material as THREE.MeshBasicMaterial).color.set(color);
          const scale = isSelected ? 1.35 : isHovered ? 1.22 : 1;
          entry.group.scale.setScalar(scale);
          (entry.halo.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.55 : isHovered ? 0.42 : 0.3;
        });
        renderer.domElement.style.cursor = code ? "pointer" : "grab";
      }
    }

    function onClick(event: PointerEvent) {
      // Only treat as click if the pointer barely moved (OrbitControls already handled drag)
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([pinLayer, labelLayer], true).find((h) => h.object.userData.countryCode);
      const code = hit?.object.userData.countryCode;
      if (typeof code === "string") {
        selectRef.current(code);
      }
    }

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", pauseAutoRotate);
    renderer.domElement.addEventListener("wheel", pauseAutoRotate, { passive: true });
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive world globe. Drag to rotate, scroll to zoom, click a numbered pin to filter jobs by country.",
    );
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none"; // better mobile

    let animationFrame = 0;
    function animate() {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(interactionTimeout);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", pauseAutoRotate);
      renderer.domElement.removeEventListener("wheel", pauseAutoRotate);
      renderer.domElement.removeEventListener("click", onClick);

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((m) => {
            if ("map" in m && m.map) m.map.dispose();
            m.dispose();
          });
        } else if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      pinMap.clear();
    };
  }, [highlightedCountries]);

  return <div className="earth-globe-host" ref={hostRef} />;
}