const TARGET_WIDTH = 1800
const TARGET_HEIGHT = 1200
const NORMALIZED_FILE_MARKER = 'normalizada-v4'

export const VAT_FIELD_REGIONS = Object.freeze({
  name: [{ x: 0.035, y: 0.255, w: 0.925, h: 0.115 }, { x: 0.025, y: 0.225, w: 0.945, h: 0.155 }],
  nit: [{ x: 0.040, y: 0.445, w: 0.555, h: 0.120 }, { x: 0.025, y: 0.420, w: 0.585, h: 0.155 }],
  nrc: [{ x: 0.640, y: 0.435, w: 0.325, h: 0.120 }, { x: 0.610, y: 0.410, w: 0.365, h: 0.155 }],
  activity: [{ x: 0.025, y: 0.625, w: 0.945, h: 0.205 }, { x: 0.018, y: 0.595, w: 0.960, h: 0.255 }],
  address: [{ x: 0.035, y: 0.105, w: 0.920, h: 0.165 }, { x: 0.025, y: 0.080, w: 0.940, h: 0.205 }],
})

export async function splitCombinedVatImageV2(file) {
  if (!file) throw new Error('VAT_IMAGE_REQUIRED')
  const bitmap = await createImageBitmap(file)
  try {
    const orientation = chooseOrientation(bitmap)
    const split = findSeparator(bitmap, orientation)
    const first = orientation === 'horizontal'
      ? { x: 0, y: 0, w: bitmap.width, h: split }
      : { x: 0, y: 0, w: split, h: bitmap.height }
    const second = orientation === 'horizontal'
      ? { x: 0, y: split, w: bitmap.width, h: bitmap.height - split }
      : { x: split, y: 0, w: bitmap.width - split, h: bitmap.height }

    const frontRect = detectCardRectByConnectedEdges(bitmap, first)
    const backRect = detectCardRectByConnectedEdges(bitmap, second)
    const front = normalizeRect(bitmap, frontRect)
    const back = normalizeRect(bitmap, backRect)
    const frontFile = await canvasToFile(front, `tarjeta-iva-frente-${NORMALIZED_FILE_MARKER}.jpg`)
    const backFile = await canvasToFile(back, `tarjeta-iva-reverso-${NORMALIZED_FILE_MARKER}.jpg`)
    releaseCanvas(front)
    releaseCanvas(back)
    return { frontFile, backFile, orientation, normalized: true }
  } finally {
    bitmap.close?.()
  }
}

export async function normalizeVatSide(file) {
  if (!file) throw new Error('VAT_SIDE_REQUIRED')
  const bitmap = await createImageBitmap(file)
  try {
    const full = { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
    if (String(file.name || '').includes(NORMALIZED_FILE_MARKER)) return normalizeRect(bitmap, full)
    return normalizeRect(bitmap, detectCardRectByConnectedEdges(bitmap, full))
  } finally {
    bitmap.close?.()
  }
}

export async function createVatFieldVariants(frontFile, backFile) {
  const front = await normalizeVatSide(frontFile)
  const back = await normalizeVatSide(backFile)
  try {
    return {
      name: VAT_FIELD_REGIONS.name.map((r) => cropRegion(front, r)),
      nit: VAT_FIELD_REGIONS.nit.map((r) => cropRegion(front, r)),
      nrc: VAT_FIELD_REGIONS.nrc.map((r) => cropRegion(front, r)),
      activity: VAT_FIELD_REGIONS.activity.map((r) => cropRegion(front, r)),
      address: VAT_FIELD_REGIONS.address.map((r) => cropRegion(back, r)),
      fullFront: [cloneCanvas(front)],
      fullBack: [cloneCanvas(back)],
    }
  } finally {
    releaseCanvas(front)
    releaseCanvas(back)
  }
}

export function preprocessVatField(source, mode = 'text') {
  const scale = mode === 'digits' ? 1.8 : 1.45
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(source.width * scale))
  output.height = Math.max(1, Math.round(source.height * scale))
  const ctx = output.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, output.width, output.height)
  const image = ctx.getImageData(0, 0, output.width, output.height)

  if (mode === 'digits') {
    const gray = new Uint8Array(output.width * output.height)
    for (let p = 0, i = 0; i < image.data.length; i += 4, p += 1) {
      gray[p] = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    }
    const normalized = localBackgroundNormalize(gray, output.width, output.height, 18)
    const threshold = otsuThreshold(normalized)
    for (let p = 0, i = 0; p < normalized.length; p += 1, i += 4) {
      const value = normalized[p] <= threshold ? 0 : 255
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
    }
    ctx.putImageData(image, 0, 0)
    return output
  }

  const sample = []
  for (let i = 0; i < image.data.length; i += 16) {
    sample.push(Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114))
  }
  sample.sort((a, b) => a - b)
  const low = sample[Math.floor(sample.length * 0.06)] ?? 20
  const high = sample[Math.floor(sample.length * 0.94)] ?? 235
  const span = Math.max(40, high - low)
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    const value = clamp(Math.round((gray - low) * 255 / span), 0, 255)
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value
  }
  ctx.putImageData(image, 0, 0)
  return output
}

