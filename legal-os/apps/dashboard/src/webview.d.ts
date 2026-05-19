// WebView2 postMessage bridge (WPF host)
interface Window {
  chrome?: {
    webview?: {
      postMessage(message: string): void;
    };
  };
}
