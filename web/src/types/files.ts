export type UploadedFile = {
  storageKey: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
};

export type MessageAttachment = UploadedFile;
