// https://codesandbox.io/s/gallant-archimedes-06imov?file=/src/index.js:216-270
import { marked } from "marked";

// Override function
const renderer = {
  paragraph(text: string) {
    if (text.includes("<input") && text.includes(`type="checkbox"`)) {
      return `<label>${text}</label>`;
    }

    return false;
  },
  listitem(text: string, task: boolean, checked: boolean) {
    if (task) {
      // old logic
      if (!text.includes("<label>")) {
        const liLabel =
          "<li><label>" +
          text.replace(/^<li>([\s\S]*)<\/li>\n$/, "$1") +
          "</label></li>\n";

        return liLabel;
      }
    }

    return false;
  },
};

marked.use({ renderer });

// Run marked
console.log("------------");
console.log(
  marked.parse(`
- [x] task \`test\`
  - [x] subtask
`)
);
