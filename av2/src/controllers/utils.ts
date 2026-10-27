import { ErroValidacao } from '../domain/erros/ErrosAplicacao';
import { textoParaData } from '../domain/utils/datas';
import { Periodo, Relogio, relogioDoSistema } from '../services/tipos';

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Converte texto ISO em Date; datas sem hora viram início (ou fim) do dia. */
export function lerData(texto: string, campo: string, fimDoDia = false): Date {
  const normalizado = SO_DATA.test(texto) ? `${texto}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}` : texto;
  const data = textoParaData(normalizado);
  if (!data) throw new ErroValidacao(`O campo "${campo}" não é uma data válida (use AAAA-MM-DD ou ISO 8601).`);
  return data;
}

export function lerDataOpcional(texto: string | undefined, campo: string): Date | undefined {
  return texto ? lerData(texto, campo) : undefined;
}

/** Padrão: de 1º de janeiro até agora. */
export function lerPeriodo(query: { inicio?: string; fim?: string }, relogio: Relogio = relogioDoSistema): Periodo {
  const agora = relogio();
  const inicio = query.inicio ? lerData(query.inicio, 'inicio') : new Date(agora.getFullYear(), 0, 1);
  const fim = query.fim ? lerData(query.fim, 'fim', true) : agora;
  if (fim.getTime() < inicio.getTime()) throw new ErroValidacao('O fim do período deve ser posterior ao início.');
  return { inicio, fim };
}
