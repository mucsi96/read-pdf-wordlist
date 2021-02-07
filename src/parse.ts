import { readFileSync, writeFileSync } from "fs";
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
  file: string;
  startPage: number;
  font: string;
  columns: Column[];
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
  match?: boolean;
};

const config = require(resolve(__dirname, "..", process.argv[2])) as Config;
const output = config.file.replace(/pdf$/, "yaml");
const matchFile =
  config.markLineIfMatchIn &&
  (yaml.parse(
    readFileSync(resolve(__dirname, "..", config.markLineIfMatchIn), "utf-8")
  ) as Word[]);

async function main() {
  const document = await getDocument(config.file).promise;
  const pages = Array(document.numPages - (config.startPage - 1))
    .fill("")
    .map((_element, index) => index + config.startPage);

  let words: Word[] = [];

  for (const page of pages) {
    words = [
      ...words,
      ...processContent(await (await document.getPage(page)).getTextContent()),
    ];
  }

  writeFileSync(output, yaml.stringify(words), "utf-8");
}

function processContent(content: TextContent): Word[] {
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
    .map((items) => {
      return items.reduce((acc, item) => {
        const line = acc.find((i) => i.transform[5] === item.transform[5]);

        if (!line) {
          return [...acc, item];
        }

        line.str = `${line.str.trim()}   ${item.str.trim()}`;

        return acc;
      }, [] as TextItem[]);
    })
    .map((items) => items.sort((a, b) => b.transform[5] - a.transform[5]));

  return sortedItems
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
      const match = matchFile
        ? matchFile.findIndex((item) => item.word === word) !== -1
        : false;
      return {
        word,
        ...(match ? { match } : {}),
        ...(wordForms.length ? { wordForms } : {}),
        ...(examples.length ? { examples } : {}),
      } as Word;
    });
}

main().catch((error) => console.error(error));
