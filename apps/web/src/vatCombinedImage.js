export async function splitCombinedVatImage(file) {
  if (!file) throw new Error('COMBINED_IMAGE_REQUIRED')
  const bitmap = await createImageBitmap(file)
  try {
    const source = document.createElement('canvas')
    const maxDimension = 2200
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    source.width = Math.max(1, Math.round(bitmap.width * scale))
    source.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = source.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, source.width, source.height)

    const orientation = chooseSplitOrientation(ctx, source.width, source.height)
    const split = orientation === 'horizontal'
      ? findHorizontalGap(ctx, source.width, source.height)
      : findVerticalGap(ctx, source.width, source.height)

    const firstRect = orientation === 'horizontal'
      ? { x: 0, y: 0, width: source.width, height: split }
      : { x: 0, y: 0, width: split, height: source.height }
    const secondRect = orientation === 'horizontal'
      ? { x: 0, y: split, width: source.width, height: source.height - split }
      : { x: split, y: 0, width: source.width - split, height: source.height }

    const frontFile = await cropToFile(source, firstRect, 'tarjeta-iva-frente.jpg')
    const backFile = await cropToFile(source, secondRect, 'tarjeta-iva-reverso.jpg')
    return { frontFile, backFile, orientation, splitRatio: split / (orientation === 'horizontal' ? source.height : source.width) }
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

async function cropToFile(source, rect, name) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width))
  canvas.height = Math.max(1, Math.round(rect.height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('COMBINED_IMAGE_CROP_FAILED')), 'image/jpeg', 0.94)
  })
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}
