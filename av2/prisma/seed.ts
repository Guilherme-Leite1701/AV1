/** Seed idempotente: cada registro só é criado se ainda não existir (npm run db:seed). */
import { Prisma, PrismaClient } from '@prisma/client';
import { Credencial } from '../src/domain/entidades/Credencial';
import { GeradorCodigoBarras } from '../src/domain/entidades/GeradorCodigoBarras';
import { EstadoFisico } from '../src/domain/enums/EstadoFisico';
import { PapelUsuario } from '../src/domain/enums/PapelUsuario';
import { StatusLote } from '../src/domain/enums/StatusLote';
import { StatusRastreamento } from '../src/domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../src/domain/enums/TipoEquipamento';
import { adicionarMeses } from '../src/domain/utils/datas';
import { ValidadorCNPJ } from '../src/domain/validadores/ValidadorCNPJ';
import { PARAMETROS_GLOBAIS, CHAVES_PARAMETROS } from '../src/domain/valoracao/ParametrosGlobais';

try {
  process.loadEnvFile();
} catch {
  /* sem .env: usa o ambiente */
}

const prisma = new PrismaClient();
const AGORA = new Date();
const ANO = AGORA.getFullYear();
const DIA = 24 * 60 * 60 * 1000;
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * DIA);
const depoisDe = (base: Date, dias: number, horas = 0) => new Date(base.getTime() + dias * DIA + horas * 60 * 60 * 1000);

const json = (valor: unknown) => JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
const contagem = { criados: 0, existentes: 0 };

// 1. Parâmetros globais
async function semearParametros(): Promise<void> {
  for (const chave of CHAVES_PARAMETROS) {
    const definicao = PARAMETROS_GLOBAIS[chave];
    const existente = await prisma.parametroGlobal.findUnique({ where: { chave } });
    if (existente) {
      contagem.existentes++;
      continue;
    }
    await prisma.parametroGlobal.create({ data: { chave, valorNumerico: definicao.padrao, descricao: definicao.descricao } });
    contagem.criados++;
  }
}

// 2. Credenciais (uma por papel)
export const CONTAS_SEED = [
  { usuario: 'admin', senha: 'Admin@2026', papel: PapelUsuario.ADMINISTRADOR },
  { usuario: 'operador', senha: 'Operador@2026', papel: PapelUsuario.OPERADOR_CADASTRO },
  { usuario: 'almoxarife', senha: 'Almox@2026', papel: PapelUsuario.GESTOR_ALMOXARIFADO },
  { usuario: 'auditor', senha: 'Auditor@2026', papel: PapelUsuario.AUDITOR },
] as const;

async function semearCredenciais(): Promise<void> {
  for (const conta of CONTAS_SEED) {
    if (await prisma.credencial.findUnique({ where: { usuario: conta.usuario } })) {
      contagem.existentes++;
      continue;
    }
    const dados = Credencial.gerarDados(conta.usuario, conta.senha, conta.papel);
    await prisma.$transaction(async (tx) => {
      const criada = await tx.credencial.create({ data: dados });
      await tx.journalTransacao.create({
        data: {
          operacao: 'SEED',
          entidade: 'Credencial',
          dadosDepois: { id: criada.id, usuario: criada.usuario, papel: criada.papel },
          usuarioResponsavel: 'seed',
        },
      });
    });
    contagem.criados++;
  }
}

// 3. Organizações + contratos
interface OrgSeed {
  chave: 'banco' | 'hospital' | 'universidade';
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
  contrato: { dataAssinatura: Date; dataVencimento: Date; clausulas: string[]; valorMensal: number; renovacaoAutomatica: boolean };
}

