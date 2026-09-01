const TARGET_WIDTH = 1800
const TARGET_HEIGHT = 1200
const NORMALIZED_FILE_MARKER = 'normalizada-v3'

// Regiones internas de la tarjeta tradicional ya normalizada a relación 3:2.
// Se evita deliberadamente incluir encabezados/etiquetas para que el OCR vea solo el dato.
export const VAT_FIELD_REGIONS = Object.freeze({
  name: [
    { x: 0.035, y: 0.255, w: 0.925, h: 0.115 },
    { x: 0.025, y: 0.225, w: 0.945, h: 0.155 },
  ],
  nit: [
    { x: 0.040, y: 0.445, w: 0.555, h: 0.120 },
    { x: 0.025, y: 0.420, w: 0.585, h: 0.155 },
  ],
  nrc: [
    { x: 0.640, y: 0.435, w: 0.325, h: 0.120 },
    { x: 0.610, y: 0.410, w: 0.365, h: 0.155 },
  ],
  activity: [
    { x: 0.025, y: 0.625, w: 0.945, h: 0.205 },
    { x: 0.018, y: 0.595, w: 0.960, h: 0.255 },
  ],
  address: [
    { x: 0.035, y: 0.105, w: 0.920, h: 0.165 },
    { x: 0.025, y: 0.080, w: 0.940, h: 0.205 },
  ],
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

    const front = normalizeRect(bitmap, detectCardRect(bitmap, first))
    const back = normalizeRect(bitmap, detectCardRect(bitmap, second))
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
      name: VAT_FIELD_REGIONS.name.map((r) => cropRegion(front, r)),
      nit: VAT_FIELD_REGIONS.nit.map((r) => cropRegion(front, r)),
      nrc: VAT_FIELD_REGIONS.nrc.map((r) => cropRegion(front, r)),
      activity: VAT_FIELD_REGIONS.activity.map((r) => cropRegion(front, r)),
      address: VAT_FIELD_REGIONS.address.map((r) => cropRegion(back, r)),
    }
  } finally {
    releaseCanvas(front)
    releaseCanvas(back)
  }
}

// Conserva trazos finos. El preprocesamiento anterior forzaba umbrales y destruía números.
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
  const lum = []
  for (let i = 0; i < image.data.length; i += 16) {
    lum.push(Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114))
  }
  lum.sort((a, b) => a - b)
  const low = lum[Math.floor(lum.length * 0.06)] ?? 25
  const high = lum[Math.floor(lum.length * 0.94)] ?? 235
  const span = Math.max(35, high - low)

  for (let i = 0; i < image.data.length; i += 4) {
    const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    const stretched = Math.max(0, Math.min(255, Math.round((gray - low) * 255 / span)))
    const value = mode === 'digits'
      ? Math.max(0, Math.min(255, Math.round((stretched - 128) * 1.10 + 128)))
      : stretched
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
    const start = Math.round(length * 0.30)
    const end = Math.round(length * 0.70)
    let best = Math.round(length / 2)
    let bestScore = Infinity

    for (let p = start; p <= end; p += 1) {
      let foreground = 0
      let count = 0
      for (let c = 0; c < cross; c += 4) {
        const x = horizontal ? c : p
        const y = horizontal ? p : c
        const i = (y * sample.width + x) * 4
        if (colorDistance(image.data, i, bg) > 22) foreground += 1
        count += 1
      }
      const ratio = foreground / Math.max(1, count)
      const centerPenalty = Math.abs(p - length / 2) / length * 0.03
      if (ratio + centerPenalty < bestScore) {
        bestScore = ratio + centerPenalty
        best = p
      }
    }
    const original = horizontal ? bitmap.height : bitmap.width
    return clamp(Math.round(best / length * original), Math.round(original * 0.28), Math.round(original * 0.72))
  } finally {
    releaseCanvas(sample)
  }
}

// Detecta el cuerpo físico de la tarjeta por diferencia respecto del fondo.
// Se exige una relación cercana a 3:2 para impedir que el texto interno se convierta en el borde.
function detectCardRect(bitmap, rect) {
  const sample = drawSample(bitmap, rect, 900)
  try {
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    const image = ctx.getImageData(0, 0, sample.width, sample.height)
    const bg = estimateBackground(image)
    const row = new Array(sample.height).fill(0)
    const col = new Array(sample.width).fill(0)

    for (let y = 0; y < sample.height; y += 2) {
      for (let x = 0; x < sample.width; x += 2) {
        const i = (y * sample.width + x) * 4
        if (colorDistance(image.data, i, bg) > 26) {
          row[y] += 1
          col[x] += 1
        }
      }
    }
    for (let y = 0; y < sample.height; y += 2) {
      row[y] /= Math.max(1, Math.ceil(sample.width / 2))
      if (y + 1 < row.length) row[y + 1] = row[y]
    }
    for (let x = 0; x < sample.width; x += 2) {
      col[x] /= Math.max(1, Math.ceil(sample.height / 2))
      if (x + 1 < col.length) col[x + 1] = col[x]
    }

    const yBand = activeBand(smooth(row, 11), 0.08)
    const xBand = activeBand(smooth(col, 11), 0.08)
    if (!xBand || !yBand) return rect

    let left = xBand[0]
    let right = xBand[1]
    let top = yBand[0]
    let bottom = yBand[1]
    const detectedW = right - left
    const detectedH = bottom - top
    const ratio = detectedW / Math.max(1, detectedH)
    if (detectedW < sample.width * 0.42 || detectedH < sample.height * 0.34 || ratio < 1.20 || ratio > 1.85) return rect

    const mx = Math.round(detectedW * 0.018)
    const my = Math.round(detectedH * 0.025)
    left = clamp(left - mx, 0, sample.width - 2)
    right = clamp(right + mx, left + 2, sample.width)
    top = clamp(top - my, 0, sample.height - 2)
    bottom = clamp(bottom + my, top + 2, sample.height)

    const sx = rect.w / sample.width
    const sy = rect.h / sample.height
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
  const pw = Math.max(8, Math.round(width * 0.07))
  const ph = Math.max(8, Math.round(height * 0.07))
  const starts = [[0, 0], [width - pw, 0], [0, height - ph], [width - pw, height - ph]]
  let r = 0; let g = 0; let b = 0; let n = 0
  starts.forEach(([sx, sy]) => {
    for (let y = sy; y < sy + ph; y += 3) for (let x = sx; x < sx + pw; x += 3) {
      const i = (y * width + x) * 4
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1
    }
  })
  return [r / n, g / n, b / n]
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

function smooth(values, width) {
  const out = new Array(values.length).fill(0)
  const r = Math.floor(width / 2)
  for (let i = 0; i < values.length; i += 1) {
    let total = 0
    let n = 0
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j += 1) { total += values[j]; n += 1 }
    out[i] = total / Math.max(1, n)
  }
  return out
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

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('No se pudo generar el recorte de Tarjeta IVA.'))
    resolve(new File([blob], name, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.97))
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
function releaseCanvas(canvas) { if (canvas) { canvas.width = 1; canvas.height = 1 } }
