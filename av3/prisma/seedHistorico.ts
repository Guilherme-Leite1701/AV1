/** AV3: histórico sintético (12 meses) para a camada analítica ter o que analisar. */
import { Prisma, PrismaClient } from '@prisma/client';
import { GeradorCodigoBarras } from '../src/domain/entidades/GeradorCodigoBarras';
import { EstadoFisico } from '../src/domain/enums/EstadoFisico';
import { StatusLote } from '../src/domain/enums/StatusLote';
import { StatusRastreamento } from '../src/domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../src/domain/enums/TipoEquipamento';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** Gerador pseudoaleatório com semente fixa (mulberry32): o seed é sempre o mesmo. */
export function criarAleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catálogo usado no sorteio: peso, marcas/modelos e velocidade de degradação (níveis/ano). */
const CATALOGO: { tipo: TipoEquipamento; peso: number; modelos: [string, string][]; degradacao: number }[] = [
  {
    tipo: TipoEquipamento.NOTEBOOK,
    peso: 1.8,
    degradacao: 0.75,
    modelos: [
      ['Dell', 'Latitude 5420'],
      ['Lenovo', 'ThinkPad T14'],
      ['HP', 'ProBook 440'],
    ],
  },
  {
    tipo: TipoEquipamento.COMPUTADOR_MESA,
    peso: 7.5,
    degradacao: 0.5,
    modelos: [
      ['Dell', 'OptiPlex 7080'],
      ['Positivo', 'Master D3400'],
      ['Lenovo', 'ThinkCentre M70'],
    ],
  },
  {
    tipo: TipoEquipamento.MONITOR,
    peso: 3.4,
    degradacao: 0.45,
    modelos: [
      ['LG', '24MK430H'],
      ['Samsung', 'S24R350'],
      ['AOC', 'E2270SWN'],
    ],
  },
  {
    tipo: TipoEquipamento.SERVIDOR,
    peso: 27,
    degradacao: 0.35,
    modelos: [
      ['Dell', 'PowerEdge R740'],
      ['HPE', 'ProLiant DL380'],
    ],
  },
  {
    tipo: TipoEquipamento.IMPRESSORA,
    peso: 8.5,
    degradacao: 0.65,
    modelos: [
      ['HP', 'LaserJet M404'],
      ['Epson', 'EcoTank L3150'],
    ],
  },
  {
    tipo: TipoEquipamento.ROTEADOR,
    peso: 2.2,
    degradacao: 0.4,
    modelos: [
      ['Cisco', 'ISR 1111'],
      ['Mikrotik', 'RB4011'],
    ],
  },
  {
    tipo: TipoEquipamento.FONTE_ALIMENTACAO,
    peso: 11,
    degradacao: 0.6,
    modelos: [
      ['APC', 'Back-UPS 1500'],
      ['SMS', 'Station II'],
    ],
  },
  { tipo: TipoEquipamento.CABO_ESTRUTURADO, peso: 9.8, degradacao: 0.3, modelos: [['Furukawa', 'Cat6 305 m']] },
];

/** Cada almoxarife tem um ritmo: espera média até a triagem e horas de triagem por equipamento. */
const RITMOS: Record<string, { esperaHoras: number; horasPorItem: number }> = {
  almoxarife: { esperaHoras: 20, horasPorItem: 0.9 },
  almoxarife2: { esperaHoras: 30, horasPorItem: 1.2 },
  almoxarife3: { esperaHoras: 48, horasPorItem: 1.6 },
};

const ESTADOS = Object.values(EstadoFisico);
const TRANSPORTADORAS = ['TransLog Express', 'Rota Verde Logística', 'Coleta Campus Ltda.'];

function escolher<T>(aleatorio: () => number, lista: readonly T[]): T {
  return lista[Math.floor(aleatorio() * lista.length)];
}

/** Destino final coerente com o estado físico. */
function destinoFinal(estado: EstadoFisico, aleatorio: () => number): { status: StatusRastreamento; local: string } {
  const indice = ESTADOS.indexOf(estado);
  if (indice <= 2) return { status: StatusRastreamento.PECAS_REAPROVEITADAS, local: 'Estoque de peças' };
  if (indice <= 4) {
    return aleatorio() < 0.5
      ? { status: StatusRastreamento.PECAS_REAPROVEITADAS, local: 'Estoque de peças' }
      : { status: StatusRastreamento.MATERIAL_RECICLAVEL, local: 'Parceiro de reciclagem EcoMetal' };
  }
  return indice === 5
    ? { status: StatusRastreamento.MATERIAL_RECICLAVEL, local: 'Parceiro de reciclagem EcoMetal' }
    : { status: StatusRastreamento.DESCARTE_SEGURO, local: 'Aterro industrial licenciado (Classe I)' };
}

