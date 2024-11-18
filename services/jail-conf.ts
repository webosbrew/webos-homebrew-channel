import { fetchWrapper } from './fetch-wrapper';
import fs from 'fs';
import { asyncPipeline } from './adapter';
import path from 'path';

function fileUrl(sdkVersion: string, fileType: string) {
  return `https://developer.lge.com/common/file/DownloadFile.dev?sdkVersion=${sdkVersion}&fileType=${fileType}`;
}

async function downloadFileTo(url: string, targetPath: string) {
  const res = await fetchWrapper(url);
  if (!res.ok) {
    throw new Error(`Failed to download jail.conf.sig: ${res.statusText}`);
  }
  const targetFile = fs.createWriteStream(targetPath);
  await asyncPipeline(res.body, targetFile);
}

export async function downloadJailConf(appDir: string, sdkVersion: string) {
  await downloadFileTo(fileUrl(sdkVersion, 'conf'), path.join(appDir, 'jail_app.conf'));
  await downloadFileTo(fileUrl(sdkVersion, 'sig'), path.join(appDir, 'jail_app.conf.sig'));
}
