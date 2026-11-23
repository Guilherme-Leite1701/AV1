"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriptografiaArquivo = void 0;
const crypto_1 = require("crypto");
/**
 * Cifra e decifra conteúdo com AES-256-GCM (NFR03).
 * Formato do texto cifrado (Base64): [IV 12 bytes][tag 16 bytes][dados].
 * A tag de autenticação faz a decifragem falhar se o arquivo for adulterado.
 */
class CriptografiaArquivo {
    static ALGORITMO = 'aes-256-gcm';
    static TAMANHO_IV = 12;
    static TAMANHO_TAG = 16;
    cifrar(dados, chave) {
        const iv = (0, crypto_1.randomBytes)(CriptografiaArquivo.TAMANHO_IV);
        const cifra = (0, crypto_1.createCipheriv)(CriptografiaArquivo.ALGORITMO, CriptografiaArquivo.chaveParaBuffer(chave), iv);
        const cifrado = Buffer.concat([cifra.update(dados, 'utf8'), cifra.final()]);
        const tag = cifra.getAuthTag();
        return Buffer.concat([iv, tag, cifrado]).toString('base64');
    }
    decifrar(dadosCifrados, chave) {
        const bruto = Buffer.from(dadosCifrados, 'base64');
        const iv = bruto.subarray(0, CriptografiaArquivo.TAMANHO_IV);
        const tag = bruto.subarray(CriptografiaArquivo.TAMANHO_IV, CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG);
        const cifrado = bruto.subarray(CriptografiaArquivo.TAMANHO_IV + CriptografiaArquivo.TAMANHO_TAG);
        const decifra = (0, crypto_1.createDecipheriv)(CriptografiaArquivo.ALGORITMO, CriptografiaArquivo.chaveParaBuffer(chave), iv);
        decifra.setAuthTag(tag);
        try {
            return Buffer.concat([decifra.update(cifrado), decifra.final()]).toString('utf8');
        }
        catch {
            throw new Error('Não foi possível decifrar: chave incorreta ou arquivo corrompido.');
        }
    }
    /** Gera uma chave AES-256 aleatória (32 bytes) em hexadecimal. */
    gerarChave() {
        return (0, crypto_1.randomBytes)(32).toString('hex');
    }
    static chaveParaBuffer(chave) {
        if (!/^[0-9a-fA-F]{64}$/.test(chave)) {
            throw new Error('A chave deve ter 64 caracteres hexadecimais (256 bits).');
        }
        return Buffer.from(chave, 'hex');
    }
}
exports.CriptografiaArquivo = CriptografiaArquivo;
