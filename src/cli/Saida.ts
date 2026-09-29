/** Mensagens da CLI categorizadas por nível de severidade. */
export class Saida {
  private static readonly USAR_COR = Boolean(process.stdout.isTTY);

  public static sucesso(mensagem: string): void {
    console.log(Saida.pintar('32', '[SUCESSO]') + ' ' + mensagem);
  }

  public static info(mensagem: string): void {
    console.log(Saida.pintar('36', '[INFO]') + ' ' + mensagem);
  }

  public static aviso(mensagem: string): void {
    console.log(Saida.pintar('33', '[AVISO]') + ' ' + mensagem);
  }

  public static erro(mensagem: string): void {
    console.log(Saida.pintar('31', '[ERRO]') + ' ' + mensagem);
  }

  /** Cores ANSI (suportadas no Windows 10+ e no Linux); desligadas fora de um terminal. */
  private static pintar(cor: string, texto: string): string {
    return Saida.USAR_COR ? `\x1b[${cor}m${texto}\x1b[0m` : texto;
  }
}
