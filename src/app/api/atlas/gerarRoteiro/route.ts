import { NextRequest, NextResponse } from 'next/server';
import { gerarRoteiro } from '@/lib/atlas/clusterService';
import {
  validateClientes,
  validatePositiveInteger,
  validateCoordinates
} from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientes, numDiasAlvo, maxPorDia, minPorDia, base } = body || {};

    // Validate clientes array
    const clientesValidation = validateClientes(clientes);
    if (!clientesValidation.valid) {
      return NextResponse.json({
        error: 'Validação de dados falhou',
        details: clientesValidation.error,
        required_fields: ['clientes'],
        optional_fields: ['numDiasAlvo', 'maxPorDia', 'minPorDia', 'base']
      }, { status: 400 });
    }

    const sanitizedClientes = clientesValidation.sanitized;

    // Validate optional parameters
    let sanitizedNumDiasAlvo = numDiasAlvo;
    if (numDiasAlvo !== undefined) {
      const numDiasValidation = validatePositiveInteger(numDiasAlvo, 365);
      if (!numDiasValidation.valid) {
        return NextResponse.json({
          error: 'numDiasAlvo inválido',
          details: numDiasValidation.error
        }, { status: 400 });
      }
      sanitizedNumDiasAlvo = numDiasValidation.sanitized;
    }

    let sanitizedBase = base;
    if (base) {
      const baseValidation = validateCoordinates(base);
      if (!baseValidation.valid) {
        return NextResponse.json({
          error: 'Base coordinates inválidas',
          details: baseValidation.error
        }, { status: 400 });
      }
      sanitizedBase = baseValidation.sanitized;
    }

    console.log(`📦 Recebida solicitação de roteirização: ${sanitizedClientes.length} clientes para ${sanitizedNumDiasAlvo || 'auto'} dias`);
    if (sanitizedBase) {
      console.log(`📍 Ponto de partida: lat=${sanitizedBase.latitude}, lon=${sanitizedBase.longitude}`);
    }

    const roteiro = await gerarRoteiro(
      sanitizedClientes,
      sanitizedNumDiasAlvo,
      sanitizedBase
    );

    return NextResponse.json({
      success: true,
      data: roteiro,
      meta: {
        total_clientes: sanitizedClientes.length,
        total_dias: roteiro.dias.length,
        media_clientes_dia: Math.round(sanitizedClientes.length / roteiro.dias.length),
        ponto_partida: sanitizedBase || null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (e: any) {
    console.error('erro /api/atlas/gerarRoteiro:', e?.message || e.stack || e);

    const isDev = process.env.NODE_ENV === 'development';

    return NextResponse.json({
      error: isDev ? (e?.message || 'Erro inesperado') : 'Erro interno do servidor',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}