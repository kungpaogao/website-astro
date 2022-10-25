import { marked } from "marked";

// Override function
const renderer = {
  listitem(text: string, task: boolean, _checked: boolean) {
    if (task && text.includes("<label>")) {
      return (
        "<li class='todo-item'><label>" + text.replace("<label>", "") + "</li>"
      );
    }

    return false;
  },
};

marked.use({ renderer });

export { marked };
