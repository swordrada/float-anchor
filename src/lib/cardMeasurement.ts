/** Batch intrinsic measurements in canvas units, independent of zoom. */
export function measureCardHeights(elements: HTMLElement[]): Record<string, number> {
  const previous = elements.map((element) => element.style.cssText)
  try {
    for (const element of elements) {
      element.style.height = 'auto'
      element.style.contain = 'none'
      element.style.overflow = 'visible'
    }
    const heights: Record<string, number> = {}
    for (const element of elements) {
      const style = getComputedStyle(element)
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      const height = Math.max(80, element.offsetHeight, Math.ceil(element.scrollHeight + (border || 0)))
      if (element.dataset.cardId) heights[element.dataset.cardId] = height
    }
    return heights
  } finally {
    elements.forEach((element, index) => { element.style.cssText = previous[index] })
  }
}

/** Load even offscreen card images before measuring; never save partial sizes. */
export async function waitForCardImages(elements: HTMLElement[], signal: AbortSignal) {
  await Promise.all(elements.flatMap((element) => Array.from(element.querySelectorAll('img'))).map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const loading = image.loading
      const finish = (error?: Error) => {
        clearTimeout(timer)
        image.removeEventListener('load', loaded)
        image.removeEventListener('error', loaded)
        signal.removeEventListener('abort', aborted)
        image.loading = loading
        if (error) reject(error)
        else resolve()
      }
      const loaded = () => finish()
      const aborted = () => finish(new Error('已取消调整'))
      const timer = setTimeout(() => finish(new Error('部分图片尚未加载完成，请稍后重试最佳大小。')), 5000)
      image.addEventListener('load', loaded)
      image.addEventListener('error', loaded)
      signal.addEventListener('abort', aborted, { once: true })
      image.loading = 'eager'
      if (signal.aborted) aborted()
      else if (image.complete) loaded()
    })
  }))
}
