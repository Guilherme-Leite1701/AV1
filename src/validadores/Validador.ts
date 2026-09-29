/**
 * Classe base abstrata dos validadores de regra de negócio.
 * Cada subclasse implementa `validar` para o seu tipo de dado e,
 * em caso de falha, preenche `mensagemErro`.
 */
export abstract class Validador {
  protected mensagemErro: string = '';

  public abstract validar(objeto: any): boolean;

  public obterMensagemErro(): string {
    return this.mensagemErro;
  }
}