// Tarjetas antiguas: separa físicamente cada dígito y reconstruye una línea limpia.
// Esto evita que la marca de agua convierta un 1 en 4 o mezcle dos dígitos vecinos.
export function prepareSegmentedDigitLine(source, expectedCount) {
  if (!source || !expectedCount) return null
  const ctx = source.getContext('2d', { willReadFrequently: true })
  const image = ctx.getImageData(0, 0, source.width, source.height)
  const gray = new Uint8Array(source.width * source.height)
  const samples = []
  for (let p = 0, i = 0; i < image.data.length; i += 4, p += 1) {
    const value = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    gray[p] = value
    if (p % 4 === 0) samples.push(value)
  }
  samples.sort((a, b) => a - b)
  const black = samples[Math.floor(samples.length * 0.02)] ?? 0
  const white = samples[Math.floor(samples.length * 0.92)] ?? 230
  const span = Math.max(80, white - black)
  const normalized = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) normalized[i] = clamp(Math.round((gray[i] - black) * 255 / span), 0, 255)

  const thresholds = [45, 55, 65, 75, 85, 100]
  for (const threshold of thresholds) {
    const segmented = connectedComponents(normalized, source.width, source.height, threshold)
      .filter((c) => c.h > source.height * 0.25 && c.h < source.height * 0.95 && c.area > 8 && c.w < source.width * 0.18)
      .sort((a, b) => a.x - b.x)

    if (segmented.length !== expectedCount) continue
    const maxHeight = Math.max(...segmented.map((c) => c.h))
    const glyphPadding = 16
    const gap = 14
    const width = segmented.reduce((total, c) => total + c.w + glyphPadding * 2, 0) + gap * (segmented.length - 1)
    const height = maxHeight + glyphPadding * 2
    const output = document.createElement('canvas')
    output.width = Math.max(1, width)
    output.height = Math.max(1, height)
    const out = output.getContext('2d')
    out.fillStyle = '#fff'
    out.fillRect(0, 0, output.width, output.height)
    out.fillStyle = '#000'

    let cursor = 0
    for (const component of segmented) {
      const yOffset = Math.floor((height - component.h) / 2)
      for (const pixel of component.pixels) {
        const px = pixel % source.width
        const py = Math.floor(pixel / source.width)
        out.fillRect(cursor + glyphPadding + (px - component.x), yOffset + (py - component.y), 1, 1)
      }
      cursor += component.w + glyphPadding * 2 + gap
    }
    return output
  }
  return null
}

function connectedComponents(gray, width, height, threshold) {
  const visited = new Uint8Array(gray.length)
  const queue = new Int32Array(gray.length)
  const components = []
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]

  for (let start = 0; start < gray.length; start += 1) {
    if (visited[start] || gray[start] >= threshold) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    const pixels = []

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      pixels.push(index)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      for (const [dx, dy] of neighbors) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (visited[next] || gray[next] >= threshold) continue
        visited[next] = 1
        queue[tail++] = next
      }
    }

    components.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area: pixels.length, pixels })
  }
  return components
}

