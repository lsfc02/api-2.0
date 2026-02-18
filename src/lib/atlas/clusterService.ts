// src/lib/atlas/clusterService.ts
// 🎯 VERSÃO 10 FINAL - CORREÇÃO DE FRAGMENTAÇÃO E FRONTEIRAS
//
// ✅ NOVIDADES:
// - FASE 10: Detecta e corrige dias fragmentados em múltiplas zonas
// - FASE 11: Otimiza fronteiras (move clientes para dias mais próximos)
// - Mantém todas as garantias anteriores

import { Cliente, Coordenada, haversineKm, centroidOf, median, nearestNeighbor, twoOpt, enumerate } from './geoUtils';
import { orsService } from './orsService';
import { vroomService } from './vroomService';

const CONFIG = {
  RAIO_CIDADE_PEQUENA_KM: 2,
  KMEANS_ITERATIONS: 50,
  VROOM_JOB_SAFE: 40,
  MAX_DAYS: 30,
  MIN_VISITAS_ABS: 3,
  OUTLIER_THRESHOLD_KM: 12, 
  MERGE_ROUTE_THRESHOLD_KM: 25,
  TOLERANCIA_BALANCEAMENTO: 0.35,
  MIN_CLIENTES_VIAVEL: 3,
  MAX_DIST_FUSAO_KM: 20,
  MAX_RAIO_DIA_KM: 40,
  SETOR_OVERLAP_THRESHOLD: 0.15,
  MIN_DISTANCIA_CENTROIDES_KM: 5.0,
  EPSILON_ILHA_KM: 8.0, // 🆕 Distância máxima para considerar clientes "conectados"
  THRESHOLD_PROXIMIDADE: 0.7, // 🆕 Cliente deve estar 30% mais perto para ser movido
};

interface Cidade {
  nome: string;
  clientes: Cliente[];
  centroid: Coordenada;
  tipo: 'GRANDE' | 'PEQUENA' | 'MEDIA';
}

interface Setor {
  id: string;
  cidade: string;
  clientes: Cliente[];
  centroid: Coordenada;
  bounds: BoundingBox;
  quadrante?: 'NE' | 'NO' | 'SE' | 'SO' | 'CENTRO';
}

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface RotaDia {
  dia: string;
  clientes: Array<Cliente & { ordem: number }>;
  geometria?: Array<[number, number]>;
}

function normalizeClientes(raw: any[]): Cliente[] {
  const out: Cliente[] = [];
  for (const r of raw || []) {
    if (!r) continue;
    const id = String(r.id ?? r.cod ?? r.codcli ?? r.codigo ?? r._id ?? Math.random()).trim();
    const nome = String(r.nome ?? r.name ?? r.razaosocial ?? `Cliente ${id}`).trim();
    const lat = Number(r.latitude ?? r.lat ?? r.Latitude);
    const lon = Number(r.longitude ?? r.lon ?? r.Longitude);
    if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue;
    out.push({ id, nome, latitude: lat, longitude: lon });
  }
  return out;
}

function getBoundingBox(clientes: Cliente[]): BoundingBox {
  const lats = clientes.map(c => c.latitude);
  const lons = clientes.map(c => c.longitude);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

function calcularSobreposicao(box1: BoundingBox, box2: BoundingBox): number {
  const overlapLat = Math.max(0, Math.min(box1.maxLat, box2.maxLat) - Math.max(box1.minLat, box2.minLat));
  const overlapLon = Math.max(0, Math.min(box1.maxLon, box2.maxLon) - Math.max(box1.minLon, box2.minLon));
  
  if (overlapLat === 0 || overlapLon === 0) return 0;
  
  const area1 = (box1.maxLat - box1.minLat) * (box1.maxLon - box1.minLon);
  const area2 = (box2.maxLat - box2.minLat) * (box2.maxLon - box2.minLon);
  const overlapArea = overlapLat * overlapLon;
  
  const minArea = Math.min(area1, area2);
  return overlapArea / minArea;
}

function identificarCidades(clientes: Cliente[]): Map<string, Cliente[]> {
  console.log(`\n🏙️ Identificando cidades...`);
  const EPSILON = 8.0;
  const visitados = new Set<string>();
  const clusters: Cliente[][] = [];
  
  for (const cliente of clientes) {
    if (visitados.has(cliente.id)) continue;
    const cluster: Cliente[] = [cliente];
    visitados.add(cliente.id);
    const fila = [cliente];
    
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const outro of clientes) {
        if (visitados.has(outro.id)) continue;
        const dist = haversineKm(
          { lat: atual.latitude, lon: atual.longitude },
          { lat: outro.latitude, lon: outro.longitude }
        );
        if (dist <= EPSILON) {
          cluster.push(outro);
          visitados.add(outro.id);
          fila.push(outro);
        }
      }
    }
    if (cluster.length > 0) clusters.push(cluster);
  }
  
  const cidadesMap = new Map<string, Cliente[]>();
  clusters.sort((a, b) => b.length - a.length);
  clusters.forEach((cluster, idx) => {
    cidadesMap.set(`CIDADE_${String.fromCharCode(65 + idx)}`, cluster);
  });
  
  console.log(`✅ ${cidadesMap.size} cidades:`);
  cidadesMap.forEach((c, n) => console.log(`   ${n}: ${c.length} clientes`));
  return cidadesMap;
}

