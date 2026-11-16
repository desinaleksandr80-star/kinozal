package app.kinozal.messenger;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

// Служба «Кинозал в сети»: держит приложение живым, пока оно свёрнуто, — как значок в трее на компьютере.
// Во время звонка она же разрешает микрофону и камере работать, когда Кинозал не на экране.
public class OnlineService extends Service {
    static final int ID = 1;
    static boolean running = false;
    static boolean call = false;

    static void start(Context c, boolean inCall) {
        call = inCall;
        Intent i = new Intent(c, OnlineService.class);
        try {
            ContextCompat.startForegroundService(c, i);
        } catch (Exception e) {
            KinozalPlugin.logStatic(c, "[служба] не запустилась: " + e);
        }
    }

    static void stop(Context c) {
        call = false;
        c.stopService(new Intent(c, OnlineService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = build();
        int[] tries;
        if (Build.VERSION.SDK_INT >= 34) {
            int su = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            int mic = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE, cam = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            tries = call ? new int[] { su | mic | cam, su | mic, su } : new int[] { su };
        } else if (Build.VERSION.SDK_INT >= 30) {
            int mic = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE, cam = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            tries = call ? new int[] { mic | cam, mic, 0 } : new int[] { 0 };
        } else {
            tries = new int[] { -1 };
        }
        boolean ok = false;
        for (int t : tries) {
            try {
                if (t < 0) startForeground(ID, n);
                else if (t == 0) startForeground(ID, n);
                else startForeground(ID, n, t);
                ok = true;
                break;
            } catch (Exception e) {
                KinozalPlugin.logStatic(this, "[служба] тип " + t + " не подошёл: " + e);
            }
        }
        if (!ok) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        return START_NOT_STICKY;
    }

    private Notification build() {
        KinozalPlugin.channels(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, KinozalPlugin.CH_ONLINE)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(call ? "Идёт звонок" : "Кинозал в сети")
            .setContentText(call ? "Нажми, чтобы вернуться к звонку" : "Сообщения и звонки придут, даже когда Кинозал свёрнут")
            .setContentIntent(pi)
            .setOngoing(true)
            .setShowWhen(false)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(call ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    // Кинозал смахнули из недавних — окна с перепиской больше нет, служба ему не нужна
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        KinozalPlugin.logStatic(this, "[служба] приложение закрыли из недавних");
        running = false;
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
