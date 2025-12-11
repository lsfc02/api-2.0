import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API ATLAS - Backend Service',
  description: 'Sistema de roteirização inteligente por clusters geográficos',
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🚀 API ATLAS - Backend Service
        </h1>
        
        <p className="text-lg text-gray-600 mb-8">
          Sistema de roteirização inteligente por clusters geográficos
        </p>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">📡 Endpoints Disponíveis:</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="font-mono text-sm">GET /api/atlas/health</span>
              <span className="text-green-600">✓ Health check</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="font-mono text-sm">GET /api/atlas/status</span>
              <span className="text-green-600">✓ Status dos serviços</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="font-mono text-sm">GET /api/atlas/docs</span>
              <span className="text-green-600">✓ Documentação</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="font-mono text-sm">POST /api/atlas/gerarRoteiro</span>
              <span className="text-green-600">✓ Gerar roteirização</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">🔧 Exemplo de Uso:</h2>
          <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`curl -X POST http://localhost:3000/api/atlas/gerarRoteiro \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientes": [
      {
        "id": "CLI001",
        "nome": "Cliente Exemplo",
        "latitude": -23.550,
        "longitude": -46.633
      }
    ],
    "numDiasAlvo": 5
  }'`}
          </pre>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">⚙️ Configuração:</h2>
          <p className="mb-4">Configure as variáveis de ambiente no arquivo .env.local:</p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`ORS_BASE_URL=http://localhost:8082/ors
VROOM_BASE_URL=http://localhost:3000
OPENAI_API_KEY=sk-your-key-here
PORT=3000`}
          </pre>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">🐛 Serviços Externos:</h2>
          <p className="mb-4">Use Docker Compose para iniciar ORS e VROOM:</p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`docker-compose up -d`}
          </pre>
          <p className="mt-4 text-sm text-gray-600">
            <strong>Nota:</strong> A API funciona mesmo sem os serviços externos, usando algoritmos de fallback.
          </p>
        </div>
      </div>
    </div>
  );
}