function classificarCidades(cidadesMap: Map<string, Cliente[]>, targetPorDia: number): Cidade[] {
  console.log(`\n📊 Classificando (target: ${targetPorDia}/dia)...`);
  const cidades: Cidade[] = [];
  
  cidadesMap.forEach((clientes, nome) => {
    const centroid = centroidOf(clientes);
    let tipo: 'GRANDE' | 'MEDIA' | 'PEQUENA';
    
    if (clientes.length >= targetPorDia * 2) {
      tipo = 'GRANDE';
    } else if (clientes.length >= targetPorDia * 0.6) {
      tipo = 'MEDIA';
    } else {
      tipo = 'PEQUENA';
    }
    
    cidades.push({ nome, clientes, centroid, tipo });
    console.log(`   ${nome}: ${tipo} (${clientes.length} clientes)`);
  });
  
  return cidades;
}

function dividirPorSetoresGeograficos(clientes: Cliente[], cidadeNome: string, targetPorDia: number): Setor[] {
  const centroid = centroidOf(clientes);
  
  const raioMedio = clientes.map(c => haversineKm(
    { lat: c.latitude, lon: c.longitude },
    centroid
  )).reduce((a, b) => a + b, 0) / clientes.length;
  
  const raioCentro = raioMedio * 0.3;
  
  const quadrantes: Record<string, Cliente[]> = {
    'CENTRO': [],
    'NE': [],
    'NO': [],  
    'SE': [],
    'SO': []
  };
  
  for (const cliente of clientes) {
    const dist = haversineKm(
      { lat: cliente.latitude, lon: cliente.longitude },
      centroid
    );
    
    if (dist <= raioCentro) {
      quadrantes['CENTRO'].push(cliente);
      continue;
    }
    
    const norte = cliente.latitude > centroid.lat;
    const leste = cliente.longitude > centroid.lon;
    
    if (norte && leste) {
      quadrantes['NE'].push(cliente);
    } else if (norte && !leste) {
      quadrantes['NO'].push(cliente);
    } else if (!norte && leste) {
      quadrantes['SE'].push(cliente);
    } else {
      quadrantes['SO'].push(cliente);
    }
  }
  
  const setores: Setor[] = [];
  
  for (const [quadrante, clientesQuad] of Object.entries(quadrantes)) {
    if (clientesQuad.length === 0) continue;
    
    const tamanhoIdeal = targetPorDia;
    const numSubsetores = Math.max(1, Math.round(clientesQuad.length / tamanhoIdeal));
    
    if (numSubsetores === 1 || clientesQuad.length <= tamanhoIdeal * 1.3) {
      setores.push({
        id: `${cidadeNome}_${quadrante}`,
        cidade: cidadeNome,
        clientes: clientesQuad,
        centroid: centroidOf(clientesQuad),
        bounds: getBoundingBox(clientesQuad),
        quadrante: quadrante as any
      });
    } else {
      const subsetores = subdividirQuadrantePorFaixas(clientesQuad, numSubsetores);
      subsetores.forEach((sub, idx) => {
        setores.push({
          id: `${cidadeNome}_${quadrante}${idx + 1}`,
          cidade: cidadeNome,
          clientes: sub,
          centroid: centroidOf(sub),
          bounds: getBoundingBox(sub),
          quadrante: quadrante as any
        });
      });
    }
  }
  
  return setores;
}

function subdividirQuadrantePorFaixas(clientes: Cliente[], numFaixas: number): Cliente[][] {
  if (clientes.length <= numFaixas) {
    return clientes.map(c => [c]);
  }
  
  const bounds = getBoundingBox(clientes);
  const alturaLat = bounds.maxLat - bounds.minLat;
  const larguraLon = bounds.maxLon - bounds.minLon;
  
  const dividirPorLat = alturaLat > larguraLon;
  
  if (dividirPorLat) {
    const sorted = [...clientes].sort((a, b) => a.latitude - b.latitude);
    const tamFaixa = Math.ceil(sorted.length / numFaixas);
    const faixas: Cliente[][] = [];
    
    for (let i = 0; i < numFaixas; i++) {
      const inicio = i * tamFaixa;
      const fim = Math.min((i + 1) * tamFaixa, sorted.length);
      if (inicio < sorted.length) {
        faixas.push(sorted.slice(inicio, fim));
      }
    }
    
    return faixas.filter(f => f.length > 0);
  } else {
    const sorted = [...clientes].sort((a, b) => a.longitude - b.longitude);
    const tamFaixa = Math.ceil(sorted.length / numFaixas);
    const faixas: Cliente[][] = [];
    
    for (let i = 0; i < numFaixas; i++) {
      const inicio = i * tamFaixa;
      const fim = Math.min((i + 1) * tamFaixa, sorted.length);
      if (inicio < sorted.length) {
        faixas.push(sorted.slice(inicio, fim));
      }
    }
    
    return faixas.filter(f => f.length > 0);
  }
}

