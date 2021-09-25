# fontpack

> Yet another bitmap font packer

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

Create a `manifest.json` file in the folder containing your fonts [following the JSON Schema](./schema.json), then run `fontpack`.

Here's an example:

```json
[
  {
    "name": "DMD Large",
    "size": 19,
    "sources": [
      "dmd-large/symbols/*"
    ]
  },
  {
    "name": "DMD Medium",
    "size": 10,
    "sources": [
      "dmd-medium/symbols/*"
    ]
  }
]
```

## Author

Alexandre Breteau - [@0xSeldszar](https://twitter.com/0xSeldszar)

## License

MIT © [Alexandre Breteau](https://seldszar.fr)
