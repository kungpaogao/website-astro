/**
 * Everything is the same as default list item handler except where noted.
 * See default: https://github.com/syntax-tree/mdast-util-to-hast/blob/main/lib/handlers/list-item.js
 */
import type { State } from "mdast-util-to-hast";
import type { ListItem, Parents } from "mdast";
import type { Element, ElementContent, Properties } from "hast";
import clsx from "clsx";

export function accessibleListItem(
  state: State,
  node: ListItem,
  parent: Parents | undefined
): Element {
  const results = state.all(node);
  const loose = parent ? listLoose(parent) : listItemLoose(node);
  const properties: Properties = {};
  const children: Array<ElementContent> = [];

  if (typeof node.checked === "boolean") {
    const head = results[0];
    let paragraph: Element;

    if (head && head.type === "element" && head.tagName === "p") {
      paragraph = head;
    } else {
      paragraph = {
        type: "element",
        tagName: "p",
        properties: {},
        children: [],
      };
      results.unshift(paragraph);
    }

    // begin custom section

    // custom  logic: don't add space between input and label
    const checkbox: Element = {
      type: "element",
      tagName: "input",
      properties: {
        type: "checkbox",
        checked: node.checked,
        disabled: true,
        // custom logic: add additional class for styling
        class: "task-list-item-checkbox",
      },
      children: [],
    };
    paragraph.children.unshift(checkbox);

    // custom logic: handle adding label
    // see: https://codesandbox.io/s/custom-mdast-hast-plugin-yco3dk?file=/src/listitem.js
    const label: Element = {
      type: "element",
      tagName: "label",
      properties: {},
      children: [...paragraph.children],
    };
    paragraph.children = [label];

    // According to github-markdown-css, this class hides bullet.
    // See: <https://github.com/sindresorhus/github-markdown-css>.
    // custom logic: apply done class to for custom styling
    properties.className = clsx(
      "task-list-item",
      node.checked && "task-list-item-done"
    );

    // end custom section
  }

  let index = -1;

  while (++index < results.length) {
    const child = results[index];

    // Add eols before nodes, except if this is a loose, first paragraph.
    if (
      loose ||
      index !== 0 ||
      child.type !== "element" ||
      child.tagName !== "p"
    ) {
      children.push({ type: "text", value: "\n" });
    }

    if (child.type === "element" && child.tagName === "p" && !loose) {
      children.push(...child.children);
    } else {
      children.push(child);
    }
  }

  const tail = results[results.length - 1];

  // Add a final eol.
  if (tail && (loose || tail.type !== "element" || tail.tagName !== "p")) {
    children.push({ type: "text", value: "\n" });
  }

  const result: Element = {
    type: "element",
    tagName: "li",
    properties,
    children,
  };
  state.patch(node, result);
  return state.applyData(node, result);
}

function listLoose(node: Parents): boolean {
  let loose = false;
  if (node.type === "list") {
    loose = node.spread || false;
    const children = node.children;
    let index = -1;

    while (!loose && ++index < children.length) {
      loose = listItemLoose(children[index]);
    }
  }

  return loose;
}

function listItemLoose(node: ListItem): boolean {
  const spread = node.spread;

  return spread === null || spread === undefined
    ? node.children.length > 1
    : spread;
}