function dividirCidades(cidades: Cidade[], targetPorDia: number): Setor[] {
  console.log(`\n🏘️ Dividindo cidades em SETORES GEOGRÁFICOS...`);
  const setores: Setor[] = [];
  
  const minSetor = Math.max(CONFIG.MIN_CLIENTES_VIAVEL, Math.floor(targetPorDia * 0.7));
  const maxSetor = Math.ceil(targetPorDia * 1.3);
  const idealSetor = targetPorDia;
  
  console.log(`   🎯 Tamanho ideal de setor: ${idealSetor} (min: ${minSetor}, max: ${maxSetor})`);
  
  for (const cidade of cidades) {
    const total = cidade.clientes.length;
    
    if (cidade.tipo === 'PEQUENA') {
      console.log(`   ${cidade.nome}: PEQUENA - mantendo inteira (${total} clientes)`);
      setores.push({
        id: `${cidade.nome}_TODO`,
        cidade: cidade.nome,
        clientes: cidade.clientes,
        centroid: cidade.centroid,
        bounds: getBoundingBox(cidade.clientes)
      });
    } else if (cidade.tipo === 'MEDIA') {
      if (total <= maxSetor) {
        console.log(`   ${cidade.nome}: MEDIA - mantendo inteira (${total} clientes)`);
        setores.push({
          id: `${cidade.nome}_TODO`,
          cidade: cidade.nome,
          clientes: cidade.clientes,
          centroid: cidade.centroid,
          bounds: getBoundingBox(cidade.clientes)
        });
      } else {
        console.log(`   ${cidade.nome}: MEDIA - dividindo em setores (${total} clientes)`);
        const novosSetores = dividirPorSetoresGeograficos(cidade.clientes, cidade.nome, targetPorDia);
        setores.push(...novosSetores);
      }
    } else {
      console.log(`   ${cidade.nome}: GRANDE - DIVIDINDO EM SETORES GEOGRÁFICOS (${total} clientes)`);
      const novosSetores = dividirPorSetoresGeograficos(cidade.clientes, cidade.nome, targetPorDia);
      setores.push(...novosSetores);
    }
  }
  
  console.log(`✅ ${setores.length} setores criados`);
  setores.forEach(s => console.log(`      ${s.id}: ${s.clientes.length} clientes [${s.quadrante || 'N/A'}]`));
  
  return setores;
}

function validarSobreposicao(setores: Setor[]): void {
  console.log(`\n🔍 Validando sobreposição entre setores...`);
  
  let problemasEncontrados = 0;
  
  for (let i = 0; i < setores.length; i++) {
    for (let j = i + 1; j < setores.length; j++) {
      const s1 = setores[i];
      const s2 = setores[j];
      
      if (s1.cidade === s2.cidade) continue;
      
      const overlap = calcularSobreposicao(s1.bounds, s2.bounds);
      const distCentroides = haversineKm(s1.centroid, s2.centroid);
      
      if (overlap > CONFIG.SETOR_OVERLAP_THRESHOLD) {
        console.log(`   ⚠️ SOBREPOSIÇÃO: ${s1.id} ↔ ${s2.id} (${(overlap * 100).toFixed(1)}%)`);
        problemasEncontrados++;
      }
      
      if (distCentroides < CONFIG.MIN_DISTANCIA_CENTROIDES_KM) {
        console.log(`   ⚠️ CENTROIDES PRÓXIMOS: ${s1.id} ↔ ${s2.id} (${distCentroides.toFixed(2)}km)`);
        problemasEncontrados++;
      }
    }
  }
  
  if (problemasEncontrados === 0) {
    console.log(`✅ Nenhuma sobreposição detectada!`);
  } else {
    console.log(`⚠️ ${problemasEncontrados} problemas de sobreposição encontrados`);
  }
}

/**
 * 🎯 FORÇAR FUSÃO DE OUTLIERS - NUNCA deixar isolados
 */
function fundirOutliersPequenos(setores: Setor[], targetPorDia: number): Setor[] {
  console.log(`\n🔍 Fundindo outliers pequenos (<${CONFIG.MIN_CLIENTES_VIAVEL})...`);
  
  const bonsSetores = setores.filter(s => s.clientes.length >= CONFIG.MIN_CLIENTES_VIAVEL);
  const outliers = setores.filter(s => s.clientes.length < CONFIG.MIN_CLIENTES_VIAVEL);
  
  if (outliers.length === 0) {
    console.log(`✅ Nenhum outlier encontrado.`);
    return setores;
  }
  
  if (bonsSetores.length === 0) {
    console.log(`   ⚠️ Todos são outliers. Agrupando TODOS.`);
    const todosClientes = outliers.flatMap(o => o.clientes);
    return [{
      id: 'OUTLIERS_AGRUPADOS',
      cidade: outliers[0].cidade,
      clientes: todosClientes,
      centroid: centroidOf(todosClientes),
      bounds: getBoundingBox(todosClientes)
    }];
  }
  
  console.log(`   ${outliers.length} outliers - TODOS serão fundidos (FORÇADO)`);
  
  let movimentos = 0;
  outliers.sort((a, b) => a.clientes.length - b.clientes.length);
  
  for (const outlier of outliers) {
    let maisProximo: Setor | null = null;
    let menorDist = Infinity;

    for (const bom of bonsSetores) {
      const dist = haversineKm(outlier.centroid, bom.centroid);
      if (dist < menorDist) {
        menorDist = dist;
        maisProximo = bom;
      }
    }
    
    if (maisProximo) {
      const aviso = menorDist > 30 ? '⚠️ FORÇADO (longe)' : `${menorDist.toFixed(1)}km`;
      console.log(`   ✅ ${outlier.id} (${outlier.clientes.length}) → ${maisProximo.id} [${aviso}]`);
      
      maisProximo.clientes.push(...outlier.clientes);
      maisProximo.centroid = centroidOf(maisProximo.clientes);
      maisProximo.bounds = getBoundingBox(maisProximo.clientes);
      movimentos += outlier.clientes.length;
    }
  }
  
  console.log(`✅ ${movimentos} clientes fundidos - ZERO outliers mantidos`);
  return bonsSetores;
}

