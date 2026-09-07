// The File System Access API, which is how the app writes populations
// straight into a folder on disk after every generation. Chromium has it; the
// DOM lib does not yet declare the picker or the permission calls, so the
// pieces used here are declared, all optional, and feature-detected at runtime.

type FileSystemAccessMode = "read" | "readwrite";

interface FileSystemHandle {
  queryPermission?(descriptor?: { mode?: FileSystemAccessMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: FileSystemAccessMode }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: FileSystemAccessMode;
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}
