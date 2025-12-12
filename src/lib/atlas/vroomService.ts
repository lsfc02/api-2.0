// src/lib/atlas/vroomService.ts
declare module "@mapbox/polyline";

import polyline from "@mapbox/polyline";
import { Cliente } from "./geoUtils";

interface VROOMJob { id: number; location: [number, number]; service?: number; }
interface VROOMVehicle { id: number; start: [number, number]; end?: [number, number]; profile?: string; }
interface VROOMStep { type?: string; job?: number; location?: [number, number]; }
interface VROOMRoute { steps?: VROOMStep[]; geometry?: any; }
interface VROOMSolution { routes?: VROOMRoute[]; }

const fetchWithTimeout = async (input: RequestInfo, init: RequestInit = {}, ms = 60000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const merged: RequestInit = { ...init, signal: controller.signal };
    const res = await fetch(input, merged);
    return res;
  } finally {
    clearTimeout(id);
  }
};

const parseGeometryGeneric = (raw: unknown): Array<[number, number]> => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    const flat: number[][] = [];
    const walk = (node: any) => {
      if (!Array.isArray(node)) return;
      if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
        flat.push([Number(node[0]), Number(node[1])]);
        return;
      }
      for (const c of node) walk(c);
    };
    walk(raw);
    const points: Array<[number, number]> = flat
      .map((pt) => {
        const a = pt[0], b = pt[1];
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [a, b] as [number, number];
        if (Math.abs(a) <= 180 && Math.abs(b) <= 90) return [b, a] as [number, number];
        return null;
      })
      .filter((p): p is [number, number] => p !== null);
    return points;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parseGeometryGeneric(parsed);
    } catch {
      try {
        const decoded = (polyline.decode(raw) as number[][]).map((p) => [Number(p[0]), Number(p[1])]);
        return decoded.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) as Array<[number, number]>;
      } catch {
        return [];
      }
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const obj: any = raw;
    const coords = obj.coordinates ?? obj?.geometry?.coordinates ?? obj?.features?.[0]?.geometry?.coordinates;
    if (coords) return parseGeometryGeneric(coords);
  }

  return [];
};

const appendGeometryAvoidDup = (base: Array<[number, number]>, add: Array<[number, number]>) => {
  if (!Array.isArray(add) || add.length === 0) return base;
  if (base.length === 0) return [...add];
  const last = base[base.length - 1];
  const firstAdd = add[0];
  if (last[0] === firstAdd[0] && last[1] === firstAdd[1]) {
    return [...base, ...add.slice(1)];
  }
  return [...base, ...add];
};

export class VROOMService {
  private baseUrl: string;
  constructor() {
    this.baseUrl = process.env.VROOM_BASE_URL || "http://192.168.50.6:3000";
  }

  async checkHealth(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/?geometry=false`;
      console.log(`🔍 Testing VROOM health at: ${url}`);

      const payload = {
        jobs: [{ id: 1, location: [-46.6576, -23.5872] }],
        vehicles: [{ id: 1, start: [-46.6559, -23.5614], profile: "driving-car" }],
      };
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, 10000);

      console.log(`✅ VROOM health check response: ${res.status} ${res.statusText}`);
      return res.ok;
    } catch (err: any) {
      console.error('❌ VROOM health check failed:', {
        message: err.message,
        name: err.name,
        cause: err.cause,
        baseUrl: this.baseUrl
      });
      return false;
    }
  }

  private async optimize(jobs: VROOMJob[], vehicles: VROOMVehicle[]): Promise<VROOMSolution> {
    const url = `${this.baseUrl}/`;
    const payload = { jobs, vehicles, options: { geometry: true, geometry_format: "geojson" } };
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 60000);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`VROOM error: ${res.status} ${txt}`);
    }
    return (await res.json()) as VROOMSolution;
  }

  async optimizeRoute(clientes: Cliente[]): Promise<{ ordered: Array<Cliente & { ordem: number }>; geometry: Array<[number, number]>; }> {
    if (!Array.isArray(clientes) || clientes.length === 0) {
      return { ordered: [], geometry: [] };
    }
    if (clientes.length === 1) {
      return {
        ordered: clientes.map((c, i) => ({ ...c, ordem: i + 1 })),
        geometry: clientes.map((c) => [c.latitude, c.longitude] as [number, number]),
      };
    }

    const startPoint = clientes[0];
    
    const jobs: VROOMJob[] = clientes.slice(1).map((c, i) => ({ 
      id: i + 1,
      location: [c.longitude, c.latitude], 
      service: 300 
    }));
    
    const vehicles: VROOMVehicle[] = [{ 
      id: 1, 
      start: [startPoint.longitude, startPoint.latitude], 
      profile: "driving-car" 
    }];

    const solution = await this.optimize(jobs, vehicles);
    const route = solution?.routes?.[0];
    if (!route) throw new Error("VROOM retornou sem routes");

    const steps = route.steps ?? [];
    
    const jobOrderIndices = steps
      .filter((s) => s.type === "job" && typeof s.job === "number")
      .map((s) => (s.job as number) - 1)
      .filter((idx) => idx >= 0 && idx < jobs.length);

    const orderedJobs = jobOrderIndices.map((i) => clientes.slice(1)[i]);
    const ordered = [startPoint, ...orderedJobs];

    const rawGeom = route.geometry ?? [];
    const geometry = parseGeometryGeneric(rawGeom);
    const finalGeometry = (geometry.length > 0 ? geometry : ordered.map((c) => [c.latitude, c.longitude] as [number, number]));

    return {
      ordered: ordered.map((c, i) => ({ ...c, ordem: i + 1 })),
      geometry: finalGeometry,
    };
  }

  async optimizeChunked(clientes: Cliente[], chunkSize: number = 40): Promise<{ ordered: Array<Cliente & { ordem: number }>; geometry: Array<[number, number]>; }> {
    if (clientes.length <= chunkSize) return this.optimizeRoute(clientes);

    const chunks: Cliente[][] = [];
    for (let i = 0; i < clientes.length; i += chunkSize) chunks.push(clientes.slice(i, i + chunkSize));

    let allOrdered: Cliente[] = [];
    let allGeometry: Array<[number, number]> = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`🟣 VROOM chunk ${i + 1}/${chunks.length} (${chunks[i].length} jobs)`);

      let chunkToProcess = chunks[i];
      if (i > 0 && allOrdered.length > 0) {
        const connectionPoint = allOrdered[allOrdered.length - 1];
        chunkToProcess = [connectionPoint, ...chunks[i]];
      }

      try {
        const res = await this.optimizeRoute(chunkToProcess);
        let orderedChunk = res.ordered;
        let geometryChunk = res.geometry || [];

        if (i > 0 && orderedChunk.length > 0) orderedChunk = orderedChunk.slice(1);
        allOrdered = [...allOrdered, ...orderedChunk];
        allGeometry = appendGeometryAvoidDup(allGeometry, geometryChunk);
      } catch (err) {
        console.warn(`⚠️ Failed to optimize chunk ${i + 1}:`, err);
        const fallbackOrdered = chunks[i].map((c, idx) => ({ ...c, ordem: allOrdered.length + idx + 1 }));
        const fallbackGeometry = chunks[i].map((c) => [c.latitude, c.longitude] as [number, number]);
        allOrdered = [...allOrdered, ...fallbackOrdered];
        allGeometry = appendGeometryAvoidDup(allGeometry, fallbackGeometry);
      }
    }

    return {
      ordered: allOrdered.map((c, i) => ({ ...c, ordem: i + 1 })),
      geometry: allGeometry,
    };
  }
}

export const vroomService = new VROOMService();