function agruparSetoresPequenos(setores: Setor[], targetPorDia: number): Setor[] {
  console.log(`\n🧭 Agrupando setores pequenos adjacentes...`);
  
  const limiteInferior = Math.floor(targetPorDia * 0.7);
  const limiteSuperior = Math.ceil(targetPorDia * 1.3);
  
  let pequenos = setores.filter(s => s.clientes.length < limiteInferior);
  const adequados = setores.filter(s => s.clientes.length >= limiteInferior);
  
  if (pequenos.length < 2) {
    console.log(`   Apenas ${pequenos.length} setor(es) pequeno(s).`);
    return setores;
  }
  
  console.log(`   ${pequenos.length} setores pequenos, ${adequados.length} adequados`);
  
  const resultado = [...adequados];
  const agrupados = new Set<string>();
  
  for (let i = 0; i < pequenos.length; i++) {
    if (agrupados.has(pequenos[i].id)) continue;
    
    const grupo = [pequenos[i]];
    let tamanhoGrupo = pequenos[i].clientes.length;
    
    for (let j = i + 1; j < pequenos.length; j++) {
      if (agrupados.has(pequenos[j].id)) continue;
      
      const mesmaCidade = pequenos[i].cidade === pequenos[j].cidade;
      const dist = haversineKm(pequenos[i].centroid, pequenos[j].centroid);
      
      const podeAgrupar = (
        mesmaCidade && 
        dist < CONFIG.MAX_DIST_FUSAO_KM && 
        tamanhoGrupo + pequenos[j].clientes.length <= limiteSuperior
      );
      
      if (podeAgrupar) {
        grupo.push(pequenos[j]);
        tamanhoGrupo += pequenos[j].clientes.length;
        agrupados.add(pequenos[j].id);
      }
    }
    
    if (grupo.length > 1) {
      const clientesAgrupados = grupo.flatMap(s => s.clientes);
      const novoId = grupo.map(s => s.id.split('_').pop()).join('+');
      
      resultado.push({
        id: `GRUPO_${novoId}`,
        cidade: grupo[0].cidade,
        clientes: clientesAgrupados,
        centroid: centroidOf(clientesAgrupados),
        bounds: getBoundingBox(clientesAgrupados)
      });
      
      console.log(`   ✅ Agrupados ${grupo.length} setores → ${clientesAgrupados.length} clientes`);
      agrupados.add(pequenos[i].id);
    } else {
      resultado.push(pequenos[i]);
    }
  }
  
  console.log(`✅ ${resultado.length} setores após agrupamento`);
  return resultado;
}

