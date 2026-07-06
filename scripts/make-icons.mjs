import sharp from 'sharp'

const LOGO = 'logo.png'

// BFS flood fill — returns Set of flat pixel indices belonging to the connected dark region
function floodFill(data, width, height, seedX, seedY, luminanceThreshold = 128) {
  const visited = new Uint8Array(width * height)
  const stack = [seedY * width + seedX]
  const region = new Set()

  while (stack.length > 0) {
    const idx = stack.pop()
    if (visited[idx]) continue
    visited[idx] = 1

    const base = idx * 4
    const lum = 0.299 * data[base] + 0.587 * data[base + 1] + 0.114 * data[base + 2]
    if (lum > luminanceThreshold) continue

    region.add(idx)
    const x = idx % width
    const y = Math.floor(idx / width)
    if (x > 0)         stack.push(idx - 1)
    if (x < width - 1) stack.push(idx + 1)
    if (y > 0)         stack.push(idx - width)
    if (y < height - 1) stack.push(idx + width)
  }

  return region
}

async function getTransparentBuffer() {
  const { data, info } = await sharp(LOGO)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info

  // Seed point at approximate center of the play triangle
  const seedX = Math.floor(width * 0.50)
  const seedY = Math.floor(height * 0.60)
  const trianglePixels = floodFill(data, width, height, seedX, seedY)

  const output = Buffer.allocUnsafe(width * height * 4)

  for (let i = 0; i < width * height; i++) {
    const base = i * 4
    const lum = 0.299 * data[base] + 0.587 * data[base + 1] + 0.114 * data[base + 2]

    let alpha
    if (lum >= 210)      alpha = 0
    else if (lum <= 80)  alpha = 255
    else                 alpha = Math.round(255 * (1 - (lum - 80) / (210 - 80)))

    if (trianglePixels.has(i)) {
      output[base]     = 34   // green  (#22c55e — Tailwind green-500)
      output[base + 1] = 197
      output[base + 2] = 94
    } else {
      output[base]     = 100  // gray
      output[base + 1] = 100
      output[base + 2] = 100
    }
    output[base + 3] = alpha
  }

  return { buffer: output, width, height }
}

async function main() {
  const { buffer, width, height } = await getTransparentBuffer()

  const outputs = [
    { size: 32,  path: 'packages/web/public/favicon.png' },
    { size: 192, path: 'packages/web/public/logo192.png' },
    { size: 512, path: 'packages/web/public/logo512.png' },
  ]

  for (const { size, path } of outputs) {
    await sharp(buffer, { raw: { width, height, channels: 4 } })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path)
    console.log(`generated ${path}`)
  }
}

main().catch(console.error)
