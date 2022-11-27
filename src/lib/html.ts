// see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#raw_strings
const html = (strings, ...values) =>
  String.raw({ raw: strings }, ...values).trim();

export { html };
