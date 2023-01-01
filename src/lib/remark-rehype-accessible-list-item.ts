/**
 * Everything is the same as default list item handler except where noted.
 * See default: https://github.com/syntax-tree/mdast-util-to-hast/blob/main/lib/handlers/list-item.js
 */
import { u } from "unist-builder";
import { all } from "mdast-util-to-hast";
import type { H } from "mdast-util-to-hast";
import type { List, ListItem } from "mdast";
import type { Element, ElementContent, Properties } from "hast";
import clsx from "clsx";

export function accessibleListItem(h: H, node: ListItem, parent: List) {
  const result = all(h, node);
  const loose = parent ? listLoose(parent) : listItemLoose(node);
  const props: Properties = {};
  const wrapped: Array<ElementContent> = [];

  if (typeof node.checked === "boolean") {
    let paragraph: Element;

    if (
      result[0] &&
      result[0].type === "element" &&
      result[0].tagName === "p"
    ) {
      paragraph = result[0];
    } else {
      paragraph = h(null, "p", []);
      result.unshift(paragraph);
    }

    // custom  logic: don't add space between input and label

    paragraph.children.unshift(
      h(null, "input", {
        type: "checkbox",
        checked: node.checked,
        disabled: true,
        // custom logic: add additional class for styling
        class: "task-list-item-checkbox",
      })
    );

    // custom logic: handle adding label
    // see: https://codesandbox.io/s/custom-mdast-hast-plugin-yco3dk?file=/src/listitem.js
    paragraph.children = [h(null, "label", {}, [...paragraph.children])];

    // According to github-markdown-css, this class hides bullet.
    // See: <https://github.com/sindresorhus/github-markdown-css>.
    // custom logic: apply done class to for custom styling
    props.className = clsx(
      "task-list-item",
      node.checked && "task-list-item-done"
    );
  }

  let index = -1;

  while (++index < result.length) {
    const child = result[index];

    // Add eols before nodes, except if this is a loose, first paragraph.
    if (
      loose ||
      index !== 0 ||
      child.type !== "element" ||
      child.tagName !== "p"
    ) {
      wrapped.push(u("text", "\n"));
    }

    if (child.type === "element" && child.tagName === "p" && !loose) {
      wrapped.push(...child.children);
    } else {
      wrapped.push(child);
    }
  }

  const tail = result[result.length - 1];

  // Add a final eol.
  if (tail && (loose || !("tagName" in tail) || tail.tagName !== "p")) {
    wrapped.push(u("text", "\n"));
  }

  return h(node, "li", props, wrapped);
}

function listLoose(node: List): boolean {
  let loose = node.spread;
  const children = node.children;
  let index = -1;

  while (!loose && ++index < children.length) {
    loose = listItemLoose(children[index]);
  }

  return Boolean(loose);
}

function listItemLoose(node: ListItem): boolean {
  const spread = node.spread;

  return spread === undefined || spread === null
    ? node.children.length > 1
    : spread;
}
