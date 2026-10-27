import { PrismaClient } from '@prisma/client';
import { FastifyInstance, InjectOptions } from 'fastify';
import { construirApp } from '../../src/app';
import { Credencial } from '../../src/domain/entidades/Credencial';
import { PapelUsuario } from '../../src/domain/enums/PapelUsuario';
import { ValidadorCNPJ } from '../../src/domain/validadores/ValidadorCNPJ';
import { PARAMETROS_GLOBAIS, CHAVES_PARAMETROS } from '../../src/domain/valoracao/ParametrosGlobais';
import { JWT_SECRET_TESTES, SCHEMA_TESTES } from './urlTeste';

export const SENHA_PADRAO = 'SenhaTeste@123';
const DIA = 24 * 60 * 60 * 1000;

export type Papel = 'admin' | 'operador' | 'gestor' | 'auditor';

const PAPEIS: Record<Papel, PapelUsuario> = {
  admin: PapelUsuario.ADMINISTRADOR,
  operador: PapelUsuario.OPERADOR_CADASTRO,
  gestor: PapelUsuario.GESTOR_ALMOXARIFADO,
  auditor: PapelUsuario.AUDITOR,
};

/** Banco limpo, um usuário por papel e o app pronto para `app.inject()`. */
export class AmbienteTeste {
  public readonly tokens = {} as Record<Papel, string>;
  private sequenciaCnpj = 0;
  private sequenciaNota = 0;

  private constructor(
    public readonly app: FastifyInstance,
    public readonly prisma: PrismaClient,
  ) {}

  public static async criar(): Promise<AmbienteTeste> {
    const url = process.env.DATABASE_URL ?? '';
    if (!url.includes(`schema=${SCHEMA_TESTES}`)) {
      throw new Error(`Por segurança, os testes de integração só rodam no schema "${SCHEMA_TESTES}". URL atual: ${url}`);
    }
    const prisma = new PrismaClient({ datasourceUrl: url });
    const app = await construirApp({ prisma, jwtSecret: JWT_SECRET_TESTES });
    const ambiente = new AmbienteTeste(app, prisma);
    await ambiente.limparBanco();
    await ambiente.criarUsuariosEParametros();
    return ambiente;
  }

  public async encerrar(): Promise<void> {
    await this.app.close();
  }

  private async limparBanco(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Movimentacao", "Equipamento", "Lote", "Contrato", "Organizacao", ' +
        '"JournalTransacao", "Credencial", "ParametroGlobal", "ContadorSequencial" CASCADE',
    );
  }

  private async criarUsuariosEParametros(): Promise<void> {
    for (const chave of CHAVES_PARAMETROS) {
      const definicao = PARAMETROS_GLOBAIS[chave];
      await this.prisma.parametroGlobal.create({
        data: { chave, valorNumerico: definicao.padrao, descricao: definicao.descricao },
      });
    }
    for (const [nome, papel] of Object.entries(PAPEIS) as [Papel, PapelUsuario][]) {
      await this.prisma.credencial.create({ data: Credencial.gerarDados(nome, SENHA_PADRAO, papel) });
      const resposta = await this.app.inject({ method: 'POST', url: '/auth/login', payload: { usuario: nome, senha: SENHA_PADRAO } });
      this.tokens[nome] = resposta.json().token;
    }
  }

  public requisicao(papel: Papel, opcoes: InjectOptions) {
    return this.app.inject({ ...opcoes, headers: { ...opcoes.headers, authorization: `Bearer ${this.tokens[papel]}` } });
  }

  public novoCnpj(): string {
    this.sequenciaCnpj++;
    const base = `9${String(Date.now() % 1e7).padStart(7, '0')}${String(this.sequenciaCnpj).padStart(4, '0')}`;
    return base + ValidadorCNPJ.calcularDigitosVerificadores(base);
  }

  public novaNotaFiscal(): string {
    this.sequenciaNota++;
    return `NF-TESTE-${Date.now()}-${this.sequenciaNota}`;
  }

  public async criarOrganizacao(contrato: Partial<{ diasAteVencer: number; renovacaoAutomatica: boolean }> = {}) {
    const agora = Date.now();
    const resposta = await this.requisicao('operador', {
      method: 'POST',
      url: '/organizacoes',
      payload: {
        razaoSocial: `Organização de Teste ${this.sequenciaCnpj + 1}`,
        cnpj: this.novoCnpj(),
        enderecoCompleto: 'Rua dos Testes, 100 - São José dos Campos/SP',
        contrato: {
          dataAssinatura: new Date(agora - 365 * DIA).toISOString(),
          dataVencimento: new Date(agora + (contrato.diasAteVencer ?? 180) * DIA).toISOString(),
          clausulas: ['Cláusula de teste'],
          valorMensal: 1000,
          renovacaoAutomatica: contrato.renovacaoAutomatica ?? false,
        },
      },
    });
    if (resposta.statusCode !== 201) throw new Error(`Falha ao criar organização: ${resposta.body}`);
    return resposta.json();
  }

  /** Simula a passagem do tempo. */
  public async vencerContrato(organizacaoId: string, diasAtras = 3): Promise<void> {
    await this.prisma.contrato.update({
      where: { organizacaoId },
      data: { dataVencimento: new Date(Date.now() - diasAtras * DIA) },
    });
  }

  public async criarLote(organizacaoId: string) {
    const resposta = await this.requisicao('gestor', {
      method: 'POST',
      url: '/lotes',
      payload: { organizacaoId, notaFiscal: this.novaNotaFiscal(), transportadora: 'Transportadora Teste' },
    });
    if (resposta.statusCode !== 201) throw new Error(`Falha ao criar lote: ${resposta.body}`);
    return resposta.json().lote;
  }

  public async adicionarEquipamentos(loteId: string, quantidade = 2) {
    const equipamentos = Array.from({ length: quantidade }, (_, i) => ({
      tipo: i % 2 === 0 ? 'NOTEBOOK' : 'MONITOR',
      marca: 'Marca Teste',
      modelo: `Modelo ${i + 1}`,
      anoFabricacao: 2021,
      estadoFisico: 'BOM_ESTADO',
      pesoQuilogramas: 2.5,
    }));
    const resposta = await this.requisicao('gestor', { method: 'POST', url: `/lotes/${loteId}/equipamentos`, payload: { equipamentos } });
    if (resposta.statusCode !== 201) throw new Error(`Falha ao adicionar equipamentos: ${resposta.body}`);
    return resposta.json() as { id: string; versao: number; codigoBarrasInterno: string }[];
  }
}
