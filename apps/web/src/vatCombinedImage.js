export async function splitCombinedVatImage(file) {
  if (!file) throw new Error('COMBINED_IMAGE_REQUIRED')
  const bitmap = await createImageBitmap(file)
  try {
    const source = document.createElement('canvas')
    const maxDimension = 2600
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    source.width = Math.max(1, Math.round(bitmap.width * scale))
    source.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = source.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, source.width, source.height)

    const orientation = chooseSplitOrientation(ctx, source.width, source.height)
    const split = orientation === 'horizontal'
      ? findHorizontalGap(ctx, source.width, source.height)
      : findVerticalGap(ctx, source.width, source.height)

    const firstHalf = orientation === 'horizontal'
      ? { x: 0, y: 0, width: source.width, height: split }
      : { x: 0, y: 0, width: split, height: source.height }
    const secondHalf = orientation === 'horizontal'
      ? { x: 0, y: split, width: source.width, height: source.height - split }
      : { x: split, y: 0, width: source.width - split, height: source.height }

    // Muy importante para fotos recibidas por WhatsApp: primero separamos las dos caras
    // y luego quitamos el papel/fondo blanco que rodea a cada tarjeta. De esta forma la
    // tarjeta ocupa casi todo el archivo temporal que recibe Tesseract.
    const firstRect = tightenRectToCard(ctx, firstHalf)
    const secondRect = tightenRectToCard(ctx, secondHalf)

    const frontFile = await cropToFile(source, firstRect, 'tarjeta-iva-frente.jpg')
    const backFile = await cropToFile(source, secondRect, 'tarjeta-iva-reverso.jpg')
    return {
      frontFile,
      backFile,
      orientation,
      splitRatio: split / (orientation === 'horizontal' ? source.height : source.width),
      frontCropRatio: firstRect.width / Math.max(1, firstHalf.width),
      backCropRatio: secondRect.width / Math.max(1, secondHalf.width),
    }
  } finally {
    bitmap.close?.()
  }
}

function chooseSplitOrientation(ctx, width, height) {
  if (height >= width * 1.12) return 'horizontal'
  if (width >= height * 1.28) return 'vertical'
  const horizontal = gapStrength(rowDarkness(ctx, width, height), 0.30, 0.70)
  const vertical = gapStrength(columnDarkness(ctx, width, height), 0.30, 0.70)
  return horizontal >= vertical ? 'horizontal' : 'vertical'
}

function findHorizontalGap(ctx, width, height) {
  return findGapIndex(rowDarkness(ctx, width, height), height)
}

function findVerticalGap(ctx, width, height) {
  return findGapIndex(columnDarkness(ctx, width, height), width)
}

function findGapIndex(values, length) {
  const start = Math.max(1, Math.floor(length * 0.30))
  const end = Math.min(values.length - 2, Math.ceil(length * 0.70))
  let bestIndex = Math.floor(length / 2)
  let best = Number.POSITIVE_INFINITY
  const radius = Math.max(2, Math.floor(length * 0.008))
  for (let i = start; i <= end; i += 1) {
    let total = 0
    let count = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j += 1) {
      total += values[j]
      count += 1
    }
    const score = total / Math.max(1, count)
    if (score < best) {
      best = score
      bestIndex = i
    }
  }
  const safeMin = Math.floor(length * 0.28)
  const safeMax = Math.ceil(length * 0.72)
  return Math.max(safeMin, Math.min(safeMax, bestIndex))
}

function gapStrength(values, fromRatio, toRatio) {
  const start = Math.floor(values.length * fromRatio)
  const end = Math.ceil(values.length * toRatio)
  const slice = values.slice(start, end)
  if (!slice.length) return 0
  const sorted = [...slice].sort((a, b) => a - b)
  const low = sorted[Math.floor(sorted.length * 0.08)] || 0
  const median = sorted[Math.floor(sorted.length * 0.50)] || 1
  return Math.max(0, median - low) / Math.max(1, median)
}