function localBackgroundNormalize(gray, width, height, radius) {
  const stride = width + 1
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y += 1) {
    let row = 0
    for (let x = 1; x <= width; x += 1) {
      row += gray[(y - 1) * width + x - 1]
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row
    }
  }
  const out = new Uint8Array(gray.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius)
      const y0 = Math.max(0, y - radius)
      const x1 = Math.min(width - 1, x + radius)
      const y1 = Math.min(height - 1, y + radius)
      const a = integral[y0 * stride + x0]
      const b = integral[y0 * stride + x1 + 1]
      const c = integral[(y1 + 1) * stride + x0]
      const d = integral[(y1 + 1) * stride + x1 + 1]
      const mean = (d - b - c + a) / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1))
      out[y * width + x] = clamp(Math.round(gray[y * width + x] * 255 / Math.max(45, mean)), 0, 255)
    }
  }
  return out
}

function otsuThreshold(values) {
  const hist = new Uint32Array(256)
  for (const value of values) hist[value] += 1
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let max = -1
  let threshold = 128
  for (let i = 0; i < 256; i += 1) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > max) {
      max = between
      threshold = i
    }
  }
  return threshold
}

export function releaseVatFieldVariants(variants = {}) {
  Object.values(variants).flat().forEach(releaseCanvas)
}

function chooseOrientation(bitmap) {
  if (bitmap.height >= bitmap.width * 1.12) return 'horizontal'
  if (bitmap.width >= bitmap.height * 1.12) return 'vertical'
  return bitmap.height >= bitmap.width ? 'horizontal' : 'vertical'
}

function findSeparator(bitmap, orientation) {
  const sample = drawSample(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, 700)
  try {
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    const image = ctx.getImageData(0, 0, sample.width, sample.height)
    const bg = estimateBackground(image)
    const horizontal = orientation === 'horizontal'
    const length = horizontal ? sample.height : sample.width
    const cross = horizontal ? sample.width : sample.height
    let best = Math.round(length / 2)
    let bestScore = Infinity
    for (let p = Math.round(length * 0.30); p <= Math.round(length * 0.70); p += 1) {
      let foreground = 0
      let count = 0
      for (let c = 0; c < cross; c += 4) {
        const x = horizontal ? c : p
        const y = horizontal ? p : c
        const i = (y * sample.width + x) * 4
        if (colorDistance(image.data, i, bg) > 22) foreground += 1
        count += 1
      }
      const score = foreground / Math.max(1, count) + Math.abs(p - length / 2) / length * 0.03
      if (score < bestScore) {
        bestScore = score
        best = p
      }
    }
    const original = horizontal ? bitmap.height : bitmap.width
    return clamp(Math.round(best / length * original), Math.round(original * 0.28), Math.round(original * 0.72))
  } finally {
    releaseCanvas(sample)
  }
}

