// API ATLAS 2.0/src/app/api/atlas/analisarInvasoes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { haversineKm, centroidOf, Coordenada, Cliente } from '@/lib/atlas/geoUtils';

interface VendedorInput {
  codVendedor: string;
  nomeVendedor: string;
  clientes: Cliente[];
  centroide: Coordenada;
}

interface InvasaoDetectada {
  vendedorInvasor: string;
  vendedorInvadido: string;
  clienteId: string;
  clienteNome: string;
  distanciaAoInvasor: number;
  distanciaAoInvadido: number;
  grauInvasao: number;
}

/**
 * Analisa invasões de zona entre múltiplos vendedores
 *
 * Critério de invasão:
 * - Um cliente de um vendedor está mais próximo do centroide de OUTRO vendedor
 * - Grau de invasão: quanto % mais próximo está do invasor vs do próprio vendedor
 */
function analisarInvasoesEntreVendedores(vendedores: VendedorInput[]): InvasaoDetectada[] {
  const invasoes: InvasaoDetectada[] = [];

  // Para cada vendedor (proprietário)
  for (const proprietario of vendedores) {
    // Para cada cliente do proprietário
    for (const cliente of proprietario.clientes) {
      const posCliente: Coordenada = {
        lat: cliente.latitude,
        lon: cliente.longitude,
      };

      // Distância do cliente ao centroide do seu próprio vendedor
      const distProprietario = haversineKm(posCliente, proprietario.centroide);

      // Verificar se está mais próximo de outro vendedor
      for (const invasor of vendedores) {
        if (invasor.codVendedor === proprietario.codVendedor) continue;

        const distInvasor = haversineKm(posCliente, invasor.centroide);

        // Se está mais próximo do invasor que do proprietário
        if (distInvasor < distProprietario) {
          // Calcular grau de invasão
          // Se distInvasor = 5km e distProprietario = 10km
          // Grau = (10 - 5) / 10 * 100 = 50% de invasão
          const grauInvasao = ((distProprietario - distInvasor) / distProprietario) * 100;

          invasoes.push({
            vendedorInvasor: invasor.nomeVendedor,
            vendedorInvadido: proprietario.nomeVendedor,
            clienteId: cliente.id,
            clienteNome: cliente.nome,
            distanciaAoInvasor: distInvasor,
            distanciaAoInvadido: distProprietario,
            grauInvasao: Math.max(0, Math.min(100, grauInvasao)),
          });
        }
      }
    }
  }

  // Ordenar por grau de invasão (maior primeiro)
  invasoes.sort((a, b) => b.grauInvasao - a.grauInvasao);

  return invasoes;
}

/**
 * POST /api/atlas/analisarInvasoes
 *
 * Body:
 * {
 *   vendedores: [
 *     {
 *       codVendedor: "123",
 *       nomeVendedor: "João Silva",
 *       clientes: [...],
 *       centroide: { lat: -22.0, lon: -47.0 }
 *     },
 *     ...
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendedores } = body || {};

    if (!Array.isArray(vendedores) || vendedores.length < 2) {
      return NextResponse.json({
        error: 'Envie pelo menos 2 vendedores',
        required_fields: ['vendedores[]'],
      }, { status: 400 });
    }

    if (vendedores.length > 5) {
      return NextResponse.json({
        error: 'Máximo de 5 vendedores permitidos',
      }, { status: 400 });
    }

    // Validar estrutura dos vendedores
    for (const v of vendedores) {
      if (!v.codVendedor || !v.nomeVendedor || !Array.isArray(v.clientes)) {
        return NextResponse.json({
          error: 'Cada vendedor deve ter: codVendedor, nomeVendedor, clientes[]',
        }, { status: 400 });
      }

      // Se não tem centroide, calcular
      if (!v.centroide && v.clientes.length > 0) {
        v.centroide = centroidOf(v.clientes);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 ANÁLISE DE INVASÕES - ${vendedores.length} vendedores`);
    console.log(`${'='.repeat(80)}`);

    for (const v of vendedores) {
      console.log(`   ${v.nomeVendedor}: ${v.clientes.length} clientes`);
      console.log(`      Centroide: (${v.centroide.lat.toFixed(4)}, ${v.centroide.lon.toFixed(4)})`);
    }

    const invasoes = analisarInvasoesEntreVendedores(vendedores);

    console.log(`\n📊 RESULTADO:`);
    console.log(`   Total de invasões detectadas: ${invasoes.length}`);

    if (invasoes.length > 0) {
      console.log(`\n   🔝 Top 5 invasões:`);
      invasoes.slice(0, 5).forEach((inv, idx) => {
        console.log(`      ${idx + 1}. ${inv.clienteNome}`);
        console.log(`         ${inv.vendedorInvasor} invade ${inv.vendedorInvadido}`);
        console.log(`         Grau: ${inv.grauInvasao.toFixed(1)}% (${inv.distanciaAoInvasor.toFixed(2)}km vs ${inv.distanciaAoInvadido.toFixed(2)}km)`);
      });
    } else {
      console.log(`   ✅ Nenhuma invasão detectada!`);
    }

    console.log(`${'='.repeat(80)}\n`);

    // Estatísticas
    const estatisticas = {
      totalVendedores: vendedores.length,
      totalClientes: vendedores.reduce((sum, v) => sum + v.clientes.length, 0),
      totalInvasoes: invasoes.length,
      invasoesPorVendedor: vendedores.map((v) => ({
        vendedor: v.nomeVendedor,
        clientesInvadidos: invasoes.filter((inv) => inv.vendedorInvadido === v.nomeVendedor).length,
        clientesInvasores: invasoes.filter((inv) => inv.vendedorInvasor === v.nomeVendedor).length,
      })),
      grauMedioInvasao: invasoes.length > 0
        ? invasoes.reduce((sum, inv) => sum + inv.grauInvasao, 0) / invasoes.length
        : 0,
    };

    return NextResponse.json({
      success: true,
      invasoes,
      estatisticas,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('❌ Erro /api/atlas/analisarInvasoes:', e?.message || e.stack || e);

    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json({
      error: isDev ? (e?.message || 'Erro inesperado') : 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
