import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    title: 'API ATLAS - Roteirização Inteligente',
    version: '1.0.0',
    description: 'Sistema backend para roteirização por clusters geográficos',
    endpoints: {
      'GET /api/atlas/health': 'Verifica se a API está funcionando',
      'GET /api/atlas/status': 'Verifica status dos serviços externos (ORS, VROOM, OpenAI)',
      'POST /api/atlas/gerarRoteiro': 'Gera roteirização inteligente',
      'GET /api/atlas/docs': 'Documentação da API (esta rota)'
    },
    gerarRoteiro: {
      method: 'POST',
      url: '/api/atlas/gerarRoteiro',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        clientes: [
          {
            id: 'CLI001',
            nome: 'Cliente Exemplo',
            latitude: -23.550,
            longitude: -46.633,
            endereco: 'Rua Exemplo, 123'
          }
        ],
        numDiasAlvo: 10, // opcional
        maxPorDia: 12,   // opcional
        minPorDia: 6     // opcional
      },
      response: {
        success: true,
        data: {
          dias: [
            {
              dia: 'Dia 1',
              clientes: [
                {
                  id: 'CLI001',
                  nome: 'Cliente Exemplo',
                  latitude: -23.550,
                  longitude: -46.633,
                  ordem: 1
                }
              ],
              geometria: [[-23.550, -46.633], [-23.551, -46.634]]
            }
          ]
        },
        meta: {
          total_clientes: 45,
          total_dias: 10,
          media_clientes_dia: 4,
          timestamp: '2024-01-01T12:00:00.000Z'
        }
      }
    }
  });
}