function distribuirSetores(setores: Setor[], numDias: number, targetPorDia: number): Cliente[][] {
  console.log(`\n📅 Distribuindo ${setores.length} setores em ${numDias} dias...`);
  
  const dias: { setores: Setor[]; load: number; centroid: Coordenada | null }[] = 
    Array.from({ length: numDias }, () => ({ setores: [], load: 0, centroid: null }));
  
  const setoresPorCidade = new Map<string, Setor[]>();
  
  for (const setor of setores) {
    if (!setoresPorCidade.has(setor.cidade)) {
      setoresPorCidade.set(setor.cidade, []);
    }
    setoresPorCidade.get(setor.cidade)!.push(setor);
  }
  
  const cidadesOrdenadas = Array.from(setoresPorCidade.entries())
    .sort((a, b) => {
      const totalA = a[1].reduce((sum, s) => sum + s.clientes.length, 0);
      const totalB = b[1].reduce((sum, s) => sum + s.clientes.length, 0);
      return totalB - totalA;
    });
  
  for (const [cidade, setoresCidade] of cidadesOrdenadas) {
    const sorted = [...setoresCidade].sort((a, b) => b.clientes.length - a.clientes.length);
    
    for (const setor of sorted) {
      let melhorDia = -1;
      let menorCarga = Infinity;
      let diaMesmaCidade = -1;
      let menorDistancia = Infinity;
      
      for (let d = 0; d < numDias; d++) {
        const temMesmaCidade = dias[d].setores.some(s => s.cidade === cidade);
        
        if (temMesmaCidade && dias[d].load + setor.clientes.length <= targetPorDia * 1.5) {
          if (dias[d].centroid) {
            const distancia = haversineKm(setor.centroid, dias[d].centroid!);
            
            if (distancia > 30) continue;
            
            if (distancia < menorDistancia) {
              menorDistancia = distancia;
              diaMesmaCidade = d;
            }
          } else {
            diaMesmaCidade = d;
            break;
          }
        }
        
        if (dias[d].load < menorCarga) {
          menorCarga = dias[d].load;
          melhorDia = d;
        }
      }
      
      let diaEscolhido = melhorDia;
      
      if (diaMesmaCidade >= 0) {
        diaEscolhido = diaMesmaCidade;
      } else {
        let diaMaisProximo = -1;
        let distMaisProxima = Infinity;
        
        for (let d = 0; d < numDias; d++) {
          if (dias[d].centroid) {
            const dist = haversineKm(setor.centroid, dias[d].centroid!);
            if (dist < distMaisProxima && dias[d].load + setor.clientes.length <= targetPorDia * 1.8) {
              distMaisProxima = dist;
              diaMaisProximo = d;
            }
          }
        }
        
        if (diaMaisProximo >= 0 && distMaisProxima < 25) {
          diaEscolhido = diaMaisProximo;
        }
      }
      
      dias[diaEscolhido].setores.push(setor);
      dias[diaEscolhido].load += setor.clientes.length;
      
      const clientesDia = dias[diaEscolhido].setores.flatMap(s => s.clientes);
      dias[diaEscolhido].centroid = centroidOf(clientesDia);
    }
  }
  
  // Balanceamento fino
  const maxIteracoes = 50;
  for (let iter = 0; iter < maxIteracoes; iter++) {
    const loads = dias.map(d => d.load);
    const maxIdx = loads.indexOf(Math.max(...loads));
    const minIdx = loads.indexOf(Math.min(...loads));
    const diff = loads[maxIdx] - loads[minIdx];
    
    const tolerancia = targetPorDia * CONFIG.TOLERANCIA_BALANCEAMENTO;
    if (diff <= tolerancia || dias[maxIdx].setores.length <= 1) break;
    
    const setoresOrdenados = [...dias[maxIdx].setores].sort((a, b) => a.clientes.length - b.clientes.length);
    const candidato = setoresOrdenados[0];
    
    if (!candidato) break;
    
    const novaMaxLoad = loads[maxIdx] - candidato.clientes.length;
    const novaMinLoad = loads[minIdx] + candidato.clientes.length;
    const novaDiff = Math.abs(novaMaxLoad - novaMinLoad);
    
    if (novaDiff < diff) {
      dias[maxIdx].setores = dias[maxIdx].setores.filter(s => s !== candidato);
      dias[maxIdx].load -= candidato.clientes.length;
      dias[minIdx].setores.push(candidato);
      dias[minIdx].load += candidato.clientes.length;
      
      if (dias[maxIdx].setores.length > 0) {
        dias[maxIdx].centroid = centroidOf(dias[maxIdx].setores.flatMap(s => s.clientes));
      }
      dias[minIdx].centroid = centroidOf(dias[minIdx].setores.flatMap(s => s.clientes));
    } else {
      break;
    }
  }
  
  console.log(`\n📊 Resultado Final:`);
  dias.forEach((d, i) => {
    const desvio = ((d.load - targetPorDia) / targetPorDia * 100).toFixed(1);
    console.log(`   Dia ${i + 1}: ${d.load} clientes (${desvio}%)`);
  });
  
  // 🎯 PROTEÇÃO: Redistribuir dias vazios ANTES de retornar
  for (let i = 0; i < dias.length; i++) {
    if (dias[i].load === 0) {
      console.log(`⚠️ Dia ${i + 1} VAZIO! Redistribuindo...`);
      
      let maxLoad = 0;
      let maxIdx = -1;
      for (let j = 0; j < dias.length; j++) {
        if (dias[j].load > maxLoad && dias[j].setores.length > 1) {
          maxLoad = dias[j].load;
          maxIdx = j;
        }
      }
      
      if (maxIdx !== -1) {
        const setorParaMover = dias[maxIdx].setores.sort((a, b) => a.clientes.length - b.clientes.length)[0];
        if (setorParaMover) {
          dias[maxIdx].setores = dias[maxIdx].setores.filter(s => s !== setorParaMover);
          dias[maxIdx].load -= setorParaMover.clientes.length;
          dias[i].setores.push(setorParaMover);
          dias[i].load += setorParaMover.clientes.length;
          console.log(`   ✅ Movido ${setorParaMover.id} do Dia ${maxIdx + 1}`);
        }
      }
    }
  }
  
  return dias.map(d => d.setores.flatMap(s => s.clientes));
}

/**
 * 🆕 FASE 10: DETECTAR ILHAS SEPARADAS (fragmentação geográfica)
 * Usa DBSCAN para identificar grupos desconectados de clientes
 */
function detectarIlhas(clientes: Cliente[]): Cliente[][] {
  if (clientes.length < 2) return [clientes];
  
  const EPSILON_ILHA_KM = CONFIG.EPSILON_ILHA_KM;
  const visitados = new Set<string>();
  const ilhas: Cliente[][] = [];
  
  for (const cliente of clientes) {
    if (visitados.has(cliente.id)) continue;
    
    const ilha: Cliente[] = [cliente];
    visitados.add(cliente.id);
    const fila = [cliente];
    
    while (fila.length > 0) {
      const atual = fila.shift()!;
      
      for (const outro of clientes) {
        if (visitados.has(outro.id)) continue;
        
        const dist = haversineKm(
          { lat: atual.latitude, lon: atual.longitude },
          { lat: outro.latitude, lon: outro.longitude }
        );
        
        if (dist <= EPSILON_ILHA_KM) {
          ilha.push(outro);
          visitados.add(outro.id);
          fila.push(outro);
        }
      }
    }
    
    ilhas.push(ilha);
  }
  
  return ilhas;
}

