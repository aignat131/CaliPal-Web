import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { app } from './config'
import { compressImage } from '@/lib/utils/imageUtils'

if (!app) throw new Error('Firebase failed to initialize. Check NEXT_PUBLIC_FIREBASE_* env vars.')
export const storage = getStorage(app)

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_BYTES = 8 * 1024 * 1024   // 8 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB

function validateImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    throw new Error(`Tip fișier invalid. Acceptat: JPEG, PNG, WebP, GIF.`)
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error(`Imaginea depășește limita de 8 MB.`)
}

function validateVideo(file: File) {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type))
    throw new Error(`Tip fișier invalid. Acceptat: MP4, WebM, MOV.`)
  if (file.size > MAX_VIDEO_BYTES)
    throw new Error(`Videoclipul depășește limita de 100 MB.`)
}

// Profile photos arrive already cropped + compressed from the crop modal
export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  validateImage(file)
  const storageRef = ref(storage, `profile_photos/${uid}/photo.jpg`)
  await uploadBytes(storageRef, file, { contentType: 'image/jpeg' })
  return getDownloadURL(storageRef)
}

export async function uploadCommunityPhoto(communityId: string, file: File): Promise<string> {
  validateImage(file)
  const compressed = await compressImage(file, { maxDimension: 1200, quality: 0.82 })
  const storageRef = ref(storage, `community_photos/${communityId}/photo.jpg`)
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' })
  return getDownloadURL(storageRef)
}

export async function uploadWorkoutPhoto(userId: string, timestamp: number, file: File): Promise<string> {
  validateImage(file)
  const compressed = await compressImage(file, { maxDimension: 1080, quality: 0.82 })
  const storageRef = ref(storage, `workout_photos/${userId}/${timestamp}.jpg`)
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' })
  return getDownloadURL(storageRef)
}

export async function uploadFormCheckVideo(userId: string, timestamp: number, file: File): Promise<string> {
  validateVideo(file)
  const ext = file.name.split('.').pop() ?? 'mp4'
  const storageRef = ref(storage, `form_check_videos/${userId}/${timestamp}.${ext}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
