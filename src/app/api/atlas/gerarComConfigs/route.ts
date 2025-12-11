// src/app/api/atlas/gerarComConfigs/route.ts
// ✅ VERSÃO FINAL CORRIGIDA - Erro linha 84 resolvido

import { NextRequest, NextResponse } from 'next/server';
import { 
  processarClientesComConfigs,
  validarDiasProibidos,
  gerarMapaDiasSemana,
  ClientConfig,
  DiaSemana  // ✅ ADICIONADO: Import do tipo DiaSemana
} from '@/lib/atlas/clientScheduling';
import { gerarRoteiro } from '@/lib/atlas/clusterService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      clientes, 
      configs = {},
      numDiasAlvo = 10,
      maxPorDia,
      minPorDia,
      base,
      dataInicio, // "2025-01-20"
      semanaAtual = 1 // 1-4
    } = body;
    
    // Validações
    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return NextResponse.json(
        { erro: 'Array de clientes é obrigatório' },
        { status: 400 }
      );
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 ROTEIRIZAÇÃO COM CONFIGURAÇÕES`);
    console.log(`   Clientes: ${clientes.length}`);
    console.log(`   Configurações: ${Object.keys(configs).length}`);
    console.log(`   Dias: ${numDiasAlvo}`);
    console.log(`   Semana inicial: ${semanaAtual}`);
    console.log(`${'='.repeat(80)}`);

    // ─────────────────────────────────────────────────────────
    // CALCULAR NÚMERO DE SEMANAS
    // ─────────────────────────────────────────────────────────
    const numSemanas = Math.ceil(numDiasAlvo / 5);
    console.log(`📅 Processando ${numSemanas} semana(s)...`);

    // ─────────────────────────────────────────────────────────
    // PROCESSAR CADA SEMANA SEPARADAMENTE
    // ─────────────────────────────────────────────────────────
    const todasRotas: any[] = [];
    const estatisticasGerais = {
      clientesComConfig: 0,
      instanciasCriadas: 0,
      clientesFiltradosPorFrequencia: 0
    };

    for (let semana = 0; semana < numSemanas; semana++) {
      console.log(`\n📅 Processando SEMANA ${semana}...`);

      // ETAPA 1-2: PRÉ-PROCESSAMENTO para esta semana
      const { clientesProcessados, estatisticas } =
        processarClientesComConfigs(clientes, configs, semana);

      // Acumular estatísticas
      estatisticasGerais.clientesComConfig += estatisticas.clientesComConfig;
      estatisticasGerais.instanciasCriadas += estatisticas.instanciasCriadas;
      estatisticasGerais.clientesFiltradosPorFrequencia += estatisticas.clientesFiltradosPorFrequencia;

      if (clientesProcessados.length === 0) {
        console.log(`   ⚠️ Nenhum cliente para semana ${semana}, pulando...`);
        // Adicionar 5 dias vazios
        for (let d = 0; d < 5; d++) {
          todasRotas.push({
            dia: semana * 5 + d + 1,
            clientes: [],
            geometria: []
          });
        }
        continue;
      }

      // ETAPA 3: ROTEIRIZAÇÃO (5 dias para esta semana)
      const diasDaSemana = Math.min(5, numDiasAlvo - (semana * 5));

      const resultado = await gerarRoteiro(
        clientesProcessados,
        diasDaSemana,
        maxPorDia,
        minPorDia
      );

      // Adicionar rotas desta semana ao total
      resultado.dias.forEach((dia, index) => {
        todasRotas.push({
          dia: semana * 5 + index + 1,
          clientes: dia.clientes,
          geometria: dia.geometria || []
        });
      });

      console.log(`   ✅ Semana ${semana}: ${resultado.dias.length} dias, ${clientesProcessados.length} clientes`);
    }

    // Criar objeto resultado consolidado com todas as rotas
    const resultado = {
      dias: todasRotas
    };

    // Usar estatísticas acumuladas
    const estatisticas = estatisticasGerais;

    // ─────────────────────────────────────────────────────────
    // ETAPA 4: VALIDAÇÃO DE DIAS PROIBIDOS (se dataInicio fornecida)
    // ─────────────────────────────────────────────────────────
    let rotasFinais: any[] = [];
    let violacoes: any[] = [];
    // ✅ CORREÇÃO LINHA 70: Trocar Record<number, number> por Record<number, DiaSemana>
    let mapaDias: Record<number, DiaSemana> = {};
    
    if (dataInicio) {
      try {
        const dataInicioDate = new Date(dataInicio);
        
        if (!isNaN(dataInicioDate.getTime())) {
          // Gerar mapa de dias da semana
          mapaDias = gerarMapaDiasSemana(dataInicioDate, numDiasAlvo);
          
          // ✅ LINHA 84: Agora o tipo está correto
          const validacao = validarDiasProibidos(
            resultado.dias.map((d, i) => ({
              dia: i + 1,
              clientes: d.clientes as any
            })),
            mapaDias
          );
          
          violacoes = validacao.violacoes;
          
          // Recriar estrutura completa com geometria
          // Cast para remover propriedades extras de ClienteExpandido
          rotasFinais = validacao.rotasValidas.map((rota: any, i: number) => ({
            dia: `Dia ${rota.dia}`,
            clientes: rota.clientes.map((c: any) => ({
              id: c.id,
              nome: c.nome,
              latitude: c.latitude,
              longitude: c.longitude,
              ordem: c.ordem || 0
            })),
            geometria: resultado.dias[i]?.geometria || []
          }));
        }
      } catch (err) {
        console.warn('⚠️ Erro ao validar dias proibidos:', err);
        // Continua sem validação se houver erro
      }
    }
    
    // Se não validou (sem dataInicio ou erro), usar resultado direto com cast
    if (rotasFinais.length === 0) {
      rotasFinais = resultado.dias.map((dia: any) => ({
        dia: dia.dia,
        clientes: dia.clientes.map((c: any) => ({
          id: c.id,
          nome: c.nome,
          latitude: c.latitude,
          longitude: c.longitude,
          ordem: c.ordem || 0
        })),
        geometria: dia.geometria || []
      }));
    }
    
    // ─────────────────────────────────────────────────────────
    // RESPOSTA
    // ─────────────────────────────────────────────────────────
    console.log(`\n📊 RESULTADO:`);
    console.log(`   Rotas geradas: ${rotasFinais.length}`);
    console.log(`   Violações corrigidas: ${violacoes.length}`);
    console.log(`${'='.repeat(80)}\n`);
    
    return NextResponse.json({
      dias: rotasFinais, // Formato compatível com frontend
      estatisticas: {
        ...estatisticas,
        violacoesCorrigidas: violacoes.length
      },
      violacoes,
      metadados: {
        clientesOriginais: clientes.length,
        configuracoesAplicadas: Object.keys(configs).length,
        instanciasProcessadas: estatisticas.instanciasCriadas,
        diasGerados: rotasFinais.length,
        diasComClientes: rotasFinais.filter((r: any) => r.clientes.length > 0).length,
        dataInicio: dataInicio || null,
        semanaAtual: semanaAtual,
        numSemanas: numSemanas,
        mapaDiasSemana: mapaDias
      }
    });
    
  } catch (error: any) {
    console.error('❌ Erro na roteirização:', error);

    // Never expose stack traces in production
    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json({
      erro: 'Erro ao gerar roteiro',
      detalhes: isDev ? error.message : 'Erro interno do servidor',
      ...(isDev && { stack: error.stack })
    }, { status: 500 });
  }
}