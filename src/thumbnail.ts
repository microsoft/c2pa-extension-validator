/*
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT license.
 */

/**
 * Creates a thumbnail image from a blob.
 * @param imageBlob - The original image blob.
 * @param maxWidth - The maximum width of the thumbnail.
 * @param maxHeight - The maximum height of the thumbnail.
 * @param mimeType - The desired MIME type of the thumbnail image (e.g., 'image/jpeg', 'image/webp').
 * @param quality - The quality of the thumbnail image (0 to 1 for lossy formats like JPEG).
 * @returns A promise that resolves to the thumbnail blob.
 */
export async function createThumbnail (
  imageBlob: Blob,
  maxWidth: number,
  maxHeight: number,
  mimeType: string = 'image/webp',
  quality: number = 1.0
): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageBlob)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx == null) {
        reject(new Error('Failed to get canvas 2D context'))
        return
      }

      let { width, height } = img
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob((blob) => {
        if (blob != null) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      }, mimeType, quality)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Creates a thumbnail image from a video blob.
 * @param videoBlob - The original video blob.
 * @param time - The time in seconds to capture the frame for the thumbnail.
 * @param maxWidth - The maximum width of the thumbnail.
 * @param maxHeight - The maximum height of the thumbnail.
 * @returns A promise that resolves to the thumbnail blob in WebP format with the best quality.
 */
export async function createVideoThumbnail (
  videoBlob: Blob,
  time: number,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(videoBlob)

    video.preload = 'metadata'

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      video.currentTime = Math.min(time, video.duration)
    }

    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx == null) {
        reject(new Error('Failed to get canvas 2D context'))
        return
      }

      let { videoWidth: width, videoHeight: height } = video
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(video, 0, 0, width, height)

      canvas.toBlob((blob) => {
        if (blob != null) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      }, 'image/webp', 1.0) // Using 'image/webp' for WebP format and 1.0 for the best quality
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video'))
    }

    video.src = url
    video.load()
  })
}

//   // Example usage:
//   const inputVideoBlob = ...; // Your input video blob
//   const time = 1; // Time in seconds to capture the thumbnail
//   const maxWidth = 100;
//   const maxHeight = 100;

//   createVideoThumbnail(inputVideoBlob, time, maxWidth, maxHeight)
//     .then((thumbnailBlob) => {
//       console.log('Thumbnail created', thumbnailBlob);
//       // Do something with the thumbnail blob, e.g., display it or upload it.
//     })
//     .catch((error) => {
//       console.error('Error creating thumbnail', error);
//     });
