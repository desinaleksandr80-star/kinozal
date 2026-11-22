package app.kinozal.messenger;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// Мост между веб-частью Кинозала (та же, что на компьютере) и Android:
// фоновая служба, уведомления, звонки поверх блокировки, громкая связь, сохранение файлов, журнал, обновления.
@CapacitorPlugin(name = "Kinozal", permissions = {
    @com.getcapacitor.annotation.Permission(alias = "audio33", strings = { "android.permission.READ_MEDIA_AUDIO" }),
    @com.getcapacitor.annotation.Permission(alias = "audioOld", strings = { "android.permission.READ_EXTERNAL_STORAGE" })
})
public class KinozalPlugin extends Plugin {
    static final String CH_ONLINE = "online", CH_MSG = "messages", CH_CALL = "calls2";
    static final String EXTRA_CHAT = "kz_chat", EXTRA_CALL = "kz_call", EXTRA_ANSWER = "kz_answer";
    static KinozalPlugin instance;
    static final int CALL_ID = 2;
    private static final Map<String, List<String>> lines = new HashMap<>();
    private boolean resumed = true;
    private long updId = -1;
    private BroadcastReceiver updRx;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("kinozal", Context.MODE_PRIVATE);
    }

    @Override
    public void load() {
        instance = this;
        channels(getContext());
        Activity a = getActivity();
        if (a != null) handleIntent(a.getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        resumed = true;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        resumed = false;
    }

    // нажали на уведомление или открыли ссылку kinozal://add/ID, kinozal://room/КОД
    private void handleIntent(Intent i) {
        if (i == null) return;
        if (i.getBooleanExtra(EXTRA_ANSWER, false)) {
            i.removeExtra(EXTRA_ANSWER);
            cancelCallNotif();
            notifyListeners("callAction", jo("act", "answer"), true);
        }
        String chat = i.getStringExtra(EXTRA_CHAT);
        if (chat != null) {
            JSObject d = new JSObject();
            d.put("chat", chat);
            notifyListeners("openChat", d, true);
            i.removeExtra(EXTRA_CHAT);
            synchronized (lines) {
                lines.remove(chat);
            }
        }
        Uri u = i.getData();
        if (u != null && "kinozal".equals(u.getScheme())) {
            String host = u.getHost(), p = u.getLastPathSegment();
            String hash = null;
            if ("add".equals(host) && p != null) hash = "add=" + p;
            else if ("room".equals(host) && p != null) hash = p;
            if (hash != null) {
                JSObject d = new JSObject();
                d.put("hash", hash);
                notifyListeners("link", d, true);
            }
            i.setData(null);
        }
    }

    static JSObject jo(String k, String v) {
        JSObject o = new JSObject();
        o.put(k, v);
        return o;
    }

    // кнопка «Отклонить» в уведомлении о звонке
    static void declineFromNotification(Context c) {
        NotificationManagerCompat.from(c).cancel(CALL_ID);
        if (instance != null) instance.notifyListeners("callAction", jo("act", "decline"), true);
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel on = new NotificationChannel(CH_ONLINE, "Кинозал в сети", NotificationManager.IMPORTANCE_MIN);
        on.setDescription("Постоянный значок, пока Кинозал ждёт сообщений в фоне");
        on.setShowBadge(false);
        nm.createNotificationChannel(on);
        NotificationChannel msg = new NotificationChannel(CH_MSG, "Сообщения", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("Новые сообщения, реакции, напоминания о киносеансах");
        msg.enableVibration(true);
        nm.createNotificationChannel(msg);
        NotificationChannel call = new NotificationChannel(CH_CALL, "Звонки", NotificationManager.IMPORTANCE_HIGH);
        call.setDescription("Входящие звонки и приглашения в кинозал");
        call.enableVibration(true);
        call.setVibrationPattern(new long[] { 0, 700, 500, 700, 500, 700 });
        call.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        );
        call.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(call);
    }

    private PendingIntent openIntent(String chat, boolean isCall, int code) {
        Intent i = new Intent(getContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        if (chat != null) i.putExtra(EXTRA_CHAT, chat);
        if (isCall) i.putExtra(EXTRA_CALL, true);
        return PendingIntent.getActivity(getContext(), code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @PluginMethod
    public void info(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            r.put("version", pi.versionName);
            r.put("code", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) {
            r.put("version", "");
        }
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("battery", Build.VERSION.SDK_INT < 23 || pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled());
        r.put("background", prefs().getBoolean("bg", true));
        r.put("canInstall", Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("fullScreen", Build.VERSION.SDK_INT < 34 || c.getSystemService(NotificationManager.class).canUseFullScreenIntent());
        r.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        call.resolve(r);
    }

    // ---------- работа в фоне ----------
    @PluginMethod
    public void setBackground(PluginCall call) {
        boolean on = call.getBoolean("on", true);
        prefs().edit().putBoolean("bg", on).apply();
        if (!OnlineService.call) {
            if (on) OnlineService.start(getContext(), false);
            else OnlineService.stop(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void askBattery(PluginCall call) {
        Context c = getContext();
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && !pm.isIgnoringBatteryOptimizations(c.getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
                getActivity().startActivity(i);
            }
        } catch (Exception e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e2) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void askNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7101);
        }
        call.resolve();
    }

    // Android 14+: показывать входящий звонок на весь экран нужно разрешить вручную
    @PluginMethod
    public void askFullScreen(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 34) getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName())));
        } catch (Exception e) {}
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(i);
        call.resolve();
    }

    // ---------- звонок ----------
    @PluginMethod
    public void setCall(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        Activity a = getActivity();
        a.runOnUiThread(() -> {
            if (on) a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else {
                a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (a instanceof MainActivity) ((MainActivity) a).clearOverLock();
            }
        });
        if (on) {
            OnlineService.start(getContext(), true);
            route(call.getBoolean("speaker", true));
        } else {
            OnlineService.call = false;
            if (prefs().getBoolean("bg", true)) OnlineService.start(getContext(), false);
            else OnlineService.stop(getContext());
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            try {
                if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice();
                else am.setSpeakerphoneOn(false);
                am.setMode(AudioManager.MODE_NORMAL);
            } catch (Exception e) {}
        }
        cancelCallNotif();
        call.resolve();
    }

    // громкая связь или «у уха»; если подключены наушники — звук всегда в них
    @PluginMethod
    public void speaker(PluginCall call) {
        JSObject r = new JSObject();
        r.put("route", route(call.getBoolean("on", true)));
        call.resolve(r);
    }

    private String route(boolean speaker) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        try {
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                AudioDeviceInfo head = null, spk = null, ear = null;
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    int t = d.getType();
                    if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_USB_HEADSET || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLE_HEADSET) head = d;
                    else if (t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) spk = d;
                    else if (t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) ear = d;
                }
                AudioDeviceInfo pick = head != null ? head : speaker ? spk : ear;
                if (pick != null) am.setCommunicationDevice(pick);
                return head != null ? "headset" : speaker ? "speaker" : "earpiece";
            } else {
                boolean head = am.isWiredHeadsetOn() || am.isBluetoothScoOn();
                am.setSpeakerphoneOn(!head && speaker);
                return head ? "headset" : speaker ? "speaker" : "earpiece";
            }
        } catch (Exception e) {
            logStatic(getContext(), "[звук] не получилось переключить: " + e);
            return "unknown";
        }
    }

    // ---------- уведомления ----------
    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "Кинозал"), body = call.getString("body", ""), chat = call.getString("chat");
        boolean isCall = Boolean.TRUE.equals(call.getBoolean("call", false));
        Context c = getContext();
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            call.resolve();
            return;
        }
        try {
            if (isCall) {
                if (resumed) {
                    call.resolve();
                    return;
                }
                PendingIntent pi = openIntent(chat, true, 9000);
                Intent ans = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(EXTRA_CALL, true).putExtra(EXTRA_ANSWER, true);
                PendingIntent pa = PendingIntent.getActivity(c, 9001, ans, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                PendingIntent pd = PendingIntent.getBroadcast(c, 9002, new Intent(c, CallActionReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Person who = new Person.Builder().setName(title).setImportant(true).build();
                NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_CALL)
                    .setSmallIcon(R.drawable.ic_stat)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setTimeoutAfter(45000)
                    .setContentIntent(pi)
                    .setFullScreenIntent(pi, true)
                    .setStyle(NotificationCompat.CallStyle.forIncomingCall(who, pd, pa));
                NotificationManagerCompat.from(c).notify(CALL_ID, b.build());
            } else {
                String key = chat != null ? chat : "kinozal";
                List<String> l;
                synchronized (lines) {
                    l = lines.get(key);
                    if (l == null) lines.put(key, l = new ArrayList<>());
                    l.add(body);
                    while (l.size() > 7) l.remove(0);
                    l = new ArrayList<>(l);
                }
                NotificationCompat.InboxStyle st = new NotificationCompat.InboxStyle();
                for (String s : l) st.addLine(s);
                if (l.size() > 1) st.setSummaryText(l.size() + " новых");
                NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_MSG)
                    .setSmallIcon(R.drawable.ic_stat)
                    .setColor(0xFFFF6B4A)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(l.size() > 1 ? st : new NotificationCompat.BigTextStyle().bigText(body))
                    .setNumber(l.size())
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setOnlyAlertOnce(false)
                    .setAutoCancel(true)
                    .setContentIntent(openIntent(chat, false, key.hashCode()));
                NotificationManagerCompat.from(c).notify(key, 3, b.build());
            }
        } catch (SecurityException e) {
            logStatic(c, "[уведомления] нет разрешения: " + e);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelCall(PluginCall call) {
        cancelCallNotif();
        call.resolve();
    }

    private void cancelCallNotif() {
        NotificationManagerCompat.from(getContext()).cancel(CALL_ID);
    }

    // открыли чат — его уведомления больше не нужны; без чата — убрать все
    @PluginMethod
    public void clear(PluginCall call) {
        String chat = call.getString("chat");
        NotificationManagerCompat nm = NotificationManagerCompat.from(getContext());
        synchronized (lines) {
            if (chat != null) {
                lines.remove(chat);
                nm.cancel(chat, 3);
            } else {
                for (String k : lines.keySet()) nm.cancel(k, 3);
                lines.clear();
            }
        }
        call.resolve();
    }

    // ---------- файлы ----------
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "kinozal-file"), mime = call.getString("mime", "application/octet-stream"), data = call.getString("data", "");
        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Кинозал");
                    Uri u = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("нет доступа к «Загрузкам»");
                    try (OutputStream os = getContext().getContentResolver().openOutputStream(u)) {
                        os.write(bytes);
                    }
                    where = "Загрузки/Кинозал";
                } else {
                    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 7102);
                        call.reject("Разреши Кинозалу доступ к файлам и сохрани ещё раз");
                        return;
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Кинозал");
                    dir.mkdirs();
                    File f = new File(dir, name);
                    try (FileOutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                    where = "Download/Кинозал";
                }
                JSObject r = new JSObject();
                r.put("where", where);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Не получилось сохранить: " + e.getMessage());
            }
        }).start();
    }

    // ---------- большие файлы: кусками, без больших строк в памяти ----------
    // Раньше файл приходил сюда одной строкой base64: на 100+ МБ приложение падало (OutOfMemoryError),
    // а падение посреди записи портило хранилище WebView вместе с профилем.
    // Теперь: недокачанное — в закрытой папке приложения (parts/<id>.part), готовое — в «Загрузки/Кинозал/…».
    private final java.util.concurrent.ExecutorService io = java.util.concurrent.Executors.newSingleThreadExecutor();
    private File partOf(String id) { File d = new File(getContext().getFilesDir(), "parts"); d.mkdirs(); return new File(d, id.replaceAll("[^\\w-]", "_") + ".part"); }
    private static String safeSeg(String s) { s = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim(); while (s.endsWith(".")) s = s.substring(0, s.length() - 1); return s.length() > 120 ? s.substring(0, 120) : s; }
    private static String subPath(String sub) { StringBuilder b = new StringBuilder(); if (sub != null) for (String p : sub.split("/")) { String q = safeSeg(p); if (!q.isEmpty() && b.length() < 300) b.append('/').append(q); } return b.toString(); }

    @PluginMethod
    public void fOpen(PluginCall call) {
        String id = call.getString("id", ""); long blk = Math.max(1, call.getData().optLong("blk", 1));
        io.execute(() -> {
            try (RandomAccessFile f = new RandomAccessFile(partOf(id), "rw")) {
                long size = f.length(), have = size / blk * blk; if (have != size) f.setLength(have);
                JSObject r = new JSObject(); r.put("have", have); call.resolve(r);
            } catch (Exception e) { call.reject("не получилось создать файл: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void fWrite(PluginCall call) {
        String id = call.getString("id", ""), data = call.getString("data", ""); long off = call.getData().optLong("off", 0);
        io.execute(() -> {
            try (RandomAccessFile f = new RandomAccessFile(partOf(id), "rw")) { byte[] b = Base64.decode(data, Base64.DEFAULT); f.seek(off); f.write(b); call.resolve(); }
            catch (Exception e) { call.reject("не получилось записать: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void fDrop(PluginCall call) { String id = call.getString("id", ""); io.execute(() -> { partOf(id).delete(); call.resolve(); }); }

    // готово: переносим в «Загрузки/Кинозал/<подпапки>/имя», отдаём адрес файла (content://)
    @PluginMethod
    public void fDone(PluginCall call) {
        String id = call.getString("id", ""), name = safeSeg(call.getString("name", "файл")), mime = call.getString("mime", "application/octet-stream"), sub = subPath(call.getString("sub", ""));
        io.execute(() -> {
            File part = partOf(id);
            try {
                String where = "Загрузки/Кинозал" + sub, uri;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name.isEmpty() ? "файл" : name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Кинозал" + sub);
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri u = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("нет доступа к «Загрузкам»");
                    try (java.io.InputStream in = new java.io.FileInputStream(part); OutputStream os = getContext().getContentResolver().openOutputStream(u)) { copy(in, os); }
                    ContentValues done = new ContentValues(); done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(u, done, null, null);
                    uri = u.toString();
                } else {
                    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 7102);
                        call.reject("Разреши Кинозалу доступ к файлам и сохрани ещё раз"); return;
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Кинозал" + sub); dir.mkdirs();
                    File to = new File(dir, name); String base = name, ext = ""; int dot = name.lastIndexOf('.'); if (dot > 0) { base = name.substring(0, dot); ext = name.substring(dot); }
                    for (int i = 1; to.exists(); i++) to = new File(dir, base + " (" + i + ")" + ext);
                    try (java.io.InputStream in = new java.io.FileInputStream(part); OutputStream os = new FileOutputStream(to)) { copy(in, os); }
                    uri = Uri.fromFile(to).toString(); where = "Download/Кинозал" + sub;
                }
                part.delete();
                JSObject r = new JSObject(); r.put("uri", uri); r.put("where", where); call.resolve(r);
            } catch (Exception e) { call.reject("Не получилось сохранить: " + e.getMessage()); }
        });
    }
    private static void copy(java.io.InputStream in, OutputStream os) throws java.io.IOException { byte[] buf = new byte[1 << 16]; int n; while ((n = in.read(buf)) > 0) os.write(buf, 0, n); }

    // сохранённый файл: размер, кусок (для просмотра), открыть в другой программе
    @PluginMethod
    public void fSize(PluginCall call) {
        String s = call.getString("uri", "");
        io.execute(() -> {
            long size = -1;
            try (android.os.ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(Uri.parse(s), "r")) { if (pfd != null) size = pfd.getStatSize(); } catch (Exception e) {}
            JSObject r = new JSObject(); r.put("size", size); call.resolve(r);
        });
    }
    @PluginMethod
    public void fRead(PluginCall call) {
        String s = call.getString("uri", ""); long off = call.getData().optLong("off", 0); int len = (int) Math.min(8 << 20, Math.max(0, call.getData().optLong("len", 0)));
        io.execute(() -> {
            try (android.os.ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(Uri.parse(s), "r");
                 java.io.FileInputStream in = new java.io.FileInputStream(pfd.getFileDescriptor())) {
                java.nio.channels.FileChannel ch = in.getChannel(); ch.position(off);
                java.nio.ByteBuffer bb = java.nio.ByteBuffer.allocate(len); while (bb.hasRemaining() && ch.read(bb) > 0) {}
                JSObject r = new JSObject(); r.put("data", Base64.encodeToString(bb.array(), 0, bb.position(), Base64.NO_WRAP)); call.resolve(r);
            } catch (Exception e) { call.reject("не получилось прочитать: " + e.getMessage()); }
        });
    }
    @PluginMethod
    public void fView(PluginCall call) {
        try {
            Uri u = Uri.parse(call.getString("uri", ""));
            if ("file".equals(u.getScheme())) u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(u.getPath()));
            String mime = call.getString("mime", null); if (mime == null || mime.isEmpty()) mime = getContext().getContentResolver().getType(u);
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(u, mime == null ? "*/*" : mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(Intent.createChooser(i, "Открыть").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) { call.reject("Нечем открыть такой файл"); }
    }

    // ---------- музыка на телефоне (то же, что music-main.js на компьютере) ----------
    private final java.util.concurrent.ExecutorService mio = java.util.concurrent.Executors.newFixedThreadPool(2);
    private String audioAlias() { return Build.VERSION.SDK_INT >= 33 ? "audio33" : "audioOld"; }
    private boolean audioGranted() { return getPermissionState(audioAlias()) == com.getcapacitor.PermissionState.GRANTED; }

    @PluginMethod
    public void mInfo(PluginCall call) {
        JSObject r = new JSObject(); r.put("perm", audioGranted()); r.put("dir", MusicHub.appDir(getContext()).getPath()); call.resolve(r);
    }

    @PluginMethod
    public void mPerm(PluginCall call) {
        if (audioGranted()) { mInfo(call); return; }
        requestPermissionForAlias(audioAlias(), call, "mPermDone");
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void mPermDone(PluginCall call) { mInfo(call); }

    @PluginMethod
    public void mScan(PluginCall call) {
        boolean perm = audioGranted();
        mio.execute(() -> {
            try {
                JSObject r = new JSObject(); org.json.JSONArray arr = new org.json.JSONArray();
                for (Map<String, Object> m : MusicHub.scan(getContext(), perm)) arr.put(new org.json.JSONObject(m));
                r.put("files", arr); r.put("perm", perm); r.put("root", MusicHub.appDir(getContext()).getPath()); call.resolve(r);
            } catch (Exception e) { call.reject("не прочитался список музыки: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void mRead(PluginCall call) {
        String p = call.getString("p", ""); long off = call.getData().optLong("off", 0); int len = (int) Math.min(8 << 20, Math.max(0, call.getData().optLong("len", 0)));
        mio.execute(() -> {
            try { JSObject r = new JSObject(); r.put("data", Base64.encodeToString(MusicHub.read(getContext(), p, off, len), Base64.NO_WRAP)); call.resolve(r); }
            catch (Exception e) { call.reject(e.getMessage() == null ? "не прочиталось" : e.getMessage()); }
        });
    }

    @PluginMethod
    public void mHash(PluginCall call) {
        String p = call.getString("p", "");
        mio.execute(() -> {
            try { JSObject r = new JSObject(); r.put("h", MusicHub.hash(getContext(), p)); call.resolve(r); }
            catch (Exception e) { call.reject("не прочитался"); }
        });
    }

    @PluginMethod
    public void mLyrics(PluginCall call) {
        String p = call.getString("p", "");
        mio.execute(() -> { JSObject r = new JSObject(); r.put("text", MusicHub.lyrics(getContext(), p)); call.resolve(r); });
    }

    @PluginMethod
    public void mPickFiles(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "audio/*", "application/ogg" }).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, i, "mPicked");
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void mPicked(PluginCall call, androidx.activity.result.ActivityResult res) {
        Intent d = res.getData();
        List<Uri> uris = new ArrayList<>();
        if (res.getResultCode() == Activity.RESULT_OK && d != null) {
            if (d.getClipData() != null) for (int k = 0; k < d.getClipData().getItemCount() && k < 5000; k++) uris.add(d.getClipData().getItemAt(k).getUri());
            else if (d.getData() != null) uris.add(d.getData());
        }
        mio.execute(() -> {
            int n = 0;
            for (Uri u : uris) if (MusicHub.addUri(getContext(), u)) n++;
            JSObject r = new JSObject(); r.put("n", n); call.resolve(r);
        });
    }

    @PluginMethod
    public void mSaveOpen(PluginCall call) {
        String id = call.getString("id", ""), name = call.getString("name", "");
        mio.execute(() -> { try { JSObject r = new JSObject(); r.put("ok", MusicHub.saveOpen(getContext(), id, name)); call.resolve(r); } catch (Exception e) { call.reject(e.getMessage()); } });
    }

    @PluginMethod
    public void mSaveWrite(PluginCall call) {
        String id = call.getString("id", ""), data = call.getString("data", ""); long off = call.getData().optLong("off", 0);
        mio.execute(() -> { try { JSObject r = new JSObject(); r.put("ok", MusicHub.saveWrite(id, off, Base64.decode(data, Base64.DEFAULT))); call.resolve(r); } catch (Exception e) { call.reject(e.getMessage()); } });
    }

    @PluginMethod
    public void mSaveDone(PluginCall call) {
        String id = call.getString("id", ""), want = call.getString("want", "");
        mio.execute(() -> {
            try {
                String[] x = MusicHub.saveDone(id, want); JSObject r = new JSObject();
                if (x == null) r.put("ok", false); else { r.put("ok", !x[0].isEmpty()); r.put("p", x[0]); r.put("hash", x[1]); }
                call.resolve(r);
            } catch (Exception e) { JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); }
        });
    }

    @PluginMethod
    public void mSaveDrop(PluginCall call) { String id = call.getString("id", ""); mio.execute(() -> { MusicHub.saveDrop(id); call.resolve(); }); }

    @PluginMethod
    public void mTrash(PluginCall call) {
        String p = call.getString("p", "");
        mio.execute(() -> { JSObject r = new JSObject(); r.put("ok", MusicHub.delete(getContext(), p)); call.resolve(r); });
    }

    // ---------- запасная копия профиля: ключ, контакты, группы — в закрытой папке приложения ----------
    // Если хранилище WebView сотрётся (сбой посреди записи), страница восстановит из неё тот же профиль.
    private File backupOf(String slot) { File d = new File(getContext().getFilesDir(), "backup"); d.mkdirs(); return new File(d, "profile-" + (slot == null || slot.isEmpty() ? "main" : slot.replaceAll("[^\\w-]", "_")) + ".json"); }
    @PluginMethod
    public void backupPut(PluginCall call) {
        String slot = call.getString("slot", ""), data = call.getString("data", "");
        io.execute(() -> {
            try {
                File f = backupOf(slot), tmp = new File(f.getPath() + ".tmp");
                try (FileOutputStream os = new FileOutputStream(tmp)) { os.write(data.getBytes(StandardCharsets.UTF_8)); os.getFD().sync(); }
                if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        });
    }
    @PluginMethod
    public void backupGet(PluginCall call) {
        String slot = call.getString("slot", "");
        io.execute(() -> {
            JSObject r = new JSObject();
            try { File f = backupOf(slot); if (f.exists()) r.put("data", new String(java.nio.file.Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)); } catch (Exception e) {}
            call.resolve(r);
        });
    }
    @PluginMethod
    public void backupDrop(PluginCall call) { String slot = call.getString("slot", ""); io.execute(() -> { backupOf(slot).delete(); call.resolve(); }); }

    @PluginMethod
    public void openUrl(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", ""))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Нечем открыть ссылку");
        }
    }

    // ---------- журнал ----------
    static synchronized void logStatic(Context c, String text) {
        Log.i("Kinozal", text);
        try {
            File dir = new File(c.getFilesDir(), "logs");
            dir.mkdirs();
            File f = new File(dir, "kinozal.log");
            if (f.length() > 1_500_000) {
                byte[] tail = new byte[600_000];
                try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
                    r.seek(f.length() - tail.length);
                    r.readFully(tail);
                }
                try (FileOutputStream os = new FileOutputStream(f, false)) {
                    os.write(tail);
                }
            }
            String line = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US).format(new Date()) + " " + text.replace('\n', ' ') + "\n";
            try (FileOutputStream os = new FileOutputStream(f, true)) {
                os.write(line.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) {}
    }

    @PluginMethod
    public void log(PluginCall call) {
        logStatic(getContext(), call.getString("text", ""));
        call.resolve();
    }

    @PluginMethod
    public void readLog(PluginCall call) {
        JSObject r = new JSObject();
        try {
            File f = new File(new File(getContext().getFilesDir(), "logs"), "kinozal.log");
            byte[] b = new byte[(int) Math.min(f.length(), 400_000)];
            try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
                raf.seek(f.length() - b.length);
                raf.readFully(b);
            }
            r.put("text", new String(b, StandardCharsets.UTF_8));
        } catch (Exception e) {
            r.put("text", "");
        }
        call.resolve(r);
    }

    // ---------- обновление: скачать новый APK и предложить установить ----------
    @PluginMethod
    public void update(PluginCall call) {
        Context c = getContext();
        String url = call.getString("url", ""), ver = call.getString("version", "new");
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName())));
            call.reject("need-install-permission");
            return;
        }
        try {
            File dir = c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File[] old = dir != null ? dir.listFiles() : null;
            if (old != null) for (File f : old) if (f.getName().endsWith(".apk")) f.delete();
            String file = "Kinozal-" + ver.replaceAll("[^0-9.]", "") + ".apk";
            DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request rq = new DownloadManager.Request(Uri.parse(url))
                .setTitle("Обновление Кинозала")
                .setDescription("Версия " + ver)
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, file);
            updId = dm.enqueue(rq);
            final File target = new File(dir, file);
            if (updRx != null) try {
                c.unregisterReceiver(updRx);
            } catch (Exception e) {}
            updRx = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent i) {
                    if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != updId) return;
                    try {
                        ctx.unregisterReceiver(this);
                    } catch (Exception e) {}
                    updRx = null;
                    boolean ok = false;
                    try (Cursor cur = dm.query(new DownloadManager.Query().setFilterById(updId))) {
                        ok = cur != null && cur.moveToFirst() && cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
                    } catch (Exception e) {}
                    JSObject d = new JSObject();
                    d.put("ok", ok);
                    notifyListeners("updDone", d);
                    if (ok) install(target);
                }
            };
            ContextCompat.registerReceiver(c, updRx, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            pollProgress(dm);
            call.resolve();
        } catch (Exception e) {
            call.reject("Не получилось скачать обновление: " + e.getMessage());
        }
    }

    private void pollProgress(DownloadManager dm) {
        Handler h = new Handler(Looper.getMainLooper());
        final long id = updId;
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (id != updId) return;
                try (Cursor cur = dm.query(new DownloadManager.Query().setFilterById(id))) {
                    if (cur == null || !cur.moveToFirst()) return;
                    int st = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long got = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long all = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    JSObject d = new JSObject();
                    d.put("p", all > 0 ? Math.round(got * 100.0 / all) : 0);
                    notifyListeners("updProgress", d);
                    if (st == DownloadManager.STATUS_RUNNING || st == DownloadManager.STATUS_PENDING || st == DownloadManager.STATUS_PAUSED) h.postDelayed(this, 700);
                } catch (Exception e) {}
            }
        }, 700);
    }

    private void install(File f) {
        try {
            Context c = getContext();
            Uri u = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(u, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            logStatic(getContext(), "[обновление] не открылась установка: " + e);
        }
    }

    @PluginMethod
    public void installAgain(PluginCall call) {
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File[] fs = dir != null ? dir.listFiles() : null;
        if (fs != null) for (File f : fs) if (f.getName().endsWith(".apk")) {
            install(f);
            call.resolve();
            return;
        }
        call.reject("нет файла");
    }
}
