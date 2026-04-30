import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { app } from './config'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const storage = app ? getStorage(app) : null as unknown as ReturnType<typeof getStorage>

export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  const storageRef = ref(storage, `profile_photos/${uid}/photo.jpg`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function uploadCommunityPhoto(communityId: string, file: File): Promise<string> {
  const storageRef = ref(storage, `community_photos/${communityId}/photo.jpg`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function uploadWorkoutPhoto(userId: string, timestamp: number, file: File): Promise<string> {
  const storageRef = ref(storage, `workout_photos/${userId}/${timestamp}.jpg`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

export async function uploadFormCheckVideo(userId: string, timestamp: number, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'mp4'
  const storageRef = ref(storage, `form_check_videos/${userId}/${timestamp}.${ext}`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
