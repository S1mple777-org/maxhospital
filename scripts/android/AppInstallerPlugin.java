package uz.maxhospital.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * MaxHospital: ilova ichida yangilash.
 * Yangi APK ni ilovaning o'zida yuklab oladi (foiz bilan) va Android o'rnatish oynasini ochadi.
 * Android xavfsizlik qoidasi: o'rnatishni foydalanuvchi baribir "O'rnatish" tugmasi bilan tasdiqlaydi.
 * scripts/android-setup.mjs bu faylni Android loyihaga ko'chiradi va MainActivity'da ro'yxatdan o'tkazadi.
 */
@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

    /** "Noma'lum manbadan o'rnatish" ruxsati bormi (Android 8+). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", allowed);
        call.resolve(r);
    }

    /** Shu ruxsat sozlamasini ochadi. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** { url } -> yuklab oladi ("progress" hodisasi: { percent }) va o'rnatish oynasini ochadi. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Yangilanish manzili noto'g'ri");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("papka yaratilmadi");
                File out = new File(dir, "update.apk");
                if (out.exists()) out.delete();

                // GitHub fayl manzili boshqa domenga yo'naltiradi: yo'naltirishlarni o'zimiz kuzatamiz (faqat https).
                URL u = new URL(url);
                int code = -1;
                for (int i = 0; i < 6; i++) {
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(60000);
                    conn.setRequestProperty("Accept", "application/octet-stream");
                    code = conn.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (loc == null) throw new Exception("yo'naltirish manzili yo'q");
                        u = new URL(u, loc);
                        if (!"https".equals(u.getProtocol())) throw new Exception("xavfsiz bo'lmagan manzil");
                        continue;
                    }
                    break;
                }
                if (conn == null || code != 200) throw new Exception("server javobi " + code);

                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(buf)) != -1) {
                        fos.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != last) {
                                last = pct;
                                JSObject p = new JSObject();
                                p.put("percent", pct);
                                notifyListeners("progress", p);
                            }
                        }
                    }
                }

                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject r = new JSObject();
                r.put("started", true);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Yuklab bo'lmadi: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }
}
