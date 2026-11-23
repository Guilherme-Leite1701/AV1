"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Saida = void 0;
/** Mensagens da CLI categorizadas por nível de severidade. */
class Saida {
    static USAR_COR = Boolean(process.stdout.isTTY);
    static sucesso(mensagem) {
        console.log(Saida.pintar('32', '[SUCESSO]') + ' ' + mensagem);
    }
    static info(mensagem) {
        console.log(Saida.pintar('36', '[INFO]') + ' ' + mensagem);
    }
    static aviso(mensagem) {
        console.log(Saida.pintar('33', '[AVISO]') + ' ' + mensagem);
    }
    static erro(mensagem) {
        console.log(Saida.pintar('31', '[ERRO]') + ' ' + mensagem);
    }
    /** Cores ANSI (suportadas no Windows 10+ e no Linux); desligadas fora de um terminal. */
    static pintar(cor, texto) {
        return Saida.USAR_COR ? `\x1b[${cor}m${texto}\x1b[0m` : texto;
    }
}
exports.Saida = Saida;
