import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Cifra e decifra conteúdo com AES-256-GCM (NFR03).
 * Formato do texto cifrado (Base64): [IV 12 bytes][tag 16 bytes][dados].
 * A tag de autenticação faz a decifragem falhar se o arquivo for adulterado.
 */
export class CriptografiaArquivo {
  private static readonly ALGORITMO = 'aes-256-gcm';
  private static readonly TAMANHO_IV = 12;
  private static readonly TAMANHO_TAG = 16;

  public cifrar(dados: string, chave: string): string {
    const iv = randomBytes(CriptografiaArquivo.TAMANHO_IV);
    const cifra = createCipheriv(CriptografiaArquivo.ALGORITMO, CriptografiaArquivo.chaveParaBuffer(chave), iv);
    const cifrado = Buffer.concat([cifra.update(dados, 'utf8'), cifra.final()]);
    const tag = cifra.getAuthTag();
    return Buffer.concat([iv, tag, cifrado]).toString('base64');
  }

  public decifrar(dadosCifrados: string, chave: string): string {
    const bruto = Buffer.from(dadosCifrados, 'base64');
    const iv = bruto.subarray(0, CriptografiaArquivo.TAMANHO_IV);
    const tag = bruto.subarray(CriptografiaArquivo.TAMANHO_IV, CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG);
    const cifrado = bruto.subarray(CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG);

    const decifra = createDecipheriv(CriptografiaArquivo.ALGORITMO, CriptografiaArquivo.chaveParaBuffer(chave), iv);
    decifra.setAuthTag(tag);
    try {
      return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8');
    } catch {
      throw new Error('Não foi possível decifrar: chave incorreta ou arquivo corrompido.');
    }
  }

  /** Gera uma chave AES-256 aleatória (32 bytes) em hexadecimal. */
  public gerarChave(): string {
    return randomBytes(32).toString('hex');
  }

  private static chaveParaBuffer(chave: string): Buffer {
    if (!/^[0-9a-fA-F]{64}$/.test(chave)) {
      throw new Error('A chave deve ter 64 caracteres hexadecimais (256 bits).');
    }
    return Buffer.from(chave, 'hex');
  }
}
