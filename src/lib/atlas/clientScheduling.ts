// src/lib/atlas/clientScheduling.ts

/**
 * ========================================================================
 * SERVIÇO DE AGENDAMENTO E PRÉ-PROCESSAMENTO DE CLIENTES
 * ========================================================================
 * 
 * Este serviço é responsável por aplicar configurações de agendamento
 * aos clientes ANTES da roteirização geográfica (clusterService).
 * 
 * FLUXO:
 * 1. Expandir clientes com repetição (mesma semana)
 * 2. Filtrar por frequência (semanal/quinzenal/mensal)
 * 3. Roteirização geográfica (clusterService - NÃO MODIFICADO)
 * 4. Validar dias proibidos e mover clientes se necessário
 * 
 * IMPORTANTE: A otimização geográfica continua 100% intacta!
 */

// ========================================================================
// TIPOS
// ========================================================================

export type FrequenciaVisita = 'semanal' | 'quinzenal' | 'mensal';
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Dom, 1=Seg, ..., 6=Sáb

export interface ClientConfig {
  clienteId: string;
  
  // Frequência de visita
  frequencia: FrequenciaVisita;
  
  // Repetição na mesma semana
  repeticoesPorSemana?: number; // 1-7
  
  // Horários de funcionamento
  horarioAbertura?: string; // "08:00"
  horarioFechamento?: string; // "18:00"
  
  // Dias que não funciona
  diasFechados?: DiaSemana[]; // [0, 6] = fecha domingo e sábado
}

export interface ClienteBase {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  endereco?: string;
  [key: string]: any;
}

export interface ClienteExpandido extends ClienteBase {
  _instancia?: number; // Para clientes com repetição
  _config?: ClientConfig; // Referência à config
}

export interface EstatisticasProcessamento {
  clientesOriginais: number;
  clientesComConfig: number;
  instanciasCriadas: number;
  clientesFiltradosPorFrequencia: number;
  clientesProcessados: number;
}

// ========================================================================
// ETAPA 1: EXPANSÃO POR REPETIÇÃO
// ========================================================================

/**
 * Expande clientes que têm múltiplas visitas na mesma semana.
 * 
 * Exemplo: Cliente com repeticoesPorSemana=3 vira 3 instâncias
 * - Cliente A (instancia 1)
 * - Cliente A (instancia 2)
 * - Cliente A (instancia 3)
 */
export function expandirClientesComRepeticao(
  clientes: ClienteBase[],
  configs: Record<string, ClientConfig>
): ClienteExpandido[] {
  const expandidos: ClienteExpandido[] = [];
  
  console.log(`\n🔄 ETAPA 1: Expandindo clientes com repetição...`);
  
  for (const cliente of clientes) {
    const config = configs[cliente.id];
    
    if (!config || !config.repeticoesPorSemana || config.repeticoesPorSemana <= 1) {
      // Sem repetição: adiciona cliente normal
      expandidos.push({ ...cliente, _config: config });
      continue;
    }
    
    // Com repetição: cria múltiplas instâncias
    const repeticoes = Math.min(config.repeticoesPorSemana, 7); // Max 7 (uma por dia)
    
    console.log(`   📍 Cliente ${cliente.nome}: ${repeticoes} repetições`);
    
    for (let i = 1; i <= repeticoes; i++) {
      expandidos.push({
        ...cliente,
        _instancia: i,
        _config: config
      });
    }
  }
  
  console.log(`   ✅ ${clientes.length} clientes → ${expandidos.length} instâncias`);
  
  return expandidos;
}

// ========================================================================
// ETAPA 2: FILTRAGEM POR FREQUÊNCIA
// ========================================================================

/**
 * Filtra clientes baseado na frequência de visita e semana atual.
 * 
 * REGRAS:
 * - Semanal: sempre visita
 * - Quinzenal: semanas ímpares (1,3) OU semanas pares (2,4)
 * - Mensal: apenas semana 1 do mês
 * 
 * @param semanaAtual 1-4 (semana do mês)
 */
