// src/lib/atlas/geoUtils.ts
// Utilitários geográficos para a API ATLAS

// Re-exportar Cliente para que outros arquivos possam importar daqui
export interface Cliente {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  zona_real?: string;
}

export interface Coordenada {
  lat: number;
  lon: number;
}

/**
 * Calcula distância em km usando fórmula de Haversine
 */
export function haversineKm(p1: Coordenada, p2: Coordenada): number {
  const R = 6371; // Raio da Terra em km
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calcula centroide de um conjunto de pontos
 */
export function centroidOf(clientes: Cliente[]): Coordenada {
  if (!clientes?.length) return { lat: 0, lon: 0 };
  
  let sumLat = 0, sumLon = 0;
  for (const c of clientes) { 
    sumLat += +c.latitude; 
    sumLon += +c.longitude; 
  }
  
  return { 
    lat: sumLat / clientes.length, 
    lon: sumLon / clientes.length 
  };
}

/**
 * Calcula mediana de um array numérico
 */
export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const v = [...arr].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Divide array em chunks
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Ordena clientes pelo método do vizinho mais próximo
 */
export function nearestNeighbor(clientes: Cliente[]): Cliente[] {
  if (!clientes?.length) return [];
  
  const pool = [...clientes];
  // Começa do ponto mais noroeste
  pool.sort((a, b) => (a.latitude + a.longitude) - (b.latitude + b.longitude));
  
  const result: Cliente[] = [pool.shift()!];
  
  while (pool.length) {
    const last = result[result.length - 1];
    let best = 0, minDist = Infinity;
    
    for (let i = 0; i < pool.length; i++) {
      const dist = haversineKm(
        { lat: last.latitude, lon: last.longitude },
        { lat: pool[i].latitude, lon: pool[i].longitude }
      );
      if (dist < minDist) { 
        minDist = dist; 
        best = i; 
      }
    }
    
    result.push(pool.splice(best, 1)[0]);
  }
  
  return result;
}

/**
 * Otimização 2-opt para sequenciamento de rotas
 */
export function twoOpt(clientes: Cliente[]): Cliente[] {
  if (clientes.length < 4) return clientes;
  
  const sequence = [...clientes];
  let improved = true;
  
  const dist = (a: Cliente, b: Cliente) => haversineKm(
    { lat: a.latitude, lon: a.longitude },
    { lat: b.latitude, lon: b.longitude }
  );
  
  while (improved) {
    improved = false;
    for (let i = 1; i < sequence.length - 2; i++) {
      for (let k = i + 1; k < sequence.length - 1; k++) {
        const d1 = dist(sequence[i - 1], sequence[i]) + dist(sequence[k], sequence[k + 1]);
        const d2 = dist(sequence[i - 1], sequence[k]) + dist(sequence[i], sequence[k + 1]);
        
        if (d2 + 1e-9 < d1) {
          const reversed = sequence.slice(i, k + 1).reverse();
          sequence.splice(i, reversed.length, ...reversed);
          improved = true;
        }
      }
    }
  }
  
  return sequence;
}

/**
 * Adiciona ordenação aos clientes
 */
export function enumerate(clientes: Cliente[]): Array<Cliente & { ordem: number }> {
  return clientes.map((c, idx) => ({ ...c, ordem: idx + 1 }));
}