async function sequenceAndGeometry(
  clientes: Cliente[],
  base?: { lat: number; lon: number }
): Promise<{
  ordered: Array<Cliente & { ordem: number }>;
  geometry: Array<[number, number]>;
}> {
  if (!clientes || clientes.length <= 1) {
    return {
      ordered: enumerate(clientes || []),
      geometry: (clientes || []).map(c => [c.latitude, c.longitude])
    };
  }

  let seq: Cliente[];

  // Se tem ponto de partida, começar do cliente mais próximo dele
  if (base) {
    // Encontrar o cliente mais próximo do ponto de partida
    let clienteMaisProximo = clientes[0];
    let menorDist = haversineKm(
      { lat: base.lat, lon: base.lon },
      { lat: clientes[0].latitude, lon: clientes[0].longitude }
    );

    for (const cliente of clientes) {
      const dist = haversineKm(
        { lat: base.lat, lon: base.lon },
        { lat: cliente.latitude, lon: cliente.longitude }
      );
      if (dist < menorDist) {
        menorDist = dist;
        clienteMaisProximo = cliente;
      }
    }

    // Começar a rota do cliente mais próximo do ponto de partida
    const reordenados = [clienteMaisProximo, ...clientes.filter(c => c.id !== clienteMaisProximo.id)];
    seq = nearestNeighbor(reordenados);
  } else {
    seq = nearestNeighbor(clientes);
  }

  seq = twoOpt(seq);

  try {
    const res = await vroomService.optimizeRoute(seq);
    if (res?.ordered?.length > 0) {
      // VROOM já otimizou e retornou a geometria
      let geometry = res.geometry?.length > 0 ?
        res.geometry :
        await orsService.getRouteFromORS(res.ordered).catch((err) => {
          console.warn(`⚠️ ORS falhou após VROOM: ${err?.message || err}`);
          return res.ordered.map(c => [c.latitude, c.longitude] as [number, number]);
        });

      return { ordered: res.ordered, geometry };
    }
  } catch (err: any) {
    console.warn(`⚠️ VROOM falhou: ${err?.message || err}`);
    if (err?.cause) console.warn(`   Causa VROOM: ${err.cause?.code || err.cause?.message || String(err.cause)}`);
  }

  const ordered = enumerate(seq);

  // Fallback: usar ORS para gerar geometria da rota
  console.log(`   🔄 Tentando ORS para ${seq.length} clientes (fallback após VROOM falhar)...`);
  let geometry = await orsService.getRouteFromORS(seq)
    .catch((err) => {
      console.warn(`⚠️ ORS também falhou: ${err?.message || err}`);
      console.warn(`   Usando geometria linear (linha reta) para ${seq.length} clientes`);
      return seq.map(c => [c.latitude, c.longitude] as [number, number]);
    });

  return { ordered, geometry };
}

