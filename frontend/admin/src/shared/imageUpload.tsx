import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { authHeader, getAccessToken } from '../api';

/**
 * One image-upload control shared by the account, staff and service editors.
 *
 * A photo is checked before it is sent: the declared MIME type must be PNG or
 * JPEG, the file's leading bytes must carry the matching signature (so a
 * renamed executable is refused), and the file must be at most 10MB. The
 * chosen image is previewed as a thumbnail, uploaded as a raw body with
 * `XMLHttpRequest` so `upload.onprogress` can drive a progress bar, and the
 * URL returned by the server is shown once the upload lands.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'];
const IMAGE_TYPE_MESSAGE = 'Upload a JPEG or PNG image (.jpg, .jpeg, .png).';
const IMAGE_SIZE_MESSAGE = 'Image is too large. Use a file of 10MB or less.';

/** PNG: \x89 P N G \r \n \x1a \n. JPEG: \xff \xd8 \xff. */
function sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

async function readMagicBytes(file: File, length = 8): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Check an image file the way the server will.
 *
 * The declared type and the byte signature must agree, so neither a renamed
 * file nor a mislabelled one slips through.
 */
export async function checkImageFile(file: File): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return IMAGE_TYPE_MESSAGE;
  if (file.size > MAX_IMAGE_BYTES) return IMAGE_SIZE_MESSAGE;
  let signature: 'image/png' | 'image/jpeg' | null = null;
  try {
    signature = sniffImageType(await readMagicBytes(file));
  } catch {
    return 'The file could not be read. Choose the image again.';
  }
  if (!signature) return 'That file is not a real JPEG or PNG image.';
  if (signature !== file.type) return 'The file contents do not match its extension. Choose a genuine JPEG or PNG image.';
  return null;
}

export interface ImageUploadHandle {
  /** Whether a new image is waiting to be uploaded. */
  hasPendingFile(): boolean;
  /**
   * Upload the pending image to `endpoint` as a raw image body.
   * Resolves to the URL the server returned (or the current URL when no new
   * image is pending); rejects with a message when the upload fails.
   */
  upload(endpoint: string): Promise<string | null>;
}

type ImageUploadFieldProps = {
  label: string;
  /** The image already stored for this record, shown until a new one is chosen. */
  initialUrl?: string | null;
  idPrefix: string;
  disabled?: boolean;
};

/**
 * A labelled image picker: preview thumbnail, validation, and an upload with
 * a progress bar. The upload itself is started by the owning form through the
 * imperative handle, because the endpoint is only known once the record the
 * photo belongs to exists.
 */
export const ImageUploadField = forwardRef<ImageUploadHandle, ImageUploadFieldProps>(function ImageUploadField(
  { label, initialUrl = null, idPrefix, disabled = false },
  ref,
) {
  const [preview, setPreview] = useState<string>(initialUrl ?? '');
  const [fileHint, setFileHint] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      // The preview is an object URL owned by this control.
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    // The URL can arrive after mount (settings load async). Follow it unless
    // the user has staged a local file in the control.
    if (fileRef.current === null && previewRef.current === null) {
      setPreview(initialUrl ?? '');
    }
  }, [initialUrl]);

  function acceptFile(file: File | null) {
    if (!file) return;
    void checkImageFile(file).then((message) => {
      if (message) {
        setFileHint(message);
        fileRef.current = null;
        return;
      }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const objectUrl = URL.createObjectURL(file);
      previewRef.current = objectUrl;
      fileRef.current = file;
      setPreview(objectUrl);
      setUploadedUrl(null);
      setProgress(null);
      setFileHint('');
    });
  }

  function removeImage() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    fileRef.current = null;
    setPreview(initialUrl ?? '');
    setUploadedUrl(null);
    setProgress(null);
    setFileHint('');
    if (inputRef.current) inputRef.current.value = '';
  }

  useImperativeHandle(ref, () => ({
    hasPendingFile() {
      return fileRef.current !== null;
    },
    upload(endpoint: string) {
      const file = fileRef.current;
      if (!file) return Promise.resolve(uploadedUrl ?? initialUrl ?? null);
      const token = getAccessToken();
      return new Promise<string | null>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', endpoint);
        request.setRequestHeader('Content-Type', file.type);
        if (token) request.setRequestHeader('Authorization', authHeader(token).Authorization);
        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          let payload: any = null;
          try {
            payload = JSON.parse(request.responseText);
          } catch {
            payload = null;
          }
          if (request.status >= 200 && request.status < 300) {
            const url = String(
              payload?.data?.photoUrl ?? payload?.data?.imageUrl ?? payload?.data?.url
              // The payment settings endpoint answers with a settings record.
              ?? payload?.data?.settings?.gcashQrUrl ?? '',
            );
            fileRef.current = null;
            setUploadedUrl(url || null);
            setProgress(null);
            resolve(url || null);
            return;
          }
          setProgress(null);
          reject(new Error(payload?.message ?? 'The image could not be uploaded.'));
        };
        request.onerror = () => {
          setProgress(null);
          reject(new Error('The image could not be uploaded. Check the backend connection.'));
        };
        request.send(file);
      });
    },
  }));

  return (
    <div className="service-upload-field">
      <span className="field-label">{label}</span>
      <div
        className={`service-upload-dropzone${preview ? ' filled' : ''}${dragActive ? ' drag-active' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled) acceptFile(event.dataTransfer.files?.[0] ?? null);
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          id={`${idPrefix}-file`}
          className="service-upload-input"
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          disabled={disabled}
          aria-label={`${label} file`}
          onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="service-image-preview" />
        ) : (
          <div className="service-upload-placeholder">
            <span className="upload-icon" aria-hidden="true">⇪</span>
            <span>Drag and drop a JPEG or PNG here or click to browse (max 10MB)</span>
          </div>
        )}
        {fileHint && <p className="file-hint-warning" role="alert">{fileHint}</p>}
      </div>
      {progress !== null && (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-track" aria-hidden="true">
            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="upload-progress-text">Uploading… {progress}%</span>
        </div>
      )}
      {uploadedUrl && <small className="upload-url">Uploaded: {uploadedUrl}</small>}
      {preview && (
        <div className="service-upload-actions">
          <button type="button" className="secondary-action" disabled={disabled} onClick={() => inputRef.current?.click()}>Replace Photo</button>
          <button type="button" className="link-button danger-link" disabled={disabled} onClick={removeImage}>Remove Photo</button>
        </div>
      )}
    </div>
  );
});