// Detector v4: construye componentes conectados sobre bordes dilatados y selecciona
// la gran región rectangular de la tarjeta. No depende del color del fondo ni de líneas internas.
function detectCardRectByConnectedEdges(bitmap, rect) {
  const sample = drawSample(bitmap, rect, 900)
  try {
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    const image = ctx.getImageData(0, 0, sample.width, sample.height)
    const gray = new Uint8Array(sample.width * sample.height)
    for (let y = 0; y < sample.height; y += 1) {
      for (let x = 0; x < sample.width; x += 1) {
        const i = (y * sample.width + x) * 4
        gray[y * sample.width + x] = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
      }
    }

    const edge = new Uint8Array(gray.length)
    for (let y = 2; y < sample.height - 2; y += 1) {
      for (let x = 2; x < sample.width - 2; x += 1) {
        const gx = Math.abs(gray[y * sample.width + x + 2] - gray[y * sample.width + x - 2])
        const gy = Math.abs(gray[(y + 2) * sample.width + x] - gray[(y - 2) * sample.width + x])
        if (gx + gy > 55) edge[y * sample.width + x] = 1
      }
    }

    const dilated = dilateBinary(edge, sample.width, sample.height, 4, 2)
    const components = binaryComponents(dilated, sample.width, sample.height)
      .filter((c) => c.w > sample.width * 0.35 && c.h > sample.height * 0.25)
      .filter((c) => {
        const ratio = c.w / Math.max(1, c.h)
        return ratio >= 1.10 && ratio <= 2.05
      })
      .sort((a, b) => b.area - a.area)

    const card = components[0]
    if (!card) return rect
    const sx = rect.w / sample.width
    const sy = rect.h / sample.height
    const marginX = card.w * 0.012
    const marginY = card.h * 0.015
    const left = clamp(card.x - marginX, 0, sample.width - 2)
    const top = clamp(card.y - marginY, 0, sample.height - 2)
    const right = clamp(card.x + card.w + marginX, left + 2, sample.width)
    const bottom = clamp(card.y + card.h + marginY, top + 2, sample.height)
    return {
      x: rect.x + left * sx,
      y: rect.y + top * sy,
      w: (right - left) * sx,
      h: (bottom - top) * sy,
    }
  } finally {
    releaseCanvas(sample)
  }
}

function dilateBinary(source, width, height, radius, iterations) {
  let current = source
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let active = 0
        for (let dy = -radius; dy <= radius && !active; dy += 1) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            if (current[ny * width + nx]) {
              active = 1
              break
            }
          }
        }
        next[y * width + x] = active
      }
    }
    current = next
  }
  return current
}

function binaryComponents(binary, width, height) {
  const visited = new Uint8Array(binary.length)
  const queue = new Int32Array(binary.length)
  const result = []
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue
    let head = 0
    let tail = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let area = 0
    queue[tail++] = start
    visited[start] = 1
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      area += 1
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (const [dx, dy] of neighbors) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (!binary[next] || visited[next]) continue
        visited[next] = 1
        queue[tail++] = next
      }
    }
    result.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area })
  }
  return result
}

function estimateBackground(image) {
  const { width, height, data } = image
  const pw = Math.max(8, Math.round(width * 0.07))
  const ph = Math.max(8, Math.round(height * 0.07))
  const starts = [[0, 0], [width - pw, 0], [0, height - ph], [width - pw, height - ph]]
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  starts.forEach(([sx, sy]) => {
    for (let y = sy; y < sy + ph; y += 3) {
      for (let x = sx; x < sx + pw; x += 3) {
        const i = (y * width + x) * 4
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        n += 1
      }
    }
  })
  return [r / Math.max(1, n), g / Math.max(1, n), b / Math.max(1, n)]
}

function colorDistance(data, i, bg) {
  const dr = data[i] - bg[0]
  const dg = data[i + 1] - bg[1]
  const db = data[i + 2] - bg[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function drawSample(bitmap, rect, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(rect.w, rect.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.w * scale))
  canvas.height = Math.max(1, Math.round(rect.h * scale))
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
  return canvas
}

function normalizeRect(bitmap, rect) {
  const canvas = document.createElement('canvas')
  canvas.width = TARGET_WIDTH
  canvas.height = TARGET_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, TARGET_WIDTH, TARGET_HEIGHT)
  return canvas
}

function cropRegion(source, region) {
  const sx = Math.round(source.width * region.x)
  const sy = Math.round(source.height * region.y)
  const sw = Math.max(1, Math.round(source.width * region.w))
  const sh = Math.max(1, Math.round(source.height * region.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1000, sw * 2)
  canvas.height = Math.max(220, Math.round(canvas.width * sh / sw))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

function cloneCanvas(source) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  canvas.getContext('2d').drawImage(source, 0, 0)
  return canvas
}

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('No se pudo generar el recorte de Tarjeta IVA.'))
    resolve(new File([blob], name, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.97))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function releaseCanvas(canvas) {
  if (canvas) {
    canvas.width = 1
    canvas.height = 1
  }
}
