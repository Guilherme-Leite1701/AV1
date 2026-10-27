export abstract class Validador<T> {
  protected mensagemErro = '';

  public abstract validar(objeto: T): boolean;

  public obterMensagemErro(): string {
    return this.mensagemErro;
  }
}