function rowDarkness(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height).data
  const values = new Array(height).fill(0)
  const xStart = Math.floor(width * 0.08)
  const xEnd = Math.ceil(width * 0.92)
  const stepX = Math.max(1, Math.floor(width / 300))
  for (let y = 0; y < height; y += 1) {
    let darkness = 0
    let count = 0
    for (let x = xStart; x < xEnd; x += stepX) {
      const i = (y * width + x) * 4
      const gray = image[i] * 0.299 + image[i + 1] * 0.587 + image[i + 2] * 0.114
      darkness += 255 - gray
      count += 1
    }
    values[y] = darkness / Math.max(1, count)
  }
  return values
}

function columnDarkness(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height).data
  const values = new Array(width).fill(0)
  const yStart = Math.floor(height * 0.08)
  const yEnd = Math.ceil(height * 0.92)
  const stepY = Math.max(1, Math.floor(height / 300))
  for (let x = 0; x < width; x += 1) {
    let darkness = 0
    let count = 0
    for (let y = yStart; y < yEnd; y += stepY) {
      const i = (y * width + x) * 4
      const gray = image[i] * 0.299 + image[i + 1] * 0.587 + image[i + 2] * 0.114
      darkness += 255 - gray
      count += 1
    }
    values[x] = darkness / Math.max(1, count)
  }
  return values
}

function tightenRectToCard(ctx, rect) {
  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const image = ctx.getImageData(x0, y0, width, height).data
  const stepX = Math.max(1, Math.floor(width / 500))
  const stepY = Math.max(1, Math.floor(height / 500))
  const rowFractions = []
  const colFractions = []

  for (let y = 0; y < height; y += stepY) {
    let dark = 0
    let total = 0
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4
      const gray = image[i] * 0.299 + image[i + 1] * 0.587 + image[i + 2] * 0.114
      if (gray < 232) dark += 1
      total += 1
    }
    rowFractions.push({ pos: y, value: dark / Math.max(1, total) })
  }

  for (let x = 0; x < width; x += stepX) {
    let dark = 0
    let total = 0
    for (let y = 0; y < height; y += stepY) {
      const i = (y * width + x) * 4
      const gray = image[i] * 0.299 + image[i + 1] * 0.587 + image[i + 2] * 0.114
      if (gray < 232) dark += 1
      total += 1
    }
    colFractions.push({ pos: x, value: dark / Math.max(1, total) })
  }

  const yRange = activeRange(rowFractions, 0.12, height)
  const xRange = activeRange(colFractions, 0.12, width)
  if (!xRange || !yRange) return rect

  const detectedWidth = xRange.end - xRange.start
  const detectedHeight = yRange.end - yRange.start
  if (detectedWidth < width * 0.22 || detectedHeight < height * 0.18) return rect

  const padX = Math.round(detectedWidth * 0.045)
  const padY = Math.round(detectedHeight * 0.06)
  const left = Math.max(0, xRange.start - padX)
  const top = Math.max(0, yRange.start - padY)
  const right = Math.min(width, xRange.end + padX)
  const bottom = Math.min(height, yRange.end + padY)

  return {
    x: x0 + left,
    y: y0 + top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function activeRange(samples, threshold, limit) {
  const active = samples.filter((sample) => sample.value >= threshold)
  if (!active.length) return null
  const start = active[0].pos
  const last = active[active.length - 1].pos
  const step = samples.length > 1 ? Math.max(1, samples[1].pos - samples[0].pos) : 1
  return { start, end: Math.min(limit, last + step) }
}

async function cropToFile(source, rect, name) {
  const targetWidth = Math.min(2600, Math.max(1800, Math.round(rect.width)))
  const targetHeight = Math.max(700, Math.round(targetWidth * rect.height / Math.max(1, rect.width)))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('COMBINED_IMAGE_CROP_FAILED')), 'image/jpeg', 0.96)
  })
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}
