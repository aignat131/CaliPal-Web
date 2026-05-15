/**
 * Canvas-based image utilities for cropping and compression.
 * All functions run client-side (browser only).
 */

/** Compress an image file. Resizes if larger than maxDimension and re-encodes as JPEG. */
export function compressImage(
  file: File,
  { maxDimension = 1080, quality = 0.82 }: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension)
          width = maxDimension
        } else {
          width = Math.round((width / height) * maxDimension)
          height = maxDimension
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

/**
 * Extract a cropped region from an image URL (output of react-easy-crop's onCropComplete).
 * Returns a square JPEG File at the given outputSize.
 */
export function getCroppedImage(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  outputSize = 400
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      canvas.getContext('2d')!.drawImage(
        img,
        pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, outputSize, outputSize
      )
      canvas.toBlob(
        blob => blob
          ? resolve(new File([blob], 'profile.jpg', { type: 'image/jpeg' }))
          : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        0.88
      )
    }
    img.onerror = reject
    img.src = imageSrc
  })
}
