// src/lib/atlas/orsService.ts
import { Cliente } from './geoUtils';

/** fetch com timeout via AbortController */
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 60000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const mergedInit: RequestInit = { ...init, signal: controller.signal };
    const res = await fetch(input, mergedInit);
    return res;
  } finally {
    clearTimeout(id);
  }
}

/** flatten recursivo de coords aninhadas para pares [lon,lat] ou [lat,lon] */
function flattenCoords(nested: any): any[] {
  const out: any[] = [];
  function walk(node: any) {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      out.push(node);
      return;
    }
    for (const child of node) walk(child);
  }
  walk(nested);
  return out;
}

/** remove pontos consecutivos duplicados ([lat,lon] compare) */
function dedupeConsecutive(points: Array<[number, number]>) {
  if (!points || points.length === 0) return points;
  const out: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    out.push(b);
  }
  return out;
}

export class ORSService {
  private baseUrl: string;
  private defaultMatrixChunkHint: number;
  private directionsMaxCoords: number;
  private matrixTimeoutMs: number;
  private directionsTimeoutMs: number;

  constructor() {
    const envBase = (process.env.ORS_BASE_URL || 'http://192.168.50.6:8082/ors').replace(/\/+$/, '');
    this.baseUrl = envBase;
    this.defaultMatrixChunkHint = Number(process.env.ORS_MATRIX_CHUNK_HINT) || 50;
    // Reduzir o máximo de coordenadas por requisição (ORS pode ter limite de ~25)
    this.directionsMaxCoords = Number(process.env.ORS_DIRECTIONS_MAX_COORDS) || 25;
    this.matrixTimeoutMs = Number(process.env.ORS_MATRIX_TIMEOUT_MS) || 60000; // Increased from 45s to 60s
    this.directionsTimeoutMs = Number(process.env.ORS_DIRECTIONS_TIMEOUT_MS) || 120000; // Increased from 60s to 120s (2 min)

    console.log(`🔧 ORS Config: baseUrl=${this.baseUrl}, directionsMaxCoords=${this.directionsMaxCoords}, timeout=${this.directionsTimeoutMs}ms`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/v2/health`;
      console.log(`🔍 Testing ORS health at: ${url}`);

      const resp = await fetchWithTimeout(url, { method: 'GET' }, 10000);
      console.log(`✅ ORS health check response: ${resp.status} ${resp.statusText}`);

      return resp.ok;
    } catch (err: any) {
      console.error('❌ ORS health check failed:', {
        message: err.message,
        name: err.name,
        cause: err.cause,
        baseUrl: this.baseUrl
      });
      return false;
    }
  }

  async getMatrix(coords: Array<[number, number]>): Promise<any> {
    const url = `${this.baseUrl}/v2/matrix/driving-car`;
    const body = { locations: coords, metrics: ['duration', 'distance'] };

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, this.matrixTimeoutMs);

    if (!response.ok) {
      const txt = await response.text().catch(() => String(response.status));
      throw new Error(`ORS Matrix error: ${response.status} ${txt}`);
    }
    return response.json();
  }

  async getMatrixChunked(coords: Array<[number, number]>, chunkSize?: number): Promise<{ chunkSize: number; partials: any[] }> {
    const size = chunkSize && chunkSize > 0 ? chunkSize : this.defaultMatrixChunkHint;
    const chunks: Array<Array<[number, number]>> = [];
    for (let i = 0; i < coords.length; i += size) chunks.push(coords.slice(i, i + size));
    const partials: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`🟢 ORS matrix chunk ${i + 1}/${chunks.length} (${chunks[i].length} points)`);
      try {
        const matrix = await this.getMatrix(chunks[i]);
        partials.push({ index: i, size: chunks[i].length, matrix });
      } catch (err) {
        console.warn(`⚠️ Failed to process ORS matrix chunk ${i + 1}:`, err);
        throw err;
      }
    }
    return { chunkSize: size, partials };
  }

  async orsDirectionsGeometry(points: Cliente[]): Promise<Array<[number, number]>> {
    const maxCoords = Math.max(2, this.directionsMaxCoords);
    if (!Array.isArray(points) || points.length < 2) return [];

    const batches: Cliente[][] = [];
    for (let i = 0; i < points.length; i += maxCoords) batches.push(points.slice(i, i + maxCoords));

    let geometry: Array<[number, number]> = [];

    for (let b = 0; b < batches.length; b++) {
      const segment = batches[b];
      if (segment.length < 2) continue;

      try {
        const coords = segment.map((p) => [p.longitude, p.latitude] as [number, number]); // [lon, lat]
        // validate coords quickly
        if (coords.some(c => !isFinite(c[0]) || !isFinite(c[1]))) {
          console.warn("⚠️ ORS directions: invalid coords in segment, skipping ORS call and using linear fallback.");
          segment.forEach((p) => geometry.push([p.latitude, p.longitude]));
          continue;
        }

        // Log detalhado do batch
        console.log(`   🔄 ORS batch ${b + 1}/${batches.length}: ${coords.length} pontos`);
        if (coords.length > 0) {
          console.log(`      Primeiro: [${coords[0][0].toFixed(6)}, ${coords[0][1].toFixed(6)}]`);
          console.log(`      Último: [${coords[coords.length-1][0].toFixed(6)}, ${coords[coords.length-1][1].toFixed(6)}]`);
        }

        const url = `${this.baseUrl}/v2/directions/driving-car/geojson`;
        const body = { coordinates: coords, instructions: false, geometry_simplify: true, continue_straight: true };

        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, this.directionsTimeoutMs);

        if (!resp.ok) {
          const txt = await resp.text().catch(() => String(resp.status));
          console.warn(`⚠️ ORS directions segment failed (status ${resp.status}): ${txt}. Using linear fallback for this segment.`);
          segment.forEach((p) => geometry.push([p.latitude, p.longitude]));
          continue;
        }

        const data = await resp.json();
        const segCoords: unknown = data?.features?.[0]?.geometry?.coordinates ?? [];

        const flattened = flattenCoords(segCoords);
        if (!flattened || flattened.length === 0) {
          console.warn('⚠️ ORS returned empty/invalid geometry for a segment — using linear fallback for that segment.');
          segment.forEach((p) => geometry.push([p.latitude, p.longitude]));
          continue;
        }

        // flattened are [lon,lat] pairs -> convert to [lat,lon]
        const mapped = flattened
          .map((pt) => {
            if (Array.isArray(pt) && pt.length >= 2) {
              const lon = Number(pt[0]);
              const lat = Number(pt[1]);
              if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon] as [number, number];
            }
            return null;
          })
          .filter((p): p is [number, number] => p !== null);

        if (mapped.length === 0) {
          console.warn('⚠️ ORS returned invalid coords for a segment — fallback linear.');
          segment.forEach((p) => geometry.push([p.latitude, p.longitude]));
          continue;
        }

        console.log(`      ✅ Batch ${b + 1} sucesso: ${mapped.length} pontos de geometria`);

        // avoid duplicating the last point of previous segment
        if (geometry.length > 0) {
          const last = geometry[geometry.length - 1];
          const firstMapped = mapped[0];
          if (last[0] === firstMapped[0] && last[1] === firstMapped[1]) {
            geometry.push(...mapped.slice(1));
          } else {
            geometry.push(...mapped);
          }
        } else {
          geometry.push(...mapped);
        }
      } catch (err: any) {
        console.warn(`⚠️ ORS batch ${b + 1}/${batches.length} failed, using linear fallback`);
        console.warn(`   Erro: ${err?.message || 'Desconhecido'}`);
        console.warn(`   URL: ${this.baseUrl}/v2/directions/driving-car/geojson`);
        console.warn(`   Clientes no batch: ${segment.length}`);
        batches[b].forEach((p) => geometry.push([p.latitude, p.longitude]));
      }
    }

    return dedupeConsecutive(geometry);
  }

  async getRouteFromORS(clientes: Cliente[]): Promise<Array<[number, number]>> {
    try {
      if (!Array.isArray(clientes) || clientes.length < 2) return [];

      // quick validation
      if (clientes.some(c => !isFinite(Number(c.latitude)) || !isFinite(Number(c.longitude)))) {
        console.warn("⚠️ ORS getRoute: clients contain invalid coords, returning linear fallback.");
        return clientes.map((c) => [c.latitude, c.longitude]);
      }

      if (clientes.length <= this.directionsMaxCoords) {
        const coords = clientes.map((c) => [c.longitude, c.latitude] as [number, number]);
        const url = `${this.baseUrl}/v2/directions/driving-car/geojson`;
        const body = { coordinates: coords, instructions: false, geometry_simplify: true, continue_straight: true };

        const resp = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }, this.directionsTimeoutMs);

        if (!resp.ok) {
          const txt = await resp.text().catch(() => String(resp.status));
          throw new Error(`ORS Directions error: ${resp.status} ${txt}`);
        }

        const data = await resp.json();
        const route = data?.features?.[0]?.geometry?.coordinates ?? [];
        const flattened = flattenCoords(route);
        if (!flattened || flattened.length === 0) {
          console.warn('⚠️ ORS retornou rota vazia. Usando fallback linear.');
          return clientes.map((c) => [c.latitude, c.longitude]);
        }

        const mapped = flattened.map((pt) => [Number(pt[1]), Number(pt[0])] as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        console.log(`   ✅ ORS: Rota gerada com sucesso (${mapped.length} pontos de geometria)`);
        return dedupeConsecutive(mapped);
      }

      console.log(`   🔄 ORS: ${clientes.length} clientes (usando batches)...`);
      const result = await this.orsDirectionsGeometry(clientes);
      console.log(`   ✅ ORS batches: ${result.length} pontos de geometria gerados`);
      return result;
    } catch (e: any) {
      console.warn('⚠️ Erro no ORS route:', e?.message ?? e);
      // Always return fallback linear geometry
      return (clientes || []).map((c) => [c.latitude, c.longitude]);
    }
  }
}

export const orsService = new ORSService();
