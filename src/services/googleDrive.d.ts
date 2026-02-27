declare module '../../../services/googleDrive' {
    const googleDriveService: {
        initialize: () => Promise<void>;
        hasValidToken: () => boolean;
        requestAccessToken: () => Promise<void>;
        uploadAudio: (file: File, folderName: string, onProgress: (percent: number, bytes: number, total: number) => void) => Promise<{ url: string; streamUrl: string }>;
        validateAudioLink: (url: string) => Promise<{ valid: boolean; error?: string }>;
    };
    export default googleDriveService;
}
