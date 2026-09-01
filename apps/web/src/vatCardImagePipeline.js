const TARGET_WIDTH = 1800
const TARGET_HEIGHT = 1280
const SAMPLE_MAX_SIDE = 900
const CARD_DISTANCE_THRESHOLD = 25
const SPLIT_DISTANCE_THRESHOLD = 18

// Las regiones se aplican únicamente DESPUÉS de normalizar el rectángulo real de la tarjeta.
// Coordenadas relativas a una tarjeta 1800x1280, no a la fotografía original.
export const VAT_FIELD_REGIONS = Object.freeze({
  name: [
    { x: 0.02, y: 0.14, w: 0.96, h: 0.20 },
    { x: 0.02, y: 0.11, w: 0.96, h: 0.27 },
  ],
  nit: [
    { x: 0.02, y: 0.33, w: 0.59, h: 0.15 },
    { x: 0.01, y: 0.29, w: 0.64, h: 0.22 },
  ],
  nrc: [
    { x: 0.57, y: 0.33, w: 0.41, h: 0.15 },
    { x: 0.53, y: 0.29, w: 0.46, h: 0.22 },
  ],
  activity: [
    { x: 0.02, y: 0.46, w: 0.96, h: 0.23 },
    { x: 0.01, y: 0.42, w: 0.98, h: 0.32 },
  ],
  address: [
    { x: 0.02, y: 0.03, w: 0.96, h: 0.24 },
    { x: 0.01, y: 0.01, w: 0.98, h: 0.31 },
  ],
})

export async function splitCombinedVatImageV2(file) {
  if (!file) throw new Error('VAT_IMAGE_REQUIRED')
  const bitmap = await createImageBitmap(file)
  try {
    const orientation = chooseOrientation(bitmap)
    const split = findBackgroundSeparator(bitmap, orientation)
    const firstRect = orientation === 'horizontal'
      ? { x: 0, y: 0, w: bitmap.width, h: split }
      : { x: 0, y: 0, w: split, h: bitmap.height }
    const secondRect = orientation === 'horizontal'
      ? { x: 0, y: split, w: bitmap.width, h: bitmap.height - split }
      : { x: split, y: 0, w: bitmap.width - split, h: bitmap.height }

    const frontRect = detectCardRect(bitmap, firstRect)
    const backRect = detectCardRect(bitmap, secondRect)
    const frontCanvas = normalizeRect(bitmap, frontRect)
    const backCanvas = normalizeRect(bitmap, backRect)
    const frontFile = await canvasToFile(frontCanvas, 'tarjeta-iva-frente-v2.jpg')
    const backFile = await canvasToFile(backCanvas, 'tarjeta-iva-reverso-v2.jpg')
    releaseCanvas(frontCanvas)
    releaseCanvas(backCanvas)
    return { frontFile, backFile, orientation, normalized: true }
  } finally {
    bitmap.close?.()
  }
}

export async function normalizeVatSide(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const full = { x: 0, y: 0, w: bitmap.width, h: bitmap.height }
    return normalizeRect(bitmap, detectCardRect(bitmap, full))
  } finally {
    bitmap.close?.()
  }
}

export async function createVatFieldVariants(frontFile, backFile) {
  const front = await normalizeVatSide(frontFile)
  const back = await normalizeVatSide(backFile)
  try {
    return {
      name: VAT_FIELD_REGIONS.name.map((region) => cropRegion(front, region)),
      nit: VAT_FIELD_REGIONS.nit.map((region) => cropRegion(front, region)),
      nrc: VAT_FIELD_REGIONS.nrc.map((region) => cropRegion(front, region)),
      activity: VAT_FIELD_REGIONS.activity.map((region) => cropRegion(front, region)),
      address: VAT_FIELD_REGIONS.address.map((region) => cropRegion(back, region)),
    }
  } finally {
    releaseCanvas(front)
    releaseCanvas(back)
  }
}

export function preprocessVatField(canvas, mode = 'text') {
  const output = document.createElement('canvas')
  output.width = canvas.width
  output.height = canvas.height
  const ctx = output.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0)
  const image = ctx.getImageData(0, 0, output.width, output.height)
  const threshold = mode === 'digits' ? 174 : 164
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    const value = gray < threshold ? Math.max(0, gray - 58) : Math.min(255, gray + 42)
    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value
  }
  ctx.putImageData(image, 0, 0)
  return output
}

export function releaseVatFieldVariants(variants = {}) {
  Object.values(variants).flat().forEach(releaseCanvas)
}

function chooseOrientation(bitmap) {
  if (bitmap.height >= bitmap.width * 1.18) return 'horizontal'
  if (bitmap.width >= bitmap.height * 1.18) return 'vertical'
  return bitmap.height >= bitmap.width ? 'horizontal' : 'vertical'
}

// Busca el espacio real entre ambas tarjetas comparando cada píxel con el color del fondo.
// No depende de que el fondo sea blanco: funciona con fondos blancos, grises o crema.
function findBackgroundSeparator(bitmap, orientation) {
  const sample = drawSample(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, 800)
  try {
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    const image = ctx.getImageData(0, 0, sample.width, sample.height)
    const bg = estimateBackground(image)
    const horizontal = orientation === 'horizontal'
    const length = horizontal ? sample.height : sample.width
    const cross = horizontal ? sample.width : sample.height
    const profile = new Array(length).fill(0)

    for (let p = 0; p < length; p += 1) {
      let foreground = 0
      let count = 0
      for (let c = 0; c < cross; c += 3) {
        const x = horizontal ? c : p
        const y = horizontal ? p : c
        const i = (y * sample.width + x) * 4
        if (colorDistance(image.data, i, bg) > SPLIT_DISTANCE_THRESHOLD) foreground += 1
        count += 1
      }
      profile[p] = count ? foreground / count : 1
    }

    const smoothed = movingAverage(profile, 17)
    const start = Math.round(length * 0.30)
    const end = Math.round(length * 0.70)
    let best = Math.round(length / 2)
    let bestScore = Infinity
    for (let p = start; p <= end; p += 1) {
      const centerPenalty = Math.abs(p - length / 2) / length * 0.025
      const score = smoothed[p] + centerPenalty
      if (score < bestScore) { bestScore = score; best = p }
    }

    const originalLength = horizontal ? bitmap.height : bitmap.width
    return clamp(Math.round(best / length * originalLength), Math.round(originalLength * 0.25), Math.round(originalLength * 0.75))
  } finally {
    releaseCanvas(sample)
  }
}

