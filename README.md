# Amiga 12-bit Color Converter

Converts images to Amiga OCS/ECS 12-bit color with palette reduction and dithering.

## Installation

```
npm install -g amiga-convert
```

or just run with npx:

```
npx amiga-convert <input> <output> [options]
```

## Usage

```
Usage: amiga-convert <input> <output> [options]

Options:
  --colors <n>         Number of colors in palette (2-4096, default: 32)

  --quant <method>     Color quantization algorithm (default: rgbquant)
                       - rgbquant: Spatial color quantization (fast, best all-round)
                       - wuquant: Xiaolin Wu's algorithm (very fast, good quality)
                       - neuquant: Neural network (slow, poor for small palettes)
                       - median-cut: Classic median cut (fast, decent quality)

  --dither <method>    Dithering algorithm (default: floyd-steinberg)
                       - none: No dithering, nearest color
                       - floyd-steinberg: Error diffusion (best for photos)
                       - atkinson: Error diffusion with lighter touch
                       - ordered: Bayer matrix dithering (retro look)

  --dither-amount <n>  Dithering strength (0.0-1.0+, default: 1.0)
                       Lower values = less dithering, higher = more

  --bayer-size <n>     Bayer matrix size for ordered dithering (2, 4, or 8)
                       Default: 8

Examples:
  amiga-convert photo.jpg output.png --colors 32
  amiga-convert photo.jpg output.png --colors 64 --quant wuquant
  amiga-convert photo.jpg output.png --colors 128 --dither atkinson --dither-amount 0.75
  amiga-convert sprite.png output.png --colors 16 --dither ordered --bayer-size 4
  amiga-convert image.jpg output.png --colors 256 --quant median-cut --dither none
```