/**
 * Cria 3 lotes por mês nos últimos 12 meses, já triados, com equipamentos cujo estado piora
 * com a idade (com ruído) e tempos de triagem que dependem do almoxarife; um dos lotes fica
 * parado no almoxarifado para aparecer como atípico. Idempotente: cada lote tem o próprio
 * gerador pseudoaleatório e só é criado se a nota fiscal ainda não existir.
 */
export async function semearHistorico(
  prisma: PrismaClient,
  organizacoes: string[],
  agora: Date,
): Promise<{ criados: number; existentes: number }> {
  const resultado = { criados: 0, existentes: 0 };
  const almoxarifes = Object.keys(RITMOS);

  for (let mes = 12; mes >= 1; mes--) {
    for (let n = 1; n <= 3; n++) {
      const aleatorio = criarAleatorio(2026 * 100 + mes * 10 + n);
      const notaFiscal = `NF-HIST-M${String(mes).padStart(2, '0')}-${n}`;
      const diasAtras = mes * 30 - n * 8 + Math.floor(aleatorio() * 5);
      const dataEntrada = new Date(agora.getTime() - diasAtras * DIA);
      const responsavel = escolher(aleatorio, almoxarifes);
      const ritmo = RITMOS[responsavel];
      const quantidade = 3 + Math.floor(aleatorio() * 6);
      const parado = mes === 11 && n === 2 ? 220 : 0;
      const espera = ritmo.esperaHoras * (0.6 + aleatorio() * 0.8) + parado;
      const triagem = quantidade * ritmo.horasPorItem * (0.7 + aleatorio() * 0.6);
      const dataInicioTriagem = new Date(dataEntrada.getTime() + espera * HORA);
      const dataConclusaoTriagem = new Date(dataInicioTriagem.getTime() + triagem * HORA);

      if (await prisma.lote.findUnique({ where: { notaFiscal } })) {
        resultado.existentes++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const lote = await tx.lote.create({
          data: {
            dataEntrada,
            organizacaoId: escolher(aleatorio, organizacoes),
            notaFiscal,
            transportadora: escolher(aleatorio, TRANSPORTADORAS),
            observacoes: 'Lote histórico (seed AV3).',
            statusProcessamento: StatusLote.FINALIZADO,
            dataInicioTriagem,
            dataConclusaoTriagem,
            responsavelTriagem: responsavel,
          },
        });

        for (let i = 0; i < quantidade; i++) {
          const item = escolher(aleatorio, CATALOGO);
          const [marca, modelo] = escolher(aleatorio, item.modelos);
          const idade = Math.floor(aleatorio() * 12);
          const ruido = (aleatorio() - 0.5) * 1.6;
          const indice = Math.max(0, Math.min(6, Math.round(idade * item.degradacao + ruido)));
          const estado = ESTADOS[indice];
          const final = destinoFinal(estado, aleatorio);
          const ano = dataEntrada.getFullYear();
          const { valor } = await tx.contadorSequencial.upsert({
            where: { chave: GeradorCodigoBarras.chaveContador(ano) },
            create: { chave: GeradorCodigoBarras.chaveContador(ano), valor: 1 },
            update: { valor: { increment: 1 } },
          });
          const movimentacoes: Prisma.MovimentacaoCreateWithoutEquipamentoInput[] = [
            {
              dataHora: dataEntrada,
              origem: `Transportadora (NF ${notaFiscal})`,
              destino: 'Almoxarifado',
              responsavel,
              observacao: 'Entrada do equipamento no almoxarifado.',
            },
            {
              dataHora: dataInicioTriagem,
              origem: 'Almoxarifado',
              destino: 'Área de triagem',
              responsavel,
              observacao: 'Status: AGUARDANDO_TRIAGEM → EM_TRIAGEM.',
            },
            {
              dataHora: new Date(dataConclusaoTriagem.getTime() + (2 + aleatorio() * 10) * DIA),
              origem: 'Área de triagem',
              destino: final.local,
              responsavel,
              observacao: `Status: EM_TRIAGEM → ${final.status}.`,
            },
          ];
          await tx.equipamento.create({
            data: {
              codigoBarrasInterno: GeradorCodigoBarras.gerarCodigoBarras(item.tipo, ano, valor),
              tipo: item.tipo,
              marca,
              modelo,
              anoFabricacao: ano - idade,
              estadoFisico: estado,
              pesoQuilogramas: Math.round(item.peso * (0.85 + aleatorio() * 0.3) * 10) / 10,
              loteId: lote.id,
              posicaoNoLote: i + 1,
              statusRastreamento: final.status,
              versao: movimentacoes.length,
              movimentacoes: { create: movimentacoes },
            },
          });
        }
      });
      resultado.criados++;
    }
  }
  return resultado;
}
