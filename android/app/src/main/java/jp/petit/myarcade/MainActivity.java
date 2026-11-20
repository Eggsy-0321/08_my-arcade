package jp.petit.myarcade;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOST = "myarcade.local";
    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html");
        MIME.put("css", "text/css");
        MIME.put("js", "text/javascript");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("webp", "image/webp");
        MIME.put("ico", "image/x-icon");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("wav", "audio/wav");
        MIME.put("ogg", "audio/ogg");
        MIME.put("m4a", "audio/mp4");
        MIME.put("mp4", "video/mp4");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
        MIME.put("txt", "text/plain");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        webView = new WebView(this);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && HOST.equals(uri.getHost())) {
                    return serveAsset(uri);
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        setContentView(webView);
        hideSystemBars();
        webView.loadUrl("https://" + HOST + "/index.html");
    }

    private WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.length() == 0 || "/".equals(path)) {
            path = "/index.html";
        }
        if (path.endsWith("/")) {
            path = path + "index.html";
        }
        String assetPath = "www" + Uri.decode(path);
        String ext = "";
        int dot = assetPath.lastIndexOf('.');
        if (dot >= 0) {
            ext = assetPath.substring(dot + 1).toLowerCase();
        }
        String mime = MIME.get(ext);
        if (mime == null) {
            mime = "application/octet-stream";
        }
        boolean text = mime.startsWith("text/") || mime.equals("application/json")
            || mime.equals("image/svg+xml") || mime.equals("text/javascript");
        try {
            InputStream in = getAssets().open(assetPath);
            return new WebResourceResponse(mime, text ? "UTF-8" : null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream("".getBytes()));
        }
    }

    private void hideSystemBars() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
