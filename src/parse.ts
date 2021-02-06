import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { EOL } from "os";
import { resolve } from "path";
import { getDocument } from "pdfjs-dist";
import { TextContent, TextItem } from "pdfjs-dist/types/display/api";

type Column = {
  from: number;
  to: number;
};

type Config = {
  source: string;
  font: string;
  columns: Column[];
  groupWordLimit: number;
  markLineIfMatchIn?: string;
};

const input = resolve(__dirname, "..", process.argv[2]);
const output = input.replace(/pdf$/, "txt");
const config = require(input.replace(/pdf$/, "json")) as Config;
const compareFile =
  config.markLineIfMatchIn &&
  readFileSync(resolve(__dirname, "..", config.markLineIfMatchIn));

async function main() {
  const document = await getDocument(input).promise;
  const pages = Array(document.numPages)
    .fill("")
    .map((_element, index) => index + 1);

  writeFileSync(output, "");

  for (const page of pages) {
    processContent(await (await document.getPage(page)).getTextContent());
  }
}

function processContent(content: TextContent) {
  const items = content.items.filter((item) => item.fontName === config.font);

  const sortedItems = items
    .reduce((acc, item) => {
      const column = config.columns.findIndex(
        ({ from, to }) => from < item.transform[4] && item.transform[4] < to
      );

      if (column === -1) {
        return acc;
      }

      acc[column] = [...(acc[column] ?? []), item];

      return acc;
    }, [] as TextItem[][])
    .map((items) => items.sort((a, b) => b.transform[5] - a.transform[5]));

  sortedItems
    .map((items) =>
      items.reduce((acc, item, index) => {
        const isNewWord =
          index === 0 ||
          items[index - 1].transform[5] - item.transform[5] >
            config.groupWordLimit ||
          (!items[index - 1].str.includes("   ") && item.str.includes("    "));

        return [
          ...acc,
          ...(isNewWord ? [{ str: "" } as TextItem, item] : [item]),
        ];
      }, [] as TextItem[])
    )
    .flatMap((items) => items)
    .map((item) => {
      const example = item.str.includes("    ") && item.str.split(/\s{4,}/)[1];
      const matchFound =
        example && compareFile && compareFile.includes(example);
      appendFileSync(
        output,
        `${matchFound ? ">>>>>>>>>>>>>> " : ""}${item.str}${EOL}`
      );
    });
}

main().catch((error) => console.error(error));
