package app.kinozal.messenger;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

// Музыка на телефоне — то же, что music-main.js на компьютере: список файлов, чтение начала (теги, обложка),
// SHA-256, добавление и докачка треков, отдача звука плееру (https://localhost/_kzmusic/…, с диапазонами — для перемотки).
// Берём музыку из MediaStore (вся музыка телефона, нужно разрешение) и из своей папки приложения (разрешения не нужно).
final class MusicHub {
    static final Pattern AUDIO = Pattern.compile(".*\\.(mp3|flac|ogg|oga|opus|wav|m4a|aac|wma|aiff?|ape|wv|mka)$", Pattern.CASE_INSENSITIVE);
    static final String URL_PREFIX = "/_kzmusic/";
    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("mp3", "audio/mpeg"); MIME.put("flac", "audio/flac"); MIME.put("ogg", "audio/ogg"); MIME.put("oga", "audio/ogg"); MIME.put("opus", "audio/ogg");
        MIME.put("wav", "audio/wav"); MIME.put("m4a", "audio/mp4"); MIME.put("aac", "audio/aac"); MIME.put("wma", "audio/x-ms-wma"); MIME.put("aif", "audio/aiff");
        MIME.put("aiff", "audio/aiff"); MIME.put("mka", "audio/x-matroska");
    }

    private MusicHub() {}

    // своя папка: Android/data/<приложение>/files/Музыка — сюда копируются добавленные файлы и докачанные у друзей треки
    static File appDir(Context c) {
        File base = c.getExternalFilesDir(null);
        if (base == null) base = c.getFilesDir();
        File d = new File(base, "Музыка");
        d.mkdirs();
        return d;
    }

    private static String canon(File f) {
        try { return f.getCanonicalPath(); } catch (IOException e) { return f.getAbsolutePath(); }
    }

    // читать можно только звуковые файлы во внешнем хранилище (память телефона и карта) — не любые файлы приложения
    static File ok(Context c, String p) {
        if (p == null || p.isEmpty() || !AUDIO.matcher(p).matches()) return null;
        File f = new File(p);
        String cp = canon(f);
        if (!(cp.startsWith("/storage/") || cp.startsWith("/sdcard/"))) return null;
        return f.isFile() ? f : null;
    }

    static boolean inApp(Context c, File f) {
        String a = canon(appDir(c)) + "/";
        return canon(f).startsWith(a);
    }

    private static String relOf(String path) {
        for (String pre : new String[] { "/storage/emulated/0/", "/sdcard/", "/storage/self/primary/" }) if (path.startsWith(pre)) return path.substring(pre.length());
        return path.startsWith("/") ? path.substring(1) : path;
    }

    // ---------- список ----------
    static List<Map<String, Object>> scan(Context c, boolean perm) {
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (perm) {
            String[] cols = { MediaStore.Audio.Media.DATA, MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.DATE_MODIFIED, MediaStore.Audio.Media.IS_MUSIC };
            String sel = MediaStore.Audio.Media.IS_RINGTONE + "=0 AND " + MediaStore.Audio.Media.IS_NOTIFICATION + "=0 AND " + MediaStore.Audio.Media.IS_ALARM + "=0";
            try (Cursor q = c.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols, sel, null, null)) {
                if (q != null) while (q.moveToNext() && out.size() < 100000) {
                    String p = q.getString(0);
                    if (p == null || !AUDIO.matcher(p).matches()) continue;
                    String rel = relOf(p);
                    // голосовые из мессенджеров и записи — не музыка: берём то, что телефон считает музыкой, и всё из «Музыка» и «Загрузки»
                    boolean music = q.getInt(3) != 0 || rel.startsWith("Music/") || rel.startsWith("Download/") || rel.startsWith("Downloads/") || rel.startsWith("Музыка/");
                    if (!music || !seen.add(p)) continue;
                    long size = q.getLong(1);
                    if (size <= 0) continue;
                    out.add(entry(p, rel, size, q.getLong(2) * 1000L));
                }
            } catch (Exception e) { /* без разрешения — только своя папка */ }
        }
        File root = appDir(c);
        walk(root, root, 0, out, seen);
        return out;
    }

    private static Map<String, Object> entry(String p, String rel, long size, long mtime) {
        Map<String, Object> m = new HashMap<>();
        m.put("p", p); m.put("rel", rel); m.put("size", size); m.put("mtime", mtime);
        return m;
    }

    private static void walk(File root, File d, int depth, List<Map<String, Object>> out, Set<String> seen) {
        if (depth > 12 || out.size() >= 100000) return;
        File[] list = d.listFiles();
        if (list == null) return;
        for (File f : list) {
            String n = f.getName();
            if (n.startsWith(".") || n.endsWith(".part")) continue;
            if (f.isDirectory()) walk(root, f, depth + 1, out, seen);
            else if (AUDIO.matcher(n).matches() && seen.add(f.getPath())) out.add(entry(f.getPath(), relOf(f.getPath()), f.length(), f.lastModified()));
        }
    }

    // ---------- чтение ----------
    static byte[] read(Context c, String p, long off, int len) throws IOException {
        File f = ok(c, p);
        if (f == null) throw new IOException("нет доступа к файлу");
        len = Math.max(0, Math.min(len, 8 << 20));
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            r.seek(Math.max(0, off));
            byte[] b = new byte[len]; int got = 0, n;
            while (got < len && (n = r.read(b, got, len - got)) > 0) got += n;
            if (got == len) return b;
            byte[] s = new byte[got]; System.arraycopy(b, 0, s, 0, got); return s;
        }
    }

    static String hash(Context c, String p) throws Exception {
        File f = ok(c, p);
        if (f == null) return "";
        SharedPreferences sp = c.getSharedPreferences("kinozal-mhash", Context.MODE_PRIVATE);
        String key = f.getPath() + "|" + f.length() + "|" + f.lastModified();
        String have = sp.getString(key, null);
        if (have != null) return have;
        String hex = sha256(f);
        sp.edit().putString(key, hex).apply();
        return hex;
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) { byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) md.update(b, 0, n); }
        StringBuilder s = new StringBuilder();
        for (byte x : md.digest()) s.append(String.format(Locale.ROOT, "%02x", x));
        return s.toString();
    }

    // текст песни рядом с файлом: «Трек.lrc» или «Трек.txt» (в чужих папках Android может не пустить — тогда просто нет текста)
    static String lyrics(Context c, String p) {
        File f = ok(c, p);
        if (f == null) return "";
        String path = f.getPath(), base = path.substring(0, path.lastIndexOf('.'));
        for (String ext : new String[] { ".lrc", ".LRC", ".txt" }) {
            File l = new File(base + ext);
            try {
                if (!l.isFile() || l.length() > 300000) continue;
                byte[] b = java.nio.file.Files.readAllBytes(l.toPath());
                String s;
                try { s = java.nio.charset.StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(b)).toString(); }
                catch (Exception e) { s = new String(b, java.nio.charset.Charset.forName("windows-1251")); }
                return s.replace("﻿", "");
            } catch (Exception e) { /* нет такого файла */ }
        }
        return "";
    }

    // ---------- добавить файлы: копия в свою папку ----------
    static File freeName(File dir, String name) {
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
        File to = new File(dir, name);
        for (int i = 2; to.exists(); i++) to = new File(dir, base + " (" + i + ")" + ext);
        return to;
    }

    static String safeName(String s) {
        s = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        while (s.endsWith(".") || s.endsWith(" ")) s = s.substring(0, s.length() - 1);
        if (s.length() > 120) s = s.substring(0, 120);
        return s.isEmpty() ? "трек" : s;
    }

    static boolean addUri(Context c, Uri u) {
        ContentResolver cr = c.getContentResolver();
        String name = null;
        try (Cursor q = cr.query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) { if (q != null && q.moveToFirst()) name = q.getString(0); } catch (Exception e) {}
        if (name == null) name = u.getLastPathSegment();
        name = safeName(name);
        if (!AUDIO.matcher(name).matches()) name += ".mp3";
        File dir = new File(appDir(c), "Добавленные"); dir.mkdirs();
        File to = freeName(dir, name), tmp = new File(to.getPath() + ".part");
        try (InputStream in = cr.openInputStream(u); OutputStream os = new java.io.FileOutputStream(tmp)) {
            if (in == null) return false;
            byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) os.write(b, 0, n);
        } catch (Exception e) { tmp.delete(); return false; }
        return tmp.renameTo(to);
    }

    // ---------- трек, который друг докачивает во время прослушивания вместе ----------
    private static final Map<String, File[]> saves = new HashMap<>();   // id → {часть, итоговый файл}
    private static File partsDir(Context c) { File d = new File(c.getCacheDir(), "mparts"); d.mkdirs(); return d; }

    static synchronized boolean saveOpen(Context c, String id, String name) throws IOException {
        if (id == null || !id.matches("[\\w-]{3,40}") || saves.size() > 4) return false;
        String n = safeName(name);
        if (!AUDIO.matcher(n).matches()) n += ".mp3";
        File dir = new File(appDir(c), "Общая от друзей"); dir.mkdirs();
        File to = freeName(dir, n), tmp = new File(partsDir(c), id + ".part");
        new RandomAccessFile(tmp, "rw").setLength(0);
        saves.put(id, new File[] { tmp, to });
        return true;
    }

    static boolean saveWrite(String id, long off, byte[] data) throws IOException {
        File[] s; synchronized (MusicHub.class) { s = saves.get(id); }
        if (s == null || off + data.length > 400000000L) return false;
        try (RandomAccessFile r = new RandomAccessFile(s[0], "rw")) { r.seek(Math.max(0, off)); r.write(data); }
        return true;
    }

    // true + хэш — файл на месте; иначе файл удалён
    static String[] saveDone(String id, String want) throws Exception {
        File[] s; synchronized (MusicHub.class) { s = saves.remove(id); }
        if (s == null) return null;
        String hex = sha256(s[0]);
        if (want != null && !want.isEmpty() && !hex.equals(want)) { s[0].delete(); return new String[] { "", hex }; }
        File tmp = new File(s[1].getPath() + ".part");   // из кэша в память телефона — это другой том, переименованием не обойтись: копируем и только потом показываем файл
        try (InputStream in = new FileInputStream(s[0]); OutputStream os = new java.io.FileOutputStream(tmp)) { byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) os.write(b, 0, n); }
        catch (Exception e) { tmp.delete(); s[0].delete(); return null; }
        s[0].delete();
        if (!tmp.renameTo(s[1])) { tmp.delete(); return null; }
        return new String[] { s[1].getPath(), hex };
    }

    static void saveDrop(String id) {
        File[] s; synchronized (MusicHub.class) { s = saves.remove(id); }
        if (s != null) s[0].delete();
    }

    static boolean delete(Context c, String p) {
        File f = ok(c, p);
        return f != null && inApp(c, f) && f.delete();   // чужие файлы телефона не трогаем — только те, что лежат у Кинозала
    }

    // ---------- звук плееру: https://localhost/_kzmusic/<путь>, диапазоны (Range) — чтобы сразу была длина и работала перемотка ----------
    static WebResourceResponse serve(Context c, WebResourceRequest req) {
        Uri u = req.getUrl();
        String ep = u.getEncodedPath();
        if (ep == null || !ep.startsWith(URL_PREFIX)) return null;
        File f = ok(c, Uri.decode(ep.substring(URL_PREFIX.length())));
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        if (f == null) return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", h, new java.io.ByteArrayInputStream(new byte[0]));
        try {
            long size = f.length(), start = 0, end = size - 1;
            int status = 200;
            String range = null;
            for (Map.Entry<String, String> e : req.getRequestHeaders().entrySet()) if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            java.util.regex.Matcher m = range == null ? null : Pattern.compile("^bytes=(\\d*)-(\\d*)$").matcher(range.trim());
            if (m != null && m.matches() && (!m.group(1).isEmpty() || !m.group(2).isEmpty())) {
                if (m.group(1).isEmpty()) start = Math.max(0, size - Long.parseLong(m.group(2)));
                else { start = Long.parseLong(m.group(1)); if (!m.group(2).isEmpty()) end = Math.min(size - 1, Long.parseLong(m.group(2))); }
                if (start > end || start >= size) { h.put("Content-Range", "bytes */" + size); return new WebResourceResponse("audio/mpeg", null, 416, "Range Not Satisfiable", h, new java.io.ByteArrayInputStream(new byte[0])); }
                status = 206;
            }
            String name = f.getName(), ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            h.put("Accept-Ranges", "bytes");
            h.put("Content-Length", String.valueOf(Math.max(0, end - start + 1)));
            if (status == 206) h.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            FileInputStream in = new FileInputStream(f);
            if (start > 0) in.getChannel().position(start);
            return new WebResourceResponse(mime, null, status, status == 206 ? "Partial Content" : "OK", h, new Limited(in, end - start + 1));
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new java.io.ByteArrayInputStream(new byte[0]));
        }
    }

    private static final class Limited extends InputStream {
        private final FileInputStream in; private long left;
        Limited(FileInputStream in, long left) { this.in = in; this.left = left; }
        @Override public int read() throws IOException { if (left <= 0) return -1; int b = in.read(); if (b >= 0) left--; return b; }
        @Override public int read(byte[] b, int o, int l) throws IOException { if (left <= 0) return -1; int n = in.read(b, o, (int) Math.min(l, left)); if (n > 0) left -= n; return n; }
        @Override public int available() { return (int) Math.min(left, Integer.MAX_VALUE); }
        @Override public void close() throws IOException { in.close(); }
    }
}
