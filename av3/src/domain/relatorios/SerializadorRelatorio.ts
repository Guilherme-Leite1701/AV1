import { FormatoRelatorio, TipoRelatorioAssincrono } from '../enums/TarefaRelatorio';

export type ValorCelula = string | number | boolean | Date | null | undefined;
export type LinhaRelatorio = Record<string, ValorCelula>;

/** Arquivo pronto para download. */
export interface ArquivoRelatorio {
  conteudo: string;
  nomeArquivo: string;
  tipoConteudo: string;
  tamanhoBytes: number;
}

/** Converte as linhas de um relatório em JSON ou CSV (RFC 4180, UTF-8, separador vírgula). */
export class SerializadorRelatorio {
  /** Gera o arquivo no formato pedido; as colunas do CSV seguem a ordem da primeira linha. */
  public static serializar(
    linhas: readonly LinhaRelatorio[],
    meta: { tipo: TipoRelatorioAssincrono; formato: FormatoRelatorio; geradoEm: Date; organizacaoId: string | null; tarefaId: string },
  ): ArquivoRelatorio {
    const base = `greencode-${meta.tipo.toLowerCase().replace(/_/g, '-')}-${meta.tarefaId.slice(0, 8)}`;
    if (meta.formato === FormatoRelatorio.CSV) {
      const conteudo = SerializadorRelatorio.paraCsv(linhas);
      return { conteudo, nomeArquivo: `${base}.csv`, tipoConteudo: 'text/csv; charset=utf-8', tamanhoBytes: Buffer.byteLength(conteudo) };
    }
    const conteudo = JSON.stringify(
      { tipo: meta.tipo, geradoEm: meta.geradoEm, organizacaoId: meta.organizacaoId, totalRegistros: linhas.length, registros: linhas },
      null,
      2,
    );
    return {
      conteudo,
      nomeArquivo: `${base}.json`,
      tipoConteudo: 'application/json; charset=utf-8',
      tamanhoBytes: Buffer.byteLength(conteudo),
    };
  }

  /** CSV com cabeçalho; aspas duplicadas e campos com vírgula/quebra de linha entre aspas. */
  public static paraCsv(linhas: readonly LinhaRelatorio[]): string {
    if (linhas.length === 0) return '';
    const colunas = Object.keys(linhas[0]);
    const corpo = linhas.map((linha) => colunas.map((c) => SerializadorRelatorio.celula(linha[c])).join(','));
    return [colunas.join(','), ...corpo].join('\r\n') + '\r\n';
  }

  /** Escapa uma célula; também neutraliza fórmulas (=, +, -, @) contra CSV injection no Excel. */
  public static celula(valor: ValorCelula): string {
    if (valor === null || valor === undefined) return '';
    let texto = valor instanceof Date ? valor.toISOString() : String(valor);
    if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
    return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  }
}
