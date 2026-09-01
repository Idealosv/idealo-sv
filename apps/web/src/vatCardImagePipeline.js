const TARGET_WIDTH = 1800

export const VAT_FIELD_REGIONS = Object.freeze({
  name: [
    { x: 0.02, y: 0.18, w: 0.96, h: 0.23 },
    { x: 0.01, y: 0.13, w: 0.98, h: 0.31 },
  ],
  nit: [
    { x: 0.03, y: 0.40, w: 0.58, h: 0.18 },
    { x: 0.01, y: 0.35, w: 0.66, h: 0.27 },
  ],
  nrc: [
    { x: 0.58, y: 0.40, w: 0.40, h: 0.18 },
    { x: 0.53, y: 0.35, w: 0.46, h: 0.27 },
  ],
  activity: [
    { x: 0.02, y: 0.55, w: 0.96, h: 0.30 },
    { x: 0.01, y: 0.50, w: 0.98, h: 0.39 },
  ],
  address: [
    { x: 0.02, y: 0.04, w: 0.96, h: 0.30 },
    { x: 0.01, y: 0.01, w: 0.98, h: 0.40 },
  ],
})

export async function splitCombinedVatImageV2(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const orientation = chooseOrientation(bitmap)
    const split = orientation === 'horizontal'
      ? findHorizontalSplit(bitmap)
      : findVerticalSplit(bitmap)

    const firstRect = orientation === 'horizontal'
      ? { x: 0, y: 0, w: bitmap.width, h: split }
      : { x: 0, y: 0, w: split, h: bitmap.height }
    const secondRect = orientation === 'horizontal'
      ? { x: 0, y: split, w: bitmap.width, h: bitmap.height - split }
      : { x: split, y: 0, w: bitmap.width - split, h: bitmap.height }

    const firstCanvas = cropBitmap(bitmap, trimRect(bitmap, firstRect))
    const secondCanvas = cropBitmap(bitmap, trimRect(bitmap, secondRect))
    const frontFile = await canvasToFile(firstCanvas, 'tarjeta-iva-frente-v2.jpg')
    const backFile = await canvasToFile(secondCanvas, 'tarjeta-iva-reverso-v2.jpg')
    releaseCanvas(firstCanvas)
    releaseCanvas(secondCanvas)
    return { frontFile, backFile, orientation }
  } finally {
    bitmap.close?.()
  }
}

export async function normalizeVatSide(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const rect = trimRect(bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height })
    const canvas = cropBitmap(bitmap, rect)
    const scaled = scaleCanvas(canvas, TARGET_WIDTH)
    releaseCanvas(canvas)
    return scaled
  } finally {
    bitmap.close?.()
  }
}

