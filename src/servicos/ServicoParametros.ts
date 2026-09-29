import { Equipamento } from '../dominio/Equipamento';
import { ARQUIVOS } from '../persistencia/arquivos';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';

export interface ParametrosGlobais {
  /** Alíquota de imposto, de 0 a 1 (ex.: 0.18 = 18%). */
  aliquotaImposto: number;
  /** Depreciação anual, de 0 a 1 (ex.: 0.2 = 20% ao ano). */
  coeficienteDepreciacao: number;
}

/** Parâmetros globais do sistema, configurados pelo Administrador (FR10). */
export class ServicoParametros {
  private static readonly ID = 'parametros';
  private static readonly PADRAO: ParametrosGlobais = {
    aliquotaImposto: 0,
    coeficienteDepreciacao: Equipamento.COEFICIENTE_PADRAO,
  };

  private repositorio: RepositorioArquivo;

  constructor(repositorio: RepositorioArquivo) {
    this.repositorio = repositorio;
  }

  public obter(): ParametrosGlobais {
    const salvo = this.repositorio.carregarEntidade(ARQUIVOS.PARAMETROS, ServicoParametros.ID);
    return {
      aliquotaImposto: salvo?.aliquotaImposto ?? ServicoParametros.PADRAO.aliquotaImposto,
      coeficienteDepreciacao: salvo?.coeficienteDepreciacao ?? ServicoParametros.PADRAO.coeficienteDepreciacao,
    };
  }

  public definir(novos: Partial<ParametrosGlobais>): void {
    for (const [nome, valor] of Object.entries(novos)) {
      if (valor !== undefined && (!Number.isFinite(valor) || valor < 0 || valor > 1)) {
        throw new Error(`O parâmetro ${nome} deve estar entre 0 e 1.`);
      }
    }
    const atualizados = { ...this.obter(), ...novos };
    this.repositorio.salvarEntidade(ARQUIVOS.PARAMETROS, { id: ServicoParametros.ID, ...atualizados });
  }
}
