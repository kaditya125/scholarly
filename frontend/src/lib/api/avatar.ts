import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, storage, db } from '../firebase';

export interface UploadProgress {
  progress: number;
  status: 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

/**
 * Resizes and compresses an image file using the HTML5 Canvas API.
 */
const processImage = (file: File, maxSize = 512): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.width;
      let height = img.height;

      // Calculate new dimensions preserving aspect ratio
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Fill white background for transparent images converted to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Draw and resize image
      ctx.drawImage(img, 0, 0, width, height);

      // Export as JPEG with 80% quality
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob failed'));
        },
        'image/jpeg',
        0.8
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
};

/**
 * Uploads an avatar image for the current user.
 * Handles compression, storage upload, auth profile update, and firestore update.
 */
export const uploadAvatar = async (
  file: File,
  onProgress: (progress: UploadProgress) => void
): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  try {
    // 1. Process image
    onProgress({ progress: 0, status: 'processing' });
    const processedBlob = await processImage(file);

    // 2. Upload to Firebase Storage
    // Use a stable path per user so it overwrites
    const storagePath = `public/avatars/${user.uid}/avatar.jpg`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, processedBlob, {
      contentType: 'image/jpeg',
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress({ progress, status: 'uploading' });
        },
        (error) => {
          console.error('Upload failed:', error);
          onProgress({ progress: 0, status: 'error', error: error.message });
          reject(error);
        },
        async () => {
          try {
            // 3. Get Download URL
            onProgress({ progress: 100, status: 'done' });
            
            // Add a cache-busting token to the URL so that the browser forces a reload
            const baseDownloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            const avatarUrl = `${baseDownloadUrl}&v=${Date.now()}`;

            // 4. Update Firebase Auth Profile
            await updateProfile(user, { photoURL: avatarUrl });

            // 5. Update Firestore User Profile
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              avatarUrl: avatarUrl,
              avatarStoragePath: storagePath,
              avatarUpdatedAt: new Date().toISOString(),
            });

            resolve(avatarUrl);
          } catch (error) {
            console.error('Failed to update profiles:', error);
            reject(error);
          }
        }
      );
    });
  } catch (error: any) {
    onProgress({ progress: 0, status: 'error', error: error.message });
    throw error;
  }
};