export async function createVatFieldVariants(frontFile, backFile) {
  const front = await normalizeVatSide(frontFile)
  const back = await normalizeVatSide(backFile)
  try {
    return {
      name: VAT_FIELD_REGIONS.name.map((region, index) => cropRegion(front, region, `name-${index}`)),
      nit: VAT_FIELD_REGIONS.nit.map((region, index) => cropRegion(front, region, `nit-${index}`)),
      nrc: VAT_FIELD_REGIONS.nrc.map((region, index) => cropRegion(front, region, `nrc-${index}`)),
      activity: VAT_FIELD_REGIONS.activity.map((region, index) => cropRegion(front, region, `activity-${index}`)),
      address: VAT_FIELD_REGIONS.address.map((region, index) => cropRegion(back, region, `address-${index}`)),
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
    const value = gray < threshold ? Math.max(0, gray - 60) : Math.min(255, gray + 46)
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
  if (bitmap.height >= bitmap.width * 1.25) return 'horizontal'
  if (bitmap.width >= bitmap.height * 1.35) return 'vertical'
  const horizontal = whitespaceScore(bitmap, 'horizontal')
  const vertical = whitespaceScore(bitmap, 'vertical')
  return horizontal >= vertical ? 'horizontal' : 'vertical'
}

function findHorizontalSplit(bitmap) {
  return findWhitespaceSplit(bitmap, 'horizontal')
}

function findVerticalSplit(bitmap) {
  return findWhitespaceSplit(bitmap, 'vertical')
}

function findWhitespaceSplit(bitmap, orientation) {
  const canvas = document.createElement('canvas')
  const sampleSize = 700
  const ratio = Math.min(1, sampleSize / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const length = orientation === 'horizontal' ? canvas.height : canvas.width
  const cross = orientation === 'horizontal' ? canvas.width : canvas.height
  let bestIndex = Math.round(length / 2)
  let bestScore = -Infinity
  const start = Math.round(length * 0.32)
  const end = Math.round(length * 0.68)

  for (let p = start; p <= end; p += 1) {
    let bright = 0
    for (let c = 0; c < cross; c += 4) {
      const x = orientation === 'horizontal' ? c : p
      const y = orientation === 'horizontal' ? p : c
      const index = (y * canvas.width + x) * 4
      const gray = (data[index] + data[index + 1] + data[index + 2]) / 3
      if (gray > 225) bright += 1
    }
    const centerPenalty = Math.abs(p - length / 2) / length
    const score = bright - centerPenalty * 8
    if (score > bestScore) { bestScore = score; bestIndex = p }
  }
  releaseCanvas(canvas)
  const originalLength = orientation === 'horizontal' ? bitmap.height : bitmap.width
  return Math.round(bestIndex / length * originalLength)
}

function whitespaceScore(bitmap, orientation) {
  const midpoint = orientation === 'horizontal' ? bitmap.height / 2 : bitmap.width / 2
  return -Math.abs(midpoint - (orientation === 'horizontal' ? bitmap.height : bitmap.width) / 2)
}

function trimRect(bitmap, rect) {
  const canvas = document.createElement('canvas')
  const maxSide = 900
  const ratio = Math.min(1, maxSide / Math.max(rect.w, rect.h))
  canvas.width = Math.max(1, Math.round(rect.w * ratio))
  canvas.height = Math.max(1, Math.round(rect.h * ratio))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const threshold = 232
  const margin = 10
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y += 3) {
    for (let x = 0; x < canvas.width; x += 3) {
      const i = (y * canvas.width + x) * 4
      const gray = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3
      if (gray < threshold) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  releaseCanvas(canvas)

  if (maxX < minX || maxY < minY) return rect
  const sx = rect.w / Math.max(1, Math.round(rect.w * ratio))
  const sy = rect.h / Math.max(1, Math.round(rect.h * ratio))
  const x = rect.x + Math.max(0, minX - margin) * sx
  const y = rect.y + Math.max(0, minY - margin) * sy
  const right = rect.x + Math.min(Math.round(rect.w * ratio) - 1, maxX + margin) * sx
  const bottom = rect.y + Math.min(Math.round(rect.h * ratio) - 1, maxY + margin) * sy
  return { x: Math.max(rect.x, x), y: Math.max(rect.y, y), w: Math.max(10, right - x), h: Math.max(10, bottom - y) }
}

function cropBitmap(bitmap, rect) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.w))
  canvas.height = Math.max(1, Math.round(rect.h))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
  return canvas
}

function scaleCanvas(source, targetWidth) {
  if (source.width >= targetWidth) return cloneCanvas(source)
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = Math.max(1, Math.round(targetWidth * source.height / source.width))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function cropRegion(source, region) {
  const canvas = document.createElement('canvas')
  const sx = Math.max(0, Math.round(source.width * region.x))
  const sy = Math.max(0, Math.round(source.height * region.y))
  const sw = Math.min(source.width - sx, Math.round(source.width * region.w))
  const sh = Math.min(source.height - sy, Math.round(source.height * region.h))
  const width = Math.max(1000, sw * 2)
  canvas.width = width
  canvas.height = Math.max(250, Math.round(width * sh / sw))
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
    if (!blob) return reject(new Error('No se pudo generar el recorte de la tarjeta IVA.'))
    resolve(new File([blob], name, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.94))
}

function releaseCanvas(canvas) {
  if (!canvas) return
  canvas.width = 1
  canvas.height = 1
}
