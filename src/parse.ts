import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { EOL } from "os";
import { resolve } from "path";
import { getDocument } from "pdfjs-dist";
import { TextContent, TextItem } from "pdfjs-dist/types/display/api";
import yaml from "yaml";

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

type WordParts = {
  wordPart: string;
  examplePart: string;
};

type Word = {
  word: string;
  wordForms: string[];
  examples: string[];
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
    .flatMap((items) => items)
    .reduce((acc, item) => {
      const [wordPart = "", examplePart = ""] = item.str.split(/\s{3,}/);
      const prevWord = acc[acc.length - 1];
      const continuePrevWord =
        prevWord &&
        (prevWord.wordPart.match(/,$/) ||
          !prevWord.examplePart.match(/[.!?]$/) ||
          !wordPart ||
          !examplePart);

      if (continuePrevWord) {
        prevWord.wordPart += wordPart.trim();
        prevWord.examplePart += examplePart.trim();

        return acc;
      }

      return [
        ...acc,
        {
          wordPart: wordPart.trim(),
          examplePart: examplePart.trim(),
        },
      ];
    }, [] as WordParts[])
    .map(({ wordPart, examplePart }) => {
      const [word, ...wordForms] = wordPart
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const examples = examplePart
        .replace(/[.!?]/g, "$&@@@")
        .split("@@@")
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        word,
        ...(wordForms.length ? { wordForms } : {}),
        ...(examples.length ? { examples } : {}),
      } as Word;
    })
    .forEach((word) => {
      appendFileSync(output, `${yaml.stringify(word)}${EOL}`);
    });
}

main().catch((error) => console.error(error));
