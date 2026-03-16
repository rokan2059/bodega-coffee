export async function resizeBase64Image(base64Str: string, maxWidth = 512, maxHeight = 512): Promise<string> {
  if (!base64Str) return "";
  if (base64Str.startsWith('http://') || base64Str.startsWith('https://')) {
    return base64Str;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width === 0 || height === 0) {
          reject(new Error("Image has 0 dimensions"));
          return;
        }

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        
        // Fill with white background first (good for JPEGs)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (error) => reject(error);
    img.src = base64Str;
  });
}