// Encuentra el rectángulo físico de la tarjeta dentro de una foto/mitad.
// El fondo se estima desde las esquinas y se detecta la gran región cuyo color difiere de ese fondo.
function detectCardRect(bitmap, rect) {
  const sample = drawSample(bitmap, rect, SAMPLE_MAX_SIDE)
  try {
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    const image = ctx.getImageData(0, 0, sample.width, sample.height)
    const bg = estimateBackground(image)
    const row = new Array(sample.height).fill(0)
    const col = new Array(sample.width).fill(0)

    for (let y = 0; y < sample.height; y += 2) {
      let rowHits = 0
      for (let x = 0; x < sample.width; x += 2) {
        const i = (y * sample.width + x) * 4
        if (colorDistance(image.data, i, bg) > CARD_DISTANCE_THRESHOLD) {
          rowHits += 1
          col[x] += 1
        }
      }
      row[y] = rowHits / Math.max(1, Math.ceil(sample.width / 2))
    }

    // Completar columnas no muestreadas y convertir a proporción.
    for (let x = 0; x < sample.width; x += 2) {
      const value = col[x] / Math.max(1, Math.ceil(sample.height / 2))
      col[x] = value
      if (x + 1 < sample.width) col[x + 1] = value
    }
    for (let y = 0; y < sample.height; y += 2) {
      if (y + 1 < sample.height) row[y + 1] = row[y]
    }

    const rows = movingAverage(row, 9)
    const cols = movingAverage(col, 9)
    const yBand = activeBand(rows, 0.10)
    const xBand = activeBand(cols, 0.10)
    if (!xBand || !yBand) return rect

    const detectedWidth = xBand[1] - xBand[0]
    const detectedHeight = yBand[1] - yBand[0]
    if (detectedWidth < sample.width * 0.35 || detectedHeight < sample.height * 0.30) return rect

    const sx = rect.w / sample.width
    const sy = rect.h / sample.height
    const marginX = Math.round(sample.width * 0.012)
    const marginY = Math.round(sample.height * 0.012)
    const left = clamp(xBand[0] - marginX, 0, sample.width - 1)
    const top = clamp(yBand[0] - marginY, 0, sample.height - 1)
    const right = clamp(xBand[1] + marginX, left + 1, sample.width)
    const bottom = clamp(yBand[1] + marginY, top + 1, sample.height)

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

function estimateBackground(image) {
  const { width, height, data } = image
  const patchW = Math.max(8, Math.round(width * 0.08))
  const patchH = Math.max(8, Math.round(height * 0.08))
  const patches = [
    [0, 0], [width - patchW, 0], [0, height - patchH], [width - patchW, height - patchH],
  ]
  let r = 0; let g = 0; let b = 0; let count = 0
  patches.forEach(([sx, sy]) => {
    for (let y = sy; y < sy + patchH; y += 3) {
      for (let x = sx; x < sx + patchW; x += 3) {
        const i = (y * width + x) * 4
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1
      }
    }
  })
  return [r / Math.max(1, count), g / Math.max(1, count), b / Math.max(1, count)]
}

function colorDistance(data, i, bg) {
  const dr = data[i] - bg[0]
  const dg = data[i + 1] - bg[1]
  const db = data[i + 2] - bg[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function activeBand(profile, threshold) {
  let first = -1
  let last = -1
  for (let i = 0; i < profile.length; i += 1) {
    if (profile[i] >= threshold) {
      if (first < 0) first = i
      last = i
    }
  }
  return first >= 0 && last > first ? [first, last + 1] : null
}

function movingAverage(values, windowSize) {
  const result = new Array(values.length).fill(0)
  const radius = Math.floor(windowSize / 2)
  let sum = 0
  let left = 0
  let right = -1
  for (let i = 0; i < values.length; i += 1) {
    const wantedLeft = Math.max(0, i - radius)
    const wantedRight = Math.min(values.length - 1, i + radius)
    while (right < wantedRight) { right += 1; sum += values[right] }
    while (left < wantedLeft) { sum -= values[left]; left += 1 }
    result[i] = sum / Math.max(1, right - left + 1)
  }
  return result
}

function drawSample(bitmap, rect, maxSide) {
  const ratio = Math.min(1, maxSide / Math.max(rect.w, rect.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.w * ratio))
  canvas.height = Math.max(1, Math.round(rect.h * ratio))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
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
  const sx = Math.max(0, Math.round(source.width * region.x))
  const sy = Math.max(0, Math.round(source.height * region.y))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(source.width * region.w)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(source.height * region.h)))
  const canvas = document.createElement('canvas')
  const width = Math.max(1100, sw * 2)
  canvas.width = width
  canvas.height = Math.max(260, Math.round(width * sh / sw))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('No se pudo generar el recorte de la tarjeta IVA.'))
    resolve(new File([blob], name, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.95))
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
function releaseCanvas(canvas) { if (canvas) { canvas.width = 1; canvas.height = 1 } }
