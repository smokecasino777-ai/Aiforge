import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareFile(bytes: Uint8Array | string, name: string, mime: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('File saved locally; sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: 'Export from AiForge' });
}