const ORGANIZACOES: OrgSeed[] = [
  {
    chave: 'banco',
    razaoSocial: 'Banco Vanguarda S.A.',
    cnpj: '48.127.365/0001-08',
    inscricaoEstadual: '645.872.193.110',
    enderecoCompleto: 'Av. Paulista, 1500 - 12º andar, Bela Vista, São Paulo/SP, 01310-200',
    telefone: '(11) 3456-7800',
    email: 'patrimonio@bancovanguarda.com.br',
    contrato: {
      dataAssinatura: adicionarMeses(AGORA, -8),
      dataVencimento: adicionarMeses(AGORA, 16),
      clausulas: [
        'Coleta quinzenal de ativos de TI nas agências da Grande São Paulo.',
        'Sanitização de dados conforme NIST 800-88 com laudo por número de série.',
        'Relatório trimestral de destinação ambientalmente adequada (PNRS - Lei 12.305/2010).',
      ],
      valorMensal: 4800,
      renovacaoAutomatica: false,
    },
  },
  {
    chave: 'hospital',
    razaoSocial: 'Hospital Santa Clara',
    cnpj: '12.783.946/0001-50',
    inscricaoEstadual: '284.519.637.002',
    enderecoCompleto: 'Rua das Acácias, 820, Jardim Aquarius, São José dos Campos/SP, 12246-001',
    telefone: '(12) 3921-4400',
    email: 'ti@hospitalsantaclara.org.br',
    contrato: {
      dataAssinatura: adicionarMeses(AGORA, -12),
      dataVencimento: depoisDe(AGORA, 5), // PRESTES A VENCER
      clausulas: [
        'Coleta mensal de equipamentos de TI administrativos (não inclui equipamentos médicos).',
        'Renovação automática por 12 meses, salvo manifestação contrária com 30 dias de antecedência.',
      ],
      valorMensal: 3200,
      renovacaoAutomatica: true,
    },
  },
  {
    chave: 'universidade',
    razaoSocial: 'Universidade Federal Tecnológica',
    cnpj: '06.351.729/0001-99',
    inscricaoEstadual: 'ISENTO',
    enderecoCompleto: 'Rod. Presidente Dutra, km 137, Eugênio de Melo, São José dos Campos/SP, 12247-004',
    telefone: '(12) 3947-1000',
    email: 'patrimonio@uft.edu.br',
    contrato: {
      dataAssinatura: adicionarMeses(AGORA, -14),
      dataVencimento: diasAtras(10), // VENCIDO e sem renovação automática
      clausulas: ['Coleta semestral de laboratórios de informática.', 'Doação de peças reaproveitáveis a projetos de extensão.'],
      valorMensal: 2500,
      renovacaoAutomatica: false,
    },
  },
];

async function semearOrganizacoes(): Promise<Record<OrgSeed['chave'], string>> {
  const ids = {} as Record<OrgSeed['chave'], string>;
  const validador = new ValidadorCNPJ();
  for (const org of ORGANIZACOES) {
    if (!validador.validar(org.cnpj)) throw new Error(`CNPJ do seed inválido: ${org.cnpj}`);
    const cnpj = ValidadorCNPJ.normalizar(org.cnpj);
    const existente = await prisma.organizacao.findUnique({ where: { cnpj } });
    if (existente) {
      ids[org.chave] = existente.id;
      contagem.existentes++;
      continue;
    }
    const { chave, contrato, ...dados } = org;
    const criada = await prisma.$transaction(async (tx) => {
      const nova = await tx.organizacao.create({
        data: { ...dados, cnpj, dataCadastro: contrato.dataAssinatura, contratoVigente: { create: contrato } },
        include: { contratoVigente: true },
      });
      await tx.journalTransacao.create({
        data: { operacao: 'SEED', entidade: 'Organizacao', dadosDepois: json(nova), usuarioResponsavel: 'operador', timestamp: contrato.dataAssinatura },
      });
      return nova;
    });
    ids[chave] = criada.id;
    contagem.criados++;
  }
  return ids;
}

// 4. Lotes, equipamentos, movimentações e journal

interface Passo {
  status?: StatusRastreamento;
  estadoFisico?: EstadoFisico;
  destino?: string;
  observacao: string;
  diasAposEntrada: number;
}

interface EquipSeed {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  passos?: Passo[];
}

interface LoteSeed {
  organizacao: OrgSeed['chave'];
  notaFiscal: string;
  transportadora: string;
  diasDesdeEntrada: number;
  status: StatusLote;
  observacoes: string;
  equipamentos: EquipSeed[];
}

const S = StatusRastreamento;
const E = EstadoFisico;
const T = TipoEquipamento;