export function filtrarPorFrequencia(
  clientes: ClienteExpandido[],
  semanaAtual: number
): ClienteExpandido[] {
  console.log(`\n📅 ETAPA 2: Filtrando por frequência (Semana ${semanaAtual})...`);
  
  const filtrados = clientes.filter(cliente => {
    const config = cliente._config;
    
    if (!config) return true; // Sem config = sempre visita
    
    switch (config.frequencia) {
      case 'semanal':
        return true; // Sempre visita
        
      case 'quinzenal':
        // Cliente quinzenal aparece em semanas PARES (0, 2, 4, 6...)
        // Isto faz com que o cliente apareça a cada 2 semanas
        const ehSemanaPar = semanaAtual % 2 === 0;

        if (!ehSemanaPar) {
          console.log(`   ⏭️ Cliente ${cliente.nome}: quinzenal (skip semana ${semanaAtual} - ímpar)`);
          return false;
        }
        console.log(`   ✅ Cliente ${cliente.nome}: quinzenal (aparece na semana ${semanaAtual} - par)`);
        return true;

      case 'mensal':
        // Cliente mensal aparece a cada 4 semanas (0, 4, 8, 12...)
        const ehSemanaMultiplo4 = semanaAtual % 4 === 0;

        if (!ehSemanaMultiplo4) {
          console.log(`   ⏭️ Cliente ${cliente.nome}: mensal (skip semana ${semanaAtual})`);
          return false;
        }
        console.log(`   ✅ Cliente ${cliente.nome}: mensal (aparece na semana ${semanaAtual})`);
        return true;
        
      default:
        return true;
    }
  });
  
  console.log(`   ✅ ${clientes.length} clientes → ${filtrados.length} após filtro`);
  
  return filtrados;
}

// ========================================================================
// ETAPA 3: MAPEAMENTO DIA → DIA DA SEMANA
// ========================================================================

/**
 * Gera mapa de "Dia de roteirização" → "Dia da semana".
 * 
 * Exemplo:
 * dataInicio = "2025-01-20" (segunda-feira)
 * numDias = 5
 * 
 * Retorna:
 * {
 *   1: 1, // Dia 1 = segunda (1)
 *   2: 2, // Dia 2 = terça (2)
 *   3: 3, // Dia 3 = quarta (3)
 *   4: 4, // Dia 4 = quinta (4)
 *   5: 5  // Dia 5 = sexta (5)
 * }
 */
export function gerarMapaDiasSemana(
  dataInicio: Date,
  numDias: number
): Record<number, DiaSemana> {
  const mapa: Record<number, DiaSemana> = {};
  
  for (let i = 1; i <= numDias; i++) {
    const data = new Date(dataInicio);
    data.setDate(dataInicio.getDate() + (i - 1));
    // ✅ CORREÇÃO: Cast explícito porque getDay() sempre retorna 0-6
    mapa[i] = data.getDay() as DiaSemana;
  }
  
  return mapa;
}

// ========================================================================
// ETAPA 4: VALIDAÇÃO DE DIAS PROIBIDOS
// ========================================================================

export interface RotaDia {
  dia: number;
  clientes: ClienteExpandido[];
}

export interface ViolacaoDia {
  clienteId: string;
  clienteNome: string;
  dia: number;
  diaSemana: DiaSemana;
  motivoViolacao: string;
}

export interface ResultadoValidacao {
  rotasValidas: RotaDia[];
  violacoes: ViolacaoDia[];
}

/**
 * Valida se clientes estão em dias compatíveis com suas configurações.
 * Move clientes para dias válidos se necessário.
 */
export function validarDiasProibidos(
  rotas: RotaDia[],
  mapaDiasSemana: Record<number, DiaSemana>
): ResultadoValidacao {
  console.log(`\n🚫 ETAPA 4: Validando dias proibidos...`);
  
  const rotasValidas: RotaDia[] = [];
  const violacoes: ViolacaoDia[] = [];
  const clientesMovidos: ClienteExpandido[] = [];
  
  // Primeira passada: detectar violações
  for (const rota of rotas) {
    const diaSemana = mapaDiasSemana[rota.dia];
    const clientesValidos: ClienteExpandido[] = [];
    
    for (const cliente of rota.clientes) {
      const config = cliente._config;
      
      if (!config || !config.diasFechados || config.diasFechados.length === 0) {
        clientesValidos.push(cliente);
        continue;
      }
      
      // Verifica se o dia da semana está nos dias fechados
      if (config.diasFechados.includes(diaSemana)) {
        const nomeDia = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][diaSemana];
        
        console.log(`   ❌ Cliente ${cliente.nome}: removido do Dia ${rota.dia} (${nomeDia})`);
        
        violacoes.push({
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          dia: rota.dia,
          diaSemana,
          motivoViolacao: `Cliente não funciona às ${nomeDia}`
        });
        
        clientesMovidos.push(cliente);
      } else {
        clientesValidos.push(cliente);
      }
    }
    
    rotasValidas.push({
      dia: rota.dia,
      clientes: clientesValidos
    });
  }
  
  // Segunda passada: realocar clientes movidos
  if (clientesMovidos.length > 0) {
    console.log(`\n🔄 Realocando ${clientesMovidos.length} clientes...`);
    
    for (const cliente of clientesMovidos) {
      const config = cliente._config!;
      
      // Encontra primeiro dia válido
      let diaValido: RotaDia | null = null;
      
      for (const rota of rotasValidas) {
        const diaSemana = mapaDiasSemana[rota.dia];
        
        if (!config.diasFechados?.includes(diaSemana)) {
          diaValido = rota;
          break;
        }
      }
      
      if (diaValido) {
        diaValido.clientes.push(cliente);
        console.log(`   ✅ Cliente ${cliente.nome} movido para Dia ${diaValido.dia}`);
      } else {
        console.warn(`   ⚠️ Cliente ${cliente.nome}: nenhum dia válido encontrado!`);
      }
    }
  }
  
  console.log(`   📊 ${violacoes.length} violações corrigidas`);
  
  return { rotasValidas, violacoes };
}

