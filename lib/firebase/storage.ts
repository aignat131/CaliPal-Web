import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { app } from './config'

export const storage = getStorage(app)

export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  const storageRef = ref(storage, `profile_photos/${uid}/photo.jpg`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
