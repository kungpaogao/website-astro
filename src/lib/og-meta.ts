const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#[xX][\da-fA-F]+|\w+);/g, (match, entity) => {
    if (entity.startsWith("#")) {
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Every `<meta>` tag in a document, keyed by its `property` or `name`. */
export function readMetaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();

  for (const [tag] of html.matchAll(META_TAG)) {
    let key: string | undefined;
    let content: string | undefined;

    for (const [, name, quoted, singleQuoted, bare] of tag.matchAll(
      ATTRIBUTE,
    )) {
      const value = quoted ?? singleQuoted ?? bare ?? "";
      const attribute = name.toLowerCase();
      if (attribute === "property" || attribute === "name") key ??= value;
      if (attribute === "content") content = value;
    }

    if (key !== undefined && content !== undefined) {
      tags.set(key, decodeEntities(content));
    }
  }

  return tags;
}
