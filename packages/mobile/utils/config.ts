let serverUrl = 'http://localhost:7837';

export function getServerUrl(): string {
  return serverUrl;
}

export function setServerUrl(url: string) {
  serverUrl = url;
}
