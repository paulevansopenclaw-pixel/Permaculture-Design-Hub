import L from "leaflet";
import * as turf from "@turf/turf";

export interface FreehandOptions {
  simplifyTolerance?: number;
  minPixelDistance?: number;
}

type FinishPolygon = (geom: GeoJSON.Polygon) => void;
type FinishPolyline = (geom: GeoJSON.LineString) => void;

export class FreehandDrawer {
  private map: L.Map;
  private container: HTMLElement;
  private opts: Required<FreehandOptions>;

  private active = false;
  private mode: "polygon" | "polyline" = "polygon";
  private points: [number, number][] = [];
  private previewLayer: L.Polyline | null = null;
  private onFinish: FinishPolygon | FinishPolyline | null = null;

  private _down: (e: PointerEvent) => void;
  private _move: (e: PointerEvent) => void;
  private _up: (e: PointerEvent) => void;
  private _cancel: () => void;

  constructor(map: L.Map, options: FreehandOptions = {}) {
    this.map = map;
    this.container = map.getContainer();
    this.opts = {
      simplifyTolerance: options.simplifyTolerance ?? 0.000012,
      minPixelDistance: options.minPixelDistance ?? 6,
    };
    this._down = this.handleDown.bind(this);
    this._move = this.handleMove.bind(this);
    this._up = this.handleUp.bind(this);
    this._cancel = this.handleCancel.bind(this);
  }

  enablePolygon(onFinish: FinishPolygon) {
    this.mode = "polygon";
    this.onFinish = onFinish;
    this.attach();
  }

  enablePolyline(onFinish: FinishPolyline) {
    this.mode = "polyline";
    this.onFinish = onFinish;
    this.attach();
  }

  private attach() {
    this.active = false;
    this.points = [];
    this.container.style.touchAction = "none";
    this.container.style.cursor = "crosshair";
    this.container.addEventListener("pointerdown", this._down);
    this.container.addEventListener("pointermove", this._move);
    this.container.addEventListener("pointerup", this._up);
    this.container.addEventListener("pointercancel", this._cancel);
    this.map.dragging.disable();
    this.map.touchZoom.disable();
    this.map.doubleClickZoom.disable();
    this.map.scrollWheelZoom.disable();
  }

  disable() {
    this.active = false;
    this.points = [];
    this.container.style.touchAction = "";
    this.container.style.cursor = "";
    this.container.removeEventListener("pointerdown", this._down);
    this.container.removeEventListener("pointermove", this._move);
    this.container.removeEventListener("pointerup", this._up);
    this.container.removeEventListener("pointercancel", this._cancel);
    if (this.previewLayer) {
      this.map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }
    this.map.dragging.enable();
    this.map.touchZoom.enable();
    this.map.doubleClickZoom.enable();
    this.map.scrollWheelZoom.enable();
    this.onFinish = null;
  }

  private toLngLat(e: PointerEvent): [number, number] {
    const rect = this.container.getBoundingClientRect();
    const ll = this.map.containerPointToLatLng(
      L.point(e.clientX - rect.left, e.clientY - rect.top),
    );
    return [ll.lng, ll.lat];
  }

  private pixelDist(e: PointerEvent, last: [number, number]): number {
    const rect = this.container.getBoundingClientRect();
    const lastPx = this.map.latLngToContainerPoint(L.latLng(last[1], last[0]));
    const dx = e.clientX - rect.left - lastPx.x;
    const dy = e.clientY - rect.top - lastPx.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private handleDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    this.container.setPointerCapture(e.pointerId);
    this.active = true;
    this.points = [];
    if (this.previewLayer) {
      this.map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }
    this.points.push(this.toLngLat(e));
  }

  private handleMove(e: PointerEvent) {
    if (!this.active) return;
    e.preventDefault();
    const last = this.points[this.points.length - 1];
    if (last && this.pixelDist(e, last) < this.opts.minPixelDistance) return;
    this.points.push(this.toLngLat(e));
    this.updatePreview();
  }

  private handleUp(e: PointerEvent) {
    if (!this.active) return;
    e.preventDefault();
    this.active = false;
    this.finish();
  }

  private handleCancel() {
    this.active = false;
    this.points = [];
    if (this.previewLayer) {
      this.map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }
  }

  private updatePreview() {
    const lls = this.points.map(([lng, lat]) => L.latLng(lat, lng));
    if (lls.length < 2) return;
    if (this.previewLayer) {
      this.previewLayer.setLatLngs(lls);
    } else {
      this.previewLayer = L.polyline(lls, {
        color: "#fff",
        weight: 2.5,
        opacity: 0.75,
        dashArray: "6 4",
      }).addTo(this.map);
    }
  }

  private finish() {
    if (this.previewLayer) {
      this.map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }
    if (this.points.length < 3) return;

    if (this.mode === "polygon") {
      const ring = [...this.points, this.points[0]];
      const rough: GeoJSON.Polygon = { type: "Polygon", coordinates: [ring] };
      try {
        const simplified = turf.simplify(
          { type: "Feature", geometry: rough, properties: {} },
          { tolerance: this.opts.simplifyTolerance, highQuality: true },
        );
        const geom = simplified.geometry as GeoJSON.Polygon;
        if (geom.coordinates[0].length >= 4) {
          (this.onFinish as FinishPolygon)(geom);
          return;
        }
      } catch { /* fall through */ }
      if (ring.length >= 4) (this.onFinish as FinishPolygon)(rough);
    } else {
      const rough: GeoJSON.LineString = { type: "LineString", coordinates: this.points };
      try {
        const simplified = turf.simplify(
          { type: "Feature", geometry: rough, properties: {} },
          { tolerance: this.opts.simplifyTolerance, highQuality: true },
        );
        const geom = simplified.geometry as GeoJSON.LineString;
        if (geom.coordinates.length >= 2) {
          (this.onFinish as FinishPolyline)(geom);
          return;
        }
      } catch { /* fall through */ }
      if (this.points.length >= 2) (this.onFinish as FinishPolyline)(rough);
    }
  }
}