export async function gerarRoteiro(
  clientesRaw: any[],
  numDiasAlvo: number = 10,
  base?: { lat: number; lon: number }
): Promise<{ dias: RotaDia[] }> {

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 ROTEIRIZAÇÃO v10 - COM CORREÇÃO DE FRAGMENTAÇÃO`);
  if (base && base.lat !== undefined && base.lon !== undefined) {
    console.log(`📍 Ponto de partida definido: lat=${base.lat}, lon=${base.lon}`);
  } else {
    console.log(`📍 Ponto de partida: Não especificado (será usado o centroide)`);
  }
  console.log(`${'='.repeat(80)}`);

  const clientesValidos = normalizeClientes(clientesRaw);
  if (clientesValidos.length === 0) throw new Error("Nenhum cliente válido");

  const total = clientesValidos.length;
  
  // 🎯 CALCULAR K MÁXIMO VIÁVEL (mínimo 3 clientes/dia)
  const kMaximoViavel = Math.floor(total / CONFIG.MIN_CLIENTES_VIAVEL);
  
  let K = Math.min(CONFIG.MAX_DAYS, Math.max(1, numDiasAlvo));
  
  // ⚠️ AJUSTAR K SE IMPOSSÍVEL
  if (K > kMaximoViavel) {
    console.log(`\n⚠️ AJUSTE CRÍTICO:`);
    console.log(`   Dias solicitados: ${K}`);
    console.log(`   Máximo viável: ${kMaximoViavel} (${total} clientes ÷ ${CONFIG.MIN_CLIENTES_VIAVEL} mín/dia)`);
    console.log(`   Ajustando para: ${kMaximoViavel} dias`);
    K = kMaximoViavel;
  }
  
  const targetPorDia = Math.ceil(total / K);

  console.log(`📊 ${total} clientes → ${K} dias (target: ${targetPorDia}/dia, min: ${CONFIG.MIN_CLIENTES_VIAVEL})`);

  const cidadesMap = identificarCidades(clientesValidos);
  const cidades = classificarCidades(cidadesMap, targetPorDia);
  
  let setores = dividirCidades(cidades, targetPorDia);
  validarSobreposicao(setores);
  
  setores = fundirOutliersPequenos(setores, targetPorDia);
  setores = agruparSetoresPequenos(setores, targetPorDia);
  
  validarSobreposicao(setores);
  
  let diasClientes = distribuirSetores(setores, K, targetPorDia);
  
  // FASE 8: Validação de raio
  console.log(`\n🔍 Validando raio dos dias (máx: ${CONFIG.MAX_RAIO_DIA_KM}km)...`);
  
  for (let i = 0; i < diasClientes.length; i++) {
    const lista = diasClientes[i];
    if (lista.length === 0) continue;
    
    const centroid = centroidOf(lista);
    const raios = lista.map(c => haversineKm(
      { lat: c.latitude, lon: c.longitude },
      centroid
    ));
    const raioMax = Math.max(...raios, 0);
    
    if (raioMax > CONFIG.MAX_RAIO_DIA_KM) {
      console.log(`   ⚠️ Dia ${i + 1}: Raio EXCESSIVO (${raioMax.toFixed(1)}km)`);
      
      const clientesComDist = lista.map((c) => ({
        cliente: c,
        dist: haversineKm({ lat: c.latitude, lon: c.longitude }, centroid)
      })).sort((a, b) => b.dist - a.dist);
      
      const numParaMover = Math.max(1, Math.ceil(clientesComDist.length * 0.2));
      const clientesParaMover = clientesComDist.slice(0, numParaMover);
      
      for (const { cliente, dist } of clientesParaMover) {
        let melhorDia = -1;
        let menorDist = Infinity;
        
        for (let j = 0; j < diasClientes.length; j++) {
          if (i === j || diasClientes[j].length === 0) continue;
          
          const centroidOutro = centroidOf(diasClientes[j]);
          const distOutro = haversineKm(
            { lat: cliente.latitude, lon: cliente.longitude },
            centroidOutro
          );
          
          if (distOutro < dist * 0.6 && 
              distOutro < menorDist && 
              distOutro < CONFIG.MAX_RAIO_DIA_KM * 0.8 &&
              diasClientes[j].length < targetPorDia * 1.8) {
            menorDist = distOutro;
            melhorDia = j;
          }
        }
        
        if (melhorDia >= 0) {
          diasClientes[i] = diasClientes[i].filter(c => c.id !== cliente.id);
          diasClientes[melhorDia].push(cliente);
        }
      }
      
      if (diasClientes[i].length > 0) {
        const novoCentroid = centroidOf(diasClientes[i]);
        const novosRaios = diasClientes[i].map(c => haversineKm(
          { lat: c.latitude, lon: c.longitude },
          novoCentroid
        ));
        const novoRaioMax = Math.max(...novosRaios, 0);
        console.log(`      Novo raio: ${novoRaioMax.toFixed(1)}km ${novoRaioMax <= CONFIG.MAX_RAIO_DIA_KM ? '✅' : '⚠️'}`);
      }
    } else {
      console.log(`   ✅ Dia ${i + 1}: Raio OK (${raioMax.toFixed(1)}km)`);
    }
  }
  
  // FASE 9: 🎯 BALANCEAMENTO FORÇADO - TODOS OS DIAS DEVEM TER CLIENTES
  console.log(`\n🔍 FASE 9: Balanceamento forçado (TODOS os ${K} dias devem ter clientes)...`);
  
  let diasVazios = 0;
  const minimoAbsoluto = CONFIG.MIN_CLIENTES_VIAVEL;
  
  // Contar dias vazios
  for (let i = 0; i < K; i++) {
    if (!diasClientes[i] || diasClientes[i].length === 0) {
      diasVazios++;
    }
  }
  
  if (diasVazios > 0) {
    console.log(`   ⚠️ ${diasVazios} dia(s) vazio(s) detectado(s) - FORÇANDO redistribuição...`);
    
    // Estratégia: Pegar dias mais cheios e dividir
    let iteracoes = 0;
    const maxIteracoes = 50;
    
    while (diasVazios > 0 && iteracoes < maxIteracoes) {
      iteracoes++;
      
      // Encontrar dia vazio
      let diaVazio = -1;
      for (let i = 0; i < K; i++) {
        if (!diasClientes[i] || diasClientes[i].length === 0) {
          diaVazio = i;
          break;
        }
      }
      
      if (diaVazio === -1) break;
      
      // Encontrar dia mais cheio que pode doar clientes
      let diaMaisCheio = -1;
      let maiorCarga = 0;
      
      for (let i = 0; i < K; i++) {
        if (!diasClientes[i]) continue;
        const carga = diasClientes[i].length;
        
        // Só pode doar se ficará com >= minimoAbsoluto
        if (carga > minimoAbsoluto && carga > maiorCarga) {
          maiorCarga = carga;
          diaMaisCheio = i;
        }
      }
      
      if (diaMaisCheio === -1) {
        console.log(`   ❌ Impossível balancear - nenhum dia pode doar clientes`);
        break;
      }
      
      // Mover metade dos clientes do dia mais cheio para o dia vazio
      const clientesDoar = diasClientes[diaMaisCheio];
      const numDoar = Math.max(minimoAbsoluto, Math.floor(clientesDoar.length / 2));
      
      const clientesMovidos = clientesDoar.slice(0, numDoar);
      diasClientes[diaMaisCheio] = clientesDoar.slice(numDoar);
      diasClientes[diaVazio] = clientesMovidos;
      
      console.log(`      ✅ Dia ${diaMaisCheio + 1} (${maiorCarga}) → Dia ${diaVazio + 1} (${numDoar} clientes)`);
      
      diasVazios--;
    }
    
    if (iteracoes >= maxIteracoes) {
      console.log(`   ⚠️ Atingido limite de iterações`);
    }
  } else {
    console.log(`   ✅ Todos os ${K} dias já possuem clientes`);
  }
  
  // 🆕 FASE 10: DETECTAR E CORRIGIR FRAGMENTAÇÃO (dias em múltiplas zonas)
  console.log(`\n🔍 FASE 10: Detectando fragmentação (dias em múltiplas zonas)...`);
  
  for (let i = 0; i < diasClientes.length; i++) {
    if (!diasClientes[i] || diasClientes[i].length < 4) continue;
    
    const clientes = diasClientes[i];
    const ilhas = detectarIlhas(clientes);
    
    if (ilhas.length > 1) {
      console.log(`   ⚠️ Dia ${i + 1}: FRAGMENTADO em ${ilhas.length} zonas!`);
      
      // Manter a maior ilha, realocar as menores
      ilhas.sort((a, b) => b.length - a.length);
      const ilhaPrincipal = ilhas[0];
      const ilhasSecundarias = ilhas.slice(1);
      
      for (const ilha of ilhasSecundarias) {
        const centroidIlha = centroidOf(ilha);
        
        // Encontrar o dia mais próximo geograficamente
        let melhorDia = -1;
        let menorDist = Infinity;
        
        for (let j = 0; j < diasClientes.length; j++) {
          if (i === j || !diasClientes[j] || diasClientes[j].length === 0) continue;
          
          const centroidOutro = centroidOf(diasClientes[j]);
          const dist = haversineKm(centroidIlha, centroidOutro);
          
          if (dist < menorDist && diasClientes[j].length < targetPorDia * 1.8) {
            menorDist = dist;
            melhorDia = j;
          }
        }
        
        if (melhorDia >= 0) {
          console.log(`      ✅ Movendo ilha de ${ilha.length} cliente(s) para Dia ${melhorDia + 1} (${menorDist.toFixed(1)}km)`);
          
          // Remover da ilha do dia atual
          for (const cliente of ilha) {
            diasClientes[i] = diasClientes[i].filter(c => c.id !== cliente.id);
          }
          
          // Adicionar ao dia mais próximo
          diasClientes[melhorDia].push(...ilha);
        }
      }
      
      console.log(`      Nova configuração Dia ${i + 1}: ${diasClientes[i].length} clientes (contíguo)`);
    }
  }
  
  // 🆕 FASE 11: OTIMIZAÇÃO DE FRONTEIRAS (clientes mais próximos de outros dias)
  console.log(`\n🎯 FASE 11: Otimizando fronteiras (clientes próximos de outros dias)...`);
  
  let movimentosOtimizacao = 0;
  const maxIteracoesOtimizacao = 3;
  
  for (let iteracao = 0; iteracao < maxIteracoesOtimizacao; iteracao++) {
    let houveMudanca = false;
    
    for (let i = 0; i < diasClientes.length; i++) {
      if (!diasClientes[i] || diasClientes[i].length <= minimoAbsoluto) continue;
      
      const centroidAtual = centroidOf(diasClientes[i]);
      
      // Calcular centroides de todos os outros dias
      const outrosCentroides = diasClientes.map((d, idx) => {
        if (idx === i || !d || d.length === 0) return null;
        return { idx, centroid: centroidOf(d) };
      }).filter(x => x !== null) as Array<{ idx: number; centroid: Coordenada }>;
      
      // Para cada cliente do dia atual, verificar se está mais próximo de outro dia
      const clientesParaAvaliar = [...diasClientes[i]];
      
      for (const cliente of clientesParaAvaliar) {
        const posCliente = { lat: cliente.latitude, lon: cliente.longitude };
        const distAtual = haversineKm(posCliente, centroidAtual);
        
        // Verificar se está mais próximo de outro dia
        for (const outro of outrosCentroides) {
          const distOutro = haversineKm(posCliente, outro.centroid);
          
          // Se está significativamente mais próximo do outro dia (threshold configurável)
          if (distOutro < distAtual * CONFIG.THRESHOLD_PROXIMIDADE && 
              diasClientes[outro.idx].length < targetPorDia * 1.8) {
            
            console.log(`      ✅ Movendo cliente "${cliente.nome.substring(0, 20)}..." de Dia ${i + 1} → Dia ${outro.idx + 1}`);
            console.log(`         (${distAtual.toFixed(1)}km → ${distOutro.toFixed(1)}km)`);
            
            // Mover cliente
            diasClientes[i] = diasClientes[i].filter(c => c.id !== cliente.id);
            diasClientes[outro.idx].push(cliente);
            
            movimentosOtimizacao++;
            houveMudanca = true;
            
            break; // Próximo cliente
          }
        }
      }
    }
    
    if (!houveMudanca) {
      console.log(`   ✅ Convergência atingida na iteração ${iteracao + 1}`);
      break;
    }
  }
  
  console.log(`   Total de movimentações: ${movimentosOtimizacao}`);
  
  // Validação final: Garantir que TODOS os K dias têm clientes
  let todosDiasOK = true;
  for (let i = 0; i < K; i++) {
    if (!diasClientes[i] || diasClientes[i].length === 0) {
      console.log(`   ❌ Dia ${i + 1}: AINDA VAZIO!`);
      todosDiasOK = false;
    } else if (diasClientes[i].length < minimoAbsoluto) {
      console.log(`   ⚠️ Dia ${i + 1}: Apenas ${diasClientes[i].length} cliente(s) (< ${minimoAbsoluto})`);
    }
  }
  
  if (!todosDiasOK) {
    console.log(`\n⚠️ AVISO: Não foi possível preencher todos os ${K} dias com >= ${minimoAbsoluto} clientes.`);
    console.log(`   Considere reduzir o número de dias solicitado.`);
  }
  
  console.log(`\n🗺️ Gerando rotas otimizadas...`);
  if (base && base.lat !== undefined && base.lon !== undefined) {
    console.log(`   📍 Todas as rotas começarão próximo ao ponto: lat=${base.lat}, lon=${base.lon}`);
  } else {
    console.log(`   📍 Rotas começarão do cliente mais próximo ao centroide de cada dia`);
  }

  const dias: RotaDia[] = [];

  // 🎯 SEMPRE gerar EXATAMENTE K dias (mesmo que algum fique vazio)
  for (let i = 0; i < K; i++) {
    const lista = diasClientes[i] || [];

    console.log(`   Dia ${i + 1}: ${lista.length} clientes`);

    if (lista.length === 0) {
      // Dia vazio - criar dia sem clientes
      dias.push({ dia: `Dia ${i + 1}`, clientes: [], geometria: [] });
    } else {
      const { ordered, geometry } = await sequenceAndGeometry(lista, base);
      dias.push({ dia: `Dia ${i + 1}`, clientes: ordered, geometria: geometry });
    }
  }

  console.log(`\n✅ ROTEIRIZAÇÃO CONCLUÍDA! ${K} dias gerados (${dias.filter(d => d.clientes.length > 0).length} preenchidos).\n`);
  return { dias };
}