const LOTES: LoteSeed[] = [
  {
    organizacao: 'banco',
    notaFiscal: `NF-${ANO}-000101`,
    transportadora: 'TransLog Express',
    diasDesdeEntrada: 3,
    status: StatusLote.RECEBIDO,
    observacoes: 'Renovação do parque de estações da agência Paulista.',
    equipamentos: [
      { tipo: T.COMPUTADOR_MESA, marca: 'Dell', modelo: 'OptiPlex 7080', anoFabricacao: 2020, estadoFisico: E.USADO_LEVE, pesoQuilogramas: 7.9 },
      { tipo: T.COMPUTADOR_MESA, marca: 'Dell', modelo: 'OptiPlex 7080', anoFabricacao: 2020, estadoFisico: E.USADO_MODERADO, pesoQuilogramas: 7.9 },
      { tipo: T.MONITOR, marca: 'LG', modelo: '24MK430H', anoFabricacao: 2019, estadoFisico: E.BOM_ESTADO, pesoQuilogramas: 3.4 },
      { tipo: T.IMPRESSORA, marca: 'HP', modelo: 'LaserJet Pro M404', anoFabricacao: 2018, estadoFisico: E.DANIFICADO_LEVE, pesoQuilogramas: 8.6 },
    ],
  },
  {
    organizacao: 'hospital',
    notaFiscal: `NF-${ANO}-000102`,
    transportadora: 'Rota Verde Logística',
    diasDesdeEntrada: 12,
    status: StatusLote.EM_TRIAGEM,
    observacoes: 'Equipamentos administrativos da ala de faturamento.',
    equipamentos: [
      { tipo: T.NOTEBOOK, marca: 'Lenovo', modelo: 'ThinkPad T14 Gen 2', anoFabricacao: 2021, estadoFisico: E.BOM_ESTADO, pesoQuilogramas: 1.5 },
      {
        tipo: T.NOTEBOOK, marca: 'Lenovo', modelo: 'ThinkPad E14', anoFabricacao: 2019, estadoFisico: E.USADO_LEVE, pesoQuilogramas: 1.7,
        passos: [{ estadoFisico: E.DANIFICADO_LEVE, observacao: 'Tela trincada e dobradiça solta identificadas na triagem.', diasAposEntrada: 2 }],
      },
      { tipo: T.ROTEADOR, marca: 'Cisco', modelo: 'ISR 1111', anoFabricacao: 2017, estadoFisico: E.USADO_MODERADO, pesoQuilogramas: 2.1 },
      { tipo: T.FONTE_ALIMENTACAO, marca: 'APC', modelo: 'Back-UPS 1500', anoFabricacao: 2016, estadoFisico: E.DANIFICADO_GRAVE, pesoQuilogramas: 11.2 },
    ],
  },
  {
    organizacao: 'banco',
    notaFiscal: `NF-${ANO}-000087`,
    transportadora: 'TransLog Express',
    diasDesdeEntrada: 35,
    status: StatusLote.TRIAGEM_CONCLUIDA,
    observacoes: 'Desativação da sala-cofre secundária.',
    equipamentos: [
      { tipo: T.SERVIDOR, marca: 'Dell', modelo: 'PowerEdge R740', anoFabricacao: 2019, estadoFisico: E.BOM_ESTADO, pesoQuilogramas: 28.5 },
      {
        tipo: T.SERVIDOR, marca: 'HPE', modelo: 'ProLiant DL380 Gen9', anoFabricacao: 2016, estadoFisico: E.USADO_LEVE, pesoQuilogramas: 26.0,
        passos: [
          {
            estadoFisico: E.DANIFICADO_LEVE,
            observacao: 'Justificativa: controladora RAID com falha e corrosão nos conectores de energia.',
            diasAposEntrada: 3,
          },
        ],
      },
      { tipo: T.CABO_ESTRUTURADO, marca: 'Furukawa', modelo: 'Cat6 caixa 305 m', anoFabricacao: 2015, estadoFisico: E.USADO_MODERADO, pesoQuilogramas: 9.8 },
      { tipo: T.ROTEADOR, marca: 'Juniper', modelo: 'MX204', anoFabricacao: 2018, estadoFisico: E.BOM_ESTADO, pesoQuilogramas: 9.1 },
    ],
  },
  {
    organizacao: 'universidade',
    notaFiscal: `NF-${ANO}-000042`,
    transportadora: 'Coleta Campus Ltda.',
    diasDesdeEntrada: 80,
    status: StatusLote.FINALIZADO,
    observacoes: 'Laboratório de informática 3 (bloco C) — substituição completa.',
    equipamentos: [
      {
        tipo: T.COMPUTADOR_MESA, marca: 'Positivo', modelo: 'Master D3400', anoFabricacao: 2017, estadoFisico: E.USADO_MODERADO, pesoQuilogramas: 6.8,
        passos: [
          { status: S.AGUARDANDO_DESMONTE, destino: 'Bancada de desmonte', observacao: 'Encaminhado para desmonte.', diasAposEntrada: 6 },
          { status: S.EM_DESMONTE, observacao: 'Desmonte iniciado.', diasAposEntrada: 8 },
          { status: S.PECAS_REAPROVEITADAS, destino: 'Estoque de peças', observacao: 'Memórias e SSD aprovados nos testes.', diasAposEntrada: 10 },
        ],
      },
      {
        tipo: T.NOTEBOOK, marca: 'Samsung', modelo: 'Book NP550', anoFabricacao: 2018, estadoFisico: E.DANIFICADO_LEVE, pesoQuilogramas: 1.9,
        passos: [
          { status: S.AGUARDANDO_DESMONTE, destino: 'Bancada de desmonte', observacao: 'Encaminhado para desmonte.', diasAposEntrada: 6 },
          { status: S.EM_DESMONTE, observacao: 'Desmonte iniciado.', diasAposEntrada: 9 },
          { status: S.MATERIAL_RECICLAVEL, destino: 'Parceiro de reciclagem EcoMetal', observacao: 'Placa-mãe enviada para recuperação de metais nobres.', diasAposEntrada: 12 },
        ],
      },
      {
        tipo: T.SERVIDOR, marca: 'IBM', modelo: 'System x3650 M4', anoFabricacao: 2013, estadoFisico: E.USADO_MODERADO, pesoQuilogramas: 29.3,
        passos: [
          { status: S.AGUARDANDO_DESMONTE, destino: 'Bancada de desmonte', observacao: 'Encaminhado para desmonte.', diasAposEntrada: 7 },
          { status: S.EM_DESMONTE, observacao: 'Desmonte iniciado.', diasAposEntrada: 9 },
          { status: S.MATERIAL_RECICLAVEL, destino: 'Parceiro de reciclagem EcoMetal', observacao: 'Placas e conectores para refino.', diasAposEntrada: 14 },
        ],
      },
      {
        tipo: T.MONITOR, marca: 'AOC', modelo: 'E2270SWN', anoFabricacao: 2014, estadoFisico: E.DANIFICADO_GRAVE, pesoQuilogramas: 3.1,
        passos: [
          { estadoFisico: E.INSERVIVEL, observacao: 'Justificativa: painel com vazamento e carcaça quebrada.', diasAposEntrada: 3 },
          { status: S.DESCARTE_SEGURO, destino: 'Aterro industrial licenciado (Classe I)', observacao: 'Descarte com manifesto de transporte de resíduos.', diasAposEntrada: 15 },
        ],
      },
      {
        tipo: T.IMPRESSORA, marca: 'Epson', modelo: 'EcoTank L3150', anoFabricacao: 2015, estadoFisico: E.INSERVIVEL, pesoQuilogramas: 4.2,
        passos: [
          { status: S.DESCARTE_SEGURO, destino: 'Aterro industrial licenciado (Classe I)', observacao: 'Tinta residual e placa oxidada.', diasAposEntrada: 15 },
          { status: S.BAIXA_DEFINITIVA, observacao: 'Baixa patrimonial confirmada com o certificado de destinação.', diasAposEntrada: 20 },
        ],
      },
    ],
  },
];

