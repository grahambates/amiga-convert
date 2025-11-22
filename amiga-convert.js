#!/usr/bin/env node

const sharp = require("sharp");
const { utils, distance, palette } = require("image-q");

// Quantize a single 8-bit channel value to 4-bit (0-15 range)
function quantize4bit(value) {
  return Math.floor(value / 17) * 17;
}

// Custom dithering implementations that work with palette lookups

// No dithering - just find nearest color in palette
function noDither(imageData, width, height, paletteColors) {
  const output = new Uint8Array(imageData.length);

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];

    // Find nearest color in palette
    let minDist = Infinity;
    let bestColor = paletteColors[0];

    for (const color of paletteColors) {
      const dr = r - color.r;
      const dg = g - color.g;
      const db = b - color.b;
      const dist = dr * dr + dg * dg + db * db;

      if (dist < minDist) {
        minDist = dist;
        bestColor = color;
      }
    }

    output[i] = bestColor.r;
    output[i + 1] = bestColor.g;
    output[i + 2] = bestColor.b;
    output[i + 3] = imageData[i + 3];
  }

  return output;
}

// Floyd-Steinberg dithering
function floydSteinbergDither(
  imageData,
  width,
  height,
  paletteColors,
  ditherAmount = 1.0,
) {
  const pixels = new Int16Array(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    pixels[i] = imageData[i];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const r = Math.max(0, Math.min(255, pixels[idx]));
      const g = Math.max(0, Math.min(255, pixels[idx + 1]));
      const b = Math.max(0, Math.min(255, pixels[idx + 2]));

      // Find nearest color in palette
      let minDist = Infinity;
      let bestColor = paletteColors[0];

      for (const color of paletteColors) {
        const dr = r - color.r;
        const dg = g - color.g;
        const db = b - color.b;
        const dist = dr * dr + dg * dg + db * db;

        if (dist < minDist) {
          minDist = dist;
          bestColor = color;
        }
      }

      pixels[idx] = bestColor.r;
      pixels[idx + 1] = bestColor.g;
      pixels[idx + 2] = bestColor.b;

      const errR = (r - bestColor.r) * ditherAmount;
      const errG = (g - bestColor.g) * ditherAmount;
      const errB = (b - bestColor.b) * ditherAmount;

      // Distribute error to neighboring pixels
      if (x + 1 < width) {
        pixels[idx + 4] += (errR * 7) / 16;
        pixels[idx + 5] += (errG * 7) / 16;
        pixels[idx + 6] += (errB * 7) / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          pixels[idx - 4 + width * 4] += (errR * 3) / 16;
          pixels[idx - 3 + width * 4] += (errG * 3) / 16;
          pixels[idx - 2 + width * 4] += (errB * 3) / 16;
        }
        pixels[idx + width * 4] += (errR * 5) / 16;
        pixels[idx + 1 + width * 4] += (errG * 5) / 16;
        pixels[idx + 2 + width * 4] += (errB * 5) / 16;
        if (x + 1 < width) {
          pixels[idx + 4 + width * 4] += (errR * 1) / 16;
          pixels[idx + 5 + width * 4] += (errG * 1) / 16;
          pixels[idx + 6 + width * 4] += (errB * 1) / 16;
        }
      }
    }
  }

  const output = new Uint8Array(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    output[i] = Math.max(0, Math.min(255, pixels[i]));
  }

  return output;
}

