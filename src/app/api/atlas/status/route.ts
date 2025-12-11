import { NextRequest, NextResponse } from 'next/server';
import { orsService } from '@/lib/atlas/orsService.js';
import { vroomService } from '@/lib/atlas/vroomService.js';

export async function GET() {
  const status = { 
    ors: false, 
    vroom: false, 
    openai: process.env.OPENAI_API_KEY ? true : false 
  };
  const logs: any = {};

  // --- Teste ORS ---
  try {
    status.ors = await orsService.checkHealth();
    logs.ors = status.ors ? 'OK: ORS service is responding' : 'Erro: ORS service unavailable';
  } catch (e: any) {
    logs.ors = `Erro ao conectar ORS: ${e.message}`;
  }

  // --- Teste VROOM ---
  try {
    status.vroom = await vroomService.checkHealth();
    logs.vroom = status.vroom ? 'OK: VROOM service is responding' : 'Erro: VROOM service unavailable';
  } catch (e: any) {
    logs.vroom = `Erro ao conectar VROOM: ${e.message}`;
  }

  console.log('🔍 STATUS DIAGNÓSTICO:', logs);
  
  return NextResponse.json({ 
    ok: true, 
    status, 
    logs,
    config: {
      ors_url: process.env.ORS_BASE_URL || 'http://localhost:8082/ors',
      vroom_url: process.env.VROOM_BASE_URL || 'http://localhost:3000',
      openai_configured: status.openai
    }
  });
}