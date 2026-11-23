"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gravarAtomico = gravarAtomico;
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Grava primeiro num arquivo temporário e depois renomeia.
 * Se o programa for interrompido no meio, o arquivo anterior continua íntegro.
 */
function gravarAtomico(caminho, conteudo) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(caminho), { recursive: true });
    const temporario = `${caminho}.tmp`;
    (0, fs_1.writeFileSync)(temporario, conteudo, 'utf8');
    (0, fs_1.renameSync)(temporario, caminho);
}