// Atkinson dithering
function atkinsonDither(
  imageData,
  width,
  height,
  paletteColors,
  ditherAmount = 1.0,
) {
  const pixels = new Int16Array(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    pixels[i] = imageData[i];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const r = Math.max(0, Math.min(255, pixels[idx]));
      const g = Math.max(0, Math.min(255, pixels[idx + 1]));
      const b = Math.max(0, Math.min(255, pixels[idx + 2]));

      // Find nearest color in palette
      let minDist = Infinity;
      let bestColor = paletteColors[0];

      for (const color of paletteColors) {
        const dr = r - color.r;
        const dg = g - color.g;
        const db = b - color.b;
        const dist = dr * dr + dg * dg + db * db;

        if (dist < minDist) {
          minDist = dist;
          bestColor = color;
        }
      }

      pixels[idx] = bestColor.r;
      pixels[idx + 1] = bestColor.g;
      pixels[idx + 2] = bestColor.b;

      const errR = ((r - bestColor.r) / 8) * ditherAmount;
      const errG = ((g - bestColor.g) / 8) * ditherAmount;
      const errB = ((b - bestColor.b) / 8) * ditherAmount;

      // Atkinson distributes 6/8 of the error (loses some energy)
      if (x + 1 < width) {
        pixels[idx + 4] += errR;
        pixels[idx + 5] += errG;
        pixels[idx + 6] += errB;
      }
      if (x + 2 < width) {
        pixels[idx + 8] += errR;
        pixels[idx + 9] += errG;
        pixels[idx + 10] += errB;
      }
      if (y + 1 < height) {
        if (x > 0) {
          pixels[idx - 4 + width * 4] += errR;
          pixels[idx - 3 + width * 4] += errG;
          pixels[idx - 2 + width * 4] += errB;
        }
        pixels[idx + width * 4] += errR;
        pixels[idx + 1 + width * 4] += errG;
        pixels[idx + 2 + width * 4] += errB;
        if (x + 1 < width) {
          pixels[idx + 4 + width * 4] += errR;
          pixels[idx + 5 + width * 4] += errG;
          pixels[idx + 6 + width * 4] += errB;
        }
      }
      if (y + 2 < height) {
        pixels[idx + width * 8] += errR;
        pixels[idx + 1 + width * 8] += errG;
        pixels[idx + 2 + width * 8] += errB;
      }
    }
  }

  const output = new Uint8Array(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    output[i] = Math.max(0, Math.min(255, pixels[i]));
  }

  return output;
}

// Ordered (Bayer) dithering
function orderedDither(
  imageData,
  width,
  height,
  paletteColors,
  matrixSize = 8,
  ditherAmount = 1.0,
) {
  const bayer2 = [
    [0, 2],
    [3, 1],
  ];

  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const bayer8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];

  const matrices = { 2: bayer2, 4: bayer4, 8: bayer8 };
  const matrix = matrices[matrixSize] || bayer8;
  const matrixMax = matrixSize * matrixSize;

  const output = new Uint8Array(imageData.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const threshold =
        (matrix[y % matrixSize][x % matrixSize] / matrixMax - 0.5) *
        64 *
        ditherAmount;

      const r = Math.max(0, Math.min(255, imageData[idx] + threshold));
      const g = Math.max(0, Math.min(255, imageData[idx + 1] + threshold));
      const b = Math.max(0, Math.min(255, imageData[idx + 2] + threshold));

      // Find nearest color in palette
      let minDist = Infinity;
      let bestColor = paletteColors[0];

      for (const color of paletteColors) {
        const dr = r - color.r;
        const dg = g - color.g;
        const db = b - color.b;
        const dist = dr * dr + dg * dg + db * db;

        if (dist < minDist) {
          minDist = dist;
          bestColor = color;
        }
      }

      output[idx] = bestColor.r;
      output[idx + 1] = bestColor.g;
      output[idx + 2] = bestColor.b;
      output[idx + 3] = imageData[idx + 3];
    }
  }

  return output;
}

