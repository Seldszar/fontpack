const Canvas = require("canvas");
const commander = require("commander");
const crypto = require("crypto");
const fg = require("fast-glob");
const fs = require("fs");
const { MaxRectsPacker } = require("maxrects-packer");
const mem = require("mem");
const path = require("path");
const picomatch = require("picomatch");
const pixelmatch = require("pixelmatch");
const sharp = require("sharp");

function getCanvasBounds(canvas) {
  const { width, height } = canvas;

  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, width, height);

  const bounds = {};

  for (let index = 0; index < imageData.data.length; index += 4) {
    if (imageData.data[index + 3] === 0) {
      continue;
    }

    let x = index / 4 % width;
    let y = Math.floor(index / 4 / width);

    if (bounds.top == null) {
      bounds.top = y;
    }

    if (bounds.left == null) {
      bounds.left = x;
    } else if (x < bounds.left) {
      bounds.left = x;
    }

    if (bounds.right == null) {
      bounds.right = x;
    } else if (bounds.right < x) {
      bounds.right = x;
    }

    if (bounds.bottom == null) {
      bounds.bottom = y;
    } else if (bounds.bottom < y) {
      bounds.bottom = y;
    }
  }

  return bounds;
}

/**
 * @param {Canvas.Canvas} canvas
 * @param {string} value
 */
async function encodeTexture(canvas, value) {
  const format = sharp.format[value.toLowerCase()];

  if (format == null) {
    throw new TypeError("Unsupported output format");
  }

  const buffer = await sharp(canvas.toBuffer())
    .toFormat(format.id, { lossless: true, quality: 100 })
    .toBuffer();

  return buffer;
}

class AtlasTexture {
  static fromFile = mem(async (filePath) => {
    return new AtlasTexture(await Canvas.loadImage(filePath));
  });

  getCanvas = mem(() => {
    const canvas = Canvas.createCanvas(this.width, this.height);
    const context = canvas.getContext("2d");

    context.putImageData(this.imageData, 0, 0);

    return canvas;
  });

  getBuffer = mem(() => {
    const canvas = this.getCanvas();
    const buffer = canvas.toBuffer("image/png", {
      quality: 100,
    });

    return buffer;
  });

  constructor(image) {
    const canvas = Canvas.createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");

    context.drawImage(image, 0, 0);

    const bounds = getCanvasBounds(canvas);

    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;

    const imageData = context.getImageData(bounds.left, bounds.top, width, height);

    this.canvas = canvas;
    this.context = context;

    this.width = width;
    this.height = height;

    const padding = {
      top: bounds.top,
      left: bounds.left,
      right: image.width - bounds.right - 1,
      bottom: image.height - bounds.bottom - 1,
    };

    this.imageData = imageData;
    this.padding = padding;
  }

  equals = mem((input) => {
    const { width, height } = this;

    const left = this.imageData;
    const right = input.imageData;

    let value = Infinity;

    try {
      value = pixelmatch(left.data, right.data, null, width, height, {
        includeAA: true,
        tolerance: 0,
      });
    } catch {}

    return value === 0;
  });
}

function compressAtlas(atlas) {
  const frameSubstitutes = new Map();
  const frames = new Map();

  for (const [key, data] of Object.entries(atlas.frames)) {
    const hash = crypto.createHash("md5")
      .update(JSON.stringify([atlas, data]))
      .digest("hex")
      .slice(0, 10);

    frameSubstitutes.set(key, hash);
    frames.set(hash, data);
  }

  atlas.frames = Object.fromEntries(frames);

  if (atlas.animations) {
    const animations = new Map();

    for (const [key, animationFrames] of Object.entries(atlas.animations)) {
      const result = [];

      animationFrames.forEach((texture) => {
        result.push(frameSubstitutes.get(texture));
      });

      animations.set(key, result);
    }

    atlas.animations = Object.fromEntries(animations);
  }
}

