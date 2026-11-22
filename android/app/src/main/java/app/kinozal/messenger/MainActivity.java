package app.kinozal.messenger;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

// Окно Кинозала. «Назад» сначала закрывает окна и чат внутри приложения, а на списке чатов
// сворачивает Кинозал (как крестик на компьютере уводит его в трей) — чтобы сообщения продолжали приходить.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KinozalPlugin.class);
        super.onCreate(savedInstanceState);
        // звук музыки: https://localhost/_kzmusic/… отдаём сами (с диапазонами — для перемотки), остальное — как обычно
        if (bridge != null) bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse m = MusicHub.serve(getApplicationContext(), request);
                return m != null ? m : super.shouldInterceptRequest(view, request);
            }
        });
        showOverLockIfCall(getIntent());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = bridge != null ? bridge.getWebView() : null;
                if (w == null) { moveTaskToBack(true); return; }
                w.evaluateJavascript("(window.kzBack && window.kzBack()) ? 1 : 0", r -> { if (!"1".equals(r)) moveTaskToBack(true); });
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showOverLockIfCall(intent);
    }

    // входящий звонок: окно появляется поверх экрана блокировки и будит экран
    private void showOverLockIfCall(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(KinozalPlugin.EXTRA_CALL, false)) return;
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }

    void clearOverLock() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }
}