// ========================================================================
// FUNÇÃO PRINCIPAL: PROCESSAMENTO COMPLETO
// ========================================================================

/**
 * Aplica TODAS as configurações de agendamento aos clientes.
 * 
 * ORDEM:
 * 1. Expandir clientes com repetição
 * 2. Filtrar por frequência (baseado na semana)
 * 
 * @returns Clientes processados prontos para roteirização geográfica
 */
export function processarClientesComConfigs(
  clientes: ClienteBase[],
  configs: Record<string, ClientConfig>,
  semanaAtual: number = 1
): {
  clientesProcessados: ClienteExpandido[];
  estatisticas: EstatisticasProcessamento;
} {
  // Etapa 1: Expansão
  const expandidos = expandirClientesComRepeticao(clientes, configs);
  
  // Etapa 2: Filtragem por frequência
  const filtrados = filtrarPorFrequencia(expandidos, semanaAtual);
  
  // Estatísticas
  const estatisticas: EstatisticasProcessamento = {
    clientesOriginais: clientes.length,
    clientesComConfig: Object.keys(configs).length,
    instanciasCriadas: expandidos.length - clientes.length,
    clientesFiltradosPorFrequencia: expandidos.length - filtrados.length,
    clientesProcessados: filtrados.length
  };
  
  return {
    clientesProcessados: filtrados,
    estatisticas
  };
}

// ========================================================================
// UTILITÁRIOS
// ========================================================================

/**
 * Converte string "HH:MM" para minutos desde meia-noite
 */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Verifica se um horário está dentro do expediente do cliente
 */
export function estaNoHorarioFuncionamento(
  horario: string,
  config?: ClientConfig
): boolean {
  if (!config || (!config.horarioAbertura && !config.horarioFechamento)) {
    return true; // Sem restrição de horário
  }
  
  const minutos = horaParaMinutos(horario);
  
  if (config.horarioAbertura) {
    const abertura = horaParaMinutos(config.horarioAbertura);
    if (minutos < abertura) return false;
  }
  
  if (config.horarioFechamento) {
    const fechamento = horaParaMinutos(config.horarioFechamento);
    if (minutos > fechamento) return false;
  }
  
  return true;
}

/**
 * Helper para debug: imprime configurações de forma legível
 */
export function debugConfigs(configs: Record<string, ClientConfig>): void {
  console.log('\n📋 CONFIGURAÇÕES DE CLIENTES:');
  console.log('─'.repeat(80));
  
  for (const [clienteId, config] of Object.entries(configs)) {
    console.log(`\nCliente ID: ${clienteId}`);
    console.log(`  Frequência: ${config.frequencia}`);
    
    if (config.repeticoesPorSemana && config.repeticoesPorSemana > 1) {
      console.log(`  Repetições/semana: ${config.repeticoesPorSemana}`);
    }
    
    if (config.horarioAbertura || config.horarioFechamento) {
      console.log(`  Horário: ${config.horarioAbertura || '—'} às ${config.horarioFechamento || '—'}`);
    }
    
    if (config.diasFechados && config.diasFechados.length > 0) {
      const nomesDias = config.diasFechados.map(d => 
        ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]
      );
      console.log(`  Dias fechados: ${nomesDias.join(', ')}`);
    }
  }
  
  console.log('─'.repeat(80));
}