export type ParsedTaskLine = {
  verb: string;
  textoPrincipal: string;
  atividade: string;
  etapa: string;
};

/** Legado: `frase` ou `frase\tatividade\tetapa`. Método (6 cols): PLAN…\tMÉTODO\tetapa\tatividade\tsub\tfrase */
export function parseTaskLine(line: string): ParsedTaskLine | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;

  if (t.includes("\t")) {
    const parts = t.split("\t").map((s) => s.trim());
    if (parts.length >= 6) {
      const phrase = parts[5] ?? "";
      if (!phrase) return null;
      const space = phrase.indexOf(" ");
      const verb = space === -1 ? phrase : phrase.slice(0, space);
      const textoPrincipal = space === -1 ? "" : phrase.slice(space + 1).trim();
      const sub = parts[4] ?? "";
      const atividadeBase = parts[3] ?? "";
      const atividade = sub && sub !== atividadeBase ? `${atividadeBase} · ${sub}` : atividadeBase;
      return { verb, textoPrincipal, atividade, etapa: parts[2] ?? "" };
    }
    const phrase = parts[0] ?? "";
    if (!phrase) return null;
    const space = phrase.indexOf(" ");
    const verb = space === -1 ? phrase : phrase.slice(0, space);
    const textoPrincipal = space === -1 ? "" : phrase.slice(space + 1).trim();
    return {
      verb,
      textoPrincipal,
      atividade: parts[1] ?? "",
      etapa: parts[2] ?? "",
    };
  }

  const space = t.indexOf(" ");
  if (space === -1) return { verb: t, textoPrincipal: "", atividade: "", etapa: "" };
  return { verb: t.slice(0, space), textoPrincipal: t.slice(space + 1).trim(), atividade: "", etapa: "" };
}
