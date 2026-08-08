export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

/**
 * Decode an image file into something drawable, with fallbacks.
 *
 * `createImageBitmap(file, { imageOrientation: "from-image" })` is the good
 * path, but the options bag throws a TypeError on older WebKit and
 * createImageBitmap is missing entirely on the oldest supported Safari — in
 * which case the previous code just failed with an opaque error.
 *
 * The HTMLImageElement fallback still honours EXIF orientation, because the CSS
 * `image-orientation` default is `from-image` for embedded images.
 */
export async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return fromBitmap(
        await createImageBitmap(file, { imageOrientation: "from-image" })
      );
    } catch (error) {
      // A TypeError means the options bag was rejected; retry without it. Any
      // other error means the bytes themselves are the problem, so fall through
      // to the <img> path which reports decode failures more clearly.
      if (error instanceof TypeError) {
        try {
          return fromBitmap(await createImageBitmap(file));
        } catch {
          // Fall through.
        }
      }
    }
  }

  return fromImageElement(file);
}

function fromBitmap(bitmap: ImageBitmap): DecodedImage {
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    release: () => bitmap.close(),
  };
}

function fromImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        source: image,
        // naturalWidth/Height reflect the orientation the browser applied.
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be decoded by this browser."));
    };

    image.src = url;
  });
}
