import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusLote } from '../domain/enums/StatusLote';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { FormatoRelatorio, StatusTarefa, TipoRelatorioAssincrono } from '../domain/enums/TarefaRelatorio';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';

// Esquemas de resposta da API pública: documentam o contrato no OpenAPI e, no Fastify,
// também filtram a saída (só o que está declarado chega ao parceiro).

const dataHora = { type: 'string', format: 'date-time' } as const;
const dataHoraOuNulo = { type: ['string', 'null'], format: 'date-time' } as const;
const enumTexto = (valores: object) => ({ type: 'string', enum: Object.values(valores) }) as const;

/** Formato padrão de erro: { statusCode, erro, mensagem, detalhes? }. */
export const esquemaErro = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer', examples: [404] },
    erro: { type: 'string', examples: ['ErroNaoEncontrado'] },
    mensagem: { type: 'string', examples: ['Equipamento "GC-NTB-2026-000001" não encontrado(a).'] },
    detalhes: {},
  },
} as const;

/** Respostas de erro comuns, com a descrição que aparece no Swagger. */
export function respostasErro(...codigos: (400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 503)[]) {
  const descricoes: Record<number, string> = {
    400: 'Entrada inválida (JSON Schema ou regra de formato).',
    401: 'Chave de API ausente, inválida, expirada ou revogada.',
    403: 'A chave não possui o escopo exigido pela operação.',
    404: 'Recurso inexistente ou de outra organização.',
    409: 'Conflito (duplicidade ou recurso ainda não pronto).',
    410: 'O prazo de download do relatório acabou.',
    422: 'Regra de negócio violada.',
    429: 'Limite de requisições por minuto atingido (veja os cabeçalhos x-ratelimit-*).',
    503: 'Fila de processamento indisponível.',
  };
  return Object.fromEntries(codigos.map((c) => [c, { description: descricoes[c], ...esquemaErro }]));
}

export const equipamentoPublico = {
  type: 'object',
  properties: {
    codigoBarrasInterno: { type: 'string', examples: ['GC-NTB-2026-000001'] },
    tipo: enumTexto(TipoEquipamento),
    marca: { type: 'string' },
    modelo: { type: 'string' },
    anoFabricacao: { type: 'integer' },
    estadoFisico: enumTexto(EstadoFisico),
    pesoQuilogramas: { type: 'number' },
    statusRastreamento: enumTexto(StatusRastreamento),
  },
} as const;

const camposLote = {
  id: { type: 'string', format: 'uuid' },
  organizacaoId: { type: 'string' },
  notaFiscal: { type: 'string' },
  transportadora: { type: 'string' },
  dataEntrada: dataHora,
  status: enumTexto(StatusLote),
  observacoes: { type: 'string' },
} as const;

export const loteResumoPublico = {
  type: 'object',
  properties: { ...camposLote, quantidadeEquipamentos: { type: 'integer' }, pesoTotalKg: { type: 'number' } },
} as const;

export const loteDetalhePublico = {
  type: 'object',
  properties: { ...camposLote, pesoTotalKg: { type: 'number' }, equipamentos: { type: 'array', items: equipamentoPublico } },
} as const;

export const rastreamentoPublico = {
  type: 'object',
  properties: {
    equipamento: equipamentoPublico,
    localAtual: { type: 'string' },
    valorResidualEstimado: { type: 'number', description: 'R$, pela fórmula de depreciação da plataforma.' },
    lote: {
      type: 'object',
      properties: { id: { type: 'string' }, notaFiscal: { type: 'string' }, dataEntrada: dataHora, status: enumTexto(StatusLote) },
    },
    historico: {
      type: 'array',
      items: {
        type: 'object',
        properties: { dataHora, origem: { type: 'string' }, destino: { type: 'string' }, observacao: { type: 'string' } },
      },
    },
  },
} as const;

/** Resultados analíticos: estrutura aberta (documentada no relatório técnico). */
const objetoAberto = { type: 'object', additionalProperties: true } as const;

export const rentabilidadePublica = {
  type: 'object',
  properties: {
    geradoEm: dataHora,
    totalEquipamentos: { type: 'integer' },
    porTipo: { type: 'array', items: objetoAberto, description: 'Ordenado por retorno médio (prioridade 1 = maior retorno).' },
    porTipoEEstado: { type: 'array', items: objetoAberto },
    destinos: objetoAberto,
  },
} as const;

export const vidaUtilPublica = {
  type: 'object',
  properties: {
    geradoEm: dataHora,
    totalAmostras: { type: 'integer' },
    modelos: { type: 'array', items: objetoAberto, description: 'Um modelo de regressão (MQO) por tipo de equipamento.' },
  },
} as const;

export const tarefaPublica = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tipo: enumTexto(TipoRelatorioAssincrono),
    formato: enumTexto(FormatoRelatorio),
    status: enumTexto(StatusTarefa),
    tentativas: { type: 'integer' },
    erro: { type: ['string', 'null'] },
    organizacaoId: { type: ['string', 'null'] },
    criadaEm: dataHora,
    concluidaEm: dataHoraOuNulo,
    expiraEm: dataHoraOuNulo,
    tamanhoBytes: { type: ['integer', 'null'] },
    webhookEntregueEm: dataHoraOuNulo,
    links: {
      type: 'object',
      properties: { status: { type: 'string' }, download: { type: ['string', 'null'] } },
    },
  },
} as const;