async function main() {
  commander
    .requiredOption("-i, --input <path>", "the input path")
    .requiredOption("-o, --output <path>", "the output path")
    .option("-f, --format <name>", "the texture format", "webp")
    .option("-c, --compress", "indicates if the manifest must be compressed", false)
    .parse();

  const options = commander.opts();

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);

  const manifestPath = path.resolve(inputPath, "manifest.json");

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf-8"),
  );

  const packer = new MaxRectsPacker(4096, 4096, 1, {
    allowRotation: true,
  });

  const textures = new Array();
  const sprites = new Array();

  const imagePaths = await fg(manifest.sources, {
    absolute: true,
    cwd: inputPath,
  });

  for (const imagePath of imagePaths) {
    const texture = await AtlasTexture.fromFile(imagePath);

    if (!textures.some((value) => value.equals(texture))) {
      packer.add(texture.width, texture.height, {
        texture,
      });

      textures.push(texture);
    }

    sprites.push({
      path: path.posix.relative(inputPath.replace(/\\/g, "/"), imagePath),
      padding: texture.padding,
      anchor: [0.5, 0.5],
      texture,
    });
  }

  for (const { path, anchor } of manifest.frames) {
    const isMatch = picomatch(path);

    for (const sprite of sprites) {
      if (!isMatch(sprite.path)) {
        continue;
      }

      sprite.name = sprite.path;
      sprite.anchor = anchor;
    }
  }

  packer.repack(false);

  for (const bin of packer.bins) {
    const canvas = Canvas.createCanvas(bin.width, bin.height);
    const context = canvas.getContext("2d");

    for (const rect of bin.rects) {
      const {
        data: { texture },
      } = rect;

      const originLeft = rect.x + rect.width / 2;
      const originTop = rect.y + rect.height / 2;
      const angle = rect.rot ? Math.PI / 2 : 0;

      context.translate(originLeft, originTop);
      context.rotate(angle);

      context.drawImage(texture.getCanvas(), texture.width / -2, texture.height / -2);

      context.rotate(-angle);
      context.translate(-originLeft, -originTop);
    }

    fs.writeFileSync(`${outputPath}.${options.format}`, await encodeTexture(canvas, options.format));

    const atlas = {
      animations: {},
      frames: {},
      meta: {
        image: `${options.output.replace(/\\/g, "/")}.${options.format}`,
        scale: 1,
      },
    };

    for (const rect of bin.rects) {
      const imageSprites = sprites.filter(({ texture }) => texture.equals(rect.data.texture));

      for (const sprite of imageSprites) {
        const frame = {
          rotated: rect.rot,
          trimed: true,
          frame: {
            x: rect.x,
            y: rect.y,
            w: sprite.texture.width,
            h: sprite.texture.height,
          },
          sourceSize: {
            w: sprite.texture.width + sprite.padding.left + sprite.padding.right,
            h: sprite.texture.height + sprite.padding.top + sprite.padding.bottom,
          },
          spriteSourceSize: {
            x: sprite.padding.left,
            y: sprite.padding.top,
            w: sprite.texture.width,
            h: sprite.texture.height,
          },
          anchor: {
            x: sprite.anchor[0],
            y: sprite.anchor[1],
          },
        };

        atlas.frames[sprite.name] = frame;
      }
    }

    for (const [name, options] of Object.entries(manifest.animations)) {
      const frames = [];

      for (const { path } of options.frames) {
        const isMatch = picomatch(path);

        for (const sprite of sprites) {
          if (!isMatch(sprite.path)) {
            continue;
          }

          frames.push(sprite.name);
        }
      }

      if (frames.length === 0) {
        console.warn(`Animation "${name}" doesn't include any frames`);
      }

      atlas.animations[name] = frames;
    }

    if (options.compress) {
      compressAtlas(atlas);
    }

    fs.writeFileSync(`${outputPath}.json`, JSON.stringify(atlas));
  }
}

main();