async function semearLotes(orgIds: Record<OrgSeed['chave'], string>): Promise<void> {
  for (const definicao of LOTES) {
    if (await prisma.lote.findUnique({ where: { notaFiscal: definicao.notaFiscal } })) {
      contagem.existentes++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const dataEntrada = diasAtras(definicao.diasDesdeEntrada);
      const lote = await tx.lote.create({
        data: {
          dataEntrada,
          organizacaoId: orgIds[definicao.organizacao],
          notaFiscal: definicao.notaFiscal,
          transportadora: definicao.transportadora,
          observacoes: definicao.observacoes,
          statusProcessamento: definicao.status,
        },
      });
      await tx.journalTransacao.create({
        data: { operacao: 'SEED', entidade: 'Lote', dadosDepois: json(lote), usuarioResponsavel: 'almoxarife', timestamp: dataEntrada },
      });

      const triado = definicao.status !== StatusLote.RECEBIDO;
      for (const [indice, item] of definicao.equipamentos.entries()) {
        const { valor } = await tx.contadorSequencial.upsert({
          where: { chave: GeradorCodigoBarras.chaveContador(ANO) },
          create: { chave: GeradorCodigoBarras.chaveContador(ANO), valor: 1 },
          update: { valor: { increment: 1 } },
        });

        let status: StatusRastreamento = triado ? S.EM_TRIAGEM : S.AGUARDANDO_TRIAGEM;
        let estado: EstadoFisico = item.estadoFisico;
        let local = 'Almoxarifado';
        const historico: Prisma.MovimentacaoCreateWithoutEquipamentoInput[] = [
          {
            dataHora: depoisDe(dataEntrada, 0, indice * 0.1),
            origem: `Transportadora ${definicao.transportadora} (NF ${definicao.notaFiscal})`,
            destino: local,
            responsavel: 'almoxarife',
            observacao: 'Entrada do equipamento no almoxarifado.',
          },
        ];
        if (triado) {
          historico.push({
            dataHora: depoisDe(dataEntrada, 1),
            origem: local,
            destino: 'Área de triagem',
            responsavel: 'almoxarife',
            observacao: 'Status: AGUARDANDO_TRIAGEM → EM_TRIAGEM. Início da triagem do lote.',
          });
          local = 'Área de triagem';
        }
        for (const passo of item.passos ?? []) {
          const destino = passo.destino ?? local;
          let observacao = passo.observacao;
          if (passo.estadoFisico) {
            observacao = `Estado físico: ${estado} → ${passo.estadoFisico}. ${passo.observacao}`;
            estado = passo.estadoFisico;
          }
          if (passo.status) {
            observacao = `Status: ${status} → ${passo.status}. ${passo.observacao}`;
            status = passo.status;
          }
          historico.push({
            dataHora: depoisDe(dataEntrada, passo.diasAposEntrada),
            origem: local,
            destino,
            responsavel: 'almoxarife',
            observacao,
          });
          local = destino;
        }

        const equipamento = await tx.equipamento.create({
          data: {
            codigoBarrasInterno: GeradorCodigoBarras.gerarCodigoBarras(item.tipo, ANO, valor),
            tipo: item.tipo,
            marca: item.marca,
            modelo: item.modelo,
            anoFabricacao: item.anoFabricacao,
            estadoFisico: estado,
            pesoQuilogramas: item.pesoQuilogramas,
            loteId: lote.id,
            posicaoNoLote: indice + 1,
            statusRastreamento: status,
            versao: historico.length,
            movimentacoes: { create: historico },
          },
        });
        await tx.journalTransacao.create({
          data: {
            operacao: 'SEED',
            entidade: 'Equipamento',
            dadosDepois: json({ ...equipamento, movimentacoes: historico.length }),
            usuarioResponsavel: 'almoxarife',
            timestamp: dataEntrada,
          },
        });
      }
    });
    contagem.criados++;
  }
}

async function main(): Promise<void> {
  console.log('🌱 Semeando o banco do greencode...');
  await semearParametros();
  await semearCredenciais();
  const orgIds = await semearOrganizacoes();
  await semearLotes(orgIds);

  const [equipamentos, movimentacoes, journal] = await Promise.all([
    prisma.equipamento.count(),
    prisma.movimentacao.count(),
    prisma.journalTransacao.count(),
  ]);
  console.log(`✅ Seed concluído: ${contagem.criados} registro(s) raiz criado(s), ${contagem.existentes} já existia(m).`);
  console.log(`   Banco agora tem ${equipamentos} equipamentos, ${movimentacoes} movimentações e ${journal} registros de journal.`);
  console.log('   Contas: ' + CONTAS_SEED.map((c) => `${c.usuario} / ${c.senha}`).join('  |  '));
}

main()
  .catch((erro) => {
    console.error('❌ Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