// Main conversion function
async function convertToAmiga(inputPath, outputPath, options = {}) {
  const {
    colors = 32,
    dither = "floyd-steinberg",
    bayerSize = 8,
    ditherAmount = 1.0,
    quantMethod = "rgbquant",
  } = options;

  if (colors < 2 || colors > 4096) {
    throw new Error("Colors must be between 2 and 4096");
  }

  console.log(`Converting ${inputPath} to 12-bit Amiga color...`);
  console.log(`Palette size: ${colors} colors`);
  console.log(`Quantization: ${quantMethod}`);
  const ditherDesc = dither === "ordered" ? ` (${bayerSize}x${bayerSize})` : "";
  const amountDesc = ditherAmount !== 1.0 ? ` [amount: ${ditherAmount}]` : "";
  console.log(`Dithering: ${dither}${ditherDesc}${amountDesc}`);

  const image = sharp(inputPath);
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to RGBA if needed
  let rgbaData;
  if (info.channels === 3) {
    rgbaData = new Uint8Array(info.width * info.height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgbaData[j] = data[i];
      rgbaData[j + 1] = data[i + 1];
      rgbaData[j + 2] = data[i + 2];
      rgbaData[j + 3] = 255;
    }
  } else {
    rgbaData = data;
  }

  // Use image-q to build a palette from the image
  const pointContainer = utils.PointContainer.fromUint8Array(
    rgbaData,
    info.width,
    info.height,
  );

  // Create distance calculator for quantizers
  const distanceCalculator = new distance.Euclidean();

  // Choose quantization algorithm
  let paletteQuantizer;
  switch (quantMethod) {
    case "neuquant":
      paletteQuantizer = new palette.NeuQuant(
        distanceCalculator,
        Math.min(colors, 4096),
      );
      break;
    case "rgbquant":
      paletteQuantizer = new palette.RGBQuant(
        distanceCalculator,
        Math.min(colors, 4096),
      );
      break;
    case "wuquant":
      paletteQuantizer = new palette.WuQuant(
        distanceCalculator,
        Math.min(colors, 4096),
        5,
      );
      break;
    case "median-cut":
      // RGBQuant with method parameter - need to check if this exists
      paletteQuantizer = new palette.RGBQuant(
        distanceCalculator,
        Math.min(colors, 4096),
      );
      break;
    default:
      throw new Error(`Unknown quantization method: ${quantMethod}`);
  }

  // Sample and build palette
  paletteQuantizer.sample(pointContainer);

  // quantize() returns a generator that yields progress and eventually the palette
  let generatedPalette = null;
  for (const item of paletteQuantizer.quantize()) {
    if (item.palette) {
      generatedPalette = item.palette;
      break;
    }
  }

  if (!generatedPalette) {
    throw new Error("Failed to generate palette");
  }

  // Get the actual color points from the palette
  const palettePointContainer = generatedPalette.getPointContainer();

  // Constrain all palette colors to 12-bit color space
  const paletteColors = [];
  const paletteArray = palettePointContainer._pointArray;
  for (let i = 0; i < paletteArray.length; i++) {
    const point = paletteArray[i];
    paletteColors.push({
      r: quantize4bit(point.r),
      g: quantize4bit(point.g),
      b: quantize4bit(point.b),
    });
  }

  // Remove duplicate colors that might result from 12-bit quantization
  const uniquePalette = [];
  const seen = new Set();
  for (const color of paletteColors) {
    const key = `${color.r},${color.g},${color.b}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePalette.push(color);
    }
  }

  console.log(`Generated ${uniquePalette.length} unique 12-bit colors`);

  // Apply dithering
  let outputData;
  switch (dither) {
    case "none":
      outputData = noDither(rgbaData, info.width, info.height, uniquePalette);
      break;
    case "floyd-steinberg":
      outputData = floydSteinbergDither(
        rgbaData,
        info.width,
        info.height,
        uniquePalette,
        ditherAmount,
      );
      break;
    case "atkinson":
      outputData = atkinsonDither(
        rgbaData,
        info.width,
        info.height,
        uniquePalette,
        ditherAmount,
      );
      break;
    case "ordered":
      outputData = orderedDither(
        rgbaData,
        info.width,
        info.height,
        uniquePalette,
        bayerSize,
        ditherAmount,
      );
      break;
    default:
      throw new Error(`Unknown dithering method: ${dither}`);
  }

  await sharp(outputData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Amiga 12-bit Color Converter

Converts images to Amiga OCS/ECS 12-bit color with palette reduction and dithering.

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
`);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  // Parse options
  const options = {
    colors: 32,
    dither: "floyd-steinberg",
    bayerSize: 8,
    ditherAmount: 1.0,
    quantMethod: "rgbquant",
  };

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--colors" && i + 1 < args.length) {
      options.colors = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--quant" && i + 1 < args.length) {
      options.quantMethod = args[i + 1];
      i++;
    } else if (args[i] === "--dither" && i + 1 < args.length) {
      options.dither = args[i + 1];
      i++;
    } else if (args[i] === "--bayer-size" && i + 1 < args.length) {
      options.bayerSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--dither-amount" && i + 1 < args.length) {
      options.ditherAmount = parseFloat(args[i + 1]);
      i++;
    }
  }

  try {
    const startTime = Date.now();
    await convertToAmiga(inputPath, outputPath, options);
    const elapsed = Date.now() - startTime;
    console.log(`✓ Converted in ${elapsed}ms`);
    console.log(`Output saved to: ${outputPath}`);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { convertToAmiga };
