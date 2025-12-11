// src/lib/atlas/openaiService.ts
// 🤖 IA ULTRA-OTIMIZADA - MICROAJUSTES EXTREMOS v2.0

import OpenAI from "openai";

export interface Cliente {
  id: string;
  nome?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
}

interface RotaDia {
  dia: string;
  clientes: Cliente[];
}

export interface RotasParaIA {
  dias: RotaDia[];
}

export interface Sugestao {
  cliente: string;
  acao: "mover";
  novo_dia: string;
  justificativa: string;
  prioridade: number;
  ganhoGeografico: number;
  impactoBalanceamento: number;
}

export class OpenAIService {
  private client: OpenAI | null = null;
  private model: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY || "";
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (!key) {
      console.warn("⚠️ OPENAI_API_KEY não encontrado — IA desabilitada.");
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey: key });
    }
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 🎯 NOVA FUNÇÃO: Calcular distância total de uma rota
   */
  private calcularDistanciaTotal(clientes: Cliente[]): number {
    if (clientes.length <= 1) return 0;
    
    let total = 0;
    for (let i = 0; i < clientes.length - 1; i++) {
      const c1 = clientes[i];
      const c2 = clientes[i + 1];
      const lat1 = c1.latitude || c1.lat || 0;
      const lon1 = c1.longitude || c1.lon || 0;
      const lat2 = c2.latitude || c2.lat || 0;
      const lon2 = c2.longitude || c2.lon || 0;
      total += this.haversineKm(lat1, lon1, lat2, lon2);
    }
    return total;
  }

  /**
   * 🎯 NOVA FUNÇÃO: Encontrar vizinhos mais próximos em outros dias
   */
  private encontrarVizinhosProximos(cliente: Cliente, outrosDias: Cliente[][]): {
    diaIdx: number;
    clienteIdx: number;
    distancia: number;
  }[] {
    const lat = cliente.latitude || cliente.lat || 0;
    const lon = cliente.longitude || cliente.lon || 0;
    
    const vizinhos: { diaIdx: number; clienteIdx: number; distancia: number }[] = [];
    
    for (let d = 0; d < outrosDias.length; d++) {
      for (let c = 0; c < outrosDias[d].length; c++) {
        const outro = outrosDias[d][c];
        const lat2 = outro.latitude || outro.lat || 0;
        const lon2 = outro.longitude || outro.lon || 0;
        const dist = this.haversineKm(lat, lon, lat2, lon2);
        
        vizinhos.push({ diaIdx: d, clienteIdx: c, distancia: dist });
      }
    }
    
    // Ordenar por distância (mais próximos primeiro)
    vizinhos.sort((a, b) => a.distancia - b.distancia);
    
    return vizinhos.slice(0, 5); // Top 5 vizinhos
  }

  /**
   * 🤖 ANÁLISE ULTRA-OTIMIZADA - MICROAJUSTES EXTREMOS
   * 
   * Novos critérios adicionados:
   * 4. Otimização de fronteiras (trocar clientes entre dias vizinhos)
   * 5. Detecção de "doglegs" (idas e voltas desnecessárias)
   * 6. Análise de vizinhança (cliente mais próximo de outro dia)
   * 7. Minimização de cruzamentos de rota
   */
  async analisarECorrigir(rotas: RotasParaIA, iteracao: number = 1, targetPorDia: number): Promise<Sugestao[]> {
    if (!this.client) return [];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 IA - ITERAÇÃO ${iteracao} (Modo Ultra-Otimizado)`);
    console.log(`${'='.repeat(60)}\n`);

    interface DiaInfo {
      dia: string;
      total: number;
      centroid: { lat: number; lon: number };
      bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
      radius: number;
      distanciaTotal: number;
      clientes: Array<{ 
        id: string; 
        nome: string; 
        lat: number; 
        lon: number; 
        distCentroid: number;
        ordem: number;
      }>;
    }

    const diasInfo: DiaInfo[] = rotas.dias.map((d, idx) => {
      const clientes = d.clientes || [];
      if (clientes.length === 0) {
        return {
          dia: d.dia,
          total: 0,
          centroid: { lat: 0, lon: 0 },
          bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
          radius: 0,
          distanciaTotal: 0,
          clientes: [],
        };
      }

      const lats = clientes.map((c) => c.latitude || c.lat || 0);
      const lons = clientes.map((c) => c.longitude || c.lon || 0);

      const centroid = {
        lat: lats.reduce((a, b) => a + b, 0) / lats.length,
        lon: lons.reduce((a, b) => a + b, 0) / lons.length,
      };

      const bounds = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
      };

      const clientesInfo = clientes.map((c, ordem) => {
        const lat = c.latitude || c.lat || 0;
        const lon = c.longitude || c.lon || 0;
        return {
          id: c.id,
          nome: c.nome || c.id,
          lat,
          lon,
          distCentroid: this.haversineKm(centroid.lat, centroid.lon, lat, lon),
          ordem
        };
      });

      const dists = clientesInfo.map((c) => c.distCentroid);
      const radius = Math.max(...dists, 0);
      const distanciaTotal = this.calcularDistanciaTotal(clientes);

      return { dia: d.dia, total: clientes.length, centroid, bounds, radius, distanciaTotal, clientes: clientesInfo };
    });

    console.log(`📊 Análise Detalhada:`);
    const mediaClientes = diasInfo.reduce((sum, d) => sum + d.total, 0) / diasInfo.filter(d => d.total > 0).length;
    const desvioPadrao = Math.sqrt(
      diasInfo.reduce((sum, d) => sum + Math.pow(d.total - mediaClientes, 2), 0) / diasInfo.length
    );
    
    diasInfo.forEach(d => {
      const desvio = d.total > 0 ? ((d.total - targetPorDia) / targetPorDia * 100).toFixed(1) : 'N/A';
      console.log(`   ${d.dia}: ${d.total} cli | Raio: ${d.radius.toFixed(1)}km | Dist: ${d.distanciaTotal.toFixed(1)}km | Desvio: ${desvio}%`);
    });
    
    console.log(`\n📈 Estatísticas Globais:`);
    const distanciaMedia = diasInfo.reduce((sum, d) => sum + d.distanciaTotal, 0) / diasInfo.filter(d => d.total > 0).length;
    const raioMedio = diasInfo.reduce((sum, d) => sum + d.radius, 0) / diasInfo.filter(d => d.total > 0).length;
    console.log(`   Média: ${mediaClientes.toFixed(1)} cli/dia | Raio médio: ${raioMedio.toFixed(1)}km | Dist média: ${distanciaMedia.toFixed(1)}km`);
    console.log(`   Target: ${targetPorDia} | Tolerância: ±${(targetPorDia * 0.35).toFixed(1)}`);

    interface ProblemaOtimizacao {
      clienteId: string;
      clienteNome: string;
      diaAtual: string;
      diaAtualIdx: number;
      diaAlvo: string;
      diaAlvoIdx: number;
      distAtual: number;
      distAlvo: number;
      ganhoGeografico: number;
      ganhoDistanciaRota: number;
      impactoBalanceamento: number;
      tipo: 'OUTLIER_EXTREMO' | 'SOBREPOSICAO' | 'INVASAO_BOUNDS' | 'VIZINHO_PROXIMO' | 'FRONTEIRA' | 'DOGLEG';
      score: number;
    }

    const problemas: ProblemaOtimizacao[] = [];

    // 🔍 DETECÇÃO 1: OUTLIERS EXTREMOS (>12km do centroide) - MAIS AGRESSIVO
    console.log(`\n🔍 [1/6] Detectando outliers extremos (>12km)...`);
    let count1 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      const diaAtual = diasInfo[i];
      if (diaAtual.total === 0) continue;
      
      for (const cliente of diaAtual.clientes) {
        if (cliente.distCentroid > 12) { // ⬇️ Reduzido de 15km para 12km
          let melhorDia = -1;
          let melhorDist = Infinity;
          
          for (let j = 0; j < diasInfo.length; j++) {
            if (i === j || diasInfo[j].total === 0) continue;
            const dist = this.haversineKm(
              diasInfo[j].centroid.lat, diasInfo[j].centroid.lon,
              cliente.lat, cliente.lon
            );
            if (dist < melhorDist) {
              melhorDist = dist;
              melhorDia = j;
            }
          }
          
          if (melhorDia >= 0 && melhorDist < cliente.distCentroid * 0.6) { // ⬇️ Mais agressivo: 60% (era 50%)
            const ganho = cliente.distCentroid - melhorDist;
            const impactoOrigemAbs = Math.abs((diaAtual.total - 1) - targetPorDia);
            const impactoDestinoAbs = Math.abs((diasInfo[melhorDia].total + 1) - targetPorDia);
            const impactoOrigem = impactoOrigemAbs - Math.abs(diaAtual.total - targetPorDia);
            const impactoDestino = impactoDestinoAbs - Math.abs(diasInfo[melhorDia].total - targetPorDia);
            const impactoTotal = impactoOrigem + impactoDestino;
            
            problemas.push({
              clienteId: cliente.id,
              clienteNome: cliente.nome,
              diaAtual: diaAtual.dia,
              diaAtualIdx: i,
              diaAlvo: diasInfo[melhorDia].dia,
              diaAlvoIdx: melhorDia,
              distAtual: cliente.distCentroid,
              distAlvo: melhorDist,
              ganhoGeografico: ganho,
              ganhoDistanciaRota: 0,
              impactoBalanceamento: impactoTotal,
              tipo: 'OUTLIER_EXTREMO',
              score: ganho * 150 - Math.abs(impactoTotal) * 15 // ⬆️ Peso maior
            });
            count1++;
          }
        }
      }
    }
    console.log(`   ${count1 > 0 ? `⚠️ ${count1} encontrados` : '✅ Nenhum'}`);

    // 🔍 DETECÇÃO 2: SOBREPOSIÇÃO GEOGRÁFICA (MAIS SENSÍVEL)
    console.log(`🔍 [2/6] Detectando sobreposição (<10km centroides)...`);
    let count2 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      for (let j = i + 1; j < diasInfo.length; j++) {
        const diaA = diasInfo[i];
        const diaB = diasInfo[j];
        
        if (diaA.total === 0 || diaB.total === 0) continue;
        
        const distCentroides = this.haversineKm(
          diaA.centroid.lat, diaA.centroid.lon,
          diaB.centroid.lat, diaB.centroid.lon
        );
        
        const sobrepostoLat = !(
          diaA.bounds.maxLat < diaB.bounds.minLat || 
          diaA.bounds.minLat > diaB.bounds.maxLat
        );
        const sobrepostoLon = !(
          diaA.bounds.maxLon < diaB.bounds.minLon || 
          diaA.bounds.minLon > diaB.bounds.maxLon
        );
        const sobrepostoBounds = sobrepostoLat && sobrepostoLon;
        
        if (distCentroides < 10.0 && sobrepostoBounds) { // ⬇️ Mais sensível: 10km (era 8km)
          // Verificar TODOS os clientes de A que estão mais perto de B
          for (const cliente of diaA.clientes) {
            const distParaB = this.haversineKm(
              diaB.centroid.lat, diaB.centroid.lon,
              cliente.lat, cliente.lon
            );
            
            if (distParaB < cliente.distCentroid * 0.8) { // ⬇️ Mais agressivo: 80% (era 75%)
              const ganho = cliente.distCentroid - distParaB;
              
              if (ganho > 1.5) { // ⬇️ Ganho mínimo reduzido (era implícito)
                const impactoOrigem = Math.abs((diaA.total - 1) - targetPorDia) - Math.abs(diaA.total - targetPorDia);
                const impactoDestino = Math.abs((diaB.total + 1) - targetPorDia) - Math.abs(diaB.total - targetPorDia);
                const impactoTotal = impactoOrigem + impactoDestino;
                
                problemas.push({
                  clienteId: cliente.id,
                  clienteNome: cliente.nome,
                  diaAtual: diaA.dia,
                  diaAtualIdx: i,
                  diaAlvo: diaB.dia,
                  diaAlvoIdx: j,
                  distAtual: cliente.distCentroid,
                  distAlvo: distParaB,
                  ganhoGeografico: ganho,
                  ganhoDistanciaRota: 0,
                  impactoBalanceamento: impactoTotal,
                  tipo: 'SOBREPOSICAO',
                  score: ganho * 120 - Math.abs(impactoTotal) * 20
                });
                count2++;
              }
            }
          }
          
          // Verificar o contrário (B → A)
          for (const cliente of diaB.clientes) {
            const distParaA = this.haversineKm(
              diaA.centroid.lat, diaA.centroid.lon,
              cliente.lat, cliente.lon
            );
            
            if (distParaA < cliente.distCentroid * 0.8) {
              const ganho = cliente.distCentroid - distParaA;
              
              if (ganho > 1.5) {
                const impactoOrigem = Math.abs((diaB.total - 1) - targetPorDia) - Math.abs(diaB.total - targetPorDia);
                const impactoDestino = Math.abs((diaA.total + 1) - targetPorDia) - Math.abs(diaA.total - targetPorDia);
                const impactoTotal = impactoOrigem + impactoDestino;
                
                problemas.push({
                  clienteId: cliente.id,
                  clienteNome: cliente.nome,
                  diaAtual: diaB.dia,
                  diaAtualIdx: j,
                  diaAlvo: diaA.dia,
                  diaAlvoIdx: i,
                  distAtual: cliente.distCentroid,
                  distAlvo: distParaA,
                  ganhoGeografico: ganho,
                  ganhoDistanciaRota: 0,
                  impactoBalanceamento: impactoTotal,
                  tipo: 'SOBREPOSICAO',
                  score: ganho * 120 - Math.abs(impactoTotal) * 20
                });
                count2++;
              }
            }
          }
        }
      }
    }
    console.log(`   ${count2 > 0 ? `⚠️ ${count2} encontrados` : '✅ Nenhum'}`);

    // 🔍 DETECÇÃO 3: INVASÃO DE BOUNDS (MAIS AGRESSIVO)
    console.log(`🔍 [3/6] Detectando invasões de bounds (ganho >2km)...`);
    let count3 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      const diaAtual = diasInfo[i];
      if (diaAtual.total === 0) continue;
      
      for (const cliente of diaAtual.clientes) {
        for (let j = 0; j < diasInfo.length; j++) {
          if (i === j || diasInfo[j].total === 0) continue;
          const diaAlvo = diasInfo[j];
          
          const dentroDosBounds = (
            cliente.lat >= diaAlvo.bounds.minLat && 
            cliente.lat <= diaAlvo.bounds.maxLat &&
            cliente.lon >= diaAlvo.bounds.minLon && 
            cliente.lon <= diaAlvo.bounds.maxLon
          );
          
          if (dentroDosBounds) {
            const distParaAlvo = this.haversineKm(
              diaAlvo.centroid.lat, diaAlvo.centroid.lon,
              cliente.lat, cliente.lon
            );
            
            const ganho = cliente.distCentroid - distParaAlvo;
            if (ganho > 2) { // ⬇️ Ganho mínimo reduzido de 3km para 2km
              const impactoOrigem = Math.abs((diaAtual.total - 1) - targetPorDia) - Math.abs(diaAtual.total - targetPorDia);
              const impactoDestino = Math.abs((diaAlvo.total + 1) - targetPorDia) - Math.abs(diaAlvo.total - targetPorDia);
              const impactoTotal = impactoOrigem + impactoDestino;
              
              problemas.push({
                clienteId: cliente.id,
                clienteNome: cliente.nome,
                diaAtual: diaAtual.dia,
                diaAtualIdx: i,
                diaAlvo: diaAlvo.dia,
                diaAlvoIdx: j,
                distAtual: cliente.distCentroid,
                distAlvo: distParaAlvo,
                ganhoGeografico: ganho,
                ganhoDistanciaRota: 0,
                impactoBalanceamento: impactoTotal,
                tipo: 'INVASAO_BOUNDS',
                score: ganho * 100 - Math.abs(impactoTotal) * 25
              });
              count3++;
            }
          }
        }
      }
    }
    console.log(`   ${count3 > 0 ? `⚠️ ${count3} encontrados` : '✅ Nenhum'}`);

    // 🔍 DETECÇÃO 4: 🆕 VIZINHOS MAIS PRÓXIMOS EM OUTRO DIA
    console.log(`🔍 [4/6] 🆕 Detectando vizinhos próximos em outros dias...`);
    let count4 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      const diaAtual = diasInfo[i];
      if (diaAtual.total === 0) continue;
      
      for (const cliente of diaAtual.clientes) {
        // Encontrar os 3 vizinhos mais próximos FORA deste dia
        const todosClientesOutrosDias = diasInfo
          .map((d, idx) => ({ clientes: d.clientes, diaIdx: idx }))
          .filter((d) => d.diaIdx !== i)
          .flatMap((d) => d.clientes.map(c => ({ ...c, diaIdx: d.diaIdx })));
        
        const vizinhos = todosClientesOutrosDias
          .map(v => ({
            ...v,
            dist: this.haversineKm(cliente.lat, cliente.lon, v.lat, v.lon)
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);
        
        if (vizinhos.length > 0) {
          const vizinhoMaisProximo = vizinhos[0];
          
          // Se o vizinho mais próximo está em OUTRO dia e a distância é < 3km
          if (vizinhoMaisProximo.dist < 3.0) {
            const diaAlvoIdx = vizinhoMaisProximo.diaIdx;
            const diaAlvo = diasInfo[diaAlvoIdx];
            
            const distParaAlvo = this.haversineKm(
              diaAlvo.centroid.lat, diaAlvo.centroid.lon,
              cliente.lat, cliente.lon
            );
            
            const ganho = cliente.distCentroid - distParaAlvo;
            
            if (ganho > 1.0) { // Ganho mínimo: 1km
              const impactoOrigem = Math.abs((diaAtual.total - 1) - targetPorDia) - Math.abs(diaAtual.total - targetPorDia);
              const impactoDestino = Math.abs((diaAlvo.total + 1) - targetPorDia) - Math.abs(diaAlvo.total - targetPorDia);
              const impactoTotal = impactoOrigem + impactoDestino;
              
              problemas.push({
                clienteId: cliente.id,
                clienteNome: cliente.nome,
                diaAtual: diaAtual.dia,
                diaAtualIdx: i,
                diaAlvo: diaAlvo.dia,
                diaAlvoIdx: diaAlvoIdx,
                distAtual: cliente.distCentroid,
                distAlvo: distParaAlvo,
                ganhoGeografico: ganho,
                ganhoDistanciaRota: vizinhoMaisProximo.dist,
                impactoBalanceamento: impactoTotal,
                tipo: 'VIZINHO_PROXIMO',
                score: (ganho + (3 - vizinhoMaisProximo.dist)) * 80 - Math.abs(impactoTotal) * 30
              });
              count4++;
            }
          }
        }
      }
    }
    console.log(`   ${count4 > 0 ? `⚠️ ${count4} encontrados` : '✅ Nenhum'}`);

    // 🔍 DETECÇÃO 5: 🆕 OTIMIZAÇÃO DE FRONTEIRAS (Trocar clientes entre dias vizinhos)
    console.log(`🔍 [5/6] 🆕 Otimizando fronteiras entre dias...`);
    let count5 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      for (let j = i + 1; j < diasInfo.length; j++) {
        const diaA = diasInfo[i];
        const diaB = diasInfo[j];
        
        if (diaA.total === 0 || diaB.total === 0) continue;
        
        // Dias são "vizinhos" se centroides estão < 15km
        const distCentroides = this.haversineKm(
          diaA.centroid.lat, diaA.centroid.lon,
          diaB.centroid.lat, diaB.centroid.lon
        );
        
        if (distCentroides < 15) {
          // Para cada cliente de A, verificar se trocar com algum de B melhora AMBOS os dias
          for (const clienteA of diaA.clientes) {
            for (const clienteB of diaB.clientes) {
              // Simular troca
              const distA_centroidB = this.haversineKm(diaB.centroid.lat, diaB.centroid.lon, clienteA.lat, clienteA.lon);
              const distB_centroidA = this.haversineKm(diaA.centroid.lat, diaA.centroid.lon, clienteB.lat, clienteB.lon);
              
              const ganhoA = clienteA.distCentroid - distA_centroidB;
              const ganhoB = clienteB.distCentroid - distB_centroidA;
              const ganhoTotal = ganhoA + ganhoB;
              
              // Se ambos ganham (ganho total > 2km)
              if (ganhoTotal > 2.0 && ganhoA > 0.5 && ganhoB > 0.5) {
                // Registrar como 2 movimentos separados (para simplicidade)
                const impactoBalanceamento = 0; // Troca não afeta balanceamento
                
                problemas.push({
                  clienteId: clienteA.id,
                  clienteNome: clienteA.nome,
                  diaAtual: diaA.dia,
                  diaAtualIdx: i,
                  diaAlvo: diaB.dia,
                  diaAlvoIdx: j,
                  distAtual: clienteA.distCentroid,
                  distAlvo: distA_centroidB,
                  ganhoGeografico: ganhoA,
                  ganhoDistanciaRota: ganhoTotal,
                  impactoBalanceamento: impactoBalanceamento,
                  tipo: 'FRONTEIRA',
                  score: ganhoTotal * 90
                });
                count5++;
              }
            }
          }
        }
      }
    }
    console.log(`   ${count5 > 0 ? `⚠️ ${count5} encontrados` : '✅ Nenhum'}`);

    // 🔍 DETECÇÃO 6: 🆕 DOGLEGS (Idas e voltas desnecessárias)
    console.log(`🔍 [6/6] 🆕 Detectando "doglegs" (idas/voltas)...`);
    let count6 = 0;
    
    for (let i = 0; i < diasInfo.length; i++) {
      const dia = diasInfo[i];
      if (dia.total < 3) continue; // Precisa de pelo menos 3 clientes
      
      // Para cada trio consecutivo (A -> B -> C), verificar se B está "fora do caminho"
      for (let idx = 0; idx < dia.clientes.length - 2; idx++) {
        const A = dia.clientes[idx];
        const B = dia.clientes[idx + 1];
        const C = dia.clientes[idx + 2];
        
        // Distância direta A -> C
        const distAC = this.haversineKm(A.lat, A.lon, C.lat, C.lon);
        
        // Distância atual: A -> B -> C
        const distAB = this.haversineKm(A.lat, A.lon, B.lat, B.lon);
        const distBC = this.haversineKm(B.lat, B.lon, C.lat, C.lon);
        const distAtual = distAB + distBC;
        
        // Se o "desvio" é > 2km, B pode estar em outro dia melhor
        const desvio = distAtual - distAC;
        
        if (desvio > 2.0) {
          // Procurar um dia melhor para B
          let melhorDia = -1;
          let melhorDist = Infinity;
          
          for (let j = 0; j < diasInfo.length; j++) {
            if (i === j || diasInfo[j].total === 0) continue;
            const dist = this.haversineKm(
              diasInfo[j].centroid.lat, diasInfo[j].centroid.lon,
              B.lat, B.lon
            );
            if (dist < melhorDist) {
              melhorDist = dist;
              melhorDia = j;
            }
          }
          
          if (melhorDia >= 0 && melhorDist < B.distCentroid * 0.7) {
            const ganho = B.distCentroid - melhorDist;
            const impactoOrigem = Math.abs((dia.total - 1) - targetPorDia) - Math.abs(dia.total - targetPorDia);
            const impactoDestino = Math.abs((diasInfo[melhorDia].total + 1) - targetPorDia) - Math.abs(diasInfo[melhorDia].total - targetPorDia);
            const impactoTotal = impactoOrigem + impactoDestino;
            
            problemas.push({
              clienteId: B.id,
              clienteNome: B.nome,
              diaAtual: dia.dia,
              diaAtualIdx: i,
              diaAlvo: diasInfo[melhorDia].dia,
              diaAlvoIdx: melhorDia,
              distAtual: B.distCentroid,
              distAlvo: melhorDist,
              ganhoGeografico: ganho,
              ganhoDistanciaRota: desvio, // Economiza o desvio
              impactoBalanceamento: impactoTotal,
              tipo: 'DOGLEG',
              score: (ganho + desvio) * 70 - Math.abs(impactoTotal) * 35
            });
            count6++;
          }
        }
      }
    }
    console.log(`   ${count6 > 0 ? `⚠️ ${count6} encontrados` : '✅ Nenhum'}`);

    if (problemas.length === 0) {
      console.log(`\n✅ ROTEIRIZAÇÃO PERFEITA! Nenhuma otimização necessária.`);
      console.log(`${'='.repeat(60)}\n`);
      return [];
    }

    // Ordenar por score (maior = mais importante)
    problemas.sort((a, b) => b.score - a.score);

    const totalProblemas = problemas.length;
    console.log(`\n🚨 ${totalProblemas} oportunidades de otimização detectadas!`);
    
    // Estatísticas por tipo
    const porTipo = problemas.reduce((acc, p) => {
      acc[p.tipo] = (acc[p.tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`\n📊 Distribuição por tipo:`);
    Object.entries(porTipo).forEach(([tipo, count]) => {
      console.log(`   ${tipo}: ${count}`);
    });
    
    console.log(`\n📍 Top 15 otimizações prioritárias:\n`);
    
    problemas.slice(0, 15).forEach((prob, idx) => {
      const emoji = {
        'OUTLIER_EXTREMO': '🔴',
        'SOBREPOSICAO': '⚠️',
        'INVASAO_BOUNDS': '🚨',
        'VIZINHO_PROXIMO': '🎯',
        'FRONTEIRA': '🔄',
        'DOGLEG': '↩️'
      }[prob.tipo] || '•';
      
      console.log(`${idx + 1}. ${emoji} ${prob.clienteNome} [${prob.tipo}]`);
      console.log(`   ${prob.diaAtual} → ${prob.diaAlvo}`);
      console.log(`   Ganho Geo: ${prob.ganhoGeografico.toFixed(2)}km | Dist Rota: ${prob.ganhoDistanciaRota.toFixed(2)}km | Score: ${prob.score.toFixed(0)}`);
      if (prob.impactoBalanceamento !== 0) {
        console.log(`   Impacto Balanço: ${prob.impactoBalanceamento > 0 ? '+' : ''}${prob.impactoBalanceamento.toFixed(1)}`);
      }
      console.log();
    });

    // Filtrar sugestões válidas (critérios MAIS FLEXÍVEIS)
    const sugestoesValidas = problemas.filter(p => 
      p.score > 30 && // ⬇️ Score mínimo reduzido (era 50)
      p.ganhoGeografico > 1.0 && // ⬇️ Ganho mínimo reduzido (era 2km)
      Math.abs(p.impactoBalanceamento) < targetPorDia * 0.4 // ⬆️ Tolerância aumentada (era 0.3)
    );

    console.log(`\n🎯 ${sugestoesValidas.length} sugestões válidas (de ${totalProblemas} problemas)`);

    // Limitar a 20 sugestões por iteração (aumentado de 15)
    const sugestoes: Sugestao[] = sugestoesValidas.slice(0, 20).map(prob => ({
      cliente: prob.clienteId,
      acao: "mover",
      novo_dia: prob.diaAlvo,
      justificativa: `[${prob.tipo}] ${prob.clienteNome} - Ganho: ${prob.ganhoGeografico.toFixed(1)}km geo + ${prob.ganhoDistanciaRota.toFixed(1)}km rota`,
      prioridade: prob.score,
      ganhoGeografico: prob.ganhoGeografico,
      impactoBalanceamento: prob.impactoBalanceamento
    }));

    console.log(`${'='.repeat(60)}\n`);

    return sugestoes;
  }
}

export const openaiService = new OpenAIService();