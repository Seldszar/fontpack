#!/usr/bin/env node

const Canvas = require("canvas");
const commander = require("commander");
const fg = require("fast-glob");
const fs = require("fs");
const { MaxRectsPacker } = require("maxrects-packer");
const path = require("path");
const sharp = require("sharp");

async function main() {
  commander
    .requiredOption("-i, --input <path>", "the input path")
    .requiredOption("-o, --output <path>", "the output path")
    .option("-f, --format <name>", "the texture format", "webp")
    .option("-m, --manifest <path>", "the manifest path", "manifest.json")
    .parse();

  const options = commander.opts();

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const manifestPath = path.resolve(options.input, options.manifest);

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8"),
  );

  const packer = new MaxRectsPacker(4096, 4096, 1);

  const atlas = await Promise.all(
    manifest.map(async (options, index) => {
      const fontData = {
        char: [],
        common: [
          {
            lineHeight: options.lineHeight || options.size,
          },
        ],
        info: [
          {
            face: options.name,
            size: options.size,
          },
        ],
        kerning: [],
        page: [],
      };

      const imagePaths = await fg(options.sources, {
        absolute: true,
        cwd: inputPath,
      });

      for (const imagePath of imagePaths) {
        const image = await Canvas.loadImage(imagePath);

        const { name } = path.parse(imagePath);

        packer.add(image.width, image.height, {
          id: name,
          index,
          image,
        });
      }

      return fontData;
    }),
  );

  packer.repack(false);

  for (const [page, bin] of packer.bins.entries()) {
    const canvas = Canvas.createCanvas(bin.width, bin.height);
    const context = canvas.getContext("2d");

    for (const rect of bin.rects) {
      const {
        data: { id, image, index },
      } = rect;

      atlas[index].char.push({
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        xadvance: image.width + 1,
        xoffset: 0,
        yoffset: 0,
        page,
        id,
      });

      context.drawImage(image, rect.x, rect.y);
    }

    let pageFile = options.output.replace(/\\/g, "/");

    if (packer.bins.length > 1) {
      pageFile += `_${page}`;
    }

    pageFile += `.${options.format}`;

    const buffer = await sharp(canvas.toBuffer())
      .toFormat(options.format, { lossless: true, quality: 100 })
      .toBuffer();

    fs.writeFileSync(pageFile, buffer);

    for (const fontData of atlas) {
      fontData.page.push({
        file: pageFile,
        id: page,
      });
    }
  }

  fs.writeFileSync(`${outputPath}.json`, JSON.stringify(atlas, undefined, 2));
}

main();
