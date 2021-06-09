# spitepack

> Yet another spritesheet packer

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Author](#author)
- [License](#license)

# Install

```bash
$ npm install spitepack
```

# Usage

Create a `manifest.json` file in the folder containing your sprites [following the JSON Schema](./schema.json), then run `spritepack`.

Here's an example:

```json
{
  "sources": [
    "**/*.{gif,jpg,png,svg}"
  ],
  "frames": [
    {
      "path": "**",
      "anchor": [0.5, 1]
    }
  ],
  "animations": {
    "clap": {
      "frames": [
        {
          "path": "clap/*"
        }
      ]
    },
    "idle": {
      "frames": [
        {
          "path": "idle/*"
        }
      ]
    },
    "jump": {
      "frames": [
        {
          "path": "jump-prepare/*"
        },
        {
          "path": "jump/*"
        },
        {
          "path": "jump-land/*"
        }
      ]
    }
  }
}
```

## Author

Alexandre Breteau - [@0xSeldszar](https://twitter.com/0xSeldszar)

## License

MIT © [Alexandre Breteau](https://seldszar.fr)
